/**
 * KEPENGURUSAN DEWAN AMBALAN LEWAT EXCEL (fase 6b)
 *
 * Alur: unduh berkas (berisi kepengurusan saat ini bila ada; NIS, Nama, Rombel, Jabatan Dewan Ambalan) -> ubah sesuai hasil Musyawarah Ambalan
 * (satu Penegak per baris; jabatan diisi bebas) -> unggah -> periksa (pratinjau dari server) -> terapkan. Bawaan: kepengurusan lama diganti seluruhnya
 * (yang tidak ada di berkas dicabut). Penilaian isi ada di server (sg_kepengurusan_terapkan); di sini hanya membaca dan menulis berkas.
 * ExcelJS dimuat saat dipakai.
 */
import { teksSel, unduhBlob } from './importAnggota';
import { JABATAN_DEWAN } from './dewanLogic';

export const NAMA_LEMBAR_KEPENGURUSAN = 'Kepengurusan';
export const MAKS_BARIS_KEPENGURUSAN = 200;

const hurufSaja = (t) => String(t ?? '').toLowerCase().replace(/[^a-z]/g, '');

/** Membaca berkas Excel: mengembalikan [{ no, nis, jabatan }]. Kolom dikenali dari judul: NIS dan Jabatan (Dewan Ambalan). */
export async function bacaExcelKepengurusan(buffer) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new Error('File tidak dapat dibaca. Pastikan formatnya .xlsx (bukan .xls atau .csv).');
  }
  const ws = wb.getWorksheet(NAMA_LEMBAR_KEPENGURUSAN) ?? wb.worksheets[0];
  if (!ws) throw new Error('File tidak berisi lembar kerja.');

  let barisJudul = 0;
  let kolom = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount); r += 1) {
    const cur = {};
    ws.getRow(r).eachCell((c, n) => {
      const k = hurufSaja(teksSel(c.value));
      if ((k === 'nis' || k === 'nisn') && !cur.nis) cur.nis = n;
      if (['jabatan', 'jabatandewan', 'jabatandewanambalan'].includes(k) && !cur.jabatan) cur.jabatan = n;
    });
    if (cur.nis && cur.jabatan) { barisJudul = r; kolom = cur; break; }
  }
  if (!barisJudul) throw new Error('Baris judul tidak ditemukan. Gunakan berkas dari tombol "Unduh berkas Excel" (kolom NIS dan Jabatan Dewan Ambalan).');

  const baris = [];
  for (let r = barisJudul + 1; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const item = { no: r, nis: teksSel(row.getCell(kolom.nis).value), jabatan: teksSel(row.getCell(kolom.jabatan).value) };
    if (!item.nis && !item.jabatan) continue;
    baris.push(item);
    if (baris.length > MAKS_BARIS_KEPENGURUSAN) throw new Error(`Maksimal ${MAKS_BARIS_KEPENGURUSAN} baris. Kepengurusan Dewan tidak sebanyak itu; periksa berkas.`);
  }
  if (!baris.length) throw new Error('Tidak ada data pada berkas. Isi NIS dan Jabatan Dewan Ambalan mulai baris di bawah judul.');
  return baris;
}

/** Berkas Excel dari daftar [{ nis, nama, rombel, jabatan }] (kepengurusan saat ini; boleh kosong), dengan saran jabatan. */
export async function buatBerkasKepengurusan(baris = []) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIGARDA';
  const ws = wb.addWorksheet(NAMA_LEMBAR_KEPENGURUSAN, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'NIS', key: 'nis', width: 14 },
    { header: 'Nama', key: 'nama', width: 34 },
    { header: 'Rombel', key: 'rombel', width: 12 },
    { header: 'Jabatan Dewan Ambalan', key: 'jabatan', width: 30 },
  ];
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF45291A' } };
    c.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  const isi = baris.length ? baris : Array.from({ length: 10 }, () => ({}));
  isi.forEach((b, i) => {
    const r = i + 2;
    ws.getCell(r, 1).value = String(b.nis ?? '');
    ws.getCell(r, 1).numFmt = '@';
    ws.getCell(r, 2).value = b.nama ?? '';
    ws.getCell(r, 3).value = b.rombel ?? '';
    ws.getCell(r, 4).value = b.jabatan ?? '';
    // Saran saja: jabatan lain boleh diketik bebas.
    ws.getCell(r, 4).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${JABATAN_DEWAN.join(',')}"`], showErrorMessage: false };
  });
  const petunjuk = wb.addWorksheet('Petunjuk');
  petunjuk.getColumn(1).width = 110;
  [
    'Petunjuk kepengurusan Dewan Ambalan SIGARDA',
    '',
    'Yang dibaca hanya kolom NIS dan Jabatan Dewan Ambalan. Satu Penegak satu baris. Nama dan Rombel hanya sebagai petunjuk.',
    'Jabatan diisi bebas (mis. Pradana, Pradani, Wakil Pradana, Sekretaris, Bendahara, Ketua Bidang Kegiatan); daftar pilihan hanya saran. Pradana dan Pradani masing-masing hanya satu orang.',
    'Dewan Ambalan adalah jabatan pada akun Penegak (bukan akun terpisah). Hanya Penegak yang aktif dapat menjabat. Penegak yang belum menyelesaikan Bantara tetap dapat dilantik (hanya diberi peringatan).',
    'Secara bawaan kepengurusan lama DIGANTI seluruhnya: pemegang jabatan yang tidak ada di berkas ini kehilangan jabatannya dan kembali menjadi Penegak biasa (penugasan pengujinya ikut dihapus).',
    'Setelah selesai, unggah berkas ini di halaman Pengurus, periksa pratinjau, lalu terapkan.',
  ].forEach((t) => petunjuk.addRow([t]));
  petunjuk.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF45291A' } };
  petunjuk.eachRow((r) => { r.alignment = { vertical: 'top', wrapText: true }; });
  return wb.xlsx.writeBuffer();
}

export async function unduhBerkasKepengurusan(baris = []) {
  unduhBlob(await buatBerkasKepengurusan(baris), 'kepengurusan-dewan-ambalan-sigarda.xlsx');
}
