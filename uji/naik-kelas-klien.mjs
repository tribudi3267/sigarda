// Fase 6a: logika klien status anggota dan naik kelas (naikKelasLogic, naikKelasExcel), filter Status pada FilterBar, daftar kerja yang hanya memuat
// Penegak aktif, dan alur lengkap dengan server (isian bawaan -> pemeriksaan -> penerapan tahun demi tahun).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import FilterBar, { FILTER_AWAL, STATUS_SEMUA, terapkanFilter } from '../src/components/FilterBar.jsx';
import {
  AKSI, anggotaAktif, bangunBaris, gabungkanBerkas, hanyaLihat, hitungStatus, labelStatus, normalisasiAksi, ringkasanTeks, rombelLanjutanSama,
  statusAnggota, susunPermintaan, tahunAjaranBaruBawaan, tahunLulus, tingkatRombel,
} from '../src/lib/naikKelasLogic.js';
import { bacaExcelNaikKelas, buatBerkasNaikKelas } from '../src/lib/naikKelasExcel.js';
import { antrianPengujian, pesertaDenganPeran, rekapAnggota } from '../src/lib/skuLogic.js';
import { cakupanAgama, jumlahPesertaPerRombel, pesertaRombelLama } from '../src/lib/rombelLogic.js';
import { dariPengajuan } from '../src/lib/sesiLogic.js';
import { petaProfil, susunBatchNaikKelas, susunLogNaikKelas } from '../src/lib/mapDb.js';

let lulus = 0; let gagal = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const P = process.cwd().replace(/\\/g, '/');
const sumber = (f) => readFileSync(`${P}/${f}`, 'utf8');

console.log('--- Status anggota ---');
{
  ok(statusAnggota({}) === 'aktif' && statusAnggota({ status: 'alumni' }) === 'alumni' && statusAnggota(null) === 'aktif', 'statusAnggota: tanpa isian = aktif (data lama)');
  ok(anggotaAktif({ status: 'aktif' }) && !anggotaAktif({ status: 'nonaktif' }) && !anggotaAktif({ status: 'alumni' }) && anggotaAktif({}), 'anggotaAktif');
  ok(hanyaLihat({ role: 'peserta', status: 'alumni' }) && hanyaLihat({ role: 'peserta', status: 'nonaktif' }) && !hanyaLihat({ role: 'peserta' }) && !hanyaLihat({ role: 'penguji' }), 'hanyaLihat: hanya Penegak nonaktif/alumni');
  ok(labelStatus({ status: 'nonaktif' }) === 'Nonaktif' && labelStatus({}) === 'Aktif', 'labelStatus');
  const petaSimpan = petaProfil({ id: 'x', username: 'u', role: 'peserta', nama: 'N', status: 'alumni', status_pada: '2027-07-01T00:00:00Z', lulus_ta: '2026/2027', wajib_ganti_pin: false });
  ok(petaSimpan.status === 'alumni' && petaSimpan.statusPada === '2027-07-01' && petaSimpan.lulusTa === '2026/2027', 'petaProfil memuat status, tanggal, dan tahun kelulusan');
  ok(petaProfil({ id: 'x', username: 'u', role: 'peserta', nama: 'N' }).status === 'aktif', 'petaProfil: kolom belum ada (skema lama) = aktif');
  const u = [{ role: 'peserta', status: 'aktif' }, { role: 'peserta' }, { role: 'peserta', status: 'nonaktif' }, { role: 'peserta', status: 'alumni' }, { role: 'penguji' }];
  ok(JSON.stringify(hitungStatus(u)) === '{"aktif":2,"nonaktif":1,"alumni":1}', 'hitungStatus hanya Penegak');
}

