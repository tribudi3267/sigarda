// Snapshot skema lama (supabase/riwayat/*.sql.gz, scripts/skema-lama.mjs): uji migrasi tidak boleh lagi bergantung pada riwayat git.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { skemaLama, berkasSkemaLama, hashDiUji } from '../scripts/skema-lama.mjs';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const galat = (f) => { try { f(); return null; } catch (e) { return e.message; } };

console.log('--- Setiap hash yang dirujuk uji punya snapshot ---');
{
  const hash = hashDiUji(P);
  ok(hash.length >= 20, `uji merujuk ${hash.length} skema lama`);
  const hilang = hash.filter((h) => !existsSync(berkasSkemaLama(P, h)));
  ok(hilang.length === 0, hilang.length ? `snapshot HILANG: ${hilang.join(', ')}. Buat: node scripts/simpan-skema-lama.mjs --dari-uji` : 'semua snapshot ada');
  const rusak = hash.filter((h) => { try { const s = skemaLama(h, P); return !(/create schema sigarda/i.test(s) && s.includes('create table public.profiles')); } catch { return true; } });
  ok(rusak.length === 0, rusak.length ? `snapshot tidak memuat skema yang sah: ${rusak.join(', ')}` : 'setiap snapshot terbaca dan memuat skema sigarda');
}

console.log('\n--- Tidak ada snapshot yatim ---');
{
  const dipakai = new Set(hashDiUji(P));
  const ada = readdirSync(`${P}/supabase/riwayat`).filter((f) => f.endsWith('.sql.gz')).map((f) => f.replace('.sql.gz', ''));
  const yatim = ada.filter((h) => !dipakai.has(h));
  ok(yatim.length === 0, yatim.length ? `snapshot tidak dirujuk uji mana pun (hapus bila tidak perlu): ${yatim.join(', ')}` : 'semua snapshot dipakai uji');
}

console.log('\n--- Pustaka ---');
{
  ok(/belum ada.*simpan-skema-lama/.test(galat(() => skemaLama('abcdef0', P)) ?? ''), 'snapshot yang belum ada: galat yang menuntun cara membuatnya');
  ok(/tidak sah/.test(galat(() => skemaLama('../../etc/passwd', P)) ?? '') && /tidak sah/.test(galat(() => skemaLama('xyz', P)) ?? ''), 'hash yang bukan heksadesimal ditolak (tanpa penelusuran folder)');
  const [satu] = hashDiUji(P);
  ok(berkasSkemaLama(P, satu.toUpperCase() + 'ffff').endsWith(`${satu}.sql.gz`), 'nama berkas memakai 7 karakter pertama, huruf kecil');
  const mentah = gunzipSync(readFileSync(berkasSkemaLama(P, satu))).toString('utf8');
  ok(!mentah.includes('\r'), 'snapshot berakhir baris LF');
}

console.log('\n--- Uji tidak lagi memanggil git ---');
{
  const memanggilGit = readdirSync(`${P}/uji`).filter((f) => f.endsWith('.mjs') && f !== 'skema-lama.mjs' && /(execFileSync|spawnSync|execSync|spawn|exec)\(\s*['"`]git\b|git show/.test(readFileSync(`${P}/uji/${f}`, 'utf8')));
  ok(memanggilGit.length === 0, memanggilGit.length ? `masih memanggil git: ${memanggilGit.join(', ')}` : 'tidak ada uji yang memanggil git (CI cukup clone dangkal)');
}

console.log(`\nRINGKASAN SKEMA-LAMA: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
