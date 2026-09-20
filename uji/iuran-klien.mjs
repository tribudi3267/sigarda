import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { susunIuran, susunKas, susunAsisten, susunLembarIuran, petaProfil } from '../src/lib/mapDb.js';
import {
  NOMINAL_TOMBOL, IURAN_STANDAR, AMBANG_RUTIN, MAKS_IURAN, rupiah, bacaJumlah, adalahNominalTombol, rekapPeserta, ringkasAgregat, bandingkanKas,
} from '../src/lib/iuranLogic.js';
import { susunIuranXlsx, namaFileIuran } from '../src/lib/exportLaporan.js';
import { buatBufferXlsx } from '../src/lib/exportXlsx.js';
import ExcelJS from '../node_modules/exceljs/excel.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

console.log('--- iuranLogic ---');
ok(NOMINAL_TOMBOL.length === 10 && NOMINAL_TOMBOL[0] === 500 && NOMINAL_TOMBOL[9] === 5000 && NOMINAL_TOMBOL.every((n, i) => n === (i + 1) * 500), 'tombol nominal: kelipatan Rp 500 dari Rp 500 sampai Rp 5.000 (10 tombol)');
ok(IURAN_STANDAR === 1000 && AMBANG_RUTIN === 75 && MAKS_IURAN === 1000000, 'iuran standar Rp 1.000, ambang rutin 75%, maksimal Rp 1.000.000');
ok(rupiah(1000) === 'Rp 1.000' && rupiah(0) === 'Rp 0' && rupiah(1234567) === 'Rp 1.234.567' && rupiah(null) === 'Rp 0' && rupiah(-500) === 'Rp -500', 'format rupiah');
for (const [masuk, nilai] of [['', null], ['  ', null], ['0', null], ['2500', 2500], ['2.500', 2500], ['Rp 2.500', 2500], ['rp2500', 2500], [' 1 500 ', 1500], ['1000000', 1000000], [null, null], [undefined, null]]) {
  const h = bacaJumlah(masuk); ok(h.ok && h.nilai === nilai, `bacaJumlah(${JSON.stringify(masuk)}) = ${nilai}`);
}
for (const masuk of ['abc', '12a', '-500', '1,5', '2.5.5x', '1000001', '99999999']) { const h = bacaJumlah(masuk); ok(!h.ok && h.pesan, `bacaJumlah(${JSON.stringify(masuk)}) ditolak: ${h.pesan}`); }
ok(adalahNominalTombol(500) && adalahNominalTombol(5000) && adalahNominalTombol(2500) && !adalahNominalTombol(2700) && !adalahNominalTombol(5500) && !adalahNominalTombol(null), 'adalahNominalTombol');

const sesi = ['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25'].map((tanggal) => ({ tanggal }));
const iuran = {
  '2026-09-04': { a: { jumlah: 1000, jenis: 'rutin' }, b: { jumlah: 2000, jenis: 'rutin' } },
  '2026-09-11': { a: { jumlah: 1000, jenis: 'rutin' } },
  '2026-09-18': { a: { jumlah: 1500, jenis: 'susulan' }, b: { jumlah: 500, jenis: 'rutin' } },
  '2026-10-02': { a: { jumlah: 9999, jenis: 'rutin' } }, // di luar pertemuan yang dihitung
};
const rk = rekapPeserta(iuran, [{ id: 'a', nama: 'A' }, { id: 'b', nama: 'B' }, { id: 'c', nama: 'C' }], sesi);
ok(rk[0].kali === 3 && rk[0].rutin === 2 && rk[0].susulan === 1 && rk[0].total === 3500 && rk[0].totalSusulan === 1500 && rk[0].persen === 75, 'rekapPeserta A: 3 dari 4 pertemuan (2 rutin + 1 susulan), Rp 3.500, 75%');
ok(rk[1].kali === 2 && rk[1].persen === 50 && rk[1].total === 2500 && rk[2].kali === 0 && rk[2].persen === 0 && rk[2].total === 0, 'rekapPeserta B dan C (tanpa iuran)');
ok(!('9999' in {}) && rk[0].total !== 13499, 'iuran di luar pertemuan yang dihitung diabaikan');
ok(rekapPeserta(iuran, [{ id: 'a' }], [])[0].persen === null, 'tanpa pertemuan: persen null (bukan pembagian nol)');
ok(rekapPeserta({}, [{ id: 'a' }], sesi)[0].persen === 0, 'tanpa iuran sama sekali: 0%');
ok(rekapPeserta(iuran, [{ id: 'a' }], sesi.slice(0, 3))[0].persen === 100, 'pembulatan persen: 3 dari 3 = 100%');
ok(rekapPeserta({ x: 1 }, [{ id: 'q' }], [{ tanggal: 'x' }, { tanggal: 'y' }, { tanggal: 'z' }])[0].persen === 0, '1 dari 3 tanpa iuran: 0%');
const tiga = rekapPeserta({ t1: { p: { jumlah: 500, jenis: 'rutin' } }, t2: { p: { jumlah: 500, jenis: 'rutin' } } }, [{ id: 'p' }], [{ tanggal: 't1' }, { tanggal: 't2' }, { tanggal: 't3' }])[0];
ok(tiga.persen === 67, '2 dari 3 = 67% (dibulatkan setengah ke atas)');

