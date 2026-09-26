// Tahap 2 (G4b): kolom "Tanggal Lahir" pada template import Penegak. Logika murni (normalisasi, pemeriksaan baris), template dan pembaca Excel (sel teks, sel tanggal,
// nomor seri), dan fungsi server sg_tanggal_lahir_impor (hak, validasi, semua atau tidak sama sekali, lewati yang tidak dikenal atau nonaktif).
import ExcelJS from 'exceljs';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { kolomTemplate, normalisasiTanggalLahir, periksaBaris } from '../src/lib/importAnggota.js';
import { bacaExcelAnggota, buatTemplateAnggota } from '../src/lib/importAnggotaExcel.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

console.log('--- normalisasiTanggalLahir ---');
{
  const kasus = [
    ['15/03/2008', '2008-03-15'], ['15-03-2008', '2008-03-15'], ['15.03.2008', '2008-03-15'], ['5/3/2008', '2008-03-05'], ['2008-03-15', '2008-03-15'], ['2008-3-5', '2008-03-05'],
    ['15 Maret 2008', '2008-03-15'], ['15 maret 2008', '2008-03-15'], ['1 Agu 2008', '2008-08-01'], ['1 Des. 2008', '2008-12-01'], ['  2   Mei   2009 ', '2009-05-02'],
    ['39522', '2008-03-15'], ['', ''], ['abc', ''], ['31/02/2008', ''], ['2008-13-01', ''], ['15 Marta 2008', ''], ['15/03/08', ''], ['0', ''], ['99999', ''], ['03/15/2008', ''],
  ];
  const salah = kasus.filter(([a, b]) => normalisasiTanggalLahir(a) !== b);
  ok(salah.length === 0, `${kasus.length} bentuk isian dinormalisasi (D/M/Y, ISO, nama bulan, nomor seri Excel; tidak sah menjadi kosong) ` + JSON.stringify(salah.map(([a]) => [a, normalisasiTanggalLahir(a)])));
}

console.log('\n--- periksaBaris Penegak ---');
{
  const dasar = { no: 2, nama: 'Ani', jk: 'P', nis: '70001', kelas: 'XI-01', sangga: 'Elang', agama: 'Islam', nta: '', pin: '' };
  const r = (lahir) => periksaBaris([{ ...dasar, lahir }], [], 'peserta')[0];
  let x = r('15/03/2008');
  ok(x.siap && x.data.lahir === '2008-03-15' && x.data.lahirAsli === '15/03/2008', 'tanggal lahir sah dinormalisasi ke ISO, isian asli disimpan');
  x = r('');
  ok(x.siap && x.data.lahir === '', 'kosong = opsional, tetap siap');
  x = r('bukan tanggal');
  ok(!x.siap && x.galat.some((g) => /Tanggal lahir "bukan tanggal" tidak dikenal/.test(g)), 'tidak dikenal: baris tidak siap dengan pesan yang menuntun');
  x = r('15/03/1980');
  ok(!x.siap && x.galat.some((g) => /sebelum tahun 1990/.test(g)), 'sebelum tahun 1990 ditolak (aturan sama dengan server)');
  x = r('15/03/2999');
  ok(!x.siap && x.galat.some((g) => /masa depan/.test(g)), 'masa depan ditolak');
}

console.log('\n--- Template dan pembaca Excel ---');
{
  ok(kolomTemplate('peserta').at(-1).key === 'lahir' && kolomTemplate('dewan').every((c) => c.key !== 'lahir') && kolomTemplate('pembina').every((c) => c.key !== 'lahir'), 'kolom Tanggal Lahir hanya pada template Penegak, di ujung (posisi kolom lain tidak bergeser)');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await buatTemplateAnggota('peserta'));
  const ws = wb.getWorksheet('Anggota');
  ok(String(ws.getCell(1, 9).value).startsWith('Tanggal Lahir') && ws.getCell(2, 9).numFmt === '@' && ws.getCell(500, 9).numFmt === '@', 'judul kolom ke-9 "Tanggal Lahir (opsional)", berformat teks');
  let petunjuk = ''; wb.getWorksheet('Petunjuk').eachRow((r2) => r2.eachCell((c) => { petunjuk += c.value + ' '; }));
  ok(/Tanggal Lahir/.test(petunjuk) && /15\/03\/2008/.test(petunjuk) && /Kelayakan/.test(petunjuk), 'petunjuk menjelaskan kolom Tanggal Lahir');
  const isi = (r2, v) => { ['Ani', 'P', `7000${r2}`, 'XI-01', 'Elang', 'Islam', null, null].forEach((x, i) => { ws.getCell(r2, i + 1).value = x; }); ws.getCell(r2, 9).value = v; };
  isi(2, '15/03/2008');
  isi(3, new Date(Date.UTC(2008, 10, 2)));
  isi(4, 39522);
  isi(5, null);
  const b = await bacaExcelAnggota(await wb.xlsx.writeBuffer(), 'peserta');
  ok(b.length === 4 && b[0].lahir === '15/03/2008' && ['2008-11-02', '39754'].includes(b[1].lahir) && b[2].lahir === '39522' && b[3].lahir === '', 'pembaca: sel teks, sel tanggal Excel (Date), nomor seri, dan kosong');
  const p = periksaBaris(b, [], 'peserta');
  ok(p.length === 4 && p.every((x) => x.siap) && p.map((x) => x.data.lahir).join() === '2008-03-15,2008-11-02,2008-03-15,', 'semua bentuk berujung pada tanggal ISO yang sama');
  // template lama (tanpa kolom Tanggal Lahir) tetap terbaca
  const lama = new ExcelJS.Workbook(); const wl = lama.addWorksheet('Anggota');
  wl.addRow(['Nama Lengkap', 'Jenis Kelamin', 'NIS', 'Rombel', 'Sangga', 'Agama']); wl.addRow(['Budi', 'L', '70009', 'X-02', 'Merak', 'Islam']);
  const bl = await bacaExcelAnggota(await lama.xlsx.writeBuffer(), 'peserta');
  ok(bl.length === 1 && bl[0].lahir === '' && periksaBaris(bl, [], 'peserta')[0].siap, 'template lama tanpa kolom Tanggal Lahir tetap dapat diimpor');
}

