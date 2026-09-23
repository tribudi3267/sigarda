// Menyusun supabase/migrasi/2026-09-berkas-garuda.sql dari bagian di supabase/sumber/inti.sql (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-berkas-garuda.mjs
import { ambil, gantiFungsi, tabelJikaBelumAda, tulisMigrasi } from './bantu.mjs';

const tabel = tabelJikaBelumAda(ambil('-- ===== Berkas Calon Garuda (tahap L7): tabel =====', '-- ===== akhir tabel berkas garuda =====', true));
const fungsi = gantiFungsi(ambil('-- ===== Berkas Calon Garuda (tahap L7): fungsi =====', '-- ===== akhir fungsi berkas garuda =====', true));

const kepala = `-- ============================================================================
-- MIGRASI: Berkas Calon Garuda (tahap L7). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi usulan kegiatan (dan yang sebelumnya). Isi:
--   * Tabel public.garuda_berkas_token: tautan berbagi BACA-SAJA (tanpa login) untuk penilai kwarran/kwarcab meninjau
--     berkas lengkap satu Calon Garuda (kartu SKU Bantara+Laksana, 26 dokumen portofolio, jurnal). Satu token AKTIF per
--     peserta; tanpa kedaluwarsa, berlaku sampai dicabut manual oleh Pembina atau Admin. RLS aktif TANPA kebijakan
--     (sama seperti sertifikat_tingkat): hanya dapat dibaca lewat fungsi di bawah, tidak lewat kueri tabel langsung.
--   * sigarda.garuda_berkas_json(peserta_id): fungsi bantu, menyusun isi berkas sebagai satu JSON (dipakai bersama oleh
--     kedua fungsi publik di bawah, satu sumber data untuk jalur berlogin maupun jalur tautan berbagi).
--   * sg_garuda_berkas_baca(peserta_id): Pembina dan Admin (sudah login) membuka berkas seorang Calon Garuda.
--   * sg_garuda_token_buat(peserta_id), sg_garuda_token_cabut(peserta_id): Pembina dan Admin membuat/mengganti atau
--     mencabut tautan berbagi (regenerasi otomatis mencabut token lama; satu token aktif per peserta).
--   * sg_garuda_token_baca(token): DAPAT DIPANGGIL TANPA LOGIN (peran anon) -- membaca isi lengkap berkas lewat tautan
--     berbagi yang masih aktif. BEDA dari sg_verifikasi_token/kode (yang hanya menjawab ringkasan keaslian dokumen):
--     fungsi ini mengembalikan ISI LENGKAP berkas kepada siapa pun yang memegang tautannya.
-- garuda_berkas_token SENGAJA TIDAK ditambahkan ke sg_cadangan_admin() (tahap L4): token di sini adalah kredensial akses
-- baca, bukan sekadar bukti keaslian seperti sertifikat_tingkat, jadi diperlakukan seperti push_langganan/notifikasi.
-- Edge Function TIDAK berubah dan tidak perlu di-deploy ulang. TIDAK menghapus data yang ada. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: usulan kegiatan (migrasi terakhir sebelum ini) sudah ada.
do $$
begin
  if to_regprocedure('public.sg_kegiatan_ping(bigint)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-usulan-kegiatan.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

${tabel}

revoke all on public.garuda_berkas_token from anon, authenticated;
alter table public.garuda_berkas_token enable row level security;
`;
const akhir = `

revoke all on function public.sg_garuda_berkas_baca(uuid), public.sg_garuda_token_buat(uuid), public.sg_garuda_token_cabut(uuid) from public, anon, authenticated;
grant execute on function
  public.sg_garuda_berkas_baca(uuid), public.sg_garuda_token_buat(uuid), public.sg_garuda_token_cabut(uuid)
  to authenticated;
revoke all on function public.sg_garuda_token_baca(text) from public, anon, authenticated;
grant execute on function public.sg_garuda_token_baca(text) to anon, authenticated;
-- sigarda.garuda_berkas_json: hak dijalankan ulang di sini (grant "all functions in schema" tidak retroaktif untuk fungsi
-- baru yang dibuat migrasi ini). Dipanggil dari dalam sg_garuda_berkas_baca/sg_garuda_token_baca (SECURITY DEFINER) sebagai
-- pemilik fungsi, jadi grant authenticated/service_role di sini sudah cukup -- TIDAK perlu granted ke anon secara terpisah.
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-berkas-garuda', kepala + fungsi + akhir);
