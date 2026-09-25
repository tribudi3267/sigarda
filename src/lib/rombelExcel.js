/**
 * PERBARUI ROMBEL MASSAL LEWAT EXCEL
 *
 * Alur: unduh berkas berisi Penegak yang masih berkelas lama (NIS, nama, kelas sekarang, kolom Rombel kosong) -> isi kolom Rombel
 * (mis. XI-03, pilih dari daftar) -> unggah -> pratinjau -> simpan. `periksaRombelMassal` murni (mudah diuji); pembaca dan pembuat berkas
 * memuat ExcelJS saat dipakai. Server memeriksa ulang semua baris (sg_rombel_perbarui).
 */
import { SEMUA_ROMBEL, PESAN_ROMBEL, normalisasiRombel, pesertaRombelLama } from './rombelLogic';
import { teksSel, unduhBlob } from './importAnggotaExcel';
import { urutAlami } from './format';

export const NAMA_LEMBAR_ROMBEL = 'Rombel';
export const MAKS_BARIS_ROMBEL = 2000;
export const MAKS_BARIS_PERMINTAAN = 500; // batas sg_rombel_perbarui

const hurufSaja = (t) => String(t ?? '').toLowerCase().replace(/[^a-z]/g, '');

/** Penegak berkelas lama, urut kelas lalu nama. */
export const daftarRombelLama = (users) =>
  pesertaRombelLama(users).slice().sort((a, b) => urutAlami(String(a.kelas ?? ''), String(b.kelas ?? '')) || a.nama.localeCompare(b.nama, 'id'));

/**
 * Menilai baris dari Excel: [{ no, nis, rombel }] terhadap daftar pengguna. Hasil per baris:
 * { no, nis, nama, kelasLama, rombel (baku atau ''), id, galat: [pesan], siap }. NIS ganda dalam berkas ditolak.
 */
export function periksaRombelMassal(baris, users) {
  const peta = new Map(users.filter((u) => u.role === 'peserta').map((u) => [String(u.username ?? u.nis ?? '').toLowerCase(), u]));
  const terlihat = new Set();
  return baris.map((b) => {
    const nis = String(b.nis ?? '').trim().toLowerCase();
    const u = peta.get(nis);
    const rombel = normalisasiRombel(b.rombel);
    const galat = [];
    if (!nis) galat.push('NIS kosong');
    else if (!u) galat.push('NIS tidak terdaftar sebagai Penegak');
    else if (terlihat.has(nis)) galat.push('NIS muncul lebih dari sekali dalam berkas');
    if (!b.rombel) galat.push('Rombel kosong');
    else if (!rombel) galat.push(`Rombel "${b.rombel}" tidak sah. ${PESAN_ROMBEL}`);
    if (!galat.length) terlihat.add(nis);
    return { no: b.no, nis: b.nis, nama: u?.nama ?? '', kelasLama: u?.kelas ?? '', rombel, id: u?.id ?? null, username: u?.username ?? nis, galat, siap: galat.length === 0 };
  });
}

/** Membaca berkas Excel: mengembalikan [{ no, nis, rombel }]. Kolom dikenali dari judul: NIS, dan Rombel (atau Kelas). */
export async function bacaExcelRombel(buffer) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new Error('File tidak dapat dibaca. Pastikan formatnya .xlsx (bukan .xls atau .csv).');
  }
  const ws = wb.getWorksheet(NAMA_LEMBAR_ROMBEL) ?? wb.worksheets[0];
  if (!ws) throw new Error('File tidak berisi lembar kerja.');

  let barisJudul = 0;
  let kolom = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount); r += 1) {
    const cur = {};
    ws.getRow(r).eachCell((c, n) => {
      const k = hurufSaja(teksSel(c.value));
      if ((k === 'nis' || k === 'nisn') && !cur.nis) cur.nis = n;
      if ((k === 'rombel' || k === 'rombelbaru' || k === 'kelasbaru') && !cur.rombel) cur.rombel = n;
    });
    if (cur.nis && cur.rombel) { barisJudul = r; kolom = cur; break; }
  }
  if (!barisJudul) throw new Error('Baris judul tidak ditemukan. Gunakan berkas dari tombol "Unduh berkas Excel" (kolom NIS dan Rombel).');

  const baris = [];
  for (let r = barisJudul + 1; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const item = { no: r, nis: teksSel(row.getCell(kolom.nis).value), rombel: teksSel(row.getCell(kolom.rombel).value) };
    if (!item.nis && !item.rombel) continue;
    baris.push(item);
    if (baris.length > MAKS_BARIS_ROMBEL) throw new Error(`Maksimal ${MAKS_BARIS_ROMBEL} baris. Bagi berkas menjadi beberapa bagian.`);
  }
  if (!baris.length) throw new Error('Tidak ada data pada berkas. Isi kolom Rombel mulai baris di bawah judul.');
  return baris;
}

/** Berkas Excel berisi Penegak berkelas lama, dengan kolom Rombel kosong berisi daftar pilihan. */
export async function buatBerkasRombel(users) {
  const { default: ExcelJS } = await import('exceljs');
  const daftar = daftarRombelLama(users);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIGARDA';
  const ws = wb.addWorksheet(NAMA_LEMBAR_ROMBEL, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'NIS', key: 'nis', width: 14 },
    { header: 'Nama', key: 'nama', width: 34 },
    { header: 'Kelas Sekarang', key: 'kelas', width: 16 },
    { header: 'Rombel', key: 'rombel', width: 12 },
  ];
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF45291A' } };
    c.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  daftar.forEach((u, i) => {
    const r = i + 2;
    ws.getCell(r, 1).value = String(u.nis ?? u.username ?? '');
    ws.getCell(r, 1).numFmt = '@';
    ws.getCell(r, 2).value = u.nama;
    ws.getCell(r, 3).value = u.kelas ?? '';
    ws.getCell(r, 4).dataValidation = {
      type: 'list', allowBlank: true, formulae: [`"${SEMUA_ROMBEL.join(',')}"`],
      showErrorMessage: true, errorTitle: 'Rombel', error: PESAN_ROMBEL,
    };
  });
  const petunjuk = wb.addWorksheet('Petunjuk');
  petunjuk.getColumn(1).width = 100;
  [
    'Petunjuk perbarui rombel SIGARDA',
    '',
    'Isi kolom Rombel pada lembar "Rombel" untuk tiap Penegak: pilih dari daftar (X-01 sampai X-10, XI-01 sampai XI-10, XII-01 sampai XII-10).',
    'Jangan mengubah kolom NIS. Nama dan Kelas Sekarang hanya sebagai petunjuk; yang dibaca hanya NIS dan Rombel.',
    'Baris yang Rombel-nya dikosongkan dilewati. Setelah selesai, unggah berkas ini di jendela Perbarui rombel.',
  ].forEach((t) => petunjuk.addRow([t]));
  petunjuk.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF45291A' } };
  petunjuk.eachRow((r) => { r.alignment = { vertical: 'top', wrapText: true }; });
  return wb.xlsx.writeBuffer();
}

export async function unduhBerkasRombel(users) {
  unduhBlob(await buatBerkasRombel(users), 'perbarui-rombel-penegak-sigarda.xlsx');
}
