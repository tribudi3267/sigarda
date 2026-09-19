# SIGARDA, Gudep SMAN 1 Bukateja

**SIGARDA** = **S**istem **I**nformasi **Gar**uda dan SKU Penegak. Aplikasi web yang menjadi wadah pengujian
SKU Bantara dan Laksana serta penyusunan portofolio Penegak Garuda, ditambah absensi latihan Jumat.
Dibangun dengan React 18, Vite, dan Tailwind CSS. Versi ini memakai `localStorage` sebagai prototipe.

Lambang SIGARDA: perisai cokelat-emas berisi elang bersayap tiga tingkat (Bantara, Laksana, Garuda) dengan
tanda centang lulus di dada. Berkas: `src/components/LogoMark.jsx` dan `public/favicon.svg`.
Nama dan tagline diatur di `APP` pada `src/config.js`.

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
| Anggota | | | Tambah, ubah, hapus anggota; import Excel dan unduh template (Penegak, Dewan Ambalan, Pembina) |
| Reset PIN | | Sesuai kewenangan (lihat "PIN dan keamanan akun") | Semua kecuali Admin |
| Akun (ikon di header) | Ganti PIN sendiri | Ganti PIN sendiri | Ganti PIN sendiri |
| Cetak | Kartu SKU, Surat Tanda Lulus | Idem | Idem |

### PIN dan keamanan akun
- **PIN awal** dibuat admin saat menambah anggota (atau otomatis saat import Excel) lalu dibagikan langsung.
  Pada login pertama, layar **Buat PIN baru** menahan pengguna sampai PIN diganti. Tidak bisa dilewati, juga setelah muat ulang.
- **Ganti PIN** sukarela: ikon Akun di header, isi PIN lama dan PIN baru.
- **Aturan PIN baru**: 4 sampai 6 angka, tidak boleh angka sama semua atau berurutan (1111, 1234), tidak boleh sama dengan PIN lama.
- **Reset PIN** membuat PIN acak 6 angka baru yang tampil satu kali kepada pengreset. Pemilik akun wajib menggantinya
  lagi saat login pertama. Siapa boleh mereset siapa:

  | Yang mereset | Boleh mereset |
  |---|---|
  | Admin Gudep | Penegak, Dewan Ambalan, Pembina |
  | Pembina | Penegak, Dewan Ambalan |
  | Dewan Ambalan | Penegak |

  PIN Admin tidak dapat direset peran lain, dan tidak ada yang bisa mereset dirinya sendiri (pakai Ganti PIN).
- **Penguncian**: 5 kali salah berturut-turut mengunci login akun itu 5 menit. Reset PIN melepas kunci.
- Catatan: pada prototipe PIN tersimpan di `localStorage` tanpa enkripsi. Keamanan sungguhan memerlukan Supabase Auth (lihat bagian bawah).

### Import anggota dari Excel
Import tersedia untuk **Penegak, Dewan Ambalan, dan Pembina** (hanya Admin Gudep yang dapat mengimpor; akun Admin tidak diimpor).
Buka **Anggota**, pilih tab kelompoknya, lalu **Unduh template Excel**. Setiap kelompok punya template sendiri:

| Kelompok | Kolom template |
|---|---|
| Penegak | Nama Lengkap, NIS, Kelas, Sangga, Agama, PIN Awal (opsional) |
| Dewan Ambalan, Pembina | Nama Lengkap, PIN Awal (opsional) |

Setelah diisi, klik **Import Excel**. Aplikasi menampilkan pratinjau per baris (siap atau dilewati beserta alasannya: isian kosong,
agama tidak dikenal, PIN bukan 4 sampai 6 angka, data ganda). Data ganda: Penegak berdasarkan NIS (atau nama dan kelas bila NIS kosong);
Dewan Ambalan dan Pembina berdasarkan nama pada jabatan yang sama. File dari template kelompok lain ditolak dengan pesan yang jelas.
Penulisan sangga dan kelas disamakan dengan data yang ada. Setelah impor, daftar PIN awal tampil satu kali dan dapat diunduh
sebagai Excel. Maksimal 500 baris per impor. Tab Dewan Ambalan dan Pembina di menu Anggota dan Reset PIN memiliki kolom cari nama.

