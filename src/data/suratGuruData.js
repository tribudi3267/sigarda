/**
 * Delapan surat keterangan guru/gugus depan pada lampiran portofolio Garuda Kwarcab Purbalingga (bagian "LAMPIRAN-LAMPIRAN" dokumen 02): kerangka surat saja. RUBRIK
 * (uraian yang diuji dan pita nilai) TIDAK ada di sini: sengaja hanya di basis data (tabel dokumen_templat, diisi Pembina atau Admin dari Portofolio format Kwarcab) dan
 * berlaku per tahun ajaran. `spg` = nomor butir SPG yang dibuktikan surat ini. `ujiBawaan` = topik uji bila templat belum menyebutnya.
 * Daftar `id` ini harus sama dengan batasan check jenis pada tabel dokumen_templat (dijaga uji/surat-guru.mjs).
 */
export const SURAT_GURU = [
  { id: 'surat_uud', judul: 'Memahami UUD RI 1945', spg: 1, penerbit: 'Guru PPKN', penandaTangan2: 'Kepala Sekolah', kop: 'sekolah', ujiBawaan: 'memahami UUD 1945' },
  { id: 'surat_uu_pramuka', judul: 'Memahami UU RI No. 12 Tahun 2010 tentang Gerakan Pramuka', spg: 1, penerbit: 'Ketua Gugus Depan', penandaTangan2: 'Ka. Mabigus', kop: 'gudep', ujiBawaan: 'memahami UU RI No 12 Tahun 2010 tentang Gerakan Pramuka' },
  { id: 'surat_tik', judul: 'Nilai TIK / Informatika (uji komputer)', spg: 8, penerbit: 'Guru TIK / Informatika', penandaTangan2: 'Kepala Sekolah', kop: 'sekolah', ujiBawaan: 'penggunaan komputer' },
  { id: 'surat_internet', judul: 'Nilai TIK / Informatika (uji internet)', spg: 8, penerbit: 'Guru TIK / Informatika', penandaTangan2: 'Kepala Sekolah', kop: 'sekolah', ujiBawaan: 'penggunaan internet' },
  { id: 'surat_bahasa', judul: 'Nilai bahasa internasional (Inggris / Arab / lainnya)', spg: 9, penerbit: 'Guru Bahasa Inggris / Arab / lainnya', penandaTangan2: 'Kepala Sekolah', kop: 'sekolah', ujiBawaan: 'penggunaan bahasa internasional' },
  { id: 'surat_seni', judul: 'Kecakapan seni dan budaya', spg: 12, penerbit: 'Guru Seni dan Budaya', penandaTangan2: 'Kepala Sekolah', kop: 'sekolah', ujiBawaan: 'kecakapan seni budaya' },
  { id: 'surat_iptek', judul: 'Kecakapan ilmu pengetahuan (Fisika / Biologi / Kimia)', spg: 12, penerbit: 'Guru Fisika / Biologi / Kimia', penandaTangan2: 'Kepala Sekolah', kop: 'sekolah', ujiBawaan: 'kecakapan ilmu pengetahuan dan teknologi' },
  { id: 'surat_olahraga', judul: 'Kecakapan olahraga', spg: 12, penerbit: 'Guru Olahraga', penandaTangan2: 'Kepala Sekolah', kop: 'sekolah', ujiBawaan: 'kecakapan olahraga' },
];
export const INDEKS_SURAT = Object.fromEntries(SURAT_GURU.map((s) => [s.id, s]));
export const PITA_BAWAAN = ['Cukup', 'Baik', 'Sangat Baik'];
export const JUMLAH_BARIS_KOSONG = 5;
