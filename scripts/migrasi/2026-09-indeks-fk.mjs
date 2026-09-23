// Menyusun supabase/migrasi/2026-09-indeks-fk.sql dari bagian di supabase/sumber/inti.sql (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-indeks-fk.mjs
import { ambil, tulisMigrasi } from './bantu.mjs';

const indeks = ambil('-- ===== Indeks kunci asing pada tabel besar (tahap indeks-fk) =====', '-- ===== akhir indeks kunci asing =====', true);

const kepala = `-- ============================================================================
-- MIGRASI: Indeks kunci asing pada tabel besar. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi periksa-dewan (dan yang sebelumnya). Isi:
--   * 10 indeks pada kolom kunci asing (sku_progress.penguji_id, sku_riwayat.oleh, sku_penilaian.penguji_id, absensi_hadir.oleh, iuran.oleh,
--     iuran_log.oleh dan .peserta_id, naik_kelas_log.oleh, portofolio.catatan_penguji_oleh, portofolio_jurnal.oleh). Kolom-kolom ini merujuk
--     profiles dengan on delete set null, sehingga menghapus akun memindai seluruh tabel bila kolomnya tanpa indeks (saran Supabase Advisor).
--   * Hanya tabel yang besar atau akan besar; tabel log kecil dan kunci ke katalog (sku_id, butir_id, item_id) sengaja tidak diberi indeks.
-- Hanya menambah indeks (create index if not exists): tanpa perubahan data, tabel, atau fungsi. Edge Function TIDAK berubah.
-- Pada data sebesar sekarang tiap indeks selesai dalam hitungan detik. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
begin;

-- Prasyarat: tabel tempat indeks dipasang sudah ada (skema sampai naik kelas dan portofolio).
do $$
begin
  if to_regclass('public.naik_kelas_log') is null or to_regclass('public.portofolio_jurnal') is null or to_regclass('public.iuran_log') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-periksa-dewan.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

`;
const akhir = `

commit;
`;
tulisMigrasi('2026-09-indeks-fk', kepala + indeks + akhir);
