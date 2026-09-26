/**
 * ISIAN DATA DIRI PENEGAK (Tahap 3, H1; murni tanpa React). Admin gudep hanya membuat akun dengan nama, NIS, dan rombel; sisanya diisi Penegak sendiri (Akun saya, dan ajakan sesudah
 * masuk seperti nomor WhatsApp) dan dipakai portofolio Garuda. Server menyimpan pasangan kunci-nilai (tabel penegak_isian, sg_isian_saya_simpan); aturan tiap kunci
 * DICERMINKAN di sini (`periksaIsian`, `periksaProfil`) dan DIBANDINGKAN LANGSUNG dengan sigarda.isian_periksa dan isian_periksa_profil pada kisi masukan (uji/isian-klien.mjs).
 * Kunci profil (jk, agama, lahir, nta) hanya boleh diisi bila belum ada; koreksinya oleh Pembina atau Admin.
 */
import { hariIni } from './format';

const rapikan = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const TERLARANG = /[\u0000-\u001f\u007f<>]/;

export const KUNCI_PROFIL = ['jk', 'agama', 'lahir', 'nta'];
export const JENJANG = [{ id: 'tk', label: 'TK / BA / RA' }, { id: 'sd', label: 'SD / MI' }, { id: 'smp', label: 'SMP / MTs' }, { id: 'sma', label: 'SMA / SMK / MA' }];
export const TINGKAT_KEGIATAN = [{ id: 'kwarran', label: 'Kwarran' }, { id: 'kwarcab', label: 'Kwarcab' }, { id: 'kwarda', label: 'Kwarda' }];
export const LEVEL_IT = [{ id: 'bisa', label: 'Bisa' }, { id: 'cukup', label: 'Cukup' }, { id: 'kurang', label: 'Kurang bisa' }];
export const GOLONGAN_DARAH = ['A', 'B', 'AB', 'O'];
export const JUMLAH = { saudara: 3, kegiatan: 7, bidang: 6, perangkat: 4 };
const ORANG = [{ id: 'ayah', label: 'Ayah' }, { id: 'ibu', label: 'Ibu' }, { id: 'wali', label: 'Wali' }];
export const BIDANG_BAWAAN = ['Seni Budaya', '', 'Olahraga', '', 'Ilmu Pengetahuan', ''];

const urut = (n) => Array.from({ length: n }, (_, i) => i + 1);

/** Batas panjang tiap kunci teks bebas (sama dengan sigarda.isian_periksa) dan bentuk khusus. */
const BATAS = [
  [/^panggilan$/, 40], [/^tempat_lahir$/, 60], [/^alamat$/, 200], [/^penyakit$/, 120],
  [/^(ayah|ibu|wali)_(nama|kerja)$/, 80], [/^(ayah|ibu|wali)_alamat$/, 200],
  [/^sdr[1-3]_nama$/, 80], [/^sdr[1-3]_sebagai$/, 40],
  [/^pend_(tk|sd|smp|sma)_nama$/, 100], [/^(akd|non)_(tk|sd|smp|sma)$/, 200],
  [/^keg[1-7]_nama$/, 120], [/^bid[1-6]_nama$/, 80], [/^bid[1-6]_jenis$/, 60], [/^it[1-4]_nama$/, 80],
  [/^(gol_darah|no_hp|tinggi|berat|anak_ke|dari_saudara)$/, 30],
  [/^((ayah|ibu|wali)_hp|pend_(tk|sd|smp|sma)_lulus|keg[1-7]_tingkat|it[1-4]_level)$/, 30],
];

