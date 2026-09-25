// Menyusun supabase/migrasi/2026-09-gerbang.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-gerbang.mjs
import { ambil, gantiFungsi, kebijakanIdempoten, tabelJikaBelumAda, tulisMigrasi } from './bantu.mjs';

const pemicuIdempoten = (s, nama, tabel) => s.replace(new RegExp(`^create trigger ${nama} `, 'm'), `drop trigger if exists ${nama} on ${tabel};\ncreate trigger ${nama} `);

// bagian tabel memuat pula bawaan pengaturan (insert ... on conflict do nothing, sudah idempoten)
const tabel = tabelJikaBelumAda(ambil('-- ===== Gerbang calon Garuda (Tahap 2, G4): tabel =====', '-- ===== akhir tabel gerbang =====', true));
const kebijakan = kebijakanIdempoten(ambil('-- ===== Gerbang calon Garuda (Tahap 2, G4): kebijakan =====', '-- ===== akhir kebijakan gerbang =====', true));
const pemicu = pemicuIdempoten(ambil('-- ===== Gerbang calon Garuda (Tahap 2, G4): pemicu =====', '-- ===== akhir pemicu gerbang =====', true), 'tak_aktif_tanggal_lahir', 'public.tanggal_lahir');
const aksi = gantiFungsi(ambil('-- ===== Gerbang calon Garuda (Tahap 2, G4): aksi =====', '-- ===== akhir aksi gerbang =====', true));
// sg_cadangan_admin diambil ulang: tabel baru tanggal_lahir harus ikut diekspor.
const cadangan = gantiFungsi(ambil('create function public.sg_cadangan_admin()', 'end $$;\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan', true)).replace(/\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan[\s\S]*$/, '');

const kepala = `-- ============================================================================
-- MIGRASI: Tahap 2 (G4) -- gerbang calon Garuda (tanggal lahir dan aturan gerbang). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-spg.sql; lihat README). Isi:
--   * Tabel public.tanggal_lahir (satu baris per Penegak; tabel terpisah dari profiles agar tidak terbaca Penegak lain). RLS baca: pemilik dan pengurus; tulis hanya lewat fungsi.
--     Pemicu tolak_peserta_tak_aktif (nonaktif/alumni tidak dapat diubah).
--   * Aturan gerbang bawaan pada pengaturan 'garuda.gerbang' (kelas minimal XI, lahir 2007-11-01 s.d. 2009-05-01, kuota 5%; tidak menimpa bila sudah ada).
--   * Fungsi baru (Pembina dan Admin Gudep): sg_tanggal_lahir_atur, sg_gerbang_simpan.
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
  if to_regclass('public.spg_penetapan') is null or to_regclass('public.pengaturan') is null or to_regprocedure('sigarda.tolak_peserta_tak_aktif()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-spg.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

${tabel}

alter table public.tanggal_lahir enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (baca saja lewat kebijakan; tulis hanya lewat fungsi).
revoke all on public.tanggal_lahir from anon, authenticated;
grant select on public.tanggal_lahir to authenticated;
${kebijakan}

${pemicu}

${aksi}

${cadangan}
`;
const akhir = `

revoke all on function
  public.sg_tanggal_lahir_atur(uuid, date), public.sg_gerbang_simpan(jsonb)
  from public, anon, authenticated;
grant execute on function
  public.sg_tanggal_lahir_atur(uuid, date), public.sg_gerbang_simpan(jsonb)
  to authenticated;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-gerbang', kepala + akhir.replace(/^\n+/, '\n'));
