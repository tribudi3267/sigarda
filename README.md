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

Pengguna lain: **Pembina** (penguji) dan **Admin Gudep**. **Dewan Ambalan bukan akun terpisah, melainkan jabatan pada akun Penegak** (fase 6b, lihat "Dewan Ambalan sebagai jabatan pada akun Penegak"): Penegak berjabatan tetap Penegak (NIS, rombel, progres SKU sendiri)
dan dapat berganti ke **tampilan Dewan** untuk menguji sesuai penugasan, mencatat iuran, dan mengelola kegiatan. Akun Dewan yang dibuat sebelum fase 6b ("akun Dewan lama") tetap berfungsi sampai Admin mengarsipkannya.

**Butir agama (sub-butir Butir 1) hanya dinilai oleh Pembina.** Dewan Ambalan menilai butir lainnya (butir Laksana pun bila ditugaskan, lihat penugasan). Aturan ini ditegakkan di server: pencatatan hasil (mulai uji, lulus, perlu diulang, dikembalikan, termasuk lewat instrumen) oleh Dewan Ambalan ditolak, dan pada pengajuan butir agama Penegak hanya dapat memilih Pembina sebagai penguji. Di layar, tombol dan chip butir agama tidak dapat dibuka Dewan Ambalan. Hasil yang sudah dicatat Dewan sebelum aturan ini tidak diubah; Pembina dapat meninjaunya.

**Letak menu.** Di tablet, laptop, dan PC, menu ada di **samping kiri**, dikelompokkan menurut fungsinya (Utama, Pengujian SKU, Kegiatan Ambalan, Materi, dan Pengelolaan untuk Admin) dan dapat diciutkan menjadi ikon saja (pilihan diingat di peramban). Di ponsel, menu berupa ikon di bawah yang dapat digeser ke kiri dan kanan; panah bercahaya di tepi menunjukkan masih ada menu tersembunyi di sisi itu. **Nama tampilan** pengguna selalu terlihat di tempat yang sama (bawah menu samping, atau kanan atas header ponsel); diarahkan kursor atau diklik membuka kartu akun (tanpa PIN) dengan Pengaturan akun (ganti PIN), Reset PIN anggota (Dewan, Pembina, Admin), dan Keluar.

| Menu | Penegak | Dewan Ambalan / Pembina | Admin |
|---|---|---|---|
| Dashboard | Beranda progres SKU. Calon Garuda: dashboard jurnal portofolio | Antrian uji, progres per rombel, rekap absensi, rekap portofolio | Rekap anggota, absensi, portofolio, kelulusan SKU |
| Notifikasi | Kotak Notifikasi (jadwal ujian, pengujian dimulai, hasil tersedia, surat terbit), pengaturan notifikasi di perangkat | Pengajuan uji, dialihkan, pengingat, pengajuan menunggu lama; Pembina juga melihat perangkat anggota | Sama dengan Pembina |
| Poin SKU | Lihat butir, ajukan uji; tombol **Materi** pada butir yang punya materi | Menilai butir (wajib PIN) | Lihat |
| Materi | Baca materi (pratinjau PDF Google Drive, daftar isi, saringan tingkat dan butir) | Sama | Sama |
| Kelola Materi | | Hanya **Pembina**: tambah, ubah, urutkan, hapus | Tambah, ubah, urutkan, hapus |
| Absensi | Riwayat kehadiran sendiri (dicatat pengurus) | Catat absensi, rekap, unduh Excel | Sama dengan penguji |
| Iuran | Rekap iuran sendiri, serta total sangga, kelas, dan gudep (tanpa nama Penegak lain) | **Dewan Ambalan** dan asisten bendahara mencatat; Pembina melihat rekap, kas, dan menunjuk asisten | Melihat rekap, kas, dan asisten. Pengaturan iuran: Admin dan Pembina |
| Portofolio | (di dashboard Garuda) isi status, catatan, tautan | Tinjau dan beri catatan, rekap, unduh Excel | Rekap, unduh Excel |
| Sidang | | Antrian sidang, lembar sidang (Layak dan Lulus / Ditunda-Remedi), riwayat, cetak Berita Acara, pengaturan nomor dan ketua. Hapus catatan: hanya Pembina | Sama dengan penguji, termasuk hapus |
| Raport | | Hanya **Pembina**: nilai ekstrakurikuler per semester, cetak per Penegak, Excel per kelas, pengaturan | Sama dengan Pembina |
| Sesi ujian | Melihat jadwal ujian bersama yang mencantumkannya (di Beranda) | Buat jadwal, pilih butir dan peserta, pantau papan sesi, dan menilai langsung dari papan (Dewan Ambalan dan Pembina) | Buat dan pantau (tidak menilai). Hapus sesi: Pembina dan Admin |
| Instrumen | Melihat daftar kriteria penilaian per butir (pada butir yang instrumennya ditetapkan) | Menilai dengan instrumen (skor 1-5 per kriteria) di lembar penilaian | Hanya **Pembina** dan Admin: kelola instrumen, tetapkan, pengaturan |
| Penugasan | | **Pembina** mengatur penugasan penguji per rombel dan per Penegak (Dewan hanya melihat) | Diatur di menu Penugasan atau Anggota > tab Penugasan |
| Pengurus | | **Pembina**: jabatan Dewan Ambalan pada akun Penegak, ganti kepengurusan lewat berkas Excel, riwayat | Sama, ditambah mengarsipkan akun Dewan lama |
| Anggota | | | Tambah, ubah, hapus anggota (termasuk jenis kelamin, wajib untuk anggota baru; tombol **Lengkapi jenis kelamin** untuk anggota lama); import Excel dan unduh template (Penegak, Dewan Ambalan, Pembina); perbarui rombel Penegak; tab **Penugasan** (penguji per rombel, guru agama) |
| Data Gudep | | | Identitas gugus depan dan ambalan, alamat, kwartir, serta Pembina/Ka Gudep, Kamabigus/Kepala Sekolah beserta NTA (rujukan kop surat dan semua dokumen); Pradana dan Pradani diambil dari jabatan anggota Dewan Ambalan |
| Reset PIN (menu akun) | | Sesuai kewenangan (lihat di bawah) | Semua kecuali Admin |
| Pengaturan akun (menu akun) | Ganti PIN sendiri | Ganti PIN sendiri | Ganti PIN sendiri |
| Cetak | Kartu SKU, Surat Tanda Lulus, Surat pengantar agama (milik sendiri) | Idem; **Pembina** dan **Admin** dapat menerbitkan dan mencabut surat pengantar | Idem |

### Masuk, nama pengguna, dan PIN
- **Nama pengguna** untuk masuk: Penegak memakai **NIS**; Dewan Ambalan, Pembina, dan Admin memakai nama pengguna yang
  ditetapkan admin (dibuat otomatis dari nama bila dikosongkan, mis. `budi.santoso`). Halaman masuk tidak menampilkan daftar nama.
- **PIN = tepat 6 angka**, tidak boleh angka sama semua atau berurutan (111111, 123456), dan tidak boleh sama dengan PIN lama.
- **PIN awal** dibuat admin saat menambah anggota (atau otomatis saat import Excel) lalu dibagikan langsung. Pada login pertama,
  layar **Buat PIN baru** menahan pengguna sampai PIN diganti. Ini **ditegakkan di server**: selama PIN belum diganti, server hanya
  melayani pembacaan profil sendiri dan penggantian PIN.
- **Ganti PIN** sukarela: buka menu akun (nama Anda di menu samping atau header) lalu Pengaturan akun, isi PIN lama dan PIN baru.
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
Import tersedia untuk **Penegak dan Pembina** (hanya Admin Gudep yang dapat mengimpor; akun Admin tidak diimpor). Dewan Ambalan tidak lagi diimpor sebagai akun: jabatannya diberikan pada akun Penegak lewat menu **Kepengurusan**.
Buka **Anggota**, pilih tab kelompoknya, lalu **Unduh template Excel**. Setiap kelompok punya template sendiri:

| Kelompok | Kolom template |
|---|---|
| Penegak | Nama Lengkap, **Jenis Kelamin (wajib)**, **NIS (wajib, menjadi nama pengguna)**, **Rombel** (X-01 sampai XII-10, daftar pilihan), Sangga, Agama, NTA (opsional), PIN Awal (opsional) |
| Dewan Ambalan | Nama Lengkap, **Jenis Kelamin (wajib)**, Nama Pengguna (opsional), Jabatan Dewan (opsional), NTA (opsional), PIN Awal (opsional) |
| Pembina | Nama Lengkap, **Jenis Kelamin (wajib)**, Nama Pengguna (opsional), Agama (opsional, disarankan diisi), PIN Awal (opsional) |

Setelah diisi, klik **Import Excel**. Aplikasi menampilkan pratinjau per baris (siap atau dilewati beserta alasannya). Baris yang
lolos dikirim ke server per 25 akun; server memeriksa ulang dan bisa menolak baris tertentu. Rombel dibakukan (mis. `xi 3` menjadi `XI-03`; selain rombel baku ditolak) dan penulisan sangga disamakan
dengan data yang ada. Berkas template Penegak lama yang berjudul kolom "Kelas" tetap terbaca. Setelah impor, daftar **nama pengguna dan PIN awal** tampil satu kali dan dapat diunduh sebagai Excel.
Maksimal 500 baris per impor.

**Jenis kelamin** berlaku untuk semua peran (Penegak, Dewan Ambalan, Pembina, Admin Gudep). Pada template dan formulir berupa pilihan **Laki-laki** atau **Perempuan** (penulisan lain di Excel seperti L, P, Pria, Wanita dibakukan; disimpan sebagai `L` atau `P`).
**Wajib untuk anggota baru** (formulir Tambah anggota dan setiap baris import); baris tanpa jenis kelamin ditolak di pratinjau, termasuk pada berkas template lama yang belum berkolom Jenis Kelamin (unduh template terbaru).
Anggota yang sudah ada boleh kosong: lengkapi lewat **Ubah anggota**, atau sekaligus lewat tombol **Lengkapi jenis kelamin** (muncul di menu Anggota selama masih ada yang kosong): pilih per orang di daftar, atau unduh berkas Excel berisi anggota yang belum terisi, isi kolomnya, lalu unggah.
Akun dibuat lebih dulu, lalu jenis kelamin disimpan lewat fungsi khusus Admin `sg_anggota_jk_atur` (migrasi `2026-09-jenis-kelamin.sql`); Edge Function tidak berubah. Jenis kelamin tampil pada daftar anggota, halaman Akun, dan detail Penegak.

**NTA** (Nomor Tanda Anggota, mis. `11.03.10.701.00123`) opsional untuk Penegak: dapat diisi pada kolom template, pada formulir tambah atau ubah anggota, dan pada lembar sidang. Akun dibuat lebih dulu, lalu NTA disimpan lewat fungsi khusus Admin `sg_anggota_nta_atur` (migrasi `2026-09-nta-anggota.sql`); bila fungsi itu belum ada, akun tetap dibuat dan aplikasi memberi tahu bahwa NTA belum tersimpan. Berkas template lama tanpa kolom NTA tetap dapat diimpor.

### Rombel baku dan penugasan penguji per rombel (fase 1a)
Kolom kelas Penegak kini berisi **rombel**: `X-01` sampai `X-10`, `XI-01` sampai `XI-10`, `XII-01` sampai `XII-10` (30 rombel, dua angka). Server menolak isian lain saat akun dibuat atau diubah
(huruf kecil dan spasi dibakukan: `xi 3` di Excel menjadi `XI-03` pada pratinjau; di server hanya huruf dan spasi yang dibakukan). Data lama (`X`, `XI`, `XII`) **tidak diubah otomatis**: di
**Anggota > Penegak** muncul pemberitahuan dan tombol **Perbarui rombel Penegak** (pilih rombel per orang, atau unduh berkas Excel berisi Penegak berkelas lama, isi kolom Rombel, lalu unggah).
Server memeriksa semua baris sekaligus: satu baris keliru membatalkan seluruhnya dan pesannya menyebut nomor barisnya.

**Penugasan** menetapkan Pembina dan Penegak berjabatan Dewan Ambalan yang bertugas menguji tiap rombel, **per tahun ajaran**. **Pembina dan Admin** mengaturnya di menu **Penugasan** (Admin juga di **Anggota > Penugasan**): matriks penguji x rombel (satu tab per kelas; tombol
Semua/Kosongkan per penguji), tombol **Salin dari tahun ajaran lalu** (menambah yang belum ada, tidak mencabut apa pun), peringatan rombel yang berisi Penegak tetapi belum punya penguji, **penugasan khusus per Penegak** (pengecualian, lihat fase 6b), dan **riwayat perubahan**
(hanya bertambah). Dewan hanya melihat. Rombel tanpa penugasan tetap memakai aturan bawaan (semua penguji boleh menguji, Dewan hanya butir Bantara). Penegakannya dijelaskan di bagian berikut (fase 1b).

**Agama Pembina** diisi Admin (formulir ubah anggota, kolom opsional pada template import Pembina). Butir agama nanti hanya boleh diuji Pembina yang seagama dengan Penegak. Bagian bawah tab Penugasan menampilkan
**cakupan agama**: jumlah Penegak, Pembina seagama, dan **guru agama** per agama (dikelola Admin), sebagai rujukan surat pengantar bila tidak ada Pembina yang seagama. Dewan Ambalan dan Admin tidak berAgama.

### Penegakan penugasan: siapa yang boleh menguji (fase 1b)
Aturan dihitung di server (`sigarda.penguji_sah`) dan dicerminkan di layar (`src/lib/rombelLogic.js`, `pengujiSah`); keduanya dijaga pengujian `penegakan`.
- **Ketat saat memilih penguji.** Penegak yang mengajukan hanya dapat memilih penguji yang bertugas di rombelnya (tahun ajaran berjalan). Daftar dari server memuat **beban antrian** tiap penguji (yang teringan lebih dulu).
  Bila rombel belum diatur, kelasnya masih berformat lama (`X`), atau tak seorang pun yang bertugas boleh menguji butir itu, berlaku aturan lama: semua penguji yang memenuhi aturan peran.
- **Antrian rombel.** Pilihan pertama pada daftar penguji adalah "Antrian rombel": pengajuan tanpa penguji tujuan. Semua penguji yang sah melihatnya di menu **Antrian** (ditandai *Antrian rombel*)
  dan penguji mana pun yang mengambilnya lewat **Mulai uji** menjadi pengujinya.
- **Lunak saat mencatat hasil.** Penguji lain boleh menggantikan penguji tujuan; riwayat butir menulis `(menggantikan NAMA)`. Pembina dapat **mengalihkan** pengajuan (tombol *Alihkan* pada Antrian; alasan wajib dan
  tercatat di riwayat) ke penguji lain atau kembali ke antrian rombel; Admin Gudep juga berwenang di server.
- **Aturan peran (diubah di fase 6b).** Peran penguji ditentukan oleh **penugasan**, bukan oleh jabatan: butir **Laksana** boleh diuji Pembina atau penguji **yang ditugaskan** untuk Penegak itu (penugasan rombelnya atau penugasan khususnya); tanpa penugasan, Dewan hanya menguji butir **Bantara**.
  **Butir agama** tetap hanya untuk Pembina seagama (atau guru agama lewat surat pengantar). Tidak ada yang menguji atau menilai dirinya sendiri. Aturan ini berlaku saat memilih penguji dan saat mencatat hasil.
- **Butir agama** hanya oleh Pembina yang **agamanya sama** dengan Penegak. **Masa peralihan:** selama belum ada satu pun Pembina yang agamanya terisi, semua Pembina masih dianggap sah (aturan lama). Begitu Admin mengisi agama
  seorang Pembina, aturan seagama berlaku untuk semua: Pembina tanpa agama tidak lagi dapat menguji butir agama. Bila tidak ada Pembina seagama, Penegak melihat pesan agar menghubungi Admin atau Pembina
  (surat pengantar ke guru agama menyusul di fase 2a).
- Pengecualian per Penegak ada di fase 6b, notifikasi di bagian Notifikasi. Surat pengantar ke guru agama ada di bagian berikut (fase 2a).

### Pra-uji berjenjang (fase C dan D)
Uji resmi SKU hanya oleh Pembina (AD/ART Munas 2023 Pasal 33 ayat (6) dan 35 ayat (3)); Dewan Ambalan tidak menguji resmi. Sebelum uji resmi, pengajuan Penegak disaring dulu oleh sesama Penegak: butir **Bantara**
lewat **Pinsa** sangganya lalu **Bina Damping** rombelnya; butir **Laksana** lewat **Bina Damping yang sudah Laksana**. Pra-uji hanya rekomendasi (tidak pernah menjadikan butir lulus) dan tidak memakai PIN. Server yang menentukan
penilai dan meneruskan pengajuan (tahap tanpa penilai dilewati otomatis); klien hanya menampilkan.
- **Sakelar.** Bawaan **mati** (cara lama tetap berlaku). Pembina atau Admin menghidupkannya di menu **Pra-uji** (dengan penjelasan akibatnya). Sebelum menghidupkan, tunjuk Bina Damping tiap rombel dan bagi sangga di menu **Sangga**.
  Hidup: Penegak tidak lagi memilih penguji, menu Antrian dan Sesi ujian tidak tampil bagi Dewan Ambalan, dan pengajuan lama yang ditujukan kepada penguji non-Pembina kembali ke antrian rombel. Mati: pra-uji yang menunggu diteruskan langsung ke uji resmi.
