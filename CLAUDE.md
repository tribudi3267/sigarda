# SIGARDA (Gudep SMAN 1 Bukateja): panduan untuk Claude

Aplikasi web Sistem Informasi Garuda dan SKU Penegak. React 18 + Vite 5 + Tailwind 3; Supabase (Postgres + Auth + satu Edge Function). Situs: https://sigarda.smabukateja.sch.id/ (GitHub Pages, terbit otomatis saat `git push` ke `main`). Rincian fitur dan pemasangan ada di README.md; berkas ini hanya memuat yang perlu diketahui sebelum mengubah kode.

## Aturan kerja (dari pemilik proyek)
- **Semua balasan, komentar, teks layar, dan pesan commit dalam Bahasa Indonesia.** Pengguna adalah guru/Pembina Pramuka, bukan pemrogram.
- **Jangan commit atau push kecuali diminta.** Bila diminta: pesan commit diakhiri baris `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`; tulis pesan ke berkas lalu `git commit -F <berkas>` (PowerShell merusak pesan multibaris).
- Migrasi SQL dijalankan **pengguna** di SQL Editor Supabase; Edge Function di-deploy pengguna. Jangan mengetik PIN atau kata sandi asli. Uji di mode lokal dengan akun contoh.
- Isi instrumen penilaian (panduan penguji) **rahasia** dan tidak boleh masuk repositori. `.env.local` jangan di-commit.
- Sebelum menyatakan selesai: `npm run build` dan `npm run uji` harus lulus.
- Rencana pengembangan aktif ada di memori proyek (`ide-penugasan-penguji-per-kelas.md`): satu fase per sesi.

## Arsitektur (jangan dilanggar)
- **RLS hanya baca.** Semua penulisan lewat fungsi `sg_*` (`security definer`) yang memeriksa peran di server; fungsi bantu ada di skema `sigarda`. Klien tidak pernah menulis tabel langsung.
- **Sumber kebenaran skema: `supabase/sumber/inti.sql`** (panjang, gunakan Grep terarah, jangan dibaca utuh). `npm run skema` membuat `supabase/skema.sql` (jangan diedit tangan; hanya untuk database baru).
- **Database yang sudah berjalan diubah lewat migrasi aditif** `supabase/migrasi/*.sql` (idempoten, tanpa menghapus data). Susun dari blok bermarka di inti.sql dengan `scripts/migrasi/bantu.mjs` (contoh: `scripts/migrasi/2026-09-iuran.mjs`). Jangan mengulang migrasi lama sesudah yang lebih baru (beberapa menimpa fungsi yang sama). Dokumentasikan urutan di README, bagian "Memperbarui database yang sudah berjalan".
- Edge Function `supabase/functions/sigarda/index.ts`: login, akun, PIN, dan pencatatan hasil uji setelah PIN penguji diverifikasi. Ubah **isi** fungsi SQL tanpa mengubah tanda tangannya agar tidak perlu deploy ulang.
- Klien: `src/lib/api.js` satu-satunya pintu ke Supabase; `src/lib/mapDb.js` memetakan baris ke bentuk halaman; `src/context/AppContext.jsx` memuat state dan aksi; logika murni di `src/lib/*Logic.js` (dicerminkan dengan SQL dan dijaga pengujian); halaman di `src/pages`, komponen di `src/components`. Menu per peran di `src/App.jsx` (`buatNav`).
- Peran: Penegak (`peserta`; peran turunan Calon Bantara/Laksana/Garuda dihitung dari progres), Dewan Ambalan dan Pembina (`penguji`, dibedakan `jabatan`), Admin Gudep (`admin`).
- **Kelas Penegak = rombel baku** `X-01..X-10`, `XI-01..XI-10`, `XII-01..XII-10` (`sigarda.rombel_sah`, cermin di `src/lib/rombelLogic.js`); server menolak selain itu saat buat akun/ubah, data lama ("X") dibiarkan sampai dirapikan lewat "Perbarui rombel". Penugasan penguji per rombel per tahun ajaran (`penugasan_rombel`, diatur Admin lewat `sg_penugasan_*`, Pembina hanya melihat); **belum ditegakkan** (fase 1b). Pembina punya `profiles.agama`; Dewan dan Admin tidak.