console.log('\n--- Tingkat, tahun ajaran, aksi ---');
{
  ok(tingkatRombel('X-03') === 1 && tingkatRombel('XI-10') === 2 && tingkatRombel('XII-01') === 3 && tingkatRombel('X') === null && tingkatRombel('') === null && tingkatRombel(null) === null, 'tingkatRombel: X=1, XI=2, XII=3, lama=null');
  ok(rombelLanjutanSama('XI-04') === 'XII-04' && rombelLanjutanSama('X-04') === '' && rombelLanjutanSama('') === '' && rombelLanjutanSama('XII-04') === '', 'rombelLanjutanSama: hanya XI ke XII dengan nomor sama');
  ok(tahunAjaranBaruBawaan('2027-05-10') === '2027/2028' && tahunAjaranBaruBawaan('2027-07-01') === '2027/2028' && tahunAjaranBaruBawaan('2027-12-31') === '2027/2028' && tahunAjaranBaruBawaan('2027-01-05') === '2027/2028', 'tahun ajaran baru bawaan: Januari-Juni = tahun ajaran depan (yang dimulai Juli), Juli-Desember = berjalan');
  ok(tahunLulus('2027/2028') === '2026/2027', 'tahunLulus = tahun ajaran sebelumnya');
  const t = { lanjut: ['Lanjut', 'lanjut', ' YA ', 'y', 'Naik', 'Aktif'], tidak_lanjut: ['Tidak lanjut', 'tidak_lanjut', 'TIDAK', 'T', 'Berhenti', 'Nonaktif'], lulus: ['Lulus', 'alumni'], '': ['', '  ', null, undefined] };
  ok(Object.entries(t).every(([k, v]) => v.every((x) => normalisasiAksi(x) === k)), 'normalisasiAksi mengenali variasi penulisan');
  ok(normalisasiAksi('pindah') === null && normalisasiAksi('lulus?') === 'lulus', 'aksi tak dikenal = null (dilaporkan)');
  ok(AKSI.join() === 'lanjut,tidak_lanjut,lulus', 'AKSI sama dengan server');
  ok(ringkasanTeks({ lanjut: 3, tidak_lanjut: 200, lulus: 5, sama: 1 }).join('; ') === '3 lanjut; 200 tidak lanjut (nonaktif); 5 lulus (alumni); 1 tanpa perubahan' && ringkasanTeks(null).length === 0, 'ringkasanTeks');
}

console.log('\n--- Isian bawaan dan penyusunan permintaan ---');
const u = (id, nama, kelas, status = 'aktif', extra = {}) => ({ id, role: 'peserta', nama, nis: id, username: id, kelas, sangga: 'Elang', agama: 'Islam', status, ...extra });
const kelompok = [
  u('x1', 'Adi', 'X-01'), u('x2', 'Budi', 'X-02'), u('xi1', 'Citra', 'XI-03'), u('xi2', 'Dewi', 'XI-04', 'nonaktif'), u('xii1', 'Eko', 'XII-01'),
  u('xii2', 'Fajar', 'XII-02', 'nonaktif'), u('al', 'Gita', 'XII-05', 'alumni'), u('lama', 'Hana', 'XI'), u('kosong', 'Ida', ''),
  { id: 'p', role: 'penguji', jabatan: 'Pembina', nama: 'Pembina', username: 'p' },
];
{
  const b = bangunBaris(kelompok);
  const per = Object.fromEntries(b.map((x) => [x.id, x]));
  ok(b.length === 8 && !per.al && !per.p, 'baris: semua Penegak yang belum alumni (alumni dan penguji tidak ikut)');
  ok(per.x1.aksi === 'tidak_lanjut' && per.x1.rombelBaru === '' && per.x2.aksi === 'tidak_lanjut', 'kelas X: bawaan Tidak lanjut, rombel baru kosong');
  ok(per.xi1.aksi === 'lanjut' && per.xi1.rombelBaru === 'XII-03', 'kelas XI aktif: Lanjut ke XII dengan nomor rombel sama');
  ok(per.xi2.aksi === 'tidak_lanjut' && per.xi2.rombelBaru === '', 'kelas XI nonaktif tetap Tidak lanjut');
  ok(per.xii1.aksi === 'lulus' && per.xii2.aksi === 'lulus', 'kelas XII (aktif dan nonaktif): Lulus');
  ok(per.lama.aksi === '' && per.kosong.aksi === '', 'kelas lama atau kosong: tidak diisi (dilewati sampai Admin memutuskan)');
  { const urut = b.map((x) => x.id); ok(urut.indexOf('x1') < urut.indexOf('x2') && urut.indexOf('x2') < urut.indexOf('xi1') && urut.indexOf('xi1') < urut.indexOf('xii1'), `urut kelas lalu nama: ${urut.join()}`); }
  const r = susunPermintaan(b);
  ok(r.length === 6 && !r.some((x) => x.username === 'lama' || x.username === 'kosong'), 'permintaan hanya memuat baris beraksi (6 dari 8)');
  ok(JSON.stringify(r.find((x) => x.username === 'xi1')) === '{"username":"xi1","rombel":"XII-03","aksi":"lanjut"}', 'bentuk permintaan { username, rombel, aksi }');
  const ubah = b.map((x) => (x.id === 'x1' ? { ...x, aksi: 'lanjut', rombelBaru: 'xi 5' } : x));
  ok(susunPermintaan(ubah).find((x) => x.username === 'x1').rombel === 'XI-05', 'rombel dibakukan (xi 5 -> XI-05)');
  const rusak = b.map((x) => (x.id === 'x2' ? { ...x, aksi: 'lanjut', rombelBaru: 'ngawur' } : x));
  ok(susunPermintaan(rusak).find((x) => x.username === 'x2').rombel === 'ngawur', 'rombel tak dapat dibakukan dikirim apa adanya (server melaporkan)');
}

