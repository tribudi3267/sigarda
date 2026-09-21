// Menyusun supabase/migrasi/2026-09-jenis-kelamin.sql dari bagian di supabase/sumber/inti.sql (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-jenis-kelamin.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

const fungsi = gantiFungsi(ambil('-- ===== Jenis kelamin: fungsi =====', '-- ===== akhir fungsi jenis kelamin =====', true));

const kepala = `-- ============================================================================
-- MIGRASI: Jenis kelamin anggota. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi notifikasi (atau migrasi terakhir yang sudah Anda jalankan). Isi:
--   * profiles.jenis_kelamin: 'L' (laki-laki) atau 'P' (perempuan) untuk semua peran (Penegak, Dewan Ambalan, Pembina, Admin). Boleh kosong: anggota yang
--     sudah ada tetap kosong sampai dilengkapi Admin (formulir Ubah anggota, atau tombol "Lengkapi jenis kelamin" di menu Anggota).
--   * sg_anggota_jk_atur: Admin Gudep mengatur jenis kelamin banyak anggota sekaligus (semua atau tidak sama sekali). Dipakai formulir Tambah/Ubah anggota
--     dan import Excel (diisi sesudah akun dibuat).
--   Tanda tangan fungsi yang dipanggil Edge Function tidak berubah: Edge Function TIDAK perlu di-deploy ulang.
-- TIDAK menghapus data yang ada. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: skema dasar dengan tabel profiles dan fungsi sigarda.wajib_admin (migrasi penugasan).
do $$
begin
  if to_regclass('public.profiles') is null or to_regprocedure('sigarda.wajib_admin(text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-notifikasi.sql, lihat README), baru migrasi ini.';
  end if;
end $$;

alter table public.profiles add column if not exists jenis_kelamin text check (jenis_kelamin in ('L','P'));

`;
const akhir = `

revoke all on function public.sg_anggota_jk_atur(jsonb) from public, anon, authenticated;
grant execute on function public.sg_anggota_jk_atur(jsonb) to authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-jenis-kelamin', kepala + fungsi + akhir);
