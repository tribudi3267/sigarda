// Jenis kelamin anggota (semua peran): server (kolom, sg_anggota_jk_atur, RLS, semua atau tidak sama sekali), logika klien (normalisasi, pemeriksaan),
// template dan import Excel (kolom wajib, pilihan, pembacaan), berkas "Lengkapi jenis kelamin", dan pemasangan di layar.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import FilterBar, { FILTER_AWAL, terapkanFilter } from '../src/components/FilterBar.jsx';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { kolomTemplate, periksaBaris } from '../src/lib/importAnggota.js';
import { bacaExcelAnggota, buatTemplateAnggota } from '../src/lib/importAnggotaExcel.js';
import { JK_BELUM_DIISI, anggotaTanpaJk, hitungJenisKelamin, labelJenisKelamin, labelPeranAnggota, normalisasiJenisKelamin, periksaJkMassal, urutAnggotaJk } from '../src/lib/jenisKelaminLogic.js';
import { bacaExcelJk, buatBerkasJk } from '../src/lib/jenisKelaminExcel.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const sumber = (f) => readFileSync(`${P}/${f}`, 'utf8');

const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const K = { admin: await masuk('admin', PIN_DEMO.admin), pembina: await masuk('pembina', PIN_DEMO.pembina), dewan: await masuk('dewan', PIN_DEMO.dewan), ahmad: await masuk('10231', PIN_DEMO.penegak) };
const cocok = (r, re) => !r.ok && re.test(r.pesan ?? '');
const jkDari = async (username) => (await q('select jenis_kelamin from public.profiles where username = $1', [username]))[0]?.jenis_kelamin ?? null;
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };

console.log('--- Server: kolom dan batasan ---');
{
  const kol = (await q(`select data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'jenis_kelamin'`))[0];
  ok(kol && kol.data_type === 'text' && kol.is_nullable === 'YES', 'profiles.jenis_kelamin ada dan boleh kosong (anggota lama)');
  let galat = '';
  try { await q(`update public.profiles set jenis_kelamin = 'X' where username = 'admin'`); } catch (e) { galat = e.message; }
  ok(/jenis_kelamin_check|check/.test(galat), 'nilai selain L dan P ditolak oleh basis data');
  const punya = (await q(`select count(*)::int n from public.profiles where jenis_kelamin is not null`))[0].n;
  const kosong = (await q(`select count(*)::int n from public.profiles where jenis_kelamin is null`))[0].n;
  ok(punya > 0 && kosong === 3, `data contoh: sebagian terisi (${punya}), tiga Penegak sengaja kosong (${kosong})`);
}

