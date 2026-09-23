// Migrasi jabatan Dewan Ambalan dan QR Berita Acara Sidang: kesetaraan dengan skema baru, data utuh, idempoten, dan perilaku pada data lama.
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
const M = ['sidang-dk', 'sidang-format-nomor', 'raport', 'instrumen', 'verifikasi-sesi', 'nta-anggota', 'butir-agama-pembina', 'indeks-kode-verifikasi', 'iuran', 'penugasan', 'penegakan', 'dokumen', 'data-gudep', 'jabatan-dewan'].map((n) => bersih(readFileSync(`${P}/supabase/migrasi/2026-09-${n}.sql`, 'utf8')));
const MP = M[13]; // hanya migrasi jabatan Dewan yang diuji di sini

// Skema "sebelum migrasi" diambil dari riwayat git: 'git:<commit>' = supabase/skema.sql pada commit itu (commit TEPAT sebelum migrasi jabatan Dewan).
const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.sku_riwayat)::int r, (select count(*) from auth.users)::int u`)).rows[0];
const TABEL = `('pengaturan','sidang_dk','sidang_urut','profiles','raport','instrumen','instrumen_kriteria','instrumen_penguji','instrumen_panduan','sku_penilaian','sku_progress','sku_riwayat','sertifikat_tingkat','sesi_ujian','sesi_ujian_butir','sesi_ujian_peserta','iuran','iuran_log','iuran_kas','asisten_iuran','penugasan_rombel','penugasan_log','guru_agama','dokumen_terbit','dokumen_urut')`;
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    kolom: await q(`select table_name, column_name, data_type, is_nullable, column_default, is_identity from information_schema.columns where table_schema = 'public' and table_name in ${TABEL} order by table_name, column_name`),
    batasan: await q(`select conrelid::regclass::text tabel, conname, pg_get_constraintdef(oid) def from pg_constraint where connamespace = 'public'::regnamespace and conrelid::regclass::text in ${TABEL} order by 1, 2`),
    indeks: await q(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in ${TABEL} order by 1, 2`),
    kebijakan: await q(`select tablename, policyname, cmd, roles::text, qual from pg_policies where schemaname = 'public' order by 1, 2`),
    rls: await q(`select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ${TABEL} order by 1`),
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','sigarda') and (p.proname like 'sg\\_%' or n.nspname = 'sigarda') order by 1, 2, 3`),
    hakTabel: await q(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name in ${TABEL} and grantee in ('anon','authenticated','service_role') order by 1, 2, 3`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema in ('public','sigarda') and grantee in ('anon','authenticated','service_role') and (routine_name like 'sg\\_%' or routine_schema = 'sigarda') order by 1, 2, 3, 4`),
  };
};
const bandingkan = (nama, pa, pb) => {
  for (const k of Object.keys(pa)) {
    const sama = JSON.stringify(pa[k]) === JSON.stringify(pb[k]);
    ok(sama, `${nama}: katalog setara (${k}): ${pa[k].length} entri`);
    if (!sama) {
      const sa = new Set(pa[k].map((x) => JSON.stringify(x))), sb = new Set(pb[k].map((x) => JSON.stringify(x)));
      console.log('   hanya di skema baru =', [...sa].filter((x) => !sb.has(x)).slice(0, 3), '| hanya di migrasi =', [...sb].filter((x) => !sa.has(x)).slice(0, 3));
    }
  }
};

// Skema "sesudah jabatan Dewan" = skema.sql pada commit sesudah migrasi ini (6676a4a); skema terbaru sudah memuat migrasi notifikasi.
const A = await baru('git:6676a4a');
const pa = await potret(A);
ok(pa.fungsi.some((x) => x.proname === 'sg_anggota_jabatan_dewan_atur') && pa.fungsi.some((x) => x.proname === 'sg_sidang_token'), 'skema baru memuat sg_anggota_jabatan_dewan_atur dan sg_sidang_token');

const SEBELUM = 'git:3817628'; // commit TEPAT sebelum migrasi jabatan Dewan (sudah memuat data gudep)

console.log('--- Jalur 1: database Anda sekarang (sampai data gudep), berisi data ---');
const B1 = await baru(SEBELUM);
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const sebelum = await cacah(B1);
const banyakFungsiLama = (await B1.query(`select count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace and proname like 'sg\_%'`)).rows[0].n;
ok((await B1.query(`select count(*)::int n from pg_proc where proname in ('sg_anggota_jabatan_dewan_atur', 'sg_sidang_token')`)).rows[0].n === 0, 'prasyarat: skema lama belum punya fungsi jabatan Dewan dan token sidang');
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
ok((await B1.query(`select count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace and proname like 'sg\_%'`)).rows[0].n === banyakFungsiLama + 2, 'dua fungsi baru ditambahkan (sg_anggota_jabatan_dewan_atur, sg_sidang_token)');
await B1.exec(MP); await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'menjalankan migrasi tiga kali: data tetap sama');
bandingkan('jalur 1', pa, await potret(B1));

