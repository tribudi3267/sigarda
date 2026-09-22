-- ============================================================================
-- HAPUS DATA UJI BEBAN yang dibuat oleh supabase/demo/data_uji_beban.sql
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
--
-- Yang dihapus HANYA akun Penegak dengan NIS berpola 88xxxx (6 angka) DAN nama berawalan "Uji ". Seluruh data milik
-- akun itu ikut terhapus (progres SKU, riwayat) karena semuanya terhubung ke akun lewat auth.users (cascade).
-- Anggota asli TIDAK tersentuh (pola NIS dan nama harus cocok KEDUANYA). Jalankan ini SEBELUM uji coba pengguna
-- sungguhan (lihat rencana tahap L2).
-- ============================================================================
begin;

create temp table uji_hapus on commit drop as
  select id, username from public.profiles
  where role = 'peserta' and nis ~ '^88[0-9]{4}$' and nama like 'Uji %';

delete from public.login_gagal where username in (select username from uji_hapus);
delete from auth.users where id in (select id from uji_hapus);   -- profil dan seluruh progres/riwayatnya ikut terhapus (cascade)

commit;

select (select count(*) from public.profiles where nis ~ '^88[0-9]{4}$' and nama like 'Uji %') as "akun uji beban tersisa (harus 0)",
       (select count(*) from public.profiles where role = 'peserta') as "Penegak (semua, sesudah dihapus)";