const agr = [
  { tanggal: '2026-09-04', tipe: 'gudep', kunci: '', jumlah: 3000, susulan: 0, orang: 2 },
  { tanggal: '2026-09-04', tipe: 'sangga', kunci: 'Sangga Elang', jumlah: 1000, susulan: 0, orang: 1 },
  { tanggal: '2026-09-04', tipe: 'sangga', kunci: 'Sangga Merak', jumlah: 2000, susulan: 0, orang: 1 },
  { tanggal: '2026-09-04', tipe: 'kelas', kunci: 'X', jumlah: 3000, susulan: 0, orang: 2 },
  { tanggal: '2026-09-11', tipe: 'gudep', kunci: '', jumlah: 1000, susulan: 1000, orang: 1 },
  { tanggal: '2026-09-11', tipe: 'sangga', kunci: 'Sangga Elang', jumlah: 1000, susulan: 1000, orang: 1 },
  { tanggal: '2026-09-11', tipe: 'kelas', kunci: 'X', jumlah: 1000, susulan: 1000, orang: 1 },
];
const ra = ringkasAgregat(agr);
ok(ra.total === 4000 && ra.totalSusulan === 1000 && ra.kali === 3 && ra.perTanggal['2026-09-04'].jumlah === 3000 && ra.perTanggal['2026-09-11'].susulan === 1000, 'ringkasAgregat: total, susulan, jumlah catatan, per tanggal');
ok(ra.sangga.length === 2 && ra.sangga[0].kunci === 'Sangga Elang' && ra.sangga[0].jumlah === 2000 && ra.sangga[0].kali === 2 && ra.sangga[1].jumlah === 2000, 'per sangga dijumlahkan lintas tanggal dan diurut (terbesar dulu, lalu nama)');
ok(ra.kelas.length === 1 && ra.kelas[0].jumlah === 4000 && ra.kelas[0].susulan === 1000, 'per kelas');
const kosong = ringkasAgregat(); ok(kosong.total === 0 && kosong.sangga.length === 0 && Object.keys(kosong.perTanggal).length === 0, 'ringkasAgregat tanpa argumen aman');
ok(bandingkanKas(3000, { totalFisik: 3000 }).status === 'cocok' && bandingkanKas(3000, { totalFisik: 3500 }).selisih === 500 && bandingkanKas(3000, { totalFisik: 3500 }).status === 'lebih' && bandingkanKas(3000, { totalFisik: 2500 }).status === 'kurang' && bandingkanKas(3000, undefined).status === null, 'bandingkanKas: cocok, lebih, kurang, belum ditutup');

console.log('\n--- mapDb ---');
ok(JSON.stringify(susunIuran([{ tanggal: '2026-09-04T00:00:00', peserta_id: 'a', jumlah: 500, jenis: 'rutin', oleh: null, waktu: 'w' }])) === JSON.stringify({ '2026-09-04': { a: { jumlah: 500, jenis: 'rutin', oleh: null, waktu: 'w' } } }) && Object.keys(susunIuran()).length === 0, 'susunIuran');
ok(susunKas([{ tanggal: '2026-09-04', total_fisik: 1000, catatan: null, oleh: 'u', waktu: 'w' }])['2026-09-04'].totalFisik === 1000 && susunKas([{ tanggal: '2026-09-04', total_fisik: 1, catatan: null }])['2026-09-04'].catatan === '', 'susunKas');
ok(susunAsisten([{ peserta_id: 'p', ditunjuk_oleh: null, ditunjuk_pada: 't' }])[0].pesertaId === 'p' && susunAsisten().length === 0, 'susunAsisten');
ok(susunLembarIuran([{ id: 'x', nama: 'N', kelas: null, sangga: null, status: null, jumlah: null, jenis: null }])[0].kelas === '', 'susunLembarIuran menormalkan bidang kosong');

