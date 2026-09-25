// Tahap 2 (G4d): Lengkapi tanggal lahir lewat Excel. Logika murni (periksaLahirMassal, pesertaTanpaLahir), berkas Excel (buat, isi, baca), penyimpanan ke server lewat
// sg_tanggal_lahir_impor, dan render jendela.
import ExcelJS from 'exceljs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { KonteksApp } from '../src/context/AppContext.jsx';
import LengkapiTanggalLahirModal from '../src/components/LengkapiTanggalLahirModal.jsx';
import { periksaLahirMassal, pesertaTanpaLahir } from '../src/lib/lahirLogic.js';
import { bacaExcelLahir, buatBerkasLahir } from '../src/lib/lahirExcel.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const HARI = '2026-10-10';

console.log('--- Logika murni ---');
{
  const users = [
    { id: 'a', nama: 'Ani', username: '70001', role: 'peserta', status: 'aktif', kelas: 'XI-02' },
    { id: 'b', nama: 'Budi', username: '70002', role: 'peserta', status: 'aktif', kelas: 'X-10' },
    { id: 'c', nama: 'Cici', username: '70003', role: 'peserta', status: 'aktif', kelas: 'X-2' },
    { id: 'd', nama: 'Dedi', username: '70004', role: 'peserta', status: 'nonaktif', kelas: 'XI-01' },
    { id: 'e', nama: 'Eko', username: '70005', role: 'peserta', status: 'aktif', kelas: 'XI-01' },
    { id: 'p', nama: 'Pembina', username: 'pembina', role: 'penguji', status: 'aktif' },
  ];
  const lahir = [{ pesertaId: 'e', tanggal: '2008-01-01' }];
  ok(pesertaTanpaLahir(users, lahir).map((u) => u.nama).join() === 'Cici,Budi,Ani', 'pesertaTanpaLahir: Penegak aktif tanpa tanggal lahir, urut rombel (X-2, X-10, XI-02) lalu nama; nonaktif, sudah terisi, dan Pembina tidak masuk');
  const baris = [
    { no: 2, id: '70001', tanggal: '15/03/2008' }, { no: 3, id: ' 70002 ', tanggal: '2008-11-02' }, { no: 4, id: '70099', tanggal: '15/03/2008' }, { no: 5, id: '70003', tanggal: 'kemarin' },
    { no: 6, id: '70004', tanggal: '15/03/2008' }, { no: 7, id: '70005', tanggal: '15/03/2008' }, { no: 8, id: '70001', tanggal: '16/03/2008' }, { no: 9, id: 'pembina', tanggal: '15/03/2008' },
    { no: 10, id: '', tanggal: '15/03/2008' }, { no: 11, id: '70003', tanggal: '15/03/1980' }, { no: 12, id: '70003', tanggal: '15/03/2999' }, { no: 13, id: '70003', tanggal: '39522' },
  ];
  const r = periksaLahirMassal(baris, users, lahir, HARI);
  const st = (n) => r.find((x) => x.no === n);
  ok(st(2).siap && st(2).tanggal === '2008-03-15' && st(2).nama === 'Ani', 'baris sah: tanggal dibakukan ke ISO, nama terisi');
  ok(st(3).siap && st(3).tanggal === '2008-11-02' && st(3).username === '70002', 'NIS dipangkas spasi dan huruf kecil; ISO diterima');
  ok(!st(4).siap && /tidak terdaftar/.test(st(4).galat.join()), 'NIS tidak terdaftar');
  ok(!st(5).siap && /"kemarin" tidak dikenal/.test(st(5).galat.join()), 'tanggal tidak dikenal');
  ok(!st(6).siap && /tidak aktif/.test(st(6).galat.join()), 'Penegak nonaktif ditolak');
  ok(!st(7).siap && st(7).dilewati && st(7).galat.length === 0, 'Penegak yang sudah punya tanggal lahir dilewati (bukan galat)');
  ok(!st(8).siap && /lebih dari sekali/.test(st(8).galat.join()), 'NIS ganda dalam berkas: yang kedua ditolak');
  ok(!st(9).siap && /tidak terdaftar sebagai Penegak/.test(st(9).galat.join()), 'akun Pembina bukan Penegak');
  ok(!st(10).siap && /NIS kosong/.test(st(10).galat.join()), 'NIS kosong');
  ok(!st(11).siap && /sebelum tahun 1990/.test(st(11).galat.join()) && !st(12).siap && /masa depan/.test(st(12).galat.join()), 'rentang tanggal: sebelum 1990 dan masa depan ditolak (dengan hari acuan)');
  ok(st(13).tanggal === '2008-03-15' && st(13).siap, 'nomor seri Excel dibaca sebagai tanggal; NIS yang barisnya galat tidak dianggap sudah muncul');
}

const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const admin = await masuk('admin', PIN_DEMO.admin);
const pembina = await masuk('pembina', PIN_DEMO.pembina);
const profil = (await pembina.a.muatProfil()).data;
const penegak = profil.filter((u) => u.role === 'peserta' && (u.status ?? 'aktif') === 'aktif');

