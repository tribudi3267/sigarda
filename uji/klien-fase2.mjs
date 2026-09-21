import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { susunProgress, susunSesiUjian } from '../src/lib/mapDb.js';
import {
  STATUS_TUGAS, butirIdDariUnit, dariPengajuan, daftarButirKatalog, labelTugas, periksaSesi, ringkasSesi, sesiUntukPeserta, tingkatDariButirId, tugasSesi,
} from '../src/lib/sesiLogic.js';
import { alamatDasar, labelUnit, parameterVerifikasi, POLA_KODE, POLA_TOKEN, teksUnit, urlVerifikasi } from '../src/lib/verifikasiLogic.js';
import { butirPeserta } from '../src/lib/skuLogic.js';
import qrcode from 'qrcode-generator';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^\uFEFF/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const K = { dewan: await masuk('dewan', PIN_DEMO.dewan), pembina: await masuk('pembina', PIN_DEMO.pembina), admin: await masuk('admin', PIN_DEMO.admin), ahmad: await masuk('10231', PIN_DEMO.penegak), kevin: await masuk('10234', PIN_DEMO.penegak) };
const anonApi = buatApi(buatKlienFake(pg));
const uid = async (u) => (await q(`select id from public.profiles where username = $1`, [u]))[0].id;
const bagas = await uid('10007'), ahmad = await uid('10231'), kevin = await uid('10234');

console.log('--- verifikasiLogic ---');
ok(parameterVerifikasi('') === null && parameterVerifikasi('?x=1') === null, 'tanpa parameter v: halaman biasa (null)');
ok(parameterVerifikasi('?v=') === '' && parameterVerifikasi('?v=abc') === 'abc' && parameterVerifikasi('?v=%20abc%20') === 'abc' && parameterVerifikasi('?a=1&v=VRF-1234567') === 'VRF-1234567', 'parameter v dibaca dan dirapikan');
ok(POLA_TOKEN.test('a'.repeat(32)) && !POLA_TOKEN.test('a'.repeat(31)) && !POLA_TOKEN.test('g'.repeat(32)), 'pola token');
ok(POLA_KODE.test('VRF-1A2B3C4') && POLA_KODE.test('vrf-1a2b3c4') && !POLA_KODE.test('VRF-123'), 'pola kode VRF');
const lok = { origin: 'https://sigarda.smabukateja.sch.id' };
ok(alamatDasar(lok, '/') === 'https://sigarda.smabukateja.sch.id/', 'alamat dasar dengan basis "/"');
ok(alamatDasar({ origin: 'https://x.github.io' }, '/sigarda/') === 'https://x.github.io/sigarda/', 'alamat dasar dengan basis subfolder');
ok(alamatDasar(lok, 'sigarda/') === 'https://sigarda.smabukateja.sch.id/sigarda/', 'basis tanpa garis miring depan dinormalkan');
ok(urlVerifikasi('t'.repeat(32), 'https://a.id/') === `https://a.id/?v=${'t'.repeat(32)}`, 'url verifikasi');
ok(labelUnit('BAN-05') === 'Butir 5' && /^Butir 1[a-e]$/.test(labelUnit(butirPeserta('Bantara', 'Islam').find((b) => b.id === 'BAN-01').unit[0].id)) && labelUnit('XXX') === 'XXX' && teksUnit('BAN-05').length > 10 && teksUnit('XXX') === '', 'label dan teks unit');
const url = urlVerifikasi('0123456789abcdef0123456789abcdef', 'https://sigarda.smabukateja.sch.id/');
const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
ok(qr.getModuleCount() <= 41 && /<svg/.test(qr.createSvgTag({ cellSize: 1, margin: 0, scalable: true })), `QR untuk alamat verifikasi (${url.length} karakter) terbentuk: ${qr.getModuleCount()}x${qr.getModuleCount()} modul`);

