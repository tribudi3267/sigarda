import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import * as S from '../src/lib/sidangLogic.js';
import { pesertaDenganPeran } from '../src/lib/skuLogic.js';

const P = process.cwd().replace(/\\/g, '/');
let g = 0, l = 0;
const ok = (c, m) => { if (c) { l++; console.log('ok   :', m); } else { g++; console.log('GAGAL:', m); } };

const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');

console.log('--- formatNomor (JS) sama dengan format_nomor (SQL) ---');
const kasus = [];
for (const f of ['{no3}/DK/{tahun}', '{no}/DK-AMB/{romawi}/{tahun}', 'BA-{tingkat}-{no3}/{bulan}/{tahun}', '{tahun}.{no}', '({no3}) {tingkat} {romawi}', '{no4}/DA/{romawi}/{tahun}', '{no2}-{no5}-{no6}.{bulan}/{tahun}', '{no}{no4}{no3}{no2}/{tahun}']) {
  for (const [no, tgl] of [[1, '2026-01-05'], [2, '2026-08-10'], [7, '2026-09-19'], [123, '2027-12-31'], [1000, '2030-06-30'], [12345, '2028-11-02']]) for (const t of ['Bantara', 'Laksana']) kasus.push([f, no, tgl, t]);
}
let beda = 0;
for (const [f, no, tgl, t] of kasus) {
  const sql = (await pg.query('select sigarda.format_nomor($1, $2, $3::date, $4) as h', [f, no, tgl, t])).rows[0].h;
  const js = S.formatNomor(f, { no, tanggal: tgl, tingkat: t });
  if (sql !== js) { beda++; console.log('   beda:', f, no, tgl, t, '| sql =', sql, '| js =', js); }
}
ok(beda === 0, `${kasus.length} kombinasi format/nomor/tanggal/tingkat identik`);
ok(S.formatNomor('{no3}/DK/{tahun}', { no: 5, tanggal: '2026-09-19', tingkat: 'Bantara' }) === '005/DK/2026', 'contoh: 005/DK/2026');
ok(S.formatNomor('{no}/{romawi}/{tahun}', { no: 5, tanggal: '2026-09-19', tingkat: 'Bantara' }) === '5/IX/2026', 'bulan Romawi: 5/IX/2026');

console.log('\n--- periksaFormatNomor (JS) sama keputusannya dengan server ---');
const api = buatApi(buatKlienFake(pg));
await api.masuk('dewan', PIN_DEMO.dewan);
const uji = [
  '{no3}/DK/{tahun}', '{no}/DK-AMB/{romawi}/{tahun}', '{no3}/{tahun}', 'DK {no3} tahun {tahun}', '  {no3}   /DK/  {tahun} ',
  '{no4}/DA/{romawi}/{tahun}', '{no2}-{tahun}', '{no6}.{tahun}', '{no}/{no4}/{tahun}', '{no7}/{tahun}', '{NO4}/{tahun}', '[no4]/{tahun}', '<no4>/{tahun}', '0002/DA/VIII/{tahun}', '{no4}/DA/VIII', '{no4}:DA/{tahun}', '{no4}/DA/{romawi}/{tahun}/{tingkat}/{bulan}', '', '   ', '{no3}/DK', 'DK/{tahun}', '{no3}/{xx}/{tahun}', '{no3}/{tahun', '{no3}}/{tahun}', '{{no3}/{tahun}', '{no3}/DK/{tahun}<',
  '{no3}/DK/{tahun};', '{no3}/' + 'a'.repeat(80) + '/{tahun}', 'a'.repeat(60) + '{no3}{tahun}', '{No3}/{tahun}', '{no3}/DK/{tahun}/{tingkat}/{bulan}',
];
let selisih = 0;
for (const f of uji) {
  const js = S.periksaFormatNomor(f) === '';
  const { ok: sah } = await api.simpanPengaturan('sidang.format_nomor', f);
  if (js !== !!sah) { selisih++; console.log(`   beda: "${f.slice(0, 40)}" js=${js} server=${sah}`); }
}
ok(selisih === 0, `${uji.length} format: keputusan sah/tidak sah sama di klien dan server`);
await api.simpanPengaturan('sidang.format_nomor', '{no3}/DK/{tahun}');

