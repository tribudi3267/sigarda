# SIGARDA, Gudep SMAN 1 Bukateja

**SIGARDA** = **S**istem **I**nformasi **Gar**uda dan SKU Penegak. Aplikasi web yang menjadi wadah pengujian
SKU Bantara dan Laksana serta penyusunan portofolio Penegak Garuda, ditambah absensi latihan Jumat dan materi SKU.

Dibangun dengan React 18, Vite, dan Tailwind CSS. Data disimpan di **Supabase** (Postgres + Auth + Edge Functions) sehingga
seluruh pengguna melihat data yang sama. Tanpa akun Supabase, aplikasi dapat dicoba dengan **mode lokal**
(`npm run dev:lokal`, Postgres yang berjalan di dalam browser).

Lambang SIGARDA: perisai cokelat-emas berisi elang bersayap tiga tingkat (Bantara, Laksana, Garuda) dengan
tanda centang lulus di dada. Berkas: `src/components/LogoMark.jsx` dan `public/favicon.svg`.
Nama dan tagline diatur di `APP` pada `src/config.js`.

## Daftar isi
1. [Peran dan fitur](#peran-dan-fitur)
2. [Menjalankan](#menjalankan)
3. [Menghubungkan ke Supabase](#menghubungkan-ke-supabase) (langkah demi langkah)
4. [Menerbitkan ke GitHub Pages](#menerbitkan-ke-github-pages)
5. [Keamanan: cara kerja dan batasnya](#keamanan-cara-kerja-dan-batasnya)
6. [Struktur folder](#struktur-folder) dan [pengujian](#pengujian)

## Peran dan fitur

Peran anggota penegak ditentukan otomatis dari progres SKU:

| Peran | Kapan | Yang dikerjakan |
|---|---|---|
| Penegak Calon Bantara | Belum lulus seluruh butir SKU Bantara | SKU Bantara (23 butir) |
| Penegak Calon Laksana | SKU Bantara lulus semua | SKU Laksana (22 butir) |
| Penegak Calon Garuda | SKU Bantara dan Laksana lulus, lalu **mendaftarkan diri** dari Beranda (atau ditetapkan admin) | Jurnal portofolio 26 dokumen |

Pengguna lain: **Dewan Ambalan** dan **Pembina** (keduanya penguji), serta **Admin Gudep**.

| Menu | Penegak | Dewan Ambalan / Pembina | Admin |
|---|---|---|---|
| Dashboard | Beranda progres SKU. Calon Garuda: dashboard jurnal portofolio | Antrian uji, rekap absensi, rekap portofolio | Rekap anggota, absensi, portofolio, kelulusan SKU |
| Poin SKU | Lihat butir, ajukan uji; tombol **Materi** pada butir yang punya materi | Menilai butir (wajib PIN) | Lihat |
| Materi | Baca materi (pratinjau PDF Google Drive, daftar isi, saringan tingkat dan butir) | Sama | Sama |
| Kelola Materi | | Hanya **Pembina**: tambah, ubah, urutkan, hapus | Tambah, ubah, urutkan, hapus |
| Absensi | Riwayat kehadiran sendiri (dicatat pengurus) | Catat absensi, rekap, unduh Excel | Sama dengan penguji |
| Portofolio | (di dashboard Garuda) isi status, catatan, tautan | Tinjau dan beri catatan, rekap, unduh Excel | Rekap, unduh Excel |
| Sidang | | Antrian sidang, lembar sidang (Layak dan Lulus / Ditunda-Remedi), riwayat, cetak Berita Acara, pengaturan nomor dan ketua. Hapus catatan: hanya Pembina | Sama dengan penguji, termasuk hapus |
| Anggota | | | Tambah, ubah, hapus anggota; import Excel dan unduh template (Penegak, Dewan Ambalan, Pembina) |
| Reset PIN | | Sesuai kewenangan (lihat di bawah) | Semua kecuali Admin |
| Akun (ikon di header) | Ganti PIN sendiri | Ganti PIN sendiri | Ganti PIN sendiri |
| Cetak | Kartu SKU, Surat Tanda Lulus | Idem | Idem |

### Masuk, nama pengguna, dan PIN
- **Nama pengguna** untuk masuk: Penegak memakai **NIS**; Dewan Ambalan, Pembina, dan Admin memakai nama pengguna yang
  ditetapkan admin (dibuat otomatis dari nama bila dikosongkan, mis. `budi.santoso`). Halaman masuk tidak menampilkan daftar nama.
- **PIN = tepat 6 angka**, tidak boleh angka sama semua atau berurutan (111111, 123456), dan tidak boleh sama dengan PIN lama.
- **PIN awal** dibuat admin saat menambah anggota (atau otomatis saat import Excel) lalu dibagikan langsung. Pada login pertama,
  layar **Buat PIN baru** menahan pengguna sampai PIN diganti. Ini **ditegakkan di server**: selama PIN belum diganti, server hanya
  melayani pembacaan profil sendiri dan penggantian PIN.
- **Ganti PIN** sukarela: ikon Akun di header, isi PIN lama dan PIN baru.
- **Reset PIN** membuat PIN acak 6 angka baru yang tampil satu kali kepada pengreset. Pemilik akun wajib menggantinya
  lagi saat login pertama. Siapa boleh mereset siapa:

  | Yang mereset | Boleh mereset |
  |---|---|
  | Admin Gudep | Penegak, Dewan Ambalan, Pembina |
  | Pembina | Penegak, Dewan Ambalan |
  | Dewan Ambalan | Penegak |

  PIN Admin tidak dapat direset peran lain di aplikasi (lihat [Lupa PIN Admin](#lupa-pin-admin)), dan tidak ada yang bisa mereset dirinya sendiri.
- **Penguncian**: 5 kali salah berturut-turut mengunci nama pengguna itu 5 menit (dihitung di server). Reset PIN melepas kunci.
- Penguji memasukkan PIN lagi saat menyimpan hasil uji sebagai verifikasi digital; PIN diperiksa di server.

### Import anggota dari Excel
Import tersedia untuk **Penegak, Dewan Ambalan, dan Pembina** (hanya Admin Gudep yang dapat mengimpor; akun Admin tidak diimpor).
Buka **Anggota**, pilih tab kelompoknya, lalu **Unduh template Excel**. Setiap kelompok punya template sendiri:

| Kelompok | Kolom template |
|---|---|
| Penegak | Nama Lengkap, **NIS (wajib, menjadi nama pengguna)**, Kelas, Sangga, Agama, PIN Awal (opsional) |
| Dewan Ambalan, Pembina | Nama Lengkap, Nama Pengguna (opsional), PIN Awal (opsional) |

Setelah diisi, klik **Import Excel**. Aplikasi menampilkan pratinjau per baris (siap atau dilewati beserta alasannya). Baris yang
lolos dikirim ke server per 25 akun; server memeriksa ulang dan bisa menolak baris tertentu. Penulisan kelas dan sangga disamakan
dengan data yang ada. Setelah impor, daftar **nama pengguna dan PIN awal** tampil satu kali dan dapat diunduh sebagai Excel.
Maksimal 500 baris per impor.

### Materi SKU dari Google Drive
Pembina dan Admin Gudep melampirkan **tautan berbagi** file PDF di Google Drive; aplikasi tidak menyimpan file, hanya tautannya.

**Menyiapkan file di Google Drive** (sekali per file): klik kanan file PDF, **Bagikan**, ubah **Akses umum** menjadi
**"Siapa saja yang memiliki link"** dengan peran **Pelihat**, lalu **Salin link**. Tanpa pengaturan ini, pratinjau akan
meminta izin masuk akun Google.

**Menambah materi** (menu Kelola Materi > Tambah materi): isi judul dan tempel tautan Drive (bentuk `file/d/.../view`,
`open?id=...`, `uc?id=...` dikenali; folder atau situs lain ditolak; **Tes pratinjau** memeriksa pengaturan berbagi sebelum
disimpan), pilih butir SKU terkait (boleh kosong), dan isi daftar isi (judul bagian dan nomor halaman; tersedia tempel banyak
sekaligus dengan format `Judul | halaman`). Menu **Materi** menampilkan daftar isi bernomor dan pratinjau PDF
(iframe `drive.google.com/file/d/{ID}/preview`, sama seperti PDF Drive pada Google Site). Pada daftar butir SKU muncul tombol
**Materi (n)** untuk butir yang punya materi. Nomor halaman hanya penunjuk letak; pratinjau Drive tidak dapat melompat ke halaman tertentu.

### SKU resmi Kwarnas
Butir SKU mengikuti Keputusan Kwarnas No. 198 Tahun 2011, Lampiran III (Bantara 23 butir, Laksana 22 butir).
Butir 1 (agama) diuraikan per sub-butir sesuai agama peserta: Islam, Katolik, Protestan, Hindu, Buddha.
Dokumen resmi tidak merinci Khonghucu, sehingga peserta Khonghucu mendapat satu butir pengganti yang
materinya ditetapkan Pembina. Sebuah butir lulus bila seluruh sub-butirnya lulus. Persentase dihitung per butir.

Aturan (diterapkan di server): butir Laksana baru bisa diajukan dan diuji setelah seluruh butir Bantara lulus.
Setiap kelulusan menghasilkan kode verifikasi digital (`VRF-XXXXXXX`) yang dibuat server dan tercetak di kartu SKU.

### Absensi latihan Jumat
- **Hanya pengurus** (Dewan Ambalan, Pembina, Admin) yang mencatat. Penegak hanya melihat riwayat kehadirannya.
- **Catat absensi** memakai date picker. Hanya Jumat yang diterima; tanggal yang belum tiba tidak dapat dicatat ("hari ini"
  dihitung menurut WIB). Tahun ajaran: Semester Ganjil Juli sampai Desember, Genap Januari sampai Juni; berlaku untuk tahun berapa pun.
- Anggota yang belum dicatat berstatus "belum dicatat" dan tidak dihitung; catat Alpa secara eksplisit.
  Kehadiran di bawah 75% ditandai merah (ubah `AMBANG_HADIR` di `src/config.js`).
- Rekap punya pencarian, filter sangga, kelas, dan peran, serta tombol **Unduh Excel (.xlsx)**.

### Portofolio Penegak Garuda
Daftar 26 lampiran dari file "03.01. Tabel Cek List Lampiran Berkas Dokumen Portofolio Garuda". Setiap dokumen
berstatus Belum siap, Sedang disiapkan, atau Siap (Ada), dengan catatan, tautan berkas (harus diawali http/https), dan jurnal perubahan.
Rekap tampil di dashboard Dewan Ambalan, Pembina, dan Admin, dan dapat diunduh sebagai Excel.

### Sidang Dewan Kehormatan Ambalan
Menu **Sidang** (Dewan Ambalan, Pembina, Admin) untuk keputusan Lulus atau Tidak Lulus SKU sebelum pelantikan. SKU pada dasarnya lulus/tidak lulus; predikat (Cukup, Baik, Sangat Baik) bukan ketentuan Kwarnas.
- **Antrian**: peserta yang seluruh butir tingkatnya lulus dan belum dinyatakan Layak. Peserta lain (capaian belum 100%) dapat dicari untuk keputusan Ditunda / Remedi.
- **Lembar sidang**: capaian dan rincian butir (tanggal dan penguji), elemen manual (masa magang atau tamu ambalan, tugas tambahan adat), NTA (opsional; tersimpan ke profil), keputusan, catatan, nomor berita acara.
  **"Layak dan Lulus" hanya bila seluruh butir tingkat itu lulus** (ditegakkan di server); satu peserta hanya sekali Layak per tingkat.
- **Berita Acara** siap cetak (A4) mengikuti format Ambalan. Nama ketua dan sebutan jabatannya dicatat saat sidang, jadi berita acara lama tidak berubah bila pengaturan diganti.
- **Pengaturan sidang** (dapat diubah Dewan Ambalan, Pembina, Admin):
  - **Format nomor berita acara**, diatur dengan **pilihan** (panjang nomor urut 1-6 angka, kode surat, bulan Romawi/angka/tanpa bulan, pemisah `/` `-` `.`, tingkat opsional; tahun selalu ada) atau ditulis **manual** dengan kode
    `{no}` `{no2}` `{no3}` `{no4}` `{no5}` `{no6}` (nomor urut dengan nol di depan sampai 2-6 angka), `{tahun}` `{bulan}` `{romawi}` `{tingkat}`. Contoh: `{no4}/DA/{romawi}/{tahun}` menghasilkan `0002/DA/VIII/2026`.
    Wajib memuat satu kode nomor urut dan `{tahun}`. Pratinjau memakai nomor urut yang benar-benar akan dipakai berikutnya (dari penghitung di server), dan bulan/tahun mengikuti tanggal sidang.
  - **Nomor urut berikutnya**: nomor mulai dari 1 tiap tahun dan tidak dipakai ulang setelah catatan dihapus. Untuk melanjutkan nomor yang sudah berjalan di kertas, atur nomor berikutnya (harus lebih besar dari nomor tertinggi yang sudah tercatat pada tahun itu). Nomor juga bisa diisi manual di lembar sidang.
  - Nama Ketua Dewan Penegak (kosong = garis tanda tangan) dan sebutan jabatan (bawaan "Ketua Dewan Penegak / Pemangku Adat").
- Catatan sidang hanya terbaca pengurus; semua penulisan lewat fungsi server `sg_sidang_simpan`, `sg_sidang_hapus`, `sg_pengaturan_simpan`.
- Belum termasuk: kolom NTA pada import Excel dan formulir Admin (NTA saat ini diisi di lembar sidang).

### Filter dinamis
Semua filter (sangga, kelas, peran, agama, tahun ajaran) dibangun dari data yang ada.

## Menjalankan

Prasyarat: Node.js 18 atau lebih baru.

```bash
npm install
npm run dev:lokal    # mode lokal: TANPA Supabase, data di browser ini saja, akun contoh tampil di halaman masuk
npm run dev          # memakai Supabase (butuh .env.local, lihat bagian berikutnya)
npm run build        # hasil produksi di folder dist/
npm run skema        # membuat ulang supabase/skema.sql dari supabase/sumber/inti.sql + data butir SKU
```

**Mode lokal** menjalankan Postgres sungguhan (PGlite) di dalam browser dengan skema SQL, aturan akses, dan Edge Function
yang sama dengan Supabase, dan diisi data contoh. Cocok untuk mencoba semua peran dan alur tanpa akun Supabase. Data tersimpan di
IndexedDB browser dan tidak dibagikan antar perangkat. Kode mode lokal tidak ikut ke hasil build produksi.

## Menghubungkan ke Supabase

Lakukan sekali, berurutan.

### 1. Buat skema database
Supabase > **SQL Editor** > **New query**, tempel seluruh isi [`supabase/skema.sql`](supabase/skema.sql), lalu **Run**.
**Peringatan:** berkas ini menghapus tabel SIGARDA yang sudah ada (termasuk dari versi README lama) lalu membuatnya ulang. Aman pada proyek yang masih kosong.

### 2. Kunci pendaftaran sendiri
**Authentication > Sign In / Providers** (nama menu dapat sedikit berbeda menurut versi dashboard):
matikan **Allow new users to sign up**, dan pada penyedia **Email** matikan **Confirm email**. Semua akun dibuat oleh Admin.

### 3. Buat akun Admin pertama
1. **Authentication > Users > Add user > Create new user**: email `admin@sigarda.invalid`, password = PIN 6 angka pilihan Anda
   (bukan angka sama semua atau berurutan), centang **Auto Confirm User**.
2. Jalankan [`supabase/admin_pertama.sql`](supabase/admin_pertama.sql) di SQL Editor. Harus menampilkan 1 baris.

Akun login memakai email tiruan `NAMAPENGGUNA@sigarda.invalid`; domain `.invalid` tidak pernah dapat menerima email, sehingga tidak ada
pihak luar yang bisa mengambil alih akun lewat "lupa kata sandi". Pengguna tidak pernah melihat email ini.

### 4. Pasang Edge Function `sigarda`
Edge Function menangani hal-hal yang tidak boleh dilakukan browser: login dengan pembatasan percobaan, membuat/mereset/menghapus akun,
ganti PIN, dan verifikasi PIN penguji.
1. **Edge Functions > Deploy a new function > Via Editor**. Nama fungsi: `sigarda` (persis).
2. Ganti seluruh isi editor dengan isi [`supabase/functions/sigarda/index.ts`](supabase/functions/sigarda/index.ts), lalu **Deploy**.
3. Buka pengaturan fungsi `sigarda` dan **matikan "Verify JWT"** (Enforce JWT Verification). Pemeriksaan sesi dilakukan di kode fungsi;
   kunci API baru Supabase bukan JWT sehingga pemeriksaan bawaan akan menolak semua permintaan.

Dengan CLI: `supabase functions deploy sigarda --no-verify-jwt`.

**Nama fungsi.** Deploy lewat editor dashboard kadang memberi alamat dengan nama acak (mis. `hello-world`), walau Anda mengetik `sigarda`.
Buka fungsi itu, tab **Details**, lihat **Endpoint URL** (`https://KODE.supabase.co/functions/v1/NAMA`). Bila `NAMA` bukan `sigarda`,
tambahkan `VITE_NAMA_FUNGSI=NAMA` pada `.env.local` (dan variabel repositori GitHub dengan nama yang sama), lalu jalankan ulang `npm run dev`.

Secrets opsional (Edge Functions > Secrets), hanya bila perlu:

| Secret | Kapan |
|---|---|
| `SIGARDA_ANON_KEY` | Jika fungsi mengeluh kunci anon tidak tersedia: isi dengan kunci anon/publishable yang sama dengan `VITE_SUPABASE_ANON_KEY` |
| `SIGARDA_EMAIL_DOMAIN` | Jika Supabase menolak email berakhiran `.invalid` (lihat di bawah) |

### 5. Hubungkan aplikasi
Salin `.env.example` menjadi `.env.local`, isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` (Project Settings > API Keys:
**Project URL** dan kunci **anon / publishable**). **Jangan pernah** mengisi kunci `service_role` / `secret` di aplikasi atau GitHub.
Lalu `npm run dev`, masuk dengan `admin` dan PIN Anda; aplikasi langsung meminta PIN baru.

### 6. Uji cepat setelah pemasangan
1. Masuk sebagai `admin` -> diminta PIN baru -> masuk.
2. **Anggota > Tambah anggota**: buat satu Pembina dan satu Penegak (catat nama pengguna dan PIN yang tampil).
3. Masuk sebagai Penegak (NIS + PIN awal) -> diminta PIN baru. Ajukan satu butir SKU.
4. Masuk sebagai Pembina -> Antrian -> Nilai -> lulus (PIN diminta).
5. Kembali sebagai Penegak: butir tampil lulus dengan kode `VRF-...`.

### Bila email `.invalid` ditolak
Jika langkah 3 menampilkan galat email tidak valid: pilih domain lain yang tidak akan Anda miliki emailnya (mis. `sigarda.example`),
buat akun admin dengan domain itu, dan isi secret `SIGARDA_EMAIL_DOMAIN` dengan domain yang sama, lalu jalankan `admin_pertama.sql`
setelah mengganti email di dalamnya. Domain ini harus sama untuk seluruh akun.

### Lupa PIN Admin
Peran lain tidak dapat mereset Admin. Pengelola proyek Supabase dapat memulihkannya lewat [`supabase/pulihkan_pin_admin.sql`](supabase/pulihkan_pin_admin.sql)
(SQL Editor). Untuk akun lain, gunakan menu Reset PIN.

## Menerbitkan ke GitHub Pages

Berkas `.github/workflows/deploy.yml` membangun dan menerbitkan otomatis setiap `git push` ke `main`.
1. Di repositori GitHub: **Settings > Secrets and variables > Actions > tab Variables > New repository variable**, buat dua variabel:
   `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` (nilai sama dengan `.env.local`). Gunakan **Variables**, bukan Secrets.
2. **Settings > Pages > Source: GitHub Actions**.
3. `git push`. Pantau tab **Actions**. Bila variabel belum diisi, proses berhenti dengan pesan yang jelas (situs lama tetap tampil).
4. Alamat situs: `https://NAMAAKUN.github.io/NAMAREPO/`.

**Domain khusus** (mis. `sigarda.smabukateja.sch.id`): di **Settings > Pages > Custom domain** isi domainnya dan centang **Enforce HTTPS**; di DNS domain buat rekaman
`CNAME` untuk subdomain itu yang menunjuk ke `NAMAAKUN.github.io`. Situs lalu dilayani dari akar domain, sehingga `VITE_BASE` di `deploy.yml` harus `/`
(bukan `/NAMAREPO/`). Bila keliru, halaman tampil **putih kosong** karena berkas JS/CSS dicari di `/NAMAREPO/assets/...` yang tidak ada di domain khusus.
Setelah domain khusus aktif, alamat `github.io/NAMAREPO/` otomatis dialihkan ke domain khusus.

Kunci anon memang terlihat di browser; ini aman karena semua data dilindungi aturan akses (RLS) di database.

## Keamanan: cara kerja dan batasnya

**Yang ditegakkan di server** (bukan hanya tampilan): peran dan hak akses per tabel (RLS), tidak ada penulisan langsung ke tabel oleh pengguna mana pun
(semua lewat fungsi `sg_*`), aturan SKU (Bantara sebelum Laksana, hanya penguji yang menilai, PIN penguji diverifikasi, kode verifikasi),
hak reset PIN, pembatasan percobaan masuk, dan kewajiban ganti PIN awal. Fungsi `*_internal` hanya dapat dipanggil Edge Function.
Tautan Drive divalidasi dan tautan portofolio harus `http(s)://` (mencegah `javascript:`).

**Batas percobaan masuk.** Semua login lewat satu Edge Function, sehingga bagi Supabase Auth semuanya berasal dari satu alamat IP dan batas bawaan
percobaan masuk per IP dapat tercapai bila banyak orang masuk bersamaan (mis. seluruh anggota membuka aplikasi dalam beberapa menit). Bila itu terjadi,
pengguna melihat "Server sedang menerima terlalu banyak percobaan masuk" (bukan salah PIN, dan tidak dihitung sebagai percobaan salah). Naikkan batasnya di
**Authentication > Rate Limits** bila tersedia pada paket Anda.

**Data pribadi.** Nama, NIS, kelas, dan agama anggota (sebagian besar di bawah umur) tersimpan di server Supabase. Pastikan pihak sekolah atau Pembina mengetahui dan menyetujuinya.
Paket gratis Supabase menonaktifkan proyek yang tidak dipakai sekitar 1 minggu (dapat dihidupkan lagi dari dashboard) dan tidak menyediakan cadangan harian otomatis: cadangkan sendiri (lihat bawah).

### Cadangan data (satu klik)
Klik dua kali [`Cadangkan-SIGARDA.bat`](Cadangkan-SIGARDA.bat) (tanpa Docker; hanya butuh Node). Saat pertama kali, tempel alamat **Session pooler**
(Dashboard > **Connect** > tab Session pooler) dan ketik password database; alamat disimpan tanpa password, password tidak pernah disimpan.
Hasilnya di `%USERPROFILE%\Cadangan-SIGARDA\TAHUN-BULAN-TANGGAL_JAMMENIT\`: `sigarda-cadangan.sql` (akun login berikut hash PIN, dan seluruh data) serta `BACA-SAYA.txt`
(cara memulihkan). Koneksi hanya-baca. Berkas ini rahasia: jangan diunggah ke GitHub. Sumber kode: [`scripts/cadangan/cadangkan.mjs`](scripts/cadangan/cadangkan.mjs).

### Pemuatan data bertahap (agar tetap ringan)
Absensi adalah data terbesar (satu baris per anggota per Jumat, ribuan baris per tahun). Karena itu saat masuk hanya dimuat **daftar sesi** (satu baris per Jumat, kecil)
dan **kehadiran semester yang sedang berjalan**. Kehadiran tahun ajaran atau semester lain baru diminta ke server ketika pengguna memilihnya pada filter periode
(tampil "Memuat data absensi..." sebentar), lalu disimpan di memori sehingga pilihan yang sama tidak diminta lagi. Berlaku untuk semua peran; Penegak hanya menerima barisnya sendiri.
Periode tanpa satu pun sesi (mis. masa depan) tidak menghubungi server. Rincian: `useAbsensiPeriode` dan `pastikanAbsensi` di `src/hooks` dan `src/context/AppContext.jsx`.

**Yang masih dimuat penuh saat masuk pengurus:** daftar anggota, progres SKU, dan portofolio (bukan data per tahun ajaran, jadi tidak bisa disaring per semester). Untuk ratusan sampai sekitar seribu Penegak ini masih wajar;
bila kelak jauh lebih besar, langkah berikutnya memuat riwayat SKU per anggota saat detailnya dibuka.

### Memperbarui database yang sudah berjalan (migrasi)
**Jangan menjalankan `supabase/skema.sql` ulang pada database yang sudah berisi data**: berkas itu menghapus semua tabel. Perubahan skema untuk database berjalan ada di folder
[`supabase/migrasi/`](supabase/migrasi), dijalankan satu per satu di SQL Editor (aman diulang, tidak menyentuh data):
- [`2026-09-rls-ringan.sql`](supabase/migrasi/2026-09-rls-ringan.sql): aturan baca (RLS) dihitung sekali per kueri, bukan sekali per baris. Pada 20 ribu baris progres, membaca milik sendiri turun dari sekitar 1 detik menjadi sekitar 7 milidetik (diukur di PGlite; angka di Supabase berbeda, arahnya sama).
- [`2026-09-sidang-dk.sql`](supabase/migrasi/2026-09-sidang-dk.sql): Sidang Dewan Kehormatan dan Pengaturan. Hanya menambah 3 tabel (`pengaturan`, `sidang_dk`, `sidang_urut`), kolom `profiles.nta`, dan fungsi baru.
  **Wajib dijalankan sebelum menerbitkan kode Sidang**, karena halaman Sidang membaca tabel baru itu. Jalankan setelah `2026-09-rls-ringan.sql`.
- [`2026-09-sidang-format-nomor.sql`](supabase/migrasi/2026-09-sidang-format-nomor.sql): kode nomor `{no2}`-`{no6}` (nomor 4 angka dan seterusnya), penghitung nomor urut dapat dibaca pengurus, dan fungsi `sg_sidang_urut_atur`.
  Jalankan **setelah** `2026-09-sidang-dk.sql`. Catatan sidang dan pengaturan yang sudah ada tidak berubah.
Urutan pembaruan: jalankan migrasi lebih dulu (aplikasi lama tetap berjalan), lalu `git push` untuk kode baru.

## Struktur folder

```
sku-bukateja/
├── index.html  package.json  vite.config.js  tailwind.config.js  postcss.config.js
├── .env.example  .env.lokal            contoh variabel; .env.lokal untuk npm run dev:lokal
├── .github/workflows/deploy.yml        terbit otomatis ke GitHub Pages
├── scripts/buat-skema.mjs              membuat supabase/skema.sql (menyisipkan katalog butir dari src/data)
├── supabase/
│   ├── skema.sql                       (dibuat otomatis) tabel, RLS, fungsi sg_*, katalog. Dijalankan di SQL Editor
│   ├── sumber/inti.sql                 sumber skema tanpa katalog (EDIT DI SINI, lalu npm run skema)
│   ├── migrasi/                        perubahan skema untuk database yang SUDAH berisi data (jalankan berurutan, aman diulang)
│   ├── demo/                           data demo Penegak untuk pengujian (data_demo_penegak.sql) dan pembersihnya (hapus_data_demo.sql)
│   ├── admin_pertama.sql               profil admin pertama
│   ├── pulihkan_pin_admin.sql          pemulihan PIN admin oleh pengelola Supabase
│   ├── functions/sigarda/index.ts      Edge Function tunggal (login, akun, PIN, verifikasi penguji)
│   └── lokal/stub.sql                  tiruan peran/skema auth Supabase, khusus mode lokal dan pengujian
├── public/favicon.svg
└── src/
    ├── main.jsx  App.jsx  index.css  config.js
    ├── data/                           skuData.js (butir resmi), portofolioData.js, seed.js (data contoh mode lokal)
    ├── lib/
    │   ├── supabaseClient.js           klien Supabase (atau lokal)
    │   ├── api.js                      satu-satunya lapisan yang berbicara ke Supabase (tabel, sg_*, Edge Function)
    │   ├── mapDb.js                    tabel server -> bentuk data yang dipakai halaman
    │   ├── skuLogic.js  absensiLogic.js  portofolioLogic.js  materiLogic.js  sidangLogic.js  pinLogic.js  importAnggota.js  cariNama.js
    │   └── exportXlsx.js  exportLaporan.js  format.js
    ├── lokal/                          backend lokal: klien tiruan di atas PGlite, data contoh (bukan produksi)
    ├── context/AppContext.jsx          state global (salinan data sesuai izin) dan semua aksi
    ├── hooks/useAbsensiPeriode.js      memuat kehadiran semester yang dipilih saat filter periode diubah
    ├── components/                     Layout, Footer, Login, FormGantiPin, ImportAnggotaModal, SkuChecklist, PratinjauDrive, BeritaAcaraSidang, ...
    └── pages/                          PesertaBeranda, PesertaSku, Materi, KelolaMateri, Absensi, Sidang, ResetPin, AdminAnggota, ...
```

## Pengujian

Skema SQL dan logika Edge Function dijalankan pada Postgres sungguhan (PGlite) dengan klien tiruan yang meniru peran Supabase, RLS, dan batas 1000 baris.
Yang diuji: siapa boleh membaca apa, penulisan langsung ditolak untuk semua peran, semua fungsi `sg_*` (aturan SKU, absensi, portofolio, materi, anggota),
hak reset PIN, pembatasan login, kewajiban ganti PIN, dan pemetaan data ke bentuk yang dipakai halaman.
Yang **tidak** dapat diuji tanpa proyek Supabase sungguhan: perilaku GoTrue (mis. penerimaan email `.invalid`), PostgREST, dan runtime Deno. Gunakan "Uji cepat" di atas setelah pemasangan.

### Data demo untuk pengujian di Supabase
[`supabase/demo/data_demo_penegak.sql`](supabase/demo/data_demo_penegak.sql) membuat 8 Penegak demo (NIS `990001`-`990008`, PIN `352817`, langsung bisa masuk) dengan kemajuan SKU yang beragam:
Bantara penuh, Bantara dan Laksana penuh, Laksana sebagian, butir menunggu/diuji/diulang, butir agama lulus sebagian (menguji blokir "Layak" pada Sidang), Calon Garuda dengan portofolio, dan Khonghucu.
Jalankan di SQL Editor; aman diulang (akun tidak digandakan, data SKU demo direset). Tidak menyentuh anggota asli. Setelah selesai menguji, jalankan
[`supabase/demo/hapus_data_demo.sql`](supabase/demo/hapus_data_demo.sql), yang menghapus hanya akun ber-NIS `9900xx` dengan nama berawalan "Demo " beserta seluruh datanya.
Skrip membuat akun langsung di `auth.users`; bila gagal di proyek Anda, buat 8 akun itu lewat Anggota > Import Excel lalu jalankan skrip lagi (akun yang sudah ada dilewati, datanya tetap diisi).

## Menyesuaikan untuk Gudep

1. **Identitas dan tanda tangan**: ubah `src/config.js` (nomor gudep, nama Pembina, Pradana).
2. **Butir SKU**: `src/data/skuData.js` sudah berisi butir resmi. Jangan mengubah `id` setelah ada data progres. Setelah mengubah data butir/portofolio, jalankan `npm run skema` dan jalankan ulang bagian katalog di database.
3. **Anggota**: tambah lewat menu Anggota (Admin). Isi agama dengan benar karena menentukan sub-butir butir 1.
4. **Logo**: ganti isi `src/components/LogoMark.jsx`. **Warna**: `tailwind.config.js` (`pramuka` = cokelat, `emas` = aksen).

## Mencetak dan PDF

Menu Cetak menampilkan pratinjau. Klik "Cetak atau simpan PDF", lalu pada dialog cetak browser pilih "Simpan sebagai PDF".
Kartu SKU dicetak A4 potret, Surat Tanda Lulus A4 lanskap. Aktifkan opsi "Grafik latar belakang" bila warna tidak muncul.