console.log('\n--- Server: sg_anggota_jk_atur ---');
{
  ok(cocok(await K.pembina.a.aturJenisKelamin([{ username: '10231', jk: 'L' }]), /Hanya Admin Gudep/), 'Pembina tidak dapat mengatur jenis kelamin');
  ok(cocok(await K.dewan.a.aturJenisKelamin([{ username: '10231', jk: 'L' }]), /Hanya Admin Gudep/), 'Dewan Ambalan tidak dapat mengatur');
  ok(cocok(await K.ahmad.a.aturJenisKelamin([{ username: '10231', jk: 'L' }]), /Hanya Admin Gudep/), 'Penegak tidak dapat mengatur (juga miliknya sendiri)');
  ok(!(await sebagai(K.ahmad.id, `update public.profiles set jenis_kelamin = 'P' where id = $1`, [K.ahmad.id])).ok, 'tidak ada penulisan langsung ke tabel oleh pengguna');

  let r = await K.admin.a.aturJenisKelamin([{ username: '10231', jk: 'L' }, { username: 'pembina', jk: 'p' }, { username: 'dewan', jk: ' P ' }, { username: 'admin', jk: 'L' }]);
  ok(r.ok && r.data === 4, 'Admin mengatur empat anggota sekaligus (Penegak, Pembina, Dewan, Admin): ' + JSON.stringify(r));
  ok((await jkDari('10231')) === 'L' && (await jkDari('pembina')) === 'P' && (await jkDari('dewan')) === 'P' && (await jkDari('admin')) === 'L', 'nilai tersimpan; huruf kecil dan spasi dibakukan');
  r = await K.admin.a.aturJenisKelamin([{ username: '10231', jk: 'P' }, { username: 'pembina', jk: 'Z' }]);
  ok(cocok(r, /tidak dikenal/) && (await jkDari('10231')) === 'L', 'satu baris tidak sah: semua dibatalkan (Ahmad tetap L)');
  r = await K.admin.a.aturJenisKelamin([{ username: 'tidak.ada', jk: 'L' }, { username: '10231', jk: 'L' }]);
  ok(r.ok && r.data === 1, 'nama pengguna yang tidak ditemukan tidak dihitung');
  r = await K.admin.a.aturJenisKelamin([{ username: '', jk: 'L' }]);
  ok(cocok(r, /Nama pengguna anggota wajib diisi/), 'nama pengguna kosong ditolak');
  r = await K.admin.a.aturJenisKelamin([{ username: '10231', jk: '' }]);
  ok(r.ok && (await jkDari('10231')) === null, 'jenis kelamin kosong menghapus isian');
  await K.admin.a.aturJenisKelamin([{ username: '10231', jk: 'L' }]);
  ok(cocok(await K.admin.a.aturJenisKelamin('bukan array'), /tidak valid/) && cocok(await K.admin.a.aturJenisKelamin(Array.from({ length: 501 }, () => ({ username: 'x', jk: 'L' }))), /Maksimal 500/), 'masukan bukan larik dan lebih dari 500 baris ditolak');
  ok((await K.admin.a.aturJenisKelamin([])).data === 0, 'larik kosong: 0 berubah');
}

console.log('\n--- Server: terbaca sesuai peran dan alur tambah anggota ---');
{
  const profil = (await K.admin.a.muatProfil()).data;
  ok(profil.find((u) => u.username === '10231').jenisKelamin === 'L' && profil.find((u) => u.username === 'admin').jenisKelamin === 'L', 'muatProfil membawa jenisKelamin (Penegak dan Admin)');
  ok((await K.pembina.a.muatProfil()).data.find((u) => u.username === '10231').jenisKelamin === 'L', 'Pembina melihat jenis kelamin Penegak');
  ok((await K.ahmad.a.muatProfil()).data.find((u) => u.username === '10231').jenisKelamin === 'L', 'Penegak melihat miliknya sendiri');
  for (const [kelompok, baris, jk] of [
    ['peserta', { no: 1, nama: 'Baru Penegak', nis: '77001', kelas: 'X-01', sangga: 'Elang', agama: 'Islam', pin: '482913' }, 'P'],
    ['dewan', { no: 1, nama: 'Baru Dewan', username: 'baru.dewan', pin: '482913' }, 'L'],
    ['pembina', { no: 1, nama: 'Baru Pembina', username: 'baru.pembina', pin: '482913' }, 'P'],
  ]) {
    const b = await K.admin.a.buatAkun(kelompok, [baris]);
    const uname = b.hasil?.[0]?.username;
    ok(b.ok && b.hasil[0].ok && (await jkDari(uname)) === null, `${kelompok}: Edge Function tidak membawa jenis kelamin (kosong dahulu)`);
    const j = await K.admin.a.aturJenisKelamin([{ username: uname, jk }]);
    ok(j.ok && j.data === 1 && (await jkDari(uname)) === jk, `${kelompok}: jenis kelamin disusulkan sesudah akun dibuat (pola sama dengan NTA)`);
  }
}

