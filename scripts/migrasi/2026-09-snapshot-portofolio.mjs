// Menyusun supabase/migrasi/2026-09-snapshot-portofolio.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-snapshot-portofolio.mjs
import { ambil, gantiFungsi, kebijakanIdempoten, tabelJikaBelumAda, tulisMigrasi } from './bantu.mjs';

const indeksJikaBelumAda = (s) => s.replace(/^create (unique )?index (\w+)/gm, 'create $1index if not exists $2');

const tabel = indeksJikaBelumAda(tabelJikaBelumAda(ambil('-- ===== Salinan beku portofolio (Tahap 3, H3): tabel =====', '-- ===== akhir tabel salinan beku portofolio =====', true)));
const aksi = gantiFungsi(ambil('-- ===== Salinan beku portofolio (Tahap 3, H3): aksi =====', '-- ===== akhir aksi salinan beku portofolio =====', true));
// Kebijakan baca: hanya satu baris pada blok kebijakan isian-penegak; diambil sendiri agar migrasi tahap sebelumnya tidak ikut terulang.
const kebijakan = kebijakanIdempoten('create policy baca_portofolio_snapshot on public.portofolio_snapshot for select to authenticated using ((select sigarda.pembina_atau_admin()));');
// sg_cadangan_admin diambil ulang: tabel baru harus ikut diekspor.
const cadangan = gantiFungsi(ambil('create function public.sg_cadangan_admin()', 'end $$;\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan', true)).replace(/\n\n-- Kapan dan siapa yang terakhir mengunduh cadangan[\s\S]*$/, '');

const kepala = `-- ============================================================================
-- MIGRASI: Tahap 3 (H3) -- salinan beku Portofolio format Kwarcab. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-isian-penegak.sql; lihat README). Isi:
--   * Tabel public.portofolio_snapshot (salinan beku dokumen satu Penegak saat dicetak atau dikirim ke Kwarcab: seluruh data pembentuk dokumen disimpan apa adanya).
--     RLS baca: Pembina dan Admin; tulis hanya lewat fungsi.
--   * Fungsi baru (Pembina dan Admin Gudep): sg_portofolio_snapshot_simpan (paling banyak 600 kB dan 20 salinan per Penegak) dan sg_portofolio_snapshot_hapus.
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
  if to_regclass('public.penegak_isian') is null or to_regclass('public.dokumen_templat') is null or to_regprocedure('public.sg_isian_saya_simpan(jsonb)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-isian-penegak.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

${tabel}

alter table public.portofolio_snapshot enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (baca saja lewat kebijakan; tulis hanya lewat fungsi).
revoke all on public.portofolio_snapshot from anon, authenticated;
grant select on public.portofolio_snapshot to authenticated;
${kebijakan}

${aksi}

${cadangan}
`;
const akhir = `

revoke all on function
  public.sg_portofolio_snapshot_simpan(uuid, text, jsonb), public.sg_portofolio_snapshot_hapus(bigint)
  from public, anon, authenticated;
grant execute on function
  public.sg_portofolio_snapshot_simpan(uuid, text, jsonb), public.sg_portofolio_snapshot_hapus(bigint)
  to authenticated;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-snapshot-portofolio', kepala + akhir.replace(/^\n+/, '\n'));
