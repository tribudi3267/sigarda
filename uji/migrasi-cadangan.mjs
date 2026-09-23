// Migrasi Cadangan data (tahap L4): kesetaraan dengan skema baru, data utuh, idempoten, dan gagal jelas bila prasyarat belum ada.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { siapkanPg, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';

const P = process.cwd().replace(/\\/g, '/');
let g = 0, l = 0;
const ok = (c, m) => { if (c) { l++; console.log('ok   :', m); } else { g++; console.log('GAGAL:', m); } };
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
// Akhir baris disamakan (LF): checkout Windows dapat mengubah berkas menjadi CRLF, sedangkan skema lama dari git berakhir LF.
const bersih = (s) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-cadangan.sql`, 'utf8'));

// Skema "sebelum migrasi" diambil dari riwayat git: 'git:<commit>' = supabase/skema.sql pada commit itu (commit TEPAT sebelum migrasi ini).
const skemaDari = (ref) => (ref.startsWith('git:') ? execFileSync('git', ['show', `${ref.slice(4)}:supabase/skema.sql`], { cwd: P, encoding: 'utf8', maxBuffer: 1 << 26 }) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.sku_riwayat)::int r, (select count(*) from public.pengaturan)::int e, (select count(*) from auth.users)::int u`)).rows[0];
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where (n.nspname = 'public' and p.proname in ('sg_cadangan_admin','sg_cadangan_status')) or (n.nspname = 'sigarda' and p.proname = 'notif_pengingat')
      order by 1, 2`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema = 'public' and routine_name in ('sg_cadangan_admin','sg_cadangan_status') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
  };
};
const bandingkan = (nama, pa, pb) => {
  for (const k of Object.keys(pa)) {
    const sama = JSON.stringify(pa[k]) === JSON.stringify(pb[k]);
    ok(sama, `${nama}: katalog setara (${k}): ${pa[k].length} entri`);
    if (!sama) console.log('   baru =', pa[k], '| migrasi =', pb[k]);
  }
};

// Skema "sesudah cadangan" = commit TEPAT sesudah migrasi ini (sebelum migrasi eskalasi), BUKAN skema.sql
// terbaru (yang sudah memuat fungsi migrasi berikutnya juga; lihat CLAUDE.md, bagian uji migrasi).
const A = await baru('git:f509a23');
const pa = await potret(A);
ok(pa.fungsi.length === 3, `skema baru memuat sg_cadangan_admin, sg_cadangan_status, dan sigarda.notif_pengingat (${pa.fungsi.length})`);
ok(pa.hakFungsi.filter((x) => x.grantee === 'authenticated').length === 2, 'kedua fungsi baru dapat dipanggil authenticated');

const SEBELUM = 'git:e147d7c'; // commit TEPAT sebelum migrasi ini (pemeriksaan data sudah terbit)

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru(SEBELUM);
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const sebelum = await cacah(B1);
ok((await B1.query(`select to_regprocedure('public.sg_cadangan_admin()') as f`)).rows[0].f === null, 'prasyarat: skema lama belum punya sg_cadangan_admin');
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
await B1.exec(MP); await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'menjalankan migrasi tiga kali: data tetap sama');
bandingkan('database berisi data', pa, await potret(B1));

console.log('\n--- Sesudah migrasi: fungsi berfungsi dan menegakkan peran ---');
{
  const admin = (await B1.query("select id from public.profiles where role = 'admin' limit 1")).rows[0].id;
  const ahmad = (await B1.query("select id from public.profiles where username = '10231'")).rows[0].id;
  const sebagai = async (uid, sql) => { try { return { ok: true, rows: (await sqlSebagai(B1, uid, sql)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
  const rAdmin = await sebagai(admin, 'select public.sg_cadangan_admin() d');
  ok(rAdmin.ok && Array.isArray(rAdmin.rows[0].d.tabel.profiles), 'Admin memanggil sg_cadangan_admin pada database hasil migrasi');
  const rStatus = await sebagai(admin, 'select public.sg_cadangan_status() d');
  ok(rStatus.ok && typeof rStatus.rows[0].d.pada === 'string', 'sg_cadangan_status mencatat waktu sesudah diunduh');
  const rPeserta = await sebagai(ahmad, 'select public.sg_cadangan_admin() d');
  ok(!rPeserta.ok, 'Penegak biasa tetap ditolak pada database hasil migrasi');
}

console.log('\n--- Tanpa migrasi pemeriksaan-data: gagal jelas ---');
const B3 = await baru('git:bfbd14f'); // sebelum pemeriksaan data (tanpa sg_pemeriksaan_data)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
ok((await B3.query(`select to_regprocedure('public.sg_cadangan_admin()') as f`)).rows[0].f === null, 'kegagalan membatalkan seluruh migrasi (fungsi tidak dibuat)');

console.log(`\nRINGKASAN MIGRASI CADANGAN: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
