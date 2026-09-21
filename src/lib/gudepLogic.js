/**
 * DATA GUDEP (murni, tanpa React)
 *
 * Identitas Gugus Depan dan pejabatnya tidak lagi ditulis di kode: Admin Gudep mengisinya di menu "Data Gudep", tersimpan sebagai satu
 * objek JSON pada pengaturan `gudep.data` (sg_gudep_simpan). Nilai bawaan ada di src/config.js (GUDEP_BAWAAN) dan dipakai selama belum ada
 * data tersimpan, dan untuk isian yang belum pernah tersimpan. Aturan isian di sini harus sama dengan sg_gudep_simpan di SQL (dijaga oleh pengujian).
 *
 * Bentuk: { nama, singkat, sekolah, alamat, kota, nomorGudep, kwarran, kwarcab, kodeSurat, telepon, email,
 *           pembina, kamabigus: { jabatan, nama, nta, nip } }
 * Pradana dan Pradani bukan bagian dari data gudep: diambil dari anggota Dewan Ambalan berjabatan itu (src/lib/dewanLogic.js).
 */
import { GUDEP_BAWAAN } from '../config';

export const KOLOM_TEKS = ['nama', 'singkat', 'sekolah', 'alamat', 'kota', 'nomorGudep', 'kwarran', 'kwarcab', 'kodeSurat', 'telepon', 'email'];
export const KOLOM_ORANG = ['pembina', 'kamabigus'];
export const BAGIAN_ORANG = ['jabatan', 'nama', 'nta', 'nip'];
/** Isian yang boleh dipakai tanpa login (sg_gudep_publik): nama gudep, ambalan, sekolah, kota. */
export const KOLOM_PUBLIK = ['nama', 'singkat', 'sekolah', 'kota'];

export const BATAS_TEKS = { nama: 120, singkat: 120, sekolah: 120, alamat: 200, kota: 60, nomorGudep: 40, kwarran: 80, kwarcab: 80, kodeSurat: 30, telepon: 40, email: 100 };
export const WAJIB_TEKS = ['nama', 'singkat', 'sekolah', 'kota'];
const POLA_KODE_SURAT = /^[A-Za-z0-9._/-]*$/;
const POLA_TELEPON = /^[0-9 +()./-]*$/;
const POLA_EMAIL = /^[^@ ]+@[^@ ]+\.[^@ ]+$/;
const POLA_NTA = /^[0-9A-Za-z./ -]{0,40}$/;

/** Spasi ganda dan tepi dirapikan, sama dengan sigarda.rapikan di SQL. */
export const rapikan = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Penjelasan tiap orang: judul kartu, dipakai untuk apa, dan jabatan bawaan. */
export const KETERANGAN_ORANG = {
  pembina: { judul: 'Pembina Gudep / Ka Gudep', pakai: 'Penanda tangan surat intern sekolah, kartu SKU, dan raport ekstrakurikuler.' },
  kamabigus: { judul: 'Kamabigus / Kepala Sekolah', pakai: 'Penanda tangan surat keluar sekolah (Ketua Majelis Pembimbing Gugus Depan).' },
};

/**
 * Menggabungkan data tersimpan di atas `dasar`: hanya isian yang dikenal. Isian yang TIDAK ADA (belum pernah disimpan) memakai nilai dasar;
 * isian yang ada tetapi kosong tetap kosong (Admin sengaja mengosongkannya). Mengembalikan objek baru yang lengkap.
 */
export function gabungGudep(dasar, data) {
  const hasil = {};
  const d = data && typeof data === 'object' ? data : {};
  for (const k of KOLOM_TEKS) {
    hasil[k] = typeof d[k] === 'string' ? rapikan(d[k]) : dasar[k] ?? '';
  }
  for (const o of KOLOM_ORANG) {
    const sumber = d[o] && typeof d[o] === 'object' ? d[o] : {};
    hasil[o] = {};
    for (const b of BAGIAN_ORANG) {
      hasil[o][b] = typeof sumber[b] === 'string' ? rapikan(sumber[b]) : dasar[o]?.[b] ?? '';
    }
  }
  return hasil;
}

