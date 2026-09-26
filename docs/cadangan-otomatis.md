# Cadangan mingguan otomatis ke Google Drive sekolah

Tiap **Sabtu pukul 05.00 WIB** GitHub membaca seluruh data SIGARDA (termasuk akun login), mengenkripsinya, dan menyimpannya ke satu folder Google Drive
akun sekolah Anda. Yang tersimpan 13 cadangan terbaru (sekitar 3 bulan). Anda tidak perlu melakukan apa pun tiap minggu.

```
GitHub Actions (Sabtu 05.00 WIB)
  1. sambung ke database dengan peran BACA-SAJA
  2. baca semua tabel -> kompres -> enkripsi AES-256 (frasa sandi hanya Anda yang tahu)
  3. kirim ke skrip Google Apps Script milik akun sekolah Anda
Apps Script
  4. periksa ukuran dan sidik jari (SHA-256), simpan ke folder Drive, hapus yang paling lama
  5. tiap hari 08.00: bila cadangan terbaru > 9 hari, kirim email peringatan ke Anda
```

**Mengapa begini.** Repositori GitHub ini publik, jadi cadangan tidak pernah disimpan di GitHub (bukan berkas, bukan artifact); ia dienkripsi lalu langsung
pindah ke Drive Anda, dan log GitHub hanya memuat nama tabel dan jumlah baris. Google pun hanya menyimpan berkas terenkripsi.

> **Aturan emas: jangan mengirim sandi, token, atau frasa ke siapa pun, termasuk ke asisten AI.** Semuanya diketik sendiri oleh Anda di layar Google,
> Supabase, dan GitHub di bawah ini.

Kira-kira 30 menit, sekali saja. Siapkan **pengelola sandi** (atau kertas yang disimpan aman) untuk mencatat 4 rahasia di bawah.

## Membuat rahasia acak (sekali)
Di komputer yang sudah ada Node (yang dipakai `Cadangkan-SIGARDA.bat`), buka terminal dan jalankan **tiga kali**, catat hasil masing-masing:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Beri nama catatan Anda: **TOKEN** (untuk Apps Script), **SANDI-DB** (sandi peran database), **FRASA** (frasa sandi enkripsi cadangan).
**FRASA adalah yang terpenting: tanpa FRASA, semua cadangan tidak dapat dibuka oleh siapa pun.** Simpan di pengelola sandi DAN salinan kertas di tempat aman
(mis. bersama arsip sekolah). Jangan menyimpannya hanya di komputer yang sama dengan data.

## Langkah 1. Folder Google Drive
1. Buka Google Drive akun sekolah > **Baru > Folder Baru**, beri nama `Cadangan SIGARDA`.
2. Buka folder itu. Alamatnya berbentuk `drive.google.com/drive/folders/XXXXXXXX`. Catat bagian **XXXXXXXX** sebagai **FOLDER-ID**.
3. Jangan bagikan folder ini ke siapa pun.

## Langkah 2. Penerima cadangan (Google Apps Script)
1. Buka <https://script.google.com> (masuk dengan akun sekolah yang sama) > **Proyek baru**. Beri nama `Penerima Cadangan SIGARDA`.
2. Hapus isi `Kode.gs` bawaan, lalu tempel seluruh isi [`scripts/cadangan/apps-script/Kode.gs`](../scripts/cadangan/apps-script/Kode.gs). Klik **Simpan**.
3. Ikon roda gigi **Setelan Proyek** > bagian **Properti skrip** > **Tambahkan properti skrip**, isi dua baris:
   - `TOKEN` = TOKEN yang Anda catat
   - `FOLDER_ID` = FOLDER-ID dari Langkah 1
   (opsional `SIMPAN` = jumlah cadangan yang disimpan, bawaan 13). Simpan.
4. Kembali ke editor, pilih fungsi **`pasangPemicu`** pada daftar di atas, klik **Jalankan**. Setujui izin yang diminta (Drive dan email; Google mungkin
   menampilkan peringatan "aplikasi belum diverifikasi": pilih **Lanjutan > Buka Penerima Cadangan SIGARDA**, ini skrip Anda sendiri).
