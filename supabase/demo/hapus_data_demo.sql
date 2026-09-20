-- ============================================================================
-- HAPUS DATA DEMO yang dibuat oleh supabase/demo/data_demo_penegak.sql
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
--
-- Yang dihapus HANYA akun Penegak dengan NIS 990001 sampai 990099 DAN nama berawalan "Demo ".
-- Seluruh data milik akun itu ikut terhapus (progres SKU, riwayat, kehadiran, portofolio, catatan sidang) karena
-- semuanya terhubung ke akun. Anggota asli tidak tersentuh.
-- Nomor berita acara sidang yang pernah terpakai oleh akun demo tidak dipakai ulang.
-- ============================================================================
begin;

create temp table demo_hapus on commit drop as
  select id, username from public.profiles
  where role = 'peserta' and nis ~ '^9900[0-9]{2}$' and nama like 'Demo %';

delete from public.login_gagal where username in (select username from demo_hapus);
delete from auth.users where id in (select id from demo_hapus);   -- profil dan seluruh datanya ikut terhapus (cascade)

commit;

select (select count(*) from public.profiles where nis ~ '^9900[0-9]{2}$' and nama like 'Demo %') as "akun demo tersisa",
       (select count(*) from public.profiles where role = 'peserta') as "Penegak (semua)";
