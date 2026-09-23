/**
 * PANDUAN PENGGUNA (tahap L10). Satu halaman ringkas per peran, bahasa sederhana untuk guru/Pembina Pramuka.
 * Isi murni data (tanpa React) supaya mudah ditinjau dan diuji terpisah dari tampilannya (src/pages/Bantuan.jsx).
 * Setiap bagian: { id, judul, isi: [baris...] }. Baris boleh berupa teks biasa atau { label, teks } untuk sub-judul kecil.
 */

const UMUM = {
  id: 'umum',
  judul: 'Berlaku untuk semua peran',
  isi: [
    'PIN awal dibuatkan Admin Gudep; SIGARDA akan meminta ganti PIN sendiri pada saat pertama kali masuk.',
    'Menu Notifikasi (ikon lonceng) menampilkan kabar dari aplikasi. Aktifkan notifikasi di menu itu supaya tetap dapat kabar walau aplikasi sedang tertutup.',
    'Di HP, tambahkan SIGARDA ke Layar Utama (menu berbagi/tambah pada peramban) supaya terasa seperti aplikasi biasa dan notifikasi bekerja lebih baik, terutama di iPhone.',
    'Keluar dari akun menghentikan notifikasi HANYA di perangkat itu; perangkat lain yang masih masuk tetap menerima notifikasi.',
    'Menu Akun saya (nama di pojok) untuk mengganti PIN dan mengisi nomor WhatsApp (dipakai pengurus untuk menghubungi bila diperlukan; boleh dilewati, tetapi akan diminta lagi setiap masuk sampai diisi).',
    'Menu Bantuan (ikon tanda tanya) memuat panduan ini untuk semua peran; tombol cetak di halaman itu menghasilkan salinan yang dapat dibagikan.',
    'Dokumen cetak (kartu SKU, surat, laporan) dibuat lewat tombol "Cetak" di aplikasi, lalu pilih "Simpan sebagai PDF" pada kotak dialog cetak peramban.',
  ],
};

const PENEGAK = {
  id: 'penegak',
  label: 'Penegak',
  ringkasan: 'Untuk anggota Penegak kelas X, XI, dan XII -- termasuk yang berjabatan Dewan Ambalan saat memilih tampilan Penegak.',
  bagian: [
    {
      id: 'penegak-beranda',
      judul: 'Beranda',
      isi: [
        'Menampilkan ringkasan progres SKU sendiri (Bantara dan Laksana).',
        'Setelah seluruh SKU Bantara dan Laksana lulus, akan muncul tombol untuk mendaftar sebagai Calon Garuda; menu Beranda berganti nama menjadi "Garuda".',
      ],
    },
    {
      id: 'penegak-sku',
      judul: 'Poin SKU',
      isi: [
        'Melihat seluruh butir SKU dan statusnya (Belum, Menunggu uji, Sedang diuji, Perlu diulang, atau Lulus).',
        'Tombol pada tiap butir untuk MENGAJUKAN pengujian: pilih penguji (Pembina atau Dewan Ambalan yang berhak) dan tanggal.',
        'Butir Laksana baru bisa diajukan setelah SELURUH butir Bantara lulus.',
        'Butir agama (Butir 1) hanya dapat dinilai Pembina; bila belum ada Pembina seagama, sementara semua Pembina boleh, atau lewat surat pengantar ke guru agama sekolah.',
      ],
    },
    { id: 'penegak-absensi', judul: 'Absensi', isi: ['Melihat rekap kehadiran sendiri pada latihan rutin Jumat, per semester.'] },
    { id: 'penegak-iuran', judul: 'Iuran', isi: ['Melihat riwayat iuran bumbung kepramukaan yang sudah dibayarkan sendiri.'] },
    {
      id: 'penegak-portofolio',
      judul: 'Portofolio (khusus sudah menjadi Calon Garuda)',
      isi: [
        'Mengisi cek list 26 dokumen portofolio: tandai status (Belum siap/Sedang disiapkan/Siap), tempel tautan berbagi Google Drive, dan catatan.',
        'Setiap perubahan tercatat otomatis di Jurnal, terlihat oleh Pembina dan Dewan Ambalan yang menilai.',
      ],
    },
    { id: 'penegak-agenda', judul: 'Agenda', isi: ['Melihat jadwal kegiatan Ambalan setahun (Musyawarah, pelantikan, perkemahan, dan lain-lain), dengan pengingat H-30/H-7/H-1.'] },
    {
      id: 'penegak-cetak',
      judul: 'Cetak',
      isi: [
        'Kartu SKU: rekap seluruh butir satu tingkat, disertai kode QR tiap butir yang sudah lulus.',
        'Surat Tanda Lulus: hanya dapat dicetak setelah seluruh butir satu tingkat lulus.',
      ],
    },
    { id: 'penegak-materi', judul: 'Materi', isi: ['Bahan belajar SKU dan kepramukaan, per topik dan per butir SKU. Kolom "Cari materi" mencari menurut judul atau bagian; daftar isi membantu melompat ke bagian tertentu. Sebagian materi berupa tautan Google Drive yang dapat dipratinjau langsung.'] },
    {
      id: 'penegak-dewan',
      judul: 'Bila berjabatan Dewan Ambalan',
      isi: [
        'Tersedia tombol pilih tampilan "Penegak" atau "Dewan" (biasanya di dekat nama akun). Panduan untuk tampilan Dewan ada pada bagian Dewan Ambalan di bawah.',
        'Jabatan berlaku setahun dan dicabut otomatis bila status berubah menjadi nonaktif atau alumni.',
      ],
    },
  ],
};

