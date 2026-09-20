/**
 * Susunan lembar Excel untuk laporan absensi dan portofolio Garuda.
 * Fungsi `susun...` murni (mudah diuji); `unduh...` memicu pengunduhan di browser.
 */
import { GUDEP, AMBANG_HADIR } from '../config';
import { ITEM_PORTOFOLIO } from '../data/portofolioData';
import { PERAN } from './skuLogic';
import { PERIODE, STATUS_ABSEN } from './absensiLogic';
import { getItem } from './portofolioLogic';
import { PREDIKAT } from './raportLogic';
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

/* ------------------------- NILAI RAPORT EKSTRAKURIKULER ------------------------- */

const KUNING_DRAF = 'FFFEF3C7';
const ABU_BELUM = 'FFE7E5E4';

/** Nama lembar Excel: maksimal 31 karakter dan tanpa \ / ? * [ ] : */
const namaLembar = (teks, cadangan) => (String(teks || '').replace(/[\\/?*[\]:]/g, '-').trim().slice(0, 31) || cadangan);

const STATUS_RAPORT = { final: 'Final', draf: 'DRAF (belum final)', belum: 'Belum dinilai' };

/**
 * Nilai raport per kelas: satu lembar untuk setiap kelas (atau satu lembar bila filter sudah memilih satu kelas), ditambah
 * lembar keterangan. `baris` = keluaran susunBaris() (yang sudah difilter). Baris yang belum final diberi status dan warna
 * kuning agar tidak ikut diserahkan ke sekolah tanpa disadari.
 */