console.log('\n--- Klien: normalisasi dan daftar ---');
{
  const tulisan = { L: ['L', 'l', 'Laki-laki', 'laki laki', 'LAKI-LAKI', 'Pria', 'putra', 'LK', 'Cowok'], P: ['P', 'p', 'Perempuan', 'perempuan', 'Wanita', 'putri', 'PR', 'Cewek'] };
  ok(Object.entries(tulisan).every(([k, v]) => v.every((t) => normalisasiJenisKelamin(t) === k)), 'penulisan bebas (L, Laki-laki, Pria, Putra, P, Perempuan, Wanita, Putri, ...) dibakukan menjadi L atau P');
  ok(['', null, undefined, 'x', 'LP', 'Laki dan perempuan', '1'].every((t) => normalisasiJenisKelamin(t) === ''), 'isian tidak dikenal atau kosong = ""');
  ok(labelJenisKelamin('L') === 'Laki-laki' && labelJenisKelamin('P') === 'Perempuan' && labelJenisKelamin('') === '' && labelJenisKelamin(undefined) === '', 'label tampilan');
  const users = [
    { id: 'a', role: 'admin', jabatan: 'Admin Gudep', username: 'admin', nama: 'Admin' },
    { id: 'p', role: 'penguji', jabatan: 'Pembina', username: 'pb', nama: 'Bu Pembina', jenisKelamin: 'P' },
    { id: 'd', role: 'penguji', jabatan: 'Dewan Ambalan', username: 'dw', nama: 'Dewan Dua' },
    { id: 's1', role: 'peserta', username: '10002', nama: 'Budi', kelas: 'XI-03' },
    { id: 's2', role: 'peserta', username: '10001', nama: 'Ani', kelas: 'X-01' },
    { id: 's3', role: 'peserta', username: '10003', nama: 'Cici', kelas: 'X-01', jenisKelamin: 'P' },
  ];
  ok(anggotaTanpaJk(users).map((u) => u.id).join() === 'a,d,s1,s2', 'anggotaTanpaJk: semua peran yang belum terisi');
  ok(urutAnggotaJk(anggotaTanpaJk(users)).map((u) => u.id).join() === 's2,s1,d,a', 'urutan: Penegak menurut rombel dan nama, lalu Dewan, lalu Admin');
  ok(labelPeranAnggota(users[0]) === 'Admin Gudep' && labelPeranAnggota(users[1]) === 'Pembina' && labelPeranAnggota(users[3]) === 'Penegak', 'label peran anggota');
  const h = periksaJkMassal([
    { no: 2, id: '10001', jk: 'Perempuan' }, { no: 3, id: '10002', jk: 'l' }, { no: 4, id: '99999', jk: 'L' },
    { no: 5, id: '10001', jk: 'L' }, { no: 6, id: 'dw', jk: 'Aneh' }, { no: 7, id: '', jk: 'L' }, { no: 8, id: ' DW ', jk: 'P' },
  ], users);
  ok(h.map((x) => x.siap).join() === 'true,true,false,false,false,false,true', 'periksaJkMassal: sah, tak terdaftar, ganda, isian tak dikenal, id kosong: ' + h.map((x) => x.siap + ':' + x.galat.join('|')).join(' / '));
  ok(h[0].jk === 'P' && h[0].userId === 's2' && h[1].jk === 'L' && h[6].userId === 'd', 'baris sah membawa kode dan id anggota (nama pengguna tidak peka huruf besar dan spasi)');
}

