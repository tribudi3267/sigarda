# Panduan bergambar (menu Bantuan)

Panduan di menu **Bantuan** memuat gambar layar aplikasi yang diberi kotak dan nomor merah, dengan keterangan bernomor di bawahnya. Setiap gambar ada dalam
**dua tampilan**: ponsel (HP) dan laptop/PC/tablet. Di Bantuan, pembaca memilih **Ikuti layar** (bawaan; HP mendapat gambar ponsel, layar lebar mendapat gambar
laptop, dan hanya satu yang diunduh), **Ponsel**, atau **Laptop, PC, tablet**. Saat dicetak selalu memakai gambar laptop.

Gambar memakai **data contoh** (nama fiktif dari mode lokal). Jangan pernah mengambil gambar dari server produksi.

## Berkas yang terlibat
| Berkas | Isi |
|---|---|
| `scripts/panduan/definisi.mjs` | Sumber kebenaran: layar mana, akun contoh, langkah menuju layar itu, dan penunjuk bernomor (teks keterangan + cara menemukan elemen). |
| `scripts/panduan/ambil.mjs` | Alat pengembang: memotret dan menghitung letak penunjuk dari elemen aslinya. Tidak ikut build dan tidak ikut `npm run uji`. |
| `scripts/panduan/logika.mjs` | Logika murni (ukuran mode, konversi kotak ke persen, pemeriksaan definisi); diuji. |
| `public/panduan/<id>-layar.webp` dan `<id>-ponsel.webp` | Gambar hasil (WebP, kecil). |
| `src/data/panduanGambar.json` | Data hasil: judul, alt, keterangan, berkas, dan kotak penunjuk (persen) per mode. **Dihasilkan alat; jangan diedit tangan.** |
| `src/data/panduanData.js` | Menautkan gambar ke bagian panduan lewat `gambar: ['<id>']`. Awalan id gambar harus sama dengan peran panduannya (`umum`, `penegak`, `dewan`, `pembina`, `admin`). |
| `src/components/FigurPanduan.jsx`, `src/lib/panduanGambarLogic.js` | Tampilan dan logika murninya. |
| `uji/panduan-gambar.mjs` | Pengujian (data, berkas, anggaran ukuran, keterkaitan dengan panduan, render). |

## Kapan gambar perlu diambil ulang
Bila tampilan menu yang bergambar berubah (tata letak, tombol, teks). Gambar yang usang tidak menggagalkan uji, jadi periksa saat mengubah halaman yang ada di
`scripts/panduan/definisi.mjs`. Bila hanya **teks keterangan** yang berubah: ubah di `definisi.mjs`, lalu jalankan `node scripts/panduan/ambil.mjs --teks`
(tidak memotret ulang; uji akan menegur bila teks di data berbeda dari definisi).

## Cara mengambil ulang
1. Pasang pemotret sekali, di folder mana saja di luar proyek (tidak masuk `package.json`):
   ```bash
   mkdir ~/alat-panduan && cd ~/alat-panduan && npm init -y && npm i puppeteer-core
   ```
2. Jalankan aplikasi mode lokal (data contoh): `npm run dev:lokal` (di worktree Git mungkin perlu konfigurasi Vite sementara di luar repositori yang mengizinkan
   `server.fs.strict = false`). Catat alamatnya (mis. `http://localhost:5173`).
3. Periksa letak penunjuk dulu tanpa menyimpan apa pun (gambar bertanda ditulis ke folder `panduan-debug` di folder sementara):
   ```bash
   PUPPETEER_DIR=~/alat-panduan node scripts/panduan/ambil.mjs --debug --url=http://localhost:5173 --id=penegak-beranda
   ```
4. Ambil sungguhan (semua, atau sebagian dengan `--id=a,b`):
   ```bash
   PUPPETEER_DIR=~/alat-panduan node scripts/panduan/ambil.mjs --url=http://localhost:5173
   ```
   Butuh Chrome atau Edge terpasang (`BROWSER_JALUR=<berkas .exe>` bila tidak ditemukan otomatis). Satu gambar dipotret dua kali (laptop 1024 px, ponsel 390 px);
   seluruhnya sekitar 30 menit karena tiap gambar memuat ulang basis data contoh.
5. `npm run build` dan `npm run uji`; lalu buka Bantuan dan lihat hasilnya di kedua tampilan.

## Menambah gambar baru
1. Tambah objek di `scripts/panduan/definisi.mjs`: `id` (`<peran>-<nama>`), `akun` (akun contoh mode lokal: `10231` Penegak, `10008` Penegak berjabatan Dewan,
   `pembina`, `admin`), `judul`, `alt` (deskripsi untuk pembaca layar), `langkah` (mis. `{ klikMenu: 'Absensi' }`), dan `penanda` (paling banyak 6; tiap
   penunjuk punya `teks` dan cara menemukan elemennya, sama untuk kedua mode atau terpisah lewat `layar:` dan `ponsel:`).
2. Halaman panjang di ponsel: beri `tinggi: { ponsel: 1100 }` supaya semua penunjuk terlihat. Alat menolak penunjuk yang tertutup menu bawah.
3. Tautkan di `src/data/panduanData.js` (`gambar: ['id']` pada bagian yang sesuai), lalu ambil gambarnya seperti di atas.

## Anggaran dan keamanan
- Setiap gambar paling besar 260 kB dan seluruh gambar paling besar 4,5 MB (dijaga `uji/panduan-gambar.mjs`). Gambar disimpan permanen di riwayat Git, jadi
  hindari mengambil ulang tanpa perlu.
- Gambar dimuat malas dan hanya saat halaman Bantuan dibuka; tidak masuk JavaScript awal. Semua gambar dilayani GitHub Pages; tidak menyentuh Supabase.
- Kotak dan nomor digambar oleh aplikasi di atas gambar (bukan menyatu dengan gambar), jadi tetap tajam dan teksnya dapat dibaca pembaca layar.
