-- ============================================================================
-- ADMIN PERTAMA
--
-- Jalankan SETELAH skema.sql, dan SETELAH membuat akun login admin di dashboard:
--   Authentication > Users > Add user > Create new user
--     Email    : admin@sigarda.invalid          (harus PERSIS ini, kecuali Anda mengubah SIGARDA_EMAIL_DOMAIN)
--     Password : PIN 6 angka pilihan Anda       (bukan 123456 atau angka sama semua)
--     Centang  : Auto Confirm User
--   Bila dashboard menolak email berakhiran .invalid, lihat README bagian "Bila email .invalid ditolak".
--
-- Skrip ini hanya membuat profil untuk akun tersebut. Setelah itu masuk ke aplikasi dengan
--   nama pengguna: admin   dan PIN yang Anda buat. Aplikasi akan langsung meminta PIN baru.
-- Admin lain, Pembina, Dewan Ambalan, dan Penegak dibuat dari menu Anggota di aplikasi (bukan lewat SQL).
-- ============================================================================
insert into public.profiles (id, username, role, nama, jabatan)
select id, 'admin', 'admin', 'Admin Gudep', 'Admin Gudep'
from auth.users
where email = 'admin@sigarda.invalid'
on conflict (id) do nothing;

-- Harus menampilkan 1 baris. Bila kosong, akun admin@sigarda.invalid belum dibuat di Authentication > Users.
select id, username, role, wajib_ganti_pin from public.profiles where username = 'admin';