- **Penegak** melihat jalur tiap butir (Pinsa, Bina Damping, Pembina; ✓ lulus, … menunggu) di bawah butirnya, catatan perbaikan bila belum lulus (boleh mengajukan lagi, mulai dari tahap pertama), dan dapat membatalkan pengajuan yang masih menunggu.
- **Pinsa dan Bina Damping** memakai menu **Pra-uji** (muncul hanya bila pra-uji hidup): antrian pengajuan, tombol *Nilai* (Lulus, teruskan / Belum lulus dengan catatan wajib), dan daftar yang sudah diputuskan. Penilai hanya menilai butir yang sudah ia lulus sendiri.
- **Pembina dan Admin** melihat semua pengajuan yang menunggu dan dapat **melewati tahap yang macet** (alasan wajib, tercatat di riwayat butir). Pengajuan tidak pernah lolos sendiri; Pembina diingatkan bila menunggu lebih dari 3 hari tanpa penilai.
- Dijaga pengujian `pra-uji` (server), `pra-uji-klien` (tampilan dan api), dan `penegakan` (aturan penguji klien = server, juga saat sakelar hidup). Fase D tidak menambah migrasi dan tidak mengubah Edge Function.

### Data Gudep (identitas dan pejabat diatur Admin)
Identitas gugus depan dan pejabatnya **tidak lagi ditulis di kode**. Admin Gudep mengisinya di menu **Data Gudep** (Pengelolaan): nama gugus depan, nama ambalan, nama sekolah, nomor gudep, kode surat (awalan nomor Surat Tanda Lulus),
alamat, kota (tempat surat), telepon dan email (opsional), kwartir ranting dan cabang, serta dua pejabat beserta **NTA** dan NIP (opsional):
- **Pembina Gudep / Ka Gudep**: penanda tangan surat intern sekolah, kartu SKU, berita acara, dan raport ekstrakurikuler.
- **Kamabigus / Kepala Sekolah**: penanda tangan surat keluar sekolah (dipilih pada dialog surat: "Surat intern" atau "Surat keluar").
- **Pradana** dan **Pradani** tidak diketik di Data Gudep: keduanya adalah **Penegak yang diberi jabatan** itu (lihat "Jabatan Dewan Ambalan" di bawah).
### Jabatan Dewan Ambalan (Pradana dan Pradani)
Jabatan Dewan Ambalan adalah **atribut akun Penegak** (kolom `profiles.jabatan_dewan`, isian bebas 2 sampai 60 karakter; saran: Pradana, Pradani, Wakil Pradana, Wakil Pradani, Sekretaris, Bendahara). Pembina dan Admin mengaturnya di menu **Kepengurusan** (atau pada formulir Penegak di Anggota, Admin). Lihat "Dewan Ambalan sebagai jabatan pada akun Penegak".
- **Pradana dan Pradani hanya satu orang.** Memilih jabatan yang sudah dipegang orang lain memunculkan pemberitahuan; bila disimpan, pemegang lama otomatis kehilangan jabatan itu dan kembali menjadi Penegak biasa (satu permintaan, semua atau tidak sama sekali). Server menolak dua Pradana.
- **Pradana menjadi ketua sidang** pada Berita Acara (nama dan sebutan "Pradana Dewan Ambalan" disalin saat sidang dicatat; berita acara lama tidak berubah). Belum ada Pradana: dipakai pengaturan nama ketua lama sebagai cadangan.
- **Pradana dan Pradani menandatangani Surat Tanda Lulus**, dengan nama dan NTA dari akun mereka. Keduanya tampil bila keduanya ada pemegangnya; bila belum ada, tempat Pradana dicetak garis. Pergantian pengurus cukup dengan memindahkan jabatan di menu Anggota.

### Tanda tangan dan stempel pada dokumen cetak
Kartu SKU, Surat Tanda Lulus, Berita Acara Sidang, Nilai Raport, dan Surat Pengantar memakai satu blok yang sama: jabatan, ruang kosong untuk **tanda tangan dan stempel basah**, lalu nama dan NTA. Lingkaran putus-putus "stempel" hanya terlihat di layar sebagai penanda tempat dan tidak ikut tercetak.
**Berita Acara Sidang** juga memuat **QR dan kode verifikasi** (dibuat saat berita acara pertama kali dicetak; cetak ulang memakai yang sama). QR membuktikan berita acara benar tercatat di aplikasi (nomor, tanggal, pencatat, ketua sidang, Pembina, Penegak, tingkat, keputusan); dokumen sah bila bertanda tangan dan berstempel. Catatan sidang yang dihapus tidak lagi dijawab oleh QR-nya.

Untuk pergantian pengurus atau pejabat pada tahun berikutnya, Admin cukup memperbarui isian ini: dokumen yang dibuat sesudahnya memakai data terbaru, sedangkan berita acara sidang dan surat pengantar yang sudah terbit tetap memuat nama saat dibuat.
Pratinjau kop surat tampil langsung sebelum disimpan. Kop seragam di semua dokumen cetak (`KopSurat` di `src/components/DokumenSku.jsx`): lambang Tunas Kelapa Gerakan Pramuka di pojok kiri atas, identitas gudep di tengah, Logo Pandu Dunia (WOSM) di pojok kanan atas; gambarnya di `src/assets/logo/` (bersumber dari Wikimedia Commons: *Lambang Tunas Kelapa Gerakan Pramuka.png* dan *World Scout Emblem.png*, yang kedua diperkecil ke 320 px). Data tersimpan di basis data (pengaturan `gudep.data`) dan menjadi rujukan kop surat, tanda tangan, kota dan tanggal surat, halaman masuk, footer, menu, ekspor Excel, dan seluruh dokumen cetak.
Selama belum pernah disimpan, aplikasi memakai nilai bawaan di `GUDEP_BAWAAN` pada `src/config.js`; setelah disimpan, isian yang dikosongkan tetap kosong. Halaman masuk dan verifikasi (tanpa login) hanya menerima nama gudep, ambalan, sekolah,
dan kota (`sg_gudep_publik`); nama pejabat, NTA, alamat, dan kontak baru terbaca setelah masuk. Perubahan hanya oleh Admin (`sg_gudep_simpan`, semua isian diperiksa di server).

### Surat pengantar ke guru agama dan dokumen terbit (fase 2a)
Butir agama (sub-butir Butir 1) hanya dinilai Pembina yang seagama. Bila tidak ada Pembina yang seagama dengan seorang Penegak, Pembina atau Admin Gudep menerbitkan **surat pengantar ke guru agama**: buka
**Cetak > Surat pengantar agama** (atau tombol *Surat pengantar guru agama* pada butir agama di halaman Peserta), pilih butir, guru agama (terdaftar oleh Admin di Anggota > Penugasan, atau tulis namanya), tanggal, penanda tangan, lalu
**Terbitkan surat**. Surat A4 memuat kop gudep, nomor, data Penegak, tabel butir dengan kolom kosong untuk hasil dan paraf guru, serta QR dan kode verifikasi. **Surat adalah TEMPLATE untuk tanda tangan dan stempel basah**:
area tanda tangan sengaja dikosongkan; QR hanya membuktikan surat itu benar diterbitkan aplikasi (bukan tanda tangan elektronik tersertifikasi), dan surat sah bila bertanda tangan dan berstempel.
- **Nomor** otomatis dari format `surat.format_nomor` (bawaan `{no3}/SP/{tahun}`; kode {no}..{no6}, {tahun}, {bulan}, {romawi}; diubah di panel *Format nomor surat*), memakai penghitung per tahun yang tidak dipakai ulang, atau diisi manual.
- **Mencatat hasil.** Guru agama menulis hasil pada surat; Pembina mencatatnya di aplikasi seperti biasa. Selama ada surat yang berlaku, Pembina yang tidak seagama boleh mencatat hanya butir yang tercantum pada surat itu
  (Dewan Ambalan tetap tidak boleh); riwayat butir menulis "(dinilai guru agama NAMA, surat nomor NOMOR)".
- **Mencabut.** Pembina atau Admin mencabut surat dengan alasan (tercatat di riwayat butir); hasil butir tidak lagi dapat dicatat lewat surat itu dan QR-nya menjawab "dicabut". Surat baru dapat dibuat untuk butir yang sama.
- **Verifikasi** (halaman publik, tanpa login): QR menampilkan nomor, penerbit, pembuat, penanda tangan, data Penegak, guru, dan butir; kode VRF- hanya menjawab jenis, nomor, dan tanggal (tanpa nama).
- Surat tidak diperlukan (dan ditolak server) bila sudah ada Pembina yang seagama. Tabel `dokumen_terbit` dibangun umum agar jenis dokumen lain dapat ditambahkan kelak.

### Rombel saya dan progres per rombel (fase 3)
"Rombel saya" = rombel yang ditugaskan Admin kepada Pembina atau Dewan Ambalan pada tahun ajaran berjalan (Anggota > Penugasan). Hanya tampilan: server tidak berubah, tanpa migrasi, tanpa deploy Edge Function.
- **Filter awal.** Pada **Peserta**, **Portofolio**, **Raport** dan pemilih peserta di **Sesi ujian**, tombol **Hanya rombel saya (XI-01, XI-02, ...)** menyala sejak halaman dibuka. Matikan untuk melihat semua; memilih kelas tertentu
  pada filter juga mematikannya; **Bersihkan filter** menampilkan semua. Cetak dan Excel mengikuti filter (keterangan Excel menulis "rombel saya (...)"). Tanpa penugasan (Admin, penguji yang belum ditugaskan, atau penugasan belum termuat) tidak ada penyaringan.
- **Antrian** sudah sesuai rombel tugas (ditujukan kepada Anda + antrian rombel Anda). Bila mencentang *Tampilkan semua penguji*, muncul *Hanya rombel saya* (menyala) untuk menyaring antrian penguji lain.
- **Papan sesi**: tombol *Hanya rombel saya* muncul bila sesi memuat Penegak dari rombel Anda dan dari rombel lain; ringkasan angka di atas papan tetap seluruh sesi.
- **Dashboard Pembina dan Dewan**: kartu **Progres per rombel** untuk tiap rombel tugas: jumlah Penegak, rata-rata progres Bantara dan Laksana, yang sudah selesai tiap tingkat, pengajuan menunggu dan sedang diuji, penguji bertugas, dan daftar Penegak
  (ketuk nama untuk membuka detail). Tanpa penugasan, semua rombel yang punya Penegak ditampilkan; *Tampilkan semua rombel* tersedia bagi yang punya penugasan. Logika di `src/lib/rombelLogic.js` dan `src/lib/progresRombel.js`, dijaga pengujian `rombel-saya`.

### Notifikasi dan aplikasi terpasang (PWA)
**Kotak Notifikasi** (menu *Notifikasi*, lencana angka pada menu dan judul tab) bekerja di semua peran tanpa pengaturan tambahan, setelah migrasi `2026-09-notifikasi.sql`. Notifikasi dibuat **pemicu di basis data** (bukan di tiap fungsi),
sehingga semua jalur tercakup: **pengajuan uji** (penguji tujuan, atau semua penguji yang sah bila masuk antrian rombel), **dialihkan**, **pengujian dimulai** dan **hasil tersedia** (untuk Penegak; isi *tanpa* menyebut lulus atau ulang),
**jadwal sesi ujian** (Penegak yang dimasukkan; menyimpan ulang sesi tidak menggandakan), dan **surat pengantar guru agama terbit**. Pengingat harian pukul 07.00 WIB (pg_cron): **H-1** pengujian dan sesi ujian, dan **pengajuan menunggu lebih dari 3 hari**.
Notifikasi berumur lebih dari 90 hari dibersihkan otomatis. Data lama tidak memicu apa pun; hanya peristiwa baru.
**Kirim notifikasi uji** (tahap L0; migrasi `2026-09-tes-notifikasi.sql`): tombol di halaman Notifikasi membuat satu notifikasi untuk diri sendiri lewat jalur yang sama dengan notifikasi sungguhan (pemicu, pg_net, Edge Function `notif-push`), lalu menampilkan hasilnya:
terkirim, gagal, atau penyebab yang perlu diperbaiki (push belum dikonfigurasi, pg_net belum aktif, belum ada perangkat, atau Edge Function tidak menjawab dalam 20 detik). Dibatasi 5 kali per 10 menit. Bagian **Kapan notifikasi muncul?** di halaman yang sama mendaftar kejadian pemicunya menurut peran.

**Web Push** (notifikasi muncul di HP walau aplikasi tertutup) memerlukan langkah sekali di Supabase. Tanpa langkah ini aplikasi tetap jalan; halaman Notifikasi menjelaskan bahwa push belum diatur.
1. Jalankan `supabase/migrasi/2026-09-notifikasi.sql` di SQL Editor (sesudah `2026-09-jabatan-dewan.sql`). Migrasi mencoba mengaktifkan `pg_net` dan `pg_cron`; bila pesan menyebut salah satunya belum aktif, aktifkan di **Dashboard > Integrations**, lalu jalankan migrasi sekali lagi (aman diulang).
2. Buat kunci VAPID di komputer: `npx web-push generate-vapid-keys`. Simpan kunci **privat** (jangan dibagikan, jangan di-commit); kunci **publik** dipakai di langkah 4.
3. **Edge Functions > Deploy a new function > Via Editor**, nama `notif-push` (persis), isi dengan [`supabase/functions/notif-push/index.ts`](supabase/functions/notif-push/index.ts), **Deploy**, lalu **matikan "Verify JWT"** (pemanggilnya basis data; pemeriksaan memakai rahasia bersama). CLI: `supabase functions deploy notif-push --no-verify-jwt`.
   Secrets (Edge Functions > Secrets): `NOTIF_RAHASIA` (karangan sendiri, minimal 16 karakter), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mis. `mailto:pembina@sekolah.sch.id`).
4. Beri tahu basis data alamat fungsi dan kuncinya (SQL Editor, sekali; jalankan lagi bila salah satunya berganti):
   `select sigarda.push_atur('https://KODE.supabase.co/functions/v1/notif-push', '<NOTIF_RAHASIA yang sama>', '<kunci publik VAPID>');`
5. Buka aplikasi di HP, menu **Notifikasi**, ketuk **Aktifkan notifikasi**. Admin dan Pembina melihat berapa anggota yang sudah punya perangkat di halaman yang sama; **Lihat n anggota yang belum mengaktifkan notifikasi** membuka daftarnya, dan tiap nama punya tombol **Buka WhatsApp** (langsung ke nomor anggota itu, bila sudah diisi di menu Akun saya) berpesan siap-kirim yang mengajak mengaktifkan notifikasi. Daftar yang sama tampil di menu Pemeriksaan Data.

Aturan dan batas: (1) **Keluar menghentikan notifikasi di perangkat itu** (langganan dihapus di server dan di peramban), agar HP bersama tidak terus menerima notifikasi akun sebelumnya; yang hanya menutup tab atau sesinya kedaluwarsa tetap menerima. Masuk lagi di perangkat yang sama mengaktifkannya kembali
tanpa izin ulang. (2) **iPhone dan iPad**: push hanya bekerja bila aplikasi dipasang lewat *Bagikan > Tambah ke Layar Utama* dan dibuka dari sana (iOS 16.4 ke atas); halaman Notifikasi menampilkan petunjuknya. (3) Sebagian HP Android menunda notifikasi karena penghemat baterai. (4) Tidak ada saluran yang menjamin notifikasi dibaca; yang terjamin: tersimpan di Kotak Notifikasi.
(5) Isi push singkat dan tidak menyebut hasil penilaian (layar kunci HP dapat dilihat orang lain).

**Aplikasi terpasang (PWA).** Aplikasi dapat dipasang di layar utama (Chrome/Edge: tombol *Pasang aplikasi* di halaman Notifikasi atau menu peramban; iPhone: Tambah ke Layar Utama), dengan ikon SIGARDA (`public/ikon-*.png`, dibuat dari lambang di `public/favicon.svg`).
Service worker (`public/sw.js`) hanya menangani push dan klik notifikasi: **tidak ada cache**, jadi data Supabase tidak tersimpan di perangkat dan halaman selalu versi terbaru. Setiap build menerbitkan `version.json`; aplikasi yang terbuka memeriksanya tiap 10 menit dan menampilkan ajakan **Versi baru SIGARDA tersedia, Muat ulang**.
Service worker tidak didaftarkan pada `npm run dev` dan `npm run dev:lokal` (mode lokal tetap punya Kotak Notifikasi, tanpa push). Pengujian: `notifikasi`, `notifikasi-klien`, `notif-push`, `migrasi-notifikasi`.

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

