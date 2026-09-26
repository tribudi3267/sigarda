# Simulasi beban fitur Tahap 3 dan 4 (26 September 2026)

Dijalankan di data sekolah penuh lokal (700 Penegak aktif, 150 alumni, 30 rombel, 27 ribu progres SKU, 54 ribu riwayat; data fiktif, PGlite). Skrip:
`scripts/simulasi-beban-tahap3-4.mjs` (`npm run simulasi:beban`); bukan bagian `npm run uji`. Laporan mentah: `.uji/simulasi-beban-tahap3-4.json`.

**Cara membaca angka.** Waktu database adalah waktu PGlite (satu proses, tanpa jaringan): bandingkan antar-fungsi, jangan dibaca sebagai waktu Supabase. Ukuran berkas
(mentah dan gzip) adalah ukuran sungguhan hasil `src/lib/api.js`. Beban serentak banyak pengguna di server tidak disimulasikan (lihat `scripts/uji-beban/beban.mjs`).

## Yang disimulasikan
1. Data diri mandiri: 700 Penegak mengisi lewat `sg_isian_saya_simpan` (60% lengkap ±45 isian, 25% hanya isian pokok, 15% tidak mengisi) dan nomor WhatsApp.
2. Periksa Data pada hari peluncuran (belum ada yang mengisi) dan sesudah pengisian.
3. Calon Garuda: 26 Penegak yang menyelesaikan seluruh SKU mendapat pelantikan, Saka, tiga Krida, 68 capaian TKK (45 TKK berbeda), penetapan SPG; tanggal lahir massal 112 baris.
4. Pemuatan sisi klien oleh Pembina, Portofolio format Kwarcab per calon, salinan beku, tabel pendataan Excel, cadangan data, ukuran tabel.

## Hasil

| Hal | Hasil |
|---|---|
| Simpan data diri (per Penegak) | rata 7,6 ms, p95 11 ms; 18.288 baris `penegak_isian` (2,5 MB) untuk 572 Penegak yang mengisi, ±4,4 kB per Penegak |
| Periksa Data (700 Penegak) | 82 ms; 92 kB mentah, 21 kB gzip |
| Catat TKK (1.768 capaian) | rata 3,7 ms per capaian |
| Impor tanggal lahir massal (112 baris) | 22 ms, semua tersimpan |
| Muat TKK (26 calon, 1.768 capaian) | 521 kB mentah, 24 kB gzip; dimuat malas hanya di halaman TKK/Kelayakan/Portofolio Kwarcab |
| Muat SPG, pelantikan+Saka, gerbang | 30 kB, 20 kB, 68 kB mentah (gzip 2, 1,5, 16 kB) |
| Portofolio format Kwarcab per calon | render 24 ms (p95 35 ms), HTML 144 kB; daftar hadir latihan terisi 12 sesi |
| Salinan beku per calon | 28 kB per salinan (batas 600 kB; maksimal 20 per Penegak = ±570 kB) |
| Tabel pendataan Excel (26 baris) | 0,7 detik, 9 kB |
| Cadangan data (`sg_cadangan_admin`) | 3,4 detik; 32 MB mentah, 2,6 MB gzip |
| Ukuran data aplikasi | 33,5 MB, tabel Tahap 3 dan 4 hanya 3,7 MB (batas paket gratis 500 MB) |

Tabel terbesar tetap `sku_progress` (13,9 MB), `sku_riwayat` (8,1 MB), dan `absensi_hadir` (3,8 MB), bukan tabel baru. Pemuatan `muatProgress` tanpa riwayat (7,3 MB mentah, 891 kB
gzip, 1,5 detik) sudah ada sebelum Tahap 3 dan sudah masuk model `npm run profil`.

## Temuan
1. **Periode awal: angka "data diri belum lengkap" terpotong.** Pada hari peluncuran 684 Penegak belum mengisi, tetapi `sg_pemeriksaan_data()` hanya mengembalikan 300 baris per
   kategori, jadi layar menampilkan 300 (jumlah sebenarnya tidak terlihat). Sesudah lebih dari separuh mengisi, daftar menyusut di bawah 300 dan angkanya benar. Hal yang sama
   berlaku untuk "Belum ada NTA" (300 dari sekitar 700). Perbaikan yang disarankan (belum dikerjakan; butuh migrasi): sertakan jumlah sebenarnya per kategori dan tulis "300 dari N".
2. **Cadangan data adalah beban terbesar yang tumbuh sendiri.** Satu panggilan mengembalikan 32 MB JSON dalam 3,4 detik (PGlite). Pada Supabase, permintaan lewat API dibatasi waktu
   (bawaan sekitar 8 detik untuk peran `authenticated`), sehingga masih ada margin, tetapi `sku_riwayat` dan `sku_progress` bertambah tiap tahun. Pantau waktunya (`sg_cadangan_status`)
   dan siapkan `Cadangkan-SIGARDA.bat` sebagai cadangan penuh. Bila mendekati batas: pecah cadangan per kelompok tabel.
3. Tidak ada cacat data atau galat pada 572 penyimpanan data diri, 1.768 capaian TKK, pelantikan, Saka, Krida, dan penetapan SPG; tidak ada salinan beku yang melebihi batas.
4. `api().muatIsian(null)` menggabung semua baris menjadi satu objek dan hanya benar untuk satu Penegak; halaman memang hanya memanggilnya per Penegak (tidak ada temuan, dicatat agar tidak dipakai untuk seluruh Penegak).

## Yang belum diukur
Beban serentak di server Supabase sungguhan (mis. 300 Penegak mengisi data diri pada jam yang sama), waktu di HP lambat untuk render Portofolio, dan format Excel Kwarran/Kwarcab
resmi (belum ada di tangan pemilik). Ukur di Supabase dengan `scripts/uji-beban/beban.mjs` dan `supabase/demo/ukur_muatan.sql` bila diperlukan.
