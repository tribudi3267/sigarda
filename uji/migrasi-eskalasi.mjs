// Migrasi Eskalasi tidak bergerak (tahap L5): kesetaraan dengan skema baru, data utuh, idempoten, dan gagal jelas bila prasyarat belum ada.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { siapkanPg, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';

const P = process.cwd().replace(/\\/g, '/');
let g = 0, l = 0;
const ok = (c, m) => { if (c) { l++; console.log('ok   :', m); } else { g++; console.log('GAGAL:', m); } };
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
const bersih = (s) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-eskalasi.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? execFileSync('git', ['show', `${ref.slice(4)}:supabase/skema.sql`], { cwd: P, encoding: 'utf8', maxBuffer: 1 << 26 }) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.notifikasi)::int no, (select count(*) from auth.users)::int u`)).rows[0];
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where (n.nspname = 'public' and p.proname in ('sg_profil_whatsapp_atur','sg_eskalasi_daftar'))
         or (n.nspname = 'sigarda' and p.proname in ('notif_pengingat','eskalasi_mulai_sku','eskalasi_mulai_absensi','eskalasi_mulai_iuran','eskalasi_tingkat','eskalasi_judul','eskalasi_isi','eskalasi_tab','eskalasi_proses'))
      order by 1, 2`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema = 'public' and routine_name in ('sg_profil_whatsapp_atur','sg_eskalasi_daftar') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
    kolom: await q(`select column_name, is_nullable, data_type from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'whatsapp'`),
    batasan: await q(`select conname from pg_constraint where conrelid = 'public.notifikasi'::regclass and conname = 'notifikasi_jenis_check'`),
  };
};
const bandingkan = (nama, pa, pb) => {
  for (const k of Object.keys(pa)) {
    const sama = JSON.stringify(pa[k]) === JSON.stringify(pb[k]);
    ok(sama, `${nama}: katalog setara (${k}): ${pa[k].length} entri`);
    if (!sama) console.log('   baru =', pa[k], '| migrasi =', pb[k]);
  }
};

const A = await baru(`${P}/supabase/skema.sql`);
const pa = await potret(A);
ok(pa.fungsi.length === 11, `skema baru memuat semua fungsi eskalasi (2 publik + 9 sigarda): ${pa.fungsi.length}`);
ok(pa.hakFungsi.filter((x) => x.grantee === 'authenticated').length === 2, 'kedua fungsi publik baru dapat dipanggil authenticated');
ok(pa.kolom.length === 1 && pa.kolom[0].is_nullable === 'YES', 'kolom profiles.whatsapp ada dan boleh kosong');
ok(pa.batasan.length === 1, 'batasan notifikasi_jenis_check ada (memuat eskalasi)');

const SEBELUM = 'git:f509a23'; // commit TEPAT sebelum migrasi ini (cadangan tahap L4 sudah terbit)

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru(SEBELUM);
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const sebelum = await cacah(B1);
ok((await B1.query(`select to_regprocedure('public.sg_profil_whatsapp_atur(text)') as f`)).rows[0].f === null, 'prasyarat: skema lama belum punya sg_profil_whatsapp_atur');
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
await B1.exec(MP); await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'menjalankan migrasi tiga kali: data tetap sama');
bandingkan('database berisi data', pa, await potret(B1));

console.log('\n--- Sesudah migrasi: fungsi berfungsi dan menegakkan peran ---');
{
  const admin = (await B1.query("select id from public.profiles where role = 'admin' limit 1")).rows[0].id;
  const pembina = (await B1.query("select id from public.profiles where role = 'penguji' and jabatan = 'Pembina' limit 1")).rows[0].id;
  const ahmad = (await B1.query("select id from public.profiles where username = '10231'")).rows[0].id;
  const sebagai = async (uid, sql) => { try { return { ok: true, rows: (await sqlSebagai(B1, uid, sql)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
  const rWa = await sebagai(ahmad, `select public.sg_profil_whatsapp_atur('08123456789') d`);
  ok(rWa.ok, 'Penegak dapat menyimpan nomor WhatsApp sendiri pada database hasil migrasi');
  const rDaftar = await sebagai(pembina, 'select public.sg_eskalasi_daftar() d');
  ok(rDaftar.ok && Array.isArray(rDaftar.rows[0].d), 'Pembina dapat memuat daftar Tindak Lanjut pada database hasil migrasi');
  const rTolak = await sebagai(ahmad, 'select public.sg_eskalasi_daftar() d');
  ok(!rTolak.ok, 'Penegak biasa tetap ditolak memuat daftar Tindak Lanjut');
  await B1.query('select sigarda.notif_pengingat()');
  ok(true, 'sigarda.notif_pengingat() (kini memanggil eskalasi_proses) berjalan tanpa galat pada database hasil migrasi');
}

console.log('\n--- Tanpa migrasi cadangan: gagal jelas ---');
const B3 = await baru('git:e147d7c'); // sebelum cadangan (tanpa sg_cadangan_admin)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
ok((await B3.query(`select to_regprocedure('public.sg_profil_whatsapp_atur(text)') as f`)).rows[0].f === null, 'kegagalan membatalkan seluruh migrasi (fungsi tidak dibuat)');

console.log(`\nRINGKASAN MIGRASI ESKALASI: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
