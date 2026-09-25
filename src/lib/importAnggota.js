/**
 * IMPORT ANGGOTA DARI EXCEL (.xlsx)
 *
 * Tiga kelompok dapat diimpor: Penegak (peserta), Dewan Ambalan, dan Pembina. Admin Gudep tidak
 * diimpor. Penegak memakai kolom lengkap dan NIS WAJIB (NIS menjadi nama pengguna untuk masuk);
 * Dewan Ambalan dan Pembina cukup nama, dengan nama pengguna dan PIN awal opsional (dibuat otomatis).
 *
 * Alur: unduh template -> isi -> unggah -> pratinjau dan pemeriksaan -> impor.
 * `periksaBaris` murni (mudah diuji). Pembaca file dan pembuat template ada di src/lib/importAnggotaExcel.js (dimuat bersama halaman yang memakainya, bukan paket awal).
 * Pemeriksaan ini hanya untuk umpan balik cepat; server memeriksa ulang setiap baris.
 */
import { KELOMPOK_PENGGUNA, cocokKelompok } from '../config';
import { AGAMA } from '../data/skuData';
import { formatPinSah, pinLemah } from './pinLogic';
import { JABATAN_DEWAN, JABATAN_TUNGGAL, normalisasiJabatanDewan } from './dewanLogic';
import { normalisasiRombel, PESAN_ROMBEL } from './rombelLogic';
import { PESAN_JK, normalisasiJenisKelamin } from './jenisKelaminLogic';
import { periksaTanggalLahir } from './gerbangLogic';

export const POLA_USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;
/** Nomor Tanda Anggota Pramuka (opsional). Sama dengan aturan di server (sg_anggota_nta_atur). */
export const POLA_NTA = /^[0-9A-Za-z./ -]{1,40}$/;
const PESAN_PIN = 'PIN awal harus 6 angka dan tidak boleh sama semua atau berurutan';
const pinAwalSah = (pin) => formatPinSah(pin) && !pinLemah(pin);

export const MAKS_BARIS = 500;
export const NAMA_LEMBAR = 'Anggota';

/** Kelompok yang dapat diimpor (id sama dengan KELOMPOK_PENGGUNA). */
export const KELOMPOK_IMPOR = ['peserta', 'dewan', 'pembina'];

export const kelompokDari = (id) => KELOMPOK_PENGGUNA.find((k) => k.id === id);

const KOLOM_PENEGAK = [
  { header: 'Nama Lengkap', key: 'nama', lebar: 32 },
  { header: 'Jenis Kelamin (opsional)', key: 'jk', lebar: 22 },
  { header: 'NIS', key: 'nis', lebar: 14 },
  { header: 'Rombel', key: 'kelas', lebar: 10 },
  { header: 'Sangga (opsional)', key: 'sangga', lebar: 20 },
  { header: 'Agama (opsional)', key: 'agama', lebar: 18 },
  { header: 'NTA (opsional)', key: 'nta', lebar: 22 },
  { header: 'PIN Awal (opsional)', key: 'pin', lebar: 20 },
  { header: 'Tanggal Lahir (opsional)', key: 'lahir', lebar: 22 },
];
// Dewan Ambalan: jabatan (Pradana dan seterusnya) dan NTA opsional; Pradana dan Pradani dipakai pada tanda tangan dokumen.
const KOLOM_DEWAN = [
  { header: 'Nama Lengkap', key: 'nama', lebar: 40 },
  { header: 'Jenis Kelamin', key: 'jk', lebar: 16 },
  { header: 'Nama Pengguna (opsional)', key: 'username', lebar: 26 },
  { header: 'Jabatan Dewan (opsional)', key: 'jabatanDewan', lebar: 24 },
  { header: 'NTA (opsional)', key: 'nta', lebar: 22 },
  { header: 'PIN Awal (opsional)', key: 'pin', lebar: 22 },
];
const KOLOM_PENGURUS = [
  { header: 'Nama Lengkap', key: 'nama', lebar: 40 },
  { header: 'Jenis Kelamin', key: 'jk', lebar: 16 },
  { header: 'Nama Pengguna (opsional)', key: 'username', lebar: 26 },
  { header: 'PIN Awal (opsional)', key: 'pin', lebar: 22 },
];
// Pembina memiliki agama (butir agama hanya boleh diuji Pembina yang seagama); Dewan Ambalan tidak.
const KOLOM_PEMBINA = [
  { header: 'Nama Lengkap', key: 'nama', lebar: 40 },
  { header: 'Jenis Kelamin', key: 'jk', lebar: 16 },
  { header: 'Nama Pengguna (opsional)', key: 'username', lebar: 26 },
  { header: 'Agama (opsional)', key: 'agama', lebar: 18 },
  { header: 'PIN Awal (opsional)', key: 'pin', lebar: 22 },
];

