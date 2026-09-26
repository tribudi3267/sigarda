// Menyusun supabase/migrasi/2026-09-periksa-data-diri.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-periksa-data-diri.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

const pemeriksaan = gantiFungsi(ambil('create function public.sg_pemeriksaan_data()', 'end $$;', true));

const kepala = `-- ============================================================================
-- MIGRASI: Tahap 3 (H1, lanjutan) -- Pemeriksaan Data memuat kategori "Penegak belum melengkapi data diri". AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-snapshot-portofolio.sql; lihat README). Isi:
--   * sg_pemeriksaan_data() ditulis ulang (tanda tangan sama): kunci baru dataDiriBelum = Penegak aktif yang belum mengisi isian pokok data diri (WhatsApp, jenis kelamin,
--     agama, tanggal lahir, tempat lahir, alamat, nama ayah/ibu/wali). Hanya nama dan KODE isian yang kurang yang dikembalikan, tidak pernah nilainya.
-- Tidak mengubah tabel maupun data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.portofolio_snapshot') is null or to_regclass('public.penegak_isian') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-snapshot-portofolio.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

${pemeriksaan}
`;
const akhir = `

revoke all on function public.sg_pemeriksaan_data() from public, anon, authenticated;
grant execute on function public.sg_pemeriksaan_data() to authenticated;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-periksa-data-diri', kepala + akhir.replace(/^\n+/, '\n'));
