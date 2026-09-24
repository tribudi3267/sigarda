// Migrasi Usulan kegiatan (tahap L6b): kesetaraan dengan skema baru, data utuh, idempoten, dan gagal jelas bila prasyarat belum ada.
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
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-usulan-kegiatan.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.notifikasi)::int no, (select count(*) from auth.users)::int u`)).rows[0];
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where (n.nspname = 'public' and p.proname in ('sg_kegiatan_usul','sg_kegiatan_tinjau','sg_kegiatan_ping','sg_agenda_simpan'))
         or (n.nspname = 'sigarda' and p.proname in ('pembina_saja','pradana_atau_pradani','kegiatan_judul_bawaan','kegiatan_bulan_tanggal','musyawarah_pengingat','kegiatan_pengingat','notif_pengingat'))
      order by 1, 2`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema = 'public' and routine_name in ('sg_kegiatan_usul','sg_kegiatan_tinjau','sg_kegiatan_ping') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
    kebijakan: await q(`select policyname, cmd, roles::text from pg_policies where schemaname = 'public' and tablename = 'kegiatan_usulan' order by 1`),
    batasanNotif: await q(`select pg_get_constraintdef(oid) def from pg_constraint where conrelid = 'public.notifikasi'::regclass and conname = 'notifikasi_jenis_check'`),
    batasanAgenda: await q(`select pg_get_constraintdef(oid) def from pg_constraint where conrelid = 'public.agenda'::regclass and conname = 'agenda_jenis_check'`),
  };
};
const bandingkan = (nama, pa, pb) => {
  for (const k of Object.keys(pa)) {
    const sama = JSON.stringify(pa[k]) === JSON.stringify(pb[k]);
    ok(sama, `${nama}: katalog setara (${k}): ${pa[k].length} entri`);
    if (!sama) console.log('   baru =', pa[k], '| migrasi =', pb[k]);
  }
};

// Skema "sesudah" = skema.sql terbaru (migrasi ini adalah yang paling baru; belum ada migrasi lagi sesudahnya).
const A = await baru('git:90cb914');
const pa = await potret(A);
// sg_cadangan_admin tidak ikut dibandingkan di sini: migrasi Fase A (pengukuhan-dewan) menulis ulangnya lagi; isinya dicek pada pemeriksaan perilaku di bawah.
ok(pa.fungsi.length === 11, `skema baru memuat semua fungsi usulan kegiatan (4 public + 7 sigarda): ${pa.fungsi.length}`);
ok(pa.hakFungsi.filter((x) => x.grantee === 'authenticated').length === 3, 'ketiga fungsi sg_kegiatan_* dapat dipanggil authenticated');
ok(pa.kebijakan.length === 1 && pa.kebijakan[0].cmd === 'SELECT', 'kebijakan baca_kegiatan_usulan ada (SELECT saja, tulis hanya lewat fungsi)');
ok(pa.batasanNotif.length === 1 && /'kegiatan'/.test(pa.batasanNotif[0].def), 'batasan notifikasi_jenis_check memuat "kegiatan"');
ok(pa.batasanAgenda.length === 1 && /'ptgd'/.test(pa.batasanAgenda[0].def) && /'pembekalan_dewan'/.test(pa.batasanAgenda[0].def), 'batasan agenda_jenis_check memuat 8 jenis baru');
ok((await A.query(`select to_regclass('public.kegiatan_usulan') as t`)).rows[0].t === 'kegiatan_usulan', 'tabel public.kegiatan_usulan ada pada skema baru');

const SEBELUM = 'git:6a4d494'; // commit TEPAT sebelum migrasi ini (agenda tahap L6 sudah terbit, belum ada usulan kegiatan)

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru(SEBELUM);
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const sebelum = await cacah(B1);
ok((await B1.query(`select to_regclass('public.kegiatan_usulan') as t`)).rows[0].t === null, 'prasyarat: skema lama belum punya tabel kegiatan_usulan');
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
ok((await B1.query(`select count(*)::int n from public.kegiatan_usulan`)).rows[0].n === 0, 'tabel kegiatan_usulan baru: kosong sesudah migrasi (tidak mengarang data)');
await B1.exec(MP); await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'menjalankan migrasi tiga kali: data tetap sama');
bandingkan('database berisi data', pa, await potret(B1));