export const kolomTemplate = (kelompok = 'peserta') => (kelompok === 'peserta' ? KOLOM_PENEGAK : kelompok === 'pembina' ? KOLOM_PEMBINA : kelompok === 'dewan' ? KOLOM_DEWAN : KOLOM_PENGURUS);
export const KOLOM_TEMPLATE = KOLOM_PENEGAK;

/* ---------- Normalisasi ---------- */

const ALIAS_AGAMA = {
  islam: 'Islam',
  katolik: 'Katolik', katholik: 'Katolik',
  protestan: 'Protestan', kristen: 'Protestan', kristenprotestan: 'Protestan',
  hindu: 'Hindu',
  buddha: 'Buddha', budha: 'Buddha', buddhis: 'Buddha',
  khonghucu: 'Khonghucu', konghucu: 'Khonghucu',
};

export const hurufSaja = (t) => String(t ?? '').toLowerCase().replace(/[^a-z]/g, '');

export function normalisasiAgama(teks) {
  return ALIAS_AGAMA[hurufSaja(teks)] ?? '';
}

const BULAN = { januari: 1, jan: 1, februari: 2, feb: 2, pebruari: 2, maret: 3, mar: 3, april: 4, apr: 4, mei: 5, juni: 6, jun: 6, juli: 7, jul: 7, agustus: 8, agu: 8, agt: 8, ags: 8, aug: 8, september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, november: 11, nov: 11, nop: 11, desember: 12, des: 12, dec: 12 };
export const PESAN_LAHIR = 'Tulis tanggal lahir seperti 15/03/2008 (tanggal/bulan/tahun), 15 Maret 2008, atau 2008-03-15.';

const isoSah = (y, m, d) => {
  if (y < 1 || m < 1 || m > 12 || d < 1) return '';
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return '';
  return String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
};

/**
 * Tanggal lahir dari isian Excel menjadi 'YYYY-MM-DD' atau '' bila tidak dikenal. Diterima: 15/03/2008, 15-03-2008, 15.03.2008 (tanggal, bulan, tahun),
 * 2008-03-15, "15 Maret 2008" (nama bulan Indonesia, boleh singkatan), dan nomor seri tanggal Excel (mis. 39522).
 */