const DEWAN = {
  id: 'dewan',
  label: 'Dewan Ambalan',
  ringkasan: 'Untuk Penegak yang berjabatan Dewan Ambalan (tampilan Dewan) dan akun Dewan Ambalan lama.',
  bagian: [
    {
      id: 'dewan-antrian',
      judul: 'Antrian pengujian',
      isi: [
        'Daftar pengajuan pengujian dari Penegak: yang ditujukan langsung kepada Anda, dan antrian rombel yang menjadi tugas Anda.',
        'Mencatat hasil ujian memerlukan PIN Anda sendiri untuk memastikan yang mencatat benar orangnya.',
        'Butir Laksana bagi yang BUKAN Pembina hanya dapat dinilai bila ada penugasan khusus dari Pembina atau Admin untuk Penegak itu.',
      ],
    },
    { id: 'dewan-peserta', judul: 'Peserta', isi: ['Mencari dan melihat detail satu Penegak: progres SKU, riwayat pengujian, dan portofolio (bila Calon Garuda).'] },
    { id: 'dewan-absensi', judul: 'Absensi', isi: ['Mencatat kehadiran latihan Jumat: Hadir, Izin, Sakit, atau Alpa untuk tiap Penegak.'] },
    { id: 'dewan-iuran', judul: 'Iuran', isi: ['Mencatat pembayaran iuran bumbung tiap Jumat, per Penegak atau sekaligus banyak.'] },
    { id: 'dewan-portofolio', judul: 'Portofolio', isi: ['Meninjau dan memberi catatan pada dokumen portofolio Calon Garuda (bukan mengisi milik Penegak, hanya menilai).'] },
    { id: 'dewan-sidang', judul: 'Sidang', isi: ['Bila ditugaskan: mencatat keputusan Layak/Tidak Lulus pada Sidang Dewan Kehormatan sebelum pelantikan, dan mencetak Berita Acara.'] },
    { id: 'dewan-periksa', judul: 'Periksa Data', isi: ['Ikut membantu memeriksa data yang belum lengkap (NTA, jenis kelamin, rombel format lama, dan lainnya). Untuk akun yang belum pernah masuk dan anggota yang belum mengaktifkan notifikasi, tombol Buka WhatsApp mengirim pesan pengingat siap kirim ke Penegak dan sesama Dewan Ambalan.'] },
    { id: 'dewan-sesi', judul: 'Sesi ujian', isi: ['Jadwal ujian bersama (tanggal, tempat), butir yang diuji, dan daftar pesertanya. Papan sesi menampilkan keadaan tiap peserta dari hasil uji yang sudah dicatat. Dewan Ambalan, Pembina, dan Admin dapat membuat dan mengubah sesi.'] },
    { id: 'dewan-tindaklanjut', judul: 'Tindak Lanjut', isi: ['Daftar Penegak yang lama tidak bergerak (SKU, absensi, atau iuran); tombol untuk membuka WhatsApp dengan pesan pengingat siap kirim.'] },
    {
      id: 'dewan-pradana',
      judul: 'Khusus Pradana atau Pradani',
      isi: [
        'Mengajukan usulan Musyawarah Ambalan dan 10 kegiatan lain (pelantikan, perkemahan, gladi tangguh, dan seterusnya) lewat menu Agenda; usulan masuk ke seluruh Pembina untuk ditinjau.',
        'Mengelola kepengurusan Dewan Ambalan bersama Pembina lewat menu Pengurus (formulir satu per satu atau unggah Excel).',
      ],
    },
  ],
};

