/**
 * LAPORAN BERJENJANG TAHUNAN (tahap L8, murni tanpa React). Menghimpun rekap dari modul lain (keanggotaan, agenda, SKU,
 * absensi, iuran) untuk satu periode pilihan gudep -> Kwartir Ranting -> Kwartir Cabang, jadi satu berkas siap kirim.
 * TIDAK ada RPC/tabel baru: seluruhnya disusun dari data yang sudah dimuat client (users, progress, agenda) atau lewat
 * fungsi server yang sudah ada dan sudah menerima rentang tanggal bebas (muatHadirRentang, muatIuranAgregat).
 * Dijaga uji/laporan.mjs.
 */
import { rentangPeriode } from './absensiLogic';
import { pesertaDenganPeran, tanggalLulusTingkat } from './skuLogic';
import { tingkatRombel } from './naikKelasLogic';

/** Dua jenis periode yang dapat dipilih pengguna (bukan salah satu tetap): tahun ajaran (konsisten dengan data SIGARDA lain) atau tahun kalender (kebiasaan registrasi ulang Kwarcab). */
export const JENIS_PERIODE = [
  { id: 'ajaran', label: 'Tahun Ajaran (Juli-Juni)' },
  { id: 'kalender', label: 'Tahun Kalender (Januari-Desember)' },
];

/** Tahun kalender yang dapat dipilih: 3 tahun ke belakang sampai tahun ini, terbaru dulu. */
export function daftarTahunKalender(sekarang = new Date()) {
  const y = sekarang.getFullYear();
  const hasil = [];
  for (let t = y; t >= y - 3; t -= 1) hasil.push(String(t));
  return hasil;
}

/**
 * Rentang tanggal satu periode laporan. `nilai` = tahun ajaran '2026/2027' untuk jenis 'ajaran' (dihitung sama dengan
 * rentangPeriode(..., 'setahun') di absensiLogic.js, Juli-Juni), atau tahun '2026' untuk jenis 'kalender' (Januari-Desember).
 */
export function rentangLaporan(jenis, nilai) {
  if (jenis === 'kalender') {
    const y = String(nilai);
    return { mulai: `${y}-01-01`, akhir: `${y}-12-31`, label: `Tahun ${y}` };
  }
  const r = rentangPeriode(nilai, 'setahun');
  return { ...r, label: `Tahun Ajaran ${nilai}` };
}

const TINGKATAN = [['X', 1], ['XI', 2], ['XII', 3]];
const JUMLAH_KOSONG = { lakiLaki: 0, perempuan: 0, calonBantara: 0, calonLaksana: 0, calonGaruda: 0, total: 0 };

/**
 * Rekap keanggotaan Penegak AKTIF per tingkat (X/XI/XII): jumlah per jenis kelamin dan peran turunan, plus baris Total.
 * SNAPSHOT saat laporan dibuat (bukan rentang waktu) -- sama seperti sensus "data potensi" Kwarcab, bukan rekap kejadian.
 */
export function rekapKeanggotaan(users, progress) {
  const aktif = pesertaDenganPeran(progress, users).filter((u) => (u.status ?? 'aktif') === 'aktif');
  const baris = TINGKATAN.map(([label, no]) => {
    const grup = aktif.filter((u) => tingkatRombel(u.kelas) === no);
    return {
      tingkat: label,
      lakiLaki: grup.filter((u) => u.jenisKelamin === 'L').length,
      perempuan: grup.filter((u) => u.jenisKelamin === 'P').length,
      calonBantara: grup.filter((u) => u.peran === 'calon-bantara').length,
      calonLaksana: grup.filter((u) => u.peran === 'calon-laksana').length,
      calonGaruda: grup.filter((u) => u.peran === 'calon-garuda').length,
      total: grup.length,
    };
  });
  const total = baris.reduce((acc, b) => ({
    tingkat: 'Total',
    lakiLaki: acc.lakiLaki + b.lakiLaki, perempuan: acc.perempuan + b.perempuan,
    calonBantara: acc.calonBantara + b.calonBantara, calonLaksana: acc.calonLaksana + b.calonLaksana,
    calonGaruda: acc.calonGaruda + b.calonGaruda, total: acc.total + b.total,
  }), { tingkat: 'Total', ...JUMLAH_KOSONG });
  return [...baris, total];
}

/**
 * Pencapaian SKU pada rentang [mulai, akhir]: berapa Penegak yang LULUS Bantara/Laksana atau mendaftar Calon Garuda pada
 * rentang itu. Dihitung dari SEMUA Penegak (bukan hanya yang aktif sekarang) -- seorang Penegak bisa lulus Laksana lalu
 * jadi alumni pada tahun ajaran yang sama, dan pencapaiannya tetap harus terhitung untuk periode itu.
 */
export function rekapPencapaianSku(users, progress, mulai, akhir) {
  const dalamRentang = (tgl) => !!tgl && tgl >= mulai && tgl <= akhir;
  const peserta = users.filter((u) => u.role === 'peserta');
  let bantaraLulus = 0;
  let laksanaLulus = 0;
  for (const u of peserta) {
    if (dalamRentang(tanggalLulusTingkat(progress, u, 'Bantara'))) bantaraLulus += 1;
    if (dalamRentang(tanggalLulusTingkat(progress, u, 'Laksana'))) laksanaLulus += 1;
  }
  const garudaBaru = peserta.filter((u) => dalamRentang(u.calonGaruda)).length;
  return { bantaraLulus, laksanaLulus, garudaBaru };
}

/** Kegiatan agenda pada rentang [mulai, akhir], tanggal terdekat dulu. */
export const rekapKegiatan = (agenda, mulai, akhir) =>
  (agenda ?? []).filter((a) => a.tanggal >= mulai && a.tanggal <= akhir).sort((a, b) => a.tanggal.localeCompare(b.tanggal));

/** Sesi absensi (satu baris per Jumat) pada rentang [mulai, akhir], dari data absensi yang sudah dimuat untuk rentang itu. */
export const sesiRentang = (absensi, mulai, akhir) =>
  Object.values(absensi?.sesi ?? {}).filter((s) => s.tanggal >= mulai && s.tanggal <= akhir).sort((a, b) => a.tanggal.localeCompare(b.tanggal));

/** Nama berkas (tanpa akhiran) untuk satu rentang laporan. */
export const namaFileLaporan = (rentang) => `Laporan-Tahunan-${rentang.label.replace(/\s+/g, '-')}`;