const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const admin = await masuk('admin', PIN_DEMO.admin);
const pembina = await masuk('pembina', PIN_DEMO.pembina);
const dewan = await masuk('dewan', PIN_DEMO.dewan);
const siti = await masuk('10232', PIN_DEMO.penegak);
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const cocok = (r, re) => !r.ok && re.test(r.pesan ?? '');
const impor = (id, daftar) => sebagai(id, 'select public.sg_tanggal_lahir_impor($1::jsonb) as n', [JSON.stringify(daftar)]);
const baris = () => q('select p.username, t.tanggal::text from public.tanggal_lahir t join public.profiles p on p.id = t.peserta_id order by 1');

console.log('\n--- sg_tanggal_lahir_impor (server) ---');
{
  const isiSah = [{ username: '10231', tanggal: '2008-03-15' }, { username: '10232', tanggal: '2008-11-02' }];
  let r = await impor(siti.id, isiSah);
  ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'Penegak tidak dapat mengimpor tanggal lahir');
  r = await impor(dewan.id, isiSah);
  ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'akun Dewan lama tidak dapat mengimpor tanggal lahir');
  r = await impor(admin.id, 'bukan array');
  ok(cocok(r, /tidak valid/), 'bukan larik ditolak');
  r = await impor(admin.id, Array.from({ length: 501 }, () => ({ username: '10231', tanggal: '2008-03-15' })));
  ok(cocok(r, /Maksimal 500/), 'maksimal 500 baris');
  r = await impor(admin.id, [{ username: '', tanggal: '2008-03-15' }]);
  ok(cocok(r, /Nama pengguna anggota wajib/), 'nama pengguna wajib');
  r = await impor(admin.id, [{ username: '10231', tanggal: '15/03/2008' }]);
  ok(cocok(r, /harus berbentuk TTTT-BB-HH/), 'bentuk tanggal harus ISO (normalisasi dilakukan klien)');
  r = await impor(admin.id, [{ username: '10231', tanggal: '2008-02-30' }]);
  ok(cocok(r, /tidak sah/), 'tanggal yang tidak ada di kalender ditolak');
  r = await impor(admin.id, [{ username: '10231', tanggal: '1980-01-01' }]);
  ok(cocok(r, /sebelum tahun 1990/), 'sebelum tahun 1990 ditolak');
  r = await impor(admin.id, [{ username: '10231', tanggal: '2999-01-01' }]);
  ok(cocok(r, /masa depan/), 'masa depan ditolak');
  r = await impor(admin.id, [{ username: '10231', tanggal: '2008-03-15' }, { username: '10232', tanggal: '2008-13-01' }]);
  ok(!r.ok && (await baris()).length === 0, 'satu baris keliru: seluruhnya dibatalkan (baris pertama yang sah tidak tersimpan)');
  r = await impor(admin.id, [...isiSah, { username: 'tidak.ada', tanggal: '2008-01-01' }, { username: 'pembina', tanggal: '2008-01-01' }]);
  ok(r.ok && r.rows[0].n === 2, 'yang tidak dikenal atau bukan Penegak dilewati; jumlah = 2 ' + (r.pesan ?? ''));
  ok(JSON.stringify(await baris()) === JSON.stringify([{ username: '10231', tanggal: '2008-03-15' }, { username: '10232', tanggal: '2008-11-02' }]), 'tersimpan sesuai isian');
  r = await impor(pembina.id, [{ username: '10231', tanggal: '2008-04-01' }]);
  ok(r.ok && r.rows[0].n === 1 && (await baris()).find((x) => x.username === '10231').tanggal === '2008-04-01', 'Pembina juga boleh; isian ulang = koreksi');
  r = await impor(admin.id, []);
  ok(r.ok && r.rows[0].n === 0, 'larik kosong sah (0)');
  await q(`update public.profiles set status = 'nonaktif' where username = '10232'`);
  r = await impor(admin.id, [{ username: '10232', tanggal: '2008-05-05' }]);
  ok(r.ok && r.rows[0].n === 0 && (await baris()).find((x) => x.username === '10232').tanggal === '2008-11-02', 'Penegak nonaktif dilewati (catatan lama tetap)');
  await q(`update public.profiles set status = 'aktif' where username = '10232'`);
  r = await admin.a.imporTanggalLahir([{ username: '10232', tanggal: '2008-06-06' }]);
  ok(r.ok && r.data === 1, 'api().imporTanggalLahir ' + (r.pesan ?? ''));
}

console.log(`\nRINGKASAN IMPOR-LAHIR: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
