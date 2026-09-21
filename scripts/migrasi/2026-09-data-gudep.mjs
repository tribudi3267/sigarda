// Menyusun supabase/migrasi/2026-09-data-gudep.sql dari bagian di supabase/sumber/inti.sql (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-data-gudep.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

const fungsi = ambil('-- ===== Data gudep: fungsi =====', '-- ===== akhir fungsi gudep =====', true);
const sidangSimpan = ambil('create function public.sg_sidang_simpan(', 'end $$;', true);

const kepala = `-- ============================================================================
-- MIGRASI: Data gudep (identitas gugus depan, ambalan, dan pejabat) yang diatur Admin Gudep. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi dokumen (fase 2a). Isi:
--   * sg_gudep_simpan: Admin Gudep menyimpan data gudep (nama gudep, ambalan, sekolah, nomor gudep, kode surat, alamat, kota, telepon, email, kwartir,
--     serta Pembina Gudep / Ka Gudep, Kamabigus / Kepala Sekolah, Pradana, Pradani beserta NTA) sebagai satu objek pada pengaturan 'gudep.data'.
--     Semua isian diperiksa di server. Belum ada data = aplikasi memakai nilai bawaan dari kode.
--   * sg_gudep_publik: identitas yang boleh dilihat TANPA login (halaman masuk dan verifikasi): hanya nama gudep, ambalan, sekolah, dan kota.
--     Nama pejabat, NTA, alamat, dan kontak tidak dikeluarkan.
--   * sigarda.ketua_sidang dan sg_sidang_simpan: ketua sidang pada berita acara kini Pradana pada data gudep (nama dan jabatan, disalin saat sidang dicatat).
--     Bila data gudep belum disimpan atau nama/jabatan Pradana kosong, pengaturan lama sidang.nama_ketua dan sidang.sebutan_ketua tetap dipakai.
--   Pembacaan data lengkap setelah masuk memakai kebijakan baca pengaturan yang sudah ada. Tidak ada tabel baru dan tidak ada data yang diubah.
--   Edge Function TIDAK perlu di-deploy ulang.
-- Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: skema dasar dan migrasi dokumen (fase 2a) sudah ada.
do $$
begin
  if to_regclass('public.pengaturan') is null or to_regclass('public.dokumen_terbit') is null
     or to_regprocedure('sigarda.wajib_admin(text)') is null or to_regprocedure('sigarda.rapikan(text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-dokumen.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

`;
const akhir = `

revoke all on function public.sg_gudep_simpan(jsonb) from public, anon, authenticated;
grant execute on function public.sg_gudep_simpan(jsonb) to authenticated;
revoke all on function public.sg_gudep_publik() from public;
grant execute on function public.sg_gudep_publik() to anon, authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-data-gudep', kepala + gantiFungsi(fungsi) + '\n\n' + gantiFungsi(sidangSimpan) + akhir);
