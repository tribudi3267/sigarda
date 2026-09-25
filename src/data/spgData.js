/**
 * SYARAT PRAMUKA GARUDA (SPG) GOLONGAN PENEGAK, 13 butir.
 *
 * Sumber: SK Kwarnas 038/2017 (Bab II butir 1c), seperti tercetak pada lembar SPG di "02. Portofolio Penegak Garuda 2026" Kwarcab Purbalingga. Hanya bunyi butir; isi rubrik
 * pengujian tidak disimpan di repositori.
 *
 * jenis:
 *   'otomatis'  = dihitung aplikasi dari data yang sudah tercatat (SKU, pelantikan, TKK, Saka); Pembina boleh menimpa dengan alasan.
 *   'dokumen'   = dinilai dari kelengkapan dokumen lampiran pada cek list portofolio (`dokumen` = id butir cek list): lengkap = 100, belum = 0, ditetapkan Pembina.
 * `aturan` (otomatis saja) dipakai src/lib/spgLogic.js. Jangan ubah `no` setelah ada data penetapan.
 */
export const BUTIR_SPG = [
  { no: 1, judul: 'UUD 1945 dan UU Gerakan Pramuka', uraian: 'Memahami UUD RI 1945, UU RI Nomor 12 Tahun 2010 tentang Gerakan Pramuka.', jenis: 'dokumen', dokumen: ['PF-01', 'PF-02'] },
  { no: 2, judul: 'SKU Laksana dan berlatih 3 bulan', uraian: 'Telah menyelesaikan Syarat Kecakapan Umum (SKU) tingkat Penegak Laksana dan berlatih sekurang-kurangnya 3 (tiga) bulan setelah terlantik.', jenis: 'otomatis', aturan: 'sku-laksana' },
  { no: 3, judul: 'Teladan di gugusdepan, rumah, sekolah, masyarakat', uraian: 'Menjadi contoh yang baik dalam gugusdepan, di rumah, di sekolah/perguruan tinggi, di tempat kerja dan di masyarakat, sesuai dengan satya dan darma pramuka.', jenis: 'dokumen', dokumen: ['PF-06'] },
  { no: 4, judul: 'Tanda Kecakapan Khusus (TKK)', uraian: 'Telah memiliki Tanda Kecakapan Khusus (TKK) untuk Pramuka Penegak sekurang-kurangnya sembilan macam dari masing-masing bidang Kecakapan Khusus, sekurang-kurangnya dua macam Tingkat Utama dan tiga macam Tingkat Madya. Jenis TKK yang diwajibkan berdasarkan ketentuan gugusdepan tempat Penegak berada.', jenis: 'otomatis', aturan: 'tkk' },
  { no: 5, judul: 'Pertemuan Penegak Ranting, Cabang, Daerah', uraian: 'Pernah mengikuti pertemuan Pramuka Penegak di tingkat Ranting, Cabang, Daerah.', jenis: 'dokumen', dokumen: ['PF-09'] },
  { no: 6, judul: 'Anggota Satuan Karya (Saka)', uraian: 'Tergabung dalam salah satu Satuan Karya Pramuka dan mampu mengaplikasikan keterampilan di satuan karya pramuka tersebut.', jenis: 'otomatis', aturan: 'saka' },
  { no: 7, judul: 'Aktif membantu Pembina', uraian: 'Aktif membantu Pembina di gugusdepan.', jenis: 'dokumen', dokumen: ['PF-10'] },
  { no: 8, judul: 'Komputer dan internet', uraian: 'Dapat mengoperasikan komputer dan memanfaatkan teknologi informasi internet.', jenis: 'dokumen', dokumen: ['PF-12', 'PF-13'] },
  { no: 9, judul: 'Bahasa internasional', uraian: 'Secara aktif menggunakan salah satu bahasa internasional.', jenis: 'dokumen', dokumen: ['PF-14'] },
  { no: 10, judul: 'Proyek produktif', uraian: 'Dapat menyelenggarakan satu proyek produktif yang bersifat perorangan atau bersama di lingkungan.', jenis: 'dokumen', dokumen: ['PF-15'] },
  { no: 11, judul: 'Penabung rajin dan teratur', uraian: 'Sebagai penabung yang rajin dan teratur.', jenis: 'otomatis', aturan: 'penabung', dokumen: ['PF-16'] },
  { no: 12, judul: 'Seni budaya, olahraga, dan IPTEK', uraian: 'Mampu menampilkan kecakapan di bidang seni budaya, olah raga, ilmu pengetahuan dan teknologi di depan umum.', jenis: 'dokumen', dokumen: ['PF-17', 'PF-18', 'PF-19'] },
  { no: 13, judul: 'Kegiatan pembangunan', uraian: 'Dapat melakukan kegiatan pembangunan di lingkungannya mulai dari perencanaan, pelaksanaan, dan penilaian.', jenis: 'dokumen', dokumen: ['PF-20'] },
];

export const INDEKS_SPG = Object.fromEntries(BUTIR_SPG.map((b) => [b.no, b]));
