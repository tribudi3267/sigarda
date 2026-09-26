# Catatan arsitektur SIGARDA

Untuk developer yang meneruskan proyek ini. Dapat dibaca dalam sekitar 15 menit; rincian ada di dokumen yang ditautkan. Per 26 September 2026.

Urutan baca yang disarankan bagi orang baru: bagian 1 sampai 3 di sini, lalu [README.md](../README.md) (fitur dan pemasangan), lalu [CLAUDE.md](../CLAUDE.md) (aturan arsitektur yang tidak boleh dilanggar).

## 1. Gambaran besar

SIGARDA (Sistem Informasi Garuda dan SKU Penegak) adalah aplikasi web Gugus Depan SMAN 1 Bukateja. Fungsinya: mencatat dan menguji SKU Penegak (Bantara dan Laksana), absensi latihan,
iuran, portofolio dan berkas Calon Garuda, pelantikan, TKK, SPG, sidang Dewan Kehormatan, raport, laporan tahunan, dan perlindungan anggota. Situs: https://sigarda.smabukateja.sch.id/.
Skala yang dirancang: sekitar 700 Penegak aktif, 150 alumni, dan beberapa Pembina.

**Peran** (hak ditegakkan di server, tampilan hanya menyembunyikan tombol):

| Peran | Bentuknya di data |
|---|---|
| Penegak | akun `role = 'peserta'`; peran turunan Calon Bantara/Laksana/Garuda dihitung dari progres |
| Dewan Ambalan | BUKAN akun terpisah: atribut `profiles.jabatan_dewan` pada akun Penegak aktif; Penegak berjabatan memilih tampilan Penegak atau Dewan |
| Pembina | akun `role = 'penguji'`, jabatan Pembina; satu-satunya penguji resmi bila pra-uji hidup |
| Admin Gudep | akun `role = 'admin'`; mengelola anggota, Data Gudep, naik kelas, cadangan |

```
 Peramban (React + Vite, PWA hanya untuk push)
    |  baca: tabel lewat PostgREST (dibatasi RLS)     tulis: RPC fungsi sg_* (security definer)
    v                                                  login, akun, PIN, catat hasil uji:
 Supabase --------------------------------------------- Edge Function `sigarda`
    |  Postgres: tabel + RLS + fungsi sg_* + pemicu     Web Push: Edge Function `notif-push`
    |  pg_cron: pengingat harian, keep-alive             (dipanggil pg_net dari pemicu)
    |  Auth: satu email `.invalid` per akun (NIS/nama pengguna + PIN)
 GitHub Pages (situs statis)     GitHub Actions: deploy, uji, catatan rilis, keep-alive
```

## 2. Teknologi

React 18, Vite 5, Tailwind 3; Supabase (Postgres, Auth, dua Edge Function Deno); GitHub Pages dan GitHub Actions. Pengujian memakai Postgres sungguhan di dalam proses Node
(PGlite), dan mode lokal (`npm run dev:lokal`) memakai PGlite di peramban, jadi hampir seluruh aplikasi dapat dijalankan dan diuji tanpa Supabase.

Perintah utama: `npm run dev:lokal` (jalankan lokal), `npm run build`, `npm run uji` (semua pengujian; `npm run uji -- <nama>` untuk sebagian), `npm run skema` dan `npm run periksa`
(bangun ulang skema), `npm run profil` dan `npm run simulasi:beban` (kinerja), `npm run catatan-rilis`. Mode `?masuk=<akun>` di lokal masuk tanpa PIN (tidak masuk build produksi).

## 3. Peta kode

| Tempat | Isi |
|---|---|
| `supabase/sumber/*.sql` | **Sumber kebenaran skema**, sekitar 50 berkas bernomor per modul (`1x` tabel, `3x` fungsi bantu, `40` RLS baca, `5x/6x` aksi, `70` hak akses). Edit di sini saja. Peta: `supabase/sumber/README.md` |
| `supabase/skema.sql`, `supabase/demo/periksa_pemasangan.sql` | Dibuat otomatis oleh `npm run skema` dan `npm run periksa`; jangan diedit tangan |
| `supabase/migrasi/*.sql` | Perubahan untuk database yang SUDAH berisi data (aditif, aman diulang), disusun oleh `scripts/migrasi/*.mjs` dari blok bermarka di sumber |
| `supabase/riwayat/*.sql.gz` | Salinan skema lama dipakai uji migrasi (jangan dihapus) |
| `supabase/functions/sigarda`, `notif-push` | Dua Edge Function; hanya yang tidak bisa dikerjakan SQL (Auth admin, kirim Web Push) |
| `src/lib/api.js` | **Satu-satunya pintu ke Supabase** |
| `src/lib/mapDb.js` | Baris tabel menjadi bentuk yang dipakai halaman |
| `src/context/AppContext.jsx` | State global dan aksi (data yang dimuat sesuai izin peran) |
| `src/lib/*Logic.js` | Logika murni tanpa React; sebagian dicerminkan dengan SQL (bagian 6) |
| `src/pages`, `src/components`, `src/hooks` | Halaman (dimuat malas kecuali beranda dan dashboard), komponen, hook pemuat data per fitur |
| `src/data` | Katalog tetap: butir SKU resmi, TKK, SPG, dokumen portofolio, panduan, registri peraturan |
| `src/lokal` | Backend lokal (klien tiruan di atas PGlite) dan data contoh; bukan untuk produksi |
| `uji/` | Sekitar 130 berkas pengujian; tiap fitur punya uji server, uji klien, dan uji migrasi |
| `docs/` | Cermin klien-server, laporan simulasi, dokumen ini |

