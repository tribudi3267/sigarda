---
name: rencana-hemat-log-supabase
description: "Rencana bertahap menekan log ingestion dan log query Supabase (paket Free, kuota 1 GB/100 GB per siklus); fase mana yang sudah dikerjakan dan yang tersisa"
metadata:
  node_type: memory
  type: project
  originSessionId: 2f1ba848-078b-4a9c-b316-234be9488c5f
  modified: 2026-10-04T13:00:34.155Z
---

Latar: ujicoba 2 Okt 2026 (65-80 pengguna) menghasilkan ±129 MB log ingestion dalam sehari dan 57,9 GB log query (73,5 GB dari kuota 100 GB siklus 19 Sep-19 Okt). Paket Free tidak ditagih dan tidak dibatasi seketika bila melewati kuota (masa tenggang; penagihan baru mulai awal 2027), tetapi pemilik ingin serendah mungkin. Log API gateway/edge tidak dapat dimatikan; satu-satunya tuas = jumlah permintaan. Edge Function dan SQL tidak punya `console.log`/`RAISE NOTICE`.

**Why:** sampel 1.000 baris log (12.42-17.42 UTC 2 Okt) menunjukkan penyebab terbesar = muat ulang penuh (±14 permintaan: profiles, sku_progress, pengaturan x2, notifikasi, sg_pendampingan_saya, sg_iuran_pengaturan, absensi_sesi/hadir, asisten_iuran, materi, portofolio+jurnal; Penegak juga tanggal_lahir+penegak_isian) tiap kembali ke tab (ambang lama 30 detik) + polling notifikasi 1 menit (terus jalan walau sesi habis, 401) + galat akun wajib ganti PIN; baris OPTIONS (CORS) ±17% dari log edge. Log Query berasal dari membuka halaman Logs/Observability di dasbor (mode Live, rentang 24 jam), bukan dari aplikasi.

**Sudah selesai:**
- PR 69 (merge): `AppContext.jsx` muat ulang penuh saat fokus 30 dtk -> 5 mnt (1-5 mnt hanya notifikasi), polling notifikasi 1 -> 3 mnt dan berhenti setelah 3 gagal, akun wajib ganti PIN tidak disegarkan berkala.
- PR 71 (merge 4 Okt 2026 12.11 UTC): penyegaran ringan melewatkan materi/asisten/pengaturan iuran/gudep/pendampingan (dimuat ulang paling sering tiap 30 mnt, `JEDA_DATA_JARANG_MS`), polling notifikasi 15 mnt bila perangkat berlangganan Web Push.

**Fase tersisa (satu per sesi; keputusan pemilik: urutan Fase 0 -> 1 -> putuskan 2/3 dari hasil ukur -> 6):**
- Fase 0 (tanpa kode): ukur ujicoba berikutnya (grafik Usage + Observability > API Gateway, Last 24 hours; Free hanya menyimpan log 24 jam). Pembanding: ±129 MB. Target <40 MB/hari.
- Fase 1: cache materi, gudep, pengaturan iuran di peramban (TTL 30 mnt, hanya data non-pribadi, hapus saat keluar; tampil dari cache lalu segarkan latar belakang) + lewati `sg_gudep_publik` bila sesi tersimpan ada. Tanpa migrasi.
- Fase 2: RPC tunggal `sg_muat_awal()` (gudep, pengaturan iuran, pendampingan, sakelar pra-uji, asisten, notifikasi) menggantikan ±6 permintaan; butuh migrasi aditif + uji paritas + klien lama tetap jalan; putuskan setelah Fase 0/1.
- Fase 3: muat malas portofolio+jurnal per halaman (pola `pastikanRiwayat`); konsumen banyak (SkuChecklist, RingkasanGudep, Kelayakan, Spg, dasbor): hanya bila muat saat masuk masih dominan.
- Fase 4: cache singkat (±10 mnt) `sg_beranda_publik` di halaman muka, hanya bila API Gateway menunjukkan jalur ini besar (belum terukur).
- Fase 5 (disarankan dilewati): cron `terbit_ulang_periksa` 5 -> 15 mnt; hemat <1 MB/hari.
- Fase 6: tulis `docs/hemat-log.md` untuk pemilik (jangan mode Live, rentang pendek 10-60 mnt, tutup tab Logs, periksa Usage tiap pekan, arti masa tenggang). Log Query tidak bisa dikurangi dari kode.

**How to apply:** sebelum mengubah pemuatan data di `AppContext.muatSemua`, ingat konsumen datanya banyak (lihat Fase 3) dan uji penuh `npm run uji` butuh >10 menit (jalankan di latar belakang dengan timeout panjang, hanya satu proses uji sekaligus). Jangan menawarkan pengurangan log lewat pengaturan Postgres: tidak ada log buatan sendiri. Kueri Logs Explorer SQL tidak tersedia di tampilan Unified Logs; pakai Observability > API Gateway. Lihat [[rencana-pengembangan-aktif]] bila ada rencana fitur lain berjalan.