console.log('\n--- Klien: pemeriksaan import (kolom wajib) ---');
{
  const users = (await K.admin.a.muatProfil()).data;
  const dasar = { nis: '', kelas: 'X-01', sangga: 'E', agama: 'Islam', pin: '', username: '' };
  let p = periksaBaris([
    { ...dasar, no: 2, nama: 'A', nis: '60001', jk: 'Laki-laki' }, { ...dasar, no: 3, nama: 'B', nis: '60002', jk: '' },
    { ...dasar, no: 4, nama: 'C', nis: '60003', jk: 'Campur' }, { ...dasar, no: 5, nama: 'D', nis: '60004' }, { ...dasar, no: 6, nama: 'E', nis: '60005', jk: 'wanita' },
  ], users);
  ok(p[0].siap && p[0].data.jk === 'L' && p[4].siap && p[4].data.jk === 'P', 'Penegak: jenis kelamin sah dibakukan (Laki-laki = L, wanita = P)');
  ok(p[1].siap && p[1].data.jk === '' && p[3].siap && p[3].data.jk === '', 'Penegak: jenis kelamin kosong atau tanpa kolom = tetap siap (opsional; Penegak mengisi sendiri, Tahap 3 H1)');
  ok(!p[2].siap && /Jenis kelamin "Campur" tidak dikenal/.test(p[2].galat.join()), 'Penegak: isian tidak dikenal ditolak dengan pesan');
  const kp = { nis: '', kelas: '', sangga: '', agama: '', pin: '', username: '' };
  for (const kel of ['dewan', 'pembina']) {
    p = periksaBaris([{ no: 2, nama: `Orang ${kel} A`, jk: 'P', ...kp }, { no: 3, nama: `Orang ${kel} B`, ...kp }, { no: 4, nama: `Orang ${kel} C`, jk: 'apa', ...kp }], users, kel);
    ok(p[0].siap && p[0].data.jk === 'P' && !p[1].siap && /Jenis kelamin kosong/.test(p[1].galat.join()) && !p[2].siap && /tidak dikenal/.test(p[2].galat.join()), `${kel}: jenis kelamin wajib dan dibakukan`);
  }
}

console.log('\n--- Template dan pembacaan Excel ---');
{
  const posisi = (ws, judul) => { let n = 0; ws.getRow(1).eachCell((c, i) => { if (String(c.value).startsWith(judul)) n = i; }); return n; };
  for (const kel of ['peserta', 'dewan', 'pembina']) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await buatTemplateAnggota(kel));
    const ws = wb.getWorksheet('Anggota');
    const kJk = posisi(ws, 'Jenis Kelamin');
    ok(kJk === 2 && kolomTemplate(kel)[1].key === 'jk', `template ${kel}: kolom "Jenis Kelamin" tepat sesudah Nama Lengkap`);
    const dv = ws.getCell(2, kJk).dataValidation;
    ok(dv?.type === 'list' && String(dv.formulae[0]).includes('Laki-laki') && String(dv.formulae[0]).includes('Perempuan') && ws.getCell(500, kJk).dataValidation?.type === 'list', `template ${kel}: kolom berdaftar pilihan Laki-laki, Perempuan (sampai baris 500)`);
    let petunjuk = ''; wb.getWorksheet('Petunjuk').eachRow((r) => r.eachCell((c) => { petunjuk += c.value + ' '; }));
    ok(/Jenis Kelamin/.test(petunjuk) && /Laki-laki/.test(petunjuk) && (kel === 'peserta' ? /opsional/.test(petunjuk) : /Wajib/.test(petunjuk)), `template ${kel}: petunjuk menerangkan jenis kelamin (${kel === 'peserta' ? 'opsional' : 'wajib'})`);
    ws.getCell(2, 1).value = `Uji ${kel}`; ws.getCell(2, kJk).value = 'Perempuan';
    ws.getCell(3, 1).value = `Uji dua ${kel}`; ws.getCell(3, kJk).value = 'L';
    ws.getCell(4, 1).value = `Uji tiga ${kel}`;
    if (kel === 'peserta') for (const r of [2, 3, 4]) { ws.getCell(r, posisi(ws, 'NIS')).value = `5000${r}`; ws.getCell(r, posisi(ws, 'Rombel')).value = 'X-02'; ws.getCell(r, posisi(ws, 'Sangga')).value = 'Elang'; ws.getCell(r, posisi(ws, 'Agama')).value = 'Islam'; }
    const b = await bacaExcelAnggota(await wb.xlsx.writeBuffer(), kel);
    ok(b.length === 3 && b[0].jk === 'Perempuan' && b[1].jk === 'L' && b[2].jk === '', `template ${kel}: kolom jenis kelamin terbaca (teks apa adanya)`);
    const per = periksaBaris(b, (await K.admin.a.muatProfil()).data, kel);
    ok(per[0].siap && per[0].data.jk === 'P' && per[1].siap && per[1].data.jk === 'L' && (kel === 'peserta' ? per[2].siap : !per[2].siap && /Jenis kelamin kosong/.test(per[2].galat.join())), `template ${kel}: baris terisi siap, baris tanpa jenis kelamin ${kel === 'peserta' ? 'tetap siap (opsional untuk Penegak)' : 'ditolak'}`);
  }
  // berkas lama tanpa kolom jenis kelamin: tetap terbaca tetapi setiap baris ditolak dengan pesan yang jelas
  const lama = new ExcelJS.Workbook(); const wl = lama.addWorksheet('Anggota');
  wl.addRow(['Nama Lengkap', 'NIS', 'Rombel', 'Sangga', 'Agama']); wl.addRow(['Lama', '60111', 'X-03', 'Elang', 'Islam']);
  const bl = await bacaExcelAnggota(await lama.xlsx.writeBuffer(), 'peserta');
  const pl = periksaBaris(bl, (await K.admin.a.muatProfil()).data, 'peserta');
  ok(bl.length === 1 && pl[0].siap && pl[0].data.jk === '', 'berkas template lama (tanpa kolom jenis kelamin): terbaca dan tetap siap untuk Penegak (jenis kelamin opsional)');
  const alias = new ExcelJS.Workbook(); const wa = alias.addWorksheet('Anggota');
  wa.addRow(['Nama', 'JK', 'Nama Pengguna']); wa.addRow(['Alias Satu', 'P', 'alias.satu']);
  const ba = await bacaExcelAnggota(await alias.xlsx.writeBuffer(), 'pembina');
  ok(ba[0].jk === 'P', 'judul kolom alternatif "JK" dikenali');
}