5. **Terapkan > Penerapan baru** > jenis **Aplikasi web**: *Jalankan sebagai* **Saya**, *Yang memiliki akses* **Siapa saja**. Klik **Terapkan** dan salin
   **URL aplikasi web** (berakhiran `/exec`). Catat sebagai **URL-UNGGAH**.
6. Uji: tempel URL-UNGGAH di peramban. Harus tampil tulisan `Penerima cadangan SIGARDA aktif.`

**Bila opsi "Siapa saja" tidak ada** (dibatasi admin Belajar.id), berhenti di sini dan beri tahu pengembang; ada jalur alternatif (komputer + Drive untuk desktop).
Token melindungi penerima: tanpa TOKEN yang benar, permintaan ditolak, dan hanya berkas terenkripsi yang pernah dikirim.

## Langkah 3. Peran database baca-saja
1. Buka [`supabase/demo/peran_cadangan.sql`](../supabase/demo/peran_cadangan.sql) dan salin isinya ke Supabase > **SQL Editor**.
2. Pada baris `sandi text := 'GANTI_SANDI_DI_SINI'` ganti isi di antara tanda kutip dengan **SANDI-DB** Anda. Klik **Run**. (Skrip menolak berjalan bila
   sandinya belum diganti atau kurang dari 24 karakter.)
3. Hasil pemeriksaan di bawahnya harus satu baris dengan `bisa_login`, `hanya_baca`, `anggota_pg_read_all_data`, dan `lewati_rls` semuanya **true**. Bila ada galat
   "tidak boleh diberi BYPASSRLS", berhenti dan hubungi pengembang.
4. Ambil alamat sambungan: Supabase > tombol **Connect** > tab **Session pooler**. Bentuknya
   `postgresql://postgres.<kode-proyek>:[YOUR-PASSWORD]@aws-0-....pooler.supabase.com:5432/postgres`.
   Ubah **dua bagian**: `postgres.<kode-proyek>` menjadi `cadangan_sigarda.<kode-proyek>`, dan `[YOUR-PASSWORD]` menjadi **SANDI-DB** (tanpa kurung siku).
   Hasilnya catat sebagai **URL-DB**.

## Langkah 4. Rahasia di GitHub
Buka repositori di GitHub > **Settings > Secrets and variables > Actions > New repository secret**. Buat **empat** rahasia (nama harus persis):

| Nama | Isi |
|---|---|
| `SIGARDA_DB_URL` | URL-DB |
| `SIGARDA_KUNCI_ENKRIPSI` | FRASA |
| `SIGARDA_UNGGAH_URL` | URL-UNGGAH |
| `SIGARDA_UNGGAH_TOKEN` | TOKEN |

Rahasia GitHub tidak dapat dibaca lagi setelah disimpan (hanya bisa diganti), dan otomatis disamarkan pada log.

## Langkah 5. Uji sekarang (jangan menunggu Sabtu)
1. GitHub > tab **Actions** > **Cadangan mingguan** > **Run workflow**.
2. Tunggu 1-3 menit sampai hijau. Lihat lognya: hanya daftar tabel dan jumlah baris, lalu "cocok di Drive".
3. Buka folder Drive: harus ada `sigarda-cadangan-TAHUN-BULAN-TANGGAL.sql.gz.enc`.
4. **Uji membukanya** (ini yang membuktikan cadangan berguna): unduh berkas itu, lalu di komputer dengan Node:
   ```bash
   node scripts/cadangan/dekripsi.mjs C:\jalur\sigarda-cadangan-2026-09-26.sql.gz.enc
   ```
   Ketik FRASA (tidak tampil). Hasilnya berkas `.sql` berisi seluruh data. Hapus berkas `.sql` itu setelah diperiksa (isinya rahasia).

