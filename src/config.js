// Identitas aplikasi. SIGARDA = Sistem Informasi Garuda dan SKU Penegak.
export const APP = {
  nama: 'SIGARDA',
  kepanjangan: 'Sistem Informasi Garuda dan SKU Penegak',
  tagline: 'Wadah pengujian SKU Bantara dan Laksana serta penyusunan portofolio Penegak Garuda',
  versi: '2.0',
};

// Identitas Gugus Depan. Ubah di sini, seluruh aplikasi dan dokumen cetak ikut berubah.
export const GUDEP = {
  nama: 'Gugus Depan SMAN 1 Bukateja',
  singkat: 'Gudep SMAN 1 Bukateja',
  sekolah: 'SMA Negeri 1 Bukateja',
  alamat: 'Bukateja, Kabupaten Purbalingga, Jawa Tengah',
  kota: 'Bukateja',
  nomorGudep: '.........', // isi nomor gudep resmi
  kwarran: 'Kwartir Ranting Bukateja',
  kwarcab: 'Kwartir Cabang Purbalingga',
  kodeSurat: 'GD-SMAN1-BKT',
  pembina: { jabatan: 'Pembina Gudep', nama: 'Nama Pembina Gudep', nta: '.........' },
  ketuaAmbalan: { jabatan: 'Pradana Dewan Ambalan', nama: 'Nama Pradana', nta: '.........' },
};

// Hanya SARAN pada isian anggota baru. Daftar pada filter selalu diambil dari data yang ada.
export const SARAN_SANGGA = ['Sangga Elang', 'Sangga Rajawali', 'Sangga Merak', 'Sangga Kasuari'];
export const SARAN_KELAS = ['X', 'XI', 'XII'];

export const NILAI = ['Sangat baik', 'Baik', 'Cukup'];

// Kehadiran latihan Jumat di bawah angka ini (persen) ditandai rendah pada rekap.
export const AMBANG_HADIR = 75;

// Kelompok pengguna. Pembina dan Dewan Ambalan sama-sama berperan "penguji" (dapat menilai SKU,
// mencatat absensi, meninjau portofolio) dan dibedakan lewat jabatan.
export const KELOMPOK_PENGGUNA = [
  { id: 'peserta', label: 'Penegak', role: 'peserta' },
  { id: 'dewan', label: 'Dewan Ambalan', role: 'penguji', jabatan: 'Dewan Ambalan' },
  { id: 'pembina', label: 'Pembina', role: 'penguji', jabatan: 'Pembina' },
  { id: 'admin', label: 'Admin Gudep', role: 'admin' },
];
export const cocokKelompok = (kelompok, user) =>
  user.role === kelompok.role && (!kelompok.jabatan || user.jabatan === kelompok.jabatan);