### Materi SKU dari Google Drive
Pembina dan Admin Gudep melampirkan **tautan berbagi** file PDF di Google Drive; aplikasi tidak menyimpan file, hanya tautannya.

**Menyiapkan file di Google Drive** (sekali per file): klik kanan file PDF, **Bagikan**, ubah **Akses umum** menjadi
**"Siapa saja yang memiliki link"** dengan peran **Pelihat**, lalu **Salin link**. Tanpa pengaturan ini, pratinjau akan
meminta izin masuk akun Google.

**Menambah materi** (menu Kelola Materi > Tambah materi):
1. Isi **judul materi** (tampil di daftar isi) dan tempel tautan Drive. Bentuk `drive.google.com/file/d/.../view`, `open?id=...`,
   dan `uc?id=...` dikenali; tautan folder atau situs lain ditolak. **Tes pratinjau** menampilkan file langsung di formulir
   sehingga pengaturan berbagi bisa dicek sebelum disimpan.
2. Pilih **butir SKU terkait** (Bantara dan/atau Laksana; boleh kosong untuk materi umum).
3. Isi **daftar isi** materi (judul bagian dan nomor halaman, opsional). Tersedia "Tempel banyak sekaligus": satu baris satu
   bagian dengan format `Judul | halaman`.

**Tampilan**: menu **Materi** (semua peran) berisi daftar isi bernomor di sisi kiri (di ponsel: tombol lipat) dan tiap materi
sebagai bagian halaman dengan pratinjau PDF (iframe `drive.google.com/file/d/{ID}/preview`, sama seperti melampirkan PDF Drive
di Google Site), tombol **Buka file lengkap di Google Drive**, saringan tingkat/butir, dan pencarian. Pada daftar butir SKU
(Poin SKU Penegak, dan rincian peserta untuk Dewan Ambalan/Pembina/Admin) muncul tombol **Materi (n)** pada butir yang punya
materi; tombol itu membuka halaman Materi yang sudah tersaring pada butir tersebut.

**Catatan**: nomor halaman pada daftar isi hanya penunjuk letak; pratinjau Google Drive tidak menyediakan cara resmi untuk
melompat ke halaman tertentu, jadi pembaca menggulir sendiri. Alamat iframe selalu dibentuk dari ID file yang divalidasi.
Tidak ada materi contoh bawaan (data contoh tidak memuat tautan Drive palsu).

### Halaman masuk: pencarian nama
Kolom Nama tidak menampilkan seluruh daftar. Pengguna memilih peran, mengetik beberapa huruf nama, lalu memilih dari
paling banyak 8 nama yang paling relevan (awalan nama, awalan kata, huruf di tengah kata; huruf yang hilang pun ditoleransi).
Ini menjaga halaman tetap ringan walau anggota dari tahun ke tahun mencapai ribuan (diuji 3.400 pengguna: 1 sampai 9 ms per ketikan),
dan daftar nama tidak terbuka sebelum pengguna mengetik. Mendukung keyboard (panah, Enter, Esc) dan pembaca layar.

### SKU resmi Kwarnas
Butir SKU mengikuti Keputusan Kwarnas No. 198 Tahun 2011, Lampiran III (Bantara 23 butir, Laksana 22 butir).
Butir 1 (agama) diuraikan per sub-butir sesuai agama peserta: Islam, Katolik, Protestan, Hindu, Buddha.
Dokumen resmi tidak merinci Khonghucu, sehingga peserta Khonghucu mendapat satu butir pengganti yang
materinya ditetapkan Pembina.
Sebuah butir lulus bila seluruh sub-butirnya lulus. Persentase dihitung per butir.

