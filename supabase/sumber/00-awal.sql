-- ============================================================================
-- SIGARDA: skema database Supabase
--
-- Jalankan SELURUH berkas ini sekali di Supabase > SQL Editor (New query > tempel > Run).
--
-- PERINGATAN: berkas ini MENGHAPUS tabel SIGARDA yang sudah ada lalu membuatnya ulang.
-- Aman dipakai pada proyek yang masih kosong. Jangan dijalankan pada proyek yang sudah berisi
-- data sungguhan kecuali Anda memang ingin mengosongkannya.
--
-- Prinsip keamanan:
--   * Semua tabel memakai Row Level Security. Pengguna hanya BOLEH MEMBACA data sesuai perannya.
--   * TIDAK ADA pengguna yang boleh menulis langsung ke tabel. Semua perubahan lewat fungsi
--     sg_* (security definer) yang memeriksa peran dan menerapkan aturan SKU di server.
--   * Fungsi *_internal hanya bisa dipanggil oleh Edge Function (service_role).
-- ============================================================================

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 0. Bersihkan versi lama
-- ---------------------------------------------------------------------------
drop table if exists public.sku_pra_uji, public.pengukuhan_dewan, public.bina_damping, public.kepengurusan_log, public.penugasan_peserta, public.penugasan_log, public.penugasan_rombel, public.guru_agama,
  public.naik_kelas_log, public.naik_kelas_batch, public.notifikasi, public.push_langganan, public.push_konfigurasi, public.keepalive_konfigurasi,
  public.dokumen_terbit, public.dokumen_urut, public.iuran_kas, public.iuran_log, public.iuran, public.asisten_iuran,
  public.sesi_ujian_peserta, public.sesi_ujian_butir, public.sesi_ujian, public.sertifikat_tingkat, public.sku_penilaian, public.instrumen_panduan, public.instrumen_penguji, public.instrumen_kriteria, public.instrumen,
  public.raport, public.sidang_dk, public.sidang_urut, public.pengaturan,
  public.materi, public.portofolio_jurnal, public.portofolio,
  public.absensi_hadir, public.absensi_sesi, public.sku_riwayat, public.sku_progress,
  public.login_gagal, public.sku_unit, public.sku_butir, public.pf_item, public.profiles cascade;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f from pg_proc p
    where p.pronamespace = 'public'::regnamespace and (p.proname like 'sg\_%' or p.proname = 'peran')
  loop
    execute 'drop function if exists ' || r.f || ' cascade';
  end loop;
end $$;

drop schema if exists sigarda cascade;
create schema sigarda;
grant usage on schema sigarda to authenticated, service_role;

-- Tanggal hari ini menurut WIB (server Supabase memakai UTC; tanpa ini "hari ini" salah sebelum pukul 07.00 WIB)
create function sigarda.hari_ini() returns date language sql stable as
$$ select (now() at time zone 'Asia/Jakarta')::date $$;

