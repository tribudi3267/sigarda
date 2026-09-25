// Menyusun supabase/migrasi/2026-09-tim-kalender.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-tim-kalender.mjs
import { ambil, gantiFungsi, kebijakanIdempoten, tabelJikaBelumAda, tulisMigrasi } from './bantu.mjs';

const indeksJikaBelumAda = (s) => s.replace(/^create (unique )?index (\w+)/gm, 'create $1index if not exists $2');

const tabel = indeksJikaBelumAda(tabelJikaBelumAda(ambil('-- ===== Tim penilai dan kalender Garuda (Tahap 2, G4b dan G4c): tabel =====', '-- ===== akhir tabel tim kalender =====', true)));
const kebijakan = kebijakanIdempoten(ambil('-- ===== Tim penilai dan kalender Garuda (Tahap 2, G4b dan G4c): kebijakan =====', '-- ===== akhir kebijakan tim kalender =====', true));
const aksi = gantiFungsi(ambil('-- ===== Tim penilai dan kalender Garuda (Tahap 2, G4b dan G4c): aksi =====', '-- ===== akhir aksi tim kalender =====', true));
// sg_cadangan_admin diambil ulang: tabel baru harus ikut diekspor.
const cadangan = gantiFungsi(ambil('create function public.sg_cadangan_admin()', 'end $$;\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan', true)).replace(/\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan[\s\S]*$/, '');

const kepala = `-- ============================================================================
-- MIGRASI: Tahap 2 (G4b dan G4c) -- tim penilai Calon Garuda dan kalender tahap Garuda dari Kwarcab. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-tanggal-lahir-impor.sql; lihat README). Isi:
--   * Tabel public.tim_penilai (satu tim per tahun ajaran per putra/putri: nomor dan tanggal SK berpasangan, tautan SK), public.tim_penilai_anggota (1-15 anggota per tim:
--     nama, unsur, ketua atau anggota; paling banyak satu ketua) dan public.garuda_tahap (satu baris per tahun ajaran per tahap: tanggal mulai dan akhir).
--     RLS baca: pengurus; tulis hanya lewat fungsi.
--   * Fungsi baru (Pembina dan Admin Gudep): sg_tim_penilai_simpan, sg_tim_penilai_hapus, sg_garuda_tahap_simpan, sg_garuda_tahap_hapus.
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
  if to_regclass('public.tanggal_lahir') is null or to_regprocedure('public.sg_tanggal_lahir_impor(jsonb)') is null or to_regprocedure('sigarda.rapikan(text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-tanggal-lahir-impor.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

${tabel}

alter table public.tim_penilai enable row level security;
alter table public.tim_penilai_anggota enable row level security;
alter table public.garuda_tahap enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (baca saja lewat kebijakan; tulis hanya lewat fungsi).
revoke all on public.tim_penilai, public.tim_penilai_anggota, public.garuda_tahap from anon, authenticated;
grant select on public.tim_penilai, public.tim_penilai_anggota, public.garuda_tahap to authenticated;
${kebijakan}

${aksi}

${cadangan}
`;
const akhir = `

revoke all on function
  public.sg_tim_penilai_simpan(bigint, text, text, text, date, text, text, jsonb), public.sg_tim_penilai_hapus(bigint),
  public.sg_garuda_tahap_simpan(text, text, date, date, text), public.sg_garuda_tahap_hapus(bigint)
  from public, anon, authenticated;
grant execute on function
  public.sg_tim_penilai_simpan(bigint, text, text, text, date, text, text, jsonb), public.sg_tim_penilai_hapus(bigint),
  public.sg_garuda_tahap_simpan(text, text, date, date, text), public.sg_garuda_tahap_hapus(bigint)
  to authenticated;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-tim-kalender', kepala + akhir.replace(/^\n+/, '\n'));
