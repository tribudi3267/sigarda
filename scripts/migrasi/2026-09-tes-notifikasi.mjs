// Menyusun supabase/migrasi/2026-09-tes-notifikasi.sql dari bagian di supabase/sumber/inti.sql (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-tes-notifikasi.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

const fungsi = gantiFungsi(ambil('-- ===== Notifikasi uji: fungsi =====', '-- ===== akhir fungsi notifikasi uji =====', true));

const kepala = `-- ============================================================================
-- MIGRASI: Notifikasi uji (tahap L0). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi dewan-penegak (dan yang sebelumnya). Isi:
--   * notifikasi.jenis menerima nilai 'tes'.
--   * sg_notifikasi_tes: tombol "Kirim notifikasi uji" di halaman Notifikasi membuat satu notifikasi jenis 'tes' untuk pemanggil sendiri, sehingga jalur
--     pemicu -> pg_net -> Edge Function notif-push -> HP dapat diuji tanpa menunggu kejadian nyata. Dibatasi 5 kali per 10 menit.
--   Edge Function TIDAK berubah dan tidak perlu di-deploy ulang.
-- TIDAK menghapus data yang ada. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: tabel notifikasi (migrasi notifikasi) dan penghitung Dewan-Penegak (migrasi terakhir sebelum ini) sudah ada.
do $$
begin
  if to_regclass('public.notifikasi') is null or to_regclass('public.push_langganan') is null or to_regclass('public.push_konfigurasi') is null
     or to_regprocedure('public.sg_kepengurusan_terapkan(jsonb, boolean, boolean)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-dewan-penegak.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

alter table public.notifikasi drop constraint if exists notifikasi_jenis_check;
alter table public.notifikasi add constraint notifikasi_jenis_check
  check (jenis in ('ajukan','alih','mulai','hasil','pengingat','lama','sesi','surat','tes'));

`;
const akhir = `

revoke all on function public.sg_notifikasi_tes() from public, anon, authenticated;
grant execute on function public.sg_notifikasi_tes() to authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-tes-notifikasi', kepala + fungsi + akhir);