console.log('\n--- mapDb: token dan sesi ---');
const pp0 = susunProgress([{ peserta_id: 'p', sku_id: 'BAN-02', status: 'lulus', verifikasi_token: 'ab'.repeat(16) }, { peserta_id: 'p', sku_id: 'BAN-03', status: 'proses' }], []);
ok(pp0.p['BAN-02'].token === 'ab'.repeat(16) && pp0.p['BAN-03'].token === null, 'susunProgress: token terbawa (null bila tidak ada, juga untuk database lama)');
const ss = susunSesiUjian(
  [{ id: 1, nama: 'A', tanggal: '2026-09-10', tempat: null, catatan: null, status: 'terjadwal', dibuat_oleh: null }, { id: 2, nama: 'B', tanggal: '2026-10-01T00:00:00', tempat: 'Aula', catatan: 'x', status: 'selesai', dibuat_oleh: 'u' }, { id: 3, nama: 'C', tanggal: '2026-10-01', tempat: '', catatan: '', status: 'berlangsung', dibuat_oleh: 'u' }],
  [{ sesi_id: 1, butir_id: 'BAN-02' }, { sesi_id: 1, butir_id: 'BAN-03' }, { sesi_id: 2, butir_id: 'LAK-01' }],
  [{ sesi_id: 1, peserta_id: 'p1' }, { sesi_id: 2, peserta_id: 'p2' }]
);
ok(ss.map((s) => s.id).join() === '3,2,1', 'susunSesiUjian: tanggal terbaru dulu, tanggal sama: id terbesar dulu (' + ss.map((s) => s.id).join() + ')');
ok(ss[2].butir.join() === 'BAN-02,BAN-03' && ss[2].peserta.join() === 'p1' && ss[0].butir.length === 0 && ss[0].peserta.length === 0, 'butir dan peserta dikelompokkan per sesi; sesi tanpa isi = larik kosong');
ok(ss[1].tanggal === '2026-10-01' && ss[2].tempat === '' && ss[2].catatan === '', 'tanggal dipotong menjadi YYYY-MM-DD; tempat/catatan null menjadi teks kosong');
ok(susunSesiUjian().length === 0, 'susunSesiUjian tanpa argumen aman');

console.log('\n--- Token QR di data contoh (backfill seedLokal) ---');
const semuaLulus = await q(`select count(*)::int n from public.sku_progress where status = 'lulus'`);
const lulusTanpaToken = await q(`select count(*)::int n from public.sku_progress where status = 'lulus' and verifikasi_token is null`);
const bukanLulusBerToken = await q(`select count(*)::int n from public.sku_progress where status <> 'lulus' and verifikasi_token is not null`);
ok(semuaLulus[0].n > 10 && lulusTanpaToken[0].n === 0 && bukanLulusBerToken[0].n === 0, `semua ${semuaLulus[0].n} butir lulus punya token; yang lain tidak`);
const pembinaProg = await K.pembina.a.muatProgress();
ok(pembinaProg.ok && Object.values(pembinaProg.data).flatMap((e) => Object.values(e)).filter((e) => e.status === 'lulus').every((e) => POLA_TOKEN.test(e.token)), 'muatProgress: entri lulus membawa token');
const progAhmad = await K.ahmad.a.muatProgress();
ok(progAhmad.ok && Object.values(progAhmad.data[ahmad] ?? {}).some((e) => e.status === 'lulus' && POLA_TOKEN.test(e.token)), 'Penegak membaca token progresnya sendiri (untuk Kartu SKU)');
ok(Object.keys(progAhmad.data).every((id) => id === ahmad), 'Penegak hanya membaca progres sendiri');

console.log('\n--- api.verifikasiToken / verifikasiKode tanpa login ---');
const contohLulus = (await q(`select verifikasi_token t, verifikasi v, sku_id from public.sku_progress where status = 'lulus' and verifikasi_token is not null limit 1`))[0];
let r = await anonApi.verifikasiToken(contohLulus.t);
ok(r.ok && r.data.ditemukan && r.data.jenis === 'butir' && r.data.kode === contohLulus.v, 'anon: token butir sah lewat api.verifikasiToken');
r = await anonApi.verifikasiKode(contohLulus.v);
ok(r.ok && r.data.ditemukan && !('nama' in r.data), 'anon: kode VRF sah lewat api.verifikasiKode, tanpa nama');
r = await anonApi.verifikasiToken('0'.repeat(32));
ok(r.ok && r.data.ditemukan === false, 'anon: token tak dikenal = {ditemukan:false}');
r = await anonApi.muatSesiUjian();
ok(r.ok && r.data.length === 0, 'anon: muatSesiUjian tidak melempar galat dan kosong (tanpa hak baca)');

