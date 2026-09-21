// Identitas aplikasi. SIGARDA = Sistem Informasi Garuda dan SKU Penegak.
export const APP = {
  nama: 'SIGARDA',
  kepanjangan: 'Sistem Informasi Garuda dan SKU Penegak',
  tagline: 'Wadah pengujian SKU Bantara dan Laksana serta penyusunan portofolio Penegak Garuda',
  versi: '2.0',
};

// Identitas Gugus Depan BAWAAN. Admin Gudep mengubahnya di menu "Data Gudep" (disimpan di basis data, pengaturan gudep.data); nilai di sini
// hanya dipakai selama belum ada data tersimpan atau bila sebuah isian dikosongkan. Bacalah lewat useGudep() / ambilGudep() (src/lib/gudepStore.js),
// jangan mengimpor konstanta ini langsung pada halaman.
//   pembina   = Pembina Gudep / Ka Gudep (penanda tangan surat intern sekolah)
//   kamabigus = Kepala Sekolah / Kamabigus (penanda tangan surat keluar sekolah)
//   pradana, pradani = pimpinan Dewan Ambalan putra dan putri
export const GUDEP_BAWAAN = {
  nama: 'Gugus Depan SMAN 1 Bukateja',
  singkat: 'Ambalan Gajah Mada/Christina M.T',
  sekolah: 'SMA Negeri 1 Bukateja',
  alamat: 'Bukateja, Kabupaten Purbalingga, Jawa Tengah',
  kota: 'Bukateja',
  nomorGudep: '10.701/10.702',
  kwarran: 'Kwartir Ranting Bukateja',
  kwarcab: 'Kwartir Cabang Purbalingga',
  kodeSurat: 'GD-SMAN1-BKT',
  telepon: '',
  email: '',
  pembina: { jabatan: 'Pembina Gudep', nama: 'Diana Udhi Hendriyanto, S.Pd.M.Pd', nta: '11.03.10.701.02365', nip: '' },
  kamabigus: { jabatan: 'Kepala Sekolah / Kamabigus', nama: '', nta: '', nip: '' },
  pradana: { jabatan: 'Pradana Dewan Ambalan', nama: '', nta: '', nip: '' },
  pradani: { jabatan: 'Pradani Dewan Ambalan', nama: '', nta: '', nip: '' },
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
