/**
 * REGISTRI PERATURAN KEPRAMUKAAN (murni data, tanpa React)
 *
 * SATU-SATUNYA tempat judul dan tautan peraturan. Setiap bagian aplikasi yang bersandar pada peraturan Gerakan Pramuka menampilkan rujukannya lewat
 * komponen SumberPeraturan (src/components/SumberPeraturan.jsx) dengan id dari sini; jangan menulis nomor SK atau alamat berkas langsung di halaman
 * (dijaga uji/peraturan.mjs). Peraturan baru: tambahkan di sini, lalu pakai idnya.
 *
 * Tautan = berkas peraturan TERBARU di mana pun tersedia (utamakan pramuka.or.id; bila peraturan baru belum dimuat di situs Kwarnas, pakai berkas yang
 * ditautkan Kwarda/Kwarcab), harus https. Isi peraturan TIDAK disalin ke repositori.
 * `npm run periksa-peraturan` memeriksa bahwa semua tautan masih hidup (butuh internet; tidak ikut `npm run uji`).
 * Bila suatu berkas hilang dari situs, arahkan `url` ke halaman peraturan dan jelaskan di `catatan` (contoh: SK 273/1993 dan SK 145/2021 berkasnya sudah
 * dihapus dari Google Drive Kwarnas, jadi belum dimasukkan).
 *
 * Bentuk: { nama: sebutan pendek, judul: judul lengkap, url, catatan? }.
 */
export const HALAMAN_PERATURAN = 'https://pramuka.or.id/peraturan';

