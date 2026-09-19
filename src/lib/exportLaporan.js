/**
 * Susunan lembar Excel untuk laporan absensi dan portofolio Garuda.
 * Fungsi `susun...` murni (mudah diuji); `unduh...` memicu pengunduhan di browser.
 */
import { GUDEP, AMBANG_HADIR } from '../config';
import { ITEM_PORTOFOLIO } from '../data/portofolioData';
import { PERAN } from './skuLogic';
import { PERIODE, STATUS_ABSEN } from './absensiLogic';
import { getItem } from './portofolioLogic';
import { fmtTanggal, fmtTglPendek, hariIni } from './format';
import { unduhXlsx } from './exportXlsx';

const WARNA_ABSEN = { H: 'FFD1FAE5', I: 'FFDBEAFE', S: 'FFFEF3C7', A: 'FFFEE2E2' };
const MERAH_MUDA = 'FFFEE2E2';

const teksFilter = (filter) => {
  const bagian = [];
  if (filter.q) bagian.push(`pencarian "${filter.q}"`);
  if (filter.sangga) bagian.push(filter.sangga);
  if (filter.kelas) bagian.push(`kelas ${filter.kelas}`);
  if (filter.peran) bagian.push(PERAN[filter.peran].singkat);
  return bagian.length ? bagian.join(', ') : 'semua anggota';
};

/* --------------------------------- ABSENSI --------------------------------- */

export function susunAbsensiXlsx({ tahunAjaran, periode, rekap, sesiList, filter }) {
  const judul = [
    'Rekap Absensi Latihan Rutin Jumat',
    `${GUDEP.nama}. Tahun Ajaran ${tahunAjaran}, ${PERIODE[periode]}`,
    `Filter: ${teksFilter(filter)}. Pertemuan terlaksana: ${sesiList.length}. Dicetak ${fmtTanggal(hariIni())}`,
  ];

  const rekapSheet = {
    nama: 'Rekap',
    judul,
    kolom: [
      { header: 'No', key: 'no', lebar: 6, rata: 'center' },
      { header: 'Nama', key: 'nama', lebar: 30 },
      { header: 'NIS', key: 'nis', lebar: 12 },
      { header: 'Kelas', key: 'kelas', lebar: 9, rata: 'center' },
      { header: 'Sangga', key: 'sangga', lebar: 18 },
      { header: 'Peran', key: 'peran', lebar: 22 },
      { header: 'Hadir', key: 'H', lebar: 9, rata: 'center' },
      { header: 'Izin', key: 'I', lebar: 9, rata: 'center' },
      { header: 'Sakit', key: 'S', lebar: 9, rata: 'center' },
      { header: 'Alpa', key: 'A', lebar: 9, rata: 'center' },
      { header: 'Jumlah Pertemuan', key: 'total', lebar: 12, rata: 'center' },
      { header: 'Kehadiran (%)', key: 'persen', lebar: 12, rata: 'center', format: '0"%"' },
      { header: 'Keterangan', key: 'ket', lebar: 18 },
    ],
    baris: rekap.map((r, i) => ({
      no: i + 1,
      nama: r.user.nama,
      nis: r.user.nis ?? '',
      kelas: r.user.kelas ?? '',
      sangga: r.user.sangga ?? '',
      peran: PERAN[r.user.peran]?.label ?? '',
      H: r.H, I: r.I, S: r.S, A: r.A, total: r.total,
      persen: r.persen ?? '',
      ket: r.persen === null ? 'Belum ada pertemuan' : r.persen < AMBANG_HADIR ? `Di bawah ${AMBANG_HADIR}%` : 'Baik',
    })),
    warna: (b, key) => (key === 'persen' || key === 'ket') && b.persen !== '' && b.persen < AMBANG_HADIR ? MERAH_MUDA : undefined,
  };

  const perJumat = {
    nama: 'Per Jumat',
    judul,
    kolom: [
      { header: 'No', key: 'no', lebar: 6, rata: 'center' },
      { header: 'Nama', key: 'nama', lebar: 30 },
      { header: 'Kelas', key: 'kelas', lebar: 9, rata: 'center' },
      { header: 'Sangga', key: 'sangga', lebar: 18 },
      ...sesiList.map((s) => ({ header: fmtTglPendek(s.tanggal), key: s.tanggal, lebar: 7, rata: 'center' })),
      { header: 'Hadir', key: 'H', lebar: 8, rata: 'center' },
      { header: '%', key: 'persen', lebar: 8, rata: 'center', format: '0"%"' },
    ],
    baris: rekap.map((r, i) => ({
      no: i + 1,
      nama: r.user.nama,
      kelas: r.user.kelas ?? '',
      sangga: r.user.sangga ?? '',
      ...Object.fromEntries(sesiList.map((s) => [s.tanggal, r.perSesi[s.tanggal] === 'B' ? '?' : r.perSesi[s.tanggal] ?? '-'])),
      H: r.H,
      persen: r.persen ?? '',
    })),
    warna: (b, key) => (/^\d{4}-\d{2}-\d{2}$/.test(key) ? WARNA_ABSEN[b[key]] : undefined),
  };

  const keterangan = {
    nama: 'Keterangan',
    judul: ['Keterangan kode absensi'],
    kolom: [{ header: 'Kode', key: 'k', lebar: 8, rata: 'center' }, { header: 'Arti', key: 'a', lebar: 60 }],
    baris: [
      ...Object.entries(STATUS_ABSEN).map(([k, v]) => ({ k, a: v.label })),
      { k: '?', a: 'Belum dicatat pengurus pada sesi tersebut (tidak dihitung pada rekap)' },
      { k: '', a: `Kehadiran di bawah ${AMBANG_HADIR}% ditandai merah. Persentase = jumlah hadir dibagi jumlah pertemuan yang dicatat.` },
    ],
    warna: (b, key) => (key === 'k' ? WARNA_ABSEN[b.k] : undefined),
  };

  return [rekapSheet, perJumat, keterangan];
}

