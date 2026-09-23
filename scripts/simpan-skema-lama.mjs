/**
 * Menyimpan snapshot skema lama (supabase/riwayat/<hash7>.sql.gz) dari riwayat git; lihat scripts/skema-lama.mjs.
 *   node scripts/simpan-skema-lama.mjs <hash> [<hash> ...]
 *   node scripts/simpan-skema-lama.mjs --dari-uji        semua hash yang dirujuk uji/*.mjs (git:<hash> atau baru('<hash>')) dan belum tersimpan
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { FOLDER_SKEMA_LAMA, berkasSkemaLama, hashDiUji } from './skema-lama.mjs';

const akar = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argumen = process.argv.slice(2);
const daftar = argumen.includes('--dari-uji') ? hashDiUji(akar) : argumen.filter((a) => !a.startsWith('--'));
if (!daftar.length) { console.error('Sebutkan hash commit, atau --dari-uji.'); process.exit(2); }
mkdirSync(path.join(akar, FOLDER_SKEMA_LAMA), { recursive: true });
let dibuat = 0;
for (const hash of daftar) {
  const berkas = berkasSkemaLama(akar, hash);
  if (existsSync(berkas)) { console.log(`sudah ada  ${hash}`); continue; }
  const isi = execFileSync('git', ['show', `${hash}:supabase/skema.sql`], { cwd: akar, encoding: 'utf8', maxBuffer: 1 << 26 });
  writeFileSync(berkas, gzipSync(Buffer.from(isi, 'utf8'), { level: 9 }));
  console.log(`disimpan   ${hash}  (${isi.length} karakter)`);
  dibuat += 1;
}
console.log(`${dibuat} snapshot baru.`);
