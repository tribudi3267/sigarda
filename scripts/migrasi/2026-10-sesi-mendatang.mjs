// Menyusun supabase/migrasi/2026-10-sesi-mendatang.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-10-sesi-mendatang.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

const fungsi = (nama) => gantiFungsi(ambil(`create function ${nama}(`, 'end $$;', true));

const kepala = `-- ============================================================================
-- MIGRASI: sesi absensi boleh disiapkan lebih awal (sampai 60 hari ke depan). AMAN untuk database berisi data.
--
-- Jalankan SETELAH 2026-10-penulis-berita.sql (lihat README). Isi:
--   * sg_absen_buat_sesi: tanggal yang belum tiba kini BOLEH sampai 60 hari ke depan (tetap hanya hari Jumat). Sebelumnya ditolak.
--   * Sesi yang tanggalnya belum tiba BUKAN pertemuan: sigarda.iuran_hitung (pertemuan semester), sg_iuran_ringkas (Jumat kosong),
--     sigarda.eskalasi_mulai_absensi dan sigarda.eskalasi_mulai_iuran (tangga Tindak Lanjut) mengabaikannya, sehingga hasilnya sama
--     seperti sebelum fitur ini; tanpa pengaman itu sesi mendatang tanpa iuran dihitung "tidak iuran", memutus beruntun Alpa, dan menurunkan persen.
--   * Kehadiran (sg_absen_set, sg_absen_set_banyak), iuran (sg_iuran_set, sg_iuran_set_banyak), dan tutup kas (sg_iuran_kas_simpan) baru dapat
--     dicatat pada hari latihan atau sesudahnya; sesi mendatang masih bisa dihapus.
--   * Fungsi ditulis ulang (tanda tangan sama, jadi Edge Function tidak perlu di-deploy ulang). TIDAK mengubah tabel/data. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regprocedure('public.sg_absen_buat_sesi(date)') is null or to_regprocedure('sigarda.iuran_hitung(uuid, date)') is null
     or to_regprocedure('sigarda.eskalasi_mulai_iuran(uuid)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-10-penulis-berita.sql; lihat README), baru migrasi ini.';
  end if;
end $$;
`;
const akhir = `

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;
revoke all on function
  public.sg_absen_buat_sesi(date), public.sg_absen_set(date, uuid, text), public.sg_absen_set_banyak(date, uuid[], text, boolean),
  public.sg_iuran_set(date, uuid, int), public.sg_iuran_set_banyak(date, uuid[], int, boolean), public.sg_iuran_kas_simpan(date, int, text),
  public.sg_iuran_ringkas(uuid, date)
  from public, anon, authenticated;
grant execute on function
  public.sg_absen_buat_sesi(date), public.sg_absen_set(date, uuid, text), public.sg_absen_set_banyak(date, uuid[], text, boolean),
  public.sg_iuran_set(date, uuid, int), public.sg_iuran_set_banyak(date, uuid[], int, boolean), public.sg_iuran_kas_simpan(date, int, text),
  public.sg_iuran_ringkas(uuid, date)
  to authenticated;

commit;
notify pgrst, 'reload schema';
`;
const daftar = [
  'sigarda.iuran_hitung',
  'sigarda.eskalasi_mulai_absensi',
  'sigarda.eskalasi_mulai_iuran',
  'public.sg_absen_buat_sesi',
  'public.sg_absen_set',
  'public.sg_absen_set_banyak',
  'public.sg_iuran_set',
  'public.sg_iuran_set_banyak',
  'public.sg_iuran_kas_simpan',
  'public.sg_iuran_ringkas',
];
tulisMigrasi('2026-10-sesi-mendatang', kepala + '\n' + daftar.map(fungsi).join('\n\n') + akhir);
