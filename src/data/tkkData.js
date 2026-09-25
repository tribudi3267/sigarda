/**
 * KATALOG TANDA KECAKAPAN KHUSUS (TKK; murni data, tanpa React). Hanya NAMA, bidang, dan sumber; syarat tiap SKK TIDAK disalin (lihat berkas peraturan di
 * src/data/peraturanData.js). Satu-satunya sumber katalog: dibangkitkan ke tabel `tkk_katalog` oleh scripts/buat-skema.mjs (skema baru) dan
 * scripts/migrasi/2026-09-tkk.mjs (database berjalan), dan dijaga uji/tkk-klien.mjs (data ini = isi tabel).
 *
 * Sumber:
 *  - 'skk-132-1979'      : daftar SKK pada Lampiran II Keputusan Kwarnas 132/1979 (84 SKK, termasuk 3 khusus Siaga yang tidak berlaku bagi Penegak).
 *  - 'tambahan'          : SKK yang ditambahkan sesudah SK 132/1979 (SK Kwarnas 016/1980, 130/1980, dan sejenisnya); nama dan bidangnya perlu dipastikan ke Kwarcab.
 *  - 'penabung-01-2024'  : Jukran Kwarnas 01/2024 (SKK Penabung baru dan SKK Cakap Keuangan; teksnya tidak menyebut bidang, Cakap Keuangan mengikuti Penabung).
 * Empat SKK bidang agama (Sholat, Khotib, Qori, Muadzin) khusus Islam (`agama`), sehingga bidang I bagi Penegak non-Muslim hanya Penabung dan Cakap Keuangan.
 */

/** Lima bidang TKK (nomor = urutan Lampiran II SK 132/1979) beserta warna dasar tanda. */
export const BIDANG_TKK = {
  1: { nama: 'Agama, mental, moral, spiritual, pembentukan pribadi dan watak', singkat: 'Agama dan mental', warna: 'kuning' },
  2: { nama: 'Patriotisme dan seni budaya', singkat: 'Patriotisme dan seni budaya', warna: 'merah' },
  3: { nama: 'Ketangkasan dan kesehatan', singkat: 'Ketangkasan dan kesehatan', warna: 'putih' },
  4: { nama: 'Keterampilan dan teknik pembangunan', singkat: 'Keterampilan', warna: 'hijau' },
  5: { nama: 'Sosial, perikemanusiaan, gotong royong, ketertiban masyarakat, perdamaian dunia, dan lingkungan hidup', singkat: 'Sosial dan lingkungan', warna: 'biru' },
};

/** Tiga tingkat TKK bagi Penegak dan Pandega (berurutan; Madya butuh Purwa jenis yang sama, Utama butuh Madya). */
export const TINGKAT_TKK = [
  { id: 'purwa', label: 'Purwa', urut: 1 },
  { id: 'madya', label: 'Madya', urut: 2 },
  { id: 'utama', label: 'Utama', urut: 3 },
];

