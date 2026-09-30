// Definisi gambar panduan: layar mana yang dipotret, akun contoh mana, langkah menuju layar itu, dan penunjuk bernomor (teks keterangan + cara menemukan elemennya).
// Sumber kebenaran teks gambar (judul, alt, keterangan). Ubah teks di sini lalu jalankan `node scripts/panduan/ambil.mjs --teks`; ubah tata letak/elemen lalu ambil ulang gambarnya.
// Cara membaca cara menemukan elemen (`cari`, `layar`, `ponsel`, `klik`, `gulir`): lihat pembantu di ambil.mjs (selector, label, teks, tag, mengandung, dalam, nth, naik, pad).
// Akun contoh mode lokal: 10231 (Penegak Ahmad Fauzi), 10008 (Penegak berjabatan Dewan), pembina, admin. Semua data adalah data contoh.
// Awalan id = peran panduan: umum, penegak, dewan, pembina, admin. Setiap gambar dipotret dua kali: layar (laptop/PC/tablet) dan ponsel.
// Opsi `data: 'panduan'` = memakai basis data lokal tambahan ?data=panduan (src/lokal/dataPanduan.js: agenda, materi, TKK, pelantikan, Saka, sesi ujian, Bina Damping,
// Pinsa tertugas, pra-uji hidup dengan satu pengajuan). Tanpa opsi itu gambar memakai data contoh bawaan, di mana halaman-halaman tersebut masih kosong.
// Opsi `tinggi: { ponsel: N }` = tinggi gambar ponsel (piksel) untuk halaman panjang; `dialog: true` = memotret jendela ajakan data diri (bukan menutupnya).

const MENU = 'nav[aria-label="Menu utama"]'; // di laptop = bilah samping, di ponsel = menu bawah (hanya yang terlihat yang dipakai)