console.log('\n--- Pengaturan bawaan ---');
let p = S.pengaturanSidang({});
ok(p.format === S.FORMAT_NOMOR_BAWAAN && p.namaKetua === '' && p.sebutanKetua === S.SEBUTAN_KETUA_BAWAAN, 'bawaan dipakai bila belum diatur');
p = S.pengaturanSidang({ 'sidang.format_nomor': '{no}/X/{tahun}', 'sidang.nama_ketua': 'Andi', 'sidang.sebutan_ketua': 'Pradana' });
ok(p.format === '{no}/X/{tahun}' && p.namaKetua === 'Andi' && p.sebutanKetua === 'Pradana', 'nilai tersimpan dipakai');
p = S.pengaturanSidang({ 'sidang.sebutan_ketua': '', 'sidang.format_nomor': '' });
ok(p.format === S.FORMAT_NOMOR_BAWAAN && p.sebutanKetua === S.SEBUTAN_KETUA_BAWAAN, 'nilai kosong kembali ke bawaan');

console.log('\n--- Data dari server -> bentuk aplikasi (API) ---');
const users = (await api.muatProfil()).data;
const progress = (await api.muatProgress()).data;
const daftar = pesertaDenganPeran(progress, users);
const bagas = users.find((u) => u.username === '10007');
const lulusKan = (pid, tingkat) => pg.query(`
  insert into public.sku_progress (peserta_id, sku_id, status, tanggal_uji, penguji_id, nilai, verifikasi)
  select p.id, u.id, 'lulus', date '2026-09-01', (select id from public.profiles where username = 'pembina'), 'Baik', 'VRF-UJI'
  from public.profiles p join public.sku_unit u on u.tingkat = $2 and (u.agama is null or u.agama = p.agama) where p.id = $1
  on conflict (peserta_id, sku_id) do update set status = 'lulus', tanggal_uji = date '2026-09-01'`, [pid, tingkat]);
await lulusKan(bagas.id, 'Bantara');
const progress2 = (await api.muatProgress()).data;
const daftar2 = pesertaDenganPeran(progress2, users);
const kes = S.lembarKesiapan(progress2, users, bagas, 'Bantara');
ok(kes.selesai && kes.lulus === kes.total && kes.belum.length === 0 && kes.persen === 100, `lembar kesiapan: selesai (${kes.lulus}/${kes.total})`);
ok(kes.butir.length === 23 && kes.butir[0].unit.length > 1 && kes.butir[0].agama === bagas.agama, `butir 1 (agama ${bagas.agama}) diuraikan ${kes.butir[0].unit.length} sub-butir`);
ok(kes.tanggalLulus === '2026-09-01' && kes.butir[3].unit[0].penguji === 'Pembina Contoh' || typeof kes.butir[3].unit[0].penguji === 'string', 'tanggal lulus dan nama penguji terisi');
const rizky = users.find((u) => u.username === '10231');
await pg.query(`delete from public.sku_progress where peserta_id = '${rizky.id}'`);
const progress3 = (await api.muatProgress()).data;
const kes2 = S.lembarKesiapan(progress3, users, rizky, 'Bantara');
ok(!kes2.selesai && kes2.lulus === 0 && kes2.belum.length === kes2.totalUnit && kes2.tanggalLulus === null, 'peserta belum mulai: belum selesai, semua unit belum lulus');
ok(S.labelButirBelum(kes2.belum.slice(0, 3)) === 'Butir 1a, Butir 1b, Butir 1c', 'label butir belum: ' + S.labelButirBelum(kes2.belum.slice(0, 3)));
ok(S.labelButirBelum(['BAN-05', 'BAN-09', 'BAN-05']) === 'Butir 5, Butir 9', 'label butir biasa, tanpa duplikat');