/** Salinan data lengkap untuk formulir (semua isian berupa teks, tidak pernah undefined). */
export const untukForm = (gudep) => gabungGudep({}, gudep);

/**
 * Pemeriksaan isian: { 'nama': pesan, 'pembina.nta': pesan, ... } (kosong = sah). Sama dengan sg_gudep_simpan; pesannya lebih menuntun.
 * Isian dirapikan lebih dulu (spasi ganda dan tepi).
 */
export function periksaGudep(gudep) {
  const g = untukForm(gudep);
  const galat = {};
  for (const k of KOLOM_TEKS) {
    const v = g[k];
    if (WAJIB_TEKS.includes(k) && !v) galat[k] = 'Wajib diisi.';
    else if (v.length > BATAS_TEKS[k]) galat[k] = `Maksimal ${BATAS_TEKS[k]} karakter.`;
    else if (k === 'kodeSurat' && !POLA_KODE_SURAT.test(v)) galat[k] = 'Hanya huruf, angka, dan tanda . _ / -.';
    else if (k === 'telepon' && !POLA_TELEPON.test(v)) galat[k] = 'Hanya angka, spasi, dan tanda + ( ) . / -.';
    else if (k === 'email' && v && !POLA_EMAIL.test(v)) galat[k] = 'Alamat email tidak sah.';
  }
  for (const o of KOLOM_ORANG) {
    const p = g[o];
    if (p.jabatan.length > 80) galat[`${o}.jabatan`] = 'Maksimal 80 karakter.';
    if (p.nama.length > 120) galat[`${o}.nama`] = 'Maksimal 120 karakter.';
    for (const b of ['nta', 'nip']) if (!POLA_NTA.test(p[b])) galat[`${o}.${b}`] = 'Hanya huruf, angka, spasi, dan tanda / . - (maksimal 40 karakter).';
  }
  if (!g.pembina.nama) galat['pembina.nama'] = 'Nama Pembina Gudep wajib diisi.';
  if (!g.pembina.jabatan) galat['pembina.jabatan'] = 'Jabatan Pembina Gudep wajib diisi.';
  return galat;
}

/** Sama persis (setelah dirapikan)? Dipakai untuk menandai formulir yang berubah. */
export const samaGudep = (a, b) => JSON.stringify(untukForm(a)) === JSON.stringify(untukForm(b));

/** "Ambalan Gajah Mada/Christina M.T": kata Ambalan ditambahkan bila belum ada di depan nama. */
export const namaAmbalan = (g) => (/^ambalan\b/i.test(g.singkat) ? g.singkat : `Ambalan ${g.singkat}`);

/** Baris identitas kop surat: "Gudep No. 10.701. Alamat" dan kontak (telepon, email) bila ada. */
export const barisKop = (g) => ({
  alamat: `${g.nomorGudep ? `Gudep No. ${g.nomorGudep}. ` : ''}${g.alamat}`.trim(),
  kontak: [g.telepon && `Telp. ${g.telepon}`, g.email].filter(Boolean).join(', '),
});

/** Penanda tangan surat menurut jenis surat: 'intern' = Pembina Gudep / Ka Gudep; 'keluar' = Kamabigus / Kepala Sekolah. */
export const penandaTanganSurat = (g, jenis) => (jenis === 'keluar' ? g.kamabigus : g.pembina);

/** Kepingan publik (dipakai halaman masuk dan verifikasi): hanya kolom yang boleh dilihat tanpa login. */
export const kepinganPublik = (g) => Object.fromEntries(KOLOM_PUBLIK.map((k) => [k, g[k]]));

export { GUDEP_BAWAAN };