console.log('\n--- Menggabungkan berkas Excel ---');
{
  const b = bangunBaris(kelompok);
  const g = gabungkanBerkas(b, [
    { no: 2, nis: 'x1', rombel: 'XI-08', aksi: 'Lanjut' },
    { no: 3, nis: 'X2', rombel: '', aksi: 'tidak lanjut' },
    { no: 4, nis: 'zzz', rombel: 'XI-01', aksi: 'lanjut' },
    { no: 5, nis: 'xi1', rombel: 'XII-09', aksi: 'pindah' },
    { no: 6, nis: 'al', rombel: '', aksi: 'lulus' },
    { no: 7, nis: 'x1', rombel: 'XI-09', aksi: 'lanjut' },
    { no: 8, nis: '', rombel: '', aksi: 'lanjut' },
    { no: 9, nis: 'xii1', rombel: '', aksi: '' },
    { no: 10, nis: 'xi2', rombel: 'XII-04', aksi: 'lanjut' },
  ]);
  const per = Object.fromEntries(g.baris.map((x) => [x.id, x]));
  ok(per.x1.aksi === 'lanjut' && per.x1.rombelBaru === 'XI-08', 'baris berkas mengganti isian (NIS tidak membedakan huruf besar)');
  ok(per.xi2.aksi === 'lanjut' && per.xi2.rombelBaru === 'XII-04', 'nonaktif dapat diubah menjadi Lanjut lewat berkas');
  ok(per.xi1.aksi === 'lanjut' && per.xi1.rombelBaru === 'XII-03', 'aksi tidak dikenal dilewati: isian bawaan tetap');
  ok(per.xii1.aksi === 'lulus', 'baris berkas tanpa aksi dan rombel dibiarkan seperti bawaan');
  ok(g.terisi === 3, `terisi 3 baris (x1, x2, xi2): ${g.terisi}`);
  const pesan = g.dilewati.map((d) => `${d.no}:${d.pesan.slice(0, 22)}`).join(' | ');
  ok(g.dilewati.length === 5, `5 baris dilewati (NIS tak ada, aksi tak dikenal, alumni, ganda, kosong): ${pesan}`);
  ok(g.dilewati.find((d) => d.no === 4).pesan.includes('tidak ditemukan') && g.dilewati.find((d) => d.no === 5).pesan.includes('tidak dikenal') && g.dilewati.find((d) => d.no === 7).pesan.includes('lebih dari sekali') && g.dilewati.find((d) => d.no === 8).pesan.includes('NIS kosong'), 'pesan pelewatan jelas');
  ok(b.find((x) => x.id === 'x1').aksi === 'tidak_lanjut', 'baris asli tidak diubah (tanpa efek samping)');
}