console.log('\n--- Antrian sidang ---');
const dewan = buatKlienFake(pg); const apiD = buatApi(dewan); await apiD.masuk('dewan', PIN_DEMO.dewan);
const peserta3 = pesertaDenganPeran(progress3, users);
let sidang = (await apiD.muatSidang()).data;
ok(Array.isArray(sidang) && sidang.length === 0, 'awal: belum ada catatan sidang');
let antri = S.antrianSidang(progress3, peserta3, sidang);
ok(antri.some((a) => a.peserta.id === bagas.id && a.tingkat === 'Bantara') && !antri.some((a) => a.peserta.id === rizky.id), 'Bagas (100%) ada di antrian, Rizky (belum) tidak');
ok(antri.every((a, i) => i === 0 || String(antri[i - 1].tanggalLulus) <= String(a.tanggalLulus)), 'urut dari yang paling dulu lulus');
let r = await apiD.simpanSidang({ pesertaId: bagas.id, tingkat: 'Bantara', tanggal: '2026-09-15', keputusan: 'tunda', magang: 'tidak', tugasAdat: 'tidak', tugasAdatKet: '', catatan: 'Menunggu tugas adat' });
ok(r.ok, 'menunda peserta yang sudah 100% (dengan alasan)');
sidang = (await apiD.muatSidang()).data;
antri = S.antrianSidang(progress3, peserta3, sidang);
const barisBagas = antri.find((a) => a.peserta.id === bagas.id && a.tingkat === 'Bantara');
ok(barisBagas && barisBagas.ditunda?.tanggal === '2026-09-15' && barisBagas.ditunda.keputusan === 'tunda', 'yang ditunda tetap di antrian dengan keterangan tanggal penundaan');
r = await apiD.simpanSidang({ pesertaId: bagas.id, tingkat: 'Bantara', tanggal: '2026-09-16', keputusan: 'layak', magang: 'memenuhi', tugasAdat: 'lulus', tugasAdatKet: 'Makalah', catatan: '', nta: '11.03.10.701.00777' });
ok(r.ok && Number.isInteger(r.data), 'menyatakan Layak lewat API: id ' + r.data);
sidang = (await apiD.muatSidang()).data;
const rec = sidang.find((s) => s.id === r.data);
ok(rec && rec.nomorBa === '002/DK/2026' && rec.nomorUrut === 2 && rec.tugasAdatKet === 'Makalah' && rec.nta === '11.03.10.701.00777' && rec.capaianLulus === rec.capaianTotal, 'bentuk catatan (petaSidang): ' + rec?.nomorBa);
ok(Array.isArray(rec.butirBelum) && rec.butirBelum.length === 0 && typeof rec.tanggal === 'string' && rec.tanggal === '2026-09-16', 'tanggal berupa YYYY-MM-DD, butirBelum larik');
antri = S.antrianSidang(progress3, peserta3, sidang);
ok(!antri.some((a) => a.peserta.id === bagas.id && a.tingkat === 'Bantara'), 'setelah Layak, keluar dari antrian');
ok(S.sudahLayak(sidang, bagas.id, 'Bantara') && !S.sudahLayak(sidang, bagas.id, 'Laksana'), 'sudahLayak per tingkat');
const urutServer = (await apiD.muatSidangUrut()).data;
ok(JSON.stringify(urutServer) === '{"2026":2}' && S.nomorUrutBerikutnya(urutServer, 2026) === 3 && S.nomorUrutBerikutnya(urutServer, 2027) === 1 && S.nomorUrutBerikutnya({}, 2026) === 1, 'nomor urut berikutnya dari penghitung server: ' + JSON.stringify(urutServer) + ' -> 3 untuk 2026, 1 untuk 2027');
const prof = (await apiD.muatProfil()).data.find((u) => u.id === bagas.id);
ok(prof.nta === '11.03.10.701.00777', 'NTA terbawa ke profil (petaProfil)');
r = await apiD.hapusSidang(rec.id);
ok(!r.ok && /Hanya Pembina dan Admin/.test(r.pesan), 'Dewan tidak dapat menghapus (pesan galat terbaca)');
const peng = (await apiD.muatPengaturan()).data;
ok(peng['sidang.format_nomor'] === '{no3}/DK/{tahun}' && typeof peng['sidang.format_nomor'] === 'string', 'pengaturan dibaca sebagai teks: ' + JSON.stringify(peng));

