/**
 * NAIK KELAS LEWAT EXCEL (fase 6a)
 *
 * Alur: unduh berkas berisi seluruh Penegak yang belum alumni (NIS, nama, rombel sekarang, status, Rombel Baru, Aksi; sudah terisi bawaan) ->
 * ubah Rombel Baru dan Aksi (mis. isi dari daftar kelas XI dari sekolah) -> unggah -> periksa -> terapkan. Pembaca dan pembuat berkas memuat
 * ExcelJS saat dipakai. Penilaian isi ada di naikKelasLogic.js (gabungkanBerkas) dan server (sg_naik_kelas).
 */
import { SEMUA_ROMBEL, PESAN_ROMBEL } from './rombelLogic';
import { LABEL_AKSI, LABEL_STATUS } from './naikKelasLogic';
import { teksSel, unduhBlob } from './importAnggota';

export const NAMA_LEMBAR_NAIK_KELAS = 'Naik Kelas';
export const MAKS_BARIS_NAIK_KELAS = 2500;

const hurufSaja = (t) => String(t ?? '').toLowerCase().replace(/[^a-z]/g, '');

/** Membaca berkas Excel: mengembalikan [{ no, nis, rombel, aksi }]. Kolom dikenali dari judul: NIS, Aksi, dan Rombel Baru (boleh tidak ada). */
export async function bacaExcelNaikKelas(buffer) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new Error('File tidak dapat dibaca. Pastikan formatnya .xlsx (bukan .xls atau .csv).');
  }
  const ws = wb.getWorksheet(NAMA_LEMBAR_NAIK_KELAS) ?? wb.worksheets[0];
  if (!ws) throw new Error('File tidak berisi lembar kerja.');

  let barisJudul = 0;
  let kolom = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount); r += 1) {
    const cur = {};
    ws.getRow(r).eachCell((c, n) => {
      const k = hurufSaja(teksSel(c.value));
      if ((k === 'nis' || k === 'nisn') && !cur.nis) cur.nis = n;
      if ((k === 'aksi' || k === 'keputusan') && !cur.aksi) cur.aksi = n;
      if (['rombelbaru', 'kelasbaru', 'rombeltujuan'].includes(k) && !cur.rombel) cur.rombel = n;
    });
    if (cur.nis && cur.aksi) { barisJudul = r; kolom = cur; break; }
  }
  if (!barisJudul) throw new Error('Baris judul tidak ditemukan. Gunakan berkas dari tombol "Unduh berkas Excel" (kolom NIS, Rombel Baru, dan Aksi).');

  const baris = [];
  for (let r = barisJudul + 1; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const item = {
      no: r,
      nis: teksSel(row.getCell(kolom.nis).value),
      rombel: kolom.rombel ? teksSel(row.getCell(kolom.rombel).value) : '',
      aksi: teksSel(row.getCell(kolom.aksi).value),
    };
    if (!item.nis && !item.rombel && !item.aksi) continue;
    baris.push(item);
    if (baris.length > MAKS_BARIS_NAIK_KELAS) throw new Error(`Maksimal ${MAKS_BARIS_NAIK_KELAS} baris. Bagi berkas menjadi beberapa bagian.`);
  }
  if (!baris.length) throw new Error('Tidak ada data pada berkas. Isi kolom Rombel Baru dan Aksi mulai baris di bawah judul.');
  return baris;
}

/** Berkas Excel dari baris layar (lihat bangunBaris), dengan daftar pilihan untuk Rombel Baru dan Aksi. */
export async function buatBerkasNaikKelas(baris, tahunAjaran = '') {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIGARDA';
  const ws = wb.addWorksheet(NAMA_LEMBAR_NAIK_KELAS, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'NIS', key: 'nis', width: 14 },
    { header: 'Nama', key: 'nama', width: 34 },
    { header: 'Rombel Sekarang', key: 'sekarang', width: 17 },
    { header: 'Status Sekarang', key: 'status', width: 16 },
    { header: 'Rombel Baru', key: 'baru', width: 14 },
    { header: 'Aksi', key: 'aksi', width: 14 },
  ];
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF45291A' } };
    c.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  baris.forEach((b, i) => {
    const r = i + 2;
    ws.getCell(r, 1).value = String(b.nis ?? '');
    ws.getCell(r, 1).numFmt = '@';
    ws.getCell(r, 2).value = b.nama;
    ws.getCell(r, 3).value = b.rombelSekarang ?? '';
    ws.getCell(r, 4).value = LABEL_STATUS[b.statusSekarang] ?? '';
    ws.getCell(r, 5).value = b.rombelBaru ?? '';
    ws.getCell(r, 5).dataValidation = {
      type: 'list', allowBlank: true, formulae: [`"${SEMUA_ROMBEL.join(',')}"`],
      showErrorMessage: true, errorTitle: 'Rombel baru', error: PESAN_ROMBEL,
    };
    ws.getCell(r, 6).value = b.aksi ? LABEL_AKSI[b.aksi] : '';
    ws.getCell(r, 6).dataValidation = {
      type: 'list', allowBlank: true, formulae: [`"${Object.values(LABEL_AKSI).join(',')}"`],
      showErrorMessage: true, errorTitle: 'Aksi', error: 'Pilih Lanjut, Tidak lanjut, atau Lulus.',
    };
  });
  const petunjuk = wb.addWorksheet('Petunjuk');
  petunjuk.getColumn(1).width = 110;
  [
    `Petunjuk naik kelas SIGARDA${tahunAjaran ? ` (tahun ajaran ${tahunAjaran})` : ''}`,
    '',
    'Yang dibaca hanya kolom NIS, Rombel Baru, dan Aksi. Jangan mengubah NIS. Nama, Rombel Sekarang, dan Status Sekarang hanya sebagai petunjuk.',
    'Aksi: Lanjut = tetap aktif mengikuti Pramuka di rombel baru (Rombel Baru wajib diisi). Tidak lanjut = nonaktif (tidak melanjutkan Pramuka, masih siswa; Rombel Baru boleh kosong).',
    'Lulus = alumni (kelas XII yang lulus). Baris yang Aksi-nya dikosongkan dilewati (tidak diubah).',
    'Isian bawaan: kelas X = Tidak lanjut (tandai yang melanjutkan: ubah menjadi Lanjut dan isi Rombel Baru kelas XI); kelas XI aktif = Lanjut ke XII dengan nomor rombel yang sama; kelas XII = Lulus.',
    'Setelah selesai, unggah berkas ini di halaman Naik Kelas, periksa pratinjau, lalu terapkan. Kenaikan terakhir dapat dibatalkan selama belum ada perubahan lain pada Penegak yang sama.',
  ].forEach((t) => petunjuk.addRow([t]));
  petunjuk.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF45291A' } };
  petunjuk.eachRow((r) => { r.alignment = { vertical: 'top', wrapText: true }; });
  return wb.xlsx.writeBuffer();
}

export async function unduhBerkasNaikKelas(baris, tahunAjaran = '') {
  unduhBlob(await buatBerkasNaikKelas(baris, tahunAjaran), `naik-kelas-${String(tahunAjaran).replace('/', '-') || 'penegak'}-sigarda.xlsx`);
}
