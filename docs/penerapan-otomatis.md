# Penerapan otomatis: migrasi dan pemeriksaan pemasangan

Sebelumnya, setiap perubahan basis data berarti menempel berkas `.sql` di SQL Editor Supabase. Sekarang GitHub dapat melakukannya untuk Anda, dengan
tiga pengaman: (1) ada **catatan** migrasi mana yang sudah dijalankan, jadi tidak ada yang terulang atau salah urut; (2) **Anda menyetujui dulu** dengan satu
tombol; (3) bila migrasi gagal, **situs tidak terbit**, sehingga aplikasi tidak pernah lebih baru dari basis datanya.

Ada dua bagian yang dapat dipasang terpisah:

| Bagian | Fungsi | Rahasia yang dibutuhkan |
|---|---|---|
| **A. Pemeriksaan harian** | Tiap hari 06.00 WIB membandingkan basis data dengan kode terbaru (hanya membaca). Bila ada yang kurang/beda, GitHub membuka satu issue dan mengirim email. | `SIGARDA_DB_URL` (peran baca-saja, **sama** dengan cadangan mingguan) |
| **B. Migrasi otomatis** | Saat kode digabung ke `main` dan ada migrasi baru: menunggu persetujuan Anda, menjalankannya berurutan, baru situs terbit. | `SIGARDA_DB_URL_TULIS` (hak penuh, disimpan di lingkungan "produksi") |

> **Aturan emas: jangan mengirim sandi atau alamat sambungan ke siapa pun, termasuk ke asisten AI.** Semuanya diketik sendiri oleh Anda di layar Supabase dan GitHub.
> Sebelum bagian ini dipasang, tidak ada yang berubah: cara lama (menempel di SQL Editor) tetap berlaku, dan alur yang belum dipasang otomatis dilewati.

## Bagian A. Pemeriksaan harian (5 menit)
1. Pastikan rahasia `SIGARDA_DB_URL` sudah ada (GitHub > Settings > Secrets and variables > Actions). Bila belum, buat peran baca-saja dan alamat
   sambungannya mengikuti [Langkah 3 di panduan cadangan](cadangan-otomatis.md) (bagian "Peran database baca-saja"); rahasia yang sama dipakai bersama.
2. Uji sekali: GitHub > **Actions** > **Periksa pemasangan** > **Run workflow**. Hasil yang baik: `Pemasangan sesuai dengan kode terbaru.`
3. Selesai. Mulai besok pemeriksaan berjalan sendiri. Bila ada ketidaksesuaian, terbuka issue **"Pemasangan tidak sesuai dengan kode terbaru"** (daftar objeknya ada di
   log); issue itu tertutup sendiri begitu semuanya sesuai lagi.

**Bila pemeriksaan berkata `permission denied`:** peran baca-saja belum boleh membaca jadwal pg_cron. Di Supabase > SQL Editor jalankan sekali:

```sql
grant usage on schema cron to cadangan_sigarda;
grant select on cron.job to cadangan_sigarda;
```

**Yang tidak diperiksa:** Edge Function (`sigarda`, `notif-push`, `galeri-sampul`, `sosial-sampul`) tidak dapat dilihat dari SQL. Baris "PERIKSA MANUAL" di log mengingatkan itu.
Deploy Edge Function tetap manual (Dashboard > Edge Functions).

## Bagian B. Migrasi otomatis (sekitar 20 menit, sekali saja)

### Langkah 1. Buat lingkungan "produksi" dengan persetujuan
1. GitHub > repositori > **Settings** > **Environments** > **New environment**, nama persis `produksi`.
2. Centang **Required reviewers** dan tambahkan **akun Anda sendiri**. Simpan. (Tanpa langkah ini alur berjalan tanpa menunggu persetujuan.)

### Langkah 2. Sambungan tulis basis data
1. Supabase > tombol **Connect** > tab **Session pooler**. Bentuknya
   `postgresql://postgres.<kode-proyek>:[YOUR-PASSWORD]@aws-0-....pooler.supabase.com:5432/postgres` (peran `postgres`, bukan `cadangan_sigarda`).
2. Ganti `[YOUR-PASSWORD]` dengan sandi basis data Anda (tanpa kurung siku). Lupa sandinya? Supabase > Project Settings > Database > Reset database password.
3. GitHub > Settings > Environments > **produksi** > **Add environment secret**: nama `SIGARDA_DB_URL_TULIS`, isi alamat tadi. Simpan **di lingkungan itu**,
   bukan di rahasia repositori: dengan begitu rahasia hanya terbuka sesudah Anda menyetujui.

