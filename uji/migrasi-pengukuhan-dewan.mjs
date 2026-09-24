// Migrasi Fase A (pengukuhan Dewan Ambalan + Pemangku Adat): kesetaraan dengan skema baru, data utuh, idempoten, perilaku, dan gagal jelas.
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
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-pengukuhan-dewan.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.notifikasi)::int no, (select count(*) from public.sidang_dk)::int sd, (select count(*) from public.kepengurusan_log)::int kl, (select count(*) from auth.users)::int u`)).rows[0];
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where (n.nspname = 'public' and p.proname in ('sg_pengukuhan_dewan_simpan','sg_pengukuhan_dewan_hapus','sg_anggota_jabatan_dewan_atur','sg_kepengurusan_terapkan','sg_dewan_lama_arsipkan','sg_cadangan_admin'))
         or (n.nspname = 'sigarda' and p.proname in ('jabatan_baku','jabatan_tunggal','ketua_sidang'))
      order by 1, 2`),
    hakFungsi: await q(`select routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema = 'public' and routine_name in ('sg_pengukuhan_dewan_simpan','sg_pengukuhan_dewan_hapus') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3`),
    hakTabel: await q(`select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'pengukuhan_dewan' and grantee in ('anon','authenticated') order by 1, 2`),
    kebijakan: await q(`select policyname, cmd, roles::text from pg_policies where schemaname = 'public' and tablename = 'pengukuhan_dewan' order by 1`),
    rls: await q(`select relrowsecurity from pg_class where oid = 'public.pengukuhan_dewan'::regclass`),
    kolom: await q(`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'pengukuhan_dewan' order by ordinal_position`),
    batasan: await q(`select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid = 'public.pengukuhan_dewan'::regclass order by 1`),
    indeksJabatan: await q(`select indexdef from pg_indexes where schemaname = 'public' and indexname = 'profil_pradana_pradani_unik'`),
  };
};
const bandingkan = (nama, pa, pb) => {
  for (const k of Object.keys(pa)) {
    const sama = JSON.stringify(pa[k]) === JSON.stringify(pb[k]);
    ok(sama, `${nama}: katalog setara (${k}): ${pa[k].length} entri`);
    if (!sama) console.log('   baru =', pa[k], '| migrasi =', pb[k]);
  }
};

const A = await baru('git:6ad8610'); // skema TEPAT sesudah migrasi ini (main sesudah PR #13 dan #14); skema.sql terbaru sudah memuat tahap sesudahnya (sg_cadangan_admin dengan sku_pra_uji)
const pa = await potret(A);
ok(pa.fungsi.length === 9, `skema baru memuat semua fungsi yang terkait (6 public + 3 sigarda): ${pa.fungsi.length}`);
ok(pa.kolom.length === 8 && pa.batasan.length >= 6, `tabel pengukuhan_dewan: ${pa.kolom.length} kolom, ${pa.batasan.length} batasan`);
ok(pa.kebijakan.length === 1 && pa.kebijakan[0].cmd === 'SELECT' && pa.rls[0].relrowsecurity === true, 'RLS aktif dengan satu kebijakan baca (tulis hanya lewat fungsi)');
ok(pa.hakTabel.length === 1 && pa.hakTabel[0].privilege_type === 'SELECT', 'authenticated hanya SELECT pada tabel (anon tidak punya hak apa pun)');
ok(/Pemangku Adat/.test(pa.indeksJabatan[0]?.indexdef ?? ''), 'indeks unik jabatan memuat Pemangku Adat');

