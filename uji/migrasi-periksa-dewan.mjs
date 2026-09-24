// Migrasi Periksa Data untuk Dewan Ambalan: kesetaraan dengan skema baru, data utuh, idempoten, peran ditegakkan, dan gagal jelas bila prasyarat belum ada.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { skemaLama } from '../scripts/skema-lama.mjs';
import { siapkanPg, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh, isiStatusContoh } from '../src/lokal/seedLokal.js';

const P = process.cwd().replace(/\\/g, '/');
let g = 0, l = 0;
const ok = (c, m) => { if (c) { l++; console.log('ok   :', m); } else { g++; console.log('GAGAL:', m); } };
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
const bersih = (s) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-periksa-dewan.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.notifikasi)::int no, (select count(*) from auth.users)::int u`)).rows[0];
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('sg_pemeriksaan_data', 'sg_push_ringkasan') order by 2`),
    hakFungsi: await q(`select routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema = 'public' and routine_name in ('sg_pemeriksaan_data', 'sg_push_ringkasan') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3`),
  };
};
const bandingkan = (nama, pa, pb) => {
  for (const k of Object.keys(pa)) {
    const sama = JSON.stringify(pa[k]) === JSON.stringify(pb[k]);
    ok(sama, `${nama}: katalog setara (${k}): ${pa[k].length} entri`);
    if (!sama) console.log('   baru =', pa[k], '| migrasi =', pb[k]);
  }
};

// Skema "sesudah" = skema pada commit migrasi ini (bukan skema.sql terbaru).
const A = await baru('git:558483c'); // skema TEPAT sesudah migrasi ini; skema.sql terbaru memuat tahap sesudahnya (Fase E menulis ulang sg_pemeriksaan_data)
const pa = await potret(A);
ok(pa.fungsi.length === 2 && pa.hakFungsi.filter((x) => x.grantee === 'authenticated').length === 2, 'skema baru memuat kedua fungsi, dapat dipanggil authenticated');

const SEBELUM = 'git:83e06d0'; // commit TEPAT sebelum migrasi ini

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru(SEBELUM);
await isiDataContoh(B1);
await isiStatusContoh(B1); // Nadia Putri (10008) = Penegak berjabatan Sekretaris
await B1.query('update public.profiles set wajib_ganti_pin = false');
const sebelum = await cacah(B1);
const ada = async (db, u, sql) => { try { await sqlSebagai(db, u, sql); return { ok: true }; } catch (e) { return { ok: false, pesan: e.message }; } };
const idDari = async (db, username) => (await db.query('select id from public.profiles where username = $1', [username])).rows[0].id;
const dewanLama = await idDari(B1, 'dewan'), penegakDewan = await idDari(B1, '10008'), penegak = await idDari(B1, '10231'), pembina = await idDari(B1, 'pembina');
ok(!(await ada(B1, dewanLama, 'select public.sg_pemeriksaan_data()')).ok, 'prasyarat: sebelum migrasi Dewan Ambalan ditolak');
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
await B1.exec(MP); await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'menjalankan migrasi tiga kali: data tetap sama');
bandingkan('database berisi data', pa, await potret(B1));

console.log('\n--- Sesudah migrasi: peran ditegakkan ---');
for (const [nama, uid] of [['Pembina', pembina], ['akun Dewan lama', dewanLama], ['Penegak berjabatan Dewan', penegakDewan]]) {
  ok((await ada(B1, uid, 'select public.sg_pemeriksaan_data()')).ok && (await ada(B1, uid, 'select public.sg_push_ringkasan()')).ok, `${nama} dapat memanggil sg_pemeriksaan_data dan sg_push_ringkasan`);
}
const tolak = await ada(B1, penegak, 'select public.sg_pemeriksaan_data()');
ok(!tolak.ok && /Hanya pengurus/.test(tolak.pesan) && !(await ada(B1, penegak, 'select public.sg_push_ringkasan()')).ok, 'Penegak biasa tetap ditolak');

console.log('\n--- Tanpa migrasi berkas-garuda: gagal jelas ---');
const B3 = await baru('git:134e76b'); // sebelum berkas-garuda (tanpa sg_garuda_token_baca)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));

console.log(`\nRINGKASAN MIGRASI PERIKSA-DEWAN: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