### Langkah 3. Penandaan awal (sekali)
Ke-60 migrasi yang selama ini Anda jalankan tangan perlu **ditandai** sebagai sudah diterapkan, bukan dijalankan ulang.
1. Jalankan `supabase/demo/periksa_pemasangan.sql` di SQL Editor dan pastikan tidak ada baris `KURANG`/`BEDA` (atau tunggu Bagian A menyatakan sesuai).
2. GitHub > **Actions** > **Migrasi manual** > **Run workflow** > pilih aksi **tandai** > Run > **Approve** persetujuannya.
3. Hasil yang baik: `Ditandai sudah diterapkan: 60 migrasi (sampai ...)`. Skrip menolak menandai bila pemeriksaan pemasangan belum bersih, dan menolak bila sudah pernah ditandai.

### Sesudah terpasang: cara kerja sehari-hari
1. Saya (atau siapa pun) menggabungkan PR yang punya migrasi baru ke `main`.
2. GitHub berhenti di langkah **migrasi** dan meminta persetujuan (email dan tombol **Review deployments** di halaman Actions). Anda **Approve**.
3. Migrasi yang belum tercatat dijalankan berurutan. Sesudahnya situs terbit seperti biasa.
4. Push yang tidak menyentuh `supabase/migrasi` tidak meminta persetujuan apa pun.

**Catatan rilis di PR** ("Jalankan di Supabase SQL Editor...") tetap muncul; sesudah Bagian B dipasang, langkah menempel migrasi itu tidak perlu lagi. Langkah
**deploy Edge Function** di catatan itu tetap manual.

## Bila ada masalah
| Gejala | Artinya | Tindakan |
|---|---|---|
| Situs tidak terbit, langkah migrasi merah: `Migrasi <nama> GAGAL ... ([kode] pesan)` | Migrasi itu gagal dan **dibatalkan seluruhnya** (basis data utuh); migrasi sesudahnya tidak dijalankan | Kirim nama migrasi dan kode/pesannya ke pengembang. Sesudah diperbaiki, gabungkan perbaikannya |
| `Pelacak masih kosong` | Penandaan awal (Langkah 3) belum dilakukan | Lakukan Langkah 3 |
| `Urutan tidak konsisten` | Ada migrasi yang terlewat di tengah | Jangan diulang otomatis; kirim ke pengembang |
| `Pemeriksaan pemasangan menemukan N masalah` saat menandai | Ada migrasi yang belum pernah dijalankan | Jalankan yang kurang tangan, ulangi pemeriksaan sampai bersih, baru tandai |
| Persetujuan dibatalkan karena push lain masuk | Alur lama dibatalkan oleh yang baru | Actions > **Migrasi manual** > aksi **terapkan** (menjalankan semua yang tertunda) |
| Sandi atau nama peran salah / tidak dapat menjangkau database | Rahasia `SIGARDA_DB_URL_TULIS` keliru, atau bukan alamat Session pooler | Perbarui rahasia (Langkah 2) |
| Issue "Pemasangan tidak sesuai ..." | Basis data belum mengikuti kode | Actions > **Migrasi manual** > **terapkan**, atau jalankan tangan seperti biasa |

## Keamanan (mengapa aman untuk repositori publik)
- Rahasia tulis hanya ada di lingkungan `produksi`, hanya terbuka sesudah Anda menyetujui, dan **tidak pernah** dipakai oleh pull request atau fork (alur ini
  hanya berjalan pada push ke `main` di repositori Anda; dijaga `uji/penerapan.mjs`).
- Log publik hanya memuat nama migrasi, kode galat, dan pesan pendek; tidak pernah isi SQL, data, alamat sambungan, atau sandi.
- Migrasi yang sudah ada di riwayat tidak pernah dijalankan ulang otomatis. Skrip menolak berjalan bila pelacak kosong atau urutannya janggal.
- Pelacak (`sigarda.migrasi_terapan`) tanpa hak untuk aplikasi; tidak terlihat dari sisi pengguna dan tidak ikut cadangan data aplikasi. Pada pemulihan basis
  data baru, lakukan penandaan awal lagi (Langkah 3).
- Yang belum dilakukan: deploy Edge Function otomatis (butuh token akun Supabase yang lebih sensitif; sengaja belum).
