// Menyusun supabase/migrasi/2026-09-pengingat-kalender.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-pengingat-kalender.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

const fungsi = gantiFungsi(ambil('-- ===== Pengingat kalender Garuda (Tahap 2, G4d): fungsi =====', '-- ===== akhir fungsi pengingat kalender garuda =====', true));
// notif_pengingat ditulis ulang penuh (penanda ketujuh membungkus fungsi yang sama dengan enam penanda sebelumnya); isinya kini juga memanggil garuda_kalender_pengingat.
const pengingat = gantiFungsi(ambil('-- ===== Kalender Garuda (Tahap 2, G4d): pengingat =====', '-- ===== akhir pengingat kalender garuda =====', true));

const kepala = `-- ============================================================================
-- MIGRASI: Tahap 2 (G4d) -- pengingat otomatis untuk kalender tahap Garuda dari Kwarcab. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-tim-kalender.sql; lihat README). Isi:
--   * Fungsi baru sigarda.garuda_tahap_label dan sigarda.garuda_kalender_pengingat: notifikasi H-7, H-3, H-1, dan hari-H mulai tiap tahap kalender Garuda yang sudah diisi,
--     serta "berakhir besok" untuk tahap berentang yang sedang berjalan; ke semua pengurus aktif; sekali per tahap per hari.
--   * sigarda.notif_pengingat (pengingat harian 07.00 WIB) ditulis ulang (tanda tangan sama) agar memanggil pengingat kalender.
-- TIDAK mengubah tabel maupun data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.garuda_tahap') is null or to_regprocedure('sigarda.pra_uji_pengingat()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-tim-kalender.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

${fungsi}

${pengingat}

-- Fungsi sigarda.* baru: hak dijalankan ulang di sini (grant "all functions in schema" tidak retroaktif untuk fungsi baru).
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-pengingat-kalender', kepala);
