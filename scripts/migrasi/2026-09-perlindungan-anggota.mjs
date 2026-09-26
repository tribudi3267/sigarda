// Menyusun supabase/migrasi/2026-09-perlindungan-anggota.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-perlindungan-anggota.mjs
import { ambil, gantiFungsi, kebijakanIdempoten, tabelJikaBelumAda, tulisMigrasi } from './bantu.mjs';

const tabel = tabelJikaBelumAda(ambil('-- ===== Perlindungan anggota / Safe From Harm (Tahap 4): tabel =====', '-- ===== akhir tabel perlindungan anggota =====', true));
const aksi = gantiFungsi(ambil('-- ===== Perlindungan anggota / Safe From Harm (Tahap 4): aksi =====', '-- ===== akhir aksi perlindungan anggota =====', true));
const kebijakan = kebijakanIdempoten("create policy baca_sfh_catatan on public.sfh_catatan for select to authenticated\n  using ((select sigarda.aktif()) and (anggota_id = (select auth.uid()) or (select sigarda.pembina_atau_admin())));");
// Fungsi lama yang badannya berubah (tanda tangan sama): Pemeriksaan Data (kunci sfhBelum) dan cadangan (tabel baru).
const pemeriksaan = gantiFungsi(ambil('create function public.sg_pemeriksaan_data()', 'end $$;', true));
const cadangan = gantiFungsi(ambil('create function public.sg_cadangan_admin()', 'end $$;\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan', true)).replace(/\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan[\s\S]*$/, '');

const kepala = `-- ============================================================================
-- MIGRASI: Tahap 4 -- Perlindungan anggota (Safe From Harm, Jukran Kwarnas 004/2021). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-periksa-data-diri.sql; lihat README). Isi:
--   * Tabel public.sfh_catatan: catatan kewajiban anggota dewasa gugus depan (Pembina: pelatihan, pakta integritas, pemeriksaan rekam jejak; Admin Gudep: pelatihan). Hanya MENCATAT
--     tanggal dan tautan bukti. RLS baca: pemilik, Pembina, dan Admin; tulis hanya lewat fungsi. Laporan kejadian TIDAK disimpan di aplikasi.
--   * Fungsi baru (Pembina dan Admin): sg_sfh_catat, sg_sfh_hapus, dan sg_sfh_gudep_simpan (penerima laporan gugus depan pada pengaturan 'perlindungan.gudep', dibaca semua pengguna).
--   * sg_pemeriksaan_data() ditulis ulang (tanda tangan sama): kunci baru sfhBelum. sg_cadangan_admin() ditulis ulang agar memuat tabel baru.
-- TIDAK menghapus data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.portofolio_snapshot') is null or to_regprocedure('public.sg_pemeriksaan_data()') is null
     or (select prosrc from pg_proc where oid = to_regprocedure('public.sg_pemeriksaan_data()')) not like '%dataDiriBelum%' then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-periksa-data-diri.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

${tabel}

alter table public.sfh_catatan enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (baca saja lewat kebijakan; tulis hanya lewat fungsi).
revoke all on public.sfh_catatan from anon, authenticated;
grant select on public.sfh_catatan to authenticated;
${kebijakan}

${aksi}

${pemeriksaan}

${cadangan}
`;
const akhir = `

revoke all on function
  public.sg_sfh_catat(uuid, text, date, text, text), public.sg_sfh_hapus(bigint), public.sg_sfh_gudep_simpan(jsonb), public.sg_pemeriksaan_data()
  from public, anon, authenticated;
grant execute on function
  public.sg_sfh_catat(uuid, text, date, text, text), public.sg_sfh_hapus(bigint), public.sg_sfh_gudep_simpan(jsonb), public.sg_pemeriksaan_data()
  to authenticated;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-perlindungan-anggota', kepala + akhir.replace(/^\n+/, '\n'));