export const PERATURAN = {
  'uu-12-2010': {
    nama: 'UU 12/2010',
    judul: 'Undang-Undang Nomor 12 Tahun 2010 tentang Gerakan Pramuka',
    url: 'https://pramuka.or.id/files/document/UU-Gerakan-Pramuka.pdf',
  },
  'adart-2023': {
    nama: 'AD/ART Munas 2023',
    judul: 'Anggaran Dasar dan Anggaran Rumah Tangga Gerakan Pramuka (Keputusan Munas XI Tahun 2023 Nomor 07)',
    url: 'https://pramuka.or.id/ad-art-munas-2023/',
  },
  'sku-penegak-2011': {
    nama: 'Panduan SKU Penegak',
    judul: 'Keputusan Kwarnas Nomor 199 Tahun 2011 tentang Panduan Penyelesaian Syarat Kecakapan Umum (SKU) Pramuka Penegak',
    url: 'https://pramuka.or.id/files/document/SK-119-2011-Panduan%20Penyelesaian-SKU-Penegak.pdf',
    catatan: 'Berdasarkan Keputusan Kwarnas Nomor 198 Tahun 2011 (SKU). Situs Kwarnas menulis nomornya 119; isi dokumen bernomor 199.',
  },
  'garuda-038-2017': {
    nama: 'SK Kwarnas 038/2017',
    judul: 'Keputusan Kwarnas Nomor 038 Tahun 2017 tentang Petunjuk Penyelenggaraan Pramuka Garuda',
    url: 'https://pramuka.or.id/files/document/SK-038-2017-Jukran-Pramuka-Garuda.pdf',
  },
  'gudep-05-2026': {
    nama: 'Jukran Kwarnas 05/2026',
    judul: 'Petunjuk Penyelenggaraan Gerakan Pramuka Nomor 05 Tahun 2026 tentang Peraturan Gugus Depan Gerakan Pramuka',
    url: 'https://drive.google.com/uc?export=download&id=1CoB-Z58kEarG1gZjpdrMdGPhXLXYWy-4',
    catatan: 'Ditetapkan 13 Juli 2026; MENCABUT Keputusan Kwarnas Nomor 231 Tahun 2007. Belum dimuat di halaman peraturan Kwarnas; berkas di Google Drive yang ditautkan Kwarda DIY (bppramukadiy.or.id).',
  },
  'polmekbin-176-2013': {
    nama: 'SK Kwarnas 176/2013',
    judul: 'Keputusan Kwarnas Nomor 176 Tahun 2013 tentang Petunjuk Penyelenggaraan Pola dan Mekanisme Pembinaan Pramuka Penegak dan Pandega',
    url: 'https://pramuka.or.id/files/document/SK-176-2013-Jukran-Polmekbin-TD.pdf',
  },
  'admin-satuan-041-1995': {
    nama: 'SK Kwarnas 041/1995',
    judul: 'Keputusan Kwarnas Nomor 041 Tahun 1995 tentang Petunjuk Pelaksanaan Administrasi Satuan Pramuka',
    url: 'https://pramuka.or.id/files/document/Salinan-SK-041-1995-Juklak-Administrasi-Satuan.pdf',
  },
  'iuran-049-1987': {
    nama: 'SK Kwarnas 049/1987',
    judul: 'Keputusan Kwarnas Nomor 049 Tahun 1987 tentang Penyempurnaan Iuran Anggota Gerakan Pramuka',
    url: 'https://pramuka.or.id/files/document/SK-049-1987-Iuran-Anggota-Gerakan-Pramuka.pdf',
  },
  'nomor-gudep-050-2003': {
    nama: 'SK Kwarnas 050/2003',
    judul: 'Keputusan Kwarnas Nomor 050 Tahun 2003 tentang Petunjuk Penyelenggaraan Sistem Penomoran Kwartir dan Gugusdepan',
    url: 'https://pramuka.or.id/files/document/Salinan-SK-050-2003-Jukran-Sistem-Penomoran-Kwartir-dan-Gudep.pdf',
  },
  'tkk-134-1976': {
    nama: 'SK Kwarnas 134/1976',
    judul: 'Keputusan Kwarnas Nomor 134/KN/76 Tahun 1976 tentang Petunjuk Penyelenggaraan Kecakapan Khusus',
    url: 'https://pramuka.or.id/files/document/Kecapakan-Khusus-TKK-SKK-1976-dan-1979.pdf#page=18',
    catatan: 'Satu berkas dengan SK Kwarnas 132/1979 (terbitan Kwarnas 2007; tautan membuka halaman awal masing-masing keputusan). Bagian SKK Penabung di dalamnya diganti Jukran Kwarnas 01/2024.',
  },
  'skk-132-1979': {
    nama: 'SK Kwarnas 132/1979',
    judul: 'Keputusan Kwarnas Nomor 132 Tahun 1979 tentang Syarat-syarat dan Gambar-gambar Tanda Kecakapan Khusus (TKK)',
    url: 'https://pramuka.or.id/files/document/Kecapakan-Khusus-TKK-SKK-1976-dan-1979.pdf#page=36',
  },
  'penabung-01-2024': {
    nama: 'Jukran Kwarnas 01/2024',
    judul: 'Petunjuk Penyelenggaraan Kwarnas Nomor 01 Tahun 2024 tentang Panduan, Syarat, dan Gambar TKK Penabung dan Cakap Keuangan',
    url: 'https://drive.usercontent.google.com/u/0/uc?id=1ywhYvcAZcXcBzWGcvUh5T31-4QpP76mB&export=download',
    catatan: 'Belum dimuat di halaman peraturan Kwarnas; berkas dari Google Drive yang ditautkan Kwarda DIY. Menggantikan SKK Penabung pada SK 134/1976 dan memuat SKK Cakap Keuangan (bidang tidak disebut; aplikasi mengikuti Penabung).',
  },
  'perlindungan-004-2021': {
    nama: 'Jukran Kwarnas 004/2021',
    judul: 'Petunjuk Penyelenggaraan Kwarnas Nomor 04 Tahun 2021 tentang Peraturan Perlindungan bagi Anggota Gerakan Pramuka (Safe From Harm)',
    url: 'https://pramuka.or.id/files/document/Jukran-Kwarnas-004-2021-Safe-From-Harm.pdf',
  },
  'perlindungan-004-2021-teks': {
    nama: 'Jukran Kwarnas 004/2021 (e-book)',
    judul: 'Jukran Kwarnas Nomor 004 Tahun 2021 tentang Peraturan Perlindungan bagi Anggota Gerakan Pramuka (Safe From Harm), versi e-book yang teksnya dapat dicari',
    url: 'https://drive.google.com/u/2/uc?id=1ZfVdgZI9PwUgQEjRdChmLficg9CWO1PD&export=download',
    catatan: 'Berkas di Google Drive yang ditautkan Kwarda DIY (pramukadiy.or.id). Berkas pada pramuka.or.id berupa pindaian gambar sehingga teksnya tidak dapat dicari.',
  },
  'agama-182-1979': {
    nama: 'SK Kwarnas 182/1979',
    judul: 'Keputusan Kwarnas Nomor 182 Tahun 1979 tentang Petunjuk Penyelenggaraan Pendidikan Agama dalam Gerakan Pramuka',
    url: 'https://drive.google.com/file/d/1vpUFG2APqq1SmdKDDuRcenpUtLU_d-RS/view?usp=sharing',
    catatan: 'Berkas dipindai (gambar), disimpan di Google Drive Kwarnas sebagaimana tertaut pada halaman peraturan.',
  },
};

export const DAFTAR_ID_PERATURAN = Object.keys(PERATURAN);
