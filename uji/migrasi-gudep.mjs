// Migrasi data gudep (identitas gudep dan pejabat yang diatur Admin): kesetaraan dengan skema baru, data utuh, idempoten, dan perilaku pada data lama.
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
const M = ['sidang-dk', 'sidang-format-nomor', 'raport', 'instrumen', 'verifikasi-sesi', 'nta-anggota', 'butir-agama-pembina', 'indeks-kode-verifikasi', 'iuran', 'penugasan', 'penegakan', 'dokumen', 'data-gudep'].map((n) => bersih(readFileSync(`${P}/supabase/migrasi/2026-09-${n}.sql`, 'utf8')));
const MP = M[12]; // hanya migrasi data gudep yang diuji di sini

// Skema "sebelum migrasi" diambil dari riwayat git: 'git:<commit>' = supabase/skema.sql pada commit itu (commit TEPAT sebelum migrasi data gudep).
const skemaDari = (ref) => (ref.startsWith('git:') ? execFileSync('git', ['show', `${ref.slice(4)}:supabase/skema.sql`], { cwd: P, encoding: 'utf8', maxBuffer: 1 << 26 }) : readFileSync(ref, 'utf8'));
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

// Skema "sesudah dokumen" = skema.sql terbaru (dibuat dari inti.sql).
const A = await baru(`${P}/supabase/skema.sql`);
const pa = await potret(A);
ok(pa.fungsi.some((x) => x.proname === 'sg_gudep_simpan') && pa.fungsi.some((x) => x.proname === 'sg_gudep_publik'), 'skema baru memuat sg_gudep_simpan dan sg_gudep_publik');

const SEBELUM = 'git:709a260'; // commit TEPAT sebelum migrasi data gudep (sudah memuat dokumen)

console.log('--- Jalur 1: database Anda sekarang (sampai dokumen), berisi data ---');
const B1 = await baru(SEBELUM);
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const sebelum = await cacah(B1);
const banyakFungsiLama = (await B1.query(`select count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace and proname like 'sg\_%'`)).rows[0].n;
ok((await B1.query(`select count(*)::int n from pg_proc where proname in ('sg_gudep_simpan', 'sg_gudep_publik')`)).rows[0].n === 0, 'prasyarat: skema lama belum punya fungsi data gudep');
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
ok((await B1.query(`select count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace and proname like 'sg\_%'`)).rows[0].n === banyakFungsiLama + 2, 'dua fungsi baru ditambahkan (sg_gudep_simpan, sg_gudep_publik)');
await B1.exec(MP); await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'menjalankan migrasi tiga kali: data tetap sama');
bandingkan('jalur 1', pa, await potret(B1));

console.log('\n--- Sesudah migrasi: perilaku pada data lama ---');
{
  const id = async (sql, a = []) => (await B1.query(sql, a)).rows[0].id;
  const pembina = await id(`select id from public.profiles where role = 'penguji' and jabatan = 'Pembina'`);
  const admin = await id(`select id from public.profiles where role = 'admin'`);
  const sebagai = async (uid, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(B1, uid, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
  const data = JSON.stringify({ nama: 'Gugus Depan Uji', singkat: 'Ambalan Uji', sekolah: 'SMA Uji', kota: 'Uji', pembina: { jabatan: 'Pembina Gudep', nama: 'Bu Uji', nta: '11.03.00.000.00001' }, kamabigus: { jabatan: 'Kepala Sekolah', nama: 'Pak Kepala' } });
  let r = await sebagai(pembina, `select public.sg_gudep_simpan($1::jsonb)`, [data]);
  ok(!r.ok && /Hanya Admin/.test(r.pesan), 'Pembina tidak dapat mengubah data gudep');
  r = await sebagai(admin, `select public.sg_gudep_simpan($1::jsonb)`, [data]);
  ok(r.ok, 'Admin menyimpan data gudep');
  r = await sebagai(null, `select public.sg_gudep_publik() d`);
  ok(r.ok && Object.keys(r.rows[0].d).sort().join() === 'kota,nama,sekolah,singkat' && r.rows[0].d.nama === 'Gugus Depan Uji', 'tanpa login: hanya identitas publik (nama gudep, ambalan, sekolah, kota)');
  r = await sebagai(pembina, `select nilai from public.pengaturan where kunci = 'gudep.data'`);
  ok(r.ok && r.rows[0].nilai.pembina.nta === '11.03.00.000.00001' && r.rows[0].nilai.kamabigus.nama === 'Pak Kepala', 'pengguna yang sudah masuk membaca data lengkap dari pengaturan');
  r = await sebagai(admin, `select public.sg_gudep_simpan('{"nama":"X"}'::jsonb)`);
  ok(!r.ok && /wajib/.test(r.pesan), 'isian wajib diperiksa server: ' + (r.pesan ?? '').slice(0, 60));
}

console.log('\n--- Jalur 2: database sebelum Sidang, semua migrasi berurutan ---');
const B2 = await baru('git:be46788');
await isiDataContoh(B2);
const s2 = await cacah(B2);
for (const m of M) await B2.exec(m);
ok(JSON.stringify(await cacah(B2)) === JSON.stringify(s2), 'data tidak berubah oleh semua migrasi');
bandingkan('jalur 2', pa, await potret(B2));

console.log('\n--- Jalur 3: tanpa migrasi dokumen: gagal jelas ---');
const B3 = await baru('git:428ec5a');
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));

console.log(`\nRINGKASAN MIGRASI DATA GUDEP: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
