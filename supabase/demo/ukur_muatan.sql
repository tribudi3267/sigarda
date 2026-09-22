-- ============================================================================
-- UKUR MUATAN (HANYA MEMBACA, tahap L2-A): ukuran data sungguhan di database produksi, untuk membandingkan dengan
-- model di `npm run profil`. Tidak mengubah apa pun; aman dijalankan kapan saja dan berulang.
--
-- CARA PAKAI (PENTING): SQL Editor Supabase hanya menampilkan hasil dari PERNYATAAN TERAKHIR bila banyak query
-- ditempel dan dijalankan sekaligus. Karena itu:
--   1. Tempel dan Run SELURUH berkas ini dulu -> yang tampil adalah bagian "RINGKASAN" (ukuran tabel, ukuran
--      database, byte JSON) di bagian PALING BAWAH berkas ini.
--   2. Untuk melihat rencana kueri (EXPLAIN, bagian "SATU PER SATU" di bawah), SOROT (select/highlight) salah satu
--      blok EXPLAIN dengan mouse, lalu tekan Ctrl+Enter (atau klik Run) hanya untuk blok yang disorot itu. Ulangi
--      satu per satu untuk tiap blok EXPLAIN yang ingin dilihat.
--
-- Catatan: berjalan sebagai pemilik proyek (melewati RLS "hanya baca" yang berlaku untuk Penegak/Pembina), jadi angka
-- di sini adalah UKURAN PENUH tiap tabel. Byte JSON dihitung dari isi baris sungguhan (row_to_json), sama seperti yang
-- dikirim PostgREST ke aplikasi, TANPA kompresi gzip (Supabase mengompresi respons di jalan; ukur laju kompresi nyata
-- lewat DevTools Network, kolom "Transferred" dibanding "Size", bukan dari sini — atau scripts/profil/ukur-devtools.js).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- SATU PER SATU (sorot salah satu blok "explain (...) select ..." di bawah lalu Ctrl+Enter):
-- rencana kueri sungguhan untuk memuat progres/riwayat SATU Penegak (mendekati apa yang dialami RLS Penegak sendiri;
-- "Bitmap Index Scan"/"Index Scan" = memakai indeks (baik), "Seq Scan" pada tabel besar = tidak ideal) dan SEMUA
-- Penegak aktif (jalur Pembina/Admin/Dewan saat masuk).
-- ---------------------------------------------------------------------------
explain (analyze, buffers, format text)
select * from public.sku_progress where peserta_id = (select id from public.profiles where role = 'peserta' and status = 'aktif' order by id limit 1);

explain (analyze, buffers, format text)
select * from public.sku_riwayat where peserta_id = (select id from public.profiles where role = 'peserta' and status = 'aktif' order by id limit 1);

explain (analyze, buffers, format text)
select * from public.sku_progress;

explain (analyze, buffers, format text)
select * from public.sku_riwayat;