Aturan: butir Laksana baru bisa diajukan dan diuji setelah seluruh butir Bantara lulus.
Setiap kelulusan menghasilkan kode verifikasi digital (`VRF-XXXXXXX`) yang tercetak di kartu SKU.

### Absensi latihan Jumat
- **Hanya pengurus** (Dewan Ambalan, Pembina, Admin) yang mencatat. Penegak hanya melihat riwayat kehadirannya.
- **Catat absensi** memakai date picker. Pilih tanggal (hanya Jumat yang diterima; tanggal lain menawarkan Jumat terdekat),
  atau pakai tombol Jumat sebelumnya, Jumat berikutnya, Jumat terakhir. Hari, tanggal, bulan, tahun, tahun ajaran, dan
  semester terbaca otomatis dari tanggal, sehingga berlaku untuk tahun ajaran berapa pun (2000 sampai 2100),
  termasuk pengisian susulan. Tanggal yang belum tiba tidak dapat dicatat.
- Tahun ajaran: Semester Ganjil Juli sampai Desember, Genap Januari sampai Juni. Rekap dapat ditampilkan per semester atau
  satu tahun ajaran; pilihan tahun ajaran mencakup 3 tahun ke belakang, 2 tahun ke depan, dan semua tahun yang punya data.
- Anggota yang belum dicatat pada sebuah sesi berstatus "belum dicatat" dan tidak dihitung; catat Alpa secara eksplisit.
  Kehadiran di bawah 75% ditandai merah (ubah `AMBANG_HADIR` di `src/config.js`).
- Rekap punya pencarian nama atau NIS, filter sangga, kelas, dan peran, serta tombol **Unduh Excel (.xlsx)**
  (lembar Rekap, Per Jumat, Keterangan). Hasil unduhan mengikuti filter yang sedang aktif.

### Portofolio Penegak Garuda
Daftar 26 lampiran dari file "03.01. Tabel Cek List Lampiran Berkas Dokumen Portofolio Garuda". Setiap dokumen
berstatus Belum siap, Sedang disiapkan, atau Siap (Ada), dengan catatan, tautan berkas, dan jurnal perubahan.
Rekap (jumlah siap, belum siap, persentase) tampil di dashboard Dewan Ambalan, Pembina, dan Admin, dan dapat
diunduh sebagai Excel.

### Filter dinamis
Semua filter (sangga, kelas, peran, agama, tahun ajaran) dibangun dari data yang ada. Menambah anggota dengan
sangga atau kelas baru langsung memunculkan pilihan baru di semua filter. Pada form anggota, sangga dan kelas
diketik bebas dengan saran otomatis.

Akun demo (data fiktif), PIN awal: penegak `1111`, Pembina `2222`, Dewan Ambalan `3333`, admin `1234`. Semua wajib diganti saat login pertama; `Kembalikan data contoh` di halaman masuk mengulang dari awal.

## Struktur folder