## 4. Model data dan akses

- **RLS hanya baca.** Klien tidak pernah menulis tabel langsung. Semua penulisan lewat fungsi `sg_*` (`security definer`) yang memeriksa peran di server; fungsi bantu ada di skema
  `sigarda` (mis. `sigarda.pengurus()`, `pembina_atau_admin()`, `bisa_menguji()`, `hari_ini()`).
- **Kelompok tabel:** identitas dan akun (`profiles`, `tanggal_lahir`, `penegak_isian`); SKU (`sku_progress`, `sku_riwayat`, `sku_pra_uji`, sesi ujian); kegiatan (`absensi_*`, `iuran*`,
  `agenda`, `kegiatan_usulan`); Garuda (`pelantikan`, `saka_anggota`, `tkk_*`, `spg_penetapan`, `tim_penilai*`, `garuda_tahap`, `portofolio*`, `portofolio_snapshot`,
  `garuda_berkas_token`); organisasi (`penugasan_rombel`, `bina_damping`, `pengukuhan_dewan`, `sidang_dk`); lainnya (`notifikasi`, `push_*`, `pengaturan`, `sfh_catatan`, `dokumen_terbit`).
- **Status anggota:** `aktif`, `nonaktif`, `alumni`. Nonaktif dan alumni hanya bisa dilihat dan dicetak; penolakan penulisan dilakukan SATU pemicu (`sigarda.tolak_peserta_tak_aktif`) pada
  tabel kegiatan, bukan pengecekan di tiap fungsi. Tabel baru yang menyimpan `peserta_id` untuk kegiatan wajib diberi pemicu yang sama.
- **Tabel tanpa hak baca langsung:** yang berisi rahasia atau data sensitif (`push_konfigurasi`, `push_langganan`, `garuda_berkas_token`, `bina_damping`, `sertifikat_tingkat`) hanya lewat fungsi.
- **Identitas gudep dan pejabat** (nama, nomor, Pembina/Ka Gudep, NTA) diatur Admin di menu Data Gudep (pengaturan `gudep.data`), tidak ada di kode.

## 5. Keputusan desain dan alasannya

Yang sengaja begini; jangan diubah tanpa bertanya kepada pemilik.

| Keputusan | Alasan |
|---|---|
| Dewan Ambalan = atribut akun Penegak, bukan akun terpisah | Satu orang satu akun; jabatan berganti tiap tahun; jabatan dicabut otomatis saat nonaktif/alumni |
| Uji resmi SKU hanya Pembina; pra-uji oleh Pinsa dan Bina Damping hanya rekomendasi (sakelar `pra_uji.aktif`, bawaan MATI) | AD/ART 2023 (Pasal 33 dan 35); pra-uji menyaring, tidak menentukan kelulusan |
| Notifikasi dibuat pemicu di basis data, isi singkat dan TANPA hasil lulus/ulang | Notifikasi tampil di layar kunci HP bersama; hasil hanya di dalam aplikasi (pengecualian: pra-uji) |
| Keluar dari akun menghentikan push di perangkat itu | Privasi HP yang dipakai bergantian |
| `public/sw.js` hanya push dan klik notifikasi, tanpa cache dan tanpa fetch handler | Menghindari versi aplikasi usang yang tersangkut; pembaruan lewat `version.json` dan ajakan "Muat ulang" |
| Tanggal lahir di tabel terpisah, bukan kolom `profiles` | RLS `baca_profil` memperlihatkan Penegak berjabatan kepada semua Penegak; tanggal lahir hanya untuk pemilik dan pengurus |
| `penegak_isian` (alamat, keluarga, kesehatan) hanya dibaca pemilik, Pembina, Admin; bukan Dewan | Penegak berjabatan Dewan tidak boleh membaca data pribadi teman |
| Admin hanya mengisi nama, NIS, rombel saat membuat Penegak; sisanya diisi Penegak sendiri | Beban entri data admin; data lebih akurat dari pemiliknya |
| Laporan kejadian Safe From Harm TIDAK disimpan di aplikasi | Rahasia menurut Jukran 004/2021; ditangani Komite Perlindungan di luar aplikasi |
| Gerbang Calon Garuda (kelas, usia, kuota) hanya peringatan | Keputusan pemilik; aturan berubah tiap tahun di Kwarcab |
| Kemajuan TKK menuju ambang, hasil otomatis SPG, dan gerbang dihitung HANYA di klien | Aturan lokal Kwarcab berubah-ubah; tidak perlu migrasi tiap perubahan |
| Dokumen cetak memakai `window.print()` dan CSS cetak, tanpa pustaka PDF; tanda tangan dan stempel basah | Sederhana, tanpa salinan yang usang; QR hanya bukti terbit |
| Jenis kelamin diisi lewat fungsi terpisah SESUDAH akun dibuat | Edge Function `sigarda` tidak membawanya (tanda tangan `sg_profil_buat_internal` dijaga agar tidak perlu deploy ulang) |
| "Hari ini" di klien dan server = WIB (`format.hariIni`, `sigarda.hari_ini()`) | Hindari selisih tanggal UTC di jam sekolah |
| Isi instrumen penilaian (panduan penguji) tidak di repositori | Rahasia; hanya dimuat ke basis data lewat skrip |

