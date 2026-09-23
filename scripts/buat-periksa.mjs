/**
 * Membuat supabase/demo/periksa_pemasangan.sql: skrip HANYA-BACA yang dijalankan pemilik di SQL Editor untuk memastikan database sudah memuat semua
 * migrasi (tabel, kolom, batasan, indeks, kebijakan akses, pemicu, dan fungsi yang sama persis dengan versi terbaru), plus pemeriksaan lingkungan
 * (pg_net, pg_cron, konfigurasi push). Daftar yang diharapkan DIAMBIL dari skema terbaru (skema.sql yang dijalankan di PGlite), jadi selalu sinkron;
 * uji/periksa-pemasangan.mjs menjaga berkas hasilnya tidak usang.
 *
 * Jalankan: npm run periksa   (ulangi setiap kali supabase/sumber/*.sql berubah, sesudah npm run skema)
 *
 * Yang tidak dapat diperiksa dari SQL: Edge Function (sigarda dan notif-push). Skrip mengingatkannya sebagai "PERIKSA MANUAL".
 * Isi fungsi dibandingkan lewat md5 setelah karakter CR dibuang (tempelan dari Windows dapat membawa CRLF).
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const bool = (b) => (b ? 'true' : 'false');

/** Potongan definisi yang harus ada pada batasan/kebijakan tertentu (perubahan makna yang tidak terlihat dari namanya saja). */
const POTONGAN = [
  ['batasan', 'profiles', 'profiles_jabatan_dewan_check', 'char_length'],
  ['batasan', 'profiles', 'profil_jabatan_dewan', 'peserta'],
  ['batasan', 'notifikasi', 'notifikasi_jenis_check', "'tes'"],
  ['kebijakan', 'profiles', 'baca_profil', 'jabatan_dewan'],
];

