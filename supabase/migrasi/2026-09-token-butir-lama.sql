-- ============================================================================
-- MIGRASI: mengisi token QR dan kode verifikasi untuk butir SKU yang LULUS sebelum kolom verifikasi_token ada. AMAN untuk database berisi data.
--
-- Gejala: pada Kartu Kemajuan SKU, kolom "QR dan kode verifikasi" hanya menampilkan kode VRF-... tanpa gambar QR. Penyebab: QR dicetak hanya bila butir
-- punya token (sku_progress.verifikasi_token), dan token hanya dibuat saat butir dinyatakan lulus lewat alur sekarang. Butir yang sudah lulus SEBELUM
-- kolom itu ada (dan data demo yang dimuat dari skrip lama) tidak pernah mendapat token, sedangkan Surat Tanda Lulus punya tokennya sendiri (tabel
-- sertifikat_tingkat), sehingga QR di surat tetap muncul.
--
-- Isi:
--   * Setiap butir berstatus lulus yang belum bertoken diberi token acak baru (128 bit, satu per baris).
--   * Butir lulus yang belum punya kode verifikasi diberi kode dengan rumus yang sama dengan alur lulus (sigarda.kode_verifikasi), dan waktu verifikasinya
--     diisi dari waktu ubah terakhir bila kosong.
--   * Token dan kode yang SUDAH ada tidak diubah (QR yang sudah dicetak tetap sah). Status, nilai, tanggal uji, dan penguji tidak berubah.
--   * Pemicu penolak penulisan peserta nonaktif/alumni dimatikan hanya selama pengisian ini (butir alumni ikut diisi), lalu dinyalakan lagi dalam
--     transaksi yang sama. Pemicu notifikasi tidak terpengaruh: ia hanya bereaksi pada perubahan status atau penguji, sehingga tidak ada notifikasi baru.
-- Edge Function TIDAK berubah dan tidak perlu di-deploy ulang. Aman diulang (sesudah pertama kali tidak ada lagi baris yang perlu diisi).
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- ============================================================================
begin;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sku_progress' and column_name = 'verifikasi_token')
     or to_regprocedure('sigarda.token_acak()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-verifikasi-sesi.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

alter table public.sku_progress disable trigger tak_aktif_sku_progress;

update public.sku_progress
   set verifikasi = coalesce(verifikasi, sigarda.kode_verifikasi(array[peserta_id::text, sku_id, coalesce(penguji_id::text, ''), coalesce(tanggal_uji::text, '')])),
       diverifikasi_pada = coalesce(diverifikasi_pada, diubah),
       verifikasi_token = coalesce(verifikasi_token, sigarda.token_acak())
 where status = 'lulus' and (verifikasi_token is null or verifikasi is null or diverifikasi_pada is null);

alter table public.sku_progress enable trigger tak_aktif_sku_progress;

commit;
