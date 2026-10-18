# Serah-terima: SIGARDA (Sistem Informasi Garuda dan SKU Penegak, Gudep SMAN 1 Bukateja)

Disusun 18 Okt 2026 untuk melanjutkan pekerjaan di akun Claude yang baru. Berkas ini menggantikan riwayat percakapan. Baca juga `CLAUDE.md` (aturan kerja, arsitektur, dan catatan per fitur) dan `README.md` (fitur dan pemasangan).

Sumber: `CLAUDE.md` dan riwayat git lokal folder `sku-bukateja` (repositori `tribudi3267/sigarda`, **publik**), serta dokumen peluncuran. Hal yang tidak bisa dipastikan dari berkas ditandai **[perlu dikonfirmasi]**.

**Repositori ini publik. Jangan menaruh kata sandi, kunci, alamat sambungan basis data, instrumen penilaian, atau isi folder `_lokal/` di dalamnya.**

## 1. Status terakhir

- **Aplikasi sudah berjalan di produksi** di https://sigarda.smabukateja.sch.id/ (GitHub Pages; terbit otomatis saat `git push` ke `main`). Stack: React 18 + Vite 5 + Tailwind 3; Supabase (Postgres + Auth + satu Edge Function `sigarda`, ditambah `notif-push` dan `galeri-sampul`).
- **Diluncurkan dan disosialisasikan 2 Okt 2026** di perpustakaan sekolah, dihadiri 78 peserta (Pembina, Dewan Ambalan A'36, Tekpram, Bina Damping, perwakilan Pinsa dan Caba tiap kelas). Demo berjalan lancar, belum ada laporan bug saat itu. Berita liputannya ditulis untuk beranda.
- **Peran:** Penegak (`peserta`), Pembina (`penguji`), Admin Gudep (`admin`); Dewan Ambalan adalah atribut akun Penegak (`profiles.jabatan_dewan`).
- **Fitur utama yang sudah ada:** SKU Bantara dan Laksana (pengajuan, pengujian oleh Pembina, kode verifikasi dan QR, cetak kartu dan Surat Tanda Lulus), absensi latihan Jumat dan iuran bumbung, agenda tahunan dan pengingat, jalur Garuda (TKK, SPG, kelayakan, portofolio 26 dokumen, portofolio format Kwarcab, salinan beku), pra-uji berjenjang, kepengurusan Dewan, pelantikan dan Saka, perlindungan anggota (Safe From Harm), laporan berjenjang tahunan, menu Bantuan dengan panduan bergambar, notifikasi dan PWA, **halaman muka publik** dengan **Kelola Beranda** (berita, prestasi, galeri, media sosial, FAQ, kontak), halaman berita statis dan sitemap.
- **Pekerjaan terbaru (8 sampai 17 Okt 2026):**
  - 8 Okt: editor teks berformat untuk isi berita di Kelola Beranda (isi tetap teks biasa berpenanda ringan mirip Markdown, bukan HTML).
  - 9 Okt: nama penulis berita tampil di beranda (migrasi `2026-10-penulis-berita.sql`; digabung dengan PR #77).
  - 17 Okt: formulir "tambah di atas daftar" pada Kelola Beranda untuk layar sempit (commit terakhir di komputer, cabang `claude/tambah-di-atas`). **[perlu dikonfirmasi]** bahwa cabang ini sudah digabung ke `main` (pemilik menyatakan semua cabang sudah di-commit, push, dan merge).
  - Hemat log Supabase (paket Free: 1 GB log ingestion per siklus): Fase 1 dan 2 selesai Okt 2026; rencananya ada di berkas memori `rencana-hemat-log-supabase.md`.
- **Operasional otomatis yang berjalan:** penerapan migrasi otomatis lewat GitHub Actions (aktif sejak 30 Sep 2026; migrasi baru disetujui di lingkungan `produksi`), pemeriksaan pemasangan harian, cadangan mingguan terenkripsi (Sabtu 05.00 WIB) ke Google Drive sekolah lewat Google Apps Script, dan terbit ulang situs saat berita terbit.

## 2. Yang sedang dikerjakan

Memori proyek sudah disalin ke `docs/memori/` (18 Okt 2026): `MEMORY.md` (indeks), `rencana-skala-500-pengguna.md`, dan `rencana-hemat-log-supabase.md`. Dua rencana aktif dari sana:

1. **Skala 400-500 pengguna bersamaan dan kemungkinan pindah dari Supabase** (brainstorm 17 Okt 2026, belum ada kode). Pemilik ingin SIGARDA tangguh untuk 400-500 pengguna sekaligus dan berencana pindah dari Supabase (belum pasti; masih paket Free, region produksi `ap-northeast-1` Tokyo). Dugaan penyebab terbesar kegagalan muat: batas laju login Auth per IP (semua login lewat Edge Function `sigarda` = satu IP), CPU instance kecil dan hash PIN, serta koneksi database. Alat uji beban sudah dibuat di `scripts/uji-beban/` (panduan `docs/uji-beban.md`). **Langkah pemilik berikutnya:** buat akun dan proyek Supabase UJI terpisah (jangan mengotori produksi), pasang skema dan Edge Function, jalankan `data_uji_beban.sql` dan `uji_beban_pin_seragam.sql`, lalu `node scripts/uji-beban/skenario.mjs periksa` dan `tangga --jeda=300`; hasilnya menentukan Supabase Pro atau self-host.
2. **Hemat log Supabase.** PR 69 dan 71 sudah digabung. Berikutnya Fase 0 (ukur ujicoba berikutnya, tanpa kode) dan Fase 1 (cache materi, gudep, pengaturan iuran di peramban); Fase 2 sampai 6 diputuskan dari hasil ukur. Detail ada di `docs/memori/rencana-hemat-log-supabase.md`.

**Catatan:** CLAUDE.md menyebut `ide-penugasan-penguji-per-kelas.md` dan `rencana-pra-uji-berjenjang.md` sebagai rencana di memori proyek, tetapi dua berkas itu **tidak ada** di memori yang disalin. **[perlu dikonfirmasi]** apakah rencananya sudah selesai atau berkasnya ada di folder memori lain. Jangan menganggap ada rencana penugasan penguji yang terbuka sebelum berkasnya ditemukan.

## 3. Langkah berikutnya

1. Lanjutkan rencana skala 500 pengguna dan hemat log (bagian 2). Sebelum mengubah pemuatan data di `AppContext.muatSemua`, baca peringatan di `docs/memori/rencana-hemat-log-supabase.md`: konsumen datanya banyak dan uji penuh `npm run uji` butuh lebih dari 10 menit (jalankan di latar belakang, satu proses uji saja).
2. Satu fase per sesi. Sebelum menyatakan selesai: `npm run build` dan `npm run uji` harus lulus.
3. Pantau laporan dari pengguna sejak peluncuran 2 Okt; lembar umpan balik dari sosialisasi diminta dikumpulkan untuk penyempurnaan.
4. Terus patuhi batas log Supabase paket Free: jangan menambah permintaan berkala atau permintaan baru pada pemuatan data tanpa membaca bullet "Hemat log Supabase" di CLAUDE.md.
5. Pastikan dua tindakan manual pemilik terpenuhi bila ada perubahan Edge Function atau migrasi: Edge Function di-deploy oleh pemilik; migrasi baru didaftarkan di README (bagian "Memperbarui database yang sudah berjalan") dan menunggu persetujuan di lingkungan `produksi`.

## 4. Keputusan penting yang sudah diambil

- **RLS hanya baca**; semua penulisan lewat fungsi `sg_*` (`security definer`) yang memeriksa peran di server. Klien tidak menulis tabel langsung.
- **Sumber kebenaran skema** = `supabase/sumber/*.sql` (46 berkas bernomor); basis data yang sudah berjalan diubah lewat migrasi aditif di `supabase/migrasi/`.
- **Identitas gudep dan pejabat diatur Admin lewat menu Data Gudep**, bukan di kode.
- **Isi instrumen penilaian (panduan penguji) rahasia** dan tidak boleh masuk repositori.
- **Migrasi SQL dijalankan pemilik**, Edge Function di-deploy pemilik; jangan mengetik PIN atau kata sandi asli; uji di mode lokal dengan akun contoh.
- **Aturan kerja:** semua balasan, komentar, teks layar, dan pesan commit dalam Bahasa Indonesia; jangan commit atau push kecuali diminta; pesan commit ditulis ke berkas lalu `git commit -F`.
- Kelas Penegak = rombel baku; Pinsa (pimpinan sangga) adalah atribut akun (`profiles.pinsa`, satu per kelas dan sangga).
- Kolom `isi` berita adalah teks berpenanda ringan, bukan HTML.
- Penerapan otomatis migrasi dan cadangan mingguan diputuskan pemilik 30 Sep 2026; jadwal terbit harian (`schedule` di `deploy.yml`) dicabut dan diganti terbit ulang saat berita terbit.

## 5. Yang harus dilakukan sebelum pindah akun

- **Memori proyek sudah disalin** ke `docs/memori/` (18 Okt 2026). Commit sendiri bersama berkas ini. Jangan meminta kunci atau PIN di percakapan.
- **Jangan salin folder `_lokal/`** (di luar git, hanya di laptop). Cadangan data ada di `Cadangan-SIGARDA` di profil pengguna; simpan di tempat aman.
- Rahasia di GitHub Actions (`SIGARDA_DB_URL`, `SIGARDA_DB_URL_TULIS`, `SIGARDA_KUNCI_ENKRIPSI`, dan rahasia cadangan) berada di pengaturan repositori, bukan di kode; akun baru tidak perlu menyalinnya, tetapi harus punya akses ke repositori.
- Berkas `.env.local` dan `.env.lokal` tidak ikut git. Simpan salinannya di tempat aman.