console.log('\n--- Surat Tanda Lulus: token per tingkat ---');
const bagasBantara = (await q(`select count(*)::int n from public.sku_progress where peserta_id = $1 and status = 'lulus' and sku_id like 'BAN-%'`, [bagas]))[0].n;
const tingkatLengkap = (await q(`select sigarda.tingkat_selesai($1, 'Bantara') s`, [bagas]))[0].s;
console.log(`      (Bagas: ${bagasBantara} butir Bantara lulus; lengkap: ${tingkatLengkap})`);
r = await K.pembina.a.sertifikatTingkat(bagas, 'Bantara');
ok(r.ok && POLA_TOKEN.test(r.data), 'Pembina menerbitkan token surat Bantara Bagas: ' + (r.ok ? 'ok' : r.pesan));
const tokenSurat = r.data;
r = await K.pembina.a.sertifikatTingkat(bagas, 'Bantara');
ok(r.ok && r.data === tokenSurat, 'idempoten: token sama pada permintaan berikutnya');
r = await K.ahmad.a.sertifikatTingkat(bagas, 'Bantara');
ok(!r.ok && /berwenang/.test(r.pesan), 'Penegak lain tidak dapat menerbitkan surat milik orang lain: ' + r.pesan);
r = await K.ahmad.a.sertifikatTingkat(ahmad, 'Laksana');
ok(!r.ok && /seluruh butirnya/.test(r.pesan), 'tingkat belum lengkap ditolak: ' + r.pesan);
r = await anonApi.verifikasiToken(tokenSurat);
ok(r.ok && r.data.ditemukan && r.data.jenis === 'tingkat' && r.data.tingkat === 'Bantara' && r.data.jumlah_butir >= 20 && r.data.nama, 'anon: token surat sah: ' + JSON.stringify(r.data).slice(0, 160));
await q(`update public.sku_progress set status = 'ulang', verifikasi_token = null where peserta_id = $1 and sku_id = 'BAN-05'`, [bagas]);
r = await anonApi.verifikasiToken(tokenSurat);
ok(r.ok && r.data.ditemukan === false, 'satu butir dibatalkan: surat tidak lagi sah');
await q(`update public.sku_progress set status = 'lulus', verifikasi_token = sigarda.token_acak() where peserta_id = $1 and sku_id = 'BAN-05'`, [bagas]);
r = await anonApi.verifikasiToken(tokenSurat);
ok(r.ok && r.data.ditemukan === true, 'butir lulus kembali: surat yang sama sah lagi');