console.log('\n--- api terhadap server ---');
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^\uFEFF/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const K = { dewan: await masuk('dewan', PIN_DEMO.dewan), pembina: await masuk('pembina', PIN_DEMO.pembina), admin: await masuk('admin', PIN_DEMO.admin), ahmad: await masuk('10231', PIN_DEMO.penegak) };
const ahmad = (await q(`select id from public.profiles where username = '10231'`))[0].id;
const calon = (await q(`select id, username from public.profiles where role = 'peserta' and sigarda.tingkat_selesai(id, 'Bantara') and not sigarda.tingkat_selesai(id, 'Laksana') order by username`))[0];
const T = (await q(`select tanggal::text t from public.absensi_sesi order by tanggal desc limit 1`))[0].t;
await q(`delete from public.iuran`); await q(`delete from public.iuran_log`);
let r = await K.dewan.a.aturIuran(T, ahmad, 2500); ok(r.ok, 'aturIuran (Dewan)');
r = await K.dewan.a.aturIuran(T, ahmad, null); ok(r.ok && (await q(`select count(*)::int n from public.iuran`))[0].n === 0, 'aturIuran dengan null menghapus');
await K.dewan.a.aturIuran(T, ahmad, 1500);
const ids = (await q(`select id from public.profiles where role = 'peserta' order by username limit 5`)).map((x) => x.id);
r = await K.dewan.a.aturIuranBanyak(T, ids, 1000, true); ok(r.ok && r.data === (ids.includes(ahmad) ? 4 : 5), 'aturIuranBanyak (hanya kosong) mengembalikan jumlah baris baru: ' + r.data);
r = await K.pembina.a.aturIuran(T, ahmad, 1); ok(!r.ok && /Dewan Ambalan atau asisten/.test(r.pesan), 'Pembina ditolak lewat api: ' + r.pesan);
r = await K.dewan.a.muatIuran(T, T); ok(r.ok && Object.keys(r.data[T]).length === (ids.includes(ahmad) ? 5 : 6) && r.data[T][ahmad].jumlah === 1500, 'Dewan memuat iuran satu tanggal (bentuk { tanggal: { peserta: {...} } })');
r = await K.ahmad.a.muatIuran('2000-01-01', '2100-01-01'); ok(r.ok && Object.values(r.data).every((per) => Object.keys(per).length === 1 && ahmad in per), 'Penegak hanya memuat iuran miliknya lewat api');
r = await K.dewan.a.muatIuran('2000-01-01', '2000-12-31'); ok(r.ok && Object.keys(r.data).length === 0, 'rentang tanpa iuran: objek kosong');
r = await K.pembina.a.muatKas('2000-01-01', '2100-01-01'); ok(r.ok && Object.keys(r.data).length === 0, 'muatKas kosong');
r = await K.dewan.a.simpanKas(T, 6500, 'ada receh'); ok(r.ok, 'simpanKas');
r = await K.admin.a.muatKas(T, T); ok(r.ok && r.data[T].totalFisik === 6500 && r.data[T].catatan === 'ada receh', 'Admin memuat tutup kas');
r = await K.ahmad.a.muatKas(T, T); ok(r.ok && Object.keys(r.data).length === 0, 'Penegak tidak menerima baris kas (kosong)');
r = await K.dewan.a.simpanKas(T, null); ok(r.ok && (await K.dewan.a.muatKas(T, T)).data[T] === undefined, 'simpanKas dengan null menghapus');
r = await K.dewan.a.aturAsisten(calon.id, true); ok(r.ok, 'aturAsisten (Dewan menunjuk Calon Laksana)');
r = await K.dewan.a.muatAsisten(); ok(r.ok && r.data.some((a) => a.pesertaId === calon.id), 'muatAsisten memuat penunjukan (pengurus)');
const A = await masuk(calon.username, PIN_DEMO.penegak);
r = await A.a.muatAsisten(); ok(r.ok && r.data.length === 1 && r.data[0].pesertaId === calon.id, 'asisten memuat penunjukan dirinya sendiri');
r = await K.ahmad.a.muatAsisten(); ok(r.ok && r.data.length === 0, 'Penegak biasa: daftar asisten kosong');
r = await A.a.muatLembarIuran(T); ok(r.ok && r.data.length === 11 && Object.keys(r.data[0]).sort().join() === 'id,jenis,jumlah,kelas,nama,sangga,status', 'asisten memuat lembar (11 Penegak, tanpa dirinya)');
r = await K.ahmad.a.muatLembarIuran(T); ok(!r.ok && /Dewan Ambalan atau asisten/.test(r.pesan), 'Penegak biasa ditolak membuka lembar: ' + r.pesan);
r = await A.a.aturIuran(T, ahmad, 3000); ok(r.ok, 'asisten mencatat lewat api');
r = await K.ahmad.a.muatIuranAgregat(T, T);
const ag = ringkasAgregat(r.data);
const dbTotal = (await q(`select sum(jumlah)::int s from public.iuran where tanggal = $1`, [T]))[0].s;
ok(r.ok && ag.total === dbTotal && ag.sangga.reduce((s, x) => s + x.jumlah, 0) === dbTotal && ag.kelas.reduce((s, x) => s + x.jumlah, 0) === dbTotal, `agregat lewat api: total Rp ${dbTotal} = jumlah sangga = jumlah kelas`);
const semua = (await q(`select tanggal::text t, count(*)::int n from public.iuran group by tanggal`));
ok(ag.kali === semua.reduce((s, x) => s + (x.t === T ? x.n : 0), 0), 'jumlah catatan pada agregat sama dengan tabel');
r = await K.dewan.a.muatLogIuran(T); ok(r.ok && r.data.length >= 8 && r.data.every((x) => 'jumlah_baru' in x), 'riwayat dapat dimuat pengurus (' + r.data?.length + ' baris)');
r = await K.ahmad.a.muatLogIuran(T); ok(r.ok && r.data.length === 0, 'Penegak tidak menerima riwayat');

