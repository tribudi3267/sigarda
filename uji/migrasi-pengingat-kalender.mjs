// Migrasi pengingat kalender Garuda (Tahap 2, G4d), diuji KUMULATIF dari main sesudah G4a: skema lama + migrasi impor tanggal lahir + migrasi tim-kalender + migrasi ini = skema.sql terbaru: kesetaraan dengan skema baru (fungsi, tabel, kebijakan, pemicu, hak), data utuh, idempoten, perilaku baru,
// dan gagal jelas bila prasyarat (migrasi tim-kalender) belum ada.
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
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-pengingat-kalender.sql`, 'utf8'));
const MC = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-cakupan-pra-uji.sql`, 'utf8')); // migrasi sesudahnya; skema.sql terbaru sudah memuatnya

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.penugasan_rombel)::int pr,
  (select count(*) from public.agenda)::int a, (select count(*) from public.notifikasi)::int no, (select count(*) from public.bina_damping)::int bd, (select count(*) from public.sku_pra_uji)::int pu,
  (select count(*) from public.pelantikan)::int pl, (select count(*) from public.tkk_capaian)::int tk, (select count(*) from public.tkk_pengajuan)::int tp`)).rows[0];
const TABEL = `('garuda_tahap')`;
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sigarda') and p.prokind = 'f' order by 1, 2, 3`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema in ('public', 'sigarda') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
    hakTabel: await q(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name in ${TABEL} and grantee in ('anon','authenticated') order by 1, 2, 3`),
    rls: await q(`select relname, relrowsecurity from pg_class where oid in ('public.garuda_tahap'::regclass) order by 1`),
    kebijakan: await q(`select tablename, policyname, qual from pg_policies where schemaname = 'public' and tablename in ${TABEL} order by 1, 2`),
    kolom: await q(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name in ${TABEL} order by 1, 2`),
    indeks: await q(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in ${TABEL} order by 1, 2`),
    pemicu: await q(`select tgrelid::regclass::text tabel, tgname, pg_get_triggerdef(t.oid) def from pg_trigger t where tgrelid in ('public.garuda_tahap'::regclass) and not tgisinternal order by 1, 2`),
    batasan: await q(`select conrelid::regclass::text tabel, conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid in ('public.garuda_tahap'::regclass) order by 1, 2`),
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
const sebelum = await cacah(B1);
const md5Fungsi = async (db, nama) => (await db.query(`select md5(p.prosrc) m from pg_proc p where p.proname = $1`, [nama])).rows[0].m;
ok((await B1.query(`select to_regprocedure('sigarda.garuda_kalender_pengingat()') as f`)).rows[0].f === null, 'prasyarat: belum ada sigarda.garuda_kalender_pengingat');
const lamaPengingat = await md5Fungsi(B1, 'notif_pengingat');
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
ok(await md5Fungsi(B1, 'notif_pengingat') !== lamaPengingat, 'notif_pengingat ditulis ulang oleh migrasi');
await B1.exec(MP); await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'menjalankan migrasi tiga kali: data tetap sama');
await B1.exec(MC);
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
  const geser = async (n) => (await B1.query('select (sigarda.hari_ini() + $1::int)::text d', [n])).rows[0].d;
  const ta = '2026/2027';
  for (const [t, m] of [['ajukan_tim', 7], ['serah_kwarran', 2], ['pelantikan', 0]]) await pembina.a.simpanTahapGaruda({ tahunAjaran: ta, tahap: t, mulai: await geser(m) });
  await B1.query('delete from public.notifikasi');
  await B1.query('select sigarda.notif_pengingat()');
  const n1 = (await B1.query("select judul from public.notifikasi where tautan ->> 'tab' = 'kelayakan' order by judul")).rows.map((x) => x.judul);
  ok(n1.some((x) => x === 'H-7: Pengajuan SK tim penilai') && n1.some((x) => x === 'Hari ini: Pelantikan Pramuka Garuda') && !n1.some((x) => /Penyerahan portofolio/.test(x)), 'pengingat H-7 dan hari-H terkirim sesudah migrasi; H-2 tidak');
  ok((await B1.query("select count(*)::int n from public.notifikasi where penerima_id = $1 and tautan ->> 'tab' = 'kelayakan'", [siti.id])).rows[0].n === 0, 'Penegak biasa tidak menerima pengingat kalender');
  await B1.query('select sigarda.notif_pengingat()');
  ok((await B1.query("select count(*)::int n from public.notifikasi where tautan ->> 'tab' = 'kelayakan'")).rows[0].n === n1.length, 'dijalankan lagi pada hari yang sama: tidak ada notifikasi ganda');
}

console.log('\n--- Tanpa migrasi sebelumnya: gagal jelas ---');
const B3 = await baru('git:118681e'); // sebelum tim-kalender (tanpa tabel garuda_tahap)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
ok((await B3.query(`select to_regprocedure('sigarda.garuda_kalender_pengingat()') as f`)).rows[0].f === null, 'kegagalan membatalkan seluruh migrasi (fungsi tidak dibuat)');

console.log(`\nRINGKASAN MIGRASI PENGINGAT-KALENDER: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
