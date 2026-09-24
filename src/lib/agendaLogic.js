/**
 * AGENDA TAHUNAN (tahap L6, murni tanpa React). Cermin syarat di sg_agenda_simpan dan sigarda.agenda_* (SQL), dijaga uji/agenda.mjs.
 * Bentuk satu kegiatan: { id, tahunAjaran, jenis, judul, tanggal, keterangan, pesertaTerkait, lewatiBatas }
 */

import { hariIni as hariIniWib } from './format';

/** Jenis baku (dengan judul bawaan yang bisa diubah pengguna) + 'lainnya' (judul bebas). Judul bawaan sama dengan
 * sigarda.kegiatan_judul_bawaan (SQL) untuk jenis yang juga didukung alur usulan (lihat JENIS_USULAN di kegiatanLogic.js). */
export const JENIS_AGENDA = [
  { id: 'musyawarah', label: 'Musyawarah Ambalan', judulBawaan: 'Musyawarah Ambalan' },
  { id: 'naik_kelas', label: 'Naik Kelas', judulBawaan: 'Naik Kelas' },
  { id: 'sidang', label: 'Sidang Dewan Kehormatan', judulBawaan: 'Sidang Dewan Kehormatan' },
  { id: 'pelantikan_bantara', label: 'Pembayatan dan Pelantikan Bantara', judulBawaan: 'Pembayatan dan Pelantikan Bantara' },
  { id: 'pelantikan_laksana', label: 'Pelantikan Laksana', judulBawaan: 'Pelantikan Laksana' },
  { id: 'pelantikan_garuda', label: 'Pelantikan Garuda', judulBawaan: 'Pelantikan Garuda' },
  { id: 'pengembaraan', label: 'Pengembaraan', judulBawaan: 'Pengembaraan' },
  { id: 'perkemahan', label: 'Perkemahan', judulBawaan: 'Perkemahan' },
  { id: 'gelora_saka_expo', label: 'Gelora Saka Expo', judulBawaan: 'Gelora Saka Expo' },
  { id: 'gladi_tangguh_1', label: 'Gladi Tangguh 1', judulBawaan: 'Gladi Tangguh 1' },
  { id: 'gladi_tangguh_2', label: 'Gladi Tangguh 2', judulBawaan: 'Gladi Tangguh 2' },
  { id: 'penempuhan_sku_laksana', label: 'Penempuhan SKU Laksana', judulBawaan: 'Penempuhan SKU Laksana' },
  { id: 'ptgd', label: 'PTGD (Penerimaan Tamu Gugus Depan)', judulBawaan: 'PTGD (Penerimaan Tamu Gugus Depan)' },
  { id: 'pembekalan_dewan', label: 'Pembekalan Dewan Ambalan Angkatan Berikutnya', judulBawaan: 'Pembekalan Dewan Ambalan Angkatan Berikutnya' },
  { id: 'lainnya', label: 'Lainnya', judulBawaan: '' },
];
const PETA_JENIS = Object.fromEntries(JENIS_AGENDA.map((j) => [j.id, j]));

export const labelJenisAgenda = (jenis) => PETA_JENIS[jenis]?.label ?? jenis;
export const judulBawaanJenis = (jenis) => PETA_JENIS[jenis]?.judulBawaan ?? '';

/** Batas keras Musyawarah Ambalan: harus sebelum 1 Juli tahun kedua tahun ajaran (ISO date, string). */
export function batasMusyawarah(tahunAjaran) {
  const tahun2 = String(tahunAjaran ?? '').split('/')[1];
  return tahun2 && /^\d{4}$/.test(tahun2) ? `${tahun2}-07-01` : null;
}

/** Aturan isian sama dengan sg_agenda_simpan di SQL. `lewatiBatasBoleh` = pemanggil benar-benar Pembina (server yang menegakkan). */
export function periksaAgenda(a, lewatiBatasBoleh = false) {
  const galat = {};
  if (!/^[0-9]{4}\/[0-9]{4}$/.test(a.tahunAjaran ?? '') || Number(a.tahunAjaran.split('/')[1]) !== Number(a.tahunAjaran.split('/')[0]) + 1) {
    galat.tahunAjaran = 'Tahun ajaran tidak sah. Contoh: 2026/2027.';
  }
  if (!JENIS_AGENDA.some((j) => j.id === a.jenis)) galat.jenis = 'Pilih jenis kegiatan.';
  const judul = String(a.judul ?? '').trim();
  if (!judul) galat.judul = 'Judul wajib diisi.';
  else if (judul.length > 120) galat.judul = 'Maksimal 120 karakter.';
  if (!a.tanggal) galat.tanggal = 'Tanggal wajib diisi.';
  if ((a.keterangan ?? '').length > 500) galat.keterangan = 'Maksimal 500 karakter.';
  const batas = batasMusyawarah(a.tahunAjaran);
  if (a.jenis === 'musyawarah' && a.tanggal && batas && a.tanggal >= batas && !(a.lewatiBatas && lewatiBatasBoleh)) {
    galat.tanggal = `Harus sebelum 1 Juli ${batas.slice(0, 4)} (sebelum Naik Kelas dan tahun ajaran baru).` + (lewatiBatasBoleh ? ' Centang "Lewati batas" bila Dewan Ambalan sudah mengusulkannya.' : ' Hanya Pembina yang dapat melewati batas ini.');
  }
  return galat;
}

/** "H-30", "H-1", "Hari ini", atau "Lewat" (relatif terhadap `hariIni`, ISO date string, bawaan hari ini nyata). */
export function hariMenuju(tanggal, hariIni = hariIniWib()) {
  const selisih = Math.round((new Date(tanggal) - new Date(hariIni)) / 86400000);
  if (selisih < 0) return 'Lewat';
  if (selisih === 0) return 'Hari ini';
  return `H-${selisih}`;
}

/** Kegiatan agenda mendatang (tanggal >= hariIni), terurut tanggal terdekat lebih dulu. */
export const agendaMendatang = (daftar = [], hariIni = hariIniWib()) =>
  daftar.filter((a) => a.tanggal >= hariIni).sort((a, b) => a.tanggal.localeCompare(b.tanggal));
