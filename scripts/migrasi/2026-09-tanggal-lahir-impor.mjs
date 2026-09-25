// Menyusun supabase/migrasi/2026-09-tanggal-lahir-impor.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-tanggal-lahir-impor.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

const aksi = gantiFungsi(ambil('-- ===== Tanggal lahir impor (Tahap 2, G4b): aksi =====', '-- ===== akhir aksi tanggal lahir impor =====', true));

const kepala = `-- ============================================================================
-- MIGRASI: Tahap 2 (G4b) -- impor tanggal lahir Penegak dari template Excel. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-gerbang.sql; lihat README). Isi:
--   * Fungsi baru (Pembina dan Admin Gudep): sg_tanggal_lahir_impor (banyak Penegak sekaligus dari kolom "Tanggal Lahir" template import; semua atau tidak sama sekali).
-- TIDAK mengubah tabel maupun data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.tanggal_lahir') is null or to_regprocedure('public.sg_tanggal_lahir_atur(uuid, date)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-gerbang.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

${aksi}

revoke all on function public.sg_tanggal_lahir_impor(jsonb) from public, anon, authenticated;
grant execute on function public.sg_tanggal_lahir_impor(jsonb) to authenticated;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-tanggal-lahir-impor', kepala);
