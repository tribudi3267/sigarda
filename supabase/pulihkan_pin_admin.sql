-- ============================================================================
-- LUPA PIN ADMIN (pemulihan oleh pengelola proyek Supabase)
--
-- PIN Admin tidak dapat direset dari aplikasi oleh peran lain. Bila PIN admin lupa, pengelola proyek Supabase
-- dapat mengaturnya ulang dari SQL Editor. Ganti 482913 di bawah dengan PIN sementara 6 angka pilihan Anda,
-- lalu jalankan. Setelah masuk, aplikasi meminta PIN baru.
--
-- Untuk akun lain (Penegak, Dewan Ambalan, Pembina), gunakan menu Reset PIN di aplikasi.
-- ============================================================================
update auth.users
set encrypted_password = extensions.crypt('482913', extensions.gen_salt('bf')),
    updated_at = now()
where email = 'admin@sigarda.invalid';

update public.profiles set wajib_ganti_pin = true where username = 'admin';

-- Membuka kunci bila akun terkunci karena salah PIN berulang kali
delete from public.login_gagal where username = 'admin';
