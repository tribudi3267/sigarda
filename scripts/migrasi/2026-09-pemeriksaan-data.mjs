// Menyusun supabase/migrasi/2026-09-pemeriksaan-data.sql dari bagian di supabase/sumber/inti.sql (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-pemeriksaan-data.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

const fungsi = gantiFungsi(ambil('-- ===== Pemeriksaan data (tahap L3): fungsi =====', '-- ===== akhir fungsi pemeriksaan data =====', true));

const kepala = `-- ============================================================================
-- MIGRASI: Pemeriksaan data (tahap L3). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi tes-notifikasi (dan yang sebelumnya). Isi:
--   * sg_pemeriksaan_data(): Pembina dan Admin Gudep melihat ringkasan masalah kualitas data yang umum (kelas belum
--     format rombel baku, NTA kosong, jenis kelamin kosong, rombel tanpa penugasan penguji, Pembina tanpa agama,
--     akun yang belum pernah masuk), dipakai halaman baru "Pemeriksaan Data".
-- Hanya menambah fungsi (tanpa tabel/kolom baru). Edge Function TIDAK berubah dan tidak perlu di-deploy ulang.
-- TIDAK menghapus data yang ada. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: notifikasi uji (migrasi terakhir sebelum ini) sudah ada.
do $$
begin
  if to_regprocedure('public.sg_notifikasi_tes()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-tes-notifikasi.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

`;
const akhir = `

revoke all on function public.sg_pemeriksaan_data() from public, anon, authenticated;
grant execute on function public.sg_pemeriksaan_data() to authenticated;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-pemeriksaan-data', kepala + fungsi + akhir);
