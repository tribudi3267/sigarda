// Tahap 3 (H3): tabel Pendataan Calon Garuda (Excel) dari menu Kelayakan: selisih bulan, baris, kuota, saran, dan lembar Excel yang dapat dibaca kembali.
import ExcelJS from 'exceljs';
import { buatBufferXlsx } from '../src/lib/exportXlsx.js';
import { GERBANG_BAWAAN } from '../src/lib/gerbangLogic.js';
import { KOLOM_PENDATAAN, barisPendataan, lembarPendataan, selisihBulan } from '../src/lib/pendataanGarudaLogic.js';

let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

console.log('--- selisihBulan ---');
ok(selisihBulan('2026-06-15', '2026-09-15') === 3 && selisihBulan('2026-06-15', '2026-09-14') === 2, 'bulan penuh: genap pada tanggal yang sama, belum genap sehari sebelumnya');
ok(selisihBulan('2026-01-31', '2026-02-28') === 0 && selisihBulan('2025-09-26', '2026-09-26') === 12, 'lintas tahun dan akhir bulan');
ok(selisihBulan(null) === null && selisihBulan('2030-01-01', '2026-09-26') === null, 'kosong atau di masa depan: null');

console.log('\n--- barisPendataan ---');
const aturan = { ...GERBANG_BAWAAN, kuotaPersen: 10 }; // 20 aktif x 10% = 2 kuota
const aktif = Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, nama: `Aktif ${i}`, role: 'peserta', status: 'aktif', kelas: 'X-01', sangga: 'E', agama: 'Islam' }));
const lengkap = (id, nama, kelas, extra = {}) => ({ id, nama, nis: `n${id}`, nta: extra.nta ?? '', role: 'peserta', status: 'aktif', kelas, sangga: 'E', agama: 'Islam', calonGaruda: extra.calon ?? null });
const calon = [lengkap('c1', 'Bagas', 'XI-01', { calon: '2026-08-01', nta: '11.03.001' }), lengkap('c2', 'Ani', 'XI-02', { calon: '2026-08-02' }), lengkap('c3', 'Citra', 'XI-03')];
const lahir = [{ pesertaId: 'c1', tanggal: '2008-03-01' }, { pesertaId: 'c2', tanggal: '2005-03-01' }]; // c3 tanpa tanggal lahir
const pelantikan = [{ id: 1, pesertaId: 'c1', tingkat: 'laksana', tanggal: '2026-05-01', tempat: 'B' }, { id: 2, pesertaId: 'c2', tingkat: 'laksana', tanggal: '2026-09-01', tempat: 'B' }];
const baris = barisPendataan({ calon, aktif: [...aktif, ...calon], progress: {}, pelantikan, lahir, aturan, hari: '2026-09-26' });
ok(baris.length === 3 && baris.map((b) => b.nama).join() === 'Ani,Bagas,Citra' && baris.map((b) => b.no).join() === '1,2,3', 'urut Calon terdaftar dulu (tanggal daftar tidak dipakai, nama), lalu yang belum; nomor urut');
const bag = baris.find((b) => b.nama === 'Bagas');
ok(bag.nomor === '11.03.001' && baris.find((b) => b.nama === 'Ani').nomor === 'nc2', 'kolom NTA / NIS: NTA bila ada, selain itu NIS');
ok(bag.tglLaksana === '1 Mei 2026' && bag.masaLaksana === '4 bulan (>= 3 bulan)' && baris.find((b) => b.nama === 'Ani').masaLaksana === '0 bulan (< 3 bulan)' && baris.find((b) => b.nama === 'Citra').masaLaksana === '', 'tanggal lantik Laksana dan masa Laksana (kosong bila belum tercatat)');
ok(bag.tglLahir === '1 Maret 2008' && /^18 tahun 6 bulan \(dalam rentang\)$/.test(bag.usia) && /di luar rentang/.test(baris.find((b) => b.nama === 'Ani').usia) && baris.find((b) => b.nama === 'Citra').usia === '', 'tanggal lahir dan usia menyebut ada di dalam atau di luar rentang');
ok(baris[0].kuota === 'Masuk Kuota' && baris[1].kuota === 'Masuk Kuota' && baris[2].kuota === 'Di luar kuota', 'kuota 10% dari 23 Penegak aktif = 2: dua pertama masuk, sisanya di luar');
ok(/^Tidak: .*syarat gerbang.*masa Laksana/.test(baris.find((b) => b.nama === 'Citra').saran) && /di luar kuota/.test(baris.find((b) => b.nama === 'Citra').saran), 'saran menyebut alasan (gerbang, masa Laksana, kuota)');
ok(bag.saran.startsWith('Tidak: syarat gerbang belum semua terpenuhi') && !/masa Laksana/.test(bag.saran), 'Bagas: masa Laksana cukup; gerbang belum semua (SKU belum selesai pada data uji)');

console.log('\n--- lembar Excel ---');
const lembar = lembarPendataan({ baris, aturan, hari: '2026-09-26', gudep: { nama: 'Gugus Depan Uji' } });
ok(lembar.kolom === KOLOM_PENDATAAN && lembar.kolom.length === 11 && lembar.baris.every((b) => b.verifikasi === ''), 'sebelas kolom; kolom verifikasi Pembina dikosongkan');
ok(lembar.kolom.map((k) => k.header).includes('Verifikasi Pembina (Eligible)') && lembar.kolom.map((k) => k.header).includes('Saran aplikasi (Eligible)'), 'kolom saran aplikasi terpisah dari verifikasi Pembina');
ok(lembar.judul[0].includes('Gugus Depan Uji') && lembar.judul[1].includes('26 September 2026') && lembar.judul[1].includes('10%'), 'judul memuat gudep, tanggal, dan aturan kuota');
const buf = await buatBufferXlsx([lembar]);
const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
const ws = wb.getWorksheet('Pendataan Calon Garuda');
const kepala = []; ws.getRow(4).eachCell((c) => kepala.push(c.value));
ok(ws && kepala.join('|') === KOLOM_PENDATAAN.map((k) => k.header).join('|'), 'berkas Excel terbaca kembali dengan judul kolom yang sama: ' + kepala.length + ' kolom');
ok(ws.rowCount === 2 + 1 + 1 + 3 && ws.getRow(5).getCell(2).value === 'Ani', 'tiga baris data di bawah judul kolom');

console.log(`RINGKASAN PENDATAAN-GARUDA: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