console.log('\n--- Berkas Excel: unduh dan baca kembali ---');
{
  const b = bangunBaris(kelompok);
  const buf = await buatBerkasNaikKelas(b, '2027/2028');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
  const ws = wb.getWorksheet('Naik Kelas');
  ok(!!ws && ws.getRow(1).values.slice(1).join('|') === 'NIS|Nama|Rombel Sekarang|Status Sekarang|Rombel Baru|Aksi', 'judul kolom: NIS, Nama, Rombel Sekarang, Status Sekarang, Rombel Baru, Aksi');
  const barisDi = (nis) => { for (let r = 2; r <= ws.rowCount; r += 1) if (String(ws.getCell(r, 1).value) === nis) return r; return 0; };
  ok(ws.rowCount === b.length + 1 && ws.getCell(barisDi('x1'), 6).value === 'Tidak lanjut' && ws.getCell(barisDi('xi1'), 5).value === 'XII-03' && ws.getCell(barisDi('xi1'), 6).value === 'Lanjut', 'isian bawaan tertulis (X tidak lanjut, XI lanjut ke XII-03)');
  ok(ws.getCell(barisDi('x1'), 5).dataValidation?.formulae?.[0]?.includes('XII-10') && ws.getCell(barisDi('x1'), 6).dataValidation?.formulae?.[0]?.includes('Tidak lanjut'), 'kolom Rombel Baru dan Aksi berisi daftar pilihan');
  ok(!!wb.getWorksheet('Petunjuk'), 'ada lembar Petunjuk');
  ws.getCell(barisDi('x1'), 5).value = 'XI-07'; ws.getCell(barisDi('x1'), 6).value = 'Lanjut';
  const buf2 = await wb.xlsx.writeBuffer();
  const dibaca = await bacaExcelNaikKelas(buf2);
  const dx1 = dibaca.find((x) => x.nis === 'x1');
  ok(dibaca.length === b.length && dx1.rombel === 'XI-07' && dx1.aksi === 'Lanjut', 'baca kembali: NIS, rombel baru, aksi');
  const g = gabungkanBerkas(b, dibaca);
  ok(g.baris.find((x) => x.id === 'x1').aksi === 'lanjut' && g.baris.find((x) => x.id === 'x1').rombelBaru === 'XI-07', 'berkas yang disunting kembali ke layar');
  let galat = '';
  try { await bacaExcelNaikKelas(Buffer.from('bukan excel')); } catch (e) { galat = e.message; }
  ok(/tidak dapat dibaca/.test(galat), 'berkas rusak: pesan jelas');
  const wb2 = new ExcelJS.Workbook(); wb2.addWorksheet('X').addRow(['Nama', 'Kelas']);
  let g2 = ''; try { await bacaExcelNaikKelas(await wb2.xlsx.writeBuffer()); } catch (e) { g2 = e.message; }
  ok(/Baris judul tidak ditemukan/.test(g2), 'berkas tanpa kolom NIS dan Aksi: pesan jelas');
}

console.log('\n--- Filter Status pada FilterBar ---');
{
  const daftar = [{ id: 1, status: 'aktif' }, { id: 2 }, { id: 3, status: 'nonaktif' }, { id: 4, status: 'alumni' }];
  ok(FILTER_AWAL.status === 'aktif' && STATUS_SEMUA === 'semua', 'filter awal: status Aktif');
  ok(terapkanFilter(daftar, FILTER_AWAL).map((x) => x.id).join() === '1,2', 'bawaan hanya Penegak aktif (data lama tanpa status ikut aktif)');
  ok(terapkanFilter(daftar, {}).map((x) => x.id).join() === '1,2', 'filter tanpa isian status = aktif (aman bagi halaman lama)');
  ok(terapkanFilter(daftar, { status: 'nonaktif' }).map((x) => x.id).join() === '3' && terapkanFilter(daftar, { status: 'alumni' }).map((x) => x.id).join() === '4', 'status nonaktif dan alumni');
  ok(terapkanFilter(daftar, { status: 'semua' }).length === 4, 'Semua status');
  const render = (props) => renderToStaticMarkup(h(FilterBar, { data: [], setFilter: () => {}, ...props }));
  const tanpa = render({ filter: FILTER_AWAL });
  ok(!tanpa.includes('Filter status anggota'), 'pilihan Status hanya tampil bila diminta lewat tampil');
  const dengan = render({ filter: FILTER_AWAL, tampil: ['status', 'kelas'] });
  ok(dengan.includes('Filter status anggota') && dengan.includes('Status: Aktif') && dengan.includes('Status: Alumni') && dengan.includes('Semua status') && !dengan.includes('Bersihkan filter'), 'pilihan Status: Aktif, Nonaktif, Alumni, Semua; tanpa "Bersihkan" pada bawaan');
  const alumni = render({ filter: { ...FILTER_AWAL, status: 'alumni' }, tampil: ['status'] });
  ok(alumni.includes('Bersihkan filter'), 'memilih status selain Aktif memunculkan "Bersihkan filter"');
}

