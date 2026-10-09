// Menyusun supabase/migrasi/2026-10-pinsa-bebas.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-10-pinsa-bebas.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

const fungsi = (nama) => gantiFungsi(ambil(`create function public.${nama}(`, 'end $$;', true));

const kepala = `-- ============================================================================
-- MIGRASI: Pinsa tidak lagi disyaratkan Calon Laksana. AMAN untuk database berisi data.
--
-- Jalankan SETELAH 2026-10-muat-awal.sql (lihat README). Isi:
--   * Syarat "SKU Bantara selesai" untuk menjadi Pinsa DICABUT (aturan itu buatan aplikasi, bukan ketentuan Kwarnas): Penegak aktif mana pun, kelas X, XI, atau XII,
--     boleh menjadi Pinsa sangga sendiri (kotak centang Pinsa) atau Pinsa tertugas di rombel lain.
--   * Daftar calon Pinsa tertugas (sg_pinsa_calon) memuat semua Penegak aktif (urut kelas lalu nama, sampai 800), bukan hanya yang Bantaranya selesai.
--   * Fungsi ditulis ulang (tanda tangan sama): sg_sangga_rombel, sg_sangga_atur, sg_pinsa_calon, sg_pinsa_tugaskan.
-- Aturan Bina Damping (minimal Calon Laksana) TIDAK berubah. TIDAK mengubah tabel/data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regprocedure('public.sg_pinsa_calon(text)') is null or to_regprocedure('public.sg_sangga_rombel(text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-10-muat-awal.sql; lihat README), baru migrasi ini.';
  end if;
end $$;
`;
const akhir = `

revoke all on function
  public.sg_sangga_rombel(text), public.sg_sangga_atur(text, jsonb), public.sg_pinsa_calon(text), public.sg_pinsa_tugaskan(text, text, uuid)
  from public, anon, authenticated;
grant execute on function
  public.sg_sangga_rombel(text), public.sg_sangga_atur(text, jsonb), public.sg_pinsa_calon(text), public.sg_pinsa_tugaskan(text, text, uuid)
  to authenticated;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-10-pinsa-bebas', kepala + '\n' + ['sg_sangga_rombel', 'sg_sangga_atur', 'sg_pinsa_calon', 'sg_pinsa_tugaskan'].map(fungsi).join('\n\n') + akhir);