const PEMBINA = {
  id: 'pembina',
  label: 'Pembina',
  ringkasan: 'Memiliki seluruh hak Dewan Ambalan (lihat bagian di atas), ditambah kewenangan berikut.',
  bagian: [
    { id: 'pembina-dashboard', judul: 'Dashboard', isi: ['Ringkasan seluruh gudep (bukan hanya rombel yang menjadi tugas Anda): progres SKU, kehadiran, iuran, dan portofolio Garuda.'] },
    { id: 'pembina-instrumen', judul: 'Instrumen', isi: ['Menyusun kriteria penilaian rinci untuk tiap butir SKU (opsional; butir tanpa instrumen tetap memakai penilaian Lulus/Perlu diulang biasa).'] },
    { id: 'pembina-penugasan', judul: 'Penugasan', isi: ['Menentukan Pembina/Dewan Ambalan mana yang menguji rombel mana pada satu tahun ajaran, dan penugasan khusus untuk satu Penegak tertentu.'] },
    { id: 'pembina-kepengurusan', judul: 'Pengurus', isi: ['Menetapkan jabatan Dewan Ambalan (Pradana, Pradani, dan lainnya) untuk Penegak aktif, satu per satu atau lewat berkas Excel.'] },
    { id: 'pembina-pemeriksaan', judul: 'Periksa Data (perbaikan)', isi: ['Selain melihat daftarnya seperti Dewan Ambalan, Pembina dan Admin mendapat tombol Perbaiki (tautan langsung ke menu yang tepat) untuk data yang belum lengkap. Tombol WhatsApp juga dapat dipakai untuk Pembina lain.'] },
    { id: 'pembina-kelolamateri', judul: 'Kelola Materi', isi: ['Menambah, mengubah, menghapus, dan menggeser urutan materi. Materi dapat dihubungkan ke butir SKU tertentu dan memakai tautan Google Drive; butir SKU yang belum punya materi ditandai agar mudah dilengkapi.'] },
    { id: 'pembina-raport', judul: 'Raport', isi: ['Menilai raport ekstrakurikuler Pramuka tiap semester (skor dari kehadiran, capaian SKU, dan sikap), lalu mencetak atau mengunduh Excel per kelas.'] },
    { id: 'pembina-laporan', judul: 'Laporan', isi: ['Menyusun laporan tahunan gugus depan (Excel dan PDF) untuk diserahkan ke Kwartir Ranting, dengan tembusan Kwartir Cabang.'] },
    { id: 'pembina-agenda', judul: 'Agenda', isi: ['Menambah dan mengubah jadwal kegiatan Ambalan, serta meninjau (menyetujui atau menolak) usulan kegiatan dari Pradana/Pradani.'] },
    { id: 'pembina-berkas-garuda', judul: 'Berkas Calon Garuda', isi: ['Dari menu Portofolio: mencetak berkas lengkap satu Calon Garuda, atau membuat tautan berbagi baca-saja untuk penilai Kwartir tanpa perlu akun SIGARDA.'] },
    { id: 'pembina-agama', judul: 'Butir agama', isi: ['Hanya Pembina yang SEAGAMA dengan Penegak yang dapat menilai Butir 1 (agama), kecuali belum ada Pembina beragama itu, atau ada surat pengantar resmi ke guru agama sekolah.'] },
  ],
};

const ADMIN = {
  id: 'admin',
  label: 'Admin Gudep',
  ringkasan: 'Memiliki seluruh hak Pembina (lihat bagian di atas), ditambah kewenangan berikut.',
  bagian: [
    { id: 'admin-anggota', judul: 'Anggota', isi: ['Menambah anggota satu per satu, atau mengimpor banyak sekaligus lewat berkas Excel. Jenis kelamin wajib diisi untuk anggota baru.'] },
    { id: 'admin-naikkelas', judul: 'Naik Kelas', isi: ['Proses tahunan: memindahkan rombel (X ke XI, XI ke XII) atau meluluskan Penegak kelas XII menjadi alumni, sekaligus untuk semua anggota.'] },
    { id: 'admin-gudep', judul: 'Data Gudep', isi: ['Mengisi identitas gugus depan (nama, nomor, Kwarran, Kwarcab, Pembina Gudep, Ka. Mabigus) -- dipakai sebagai kop pada SEMUA dokumen cetak aplikasi.'] },
    { id: 'admin-cadangan', judul: 'Cadangan data', isi: ['Tombol "Unduh cadangan" (di menu Data Gudep) mengunduh seluruh data isian aplikasi (tanpa akun login). Lakukan rutin, minimal sebulan sekali; aplikasi akan mengingatkan bila sudah lewat 30 hari.'] },
    { id: 'admin-resetpin', judul: 'Reset PIN', isi: ['Membuatkan PIN baru bagi anggota yang lupa PIN-nya.'] },
  ],
};

export const PERAN_PANDUAN = ['penegak', 'dewan', 'pembina', 'admin'];
export const PANDUAN = { penegak: PENEGAK, dewan: DEWAN, pembina: PEMBINA, admin: ADMIN };
export const BAGIAN_UMUM = UMUM;
