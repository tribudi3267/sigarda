import ExcelJS from 'exceljs';
import { susunRaportXlsx, namaFileRaport } from '../src/lib/exportLaporan.js';
import { buatBufferXlsx } from '../src/lib/exportXlsx.js';
import { PENGATURAN_RAPORT_BAWAAN } from '../src/lib/raportLogic.js';

let g = 0, l = 0;
const ok = (c, m) => { if (c) { l++; console.log('ok   :', m); } else { g++; console.log('GAGAL:', m); } };

const peserta = (nama, nis, kelas, jenisKelamin) => ({ id: nis, nama, nis, kelas, sangga: 'Elang', jenisKelamin });
const baris = (p, o = {}) => ({
  peserta: p, tingkat: 'Bantara', hadir: 9, dicatat: 10, kehadiran: 90, lulus: 10, target: 12, capaian: 83, sikap: 4, karakter: [], skk: 2,
  skor: 86, predikatHitung: 'B', predikatAkhir: null, predikat: 'B', catatanPredikat: '', deskripsi: 'Deskripsi uji.', status: 'final', berubah: false, ...o,
});
const data = [
  baris(peserta('Budi Santoso', '1001', 'X IPA 1', 'L')),
  baris(peserta('Ani Lestari', '1002', 'X IPA 1', 'P'), { status: 'draf', deskripsi: 'Saran otomatis.' }),
  baris(peserta('Cici', '1003', 'XI/IPS: 2'), { status: 'belum', sikap: null, predikat: 'A', deskripsi: '' }),
  baris(peserta('Dodi', '1004', 'XI/IPS: 2'), { predikatHitung: 'B', predikatAkhir: 'A', predikat: 'A', catatanPredikat: 'Aktif memimpin', skor: 88 }),
  baris(peserta('Eko', '1005', ''), { status: 'draf' }),
];
const lembar = susunRaportXlsx({ tahunAjaran: '2026/2027', semester: 'ganjil', baris: data, filter: { q: '', sangga: '', kelas: '', peran: '' }, pengaturan: PENGATURAN_RAPORT_BAWAAN });
console.log('lembar:', lembar.map((x) => x.nama).join(' | '));
ok(lembar.length === 4 && lembar[lembar.length - 1].nama === 'Keterangan', 'satu lembar per kelas + Keterangan');
ok(lembar.every((x) => x.nama.length <= 31 && !/[\\/?*[\]:]/.test(x.nama)), 'nama lembar sah untuk Excel (tanpa karakter terlarang)');
const kelasX = lembar.find((x) => x.nama === 'Kelas X IPA 1');
ok(kelasX && kelasX.baris.length === 2 && kelasX.baris[0].nama === 'Ani Lestari', 'baris diurut nama dalam kelas');
ok(namaFileRaport('2026/2027', 'ganjil') === 'nilai-ekstrakurikuler-2026-2027-ganjil.xlsx', 'nama file tanpa garis miring');
const ips = lembar.find((x) => x.nama.startsWith('Kelas XI'));
const cici = ips.baris.find((b) => b.nama === 'Cici');
ok(cici.huruf === '' && cici.skor === '' && cici.status === 'Belum dinilai', 'belum dinilai: tanpa predikat dan skor');
const dodi = ips.baris.find((b) => b.nama === 'Dodi');
ok(dodi.huruf === 'A' && /Diubah dari B ke A: Aktif memimpin/.test(dodi.catatan), 'predikat diubah: catatan tercantum');
ok(lembar[0].judul.some((t) => /PERHATIAN/.test(t)), 'peringatan bila ada yang belum final');
ok(lembar.find((x) => x.nama === 'Tanpa kelas') !== undefined || lembar.some((x) => x.baris.some((b) => b.nama === 'Eko')), 'peserta tanpa kelas tetap ikut');

const buf = await buatBufferXlsx(lembar);
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(buf);
ok(wb.worksheets.length === 4, 'berkas dapat dibuka kembali: ' + wb.worksheets.map((w) => w.name).join(', '));
const ws = wb.getWorksheet('Kelas X IPA 1');
const kepala = ws.getRow(ws.getRow(5).values.length ? 6 : 5);
// cari baris kepala
let barisKepala = 0; ws.eachRow((r, n) => { if (r.getCell(1).value === 'No') barisKepala = n; });
ok(barisKepala > 0, 'baris kepala tabel ditemukan pada baris ' + barisKepala);
const r1 = ws.getRow(barisKepala + 1), r2 = ws.getRow(barisKepala + 2);
ok(r1.getCell(3).value === 'Ani Lestari' && r1.getCell(9).value === 'DRAF (belum final)', 'baris draf: status tertulis');
const warna = (c) => c.fill?.fgColor?.argb;
ok(warna(r1.getCell(3)) === 'FFFEF3C7', 'baris draf berwarna kuning');
ok(r2.getCell(3).value === 'Budi Santoso' && r2.getCell(9).value === 'Final' && warna(r2.getCell(9)) === 'FFD1FAE5', 'baris final: status Final berwarna hijau, sel lain tanpa warna: ' + warna(r2.getCell(3)));
ok(r2.getCell(1).value === 2 && r2.getCell(2).value === '1001' && r2.getCell(6).value === 'B' && r2.getCell(7).value === 'Baik', 'kolom NIS, predikat huruf dan keterangan benar');
ok(r1.getCell(4).value === 'Perempuan' && r2.getCell(4).value === 'Laki-laki' && ws.getRow(barisKepala).getCell(4).value === 'Jenis Kelamin', 'kolom Jenis Kelamin sesudah Nama: Perempuan, Laki-laki, dan judul kolom');
ok(lembar.flatMap((x) => x.baris).find((b) => b.nama === 'Eko').jk === '', 'jenis kelamin yang belum diisi: sel kosong');
ok(String(r2.getCell(8).value) === 'Deskripsi uji.', 'deskripsi capaian terisi');
const ket = wb.getWorksheet('Keterangan');
let teks = ''; ket.eachRow((r) => { teks += r.getCell(2).value + ' '; });
ok(/A Sangat Baik: 90 ke atas\. B Baik: 75-89\. C Cukup: 60-74\. D Kurang: di bawah 60/.test(teks), 'keterangan memuat pita nilai dari pengaturan');
// tanpa data
const kosong = susunRaportXlsx({ tahunAjaran: '2026/2027', semester: 'genap', baris: [], filter: { q: '', sangga: '', kelas: '', peran: '' }, pengaturan: PENGATURAN_RAPORT_BAWAAN });
ok(kosong.length === 2 && kosong[0].baris.length === 0, 'tanpa data: tetap menghasilkan lembar kosong + keterangan');
await buatBufferXlsx(kosong);
ok(true, 'lembar kosong dapat dibuat');

console.log(`\nRINGKASAN XLSX RAPORT: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
