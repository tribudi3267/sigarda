// Menyusun supabase/migrasi/2026-10-penulis-berita.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-10-penulis-berita.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

// Tiga fungsi publik yang memuat berita ditulis ulang (tanda tangan sama): kolom baru 'penulis' (nama tampilan penulis).
const publik = gantiFungsi(ambil('create function public.sg_beranda_publik()', 'end $$;', true));
const arsip = gantiFungsi(ambil('-- ===== Kelola Beranda: arsip berita publik (Fase 4): aksi =====', '-- ===== akhir arsip berita publik =====', true));
const lagi = gantiFungsi(ambil('-- ===== Kelola Beranda: berita lebih lama (tombol "Muat berita lebih lama"): aksi =====', '-- ===== akhir berita lebih lama =====', true));

const kepala = `-- ============================================================================
-- MIGRASI: nama penulis pada berita yang terbit di beranda. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-10-pinsa-bebas.sql; lihat README). Isi:
--   * sg_beranda_publik(), sg_berita_publik(), dan sg_berita_lagi(p_lewati int) ditulis ulang (tanda tangan sama): tiap berita kini membawa kolom
--     'penulis' = NAMA TAMPILAN penulis (kolom beranda_berita.dibuat_oleh_nama, disalin dari profiles.nama saat berita ditulis; BUKAN nama pengguna/NIS
--     akun). Berlaku untuk SEMUA berita yang sudah terbit (kolomnya sudah terisi sejak berita ditulis) dan yang terbit kemudian.
--   * Hanya nama penulis yang bertambah; id akun, peninjau, catatan tinjauan, dan status tetap tidak keluar.
-- TIDAK mengubah tabel maupun data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regprocedure('public.sg_berita_lagi(integer)') is null or to_regprocedure('public.sg_berita_publik()') is null
     or to_regprocedure('public.sg_beranda_publik()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-10-pinsa-bebas.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

${publik}

${arsip}

${lagi}

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-10-penulis-berita', kepala);
