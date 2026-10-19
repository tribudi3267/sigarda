// Menyusun supabase/migrasi/2026-10-pin-tanpa-sesi.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-10-pin-tanpa-sesi.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

const fungsi = gantiFungsi(ambil('-- ===== Verifikasi PIN tanpa sesi Auth: aksi =====', '-- ===== akhir verifikasi PIN tanpa sesi =====', true));

const kepala = `-- ============================================================================
-- MIGRASI: verifikasi PIN tanpa membuat sesi login baru. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-10-sesi-mendatang.sql; lihat README). Isi:
--   * Fungsi BARU sg_pin_periksa_internal(p_id uuid, p_pin text), hanya untuk service_role (Edge Function sigarda): mencocokkan PIN
--     dengan hash bcrypt akun itu sendiri (auth.users.encrypted_password, lewat extensions.crypt) untuk ganti PIN dan PIN penguji saat
--     mencatat hasil uji. Sebelumnya tiap verifikasi masuk ulang ke Supabase Auth, sehingga membuat sesi dan refresh token baru dan
--     terkena batas laju Auth per IP. Kekuatan hash TIDAK berubah dan PIN tidak perlu diganti. Percobaan salah tetap dihitung
--     (5 kali salah = terkunci 5 menit, tabel login_gagal yang sama dengan masuk).
-- TIDAK mengubah tabel maupun data. Aman diulang.
-- PERLU deploy ulang Edge Function sigarda (supabase/functions/sigarda/index.ts) agar fungsi ini dipakai. Urutan bebas: Edge Function
-- baru tanpa migrasi ini kembali ke cara lama, dan migrasi ini tanpa Edge Function baru tidak dipakai siapa pun.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regprocedure('public.sg_kunci_gagal_internal(text)') is null or to_regclass('public.login_gagal') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-10-sesi-mendatang.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

${fungsi}

revoke all on function public.sg_pin_periksa_internal(uuid, text) from public, anon, authenticated;
grant execute on function public.sg_pin_periksa_internal(uuid, text) to service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-10-pin-tanpa-sesi', kepala);