export const namaFileAbsensi = (tahunAjaran, periode) =>
  `rekap-absensi-${tahunAjaran.replace('/', '-')}-${periode}.xlsx`;

export const unduhAbsensiXlsx = (data) =>
  unduhXlsx({ namaFile: namaFileAbsensi(data.tahunAjaran, data.periode), sheets: susunAbsensiXlsx(data) });

/* -------------------------------- PORTOFOLIO ------------------------------- */

export function susunPortofolioXlsx({ rekap, portofolio, filter }) {
  const judul = [
    'Rekap Kesiapan Portofolio Penegak Garuda (SIGARDA)',
    `${GUDEP.nama}. Filter: ${teksFilter(filter)}. Dicetak ${fmtTanggal(hariIni())}`,
  ];
  const label = { siap: 'Ada', proses: 'Proses', belum: 'Tidak' };
  const warna = { Ada: 'FFD1FAE5', Proses: 'FFFEF3C7', Tidak: 'FFFEE2E2' };

  return [
    {
      nama: 'Rekap Kesiapan',
      judul,
      kolom: [
        { header: 'No', key: 'no', lebar: 6, rata: 'center' },
        { header: 'Nama', key: 'nama', lebar: 30 },
        { header: 'NIS', key: 'nis', lebar: 12 },
        { header: 'Kelas', key: 'kelas', lebar: 9, rata: 'center' },
        { header: 'Sangga', key: 'sangga', lebar: 18 },
        { header: 'Dokumen Siap', key: 'siap', lebar: 12, rata: 'center' },
        { header: 'Sedang Disiapkan', key: 'proses', lebar: 14, rata: 'center' },
        { header: 'Belum Ada', key: 'belum', lebar: 12, rata: 'center' },
        { header: 'Belum Siap (total)', key: 'belumSiap', lebar: 14, rata: 'center' },
        { header: 'Total Dokumen', key: 'total', lebar: 12, rata: 'center' },
        { header: 'Kesiapan (%)', key: 'persen', lebar: 12, rata: 'center', format: '0"%"' },
      ],
      baris: rekap.map((r, i) => ({ no: i + 1, nama: r.user.nama, nis: r.user.nis ?? '', kelas: r.user.kelas ?? '', sangga: r.user.sangga ?? '', ...r })),
    },
    {
      nama: 'Cek List',
      judul,
      kolom: [
        { header: 'Nama', key: 'nama', lebar: 30 },
        ...ITEM_PORTOFOLIO.map((it) => ({ header: String(it.no), key: it.id, lebar: 7, rata: 'center' })),
      ],
      baris: rekap.map((r) => ({
        nama: r.user.nama,
        ...Object.fromEntries(ITEM_PORTOFOLIO.map((it) => [it.id, label[getItem(portofolio, r.user.id, it.id).status]])),
      })),
      warna: (b, key) => warna[b[key]],
    },
    {
      nama: 'Daftar Dokumen',
      judul: ['Daftar 26 lampiran portofolio (nomor sesuai kolom pada lembar Cek List)'],
      kolom: [
        { header: 'No', key: 'no', lebar: 6, rata: 'center' },
        { header: 'Jenis Lampiran / Berkas Dokumen', key: 'jenis', lebar: 55 },
        { header: 'Kelengkapan Form / Isian', key: 'isian', lebar: 70 },
      ],
      baris: ITEM_PORTOFOLIO.map((it) => ({ no: it.no, jenis: it.jenis, isian: it.isian })),
    },
  ];
}

export const unduhPortofolioXlsx = (data) =>
  unduhXlsx({ namaFile: `rekap-portofolio-garuda-${hariIni()}.xlsx`, sheets: susunPortofolioXlsx(data) });