export async function susunPeriksa(akar) {
  const pg = new PGlite();
  const baca = (f) => readFileSync(path.join(akar, f), 'utf8').replace(/^﻿/, '');
  await pg.exec(baca('supabase/lokal/stub.sql'));
  await pg.exec(baca('supabase/skema.sql'));
  const q = async (sql) => (await pg.query(sql)).rows;

  const tabel = await q(`select c.oid, c.relname, c.relrowsecurity as rls, has_table_privilege('authenticated', c.oid, 'select') as sel
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 2`);
  const kolom = await q(`select table_name t, column_name k, data_type tipe from information_schema.columns where table_schema = 'public'
    and table_name in (select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r') order by 1, 2`);
  const batasan = await q(`select conrelid::regclass::text t, conname n, pg_get_constraintdef(oid) d from pg_constraint where connamespace = 'public'::regnamespace and conrelid <> 0 and contype <> 'n' order by 1, 2`); // NOT NULL (contype 'n') hanya tercatat di PostgreSQL 18 ke atas: dilewati agar tidak jadi temuan palsu di versi lain
  const indeks = await q(`select tablename t, indexname n from pg_indexes where schemaname = 'public' order by 1, 2`);
  const kebijakan = await q(`select tablename t, policyname n, qual from pg_policies where schemaname = 'public' order by 1, 2`);
  const pemicu = await q(`select tgrelid::regclass::text t, tgname n from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace) order by 1, 2`);
  const fungsi = await q(`select n.nspname s, p.proname n, pg_get_function_identity_arguments(p.oid) a, md5(replace(p.prosrc, chr(13), '')) m,
      has_function_privilege('authenticated', p.oid, 'execute') au, has_function_privilege('anon', p.oid, 'execute') an, has_function_privilege('service_role', p.oid, 'execute') sv
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sigarda') and p.prokind = 'f' order by 1, 2, 3`);

  const nama = (t) => t.replace(/^public\./, '');
  const nilai = (baris) => baris.map((b) => `    (${b.join(', ')})`).join(',\n');
  const potonganAda = (jenis, t, n) => POTONGAN.filter((p) => p[0] === jenis && p[1] === t && p[2] === n);
  for (const [jenis, t, n, pot] of POTONGAN) {
    const sumber = jenis === 'batasan' ? batasan.find((b) => nama(b.t) === t && b.n === n)?.d : kebijakan.find((b) => b.t === t && b.n === n)?.qual;
    if (!sumber || !sumber.includes(pot)) throw new Error(`POTONGAN tidak cocok dengan skema terbaru: ${jenis} ${t}.${n} tidak memuat ${pot}`);
  }

  const sql = `-- ============================================================================
-- PERIKSA PEMASANGAN SIGARDA (HANYA MEMBACA)
--
-- Memastikan database Supabase Anda sudah memuat semua migrasi: tabel, kolom, batasan, indeks, kebijakan akses (RLS), pemicu, dan fungsi (isinya dibandingkan
-- dengan versi terbaru), serta lingkungan notifikasi (pg_net, pg_cron, konfigurasi push). Tidak mengubah apa pun; aman dijalankan kapan saja dan berulang.
-- Dibuat otomatis oleh scripts/buat-periksa.mjs dari skema terbaru: jangan diubah tangan.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
--
-- Cara membaca hasil: baris "== RINGKASAN ==" (satu per kategori) lalu daftar yang BERMASALAH. Semua kategori berstatus OK = database mutakhir.
--   KURANG = objek belum ada (migrasi belum dijalankan); BEDA = ada tetapi isinya bukan versi terbaru (jalankan ulang migrasi yang menimpanya, urut sesuai README);
--   HAK BEDA / RLS BEDA = hak akses tidak sama. Sesudah menjalankan migrasi, jalankan skrip ini lagi sampai semuanya OK.
-- Edge Function (sigarda, notif-push) TIDAK dapat diperiksa dari SQL: lihat baris "PERIKSA MANUAL".
-- ============================================================================
with
h_tabel(nama, rls, sel) as (values
${nilai(tabel.map((t) => [lit(t.relname), bool(t.rls), bool(t.sel)]))}
),
h_kolom(tabel, kolom, tipe) as (values
${nilai(kolom.map((k) => [lit(k.t), lit(k.k), lit(k.tipe)]))}
),
h_batasan(tabel, nama, potongan) as (values
${nilai(batasan.map((b) => [lit(nama(b.t)), lit(b.n), potonganAda('batasan', nama(b.t), b.n)[0] ? lit(potonganAda('batasan', nama(b.t), b.n)[0][3]) : 'null::text']))}
),
h_indeks(tabel, nama) as (values
${nilai(indeks.map((i) => [lit(i.t), lit(i.n)]))}
),
h_kebijakan(tabel, nama, potongan) as (values
${nilai(kebijakan.map((k) => [lit(k.t), lit(k.n), potonganAda('kebijakan', k.t, k.n)[0] ? lit(potonganAda('kebijakan', k.t, k.n)[0][3]) : 'null::text']))}
),
h_pemicu(tabel, nama) as (values
${nilai(pemicu.map((p) => [lit(nama(p.t)), lit(p.n)]))}
),
h_fungsi(skema, nama, args, isi, au, an, sv) as (values
${nilai(fungsi.map((f) => [lit(f.s), lit(f.n), lit(f.a), lit(f.m), bool(f.au), bool(f.an), bool(f.sv)]))}
),
ada_fungsi as (
  select n.nspname as skema, p.proname as nama, pg_get_function_identity_arguments(p.oid) as args, md5(replace(p.prosrc, chr(13), '')) as isi,
         has_function_privilege('authenticated', p.oid, 'execute') as au, has_function_privilege('anon', p.oid, 'execute') as an, has_function_privilege('service_role', p.oid, 'execute') as sv
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sigarda') and p.prokind = 'f'
),
hasil(kategori, objek, status) as (
  select 'Tabel', t.nama,
         case when c.oid is null then 'KURANG'
              when c.relrowsecurity is distinct from t.rls then 'RLS BEDA'
              when has_table_privilege('authenticated', c.oid, 'select') is distinct from t.sel then 'HAK BEDA'
              else 'OK' end
  from h_tabel t left join pg_class c on c.relname = t.nama and c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  union all
  select 'Kolom', k.tabel || '.' || k.kolom,
         case when i.column_name is null then 'KURANG' when i.data_type <> k.tipe then 'BEDA (tipe ' || i.data_type || ')' else 'OK' end
  from h_kolom k left join information_schema.columns i on i.table_schema = 'public' and i.table_name = k.tabel and i.column_name = k.kolom
  union all
  select 'Batasan', b.tabel || '.' || b.nama,
         case when c.oid is null then 'KURANG'
              when b.potongan is not null and position(b.potongan in pg_get_constraintdef(c.oid)) = 0 then 'BEDA'
              else 'OK' end
  from h_batasan b left join pg_constraint c on c.conname = b.nama and c.conrelid = to_regclass('public.' || quote_ident(b.tabel))
  union all
  select 'Indeks', x.tabel || '.' || x.nama, case when i.indexname is null then 'KURANG' else 'OK' end
  from h_indeks x left join pg_indexes i on i.schemaname = 'public' and i.tablename = x.tabel and i.indexname = x.nama
  union all
  select 'Kebijakan akses', k.tabel || '.' || k.nama,
         case when p.policyname is null then 'KURANG'
              when k.potongan is not null and position(k.potongan in coalesce(p.qual, '')) = 0 then 'BEDA'
              else 'OK' end
  from h_kebijakan k left join pg_policies p on p.schemaname = 'public' and p.tablename = k.tabel and p.policyname = k.nama
  union all
  select 'Pemicu', m.tabel || '.' || m.nama, case when t.tgname is null then 'KURANG' else 'OK' end
  from h_pemicu m left join pg_trigger t on t.tgname = m.nama and t.tgrelid = to_regclass('public.' || quote_ident(m.tabel)) and not t.tgisinternal
  union all
  select 'Fungsi', f.skema || '.' || f.nama || '(' || f.args || ')',
         case when a.nama is null then 'KURANG'
              when a.isi <> f.isi then 'BEDA (isi bukan versi terbaru)'
              when a.au <> f.au or a.an <> f.an or a.sv <> f.sv then 'HAK BEDA'
              else 'OK' end
  from h_fungsi f left join ada_fungsi a on a.skema = f.skema and a.nama = f.nama and a.args = f.args
),
lingkungan(kategori, objek, status) as (
  select 'Lingkungan', 'Ekstensi pg_net (pengirim notifikasi ke HP)', case when exists (select 1 from pg_extension where extname = 'pg_net') then 'OK' else 'PERHATIAN (belum aktif: notifikasi tidak terkirim ke HP)' end
  union all
  select 'Lingkungan', 'Ekstensi pg_cron (pengingat harian 07.00 WIB)', case when exists (select 1 from pg_extension where extname = 'pg_cron') then 'OK' else 'PERHATIAN (belum aktif: pengingat harian tidak berjalan)' end
  union all
  select 'Lingkungan', 'Jadwal pengingat harian sigarda-pengingat',
         case when to_regclass('cron.job') is null then 'PERHATIAN (pg_cron belum aktif)'
              when (xpath('/row/n/text()', query_to_xml('select count(*) as n from cron.job where jobname = ''sigarda-pengingat''', false, true, '')))[1]::text::int > 0 then 'OK'
              else 'PERHATIAN (jadwal belum ada: jalankan ulang migrasi notifikasi)' end
  union all
  select 'Lingkungan', 'Konfigurasi push (select sigarda.push_atur(...))',
         case when to_regclass('public.push_konfigurasi') is null then 'KURANG (migrasi notifikasi belum dijalankan)'
              when (select count(*) from public.push_konfigurasi) > 0 then 'OK' else 'PERHATIAN (belum diisi: notifikasi ke HP tidak dikirim)' end
  union all
  select 'Edge Function', 'sigarda dan notif-push (tidak dapat diperiksa dari SQL)', 'PERIKSA MANUAL (Dashboard > Edge Functions: waktu deploy terakhir harus sesudah kode terbaru diterbitkan)'
)
select urut, kategori, objek, status
from (
  select 0 as urut, '== RINGKASAN ==' as kategori, h.kategori || ': ' || count(*) filter (where h.status = 'OK') || ' dari ' || count(*) || ' sesuai' as objek,
         case when count(*) filter (where h.status <> 'OK') = 0 then 'OK' else 'PERIKSA (' || count(*) filter (where h.status <> 'OK') || ' masalah)' end as status
  from hasil h group by h.kategori
  union all
  select 1, h.kategori, h.objek, h.status from hasil h where h.status <> 'OK'
  union all
  select 2, l.kategori, l.objek, l.status from lingkungan l
) t
order by urut, kategori, objek;
`;
  await pg.close();
  return sql;
}

const langsung = path.basename(process.argv[1] ?? '') === 'buat-periksa.mjs'; // bukan saat diimpor (mis. oleh pengujian)
if (langsung) {
  const akar = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const isi = await susunPeriksa(akar);
  writeFileSync(path.join(akar, 'supabase/demo/periksa_pemasangan.sql'), isi);
  console.log(`ditulis supabase/demo/periksa_pemasangan.sql (${isi.length} karakter)`);
}
