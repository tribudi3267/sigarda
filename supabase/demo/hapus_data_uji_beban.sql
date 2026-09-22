-- ============================================================================
-- HAPUS DATA UJI BEBAN yang dibuat oleh supabase/demo/data_uji_beban.sql
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
--
-- Yang dihapus HANYA akun Penegak dengan NIS berpola 88xxxx (6 angka) DAN nama berawalan "Uji ". Seluruh data milik
-- akun itu ikut terhapus (progres SKU, riwayat) karena semuanya terhubung ke akun lewat auth.users (cascade).
-- Anggota asli TIDAK tersentuh (pola NIS dan nama harus cocok KEDUANYA). Jalankan ini SEBELUM uji coba pengguna
-- sungguhan (lihat rencana tahap L2).
--
-- Juga membersihkan notifikasi "Pengajuan uji baru" yang NYASAR ke akun Pembina SUNGGUHAN (pemicu sigarda.notif_sku_progress
-- mengirimnya saat data uji dibuat, termasuk sebagai push sungguhan ke HP bila Pembina itu punya perangkat terdaftar):
-- notifikasi ini TIDAK ikut terhapus otomatis oleh cascade di atas karena penerimanya akun ASLI, bukan akun uji.
-- ============================================================================
begin;

create temp table uji_hapus on commit drop as
  select id, username from public.profiles
  where role = 'peserta' and nis ~ '^88[0-9]{4}$' and nama like 'Uji %';

-- Notifikasi "Uji ... mengajukan ..." yang nyasar ke akun asli (mis. Pembina): teks selalu diawali nama pelaku,
-- jadi pola ini tidak pernah cocok dengan notifikasi dari anggota sungguhan (nama mereka bukan "Uji ...").
delete from public.notifikasi where jenis = 'ajukan' and isi like 'Uji %';

delete from public.login_gagal where username in (select username from uji_hapus);
delete from auth.users where id in (select id from uji_hapus);   -- profil dan seluruh progres/riwayatnya ikut terhapus (cascade)

commit;

select (select count(*) from public.profiles where nis ~ '^88[0-9]{4}$' and nama like 'Uji %') as "akun uji beban tersisa (harus 0)",
       (select count(*) from public.notifikasi where jenis = 'ajukan' and isi like 'Uji %') as "notifikasi nyasar tersisa (harus 0)",
       (select count(*) from public.profiles where role = 'peserta') as "Penegak (semua, sesudah dihapus)";