### Iuran bumbung kepramukaan
Iuran rutin latihan Jumat, dicatat di sesi absensi dan diikat ke penilaian SKU (butir Bantara 6 dan Laksana 6, "Setia membayar iuran ...").
- **Yang mencatat**: hanya **Dewan Ambalan** dan **asisten bendahara**. Asisten adalah Penegak Calon Laksana (SKU Bantara selesai, Laksana belum) yang ditunjuk Dewan Ambalan atau Pembina, maksimal 5 orang; ia dapat mencatat iuran Penegak lain di menu Iuran, tetapi tidak dapat mengubah kehadiran, mencatat iurannya sendiri, atau menutup kas, dan setiap catatannya tercatat atas namanya. Pembina dan Admin hanya melihat. Penegak hanya melihat iurannya sendiri dan angka total sangga, kelas, dan gudep (tanpa nama Penegak lain).
- **Pencatatan**: di halaman **Absensi**, di bawah tombol Hadir, Izin, Sakit, dan Alpa, ada tombol nominal Rp 500 sampai Rp 5.000 (kelipatan Rp 500) dan satu kolom isian manual (tombol yang aktif ditekan lagi berarti menghapus iuran). Yang izin atau sakit boleh **menitip** iuran: iuran tidak bergantung pada status kehadiran. Ada aksi massal (isi semua yang hadir). Satu baris per Penegak per Jumat; tidak ada baris berarti tidak beriuran. Setiap perubahan masuk log yang hanya bertambah (`iuran_log`). Sesi absensi yang sudah punya iuran atau tutup kas tidak dapat dihapus sebelum dikosongkan.
- **Rekap** (menu Iuran, tab Rekap; ringkasnya juga di dashboard tiap peran): per Penegak, per sangga, per kelas, total gudep per pertemuan, dan total per semester dan tahun ajaran, dengan filter dan **Unduh Excel**. Persen beriuran = pertemuan beriuran dibagi pertemuan terlaksana; di bawah ambang rutin (bawaan 75%) ditandai merah.
- **Tutup kas**: Dewan Ambalan memasukkan uang fisik per Jumat; selisih dengan jumlah catatan ditampilkan (cocok, lebih, kurang) dan ikut ke Excel.
- **Kaitan dengan SKU**: pada instrumen butir Bantara 6 atau Laksana 6, satu kriteria dapat diberi **sumber nilai "Saran otomatis dari iuran"** (menu Instrumen; kolom "Sumber nilai (manual/iuran)" pada Excel, nilai `iuran`). Di lembar penilaian, kriteria itu terisi otomatis dengan saran dari persen pertemuan beriuran semester tanggal uji: 1-5 dengan batas bawaan 90% = 5, 75% = 4 (ambang rutin), 65% = 3, 50% = 2, di bawahnya 1. Penguji **boleh mengubah saran, dengan catatan alasan wajib** (ditegakkan di server dan tercatat di riwayat, beserta saran aslinya di rincian nilai).
- **Iuran susulan**: bila belum mencapai ambang, Dewan Ambalan dapat menerima iuran susulan langsung dari lembar penilaian (rekomendasi: menebus kekurangan pertemuan, masing-masing Rp 1.000). Susulan menebus Jumat yang kosong, terlama dulu, dihitung **setara penuh** dengan iuran rutin, dan saran nilai langsung ikut diperbarui. Layar menandai dan mengingatkan bila lebih dari separuh iuran berasal dari susulan agar "rutin" tetap bermakna.
- **Pengaturan** (tab Pengaturan, khusus Pembina dan Admin): iuran standar, ambang rutin, dan batas persen nilai 5, 3, dan 2. Perubahan berlaku untuk penilaian berikutnya.
- Rumus saran ada di `src/lib/iuranLogic.js` dan `sigarda.iuran_hitung` (SQL) dan dijaga pengujian. Semester ditentukan dari tanggal uji (Juli-Desember ganjil, Januari-Juni genap).

### Portofolio Penegak Garuda
Daftar 26 lampiran dari file "03.01. Tabel Cek List Lampiran Berkas Dokumen Portofolio Garuda". Setiap dokumen
berstatus Belum siap, Sedang disiapkan, atau Siap (Ada), dengan catatan, tautan berkas (harus diawali http/https), dan jurnal perubahan.
Rekap tampil di dashboard Dewan Ambalan, Pembina, dan Admin, dan dapat diunduh sebagai Excel.

#### Berkas Calon Garuda (tahap L7)
Dari halaman Portofolio, tombol **"Cetak / bagikan berkas"** pada detail seorang Calon Garuda (Pembina dan Admin) membuka satu
dokumen gabungan siap cetak: sampul dan identitas, **Kartu Kemajuan SKU Bantara dan Laksana** (lengkap dengan QR dan kode
verifikasi tiap butir, memakai komponen yang sama dengan menu Cetak), **cek list 26 dokumen portofolio** (status, tautan Drive,
catatan), jurnal ringkas, dan blok tanda tangan Pembina. **PDF**: klik "Cetak atau simpan PDF", lalu pilih "Simpan sebagai PDF"
pada dialog cetak browser (pola sama dengan seluruh dokumen cetak lain di aplikasi, tanpa library PDF).

**Tautan berbagi baca-saja** (untuk penilai kwartir ranting/cabang yang tidak punya akun SIGARDA): tombol "Buat tautan berbagi"
menghasilkan alamat `?berkas=<token>` yang dapat dibuka **tanpa login**, menampilkan berkas yang sama persis (dapat dicetak sendiri
oleh penilainya). Satu tautan **aktif** per Calon Garuda; membuat tautan baru otomatis mengganti (mencabut) yang lama, dan
**tanpa kedaluwarsa** — berlaku sampai dicabut manual lewat tombol "Cabut tautan". Token 128 bit acak, tidak dapat ditebak, tetapi
**berbeda dari QR verifikasi keaslian** (`?v=<token>`, yang hanya menjawab ringkasan): tautan ini memberi akses **baca isi lengkap**
berkas kepada siapa pun yang memegangnya, jadi hanya Pembina dan Admin yang dapat membuat/mencabutnya (lebih ketat daripada
menilai portofolio sehari-hari yang juga melibatkan Dewan Ambalan), dan tabelnya **tidak** ikut dicadangkan lewat "Unduh cadangan".

Kode: `src/lib/garudaLogic.js` (`urlBerkasGaruda`, `parameterBerkasGaruda`), `src/components/BerkasGaruda.jsx`
(`BerkasGarudaDokumen`, `TampilanBerkasGaruda`), `src/components/HalamanBerkasGaruda.jsx` (halaman publik, mandiri seperti
`HalamanVerifikasi.jsx`). Server: `sg_garuda_berkas_baca(peserta_id)`, `sg_garuda_token_buat(peserta_id)`,
`sg_garuda_token_cabut(peserta_id)` (Pembina dan Admin), `sg_garuda_token_baca(token)` (tanpa login). Tabel
`public.garuda_berkas_token` (RLS aktif TANPA kebijakan, sama seperti `sertifikat_tingkat`: hanya lewat fungsi). Dijaga pengujian
`garuda`, `migrasi-garuda`.

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

### Nilai Raport Ekstrakurikuler
Menu **Raport** (hanya Pembina dan Admin; Dewan Ambalan dan Penegak tidak melihatnya) untuk nilai Pramuka di raport sekolah, per **semester** (Ganjil: Juli sampai Desember, Genap: Januari sampai Juni).
- **Skor 0-100** = 40% kehadiran + 40% capaian SKU + 20% sikap (bobot dapat diatur).
  - *Kehadiran*: persen hadir pada latihan Jumat semester itu (hadir dibagi hadir + izin + sakit + alpa yang dicatat; yang belum dicatat tidak dihitung).
  - *Capaian SKU*: butir yang **lulus pada semester itu** dibagi target per semester (bawaan Bantara 12, Laksana 11), maksimal 100%. Butir agama dihitung bila seluruh sub-butirnya lulus, pada tanggal uji terakhirnya.
  - *Sikap*: penilaian Pembina 1-5 (dikali 20), ditambah karakter yang menonjol dan jumlah SKK (SKK hanya keterangan).
  - Bila kehadiran atau sikap belum ada, bobotnya dialihkan ke komponen lain dan skor ditandai sementara; predikat baru tampil setelah sikap dinilai.
  - Contoh: hadir 92%, capaian 10 dari 12 butir (83%), sikap 4 (80) menghasilkan skor 86, predikat **B Baik**.
- **Predikat** (batas dapat diatur): A Sangat Baik mulai 90, B Baik mulai 75, C Cukup mulai 60, D Kurang di bawahnya. Pembina boleh mengubah predikat akhir dengan **catatan alasan wajib**; hasil hitung asli tetap tersimpan.
- **Deskripsi capaian** dibuat otomatis dari templat sebagai **saran** (keaktifan latihan, butir SKU tertinggi yang sudah lulus, karakter, dan konsistensi sikap), lalu disunting Pembina. Status **Draf (saran)** atau **Final**: keputusan akhir ada pada Pembina.
  Nilai final tidak ikut berubah bila absensi, progres SKU, atau pengaturan berubah; baris ditandai "Data berubah" dan baru diperbarui bila Pembina membukanya dan menyimpan ulang.
- **Cetak** per Penegak (A4, satu lembar per halaman) dan **Excel per kelas** (satu lembar per kelas: NIS, nama, kelas, predikat, deskripsi, status, dan rincian nilai). Yang belum final diberi tanda DRAF di cetakan dan berwarna kuning di Excel.
- **Pengaturan**: batas predikat, bobot (harus berjumlah 100), dan target butir per semester.
- Server menghitung ulang kehadiran, capaian, skor, dan predikat dari data absensi dan progres SKU saat menyimpan (`sg_raport_simpan`), jadi angka tidak bisa dipalsukan dari layar. Rumus di `src/lib/raportLogic.js` dan di SQL sama persis (pembulatan setengah ke atas dengan bilangan bulat) dan dijaga oleh pengujian.
- Penulisan hanya lewat fungsi server `sg_raport_simpan`, `sg_raport_hapus`, `sg_raport_pengaturan_simpan`; tabel `raport` hanya terbaca Pembina dan Admin.

### Laporan berjenjang tahunan (tahap L8)
Menu **Laporan** (hanya Pembina dan Admin) menyusun satu **laporan tahunan gugus depan** untuk diserahkan ke Kwartir Ranting,
dengan tembusan Kwartir Cabang -- satu berkas gabungan (Excel banyak lembar + PDF siap cetak), bukan beberapa berkas terpisah.
SIGARDA hanya **menghasilkan** berkasnya; **tidak ada** pengiriman otomatis ke sistem kwartir mana pun.

**Periode dapat dipilih** (bukan salah satu tetap): **Tahun Ajaran** (Juli-Juni, konsisten dengan seluruh data SIGARDA lain)
atau **Tahun Kalender** (Januari-Desember, kebiasaan registrasi ulang Kwarcab). Memilih Tahun Kalender otomatis menggabungkan
data dari dua tahun ajaran yang berbeda (mis. tahun 2026 = separuh akhir tahun ajaran 2025/2026 + separuh awal 2026/2027).

Isi laporan (tombol **"Susun laporan"** menghitung semuanya sekaligus, lalu tombol **Unduh Excel** dan **Cetak PDF** memakai
hasil yang sama):
- **Sampul**: identitas gudep (nama, nomor, kwarran, kwarcab, Pembina, Ka. Mabigus) dan periode laporan.
- **Rekap Keanggotaan**: jumlah Penegak **aktif** per tingkat (X/XI/XII) x jenis kelamin x peran (Calon Bantara/Laksana/Garuda).
  Ini SNAPSHOT pada tanggal laporan dibuat (seperti sensus "data potensi" Kwarcab), **bukan** rata-rata sepanjang periode.
- **Kepengurusan Dewan Ambalan**: daftar pengurus yang menjabat saat laporan dibuat (nama, NTA, jabatan).
- **Rekap Kegiatan**: kegiatan Agenda yang tanggalnya jatuh pada periode laporan.
- **Rekap Pencapaian SKU**: jumlah Penegak yang menyelesaikan seluruh SKU Bantara/Laksana atau mendaftar Calon Garuda **pada
  periode itu** -- dihitung dari SEMUA Penegak (bukan hanya yang aktif sekarang), karena seorang Penegak bisa lulus lalu
  menjadi alumni pada tahun ajaran yang sama dan pencapaiannya tetap harus tercatat.
- **Rekap Kehadiran**: rata-rata kehadiran latihan Jumat pada periode itu (rumus sama dengan halaman Absensi).
- **Rekap Keuangan Iuran**: total iuran terkumpul pada periode itu (rumus sama dengan halaman Iuran).

Kode: `src/lib/laporanLogic.js` (murni: `rentangLaporan`, `rekapKeanggotaan`, `rekapPencapaianSku`, `rekapKegiatan`,
`sesiRentang`), `src/lib/exportLaporanTahunan.js` (lembar Excel, memakai `unduhXlsx` dari `exportXlsx.js` yang sudah ada),
`src/components/CetakLaporanTahunan.jsx` (cetak PDF lewat `window.print()`, pola sama dengan dokumen cetak lain), halaman
`src/pages/Laporan.jsx`. **Tanpa fungsi atau tabel server baru**: seluruhnya disusun dari data yang sudah dimuat di klien
(anggota, progres SKU, Agenda) atau lewat fungsi server yang sudah ada dan sudah menerima rentang tanggal bebas
(`sg_iuran_agregat` lewat `muatIuranAgregat`, kehadiran lewat `muatHadirRentang`). Dijaga pengujian `laporan`.

### Bantuan: panduan pengguna (tahap L10)
Menu **Bantuan** (ikon tanda tanya, kelompok Utama, **semua peran**) memuat panduan pemakaian ringkas untuk empat peran: **Penegak,
Dewan Ambalan, Pembina, dan Admin Gudep**. Panduan yang tampil pertama menyesuaikan peran dan tampilan yang sedang aktif (mis.
Penegak berjabatan Dewan dalam tampilan Dewan melihat panduan Dewan Ambalan lebih dulu); tab di atas halaman memungkinkan membaca
panduan peran lain (tidak ada yang dirahasiakan). Tiap peran punya daftar isi (di ponsel berupa bilah yang membuka daftar), dan bagian
"Berlaku untuk semua peran" (PIN, notifikasi, pasang di Layar Utama HP, Akun saya, cara cetak).

**Dokumen yang dapat dibagikan:** tombol **"Cetak atau simpan PDF"** pada halaman itu mencetak panduan peran yang sedang dipilih
(pola cetak yang sama dengan dokumen lain di aplikasi: pilih "Simpan sebagai PDF" pada dialog cetak browser), jadi satu sumber isi
untuk layar dan berkas -- tidak ada salinan terpisah yang bisa usang.

**Memperbarui isi panduan:** semua teks ada di `src/data/panduanData.js` (data murni, bukan kode tampilan); ubah di sana lalu
jalankan `npm run uji -- panduan`, yang memeriksa setiap bagian punya judul dan isi, dan id bagian tidak bentrok (dipakai sebagai
jangkar daftar isi). Kode: `src/lib/panduanLogic.js` (`panduanAwal`), halaman `src/pages/Bantuan.jsx`.

### Instrumen penilaian SKU
Tiap unit SKU (butir; butir agama per sub-butir, total 90 unit) dapat punya **instrumen**: cara uji, instruksi penguji, dan 1-15 kriteria (jenis Lisan/Praktik/Bukti kegiatan/Pengamatan, bobot 1-5, tanda **Wajib**, panduan penguji).
- **Penilaian**: penguji memberi nilai 1-5 pada tiap kriteria di lembar penilaian. **Skor** (0-100) = 20 x jumlah(nilai x bobot) / jumlah(bobot), dibulatkan setengah ke atas. **Saran LULUS** bila skor mencapai ambang (bawaan 75) dan, bila "kriteria wajib menjadi syarat lulus" menyala (bawaan: menyala), setiap kriteria wajib bernilai minimal 3. Predikat: 90 ke atas Sangat baik, 75 ke atas Baik, selebihnya Cukup. Semua angka dapat diatur di tab Pengaturan.
- **Penguji boleh memilih hasil berbeda dari saran**, dengan catatan alasan wajib yang tercatat di riwayat. Skor, saran, dan rincian tiap kriteria disimpan pada tabel `sku_penilaian` (hanya bertambah; salinan kriteria ikut tersimpan sehingga tetap terbaca walau instrumen diubah).
- **Status**: instrumen baru berstatus **draf** (tidak dipakai). Hanya yang **ditetapkan** oleh Pembina atau Admin dipakai menilai dan terlihat Penegak (daftar kriteria saja; instruksi dan panduan penguji hanya terbaca pengurus, dijaga RLS). Butir tanpa instrumen ditetapkan tetap memakai penilaian lama (Lulus/Perlu diulang + predikat). Butir yang instrumennya ditetapkan tidak lagi dapat dinilai dengan cara lama (ditegakkan di server); "Mulai uji" dan "Kembalikan" tetap ada.
- **Server menghitung ulang** skor dan saran (`sigarda.instrumen_hitung`); pencatatan lewat Edge Function setelah PIN penguji diverifikasi (`sg_sku_catat_rubrik_internal`), lalu memakai jalur yang sama dengan penilaian lama (status, kode verifikasi VRF-, riwayat). Rumus di `src/lib/instrumenLogic.js` dan SQL sama persis dan dijaga pengujian.
- **Rincian nilai untuk Penegak dan pengurus**: pada butir yang pernah dinilai dengan instrumen, tombol **Rincian nilai** menampilkan tiap penilaian (terbaru di atas): tanggal, skor, hasil, nilai 1-5 pada tiap kriteria, dan catatan penguji. Dibaca dari `sku_penilaian` saat dibuka (Penegak hanya membaca miliknya, dijaga RLS). Instruksi dan panduan penguji tidak pernah ikut.
- **Kelola** (menu Instrumen, Pembina dan Admin): daftar 90 unit, penyuntingan kriteria (urutan, bobot, wajib, panduan), penetapan massal, dan pengaturan. Penyuntingan instrumen yang sedang dipakai berlaku untuk penilaian berikutnya.
- **ISI INSTRUMEN TIDAK ADA DI REPOSITORI INI.** Repositori bersifat publik, sedangkan panduan penguji tidak boleh terbaca Penegak. Isi disimpan di berkas Excel (di luar repositori) dan dimuat ke database lewat SQL yang dibuat skrip:
  ```
  node scripts/instrumen-ke-sql.mjs <keluaran.sql> <berkas.xlsx | folder> ... [--mode=baru|perbarui-draf|timpa-semua]
  ```
  Format Excel sama dengan berkas tinjauan. Mode `baru` (bawaan) hanya menambah butir yang belum punya instrumen; `perbarui-draf` mengganti isi instrumen yang masih draf; `timpa-semua` mengganti semuanya (suntingan Pembina ikut tertimpa). Jangan memasukkan SQL hasilnya ke repositori. Mode lokal hanya memuat 3 instrumen CONTOH fiktif.
  **Unduh Excel** di menu Instrumen mengekspor semua instrumen yang sudah ada dalam format yang sama, sehingga alurnya bisa berputar: unduh, sunting di Excel, ubah ke SQL dengan `--mode=perbarui-draf`, jalankan di SQL Editor. Berkas hasil unduhan memuat **panduan penguji (rahasia)**: jangan dibagikan kepada Penegak dan jangan diunggah ke repositori.