console.log('\n--- Pembuat format (bangunFormat / uraiFormat) ---');
{
  const digits = [1, 2, 3, 4, 5, 6], kodes = ['', 'DA', 'DK/AMB', 'BA-1', 'Ambalan Gajah Mada', 'A.B'], buls = ['tidak', 'romawi', 'angka'], sep = ['/', '-', '.'];
  let n = 0, salahBalik = 0, tidakSah = 0, beda = 0;
  for (const digit of digits) for (const kode of kodes) for (const bulan of buls) for (const pemisah of sep) for (const tingkat of [false, true]) {
    const pil = { digit, kode, tingkat, bulan, pemisah };
    const f = S.bangunFormat(pil);
    n++;
    if (S.periksaFormatNomor(f) !== '') { tidakSah++; console.log('   format hasil pembuat tidak sah:', f, '|', S.periksaFormatNomor(f)); }
    const balik = S.uraiFormat(f);
    if (!balik || S.bangunFormat(balik) !== f) { salahBalik++; if (salahBalik <= 4) console.log('   gagal urai:', f, JSON.stringify(balik)); }
  }
  ok(tidakSah === 0, `${n} kombinasi pilihan: semua menghasilkan format yang sah`);
  ok(salahBalik === 0, `${n} kombinasi pilihan: dibangun lalu diurai kembali menjadi format yang sama`);
  ok(S.bangunFormat({ digit: 4, kode: 'DA', bulan: 'romawi', pemisah: '/' }) === '{no4}/DA/{romawi}/{tahun}', 'contoh Anda: 4 angka, kode DA, bulan Romawi -> {no4}/DA/{romawi}/{tahun}');
  ok(S.formatNomor(S.bangunFormat({ digit: 4, kode: 'DA', bulan: 'romawi', pemisah: '/' }), { no: 2, tanggal: '2026-08-10', tingkat: 'Bantara' }) === '0002/DA/VIII/2026', 'hasil akhir 0002/DA/VIII/2026');
  ok(S.bangunFormat({ digit: 1, kode: '', bulan: 'tidak', pemisah: '-' }) === '{no}-{tahun}', 'tanpa kode surat dan tanpa bulan: {no}-{tahun}');
  ok(S.bangunFormat({ digit: 3, kode: 'D{x}K', tingkat: true, bulan: 'angka', pemisah: '.' }) === '{no3}.DxK.{tingkat}.{bulan}.{tahun}', 'kurung kurawal di kode surat dibuang; tingkat dan bulan angka');
  ok(S.uraiFormat('{no3}/DK/{tahun}')?.kode === 'DK' && S.uraiFormat('{no3}/DK/{tahun}')?.digit === 3, 'format bawaan dikenali sebagai pilihan');
  ok(S.uraiFormat('{tahun}.{no}') === null && S.uraiFormat('DK/{no4}/{tahun}') === null && S.uraiFormat('({no3}) {tingkat} {romawi}/{tahun}') === null, 'format bebas yang tidak baku dibuka sebagai teks (uraiFormat = null)');
}

console.log('\n--- Pesan galat menuntun ---');
{
  const pesan = (f) => S.periksaFormatNomor(f);
  ok(/kode nomor urut.*\{no4\}/.test(pesan('0002/DA/VIII/{tahun}')), 'nomor urut tertulis manual: disarankan {no4}: ' + pesan('0002/DA/VIII/{tahun}'));
  ok(/huruf kecil: \{no4\}/.test(pesan('{NO4}/{tahun}')), 'huruf besar: diberi tahu harus huruf kecil: ' + pesan('{NO4}/{tahun}'));
  ok(/kurung kurawal/.test(pesan('[no4]/{tahun}')) && /kurung kurawal/.test(pesan('<no4>/{tahun}')), 'kurung siku atau sudut: diarahkan ke kurung kurawal');
  ok(/tidak dikenal.*\{no6\}/.test(pesan('{no7}/{tahun}')), 'kode tidak dikenal: daftar kode yang tersedia ikut disebut');
  ok(/Karakter ":" tidak boleh/.test(pesan('{no4}:DA/{tahun}')), 'karakter terlarang disebut jelas: ' + pesan('{no4}:DA/{tahun}'));
  ok(/\{tahun\}/.test(pesan('{no4}/DA/VIII')), 'tahun belum ada: ' + pesan('{no4}/DA/VIII'));
  ok(pesan('{no4}/DA/{romawi}/{tahun}') === '', 'format contoh Anda dinyatakan sah');
}