export const DEFINISI = [
  // ---------- Umum ----------
  {
    id: 'umum-menu',
    akun: '10231',
    judul: 'Mengenal tampilan SIGARDA',
    alt: 'Halaman Beranda dengan menu, tombol Notifikasi, tombol Bantuan, dan nama akun diberi nomor.',
    penanda: [
      { teks: 'Menu utama. Di laptop, PC, dan tablet menu ada di bilah kiri; di ponsel ada di baris paling bawah dan dapat digeser ke kiri atau kanan bila menunya banyak.', layar: { selector: 'aside[aria-label="Menu samping"]', pad: 0 }, ponsel: { selector: MENU, pad: 0 } },
      { teks: 'Notifikasi (ikon lonceng): kabar dari aplikasi, misalnya pengajuan uji, jadwal ujian, dan pengingat.', cari: { teks: 'Notifikasi', dalam: MENU, naik: 1 } },
      { teks: 'Bantuan (tanda tanya): panduan ini. Tersedia untuk semua peran.', cari: { teks: 'Bantuan', dalam: MENU, naik: 1 } },
      { teks: 'Akun Anda. Sentuh nama untuk mengganti PIN atau keluar dari akun.', cari: { label: 'Akun Ahmad Fauzi' } },
    ],
  },
  {
    id: 'umum-akun',
    akun: '10231',
    judul: 'Menu akun: ganti PIN dan keluar',
    alt: 'Menu akun terbuka menampilkan Pengaturan akun (ganti PIN) dan Keluar.',
    langkah: [{ klik: { label: 'Akun Ahmad Fauzi' } }],
    penanda: [
      { teks: 'Pengaturan akun: ganti PIN dan isi nomor WhatsApp.', cari: { teks: 'Pengaturan akun', mengandung: true, tag: 'button' } },
      { teks: 'Keluar: akhiri sesi di perangkat ini. Selalu tekan Keluar bila memakai HP atau komputer bersama.', cari: { teks: 'Keluar', tag: 'button' } },
    ],
  },
  // ---------- Penegak ----------
  {
    id: 'penegak-beranda',
    akun: '10231',
    tinggi: { ponsel: 1100 },
    judul: 'Beranda Penegak',
    alt: 'Beranda Penegak menampilkan lingkaran progres, kartu SKU Bantara, kehadiran latihan Jumat, dan iuran.',
    penanda: [
      { teks: 'Ringkasan Anda: nama, kelas, sangga, tingkat, dan lingkaran persen progres SKU.', cari: { teks: 'Selamat datang,', induk: 'section' } },
      { teks: 'Kartu SKU Bantara dan Laksana: jumlah butir lulus dan yang sedang diproses. Tombol "Lihat butir" membuka daftar lengkapnya.', cari: { teks: 'SKU Penegak Bantara', induk: '.panel' } },
      { teks: 'Kehadiran latihan Jumat pada semester ini. Batas minimal 75% dipakai sebagai dasar penilaian SKU tentang kehadiran.', cari: { teks: 'Kehadiran latihan Jumat', induk: '.panel' } },
      { teks: 'Iuran bumbung kepramukaan: total gudep dan iuran Anda sendiri.', cari: { teks: 'Iuran bumbung kepramukaan', induk: '.panel' } },
    ],
  },
  {
    id: 'penegak-sku',
    akun: '10231',
    tinggi: { ponsel: 1000 },
    judul: 'Poin SKU',
    alt: 'Halaman Poin SKU dengan tab Bantara dan Laksana, progres, peta butir, penyaring status, dan daftar butir.',
    langkah: [{ klikMenu: 'Poin SKU' }],
    penanda: [
      { teks: 'Tab tingkat: Bantara dan Laksana. Laksana terkunci sampai seluruh butir Bantara lulus.', cari: { teks: 'Bantara', tag: 'button', dalam: 'main', naik: 1 } },
      { teks: 'Progres: jumlah butir lulus, dalam proses, dan belum.', cari: { teks: 'butir lulus', mengandung: true, dalam: 'main', induk: '.panel' } },
      { teks: 'Peta butir: kotak bernomor tiap butir. Hijau = lulus, kuning = dalam proses, krem = belum. Sentuh untuk melompat ke butirnya.', cari: { teks: 'Peta 23 butir SKU Bantara', mengandung: true, induk: '.panel' } },
      { teks: 'Penyaring: tampilkan semua butir, yang belum, yang sedang diproses, atau yang lulus.', cari: { teks: 'Semua', tag: 'button', dalam: 'main', naik: 1 } },
    ],
  },
  {
    id: 'penegak-absensi',
    akun: '10231',
    tinggi: { ponsel: 1100 },
    judul: 'Absensi latihan Jumat',
    alt: 'Halaman Absensi dengan pilihan tahun ajaran dan semester, ringkasan hadir, izin, sakit, alpa, dan riwayat pertemuan.',
    langkah: [{ klikMenu: 'Absensi' }],
    penanda: [
      { teks: 'Pilih tahun ajaran dan semester yang ingin dilihat.', cari: { selector: 'main select', naik: 1, nth: 0, pad: 4 } },
      { teks: 'Ringkasan: jumlah hadir, izin, sakit, alpa, dan persentase kehadiran.', cari: { teks: 'Kehadiran', dalam: 'main', nth: 0, induk: '.panel' } },
      { teks: 'Riwayat tiap pertemuan Jumat dan status kehadiran Anda.', cari: { selector: 'main ul.panel', nth: 0, pad: 2 } },
    ],
  },
  {
    id: 'penegak-iuran',
    akun: '10231',
    tinggi: { ponsel: 1100 },
    judul: 'Iuran bumbung kepramukaan',
    alt: 'Halaman Iuran dengan tombol Rekap, ringkasan gudep, dan iuran saya per pertemuan.',
    langkah: [{ klikMenu: 'Iuran' }],
    penanda: [
      { teks: 'Rekap: pilih tahun ajaran dan semester untuk melihat ringkasan iuran gudep.', cari: { teks: 'Rekap', tag: 'button', dalam: 'main' } },
      { teks: 'Ringkasan gudep: total iuran, jumlah pertemuan, dan rata-rata per pertemuan.', cari: { teks: 'Total gudep', mengandung: true, induk: '.panel' } },
      { teks: 'Iuran saya: riwayat beriuran tiap Jumat. Menyimpan iuran secara rutin dinilai pada butir SKU tentang iuran.', cari: { teks: 'Iuran saya', induk: '.panel' } },
    ],
  },
  {
    id: 'penegak-datadiri',
    akun: '10231',
    dialog: true,
    judul: 'Melengkapi data diri',
    alt: 'Jendela Lengkapi data dirimu dengan isian nomor WhatsApp, tanggal lahir, alamat, tombol Simpan data diri, dan Isi nanti.',
    penanda: [
      { teks: 'Yang masih perlu dilengkapi disebutkan di sini. Boleh dilewati; akan ditanyakan lagi lain kali sampai lengkap.', cari: { teks: 'Yang masih perlu dilengkapi', mengandung: true, dalam: '[role=dialog]' } },
      { teks: 'Nomor WhatsApp: dipakai Pembina atau Dewan Ambalan untuk menghubungi Anda bila diperlukan.', cari: { teks: 'Nomor WhatsApp', dalam: '[role=dialog]', naik: 1 } },
      { teks: 'Jenis kelamin dan agama yang sudah tercatat tidak dapat diubah sendiri; hubungi Pembina atau Admin bila keliru.', cari: { teks: 'Jenis kelamin', dalam: '[role=dialog]', naik: 1 } },
    ],
  },
  // ---------- Dewan Ambalan (Penegak berjabatan, akun 10008) ----------
  {
    id: 'dewan-tampilan',
    akun: '10008',
    judul: 'Berpindah antara tampilan Penegak dan Dewan',
    alt: 'Beranda dengan bilah pemilih tampilan Penegak dan Dewan di bagian atas.',
    penanda: [
      { teks: 'Bilah pilihan tampilan. Hanya muncul bagi Penegak yang diberi jabatan Dewan Ambalan oleh Pembina atau Admin.', cari: { label: 'Tampilan akun' } },
      { teks: 'Tampilan Penegak: menu Anda sebagai Penegak biasa (SKU sendiri, absensi, iuran).', cari: { teks: 'Penegak', tag: 'button', dalam: '[aria-label="Tampilan akun"]' } },
      { teks: 'Tampilan Dewan: menu untuk mengurus ambalan (Dashboard, Absensi, Iuran, Tindak Lanjut, dan lainnya). Pilihan ini diingat per akun.', cari: { teks: 'Dewan', tag: 'button', dalam: '[aria-label="Tampilan akun"]' } },
    ],
  },
  {
    id: 'dewan-dashboard',
    akun: '10008',
    judul: 'Dashboard Dewan Ambalan',
    alt: 'Dashboard Dewan Ambalan dengan kartu antrian pengujian dan progres per rombel.',
    langkah: [{ klik: { teks: 'Dewan', tag: 'button', dalam: '[aria-label="Tampilan akun"]' } }, { tutupDialog: true }, { klikMenu: 'Dashboard' }],
    penanda: [
      { teks: 'Pilihan tampilan: pastikan di posisi Dewan.', cari: { label: 'Tampilan akun' } },
      { teks: 'Antrian pengujian SKU yang menunggu. Tombol "Buka antrian" membuka daftar pengajuan Penegak yang perlu dinilai.', cari: { teks: 'Antrian pengujian SKU', induk: 'div.rounded-lg, section' } },
      { teks: 'Progres tiap rombel: rata-rata SKU Bantara dan Laksana, serta jumlah Penegak yang menunggu uji.', cari: { teks: 'Progres per rombel', naik: 1 } },
    ],
  },
  {
    id: 'dewan-absensi',
    akun: '10008',
    tinggi: { ponsel: 1500 },
    judul: 'Rekap absensi latihan Jumat',
    alt: 'Halaman Absensi tampilan Dewan dengan tab Rekap dan Catat absensi, penyaring, ringkasan kehadiran, dan tabel per Penegak.',
    langkah: [{ klik: { teks: 'Dewan', tag: 'button', dalam: '[aria-label="Tampilan akun"]' } }, { tutupDialog: true }, { klikMenu: 'Absensi' }],
    penanda: [
      { teks: 'Tab Rekap (melihat hasil) dan Catat absensi (mengisi kehadiran tiap Jumat).', cari: { teks: 'Rekap', tag: 'button', dalam: 'main', naik: 1 } },
      { teks: 'Unduh Excel: rekap kehadiran untuk laporan atau arsip.', cari: { teks: 'Unduh Excel (.xlsx)', tag: 'button' } },
      { teks: 'Ringkasan: jumlah pertemuan, rata-rata kehadiran, dan berapa Penegak yang di atas atau di bawah batas 75%.', cari: { teks: 'Pertemuan terlaksana', mengandung: true, induk: '.panel' } },
      { teks: 'Kehadiran tiap Penegak (H = hadir, I = izin, S = sakit, A = alpa). Baris merah muda = kehadiran di bawah batas minimal.', cari: { selector: 'main table', nth: 0, pad: 2 } },
    ],
  },
  {
    id: 'dewan-tindaklanjut',
    akun: '10008',
    judul: 'Tindak Lanjut: Penegak yang lama tidak bergerak',
    alt: 'Halaman Tindak Lanjut dengan daftar Penegak dan tombol Buka WhatsApp di tiap baris.',
    langkah: [{ klik: { teks: 'Dewan', tag: 'button', dalam: '[aria-label="Tampilan akun"]' } }, { tutupDialog: true }, { klikMenu: 'Tindak Lanjut' }],
    penanda: [
      { teks: 'Penjelasan: daftar Penegak yang sudah lebih dari 8 hari tidak ada pergerakan (SKU, absensi, atau iuran).', cari: { teks: 'hal perlu tindak lanjut', mengandung: true } },
      { teks: 'Satu baris = satu Penegak, lengkap dengan kelas, sangga, dan alasan (mis. iuran, sudah berapa hari).', cari: { selector: 'main li', nth: 0 } },
      { teks: 'Buka WhatsApp: mengingatkan Penegak lewat pesan siap kirim. Anda memilih sendiri kontaknya dan menekan kirim.', cari: { teks: 'Buka WhatsApp', nth: 0 } },
    ],
  },
  // ---------- Pembina ----------
  {
    id: 'pembina-dashboard',
    akun: 'pembina',
    judul: 'Dashboard Pembina',
    alt: 'Dashboard Pembina dengan kartu antrian pengujian, pilihan tampilkan semua rombel, dan kartu progres tiap rombel.',
    tinggi: { ponsel: 1100 },
    langkah: [{ klikMenu: 'Dashboard' }],
    penanda: [
      { teks: 'Antrian pengujian: jumlah pengajuan yang menunggu Anda. Tombol "Buka antrian" membuka daftarnya.', cari: { teks: 'Antrian pengujian SKU', induk: 'div.rounded-lg, section' } },
      { teks: 'Bawaannya hanya rombel yang Anda tangani tahun ajaran ini. Centang untuk menampilkan semua rombel.', cari: { teks: 'Tampilkan semua rombel', naik: 0 } },
      { teks: 'Kartu tiap rombel: siapa pengujinya, rata-rata progres SKU, dan berapa yang menunggu atau sedang diuji.', cari: { teks: 'X-01', induk: 'li' } },
    ],
  },
  {
    id: 'pembina-antrian',
    akun: 'pembina',
    judul: 'Antrian pengujian SKU',
    alt: 'Halaman Antrian pengujian dengan daftar pengajuan Penegak, butir SKU, tanggal, dan tombol Nilai, Alihkan, Lihat peserta.',
    langkah: [{ klikMenu: 'Antrian' }],
    penanda: [
      { teks: 'Bawaannya hanya pengajuan yang ditujukan kepada Anda atau antrian rombel Anda. Centang untuk melihat semua penguji.', cari: { teks: 'Tampilkan semua penguji', naik: 1 } },
      { teks: 'Satu pengajuan: nama Penegak, butir SKU yang diuji, status "Menunggu uji", dan tanggal pengujian.', cari: { selector: 'main li', nth: 0 } },
      { teks: 'Nilai: membuka lembar penilaian butir itu. Hasil resmi dicatat dengan PIN Anda.', cari: { teks: 'Nilai', tag: 'button', nth: 0 } },
      { teks: 'Alihkan: memindahkan pengajuan ke penguji lain yang berhak. Lihat peserta: membuka halaman SKU Penegak itu.', cari: { teks: 'Alihkan', tag: 'button', nth: 0 } },
    ],
  },
  {
    id: 'pembina-peserta',
    akun: 'pembina',
    judul: 'Peserta: mencari dan melihat Penegak',
    alt: 'Halaman Peserta dengan kotak cari, penyaring rombel dan status, serta daftar Penegak beserta progres SKU-nya.',
    penanda: [
      { teks: 'Cari nama atau NIS.', cari: { selector: 'main input', nth: 0, pad: 3 } },
      { teks: 'Penyaring: rombel saya, status (aktif, nonaktif, alumni), sangga, kelas, peran, jenis kelamin, dan agama.', cari: { teks: 'Hanya rombel saya', mengandung: true, naik: 1 } },
      { teks: 'Satu Penegak: kelas, sangga, agama, tingkat, dan dua batang progres (Bantara dan Laksana). Ketuk untuk membuka detail SKU-nya.', cari: { teks: 'Ahmad Fauzi', dalam: 'main', induk: 'li, a, button' } },
    ],
    langkah: [{ klikMenu: 'Peserta' }],
  },
  {
    id: 'pembina-penugasan',
    akun: 'pembina',
    tinggi: { ponsel: 1150 },
    judul: 'Penugasan penguji per rombel',
    alt: 'Halaman Penugasan penguji dengan pilihan tahun ajaran, tab kelas, dan tabel penguji per rombel yang dicentang.',
    langkah: [{ klikMenu: 'Penugasan' }],
    penanda: [
      { teks: 'Pilih tahun ajaran. Tombol "Salin dari ..." di sebelahnya menyalin penugasan tahun sebelumnya.', cari: { teks: 'Tahun ajaran', induk: 'div', naik: 0, pad: 4, nth: 0 } },
      { teks: 'Peringatan: rombel berisi Penegak tetapi belum punya penguji. Rombel itu memakai aturan bawaan sampai ditugaskan.', cari: { teks: 'belum punya penguji', mengandung: true, naik: 1 } },
      { teks: 'Tab kelas X, XI, dan XII.', cari: { teks: 'Kelas X', tag: 'button', naik: 1 } },
      { teks: 'Tabel penugasan: ketuk sel untuk menugaskan atau mencabut penguji pada rombel itu. Baris bawah menunjukkan jumlah Penegak dan penguji per rombel.', cari: { selector: 'main table', nth: 0, pad: 2 } },
    ],
  },
  {
    id: 'pembina-pengurus',
    akun: 'pembina',
    judul: 'Kepengurusan Dewan Ambalan',
    alt: 'Halaman Kepengurusan dengan daftar pengurus saat ini, tombol Tambah pengurus, dan ganti kepengurusan lewat berkas Excel.',
    tinggi: { ponsel: 1250 },
    langkah: [{ klikMenu: 'Pengurus' }],
    penanda: [
      { teks: 'Tambah pengurus: memberi jabatan Dewan (mis. Pradana, Sekretaris) kepada seorang Penegak aktif.', cari: { teks: 'Tambah pengurus', tag: 'button' } },
      { teks: 'Pengurus saat ini. Pensil mengubah jabatan, tempat sampah mencabutnya. Jabatan dicabut otomatis bila Penegak nonaktif atau alumni.', cari: { teks: 'Kepengurusan saat ini', mengandung: true, naik: 2 } },
      { teks: 'Setelah Musyawarah Ambalan: unduh berkas Excel berisi pengurus saat ini, ubah, lalu unggah lagi untuk mengganti seluruh kepengurusan sekaligus.', cari: { teks: 'Ganti kepengurusan lewat berkas Excel', induk: 'div.rounded-lg, section' } },
    ],
  },
  {
    id: 'pembina-periksa',
    akun: 'pembina',
    judul: 'Periksa Data',
    alt: 'Halaman Periksa Data dengan kartu kategori masalah, tombol Perbaiki, dan tautan Lihat baris.',
    langkah: [{ klikMenu: 'Periksa Data' }],
    penanda: [
      { teks: 'Ringkasan jumlah hal yang perlu diperiksa.', cari: { teks: 'hal perlu diperiksa', mengandung: true } },
      { teks: 'Kartu bercentang hijau = tidak ada masalah; kartu berjam = ada yang perlu dilengkapi, lengkap dengan jumlahnya.', cari: { teks: 'Belum ada Nomor Tanda Anggota (NTA)', induk: '.panel, div.rounded-lg, section, article' } },
      { teks: 'Lihat baris: menampilkan siapa saja yang bermasalah. Perbaiki: pintasan ke menu yang tepat untuk memperbaikinya.', cari: { teks: 'Lihat 10 baris', nth: 0 } },
    ],
  },
  {
    id: 'pembina-agenda',
    akun: 'pembina',
    data: 'panduan',
    tinggi: { ponsel: 1000 },
    judul: 'Agenda kegiatan tahunan',
    alt: 'Halaman Agenda dengan tombol Tambah kegiatan dan daftar kegiatan lengkap dengan hitung mundur, tombol ubah dan hapus.',
    langkah: [{ klikMenu: 'Agenda' }],
    penanda: [
      { teks: 'Tambah kegiatan: Musyawarah Ambalan, pelantikan, perkemahan, dan kegiatan lain. Pengingat H-30, H-7, dan H-1 dikirim otomatis kepada pengurus dan Penegak yang terkait.', cari: { teks: '+ Tambah kegiatan', tag: 'button' } },
      { teks: 'Satu kegiatan: judul, jenis, tanggal, tahun ajaran, jumlah Penegak terkait, dan keterangan. Urutannya dari yang paling dekat.', cari: { selector: 'main li', nth: 0 } },
      { teks: 'Hitung mundur (mis. H-7 = tujuh hari lagi). Kegiatan yang sudah lewat tampil pudar.', cari: { selector: 'main li span.rounded-full', nth: 0 } },
      { teks: 'Pensil mengubah kegiatan dan tempat sampah di sebelahnya menghapusnya. Hanya Pembina dan Admin Gudep yang dapat mengubah agenda.', cari: { selector: 'main li button[title="Ubah"]', nth: 0, pad: 7 } },
    ],
  },
  {
    id: 'pembina-kelolaberanda',
    akun: 'pembina',
    tinggi: { ponsel: 1000 },
    judul: 'Kelola Beranda (halaman muka gudep)',
    alt: 'Halaman Kelola Beranda dengan tab Kontak, Berita, Prestasi, Galeri, Media Sosial, Pertanyaan Umum, dan formulir kontak.',
    langkah: [{ klikMenu: 'Kelola Beranda' }],
    penanda: [
      { teks: 'Lihat beranda publik: pratinjau halaman muka yang dapat dilihat siapa saja tanpa masuk.', cari: { teks: 'Lihat beranda publik', tag: 'a' } },
      { teks: 'Tab isi: Kontak, Berita, Prestasi, Galeri, Media Sosial, dan Pertanyaan Umum. Berita, Prestasi, dan Galeri dari Dewan menunggu persetujuan Pembina sebelum terbit.', cari: { teks: 'Kontak', tag: 'button', dalam: 'main', naik: 1 } },
      { teks: 'Formulir tab yang dipilih. Semua tautan harus diawali https://.', cari: { teks: 'Kontak dan jadwal', induk: 'div.rounded-lg, section' } },
    ],
  },
  // ---------- Admin Gudep ----------
  {
    id: 'admin-dashboard',
    akun: 'admin',
    tinggi: { ponsel: 1100 },
    judul: 'Dashboard Admin Gudep',
    alt: 'Dashboard Admin dengan ringkasan jumlah anggota, absensi, dan kelulusan SKU.',
    langkah: [{ klikMenu: 'Dashboard' }],
    penanda: [
      { teks: 'Ringkasan jumlah anggota: Penegak, Calon Bantara, Calon Laksana, dan lainnya.', cari: { teks: 'Anggota penegak', mengandung: true, induk: 'div.rounded-lg, section, .panel' } },
      { teks: 'Ringkasan kehadiran latihan Jumat dan kelulusan SKU seluruh gudep.', cari: { teks: 'Absensi latihan Jumat', dalam: 'main', induk: 'section' } },
    ],
  },
  {
    id: 'admin-anggota',
    akun: 'admin',
    tinggi: { ponsel: 1150 },
    judul: 'Data anggota',
    alt: 'Halaman Data anggota dengan tab Penegak, Dewan, Pembina, Admin Gudep, tombol Import Excel, Tambah anggota, dan daftar anggota.',
    langkah: [{ klikMenu: 'Anggota' }],
    penanda: [
      { teks: 'Unduh template Excel: berkas kosong berisi kolom yang dibutuhkan untuk impor.', cari: { teks: 'Unduh template Excel', tag: 'button' } },
      { teks: 'Import Excel: menambahkan banyak Penegak sekaligus dari berkas template yang sudah diisi.', cari: { teks: 'Import Excel', tag: 'button' } },
      { teks: 'Tambah anggota satu per satu. Admin cukup mengisi nama, NIS, dan rombel; data lainnya diisi Penegak sendiri.', cari: { teks: 'Tambah anggota', tag: 'button' } },
      { teks: 'Tab jenis anggota: Penegak, Dewan (akun lama), Pembina, Admin Gudep, dan Penugasan.', cari: { teks: 'Penegak', tag: 'button', dalam: 'main', naik: 1 } },
      { teks: 'Status: mengubah anggota menjadi aktif, nonaktif, atau alumni. Pensil mengubah data, tempat sampah menghapus.', cari: { teks: 'Status', tag: 'button', dalam: 'main', nth: 0 } },
    ],
  },
  {
    id: 'admin-naikkelas',
    akun: 'admin',
    tinggi: { ponsel: 1250 },
    judul: 'Naik kelas',
    alt: 'Halaman Naik kelas dengan jumlah aktif, nonaktif, alumni, pilihan tahun ajaran, tombol unduh dan unggah berkas Excel, dan tabel rombel baru serta aksi.',
    langkah: [{ klikMenu: 'Naik Kelas' }],
    penanda: [
      { teks: 'Jumlah anggota aktif, nonaktif (tidak melanjutkan Pramuka, masih siswa), dan alumni (lulus).', cari: { teks: 'Nonaktif', dalam: 'main', nth: 0, naik: 2 } },
      { teks: 'Tahun ajaran yang baru dimulai. Unduh berkas Excel, isi rombel baru dan aksi tiap Penegak, lalu unggah; atau pakai "Isian bawaan".', cari: { teks: 'Tahun ajaran yang baru dimulai', induk: 'div.rounded-lg, section' } },
      { teks: 'Tabel per Penegak: rombel baru dan aksi (Lanjut, Tidak lanjut, atau Lulus). Hasilnya dipratinjau lebih dulu sebelum diterapkan, dan dapat dibatalkan.', cari: { selector: 'main table', nth: 0, pad: 2 } },
    ],
  },
  {
    id: 'admin-gudep',
    akun: 'admin',
    tinggi: { ponsel: 1250 },
    judul: 'Data Gudep',
    alt: 'Halaman Data Gudep dengan isian identitas gugus depan dan ambalan, serta alamat dan kwartir.',
    langkah: [{ klikMenu: 'Data Gudep' }],
    penanda: [
      { teks: 'Fungsi halaman: isian ini dipakai pada kop surat, tanda tangan, nomor surat, dan semua dokumen cetak. Ubah di sini setiap ada pergantian pengurus atau pejabat.', cari: { teks: 'Identitas gugus depan, ambalan, dan pejabatnya', mengandung: true } },
      { teks: 'Identitas gugus depan dan ambalan: nama gudep, ambalan, sekolah, nomor gudep, dan kode surat.', cari: { teks: 'Identitas Gugus Depan dan Ambalan', induk: 'div.rounded-lg, section' } },
      { teks: 'Alamat, kontak, dan kwartir yang tercetak pada kop surat.', cari: { teks: 'Alamat, kontak, dan kwartir', induk: 'div.rounded-lg, section' } },
    ],
  },
  {
    id: 'admin-periksa',
    akun: 'admin',
    judul: 'Periksa Data (Admin)',
    alt: 'Halaman Periksa Data dengan kartu kategori masalah dan tombol Perbaiki.',
    langkah: [{ klikMenu: 'Periksa Data' }],
    penanda: [
      { teks: 'Tiap kartu = satu jenis masalah data, lengkap dengan jumlah temuannya.', cari: { teks: 'Belum ada Nomor Tanda Anggota (NTA)', induk: '.panel, div.rounded-lg, section, article' } },
      { teks: 'Perbaiki: langsung menuju menu tempat Admin dapat memperbaikinya. Sebagian perbaikan hanya dapat dilakukan Admin.', cari: { teks: 'Perbaiki', tag: 'button', nth: 0 } },
      { teks: 'Lihat baris: daftar rincian anggota yang bermasalah.', cari: { teks: 'Lihat 10 baris', nth: 0 } },
    ],
  },
];
