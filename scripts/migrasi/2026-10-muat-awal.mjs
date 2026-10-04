// Menyusun supabase/migrasi/2026-10-muat-awal.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-10-muat-awal.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

const muatAwal = gantiFungsi(ambil('-- ===== Muat awal (hemat log, Fase 2): aksi =====', '-- ===== akhir muat awal ====='));

const kepala = `-- ============================================================================
-- MIGRASI: hemat log Supabase (Fase 2) -- satu panggilan "muat awal". AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-10-update-where.sql; lihat README). Isi:
--   * Fungsi baru sg_muat_awal() (hanya membaca; berjalan sebagai pemanggil sehingga RLS tetap berlaku): satu panggilan memberi data gudep, pengaturan iuran,
--     peran pendampingan, sakelar pra-uji, penunjukan asisten bendahara, dan 60 notifikasi terbaru. Menggantikan enam permintaan terpisah saat masuk dan
--     saat penyegaran (tiap permintaan API menjadi satu baris log; paket Free: 1 GB per siklus).
--   * Bagian yang bergantung pada fungsi lain (pengaturan iuran, pendampingan) berdiri sendiri: bila gagal (mis. PIN awal belum diganti) hasilnya null
--     untuk bagian itu saja, sama seperti permintaan terpisah sebelumnya.
-- Situs lama tetap berfungsi tanpa migrasi ini dan situs baru tetap berfungsi tanpa migrasi ini (kembali ke permintaan terpisah), jadi urutan jalan bebas;
-- hematnya baru terasa sesudah migrasi dijalankan. TIDAK mengubah tabel maupun data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regprocedure('public.sg_pendampingan_saya()') is null or to_regprocedure('public.sg_iuran_pengaturan()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-10-update-where.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

${muatAwal}

revoke all on function public.sg_muat_awal() from public, anon, authenticated;
grant execute on function public.sg_muat_awal() to authenticated;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-10-muat-awal', kepala);