export function susunRaportXlsx({ tahunAjaran, semester, baris, filter, pengaturan }) {
  const jumlahFinal = baris.filter((b) => b.status === 'final').length;
  const judul = [
    'Nilai Ekstrakurikuler Pramuka Penegak',
    `${GUDEP.nama}. Tahun Ajaran ${tahunAjaran}, ${PERIODE[semester]}`,
    `Filter: ${teksFilter(filter)}. Final: ${jumlahFinal} dari ${baris.length}. Dicetak ${fmtTanggal(hariIni())}`,
    ...(jumlahFinal < baris.length ? ['PERHATIAN: baris berwarna kuning belum final (hanya saran) dan belum boleh diserahkan ke sekolah.'] : []),
  ];
  const kolom = [
    { header: 'No', key: 'no', lebar: 6, rata: 'center' },
    { header: 'NIS', key: 'nis', lebar: 12 },
    { header: 'Nama', key: 'nama', lebar: 30 },
    { header: 'Kelas', key: 'kelas', lebar: 9, rata: 'center' },
    { header: 'Predikat', key: 'huruf', lebar: 10, rata: 'center' },
    { header: 'Keterangan Predikat', key: 'label', lebar: 16 },
    { header: 'Deskripsi Capaian', key: 'deskripsi', lebar: 90 },
    { header: 'Status', key: 'status', lebar: 20 },
    { header: 'Skor', key: 'skor', lebar: 8, rata: 'center' },
    { header: 'Kehadiran (%)', key: 'kehadiran', lebar: 12, rata: 'center' },
    { header: 'Capaian SKU', key: 'capaian', lebar: 14, rata: 'center' },
    { header: 'Tingkat SKU', key: 'tingkat', lebar: 12, rata: 'center' },
    { header: 'Sikap (1-5)', key: 'sikap', lebar: 10, rata: 'center' },
    { header: 'SKK', key: 'skk', lebar: 7, rata: 'center' },
    { header: 'Catatan Perubahan Predikat', key: 'catatan', lebar: 34 },
  ];
  const warna = (b, key) => {
    if (b.statusKode === 'draf') return KUNING_DRAF;
    if (b.statusKode === 'belum') return ABU_BELUM;
    return key === 'status' ? 'FFD1FAE5' : undefined;
  };
  const isiBaris = (b, i) => {
    const lengkap = b.sikap != null && b.predikat;
    const p = lengkap ? PREDIKAT[b.predikat] : null;
    return {
      no: i + 1,
      nis: b.peserta.nis ?? '',
      nama: b.peserta.nama,
      kelas: b.peserta.kelas ?? '',
      huruf: p?.huruf ?? '',
      label: p?.label ?? '',
      deskripsi: b.deskripsi,
      status: STATUS_RAPORT[b.status],
      statusKode: b.status,
      skor: lengkap ? b.skor : '',
      kehadiran: b.kehadiran ?? '',
      capaian: `${b.lulus} dari ${b.target} butir`,
      tingkat: b.tingkat,
      sikap: b.sikap ?? '',
      skk: b.skk ?? '',
      catatan: b.predikatAkhir ? `Diubah dari ${b.predikatHitung} ke ${b.predikatAkhir}: ${b.catatanPredikat}` : '',
    };
  };

  const urutNama = (a, b) => a.peserta.nama.localeCompare(b.peserta.nama, 'id');
  const perKelas = new Map();
  for (const b of baris) {
    const k = b.peserta.kelas || 'Tanpa kelas';
    if (!perKelas.has(k)) perKelas.set(k, []);
    perKelas.get(k).push(b);
  }
  const daftarKelas = [...perKelas.keys()].sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
  const dipakai = new Set();
  const lembar = daftarKelas.map((k, n) => {
    let nama = namaLembar(k === 'Tanpa kelas' ? k : `Kelas ${k}`, `Kelas ${n + 1}`);
    while (dipakai.has(nama.toLowerCase())) nama = `${nama.slice(0, 28)} ${n + 1}`;
    dipakai.add(nama.toLowerCase());
    return { nama, judul: [...judul, k === 'Tanpa kelas' ? 'Kelas: belum diisi' : `Kelas: ${k}`], kolom, baris: perKelas.get(k).sort(urutNama).map(isiBaris), warna };
  });

  const { bobot, pita, target } = pengaturan;
  const keterangan = {
    nama: 'Keterangan',
    judul: ['Keterangan perhitungan nilai ekstrakurikuler'],
    kolom: [{ header: 'Hal', key: 'a', lebar: 28 }, { header: 'Isi', key: 'b', lebar: 100 }],
    baris: [
      { a: 'Skor (0-100)', b: `Kehadiran ${bobot.kehadiran}% + capaian SKU ${bobot.capaian}% + sikap ${bobot.sikap}%. Bila kehadiran atau sikap belum ada, bobotnya dialihkan ke komponen lain.` },
      { a: 'Kehadiran', b: 'Persentase hadir pada latihan Jumat semester ini (hadir dibagi hadir, izin, sakit, dan alpa yang dicatat).' },
      { a: 'Capaian SKU', b: `Butir SKU yang lulus pada semester ini dibagi target (Bantara ${target.Bantara}, Laksana ${target.Laksana} butir per semester), maksimal 100%.` },
      { a: 'Sikap', b: 'Penilaian Pembina skala 1-5, dikalikan 20.' },
      { a: 'Predikat', b: `A Sangat Baik: ${pita.sangatBaik} ke atas. B Baik: ${pita.baik}-${pita.sangatBaik - 1}. C Cukup: ${pita.cukup}-${pita.baik - 1}. D Kurang: di bawah ${pita.cukup}.` },
      { a: 'Status', b: 'Final = keputusan akhir Pembina. DRAF = deskripsi dan predikat baru berupa saran dan belum boleh diserahkan ke sekolah.' },
      { a: 'Predikat diubah Pembina', b: 'Bila predikat akhir berbeda dari hasil hitung, alasannya dicatat pada kolom Catatan Perubahan Predikat.' },
    ],
  };
  return lembar.length ? [...lembar, keterangan] : [{ nama: 'Nilai Raport', judul, kolom, baris: [], warna }, keterangan];
}

export const namaFileRaport = (tahunAjaran, semester) => `nilai-ekstrakurikuler-${tahunAjaran.replace('/', '-')}-${semester}.xlsx`;

export const unduhRaportXlsx = (data) =>
  unduhXlsx({ namaFile: namaFileRaport(data.tahunAjaran, data.semester), sheets: susunRaportXlsx(data) });

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

