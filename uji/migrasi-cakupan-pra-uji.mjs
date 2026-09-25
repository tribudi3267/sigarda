// Migrasi cakupan pra-uji (Tahap 2, G4e), diuji KUMULATIF dari main sesudah G4a: skema lama + migrasi impor tanggal lahir + tim-kalender + pengingat-kalender + migrasi ini = skema.sql terbaru: kesetaraan dengan skema baru (fungsi, tabel, kebijakan, pemicu, hak), data utuh, idempoten, perilaku baru,
// dan gagal jelas bila prasyarat (migrasi pengingat-kalender) belum ada.
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
const MT = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-tim-kalender.sql`, 'utf8'));
const MPK = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-pengingat-kalender.sql`, 'utf8'));
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-cakupan-pra-uji.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.penugasan_rombel)::int pr,
  (select count(*) from public.agenda)::int a, (select count(*) from public.notifikasi)::int no, (select count(*) from public.bina_damping)::int bd, (select count(*) from public.sku_pra_uji)::int pu,
  (select count(*) from public.pelantikan)::int pl, (select count(*) from public.tkk_capaian)::int tk, (select count(*) from public.tkk_pengajuan)::int tp`)).rows[0];
const TABEL = `('sku_pra_uji')`;
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sigarda') and p.prokind = 'f' order by 1, 2, 3`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema in ('public', 'sigarda') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
    hakTabel: await q(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name in ${TABEL} and grantee in ('anon','authenticated') order by 1, 2, 3`),
    rls: await q(`select relname, relrowsecurity from pg_class where oid in ('public.sku_pra_uji'::regclass) order by 1`),
    kebijakan: await q(`select tablename, policyname, qual from pg_policies where schemaname = 'public' and tablename in ${TABEL} order by 1, 2`),
    kolom: await q(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name in ${TABEL} order by 1, 2`),
    indeks: await q(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in ${TABEL} order by 1, 2`),
    pemicu: await q(`select tgrelid::regclass::text tabel, tgname, pg_get_triggerdef(t.oid) def from pg_trigger t where tgrelid in ('public.sku_pra_uji'::regclass) and not tgisinternal order by 1, 2`),
    batasan: await q(`select conrelid::regclass::text tabel, conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid in ('public.sku_pra_uji'::regclass) order by 1, 2`),
  };
};

const A = await baru(`${P}/supabase/skema.sql`); // migrasi ini yang paling baru: skema.sql terbaru = keadaan sesudahnya
const pa = await potret(A);

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru('git:118681e'); // main sesudah G4a; lalu migrasi impor tanggal lahir dijalankan (keadaan TEPAT sebelum migrasi ini)
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
await B1.exec(MI);
await B1.exec(MT);
await B1.exec(MPK);
const sebelum = await cacah(B1);
const md5Fungsi = async (db, nama) => (await db.query(`select md5(p.prosrc) m from pg_proc p where p.proname = $1`, [nama])).rows[0].m;
ok((await B1.query(`select to_regprocedure('public.sg_pra_uji_cakupan(integer)') as f`)).rows[0].f === null, 'prasyarat: belum ada sg_pra_uji_cakupan');
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
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
  const siti = await masuk('10232');
  let r = await siti.a.muatCakupanPraUji(30);
  ok(!r.ok && /Hanya Pembina dan Admin Gudep/.test(r.pesan), 'Penegak ditolak melihat cakupan');
  r = await pembina.a.muatCakupanPraUji(0);
  ok(!r.ok && /1 sampai 365/.test(r.pesan), 'jumlah hari harus 1 sampai 365');
  r = await pembina.a.muatCakupanPraUji(30);
  ok(r.ok && r.data.aktif === false && Array.isArray(r.data.perRombel), 'Pembina membaca cakupan sesudah migrasi (pra-uji mati: kosong) ' + (r.pesan ?? ''));
}

console.log('\n--- Tanpa migrasi sebelumnya: gagal jelas ---');
const B3 = await baru('git:118681e'); // sebelum tim-kalender (tanpa pengingat kalender)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
ok((await B3.query(`select to_regprocedure('public.sg_pra_uji_cakupan(integer)') as f`)).rows[0].f === null, 'kegagalan membatalkan seluruh migrasi (fungsi tidak dibuat)');

console.log(`\nRINGKASAN MIGRASI CAKUPAN-PRA-UJI: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