### Sesi ujian bersama
Menu **Sesi ujian** (Dewan Ambalan, Pembina, Admin) menjadwalkan ujian untuk banyak Penegak sekaligus: nama, tanggal, tempat, **butir** yang diuji, dan **daftar peserta** (tombol "Ambil dari pengajuan" mengisi peserta dan butir dari pengajuan yang menunggu).
- **Papan sesi**: satu baris per peserta dengan satu chip per butir (butir agama per sub-butir, mis. B1a). Warna chip: Menunggu, Sedang diuji, Lulus, Perlu diulang, Sudah lulus sebelumnya (tidak dihitung sebagai tugas sesi), Bantara belum selesai (butir Laksana terkunci). Ringkasan dan progres dihitung di layar dan diperbarui otomatis tiap 15 detik selama sesi belum selesai.
- **Status papan diturunkan dari progres SKU**, bukan disimpan terpisah: hasil pada atau sesudah tanggal sesi dihitung untuk sesi itu. Karena itu penilaian tetap satu jalur (lembar instrumen, PIN penguji, kode verifikasi) dan tidak ada data ganda.
- **Menilai dari papan**: sesi berstatus **Berlangsung** (tombol "Mulai sesi") dan pengguna Dewan Ambalan atau Pembina; klik chip membuka lembar penilaian dengan tanggal uji terisi tanggal sesi. Admin Gudep memantau saja (server hanya menerima penilaian dari penguji).
- Penegak hanya melihat sesi yang mencantumkannya (kartu "Jadwal ujian bersama" di Beranda). Menghapus sesi tidak menghapus hasil penilaian.

### Verifikasi keaslian dokumen (QR)
Kartu SKU mencetak **satu QR per butir yang lulus** dan Surat Tanda Lulus mencetak **satu QR per tingkat**; kode pendek `VRF-` tetap tercetak di Kartu SKU. QR berisi alamat `https://<alamat aplikasi>/?v=<token>`; pemindai membuka halaman verifikasi **tanpa login**.
- **Token QR**: 32 heksadesimal acak (128 bit) yang dibuat server, tidak bisa ditebak. Token butir dibuat baru setiap butir dinyatakan lulus dan dihapus bila butir tidak lagi lulus (diulang, dikembalikan), sehingga kartu lama otomatis tidak sah. Token surat sah selama seluruh butir tingkat itu masih lulus.
- **Yang tampil bagi pemegang token**: nama lengkap, butir (atau tingkat), tanggal uji, dan penguji. Tidak ada NIS, kelas, sangga, agama, atau data akun lain. Jawaban untuk token yang tidak sah selalu sama (`{ditemukan:false}`), tidak membedakan "tidak ada" dari "salah format".
- **Kode `VRF-`** (28 bit, dapat ditebak) hanya dapat ditanyakan di halaman yang sama dan hanya menjawab **sah atau tidak** beserta tingkat, butir, dan tanggal, **tanpa nama**.
- Fungsi publik `sg_verifikasi_token` dan `sg_verifikasi_kode` hanya membaca dan diberi hak `anon`; tabel `sertifikat_tingkat` tidak terbaca siapa pun secara langsung. Halaman verifikasi tidak diindeks mesin pencari (`noindex`).
- **Cetak**: Kartu SKU berisi banyak QR (satu per butir lulus), sehingga Kartu Bantara yang lengkap memakai **dua halaman A4** (kepala tabel diulang di halaman kedua; baris tidak terpotong). QR pada Kartu memakai koreksi kesalahan L dengan modul sekitar 0,3 mm, terbaca pemindai ponsel pada kertas bersih. Cetak dengan kualitas normal atau tinggi, jangan diperkecil (opsi "Sesuaikan ke halaman"), dan uji pindai satu kartu sebelum dibagikan.
- **Batasnya**: Supabase tidak membatasi laju panggilan fungsi publik ini secara bawaan. Token acak 128 bit tidak dapat ditebak, tetapi seseorang dapat mengulang pertanyaan kode `VRF-` (hanya sah/tidak, tanpa nama). Alamat pada QR mengikuti alamat aplikasi yang sedang dibuka saat mencetak: cetak dari alamat terbit (bukan `localhost`).

### Status anggota dan naik kelas (fase 6a)
Setiap Penegak punya **status**: **Aktif** (mengikuti Pramuka dan pengujian), **Nonaktif** (masih siswa tetapi tidak melanjutkan Pramuka; hanya kelas X yang wajib Pramuka), atau **Alumni** (sudah lulus). Nonaktif dan alumni hanya dapat **dilihat dan dicetak** (Kartu SKU, surat, QR tetap sah).
Mereka tidak ikut daftar kerja (rekap, absensi, iuran, antrian, sesi ujian, pilihan penguji, dashboard); pada daftar yang memakai filter tersedia pilihan **Status** (bawaan *Aktif*; juga *Nonaktif*, *Alumni*, *Semua status*): Anggota, Peserta, Reset PIN, Raport, rekap Absensi. Pemilih peserta pada **Cetak** punya kotak *Termasuk nonaktif dan alumni*. Penegak nonaktif atau alumni yang masuk melihat pemberitahuan di semua halaman dan tidak melihat tombol ajukan, batal, Calon Garuda, dan isian portofolio.
Server menegakkannya lewat pemicu pada tabel kegiatan (progres, riwayat, absensi, iuran, portofolio, penilaian, raport, sesi ujian; juga status Calon Garuda): penulisan yang menyangkut Penegak nonaktif atau alumni ditolak dengan pesan yang jelas, siapa pun pelakunya.
- **Naik Kelas** (menu Admin, *Pengelolaan*): satu halaman untuk seluruh Penegak yang belum alumni, dilakukan setahun sekali di awal tahun ajaran. Komposisi rombel kelas XI berbeda dari kelas X (peminatan), jadi rombel baru diisi per Penegak; dari XI ke XII komposisi tetap. Tiap baris punya **Rombel baru** dan **Aksi**: *Lanjut* (aktif di rombel baru; rombel wajib), *Tidak lanjut* (nonaktif; rombel baru boleh kosong = rombel terakhir tetap), *Lulus* (alumni, tercatat lulus tahun ajaran sebelum tahun ajaran yang baru dimulai). Baris tanpa aksi dilewati.
  **Isian bawaan**: kelas X = Tidak lanjut (Admin atau Pembina menandai yang melanjutkan, mengisi rombel XI dari daftar kelas sekolah), kelas XI aktif = Lanjut ke XII dengan nomor rombel yang sama, kelas XII = Lulus.
  Isi dapat diubah di layar (per baris, atau *Atur Aksi untuk yang tampil* setelah menyaring kelas) atau lewat **Excel**: *Unduh berkas Excel* (NIS, Nama, Rombel Sekarang, Status Sekarang, Rombel Baru, Aksi; daftar pilihan tersedia) lalu *Unggah berkas terisi*. Tombol **Periksa** meminta server memeriksa semua baris tanpa mengubah apa pun (galat per baris, peringatan tingkat tidak naik/turun/melompat, bukan kelas XII saat lulus, Calon Garuda, dan jumlah pengajuan uji yang akan dibatalkan); **Terapkan kenaikan** baru menyala bila tidak ada galat. Diterapkan **semua atau tidak sama sekali**.
  Penegak yang menjadi nonaktif atau alumni kehilangan pengajuan uji yang masih berjalan (dibatalkan, dengan catatan di riwayat) dan dikeluarkan dari sesi ujian yang belum selesai.
  **Riwayat** memuat setiap kenaikan (tahun ajaran, pelaku, ringkasan) dengan tombol **Batalkan kenaikan ini** pada yang paling akhir: mengembalikan kelas, status, dan tahun kelulusan, selama Penegak yang bersangkutan belum diubah lagi. Pengajuan uji yang sudah dibatalkan tidak dikembalikan.
  Sesudah menerapkan, atur penugasan penguji tahun ajaran baru (Anggota > Penugasan; *Salin dari tahun lalu* membantu).
- **Satu per satu**: di **Anggota** (tombol *Status*) atau pada detail Penegak (tombol *Status: ...*), **Pembina dan Admin** dapat menonaktifkan atau mengaktifkan kembali (rombel wajib dipilih); menjadikan **alumni** hanya Admin. Semuanya tercatat di riwayat.
- Alumni tercatat dengan tahun ajaran kelulusannya (`profiles.lulus_ta`). Kartu SKU dan verifikasi QR alumni tetap sah.
- Kode: `src/lib/naikKelasLogic.js` (murni; isian bawaan, penyusunan permintaan, penggabungan berkas), `naikKelasExcel.js`, halaman `src/pages/NaikKelas.jsx`, `UbahStatusModal.jsx`, filter Status di `FilterBar.jsx`. Server: `sg_naik_kelas(tahun_ajaran, data, terapkan)`, `sg_naik_kelas_batalkan`, `sg_anggota_status_atur`, pemicu `sigarda.tolak_peserta_tak_aktif` (migrasi `2026-09-naik-kelas.sql`; Edge Function tidak berubah). Dijaga `uji/naik-kelas.mjs`, `uji/naik-kelas-klien.mjs`, `uji/migrasi-naik-kelas.mjs`.

### Dewan Ambalan sebagai jabatan pada akun Penegak (fase 6b)
Dewan Ambalan **bukan akun terpisah**: ia adalah **jabatan** (`profiles.jabatan_dewan`) pada akun Penegak yang aktif. Dewan terpilih saat Musyawarah Ambalan, sudah Bantara, Laksana, atau belum, dan tetap siswa Penegak (punya NIS, rombel, dan progres SKU sendiri). Masa baktinya setahun: sesudah itu jabatan dicabut dan akun kembali menjadi Penegak biasa.
- **Tombol tampilan Penegak/Dewan.** Penegak berjabatan melihat bilah di atas halaman (**Penegak | Dewan**; pilihan diingat per akun di peramban). Tampilan *Penegak*: Beranda, Poin SKU, absensi, dan iuran seperti Penegak lain. Tampilan *Dewan*: menu penguji (Dashboard, Antrian, Peserta, Sesi, Iuran pengurus, dst.).
  Hanya tampilan: hak sebenarnya ditegakkan server dari data akun (`sigarda.pengurus`, `sigarda.dewan`, `sigarda.bisa_menguji`). Login tetap satu (NIS); PIN yang sama dipakai untuk memverifikasi penilaian.
- **Menu Pengurus** (Pembina dan Admin): daftar pengurus saat ini (Pradana dan Pradani di atas), **Tambah pengurus** (pilih Penegak dan isi jabatan; jabatan diisi bebas, daftar hanya saran), dan **Ganti kepengurusan lewat berkas Excel**: *Unduh berkas Excel* (sudah berisi kepengurusan saat ini; kolom NIS, Nama, Rombel, Jabatan Dewan Ambalan),
  ubah sesuai hasil Musyawarah Ambalan, *Unggah berkas terisi*; server memeriksa (pratinjau: Diberi, Diganti, Tetap, Dicabut, Galat; peringatan bila Penegak belum menyelesaikan Bantara, tidak menghalangi), lalu **Terapkan** (semua atau tidak sama sekali). Bawaannya **mengganti seluruh kepengurusan**: pemegang jabatan yang tidak ada di berkas dicabut
  (centang dapat dihilangkan bila berkas hanya menambah atau mengubah beberapa orang; Pradana atau Pradani yang berpindah tangan tetap mencabut pemegang lamanya). Semua tercatat di **Riwayat kepengurusan** (`kepengurusan_log`).
- **Dicabut otomatis** saat Penegak dinonaktifkan atau menjadi alumni (Naik Kelas, atau tombol Status): jabatan, penugasannya sebagai penguji, dan pengajuan yang menunggunya (kembali ke antrian rombel) ikut dirapikan; pengujian yang sedang berjalan dibiarkan (Pembina dapat mengalihkan). Pembatalan kenaikan kelas tidak mengembalikan jabatan.
- **Aturan penguji berdasar penugasan** (menggantikan "Dewan hanya butir Bantara, Laksana khusus Pembina"): lihat "Penegakan penugasan". **Penugasan khusus per Penegak** (menu Penugasan, di bawah matriks; Pembina dan Admin): pengecualian untuk satu Penegak (pindah rombel di tengah tahun, Pembina cuti panjang, konflik kepentingan, atau Penegak yang sendiri berjabatan Dewan).
  Bila sebuah Penegak punya penugasan khusus pada tahun ajaran berjalan, hanya penguji itu yang sah untuknya (menggantikan penugasan rombelnya); alasan wajib dan tercatat di riwayat penugasan. Bila tak ada yang khusus yang boleh menguji butir itu, berlaku penugasan rombel, lalu aturan bawaan. Tidak ada yang menguji atau menilai dirinya sendiri (server menolak).
- **Akun Dewan lama** (akun penguji berjabatan Dewan Ambalan yang dibuat sebelum fase ini) tetap berfungsi sampai Admin **mengarsipkannya** di menu Pengurus (status nonaktif: tidak lagi penguji atau pengurus, riwayat penilaian dan iuran atas namanya tetap; dapat diaktifkan kembali). Akun arsip yang masuk melihat pesan agar memakai akun Penegaknya. Akun Dewan baru tidak lagi dibuat lewat aplikasi (tab Dewan hanya tampil bila masih ada akun lama; template import Dewan tidak ditawarkan).
- **Yang dapat dilakukan Penegak berjabatan (tampilan Dewan):** semua yang boleh dilakukan Dewan sebelumnya (mencatat hasil butir yang sah, absensi, iuran, sesi ujian, sidang, mereset PIN Penegak, portofolio); tidak boleh mengatur penugasan, anggota, atau kepengurusan (Pembina dan Admin). Nama Penegak berjabatan terbaca semua pengguna (agar tampil sebagai penguji); data pribadi Penegak lain tetap tertutup.
- Kode: `src/lib/rombelLogic.js` (`penegakDewan`, `bisaMenguji`, `ditugaskanUntuk`, `pengujiPeranOk`, `pengujiSah`), `dewanLogic.js`, `kepengurusanExcel.js`, `src/pages/Kepengurusan.jsx`, `PenugasanPenegak.jsx`, `BilahTampilan.jsx`; mode di `AppContext` (`akun` = akun apa adanya, `user` = menurut tampilan). Server: `sg_kepengurusan_terapkan(data, ganti, terapkan)`, `sg_anggota_jabatan_dewan_atur`, `sg_penugasan_peserta_atur`, `sg_dewan_lama_arsipkan`, `sigarda.jabatan_dewan_lepas`. Dijaga pengujian `dewan-penegak`, `jabatan-dewan`, `penegakan`, `migrasi-dewan-penegak`.

### Pemeriksaan Data (tahap L3)
Menu **Periksa Data** (Pembina, **Dewan Ambalan**, dan Admin Gudep; sebelumnya bernama Pemeriksaan Data): satu halaman berisi ringkasan masalah kualitas data yang umum ditemui, dengan tombol **Perbaiki** ke menu yang tepat bila peran yang sedang masuk bisa memperbaikinya sendiri:
- **Kelas belum format rombel baku**, **Belum ada NTA**, **Belum diisi jenis kelamin**, **Pembina belum diisi agama**, **Akun belum pernah masuk**: hanya Admin Gudep yang dapat memperbaikinya (tombol Perbaiki membuka menu Anggota); Pembina tetap melihat daftarnya agar tahu apa yang perlu diminta ke Admin. Pada **Akun belum pernah masuk**, tiap nama punya tombol **Buka WhatsApp** berpesan siap-kirim yang mengajak masuk (tanpa PIN; PIN awal disampaikan Pembina/Admin langsung); nomor diambil dari menu Akun saya anggota itu, tanpa nomor Anda memilih kontak sendiri.
- **Rombel belum ada penugasan penguji**: Pembina dan Admin dapat mengatur (tombol Perbaiki membuka menu Penugasan untuk Pembina).
- **Siapa boleh dihubungi lewat tombol WhatsApp** (`bolehDihubungi` di `src/lib/eskalasiLogic.js`; ditegakkan di tampilan): **Dewan Ambalan** menghubungi Penegak dan sesama Dewan; **Pembina dan Admin** menghubungi Penegak, Dewan Ambalan, dan sesama Pembina. Admin Gudep dan diri sendiri tidak pernah mendapat tombol. Dewan Ambalan hanya melihat daftar; tombol Perbaiki tetap untuk Admin/Pembina.
- **Perangkat notifikasi anggota**: memakai komponen yang sama dengan halaman Notifikasi (`RingkasanPerangkat`); tidak dapat diperbaiki dari sini (pemiliknya sendiri yang mengaktifkan di HP-nya).
Kode: `src/lib/pemeriksaanLogic.js` (kategori dan tautan perbaiki menurut peran), `src/pages/PemeriksaanData.jsx`. Server: `sg_pemeriksaan_data()` dan `sg_push_ringkasan()` (semua pengurus, sejak migrasi `2026-09-periksa-dewan.sql`). Dijaga pengujian `pemeriksaan-data`, `migrasi-pemeriksaan-data`.

