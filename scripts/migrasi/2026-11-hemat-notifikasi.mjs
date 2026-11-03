// Menyusun supabase/migrasi/2026-11-hemat-notifikasi.sql dari bagian di supabase/sumber (satu sumber kebenaran).
// Jalankan: node scripts/migrasi/2026-11-hemat-notifikasi.mjs
import { ambil, gantiFungsi, tulisMigrasi } from './bantu.mjs';

const bersihkan = gantiFungsi(ambil('-- ===== Hemat ruang notifikasi: pembersihan =====', '-- ===== akhir pembersihan notifikasi =====', true));
// notif_pengingat ditulis ulang penuh (penanda kesembilan membungkus fungsi yang sama dengan delapan penanda sebelumnya).
const pengingat = gantiFungsi(ambil('-- ===== Hemat ruang notifikasi: pengingat =====', '-- ===== akhir pengingat hemat notifikasi =====', true));
const eskalasi = gantiFungsi(ambil('-- Hemat ruang (paket Free 500 MB;', '-- Daftar Penegak yang perlu tindak lanjut'));

const kepala = `-- ============================================================================
-- MIGRASI: hemat ruang basis data untuk notifikasi. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-10-pin-tanpa-sesi.sql; lihat README). Latar: tabel notifikasi menjadi tabel
-- terbesar (lebih dari separuh jatah 500 MB paket Free) karena pengingat Tindak Lanjut mengirim satu notifikasi per Penegak per jenis
-- KE SETIAP pengurus SETIAP hari, dan notifikasi baru dihapus sesudah 90 hari. Isi:
--   * sigarda.eskalasi_proses ditulis ulang: Penegak diberi tahu sekali per tingkat, lalu paling banyak seminggu sekali pada tingkat
--     mendesak; pengurus menerima SATU ringkasan ("Perlu tindak lanjut: N Penegak") hanya bila ada yang baru mendesak atau sudah seminggu.
--   * sigarda.notifikasi_bersihkan (baru) dipanggil pengingat harian: menghapus yang sudah dibaca > 30 hari, semua > 60 hari,
--     pengingat eskalasi > 14 hari, dan di luar 200 terbaru per penerima (aplikasi hanya menampilkan 60 terbaru).
--   * sigarda.notif_pengingat ditulis ulang (tanda tangan sama) untuk memanggilnya.
--   * Pembersihan SEKALI sekarang, termasuk notifikasi Tindak Lanjut bentuk lama ke pengurus (sudah tergantikan ringkasan).
-- Data aplikasi lain TIDAK berubah. Edge Function TIDAK berubah. Aman diulang.
--
-- SESUDAH migrasi ini, ruang yang dibebaskan baru kembali ke jatah setelah tabel dipadatkan. Jalankan SATU KALI di SQL Editor,
-- sebagai query TERSENDIRI (tidak bisa di dalam migrasi karena VACUUM tidak boleh berada dalam transaksi):
--   vacuum full public.notifikasi;
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regprocedure('public.sg_pin_periksa_internal(uuid,text)') is null or to_regprocedure('sigarda.eskalasi_proses()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-10-pin-tanpa-sesi.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

${bersihkan}

${pengingat}

${eskalasi}

-- Pembersihan sekali sekarang (tanpa menunggu pengingat harian berikutnya). Notifikasi Tindak Lanjut bentuk lama ke pengurus
-- (satu per Penegak per jenis per hari) tergantikan ringkasan; daftarnya tetap lengkap di menu Tindak Lanjut.
delete from public.notifikasi where kunci like 'eskalasi-p:%' and kunci !~ '^eskalasi-p:[0-9]{4}-[0-9]{2}-[0-9]{2}$';
select sigarda.notifikasi_bersihkan();

-- Fungsi sigarda.* diperbarui: hak dijalankan ulang di sini.
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
`;
tulisMigrasi('2026-11-hemat-notifikasi', kepala);