console.log('\n--- Berkas "Lengkapi jenis kelamin" ---');
{
  const users = (await K.admin.a.muatProfil()).data;
  const tanpa = anggotaTanpaJk(users);
  ok(tanpa.length >= 3, `ada anggota tanpa jenis kelamin pada data contoh (${tanpa.length})`);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await buatBerkasJk(users));
  const ws = wb.getWorksheet('Jenis Kelamin');
  ok(ws.rowCount === tanpa.length + 1, 'berkas memuat tepat anggota yang belum terisi: ' + (ws.rowCount - 1));
  ok(ws.getCell(2, 5).dataValidation?.type === 'list' && String(ws.getCell(2, 5).dataValidation.formulae[0]).includes('Perempuan'), 'kolom Jenis Kelamin berdaftar pilihan');
  ok(ws.getCell(2, 1).numFmt === '@' && String(ws.getCell(2, 1).value) === urutAnggotaJk(tanpa)[0].username, 'nama pengguna berformat teks, urutan Penegak dahulu');
  const idBerkas = []; ws.eachRow((r, i) => { if (i > 1) idBerkas.push(String(r.getCell(1).value)); });
  ws.getCell(2, 5).value = 'Perempuan'; ws.getCell(3, 5).value = 'L'; ws.getCell(4, 5).value = 'entah';
  const baris = await bacaExcelJk(await wb.xlsx.writeBuffer());
  ok(baris.length === 3 && baris[0].id === idBerkas[0] && baris[0].jk === 'Perempuan', 'bacaExcelJk: hanya baris yang jenis kelaminnya diisi');
  const hasil = periksaJkMassal(baris, users);
  ok(hasil[0].siap && hasil[0].jk === 'P' && hasil[1].siap && hasil[1].jk === 'L' && !hasil[2].siap, 'pemeriksaan: dua sah, satu tak dikenal');
  const r = await K.admin.a.aturJenisKelamin(hasil.filter((h) => h.siap).map((h) => ({ username: h.username, jk: h.jk })));
  ok(r.ok && r.data === 2 && anggotaTanpaJk((await K.admin.a.muatProfil()).data).length === tanpa.length - 2, 'menyimpan hasil berkas: dua anggota terisi, sisanya tetap kosong');
  const kosong = new ExcelJS.Workbook(); kosong.addWorksheet('Jenis Kelamin').addRow(['Nama Pengguna', 'Jenis Kelamin']);
  let g = ''; try { await bacaExcelJk(await kosong.xlsx.writeBuffer()); } catch (e) { g = e.message; }
  ok(/Tidak ada data/.test(g), 'berkas tanpa isian: pesan jelas');
  const salah = new ExcelJS.Workbook(); salah.addWorksheet('X').addRow(['a', 'b']);
  g = ''; try { await bacaExcelJk(await salah.xlsx.writeBuffer()); } catch (e) { g = e.message; }
  ok(/Baris judul tidak ditemukan/.test(g), 'berkas asing: pesan jelas');
}

