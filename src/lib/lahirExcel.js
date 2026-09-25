/**
 * LENGKAPI TANGGAL LAHIR LEWAT EXCEL: pembaca dan pembuat berkas (Tahap 2, G4d). Alur: unduh berkas berisi Penegak aktif yang tanggal lahirnya belum diisi (NIS, nama, rombel,
 * kolom Tanggal Lahir kosong) -> isi -> unggah -> pratinjau -> simpan (sg_tanggal_lahir_impor). ExcelJS dimuat saat dipakai; aturan di src/lib/lahirLogic.js.
 */
import { hurufSaja } from './importAnggota';
import { teksSel, unduhBlob } from './importAnggotaExcel';
import { pesertaTanpaLahir } from './lahirLogic';

export const NAMA_LEMBAR_LAHIR = 'Tanggal Lahir';
export const MAKS_BARIS_BERKAS_LAHIR = 2000;

/** Membaca berkas: [{ no, id, tanggal }] (tanggal = isian asli; sel tanggal Excel dibaca sebagai YYYY-MM-DD); baris tanpa tanggal dilewati. */
export async function bacaExcelLahir(buffer) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new Error('File tidak dapat dibaca. Pastikan formatnya .xlsx (bukan .xls atau .csv).');
  }
  const ws = wb.getWorksheet(NAMA_LEMBAR_LAHIR) ?? wb.worksheets[0];
  if (!ws) throw new Error('File tidak berisi lembar kerja.');

  let barisJudul = 0;
  let kolom = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount); r += 1) {
    const cur = {};
    ws.getRow(r).eachCell((c, n) => {
      const k = hurufSaja(teksSel(c.value));
      if ((k === 'nis' || k === 'nisn' || k.startsWith('nis') || k.startsWith('namapengguna') || k === 'username') && !cur.id) cur.id = n;
      if ((k === 'lahir' || k === 'tgllahir' || k.startsWith('tanggallahir')) && !cur.tanggal) cur.tanggal = n;
    });
    if (cur.id && cur.tanggal) { barisJudul = r; kolom = cur; break; }
  }
  if (!barisJudul) throw new Error('Baris judul tidak ditemukan. Gunakan berkas dari tombol "Unduh berkas Excel" (kolom NIS dan Tanggal Lahir).');

  const baris = [];
  for (let r = barisJudul + 1; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const sel = row.getCell(kolom.tanggal).value;
    const item = { no: r, id: teksSel(row.getCell(kolom.id).value), tanggal: sel instanceof Date ? sel.toISOString().slice(0, 10) : teksSel(sel) };
    if (!item.id || !item.tanggal) continue;
    baris.push(item);
    if (baris.length > MAKS_BARIS_BERKAS_LAHIR) throw new Error(`Maksimal ${MAKS_BARIS_BERKAS_LAHIR} baris. Bagi berkas menjadi beberapa bagian.`);
  }
  if (!baris.length) throw new Error('Tidak ada data pada berkas. Isi kolom Tanggal Lahir mulai baris di bawah judul.');
  return baris;
}

/** Berkas Excel berisi Penegak aktif yang tanggal lahirnya belum diisi; kolom Tanggal Lahir berformat teks (mis. 15/03/2008). */
export async function buatBerkasLahir(users, lahir) {
  const { default: ExcelJS } = await import('exceljs');
  const daftar = pesertaTanpaLahir(users, lahir);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIGARDA';
  const ws = wb.addWorksheet(NAMA_LEMBAR_LAHIR, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'NIS', key: 'nis', width: 16 },
    { header: 'Nama', key: 'nama', width: 34 },
    { header: 'Rombel', key: 'kelas', width: 10 },
    { header: 'Tanggal Lahir', key: 'lahir', width: 18 },
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
    ws.getCell(r, 3).value = u.kelas ?? '';
    ws.getCell(r, 4).numFmt = '@';
  });
  const petunjuk = wb.addWorksheet('Petunjuk');
  petunjuk.getColumn(1).width = 100;
  [
    'Petunjuk lengkapi tanggal lahir SIGARDA',
    '',
    'Isi kolom Tanggal Lahir pada lembar "Tanggal Lahir" untuk tiap Penegak: tulis tanggal/bulan/tahun, mis. 15/03/2008 (atau 15 Maret 2008, atau 2008-03-15).',
    'Jangan mengubah kolom NIS. Nama dan Rombel hanya sebagai petunjuk; yang dibaca hanya NIS dan Tanggal Lahir.',
    'Baris yang Tanggal Lahir-nya dikosongkan dilewati. Penegak yang sudah punya tanggal lahir tidak diubah dari berkas ini. Setelah selesai, unggah berkas ini di jendela Lengkapi tanggal lahir.',
  ].forEach((t) => petunjuk.addRow([t]));
  petunjuk.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF45291A' } };
  petunjuk.eachRow((r) => { r.alignment = { vertical: 'top', wrapText: true }; });
  return wb.xlsx.writeBuffer();
}

export async function unduhBerkasLahir(users, lahir) {
  unduhBlob(await buatBerkasLahir(users, lahir), 'lengkapi-tanggal-lahir-sigarda.xlsx');
}