## Memulihkan data
1. Buka cadangan terbaru seperti Langkah 5 nomor 4 (berkas `.sql`).
2. **Proyek Supabase baru:** jalankan dulu `supabase/skema.sql` di SQL Editor (membuat tabel dan katalog). Proyek yang sama: tabel sudah ada.
3. Tempel isi berkas `.sql` di SQL Editor > **Run** (bila terlalu besar untuk ditempel, mintalah bantuan pengembang; bisa dengan `psql`).
4. Baris yang sudah ada dilewati, bukan ditimpa; untuk menimpa data lama, kosongkan tabelnya lebih dulu. Notifikasi tidak dibuat ulang dan pemicu
   dinyalakan kembali otomatis di akhir (dijaga pengujian `cadangan-otomatis`).
5. Arahkan variabel repo (`VITE_SUPABASE_URL`, kunci) dan Edge Function ke proyek yang dipulihkan bila berpindah proyek.

**Latihan pemulihan:** sekali tiap semester, pulihkan cadangan ke proyek Supabase uji (gratis) dan pastikan Anda dapat masuk dan datanya ada. Cadangan yang
belum pernah dicoba dipulihkan belum dapat dipercaya sepenuhnya.

## Bila gagal
| Tanda | Artinya | Tindakan |
|---|---|---|
| Issue "Cadangan mingguan GAGAL" di GitHub, atau email GitHub | Workflow gagal | Buka tautan lognya; pesan galat sudah berbahasa Indonesia |
| Email "PERHATIAN: cadangan SIGARDA sudah lama tidak diperbarui" | Tidak ada cadangan baru > 9 hari (GitHub tidak jalan, rahasia salah, Drive penuh) | Jalankan workflow manual (Langkah 5), lihat lognya |
| "Rahasia belum diisi di GitHub" | Salah satu dari 4 rahasia kosong/salah nama | Langkah 4 |
| "Sandi atau nama peran database salah" | SIGARDA_DB_URL keliru (sandi/nama peran `cadangan_sigarda.<kode>`) | Langkah 3 nomor 4 |
| "Tidak dapat menjangkau database" | Bukan alamat Session pooler, atau proyek Supabase dijeda | Hidupkan proyek di dashboard; periksa alamat |
| "Tabel profiles kosong" | URL-DB menunjuk proyek yang salah | Periksa kode proyek pada URL-DB |
| "Jawaban penerima bukan JSON" / "Tidak sah" | URL-UNGGAH salah, akses bukan "Siapa saja", atau TOKEN berbeda | Langkah 2 (terapkan ulang **Penerapan baru** bila kode diubah) |
| "Ukuran atau sidik jari berkas tidak cocok" | Unggahan rusak di jalan | Jalankan ulang; bila berulang hubungi pengembang |

Bila kode Apps Script diubah, buat **Penerapan baru** (atau *Kelola penerapan > Edit > Versi baru*); URL lama tetap dipakai pada opsi kedua.

## Keamanan dan perawatan
- **Peran `cadangan_sigarda`** hanya dapat membaca, tetapi membaca SEMUA data (termasuk hash PIN). Sandinya hanya ada di rahasia GitHub `SIGARDA_DB_URL`.
- **Mengganti rahasia** (mis. bila curiga bocor): jalankan lagi `peran_cadangan.sql` dengan sandi baru dan perbarui `SIGARDA_DB_URL`; ganti properti `TOKEN`
  di Apps Script dan `SIGARDA_UNGGAH_TOKEN`. Mengganti FRASA membuat cadangan baru memakai frasa baru; **cadangan lama tetap butuh frasa lama** (simpan keduanya).
- **Sabtu tidak jalan sama sekali?** GitHub menonaktifkan jadwal bila repositori tidak aktif 60 hari; email dari Apps Script (> 9 hari) akan memberi tahu.
- **Kuota Drive:** setiap cadangan hanya beberapa MB; 13 salinan sangat kecil.
- Cadangan ini melengkapi, bukan menggantikan, tombol **Cadangan data** di menu Data Gudep (isi aplikasi, JSON) dan `Cadangkan-SIGARDA.bat` (manual).
- Cara kerja dan pengujian: `scripts/cadangan/` (`otomatis.mjs`, `dump.mjs`, `enkripsi.mjs`, `unggah.mjs`, `apps-script/Kode.gs`), `uji/cadangan-otomatis.mjs`.
