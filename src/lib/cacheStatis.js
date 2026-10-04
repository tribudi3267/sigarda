/**
 * Salinan sementara data yang jarang berubah dan BUKAN data pribadi (materi, data gudep, pengaturan iuran) di peramban, supaya setiap membuka
 * aplikasi tidak meminta ulang ke server (tiap permintaan API = satu baris log Supabase; paket Free: 1 GB per siklus).
 *
 * Aturan:
 * - Masa berlaku `ttlMs`; sesudahnya dianggap tidak ada dan dimuat ulang dari server.
 * - Kunci menyertakan ID versi terbit (ID_BUILD): terbitan baru selalu memuat ulang, jadi bentuk data yang berubah tidak pernah salah baca.
 * - Dihapus saat keluar atau sesi berakhir (`hapusCache()`), dan setiap jalur tulis memperbarui salinannya (`simpanCache`) atau menghapusnya.
 * - Tanpa penyimpanan (mode pribadi, diblokir) = tidak ada salinan, semua tetap berjalan; `penyimpan` dapat diganti untuk uji.
 */
import { ID_BUILD } from './versi';

const AWALAN = 'sigarda.cache.';

const penyimpanBawaan = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const kunci = (nama) => `${AWALAN}${nama}`;

/** Salinan yang masih berlaku: { nilai } atau null. */
export function bacaCache(nama, ttlMs, { penyimpan = penyimpanBawaan(), sekarang = Date.now() } = {}) {
  try {
    const mentah = penyimpan?.getItem(kunci(nama));
    if (!mentah) return null;
    const b = JSON.parse(mentah);
    if (!b || b.v !== ID_BUILD || typeof b.t !== 'number' || sekarang - b.t > ttlMs || b.t > sekarang + 60000) return null;
    return { nilai: b.d };
  } catch {
    return null;
  }
}

export function simpanCache(nama, nilai, { penyimpan = penyimpanBawaan(), sekarang = Date.now() } = {}) {
  try {
    penyimpan?.setItem(kunci(nama), JSON.stringify({ v: ID_BUILD, t: sekarang, d: nilai ?? null }));
  } catch { /* penuh atau diblokir: tanpa salinan */ }
}

/** Menghapus satu salinan, atau semuanya bila `nama` kosong. */
export function hapusCache(nama = null, { penyimpan = penyimpanBawaan() } = {}) {
  try {
    if (!penyimpan) return;
    if (nama) { penyimpan.removeItem(kunci(nama)); return; }
    const hapus = [];
    for (let i = 0; i < penyimpan.length; i += 1) {
      const k = penyimpan.key(i);
      if (k && k.startsWith(AWALAN)) hapus.push(k);
    }
    hapus.forEach((k) => penyimpan.removeItem(k));
  } catch { /* abaikan */ }
}
