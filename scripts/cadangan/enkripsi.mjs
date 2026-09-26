// Enkripsi cadangan sebelum meninggalkan server database/GitHub: gzip lalu AES-256-GCM dengan kunci turunan scrypt dari frasa sandi.
// Format berkas (.enc): "SGC1" | garam 16 B | iv 12 B | isi terenkripsi | tag 16 B. GCM mengesahkan isi: frasa salah atau berkas rusak/diubah
// memberi galat, bukan data sampah. Hanya modul bawaan Node. Frasa sandi TIDAK PERNAH disimpan bersama berkas; tanpa frasa itu cadangan tidak dapat dibuka.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

const PENANDA = Buffer.from('SGC1');
const PANJANG_GARAM = 16, PANJANG_IV = 12, PANJANG_TAG = 16;
export const FRASA_MINIMAL = 16;

const turunkan = (frasa, garam) => scryptSync(frasa, garam, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });

/** teks SQL (string atau Buffer) -> Buffer terkompres dan terenkripsi. */
export function bungkus(isi, frasa) {
  if (typeof frasa !== 'string' || frasa.length < FRASA_MINIMAL) throw new Error(`Frasa sandi enkripsi minimal ${FRASA_MINIMAL} karakter.`);
  const garam = randomBytes(PANJANG_GARAM), iv = randomBytes(PANJANG_IV);
  const sandi = createCipheriv('aes-256-gcm', turunkan(frasa, garam), iv);
  const terenkripsi = Buffer.concat([sandi.update(gzipSync(Buffer.from(isi))), sandi.final()]);
  return Buffer.concat([PENANDA, garam, iv, terenkripsi, sandi.getAuthTag()]);
}

/** Kebalikan bungkus: Buffer .enc -> teks SQL. Galat bila bukan berkas cadangan, frasa salah, atau isi berubah. */
export function bukaBungkus(berkas, frasa) {
  const b = Buffer.from(berkas);
  if (b.length < PENANDA.length + PANJANG_GARAM + PANJANG_IV + PANJANG_TAG || !b.subarray(0, 4).equals(PENANDA)) throw new Error('Bukan berkas cadangan SIGARDA (penanda tidak dikenal).');
  const garam = b.subarray(4, 4 + PANJANG_GARAM);
  const iv = b.subarray(4 + PANJANG_GARAM, 4 + PANJANG_GARAM + PANJANG_IV);
  const tag = b.subarray(b.length - PANJANG_TAG);
  const isi = b.subarray(4 + PANJANG_GARAM + PANJANG_IV, b.length - PANJANG_TAG);
  try {
    const sandi = createDecipheriv('aes-256-gcm', turunkan(String(frasa ?? ''), garam), iv);
    sandi.setAuthTag(tag);
    return gunzipSync(Buffer.concat([sandi.update(isi), sandi.final()])).toString('utf8');
  } catch {
    throw new Error('Frasa sandi salah, atau berkas rusak/diubah.');
  }
}