## Perintah
- `npm run dev:lokal` (PGlite di browser, akun contoh tertera di layar login; wajib ganti PIN saat masuk pertama; "Kembalikan data contoh" bila skema lokal usang). `npm run build`. `npm run skema`.
- **`npm run uji`** menjalankan semua pengujian di `uji/` (Postgres sungguhan lewat PGlite). Sebagian: `npm run uji -- iuran api`. `PENUH=40` menampilkan 40 baris terakhir keluaran. Tiap berkas mencetak `ok`/`GAGAL` dan satu baris RINGKASAN.
- Pengujian migrasi memakai skema lama dari git: `baru('git:<commit>')` = `supabase/skema.sql` pada commit itu (pakai commit TEPAT sebelum perubahan). Contoh: `uji/migrasi-penugasan.mjs` (`git:b804088`); uji migrasi lama membandingkan dengan skema commit sesudahnya, bukan `skema.sql` terbaru. Akhir baris disamakan LF sebelum membandingkan md5 fungsi (checkout Windows = CRLF). Di git worktree, `npm run uji` memakai `node_modules` repo induk; untuk `dev:lokal` di worktree perlu `server.fs.allow` ke repo induk (konfigurasi sementara, jangan di-commit). Pengujian `instrumen` dilewati kecuali `ISI_INSTRUMEN=<jalur SQL isi instrumen>`.
- Tambah pengujian baru sebagai `uji/<nama>.mjs` (impor `../src/...`; jalur kerja `process.cwd()`; berkas sementara di `.uji/tmp`).

## Konvensi tampilan (sudah disetujui pengguna; jaga konsisten untuk fitur baru)
- Menu samping kiri berkelompok (md ke atas); menu bawah ponsel yang dapat digeser dengan panah emas berdenyut; ikon menu aktif berkilau emas (`.ikon-aktif`). Kilau emas memakai kelas yang sudah ada (`.glow-emas`, `.glow-emas-tetap`, `.panah-geser-*` di `src/index.css`); jangan membuat gaya cahaya baru.
- Navigasi panjang di ponsel: bilah melayang `sticky top-[3.75rem]` di bawah header, dropdown menumpang (`absolute`), target gulir `scroll-mt-36 lg:scroll-mt-24`; di layar lebar berupa kolom samping sticky (contoh: `src/pages/Materi.jsx`).
- Deretan lencana/chip harus **satu baris** di semua lebar (sisanya disembunyikan di balik tombol `+N`): `src/components/TerkaitButir.jsx`.
- Tabel lebar dibungkus `overflow-x-auto` (kini otomatis `position: relative` di `index.css`). Elemen `absolute` (mis. `sr-only`) yang lolos dari pembungkus melebarkan halaman dan membuat menu bawah bergeser di ponsel.
- Uji halaman baru di lebar 320, 375, dan 768px: ukur `document.documentElement.scrollWidth` dengan `html,body{overflow-x:visible !important}` disuntik sementara; nilainya harus sama dengan lebar layar. Emulator browser pane menahan animasi dan screenshot-nya terpotong: ukur lewat DOM, minta pengguna memeriksa kilau di HP.
- Peran, dan hak, ditegakkan di server; tampilan hanya menyembunyikan tombol.

## Lingkungan Windows / PowerShell
- Ubah kode dengan alat Edit/Write, bukan string PowerShell (backtick dan `${}` rusak). `&&` tidak tersedia. Segarkan PATH di tiap panggilan: `$env:Path=[System.Environment]::GetEnvironmentVariable('Path','Machine')+';'+[System.Environment]::GetEnvironmentVariable('Path','User')`.
- Menghentikan dev server: cari proses pada port lalu `Stop-Process` (dev:lokal memakai `--port 5199 --strictPort`).

## Hemat token
Grep terarah pada inti.sql; jangan membaca berkas besar utuh; hindari screenshot berulang; jalankan pengujian penuh sekali per fase, pengujian terkait untuk iterasi.
