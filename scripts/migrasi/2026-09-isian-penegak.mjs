// Menyusun supabase/migrasi/2026-09-isian-penegak.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-isian-penegak.mjs
import { ambil, gantiFungsi, kebijakanIdempoten, tabelJikaBelumAda, tulisMigrasi } from './bantu.mjs';

const pemicuIdempoten = (s, nama, tabel) => s.replace(new RegExp(`^create trigger ${nama} `, 'm'), `drop trigger if exists ${nama} on ${tabel};\ncreate trigger ${nama} `);
const fungsi = (awal) => gantiFungsi(ambil(awal, 'end $$;', true));

const tabel = tabelJikaBelumAda(ambil('-- ===== Isian Penegak dan templat dokumen (Tahap 3, H1): tabel =====', '-- ===== akhir tabel isian penegak =====', true));
const bantu = gantiFungsi(ambil('-- ===== Isian Penegak (Tahap 3, H1): fungsi bantu =====', '-- ===== akhir bantu isian penegak =====', true));
const kebijakan = kebijakanIdempoten(ambil('-- ===== Isian Penegak dan templat dokumen (Tahap 3, H1): kebijakan =====', '-- ===== akhir kebijakan isian penegak =====', true));
const pemicu = pemicuIdempoten(ambil('-- ===== Isian Penegak (Tahap 3, H1): pemicu =====', '-- ===== akhir pemicu isian penegak =====', true), 'tak_aktif_penegak_isian', 'public.penegak_isian');
const aksi = gantiFungsi(ambil('-- ===== Isian Penegak dan templat dokumen (Tahap 3, H1): aksi =====', '-- ===== akhir aksi isian penegak =====', true));
// Fungsi lama yang badannya berubah (tanda tangan sama): penjaga agama pada pemicu tak aktif, peringatan sangga, ubah anggota, atur sangga, dan cadangan.
const tolak = fungsi('create function sigarda.tolak_peserta_tak_aktif()');
const peringatan = fungsi('create function sigarda.sangga_peringatan(p_rombel text)');
const ubah = fungsi('create function public.sg_anggota_ubah(');
const atur = fungsi('create function public.sg_sangga_atur(p_rombel text, p_data jsonb)');
const cadangan = gantiFungsi(ambil('create function public.sg_cadangan_admin()', 'end $$;\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan', true)).replace(/\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan[\s\S]*$/, '');

const kepala = `-- ============================================================================
-- MIGRASI: Tahap 3 (H1) -- isian data diri Penegak (diisi sendiri) dan templat surat keterangan guru. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-cakupan-pra-uji.sql; lihat README). Isi:
--   * Akun Penegak baru hanya butuh NIS dan rombel: batasan profil_peserta dilonggarkan (sangga dan agama boleh kosong). Agama kosong dijaga pemicu
--     tolak_peserta_tak_aktif (tanpa agama, progres SKU ditolak sampai Penegak mengisinya sendiri). Peringatan sangga dan sg_sangga_atur ditulis ulang agar
--     mengenal Penegak tanpa sangga; sg_anggota_ubah tidak lagi mewajibkan sangga dan agama.
--   * Tabel public.penegak_isian (isian data diri sebagai kunci-nilai: tempat lahir, alamat, keluarga, pendidikan, prestasi, kegiatan, kecakapan, perangkat IT) dan
--     public.dokumen_templat (rubrik surat keterangan guru per tahun ajaran). RLS baca: penegak_isian = pemilik, Pembina, Admin; dokumen_templat = Pembina dan Admin;
--     tulis hanya lewat fungsi. Pemicu tolak_peserta_tak_aktif pada penegak_isian.
--   * Fungsi baru: sigarda.isian_periksa, sigarda.isian_periksa_profil, sg_isian_saya_simpan (Penegak aktif, untuk dirinya), sg_dokumen_templat_simpan dan
--     sg_dokumen_templat_hapus (Pembina dan Admin).
--   * sg_cadangan_admin() ditulis ulang (tanda tangan sama) agar memuat tabel baru.
-- TIDAK menghapus data. Edge Function BERUBAH (sangga dan agama Penegak tidak lagi wajib saat membuat akun): deploy ulang Edge Function "sigarda" (lihat README).
-- Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.tanggal_lahir') is null or to_regprocedure('public.sg_pra_uji_cakupan(integer)') is null or to_regprocedure('sigarda.tolak_peserta_tak_aktif()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-cakupan-pra-uji.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

-- Penegak baru: hanya NIS dan rombel yang wajib sejak akun dibuat.
alter table public.profiles drop constraint if exists profil_peserta;
alter table public.profiles add constraint profil_peserta check (role <> 'peserta' or (nis is not null and kelas is not null and jabatan is null));

${tabel}

alter table public.penegak_isian enable row level security;
alter table public.dokumen_templat enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (baca saja lewat kebijakan; tulis hanya lewat fungsi).
revoke all on public.penegak_isian, public.dokumen_templat from anon, authenticated;
grant select on public.penegak_isian, public.dokumen_templat to authenticated;
${kebijakan}

${bantu}

${tolak}

${pemicu}

${peringatan}

${ubah}

${atur}

${aksi}

${cadangan}
`;
const akhir = `

revoke all on function
  public.sg_isian_saya_simpan(jsonb), public.sg_dokumen_templat_simpan(text, text, jsonb), public.sg_dokumen_templat_hapus(bigint)
  from public, anon, authenticated;
grant execute on function
  public.sg_isian_saya_simpan(jsonb), public.sg_dokumen_templat_simpan(text, text, jsonb), public.sg_dokumen_templat_hapus(bigint)
  to authenticated;
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-isian-penegak', kepala + akhir.replace(/^\n+/, '\n'));
