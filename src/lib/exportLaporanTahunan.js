/**
 * Susunan lembar Excel untuk Laporan Berjenjang Tahunan (tahap L8): satu berkas, banyak lembar (sampul, keanggotaan,
 * kepengurusan, kegiatan, pencapaian SKU, kehadiran, keuangan iuran, keterangan). Fungsi `susun...` murni (mudah diuji);
 * `unduh...` memicu pengunduhan di browser. Pola sama dengan src/lib/exportLaporan.js.
 */
import { ambilGudep } from './gudepStore';
import { labelJenisAgenda } from './agendaLogic';
import { fmtTanggal, hariIni } from './format';
import { unduhXlsx } from './exportXlsx';

const RATA_TENGAH = { rata: 'center' };

function sheetSampul(rentang) {
  const g = ambilGudep();
  return {
    nama: 'Sampul',
    judul: [g.nama.toUpperCase(), `LAPORAN TAHUNAN GUGUS DEPAN — ${rentang.label.toUpperCase()}`, `${g.kwarcab}, ${g.kwarran}`],
    kolom: [{ header: 'Keterangan', key: 'v', lebar: 90 }],
    baris: [
      { v: `Nomor Gugus Depan: ${g.nomorGudep || '-'}` },
      { v: `Sekolah / pangkalan: ${g.sekolah}` },
      { v: `Alamat: ${g.alamat}, ${g.kota}` },
      { v: `Pembina Gudep: ${g.pembina?.nama || '-'}${g.pembina?.nta ? `, NTA ${g.pembina.nta}` : ''}` },
      { v: `Ka. Mabigus: ${g.kamabigus?.nama || '-'}` },
      { v: `Periode laporan: ${rentang.label} (${fmtTanggal(rentang.mulai)} s.d. ${fmtTanggal(rentang.akhir)})` },
      { v: `Dicetak: ${fmtTanggal(hariIni())}` },
      { v: '' },
      { v: 'Diserahkan kepada Kwartir Ranting, dengan tembusan Kwartir Cabang dan Ka. Mabigus.' },
    ],
  };
}

function sheetKeanggotaan(rekap) {
  return {
    nama: 'Rekap Keanggotaan',
    judul: ['Rekap Keanggotaan Penegak', 'Snapshot pada tanggal laporan dibuat (bukan rata-rata sepanjang periode)'],
    kolom: [
      { header: 'Tingkat', key: 'tingkat', lebar: 14, ...RATA_TENGAH },
      { header: 'Laki-laki', key: 'lakiLaki', lebar: 12, ...RATA_TENGAH },
      { header: 'Perempuan', key: 'perempuan', lebar: 12, ...RATA_TENGAH },
      { header: 'Calon Bantara', key: 'calonBantara', lebar: 14, ...RATA_TENGAH },
      { header: 'Calon Laksana', key: 'calonLaksana', lebar: 14, ...RATA_TENGAH },
      { header: 'Calon Garuda', key: 'calonGaruda', lebar: 14, ...RATA_TENGAH },
      { header: 'Total', key: 'total', lebar: 10, ...RATA_TENGAH },
    ],
    baris: rekap,
  };
}

function sheetKepengurusan(pengurus) {
  return {
    nama: 'Kepengurusan',
    judul: ['Kepengurusan Dewan Ambalan', 'Menjabat pada tanggal laporan dibuat'],
    kolom: [
      { header: 'No', key: 'no', lebar: 6, ...RATA_TENGAH },
      { header: 'Nama', key: 'nama', lebar: 28 },
      { header: 'NTA', key: 'nta', lebar: 20 },
      { header: 'Jabatan', key: 'jabatan', lebar: 26 },
    ],
    baris: pengurus.map((u, i) => ({ no: i + 1, nama: u.nama, nta: u.nta || '-', jabatan: u.jabatanDewan })),
  };
}

function sheetKegiatan(daftar) {
  return {
    nama: 'Rekap Kegiatan',
    judul: ['Rekap Kegiatan Ambalan pada Periode Laporan'],
    kolom: [
      { header: 'No', key: 'no', lebar: 6, ...RATA_TENGAH },
      { header: 'Tanggal', key: 'tanggal', lebar: 14, ...RATA_TENGAH },
      { header: 'Jenis', key: 'jenis', lebar: 24 },
      { header: 'Judul', key: 'judul', lebar: 34 },
      { header: 'Keterangan', key: 'keterangan', lebar: 34 },
    ],
    baris: daftar.map((a, i) => ({ no: i + 1, tanggal: fmtTanggal(a.tanggal), jenis: labelJenisAgenda(a.jenis), judul: a.judul, keterangan: a.keterangan || '-' })),
  };
}

