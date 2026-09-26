// Migrasi Perlindungan anggota / Safe From Harm (Tahap 4): kesetaraan dengan skema baru (tabel, kebijakan, fungsi, hak), data utuh, idempoten, perilaku baru, dan gagal jelas bila
// prasyarat (migrasi periksa-data-diri) belum ada.
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
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-perlindungan-anggota.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.penugasan_rombel)::int pr,
  (select count(*) from public.agenda)::int a, (select count(*) from public.notifikasi)::int no, (select count(*) from public.bina_damping)::int bd, (select count(*) from public.sku_pra_uji)::int pu,
  (select count(*) from public.pelantikan)::int pl, (select count(*) from public.tkk_capaian)::int tk, (select count(*) from public.tanggal_lahir)::int tl, (select count(*) from public.tim_penilai)::int tim`)).rows[0];
const TABEL = `('sfh_catatan')`;
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  const ada = (await q(`select to_regclass('public.sfh_catatan') t`))[0].t !== null;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sigarda') and p.prokind = 'f' order by 1, 2, 3`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema in ('public', 'sigarda') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
    hakTabel: await q(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name in ${TABEL} and grantee in ('anon','authenticated') order by 1, 2, 3`),
    rls: ada ? await q(`select relname, relrowsecurity from pg_class where oid in ('public.sfh_catatan'::regclass) order by 1`) : [],
    kebijakan: await q(`select tablename, policyname, qual from pg_policies where schemaname = 'public' and tablename in ${TABEL} order by 1, 2`),
    kolom: await q(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name in ${TABEL} order by 1, 2`),
    indeks: await q(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in ${TABEL} order by 1, 2`),
    pemicu: ada ? await q(`select tgrelid::regclass::text tabel, tgname, pg_get_triggerdef(t.oid) def from pg_trigger t where tgrelid in ('public.sfh_catatan'::regclass) and not tgisinternal order by 1, 2`) : [],
    batasan: ada ? await q(`select conrelid::regclass::text tabel, conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid in ('public.sfh_catatan'::regclass) order by 1, 2`) : [],
    batasanProfil: await q(`select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid = 'public.profiles'::regclass order by 1`),
    semuaPemicu: await q(`select tgrelid::regclass::text tabel, tgname from pg_trigger where not tgisinternal and tgrelid::regclass::text like 'public.%' order by 1, 2`),
  };
};

const A = await baru('supabase/skema.sql'); // migrasi ini yang paling baru: skema.sql terbaru = keadaan sesudahnya
const pa = await potret(A);

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru('git:40c98fe'); // commit TEPAT sebelum migrasi ini (main sesudah PR #30)
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const sebelum = await cacah(B1);
const md5Fungsi = async (db, nama) => (await db.query(`select md5(p.prosrc) m from pg_proc p where p.proname = $1`, [nama])).rows[0].m;
ok((await B1.query(`select to_regclass('public.sfh_catatan') as t`)).rows[0].t === null, 'prasyarat: tabel sfh_catatan belum ada');
const lama = { pem: await md5Fungsi(B1, 'sg_pemeriksaan_data'), cad: await md5Fungsi(B1, 'sg_cadangan_admin') };
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
for (const [k, fn] of [['pem', 'sg_pemeriksaan_data'], ['cad', 'sg_cadangan_admin']]) {
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
  const admin = await masuk('admin', PIN_DEMO.admin);
  const ahmad = await masuk('10231', PIN_DEMO.penegak);
  let r = await pembina.a.muatPemeriksaanData();
  ok(r.ok && Array.isArray(r.data.sfhBelum) && r.data.sfhBelum.some((x) => x.id === pembina.id && x.kurang.length === 3) && r.data.sfhBelum.some((x) => x.id === admin.id && x.kurang.join() === 'pelatihan'), 'Pemeriksaan Data memuat sfhBelum sesudah migrasi ' + (r.pesan ?? ''));
  ok(r.ok && ['kelasLama', 'tanpaNta', 'tanpaJk', 'pembinaTanpaAgama', 'belumPernahMasuk', 'praUjiAktif', 'dataDiriBelum'].every((k) => k in r.data), 'kategori lama tetap ada');
  r = await pembina.a.simpanSfh({ anggotaId: pembina.id, jenis: 'pelatihan', tanggal: '2026-01-10', buktiUrl: 'https://x.id/a', catatan: 'Kwarcab' });
  ok(r.ok, 'Pembina mencatat pelatihan ' + (r.pesan ?? ''));
  r = await admin.a.muatSfh();
  ok(r.ok && r.data.catatan.length === 1 && r.data.gudep === null, 'Admin membaca catatan lewat api().muatSfh');
  r = await ahmad.a.muatSfh();
  ok(r.ok && r.data.catatan.length === 0, 'Penegak tidak melihat catatan orang dewasa');
  r = await ahmad.a.simpanSfh({ anggotaId: pembina.id, jenis: 'pelatihan', tanggal: '2026-01-10' });
  ok(!r.ok && /Hanya Pembina dan Admin Gudep/.test(r.pesan), 'Penegak tidak dapat mencatat');
  r = await admin.a.simpanGudepSfh({ penerima: 'Ka. Mabigus', kontak: '', prosedurUrl: '', catatan: '' });
  ok(r.ok, 'Admin mengisi penerima laporan ' + (r.pesan ?? ''));
  r = await admin.a.muatSfh();
  ok(r.ok && r.data.gudep?.penerima === 'Ka. Mabigus', 'penerima laporan terbaca');
  const c = (await sqlSebagai(B1, admin.id, 'select public.sg_cadangan_admin() as d')).rows[0].d;
  ok(Array.isArray((c.data ?? c.tabel ?? c).sfh_catatan) && (c.data ?? c.tabel ?? c).sfh_catatan.length === 1, 'cadangan memuat sfh_catatan (batas argumen jsonb_build_object tidak terlampaui)');
}

console.log('\n--- Tanpa migrasi sebelumnya: gagal jelas ---');
const B3 = await baru('git:56caa88'); // sebelum snapshot-portofolio dan periksa-data-diri
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
ok((await B3.query(`select to_regclass('public.sfh_catatan') as t`)).rows[0].t === null, 'kegagalan membatalkan seluruh migrasi (tabel tidak dibuat)');

console.log(`\nRINGKASAN MIGRASI PERLINDUNGAN-ANGGOTA: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
