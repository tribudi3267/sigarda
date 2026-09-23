/**
 * Snapshot skema lama untuk pengujian migrasi. Uji migrasi memerlukan "skema sebelum migrasi" (skema.sql pada commit tertentu). Dulu dibaca lewat
 * `git show <hash>:supabase/skema.sql`, sehingga uji rapuh terhadap riwayat git (rebase, squash, clone dangkal). Kini tiap skema lama disimpan
 * di repositori sebagai supabase/riwayat/<hash7>.sql.gz (dimampatkan, sekitar 70 KB per berkas) dan dibaca dari sana.
 *
 * Migrasi BARU: sebelum menulis ujinya, simpan dulu snapshot commit tepat sebelum migrasi:
 *   node scripts/simpan-skema-lama.mjs <hash>          (atau --dari-uji: semua hash yang dirujuk uji/*.mjs dan belum tersimpan)
 * lalu pakai `git:<hash7>` seperti biasa di uji. Dijaga uji/skema-lama.mjs.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

export const FOLDER_SKEMA_LAMA = 'supabase/riwayat';

/** Nama berkas snapshot untuk sebuah hash (7 karakter pertama, huruf kecil). */
export const berkasSkemaLama = (akar, hash) => path.join(akar, FOLDER_SKEMA_LAMA, `${String(hash).toLowerCase().slice(0, 7)}.sql.gz`);

/** Isi skema.sql pada commit `hash`, dari snapshot. Galat yang menuntun bila snapshot belum ada. */
export function skemaLama(hash, akar = process.cwd()) {
  if (!/^[0-9a-f]{7,40}$/i.test(String(hash))) throw new Error(`Hash commit tidak sah: "${hash}"`);
  const berkas = berkasSkemaLama(akar, hash);
  if (!existsSync(berkas)) throw new Error(`Snapshot skema ${String(hash).slice(0, 7)} belum ada. Buat dengan: node scripts/simpan-skema-lama.mjs ${String(hash).slice(0, 7)}`);
  return gunzipSync(readFileSync(berkas)).toString('utf8');
}

/** Semua hash yang dirujuk berkas uji (git:<hash>, atau baru('<hash>') pada periksa-pemasangan), 7 karakter, terurut. */
export function hashDiUji(akar = process.cwd()) {
  const dir = path.join(akar, 'uji');
  const semua = new Set();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.mjs'))) {
    const s = readFileSync(path.join(dir, f), 'utf8');
    for (const m of s.matchAll(/git:([0-9a-f]{7,40})\b/g)) semua.add(m[1].slice(0, 7));
    for (const m of s.matchAll(/baru\('([0-9a-f]{7,40})'\)/g)) semua.add(m[1].slice(0, 7));
  }
  return [...semua].sort();
}
