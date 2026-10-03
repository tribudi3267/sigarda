// Migrasi pembersihan riwayat penjadwal (notif_pengingat ditulis ulang): kesetaraan dengan skema baru (fungsi dan hak), data utuh, idempoten,
// perilaku baru (riwayat cron > 30 hari dihapus, yang baru tetap; tanpa pg_cron pengingat tetap jalan), dan gagal jelas bila prasyarat belum ada.
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
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-bersih-riwayat-cron.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.agenda)::int a`)).rows[0];
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sigarda') and p.prokind = 'f' order by 1, 2, 3`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema in ('public', 'sigarda') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
  };
};

const A = await baru('git:b7880bf'); // skema tepat SESUDAH migrasi ini (main sesudah PR #68); migrasi berikutnya mengubah fungsi lain
const pa = await potret(A);

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru('git:a0f5941'); // commit TEPAT sebelum migrasi ini (main sesudah PR #58)
await isiDataContoh(B1);
const sebelum = await cacah(B1);
const lama = (await B1.query(`select md5(prosrc) m from pg_proc where proname = 'notif_pengingat'`)).rows[0].m;
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
ok((await B1.query(`select md5(prosrc) m from pg_proc where proname = 'notif_pengingat'`)).rows[0].m !== lama, 'notif_pengingat ditulis ulang oleh migrasi');
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
  let galat = null;
  try { await B1.query('select sigarda.notif_pengingat()'); } catch (e) { galat = e.message; }
  ok(galat === null, 'tanpa skema cron: pengingat harian tetap berjalan');
  await B1.exec(`create schema cron; create table cron.job_run_details (runid bigint, end_time timestamptz);
    insert into cron.job_run_details values (1, now() - interval '31 days'), (2, now() - interval '90 days'), (3, now() - interval '29 days'), (4, now());`);
  await B1.query('select sigarda.notif_pengingat()');
  const sisa = (await B1.query('select runid::int r from cron.job_run_details order by 1')).rows.map((x) => x.r).join();
  ok(sisa === '3,4', 'riwayat cron lebih dari 30 hari dihapus, yang lebih baru tetap (sisa runid ' + sisa + ')');
  await B1.exec('drop table cron.job_run_details; create table cron.job_run_details (runid bigint)'); // tanpa kolom end_time: galat ditelan
  galat = null;
  try { await B1.query('select sigarda.notif_pengingat()'); } catch (e) { galat = e.message; }
  ok(galat === null, 'bentuk tabel cron tak terduga: galat ditelan, pengingat tetap berjalan');
}

console.log('\n--- Tanpa migrasi sebelumnya: gagal jelas ---');
const B3 = await baru('git:bab5bfd'); // sebelum migrasi 2026-09-berita-lagi.sql
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi sebelumnya/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));

console.log(`\nRINGKASAN MIGRASI BERSIH-RIWAYAT-CRON: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
