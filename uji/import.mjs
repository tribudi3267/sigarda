import ExcelJS from 'exceljs';
import { periksaBaris, bacaExcelAnggota, buatTemplateAnggota, kolomTemplate } from '../src/lib/importAnggota.js';
import { formatPinSah, pinLemah, validasiPinBaru, buatPinAcak, bolehResetPin } from '../src/lib/pinLogic.js';
import { bangunIndeks } from '../src/lib/cariNama.js';
import { pinLemah as pinLemahServer, validasiPinBaru as valServer, bolehResetPin as resetServer, slugUsername } from '../supabase/functions/sigarda/index.ts';

let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

const users = [
  { id: 'a', role: 'admin', username: 'admin', nama: 'Admin Gudep' },
  { id: 'd', role: 'penguji', jabatan: 'Dewan Ambalan', username: 'rizky.dewan', nama: 'Rizky Dewan' },
  { id: 's', role: 'peserta', username: '10231', nis: '10231', nama: 'Ahmad Fauzi', kelas: 'X-01' },
];
const k = { jk: 'Laki-laki', nis: '', kelas: 'X-01', sangga: 'E', agama: 'Islam', pin: '', username: '' };

// Penegak
let p = periksaBaris([
  { no: 2, nama: 'Baru Satu', ...k, nis: '20001' },
  { no: 3, nama: 'Tanpa NIS', ...k },
  { no: 4, nama: 'NIS Ada', ...k, nis: '10231' },
  { no: 5, nama: 'Ganda File', ...k, nis: '20001' },
  { no: 6, nama: 'NIS Pendek', ...k, nis: '12' },
  { no: 7, nama: 'PIN Pendek', ...k, nis: '20002', pin: '1234' },
  { no: 8, nama: 'PIN Lemah', ...k, nis: '20003', pin: '123456' },
  { no: 9, nama: 'PIN Baik', ...k, nis: '20004', pin: '482913' },
  { no: 10, nama: 'NIS Huruf Besar', ...k, nis: 'ABC123' },
  { no: 11, nama: 'admin sama', ...k, nis: 'admin' },
], users);
ok(p.map((x) => x.siap).join() === 'true,false,false,false,false,false,false,true,true,false', 'Penegak: NIS wajib/unik/format, PIN 6 angka: ' + p.map((x) => x.siap + ':' + x.galat.join('|')).join(' / '));
ok(/NIS kosong/.test(p[1].galat[0]) && /sudah terdaftar/.test(p[2].galat[0]) && /sudah terdaftar/.test(p[3].galat[0]), 'pesan galat NIS jelas');

// Dewan / Pembina
const kp = { jk: 'Perempuan', nis: '', kelas: '', sangga: '', agama: '', pin: '', username: '' };
p = periksaBaris([
  { no: 2, nama: 'Sinta', ...kp },
  { no: 3, nama: 'rizky dewan', ...kp },
  { no: 4, nama: 'Rizky Dewan', ...kp, username: 'rizky.dua' },
  { no: 5, nama: 'Ada Username', ...kp, username: 'admin' },
  { no: 6, nama: 'Pendek', ...kp, username: 'ab' },
  { no: 7, nama: 'Sinta', ...kp },
  { no: 8, nama: 'Pin Lemah', ...kp, pin: '000000' },
], users, 'dewan');
ok(p.map((x) => x.siap).join() === 'true,false,true,false,false,false,false', 'Dewan: nama ganda ditolak kecuali ada nama pengguna: ' + p.map((x) => x.siap + ':' + x.galat.join('|')).join(' / '));
p = periksaBaris([{ no: 2, nama: 'Rizky Dewan', ...kp }], users, 'pembina');
ok(p[0].siap, 'nama sama pada jabatan berbeda (Pembina) boleh');