function sheetSku(sku) {
  return {
    nama: 'Pencapaian SKU',
    judul: ['Rekap Pencapaian SKU pada Periode Laporan'],
    kolom: [{ header: 'Uraian', key: 'u', lebar: 40 }, { header: 'Jumlah', key: 'n', lebar: 12, ...RATA_TENGAH }],
    baris: [
      { u: 'Penegak yang menyelesaikan (lulus) seluruh SKU Bantara', n: sku.bantaraLulus },
      { u: 'Penegak yang menyelesaikan (lulus) seluruh SKU Laksana', n: sku.laksanaLulus },
      { u: 'Penegak yang mendaftar sebagai Calon Garuda', n: sku.garudaBaru },
    ],
  };
}

function sheetKehadiran(ringkas) {
  return {
    nama: 'Rekap Kehadiran',
    judul: ['Rekap Kehadiran Latihan Rutin Jumat pada Periode Laporan'],
    kolom: [{ header: 'Uraian', key: 'u', lebar: 40 }, { header: 'Nilai', key: 'n', lebar: 12, ...RATA_TENGAH }],
    baris: [
      { u: 'Jumlah pertemuan terlaksana', n: ringkas.pertemuan },
      { u: 'Rata-rata kehadiran gudep (%)', n: ringkas.rata ?? '-' },
      { u: 'Penegak dengan kehadiran baik (di atas ambang)', n: ringkas.baik },
      { u: 'Penegak dengan kehadiran rendah (di bawah ambang)', n: ringkas.rendah },
    ],
  };
}

function sheetIuran(ringkas) {
  return {
    nama: 'Rekap Keuangan',
    judul: ['Rekap Keuangan Iuran Bumbung pada Periode Laporan'],
    kolom: [{ header: 'Uraian', key: 'u', lebar: 44 }, { header: 'Nilai', key: 'n', lebar: 16, ...RATA_TENGAH }],
    baris: [
      { u: 'Total iuran terkumpul (Rp)', n: ringkas.total },
      { u: 'Total iuran susulan (Rp)', n: ringkas.totalSusulan },
      { u: 'Jumlah catatan iuran (Penegak x pertemuan)', n: ringkas.kali },
    ],
  };
}

function sheetKeterangan() {
  return {
    nama: 'Keterangan',
    judul: ['Keterangan Laporan'],
    kolom: [{ header: 'Keterangan', key: 'v', lebar: 90 }],
    baris: [
      { v: 'Rekap Keanggotaan adalah SNAPSHOT (potret) pada tanggal laporan dibuat, bukan rata-rata sepanjang periode -- sama seperti sensus keanggotaan Kwartir Cabang.' },
      { v: 'Rekap Pencapaian SKU, Rekap Kegiatan, Rekap Kehadiran, dan Rekap Keuangan dihitung untuk RENTANG TANGGAL periode laporan yang dipilih.' },
      { v: 'Seorang Penegak yang lulus SKU lalu menjadi alumni/nonaktif pada periode yang sama tetap terhitung pada Rekap Pencapaian SKU.' },
      { v: 'Laporan ini disusun dari data yang tercatat di aplikasi SIGARDA; keakuratan bergantung pada kelengkapan pencatatan Pembina dan Dewan Ambalan.' },
    ],
  };
}

/**
 * Menyusun seluruh lembar laporan tahunan. `data` = { rentang, keanggotaan, pengurus, kegiatan, sku, kehadiran, iuran }
 * (lihat src/lib/laporanLogic.js dan src/pages/Laporan.jsx untuk cara menyiapkan tiap bagian).
 */
export function susunLaporanTahunanXlsx(data) {
  return [
    sheetSampul(data.rentang),
    sheetKeanggotaan(data.keanggotaan),
    sheetKepengurusan(data.pengurus),
    sheetKegiatan(data.kegiatan),
    sheetSku(data.sku),
    sheetKehadiran(data.kehadiran),
    sheetIuran(data.iuran),
    sheetKeterangan(),
  ];
}

export const unduhLaporanTahunanXlsx = (data, namaFile) => unduhXlsx({ namaFile, sheets: susunLaporanTahunanXlsx(data) });
