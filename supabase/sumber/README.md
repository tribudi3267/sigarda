# Sumber skema SIGARDA

Berkas `NN-nama.sql` di folder ini disambung **urut nama, tanpa pemisah** oleh `scripts/sumber.mjs` menjadi satu teks (dulu satu berkas `inti.sql`, ±4.650 baris).
`npm run skema` menambah katalog butir SKU lalu menulis `supabase/skema.sql`; `scripts/migrasi/bantu.mjs` mengambil blok bermarka dari teks gabungan yang sama.
Urutan berkas = urutan definisi di database, jadi jangan menyusun ulang; sisipkan berkas baru dengan nomor di antara yang ada (mis. `35-bantu-xyz.sql`).
Penanda blok (`-- ===== ... =====`) dapat melintasi berkas.

| Nomor | Isi |
|---|---|
| 00 | kepala, pembersih versi lama, skema `sigarda`, `hari_ini` |
| 10-20 | tabel: inti (profil, SKU, absensi), iuran, penugasan+dewan, dokumen, notifikasi, naik kelas, agenda+usulan, portofolio/sidang/raport/instrumen, berkas Garuda+indeks FK, keep-alive, sesi ujian+login |
| 30-34 | fungsi bantu (skema `sigarda`): dasar, iuran, raport+instrumen, penugasan+penegakan+dokumen, notifikasi (pemicu, pengingat berlapis) |
| 40 | Row Level Security (baca saja) |
| 50-63 | fungsi aksi `sg_*`: SKU+penegakan, garuda/jurnal/absensi, iuran, penugasan, naik kelas, anggota+jenis kelamin+jabatan dewan, materi/sidang/raport, instrumen+verifikasi, berkas Garuda+gudep, dokumen, notifikasi+pemeriksaan data, cadangan+eskalasi, agenda+usulan, sesi ujian+fungsi Edge Function |
| 70 | hak akses dan penanda katalog |

Pemeriksaan: `npm run uji -- sumber-skema` (nomor unik, `skema.sql` tidak usang).