console.log('\n--- Excel rekap ---');
const profil = (await K.dewan.a.muatProfil()).data.filter((u) => u.role === 'peserta');
const dataAbs = (await K.dewan.a.muatIuran('2000-01-01', '2100-01-01')).data;
const sesiExcel = [{ tanggal: T }];
const rekExcel = rekapPeserta(dataAbs, profil, sesiExcel);
const ringExcel = ringkasAgregat((await K.dewan.a.muatIuranAgregat(T, T)).data);
await K.dewan.a.simpanKas(T, 9999, 'uji excel');
const kasExcel = (await K.dewan.a.muatKas(T, T)).data;
const lembar = susunIuranXlsx({ tahunAjaran: '2026/2027', periode: 'ganjil', rekap: rekExcel, sesi: sesiExcel, ring: ringExcel, kas: kasExcel, filter: { q: '', sangga: '', kelas: '', peran: '' } });
ok(lembar.map((s) => s.nama).join() === 'Per Penegak,Per Pertemuan,Per Sangga,Per Kelas,Keterangan', 'lima lembar Excel: ' + lembar.map((s) => s.nama).join(', '));
ok(lembar[0].baris.length === profil.length && lembar[0].baris.reduce((s, b) => s + b.total, 0) === dbTotal, `lembar Per Penegak: ${profil.length} baris, jumlah = Rp ${dbTotal}`);
ok(lembar[1].baris[0].jumlah === dbTotal && lembar[1].baris[0].fisik === 9999 && lembar[1].baris[0].selisih === 9999 - dbTotal, 'lembar Per Pertemuan: total, uang fisik, dan selisih');
ok(lembar[2].baris.reduce((s, b) => s + b.jumlah, 0) === dbTotal && lembar[3].baris.reduce((s, b) => s + b.jumlah, 0) === dbTotal, 'lembar sangga dan kelas menjumlah ke total gudep');
ok(lembar[0].warna({ persen: 50 }, 'persen') && !lembar[0].warna({ persen: 90 }, 'persen') && !lembar[0].warna({ persen: '' }, 'persen'), 'baris di bawah 75% ditandai merah; kosong tidak ditandai');
const buf = await buatBufferXlsx(lembar); const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
ok(wb.worksheets.length === 5 && wb.worksheets[0].name === 'Per Penegak' && wb.worksheets[0].rowCount > profil.length, 'berkas Excel terbentuk dan terbaca ulang (5 lembar)');
ok(/^rekap-iuran-bumbung-2026-2027-ganjil\.xlsx$/.test(namaFileIuran('2026/2027', 'ganjil')), 'nama berkas');

console.log('\n--- Basis data belum dimigrasi ---');
const pgLama = new PGlite();
await siapkanPg(pgLama, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^\uFEFF/, '') });
await isiDataContoh(pgLama); await pgLama.query('update public.profiles set wajib_ganti_pin = false');
await pgLama.query('drop table public.iuran_kas, public.iuran_log, public.iuran, public.asisten_iuran cascade');
const apiLama = buatApi(buatKlienFake(pgLama)); await apiLama.masuk('dewan', PIN_DEMO.dewan);
for (const [nama, fn] of [['muatIuran', () => apiLama.muatIuran(T, T)], ['muatKas', () => apiLama.muatKas(T, T)], ['muatAsisten', () => apiLama.muatAsisten()]]) {
  const x = await fn(); ok(!x.ok && /Basis data belum diperbarui|migrasi/i.test(x.pesan ?? ''), `${nama}: pesan yang menuntun ke migrasi tanpa melempar galat`);
}
const x2 = await apiLama.aturIuran(T, ahmad, 1000); ok(!x2.ok, 'aturIuran pada basis data lama gagal dengan pesan (bukan galat keras)');

console.log(`\nRINGKASAN IURAN-KLIEN: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