```
sku-bukateja/
├── index.html  package.json  vite.config.js  tailwind.config.js  postcss.config.js
├── public/favicon.svg
└── src/
    ├── main.jsx                 titik masuk React
    ├── App.jsx                  menu per peran, navigasi
    ├── index.css                Tailwind, komponen gaya, aturan cetak
    ├── config.js                nama aplikasi (SIGARDA), identitas Gudep, ambang absensi, kelompok pengguna
    ├── data/
    │   ├── skuData.js           butir SKU resmi Bantara dan Laksana (EDIT DI SINI)
    │   ├── portofolioData.js    26 dokumen portofolio Garuda (EDIT DI SINI)
    │   └── seed.js              data contoh awal
    ├── lib/
    │   ├── skuLogic.js          status, progres, peran, pengajuan, penilaian, rekap
    │   ├── absensiLogic.js      sesi Jumat, tanggal, semester, tahun ajaran, rekap kehadiran
    │   ├── pinLogic.js          aturan PIN, PIN acak, hak reset, penguncian login
    │   ├── importAnggota.js     template, pembaca, dan pemeriksaan import Excel (Penegak, Dewan, Pembina)
    │   ├── cariNama.js          pencarian nama untuk halaman masuk (indeks, peringkat relevansi)
    │   ├── materiLogic.js       tautan Drive, validasi materi, saringan, katalog butir, hak kelola
    │   ├── portofolioLogic.js   jurnal dan rekap kesiapan portofolio
    │   ├── exportXlsx.js        pembuat file .xlsx (ExcelJS, dimuat saat diunduh)
    │   ├── exportLaporan.js     susunan lembar Excel absensi dan portofolio
    │   ├── storage.js           lapisan penyimpanan (localStorage)
    │   └── format.js            tanggal, id, kode verifikasi, urutan
    ├── context/AppContext.jsx   state global, login, semua aksi
    ├── components/
    │   ├── Layout  Footer  Login  LogoMark (lambang SIGARDA)  ui
    │   ├── FormGantiPin         ganti PIN (wajib dan sukarela)
    │   ├── PencarianNama        kolom nama dengan saran (combobox) di halaman masuk
    │   ├── PratinjauDrive  ChipButir   pratinjau PDF Google Drive, lencana butir SKU
    │   ├── ImportAnggotaModal   import Excel: pilih, periksa, hasil
    │   ├── FilterBar            filter dinamis dari data
    │   ├── SkuChecklist         butir SKU, butir 1 dengan sub-butir
    │   ├── PortofolioChecklist  cek list 26 dokumen
    │   ├── RekapKesiapan        progress bar, peta dokumen, jurnal
    │   ├── RingkasanGudep       ringkasan untuk dashboard pengurus
    │   ├── PilihPeriode         tahun ajaran dan semester
    │   ├── AjukanModal  UjiModal  TingkatTabs  DokumenSku
    └── pages/
        ├── PesertaBeranda  PesertaSku  GarudaDashboard  Absensi
        ├── Akun  ResetPin  GantiPinWajib  Materi  KelolaMateri
        ├── PengujiDashboard  PesertaDetail  Portofolio
        ├── AdminDashboard  AdminAnggota
        └── CetakDokumen
```

## Menjalankan di komputer

Prasyarat: Node.js 18 atau lebih baru.

```bash
cd sku-bukateja
npm install
npm run dev          # buka alamat yang tampil, biasanya http://localhost:5173
npm run build        # hasil produksi di folder dist/
npm run preview      # uji hasil build secara lokal
```

## Menyesuaikan untuk Gudep

1. **Identitas dan tanda tangan**: ubah `src/config.js` (nomor gudep, nama Pembina, Pradana).
2. **Butir SKU**: `src/data/skuData.js` sudah berisi butir resmi. Jangan mengubah `id` setelah ada data progres.
3. **Dokumen portofolio**: ubah `src/data/portofolioData.js` bila tabel cek list berubah. Jumlah dan persentase menyesuaikan.
4. **Anggota**: tambah lewat menu Anggota (Admin). Isi agama dengan benar karena menentukan sub-butir butir 1.
5. **Logo**: taruh logo resmi di `public/logo-gudep.png`, lalu ganti isi `src/components/LogoMark.jsx`.
6. **Warna**: palet ada di `tailwind.config.js` (`pramuka` = cokelat, `emas` = aksen).

## Mencetak dan PDF

Menu Cetak menampilkan pratinjau. Klik "Cetak atau simpan PDF", lalu pada dialog cetak browser pilih
"Simpan sebagai PDF". Kartu SKU dicetak A4 potret, Surat Tanda Lulus A4 lanskap.
Aktifkan opsi "Grafik latar belakang" bila warna tidak muncul.

## Publikasi