### Cadangan data (tahap L4)
Menu **Data Gudep** (Admin Gudep), panel "Cadangan data": tombol **Unduh cadangan** mengunduh satu berkas JSON berisi seluruh tabel data aplikasi (SKU, absensi, iuran, portofolio, dokumen, pengaturan gudep, dll.) ke komputer Admin. **TIDAK** menyentuh akun login (`auth.users`/`auth.identities`) atau hash PIN sama sekali, dan **TIDAK** menyertakan tabel rahasia/sementara (`login_gagal`, `push_konfigurasi`, `push_langganan`, `notifikasi`); bila database perlu dipulihkan, akun anggota dibuat ulang (Reset PIN) lalu isi berkas ini dipulihkan manual lewat SQL Editor bila perlu. Ini adalah cadangan **ringan tanpa layanan berbayar**, pelengkap `Cadangkan-SIGARDA.bat` (cadangan penuh level basis data, termasuk akun login, dijalankan pengguna sendiri dari komputer mana pun — lihat bagian instalasi).

Setiap kali cadangan diunduh, waktunya dicatat (pengaturan `cadangan.terakhir`). Pengingat harian (`sigarda.notif_pengingat`, sama dengan pengingat pengujian dan sesi ujian besok) mengirim notifikasi ke semua Admin bila cadangan sudah **lebih dari 30 hari** tidak diunduh (atau belum pernah), dengan kunci dedup bulanan sehingga hanya sekali per bulan per Admin.

Kode: `src/lib/cadanganLogic.js` (nama berkas unduhan, `perluCadangan`), panel `CadanganData` di `src/pages/DataGudep.jsx`. Server: `sg_cadangan_admin()`, `sg_cadangan_status()` (keduanya Admin-only). Dijaga pengujian `cadangan`, `migrasi-cadangan`.

### Eskalasi tidak bergerak (tahap L5)
Nomor **WhatsApp** (`profiles.whatsapp`, opsional, hanya format yang diperiksa) diisi sendiri oleh pemilik akun (semua peran) lewat menu **Akun saya**, atau lewat ajakan sekali per masuk (dapat dilewati dengan "Isi nanti"; ditanyakan lagi pada masuk berikutnya bila masih kosong). Kode: `src/components/FormWhatsapp.jsx`, ajakan di `src/App.jsx` (`Shell`, state `waTutup`). Server: `sg_profil_whatsapp_atur(text)`.

Tangga pengingat (ramah → tegas → mendesak) untuk Penegak yang **tidak bergerak**, dihitung ULANG setiap hari dari data sumbernya (bukan status tersimpan, jadi otomatis "reset" begitu ada tindak lanjut):
- **SKU**: tidak ada `sku_progress`/`sku_riwayat` baru selama **7 hari**.
- **Absensi**: **2 kali** latihan Jumat *terakhir* berturut-turut berstatus Alpa (izin/sakit tidak dihitung).
- **Iuran**: **2 kali** latihan Jumat *terakhir* berturut-turut tanpa baris iuran (terpisah dari status absensi).

Tingkat dihitung dari hari sejak kejadian pertama kali terpenuhi: **1 ramah** (hari 0-3), **2 tegas** (4-7), **3 mendesak** (8+, juga memberi tahu **semua pengurus** — Pembina, Dewan Ambalan, Admin — dan masuk daftar **Tindak Lanjut**). Maksimal 1 notifikasi per hari per kejadian; dijalankan dari `sigarda.notif_pengingat()` (pengingat harian 07.00 WIB) sehingga otomatis di luar **jam senyap 22.00-04.00 WIB** tanpa logika tambahan.

Menu **Tindak Lanjut** (Pembina, Dewan Ambalan, Admin): daftar Penegak tingkat mendesak dengan tombol **Buka WhatsApp** (wa.me, teks siap-kirim; langsung ke nomor bila sudah diisi, atau tanpa nomor — pengguna memilih kontak sendiri — bila belum). **Tidak ada** pemeriksaan nomor benar-benar terdaftar/aktif di WhatsApp (perlu layanan WhatsApp Business API berbayar, di luar cakupan).

Kode: `src/lib/eskalasiLogic.js` (`waLink`, `teksWaSiap`, `whatsappSah`, label), `src/pages/TindakLanjut.jsx`. Server: `sigarda.eskalasi_mulai_sku/absensi/iuran`, `eskalasi_tingkat`, `eskalasi_proses()`, `sg_eskalasi_daftar()` (Pembina/Dewan/Admin). Dijaga pengujian `eskalasi`, `migrasi-eskalasi`.

### Agenda tahunan (tahap L6)
Menu **Agenda** (semua peran melihat; hanya Pembina dan Admin menambah/mengubah/menghapus): kegiatan tahunan Ambalan per tahun ajaran, 14 jenis baku (Musyawarah Ambalan, Naik Kelas, Sidang Dewan Kehormatan, Pembayatan dan Pelantikan Bantara, Pelantikan Laksana, Pelantikan Garuda, Pengembaraan, Perkemahan, Gelora Saka Expo, Gladi Tangguh 1 dan 2, Penempuhan SKU Laksana, PTGD, Pembekalan Dewan Ambalan Angkatan Berikutnya — masing-masing dengan judul bawaan yang dapat diubah) atau **'lainnya'** (judul bebas). Setiap kegiatan boleh menandai **Penegak terkait** (opsional, mis. calon yang akan disidang/dilantik) yang ikut diberi tahu selain semua pengurus.

**Batas keras Musyawarah Ambalan:** harus dijadwalkan **sebelum 1 Juli** tahun kedua tahun ajaran (sebelum Naik Kelas dan tahun ajaran baru, supaya kepengurusan sudah berganti). Ditegakkan di server; **hanya Pembina** (bukan Admin) dapat melewati batas ini lewat centang "Lewati batas", atau (jalur resmi) lewat persetujuan usulan Musyawarah Ambalan di bawah. Jenis lain tidak mengenal batas ini.

Pengingat otomatis **H-30, H-7, H-1** ke semua pengurus (Pembina, Dewan Ambalan, Admin) dan Penegak pada peserta terkait (bila ada), dijalankan dari `sigarda.notif_pengingat()` (pengingat harian 07.00 WIB, otomatis di luar jam senyap). Isi notifikasi memakai judul dan keterangan kegiatan apa adanya.

Kode: `src/lib/agendaLogic.js` (`JENIS_AGENDA`, `batasMusyawarah`, `periksaAgenda`, `hariMenuju`), `src/pages/Agenda.jsx`. Server: `sg_agenda_simpan(...)`, `sg_agenda_hapus(id)` (Pembina dan Admin), `sigarda.agenda_proses()`, `sigarda.agenda_batas_musyawarah(tahunAjaran)`. Tabel `public.agenda` (baca: semua yang sudah masuk; tulis: hanya lewat fungsi). Dijaga pengujian `agenda`, `migrasi-agenda`.

#### Usulan kegiatan (tahap L6b)
Alur resmi di dalam aplikasi untuk "usulan Dewan Ambalan", ditampilkan di menu **Agenda** sebagai panel **Usulan kegiatan**, satu baris per jenis: **hanya Pradana atau Pradani** (Penegak aktif berjabatan itu, atau akun Dewan lama yang masih menjabat) dapat mengajukan usulan untuk salah satu dari **11 jenis kegiatan** — tanggal pelaksanaan, **tautan dokumen proposal** (Google Drive), dan catatan opsional. Usulan masuk ke **semua akun Pembina** (notifikasi + tampil di menu Agenda). **Hanya Pembina** (bukan Admin) dapat meninjau: **setuju** (catatan opsional) atau **tolak** (catatan alasan **wajib**). Maksimal satu usulan "menunggu" per (tahun ajaran, jenis) — harus ditinjau dulu sebelum diajukan lagi untuk jenis yang sama; selagi menunggu, Pradana/Pradani dapat menekan **"Ingatkan Pembina"** untuk mengirim ulang notifikasi ke semua Pembina (dibatasi sekali per 24 jam).

Persetujuan **otomatis membuat/memperbarui entri di menu Agenda** (jenis dan judul bawaan sama dengan usulannya) dengan tanggal usulan itu; "lewati batas 1 Juli" hanya berlaku dan otomatis aktif untuk jenis **Musyawarah Ambalan** bila tanggal usulan memang di atas/pada batas — jenis lain tidak mengenal batas ini (`lewati_batas` selalu `false`).

11 jenis dan jadwal pengingat otomatis (ke semua pengurus dan Dewan Ambalan, berhenti begitu tahun ajaran berjalan punya entri Agenda jenis itu, berlanjut sampai ada yang disetujui bila belum):

| Jenis | Pengingat mulai | Lalu tiap |
| --- | --- | --- |
| Musyawarah Ambalan | H-60 sebelum batas 1 Juli | 14 hari |
| Pembayatan dan Pelantikan Bantara | H-30 sebelum Desember atau Februari (yang lebih awal) | 14 hari |
| Pelantikan Laksana | H-30 sebelum April atau Juni (yang lebih awal) | 14 hari |
| Pengembaraan | H-30 sebelum Desember atau Februari (yang lebih awal) | 14 hari |
| Perkemahan | H-30 sebelum Desember atau Februari (yang lebih awal) | 14 hari |
| Gelora Saka Expo | H-30 sebelum September | 14 hari |
| Gladi Tangguh 1 | H-30 sebelum Desember atau Februari (yang lebih awal) | 14 hari |
| Gladi Tangguh 2 | H-30 sebelum April atau Juni (yang lebih awal) | 14 hari |
| Penempuhan SKU Laksana | H-30 sebelum Desember atau Februari (yang lebih awal) | 14 hari |
| PTGD (Penerimaan Tamu Gugus Depan) | H-60 sebelum Juli | 14 hari |
| Pembekalan Dewan Ambalan Angkatan Berikutnya | H-30 sebelum Agustus | 14 hari |

Musyawarah Ambalan punya pengingatnya sendiri (`sigarda.musyawarah_pengingat()`, tidak berubah sejak rancangan awal); 10 jenis lain memakai satu fungsi bersama (`sigarda.kegiatan_pengingat()`) dengan tabel konfigurasi bulan sasaran per jenis.

Kode: `src/lib/kegiatanLogic.js` (`JENIS_USULAN`, `labelJenisUsulan`, `periksaUsulan`, `periksaTinjauan`, `bolehIngatkan`, `usulanMenunggu`, `usulanTerakhir`), komponen `UsulanKegiatan` di `src/pages/Agenda.jsx`. Server: `sg_kegiatan_usul(jenis, ...)`, `sg_kegiatan_tinjau(id, keputusan, catatan)`, `sg_kegiatan_ping(id)`, `sigarda.kegiatan_judul_bawaan(jenis)`, `sigarda.kegiatan_bulan_tanggal(tahunAjaran, bulan)`, `sigarda.musyawarah_pengingat()`, `sigarda.kegiatan_pengingat()`, `sigarda.pembina_saja()`, `sigarda.pradana_atau_pradani()`. Tabel `public.kegiatan_usulan` (baca: pengurus saja; tulis: hanya lewat fungsi). Dijaga pengujian `kegiatan`, `migrasi-kegiatan`.

### Filter dinamis
Semua filter (status, sangga, kelas, peran, agama, jenis kelamin, tahun ajaran) dibangun dari data yang ada. Filter **Status** (Aktif bawaan, Nonaktif, Alumni, Semua status) ada pada Anggota, Peserta, Reset PIN, Raport, dan rekap Absensi; daftar lain hanya memuat Penegak aktif.
**Filter jenis kelamin** (Laki-laki, Perempuan, dan **Belum diisi** selama masih ada anggota yang kosong) tersedia pada semua daftar Penegak yang memakai filter: Anggota, Dashboard Admin, Peserta, Absensi (rekap dan catat), Portofolio, Raport, Sidang, Reset PIN, dan Rekap Iuran. Keterangan filter pada berkas Excel ikut menyebutnya.
Dashboard Pembina, Dewan, dan Admin menampilkan jumlah Penegak laki-laki, perempuan, dan yang belum diisi di bawah komposisi anggota.
**Kolom Jenis Kelamin** (Laki-laki, Perempuan, atau kosong bila belum diisi; tepat sesudah Nama) ada pada berkas Excel: rekap absensi (lembar Rekap dan Per Jumat), nilai raport (semua lembar kelas), rekap portofolio (Rekap Kesiapan), rekap iuran (Per Penegak), dan CSV rekap SKU di Dashboard Admin.

## Menjalankan

Prasyarat: Node.js 18 atau lebih baru.

```bash
npm install
npm run dev:lokal    # mode lokal: TANPA Supabase, data di browser ini saja, akun contoh tampil di halaman masuk
                     # uji tanpa PIN: http://localhost:5199/?masuk=pembina  (juga admin, dewan, 10231, 10008 Penegak berjabatan, 10007 Calon Garuda)
                     # data sekolah penuh (700 Penegak + 150 alumni, untuk uji kinerja): ?data=penuh&masuk=pembina  (pertama kali ~1 menit; ?ulang=1 membuat ulang)
npm run dev          # memakai Supabase (butuh .env.local, lihat bagian berikutnya)
npm run build        # hasil produksi di folder dist/
npm run skema        # membuat ulang supabase/skema.sql dari supabase/sumber/*.sql + data butir SKU
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

**Memperbarui fungsi yang sudah terpasang.** Bila `supabase/functions/sigarda/index.ts` berubah, ulangi langkah 2 (tempel isi terbaru, **Deploy**); pengaturan "Verify JWT" dan nama fungsi tidak berubah.
Pembaruan untuk **instrumen penilaian** mewajibkan ini: fungsi lama mengabaikan nilai kriteria, dan aplikasi akan menolak penilaian instrumen dengan pesan bahwa fungsi belum diperbarui.

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
(SQL Editor). Untuk akun lain, gunakan Reset PIN anggota di menu akun.

## Menerbitkan ke GitHub Pages

Berkas `.github/workflows/deploy.yml` membangun dan menerbitkan otomatis setiap `git push` ke `main`.
1. Di repositori GitHub: **Settings > Secrets and variables > Actions > tab Variables > New repository variable**, buat dua variabel:
   `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` (nilai sama dengan `.env.local`). Gunakan **Variables**, bukan Secrets.
2. **Settings > Pages > Source: GitHub Actions**.
3. `git push`. Pantau tab **Actions**. Bila variabel belum diisi, proses berhenti dengan pesan yang jelas (situs lama tetap tampil).
4. Alamat situs: `https://NAMAAKUN.github.io/NAMAREPO/`.

### Keep-alive Supabase (agar proyek Free tier tidak dijeda)
Proyek Supabase Free tier dijeda otomatis setelah 7 hari tanpa aktivitas. Ada dua lapis, sengaja bertumpuk:

**1. Dari dalam database (cara utama; migrasi `2026-09-keepalive.sql`).** `pg_cron` menjalankan `sigarda.keepalive_ping()` tiap hari pukul 01.30 UTC (08.30 WIB); fungsi itu meminta `pg_net` mengirim SATU permintaan HTTP ke API proyek sendiri (fungsi publik `sg_gudep_publik`), sehingga tercatat sebagai lalu lintas API sungguhan. Tidak bergantung pada GitHub, tidak ada yang perlu dinyalakan ulang. Pemasangan, SEKALI, di SQL Editor Supabase (nilai alamat dan kunci anon/publishable dari Project Settings > API; JANGAN kunci service_role):
```sql
select sigarda.keepalive_atur('https://<ref>.supabase.co', '<kunci anon atau publishable>');
```
Perintah itu menyimpan pengaturan, membuat dua jadwal (ping dan pencatatan hasil), dan langsung mengirim ping pertama. Beberapa detik kemudian periksa:
```sql
select sigarda.keepalive_periksa();
```
Hasil sehat: `"sehat": true`, `"status": 200`, dan `"pekerjaan_cron_aktif": 2`. `status` 401/403 = kunci salah; 404 = alamat proyek salah. Bila `pg_cron` atau `pg_net` belum aktif, perintah pertama menyebutnya: aktifkan di **Dashboard > Integrations**, lalu jalankan lagi. Untuk mematikan (mis. pindah ke paket berbayar): `select sigarda.keepalive_matikan();`. Sebagai pemeriksaan tambahan, lihat **Reports > API** di Dashboard: permintaan harian ke `sg_gudep_publik` seharusnya muncul.

