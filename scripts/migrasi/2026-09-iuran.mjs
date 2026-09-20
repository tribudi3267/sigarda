// Menyusun supabase/migrasi/2026-09-iuran.sql dari bagian-bagian di supabase/sumber/inti.sql (satu sumber kebenaran).
// Contoh pemakaian pembantu di ./bantu.mjs; jalankan: node scripts/migrasi/2026-09-iuran.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

const ubah = gantiFungsi;

const tabel = ambil('-- ===== Iuran bumbung kepramukaan: tabel =====', '-- ===== akhir tabel iuran =====', true)
  .replace(/^create table public\./gm, 'create table if not exists public.')
  .replace('create index on public.iuran (peserta_id);', 'create index if not exists iuran_peserta_id_idx on public.iuran (peserta_id);')
  .replace('create index on public.iuran_log (tanggal);', 'create index if not exists iuran_log_tanggal_idx on public.iuran_log (tanggal);');
const bantu = ambil('-- ---- Iuran bumbung: siapa yang boleh mencatat ----', '-- ---- akhir bantu iuran ----', true);
const hitung = ambil('-- ---- Iuran bumbung: perhitungan untuk penilaian SKU', '-- ---- akhir hitung iuran ----', true);
const simpanInstrumen = ambil('create function public.sg_instrumen_simpan(', 'end $$;', true);
const rubrik = ambil('create function public.sg_sku_catat_rubrik_internal(', 'end $$;', true);
const hapusSesi = ambil('create function public.sg_absen_hapus_sesi(', 'end $$;', true);
const fungsi = ambil('-- ===== Iuran bumbung kepramukaan: fungsi aksi =====', '-- ===== akhir fungsi iuran =====', true);
const kebijakan = ambil('-- Iuran: Penegak hanya melihat miliknya;', 'create policy baca_portofolio')
  .replace(/^create policy (\w+) on (public\.\w+)/gm, (m, nama, tabelNama) => `drop policy if exists ${nama} on ${tabelNama};\n${m}`);

const kepala = `-- ============================================================================
-- MIGRASI: Iuran bumbung kepramukaan (pencatatan, rekap, tutup kas, asisten bendahara, dan kaitannya dengan penilaian SKU). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi instrumen (dan yang sebelumnya; disarankan setelah 2026-09-indeks-kode-verifikasi.sql). Isi:
--   * Tabel iuran, iuran_log (riwayat perubahan, hanya bertambah), iuran_kas (tutup kas per Jumat), dan asisten_iuran.
--   * Fungsi sg_iuran_set, sg_iuran_set_banyak, sg_iuran_lembar, sg_iuran_agregat, sg_iuran_kas_simpan, sg_asisten_iuran_atur.
--     Iuran hanya dapat dicatat oleh Dewan Ambalan dan asisten bendahara (Penegak Calon Laksana yang ditunjuk); Pembina dan Admin melihat.
--   * sg_absen_hapus_sesi diperbarui: sesi yang sudah memiliki catatan iuran atau tutup kas tidak dapat dihapus sebelum dikosongkan.
--   * Kaitan dengan SKU: kolom instrumen_kriteria.sumber ('manual' atau 'iuran'; hanya butir iuran Bantara 6 dan Laksana 6), fungsi
--     sg_iuran_ringkas, sg_iuran_susulan, sg_iuran_pengaturan, sg_iuran_pengaturan_simpan, serta sg_instrumen_simpan dan
--     sg_sku_catat_rubrik_internal diperbarui (nilai kriteria iuran yang berbeda dari saran hitungan iuran wajib disertai catatan alasan).
--   Hanya sg_sku_catat_rubrik_internal yang dipanggil Edge Function, dan tanda tangannya tidak berubah: Edge Function TIDAK perlu di-deploy ulang.
-- TIDAK mengubah atau menghapus data yang sudah ada. Aman dijalankan berulang kali. Edge Function tidak berubah.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: skema dasar (absensi, profil, fungsi bantu) sudah ada.
do $$
begin
  if to_regclass('public.absensi_sesi') is null or to_regclass('public.profiles') is null
     or to_regprocedure('sigarda.pengurus()') is null or to_regprocedure('sigarda.tingkat_selesai(uuid, text)') is null
     or to_regclass('public.instrumen_kriteria') is null or to_regprocedure('sigarda.instrumen_hitung(text, jsonb)') is null
     or to_regprocedure('public.sg_sku_catat_internal(uuid, uuid, text, text, date, text, text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-instrumen.sql dan 2026-09-verifikasi-sesi.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

`;
const akhir = `

alter table public.iuran enable row level security;
alter table public.iuran_log enable row level security;
alter table public.iuran_kas enable row level security;
alter table public.asisten_iuran enable row level security;

${kebijakan}

revoke all on public.iuran, public.iuran_log, public.iuran_kas, public.asisten_iuran from anon, authenticated;
grant select on public.iuran, public.iuran_log, public.iuran_kas, public.asisten_iuran to authenticated;

revoke all on function
  public.sg_iuran_set(date, uuid, int), public.sg_iuran_set_banyak(date, uuid[], int, boolean), public.sg_iuran_lembar(date),
  public.sg_iuran_agregat(date, date), public.sg_iuran_kas_simpan(date, int, text), public.sg_asisten_iuran_atur(uuid, boolean),
  public.sg_iuran_pengaturan(), public.sg_iuran_pengaturan_simpan(jsonb), public.sg_iuran_ringkas(uuid, date), public.sg_iuran_susulan(uuid, date, int, int)
  from public, anon, authenticated;
grant execute on function
  public.sg_iuran_set(date, uuid, int), public.sg_iuran_set_banyak(date, uuid[], int, boolean), public.sg_iuran_lembar(date),
  public.sg_iuran_agregat(date, date), public.sg_iuran_kas_simpan(date, int, text), public.sg_asisten_iuran_atur(uuid, boolean),
  public.sg_iuran_pengaturan(), public.sg_iuran_pengaturan_simpan(jsonb), public.sg_iuran_ringkas(uuid, date), public.sg_iuran_susulan(uuid, date, int, int)
  to authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
const kolomSumber = "alter table public.instrumen_kriteria add column if not exists sumber text not null default 'manual' check (sumber in ('manual','iuran'));\n\n";
const isi = kepala + kolomSumber + tabel + '\n\n' + ubah(bantu) + '\n\n' + ubah(hitung) + '\n\n' + ubah(hapusSesi) + '\n\n' + ubah(simpanInstrumen) + '\n\n' + ubah(rubrik) + '\n\n' + ubah(fungsi) + akhir;
tulisMigrasi('2026-09-iuran', isi);
