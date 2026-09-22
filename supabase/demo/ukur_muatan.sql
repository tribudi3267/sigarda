-- ============================================================================
-- UKUR MUATAN (HANYA MEMBACA, tahap L2-A): ukuran data sungguhan di database produksi, untuk membandingkan dengan
-- model di `npm run profil`. Tidak mengubah apa pun; aman dijalankan kapan saja dan berulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Catatan: berjalan sebagai pemilik proyek (melewati RLS "hanya baca" yang berlaku untuk Penegak/Pembina), jadi angka
-- di sini adalah UKURAN PENUH tiap tabel. Byte JSON dihitung dari isi baris sungguhan (row_to_json), sama seperti yang
-- dikirim PostgREST ke aplikasi, TANPA kompresi gzip (Supabase mengompresi respons di jalan; ukur laju kompresi nyata
-- lewat DevTools Network, kolom "Transferred" dibanding "Size", bukan dari sini).
-- ============================================================================

-- 1) Ukuran tiap tabel yang dimuat aplikasi (disk, termasuk indeks) dan jumlah baris.
select 1 as urut, 'Ukuran tabel' as bagian,
       t.relname || ' | ' || pg_size_pretty(pg_total_relation_size(t.oid)) || ' total (' || pg_size_pretty(pg_relation_size(t.oid)) || ' data) | ' ||
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t.relname), false, true, '')))[1]::text || ' baris' as keterangan
from pg_class t join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public' and t.relkind = 'r'
  and t.relname in ('profiles','sku_progress','sku_riwayat','absensi_hadir','absensi_sesi','iuran','iuran_kas','portofolio','portofolio_jurnal','notifikasi','dokumen_terbit','sidang_dk')
order by pg_total_relation_size(t.oid) desc;

-- 2) Ukuran database keseluruhan (dibanding batas 500 MB paket gratis).
select 2 as urut, 'Ukuran database' as bagian, pg_size_pretty(pg_database_size(current_database())) || ' dari 500 MB (paket gratis)' as keterangan;

-- 3) Byte JSON per baris (rata-rata dan total) untuk tabel yang paling besar saat dimuat penuh (progres, riwayat, kehadiran):
--    beginilah kira-kira ukuran jawaban PostgREST SEBELUM kompresi. Dibatasi ke Penegak berstatus aktif (yang biasanya dimuat).
select 3 as urut, 'Byte JSON: sku_progress' as bagian,
       'rata-rata ' || round(avg(octet_length(row_to_json(p)::text))) || ' B/baris | total ' || pg_size_pretty(sum(octet_length(row_to_json(p)::text))::bigint) ||
       ' (' || count(*) || ' baris Penegak aktif)' as keterangan
from public.sku_progress p join public.profiles u on u.id = p.peserta_id where u.status = 'aktif';

select 3 as urut, 'Byte JSON: sku_riwayat' as bagian,
       'rata-rata ' || round(avg(octet_length(row_to_json(r)::text))) || ' B/baris | total ' || pg_size_pretty(sum(octet_length(row_to_json(r)::text))::bigint) ||
       ' (' || count(*) || ' baris milik Penegak aktif)' as keterangan
from public.sku_riwayat r join public.profiles u on u.id = r.peserta_id where u.status = 'aktif';

select 3 as urut, 'Byte JSON: absensi_hadir (semester berjalan)' as bagian,
       'rata-rata ' || round(avg(octet_length(row_to_json(h)::text))) || ' B/baris | total ' || pg_size_pretty(sum(octet_length(row_to_json(h)::text))::bigint) ||
       ' (' || count(*) || ' baris)' as keterangan
from public.absensi_hadir h join public.absensi_sesi s on s.tanggal = h.tanggal
where s.tanggal >= (case when extract(month from sigarda.hari_ini()) >= 7 then date_trunc('year', sigarda.hari_ini()) + interval '6 month' else date_trunc('year', sigarda.hari_ini()) - interval '6 month' end)::date;

select 3 as urut, 'Byte JSON: profiles (semua)' as bagian,
       'rata-rata ' || round(avg(octet_length(row_to_json(p)::text))) || ' B/baris | total ' || pg_size_pretty(sum(octet_length(row_to_json(p)::text))::bigint) || ' (' || count(*) || ' baris)' as keterangan
from public.profiles p;

-- 4) Perkiraan muat awal SATU Penegak (progres + riwayat miliknya sendiri, seperti yang dibaca RLS).
select 4 as urut, 'Muat awal per Penegak (median)' as bagian,
       'progres+riwayat ' || pg_size_pretty(coalesce(x.byte, 0)::bigint) || ' untuk peserta_id contoh (lihat baris berikutnya untuk beberapa contoh)' as keterangan
from (
  select (select sum(octet_length(row_to_json(p)::text)) from public.sku_progress p where p.peserta_id = u.id)
       + (select sum(octet_length(row_to_json(r)::text)) from public.sku_riwayat r where r.peserta_id = u.id) as byte
  from public.profiles u where u.role = 'peserta' and u.status = 'aktif'
  order by u.id limit 1
) x;

-- 5) Waktu database (rencana kueri sungguhan) untuk memuat progres+riwayat milik SATU Penegak: mendekati apa yang
--    dialami RLS Penegak sendiri (indeks pada peserta_id diharapkan dipakai; "Seq Scan" pada tabel besar = tidak ideal).
explain (analyze, buffers, format text)
select * from public.sku_progress where peserta_id = (select id from public.profiles where role = 'peserta' and status = 'aktif' order by id limit 1);

explain (analyze, buffers, format text)
select * from public.sku_riwayat where peserta_id = (select id from public.profiles where role = 'peserta' and status = 'aktif' order by id limit 1);

-- 6) Waktu database untuk memuat SEMUA progres dan riwayat Penegak aktif (jalur Pembina/Admin/Dewan saat masuk).
explain (analyze, buffers, format text)
select * from public.sku_progress;

explain (analyze, buffers, format text)
select * from public.sku_riwayat;

-- 7) Jumlah baris per peran (untuk membandingkan dengan data model `npm run profil`).
select 7 as urut, 'Jumlah anggota' as bagian, 'aktif: ' || count(*) filter (where status = 'aktif' and role = 'peserta')
  || ' | nonaktif: ' || count(*) filter (where status = 'nonaktif')
  || ' | alumni: ' || count(*) filter (where status = 'alumni')
  || ' | pengurus (Pembina/Admin/Dewan lama): ' || count(*) filter (where role in ('penguji','admin'))
  || ' | Penegak berjabatan Dewan: ' || count(*) filter (where jabatan_dewan is not null) as keterangan
from public.profiles;