console.log('\n--- Daftar kerja hanya memuat Penegak aktif ---');
{
  const pengguna = [
    u('a', 'Ahmad', 'X-01'), u('n', 'Nonaktif', 'X-01', 'nonaktif'), u('al', 'Alumni', 'XII-01', 'alumni'),
    { id: 'pb', role: 'penguji', jabatan: 'Pembina', nama: 'Pembina', username: 'pb', agama: 'Islam' },
  ];
  const prog = (status) => ({ 'BAN-01-ISL-1': { status } });
  const progress = { a: prog('diajukan'), n: prog('diajukan'), al: prog('proses') };
  ok(antrianPengujian(progress, pengguna).map((x) => x.peserta.id).join() === 'a', 'antrian pengujian mengabaikan nonaktif dan alumni');
  ok(rekapAnggota(progress, pengguna).length === 1 && pesertaDenganPeran(progress, pengguna).length === 3, 'rekapAnggota hanya aktif; pesertaDenganPeran memuat semua (untuk pencarian)');
  ok(JSON.stringify(jumlahPesertaPerRombel(pengguna)) === '{"X-01":1}', 'jumlah Penegak per rombel hanya yang aktif');
  ok(cakupanAgama(pengguna, []).find((x) => x.agama === 'Islam')?.penegak === 1, 'cakupan agama menghitung Penegak aktif');
  ok(dariPengajuan(progress, pengguna).peserta.join() === 'a', 'sesi ujian dari pengajuan: hanya Penegak aktif');
  ok(pesertaRombelLama([u('l1', 'Lama', 'X'), u('l2', 'Lama2', 'X', 'nonaktif')]).map((x) => x.id).join() === 'l1', 'rombel lama: nonaktif tidak ditagih pembaruan');
}

console.log('\n--- Alur lengkap dengan server: bawaan, pemeriksaan, penerapan, tahun berikutnya ---');
{
  const pg = new PGlite();
  await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
  await isiDataContoh(pg);
  await pg.query('update public.profiles set wajib_ganti_pin = false');
  const api = buatApi(buatKlienFake(pg));
  ok((await api.masuk('admin', PIN_DEMO.admin)).ok, 'Admin masuk');
  const muat = async () => (await api.muatProfil()).data;
  let users = await muat();
  ok(users.filter((x) => x.role === 'peserta').every((x) => x.status === 'aktif'), 'muatProfil: semua Penegak contoh aktif');
  let baris = bangunBaris(users);
  ok(baris.length === 12, `12 Penegak contoh masuk daftar (${baris.length})`);
  // Tandai dua Penegak kelas X yang melanjutkan: Ahmad ke XI-07 dan Siti ke XI-02
  baris = baris.map((x) => (x.username === '10231' ? { ...x, aksi: 'lanjut', rombelBaru: 'XI-07' } : x.username === '10232' ? { ...x, aksi: 'lanjut', rombelBaru: 'XI-02' } : x));
  const izin = await api.naikKelas('2027/2028', susunPermintaan(baris), false);
  ok(izin.ok && izin.data.galat === 0, 'pemeriksaan: tanpa galat');
  const s = izin.data.ringkasan;
  ok(s.lanjut === 2 + 4 && s.tidak_lanjut === 2 && s.lulus === 4, `ringkasan: 6 lanjut (2 dari X, 4 dari XI), 2 tidak lanjut, 4 lulus (${JSON.stringify(s)})`);
  const r = await api.naikKelas('2027/2028', susunPermintaan(baris), true);
  ok(r.ok && r.data.batch > 0, 'kenaikan diterapkan');
  users = await muat();
  const per = Object.fromEntries(users.filter((x) => x.role === 'peserta').map((x) => [x.username, x]));
  ok(per['10231'].kelas === 'XI-07' && per['10231'].status === 'aktif' && per['10232'].kelas === 'XI-02', 'Ahmad dan Siti lanjut ke XI-07 dan XI-02');
  ok(per['10233'].status === 'nonaktif' && per['10233'].kelas === 'X-02' && per['10234'].status === 'nonaktif', 'Rizky dan Kevin (kelas X, tidak ditandai) nonaktif, rombel tetap');
  ok(per['10118'].kelas === 'XII-01' && per['10119'].kelas === 'XII-02' && per['10120'].kelas === 'XII-01' && per['10121'].kelas === 'XII-02' && per['10118'].status === 'aktif', 'kelas XI lanjut ke XII dengan nomor rombel sama');
  ok(['10007', '10008', '10009', '10010'].every((n) => per[n].status === 'alumni' && per[n].lulusTa === '2026/2027'), 'kelas XII lulus: alumni tahun ajaran 2026/2027');
  ok(JSON.stringify(hitungStatus(users)) === '{"aktif":6,"nonaktif":2,"alumni":4}', 'hitungStatus: 6 aktif, 2 nonaktif, 4 alumni');
  const riwayat = await api.muatNaikKelas();
  ok(riwayat.ok && riwayat.data.batch.length === 1 && riwayat.data.batch[0].ringkasan.lanjut === 6 && riwayat.data.log.length === 12, 'riwayat: 1 batch dan 12 catatan');

  // Tahun berikutnya: berkas baru dari keadaan sekarang. Alumni tidak ikut; XI (kini XI-07, XI-02) lanjut; XII (baru) lulus; nonaktif tetap.
  baris = bangunBaris(users);
  ok(baris.length === 8 && !baris.some((x) => x.statusSekarang === 'alumni'), 'tahun berikutnya: alumni tidak masuk daftar (8 Penegak)');
  const t2 = baris.find((x) => x.username === '10231');
  ok(t2.aksi === 'lanjut' && t2.rombelBaru === 'XII-07', 'Ahmad (XI-07): bawaan Lanjut ke XII-07');
  const r2 = await api.naikKelas('2028/2029', susunPermintaan(baris), true);
  ok(r2.ok, 'kenaikan tahun berikutnya diterapkan');
  users = await muat();
  ok(hitungStatus(users).alumni === 4 + 4 && hitungStatus(users).aktif === 2 + 0 || hitungStatus(users).alumni >= 8, `alumni bertambah (kelas XII tahun ini lulus): ${JSON.stringify(hitungStatus(users))}`);
  const bt = susunBatchNaikKelas([{ id: 1, tahun_ajaran: '2027/2028', waktu: 'w', ringkasan: { lanjut: 1 }, oleh_nama: 'A', dibatalkan_pada: null }, { id: 2, tahun_ajaran: '2028/2029', waktu: 'w2' }]);
  ok(bt[0].id === 2 && bt[1].olehNama === 'A' && bt[1].dibatalkanPada === null, 'susunBatchNaikKelas: terbaru dulu');
  const lg = susunLogNaikKelas([{ id: 1, batch_id: null, waktu: 'w', peserta_nama: 'N', aksi: 'lulus', dari_status: 'aktif', ke_status: 'alumni' }, { id: 2, batch_id: 5, peserta_nama: 'M', aksi: 'lanjut', dari_status: 'aktif', ke_status: 'aktif' }]);
  ok(lg[0].id === 2 && lg[0].batchId === 5 && lg[1].batchId === null && lg[1].olehNama === '', 'susunLogNaikKelas');
}