### Vercel (paling mudah)
1. Unggah proyek ke repositori GitHub.
2. Di vercel.com pilih **Add New > Project**, impor repositori. Framework terdeteksi sebagai Vite.
3. Build command `npm run build`, output directory `dist`. Klik **Deploy**.

### Netlify
Impor repositori, build command `npm run build`, publish directory `dist`.

### GitHub Pages
```bash
VITE_BASE=/nama-repositori/ npm run build
```
Lalu publikasikan isi folder `dist/` (mis. dengan paket `gh-pages` atau GitHub Actions).

## Penting: data localStorage hanya ada di satu browser

Pada versi prototipe, data tersimpan di browser masing-masing perangkat. Peserta di ponsel dan penguji
di laptop TIDAK saling melihat data. Untuk pemakaian nyata lintas perangkat, pindahkan ke Supabase
atau Firebase (bagian berikut). PIN pada prototipe juga tersimpan tanpa enkripsi, jadi jangan dipakai
untuk data sungguhan.

Struktur data v2 (kunci `sku_bukateja_db_v2`). Akun yang dibuat sebelum fitur PIN dianggap masih memakai PIN awal dan
wajib menggantinya pada login berikutnya. Gunakan "Kembalikan data contoh" untuk mengulang dari awal.

## Pindah ke Supabase

1. Buat proyek di supabase.com, lalu jalankan skema ini di SQL Editor:

```sql
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('peserta','penguji','admin')),
  nama text not null,
  nis text, kelas text, sangga text, agama text, jabatan text,
  calon_garuda date,                       -- tanggal mendaftar Calon Garuda
  wajib_ganti_pin boolean not null default true,   -- PIN awal/hasil reset wajib diganti (pakai Supabase Auth untuk kata sandi)
  dibuat date default current_date,
  created_at timestamptz default now()
);

create table sku_progress (
  peserta_id uuid references profiles(id) on delete cascade,
  sku_id text not null,                    -- mis. BAN-05 atau BAN-01-ISL-1
  status text not null default 'belum'
    check (status in ('belum','diajukan','proses','ulang','lulus')),
  jadwal date,
  penguji_id uuid references profiles(id),
  tanggal_uji date,
  nilai text, catatan text, catatan_peserta text,
  verifikasi text, diverifikasi_pada timestamptz,
  updated_at timestamptz default now(),
  primary key (peserta_id, sku_id)
);

create table sku_riwayat (
  id bigint generated always as identity primary key,
  peserta_id uuid references profiles(id) on delete cascade,
  sku_id text not null,
  waktu timestamptz default now(),
  teks text not null,
  oleh uuid references profiles(id)
);

create table absensi_sesi (
  tanggal date primary key check (extract(dow from tanggal) = 5),   -- hanya Jumat
  dibuat_oleh uuid references profiles(id),
  dibuat_pada timestamptz default now()
);

create table absensi_hadir (
  tanggal date references absensi_sesi(tanggal) on delete cascade,
  peserta_id uuid references profiles(id) on delete cascade,
  status text not null check (status in ('H','I','S','A')),
  oleh uuid references profiles(id),
  waktu timestamptz default now(),
  primary key (tanggal, peserta_id)
);

create table portofolio (
  peserta_id uuid references profiles(id) on delete cascade,
  item_id text not null,                   -- PF-01 sampai PF-26
  status text not null default 'belum' check (status in ('belum','proses','siap')),
  catatan text, tautan text, catatan_penguji text,
  diperbarui timestamptz default now(),
  primary key (peserta_id, item_id)
);

create table portofolio_jurnal (
  id bigint generated always as identity primary key,
  peserta_id uuid references profiles(id) on delete cascade,
  item_id text not null,
  waktu timestamptz default now(),
  teks text not null,
  oleh uuid references profiles(id)
);

-- Materi SKU: hanya tautan ke file PDF di Google Drive (file tidak disimpan di sini)
create table materi (
  id uuid primary key default gen_random_uuid(),
  urutan int not null,                     -- urutan pada daftar isi halaman Materi
  judul text not null check (char_length(judul) <= 120),
  deskripsi text check (char_length(deskripsi) <= 400),
  tautan text not null,                    -- tautan berbagi asli yang ditempel pengelola
  file_id text not null unique,            -- ID file Drive; satu-satunya bagian yang dipakai untuk iframe
  resource_key text,
  butir text[] not null default '{}',      -- id butir SKU, mis. {'BAN-05','LAK-12'}; kosong = materi umum
  bagian jsonb not null default '[]',      -- daftar isi: [{ "judul": "...", "halaman": "3-5" }]
  dibuat date default current_date,
  dibuat_oleh uuid references profiles(id)
);

create function peran() returns text language sql security definer stable as
$$ select role from profiles where id = auth.uid() $$;

alter table profiles enable row level security;
alter table sku_progress enable row level security;
alter table sku_riwayat enable row level security;
alter table absensi_sesi enable row level security;
alter table absensi_hadir enable row level security;
alter table portofolio enable row level security;
alter table portofolio_jurnal enable row level security;
alter table materi enable row level security;

create policy "baca profil" on profiles for select to authenticated using (true);
create policy "admin kelola profil" on profiles for all to authenticated
  using (peran() = 'admin') with check (peran() = 'admin');

create policy "baca progres" on sku_progress for select to authenticated
  using (peserta_id = auth.uid() or peran() in ('penguji','admin'));
create policy "baca riwayat" on sku_riwayat for select to authenticated
  using (peserta_id = auth.uid() or peran() in ('penguji','admin'));

create policy "baca sesi" on absensi_sesi for select to authenticated using (true);
create policy "baca absensi" on absensi_hadir for select to authenticated
  using (peserta_id = auth.uid() or peran() in ('penguji','admin'));

create policy "baca portofolio" on portofolio for select to authenticated
  using (peserta_id = auth.uid() or peran() in ('penguji','admin'));
create policy "baca jurnal portofolio" on portofolio_jurnal for select to authenticated
  using (peserta_id = auth.uid() or peran() in ('penguji','admin'));

-- Materi dibaca semua pengguna; hanya Admin dan Pembina yang boleh mengubah
-- (jabatan Pembina perlu kolom jabatan pada profiles, atau peran khusus 'pembina')
create policy "baca materi" on materi for select to authenticated using (true);
create policy "kelola materi" on materi for all to authenticated
  using (peran() = 'admin' or (select jabatan from profiles where id = auth.uid()) = 'Pembina')
  with check (peran() = 'admin' or (select jabatan from profiles where id = auth.uid()) = 'Pembina');
```

2. Perubahan data sebaiknya lewat fungsi Postgres (`rpc`) bergaya `security definer`, mis. `ajukan_uji`, `catat_hasil`
   (menerapkan aturan yang sama dengan `src/lib/skuLogic.js`, termasuk cek Bantara sebelum Laksana dan pembuatan kode
   verifikasi di server), `catat_absensi`, `reset_pin` (hak reset sesuai tabel di atas), dan `ubah_portofolio`. Penulisan langsung ke tabel
   oleh peserta tidak boleh dibuka lewat RLS.
3. `npm i @supabase/supabase-js`, buat `.env.local` berisi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.
4. Ganti `storage.js` dan aksi di `AppContext.jsx` menjadi pemanggilan Supabase yang asinkron. Ganti login PIN dengan
   Supabase Auth (email atau nomor telepon). Halaman dan komponen lain hanya membaca data dari konteks.

Firebase memakai pola yang sama: koleksi `users`, `progress/{pesertaId}/{skuId}`, `absensi/{tanggal}`, dan
`portofolio/{pesertaId}/{itemId}`, dengan Security Rules berdasarkan peran.