/** Pemeriksa satu isian (cermin sigarda.isian_periksa): teks galat, atau '' bila sah. Nilai dirapikan lebih dulu; kosong = menghapus isian. */
export function periksaIsian(kunci, nilai) {
  const batas = BATAS.find(([re]) => re.test(kunci))?.[1];
  if (!batas) return `Isian "${String(kunci ?? '').slice(0, 40)}" tidak dikenal.`;
  const v = rapikan(nilai);
  if (v.length > batas) return `Isian ${kunci} maksimal ${batas} karakter.`;
  if (TERLARANG.test(v)) return `Isian ${kunci} memuat karakter yang tidak diizinkan.`;
  if (v === '') return '';
  if (kunci === 'gol_darah') return GOLONGAN_DARAH.includes(v) ? '' : 'Golongan darah harus A, B, AB, atau O.';
  if (kunci === 'no_hp' || /^(ayah|ibu|wali)_hp$/.test(kunci)) return /^[0-9 +()./-]{8,20}$/.test(v) ? '' : 'Nomor telepon hanya boleh berisi angka, spasi, dan tanda + ( ) . / - (8-20 karakter).';
  if (kunci === 'tinggi' || kunci === 'berat') {
    if (!/^[0-9]{2,3}$/.test(v)) return `${kunci === 'tinggi' ? 'Tinggi badan' : 'Berat badan'} harus berupa angka bulat.`;
    const n = Number(v);
    if (kunci === 'tinggi' && (n < 50 || n > 250)) return 'Tinggi badan harus 50 sampai 250 cm.';
    if (kunci === 'berat' && (n < 20 || n > 250)) return 'Berat badan harus 20 sampai 250 kg.';
    return '';
  }
  if (kunci === 'anak_ke' || kunci === 'dari_saudara') return /^[0-9]{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 20 ? '' : 'Isi angka 1 sampai 20.';
  if (/^pend_(tk|sd|smp|sma)_lulus$/.test(kunci)) return /^[0-9]{4}$/.test(v) && Number(v) >= 1990 && Number(v) <= 2100 ? '' : 'Tahun lulus harus 1990 sampai 2100.';
  if (/^keg[1-7]_tingkat$/.test(kunci)) return TINGKAT_KEGIATAN.some((t) => t.id === v) ? '' : 'Tingkat kegiatan harus kwarran, kwarcab, atau kwarda.';
  if (/^it[1-4]_level$/.test(kunci)) return LEVEL_IT.some((t) => t.id === v) ? '' : 'Tingkat penguasaan harus bisa, cukup, atau kurang.';
  return '';
}

/** Pemeriksa isian tingkat profil (cermin sigarda.isian_periksa_profil): teks galat atau ''. Nilai kosong = tidak diubah. */
export function periksaProfil(kunci, nilai, hari = hariIni()) {
  const v = rapikan(nilai);
  if (!KUNCI_PROFIL.includes(kunci)) return `Isian "${String(kunci ?? '').slice(0, 40)}" tidak dikenal.`;
  if (v === '') return '';
  if (kunci === 'jk') return v === 'L' || v === 'P' ? '' : 'Jenis kelamin harus L (laki-laki) atau P (perempuan).';
  if (kunci === 'agama') return ['Islam', 'Katolik', 'Protestan', 'Hindu', 'Buddha', 'Khonghucu'].includes(v) ? '' : 'Agama tidak dikenal.';
  if (kunci === 'nta') return /^[0-9A-Za-z./ -]{1,40}$/.test(v) ? '' : 'NTA tidak valid: maksimal 40 karakter (huruf, angka, titik, garis miring, strip, spasi).';
  // lahir
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Tanggal lahir harus berbentuk TTTT-BB-HH.';
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  if (m < 1 || m > 12 || t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return 'Tanggal lahir tidak sah.';
  if (v < '1990-01-01' || v > hari) return 'Tanggal lahir tidak boleh sebelum tahun 1990 atau di masa depan.';
  return '';
}

/** Semua kunci isian (bukan profil) dalam urutan formulir. */
export const SEMUA_KUNCI = [
  'panggilan', 'tempat_lahir', 'alamat', 'gol_darah', 'no_hp', 'tinggi', 'berat', 'penyakit',
  ...ORANG.flatMap((o) => ['nama', 'hp', 'kerja', 'alamat'].map((b) => `${o.id}_${b}`)),
  'anak_ke', 'dari_saudara', ...urut(JUMLAH.saudara).flatMap((i) => [`sdr${i}_nama`, `sdr${i}_sebagai`]),
  ...JENJANG.flatMap((j) => [`pend_${j.id}_nama`, `pend_${j.id}_lulus`]),
  ...JENJANG.map((j) => `akd_${j.id}`), ...JENJANG.map((j) => `non_${j.id}`),
  ...urut(JUMLAH.kegiatan).flatMap((i) => [`keg${i}_nama`, `keg${i}_tingkat`]),
  ...urut(JUMLAH.bidang).flatMap((i) => [`bid${i}_nama`, `bid${i}_jenis`]),
  ...urut(JUMLAH.perangkat).flatMap((i) => [`it${i}_nama`, `it${i}_level`]),
];

export { ORANG };

/** Keadaan yang diminta ajakan sesudah masuk (sama seperti nomor WhatsApp: dapat dilewati, ditanyakan lagi di masuk berikutnya bila masih kurang). */
export const POKOK = [
  { id: 'whatsapp', label: 'Nomor WhatsApp' },
  { id: 'jk', label: 'Jenis kelamin' },
  { id: 'agama', label: 'Agama' },
  { id: 'lahir', label: 'Tanggal lahir' },
  { id: 'tempat_lahir', label: 'Tempat lahir' },
  { id: 'alamat', label: 'Alamat' },
  { id: 'ortu', label: 'Nama ayah, ibu, atau wali' },
];

/** Label isian pokok menurut kodenya (kode sama dengan yang dikembalikan sg_pemeriksaan_data pada dataDiriBelum). */
export const labelPokok = (kode) => POKOK.find((p) => p.id === kode)?.label ?? kode;

/**
 * Isian pokok yang belum lengkap: [label]. `akun` = { whatsapp, jenisKelamin, agama }, `isian` = { kunci: nilai }, `lahir` = 'YYYY-MM-DD' atau null.
 */
export function pokokKurang({ akun, isian = {}, lahir = null }) {
  const ada = {
    whatsapp: !!akun?.whatsapp,
    jk: !!akun?.jenisKelamin,
    agama: !!akun?.agama,
    lahir: !!lahir,
    tempat_lahir: !!isian.tempat_lahir,
    alamat: !!isian.alamat,
    ortu: !!(isian.ayah_nama || isian.ibu_nama || isian.wali_nama),
  };
  return POKOK.filter((p) => !ada[p.id]).map((p) => p.label);
}

/** Nama orang tua/wali untuk tanda tangan portofolio: ayah, lalu ibu, lalu wali; '' bila belum ada. */
export const namaOrangTua = (isian = {}) => isian.ayah_nama || isian.ibu_nama || isian.wali_nama || '';

/** Nilai formulir { kunci: teks } dari isian tersimpan (semua kunci ada, kosong bila belum). */
export const nilaiAwal = (isian = {}) => Object.fromEntries(SEMUA_KUNCI.map((k) => [k, isian[k] ?? '']));

/** Memeriksa seluruh isian formulir: { kunci: pesan } (kosong = semua sah). Kunci profil hanya diperiksa bila boleh diisi (`profil` = { jk, agama, lahir, nta }). */
export function periksaSemua(nilai, profil = {}, hari = hariIni()) {
  const galat = {};
  for (const k of SEMUA_KUNCI) { const p = periksaIsian(k, nilai[k]); if (p) galat[k] = p; }
  for (const k of KUNCI_PROFIL) { const p = periksaProfil(k, profil[k], hari); if (p) galat[k] = p; }
  return galat;
}
