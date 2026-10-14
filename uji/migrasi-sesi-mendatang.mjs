// Migrasi "sesi mendatang" (sesi absensi boleh disiapkan sampai 60 hari ke depan; sesi yang belum tiba bukan pertemuan): kesetaraan dengan skema baru
// (fungsi dan hak), data utuh, idempoten, perilaku baru, dan gagal jelas bila prasyarat belum ada.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { skemaLama } from '../scripts/skema-lama.mjs';
import { siapkanPg, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';

const P = process.cwd().replace(/\\/g, '/');
let g = 0, l = 0;
const ok = (c, m) => { if (c) { l++; console.log('ok   :', m); } else { g++; console.log('GAGAL:', m); } };
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
const bersih = (s) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-10-sesi-mendatang.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.absensi_sesi)::int s, (select count(*) from public.absensi_hadir)::int h, (select count(*) from public.iuran)::int i`)).rows[0];
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sigarda') and p.prokind = 'f' order by 1, 2, 3`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema in ('public', 'sigarda') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
  };
};

const A = await baru(`${P}/supabase/skema.sql`); // skema baru (setelah migrasi ini); bila migrasi berikutnya mengubah fungsi yang sama, ganti dengan `git:<hash>` commit tepat sesudahnya
const pa = await potret(A);

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru('git:6ed0f86'); // commit TEPAT sebelum migrasi ini
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const sebelum = await cacah(B1);
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

console.log('\n--- Sebelum vs sesudah migrasi: perilaku ---');
{
  const lama = await baru('git:6ed0f86');
  await isiDataContoh(lama);
  await lama.query('update public.profiles set wajib_ganti_pin = false');
  const pembina = (await lama.query(`select id from public.profiles where username = 'pembina'`)).rows[0].id;
  const hariIni = (await lama.query('select sigarda.hari_ini()::text d')).rows[0].d;
  const d = new Date(`${hariIni}T00:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() !== 5);
  const depan = d.toISOString().slice(0, 10);
  const coba = async (db) => { try { await sqlSebagai(db, pembina, 'select public.sg_absen_buat_sesi($1::date)', [depan]); return null; } catch (e) { return e.message; } };
  ok(/belum tiba/.test(await coba(lama) ?? ''), 'sebelum migrasi: Jumat mendatang ditolak');
  await lama.exec(MP);
  ok((await coba(lama)) === null && (await lama.query('select 1 from public.absensi_sesi where tanggal = $1', [depan])).rows.length === 1, 'sesudah migrasi: Jumat mendatang diterima');
}

console.log('\n--- Tanpa migrasi sebelumnya: gagal jelas ---');
const B3 = new PGlite(); // basis data kosong: tak satu pun fungsi ada
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi sebelumnya/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));

console.log(`\nRINGKASAN MIGRASI SESI-MENDATANG: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
