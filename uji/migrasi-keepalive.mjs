// Migrasi keep-alive Supabase dari dalam database: kesetaraan dengan skema baru, data utuh, idempoten, hak akses sama, fungsi berfungsi, dan gagal jelas bila prasyarat belum ada.
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
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-keepalive.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from auth.users)::int u`)).rows[0];
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'sigarda' and p.proname like 'keepalive\_%' order by 2`),
    hakFungsi: await q(`select routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema = 'sigarda' and routine_name like 'keepalive\_%' and grantee in ('anon','authenticated','service_role') order by 1, 2, 3`),
    kolom: await q(`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'keepalive_konfigurasi' order by ordinal_position`),
    batasan: await q(`select conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid = 'public.keepalive_konfigurasi'::regclass and contype <> 'n' order by 1`),
    hakTabel: await q(`select relrowsecurity rls, has_table_privilege('authenticated', c.oid, 'select') sel, has_table_privilege('anon', c.oid, 'select') anon,
      (select count(*) from pg_policies where schemaname = 'public' and tablename = 'keepalive_konfigurasi')::int kebijakan from pg_class c where oid = 'public.keepalive_konfigurasi'::regclass`),
  };
};
const bandingkan = (nama, pa, pb) => {
  for (const k of Object.keys(pa)) {
    const sama = JSON.stringify(pa[k]) === JSON.stringify(pb[k]);
    ok(sama, `${nama}: katalog setara (${k}): ${pa[k].length} entri`);
    if (!sama) console.log('   baru =', JSON.stringify(pa[k]), '| migrasi =', JSON.stringify(pb[k]));
  }
};

// Skema "sesudah" = skema.sql terbaru; sebelum = commit TEPAT sebelum migrasi ini (indeks kunci asing sudah ada).
const A = await baru(`${P}/supabase/skema.sql`);
const pa = await potret(A);
ok(pa.fungsi.length === 5 && pa.kolom.length === 8 && pa.hakTabel[0].rls && !pa.hakTabel[0].sel && !pa.hakTabel[0].anon && pa.hakTabel[0].kebijakan === 0, 'skema baru memuat 5 fungsi dan tabel 8 kolom, RLS aktif tanpa kebijakan dan tanpa hak baca');

const SEBELUM = 'git:b118111';
console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru(SEBELUM);
await isiDataContoh(B1);
const sebelum = await cacah(B1);
ok((await B1.query(`select to_regclass('public.keepalive_konfigurasi') t`)).rows[0].t === null, 'prasyarat: skema lama belum punya tabel keepalive_konfigurasi');
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
await B1.exec(MP); await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'menjalankan migrasi tiga kali: data tetap sama');
bandingkan('database berisi data', pa, await potret(B1));

console.log('\n--- Sesudah migrasi: konfigurasi bertahan saat migrasi diulang, fungsi berfungsi ---');
{
  const r = (await B1.query(`select sigarda.keepalive_atur('https://abcdefghijklmnop.supabase.co', 'sb_publishable_abcdefghijklmnopqrstuvwxyz0123456789') h`)).rows[0].h;
  ok(/tersimpan/.test(r), 'keepalive_atur berjalan pada database hasil migrasi: ' + r.slice(0, 60));
  await B1.exec(MP);
  ok((await B1.query('select count(*)::int c from public.keepalive_konfigurasi')).rows[0].c === 1, 'menjalankan migrasi lagi TIDAK menghapus konfigurasi yang sudah diisi (create table if not exists)');
}

console.log('\n--- Tanpa migrasi sebelumnya: gagal jelas ---');
{
  const B3 = new PGlite();
  await B3.exec(stub);
  let galat = null;
  try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
  ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
}

console.log(`\nRINGKASAN MIGRASI KEEPALIVE: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