export function normalisasiTanggalLahir(teks) {
  const t = String(teks ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return '';
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return isoSah(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return isoSah(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2}) ([a-z]+)\.? (\d{4})$/.exec(t);
  if (m && BULAN[m[2]]) return isoSah(Number(m[3]), BULAN[m[2]], Number(m[1]));
  m = /^(\d{5})$/.exec(t); // nomor seri Excel (hari sejak 30 Des 1899)
  if (m && Number(t) >= 10000 && Number(t) <= 60000) return new Date(Date.UTC(1899, 11, 30) + Number(t) * 86400000).toISOString().slice(0, 10);
  return '';
}

/* ---------- Pemeriksaan ---------- */

/**
 * Menilai setiap baris. Hasil: [{ no, data, galat: [pesan], siap }].
 * Baris tidak siap bila ada isian wajib yang kosong/keliru, atau anggota sudah terdaftar, baik pada
 * data yang ada maupun di file.
 *   Penegak: NIS wajib dan unik (NIS = nama pengguna untuk masuk).
 *   Dewan Ambalan dan Pembina: nama pengguna (bila diisi) unik; bila tidak diisi, nama yang sama pada
 *   jabatan yang sama dianggap data ganda (nama pengguna dibuat otomatis oleh server).
 */
export function periksaBaris(baris, users, kelompok = 'peserta') {
  if (kelompok !== 'peserta') return periksaPengurus(baris, users, kelompok);
  const dipakai = new Set(users.flatMap((u) => [u.username, u.nis]).filter(Boolean).map((x) => String(x).toLowerCase()));

  return baris.map((b) => {
    const galat = [];
    const agama = normalisasiAgama(b.agama);
    const nis = String(b.nis ?? '').trim().toLowerCase();
    if (!b.nama) galat.push('Nama kosong');
    // Data awal Penegak hanya nama, NIS, dan rombel (Tahap 3, H1). Jenis kelamin, sangga, agama, NTA, dan tanggal lahir opsional: sisanya diisi Penegak sendiri di Akun saya.
    const jk = normalisasiJenisKelamin(b.jk);
    if (b.jk && !jk) galat.push(`Jenis kelamin "${b.jk}" tidak dikenal. ${PESAN_JK}`);
    if (!nis) galat.push('NIS kosong (NIS dipakai untuk masuk)');
    else if (!POLA_USERNAME.test(nis)) galat.push('NIS harus 3 sampai 32 karakter huruf atau angka');
    else if (dipakai.has(nis)) galat.push('NIS sudah terdaftar');
    const kelas = normalisasiRombel(b.kelas);
    if (!b.kelas) galat.push('Rombel kosong');
    else if (!kelas) galat.push(`Rombel "${b.kelas}" tidak sah. ${PESAN_ROMBEL}`);
    if (b.agama && !agama) galat.push(`Agama "${b.agama}" tidak dikenal (pilih: ${AGAMA.join(', ')})`);
    if (b.nta && !POLA_NTA.test(b.nta)) galat.push('NTA tidak valid (maksimal 40 karakter: huruf, angka, titik, garis miring, strip, spasi)');
    const lahir = b.lahir ? normalisasiTanggalLahir(b.lahir) : '';
    if (b.lahir) {
      if (!lahir) galat.push(`Tanggal lahir "${b.lahir}" tidak dikenal. ${PESAN_LAHIR}`);
      else { const p = periksaTanggalLahir({ tanggal: lahir }); if (p) galat.push(p); }
    }
    if (b.pin && !pinAwalSah(b.pin)) galat.push(PESAN_PIN);

    if (!galat.length) dipakai.add(nis); // duplikat di dalam file yang sama ikut terdeteksi
    return { no: b.no, data: { ...b, jk, jkAsli: b.jk ?? '', nis: b.nis ? String(b.nis).trim() : '', kelas: kelas || b.kelas, agama, agamaAsli: b.agama, lahir, lahirAsli: b.lahir ?? '' }, galat, siap: galat.length === 0 };
  });
}

function periksaPengurus(baris, users, kelompok) {
  const k = kelompokDari(kelompok);
  const namaAda = new Set(users.filter((u) => cocokKelompok(k, u)).map((u) => u.nama.trim().toLowerCase()));
  const dipakai = new Set(users.map((u) => u.username).filter(Boolean).map((x) => x.toLowerCase()));
  const tunggalDiFile = new Set(); // Pradana/Pradani yang sudah muncul pada baris siap sebelumnya

  return baris.map((b) => {
    const galat = [];
    const username = String(b.username ?? '').trim().toLowerCase();
    const nama = (b.nama ?? '').trim().toLowerCase();
    if (!b.nama) galat.push('Nama kosong');
    const jk = normalisasiJenisKelamin(b.jk);
    if (!b.jk) galat.push('Jenis kelamin kosong');
    else if (!jk) galat.push(`Jenis kelamin "${b.jk}" tidak dikenal. ${PESAN_JK}`);
    if (username) {
      if (!POLA_USERNAME.test(username)) galat.push('Nama pengguna harus 3 sampai 32 karakter: huruf kecil, angka, titik, garis bawah, atau strip');
      else if (dipakai.has(username)) galat.push('Nama pengguna sudah dipakai');
    } else if (b.nama && namaAda.has(nama)) {
      galat.push(`Nama sudah terdaftar sebagai ${k.label}. Isi kolom Nama Pengguna bila memang orang yang berbeda`);
    }
    // Agama hanya untuk Pembina dan opsional; Dewan Ambalan tidak berAgama.
    const agama = kelompok === 'pembina' && b.agama ? normalisasiAgama(b.agama) : '';
    if (kelompok === 'pembina' && b.agama && !agama) galat.push(`Agama "${b.agama}" tidak dikenal (pilih: ${AGAMA.join(', ')})`);
    // Jabatan Dewan Ambalan (opsional) dan NTA: hanya untuk Dewan. Pradana/Pradani hanya satu orang.
    const jabatanDewan = kelompok === 'dewan' && b.jabatanDewan ? normalisasiJabatanDewan(b.jabatanDewan) : '';
    if (kelompok === 'dewan' && b.jabatanDewan && !jabatanDewan) galat.push(`Jabatan "${b.jabatanDewan}" tidak dikenal (pilih: ${JABATAN_DEWAN.join(', ')})`);
    else if (JABATAN_TUNGGAL.includes(jabatanDewan)) {
      const pemegang = users.find((u) => u.role === 'penguji' && u.jabatan === 'Dewan Ambalan' && u.jabatanDewan === jabatanDewan);
      if (pemegang) galat.push(`${jabatanDewan} sudah dijabat ${pemegang.nama} (ubah jabatannya lebih dulu lewat Ubah anggota)`);
      else if (tunggalDiFile.has(jabatanDewan)) galat.push(`${jabatanDewan} muncul lebih dari satu kali pada file`);
    }
    if (kelompok === 'dewan' && b.nta && !POLA_NTA.test(b.nta)) galat.push('NTA tidak valid (maksimal 40 karakter: huruf, angka, titik, garis miring, strip, spasi)');
    if (b.pin && !pinAwalSah(b.pin)) galat.push(PESAN_PIN);
    if (!galat.length) { // duplikat di dalam file yang sama ikut terdeteksi
      if (username) dipakai.add(username);
      else namaAda.add(nama);
      if (JABATAN_TUNGGAL.includes(jabatanDewan)) tunggalDiFile.add(jabatanDewan);
    }
    return { no: b.no, data: { ...b, jk, jkAsli: b.jk ?? '', agama, agamaAsli: kelompok === 'pembina' ? b.agama ?? '' : '', jabatanDewan, jabatanAsli: b.jabatanDewan ?? '' }, galat, siap: galat.length === 0 };
  });
}