**2. Dari GitHub Actions (cadangan).** `.github/workflows/keep-alive.yml` menjalankan `scripts/keep-alive.mjs` tiap hari pukul 02.17 UTC dengan dua variabel yang sama dengan deploy (`VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`, tab **Variables**). Kelebihannya: bila gagal, GitHub mengirim email. Uji pertama: tab **Actions > Keep-alive Supabase > Run workflow**. Batasnya: pada repositori publik GitHub menonaktifkan jadwal setelah 60 hari tanpa aktivitas repositori (nyalakan lagi di tab Actions); lapis 1 tidak terpengaruh.

**Batas yang perlu diketahui:** keduanya mencegah penjedaan otomatis tetapi bukan jaminan dari Supabase (kebijakan Free tier dapat berubah). Lapis 1 hanya berjalan selama proyek aktif: proyek yang sudah terjeda tidak bangun sendiri, pulihkan lewat Dashboard (**Restore project**) lalu pasang ulang bila perlu. Cadangan data tetap dianjurkan (menu Data Gudep > Cadangan data, atau `Cadangkan-SIGARDA.bat`).
- Jalankan tangan lapis 2: `VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node scripts/keep-alive.mjs`. Dijaga pengujian `keep-alive`, `keepalive-db`, dan `migrasi-keepalive`.

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
[`supabase/migrasi/`](supabase/migrasi), dijalankan satu per satu di SQL Editor, **berurutan dan sekali saja** (tidak menyentuh data). Jangan mengulang migrasi lama sesudah migrasi yang lebih baru dijalankan: sebagian memperbarui fungsi yang sama (mis. 2026-09-instrumen.sql menulis ulang sg_sku_catat_internal, yang kemudian diperbarui lagi oleh 2026-09-verifikasi-sesi.sql):
- [`2026-09-rls-ringan.sql`](supabase/migrasi/2026-09-rls-ringan.sql): aturan baca (RLS) dihitung sekali per kueri, bukan sekali per baris. Pada 20 ribu baris progres, membaca milik sendiri turun dari sekitar 1 detik menjadi sekitar 7 milidetik (diukur di PGlite; angka di Supabase berbeda, arahnya sama).
- [`2026-09-sidang-dk.sql`](supabase/migrasi/2026-09-sidang-dk.sql): Sidang Dewan Kehormatan dan Pengaturan. Hanya menambah 3 tabel (`pengaturan`, `sidang_dk`, `sidang_urut`), kolom `profiles.nta`, dan fungsi baru.
  **Wajib dijalankan sebelum menerbitkan kode Sidang**, karena halaman Sidang membaca tabel baru itu. Jalankan setelah `2026-09-rls-ringan.sql`.
- [`2026-09-sidang-format-nomor.sql`](supabase/migrasi/2026-09-sidang-format-nomor.sql): kode nomor `{no2}`-`{no6}` (nomor 4 angka dan seterusnya), penghitung nomor urut dapat dibaca pengurus, dan fungsi `sg_sidang_urut_atur`.
  Jalankan **setelah** `2026-09-sidang-dk.sql`. Catatan sidang dan pengaturan yang sudah ada tidak berubah.
- [`2026-09-raport.sql`](supabase/migrasi/2026-09-raport.sql): Nilai Raport Ekstrakurikuler. Hanya menambah tabel `raport`, fungsi hitung di server, dan fungsi `sg_raport_simpan`, `sg_raport_hapus`, `sg_raport_pengaturan_simpan`.
  Jalankan **setelah** `2026-09-sidang-dk.sql` dan `2026-09-sidang-format-nomor.sql` (bila belum, migrasi ini berhenti dengan pesan yang menuntun dan tidak mengubah apa pun). **Wajib dijalankan sebelum menerbitkan kode Raport**; sebelum itu menu Raport hanya menampilkan pesan bahwa basis data belum diperbarui, halaman lain tidak terpengaruh.
- [`2026-09-instrumen.sql`](supabase/migrasi/2026-09-instrumen.sql): instrumen penilaian SKU. Menambah 5 tabel (`instrumen`, `instrumen_kriteria`, `instrumen_penguji`, `instrumen_panduan`, `sku_penilaian`), fungsi hitung skor, `sg_sku_catat_rubrik_internal`, `sg_instrumen_simpan`, `sg_instrumen_status`, `sg_instrumen_pengaturan_simpan`, dan memperbarui `sg_sku_catat_internal`.
  Jalankan **setelah** migrasi Sidang dan Raport. Tidak mengubah data; tanpa isi instrumen alur penilaian yang berjalan tidak berubah. Setelah itu (1) muat isi instrumen (SQL dari `scripts/instrumen-ke-sql.mjs`, lihat di atas), (2) **pasang ulang Edge Function** (lihat langkah 4), lalu (3) `git push`. Instrumen baru berstatus draf sampai Pembina menetapkannya di menu Instrumen.
- [`2026-09-verifikasi-sesi.sql`](supabase/migrasi/2026-09-verifikasi-sesi.sql): verifikasi QR dan sesi ujian. Menambah kolom `sku_progress.verifikasi_token` (butir yang **sudah lulus diberi token**), tabel `sertifikat_tingkat`, `sesi_ujian`, `sesi_ujian_butir`, `sesi_ujian_peserta`, fungsi `sg_verifikasi_token`, `sg_verifikasi_kode` (dapat dipanggil tanpa login), `sg_sertifikat_tingkat`, `sg_sesi_simpan`, `sg_sesi_status`, `sg_sesi_hapus`, dan memperbarui `sg_sku_catat_internal` (token dibuat saat lulus).
  Jalankan **setelah** kelima migrasi di atas (bila belum, berhenti dengan pesan yang menuntun dan tidak mengubah apa pun). **Edge Function tidak berubah** untuk fitur ini. Sebelum migrasi ini dijalankan, aplikasi baru tetap berjalan: Kartu SKU tercetak tanpa QR, menu Sesi ujian menampilkan pesan bahwa basis data belum diperbarui, dan Surat Tanda Lulus tercetak tanpa QR dengan peringatan.
- [`2026-09-nta-anggota.sql`](supabase/migrasi/2026-09-nta-anggota.sql): NTA anggota untuk import Excel dan formulir ubah anggota. Hanya menambah fungsi `sg_anggota_nta_atur(jsonb)` (khusus Admin Gudep); tidak mengubah tabel atau data. Jalankan **setelah** `2026-09-verifikasi-sesi.sql`. Edge Function tidak berubah. Sebelum migrasi ini dijalankan, aplikasi baru tetap berjalan; hanya pengisian NTA dari formulir dan import yang memberi tahu bahwa NTA belum tersimpan.
- [`2026-09-butir-agama-pembina.sql`](supabase/migrasi/2026-09-butir-agama-pembina.sql): butir agama hanya dinilai Pembina. Hanya memperbarui dua fungsi, `sg_sku_catat_internal` dan `sg_sku_ajukan`; tidak mengubah tabel atau data. Jalankan **setelah** `2026-09-nta-anggota.sql` (bila migrasi sebelumnya belum lengkap, berhenti dengan pesan yang menuntun). Edge Function tidak berubah. **Sebelum migrasi ini dijalankan, Dewan Ambalan masih dapat menilai butir agama** (hanya tampilan yang sudah menyembunyikan tombolnya). Pengajuan butir agama yang sudah ditujukan kepada Dewan tetap ada dan dapat dinilai Pembina lewat Antrian > Tampilkan semua penguji.
- [`2026-09-indeks-kode-verifikasi.sql`](supabase/migrasi/2026-09-indeks-kode-verifikasi.sql): satu indeks (`sku_progress_verifikasi_idx`) untuk pencarian kode pendek `VRF-` pada halaman verifikasi publik, sehingga pemeriksaan kode tidak memindai seluruh tabel progres. Tidak mengubah tabel, fungsi, atau data; tidak unik (kode berasal dari hash 28 bit dan dapat kembar). Boleh dijalankan kapan saja setelah tabel `sku_progress` ada, disarankan sesudah `2026-09-butir-agama-pembina.sql`. Edge Function tidak berubah.
- [`2026-09-iuran.sql`](supabase/migrasi/2026-09-iuran.sql): iuran bumbung kepramukaan. Menambah kolom `instrumen_kriteria.sumber`, tabel `iuran`, `iuran_log`, `iuran_kas`, `asisten_iuran` (beserta RLS baca-saja), fungsi `sg_iuran_set`, `sg_iuran_set_banyak`, `sg_iuran_lembar`, `sg_iuran_agregat`, `sg_iuran_kas_simpan`, `sg_asisten_iuran_atur`, `sg_iuran_ringkas`, `sg_iuran_susulan`, `sg_iuran_pengaturan`, `sg_iuran_pengaturan_simpan`, dan memperbarui `sg_instrumen_simpan`, `sg_sku_catat_rubrik_internal`, serta `sg_absen_hapus_sesi`. Tidak mengubah data yang ada.
  Jalankan **setelah** migrasi instrumen dan verifikasi-sesi (bila belum, berhenti dengan pesan yang menuntun); disarankan sesudah `2026-09-indeks-kode-verifikasi.sql`. **Edge Function tidak berubah** (tanda tangan `sg_sku_catat_rubrik_internal` tetap). Sebelum migrasi dijalankan, aplikasi baru tetap berjalan: tab di menu Iuran menampilkan pesan bahwa basis data belum diperbarui, kartu iuran di dashboard tidak ditampilkan, baris iuran di Absensi tidak muncul, dan panel iuran pada lembar penilaian menampilkan pesan yang sama (halaman lain tidak terpengaruh). **Jangan mengulang migrasi instrumen atau sebelumnya sesudah ini**, karena akan menimpa `sg_instrumen_simpan` dan `sg_sku_catat_rubrik_internal` versi iuran. Bila instrumen dimuat ulang dari Excel yang berkolom "Sumber nilai", jalankan migrasi ini lebih dulu (SQL yang dihasilkan menyebut kolom `sumber` hanya untuk kriteria bersumber iuran).
- [`2026-09-penugasan.sql`](supabase/migrasi/2026-09-penugasan.sql): rombel baku dan penugasan penguji per rombel (fase 1a). Menambah tabel `penugasan_rombel`, `penugasan_log` (riwayat, hanya bertambah), `guru_agama` (RLS baca untuk pengurus), fungsi bantu `sigarda.rombel_sah`, `rombel_baku`, `tahun_ajaran_sah`, `tahun_ajaran_kini`, `wajib_admin`, fungsi `sg_penugasan_atur`, `sg_penugasan_salin`, `sg_rombel_perbarui`, `sg_guru_agama_simpan`, `sg_guru_agama_hapus`, `sg_anggota_agama_atur`, dan memperbarui `sg_anggota_ubah` (kelas wajib rombel baku; menyimpan agama Pembina) serta `sg_profil_buat_internal` (kelas Penegak wajib rombel baku). Tidak menghapus atau mengubah data yang ada; kelas lama tetap dan dapat dirapikan lewat tombol **Perbarui rombel Penegak**.
  Jalankan **setelah** `2026-09-iuran.sql` (bila belum, berhenti dengan pesan yang menuntun). **Edge Function tidak perlu di-deploy ulang** (tanda tangan `sg_profil_buat_internal` tetap). Sebelum migrasi dijalankan, aplikasi baru tetap berjalan: tab Penugasan menampilkan pesan bahwa basis data belum diperbarui, dan kelas Penegak masih boleh berformat lama (validasi rombel baru berlaku di server setelah migrasi; pemeriksaan di layar sudah berlaku lebih dulu).
- [`2026-09-penegakan.sql`](supabase/migrasi/2026-09-penegakan.sql): penegakan penugasan penguji (fase 1b). Menambah fungsi bantu `sigarda.penguji_peran_ok`, `penguji_sah`, `penguji_boleh`, fungsi `sg_penguji_pilihan` (daftar penguji yang sah beserta beban antrian) dan `sg_sku_alihkan` (Pembina atau Admin mengalihkan pengajuan, alasan tercatat), serta memperbarui `sg_sku_ajukan` (hanya penguji yang sah; penguji kosong = antrian rombel) dan `sg_sku_catat_internal` (butir Laksana hanya Pembina, butir agama hanya Pembina seagama, riwayat "menggantikan NAMA"). Tidak mengubah tabel atau data.
  Jalankan **setelah** `2026-09-penugasan.sql` (bila belum, berhenti dengan pesan yang menuntun). **Edge Function tidak perlu di-deploy ulang** (tanda tangan `sg_sku_catat_internal` tetap). **Jalankan migrasi ini sebelum `git push` kode fase 1b**: tanpa fungsi `sg_penguji_pilihan`, formulir Ajukan pengujian Penegak tidak dapat memuat daftar penguji. Sebelum agama seorang Pembina diisi, aturan butir agama tetap seperti lama (masa peralihan).
- [`2026-09-dokumen.sql`](supabase/migrasi/2026-09-dokumen.sql): dokumen terbit dan surat pengantar ke guru agama (fase 2a). Menambah tabel `dokumen_terbit` dan `dokumen_urut` (RLS baca: pengurus dan pemilik), fungsi `sg_dokumen_surat_agama_terbit` dan `sg_dokumen_cabut`, fungsi bantu `sigarda.surat_agama_aktif`, dan memperbarui `sigarda.penguji_peran_ok`, `sg_sku_catat_internal` (Pembina tidak seagama boleh mencatat butir agama yang tercantum pada surat berlaku; riwayat menyebut guru dan nomor surat), `sg_verifikasi_token` dan `sg_verifikasi_kode` (ikut menjawab dokumen terbit) serta `sg_pengaturan_simpan` (kunci baru `surat.format_nomor`). Tidak mengubah data yang ada.
  Jalankan **setelah** `2026-09-penegakan.sql` (bila belum, berhenti dengan pesan yang menuntun). **Edge Function tidak perlu di-deploy ulang.** **Jalankan migrasi ini sebelum `git push` kode fase 2a**: tanpa tabel `dokumen_terbit`, tab Surat pengantar agama tidak dapat memuat surat (halaman lain tetap berjalan).
- [`2026-09-data-gudep.sql`](supabase/migrasi/2026-09-data-gudep.sql): data gudep yang diatur Admin. Menambah fungsi `sg_gudep_simpan` (Admin menyimpan identitas gudep, ambalan, dan pejabat beserta NTA pada pengaturan `gudep.data`; semua isian diperiksa) dan `sg_gudep_publik` (identitas publik tanpa login: nama gudep, ambalan, sekolah, kota). Juga `sigarda.ketua_sidang` dan pembaruan `sg_sidang_simpan`. Tidak ada tabel baru dan tidak ada data yang diubah. (Pradana kini diambil dari jabatan anggota Dewan oleh migrasi berikutnya, `2026-09-jabatan-dewan.sql`.)
  Jalankan **setelah** `2026-09-dokumen.sql` (bila belum, berhenti dengan pesan yang menuntun). Aman dijalankan ulang: bila versi sebelumnya sudah dijalankan, jalankan berkas ini sekali lagi. **Edge Function tidak perlu di-deploy ulang.** Sebelum migrasi dijalankan aplikasi baru tetap berjalan dengan nilai bawaan; hanya penyimpanan di menu Data Gudep yang belum berfungsi.
- [`2026-09-jabatan-dewan.sql`](supabase/migrasi/2026-09-jabatan-dewan.sql): jabatan Dewan Ambalan dan QR Berita Acara Sidang. Menambah kolom `profiles.jabatan_dewan` (Pradana, Pradani, Wakil Pradana, Wakil Pradani, Sekretaris, Bendahara; Pradana dan Pradani masing-masing satu pemegang) dan fungsi `sg_anggota_jabatan_dewan_atur` (Admin). `sigarda.ketua_sidang` kini mengambil ketua dari anggota berjabatan Pradana (cadangan: pengaturan lama). `sg_gudep_simpan` tidak lagi menyimpan Pradana dan Pradani (kunci lama tetap diterima dan diabaikan). Kolom `sidang_dk.token` dan `sidang_dk.kode` serta fungsi `sg_sidang_token`; `sg_verifikasi_token` dan `sg_verifikasi_kode` ikut menjawab berita acara sidang.
  Jalankan **setelah** `2026-09-data-gudep.sql` (bila belum, berhenti dengan pesan yang menyebut apa yang belum ada). Berkas ini juga menerbitkan ulang `sigarda.ketua_sidang` dan `sg_sidang_simpan`, jadi tetap berjalan walau yang dijalankan dulu adalah versi awal `2026-09-data-gudep.sql`. Aman dijalankan ulang. **Edge Function tidak perlu di-deploy ulang.** **Jalankan migrasi ini sebelum `git push` kode ini**: tanpa kolom baru, daftar anggota gagal dimuat. Sesudahnya, **isi Jabatan Dewan Ambalan** (menu Anggota > Dewan Ambalan > ubah): nama Pradana/Pradani yang sebelumnya diketik di Data Gudep tidak dipakai lagi.