console.log('\n--- Sesi ujian lewat api ---');
const seedProg = await K.pembina.a.muatProgress();
const users = (await K.pembina.a.muatProfil()).data;
r = await K.dewan.a.muatSesiUjian();
ok(r.ok && r.data.length === 0 && !r.galat, 'awalnya tidak ada sesi');
r = await K.dewan.a.simpanSesi({ id: null, nama: '  Ujian Bantara  ', tanggal: '2026-09-18', tempat: 'Aula', catatan: 'Bawa seragam', status: 'terjadwal', butir: ['BAN-02', 'BAN-01', 'LAK-01'], peserta: [ahmad, kevin] });
ok(r.ok && Number.isInteger(r.data), 'Dewan membuat sesi: id ' + r.data);
const sid = r.data;
r = await K.dewan.a.muatSesiUjian();
ok(r.ok && r.data.length === 1 && r.data[0].nama === 'Ujian Bantara' && r.data[0].tanggal === '2026-09-18' && r.data[0].tempat === 'Aula' && r.data[0].status === 'terjadwal' && r.data[0].butir.length === 3 && r.data[0].peserta.length === 2, 'muatSesiUjian memetakan sesi lengkap dengan butir dan peserta');
const sesi = r.data[0];
r = await K.ahmad.a.muatSesiUjian();
ok(r.ok && r.data.length === 1 && r.data[0].id === sid, 'Penegak yang tercantum melihat sesinya');
await K.pembina.a.simpanSesi({ id: null, nama: 'Sesi tanpa Ahmad', tanggal: '2026-09-25', tempat: '', catatan: '', status: 'terjadwal', butir: ['BAN-02'], peserta: [kevin] });
r = await K.ahmad.a.muatSesiUjian();
ok(r.ok && r.data.length === 1, 'Penegak tidak melihat sesi yang tidak mencantumkannya');
r = await K.ahmad.a.simpanSesi({ id: null, nama: 'x', tanggal: '2026-09-18', tempat: '', catatan: '', status: 'terjadwal', butir: ['BAN-02'], peserta: [ahmad] });
ok(!r.ok && /Dewan Ambalan/.test(r.pesan), 'Penegak tidak dapat membuat sesi: ' + r.pesan);
r = await K.dewan.a.simpanSesi({ id: null, nama: '', tanggal: '2026-09-18', tempat: '', catatan: '', status: 'terjadwal', butir: ['BAN-02'], peserta: [ahmad] });
ok(!r.ok && /Nama sesi/.test(r.pesan), 'nama kosong ditolak server: ' + r.pesan);
r = await K.dewan.a.simpanSesi({ id: null, nama: 'x', tanggal: '2026-09-18', tempat: '', catatan: '', status: 'terjadwal', butir: ['BAN-99'], peserta: [ahmad] });
ok(!r.ok && /butir yang tidak dikenal/.test(r.pesan), 'butir tak dikenal ditolak: ' + r.pesan);
r = await K.dewan.a.statusSesi(sid, 'berlangsung');
ok(r.ok, 'Dewan memulai sesi');
r = await K.dewan.a.hapusSesi(sid);
ok(!r.ok && /Pembina dan Admin/.test(r.pesan), 'Dewan tidak dapat menghapus: ' + r.pesan);

console.log('\n--- sesiLogic: papan sesi dari progres nyata ---');
const dataSesi = (await K.pembina.a.muatSesiUjian()).data.find((s) => s.id === sid);
ok(dataSesi.status === 'berlangsung', 'status sesi berlangsung terbaca');
// keadaan awal: kosongkan progres Ahmad dan Kevin untuk butir yang diuji agar deterministik
await q(`delete from public.sku_progress where peserta_id in ($1,$2)`, [ahmad, kevin]);
let prog = (await K.pembina.a.muatProgress()).data;
let papan = tugasSesi(dataSesi, users, prog);
const ahmadTugas = papan.find((p) => p.peserta.id === ahmad).tugas;
const unitButir1 = butirPeserta('Bantara', 'Islam').find((b) => b.id === 'BAN-01').unit.length;
const agamaAhmad = users.find((u) => u.id === ahmad).agama, agamaKevin = users.find((u) => u.id === kevin).agama;
ok(papan.length === 2, 'papan memuat kedua peserta');
ok(ahmadTugas.filter((t) => t.poin.butirNo === 1 && t.tingkat === 'Bantara').length === butirPeserta('Bantara', agamaAhmad).find((b) => b.id === 'BAN-01').unit.length, `butir 1 diuraikan per sub-butir sesuai agama (${agamaAhmad}): ${unitButir1} unit`);
ok(ahmadTugas.some((t) => t.tingkat === 'Laksana' && t.status === 'terkunci') && ahmadTugas.filter((t) => t.tingkat === 'Bantara').every((t) => t.status === 'menunggu'), 'Laksana terkunci selama Bantara belum selesai; Bantara menunggu');
ok(papan.map((p) => p.peserta.kelas + '|' + p.peserta.nama).join() === [...papan].map((p) => p.peserta.kelas + '|' + p.peserta.nama).sort((a, b) => a.localeCompare(b, 'id', { numeric: true })).join(), 'peserta terurut kelas lalu nama');
let rk = ringkasSesi(papan);
ok(rk.terkunci > 0 && rk.total === rk.menunggu && rk.selesai === 0 && rk.persen === 0 && rk.pesertaSelesai === 0, `ringkasan awal: ${rk.total} tugas menunggu, ${rk.terkunci} terkunci tidak dihitung`);
ok(labelTugas(ahmadTugas.find((t) => t.poin.butirNo === 2 && t.tingkat === 'Bantara').poin) === 'B2' && /^B1[a-e]$/.test(labelTugas(ahmadTugas.find((t) => t.poin.butirNo === 1).poin)), 'label chip: B2, B1a');