console.log('\n--- Pemasangan di layar ---');
{
  const form = sumber('src/pages/AdminAnggota.jsx');
  ok(/id="f-jk"/.test(form) && /jenisKelamin: ''/.test(form) && /JENIS_KELAMIN\.map/.test(form), 'formulir tambah dan ubah anggota memuat pilihan jenis kelamin');
  ok(/Lengkapi jenis kelamin/.test(form) && /LengkapiJenisKelaminModal/.test(form) && /anggotaTanpaJk/.test(form), 'menu Anggota: pemberitahuan dan tombol "Lengkapi jenis kelamin"');
  ok(/ketJk\(u\.jenisKelamin\)/.test(form), 'daftar anggota menampilkan jenis kelamin (atau penanda belum diisi)');
  const ctx = sumber('src/context/AppContext.jsx');
  ok(/Jenis kelamin wajib dipilih/.test(ctx) && /aturJenisKelamin\(\[\{ username: baris\.username, jk \}\]\)/.test(ctx) && /jkPerBaris/.test(ctx) && /lengkapiJenisKelamin/.test(ctx), 'AppContext: wajib pada anggota baru, disusulkan sesudah akun dibuat (satu dan banyak), dan aksi massal');
  ok(/sg_anggota_jk_atur/.test(sumber('src/lib/api.js')) && /jenisKelamin: atau\(r\.jenis_kelamin\)/.test(sumber('src/lib/mapDb.js')), 'api.js dan mapDb.js: aturJenisKelamin dan jenisKelamin');
  ok(/Jenis Kelamin/.test(sumber('src/components/ImportAnggotaModal.jsx')) && /Jenis kelamin/.test(sumber('src/components/ImportAnggotaModal.jsx')), 'jendela import: petunjuk dan kolom pratinjau jenis kelamin');
  ok(/labelJenisKelamin/.test(sumber('src/pages/Akun.jsx')) && /labelJenisKelamin/.test(sumber('src/pages/PesertaDetail.jsx')), 'halaman Akun dan detail Penegak menampilkan jenis kelamin');
  ok(/supabase\/functions\/sigarda/.test('supabase/functions/sigarda') && !/jenis_kelamin|jenisKelamin/.test(sumber('supabase/functions/sigarda/index.ts')), 'Edge Function sigarda tidak berubah (tidak perlu deploy ulang)');
}