## 6. Aturan yang ada di dua tempat (cermin klien-server)

Sebagian validasi dan aturan ada di klien (untuk pesan cepat) dan di server (yang menegakkan). Daftarnya di [docs/cermin-klien-server.md](cermin-klien-server.md). Kaidahnya: **cermin baru wajib
punya uji yang membandingkannya LANGSUNG dengan SQL pada kisi masukan**, bukan sekadar nilai tetap di klien. Predikat peran di klien hanya lewat `src/lib/hakLogic.js`.

## 7. Menambah atau mengubah fitur (daftar periksa)

1. Ubah sumber di `supabase/sumber/` (tabel di berkas tabel modulnya, fungsi di berkas aksi/bantu modul yang sama). Jangan menyusun ulang urutan.
2. `npm run skema` lalu `npm run periksa`.
3. Untuk database yang sudah berjalan: tulis `scripts/migrasi/<tanggal>-<nama>.mjs` (blok bermarka di sumber), jalankan, daftarkan di README (bagian "Memperbarui database yang sudah berjalan",
   urutan = urutan menjalankan). Sebelum menulis uji migrasi: `node scripts/simpan-skema-lama.mjs <hash commit tepat sebelum migrasi>`.
   Tabel baru: `revoke all ... from anon, authenticated` di migrasi. Fungsi `sigarda.*` baru: ulangi `revoke/grant` skema. Tabel data isian baru: tambahkan ke `sg_cadangan_admin()`.
4. Klien: `api.js` (pintu), `mapDb.js` (pemetaan), `*Logic.js` (logika murni), halaman dimuat malas, menu di `src/App.jsx` (`buatNav`), hak lewat `hakLogic.js`.
5. Aturan yang dicerminkan: uji perbandingan langsung ke SQL dan catat di `docs/cermin-klien-server.md`.
6. Peraturan kepramukaan: tampilkan judul dan tautan lewat `SumberPeraturan` dari registri `src/data/peraturanData.js`.
7. Perbarui panduan pengguna `src/data/panduanData.js` (tidak ada uji yang menangkap panduan yang ketinggalan).
8. `npm run build` dan `npm run uji` harus lulus; JS awal tidak melebihi 150 kB gzip (`npm run profil`).

## 8. Rilis dan operasional

- **Situs terbit otomatis** saat `git push` ke `main` (GitHub Actions `deploy.yml`). PR menjalankan `uji.yml`, dan `catatan-rilis.yml` memasang komentar yang mendaftar migrasi/Edge Function baru.
- **Migrasi SQL dan deploy Edge Function dijalankan MANUAL oleh pemilik** (SQL Editor Supabase; deploy fungsi lewat dasbor). Urutan: migrasi dahulu, baru gabungkan PR, karena situs terbit saat digabung.
- **Tugas terjadwal:** pengingat harian 07.00 WIB (`sigarda.notif_pengingat` lewat pg_cron; lapisan bertumpuk: cadangan, eskalasi, agenda, usulan kegiatan, pra-uji, kalender Garuda);
  keep-alive harian supaya proyek Free tier tidak dijeda (workflow dan fungsi di database).
