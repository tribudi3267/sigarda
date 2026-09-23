// Migrasi Pemeriksaan Data (tahap L3): kesetaraan dengan skema baru, data utuh, idempoten, dan gagal jelas bila prasyarat belum ada.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { skemaLama } from '../scripts/skema-lama.mjs';
import { siapkanPg, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';

const P = process.cwd().replace(/\\/g, '/');
let g = 0, l = 0;
const ok = (c, m) => { if (c) { l++; console.log('ok   :', m); } else { g++; console.log('GAGAL:', m); } };
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
// Akhir baris disamakan (LF): checkout Windows dapat mengubah berkas menjadi CRLF, sedangkan skema lama dari git berakhir LF.
const bersih = (s) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-pemeriksaan-data.sql`, 'utf8'));

// Skema "sebelum migrasi" diambil dari riwayat git: 'git:<commit>' = supabase/skema.sql pada commit itu (commit TEPAT sebelum migrasi ini).
const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.sku_riwayat)::int r, (select count(*) from auth.users)::int u`)).rows[0];
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'sg_pemeriksaan_data'`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema = 'public' and routine_name = 'sg_pemeriksaan_data' and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
  };
};
const bandingkan = (nama, pa, pb) => {
  for (const k of Object.keys(pa)) {
    const sama = JSON.stringify(pa[k]) === JSON.stringify(pb[k]);
    ok(sama, `${nama}: katalog setara (${k}): ${pa[k].length} entri`);
    if (!sama) console.log('   baru =', pa[k], '| migrasi =', pb[k]);
  }
};

// Skema "sesudah migrasi" = commit TEPAT sesudah migrasi ini (sebelum migrasi cadangan), BUKAN skema.sql terbaru
// (yang sudah memuat fungsi migrasi berikutnya juga; lihat CLAUDE.md, bagian uji migrasi).
const A = await baru('git:e147d7c');
const pa = await potret(A);
ok(pa.fungsi.length === 1 && pa.hakFungsi.some((x) => x.grantee === 'authenticated'), 'skema baru memuat sg_pemeriksaan_data, dapat dipanggil authenticated');

const SEBELUM = 'git:bfbd14f'; // commit TEPAT sebelum migrasi ini (perbaikan notifikasi nyasar L2-B sudah terbit)

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru(SEBELUM);
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const sebelum = await cacah(B1);
ok((await B1.query(`select to_regprocedure('public.sg_pemeriksaan_data()') as f`)).rows[0].f === null, 'prasyarat: skema lama belum punya sg_pemeriksaan_data');
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
  const rAdmin = await sebagai(admin, 'select public.sg_pemeriksaan_data() d');
  ok(rAdmin.ok && typeof rAdmin.rows[0].d === 'object', 'Admin memanggil sg_pemeriksaan_data pada database hasil migrasi');
  const rPeserta = await sebagai(ahmad, 'select public.sg_pemeriksaan_data() d');
  ok(!rPeserta.ok, 'Penegak biasa tetap ditolak pada database hasil migrasi');
}

console.log('\n--- Tanpa migrasi notifikasi uji: gagal jelas ---');
const B3 = await baru('git:9eb504d'); // sebelum notifikasi uji (tanpa sg_notifikasi_tes)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
ok((await B3.query(`select to_regprocedure('public.sg_pemeriksaan_data()') as f`)).rows[0].f === null, 'kegagalan membatalkan seluruh migrasi (fungsi tidak dibuat)');

console.log(`\nRINGKASAN MIGRASI PEMERIKSAAN-DATA: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