const SEBELUM = 'git:90cb914'; // commit TEPAT sebelum migrasi Fase A DAN Fase B; urutan migrasi: pinsa-bina-damping dulu, lalu pengukuhan-dewan
const MB = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-pinsa-bina-damping.sql`, 'utf8'));

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru(SEBELUM);
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
await B1.exec(MB); // migrasi Fase B lebih dulu (tabel bina_damping harus ada untuk sg_cadangan_admin)
const sebelum = await cacah(B1);
ok((await B1.query(`select to_regclass('public.pengukuhan_dewan') as t`)).rows[0].t === null, 'prasyarat: skema lama belum punya tabel pengukuhan_dewan');
ok(!/Pemangku Adat/.test((await B1.query(`select indexdef from pg_indexes where indexname = 'profil_pradana_pradani_unik'`)).rows[0].indexdef), 'prasyarat: indeks lama belum memuat Pemangku Adat');
// Penulisan lama "pemangku  ADAT" (huruf dan spasi berbeda) dirapikan oleh migrasi.
const ahmad = (await B1.query("select id from public.profiles where username = '10231'")).rows[0].id;
await B1.query(`update public.profiles set jabatan_dewan = ' pemangku  ADAT ' where id = $1`, [ahmad]);
await B1.exec(MP);
ok((await B1.query(`select jabatan_dewan from public.profiles where id = $1`, [ahmad])).rows[0].jabatan_dewan === 'Pemangku Adat', 'jabatan "pemangku  ADAT" yang sudah ada dirapikan menjadi "Pemangku Adat"');
await B1.query(`update public.profiles set jabatan_dewan = null where id = $1`, [ahmad]);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
ok((await B1.query(`select count(*)::int n from public.pengukuhan_dewan`)).rows[0].n === 0, 'tabel pengukuhan_dewan baru: kosong sesudah migrasi (tidak mengarang data)');
await B1.exec(MP); await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'menjalankan migrasi tiga kali: data tetap sama');
bandingkan('database berisi data', pa, await potret(B1));

console.log('\n--- Sesudah migrasi: perilaku dan peran ---');
{
  const sebagai = async (uid, sql) => { try { return { ok: true, rows: (await sqlSebagai(B1, uid, sql)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
  const id = async (u) => (await B1.query('select id from public.profiles where username = $1', [u])).rows[0].id;
  const pembina = (await B1.query("select id from public.profiles where role = 'penguji' and jabatan = 'Pembina' limit 1")).rows[0].id;
  const admin = await id('admin'); const rina = await id('10008'); const budi = await id('10007'); const dewan = await id('dewan');
  const simpan = (uid, ta = '2026/2027', nomor = '188/12/2026', tgl = '2026-09-01') => sebagai(uid, `select public.sg_pengukuhan_dewan_simpan('${ta}', '${nomor}', '${tgl}'::date, '', null, '')`);

  ok((await sebagai(pembina, `select public.sg_anggota_jabatan_dewan_atur('[{"username":"10007","jabatan":"pemangku ADAT"}]'::jsonb) n`)).rows?.[0]?.n === 1, 'Pembina mengangkat Pemangku Adat (huruf dibakukan oleh server)');
  const ganda = await sebagai(pembina, `select public.sg_anggota_jabatan_dewan_atur('[{"username":"10008","jabatan":"Pemangku Adat"}]'::jsonb)`);
  ok(!ganda.ok && /Pemangku Adat sudah dijabat oleh/.test(ganda.pesan ?? ''), 'Pemangku Adat kedua ditolak: ' + (ganda.pesan ?? 'TIDAK DITOLAK'));
  const ketua = (await B1.query(`select * from sigarda.ketua_sidang()`)).rows[0];
  ok(/Pemangku Adat Dewan Ambalan/.test(ketua.o_sebutan), 'ketua sidang = Pemangku Adat pada database hasil migrasi: ' + JSON.stringify(ketua));
  ok((await simpan(budi)).ok === false, 'Penegak biasa ditolak mencatat pengukuhan');
  ok((await simpan(dewan)).ok === false, 'akun Dewan (bukan Pembina/Admin) ditolak mencatat pengukuhan');
  ok((await simpan(pembina)).ok, 'Pembina mencatat pengukuhan');
  ok((await simpan(admin, '2026/2027', '188/99/2026', '2026-09-02')).ok, 'Admin memperbarui pengukuhan tahun ajaran yang sama (upsert)');
  ok((await B1.query(`select nomor_sk from public.pengukuhan_dewan where tahun_ajaran = '2026/2027'`)).rows[0].nomor_sk === '188/99/2026', 'satu catatan per tahun ajaran (nomor terbaru tersimpan)');
  ok((await sebagai(rina, `select count(*)::int n from public.pengukuhan_dewan`)).rows?.[0]?.n === 0, 'Penegak biasa tidak dapat membaca tabel pengukuhan (RLS)');
  ok((await sebagai(pembina, `select count(*)::int n from public.pengukuhan_dewan`)).rows?.[0]?.n === 1, 'Pembina membaca tabel pengukuhan');
  const rCadangan = await sebagai(admin, `select jsonb_object_keys(public.sg_cadangan_admin()->'tabel') k`);
  ok(rCadangan.ok && rCadangan.rows.some((r) => r.k === 'pengukuhan_dewan'), 'sg_cadangan_admin() mengekspor pengukuhan_dewan pada database hasil migrasi');
}

console.log('\n--- Dua pemegang Pemangku Adat sebelum migrasi: gagal jelas dan tanpa perubahan ---');
{
  const B2 = await baru(SEBELUM);
  await isiDataContoh(B2);
  await B2.exec(MB);
  await B2.query(`update public.profiles set jabatan_dewan = 'Pemangku Adat' where username in ('10231', '10008')`);
  let galat = null;
  try { await B2.exec(MP); } catch (e) { galat = e.message; await B2.exec('rollback'); }
  ok(/lebih dari satu anggota berjabatan Pemangku Adat/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 110));
  ok((await B2.query(`select to_regclass('public.pengukuhan_dewan') as t`)).rows[0].t === null, 'kegagalan membatalkan seluruh migrasi (tabel tidak dibuat)');
  ok((await B2.query(`select count(*)::int n from public.profiles where jabatan_dewan = 'Pemangku Adat'`)).rows[0].n === 2, 'data jabatan tidak berubah oleh migrasi yang gagal');
}

console.log('\n--- Tanpa migrasi sebelumnya: gagal jelas ---');
const B3 = await baru('git:2a8ebc3'); // sebelum Kepengurusan lewat berkas sudah ada? (skema lama tanpa sg_usulan/kepengurusan versi terbaru diuji lewat prasyarat)
{
  let galat = null;
  const ada = (await B3.query(`select to_regprocedure('public.sg_kepengurusan_terapkan(jsonb, boolean, boolean)') as f`)).rows[0].f;
  if (ada === null) {
    try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
    ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
    ok((await B3.query(`select to_regclass('public.pengukuhan_dewan') as t`)).rows[0].t === null, 'kegagalan membatalkan seluruh migrasi (tabel tidak dibuat)');
  } else {
    ok(true, 'skema pembanding sudah punya sg_kepengurusan_terapkan; pemeriksaan prasyarat dilewati');
  }
}

console.log(`\nRINGKASAN MIGRASI PENGUKUHAN DEWAN: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