// penguji menilai lewat api (jalur lama tanpa instrumen ditetapkan)
const nilai = (peserta, sku, hasil, tgl, extra = {}) => K.pembina.a.catatHasil({ pin: PIN_DEMO.pembina, pesertaId: peserta, skuId: sku, hasil, tanggalUji: tgl, nilai: hasil === 'lulus' ? 'Baik' : null, catatan: hasil === 'lulus' ? '' : 'catatan', ...extra });
r = await nilai(ahmad, 'BAN-02', 'lulus', '2026-09-18'); ok(r.ok, 'B2 Ahmad lulus pada tanggal sesi');
r = await nilai(ahmad, 'BAN-03', 'ulang', '2026-09-18'); ok(r.ok, 'B3 Ahmad diulang pada tanggal sesi');
r = await nilai(ahmad, 'BAN-04', 'lulus', '2026-09-01'); ok(r.ok, 'B4 Ahmad lulus SEBELUM tanggal sesi');
r = await nilai(ahmad, 'BAN-05', 'proses', '2026-09-18'); ok(r.ok, 'B5 Ahmad ditandai sedang diuji');
r = await nilai(kevin, 'BAN-02', 'ulang', '2026-09-01'); ok(r.ok, 'B2 Kevin diulang SEBELUM tanggal sesi');
prog = (await K.pembina.a.muatProgress()).data;
papan = tugasSesi(dataSesi, users, prog);
const st = (pid, no, tingkat = 'Bantara') => papan.find((p) => p.peserta.id === pid).tugas.find((t) => t.poin.butirNo === no && t.tingkat === tingkat)?.status;
ok(st(ahmad, 2) === 'lulus', 'lulus pada/sesudah tanggal sesi = lulus');
ok(st(ahmad, 3) === undefined && st(ahmad, 5) === undefined, 'butir yang tidak dipilih pada sesi (B3, B5) tidak muncul di papan');
ok(st(ahmad, 4) === undefined || st(ahmad, 4) === 'sudahLulus', 'butir di luar pilihan sesi tidak muncul (B4 tidak dipilih)');
ok(st(kevin, 2) === 'menunggu', 'diulang sebelum tanggal sesi tidak dihitung: kembali menunggu');
r = await nilai(kevin, 'BAN-02', 'proses', '2026-09-18');
prog = (await K.pembina.a.muatProgress()).data; papan = tugasSesi(dataSesi, users, prog);
ok(st(kevin, 2) === 'proses', 'ditandai sedang diuji = proses');
r = await nilai(kevin, 'BAN-02', 'lulus', '2026-09-01'); // lulus sebelum tanggal sesi
prog = (await K.pembina.a.muatProgress()).data; papan = tugasSesi(dataSesi, users, prog);
ok(st(kevin, 2) === 'sudahLulus', 'lulus sebelum tanggal sesi = sudah lulus sebelumnya');
r = await nilai(kevin, 'BAN-02', 'ulang', '2026-09-18');
prog = (await K.pembina.a.muatProgress()).data; papan = tugasSesi(dataSesi, users, prog);
ok(st(kevin, 2) === 'ulang', 'diulang pada tanggal sesi = perlu diulang');
rk = ringkasSesi(papan);
ok(rk.lulus >= 1 && rk.ulang >= 1 && rk.menunggu > 0 && rk.selesai === rk.lulus + rk.ulang && rk.total === rk.menunggu + rk.proses + rk.lulus + rk.ulang && rk.persen === Math.round((rk.selesai / rk.total) * 100), `ringkasan: ${JSON.stringify({ lulus: rk.lulus, ulang: rk.ulang, menunggu: rk.menunggu, proses: rk.proses, total: rk.total, persen: rk.persen })}`);
ok(Object.keys(STATUS_TUGAS).every((k) => k in rk), 'ringkasan memuat semua status tugas');