const S = 'skk-132-1979';
// [nama, bidang, opsi?]  opsi: { golongan: 'siaga', agama: 'Islam', sumber: '...' }
const DAFTAR = [
  // I. Agama, mental, moral, spiritual, pembentukan pribadi dan watak
  ['Sholat', 1, { agama: 'Islam' }], ['Khotib', 1, { agama: 'Islam' }], ['Qori', 1, { agama: 'Islam' }], ['Muadzin', 1, { agama: 'Islam' }],
  ['Penabung', 1], ['Cakap Keuangan', 1, { sumber: 'penabung-01-2024' }],
  // II. Patriotisme dan seni budaya
  ['Pengatur Ruangan', 2, { golongan: 'siaga' }], ['Pengatur Rumah', 2], ['Pengatur Meja Makan', 2], ['Pemimpin Menyanyi', 2], ['Menyanyi', 2], ['Pelukis', 2], ['Juru Gambar', 2], ['Pengarang', 2],
  ['Pembaca', 2, { sumber: 'tambahan' }],
  // III. Ketangkasan dan kesehatan
  ['Gerak Jalan', 3], ['Pengamat', 3], ['Penyelidik', 3], ['Perenang', 3], ['Juru Layar', 3], ['Juru Selam', 3], ['Pendayung', 3], ['Ski Air', 3],
  ['Pencak Silat', 3, { sumber: 'tambahan' }],
  // IV. Keterampilan dan teknik pembangunan
  ['Peternak Ulat Sutera', 4], ['Peternak Kelinci', 4], ['Peternak Lebah', 4], ['Juru Kebun', 4], ['Penenun', 4], ['Juru Bambu', 4], ['Juru Anyam', 4], ['Juru Kayu', 4], ['Juru Batu', 4],
  ['Juru Logam', 4], ['Juru Kulit', 4], ['Penjilid Buku', 4], ['Juru Potret', 4], ['Penangkap Ikan', 4], ['Peternak Itik', 4], ['Peternak Ayam', 4], ['Pemelihara Ternak', 4], ['Pemelihara Merpati', 4],
  ['Pengumpul (khusus Siaga)', 4, { golongan: 'siaga' }], ['Pengumpul Perangko', 4], ['Pengumpul Lencana', 4], ['Pengumpul Mata Uang', 4], ['Pengumpul Tanaman Kering', 4], ['Pengumpul Tanaman Hidup', 4],
  ['Pengumpul Benda', 4], ['Pengumpul Hewan (Kering/Basah)', 4], ['Juru Semboyan', 4], ['Menjahit', 4], ['Pengendara Sepeda', 4], ['Juru Masak', 4], ['Pencinta Dirgantara', 4], ['Pembuat Pesawat Model', 4],
  ['Pengenal Cuaca', 4], ['Komunikasi', 4], ['Konstruksi Pesawat Udara', 4], ['Juru Motor Pesawat Terbang', 4], ['Navigasi Udara', 4], ['Evakuasi Medis Dirgantara', 4], ['Pengenal Pesawat Terbang', 4],
  ['Petani Padi', 4], ['Juru Peta', 4], ['Navigasi Laut', 4], ['Juru Isyarat Bendera', 4], ['Pelaut', 4], ['Juru Isyarat Listrik', 4], ['Juru Isyarat Optik', 4], ['Perencana Kapal', 4], ['Perahu Motor', 4],
  ['Berkemah', 4, { sumber: 'tambahan' }], ['Pengembara', 4, { sumber: 'tambahan' }], ['Penjelajah', 4, { sumber: 'tambahan' }],
  // V. Sosial, perikemanusiaan, gotong royong, ketertiban masyarakat, perdamaian dunia, lingkungan hidup
  ['Pemadam Kebakaran', 5], ['Pengaman Lalu Lintas', 5], ['Pengamanan Kampung/Desa', 5], ['Penunjuk Jalan', 5], ['Juru Bahasa', 5], ['Pembantu Ibu', 5, { golongan: 'siaga' }], ['Perawatan Anak', 5],
  ['Perawatan Keluarga', 5], ['Penerima Tamu', 5], ['Juru Penerang', 5], ['Korespondensi', 5], ['PPPK (Pertolongan Pertama Pada Kecelakaan)', 5], ['Pembantu Penyuluh Padi', 5],
  ['Keadaan Darurat Penerbangan', 5], ['Keadaan Darurat Laut', 5], ['Penghijauan', 5, { sumber: 'tambahan' }],
];

const slug = (nama) => nama.toLowerCase().replace(/\(.*?\)/g, '').replace(/\/.*$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
// PPPK: id ringkas tetap (jangan berubah karena dirujuk ambang bawaan)
const idDari = (nama) => (nama.startsWith('PPPK') ? 'pppk' : slug(nama));

/** [{ id, nama, bidang, golongan: 'penegak' | 'siaga', agama: string | null, sumber, urut }] urut sesuai daftar di atas. */
export const KATALOG_TKK = DAFTAR.map(([nama, bidang, opsi = {}], i) => ({
  id: idDari(nama), nama, bidang, golongan: opsi.golongan ?? 'penegak', agama: opsi.agama ?? null, sumber: opsi.sumber ?? S, urut: i + 1,
}));

export const INDEKS_TKK = Object.fromEntries(KATALOG_TKK.map((t) => [t.id, t]));
export const cariTkk = (id) => INDEKS_TKK[id] ?? null;

/** TKK yang boleh dikenakan pada Penegak beragama `agama` (golongan Penegak; yang khusus satu agama hanya untuk agama itu). */
export const tkkUntukPenegak = (agama) => KATALOG_TKK.filter((t) => t.golongan === 'penegak' && (!t.agama || t.agama === agama));

/**
 * Ambang kesiapan Garuda (standar Kwarcab Purbalingga 2026 dan Kwarran: MINIMAL dan boleh dilampaui; Admin/Pembina dapat mengubahnya di menu TKK, disimpan
 * pada pengaturan 'tkk.ambang'): `total` TKK berbeda (tingkat tertinggi tiap TKK), sepuluh TKK `utamaWajib` harus berTingkat Utama, dan `madya` TKK
 * bertingkat Madya DI LUAR yang Utama (TKK bertingkat lebih tinggi ikut dihitung untuk tingkat di bawahnya); sisanya Purwa sampai `total`.
 */
export const AMBANG_TKK_BAWAAN = {
  total: 45,
  madya: 3,
  utamaWajib: ['berkemah', 'gerak-jalan', 'pppk', 'pengatur-rumah', 'pengamat', 'juru-masak', 'penabung', 'menjahit', 'juru-kebun', 'pengamanan-kampung'],
};
