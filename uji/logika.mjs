import { TINGKAT, AGAMA, INDEKS_POIN, labelPoin } from '../src/data/skuData.js';
import { ITEM_PORTOFOLIO } from '../src/data/portofolioData.js';
import * as sku from '../src/lib/skuLogic.js';
import * as abs from '../src/lib/absensiLogic.js';
import * as pf from '../src/lib/portofolioLogic.js';
import { buatSeed } from '../src/data/seed.js';
import { buatBufferXlsx } from '../src/lib/exportXlsx.js';
import fs from 'fs';

let gagal = 0;
const cek = (nama, kondisi, info = '') => {
  if (!kondisi) gagal += 1;
  console.log(`${kondisi ? 'OK   ' : 'GAGAL'} ${nama}${info ? '  -> ' + info : ''}`);
};

// ---- Katalog resmi
cek('Bantara 23 butir', TINGKAT.Bantara.butir.length === 23);
cek('Laksana 22 butir', TINGKAT.Laksana.butir.length === 22);
const hit = (t, a) => sku.daftarPoin(t, a).filter((p) => p.butirNo === 1).length;
const bantaraSub = Object.fromEntries(AGAMA.map((a) => [a, hit('Bantara', a)]));
const laksanaSub = Object.fromEntries(AGAMA.map((a) => [a, hit('Laksana', a)]));
console.log('sub butir 1 Bantara:', JSON.stringify(bantaraSub));
console.log('sub butir 1 Laksana:', JSON.stringify(laksanaSub));
cek('Bantara sub: Islam6 Katolik2 Protestan1 Hindu7 Buddha5',
  bantaraSub.Islam === 6 && bantaraSub.Katolik === 2 && bantaraSub.Protestan === 1 && bantaraSub.Hindu === 7 && bantaraSub.Buddha === 5);
cek('Laksana sub: Islam6 Katolik3 Protestan3 Hindu7 Buddha5',
  laksanaSub.Islam === 6 && laksanaSub.Katolik === 3 && laksanaSub.Protestan === 3 && laksanaSub.Hindu === 7 && laksanaSub.Buddha === 5);
cek('Khonghucu memakai 1 butir pengganti', bantaraSub.Khonghucu === 1);
const idAll = Object.keys(INDEKS_POIN);
cek('id unit unik & terindeks', new Set(idAll).size === idAll.length, `${idAll.length} unit`);
cek('labelPoin', labelPoin(INDEKS_POIN['BAN-01-ISL-1']) === 'Butir 1a' && labelPoin(INDEKS_POIN['LAK-22']) === 'Butir 22');
cek('26 dokumen portofolio', ITEM_PORTOFOLIO.length === 26);

// ---- Seed & peran
const db = buatSeed();
const peserta = db.users.filter((u) => u.role === 'peserta');
const peran = Object.fromEntries(peserta.map((u) => [u.nama, sku.peranPeserta(db.progress, u)]));
console.log('peran:', JSON.stringify(peran, null, 1));
cek('Bagas & Wahyu = calon-garuda', peran['Bagas Saputra'] === 'calon-garuda' && peran['Wahyu Hidayat'] === 'calon-garuda');
cek('Maria (layak tapi belum daftar) = calon-laksana', peran['Maria Goretti'] === 'calon-laksana');
cek('Maria layak Garuda', sku.layakGaruda(db.progress, peserta.find((u) => u.nama === 'Maria Goretti')));
cek('Ahmad = calon-bantara', peran['Ahmad Fauzi'] === 'calon-bantara');
const ahmad = peserta.find((u) => u.id === 'u-p1');
const hAhmad = sku.hitungProgres(db.progress, ahmad, 'Bantara');
console.log('Ahmad Bantara:', JSON.stringify(hAhmad));
cek('Ahmad 4 dari 23 butir', hAhmad.lulus === 4 && hAhmad.total === 23);
const rizky = peserta.find((u) => u.id === 'u-p7');
const hRizky = sku.hitungProgres(db.progress, rizky, 'Bantara');
cek('Rizky butir 1 sebagian: 0 butir lulus, 3 unit lulus', hRizky.lulus === 0 && hRizky.lulusUnit === 3, JSON.stringify(hRizky));
const bagas = peserta.find((u) => u.id === 'u-p5');
cek('Bagas Laksana 100%', sku.hitungProgres(db.progress, bagas, 'Laksana').persen === 100);

// ---- Aturan: Laksana terkunci sebelum Bantara selesai
try {
  sku.ajukanPengujian(db.progress, { peserta: ahmad, skuId: 'LAK-02', jadwal: '2026-10-01', pengujiId: 'u-penguji-1' });
  cek('Laksana terkunci utk Ahmad', false);
} catch (e) { cek('Laksana terkunci utk Ahmad', /Bantara/.test(e.message), e.message); }
// Sub-butir agama Islam boleh diajukan; sub-butir agama lain tidak ada di id Ahmad
const ok1 = sku.bisaDiajukan(db.progress, ahmad, 'BAN-06');
cek('Ahmad boleh ajukan BAN-06', ok1.ok, JSON.stringify(ok1));

