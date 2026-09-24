// Menyusun supabase/migrasi/2026-09-integrasi-pra-uji.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-integrasi-pra-uji.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

// eskalasi_mulai_sku: tidak dihitung selama ada pra-uji yang menunggu penilai.
const eskalasi = gantiFungsi(ambil('create function sigarda.eskalasi_mulai_sku(', 'end $$;', true));
// pra_uji_pengingat: pengingat "tanpa penilai" ke Pembina kini bertautan ke menu Pra-uji.
const pengingat = gantiFungsi(ambil('create function sigarda.pra_uji_pengingat()', '-- ===== akhir bantu pra-uji ====='));
// sg_pemeriksaan_data: kategori pra-uji (praUjiAktif, rombelTanpaBinaDamping, sanggaTanpaPinsa, praUjiMacet).
const pemeriksaan = gantiFungsi(ambil('create function public.sg_pemeriksaan_data()', 'end $$;', true));

const kepala = `-- ============================================================================
-- MIGRASI: Fase E -- integrasi pra-uji dengan eskalasi, Pemeriksaan Data, dan pengingat. AMAN untuk database berisi data.
--
-- Jalankan SETELAH 2026-09-pra-uji.sql (Fase C; lihat README). Isi (tanda tangan fungsi TIDAK berubah, Edge Function tidak berubah):
--   * sigarda.eskalasi_mulai_sku: tangga eskalasi "SKU tidak bergerak" tidak dihitung selama ada pra-uji yang menunggu penilai (penghambatnya penilai, bukan
--     Penegak); yang macet muncul di Periksa Data dan diingatkan pengingat pra-uji.
--   * sigarda.pra_uji_pengingat: pengingat "Pra-uji tanpa penilai" ke Pembina bertautan ke menu Pra-uji (tempat melewati tahap), bukan menu Antrian.
--   * sg_pemeriksaan_data: kunci baru praUjiAktif, rombelTanpaBinaDamping (rombel berPenegak dengan kurang dari 2 Bina Damping tahun ajaran berjalan), sanggaTanpaPinsa,
--     dan praUjiMacet (pra-uji menunggu lebih dari 3 hari atau tanpa penilai yang memenuhi syarat). Klien menampilkan tiga daftar itu hanya bila pra-uji hidup.
-- TIDAK menghapus data dan tidak mengubah sakelar. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.sku_pra_uji') is null or to_regprocedure('sigarda.pra_uji_aktif()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-pra-uji.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

${eskalasi}

${pengingat}

${pemeriksaan}

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-integrasi-pra-uji', kepala);
