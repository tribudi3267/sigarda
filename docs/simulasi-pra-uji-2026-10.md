# Simulasi otomatis pra-uji berjenjang (25 September 2026)

Simulasi dijalankan sebelum uji coba nyata BPH Dewan Ambalan dan tekpram (2 Oktober 2026) di data sekolah penuh lokal (700 Penegak aktif, 150 alumni, 30 rombel, ±27 ribu
progres SKU; data fiktif, PGlite). Skrip: `scripts/simulasi-pra-uji.mjs` (`npm run simulasi:pra-uji`, opsi `-- --skenario=lengkap`); bukan bagian `npm run uji`.
Laporan mentah tiap jalan ditulis ke `.uji/simulasi-pra-uji-<skenario>.json`.

## Cara kerja simulasi
Sakelar dihidupkan lewat `sg_pra_uji_sakelar`; Bina Damping ditunjuk lewat `sg_bina_damping_atur`; Pinsa satu per (rombel, sangga). Sekitar 450 Penegak mengajukan 1-2 butir
(gelombang 1: 300 Penegak; gelombang 2: 150 Penegak pada putaran ke-2); penilai memutuskan dari antrian masing-masing (`sg_pra_uji_antrian`, `sg_pra_uji_catat`: 85% lulus,
15% belum dengan catatan); Pembina menguji resmi (90% lulus, 10% ulang); yang belum atau ulang mengajukan lagi (60% per putaran); sampai tenang atau 8 putaran.
Diperiksa: invarian data, hak akses, notifikasi, tahap yang macet, dan waktu fungsi utama.

Dua skenario: **apa adanya** (Bina Damping hanya dari Penegak berjabatan Dewan pada data sekolah penuh, yang hanya 12 orang dan 1 di antaranya minimal Calon Laksana) dan
**lengkap** (48 Penegak Calon Laksana ke atas dijadikan Dewan, sehingga 49 Bina Damping mengisi 25 dari 30 rombel; pembanding).

## Hasil

| | apa adanya | lengkap |
|---|---|---|
| Bina Damping ditunjuk | 1 (rombel tanpa Bina Damping: 29 dari 30) | 49 (rombel tanpa Bina Damping: 5) |
| Pinsa (satu per sangga yang punya Penegak Calon Laksana ke atas) | 75 dari 183 sangga | 75 dari 183 sangga |
| Pengajuan yang dicoba | 689 | 681 |
| Pengajuan yang melewati pra-uji | 66 (±10%) | 487 (±71%) |
| Pengajuan langsung ke antrian Pembina (tanpa penilai) | 647 | 219 |
| Keputusan pra-uji (lulus / belum) | 82 / 16 | 598 / 91 |
| Uji resmi Pembina (lulus / ulang) | 711 / 70 | 704 / 74 |
| Pra-uji yang macet di akhir | 0 | 0 |

Jalur yang ditempuh (skenario lengkap): Bina Damping saja 445, Pinsa lalu Bina Damping 42; jalur Pinsa hanya terpakai bila ada Pinsa yang sudah lulus butir yang sama.

### Invarian dan hak akses: semuanya sesuai (kedua skenario)
- Tidak ada pra-uji menunggu padahal butirnya sudah lulus; tidak ada dua pra-uji menunggu untuk satu butir; tidak ada pra-uji menunggu tanpa penilai yang sah.
- Tidak ada hasil resmi "lulus" yang dicatat selain oleh Pembina (atau Admin); tidak ada keputusan pra-uji tanpa penilai; "belum" selalu bercatatan.
- Notifikasi hasil uji resmi tidak membocorkan lulus/ulang; notifikasi pra-uji memuat kata kunci yang diminta pemilik.
- Penegak berjabatan Dewan tidak dapat mencatat hasil resmi; Penegak biasa tidak dapat memutuskan pra-uji, mengubah sakelar, atau membaca pra-uji Penegak lain.

### Waktu (PGlite lokal, 700 Penegak)
| Fungsi | rata-rata | p95 | maks |
|---|---|---|---|
| `sg_sku_ajukan` (pengajuan) | 75-118 ms | 114-181 ms | 250 ms |
| `sg_pra_uji_antrian` (antrian satu penilai) | 3-5 ms | 6-19 ms | 61 ms |
| `sg_pra_uji_catat` (keputusan) | 16-43 ms | 130-134 ms | 206 ms |
| uji resmi satu butir | 8 ms | 11 ms | 18 ms |
| `sg_pemeriksaan_data`, `sg_eskalasi_daftar`, `sg_sangga_rombel` | 63-109, 244-251, 21 ms | | |
| pengingat harian `notif_pengingat` (seluruh pekerjaan harian) | 1,1-2,3 detik | | |

Tidak ada yang mendekati batas yang mengkhawatirkan pada skala sekolah.

## Temuan dan tafsir
1. **Tidak ada cacat data atau hak akses.** Mesin pra-uji konsisten pada 700 Penegak dan ±690 pengajuan.
2. **Cakupan pra-uji ditentukan oleh jumlah Bina Damping yang memenuhi syarat.** Pada skenario apa adanya hanya ±10% pengajuan yang disaring; 90% langsung ke Pembina karena
   tahap tanpa penilai dilewati (sesuai rancangan, agar tidak macet). Pemeriksaan Data sudah menandai rombel tanpa dua Bina Damping, tetapi tidak menunjukkan **dampaknya**.
   Catatan: angka skenario apa adanya berasal dari data contoh yang Dewannya acak; jumlah Penegak berjabatan Dewan yang minimal Calon Laksana di ambalan nyata belum diketahui.
3. **Aturan "satu orang satu rombel per tahun ajaran" untuk Bina Damping** (asumsi yang belum dikonfirmasi pemilik) membuat 30 rombel butuh 60 orang. Bila Dewan nyata jauh lebih
   sedikit, sebagian rombel pasti tanpa Bina Damping. Belum diubah: menunggu data nyata uji coba 2 dan 9 Oktober (berapa Dewan yang memenuhi syarat).
4. **Manfaat pra-uji terhadap kualitas tidak dapat diukur simulasi** (hasil uji resmi diacak independen); simulasi hanya mengukur aliran, beban, dan kebenaran.
5. Butir agama: pengujian resmi tetap butuh Pembina seagama (atau penugasan rombel yang mencakupnya); ini aturan lama, bukan akibat pra-uji.

## Tindak lanjut (dikerjakan, migrasi `2026-09-cakupan-pra-uji.sql`)
Karena butir 2 tidak tampak oleh Pembina, ditambahkan panel **Cakupan pra-uji** di menu Pra-uji (Pembina dan Admin, saat pra-uji hidup): persentase pengajuan baru yang melewati
pra-uji, berapa yang langsung ke Pembina, dan rombel yang paling sering langsung ke Pembina beserta jumlah Bina Damping-nya, untuk 7, 30, atau 90 hari terakhir. Fungsi server
`sg_pra_uji_cakupan` (hanya membaca). Panel ini dipakai selama uji coba 2 dan 9 Oktober untuk memutuskan apakah Bina Damping perlu ditambah atau aturan satu rombel dilonggarkan.
