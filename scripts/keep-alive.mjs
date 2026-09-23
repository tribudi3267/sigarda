/**
 * Keep-alive Supabase: satu permintaan kecil ke database secara berkala agar proyek Free tier tidak dijeda (paused) karena 7 hari tanpa aktivitas.
 *
 * Permintaannya sungguhan, bukan pura-pura: memanggil fungsi publik `sg_gudep_publik` (nama gudep, ambalan, sekolah, kota; sama dengan yang dibaca
 * halaman masuk tanpa login) lewat REST API, sehingga API dan basis data benar-benar dipakai. Hanya memakai kunci anon/publishable yang memang
 * publik; TIDAK PERNAH memakai kunci service_role. Gagal (proyek terjeda, URL salah, kunci salah) = keluar dengan kode 1, sehingga GitHub Actions
 * menandai proses gagal dan mengirim email pemberitahuan.
 *
 * Berkas ini hanya pintu masuk perintah; logikanya di scripts/keep-alive-lib.mjs.
 * Dijalankan otomatis oleh .github/workflows/keep-alive.yml (tiap hari). Bisa juga dijalankan tangan:
 *   VITE_SUPABASE_URL=https://xxxx.supabase.co VITE_SUPABASE_ANON_KEY=... node scripts/keep-alive.mjs
 * (nama SUPABASE_URL dan SUPABASE_ANON_KEY juga diterima). Dijaga uji/keep-alive.mjs.
 *
 * Catatan: ini mencegah penjedaan otomatis, bukan jaminan dari Supabase; kebijakan Free tier dapat berubah. Proyek yang sudah terjeda TIDAK bangun
 * sendiri oleh skrip ini: pulihkan lewat Dashboard Supabase (tombol Restore project).
 */
import { jalankan } from './keep-alive-lib.mjs';

process.exitCode = await jalankan();
