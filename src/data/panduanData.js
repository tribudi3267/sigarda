/**
 * PANDUAN PENGGUNA (tahap L10). Satu halaman ringkas per peran, bahasa sederhana untuk guru/Pembina Pramuka.
 * Isi murni data (tanpa React) supaya mudah ditinjau dan diuji terpisah dari tampilannya (src/pages/Bantuan.jsx).
 * Setiap panduan punya `rujukan`: daftar { id, bagian } ke registri peraturan (src/data/peraturanData.js), ditampilkan sebagai bagian "Rujukan peraturan".
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
    'Perlindungan anggota (Safe From Harm): Akun saya menampilkan kepada siapa harus melapor bila mengalami atau mengetahui perundungan, pelecehan, kekerasan, atau penelantaran (penerima laporan gugus depan). Laporan kejadian TIDAK dicatat di SIGARDA karena bersifat rahasia; sampaikan langsung kepada penerima laporan.',
    'Dokumen cetak (kartu SKU, surat, laporan) dibuat lewat tombol "Cetak" di aplikasi, lalu pilih "Simpan sebagai PDF" pada kotak dialog cetak peramban.',
  ],
};

const PENEGAK = {
  id: 'penegak',
  label: 'Penegak',
  ringkasan: 'Untuk anggota Penegak kelas X, XI, dan XII -- termasuk yang berjabatan Dewan Ambalan saat memilih tampilan Penegak.',
  rujukan: [
    { id: 'sku-penegak-2011', bagian: 'Bab V (cara menyelesaikan dan menguji SKU)' },
    { id: 'agama-182-1979', bagian: 'butir 1 SKU (agama)' },
    { id: 'iuran-049-1987', bagian: 'iuran peserta didik kepada gugusdepan' },
    { id: 'garuda-038-2017', bagian: 'syarat Penegak Garuda (Bab II butir 1c)' },
  ],
  bagian: [
    {
      id: 'penegak-beranda',
      judul: 'Beranda',
      isi: [
        'Menampilkan ringkasan progres SKU sendiri (Bantara dan Laksana).',
        'Kartu "Pelantikan dan Saka" (tampil bila sudah ada catatan) memuat tanggal dan tempat pelantikan Bantara/Laksana serta keanggotaan Saka Anda, yang dicatat Pembina.',
        'Agenda pengujian juga memuat butir yang masih menunggu pra-uji (bila pra-uji hidup), lengkap dengan posisinya: menunggu Pinsa, Bina Damping, atau Pembina. Pengajuan yang masih menunggu penilai dapat dibatalkan dari sini.',
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
        'Bila pra-uji dihidupkan Pembina: pengajuan tidak lagi memilih penguji. Butir Bantara diteruskan berjenjang ke Pinsa sangga Anda, lalu Bina Damping rombel Anda, lalu diuji resmi oleh Pembina; butir Laksana ke Bina Damping yang sudah Laksana, lalu Pembina. Tahap yang tidak punya penilai dilewati otomatis. Di bawah tiap butir tampil jalur dan posisinya; Anda juga diberi tahu lewat notifikasi di setiap tahap.',
        'Pra-uji hanya rekomendasi. Bila belum lulus, catatan perbaikan penilai tampil di butir itu dan Anda boleh mengajukan lagi (mulai dari tahap pertama). Pengajuan yang masih menunggu penilai dapat dibatalkan.',
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
    {
      id: 'penegak-data-diri',
      judul: 'Data diri (untuk portofolio Garuda)',
      isi: [
        'Akunmu dibuat admin hanya dengan nama, NIS, dan rombel. Data diri selebihnya kamu isi sendiri di menu Akun saya, bagian Data diri, dan sesudah masuk aplikasi akan menawarkannya lewat jendela "Lengkapi data dirimu" (sama seperti permintaan nomor WhatsApp: boleh dilewati dengan Isi nanti, tetapi ditanyakan lagi saat masuk berikutnya sampai isian pokok lengkap).',
        'Isian pokok: nomor WhatsApp, jenis kelamin, agama, tanggal lahir, tempat lahir, alamat, dan nama ayah, ibu, atau wali. Isian lain (golongan darah, tinggi dan berat badan, keluarga, sekolah dan tahun lulus, prestasi, kegiatan Pramuka yang pernah diikuti, kecakapan lain, dan perangkat IT yang dikuasai) boleh dilengkapi kapan saja.',
        'Data ini berguna untuk melengkapi dokumen portofolio Penegak Garuda (daftar isian dan tanda tangan orang tua), sehingga Pembina tidak perlu mengetik ulang. Hanya kamu, Pembina, dan Admin Gudep yang dapat membacanya.',
        'PENTING: agama menentukan butir agama pada SKU. Sebelum agama diisi, SKU belum dapat diajukan. Jenis kelamin, agama, tanggal lahir, dan NTA hanya dapat diisi satu kali; bila keliru, minta koreksi kepada Pembina atau Admin Gudep.',
      ],
    },
    { id: 'penegak-agenda', judul: 'Agenda', isi: ['Melihat jadwal kegiatan Ambalan setahun (Musyawarah, pelantikan, perkemahan, dan lain-lain), dengan pengingat H-30/H-7/H-1.'] },
    { id: 'penegak-pra-uji', judul: 'Pra-uji (bila Anda Pinsa atau Bina Damping)', isi: ['Menu Pra-uji muncul bila pra-uji sedang hidup dan Anda Pinsa sebuah sangga (anggota sangga itu sendiri, atau Penegak Calon Laksana dari rombel lain yang ditugaskan menjadi Pinsa sangga tersebut) atau Bina Damping sebuah rombel. Di sana ada pengajuan yang menunggu penilaian Anda. Tekan Nilai, lalu pilih Lulus (pengajuan diteruskan otomatis ke tahap berikutnya atau ke Pembina) atau Belum lulus (catatan perbaikan wajib, dikirim ke Penegak). Anda hanya dapat menilai butir yang sudah Anda lulus sendiri, dan Bina Damping hanya menilai butir Laksana bila sudah Laksana. Pra-uji tidak memakai PIN dan tidak pernah menjadikan sebuah butir lulus; hasil resmi tetap dari Pembina. Daftar yang sudah Anda putuskan ada di bawah antrian.'] },
    { id: 'penegak-tkk', judul: 'TKK (Tanda Kecakapan Khusus)', isi: ['Menu TKK menampilkan TKK yang sudah kamu lulus (tingkat Purwa, Madya, atau Utama, lengkap dengan tanggal dan pengujinya) dan kemajuan menuju syarat Garuda: total TKK, TKK Madya ke atas, dan TKK wajib bertingkat Utama. TKK dapat dikenakan sesudah kamu lulus SKU Bantara; Setelah kamu lulus uji tim 2 orang dan telah melatih sedikitnya seorang Pramuka, tekan Ajukan TKK dan isi jenis, tingkat, tanggal lulus, nama dua penguji, bukti melatih, dan tautan piagam (opsional). Penguji 1 dipilih dari Pembina yang ditugaskan untuk kelasmu (terisi otomatis bila hanya satu; bila belum ada penugasan, semua Pembina), sedangkan Penguji 2 kamu isi sendiri (Pembina lain, pembantu Pembina, atau ahli). Pengajuanmu berstatus Menunggu sampai Pembina meninjau: bila disetujui, TKK tercatat resmi dan kartu kemajuan bertambah; bila ditolak, ada catatan alasannya dan kamu boleh Ajukan lagi. Pengajuan yang masih menunggu dapat dibatalkan. Madya baru dapat diajukan sesudah Purwa jenis yang sama tercatat resmi, dan Utama sesudah Madya. Standar 45 TKK adalah standar lokal Kwarcab dan Kwarran, bukan bagian SK 038/2017.'] },
    { id: 'penegak-spg', judul: 'SPG (Syarat Pramuka Garuda)', isi: ['Sesudah seluruh SKU Bantara dan Laksana selesai dan kamu mendaftar sebagai Calon Garuda, menu SPG menampilkan kemajuan 13 syarat Penegak Garuda. Syarat yang datanya sudah ada di aplikasi (SKU Laksana dan 3 bulan sesudah dilantik, TKK, Saka, tabungan) dihitung otomatis. Syarat lain dinilai dari kelengkapan dokumen di cek list portofolio: bila dokumennya sudah berstatus Siap, Pembina menetapkan nilainya (lengkap = 100, belum = 0). Kamu hanya melihat; yang menetapkan Pembina.'] },
    { id: 'penegak-sangga', judul: 'Sangga (bila Anda Bina Damping)', isi: ['Menu Sangga muncul bila Anda ditunjuk Dewan Ambalan sebagai Bina Damping sebuah rombel (2 orang per rombel, dipilih dari Penegak berjabatan Dewan Ambalan). Di sana Anda membagi sangga di rombel itu (4 sampai 8 Penegak per sangga, 4 sampai 5 sangga per rombel) dan menentukan Pinsa, yaitu Pimpinan Sangga: seorang Penegak yang sudah menyelesaikan SKU Bantara. Peringatan jumlah anggota hanya pengingat, tidak menghalangi penyimpanan. Bila Anda sendiri ditunjuk sebagai Pinsa, Bina Damping rombel Anda yang menetapkannya. Bagian Pinsa dari rombel lain (di bawah susunan sangga) dipakai untuk menugaskan Penegak Calon Laksana dari rombel lain menjadi Pinsa sebuah sangga: ketik nama calon, pilih sangganya, lalu Tugaskan (satu orang untuk satu sangga, paling banyak 2 Pinsa tertugas per sangga). Tombol Cabut mengakhiri penugasan.'] },
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
  rujukan: [
    { id: 'gudep-05-2026', bagian: 'Pasal 24 (Ambalan Penegak, Dewan Ambalan, Dewan Kehormatan Penegak)' },
    { id: 'polmekbin-176-2013', bagian: 'butir 7 (Organisasi)' },
    { id: 'admin-satuan-041-1995', bagian: 'buku administrasi ambalan dipercayakan kepada Dewan Ambalan' },
    { id: 'iuran-049-1987', bagian: 'iuran' },
    { id: 'adart-2023', bagian: 'Anggaran Rumah Tangga Pasal 51 ayat (2) huruf a (pengukuhan Dewan Ambalan)' },
  ],
  bagian: [
    {
      id: 'dewan-antrian',
      judul: 'Antrian pengujian',
      isi: [
        'Daftar pengajuan pengujian dari Penegak: yang ditujukan langsung kepada Anda, dan antrian rombel yang menjadi tugas Anda.',
        'Mencatat hasil ujian memerlukan PIN Anda sendiri untuk memastikan yang mencatat benar orangnya.',
        'Butir Laksana bagi yang BUKAN Pembina hanya dapat dinilai bila ada penugasan khusus dari Pembina atau Admin untuk Penegak itu.',
        'Bila Pembina menghidupkan pra-uji: uji resmi hanya dilakukan Pembina. Menu Antrian dan Sesi ujian tidak tampil untuk Dewan Ambalan, dan peran Dewan Ambalan bergeser ke pra-uji (sebagai Pinsa atau Bina Damping).',
      ],
    },
    { id: 'dewan-peserta', judul: 'Peserta', isi: ['Mencari dan melihat detail satu Penegak: progres SKU, riwayat pengujian, dan portofolio (bila Calon Garuda).'] },
    { id: 'dewan-absensi', judul: 'Absensi', isi: ['Mencatat kehadiran latihan Jumat: Hadir, Izin, Sakit, atau Alpa untuk tiap Penegak.'] },
    { id: 'dewan-iuran', judul: 'Iuran', isi: ['Mencatat pembayaran iuran bumbung tiap Jumat, per Penegak atau sekaligus banyak.'] },
    { id: 'dewan-portofolio', judul: 'Portofolio', isi: ['Meninjau dan memberi catatan pada dokumen portofolio Calon Garuda (bukan mengisi milik Penegak, hanya menilai).'] },
    { id: 'dewan-sidang', judul: 'Sidang', isi: ['Bila ditugaskan: mencatat keputusan Layak/Tidak Lulus pada Sidang Dewan Kehormatan sebelum pelantikan, dan mencetak Berita Acara.', 'Ketua sidang pada Berita Acara adalah Pemangku Adat (ketua Dewan Kehormatan Penegak); bila jabatan itu belum diisi, dipakai Pradana.'] },
    { id: 'dewan-periksa', judul: 'Periksa Data', isi: ['Ikut membantu memeriksa data yang belum lengkap (NTA, jenis kelamin, rombel format lama, dan lainnya). Untuk akun yang belum pernah masuk dan anggota yang belum mengaktifkan notifikasi, tombol Buka WhatsApp mengirim pesan pengingat siap kirim ke Penegak dan sesama Dewan Ambalan. Bila pra-uji hidup, tampil juga rombel yang belum punya 2 Bina Damping dan sangga yang belum punya Pinsa; keduanya dapat diperbaiki lewat menu Sangga.'] },
    { id: 'dewan-sesi', judul: 'Sesi ujian', isi: ['Jadwal ujian bersama (tanggal, tempat), butir yang diuji, dan daftar pesertanya. Papan sesi menampilkan keadaan tiap peserta dari hasil uji yang sudah dicatat. Dewan Ambalan, Pembina, dan Admin dapat membuat dan mengubah sesi.'] },
    { id: 'dewan-pra-uji', judul: 'Pra-uji', isi: ['Bila Anda Pinsa atau Bina Damping dan pra-uji sedang hidup, menu Pra-uji berisi antrian pengajuan Penegak yang menunggu penilaian Anda (cara menilai sama dengan panduan Penegak). Pra-uji hanya rekomendasi; uji resmi tetap oleh Pembina.'] },
    { id: 'dewan-tindaklanjut', judul: 'Tindak Lanjut', isi: ['Daftar Penegak yang lama tidak bergerak (SKU, absensi, atau iuran); tombol untuk membuka WhatsApp dengan pesan pengingat siap kirim.'] },
    { id: 'dewan-bina-damping', judul: 'Sangga dan Bina Damping', isi: ['Di menu Sangga, tab Bina Damping: menunjuk 2 Bina Damping untuk tiap rombel pada tahun ajaran berjalan. Calon adalah Penegak berjabatan Dewan Ambalan yang minimal Calon Laksana; utamakan yang sudah Laksana (Calon Laksana baru dapat dipilih bila tidak ada lagi yang sudah Laksana dan belum bertugas). Satu orang hanya untuk satu rombel per tahun ajaran, dan penunjukan berakhir sendiri bila Penegaknya nonaktif atau tidak lagi berjabatan. Tab Sangga menampilkan susunan sangga dan Pinsa tiap rombel, termasuk Pinsa yang ditugaskan dari rombel lain (bertanda "dari" rombel asalnya).'] },
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
  rujukan: [
    { id: 'adart-2023', bagian: 'Anggaran Rumah Tangga Pasal 33 ayat (6) dan Pasal 35 ayat (3) (evaluasi dan uji kecakapan oleh pembina)' },
    { id: 'sku-penegak-2011', bagian: 'Bab V (penguji SKU adalah Pembina yang langsung membina)' },
    { id: 'garuda-038-2017', bagian: 'Bab IV (tim penilai) dan Bab VII (penetapan)' },
    { id: 'agama-182-1979', bagian: 'pengelolaan pendidikan agama dalam satuan' },
    { id: 'gudep-05-2026', bagian: 'Pasal 24 ayat (15) (Dewan Kehormatan Penegak)' },
    { id: 'perlindungan-004-2021', bagian: 'Pasal 7 (anggota dewasa), Pasal 9 (pelatihan), Pasal 10-11 (pelaporan dan penanganan)' },
  ],
  bagian: [
    { id: 'pembina-dashboard', judul: 'Dashboard', isi: ['Ringkasan seluruh gudep (bukan hanya rombel yang menjadi tugas Anda): progres SKU, kehadiran, iuran, dan portofolio Garuda.'] },
    { id: 'pembina-instrumen', judul: 'Instrumen', isi: ['Menyusun kriteria penilaian rinci untuk tiap butir SKU (opsional; butir tanpa instrumen tetap memakai penilaian Lulus/Perlu diulang biasa).'] },
    { id: 'pembina-penugasan', judul: 'Penugasan', isi: ['Menentukan Pembina/Dewan Ambalan mana yang menguji rombel mana pada satu tahun ajaran, dan penugasan khusus untuk satu Penegak tertentu.'] },
    { id: 'pembina-kepengurusan', judul: 'Pengurus', isi: ['Menetapkan jabatan Dewan Ambalan (Pradana, Pradani, Pemangku Adat, dan lainnya) untuk Penegak aktif, satu per satu atau lewat berkas Excel. Pradana, Pradani, dan Pemangku Adat masing-masing hanya satu orang.', 'Mencatat nomor dan tanggal SK pengukuhan Dewan Ambalan dari Ketua Kwartir Ranting (dan rekomendasi Ketua Mabigus bila ada) pada bagian Pengukuhan oleh Kwartir Ranting, satu catatan per tahun ajaran.'] },
    { id: 'pembina-pemeriksaan', judul: 'Periksa Data (perbaikan)', isi: ['Selain melihat daftarnya seperti Dewan Ambalan, Pembina dan Admin mendapat tombol Perbaiki (tautan langsung ke menu yang tepat) untuk data yang belum lengkap. Tombol WhatsApp juga dapat dipakai untuk Pembina lain. Bila pra-uji hidup, ada tiga daftar tambahan: rombel yang belum punya 2 Bina Damping, sangga yang belum punya Pinsa, dan pra-uji yang menunggu lebih dari 3 hari atau tanpa penilai (tombol Perbaiki membuka menu Pra-uji untuk melewati tahap yang macet). Selama sebuah butir menunggu pra-uji, pengingat "SKU tidak bergerak" ke Penegak itu ditahan karena penghambatnya penilai.'] },
    { id: 'pembina-kelolamateri', judul: 'Kelola Materi', isi: ['Menambah, mengubah, menghapus, dan menggeser urutan materi. Materi dapat dihubungkan ke butir SKU tertentu dan memakai tautan Google Drive; butir SKU yang belum punya materi ditandai agar mudah dilengkapi.'] },
    { id: 'pembina-raport', judul: 'Raport', isi: ['Menilai raport ekstrakurikuler Pramuka tiap semester (skor dari kehadiran, capaian SKU, dan sikap), lalu mencetak atau mengunduh Excel per kelas.'] },
    { id: 'pembina-laporan', judul: 'Laporan', isi: ['Menyusun laporan tahunan gugus depan (Excel dan PDF) untuk diserahkan ke Kwartir Ranting, dengan tembusan Kwartir Cabang.'] },
    { id: 'pembina-agenda', judul: 'Agenda', isi: ['Menambah dan mengubah jadwal kegiatan Ambalan, serta meninjau (menyetujui atau menolak) usulan kegiatan dari Pradana/Pradani.'] },
    { id: 'pembina-pra-uji', judul: 'Pra-uji', isi: ['Menu Pra-uji memuat sakelar Hidupkan atau Matikan pra-uji. Hidup: Penegak mengajukan butir lewat jalur Pinsa, Bina Damping, lalu Anda (uji resmi hanya Pembina; Dewan Ambalan tidak lagi menguji). Pengajuan lama yang ditujukan kepada penguji non-Pembina dikembalikan ke antrian rombel. Mati: pra-uji yang masih menunggu diteruskan langsung ke antrian uji resmi. Sebelum menghidupkan, pastikan Bina Damping tiap rombel sudah ditunjuk dan sangga sudah dibagi (menu Sangga). Di menu yang sama ada daftar pengajuan yang menunggu penilai; bila penilai berhalangan atau tidak ada, tekan Lewati tahap (alasan wajib, tercatat di riwayat butir). Pengajuan tidak pernah lolos sendiri; Anda diingatkan bila menunggu lebih dari 3 hari tanpa penilai. Pengajuan yang lulus semua tahap muncul di menu Antrian. Panel Cakupan pra-uji (saat pra-uji hidup) menunjukkan berapa persen pengajuan baru yang benar-benar melewati pra-uji dan rombel mana yang paling sering langsung ke Anda karena tidak punya Bina Damping atau Pinsa yang dapat menilai; pakai untuk memutuskan penambahan Bina Damping (menu Sangga).'] },
    { id: 'pembina-pelantikan', judul: 'Pelantikan dan Saka', isi: ['Menu Pelantikan mencatat pelantikan Bantara dan Laksana sesudah upacara terlaksana: pilih tingkat, tanggal, tempat, lalu centang Penegak yang dilantik (yang tampil hanya Penegak aktif yang sudah menyelesaikan seluruh butir SKU tingkat itu). Satu upacara dicatat sekaligus; bila ada yang tidak layak, seluruh pencatatan dibatalkan dan pesannya menyebut namanya. Kegiatan dapat ditautkan ke Agenda (jenis pelantikan Bantara/Laksana). Mencatat ulang Penegak yang sudah tercatat mengganti catatannya (untuk koreksi); Hapus dipakai bila salah Penegak atau salah tingkat. Pelantikan Laksana harus sesudah pelantikan Bantara bila Bantaranya tercatat. Tab Saka mencatat keanggotaan Saka tiap Penegak (nama Saka bebas diketik; ada saran), tanggal masuk, status aktif atau selesai, dan tautan surat keterangan aktif Saka (dokumen tidak disimpan di aplikasi). Catatan ini bahan daftar isian dan portofolio Garuda Kwarcab; cetaknya menyusul. Penegak nonaktif atau alumni tidak dapat diubah catatannya.'] },
    { id: 'pembina-tkk', judul: 'TKK (Tanda Kecakapan Khusus)', isi: ['Menu TKK mencatat capaian TKK Penegak sesudah lulus uji: cari Penegak, lalu Catat TKK. Pilih TKK (91 pilihan per bidang; yang khusus satu agama hanya untuk agama itu, yang khusus Siaga tidak muncul), tingkat (Purwa, lalu Madya, lalu Utama untuk jenis yang sama), tanggal lulus, nama dua penguji (tim 2 orang: Pembina, pembantu Pembina, atau ahli), bukti melatih (Penegak wajib telah melatih sedikitnya seorang Pramuka sampai tingkat di bawahnya), dan tautan surat keterangan atau piagam (dokumen tidak disimpan di aplikasi). Hanya untuk Penegak aktif yang sudah menyelesaikan SKU Bantara. Mencatat ulang mengoreksi; Hapus untuk salah catat, dimulai dari tingkat tertinggi. Penegak juga dapat mengajukan sendiri: pengajuannya muncul di tab Pengajuan (jumlah yang menunggu tampil di tab) dan kamu diberi tahu lewat notifikasi; Setujui menjadikannya capaian resmi (keadaan diperiksa ulang saat itu; bila Pembina 1 dan 2 berhalangan hadir, ganti nama penguji di kotak persetujuan dengan alasan di catatan, dan nama semula tersimpan sebagai jejak), Tolak wajib bercatatan sehingga Penegak dapat memperbaiki dan mengajukan lagi. Kartu kemajuan menunjukkan ketercapaian ambang Garuda (bawaan 45 TKK, 10 TKK wajib Utama, 3 TKK Madya, mengikuti pedoman Kwarcab Purbalingga 2026) dan dapat diubah di tab Ambang Garuda. TKK Krida dicatat sederhana (portofolio Kwarcab meminta minimal 2 piagam). Enam SKK tambahan (Berkemah, Pengembara, Penjelajah, Pembaca, Pencak Silat, Penghijauan) dan penempatan Cakap Keuangan perlu dipastikan ke Kwarcab. Cetak menyusul.'] },
    { id: 'pembina-spg', judul: 'SPG (Syarat Pramuka Garuda)', isi: ['Menu SPG mendaftar Penegak yang seluruh SKU Bantara dan Laksana-nya selesai, dengan kemajuan 13 butir SPG. Buka satu Penegak: butir 2, 4, 6, dan 11 dihitung otomatis (SKU Laksana dan 3 bulan sesudah pelantikan Laksana, TKK memenuhi ambang, tercatat di Saka, TKK Penabung dan buku tabungan). Butir lain dinilai dari kelengkapan dokumen portofolio: aplikasi memberi saran, lalu kamu menekan Tetapkan untuk mengisi nilai (100 bila lengkap dan memenuhi, 0 bila belum) dan tanggal pengujian. Bila penetapanmu berbeda dari hasil aplikasi, alasan wajib ditulis di catatan dan tersimpan sebagai jejak. Penilaian isi oleh guru mata pelajaran atau Pembina berjalan di luar aplikasi; hasilnya berupa dokumen yang dicek di portofolio. Cetak lembar SPG menyusul.'] },
    { id: 'pembina-kelayakan', judul: 'Kelayakan Calon Garuda', isi: ['Menu Kelayakan menampilkan, untuk Penegak yang SKU-nya selesai atau sudah terdaftar sebagai Calon Garuda, tiga syarat gerbang (kelas minimal, usia, SKU), kemajuan SPG, dan kuota calon (bawaan 5% dari Penegak aktif). Semuanya peringatan: aplikasi tidak memblokir pendaftaran, keputusan akhir tetap pada Pembina dan Kwarcab. Isi tanggal lahir Penegak lewat tombol Isi tanggal lahir (tanpa tanggal lahir, syarat usia berstatus Data belum ada). Aturan gerbang (kelas minimal, rentang tanggal lahir yang sah, kuota) dapat diubah di panel Aturan gerbang calon dan diperbarui tiap tahun sesuai pedoman Kwarcab. Tab Tim penilai mencatat tim penilai putra dan putri (nomor dan tanggal SK Kwarcab, tautan SK, anggota beserta unsurnya, satu ketua tim); komposisi yang belum sesuai pedoman hanya diperingatkan. Tab Kalender mencatat tanggal tiap tahap seleksi dari Kwarcab (pengajuan SK tim, penyerahan portofolio, verifikasi, pelantikan, dan seterusnya) dan menampilkan status serta sisa hari; notifikasi pengingat dikirim ke semua pengurus pada H-7, H-3, H-1, hari-H, dan sehari sebelum tahap berentang berakhir. Tanggal lahir Penegak juga dapat diisi lewat kolom Tanggal Lahir pada template import Penegak, atau untuk Penegak yang sudah terdaftar lewat tombol Lengkapi tanggal lahir (Excel) di tab Calon: unduh berkas, isi kolom Tanggal Lahir (tanggal/bulan/tahun), unggah, lalu simpan.'] },
    { id: 'pembina-sangga', judul: 'Sangga dan Bina Damping', isi: ['Menu Sangga: melihat dan mengatur susunan sangga tiap rombel (nama sangga, Pinsa) dan penunjukan Bina Damping (bersama Dewan Ambalan dan Admin). Pembina dapat membetulkan susunan sangga di rombel mana pun bila Bina Damping belum ada atau keliru. Pinsa sebuah sangga boleh anggota sangga itu sendiri atau Penegak Calon Laksana dari rombel lain yang ditugaskan lewat bagian Pinsa dari rombel lain; keduanya menilai pada tahap Pinsa.'] },
    { id: 'pembina-portofolio-kwarcab-isian', judul: 'Data diri dan surat guru pada Portofolio format Kwarcab', isi: ['Daftar isian portofolio kini terisi dari data diri yang diisi Penegak sendiri (Akun saya, Data diri): tempat lahir, alamat, keluarga, pendidikan, prestasi, kegiatan, kecakapan lain, dan perangkat IT. Nama ayah, ibu, atau wali menjadi penanda tangan orang tua. Bila ada yang kosong, ingatkan Penegak melengkapinya. Delapan surat keterangan guru dan gugus depan (PPKN, UU Gerakan Pramuka, TIK dua surat, bahasa, seni, IPTEK, olahraga) ikut tercetak sebagai lampiran dan dapat dimatikan lewat kotak Sertakan surat keterangan guru. Rubriknya diisi lewat panel Templat surat keterangan guru di halaman yang sama: tempel uraian dari lembar Kwarcab (satu baris per uraian; baris berawalan tanda pagar dan spasi menjadi judul kelompok), boleh menyesuaikan topik uji dan tiga judul kolom nilai. Templat berlaku per tahun ajaran; tahun ajaran baru otomatis memakai templat tahun sebelumnya sampai Anda menyimpan yang baru. Rubrik hanya tersimpan di basis data, tidak di kode aplikasi.'] },
    { id: 'pembina-melatih', judul: 'TKK: tab Melatih', isi: ['Di halaman TKK ada tab Melatih. Syarat penguji TKK Penegak: telah melatih sedikitnya seorang Pramuka sampai TKK tingkat di bawahnya. Tab ini merangkai catatan bukti melatih tiap Penegak: siapa yang dilatih dan untuk TKK apa saja (tekan nama Penegak untuk membuka rinciannya). Bukti yang sama untuk tiga TKK berbeda atau lebih ditandai perlu ditanyakan; bisa wajar (mis. melatih satu adik untuk beberapa TKK), bisa juga salin tempel. Ini hanya bantuan pemeriksaan: tidak ada yang diblokir, dan keputusan tetap pada Pembina saat menguji atau meninjau pengajuan.'] },
    { id: 'pembina-periksa-data-diri', judul: 'Periksa Data: data diri Penegak', isi: ['Di menu Periksa Data ada kategori Penegak belum melengkapi data diri. Tiap baris menyebut nama, kelas, dan isian pokok yang kurang (WhatsApp, jenis kelamin, agama, tanggal lahir, tempat lahir, alamat, nama ayah, ibu, atau wali). Hanya nama dan jenis isian yang tampil, bukan isinya. Data diri diisi Penegak sendiri di Akun saya, jadi tidak ada tombol Perbaiki; gunakan tombol WhatsApp untuk mengirim ajakan siap kirim (bila Penegak belum mengisi nomor WhatsApp, Anda memilih kontaknya sendiri). Prioritaskan yang belum mengisi agama, karena Penegak tanpa agama belum dapat mengajukan SKU.'] },
    { id: 'pembina-salinan-beku', judul: 'Salinan beku portofolio dan tabel pendataan', isi: ['Di halaman Portofolio format Kwarcab, panel Salinan beku menyimpan dokumen saat ini apa adanya sebagai arsip yang dicetak atau dikirim ke Kwarcab: identitas, TKK, Saka, Krida, SPG, data diri, rubrik surat guru, dan data gudep pada saat itu. Tulis catatan (mis. tanggal penyerahan) lalu tekan Bekukan salinan sekarang. Salinan dapat dibuka kembali dengan Buka dan tidak berubah walau data aplikasi atau Data Gudep berubah kemudian; Kembali ke data terkini menampilkan dokumen yang mengikuti data terbaru. Paling banyak 20 salinan per Penegak; salinan yang tidak diperlukan dapat dihapus. Salinan memuat data pribadi Penegak dan hanya dapat dibaca Pembina dan Admin. Di menu Kelayakan, tombol Unduh rekap untuk Kwarran (Excel) menghasilkan satu berkas dengan enam lembar: Pendataan Calon Garuda (nama, NTA atau NIS, tanggal lantik Laksana, masa Laksana, tanggal lahir, usia, status kuota, saran aplikasi, dan kolom Verifikasi Pembina yang Anda isi sendiri), Kesiapan Berkas, Kemajuan TKK, Rincian SPG, Tim Penilai, dan Kalender. Kolom saran hanya bantuan; keputusan eligible tetap pada Pembina. Format Excel resmi Kwarran belum ada, jadi susunan lembar ini rancangan dari data aplikasi dan dapat disesuaikan bila format resminya tiba.'] },
    { id: 'pembina-berkas-garuda', judul: 'Berkas Calon Garuda', isi: ['Dari menu Portofolio: mencetak berkas lengkap satu Calon Garuda, atau membuat tautan berbagi baca-saja untuk penilai Kwartir tanpa perlu akun SIGARDA.'] },
    { id: 'pembina-portofolio-kwarcab', judul: 'Portofolio format Kwarcab', isi: ['Di detail seorang Calon Garuda (menu Portofolio), tombol Portofolio format Kwarcab menyusun dokumen cetak mengikuti "02. Portofolio Penegak Garuda 2026" Kwarcab Purbalingga: surat rekomendasi, sampul, daftar isi, daftar isian, lembar SPG, formulir penilaian tim, dan daftar lampiran. Yang sudah tercatat di SIGARDA terisi otomatis: nama, nomor gudep, tanggal lahir dan usia, pelantikan Bantara dan Laksana, 45 baris TKK (sepuluh TKK wajib Utama di urutan pertama), Saka, TKK Krida, tanggal pengujian SPG dari penetapan Pembina, dan nama anggota tim penilai. Data pribadi, keluarga, riwayat pendidikan, prestasi, kegiatan, bidang kecakapan, dan perangkat IT terisi dari isian yang dilengkapi Penegak sendiri; yang belum diisi dicetak kosong untuk ditulis tangan. Satu halaman berisi Daftar Hadir Latihan 3 Bulan (12 kali) setelah dilantik Penegak Laksana, disusun dari absensi latihan yang sudah dicatat sejak tanggal pelantikan Laksana (kolom paraf Pembina dan sel yang belum tercatat diisi tangan); pada butir SPG 2 dan 6, keterangan menyebut kehadiran latihan, surat keterangan Saka, dan jumlah Krida (hanya keterangan, bukan syarat tambahan). Paraf, tanda tangan, dan stempel tetap basah. Delapan surat keterangan guru ikut tercetak sebagai lampiran (lihat bagian berikutnya); lampiran fisik seperti fotokopi piagam dilampirkan terpisah. Klik Cetak atau simpan PDF, lalu pilih Simpan sebagai PDF.'] },
    { id: 'pembina-perlindungan', judul: 'Perlindungan Anggota (Safe From Harm)', isi: ['Menu Perlindungan mencatat kewajiban anggota dewasa gugus depan menurut Jukran Kwarnas 004/2021: Pembina (pelatihan Safe From Harm, pakta integritas dan kode etik, pemeriksaan riwayat hidup dan rekam jejak) dan Admin Gudep (pelatihan). Tekan Catat pada baris yang belum tercatat: isi tanggal, tautan bukti bila ada (mis. sertifikat di Google Drive; berkasnya tidak disimpan di aplikasi), dan catatan singkat. Ubah untuk mengoreksi, Hapus bila salah catat. Di bagian atas halaman, isi Penerima laporan gugus depan (nama, kontak, tautan prosedur, keterangan): itu yang tampil di Akun saya semua pengguna agar Penegak tahu kepada siapa melapor. Laporan kejadian TIDAK disimpan di SIGARDA; peraturan menugaskan penanganannya kepada Komite Perlindungan dan Dewan Kehormatan di luar aplikasi, dengan tindak lanjut paling lambat 12 jam sejak laporan diterima. Catatan yang belum lengkap juga muncul di Periksa Data (kategori Catatan Safe From Harm belum lengkap) dengan tombol WhatsApp.'] },
    { id: 'pembina-agama', judul: 'Butir agama', isi: ['Hanya Pembina yang SEAGAMA dengan Penegak yang dapat menilai Butir 1 (agama), kecuali belum ada Pembina beragama itu, atau ada surat pengantar resmi ke guru agama sekolah.'] },
  ],
};

const ADMIN = {
  id: 'admin',
  label: 'Admin Gudep',
  ringkasan: 'Memiliki seluruh hak Pembina (lihat bagian di atas), ditambah kewenangan berikut.',
  rujukan: [
    { id: 'nomor-gudep-050-2003', bagian: 'Bab III butir 6 (nomor gudep)' },
    { id: 'gudep-05-2026', bagian: 'Pasal 12, 16, dan 29 (nomor gugus depan, Majelis Pembimbing, Ketua Gugus Depan)' },
    { id: 'uu-12-2010', bagian: 'dasar hukum Gerakan Pramuka' },
    { id: 'adart-2023', bagian: 'ketentuan organisasi gugusdepan' },
  ],
  bagian: [
    { id: 'admin-anggota', judul: 'Anggota', isi: ['Menambah anggota satu per satu, atau mengimpor banyak sekaligus lewat berkas Excel. Data awal Penegak cukup tiga hal: nama lengkap, NIS, dan rombel. Kolom lain (jenis kelamin, sangga, agama, NTA, PIN awal, tanggal lahir) bertanda opsional dan boleh dikosongkan; data diri selebihnya (tempat dan tanggal lahir, alamat, keluarga, pendidikan, prestasi, dan seterusnya) diisi Penegak sendiri di menu Akun saya, Data diri, dan ditanyakan lewat ajakan sesudah masuk. Penegak yang belum mengisi agama belum dapat mengajukan SKU (butir agama menyesuaikan agama), jadi ingatkan Penegak baru untuk mengisinya begitu masuk pertama kali. Untuk anggota selain Penegak (Pembina, Dewan Ambalan, Admin), jenis kelamin tetap wajib. Jenis kelamin, agama, tanggal lahir, dan NTA yang sudah diisi Penegak tidak dapat diganti sendiri; koreksinya lewat Ubah anggota.'] },
    { id: 'admin-naikkelas', judul: 'Naik Kelas', isi: ['Proses tahunan: memindahkan rombel (X ke XI, XI ke XII) atau meluluskan Penegak kelas XII menjadi alumni, sekaligus untuk semua anggota.'] },
    { id: 'admin-pra-uji', judul: 'Pra-uji', isi: ['Sama dengan Pembina: menu Pra-uji untuk menghidupkan atau mematikan pra-uji dan melewati tahap yang macet. Panel Cakupan pra-uji juga tersedia. Admin tidak menguji resmi; uji resmi hanya Pembina.'] },
    { id: 'admin-pelantikan', judul: 'Pelantikan dan Saka', isi: ['Sama dengan Pembina: menu Pelantikan untuk mencatat pelantikan Bantara/Laksana dan keanggotaan Saka, termasuk mengoreksi atau menghapus catatan yang salah.'] },
    { id: 'admin-tkk', judul: 'TKK (Tanda Kecakapan Khusus)', isi: ['Sama dengan Pembina: menu TKK untuk mencatat capaian TKK dan TKK Krida, meninjau pengajuan Penegak (tab Pengajuan), serta mengatur ambang kesiapan Garuda (jumlah TKK, jumlah Madya, dan daftar TKK wajib Utama).'] },
    { id: 'admin-spg', judul: 'SPG (Syarat Pramuka Garuda)', isi: ['Sama dengan Pembina: menu SPG untuk menetapkan butir SPG Penegak yang layak dan menghapus penetapan yang keliru. Penetapan yang berbeda dari hasil hitung aplikasi wajib beralasan.'] },
    { id: 'admin-kelayakan', judul: 'Kelayakan Calon Garuda', isi: ['Sama dengan Pembina: menu Kelayakan untuk mengisi tanggal lahir Penegak, mengubah aturan gerbang calon (kelas minimal, rentang tanggal lahir, kuota persen), mencatat tim penilai putra dan putri, dan mengisi kalender tahap seleksi Kwarcab. Gerbang hanya peringatan. Template import Penegak punya kolom Tanggal Lahir (opsional) di ujung. Tanggal lahir disimpan terpisah dan hanya dapat dibaca pemilik dan pengurus.'] },
    { id: 'admin-sangga', judul: 'Sangga dan Bina Damping', isi: ['Sama dengan Pembina: menu Sangga untuk mengatur sangga, Pinsa, dan penunjukan Bina Damping tiap rombel. Setelah Naik Kelas, Pinsa anggota sangga otomatis terlepas karena rombel berubah; Bina Damping dan Pinsa tertugas (dari rombel lain) ditunjuk ulang untuk tahun ajaran baru.'] },
    { id: 'admin-gudep', judul: 'Data Gudep', isi: ['Mengisi identitas gugus depan (nama, nomor, Kwarran, Kwarcab, Pembina Gudep, Ka. Mabigus) -- dipakai sebagai kop pada SEMUA dokumen cetak aplikasi.'] },
    { id: 'admin-perlindungan', judul: 'Perlindungan Anggota (Safe From Harm)', isi: ['Sama dengan Pembina: menu Perlindungan untuk mencatat pelatihan Safe From Harm (juga milik Admin Gudep sendiri), pakta integritas, dan pemeriksaan rekam jejak Pembina, serta mengisi penerima laporan gugus depan. Catatan ikut dalam cadangan data.'] },
    { id: 'admin-cadangan', judul: 'Cadangan data', isi: ['Tombol "Unduh cadangan" (di menu Data Gudep) mengunduh seluruh data isian aplikasi (tanpa akun login). Lakukan rutin, minimal sebulan sekali; aplikasi akan mengingatkan bila sudah lewat 30 hari.'] },
    { id: 'admin-resetpin', judul: 'Reset PIN', isi: ['Membuatkan PIN baru bagi anggota yang lupa PIN-nya.'] },
  ],
};

export const PERAN_PANDUAN = ['penegak', 'dewan', 'pembina', 'admin'];
export const PANDUAN = { penegak: PENEGAK, dewan: DEWAN, pembina: PEMBINA, admin: ADMIN };
export const BAGIAN_UMUM = UMUM;
