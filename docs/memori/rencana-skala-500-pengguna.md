---
name: rencana-skala-500-pengguna
description: "Brainstorm 17 Okt 2026 soal kegagalan muat pada 400-500 pengguna bersamaan, rencana pindah dari Supabase, dan alat uji beban yang dibuat"
metadata:
  node_type: memory
  type: project
  originSessionId: 31634d1d-8c47-434c-9bc3-c6133de88438
  modified: 2026-10-17T02:04:50.920Z
---

Pemilik ingin SIGARDA tangguh untuk 400-500 pengguna bersamaan (masuk dan beraktivitas) dan **berencana pindah dari Supabase** (belum sepenuhnya; masih di paket Free, region produksi `ap-northeast-1` = Tokyo, lebih jauh dari Singapura).

Hasil brainstorm (tanpa kode): dugaan penyebab terbesar = batas paket Free, terutama (1) batas laju login Auth per IP (semua login lewat Edge Function `sigarda` = satu IP; README sudah mencatatnya), (2) CPU instance kecil + hash PIN, (3) koneksi database. Alternatif dibahas: Supabase Pro (paling efisien), Supabase self-host di VPS Indonesia (kode hampir sama, tapi pemilik jadi operator), Postgres terkelola Jakarta, PocketBase dan Litestream (tulis ulang total, tidak dianjurkan karena logika inti ada di 46 modul SQL/RLS/pg_cron). Tidak ada "Supabase terkelola buatan Indonesia" yang diketahui.

**Why:** keputusan migrasi sebaiknya berdasar angka, bukan dugaan; uji harus di proyek UJI di akun Supabase lain (kuota egress/MAU/fungsi dihitung per organisasi, jangan mengotori produksi).

**How to apply:** alat ada di `scripts/uji-beban/` (panduan `docs/uji-beban.md`). Langkah pemilik berikutnya: buat akun+proyek uji, pasang skema dan Edge Function, jalankan `data_uji_beban.sql` + `uji_beban_pin_seragam.sql`, lalu `node scripts/uji-beban/skenario.mjs periksa` dan `tangga --jeda=300`; bagikan hasilnya untuk menentukan Pro vs self-host. Tujuan bukan-Supabase menuntut `mesin.mjs` disesuaikan. Jangan meminta kunci/PIN di chat.