console.log('\n--- Capaian di server = hitungProgres di aplikasi (semua peserta contoh, dua tingkat) ---');
import { hitungProgres } from '../src/lib/skuLogic.js';
// satu butir agama lulus sebagian: Rizky (Islam) butir 1 baru 5 dari 6 sub-butir
await pg.query(`delete from public.sku_progress where peserta_id = '${rizky.id}'`);
await pg.query(`insert into public.sku_progress (peserta_id, sku_id, status, tanggal_uji, verifikasi)
  select '${rizky.id}', u.id, 'lulus', date '2026-09-01', 'VRF-UJI' from public.sku_unit u where u.tingkat = 'Bantara' and u.id <> 'BAN-01-ISL-6' and (u.agama is null or u.agama = 'Islam')`);
const progressAkhir = (await apiD.muatProgress()).data;
const semuaPeserta = pesertaDenganPeran(progressAkhir, users);
let beda2 = 0, n2 = 0;
for (const pes of semuaPeserta) {
  for (const tingkat of ['Bantara', 'Laksana']) {
    const h = hitungProgres(progressAkhir, pes, tingkat);
    const res = await apiD.simpanSidang({ pesertaId: pes.id, tingkat, tanggal: '2026-09-10', keputusan: 'tunda', magang: 'tidak', tugasAdat: 'tidak', catatan: 'uji kesetaraan', nomorManual: `UJI-${n2}-${pes.nis}` });
    if (!res.ok) { beda2++; console.log('   gagal simpan', pes.nama, tingkat, res.pesan); continue; }
    const baris = (await pg.query(`select capaian_lulus l, capaian_total t from public.sidang_dk where id = ${res.data}`)).rows[0];
    n2++;
    if (baris.l !== h.lulus || baris.t !== h.total) { beda2++; console.log(`   beda ${pes.nama} ${tingkat}: server ${baris.l}/${baris.t} app ${h.lulus}/${h.total}`); }
  }
}
ok(beda2 === 0 && n2 === semuaPeserta.length * 2, `${n2} kombinasi peserta+tingkat: capaian server identik dengan aplikasi`);
const hRizky = hitungProgres(progressAkhir, rizky, 'Bantara');
ok(hRizky.lulus === 22 && hRizky.total === 23, `butir agama lulus sebagian tidak dihitung lulus (${hRizky.lulus}/${hRizky.total})`);
const resRizky = await apiD.simpanSidang({ pesertaId: rizky.id, tingkat: 'Bantara', tanggal: '2026-09-11', keputusan: 'layak', magang: 'memenuhi', tugasAdat: 'lulus' });
ok(!resRizky.ok && /baru 22 dari 23 butir/.test(resRizky.pesan), 'Layak diblokir dengan pesan per butir: ' + resRizky.pesan);
const tunda2 = (await pg.query(`select butir_belum from public.sidang_dk where nomor_ba like 'UJI-%-${rizky.nis}' and tingkat = 'Bantara'`)).rows[0];
ok(JSON.stringify(tunda2.butir_belum) === '["BAN-01-ISL-6"]' && S.labelButirBelum(tunda2.butir_belum) === 'Butir 1f', 'butir belum = satu sub-butir: ' + S.labelButirBelum(tunda2.butir_belum));

console.log(`\nRINGKASAN SIDANG-LOGIKA: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
