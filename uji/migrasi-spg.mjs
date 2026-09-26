// Migrasi SPG (Tahap 2, G3): kesetaraan dengan skema baru (fungsi, tabel, kebijakan, pemicu, hak), data utuh, idempoten, perilaku baru,
// dan gagal jelas bila prasyarat (migrasi penguji TKK) belum ada.
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
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-spg.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.penugasan_rombel)::int pr,
  (select count(*) from public.agenda)::int a, (select count(*) from public.notifikasi)::int no, (select count(*) from public.bina_damping)::int bd, (select count(*) from public.sku_pra_uji)::int pu,
  (select count(*) from public.pelantikan)::int pl, (select count(*) from public.tkk_capaian)::int tk, (select count(*) from public.tkk_pengajuan)::int tp`)).rows[0];
const TABEL = `('spg_penetapan')`;
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sigarda') and p.prokind = 'f' order by 1, 2, 3`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema in ('public', 'sigarda') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
    hakTabel: await q(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name in ${TABEL} and grantee in ('anon','authenticated') order by 1, 2, 3`),
    rls: await q(`select relname, relrowsecurity from pg_class where oid in ('public.spg_penetapan'::regclass) order by 1`),
    kebijakan: await q(`select tablename, policyname, qual from pg_policies where schemaname = 'public' and tablename in ${TABEL} order by 1, 2`),
    kolom: await q(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name in ${TABEL} order by 1, 2`),
    indeks: await q(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in ${TABEL} order by 1, 2`),
    pemicu: await q(`select tgrelid::regclass::text tabel, tgname, pg_get_triggerdef(t.oid) def from pg_trigger t where tgrelid in ('public.spg_penetapan'::regclass) and not tgisinternal order by 1, 2`),
    batasan: await q(`select conrelid::regclass::text tabel, conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid in ('public.spg_penetapan'::regclass) order by 1, 2`),
  };
};

const A = await baru('git:91338f6'); // skema TEPAT sesudah migrasi ini (main sesudah G3); skema.sql terbaru memuat tahap sesudahnya (gerbang menulis ulang sg_cadangan_admin)
const pa = await potret(A);

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru('git:71a2f19'); // commit TEPAT sebelum migrasi ini (main sesudah G2c)
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const sebelum = await cacah(B1);
const md5Fungsi = async (db, nama) => (await db.query(`select md5(p.prosrc) m from pg_proc p where p.proname = $1`, [nama])).rows[0].m;
ok((await B1.query(`select to_regclass('public.spg_penetapan') as t`)).rows[0].t === null, 'prasyarat: skema lama belum punya tabel spg_penetapan');
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
  const siti = await masuk('10232');
  const admin = await masuk('admin');
  const tgl = (await B1.query(`select (sigarda.hari_ini() - 5)::text d`)).rows[0].d;
  await B1.query('delete from public.sku_progress where peserta_id = $1', [siti.id]);
  let r = await pembina.a.catatSpg({ pesertaId: siti.id, butir: 1, nilai: 100, tanggal: tgl });
  ok(!r.ok && /belum menyelesaikan seluruh SKU Bantara dan Laksana/.test(r.pesan), 'Penegak yang belum layak Garuda ditolak');
  for (const t of ['Bantara', 'Laksana']) await B1.query(`insert into public.sku_progress (peserta_id, sku_id, status) select p.id, u.id, 'lulus' from public.profiles p join public.sku_unit u on u.tingkat = $2 and (u.agama is null or u.agama = p.agama) where p.id = $1`, [siti.id, t]);
  r = await siti.a.catatSpg({ pesertaId: siti.id, butir: 1, nilai: 100, tanggal: tgl });
  ok(!r.ok && /Hanya Pembina dan Admin Gudep/.test(r.pesan), 'Penegak ditolak menetapkan SPG');
  r = await pembina.a.catatSpg({ pesertaId: siti.id, butir: 1, nilai: 100, tanggal: tgl, catatan: 'Uji lisan' });
  ok(r.ok, 'Pembina menetapkan SPG sesudah migrasi ' + (r.pesan ?? ''));
  r = await siti.a.muatSpg();
  ok(r.ok && r.data.length === 1 && r.data[0].butir === 1 && r.data[0].nilai === 100, 'Penegak membaca penetapan miliknya');
  r = await admin.k.rpc('sg_cadangan_admin');
  ok(!r.error && Array.isArray(r.data.tabel.spg_penetapan) && r.data.tabel.spg_penetapan.length === 1 && Array.isArray(r.data.tabel.tkk_pengajuan) && Array.isArray(r.data.tabel.pelantikan), 'cadangan data memuat tabel baru tanpa kehilangan tabel lain');
  let tulis = null;
  try { await B1.query("update public.profiles set status = 'nonaktif' where id = $1", [siti.id]); await B1.query("update public.spg_penetapan set catatan = 'x' where peserta_id = $1", [siti.id]); } catch (e) { tulis = e.message; }
  ok(/tidak aktif|nonaktif|alumni/i.test(tulis ?? ''), 'pemicu tolak_peserta_tak_aktif aktif pada tabel hasil migrasi');
}

console.log('\n--- Tanpa migrasi sebelumnya: gagal jelas ---');
const B3 = await baru('git:2d5172f'); // sebelum G2c (tabel tkk_pengajuan ada, tanpa kolom penguji1_id)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
ok((await B3.query(`select to_regclass('public.spg_penetapan') as t`)).rows[0].t === null, 'kegagalan membatalkan seluruh migrasi (tabel tidak dibuat)');

console.log(`\nRINGKASAN MIGRASI SPG: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
