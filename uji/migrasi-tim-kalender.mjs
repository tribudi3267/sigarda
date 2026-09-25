// Migrasi tim penilai dan kalender Garuda (Tahap 2, G4b dan G4c), diuji KUMULATIF dari main sesudah G4a: skema lama + migrasi impor tanggal lahir + migrasi ini = skema.sql terbaru: kesetaraan dengan skema baru (fungsi, tabel, kebijakan, pemicu, hak), data utuh, idempoten, perilaku baru,
// dan gagal jelas bila prasyarat (migrasi impor tanggal lahir) belum ada.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { skemaLama } from '../scripts/skema-lama.mjs';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';

const P = process.cwd().replace(/\\/g, '/');
let g = 0, l = 0;
const ok = (c, m) => { if (c) { l++; console.log('ok   :', m); } else { g++; console.log('GAGAL:', m); } };
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
const bersih = (s) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const MI = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-tanggal-lahir-impor.sql`, 'utf8'));
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-tim-kalender.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.penugasan_rombel)::int pr,
  (select count(*) from public.agenda)::int a, (select count(*) from public.notifikasi)::int no, (select count(*) from public.bina_damping)::int bd, (select count(*) from public.sku_pra_uji)::int pu,
  (select count(*) from public.pelantikan)::int pl, (select count(*) from public.tkk_capaian)::int tk, (select count(*) from public.tkk_pengajuan)::int tp`)).rows[0];
const TABEL = `('tim_penilai','tim_penilai_anggota','garuda_tahap')`;
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sigarda') and p.prokind = 'f' order by 1, 2, 3`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema in ('public', 'sigarda') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
    hakTabel: await q(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name in ${TABEL} and grantee in ('anon','authenticated') order by 1, 2, 3`),
    rls: await q(`select relname, relrowsecurity from pg_class where oid in ('public.tim_penilai'::regclass, 'public.tim_penilai_anggota'::regclass, 'public.garuda_tahap'::regclass) order by 1`),
    kebijakan: await q(`select tablename, policyname, qual from pg_policies where schemaname = 'public' and tablename in ${TABEL} order by 1, 2`),
    kolom: await q(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name in ${TABEL} order by 1, 2`),
    indeks: await q(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in ${TABEL} order by 1, 2`),
    pemicu: await q(`select tgrelid::regclass::text tabel, tgname, pg_get_triggerdef(t.oid) def from pg_trigger t where tgrelid in ('public.tim_penilai'::regclass, 'public.tim_penilai_anggota'::regclass, 'public.garuda_tahap'::regclass) and not tgisinternal order by 1, 2`),
    batasan: await q(`select conrelid::regclass::text tabel, conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid in ('public.tim_penilai'::regclass, 'public.tim_penilai_anggota'::regclass, 'public.garuda_tahap'::regclass) order by 1, 2`),
  };
};

const A = await baru(`${P}/supabase/skema.sql`); // migrasi ini yang paling baru: skema.sql terbaru = keadaan sesudahnya
const pa = await potret(A);

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru('git:118681e'); // main sesudah G4a; lalu migrasi impor tanggal lahir dijalankan (keadaan TEPAT sebelum migrasi ini)
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
await B1.exec(MI);
const sebelum = await cacah(B1);
const md5Fungsi = async (db, nama) => (await db.query(`select md5(p.prosrc) m from pg_proc p where p.proname = $1`, [nama])).rows[0].m;
ok((await B1.query(`select to_regclass('public.tim_penilai') as t`)).rows[0].t === null, 'prasyarat: skema lama belum punya tabel tim_penilai');
const lamaCad = await md5Fungsi(B1, 'sg_cadangan_admin');
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
ok(await md5Fungsi(B1, 'sg_cadangan_admin') !== lamaCad, 'sg_cadangan_admin ditulis ulang oleh migrasi');
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
  const masuk = async (username) => { const k = buatKlienFake(B1); const a = buatApi(k); const r = await a.masuk(username, PIN_DEMO[username] ?? PIN_DEMO.penegak); return { k, a, id: r.id }; };
  const pembina = await masuk('pembina');
  const dewan = await masuk('dewan');
  const siti = await masuk('10232');
  const admin = await masuk('admin');
  const tim = { tahunAjaran: '2026/2027', untuk: 'putri', nomorSk: '123/2026', tanggalSk: '2026-09-10', anggota: [{ nama: 'Ibu Ketua', unsur: 'ketua_gudep', jabatan: 'ketua' }, { nama: 'Ibu Wali', unsur: 'orang_tua' }] };
  let r = await siti.a.simpanTimPenilai(tim);
  ok(!r.ok && /Hanya Pembina dan Admin Gudep/.test(r.pesan), 'Penegak ditolak mencatat tim penilai');
  r = await pembina.a.simpanTimPenilai(tim);
  ok(r.ok, 'Pembina mencatat tim penilai sesudah migrasi ' + (r.pesan ?? ''));
  r = await pembina.a.simpanTahapGaruda({ tahunAjaran: '2026/2027', tahap: 'pelantikan', mulai: '2026-10-28' });
  ok(r.ok, 'Pembina mengisi tahap kalender');
  r = await dewan.a.muatTimKalender();
  ok(r.ok && r.data.tim.length === 1 && r.data.tim[0].anggota.length === 2 && r.data.tahap.length === 1, 'Dewan (pengurus) membaca tim dan kalender');
  r = await siti.a.muatTimKalender();
  ok(r.ok && r.data.tim.length === 0 && r.data.tahap.length === 0, 'Penegak tidak melihat tim penilai dan kalender (RLS)');
  r = await admin.k.rpc('sg_cadangan_admin');
  if (r.error || !r.data?.tabel?.tim_penilai) console.log('   DEBUG', r.error, Object.keys(r.data?.tabel ?? {}).join());
  ok(!r.error && r.data.tabel.tim_penilai.length === 1 && r.data.tabel.tim_penilai_anggota.length === 2 && r.data.tabel.garuda_tahap.length === 1 && Array.isArray(r.data.tabel.tanggal_lahir) && Array.isArray(r.data.tabel.spg_penetapan), 'cadangan data memuat tabel baru tanpa kehilangan tabel lain');
}

console.log('\n--- Tanpa migrasi sebelumnya: gagal jelas ---');
const B3 = await baru('git:91338f6'); // sebelum G4a (tanpa tabel tanggal_lahir)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
ok((await B3.query(`select to_regclass('public.tim_penilai') as t`)).rows[0].t === null, 'kegagalan membatalkan seluruh migrasi (tabel tidak dibuat)');

console.log(`\nRINGKASAN MIGRASI TIM-KALENDER: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