console.log('\n--- Filter jenis kelamin ---');
{
  const pes = [
    { id: '1', nama: 'Ani', kelas: 'X-01', sangga: 'E', jenisKelamin: 'P' }, { id: '2', nama: 'Budi', kelas: 'X-01', sangga: 'E', jenisKelamin: 'L' },
    { id: '3', nama: 'Cici', kelas: 'XI-01', sangga: 'M', jenisKelamin: 'P' }, { id: '4', nama: 'Dodi', kelas: 'XI-01', sangga: 'M' },
  ];
  const nama = (d) => d.map((u) => u.nama).join();
  ok(FILTER_AWAL.jk === '', 'FILTER_AWAL memuat jk kosong (Bersihkan filter menghapusnya)');
  ok(nama(terapkanFilter(pes, { ...FILTER_AWAL, jk: 'P' })) === 'Ani,Cici' && nama(terapkanFilter(pes, { ...FILTER_AWAL, jk: 'L' })) === 'Budi', 'filter Perempuan dan Laki-laki');
  ok(nama(terapkanFilter(pes, { ...FILTER_AWAL, jk: JK_BELUM_DIISI })) === 'Dodi', 'filter "Belum diisi" menampilkan yang kosong');
  ok(terapkanFilter(pes, { ...FILTER_AWAL }).length === 4 && terapkanFilter(pes, { q: '', kelas: 'X-01' }).length === 2, 'tanpa jk (atau filter lama tanpa kunci jk): tidak menyaring');
  ok(nama(terapkanFilter(pes, { ...FILTER_AWAL, jk: 'P', kelas: 'XI-01' })) === 'Cici' && nama(terapkanFilter(pes, { ...FILTER_AWAL, jk: 'P', rombel: ['X-01'] })) === 'Ani' && nama(terapkanFilter(pes, { ...FILTER_AWAL, jk: 'L', q: 'bu' })) === 'Budi', 'digabung dengan kelas, rombel saya, dan pencarian nama');
  const render = (data, filter, tampil) => renderToStaticMarkup(h(FilterBar, { data, filter, setFilter: () => {}, ...(tampil ? { tampil } : {}) }));
  const a = render(pes, { ...FILTER_AWAL }, ['sangga', 'kelas', 'jk']);
  ok(a.includes('aria-label="Filter jenis kelamin"') && a.includes('Semua jenis kelamin') && a.includes('>Laki-laki<') && a.includes('>Perempuan<') && a.includes('>Belum diisi<'), 'menu filter: Semua, Laki-laki, Perempuan, dan Belum diisi (masih ada yang kosong)');
  const semuaIsi = pes.map((u) => ({ ...u, jenisKelamin: u.jenisKelamin ?? 'L' }));
  ok(!render(semuaIsi, { ...FILTER_AWAL }, ['jk']).includes('Belum diisi'), 'semua terisi: pilihan "Belum diisi" tidak tampil');
  ok(!render(semuaIsi.filter((u) => u.jenisKelamin === 'L'), { ...FILTER_AWAL }, ['jk']).includes('>Perempuan<'), 'hanya pilihan yang ada pada data yang tampil');
  ok(!render(pes, { ...FILTER_AWAL }, ['sangga', 'kelas']).includes('Filter jenis kelamin'), 'halaman yang tidak meminta jk tidak menampilkan menunya');
  ok(render(pes, { ...FILTER_AWAL }).includes('Filter jenis kelamin'), 'tampilan bawaan (Absensi, Sidang) memuat menu jenis kelamin');
  ok(render(pes, { ...FILTER_AWAL, jk: 'P' }, ['jk']).includes('Bersihkan filter') && !render(pes, { ...FILTER_AWAL }, ['jk']).includes('Bersihkan filter'), '"Bersihkan filter" muncul saat jenis kelamin dipilih');
  for (const [file, cari] of [
    ['src/pages/AdminAnggota.jsx', "'agama', 'jk'"], ['src/pages/AdminDashboard.jsx', "'agama', 'jk'"], ['src/pages/PengujiDashboard.jsx', "'agama', 'jk'"],
    ['src/pages/Portofolio.jsx', "'kelas', 'jk'"], ['src/pages/Raport.jsx', "'sangga', 'jk'"], ['src/pages/ResetPin.jsx', "'peran', 'jk'"], ['src/components/RekapIuran.jsx', "'kelas', 'jk'"],
  ]) ok(sumber(file).includes(cari), `${file}: filter jenis kelamin dipasang`);
  ok(!/'jk'/.test(sumber('src/components/LembarIuran.jsx')), 'LembarIuran (data dari fungsi iuran, tanpa jenis kelamin) tidak diberi filter ini');
  ok(/labelJenisKelamin/.test(sumber('src/lib/exportLaporan.js')) && /jenis kelamin belum diisi/.test(sumber('src/lib/exportLaporan.js')), 'keterangan filter pada Excel menyebut jenis kelamin');
  const c = hitungJenisKelamin(pes);
  ok(c.L === 1 && c.P === 2 && c.kosong === 1, 'hitungJenisKelamin: laki-laki, perempuan, belum diisi');
  ok(/hitungJenisKelamin/.test(sumber('src/components/RingkasanGudep.jsx')) && /belum diisi jenis kelaminnya/.test(sumber('src/components/RingkasanGudep.jsx')), 'dashboard: baris komposisi laki-laki, perempuan, dan yang belum diisi');
}