// Laksana terbuka bila Bantara selesai
await q(`delete from public.sku_progress where peserta_id = $1`, [ahmad]);
for (const b of daftarButirKatalog().filter((x) => x.tingkat === 'Bantara')) {
  for (const u of butirPeserta('Bantara', agamaAhmad).find((x) => x.id === b.id).unit) await q(`insert into public.sku_progress (peserta_id, sku_id, status, tanggal_uji, penguji_id, verifikasi, verifikasi_token) values ($1,$2,'lulus','2026-08-01',$3,$4,sigarda.token_acak())`, [ahmad, u.id, K.pembina.id, 'VRF-' + Math.random().toString(16).slice(2, 9).toUpperCase().padEnd(7, '0')]);
}
prog = (await K.pembina.a.muatProgress()).data; papan = tugasSesi(dataSesi, users, prog);
ok(papan.find((p) => p.peserta.id === ahmad).tugas.filter((t) => t.tingkat === 'Laksana').every((t) => t.status === 'menunggu'), 'Bantara selesai: butir Laksana terbuka (menunggu)');
ok(papan.find((p) => p.peserta.id === ahmad).tugas.filter((t) => t.tingkat === 'Bantara').every((t) => t.status === 'sudahLulus'), 'Bantara sudah lulus sebelum sesi');

console.log('\n--- sesiLogic: fungsi bantu ---');
ok(butirIdDariUnit('BAN-01-ISL-2') === 'BAN-01' && butirIdDariUnit('LAK-05') === 'LAK-05' && tingkatDariButirId('BAN-01') === 'Bantara' && tingkatDariButirId('LAK-05') === 'Laksana', 'butirIdDariUnit dan tingkatDariButirId');
const kat = daftarButirKatalog();
ok(kat.filter((b) => b.tingkat === 'Bantara').length > 20 && kat.filter((b) => b.tingkat === 'Laksana').length > 15 && kat.every((b) => b.id && b.no && b.teks) && new Set(kat.map((b) => b.id)).size === kat.length, `katalog butir: ${kat.length} butir`);
const idsKatalogDb = (await q(`select id from public.sku_butir order by id`)).map((x) => x.id);
ok(JSON.stringify(kat.map((b) => b.id).sort()) === JSON.stringify(idsKatalogDb), 'butir katalog aplikasi sama dengan tabel sku_butir di server');
const pengajuan = { p1: { 'BAN-02': { status: 'diajukan' }, 'BAN-01-ISL-1': { status: 'diajukan' }, 'BAN-03': { status: 'lulus' } }, p2: { 'LAK-04': { status: 'diajukan' }, 'BAN-02': { status: 'proses' } }, p3: { 'BAN-05': { status: 'diajukan' } } };
const dp = dariPengajuan(pengajuan, [{ id: 'p1', role: 'peserta' }, { id: 'p2', role: 'peserta' }, { id: 'p3', role: 'penguji' }]);
ok(dp.peserta.sort().join() === 'p1,p2' && dp.butir.sort().join() === 'BAN-01,BAN-02,LAK-04', 'dariPengajuan: hanya status diajukan, hanya peserta, butir tanpa duplikat');
const valid = { nama: 'S', tanggal: '2026-09-18', tempat: '', catatan: '', butir: ['BAN-01'], peserta: ['p'] };
ok(periksaSesi(valid) === '' && periksaSesi({ ...valid, nama: ' ' }) && periksaSesi({ ...valid, nama: 'x'.repeat(121) }) && periksaSesi({ ...valid, tanggal: '18-09-2026' }) && periksaSesi({ ...valid, tempat: 'x'.repeat(121) }) && periksaSesi({ ...valid, catatan: 'x'.repeat(501) }) && periksaSesi({ ...valid, butir: [] }) && periksaSesi({ ...valid, peserta: [] }) && periksaSesi({ ...valid, butir: Array(61).fill('a') }) && periksaSesi({ ...valid, peserta: Array(301).fill('a') }), 'periksaSesi: aturan sama dengan server');
const dl = [{ id: 1, tanggal: '2026-09-18', status: 'terjadwal', peserta: ['a'] }, { id: 2, tanggal: '2026-09-11', status: 'berlangsung', peserta: ['a'] }, { id: 3, tanggal: '2026-08-01', status: 'selesai', peserta: ['a'] }, { id: 4, tanggal: '2026-09-25', status: 'terjadwal', peserta: ['b'] }];
ok(sesiUntukPeserta(dl, 'a').map((s) => s.id).join() === '2,1', 'sesiUntukPeserta: milik peserta, tanpa yang selesai, terdekat dulu');

