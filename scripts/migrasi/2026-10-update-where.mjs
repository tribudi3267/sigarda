// Menyusun supabase/migrasi/2026-10-update-where.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-10-update-where.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

// Fungsi terbit ulang (tanpa pemicu, yang memanggil sigarda.terbit_ulang_tandai menurut nama) dan fungsi keep-alive.
const terbitUlang = gantiFungsi(ambil('-- ===== Terbit ulang situs saat berita terbit: fungsi =====', 'create trigger terbit_ulang_berita'));
const terbitUlangStatus = gantiFungsi(ambil('-- Untuk Pembina dan Admin Gudep (layar Kelola Beranda > Berita)', '-- ===== akhir fungsi terbit ulang ====='));
const keepalive = gantiFungsi(ambil('-- ===== Keep-alive Supabase (dari dalam database): fungsi =====', '-- ===== akhir fungsi keepalive ====='));

const kepala = `-- ============================================================================
-- MIGRASI: perbaikan "UPDATE requires a WHERE clause" saat menerbitkan berita. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-bersih-riwayat-cron.sql; lihat README). Isi:
--   * Penyebab: Supabase memakai pengaman yang menolak UPDATE tanpa WHERE. Pemicu terbit ulang (sigarda.terbit_ulang_tandai) dan fungsi pendampingnya
--     mengubah tabel konfigurasi satu-baris tanpa WHERE, sehingga menerbitkan/mengubah berita gagal dan berita tidak tampil di beranda.
--   * Semua UPDATE pada terbit_ulang_konfigurasi dan keepalive_konfigurasi diberi "where true" (fungsi ditulis ulang, tanda tangan sama).
-- TIDAK mengubah tabel maupun data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regprocedure('sigarda.terbit_ulang_tandai()') is null or to_regprocedure('sigarda.keepalive_ping()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-bersih-riwayat-cron.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

${terbitUlang}

${terbitUlangStatus}

${keepalive}

-- Fungsi sigarda.* diperbarui: hak dijalankan ulang di sini.
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-10-update-where', kepala);