console.log('\n--- Pemasangan pada halaman (pemeriksaan sumber) ---');
{
  const app = sumber('src/App.jsx');
  ok(app.includes("id: 'naikkelas'") && app.includes("tabAktif === 'naikkelas' && user.role === 'admin'"), 'menu Naik Kelas hanya Admin');
  ok(sumber('src/context/AppContext.jsx').includes('daftarPesertaSemua') && sumber('src/context/AppContext.jsx').includes("(u.status ?? 'aktif') === 'aktif'"), 'konteks: daftarPeserta = aktif, daftarPesertaSemua = semua');
  for (const f of ['src/pages/AdminAnggota.jsx', 'src/pages/PengujiDashboard.jsx', 'src/pages/ResetPin.jsx', 'src/pages/Raport.jsx', 'src/pages/Absensi.jsx']) {
    ok(sumber(f).includes("'status'"), `${f.split('/').pop()}: pilihan filter Status dipasang`);
  }
  ok(sumber('src/pages/PesertaDetail.jsx').includes('daftarPesertaSemua') && sumber('src/pages/PesertaDetail.jsx').includes('bisaMenguji = user.role === \'penguji\' && aktif'), 'detail Penegak: nonaktif/alumni dapat dibuka dan tidak dapat dinilai');
  ok(sumber('src/pages/PesertaSku.jsx').includes('hanyaLihatSaya') && sumber('src/pages/PesertaBeranda.jsx').includes('hanyaLihatSaya') && sumber('src/components/PortofolioChecklist.jsx').includes('hanyaLihatSaya'), 'Penegak nonaktif/alumni: tombol ajukan, batal, Calon Garuda, dan portofolio disembunyikan');
  ok(sumber('src/components/Layout.jsx').includes('hanyaLihatSaya'), 'banner status pada semua halaman');
}

console.log(`\nRINGKASAN naik-kelas-klien: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
