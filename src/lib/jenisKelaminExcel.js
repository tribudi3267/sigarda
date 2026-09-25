/**
 * LENGKAPI JENIS KELAMIN LEWAT EXCEL
 *
 * Alur: unduh berkas berisi anggota yang jenis kelaminnya belum diisi (nama pengguna atau NIS, nama, peran, rombel, kolom Jenis Kelamin kosong berisi
 * daftar pilihan) -> isi -> unggah -> pratinjau -> simpan (sg_anggota_jk_atur). Pembaca dan pembuat berkas memuat ExcelJS saat dipakai.
 */
import { JENIS_KELAMIN, PESAN_JK, anggotaTanpaJk, labelPeranAnggota, urutAnggotaJk } from './jenisKelaminLogic';
import { teksSel, unduhBlob } from './importAnggotaExcel';

export const NAMA_LEMBAR_JK = 'Jenis Kelamin';
export const MAKS_BARIS_BERKAS_JK = 2000;

const hurufSaja = (t) => String(t ?? '').toLowerCase().replace(/[^a-z]/g, '');

/** Membaca berkas: [{ no, id, jk }]; baris tanpa jenis kelamin dilewati. Kolom dikenali dari judul: Nama Pengguna (atau NIS) dan Jenis Kelamin. */
export async function bacaExcelJk(buffer) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new Error('File tidak dapat dibaca. Pastikan formatnya .xlsx (bukan .xls atau .csv).');
  }
  const ws = wb.getWorksheet(NAMA_LEMBAR_JK) ?? wb.worksheets[0];
  if (!ws) throw new Error('File tidak berisi lembar kerja.');

  let barisJudul = 0;
  let kolom = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount); r += 1) {
    const cur = {};
    ws.getRow(r).eachCell((c, n) => {
      const k = hurufSaja(teksSel(c.value));
      if ((k.startsWith('namapengguna') || k === 'nis' || k === 'nisn' || k === 'username') && !cur.id) cur.id = n;
      if ((k === 'jeniskelamin' || k === 'jk' || k === 'kelamin' || k === 'lp') && !cur.jk) cur.jk = n;
    });
    if (cur.id && cur.jk) { barisJudul = r; kolom = cur; break; }
  }
  if (!barisJudul) throw new Error('Baris judul tidak ditemukan. Gunakan berkas dari tombol "Unduh berkas Excel" (kolom Nama Pengguna dan Jenis Kelamin).');

  const baris = [];
  for (let r = barisJudul + 1; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const item = { no: r, id: teksSel(row.getCell(kolom.id).value), jk: teksSel(row.getCell(kolom.jk).value) };
    if (!item.id || !item.jk) continue;
    baris.push(item);
    if (baris.length > MAKS_BARIS_BERKAS_JK) throw new Error(`Maksimal ${MAKS_BARIS_BERKAS_JK} baris. Bagi berkas menjadi beberapa bagian.`);
  }
  if (!baris.length) throw new Error('Tidak ada data pada berkas. Isi kolom Jenis Kelamin mulai baris di bawah judul.');
  return baris;
}

/** Berkas Excel berisi anggota yang jenis kelaminnya belum diisi, dengan kolom Jenis Kelamin berisi daftar pilihan. */
export async function buatBerkasJk(users) {
  const { default: ExcelJS } = await import('exceljs');
  const daftar = urutAnggotaJk(anggotaTanpaJk(users));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIGARDA';
  const ws = wb.addWorksheet(NAMA_LEMBAR_JK, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Nama Pengguna (NIS untuk Penegak)', key: 'id', width: 30 },
    { header: 'Nama', key: 'nama', width: 34 },
    { header: 'Peran', key: 'peran', width: 16 },
    { header: 'Rombel', key: 'kelas', width: 10 },
    { header: 'Jenis Kelamin', key: 'jk', width: 16 },
  ];
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF45291A' } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  daftar.forEach((u, i) => {
    const r = i + 2;
    ws.getCell(r, 1).value = String(u.username ?? '');
    ws.getCell(r, 1).numFmt = '@';
    ws.getCell(r, 2).value = u.nama;
    ws.getCell(r, 3).value = labelPeranAnggota(u);
    ws.getCell(r, 4).value = u.role === 'peserta' ? u.kelas ?? '' : '';
    ws.getCell(r, 5).dataValidation = {
      type: 'list', allowBlank: true, formulae: [`"${JENIS_KELAMIN.map((j) => j.label).join(',')}"`],
      showErrorMessage: true, errorTitle: 'Jenis kelamin', error: PESAN_JK,
    };
  });
  const petunjuk = wb.addWorksheet('Petunjuk');
  petunjuk.getColumn(1).width = 100;
  [
    'Petunjuk lengkapi jenis kelamin SIGARDA',
    '',
    'Isi kolom Jenis Kelamin pada lembar "Jenis Kelamin" untuk tiap anggota: pilih dari daftar (Laki-laki atau Perempuan). L dan P juga dikenali.',
    'Jangan mengubah kolom Nama Pengguna. Nama, Peran, dan Rombel hanya sebagai petunjuk; yang dibaca hanya Nama Pengguna dan Jenis Kelamin.',
    'Baris yang Jenis Kelamin-nya dikosongkan dilewati. Setelah selesai, unggah berkas ini di jendela Lengkapi jenis kelamin.',
  ].forEach((t) => petunjuk.addRow([t]));
  petunjuk.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF45291A' } };
  petunjuk.eachRow((r) => { r.alignment = { vertical: 'top', wrapText: true }; });
  return wb.xlsx.writeBuffer();
}

export async function unduhBerkasJk(users) {
  unduhBlob(await buatBerkasJk(users), 'lengkapi-jenis-kelamin-sigarda.xlsx');
}