console.log('\n--- Sesudah migrasi: fungsi berfungsi dan menegakkan peran ---');
{
  const admin = (await B1.query("select id from public.profiles where role = 'admin' limit 1")).rows[0].id;
  const pembina = (await B1.query("select id from public.profiles where role = 'penguji' and jabatan = 'Pembina' limit 1")).rows[0].id;
  const dewan = (await B1.query("select id from public.profiles where username = 'dewan'")).rows[0].id;
  const ahmad = (await B1.query("select id from public.profiles where username = '10231'")).rows[0].id;
  const sebagai = async (uid, sql) => { try { return { ok: true, rows: (await sqlSebagai(B1, uid, sql)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };

  const rTolak = await sebagai(ahmad, `select public.sg_kegiatan_usul('ptgd', '2026/2027', '2026-06-01'::date, 'https://drive.google.com/x', '') d`);
  ok(!rTolak.ok, 'Penegak biasa (bukan Pradana/Pradani) tetap ditolak mengajukan pada database hasil migrasi');
  const rUsul = await sebagai(dewan, `select public.sg_kegiatan_usul('ptgd', '2026/2027', '2026-06-01'::date, 'https://drive.google.com/x', '') d`);
  ok(rUsul.ok, `Pradana dapat mengajukan usulan PTGD pada database hasil migrasi (${rUsul.ok ? 'ok' : rUsul.pesan})`);
  const idUsul = rUsul.rows[0].d;
  const rTinjauAdmin = await sebagai(admin, `select public.sg_kegiatan_tinjau(${idUsul}, 'disetujui', '')`);
  ok(!rTinjauAdmin.ok, 'Admin tetap ditolak meninjau (hanya Pembina)');
  const rTinjau = await sebagai(pembina, `select public.sg_kegiatan_tinjau(${idUsul}, 'disetujui', '')`);
  ok(rTinjau.ok, `Pembina dapat menyetujui usulan pada database hasil migrasi (${rTinjau.ok ? 'ok' : rTinjau.pesan})`);
  const rAgenda = await sebagai(ahmad, `select jenis, judul from public.agenda where tahun_ajaran = '2026/2027' and jenis = 'ptgd'`);
  ok(rAgenda.ok && rAgenda.rows.length === 1 && rAgenda.rows[0].judul === 'PTGD (Penerimaan Tamu Gugus Depan)', 'entri Agenda PTGD tercipta otomatis dengan judul bawaan: ' + JSON.stringify(rAgenda.rows));
  await B1.query('select sigarda.notif_pengingat()');
  ok(true, 'sigarda.notif_pengingat() (kini memanggil musyawarah_pengingat dan kegiatan_pengingat) berjalan tanpa galat pada database hasil migrasi');
  const rCadangan = await sebagai(admin, `select jsonb_object_keys(public.sg_cadangan_admin()->'tabel') k`);
  ok(rCadangan.ok && rCadangan.rows.some((r) => r.k === 'agenda') && rCadangan.rows.some((r) => r.k === 'kegiatan_usulan'), 'sg_cadangan_admin() kini mengekspor agenda dan kegiatan_usulan pada database hasil migrasi');
}

console.log('\n--- Tanpa migrasi agenda: gagal jelas ---');
const B3 = await baru('git:becddc6'); // sebelum agenda (tanpa sg_agenda_hapus)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
ok((await B3.query(`select to_regclass('public.kegiatan_usulan') as t`)).rows[0].t === null, 'kegagalan membatalkan seluruh migrasi (tabel tidak dibuat)');

console.log(`\nRINGKASAN MIGRASI KEGIATAN: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
