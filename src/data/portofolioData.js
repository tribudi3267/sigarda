/**
 * CEK LIST LAMPIRAN BERKAS DOKUMEN PORTOFOLIO PENEGAK GARUDA
 *
 * Sumber: "03.01. Tabel Cek List Lampiran Berkas Dokumen Portofolio Garuda" (26 lampiran,
 * urut sesuai isi dokumen 02. Portofolio Penegak Garuda 2026).
 * Aplikasi menyesuaikan jumlah dokumen dan persentase otomatis bila daftar ini diubah.
 * Jangan ubah id setelah ada data progres.
 */
const DAFTAR = [
  ['Surat Keterangan Memahami UUD RI 1945', 'TTD Guru PPKN & Kepala Sekolah'],
  ['Surat Keterangan Memahami UU No. 12/2010 (Gerakan Pramuka)', 'TTD Ketua Gudep & Ka. Mabigus'],
  ['Fotokopi SKU Bantara & Laksana', 'Lembar Pengesahan SKU'],
  ['Fotokopi Daftar Hadir Latihan', 'Presensi Absensi Latihan'],
  ['Fotokopi Piagam SKU Bantara & Laksana', 'Sertifikat / Piagam Pelantikan'],
  ['Surat Keterangan Berkelakuan Baik / Keteladanan', 'Berkas 7 Pihak (RT, Orang Tua, Wali Kelas, BK, Pembina, Teman Ambalan, Teman Rumah)'],
  ['Fotokopi SKK / Pengesahan SKK', 'Modul Uji Kecakapan Khusus'],
  ['Fotokopi Piagam TKK', 'Bukti Sertifikat TKK'],
  ['Fotokopi Piagam Kegiatan Kepramukaan', 'Tingkat Ranting, Cabang, dan Daerah'],
  ['Surat Keterangan Aktif Membantu Pembina di Gudep', 'TTD Ketua Gudep & Ka. Mabigus'],
  ['Surat Tugas Kegiatan Turun Bawah (Turba)', 'Surat Tugas Gudep ke SMP/MTs'],
  ['Surat Keterangan Nilai TIK (Uji Aplikasi Komputer)', 'Nilai MS Word, Excel, & PowerPoint'],
  ['Surat Keterangan Nilai TIK (Uji Internet & Teknologi)', 'Nilai Canva Poster & Video AI'],
  ['Surat Keterangan Nilai Bahasa Internasional', 'Nilai Bahasa Inggris / Arab / Lainnya'],
  ['Pembuatan Proyek Produktif', 'Link Video Medsos & Screenshot Proyek (Arduino)'],
  ['Fotokopi Buku Tabungan', 'Identitas Rekening & Catatan Mutasi Saldo'],
  ['Surat Keterangan & Foto Uji Kesenian', 'TTD Guru Seni Budaya + Foto Tampil di Depan Umum'],
  ['Surat Keterangan & Foto Uji Sains / IPA', 'TTD Guru Fisika/Biologi/Kimia + Foto Demonstrasi Sains'],
  ['Surat Keterangan & Foto Uji Olahraga', 'TTD Guru Olahraga + Foto Unjuk Kerja Olahraga'],
  ['Proposal & Dokumentasi Proyek Pembangunan', 'Proposal Lengkap (Cover Kuning) & Foto Progres (0%, 30%, 70%, 100%)'],
  ['Fotokopi SK Tim Penilai dari Kwarcab', 'Surat Keputusan Kwartir Cabang'],
  ['Fotokopi Kartu Tanda Anggota (KTA) Pramuka', 'Kartu Anggota Aktif'],
  ['Fotokopi Rapor Sekolah', 'Nilai Rapor 2 Semester Terakhir'],
  ['Fotokopi Akta Kelahiran', 'Dokumen Kependudukan'],
  ['Fotokopi Piagam Prestasi', 'Prestasi Akademik maupun Non-Akademik'],
  ['Foto Dokumentasi Penilaian oleh Tim Penilai Gudep', 'Foto Proses Wawancara / Penilaian Gudep'],
];

export const ITEM_PORTOFOLIO = DAFTAR.map(([jenis, isian], i) => ({
  no: i + 1,
  id: `PF-${String(i + 1).padStart(2, '0')}`,
  jenis,
  isian,
}));

export const INDEKS_ITEM = Object.fromEntries(ITEM_PORTOFOLIO.map((x) => [x.id, x]));

/** "siap" sama dengan kolom "Ada" pada tabel cek list. "belum" dan "proses" dihitung belum siap. */
export const STATUS_PF = {
  belum: { label: 'Belum siap', kelas: 'bg-stone-100 text-stone-700 ring-stone-300' },
  proses: { label: 'Sedang disiapkan', kelas: 'bg-amber-50 text-amber-900 ring-amber-300' },
  siap: { label: 'Siap (Ada)', kelas: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
};
