// Menyusun supabase/migrasi/2026-09-eskalasi.sql dari bagian di supabase/sumber/inti.sql (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-09-eskalasi.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

const pengingat = gantiFungsi(ambil('-- ===== Eskalasi (tahap L5): pengingat =====', '-- ===== akhir pengingat eskalasi =====', true));
const fungsi = gantiFungsi(ambil('-- ===== Eskalasi (tahap L5): fungsi =====', '-- ===== akhir fungsi eskalasi =====', true));

const kepala = `-- ============================================================================
-- MIGRASI: Eskalasi tidak bergerak (tahap L5). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi cadangan (dan yang sebelumnya). Isi:
--   * profiles.whatsapp (kolom baru, boleh kosong): nomor WhatsApp diisi SENDIRI oleh pemilik akun lewat
--     sg_profil_whatsapp_atur(text); hanya format yang diperiksa (sama seperti Telepon pada Data Gudep).
--   * notifikasi.jenis menerima nilai 'eskalasi'.
--   * sigarda.eskalasi_mulai_sku/absensi/iuran, eskalasi_tingkat, eskalasi_judul/isi/tab, eskalasi_proses(): tangga
--     pengingat (ramah/tegas/mendesak) untuk Penegak yang tidak ada aktivitas SKU >=7 hari, atau 2x berturut-turut
--     Alpa/belum iuran. Dipanggil dari sigarda.notif_pengingat() (pengingat harian 07.00 WIB, otomatis di luar jam
--     senyap 22.00-04.00 WIB tanpa logika tambahan). Tingkat mendesak (hari ke-8+) juga memberi tahu semua pengurus.
--   * sg_eskalasi_daftar(): daftar Penegak tingkat mendesak untuk menu baru "Tindak Lanjut" (Pembina, Dewan Ambalan,
--     Admin), dengan tombol WhatsApp manual (wa.me, TANPA verifikasi nomor benar-benar aktif -- itu perlu layanan
--     WhatsApp Business API berbayar, di luar cakupan).
-- sigarda.notif_pengingat() ditulis ulang penuh (create or replace); bagian pengingat lain (pengujian/sesi besok,
-- pengajuan lama, cadangan) tidak berubah.
-- Edge Function TIDAK berubah dan tidak perlu di-deploy ulang. TIDAK menghapus data yang ada. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: cadangan (migrasi terakhir sebelum ini) sudah ada.
do $$
begin
  if to_regprocedure('public.sg_cadangan_admin()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-cadangan.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

alter table public.profiles add column if not exists whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9 +()./-]{8,20}$');

alter table public.notifikasi drop constraint if exists notifikasi_jenis_check;
alter table public.notifikasi add constraint notifikasi_jenis_check
  check (jenis in ('ajukan','alih','mulai','hasil','pengingat','lama','sesi','surat','tes','eskalasi'));

`;
const akhir = `

revoke all on function public.sg_profil_whatsapp_atur(text), public.sg_eskalasi_daftar() from public, anon, authenticated;
grant execute on function public.sg_profil_whatsapp_atur(text), public.sg_eskalasi_daftar() to authenticated;
-- Fungsi sigarda.eskalasi_* baru: hak dijalankan ulang di sini (bukan hanya sekali di migrasi notifikasi) karena grant
-- "all functions in schema" hanya berlaku pada fungsi yang SUDAH ADA saat dijalankan, tidak retroaktif untuk fungsi baru.
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-09-eskalasi', kepala + pengingat + '\n\n' + fungsi + akhir);
