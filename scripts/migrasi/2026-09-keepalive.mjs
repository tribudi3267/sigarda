// Menyusun supabase/migrasi/2026-09-keepalive.sql dari bagian di supabase/sumber/inti.sql (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-keepalive.mjs
import { ambil, gantiFungsi, tabelJikaBelumAda, tulisMigrasi } from './bantu.mjs';

const tabel = tabelJikaBelumAda(ambil('-- ===== Keep-alive Supabase (dari dalam database): tabel =====', '-- ===== akhir tabel keepalive =====', true));
const fungsi = gantiFungsi(ambil('-- ===== Keep-alive Supabase (dari dalam database): fungsi =====', '-- ===== akhir fungsi keepalive =====', true));

const kepala = `-- ============================================================================
-- MIGRASI: Keep-alive Supabase dari dalam database. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi indeks-fk (dan yang sebelumnya). Isi:
--   * Tabel public.keepalive_konfigurasi (satu baris; RLS aktif TANPA kebijakan, hanya diisi lewat SQL Editor).
--   * sigarda.keepalive_atur(url, kunci): dijalankan pemilik SEKALI di SQL Editor; menyimpan alamat proyek dan kunci anon/publishable,
--     menjadwalkan dua pekerjaan pg_cron (ping tiap hari 01.30 UTC = 08.30 WIB, pencatatan hasil 01.35 UTC), lalu mengirim ping pertama.
--   * sigarda.keepalive_ping(): meminta pg_net mengirim SATU permintaan HTTP ke API proyek sendiri (fungsi publik sg_gudep_publik), sehingga
--     tercatat sebagai lalu lintas API. sigarda.keepalive_catat() mencatat jawabannya; sigarda.keepalive_periksa() menampilkan keadaan;
--     sigarda.keepalive_matikan() menghapus jadwal dan konfigurasi.
-- Mencegah proyek Free tier dijeda karena 7 hari tanpa aktivitas, tanpa bergantung pada GitHub (yang menonaktifkan jadwal repositori publik
-- setelah 60 hari tanpa aktivitas). Hanya berjalan selama proyek aktif: proyek yang sudah terjeda perlu dipulihkan dulu di Dashboard.
-- Butuh ekstensi pg_cron dan pg_net (Dashboard > Integrations); bila belum aktif, keepalive_atur menyimpan pengaturan dan menyebut yang kurang.
-- Kode aplikasi dan Edge Function TIDAK berubah. TIDAK menghapus data yang ada. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run. Lalu SATU perintah lagi (lihat README, bagian Keep-alive Supabase):
--   select sigarda.keepalive_atur('https://<ref>.supabase.co', '<kunci anon atau publishable>');
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: migrasi sebelumnya sudah ada (fungsi publik yang dipanggil ping, dan skema sigarda).
do $$
begin
  if to_regprocedure('public.sg_gudep_publik()') is null or to_regclass('public.push_konfigurasi') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-indeks-fk.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

`;
const akhir = `

revoke all on public.keepalive_konfigurasi from anon, authenticated;
alter table public.keepalive_konfigurasi enable row level security;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
`;
tulisMigrasi('2026-09-keepalive', kepala + tabel + '\n' + fungsi + akhir);