console.log('\n--- Sesudah migrasi: perilaku pada data lama ---');
{
  const id = async (sql, a = []) => (await B1.query(sql, a)).rows[0].id;
  const pembina = await id(`select id from public.profiles where role = 'penguji' and jabatan = 'Pembina'`);
  const admin = await id(`select id from public.profiles where role = 'admin'`);
  const dewan = await id(`select id from public.profiles where role = 'penguji' and jabatan = 'Dewan Ambalan'`);
  const peserta = await id(`select id from public.profiles where role = 'peserta' order by username limit 1`);
  const sebagai = async (uid, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(B1, uid, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
  ok((await B1.query('select count(*)::int n from public.profiles where jabatan_dewan is not null')).rows[0].n === 0, 'sesudah migrasi: belum ada anggota berjabatan (kolom kosong)');
  let r = await sebagai(pembina, `select public.sg_anggota_jabatan_dewan_atur('[{"username":"dewan","jabatan":"Pradana"}]'::jsonb)`);
  ok(!r.ok && /Hanya Admin/.test(r.pesan), 'Pembina tidak dapat mengatur jabatan Dewan');
  r = await sebagai(admin, `select public.sg_anggota_jabatan_dewan_atur('[{"username":"dewan","jabatan":"Pradana"}]'::jsonb) n`);
  ok(r.ok && r.rows[0].n === 1, 'Admin mengangkat Pradana');
  r = await sebagai(admin, `select public.sg_anggota_jabatan_dewan_atur('[{"username":"pembina","jabatan":"Pradani"}]'::jsonb)`);
  ok(!r.ok && /bukan Dewan Ambalan/.test(r.pesan), 'jabatan Dewan hanya untuk anggota Dewan Ambalan');
  // ketua sidang dari Pradana
  const ada = (await B1.query(`select count(*)::int n from public.sku_unit`)).rows[0].n > 0;
  r = await sebagai(pembina, `select public.sg_sidang_simpan($1, 'Bantara', current_date, 'tunda', 'tidak', 'tidak', '', 'Belum lengkap', null, null) id`, [peserta]);
  ok(ada && r.ok, 'sidang dapat dicatat pada database hasil migrasi');
  const idSidang = r.rows[0].id;
  const catat = (await B1.query('select ketua_nama, ketua_sebutan, token, kode from public.sidang_dk where id = $1', [idSidang])).rows[0];
  ok(catat.ketua_sebutan === 'Pradana Dewan Ambalan' && catat.ketua_nama.length > 0 && catat.token === null, 'ketua sidang = anggota berjabatan Pradana; token belum dibuat');
  r = await sebagai(peserta, 'select public.sg_sidang_token($1)', [idSidang]);
  ok(!r.ok && /Hanya Dewan Ambalan, Pembina, atau Admin/.test(r.pesan), 'Penegak tidak dapat mencetak berita acara');
  r = await sebagai(dewan, 'select public.sg_sidang_token($1) d', [idSidang]);
  const token = r.rows?.[0]?.d?.token;
  ok(r.ok && /^[0-9a-f]{32}$/.test(token), 'Dewan Ambalan mendapat token berita acara');
  r = await sebagai(null, 'select public.sg_verifikasi_token($1) d', [token]);
  ok(r.ok && r.rows[0].d.ditemukan && r.rows[0].d.jenis_dokumen === 'berita_acara_sidang', 'tanpa login: token berita acara diverifikasi');
  r = await sebagai(null, 'select public.sg_verifikasi_kode($1) d', [r.rows[0].d.kode]);
  ok(r.ok && r.rows[0].d.ditemukan && r.rows[0].d.jenis_dokumen === 'berita_acara_sidang', 'tanpa login: kode VRF berita acara diverifikasi');
  // data gudep lama yang memuat pradana/pradani: disimpan ulang tanpa keduanya
  r = await sebagai(admin, `select public.sg_gudep_simpan('{"nama":"G","singkat":"A","sekolah":"S","kota":"K","pembina":{"jabatan":"P","nama":"Bu Uji"},"pradana":{"nama":"X"}}'::jsonb)`);
  const tersimpan = (await B1.query(`select nilai from public.pengaturan where kunci = 'gudep.data'`)).rows[0]?.nilai;
  ok(r.ok && tersimpan && !('pradana' in tersimpan) && tersimpan.pembina.nama === 'Bu Uji', 'sg_gudep_simpan: pradana diterima tetapi tidak disimpan');
}

console.log('\n--- Jalur 2: database sebelum Sidang, semua migrasi berurutan ---');
const B2 = await baru('git:be46788');
await isiDataContoh(B2);
const s2 = await cacah(B2);
for (const m of M) await B2.exec(m);
ok(JSON.stringify(await cacah(B2)) === JSON.stringify(s2), 'data tidak berubah oleh semua migrasi');
bandingkan('jalur 2', pa, await potret(B2));

console.log('\n--- Jalur 3: tanpa migrasi data gudep: gagal jelas ---');
const B3 = await baru('git:709a260');
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));

console.log('\n--- Jalur 4: migrasi data-gudep versi awal (tanpa sigarda.ketua_sidang) ---');
{
  const B4 = await baru(SEBELUM);
  await B4.exec(`drop function sigarda.ketua_sidang()`); // keadaan bila migrasi data-gudep yang dijalankan adalah versi awal
  let galat4 = null;
  try { await B4.exec(MP); } catch (e) { galat4 = e.message; await B4.exec('rollback'); }
  ok(galat4 === null, 'migrasi tetap berjalan (fungsi ketua sidang diterbitkan ulang olehnya): ' + (galat4 ?? 'ok').slice(0, 100));
  ok((await B4.query(`select to_regprocedure('sigarda.ketua_sidang()') is not null as ada`)).rows[0].ada, 'sigarda.ketua_sidang ada kembali');
  bandingkan('jalur 4', pa, await potret(B4));
  const B5 = await baru('git:709a260'); // tanpa data-gudep sama sekali: pesan menyebut yang belum ada
  let g5 = null;
  try { await B5.exec(MP); } catch (e) { g5 = e.message; await B5.exec('rollback'); }
  ok(/Yang belum ada: .*sg_gudep_simpan/.test(g5 ?? ''), 'galat prasyarat menyebut fungsi yang belum ada: ' + (g5 ?? 'TIDAK GAGAL').slice(-90));
}

console.log(`\nRINGKASAN MIGRASI JABATAN DEWAN: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
