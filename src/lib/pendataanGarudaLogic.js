/**
 * PENDATAAN CALON GARUDA (Tahap 3, H3; murni tanpa React). Menyusun tabel "Pendataan dan Verifikasi Syarat Awal Calon Penegak Garuda" (kolom mengikuti lembar kerja Gudep:
 * Nama, NTA/NIS, Tanggal Lantik Laksana, Masa Laksana, Tanggal Lahir, Usia, Status Kuota, Verifikasi Pembina) dari data aplikasi, untuk diunduh sebagai Excel dari menu Kelayakan.
 * Kolom "Saran aplikasi" hanya bantuan (semua syarat gerbang, masa Laksana >= 3 bulan, dan kuota); kolom "Verifikasi Pembina (Eligible)" dikosongkan untuk diputuskan Pembina.
 */
import { fmtTanggal, hariIni } from './format';
import { hitungGerbang, kuotaCalon, tanggalLahirPeserta } from './gerbangLogic';
import { pelantikanPeserta } from './pelantikanLogic';
import { usiaTeks } from './portofolioKwarcabLogic';

/** Selisih bulan penuh dari tanggal ISO `dari` sampai `sampai` (bulan yang belum genap tidak dihitung); null bila `dari` kosong atau sesudah `sampai`. */
export function selisihBulan(dari, sampai = hariIni()) {
  if (!dari || dari > sampai) return null;
  const [y1, m1, d1] = dari.split('-').map(Number);
  const [y2, m2, d2] = sampai.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

/**
 * Baris pendataan: Penegak yang sudah Calon Garuda atau seluruh SKU-nya selesai (`calon` = daftar Penegak itu, sudah disaring pemanggil), urut Calon terdaftar dulu lalu nama.
 * `data` = { calon, aktif (semua Penegak aktif, untuk kuota), progress, pelantikan, lahir, aturan, hari }. Hasil: [{ no, nama, kelas, nomor, tglLaksana, masaLaksana, tglLahir, usia, kuota, saran }].
 */
export function barisPendataan({ calon = [], aktif = calon, progress = {}, pelantikan = [], lahir = [], aturan, hari = hariIni() }) {
  const k = kuotaCalon(aktif, aturan);
  const urut = calon.slice().sort((a, b) => Number(!!b.calonGaruda) - Number(!!a.calonGaruda) || a.nama.localeCompare(b.nama, 'id'));
  return urut.map((u, i) => {
    const tanggalLahir = tanggalLahirPeserta(lahir, u.id);
    const laksana = pelantikanPeserta(pelantikan, u.id).laksana?.tanggal ?? null;
    const bulan = selisihBulan(laksana, hari);
    const g = hitungGerbang({ peserta: u, tanggalLahir, progress, aturan });
    const masuk = i < k.maks;
    const gerbangOk = g.ok === g.syarat.length;
    const masaOk = bulan !== null && bulan >= 3;
    const alasan = [!gerbangOk && 'syarat gerbang belum semua terpenuhi', !masaOk && 'masa Laksana belum 3 bulan atau pelantikan belum tercatat', !masuk && 'di luar kuota'].filter(Boolean);
    return {
      no: i + 1,
      nama: u.nama,
      kelas: u.kelas ?? '',
      nomor: u.nta || u.nis || '',
      tglLaksana: laksana ? fmtTanggal(laksana) : '',
      masaLaksana: bulan === null ? '' : `${bulan} bulan (${masaOk ? '>= 3 bulan' : '< 3 bulan'})`,
      tglLahir: tanggalLahir ? fmtTanggal(tanggalLahir) : '',
      usia: tanggalLahir ? `${usiaTeks(tanggalLahir, hari)} (${g.syarat.find((x) => x.id === 'usia')?.status === 'ok' ? 'dalam rentang' : 'di luar rentang'})` : '',
      kuota: masuk ? 'Masuk Kuota' : 'Di luar kuota',
      saran: alasan.length ? `Tidak: ${alasan.join('; ')}` : 'Ya',
    };
  });
}

export const KOLOM_PENDATAAN = [
  { header: 'No', key: 'no', lebar: 5, rata: 'center' },
  { header: 'Nama Lengkap', key: 'nama', lebar: 32 },
  { header: 'Kelas', key: 'kelas', lebar: 9, rata: 'center' },
  { header: 'NTA / NIS', key: 'nomor', lebar: 22 },
  { header: 'Tanggal Lantik Laksana', key: 'tglLaksana', lebar: 22 },
  { header: 'Masa Laksana', key: 'masaLaksana', lebar: 22 },
  { header: 'Tanggal Lahir', key: 'tglLahir', lebar: 18 },
  { header: 'Usia', key: 'usia', lebar: 34 },
  { header: 'Status Kuota', key: 'kuota', lebar: 16 },
  { header: 'Saran aplikasi (Eligible)', key: 'saran', lebar: 50 },
  { header: 'Verifikasi Pembina (Eligible)', key: 'verifikasi', lebar: 26 },
];

/** Lembar Excel pendataan: judul dua baris, kolom, dan baris. */
export function lembarPendataan({ baris, aturan, hari = hariIni(), gudep }) {
  return {
    nama: 'Pendataan Calon Garuda',
    judul: [
      `Pendataan dan Verifikasi Syarat Awal Calon Penegak Garuda - ${gudep?.nama ?? ''}`.trim(),
      `Per ${fmtTanggal(hari)}. Kuota maksimal ${aturan.kuotaPersen}% dari Penegak aktif; rentang lahir sah ${fmtTanggal(aturan.lahirDari)} s.d. ${fmtTanggal(aturan.lahirSampai)}. Kolom saran hanya bantuan; verifikasi diputuskan Pembina.`,
    ],
    kolom: KOLOM_PENDATAAN,
    baris: baris.map((b) => ({ ...b, verifikasi: '' })),
  };
}
