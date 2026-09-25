// Menyusun supabase/migrasi/2026-09-spg.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-spg.mjs
import { ambil, gantiFungsi, kebijakanIdempoten, tabelJikaBelumAda, tulisMigrasi } from './bantu.mjs';

const pemicuIdempoten = (s, nama, tabel) => s.replace(new RegExp(`^create trigger ${nama} `, 'm'), `drop trigger if exists ${nama} on ${tabel};\ncreate trigger ${nama} `);

const tabel = tabelJikaBelumAda(ambil('-- ===== SPG (Tahap 2, G3): tabel =====', '-- ===== akhir tabel spg =====', true));
const kebijakan = kebijakanIdempoten(ambil('-- ===== SPG (Tahap 2, G3): kebijakan =====', '-- ===== akhir kebijakan spg =====', true));
const pemicu = pemicuIdempoten(ambil('-- ===== SPG (Tahap 2, G3): pemicu =====', '-- ===== akhir pemicu spg =====', true), 'tak_aktif_spg_penetapan', 'public.spg_penetapan');
const aksi = gantiFungsi(ambil('-- ===== SPG (Tahap 2, G3): aksi =====', '-- ===== akhir aksi spg =====', true));
// sg_cadangan_admin diambil ulang: tabel baru spg_penetapan harus ikut diekspor.
const cadangan = gantiFungsi(ambil('create function public.sg_cadangan_admin()', 'end $$;\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan', true)).replace(/\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan[\s\S]*$/, '');

const kepala = `-- ============================================================================
-- MIGRASI: Tahap 2 (G3) -- penetapan Syarat Pramuka Garuda (SPG, 13 butir). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-tkk-penguji.sql; lihat README). Isi:
--   * Tabel public.spg_penetapan (satu baris per Penegak per butir 1-13: nilai 100/0, tanggal pengujian, catatan, tanda penimpaan hasil hitung aplikasi yang wajib beralasan).
--     RLS baca: pemilik dan pengurus; tulis hanya lewat fungsi. Pemicu tolak_peserta_tak_aktif (nonaktif/alumni tidak dapat diubah).
--   * Fungsi baru (Pembina dan Admin Gudep): sg_spg_catat (Penegak aktif yang telah menyelesaikan seluruh SKU Bantara dan Laksana), sg_spg_hapus.
--   * sg_cadangan_admin() ditulis ulang (tanda tangan sama) agar memuat tabel baru.
-- TIDAK menghapus data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.tkk_pengajuan') is null or to_regclass('public.pelantikan') is null or to_regprocedure('sigarda.layak_garuda(uuid)') is null
     or (select count(*) from pg_attribute where attrelid = 'public.tkk_pengajuan'::regclass and attname = 'penguji1_id' and not attisdropped) = 0 then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-tkk-penguji.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

${tabel}

alter table public.spg_penetapan enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (baca saja lewat kebijakan; tulis hanya lewat fungsi).
revoke all on public.spg_penetapan from anon, authenticated;
grant select on public.spg_penetapan to authenticated;
${kebijakan}

${pemicu}

${aksi}

${cadangan}
`;
const akhir = `

revoke all on function
  public.sg_spg_catat(uuid, integer, integer, date, text, boolean), public.sg_spg_hapus(uuid, integer)
  from public, anon, authenticated;
grant execute on function
  public.sg_spg_catat(uuid, integer, integer, date, text, boolean), public.sg_spg_hapus(uuid, integer)
  to authenticated;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-spg', kepala + akhir.replace(/^\n+/, '\n'));
