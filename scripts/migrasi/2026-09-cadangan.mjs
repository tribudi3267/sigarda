// Menyusun supabase/migrasi/2026-09-cadangan.sql dari bagian di supabase/sumber/inti.sql (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-cadangan.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

const pengingat = gantiFungsi(ambil('-- ===== Cadangan (tahap L4): pengingat =====', '-- ===== akhir pengingat cadangan =====', true));
const fungsi = gantiFungsi(ambil('-- ===== Cadangan (tahap L4): fungsi =====', '-- ===== akhir fungsi cadangan =====', true));

const kepala = `-- ============================================================================
-- MIGRASI: Cadangan data (tahap L4). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi pemeriksaan-data (dan yang sebelumnya). Isi:
--   * sg_cadangan_admin(): Admin Gudep mengunduh satu berkas JSON berisi tabel data aplikasi (TANPA akun login/hash PIN;
--     tabel rahasia/sementara seperti push_konfigurasi dan notifikasi juga tidak disertakan), dipanggil dari tombol
--     "Unduh cadangan" di menu Data Gudep. Mencatat waktunya di pengaturan 'cadangan.terakhir'.
--   * sg_cadangan_status(): status cadangan terakhir (kapan, siapa) tanpa mengambil seluruh data.
--   * sigarda.notif_pengingat() diperbarui: mengirim pengingat ke Admin bila cadangan sudah sebulan tidak diunduh
--     (atau belum pernah). Fungsi ini ditulis ulang penuh (create or replace), bagian lainnya (pengingat pengujian
--     besok, pengajuan lama, sesi ujian besok) tidak berubah.
-- Hanya menambah fungsi (tanpa tabel/kolom baru). Edge Function TIDAK berubah dan tidak perlu di-deploy ulang.
-- TIDAK menghapus data yang ada. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: pemeriksaan data (migrasi terakhir sebelum ini) sudah ada.
do $$
begin
  if to_regprocedure('public.sg_pemeriksaan_data()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-pemeriksaan-data.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

`;
const akhir = `

revoke all on function public.sg_cadangan_admin(), public.sg_cadangan_status() from public, anon, authenticated;
grant execute on function public.sg_cadangan_admin(), public.sg_cadangan_status() to authenticated;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-cadangan', kepala + pengingat + '\n\n' + fungsi + akhir);
