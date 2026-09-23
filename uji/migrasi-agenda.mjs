// Migrasi Agenda tahunan (tahap L6): kesetaraan dengan skema baru, data utuh, idempoten, dan gagal jelas bila prasyarat belum ada.
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
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-agenda.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.notifikasi)::int no, (select count(*) from auth.users)::int u`)).rows[0];
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where (n.nspname = 'public' and p.proname in ('sg_agenda_simpan','sg_agenda_hapus'))
         or (n.nspname = 'sigarda' and p.proname in ('notif_pengingat','agenda_batas_musyawarah','agenda_proses'))
      order by 1, 2`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema = 'public' and routine_name in ('sg_agenda_simpan','sg_agenda_hapus') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
    kebijakan: await q(`select policyname, cmd, roles::text from pg_policies where schemaname = 'public' and tablename = 'agenda' order by 1`),
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

// Skema "sesudah agenda" = commit TEPAT sesudah migrasi ini (sebelum migrasi musyawarah), BUKAN skema.sql terbaru
// (yang sudah memuat fungsi migrasi berikutnya juga; lihat CLAUDE.md, bagian uji migrasi).
const A = await baru('git:6a4d494');
const pa = await potret(A);
ok(pa.fungsi.length === 5, `skema baru memuat semua fungsi agenda (2 publik + 3 sigarda): ${pa.fungsi.length}`);
ok(pa.hakFungsi.filter((x) => x.grantee === 'authenticated').length === 2, 'kedua fungsi publik baru dapat dipanggil authenticated');
ok(pa.kebijakan.length === 1 && pa.kebijakan[0].cmd === 'SELECT', 'kebijakan baca_agenda ada (SELECT saja, tulis hanya lewat fungsi)');
ok(pa.batasan.length === 1, 'batasan notifikasi_jenis_check ada (memuat agenda)');
ok((await A.query(`select to_regclass('public.agenda') as t`)).rows[0].t === 'agenda', 'tabel public.agenda ada pada skema baru');

const SEBELUM = 'git:becddc6'; // commit TEPAT sebelum migrasi ini (eskalasi tahap L5 sudah terbit)

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru(SEBELUM);
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const sebelum = await cacah(B1);
ok((await B1.query(`select to_regclass('public.agenda') as t`)).rows[0].t === null, 'prasyarat: skema lama belum punya tabel agenda');
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
ok((await B1.query(`select count(*)::int n from public.agenda`)).rows[0].n === 0, 'tabel agenda baru: kosong sesudah migrasi (tidak mengarang data)');
await B1.exec(MP); await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'menjalankan migrasi tiga kali: data tetap sama');
bandingkan('database berisi data', pa, await potret(B1));

console.log('\n--- Sesudah migrasi: fungsi berfungsi dan menegakkan peran ---');
{
  const admin = (await B1.query("select id from public.profiles where role = 'admin' limit 1")).rows[0].id;
  const pembina = (await B1.query("select id from public.profiles where role = 'penguji' and jabatan = 'Pembina' limit 1")).rows[0].id;
  const ahmad = (await B1.query("select id from public.profiles where username = '10231'")).rows[0].id;
  const sebagai = async (uid, sql) => { try { return { ok: true, rows: (await sqlSebagai(B1, uid, sql)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
  const rAdmin = await sebagai(admin, `select public.sg_agenda_simpan(null, '2026/2027', 'naik_kelas', 'Naik Kelas', '2027-07-05'::date, '', '{}', false) d`);
  ok(rAdmin.ok, `Admin dapat menambah agenda pada database hasil migrasi (${rAdmin.ok ? 'ok' : rAdmin.pesan})`);
  const idBaru = rAdmin.rows[0].d;
  const rTolak = await sebagai(ahmad, `select public.sg_agenda_simpan(null, '2026/2027', 'sidang', 'X', '2026-10-01'::date, '', '{}', false) d`);
  ok(!rTolak.ok, 'Penegak biasa tetap ditolak menambah agenda');
  const rBaca = await sebagai(ahmad, `select id from public.agenda where id = ${idBaru}`);
  ok(rBaca.ok && rBaca.rows.length === 1, 'Penegak tetap dapat MEMBACA agenda (RLS baca_agenda)');
  const rBatas = await sebagai(admin, `select public.sg_agenda_simpan(null, '2026/2027', 'musyawarah', 'Musyawarah', '2027-08-01'::date, '', '{}', true) d`);
  ok(!rBatas.ok && /1 Juli/.test(rBatas.pesan), 'batas Musyawarah 1 Juli tetap ditegakkan (Admin tak bisa lewati) pada database hasil migrasi: ' + rBatas.pesan);
  const rHapus = await sebagai(admin, `select public.sg_agenda_hapus(${idBaru})`);
  ok(rHapus.ok, 'Admin dapat menghapus agenda pada database hasil migrasi');
  await B1.query('select sigarda.notif_pengingat()');
  ok(true, 'sigarda.notif_pengingat() (kini memanggil agenda_proses) berjalan tanpa galat pada database hasil migrasi');
}

console.log('\n--- Tanpa migrasi eskalasi: gagal jelas ---');
const B3 = await baru('git:f509a23'); // sebelum eskalasi (tanpa sg_profil_whatsapp_atur)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
ok((await B3.query(`select to_regclass('public.agenda') as t`)).rows[0].t === null, 'kegagalan membatalkan seluruh migrasi (tabel tidak dibuat)');

console.log(`\nRINGKASAN MIGRASI AGENDA: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