- [`2026-09-notifikasi.sql`](supabase/migrasi/2026-09-notifikasi.sql): notifikasi dan Web Push (PWA). Menambah tabel `notifikasi` (dibaca pemiliknya), `push_langganan` dan `push_konfigurasi` (tanpa kebijakan baca), pemicu pembuat notifikasi pada `sku_progress`, `sesi_ujian_peserta`, dan `dokumen_terbit`, `sigarda.notif_pengingat` (dijadwalkan pg_cron), pemicu pengirim push lewat pg_net, `sigarda.push_atur`, serta fungsi `sg_notifikasi_tandai`, `sg_push_kunci`, `sg_push_simpan`, `sg_push_hapus`, `sg_push_ringkasan`, `sg_push_ambil_internal`, `sg_push_hasil_internal`. Tidak mengubah fungsi atau data yang ada.
  Jalankan **setelah** `2026-09-jabatan-dewan.sql` (bila belum, berhenti dengan pesan yang menuntun). Edge Function `sigarda` **tidak berubah**; Web Push memerlukan Edge Function **baru** `notif-push` (lihat bagian *Notifikasi dan aplikasi terpasang*). Aman diulang (mis. sesudah mengaktifkan pg_net atau pg_cron).
- [`2026-09-jenis-kelamin.sql`](supabase/migrasi/2026-09-jenis-kelamin.sql): jenis kelamin anggota. Menambah kolom `profiles.jenis_kelamin` ('L' atau 'P'; boleh kosong untuk anggota yang sudah ada) dan fungsi `sg_anggota_jk_atur` (Admin mengatur banyak anggota sekaligus, semua atau tidak sama sekali). Tidak mengubah data yang ada.
  Jalankan **setelah** `2026-09-notifikasi.sql` (bila belum, berhenti dengan pesan yang menuntun). Edge Function `sigarda` **tidak berubah** dan tidak perlu di-deploy ulang. **Jalankan migrasi ini sebelum `git push` kodenya**: tanpa fungsi `sg_anggota_jk_atur`, tambah anggota baru menyimpan akunnya tetapi jenis kelaminnya belum tersimpan (pesan peringatan).
- [`2026-09-naik-kelas.sql`](supabase/migrasi/2026-09-naik-kelas.sql): status anggota dan naik kelas (fase 6a). Menambah kolom `profiles.status` ('aktif', 'nonaktif', 'alumni'; semua akun yang ada tetap 'aktif'), `status_pada`, dan `lulus_ta`; tabel `naik_kelas_batch` dan `naik_kelas_log` (riwayat, hanya bertambah); pemicu yang menolak penulisan untuk Penegak nonaktif/alumni; fungsi `sg_naik_kelas`, `sg_naik_kelas_batalkan`, `sg_anggota_status_atur`; dan memperbarui `sg_absen_set_banyak`, `sg_iuran_set_banyak`, `sg_iuran_lembar`, `sg_push_ringkasan` agar hanya memuat Penegak aktif.
  Jalankan **setelah** `2026-09-jenis-kelamin.sql` (bila belum, berhenti dengan pesan yang menuntun). Edge Function `sigarda` **tidak berubah** dan tidak perlu di-deploy ulang. Tidak mengubah data yang ada; aman dijalankan berulang. Jalankan **sebelum** `git push` (halaman Anggota membaca kolom `status`).
- [`2026-09-dewan-penegak.sql`](supabase/migrasi/2026-09-dewan-penegak.sql): Dewan Ambalan sebagai atribut Penegak (fase 6b). `profiles.jabatan_dewan` menjadi isian bebas (2 sampai 60 karakter) dan boleh dipegang akun Penegak aktif; `sigarda.pengurus`, `sigarda.dewan`, dan `sigarda.bisa_menguji` mengikutsertakan Penegak berjabatan; aturan penguji berdasar penugasan (`sigarda.penguji_peran_ok`, `penguji_sah`, `ditugaskan`);
  tabel `penugasan_peserta` (penugasan khusus per Penegak) dan `kepengurusan_log`; kolom `penugasan_log.peserta_id/peserta_nama`; fungsi `sg_penugasan_peserta_atur`, `sg_kepengurusan_terapkan`, `sg_dewan_lama_arsipkan`; `sg_penugasan_atur`, `sg_penugasan_salin`, dan `sg_anggota_jabatan_dewan_atur` kini juga untuk Pembina; `sg_anggota_status_atur` dan `sg_naik_kelas` mencabut jabatan otomatis; `baca_profil` memperlihatkan Penegak berjabatan kepada semua pengguna.
  Jalankan **setelah** `2026-09-naik-kelas.sql` (bila belum, berhenti dengan pesan yang menuntun). **Edge Function `sigarda` PERLU di-deploy ulang** (salin `supabase/functions/sigarda/index.ts`; pencatatan hasil uji dan reset PIN kini mengenali Penegak berjabatan Dewan): tanpa itu Penegak berjabatan tidak dapat mencatat hasil uji (pesan "Hanya Pembina atau Dewan Ambalan"). Akun Dewan lama dibiarkan berfungsi sampai diarsipkan. Tidak menghapus data; aman dijalankan berulang. Jalankan **sebelum** `git push`.

- [`2026-09-tes-notifikasi.sql`](supabase/migrasi/2026-09-tes-notifikasi.sql): notifikasi uji (tahap L0). `notifikasi.jenis` menerima 'tes' dan fungsi `sg_notifikasi_tes` (tombol "Kirim notifikasi uji", dibatasi 5 kali per 10 menit). Jalankan **setelah** `2026-09-dewan-penegak.sql`. Edge Function **tidak berubah**. Tidak menghapus data; aman diulang. Jalankan sebelum `git push` (tombolnya memanggil fungsi ini).

- [`2026-09-pemeriksaan-data.sql`](supabase/migrasi/2026-09-pemeriksaan-data.sql): Pemeriksaan Data (tahap L3). Hanya menambah fungsi `sg_pemeriksaan_data()` (Pembina dan Admin); tidak ada tabel atau kolom baru. Jalankan **setelah** `2026-09-tes-notifikasi.sql` (bila belum, berhenti dengan pesan yang menuntun). Edge Function **tidak berubah**. Tidak menghapus data; aman diulang. Jalankan sebelum `git push` (menu Pemeriksaan Data memanggil fungsi ini).

- [`2026-09-cadangan.sql`](supabase/migrasi/2026-09-cadangan.sql): Cadangan data (tahap L4). Menambah fungsi `sg_cadangan_admin()` dan `sg_cadangan_status()` (keduanya Admin-only; tombol "Unduh cadangan" di menu Data Gudep) dan memperbarui `sigarda.notif_pengingat()` (pengingat bulanan ke Admin bila cadangan sudah sebulan tidak diunduh). Tidak ada tabel atau kolom baru. Jalankan **setelah** `2026-09-pemeriksaan-data.sql` (bila belum, berhenti dengan pesan yang menuntun). Edge Function **tidak berubah**. Tidak menghapus data; aman diulang. Jalankan sebelum `git push` (menu Data Gudep memanggil fungsi ini).

- [`2026-09-eskalasi.sql`](supabase/migrasi/2026-09-eskalasi.sql): Eskalasi tidak bergerak (tahap L5). Menambah kolom `profiles.whatsapp` (opsional), nilai `'eskalasi'` pada `notifikasi.jenis`, fungsi `sg_profil_whatsapp_atur(text)` dan `sg_eskalasi_daftar()` (menu Tindak Lanjut), dan memperbarui `sigarda.notif_pengingat()` (tangga pengingat SKU/absensi/iuran tidak bergerak). Jalankan **setelah** `2026-09-cadangan.sql` (bila belum, berhenti dengan pesan yang menuntun). Edge Function **tidak berubah**. Tidak menghapus data; aman diulang. Jalankan sebelum `git push` (menu Akun saya dan Tindak Lanjut memanggil fungsi ini).

- [`2026-09-agenda.sql`](supabase/migrasi/2026-09-agenda.sql): Agenda tahunan (tahap L6). Tabel baru `public.agenda`, nilai `'agenda'` pada `notifikasi.jenis`, fungsi `sg_agenda_simpan(...)` dan `sg_agenda_hapus(id)` (Pembina dan Admin), dan memperbarui `sigarda.notif_pengingat()` (pengingat H-30/H-7/H-1). Jalankan **setelah** `2026-09-eskalasi.sql` (bila belum, berhenti dengan pesan yang menuntun). Edge Function **tidak berubah**. Tidak menghapus data; aman diulang. Jalankan sebelum `git push` (menu Agenda memanggil fungsi ini).

- [`2026-09-usulan-kegiatan.sql`](supabase/migrasi/2026-09-usulan-kegiatan.sql): Usulan kegiatan (tahap L6b) — Musyawarah Ambalan dan 10 kegiatan lain. Memperluas `public.agenda.jenis` dengan 8 nilai baru; tabel baru `public.kegiatan_usulan`, nilai `'musyawarah'` dan `'kegiatan'` pada `notifikasi.jenis`, fungsi `sg_kegiatan_usul(jenis, ...)`, `sg_kegiatan_tinjau(...)`, `sg_kegiatan_ping(id)`, `sigarda.kegiatan_judul_bawaan(jenis)`, `sigarda.kegiatan_bulan_tanggal(tahunAjaran, bulan)`, `sigarda.pembina_saja()`, `sigarda.pradana_atau_pradani()`, `sigarda.musyawarah_pengingat()`, `sigarda.kegiatan_pengingat()`, dan memperbarui `sg_agenda_simpan`, `sg_cadangan_admin()` (kini ikut mengekspor `agenda` dan `kegiatan_usulan`), serta `sigarda.notif_pengingat()`. Jalankan **setelah** `2026-09-agenda.sql` (bila belum, berhenti dengan pesan yang menuntun). Edge Function **tidak berubah**. Tidak menghapus data; aman diulang. Jalankan sebelum `git push` (menu Agenda memanggil fungsi ini).

- [`2026-09-berkas-garuda.sql`](supabase/migrasi/2026-09-berkas-garuda.sql): Berkas Calon Garuda (tahap L7). Tabel baru `public.garuda_berkas_token` (RLS tanpa kebijakan, hanya lewat fungsi), fungsi `sg_garuda_berkas_baca(peserta_id)`, `sg_garuda_token_buat(peserta_id)`, `sg_garuda_token_cabut(peserta_id)` (Pembina dan Admin), `sg_garuda_token_baca(token)` (dapat dipanggil tanpa login), dan `sigarda.garuda_berkas_json(peserta_id)`. Jalankan **setelah** `2026-09-usulan-kegiatan.sql` (bila belum, berhenti dengan pesan yang menuntun). Edge Function **tidak berubah**. Tidak menghapus data; aman diulang. Jalankan sebelum `git push` (tombol "Cetak / bagikan berkas" di menu Portofolio memanggil fungsi ini).

- [`2026-09-periksa-dewan.sql`](supabase/migrasi/2026-09-periksa-dewan.sql): Dewan Ambalan ikut memeriksa data. Hanya menulis ulang isi `sg_pemeriksaan_data()` dan `sg_push_ringkasan()` (tanda tangan sama): kini boleh dipanggil semua pengurus (Pembina, Dewan Ambalan, Admin), bukan hanya Pembina dan Admin. Jalankan **setelah** `2026-09-berkas-garuda.sql` (bila belum, berhenti dengan pesan yang menuntun). Edge Function **tidak berubah**. Tidak ada tabel/kolom baru; tidak menghapus data; aman diulang. Jalankan sebelum `git push` (menu Periksa Data untuk Dewan memanggil kedua fungsi ini).

- [`2026-09-indeks-fk.sql`](supabase/migrasi/2026-09-indeks-fk.sql): indeks kunci asing pada tabel besar (saran Supabase Advisor). Hanya menambah 10 indeks (`sku_progress.penguji_id`, `sku_riwayat.oleh`, `sku_penilaian.penguji_id`, `absensi_hadir.oleh`, `iuran.oleh`, `iuran_log.oleh` dan `.peserta_id`, `naik_kelas_log.oleh`, `portofolio.catatan_penguji_oleh`, `portofolio_jurnal.oleh`) agar menghapus akun tidak memindai seluruh tabel. Jalankan **setelah** `2026-09-periksa-dewan.sql` (bila belum, berhenti dengan pesan yang menuntun). Tanpa perubahan data, tabel, atau fungsi; Edge Function **tidak berubah**; aman diulang. Tidak perlu urutan khusus terhadap `git push` (kode aplikasi tidak berubah).

- [`2026-09-keepalive.sql`](supabase/migrasi/2026-09-keepalive.sql): keep-alive Supabase dari dalam database. Tabel baru `public.keepalive_konfigurasi` (RLS tanpa kebijakan) dan fungsi `sigarda.keepalive_atur/_ping/_catat/_periksa/_matikan`. Jalankan **setelah** `2026-09-indeks-fk.sql` (bila belum, berhenti dengan pesan yang menuntun). Butuh ekstensi `pg_cron` dan `pg_net` (Dashboard > Integrations). Sesudah migrasi, jalankan SATU perintah di SQL Editor (lihat bagian Keep-alive Supabase). Tidak mengubah data; Edge Function **tidak berubah**; aman diulang (konfigurasi yang sudah diisi tidak terhapus). Kode aplikasi tidak berubah.
- [`2026-09-pinsa-bina-damping.sql`](supabase/migrasi/2026-09-pinsa-bina-damping.sql): Pinsa dan Bina Damping (fase B: data dan hak; pra-uji menyusul di fase C). Kolom baru `profiles.pinsa` (Pimpinan Sangga; satu per sangga per rombel; hilang sendiri bila pindah rombel/sangga atau tidak aktif), tabel baru `public.bina_damping` (RLS tanpa kebijakan, hanya lewat fungsi; 2 Penegak berjabatan Dewan per rombel per tahun ajaran, satu orang satu rombel), fungsi `sg_bina_damping_atur/_daftar`, `sg_sangga_rombel`, `sg_sangga_atur`, `sg_pendampingan_saya`, dan penulisan ulang `sg_cadangan_admin()` (ikut memuat `bina_damping`). Jalankan **setelah** `2026-09-keepalive.sql` (bila belum, berhenti dengan pesan yang menuntun). Tidak mengubah data; Edge Function **tidak berubah**; aman diulang.
- [`2026-09-pengukuhan-dewan.sql`](supabase/migrasi/2026-09-pengukuhan-dewan.sql): Fase A audit peraturan Kwarnas. **Pemangku Adat** menjadi jabatan tunggal Dewan Ambalan dan **ketua sidang** Dewan Kehormatan (cadangannya Pradana), sesuai Jukran Kwarnas 05/2026 Pasal 24 ayat (15) (menggantikan SK 231/2007) dan SK 176/2013; indeks unik `profil_pradana_pradani_unik` diganti dan penulisan lama "pemangku adat" dirapikan (bila ada LEBIH DARI SATU pemegang, migrasi berhenti dan meminta menyisakan satu). Tabel baru `public.pengukuhan_dewan` (nomor dan tanggal SK Ketua Kwartir Ranting, rekomendasi Ketua Mabigus opsional; AD/ART Munas 2023, ART Pasal 51 ayat (2) huruf a) dengan RLS baca-pengurus dan fungsi `sg_pengukuhan_dewan_simpan/_hapus` (Pembina dan Admin); `sg_cadangan_admin()` ditulis ulang. Jalankan **setelah** `2026-09-pengukuhan-dewan.sql`. Edge Function tidak berubah. Berkas ini juga menambah `sigarda.jabatan_tunggal`.
- [`2026-09-token-butir-lama.sql`](supabase/migrasi/2026-09-token-butir-lama.sql): mengisi **token QR dan kode verifikasi** untuk butir SKU yang sudah lulus sebelum kolom `verifikasi_token` ada (gejala: Kartu Kemajuan SKU hanya menampilkan kode `VRF-...` tanpa gambar QR, sedangkan QR pada Surat Tanda Lulus tetap muncul karena tokennya terpisah). Token dan kode yang sudah ada tidak diubah, status/nilai/penguji tidak berubah, butir alumni ikut diisi (pemicu penolak peserta tak aktif dimatikan hanya selama pengisian, dalam satu transaksi), tanpa notifikasi baru. Aman diulang. Jalankan **setelah** `2026-09-keepalive.sql`. Edge Function tidak berubah.
- [`2026-09-pra-uji.sql`](supabase/migrasi/2026-09-pra-uji.sql): **Fase C: mesin pra-uji SKU berjenjang** (Pinsa, Bina Damping, lalu uji resmi Pembina; AD/ART Munas 2023 Pasal 33 ayat (6) dan 35 ayat (3)). Tabel baru `public.sku_pra_uji` (RLS baca: pemilik, penilai, pengurus; tulis hanya lewat fungsi), notifikasi jenis `pra_uji`, fungsi `sg_pra_uji_antrian/_catat/_lewati/_sakelar`, bantu `sigarda.pra_uji_*`, dan penulisan ulang `sg_sku_ajukan`, `sg_sku_batal`, `sg_sku_catat_internal`, `sg_sku_catat_rubrik_internal`, `sigarda.bisa_menguji`, `sigarda.batalkan_pengajuan_berjalan`, `sigarda.notif_pengingat`, dan `sg_cadangan_admin()` (memuat `sku_pra_uji`). **Sakelar bawaan MATI** (pengaturan `pra_uji.aktif`): selama mati, perilaku lama tetap dan Dewan Ambalan masih dapat menguji. Pembina/Admin menghidupkannya dengan `sg_pra_uji_sakelar(true)` (tombolnya ada di menu **Pra-uji**, Fase D); saat hidup, uji resmi hanya Pembina dan pengajuan Penegak lebih dulu melewati pra-uji. Jalankan **setelah** `2026-09-pengukuhan-dewan.sql` dan `2026-09-pinsa-bina-damping.sql` (bila belum, berhenti dengan pesan yang menuntun). Tidak mengubah data; Edge Function **tidak berubah** (tidak perlu deploy ulang); aman diulang.

