// Migrasi indeks kunci asing (tabel besar): kesetaraan dengan skema baru, data utuh, idempoten, indeks benar-benar ada, dan gagal jelas bila prasyarat belum ada.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { skemaLama } from '../scripts/skema-lama.mjs';
import { siapkanPg } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';

const P = process.cwd().replace(/\\/g, '/');
let g = 0, l = 0;
const ok = (c, m) => { if (c) { l++; console.log('ok   :', m); } else { g++; console.log('GAGAL:', m); } };
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
const bersih = (s) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-indeks-fk.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.sku_riwayat)::int r, (select count(*) from auth.users)::int u`)).rows[0];
const indeks = async (db) => (await db.query(`select tablename t, indexname n, indexdef d from pg_indexes where schemaname = 'public' and tablename <> 'keepalive_konfigurasi' and tablename <> 'pengukuhan_dewan' and indexname <> 'profil_pradana_pradani_unik' order by 1, 2`)).rows; // tabel keepalive, tabel pengukuhan_dewan, dan indeks jabatan tunggal (Pemangku Adat) datang dari migrasi sesudahnya

const DIHARAPKAN = [
  ['sku_progress', 'sku_progress_penguji_idx', 'penguji_id'], ['sku_riwayat', 'sku_riwayat_oleh_idx', 'oleh'], ['sku_penilaian', 'sku_penilaian_penguji_idx', 'penguji_id'],
  ['absensi_hadir', 'absensi_hadir_oleh_idx', 'oleh'], ['iuran', 'iuran_oleh_idx', 'oleh'], ['iuran_log', 'iuran_log_oleh_idx', 'oleh'], ['iuran_log', 'iuran_log_peserta_idx', 'peserta_id'],
  ['naik_kelas_log', 'naik_kelas_log_oleh_idx', 'oleh'], ['portofolio', 'portofolio_catatan_oleh_idx', 'catatan_penguji_oleh'], ['portofolio_jurnal', 'portofolio_jurnal_oleh_idx', 'oleh'],
];

// Skema "sesudah" = skema.sql terbaru; sebelum = commit TEPAT sebelum migrasi ini (main sesudah PR #5).
const A = await baru('git:90cb914');
const ia = await indeks(A);
ok(DIHARAPKAN.every(([t, n, k]) => ia.some((x) => x.t === t && x.n === n && x.d.includes(`(${k})`))), 'skema baru memuat kesepuluh indeks kunci asing');

const SEBELUM = 'git:2a33511';
console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru(SEBELUM);
await isiDataContoh(B1);
const sebelum = await cacah(B1);
const ib = await indeks(B1);
ok(DIHARAPKAN.every(([, n]) => !ib.some((x) => x.n === n)), 'prasyarat: skema lama belum punya indeks-indeks itu');
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
await B1.exec(MP); await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'menjalankan migrasi tiga kali: data tetap sama');
const sama = JSON.stringify(await indeks(B1)) === JSON.stringify(ia);
ok(sama, `katalog indeks database hasil migrasi setara skema baru (${ia.length} indeks)`);

console.log('\n--- Penghapusan akun tetap berjalan dan memakai indeks ---');
{
  const p = (await B1.query(`select id from public.profiles where username = '10231'`)).rows[0].id;
  await B1.query('delete from auth.users where id = $1', [p]);
  ok((await B1.query('select count(*)::int c from public.profiles where id = $1', [p])).rows[0].c === 0, 'akun terhapus (kunci asing set null/cascade berjalan)');
  ok((await B1.query('select count(*)::int c from public.sku_progress where peserta_id = $1', [p])).rows[0].c === 0, 'progres akun itu ikut terhapus');
}

console.log('\n--- Tanpa skema yang cukup: gagal jelas ---');
{
  const B3 = new PGlite();
  await B3.exec(stub);
  let galat = null;
  try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
  ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
}

console.log(`\nRINGKASAN MIGRASI INDEKS-FK: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
