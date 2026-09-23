-- ============================================================================
-- MIGRASI: Indeks kunci asing pada tabel besar. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi periksa-dewan (dan yang sebelumnya). Isi:
--   * 10 indeks pada kolom kunci asing (sku_progress.penguji_id, sku_riwayat.oleh, sku_penilaian.penguji_id, absensi_hadir.oleh, iuran.oleh,
--     iuran_log.oleh dan .peserta_id, naik_kelas_log.oleh, portofolio.catatan_penguji_oleh, portofolio_jurnal.oleh). Kolom-kolom ini merujuk
--     profiles dengan on delete set null, sehingga menghapus akun memindai seluruh tabel bila kolomnya tanpa indeks (saran Supabase Advisor).
--   * Hanya tabel yang besar atau akan besar; tabel log kecil dan kunci ke katalog (sku_id, butir_id, item_id) sengaja tidak diberi indeks.
-- Hanya menambah indeks (create index if not exists): tanpa perubahan data, tabel, atau fungsi. Edge Function TIDAK berubah.
-- Pada data sebesar sekarang tiap indeks selesai dalam hitungan detik. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
begin;

-- Prasyarat: tabel tempat indeks dipasang sudah ada (skema sampai naik kelas dan portofolio).
do $$
begin
  if to_regclass('public.naik_kelas_log') is null or to_regclass('public.portofolio_jurnal') is null or to_regclass('public.iuran_log') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-periksa-dewan.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Indeks kunci asing pada tabel besar (tahap indeks-fk) =====
-- Semua kolom ini berkunci asing ke profiles dengan on delete set null: tiap akun yang dihapus memindai seluruh tabel bila kolomnya tanpa indeks
-- (ketahuan dari saran Supabase Advisor: menghapus 850 akun butuh 7 detik). Hanya tabel yang besar atau akan besar; tabel log kecil sengaja tidak diberi indeks.
-- Kolom kunci asing ke katalog (sku_id, butir_id, item_id) tidak perlu: baris katalog tidak pernah dihapus. Dipakai migrasi indeks-fk.
create index if not exists sku_progress_penguji_idx on public.sku_progress (penguji_id);
create index if not exists sku_riwayat_oleh_idx on public.sku_riwayat (oleh);
create index if not exists sku_penilaian_penguji_idx on public.sku_penilaian (penguji_id);
create index if not exists absensi_hadir_oleh_idx on public.absensi_hadir (oleh);
create index if not exists iuran_oleh_idx on public.iuran (oleh);
create index if not exists iuran_log_oleh_idx on public.iuran_log (oleh);
create index if not exists iuran_log_peserta_idx on public.iuran_log (peserta_id);
create index if not exists naik_kelas_log_oleh_idx on public.naik_kelas_log (oleh);
create index if not exists portofolio_catatan_oleh_idx on public.portofolio (catatan_penguji_oleh);
create index if not exists portofolio_jurnal_oleh_idx on public.portofolio_jurnal (oleh);
-- ===== akhir indeks kunci asing =====

commit;