// ---- Absensi
const a = db.absensi;
const sesi = Object.keys(a.sesi).sort();
console.log('sesi:', sesi.length, 'dari', sesi[0], 'sampai', sesi[sesi.length - 1]);
cek('semua sesi hari Jumat', sesi.every(abs.adalahJumat));
const ta = abs.tahunAjaranDari('2026-09-19');
cek('TA 2026-09-19 = 2026/2027 Ganjil', ta === '2026/2027' && abs.periodeDari('2026-09-19') === 'ganjil');
cek('TA 2026-03-01 = 2025/2026 Genap', abs.tahunAjaranDari('2026-03-01') === '2025/2026' && abs.periodeDari('2026-03-01') === 'genap');
const r = abs.rentangPeriode('2026/2027', 'setahun');
cek('rentang setahun', r.mulai === '2026-07-01' && r.akhir === '2027-06-30');
const jumat = abs.jumatDalamRentang('2026-07-01', '2026-07-31');
cek('Jumat Juli 2026 = 3,10,17,24,31', JSON.stringify(jumat) === JSON.stringify(['2026-07-03', '2026-07-10', '2026-07-17', '2026-07-24', '2026-07-31']), jumat.join(','));
const sesiGanjil = abs.sesiPeriode(a, ta, 'ganjil');
const rekap = abs.rekapAbsensi(a, peserta, sesiGanjil);
const rk = abs.ringkasAbsensi(rekap, sesiGanjil, 75);
console.log('ringkas ganjil:', JSON.stringify(rk));
cek('H+I+S+A = total tiap peserta', rekap.every((x) => x.H + x.I + x.S + x.A === x.total));
cek('total = jumlah sesi (semua peserta bergabung sejak awal)', rekap.every((x) => x.total === sesiGanjil.length));
console.log('TA tersedia:', abs.daftarTahunAjaran(a).join(', '));
const setahun = abs.sesiPeriode(a, '2025/2026', 'setahun');
cek('TA 2025/2026 punya sesi (Jan-Jun 2026)', setahun.length > 0, `${setahun.length} sesi`);
// peserta baru bergabung setelah sesi: tidak dihitung
const baru = { id: 'x', dibuat: sesi[sesi.length - 1] };
const rb = abs.rekapAbsensi(a, [baru], abs.sesiPeriode(a, ta, 'setahun'))[0];
cek('peserta baru hanya dihitung sejak bergabung', rb.total <= 1, `total ${rb.total}`);

// ---- Portofolio
const rekapPf = pf.rekapPortofolio(db.portofolio, sku.pesertaDenganPeran(db.progress, db.users));
console.log('rekap portofolio:', JSON.stringify(rekapPf.map((x) => [x.user.nama, x.siap, x.proses, x.belum, x.persen])));
cek('2 calon garuda di rekap', rekapPf.length === 2);
const wahyu = rekapPf.find((x) => x.user.id === 'u-p9');
cek('Wahyu 22 siap = 85%', wahyu.siap === 22 && wahyu.persen === 85 && wahyu.belumSiap === 4);
const p2 = pf.ubahItemPortofolio(db.portofolio, { pesertaId: 'u-p9', itemId: 'PF-26', patch: { status: 'siap' }, oleh: 'u-p9' });
cek('ubah item menambah jurnal', p2['u-p9']['PF-26'].riwayat.length === 1 && pf.hitungPortofolio(p2, 'u-p9').siap === 23);
const p3 = pf.ubahItemPortofolio(p2, { pesertaId: 'u-p9', itemId: 'PF-26', patch: { status: 'siap' }, oleh: 'u-p9' });
cek('tidak ada perubahan -> tidak menambah jurnal', p3 === p2);
cek('jurnalTerbaru terurut', pf.jurnalTerbaru(p2, 'u-p9', 3)[0].item.id === 'PF-26');

// ---- Excel
const buf = await buatBufferXlsx([{
  nama: 'Rekap', judul: ['Judul', 'Sub'], kolom: [{ header: 'Nama', key: 'n', lebar: 20 }, { header: '%', key: 'p', format: '0"%"', rata: 'center' }],
  baris: [{ n: 'A', p: 90 }, { n: 'B', p: 40 }], warna: (b, k) => (k === 'p' && b.p < 75 ? 'FFFEE2E2' : undefined),
}]);
fs.writeFileSync(process.argv[2] ?? (process.env.TEMP + '/uji-logika.xlsx'), Buffer.from(buf));
cek('xlsx dibuat', buf.byteLength > 1000, `${buf.byteLength} byte`);

console.log(gagal ? `\n${gagal} PENGUJIAN GAGAL` : '\nSEMUA PENGUJIAN LULUS');
process.exit(gagal ? 1 : 0);
