// Menyusun supabase/migrasi/2026-09-periksa-dewan.sql dari bagian di supabase/sumber/inti.sql (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-periksa-dewan.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

const ringkasan = gantiFungsi(ambil('-- ===== Ringkasan perangkat notifikasi: fungsi', '-- ===== akhir ringkasan perangkat notifikasi =====', true));
const pemeriksaan = gantiFungsi(ambil('-- ===== Pemeriksaan data (tahap L3): fungsi =====', '-- ===== akhir fungsi pemeriksaan data =====', true));

const kepala = `-- ============================================================================
-- MIGRASI: Dewan Ambalan ikut memeriksa data. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi berkas-garuda (dan yang sebelumnya). Isi:
--   * sg_pemeriksaan_data() dan sg_push_ringkasan(): semula hanya Pembina dan Admin Gudep; kini seluruh PENGURUS
--     (Pembina, Dewan Ambalan, Admin) boleh memanggilnya, agar Dewan Ambalan ikut membantu memeriksa data dan mengingatkan
--     anggota lewat WhatsApp. Hanya isi fungsi yang berubah (tanda tangan sama); tidak ada tabel atau kolom baru.
--   * Pembatasan siapa yang boleh dihubungi (Dewan: Penegak dan sesama Dewan; Pembina dan Admin: Penegak, Dewan, dan Pembina)
--     ada di klien (src/lib/eskalasiLogic.js: bolehDihubungi); data yang dibaca Dewan tidak lebih banyak dari yang sudah
--     dapat dibacanya lewat daftar anggota.
-- Edge Function TIDAK berubah dan tidak perlu di-deploy ulang. TIDAK menghapus data yang ada. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: pemeriksaan data (migrasi pemeriksaan-data) dan ringkasan perangkat (migrasi notifikasi), serta berkas-garuda (terakhir sebelum ini).
do $$
begin
  if to_regprocedure('public.sg_pemeriksaan_data()') is null or to_regprocedure('public.sg_push_ringkasan()') is null
     or to_regprocedure('public.sg_garuda_token_baca(text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-berkas-garuda.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

`;
const akhir = `

revoke all on function public.sg_push_ringkasan(), public.sg_pemeriksaan_data() from public, anon, authenticated;
grant execute on function public.sg_push_ringkasan(), public.sg_pemeriksaan_data() to authenticated;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-periksa-dewan', kepala + ringkasan + '\n\n' + pemeriksaan + akhir);
