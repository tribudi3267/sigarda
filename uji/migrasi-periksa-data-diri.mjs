// Migrasi Pemeriksaan Data untuk data diri (Tahap 3, H1 lanjutan): kesetaraan dengan skema baru (fungsi dan hak), data utuh, idempoten, perilaku baru, dan gagal jelas bila
// prasyarat (migrasi snapshot-portofolio) belum ada.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { skemaLama } from '../scripts/skema-lama.mjs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';

const P = process.cwd().replace(/\\/g, '/');
let g = 0, l = 0;
const ok = (c, m) => { if (c) { l++; console.log('ok   :', m); } else { g++; console.log('GAGAL:', m); } };
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
const bersih = (s) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-periksa-data-diri.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.penugasan_rombel)::int pr,
  (select count(*) from public.agenda)::int a, (select count(*) from public.notifikasi)::int no, (select count(*) from public.bina_damping)::int bd, (select count(*) from public.sku_pra_uji)::int pu,
  (select count(*) from public.pelantikan)::int pl, (select count(*) from public.tkk_capaian)::int tk, (select count(*) from public.tanggal_lahir)::int tl, (select count(*) from public.tim_penilai)::int tim`)).rows[0];
const TABEL = `('portofolio_snapshot')`;
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  const ada = (await q(`select to_regclass('public.portofolio_snapshot') t`))[0].t !== null;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sigarda') and p.prokind = 'f' order by 1, 2, 3`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema in ('public', 'sigarda') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
    hakTabel: await q(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name in ${TABEL} and grantee in ('anon','authenticated') order by 1, 2, 3`),
    rls: ada ? await q(`select relname, relrowsecurity from pg_class where oid in ('public.portofolio_snapshot'::regclass) order by 1`) : [],
    kebijakan: await q(`select tablename, policyname, qual from pg_policies where schemaname = 'public' and tablename in ${TABEL} order by 1, 2`),
    kolom: await q(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name in ${TABEL} order by 1, 2`),
    indeks: await q(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in ${TABEL} order by 1, 2`),
    pemicu: ada ? await q(`select tgrelid::regclass::text tabel, tgname, pg_get_triggerdef(t.oid) def from pg_trigger t where tgrelid in ('public.portofolio_snapshot'::regclass) and not tgisinternal order by 1, 2`) : [],
    batasan: ada ? await q(`select conrelid::regclass::text tabel, conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid in ('public.portofolio_snapshot'::regclass) order by 1, 2`) : [],
    batasanProfil: await q(`select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid = 'public.profiles'::regclass order by 1`),
    semuaPemicu: await q(`select tgrelid::regclass::text tabel, tgname from pg_trigger where not tgisinternal and tgrelid::regclass::text like 'public.%' order by 1, 2`),
  };
};

const A = await baru('git:40c98fe'); // skema tepat sesudah migrasi ini (main sesudah PR #30); migrasi berikutnya (perlindungan-anggota) menulis ulang fungsi yang sama
const pa = await potret(A);

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru('git:dd64739'); // commit TEPAT sebelum migrasi ini (main sesudah PR #29)
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const sebelum = await cacah(B1);
const md5Fungsi = async (db, nama) => (await db.query(`select md5(p.prosrc) m from pg_proc p where p.proname = $1`, [nama])).rows[0].m;
ok((await B1.query(`select prosrc like '%dataDiriBelum%' as t from pg_proc where proname = 'sg_pemeriksaan_data'`)).rows[0].t === false, 'prasyarat: sg_pemeriksaan_data lama belum memuat dataDiriBelum');
const lama = { pem: await md5Fungsi(B1, 'sg_pemeriksaan_data') };
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
for (const [k, fn] of [['pem', 'sg_pemeriksaan_data']]) {
  ok(await md5Fungsi(B1, fn) !== lama[k], `${fn} ditulis ulang oleh migrasi`);
}
await B1.exec(MP); await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'menjalankan migrasi tiga kali: data tetap sama');
const pb = await potret(B1);
for (const k of Object.keys(pa)) {
  const sama = JSON.stringify(pa[k]) === JSON.stringify(pb[k]);
  ok(sama, `katalog setara (${k}): ${pa[k].length} entri`);
  if (!sama) {
    const a = new Set(pa[k].map((x) => JSON.stringify(x))), b = new Set(pb[k].map((x) => JSON.stringify(x)));
    console.log('   hanya di skema baru =', [...a].filter((x) => !b.has(x)).slice(0, 5), '\n   hanya di migrasi =', [...b].filter((x) => !a.has(x)).slice(0, 5));
  }
}

console.log('\n--- Sesudah migrasi: perilaku baru ---');
{
  const masuk = async (username, pin) => { const k = buatKlienFake(B1); const a = buatApi(k); const r = await a.masuk(username, pin); return { k, a, id: r.id }; };
  const pembina = await masuk('pembina', PIN_DEMO.pembina);
  const ahmad = await masuk('10231', PIN_DEMO.penegak);
  let r = await pembina.a.muatPemeriksaanData();
  ok(r.ok && Array.isArray(r.data.dataDiriBelum) && r.data.dataDiriBelum.some((x) => x.id === ahmad.id && x.kurang.length >= 4), 'Pemeriksaan Data memuat dataDiriBelum sesudah migrasi ' + (r.pesan ?? ''));
  ok(r.ok && ['kelasLama', 'tanpaNta', 'tanpaJk', 'pembinaTanpaAgama', 'belumPernahMasuk', 'praUjiAktif'].every((k) => k in r.data), 'kategori lama tetap ada');
  r = await ahmad.a.simpanIsianSaya({ tempat_lahir: 'Purbalingga', alamat: 'Jl. A', ayah_nama: 'Slamet', lahir: '2009-03-15' });
  ok(r.ok, 'Penegak mengisi sebagian data dirinya ' + (r.pesan ?? ''));
  r = await pembina.a.muatPemeriksaanData();
  const baris = r.data.dataDiriBelum.find((x) => x.id === ahmad.id);
  ok(r.ok && baris && !baris.kurang.includes('alamat') && !baris.kurang.includes('tempat_lahir') && !baris.kurang.includes('ortu') && !baris.kurang.includes('lahir') && !JSON.stringify(r.data).includes('Jl. A'), 'isian yang sudah diisi tidak lagi kurang dan nilainya tidak ikut terkirim');
  r = await ahmad.a.muatPemeriksaanData();
  ok(!r.ok && /Hanya pengurus/.test(r.pesan), 'Penegak tetap tidak dapat melihat pemeriksaan data');
}

console.log('\n--- Tanpa migrasi sebelumnya: gagal jelas ---');
const B3 = await baru('git:56caa88'); // sebelum snapshot-portofolio (tanpa tabel portofolio_snapshot)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
ok((await B3.query(`select to_regclass('public.portofolio_snapshot') as t`)).rows[0].t === null, 'kegagalan membatalkan seluruh migrasi (tabel tidak dibuat)');

console.log(`\nRINGKASAN MIGRASI PERIKSA-DATA-DIRI: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