-- ---------------------------------------------------------------------------
-- RINGKASAN (tampil otomatis bila SELURUH berkas dijalankan sekaligus, karena ini pernyataan PALING TERAKHIR).
-- ---------------------------------------------------------------------------
select urut, bagian, keterangan from (
  -- 1) Ukuran tiap tabel yang dimuat aplikasi (disk, termasuk indeks) dan jumlah baris.
  select 1 as urut, 'Ukuran tabel' as bagian,
         t.relname || ' | ' || pg_size_pretty(pg_total_relation_size(t.oid)) || ' total (' || pg_size_pretty(pg_relation_size(t.oid)) || ' data) | ' ||
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t.relname), false, true, '')))[1]::text || ' baris' as keterangan
  from pg_class t join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public' and t.relkind = 'r'
    and t.relname in ('profiles','sku_progress','sku_riwayat','absensi_hadir','absensi_sesi','iuran','iuran_kas','portofolio','portofolio_jurnal','notifikasi','dokumen_terbit','sidang_dk')

  union all
  -- 2) Ukuran database keseluruhan (dibanding batas 500 MB paket gratis).
  select 2, 'Ukuran database', pg_size_pretty(pg_database_size(current_database())) || ' dari 500 MB (paket gratis)'

  union all
  -- 3) Byte JSON per baris (rata-rata dan total) untuk tabel yang paling besar saat dimuat penuh (progres, riwayat, kehadiran):
  --    beginilah kira-kira ukuran jawaban PostgREST SEBELUM kompresi. Dibatasi ke Penegak berstatus aktif (yang biasanya dimuat).
  select 3, 'Byte JSON: sku_progress',
         'rata-rata ' || round(avg(octet_length(row_to_json(p)::text))) || ' B/baris | total ' || pg_size_pretty(sum(octet_length(row_to_json(p)::text))::bigint) ||
         ' (' || count(*) || ' baris Penegak aktif)'
  from public.sku_progress p join public.profiles u on u.id = p.peserta_id where u.status = 'aktif'

  union all
  select 3, 'Byte JSON: sku_riwayat',
         'rata-rata ' || round(avg(octet_length(row_to_json(r)::text))) || ' B/baris | total ' || pg_size_pretty(sum(octet_length(row_to_json(r)::text))::bigint) ||
         ' (' || count(*) || ' baris milik Penegak aktif)'
  from public.sku_riwayat r join public.profiles u on u.id = r.peserta_id where u.status = 'aktif'

  union all
  select 3, 'Byte JSON: absensi_hadir (semester berjalan)',
         'rata-rata ' || round(avg(octet_length(row_to_json(h)::text))) || ' B/baris | total ' || pg_size_pretty(sum(octet_length(row_to_json(h)::text))::bigint) ||
         ' (' || count(*) || ' baris)'
  from public.absensi_hadir h join public.absensi_sesi s on s.tanggal = h.tanggal
  where s.tanggal >= (case when extract(month from sigarda.hari_ini()) >= 7 then date_trunc('year', sigarda.hari_ini()) + interval '6 month' else date_trunc('year', sigarda.hari_ini()) - interval '6 month' end)::date

  union all
  select 3, 'Byte JSON: profiles (semua)',
         'rata-rata ' || round(avg(octet_length(row_to_json(p)::text))) || ' B/baris | total ' || pg_size_pretty(sum(octet_length(row_to_json(p)::text))::bigint) || ' (' || count(*) || ' baris)'
  from public.profiles p

  union all
  -- 4) Perkiraan muat awal SATU Penegak (progres + riwayat miliknya sendiri, seperti yang dibaca RLS).
  select 4, 'Muat awal per Penegak (contoh)',
         'progres+riwayat ' || pg_size_pretty(coalesce(x.byte, 0)::bigint) || ' untuk satu Penegak aktif contoh'
  from (
    select (select sum(octet_length(row_to_json(p)::text)) from public.sku_progress p where p.peserta_id = u.id)
         + (select sum(octet_length(row_to_json(r)::text)) from public.sku_riwayat r where r.peserta_id = u.id) as byte
    from public.profiles u where u.role = 'peserta' and u.status = 'aktif'
    order by u.id limit 1
  ) x

  union all
  -- 7) Jumlah baris per peran (untuk membandingkan dengan data model `npm run profil`).
  select 7, 'Jumlah anggota', 'aktif: ' || count(*) filter (where status = 'aktif' and role = 'peserta')
    || ' | nonaktif: ' || count(*) filter (where status = 'nonaktif')
    || ' | alumni: ' || count(*) filter (where status = 'alumni')
    || ' | pengurus (Pembina/Admin/Dewan lama): ' || count(*) filter (where role in ('penguji','admin'))
    || ' | Penegak berjabatan Dewan: ' || count(*) filter (where jabatan_dewan is not null)
  from public.profiles
) t
order by urut, keterangan;