console.log('\n--- Berkas Excel: buat, isi, baca, simpan ---');
{
  const buf = await buatBerkasLahir(penegak, []);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
  const ws = wb.getWorksheet('Tanggal Lahir');
  ok(ws.rowCount === penegak.length + 1 && String(ws.getCell(1, 1).value) === 'NIS' && String(ws.getCell(1, 4).value) === 'Tanggal Lahir' && ws.getCell(2, 1).numFmt === '@' && ws.getCell(2, 4).numFmt === '@', 'berkas memuat semua Penegak aktif tanpa tanggal lahir; NIS dan Tanggal Lahir berformat teks');
  let petunjuk = ''; wb.getWorksheet('Petunjuk').eachRow((r) => r.eachCell((c) => { petunjuk += c.value + ' '; }));
  ok(/15\/03\/2008/.test(petunjuk) && /tidak diubah/.test(petunjuk), 'petunjuk menjelaskan format dan bahwa yang sudah terisi tidak diubah');
  const sudahSatu = [{ pesertaId: penegak[0].id, tanggal: '2008-01-01' }];
  const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(await buatBerkasLahir(penegak, sudahSatu));
  ok(wb2.getWorksheet('Tanggal Lahir').rowCount === penegak.length, 'Penegak yang sudah punya tanggal lahir tidak ada di berkas');
  // isi: baris 2 teks, 3 Date, 4 nomor seri, sisanya kosong; lalu baca
  ws.getCell(2, 4).value = '15/03/2008'; ws.getCell(3, 4).value = new Date(Date.UTC(2008, 10, 2)); ws.getCell(4, 4).value = '39522';
  const b = await bacaExcelLahir(await wb.xlsx.writeBuffer());
  ok(b.length === 3 && b[0].tanggal === '15/03/2008' && ['2008-11-02', '39754'].includes(b[1].tanggal) && b[2].tanggal === '39522' && b.every((x, i) => x.id === String(ws.getCell(i + 2, 1).value)), 'pembaca: sel teks, sel tanggal, nomor seri; baris kosong dilewati');
  const p = periksaLahirMassal(b, profil, []);
  ok(p.length === 3 && p.every((x) => x.siap) && p.map((x) => x.tanggal).join() === '2008-03-15,2008-11-02,2008-03-15', 'ketiganya siap dengan tanggal ISO');
  const r = await admin.a.imporTanggalLahir(p.filter((x) => x.siap).map((x) => ({ username: x.username, tanggal: x.tanggal })));
  ok(r.ok && r.data === 3, 'disimpan lewat sg_tanggal_lahir_impor ' + (r.pesan ?? ''));
  const g = await pembina.a.muatGerbang({});
  ok(g.ok && g.data.lahir.length === 3 && g.data.lahir.some((l) => l.tanggal === '2008-03-15'), 'tersimpan dan terbaca pengurus');
  ok(pesertaTanpaLahir(penegak, g.data.lahir).length === penegak.length - 3, 'daftar "belum diisi" menyusut sesuai yang disimpan');
  const salah = new ExcelJS.Workbook(); salah.addWorksheet('X').addRow(['Foo', 'Bar']);
  let msg = ''; try { await bacaExcelLahir(await salah.xlsx.writeBuffer()); } catch (e) { msg = e.message; }
  ok(/Baris judul tidak ditemukan/.test(msg), 'berkas tanpa judul yang dikenal: pesan yang menuntun');
  const kosong = new ExcelJS.Workbook(); const wk = kosong.addWorksheet('Tanggal Lahir'); wk.addRow(['NIS', 'Nama', 'Rombel', 'Tanggal Lahir']); wk.addRow(['70001', 'Ani', 'X-01', null]);
  msg = ''; try { await bacaExcelLahir(await kosong.xlsx.writeBuffer()); } catch (e) { msg = e.message; }
  ok(/Tidak ada data/.test(msg), 'berkas tanpa tanggal terisi: pesan yang menuntun');
}

console.log('\n--- Tampilan (render tanpa peramban) ---');
{
  const pembinaU = { id: 'pb', role: 'penguji', jabatan: 'Pembina', nama: 'Pak Pembina', status: 'aktif' };
  const teks = (el) => renderToStaticMarkup(el).replace(/<!-- -->/g, '');
  const ada = teks(h(KonteksApp.Provider, { value: { user: pembinaU, daftarPeserta: penegak, api: () => ({}), notify: () => {} } }, h(LengkapiTanggalLahirModal, { lahir: [], onTutup: () => {}, onSelesai: () => {} })));
  ok(ada.includes('Lengkapi tanggal lahir') && ada.includes(`${penegak.length} Penegak aktif belum diisi tanggal lahirnya`) && ada.includes('Unduh berkas Excel') && ada.includes('Unggah berkas terisi') && ada.includes('Simpan 0 Penegak'), 'jendela: jumlah yang belum diisi, unduh, unggah, dan simpan (0 sebelum berkas dipilih)');
  const semua = teks(h(KonteksApp.Provider, { value: { user: pembinaU, daftarPeserta: penegak, api: () => ({}), notify: () => {} } }, h(LengkapiTanggalLahirModal, { lahir: penegak.map((u) => ({ pesertaId: u.id, tanggal: '2008-01-01' })), onTutup: () => {}, onSelesai: () => {} })));
  ok(semua.includes('Semua Penegak aktif sudah diisi tanggal lahirnya'), 'semua sudah terisi: pesan tidak ada yang perlu dilengkapi');
}

console.log(`\nRINGKASAN LAHIR-MASSAL: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
