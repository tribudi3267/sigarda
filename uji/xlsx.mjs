import ExcelJS from 'exceljs';
import fs from 'fs';
import { buatSeed } from '../src/data/seed.js';
import { pesertaDenganPeran } from '../src/lib/skuLogic.js';
import { rekapAbsensi, sesiPeriode, tahunAjaranDari } from '../src/lib/absensiLogic.js';
import { rekapPortofolio } from '../src/lib/portofolioLogic.js';
import { susunAbsensiXlsx, susunPortofolioXlsx } from '../src/lib/exportLaporan.js';
import { buatBufferXlsx } from '../src/lib/exportXlsx.js';
import { hariIni } from '../src/lib/format.js';

let gagal = 0;
const cek = (n, k, i = '') => { if (!k) gagal++; console.log(`${k ? 'OK   ' : 'GAGAL'} ${n}${i ? '  -> ' + i : ''}`); };

const db = buatSeed();
const daftar = pesertaDenganPeran(db.progress, db.users);
const ta = tahunAjaranDari(hariIni());

// ---- Absensi
const sesi = sesiPeriode(db.absensi, ta, 'ganjil');
const rekap = rekapAbsensi(db.absensi, daftar, sesi).sort((a, b) => a.user.nama.localeCompare(b.user.nama, 'id'));
const sheets = susunAbsensiXlsx({ tahunAjaran: ta, periode: 'ganjil', rekap, sesiList: sesi, filter: { q: '', sangga: '', kelas: '', peran: '' } });
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(await buatBufferXlsx(sheets));
console.log('lembar:', wb.worksheets.map((w) => w.name).join(', '));
cek('3 lembar', wb.worksheets.length === 3);
const ws = wb.getWorksheet('Rekap');
console.log('judul:', ws.getCell('A1').value, '|', ws.getCell('A2').value);
console.log('baris 4 (judul kolom):', ws.getRow(5).values.slice(1).join(' | '));
const b1 = ws.getRow(6).values.slice(1);
console.log('baris data 1:', b1.join(' | '));
cek('judul memuat tahun ajaran & semester', String(ws.getCell('A2').value).includes('2026/2027') && String(ws.getCell('A2').value).includes('Ganjil'));
cek('jumlah baris data = jumlah peserta', ws.rowCount - 5 === daftar.length, `${ws.rowCount - 5} baris`);
const idxPersen = ws.getRow(5).values.indexOf('Kehadiran (%)');
const dataX = ws.getRow(6).values;
cek('persen di Excel = hasil hitung', dataX[idxPersen] === rekap[0].persen, `${dataX[idxPersen]} vs ${rekap[0].persen}`);
const rendahBaris = [...Array(daftar.length)].map((_, i) => ws.getRow(6 + i)).find((r) => r.values[idxPersen] < 75);
cek('sel persen rendah diwarnai merah muda', rendahBaris.getCell(idxPersen).fill?.fgColor?.argb === 'FFFEE2E2');
const pj = wb.getWorksheet('Per Jumat');
console.log('Per Jumat kolom:', pj.getRow(5).values.slice(1, 9).join(' | '), '...');
cek('Per Jumat: kolom tanggal = jumlah sesi', pj.getRow(5).values.length - 1 === 4 + sesi.length + 2);

// ---- Portofolio
const rp = rekapPortofolio(db.portofolio, daftar);
const shp = susunPortofolioXlsx({ rekap: rp, portofolio: db.portofolio, filter: { q: '', sangga: '', kelas: '', peran: '' } });
const wb2 = new ExcelJS.Workbook();
await wb2.xlsx.load(await buatBufferXlsx(shp));
console.log('lembar portofolio:', wb2.worksheets.map((w) => w.name).join(', '));
const cl = wb2.getWorksheet('Cek List');
console.log('Cek List baris data:', cl.getRow(5 + 1).values.slice(1, 8).join(' | '));
cek('Cek List 26 kolom dokumen + nama', cl.getRow(4 + 1).values.length - 1 === 27);
const dd = wb2.getWorksheet('Daftar Dokumen');
cek('Daftar Dokumen 26 baris', dd.rowCount - 3 === 26, `${dd.rowCount - 3}`);
console.log(gagal ? `\n${gagal} GAGAL` : '\nSEMUA LULUS');
process.exit(gagal ? 1 : 0);

