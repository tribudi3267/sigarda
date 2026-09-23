// P6: sumber skema dipecah per modul (supabase/sumber/NN-nama.sql, dirakit scripts/sumber.mjs). Uji ini menjaga (1) berkas bernomor tanpa
// nomor kembar, tanpa inti.sql lama, tanpa berkas .sql tak bernomor yang diam-diam tidak ikut dirakit, dan (2) supabase/skema.sql yang
// di-commit tidak usang terhadap sumber (dulu tidak ada yang menangkap lupa `npm run skema`).
import { readdirSync, readFileSync } from 'node:fs';
import { bacaInti, daftarSumber } from '../scripts/sumber.mjs';

let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const P = process.cwd().split(String.fromCharCode(92)).join('/');

console.log('--- Berkas sumber ---');
const semua = readdirSync(`${P}/supabase/sumber`).filter((n) => n.endsWith('.sql'));
const daftar = daftarSumber(P);
ok(daftar.length > 0 && semua.length === daftar.length, `semua berkas .sql di supabase/sumber bernomor dan ikut dirakit (${daftar.length} berkas)`);
ok(new Set(daftar.map((n) => n.split('-')[0])).size === daftar.length, 'tidak ada nomor berkas kembar');
ok(!semua.includes('inti.sql'), 'inti.sql lama sudah tidak ada (sumber tunggal = berkas bernomor)');
ok(daftar.every((n) => !/[A-Z ]/.test(n)), 'nama berkas huruf kecil tanpa spasi');
const isi = bacaInti(P);
ok(isi.startsWith('-- ====') && isi.includes('create schema sigarda;') && isi.includes('-- 6. Katalog butir SKU'), 'rakitan berawal dari kepala skema dan berakhir utuh');
ok(!isi.includes('\r'), 'sumber memakai akhir baris LF (.gitattributes)');

console.log('--- skema.sql tidak usang ---');
const skema = readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/\r\n/g, '\n');
ok(skema.startsWith(isi.trimEnd() + '\n'), 'supabase/skema.sql diawali persis oleh rakitan sumber (jalankan `npm run skema` bila gagal)');

console.log(`\nRINGKASAN SUMBER-SKEMA: ${lulus} lulus, ${gagal} GAGAL.`);
if (gagal) process.exit(1);