**Memeriksa pemasangan.** Sesudah menjalankan migrasi dan men-deploy Edge Function, jalankan [`supabase/demo/periksa_pemasangan.sql`](supabase/demo/periksa_pemasangan.sql) di SQL Editor (hanya membaca; aman diulang). Hasilnya ringkasan per kategori (tabel, kolom, batasan, indeks, kebijakan akses, pemicu, fungsi) lalu daftar yang bermasalah:
`KURANG` (belum ada, migrasi belum dijalankan), `BEDA` (ada tetapi isi fungsi bukan versi terbaru, jalankan ulang migrasi yang menimpanya), `HAK BEDA` atau `RLS BEDA`; ditambah pemeriksaan lingkungan notifikasi (pg_net, pg_cron, jadwal pengingat, konfigurasi push). Semua OK = database mutakhir.
**Bila notifikasi push tidak sampai ke HP** (tombol uji berkata "Belum ada laporan dari server push"), jalankan [`supabase/demo/periksa_push.sql`](supabase/demo/periksa_push.sql) sesudah menekan tombol uji: menampilkan konfigurasi (tanpa rahasia), perangkat terdaftar, status notifikasi uji, dan **jawaban HTTP terbaru dari Edge Function** (`net._http_response`) beserta petunjuk membacanya (401 "Missing authorization header" = Verify JWT masih menyala; 401 "Tidak diizinkan" = rahasia berbeda; 404 = fungsi belum di-deploy atau nama salah; 500 = secret VAPID belum diisi).
Edge Function tidak dapat diperiksa dari SQL: barisnya bertanda PERIKSA MANUAL (Dashboard > Edge Functions: waktu deploy terakhir). Berkas ini dibuat otomatis dari skema terbaru (`npm run periksa`, ulangi tiap `inti.sql` berubah; pengujian `periksa-pemasangan` gagal bila usang).

Urutan pembaruan: jalankan migrasi lebih dulu (aplikasi lama tetap berjalan), lalu `git push` untuk kode baru.

**Catatan rilis otomatis.** Setiap pull request mendapat satu komentar "Catatan rilis (otomatis)" (`.github/workflows/catatan-rilis.yml`) yang mendaftar migrasi SQL baru (berurutan menurut daftar di atas), Edge Function yang berubah, dan peringatan (mis. skema berubah tanpa migrasi, migrasi lama diubah, migrasi belum tercantum di README). Karena situs terbit otomatis saat digabung ke `main`, kerjakan daftar itu **sebelum menggabungkan**. Pratinjau lokal: `npm run catatan-rilis` (membandingkan dengan `origin/main`; `npm run catatan-rilis -- <dasar> <kepala>` untuk rentang lain). Hanya pengingat: migrasi dan deploy Edge Function tetap dikerjakan pemilik. Uji `catatan-rilis` menjaga setiap berkas `supabase/migrasi` tercantum di README.

### Uji kinerja dan beban (tahap L2)
Tiga alat, hanya membaca, untuk mengetahui seberapa cepat SIGARDA terasa di HP siswa dan seberapa dekat pemakaian mendekati batas paket gratis Supabase, SEBELUM uji coba pengguna sungguhan:

1. **`npm run profil`** — model (bukan pengukuran): membuat data sekolah penuh di Postgres lokal (PGlite), menjalankan alur masuk (`AppContext.muatSemua`) yang SUNGGUH lewat `src/lib/api.js`, mencatat permintaan dan byte per peran, lalu memperkirakan lama "beranda siap" pada beberapa jaringan (Wi-Fi, 4G, Fast 3G, Slow 3G) dan HP lambat (CPU 6x). Berguna untuk membandingkan peran dan menguji ide perbaikan dengan cepat, tanpa menyentuh Supabase. Pilihan: `--cpu=`, `--server=` (md per permintaan), `--dist=dist` (pakai build yang sudah ada), `--json=<berkas>`. Sumber: [`scripts/profil/model.mjs`](scripts/profil/model.mjs), [`scripts/profil/jaringan.mjs`](scripts/profil/jaringan.mjs) (dijaga `uji/profil-muat.mjs`).
2. **[`supabase/demo/ukur_muatan.sql`](supabase/demo/ukur_muatan.sql)** — dijalankan di SQL Editor Supabase (hanya membaca, aman diulang): ukuran sungguhan tiap tabel, ukuran database (dibanding batas 500 MB), byte JSON per baris untuk tabel besar (progres, riwayat, kehadiran, profil), dan rencana kueri (`EXPLAIN ANALYZE`) untuk memuat progres/riwayat satu Penegak dan seluruh Penegak. Menjawab: apakah indeks terpakai (bukan "Seq Scan" untuk kueri satu orang), dan berapa dekat database ke batas 500 MB.
3. **[`scripts/profil/ukur-devtools.js`](scripts/profil/ukur-devtools.js)** — tempel di konsol DevTools (F12 > Console) pada halaman SIGARDA sungguhan (produksi, atau HP lewat `chrome://inspect`): merekam permintaan NYATA ke Supabase (jumlah, lama, byte lewat kabel SUDAH terkompresi vs byte asli), sehingga laju kompresi gzip Supabase yang SEBENARNYA terlihat (bukan model). Panggil `ukurMulai('nama')` sebelum aksi (mis. masuk, kembali ke tab), diamkan sebentar, ringkasan tercetak otomatis; `ukurRingkasan()` dan `ukurCsv()` melihat semua percobaan. Baca komentar di berkas untuk langkah lengkap.

**Anggaran yang disetujui:** Penegak beranda siap ≤ 5 detik (Fast 3G) / ≤ 10 detik (Slow 3G); Pembina/Dewan/Admin ≤ 8 / ≤ 15 detik; transfer awal Penegak (aplikasi + data) ≤ 500 kB gzip; JS awal ≤ 150 kB gzip. `npm run profil` menandai ✓/✗ terhadap anggaran ini.

**Wilayah proyek Supabase memengaruhi semua angka ini** (Dashboard > Project Settings > General): jarak Bukateja ke Tokyo lebih jauh daripada ke Singapura, jadi setiap permintaan berurutan (`ambilSemua` per 1000 baris) membayar bolak-balik yang lebih mahal. Perbarui `RTT_SERVER_MS` di `scripts/profil/jaringan.mjs` bila wilayah proyek berubah.

**Uji beban dengan data berskala sekolah (tahap L2-B).** Untuk mengukur database Supabase SUNGGUHAN pada skala pemakaian nyata (bukan model):

1. **Ambil cadangan data terbaru dulu** (klik dua kali `Cadangkan-SIGARDA.bat`).
2. Jalankan [`supabase/demo/data_uji_beban.sql`](supabase/demo/data_uji_beban.sql) di SQL Editor (MENULIS, bukan hanya membaca): menambah ~850 Penegak fiktif (bawaan 700 aktif + 150 alumni, dapat diubah) beserta progres SKU dan riwayatnya. Semua bertanda jelas: NIS `88xxxx` dan nama berawalan "Uji ". Sengaja **tidak** menyentuh kehadiran/iuran (menghindari angka fiktif tercampur ke rekap keuangan sungguhan yang sedang dipakai). Hasil paling akhir menampilkan **PIN 30 akun uji** untuk login sungguhan — salin sekarang, tidak ditampilkan lagi, jangan diunggah ke GitHub.
3. Simpan daftar NIS+PIN itu di `scripts/uji-beban/akun.json` (tidak ikut git; bentuk `[{"nis":"...","pin":"..."}]`).
4. **[`scripts/uji-beban/beban.mjs`](scripts/uji-beban/beban.mjs)** mengirim banyak permintaan bersamaan ke Supabase sungguhan: `node scripts/uji-beban/beban.mjs login --n=20` (login serentak, naikkan bertahap) atau `node scripts/uji-beban/beban.mjs baca --n=300 --sesi=30` (banyak "pengguna" membaca bersamaan lewat sesi yang dipakai bergantian, mendekati beban 300–500 pengguna tanpa memboroskan batas login). Melaporkan jumlah berhasil/gagal dan latensi p50/p95/p99. **Jalankan di luar jam sekolah** (memakai kuota egress dan Auth yang sama dengan pengguna sungguhan).
5. **Sesudah selesai**, HAPUS data uji dengan [`supabase/demo/hapus_data_uji_beban.sql`](supabase/demo/hapus_data_uji_beban.sql) — **wajib** sebelum uji coba pengguna sungguhan. **Jangan** memakai `hapus_semua_akun_kecuali_admin.sql` untuk ini (skrip itu juga menghapus akun asli non-admin, mis. Pembina).

Diuji: `uji/data-uji-beban.mjs` memvalidasi rumus pembuatan data dan sisipan progres/riwayat di atas PGlite (bagian auth.users/pgcrypto tidak dapat diuji secara lokal — PGlite tidak memilikinya — jadi ikuti langkah 1 dan coba dulu dengan skala kecil bila ragu, mis. ubah `700`/`150` pada berkas SQL menjadi angka kecil untuk percobaan pertama).

## Struktur folder

```
sku-bukateja/
├── index.html  package.json  vite.config.js  tailwind.config.js  postcss.config.js
├── .env.example  .env.lokal            contoh variabel; .env.lokal untuk npm run dev:lokal
├── .github/workflows/deploy.yml        terbit otomatis ke GitHub Pages
├── scripts/buat-skema.mjs              membuat supabase/skema.sql (menyisipkan katalog butir dari src/data)
├── scripts/instrumen-ke-sql.mjs        Excel instrumen penilaian -> SQL pemuat isi (isinya sendiri TIDAK di repositori)
├── scripts/migrasi/                    penyusun berkas migrasi dari blok bermarka di supabase/sumber (bantu.mjs + contoh 2026-09-iuran.mjs)
├── uji/                                pengujian otomatis (npm run uji), Postgres sungguhan lewat PGlite
├── CLAUDE.md                           panduan singkat untuk asisten pemrograman (aturan kerja, arsitektur, konvensi)
├── supabase/
│   ├── skema.sql                       (dibuat otomatis) tabel, RLS, fungsi sg_*, katalog. Dijalankan di SQL Editor
│   ├── sumber/*.sql                    sumber skema tanpa katalog, 33 berkas bernomor per modul (EDIT DI SINI, lalu npm run skema; peta di sumber/README.md)
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
    │   ├── skuLogic.js  absensiLogic.js  portofolioLogic.js  materiLogic.js  sidangLogic.js  raportLogic.js  instrumenLogic.js  iuranLogic.js  sesiLogic.js  verifikasiLogic.js  pinLogic.js  importAnggota.js  cariNama.js
    │   └── exportXlsx.js  exportLaporan.js  format.js
    ├── lokal/                          backend lokal: klien tiruan di atas PGlite, data contoh (bukan produksi)
    ├── context/AppContext.jsx          state global (salinan data sesuai izin) dan semua aksi
    ├── hooks/useAbsensiPeriode.js      memuat kehadiran semester yang dipilih saat filter periode diubah
    ├── hooks/useIuran.js               memuat iuran per tanggal, per rentang (semester), dan ringkasan penilaian; dimuat ulang saat iuran berubah
    ├── components/                     Layout, Footer, Login, FormGantiPin, ImportAnggotaModal, SkuChecklist, PratinjauDrive, BeritaAcaraSidang, CetakRaport, KodeQr, HalamanVerifikasi, RincianPenilaian, JadwalUjianBersama, ...
    └── pages/                          PesertaBeranda, PesertaSku, Materi, KelolaMateri, Absensi, Sidang, Raport, SesiUjian, ResetPin, AdminAnggota, ...
```

## Pengujian

Skema SQL dan logika Edge Function dijalankan pada Postgres sungguhan (PGlite) dengan klien tiruan yang meniru peran Supabase, RLS, dan batas 1000 baris.
Yang diuji: siapa boleh membaca apa, penulisan langsung ditolak untuk semua peran, semua fungsi `sg_*` (aturan SKU, absensi, portofolio, materi, anggota),
hak reset PIN, pembatasan login, kewajiban ganti PIN, dan pemetaan data ke bentuk yang dipakai halaman.
Jalankan semuanya dengan `npm run uji` (atau sebagian: `npm run uji -- iuran api`; `PENUH=40` menampilkan 40 baris terakhir keluaran). Berkas pengujian ada di [`uji/`](uji); pengujian migrasi memakai skema lama yang disimpan di [`supabase/riwayat/`](supabase/riwayat) (`git:<commit>` = snapshot skema pada commit itu, dibuat dengan `node scripts/simpan-skema-lama.mjs <hash>`; tidak membaca riwayat git; mis. `migrasi-gudep` memakai `git:709a260`, commit tepat sebelum migrasi data gudep). Pengujian membandingkan isi fungsi dengan md5 setelah akhir baris disamakan (LF), sehingga hasilnya sama di checkout Windows (CRLF). Pengujian `instrumen` dilewati kecuali `ISI_INSTRUMEN` menunjuk berkas SQL isi instrumen (rahasia, tidak ada di repositori).

**Pengujian otomatis di GitHub (CI).** `.github/workflows/uji.yml` menjalankan `npm run build` dan seluruh pengujian pada setiap pull request dan setiap push ke `main`, dibagi 4 mesin paralel (`npm run uji -- --shard=i/4`, lihat `scripts/uji-shard.mjs`) agar total waktu sekitar seperempat. Hasilnya tampil sebagai centang hijau atau silang merah di halaman pull request; tanpa rahasia dan tanpa menyentuh Supabase asli. Untuk mewajibkan hasil hijau sebelum penggabungan: **Settings > Branches > Add branch protection rule** untuk `main`, centang **Require status checks to pass** dan pilih `build` serta empat `uji`. Pengujian tetap dapat dijalankan lokal; sesuai kebiasaan proyek, saat iterasi cukup uji yang terkait, dan uji penuh sekali sebelum commit.
Yang **tidak** dapat diuji tanpa proyek Supabase sungguhan: perilaku GoTrue (mis. penerimaan email `.invalid`), PostgREST, dan runtime Deno. Gunakan "Uji cepat" di atas setelah pemasangan.

### Data demo untuk pengujian di Supabase
[`supabase/demo/data_demo_penegak.sql`](supabase/demo/data_demo_penegak.sql) membuat 8 Penegak demo (NIS `990001`-`990008`, PIN `352817`, langsung bisa masuk) dengan kemajuan SKU yang beragam:
Bantara penuh, Bantara dan Laksana penuh, Laksana sebagian, butir menunggu/diuji/diulang, butir agama lulus sebagian (menguji blokir "Layak" pada Sidang), Calon Garuda dengan portofolio, dan Khonghucu.
Jalankan di SQL Editor **sesudah semua migrasi** (skrip ini mengisi kolom token QR); aman diulang (akun tidak digandakan, data SKU demo direset). Tidak menyentuh anggota asli. Setelah selesai menguji, jalankan
[`supabase/demo/hapus_data_demo.sql`](supabase/demo/hapus_data_demo.sql), yang menghapus hanya akun ber-NIS `9900xx` dengan nama berawalan "Demo " beserta seluruh datanya.
Untuk **mengosongkan semua akun sebelum dipakai pengguna sungguhan** (kecuali Admin Gudep), jalankan [`supabase/demo/pratinjau_hapus_semua_akun.sql`](supabase/demo/pratinjau_hapus_semua_akun.sql) (hanya membaca; menampilkan apa yang dipertahankan dan dihapus), lalu
[`supabase/demo/hapus_semua_akun_kecuali_admin.sql`](supabase/demo/hapus_semua_akun_kecuali_admin.sql) (bawaannya menolak berjalan sampai `v_konfirmasi` diubah menjadi `'YA'`; satu pernyataan, semua atau tidak sama sekali; struktur tidak disentuh; dijaga pengujian `hapus-akun`). Buat cadangan lebih dulu.
Skrip demo membuat akun langsung di `auth.users`; bila gagal di proyek Anda, buat 8 akun itu lewat Anggota > Import Excel lalu jalankan skrip lagi (akun yang sudah ada dilewati, datanya tetap diisi).

## Menyesuaikan untuk Gudep

1. **Identitas dan tanda tangan**: isi di menu **Data Gudep** (Admin), tidak perlu mengubah kode; Pradana dan Pradani lewat jabatan anggota Dewan Ambalan di menu **Anggota**. `GUDEP_BAWAAN` di `src/config.js` hanya nilai awal sebelum data disimpan.
2. **Butir SKU**: `src/data/skuData.js` sudah berisi butir resmi. Jangan mengubah `id` setelah ada data progres. Setelah mengubah data butir/portofolio, jalankan `npm run skema` dan jalankan ulang bagian katalog di database.
3. **Anggota**: tambah lewat menu Anggota (Admin). Isi agama dengan benar karena menentukan sub-butir butir 1.
4. **Logo**: lambang SIGARDA di `src/components/LogoMark.jsx` (header, menu, halaman masuk); logo kop surat di `src/assets/logo/` (lihat bagian Data Gudep). **Warna**: `tailwind.config.js` (`pramuka` = cokelat, `emas` = aksen).

## Mencetak dan PDF

Menu Cetak menampilkan pratinjau. Klik "Cetak atau simpan PDF", lalu pada dialog cetak browser pilih "Simpan sebagai PDF".
Kartu SKU dicetak A4 potret, Surat Tanda Lulus A4 lanskap. Aktifkan opsi "Grafik latar belakang" bila warna tidak muncul.
