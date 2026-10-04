// Migrasi "muat awal" (sg_muat_awal baru, hemat log Fase 2): kesetaraan dengan skema baru (fungsi dan hak), data utuh, idempoten, hak (hanya pengguna masuk),
// dan gagal jelas bila prasyarat (skema dan migrasi sebelumnya) belum ada.
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
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-10-muat-awal.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.notifikasi)::int n, (select count(*) from public.asisten_iuran)::int a, (select count(*) from public.pengaturan)::int g`)).rows[0];
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sigarda') and p.prokind = 'f' order by 1, 2, 3`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema in ('public', 'sigarda') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
  };
};

const A = await baru(`${P}/supabase/skema.sql`); // skema terbaru = skema tepat SESUDAH migrasi ini
const pa = await potret(A);

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru('git:9ded7b6'); // commit TEPAT sebelum migrasi ini (main sesudah PR #72)
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
ok((await B1.query(`select to_regprocedure('public.sg_muat_awal()') as f`)).rows[0].f === null, 'prasyarat: skema lama belum punya sg_muat_awal');
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

console.log('\n--- Sesudah migrasi: perilaku baru ---');
{
  const id = (await B1.query(`select id from public.profiles where role = 'admin' limit 1`)).rows[0].id;
  const r = (await sqlSebagai(B1, id, 'select public.sg_muat_awal() as d')).rows[0].d;
  ok(['gudep', 'iuran', 'pendampingan', 'praUjiAktif', 'asisten', 'notifikasi'].every((k) => k in r), 'pengguna masuk: jawaban memuat keenam bagian');
  let galat = null;
  try { await sqlSebagai(B1, null, 'select public.sg_muat_awal()'); } catch (e) { galat = e.message; }
  ok(/permission denied/i.test(galat ?? ''), 'tanpa login ditolak');
  const penerima = pb.hakFungsi.filter((h) => h.routine_name === 'sg_muat_awal').map((h) => h.grantee);
  ok(penerima.includes('authenticated') && !penerima.includes('anon'), 'hak: pengguna masuk boleh, anon tidak (' + penerima.join() + ')');
  ok(pb.fungsi.filter((f) => f.proname === 'sg_muat_awal').every((f) => f.prosecdef === false), 'berjalan sebagai pemanggil (bukan security definer): RLS tetap berlaku');
}

console.log('\n--- Tanpa migrasi sebelumnya: gagal jelas ---');
const B3 = await baru('git:90cb914'); // sebelum migrasi pinsa-bina-damping (tanpa sg_pendampingan_saya)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi sebelumnya/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
ok((await B3.query(`select to_regprocedure('public.sg_muat_awal()') as f`)).rows[0].f === null, 'kegagalan membatalkan seluruh migrasi (fungsi tidak dibuat)');

console.log(`\nRINGKASAN MIGRASI MUAT-AWAL: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