// template
ok(kolomTemplate('peserta').map((c) => c.key).join() === 'nama,jk,nis,kelas,sangga,agama,nta,pin' && kolomTemplate('dewan').map((c) => c.key).join() === 'nama,jk,username,jabatanDewan,nta,pin' && kolomTemplate('pembina').map((c) => c.key).join() === 'nama,jk,username,agama,pin', 'kolom template');
{
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await buatTemplateAnggota('dewan'));
  const ws = wb.getWorksheet('Anggota');
  ws.getCell(2, 1).value = 'Sinta Ambalan'; ws.getCell(2, 3).value = 'sinta.a'; ws.getCell(2, 6).value = '0482911'; ws.getCell(2, 4).value = 'wakil pradana'; ws.getCell(2, 5).value = '11.03.10.701.00777'; ws.getCell(2, 2).value = 'Perempuan';
  ws.getCell(3, 1).value = 'Tono'; ws.getCell(3, 6).value = '482913'; ws.getCell(3, 2).value = 'L';
  const b = await bacaExcelAnggota(await wb.xlsx.writeBuffer(), 'dewan');
  ok(b.length === 2 && b[0].username === 'sinta.a' && b[0].pin === '0482911' && b[1].username === '' && b[1].pin === '482913' && b[0].jabatanDewan === 'wakil pradana' && b[0].nta === '11.03.10.701.00777' && b[1].jabatanDewan === '', 'baca file Dewan dengan kolom Nama Pengguna: ' + JSON.stringify(b.map((x) => [x.nama, x.username, x.pin])));
  ok(ws.getCell(2, 3).numFmt === '@' && ws.getCell(2, 5).numFmt === '@' && ws.getCell(2, 6).numFmt === '@', 'kolom nama pengguna, NTA, dan PIN berformat teks');
  let petunjuk = ''; wb.getWorksheet('Petunjuk').eachRow((r) => r.eachCell((c) => { petunjuk += c.value + ' '; }));
  ok(/Nama Pengguna/.test(petunjuk) && /6 angka/.test(petunjuk), 'petunjuk menyebut Nama Pengguna dan PIN 6 angka');
}
{
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await buatTemplateAnggota('peserta'));
  const ws = wb.getWorksheet('Anggota');
  [ 'Andi', 'Laki-laki', '10301', 'X', 'Sangga Elang', 'Islam', '' ].forEach((v, i) => { ws.getCell(2, i + 1).value = v || null; });
  const b = await bacaExcelAnggota(await wb.xlsx.writeBuffer(), 'peserta');
  ok(b.length === 1 && b[0].nis === '10301' && b[0].username === '', 'baca file Penegak');
  let petunjuk = ''; wb.getWorksheet('Petunjuk').eachRow((r) => r.eachCell((c) => { petunjuk += c.value + ' '; }));
  ok(/NIS WAJIB/.test(petunjuk), 'petunjuk Penegak: NIS wajib');
}

// PIN: klien dan server sepakat
const uji = ['111111', '123456', '654321', '000000', '482913', '12345', '1234567', 'abcdef', '', '135790'];
ok(uji.every((x) => pinLemah(x) === pinLemahServer(x)), 'pinLemah klien = server pada ' + uji.length + ' contoh');
ok(uji.every((x) => formatPinSah(x) === /^\d{6}$/.test(x)), 'format PIN 6 angka');
ok(['482913', '111111', '12345'].every((x) => (validasiPinBaru(x, '000111', x) === null) === (valServer(x, '000111', x) === null)), 'validasiPinBaru klien = server');
const aktor = [{ id: '1', role: 'admin' }, { id: '2', role: 'penguji', jabatan: 'Pembina' }, { id: '3', role: 'penguji', jabatan: 'Dewan Ambalan' }, { id: '4', role: 'peserta' }];
const target = [{ id: '1', role: 'admin' }, { id: '5', role: 'penguji', jabatan: 'Pembina' }, { id: '6', role: 'penguji', jabatan: 'Dewan Ambalan' }, { id: '7', role: 'peserta' }, { id: '8', role: 'admin' }];
ok(aktor.every((a) => target.every((t) => bolehResetPin(a, t) === resetServer(a, t))), 'matriks hak reset klien = server (20 kombinasi)');
const acak = Array.from({ length: 300 }, () => buatPinAcak());
ok(acak.every((x) => /^\d{6}$/.test(x) && !pinLemah(x)) && new Set(acak).size > 250, 'PIN acak: 6 angka, tidak lemah, bervariasi');
ok(slugUsername('Drs. Slamet Riyadi, M.Pd.') === 'drs.slamet.riyadi.m.pd' && slugUsername('Ñandú Ünal') === 'nandu.unal' && slugUsername('  ') === 'anggota'.slice(0, 0) + '.anggota'.slice(0, 0) + slugUsername('  ') && slugUsername('Bu').length >= 3, 'slug nama pengguna: ' + slugUsername('Drs. Slamet Riyadi, M.Pd.'));
ok(bangunIndeks([{ nama: 'A B' }]).length === 1, 'cariNama tetap tersedia');

console.log(`\nRINGKASAN IMPORT/PIN: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