- **Cadangan:** tombol "Unduh cadangan" (Data Gudep; data isian tanpa akun login, diingatkan tiap 30 hari) dan `Cadangkan-SIGARDA.bat` (penuh, termasuk akun). Ukuran cadangan tumbuh: 32 MB pada data
  sekolah penuh ([simulasi](simulasi-beban-tahap3-4-2026-09.md)); pantau waktunya.
- **Batas paket gratis** yang perlu dipantau: ukuran basis data (500 MB), waktu permintaan, dan aktivitas proyek. Alat: `npm run profil`, `supabase/demo/ukur_muatan.sql`, `scripts/uji-beban/beban.mjs`.
- **Kinerja klien:** `ambilSemua` membaca halaman berikutnya serempak (jangan dikembalikan berurutan); `sku_riwayat` dimuat malas per Penegak (`pastikanRiwayat`); halaman dimuat malas.

## 9. Jebakan yang sudah diketahui

- **PL/pgSQL:** `if x > case ... then ... end` gagal karena kondisi `if` dipotong pada `then` pertama; hitung ke variabel dulu. Alias kolom subquery `VALUES (... as t(a, b))` tidak boleh memakai tipe.
  `jsonb_typeof(p -> 'kunci') <> 'number'` tidak memicu galat bila kunci hilang (NULL): bungkus dengan `coalesce`.
- **`jsonb_build_object`** dibatasi 100 argumen; `sg_cadangan_admin()` sudah dibagi dua objek yang digabung `||`. Galatnya baru muncul saat fungsi dijalankan.
- **Menyunting SQL lewat skrip:** `String.replace` menafsirkan `$$` dan `$&` (merusak fungsi diam-diam). Gunakan `split(dari).join(ke)` atau alat Edit.
- **Migrasi tabel baru:** `create index if not exists`, dan cabut hak bawaan Supabase, atau hasilnya beda dari database baru (tertangkap uji `periksa-pemasangan`).
- **Windows/PowerShell:** akhir baris CRLF vs LF mengubah md5 fungsi; uji menyamakan LF. Ubah kode dengan alat Edit/Write, bukan string PowerShell.
- **Agama NULL** pada Penegak menghentikan penulisan progres SKU (pemicu); **sangga NULL** diperlakukan sebagai "belum punya sangga".
- **Daftar Periksa Data dipotong 300 baris;** pakai `pemeriksaanLogic.jumlahKategori`, bukan panjang array.

## 10. Yang belum selesai atau menunggu keputusan

- **Format Excel Kwarran/Kwarcab resmi** belum ada di tangan pemilik; tabel pendataan dan rekap yang ada mengikuti data aplikasi.
- **Ambang jumlah Krida** (SPG butir 6) belum ada sumbernya; sekarang hanya keterangan. Nama dan bidang enam SKK tambahan dan bidang Cakap Keuangan perlu dipastikan ke Kwarcab.
- **Asumsi yang belum dikonfirmasi pemilik:** mengajukan ulang sesudah hasil "ulang" memulai jalur pra-uji dari awal; satu Penegak hanya boleh menjadi Bina Damping di satu rombel per tahun ajaran
  (indeks `bina_damping_satu_rombel_idx`, cabut bila boleh merangkap).
- **Uji coba pengguna nyata** dijadwalkan 2 dan 9 Oktober 2026 (BPH Dewan Ambalan dan tekpram; lalu Bina Damping, Pinsa, Dewan Ambalan). Simulasi sudah ada di
  [simulasi-pra-uji-2026-10.md](simulasi-pra-uji-2026-10.md) dan [simulasi-beban-tahap3-4-2026-09.md](simulasi-beban-tahap3-4-2026-09.md); beban serentak di Supabase sungguhan belum diukur.
- **Deploy Edge Function masih manual** (otomatisasi butuh token sensitif; belum diputuskan).
- **Isi peraturan tidak disalin** ke repositori; hanya judul dan tautan. Periksa tautan dengan `npm run periksa-peraturan` (butuh internet) sebelum tahun ajaran baru; aturan gerbang Garuda dan ambang TKK diperbarui
  tiap tahun lewat menu Kelayakan dan TKK.

## 11. Dokumen lain

| Dokumen | Untuk |
|---|---|
| [README.md](../README.md) | Fitur per menu, pemasangan Supabase, daftar migrasi berurutan, kinerja |
| [CLAUDE.md](../CLAUDE.md) | Aturan arsitektur terperinci per fitur (sangat rinci; jadikan rujukan, bukan bacaan awal) |
| [docs/cermin-klien-server.md](cermin-klien-server.md) | Daftar aturan yang ada di klien dan server |
| [supabase/sumber/README.md](../supabase/sumber/README.md) | Peta modul skema |
| Menu Bantuan di aplikasi (`src/data/panduanData.js`) | Panduan pengguna per peran |
