// Migrasi Berkas Calon Garuda (tahap L7): kesetaraan dengan skema baru, data utuh, idempoten, dan gagal jelas bila prasyarat belum ada.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';

const P = process.cwd().replace(/\\/g, '/');
let g = 0, l = 0;
const ok = (c, m) => { if (c) { l++; console.log('ok   :', m); } else { g++; console.log('GAGAL:', m); } };
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
const bersih = (s) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-berkas-garuda.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? execFileSync('git', ['show', `${ref.slice(4)}:supabase/skema.sql`], { cwd: P, encoding: 'utf8', maxBuffer: 1 << 26 }) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.notifikasi)::int no, (select count(*) from auth.users)::int u`)).rows[0];
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where (n.nspname = 'public' and p.proname in ('sg_garuda_berkas_baca','sg_garuda_token_buat','sg_garuda_token_cabut','sg_garuda_token_baca'))
         or (n.nspname = 'sigarda' and p.proname = 'garuda_berkas_json')
      order by 1, 2`),
    hakFungsiAuth: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema = 'public' and routine_name in ('sg_garuda_berkas_baca','sg_garuda_token_buat','sg_garuda_token_cabut') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
    hakFungsiAnon: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema = 'public' and routine_name = 'sg_garuda_token_baca' and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
    kebijakan: await q(`select policyname, cmd, roles::text from pg_policies where schemaname = 'public' and tablename = 'garuda_berkas_token' order by 1`),
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
const A = await baru(`${P}/supabase/skema.sql`);
const pa = await potret(A);
ok(pa.fungsi.length === 5, `skema baru memuat semua fungsi berkas garuda (4 public + 1 sigarda): ${pa.fungsi.length}`);
ok(pa.hakFungsiAuth.filter((x) => x.grantee === 'authenticated').length === 3, 'ketiga fungsi sg_garuda_berkas_baca/token_buat/token_cabut dapat dipanggil authenticated');
ok(pa.hakFungsiAnon.some((x) => x.grantee === 'anon') && pa.hakFungsiAnon.some((x) => x.grantee === 'authenticated'), 'sg_garuda_token_baca dapat dipanggil anon DAN authenticated');
ok(pa.kebijakan.length === 0, 'garuda_berkas_token TANPA kebijakan RLS (hanya lewat fungsi, sama seperti sertifikat_tingkat)');
ok((await A.query(`select to_regclass('public.garuda_berkas_token') as t`)).rows[0].t === 'garuda_berkas_token', 'tabel public.garuda_berkas_token ada pada skema baru');

const SEBELUM = 'git:134e76b'; // commit TEPAT sebelum migrasi ini (usulan kegiatan tahap L6b sudah terbit)

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru(SEBELUM);
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const sebelum = await cacah(B1);
ok((await B1.query(`select to_regclass('public.garuda_berkas_token') as t`)).rows[0].t === null, 'prasyarat: skema lama belum punya tabel garuda_berkas_token');
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
ok((await B1.query(`select count(*)::int n from public.garuda_berkas_token`)).rows[0].n === 0, 'tabel garuda_berkas_token baru: kosong sesudah migrasi (tidak mengarang data)');
await B1.exec(MP); await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'menjalankan migrasi tiga kali: data tetap sama');
bandingkan('database berisi data', pa, await potret(B1));

console.log('\n--- Sesudah migrasi: fungsi berfungsi dan menegakkan peran ---');
{
  const masuk = async (username) => { const k = buatKlienFake(B1); const a = buatApi(k); const r = await a.masuk(username, PIN_DEMO[username] ?? PIN_DEMO.penegak); return { k, a, id: r.id }; };
  const pembina = await masuk('pembina');
  const dewan = await masuk('dewan');
  const ahmad = await masuk('10231');
  const dewanId = dewan.id;

  const luluskan = (pid, tingkat) => B1.query(
    `insert into public.sku_progress (peserta_id, sku_id, status, tanggal_uji, nilai, penguji_id, verifikasi)
     select p.id, u.id, 'lulus', current_date, 'Baik', $3, 'VRF-TESTMIG'
     from public.profiles p join public.sku_unit u on u.tingkat = $2 and (u.agama is null or u.agama = p.agama)
     where p.id = $1
     on conflict (peserta_id, sku_id) do update set status = 'lulus', tanggal_uji = excluded.tanggal_uji, penguji_id = excluded.penguji_id`,
    [pid, tingkat, dewanId]
  );
  await luluskan(ahmad.id, 'Bantara');
  await luluskan(ahmad.id, 'Laksana');
  await B1.query(`update public.profiles set calon_garuda = current_date where id = $1`, [ahmad.id]);

  const rTolak = await dewan.k.rpc('sg_garuda_berkas_baca', { p_peserta_id: ahmad.id });
  ok(rTolak.error != null, 'Dewan Ambalan tetap ditolak membuka berkas pada database hasil migrasi');
  const rBuka = await pembina.k.rpc('sg_garuda_berkas_baca', { p_peserta_id: ahmad.id });
  ok(!rBuka.error && rBuka.data?.peserta?.id === ahmad.id, `Pembina dapat membuka berkas Calon Garuda pada database hasil migrasi (${rBuka.error?.message ?? 'ok'})`);
  const rToken = await pembina.k.rpc('sg_garuda_token_buat', { p_peserta_id: ahmad.id });
  ok(!rToken.error && /^[0-9a-f]{32}$/.test(rToken.data), 'Pembina dapat membuat tautan berbagi pada database hasil migrasi');
  const kAnon = buatKlienFake(B1);
  const rBaca = await kAnon.rpc('sg_garuda_token_baca', { p_token: rToken.data });
  ok(!rBaca.error && rBaca.data?.ditemukan === true, 'tautan berbagi dapat dibaca TANPA LOGIN pada database hasil migrasi');
  const rCabut = await pembina.k.rpc('sg_garuda_token_cabut', { p_peserta_id: ahmad.id });
  ok(!rCabut.error, 'Pembina dapat mencabut tautan pada database hasil migrasi');
}

console.log('\n--- Tanpa migrasi usulan kegiatan: gagal jelas ---');
const B3 = await baru('git:6a4d494'); // sebelum usulan kegiatan (tanpa sg_kegiatan_ping)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
ok((await B3.query(`select to_regclass('public.garuda_berkas_token') as t`)).rows[0].t === null, 'kegagalan membatalkan seluruh migrasi (tabel tidak dibuat)');

console.log(`\nRINGKASAN MIGRASI GARUDA: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