console.log('\n--- Sesi: ubah, hapus, dan hasil tetap ---');
r = await K.pembina.a.simpanSesi({ id: sid, nama: 'Ujian Bantara (revisi)', tanggal: '2026-09-19', tempat: 'Lapangan', catatan: '', status: 'berlangsung', butir: ['BAN-02'], peserta: [ahmad] });
ok(r.ok && r.data === sid, 'Pembina mengubah sesi');
const setelah = (await K.pembina.a.muatSesiUjian()).data.find((s) => s.id === sid);
ok(setelah.nama === 'Ujian Bantara (revisi)' && setelah.tanggal === '2026-09-19' && setelah.butir.join() === 'BAN-02' && setelah.peserta.join() === ahmad, 'butir dan peserta diganti seluruhnya');
const jumlahProg = (await q(`select count(*)::int n from public.sku_progress`))[0].n;
r = await K.pembina.a.hapusSesi(sid);
ok(r.ok && (await q(`select count(*)::int n from public.sku_progress`))[0].n === jumlahProg && (await q(`select count(*)::int n from public.sesi_ujian_peserta where sesi_id = $1`, [sid]))[0].n === 0, 'Pembina menghapus sesi: daftar ikut terhapus, hasil penilaian tetap');
r = await K.admin.a.muatSesiUjian();
ok(r.ok && r.data.length === 1, 'Admin membaca sisa sesi');

console.log('\n--- Database lama (tanpa tabel sesi): tidak merusak aplikasi ---');
const pgLama = new PGlite();
await siapkanPg(pgLama, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^\uFEFF/, '') });
await isiDataContoh(pgLama);
await pgLama.query('update public.profiles set wajib_ganti_pin = false');
await pgLama.query('drop table public.sesi_ujian_butir, public.sesi_ujian_peserta, public.sesi_ujian cascade');
const apiLama = buatApi(buatKlienFake(pgLama));
await apiLama.masuk('pembina', PIN_DEMO.pembina);
r = await apiLama.muatSesiUjian();
ok(r.ok && r.data.length === 0 && /migrasi|belum diperbarui|tidak/i.test(r.galat ?? ''), 'muatSesiUjian: kosong dengan pesan migrasi (tanpa galat keras): ' + (r.galat ?? '').slice(0, 90));
await pgLama.query('drop function public.sg_sertifikat_tingkat(uuid, text)');
r = await apiLama.sertifikatTingkat(bagas, 'Bantara');
ok(!r.ok && /Basis data belum diperbarui/.test(r.pesan), 'sertifikatTingkat pada DB lama: pesan migrasi yang jelas');
await pgLama.query('alter table public.sku_progress drop column verifikasi_token cascade');
const pLama = await apiLama.muatProgress();
ok(pLama.ok && Object.values(pLama.data).flatMap((e) => Object.values(e)).every((e) => e.token === null), 'progres pada DB lama: token null (Kartu SKU tercetak tanpa QR)');

console.log(`\nRINGKASAN: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
