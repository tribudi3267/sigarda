// Menyusun supabase/migrasi/2026-09-cakupan-pra-uji.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-cakupan-pra-uji.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

const aksi = gantiFungsi(ambil('-- ===== Cakupan pra-uji (Tahap 2, G4e): aksi =====', '-- ===== akhir aksi cakupan pra-uji =====', true));

const kepala = `-- ============================================================================
-- MIGRASI: Tahap 2 (G4e) -- cakupan pra-uji (hasil simulasi pra-uji). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-pengingat-kalender.sql; lihat README). Isi:
--   * Fungsi baru sg_pra_uji_cakupan (Pembina dan Admin Gudep): banyaknya pengajuan baru yang melewati pra-uji dibanding yang langsung ke antrian Pembina karena tidak ada
--     penilai, per rombel, beserta jumlah Bina Damping rombel itu. Hanya membaca.
-- TIDAK mengubah tabel maupun data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.sku_pra_uji') is null or to_regprocedure('sigarda.garuda_kalender_pengingat()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-pengingat-kalender.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

${aksi}

revoke all on function public.sg_pra_uji_cakupan(integer) from public, anon, authenticated;
grant execute on function public.sg_pra_uji_cakupan(integer) to authenticated;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-cakupan-pra-uji', kepala);