console.log('\n--- Kolom Jenis Kelamin pada berkas Excel ---');
{
  const { buatSeed } = await import('../src/data/seed.js');
  const { pesertaDenganPeran } = await import('../src/lib/skuLogic.js');
  const { rekapAbsensi, sesiPeriode, tahunAjaranDari } = await import('../src/lib/absensiLogic.js');
  const { rekapPortofolio } = await import('../src/lib/portofolioLogic.js');
  const { susunAbsensiXlsx, susunPortofolioXlsx } = await import('../src/lib/exportLaporan.js');
  const { hariIni } = await import('../src/lib/format.js');
  const db = buatSeed();
  db.users.filter((u) => u.role === 'peserta').forEach((u, i) => { if (i % 3 !== 2) u.jenisKelamin = i % 2 ? 'P' : 'L'; }); // sebagian sengaja kosong
  const daftar = pesertaDenganPeran(db.progress, db.users);
  const ta = tahunAjaranDari(hariIni());
  const sesi = sesiPeriode(db.absensi, ta, 'ganjil');
  const rekap = rekapAbsensi(db.absensi, daftar, sesi);
  const filter = { q: '', sangga: '', kelas: '', peran: '', jk: '' };
  const lembarAbsensi = susunAbsensiXlsx({ tahunAjaran: ta, periode: 'ganjil', rekap, sesiList: sesi, filter });
  for (const nama of ['Rekap', 'Per Jumat']) {
    const l = lembarAbsensi.find((x) => x.nama === nama);
    ok(l.kolom[2].header === 'Jenis Kelamin' && l.kolom[2].key === 'jk' && l.kolom[1].key === 'nama', `absensi, lembar ${nama}: kolom Jenis Kelamin tepat sesudah Nama`);
    const nilai = new Set(l.baris.map((b) => b.jk));
    ok(nilai.has('Laki-laki') && nilai.has('Perempuan') && nilai.has('') && [...nilai].every((v) => ['Laki-laki', 'Perempuan', ''].includes(v)), `absensi, lembar ${nama}: isi Laki-laki, Perempuan, atau kosong (belum diisi)`);
  }
  const lembarPf = susunPortofolioXlsx({ rekap: rekapPortofolio(db.portofolio, daftar), portofolio: db.portofolio, filter });
  const pf = lembarPf.find((x) => x.nama === 'Rekap Kesiapan');
  ok(pf.kolom[2].header === 'Jenis Kelamin' && pf.kolom[1].key === 'nama' && pf.baris.every((b) => ['Laki-laki', 'Perempuan', ''].includes(b.jk)), 'portofolio (Rekap Kesiapan): kolom Jenis Kelamin sesudah Nama');
  const src = sumber('src/lib/exportLaporan.js');
  ok((src.match(/^\s*KOLOM_JK,$/gm) ?? []).length === 5, 'kolom dipasang pada lima lembar: absensi (Rekap dan Per Jumat), raport, portofolio, dan iuran (Per Penegak)');
  ok(/'Nama', 'Jenis Kelamin', 'NIS'/.test(sumber('src/pages/AdminDashboard.jsx')), 'CSV rekap SKU pada Dashboard Admin memuat kolom Jenis Kelamin');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await (await import('../src/lib/exportXlsx.js')).buatBufferXlsx(lembarAbsensi));
  const ws = wb.getWorksheet('Rekap'); let baris = 0; ws.eachRow((r, i) => { if (i === 5) baris = r; });
  ok(baris && baris.getCell(3).value === 'Jenis Kelamin', 'berkas Excel yang dihasilkan: judul kolom "Jenis Kelamin" pada kolom ketiga');
}

console.log(`\nRINGKASAN JENIS-KELAMIN: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
