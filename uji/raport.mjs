import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import {
  gabungPengaturan, hitungBahan, hitungSkor, predikatDariSkor, persenKehadiran, susunBaris, tingkatBawaan, periksaPengaturan,
  PENGATURAN_RAPORT_BAWAAN, saranDeskripsi, bagiBulat,
} from '../src/lib/raportLogic.js';
import { butirPeserta } from '../src/lib/skuLogic.js';

const P = process.cwd().replace(/\\/g, '/');
const SKEMA = process.env.SKEMA_UJI || `${P}/supabase/skema.sql`;
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(SKEMA, 'utf8').replace(/^\uFEFF/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');

const klienDari = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const K = { dewan: await klienDari('dewan', PIN_DEMO.dewan), pembina: await klienDari('pembina', PIN_DEMO.pembina), admin: await klienDari('admin', PIN_DEMO.admin), peserta: await klienDari('10231', PIN_DEMO.penegak) };
const rpc = async (who, nama, args) => { const { data, error } = await K[who].k.rpc(nama, args); return { data, err: error?.message ?? null }; };
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const tulisLangsung = async (who, sql) => { try { await pg.transaction(async (tx) => { await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: K[who].id, role: 'authenticated' })]); await tx.query('set local role authenticated'); await tx.query(sql); }); return null; } catch (e) { return e.message; } };

const peserta = await q(`select id, username, agama, nama from public.profiles where role = 'peserta' order by username`);
console.log('peserta pada data contoh:', peserta.length, peserta.map((x) => `${x.username}:${x.agama}`).join(' '));
const bagas = peserta.find((x) => x.username === '10007')?.id ?? peserta[0].id;
const rizky = peserta.find((x) => x.username === '10231').id;
const idPembina = (await q(`select id from public.profiles where username = 'pembina'`))[0].id;

const TA = '2026/2027';
const args = (o = {}) => ({ p_peserta_id: bagas, p_tahun_ajaran: TA, p_semester: 'ganjil', p_tingkat: 'Bantara', p_sikap: 4, p_karakter: ['Mandiri'], p_skk: 2, p_predikat_akhir: null, p_catatan: '', p_deskripsi: 'Deskripsi uji.', p_final: false, ...o });
const bersihkan = async () => { await q('delete from public.raport'); await q('delete from public.absensi_hadir'); await q('delete from public.absensi_sesi'); await q('delete from public.sku_progress'); await q(`delete from public.pengaturan where kunci = 'raport.pengaturan'`); };
await bersihkan();

console.log('--- Hak akses ---');
let r = await K.peserta.k.from('raport').select('*');
ok(!r.error && r.data.length === 0, 'tabel raport kosong untuk Penegak (RLS)');
await rpc('pembina', 'sg_raport_simpan', args());
for (const who of ['peserta', 'dewan']) {
  r = await K[who].k.from('raport').select('*');
  ok(!r.error && r.data.length === 0, `${who} tidak melihat baris raport (RLS)`);
  r = await rpc(who, 'sg_raport_simpan', args());
  ok(/Hanya Pembina dan Admin/.test(r.err ?? ''), `${who} tidak boleh mengisi raport: ${r.err}`);
  r = await rpc(who, 'sg_raport_hapus', { p_peserta_id: bagas, p_tahun_ajaran: TA, p_semester: 'ganjil' });
  ok(/Hanya Pembina dan Admin/.test(r.err ?? ''), `${who} tidak boleh menghapus raport`);
  r = await rpc(who, 'sg_raport_pengaturan_simpan', { p_nilai: PENGATURAN_RAPORT_BAWAAN });
  ok(/Hanya Pembina dan Admin/.test(r.err ?? ''), `${who} tidak boleh mengubah pengaturan raport`);
}
for (const who of ['pembina', 'admin']) {
  r = await K[who].k.from('raport').select('*');
  ok(!r.error && r.data.length === 1, `${who} membaca raport`);
}
ok(/permission denied/i.test(await tulisLangsung('pembina', `insert into public.raport (peserta_id, tahun_ajaran, semester, tingkat, capaian_lulus, capaian_target, skor, predikat_hitung) values ('${bagas}', '2026/2027', 'genap', 'Bantara', 1, 12, 50, 'D')`)), 'Pembina tidak boleh menulis langsung ke raport');
ok(/permission denied/i.test(await tulisLangsung('admin', `update public.raport set skor = 100`)), 'Admin tidak boleh mengubah raport langsung');
ok(/Tidak dikenal|tidak dikenal/.test((await rpc('pembina', 'sg_pengaturan_simpan', { p_kunci: 'raport.pengaturan', p_nilai: { pita: {} } })).err ?? ''), 'pengaturan raport TIDAK dapat ditulis lewat sg_pengaturan_simpan umum');
ok(/permission denied/i.test(await tulisLangsung('pembina', `update public.pengaturan set nilai = '{}'`)), 'pengaturan tidak dapat ditulis langsung');
r = await K.peserta.k.from('pengaturan').select('*');
ok(!r.error, 'Penegak masih dapat membaca pengaturan (tidak diubah)');
// pengguna wajib ganti PIN ditolak
await q(`update public.profiles set wajib_ganti_pin = true where username = 'pembina'`);
r = await rpc('pembina', 'sg_raport_simpan', args());
ok(/Ganti PIN/.test(r.err ?? ''), 'Pembina yang belum ganti PIN ditolak: ' + r.err);
await q(`update public.profiles set wajib_ganti_pin = false where username = 'pembina'`);
await q('delete from public.raport');

console.log('\n--- Validasi pengaturan ---');
const set = (o = {}) => JSON.parse(JSON.stringify({ ...PENGATURAN_RAPORT_BAWAAN, ...o }));
const salah = [
  ['bukan objek', 'teks', /tidak sah/],
  ['tanpa bagian', { pita: PENGATURAN_RAPORT_BAWAAN.pita }, /bilangan bulat/],
  ['bobot tidak 100', { ...set(), bobot: { kehadiran: 40, capaian: 40, sikap: 30 } }, /Jumlah bobot harus 100 \(sekarang 110\)/],
  ['pita tidak berurutan', { ...set(), pita: { sangatBaik: 70, baik: 75, cukup: 60 } }, /berurutan/],
  ['pita sama', { ...set(), pita: { sangatBaik: 90, baik: 90, cukup: 60 } }, /berurutan/],
  ['sangat baik 101', { ...set(), pita: { sangatBaik: 101, baik: 75, cukup: 60 } }, /berurutan/],
  ['cukup 0', { ...set(), pita: { sangatBaik: 90, baik: 75, cukup: 0 } }, /berurutan/],
  ['target 0', { ...set(), target: { Bantara: 0, Laksana: 11 } }, /antara 1 dan 60/],
  ['target 61', { ...set(), target: { Bantara: 12, Laksana: 61 } }, /antara 1 dan 60/],
  ['bobot capaian 0', { ...set(), bobot: { kehadiran: 50, capaian: 0, sikap: 50 } }, /minimal 1/],
  ['desimal', { ...set(), pita: { sangatBaik: 90.5, baik: 75, cukup: 60 } }, /bilangan bulat/],
  ['negatif', { ...set(), bobot: { kehadiran: -10, capaian: 90, sikap: 20 } }, /bilangan bulat/],
  ['teks angka', { ...set(), target: { Bantara: 'dua', Laksana: 11 } }, /bilangan bulat/],
];
for (const [nama, nilai, re] of salah) {
  r = await rpc('pembina', 'sg_raport_pengaturan_simpan', { p_nilai: nilai });
  ok(re.test(r.err ?? ''), `pengaturan ditolak (${nama}): ${(r.err ?? 'DITERIMA').slice(0, 70)}`);
  // pemeriksa di sisi klien harus sepakat untuk kasus yang bisa dibentuk
  if (typeof nilai === 'object' && nilai.pita && nilai.bobot && nilai.target) ok(periksaPengaturan(nilai) !== '', `  klien juga menolak (${nama})`);
}
ok((await q(`select count(*)::int n from public.pengaturan where kunci = 'raport.pengaturan'`))[0].n === 0, 'tidak ada yang tersimpan dari yang ditolak');
r = await rpc('pembina', 'sg_raport_pengaturan_simpan', { p_nilai: { ...set(), ekstra: 'x', pita: { sangatBaik: 92, baik: 78, cukup: 62, lain: 1 } } });
ok(!r.err, 'pengaturan sah diterima (kunci tak dikenal dibuang)');
const tersimpan = (await q(`select nilai from public.pengaturan where kunci = 'raport.pengaturan'`))[0].nilai;
const kanon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));
ok(kanon(tersimpan) === kanon({ pita: { sangatBaik: 92, baik: 78, cukup: 62 }, bobot: { kehadiran: 40, capaian: 40, sikap: 20 }, target: { Bantara: 12, Laksana: 11 } }), 'nilai tersimpan dinormalkan: ' + JSON.stringify(tersimpan));
ok(periksaPengaturan(gabungPengaturan(tersimpan)) === '', 'klien menganggap pengaturan tersimpan sah');
// petaPengaturan mempertahankan objek
r = await K.pembina.a.muatPengaturan();
ok(r.ok && typeof r.data['raport.pengaturan'] === 'object' && r.data['raport.pengaturan'].pita.sangatBaik === 92, 'klien membaca pengaturan raport sebagai objek');
await q(`delete from public.pengaturan where kunci = 'raport.pengaturan'`);

console.log('\n--- Simpan raport: aturan masukan ---');
const salahSimpan = [
  ['tahun ajaran salah format', { p_tahun_ajaran: '2026-2027' }, /Tahun ajaran tidak valid/],
  ['tahun ajaran tidak berurutan', { p_tahun_ajaran: '2026/2028' }, /Tahun ajaran tidak valid/],
  ['tahun ajaran terlalu jauh', { p_tahun_ajaran: '1999/2000' }, /Tahun ajaran tidak valid/],
  ['semester salah', { p_semester: 'tahunan' }, /Semester harus/],
  ['tingkat salah', { p_tingkat: 'Garuda' }, /Tingkat SKU tidak dikenal/],
  ['sikap 0', { p_sikap: 0 }, /Nilai sikap harus antara 1 dan 5/],
  ['sikap 6', { p_sikap: 6 }, /Nilai sikap harus antara 1 dan 5/],
  ['skk negatif', { p_skk: -1 }, /SKK/],
  ['skk 100', { p_skk: 100 }, /SKK/],
  ['predikat akhir salah', { p_predikat_akhir: 'E' }, /Predikat akhir tidak dikenal/],
  ['karakter 7', { p_karakter: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }, /maksimal 6/],
  ['karakter panjang', { p_karakter: ['x'.repeat(31)] }, /maksimal 30/],
  ['catatan panjang', { p_catatan: 'x'.repeat(301), p_predikat_akhir: 'A' }, /Catatan predikat maksimal 300/],
  ['deskripsi panjang', { p_deskripsi: 'x'.repeat(1201) }, /Deskripsi capaian maksimal 1200/],
  ['final tanpa sikap', { p_final: true, p_sikap: null }, /sikap sebelum menandai final/],
  ['final tanpa deskripsi', { p_final: true, p_deskripsi: '   ' }, /deskripsi capaian sebelum menandai final/],
];
for (const [nama, o, re] of salahSimpan) {
  r = await rpc('pembina', 'sg_raport_simpan', args(o));
  ok(re.test(r.err ?? ''), `ditolak (${nama}): ${(r.err ?? 'DITERIMA').slice(0, 80)}`);
}
r = await rpc('pembina', 'sg_raport_simpan', args({ p_peserta_id: idPembina }));
ok(/Peserta tidak ditemukan/.test(r.err ?? ''), 'hanya Penegak yang dapat dinilai');
r = await rpc('pembina', 'sg_raport_simpan', args({ p_peserta_id: '00000000-0000-0000-0000-000000000000' }));
ok(/Peserta tidak ditemukan/.test(r.err ?? ''), 'peserta tak ada ditolak');
ok((await q('select count(*)::int n from public.raport'))[0].n === 0, 'tidak ada baris tersimpan dari masukan yang ditolak');

console.log('\n--- Contoh perhitungan dari rancangan: hadir 92%, capaian 10/12, sikap 4 -> 86 (Baik) ---');
// 25 sesi Jumat pada semester ganjil 2026: Bagas H x23, I, S -> 92%
const jumat = []; for (let d = new Date('2026-07-03T00:00:00Z'); d <= new Date('2026-12-31T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 7)) jumat.push(d.toISOString().slice(0, 10));
ok(jumat.length === 26, 'ada 26 hari Jumat pada semester ganjil 2026');
for (const t of jumat.slice(0, 25)) await q('insert into public.absensi_sesi (tanggal) values ($1)', [t]);
for (const [i, t] of jumat.slice(0, 25).entries()) await q('insert into public.absensi_hadir (tanggal, peserta_id, status) values ($1, $2, $3)', [t, bagas, i === 23 ? 'I' : i === 24 ? 'S' : 'H']);
const lulusKan = async (pid, tingkat, butirNo, tanggal) => q(`
  insert into public.sku_progress (peserta_id, sku_id, status, tanggal_uji, penguji_id, nilai)
  select p.id, u.id, 'lulus', $4::date, $5::uuid, 'Baik' from public.profiles p join public.sku_unit u on u.tingkat = $2 and u.butir_no = $3 and (u.agama is null or u.agama = p.agama) where p.id = $1
  on conflict (peserta_id, sku_id) do update set status = 'lulus', tanggal_uji = $4::date`, [pid, tingkat, butirNo, tanggal, idPembina]);
for (let no = 2; no <= 11; no++) await lulusKan(bagas, 'Bantara', no, '2026-08-15');
r = await rpc('pembina', 'sg_raport_simpan', args({ p_sikap: 4, p_karakter: ['Mandiri', 'Disiplin'] }));
ok(!r.err, 'simpan draf berhasil: ' + r.err);
let b = (await q('select * from public.raport'))[0];
ok(b.kehadiran_persen === 92 && b.hadir === 23 && b.pertemuan === 25, `kehadiran dihitung server: ${b.hadir}/${b.pertemuan} = ${b.kehadiran_persen}%`);
ok(b.capaian_lulus === 10 && b.capaian_target === 12, `capaian dihitung server: ${b.capaian_lulus}/${b.capaian_target}`);
ok(b.skor === 86 && b.predikat_hitung === 'B' && b.predikat_akhir === null && b.status === 'draf', `skor ${b.skor}, predikat ${b.predikat_hitung}, status ${b.status}`);
ok(JSON.stringify(b.karakter) === JSON.stringify(['Mandiri', 'Disiplin']) && b.diubah_oleh === idPembina, 'karakter dan pengubah tercatat');
// klien menghitung sama
{
  const apiP = K.pembina.a;
  const [u, pr, sesi, hd] = await Promise.all([apiP.muatProfil(), apiP.muatProgress(), apiP.muatSesiAbsen(), apiP.muatHadirRentang('2026-07-01', '2026-12-31')]);
  const absensi = { sesi: sesi.data, hadir: hd.data };
  const pes = u.data.find((x) => x.id === bagas);
  const bh = hitungBahan(pr.data, absensi, pes, 'Bantara', TA, 'ganjil');
  ok(bh.hadir === 23 && bh.dicatat === 25 && bh.kehadiran === 92 && bh.lulus === 10, 'klien: bahan hitung sama dengan server');
  ok(hitungSkor({ kehadiran: 92, lulus: 10, target: 12, sikap: 4 }, PENGATURAN_RAPORT_BAWAAN) === 86, 'klien: skor 86');
  const baris = susunBaris({ peserta: pes, progress: pr.data, absensi, tahunAjaran: TA, semester: 'ganjil', tersimpan: (await apiP.muatRaport(TA, 'ganjil')).data[bagas], pengaturan: PENGATURAN_RAPORT_BAWAAN });
  ok(baris.skor === 86 && baris.predikat === 'B' && baris.status === 'draf' && baris.tingkat === 'Bantara', 'klien: baris raport = 86 / B / draf / Bantara');
  ok(baris.butirTerakhir === 11 && !baris.seluruhLulus, 'klien: butir terakhir = 11');
  ok(/hingga butir ke-11/.test(baris.saran) && /mandiri dan disiplin/.test(baris.saran) && /Sangat Baik dalam keaktifan/.test(baris.saran), 'saran deskripsi: ' + baris.saran);
}

console.log('\n--- Predikat akhir berbeda, catatan, final, buka kembali ---');
r = await rpc('pembina', 'sg_raport_simpan', args({ p_predikat_akhir: 'A' }));
ok(/berbeda dari hasil hitung \(B\); isi catatan/.test(r.err ?? ''), 'mengubah predikat tanpa catatan ditolak: ' + r.err);
r = await rpc('pembina', 'sg_raport_simpan', args({ p_predikat_akhir: 'A', p_catatan: '  Aktif memimpin   kegiatan  ' }));
ok(!r.err, 'mengubah predikat dengan catatan diterima');
b = (await q('select * from public.raport'))[0];
ok(b.predikat_akhir === 'A' && b.predikat_hitung === 'B' && b.catatan_predikat === 'Aktif memimpin kegiatan', 'predikat akhir A tersimpan dengan catatan dirapikan; hasil hitung tetap B');
r = await rpc('pembina', 'sg_raport_simpan', args({ p_predikat_akhir: 'B', p_catatan: 'sisa catatan' }));
b = (await q('select * from public.raport'))[0];
ok(!r.err && b.predikat_akhir === null && b.catatan_predikat === '', 'predikat akhir sama dengan hasil hitung: kembali mengikuti hitungan dan catatan dikosongkan');
r = await rpc('admin', 'sg_raport_simpan', args({ p_final: true, p_karakter: ['Mandiri', 'mandiri', ' Disiplin ', 'MANDIRI'] }));
b = (await q('select * from public.raport'))[0];
ok(!r.err && b.status === 'final', 'Admin dapat menandai final');
ok(JSON.stringify(b.karakter) === JSON.stringify(['Mandiri', 'Disiplin']), 'karakter kembar dibuang (tanpa membedakan besar kecil pada pengulangan persis): ' + JSON.stringify(b.karakter));
ok((await q('select count(*)::int n from public.raport'))[0].n === 1, 'satu baris per peserta per semester (upsert)');
r = await rpc('pembina', 'sg_raport_simpan', args({ p_final: false }));
ok(!r.err && (await q('select status from public.raport'))[0].status === 'draf', 'final dapat dibuka kembali menjadi draf');
r = await rpc('pembina', 'sg_raport_simpan', args({ p_semester: 'genap' }));
ok(!r.err && (await q('select count(*)::int n from public.raport'))[0].n === 2, 'semester berbeda = baris berbeda');
b = (await q(`select * from public.raport where semester = 'genap'`))[0];
ok(b.kehadiran_persen === null && b.pertemuan === 0 && b.capaian_lulus === 0, 'semester tanpa absensi: kehadiran kosong, bukan 0%');
ok(b.skor === Math.round((40 * 0 + 20 * 80) / 60) && b.skor === 27, `kehadiran kosong: bobotnya dialihkan (skor ${b.skor} = (40*0+20*80)/60)`);
r = await rpc('pembina', 'sg_raport_hapus', { p_peserta_id: bagas, p_tahun_ajaran: TA, p_semester: 'genap' });
ok(!r.err && (await q('select count(*)::int n from public.raport'))[0].n === 1, 'hapus raport satu semester');

console.log('\n--- Batas semester dan butir agama ---');
await bersihkan();
for (const t of ['2026-07-03', '2026-12-25', '2027-01-01', '2027-06-25']) await q('insert into public.absensi_sesi (tanggal) values ($1)', [t]).catch(() => {});
// tanggal 2026-12-31 dan 2027-01-01 bukan Jumat: ganti dengan Jumat terdekat (2026-12-25 dan 2027-01-01 adalah Jumat)
const semua = await q('select tanggal::text t from public.absensi_sesi order by 1');
ok(semua.length === 4, 'empat sesi uji: ' + semua.map((x) => x.t).join(', '));
for (const t of ['2026-07-03', '2026-12-25']) await q(`insert into public.absensi_hadir (tanggal, peserta_id, status) values ($1, $2, 'H')`, [t, bagas]);
for (const t of ['2027-01-01', '2027-06-25']) await q(`insert into public.absensi_hadir (tanggal, peserta_id, status) values ($1, $2, 'A')`, [t, bagas]);
const bahan = async (ta, sem, tingkat = 'Bantara') => (await q('select * from sigarda.raport_hitung($1, $2, $3, $4)', [bagas, ta, sem, tingkat]))[0];
let h = await bahan(TA, 'ganjil');
ok(h.o_hadir === 2 && h.o_dicatat === 2, 'ganjil 2026 mencakup 3 Jul dan 25 Des: 2 hadir dari 2');
h = await bahan(TA, 'genap');
ok(h.o_hadir === 0 && h.o_dicatat === 2, 'genap 2027 mencakup 1 Jan dan 25 Jun: 0 hadir dari 2 (alpa)');
h = await bahan('2025/2026', 'genap');
ok(h.o_dicatat === 0, 'semester lain tidak ikut terhitung');
// batas tanggal uji: 1 Jul, 31 Des, 1 Jan, 30 Jun, serta di luar batas
const uji = [[2, '2026-06-30'], [3, '2026-07-01'], [4, '2026-12-31'], [5, '2027-01-01'], [6, '2027-06-30'], [7, '2027-07-01']];
for (const [no, tgl] of uji) await lulusKan(bagas, 'Bantara', no, tgl);
h = await bahan(TA, 'ganjil'); ok(h.o_lulus === 2, 'ganjil: butir 3 (1 Jul) dan 4 (31 Des) masuk, 30 Jun dan 1 Jan tidak: ' + h.o_lulus);
h = await bahan(TA, 'genap'); ok(h.o_lulus === 2, 'genap: butir 5 (1 Jan) dan 6 (30 Jun) masuk: ' + h.o_lulus);
// butir agama: semua sub-butir harus lulus; tanggalnya yang terakhir
const agamaBagas = (await q('select agama from public.profiles where id = $1', [bagas]))[0].agama;
const subUnit = (await q(`select id from public.sku_unit where tingkat = 'Bantara' and butir_no = 1 and (agama is null or agama = $1) order by id`, [agamaBagas])).map((x) => x.id);
console.log('   agama', agamaBagas, 'unit butir 1:', subUnit.length);
for (const [i, id] of subUnit.entries()) await q(`insert into public.sku_progress (peserta_id, sku_id, status, tanggal_uji) values ($1, $2, 'lulus', $3::date) on conflict (peserta_id, sku_id) do update set status = 'lulus', tanggal_uji = $3::date`, [bagas, id, i === 0 ? '2026-08-01' : '2026-08-20']);
h = await bahan(TA, 'ganjil'); ok(h.o_lulus === 3, 'butir agama yang seluruh sub-butirnya lulus dihitung satu kali: ' + h.o_lulus);
if (subUnit.length > 1) {
  await q(`update public.sku_progress set status = 'ulang' where peserta_id = $1 and sku_id = $2`, [bagas, subUnit[0]]);
  h = await bahan(TA, 'ganjil'); ok(h.o_lulus === 2, 'satu sub-butir belum lulus: butir agama tidak dihitung: ' + h.o_lulus);
  await q(`update public.sku_progress set status = 'lulus' where peserta_id = $1 and sku_id = $2`, [bagas, subUnit[0]]);
  await q(`update public.sku_progress set tanggal_uji = '2027-01-10' where peserta_id = $1 and sku_id = $2`, [bagas, subUnit[subUnit.length - 1]]);
  h = await bahan(TA, 'ganjil'); ok(h.o_lulus === 2, 'sub-butir terakhir lulus di semester berikutnya: butir dihitung pada semester itu, bukan semester ini: ' + h.o_lulus);
  h = await bahan(TA, 'genap'); ok(h.o_lulus === 3, 'butir agama masuk semester genap: ' + h.o_lulus);
}
h = await bahan(TA, 'ganjil', 'Laksana'); ok(h.o_lulus === 0 && h.o_target === 11, 'tingkat Laksana: 0 butir, target bawaan 11');
h = await bahan(TA, 'ganjil', 'Bantara'); ok(h.o_target === 12, 'target bawaan Bantara 12');
await rpc('pembina', 'sg_raport_pengaturan_simpan', { p_nilai: { ...set(), target: { Bantara: 20, Laksana: 15 } } });
h = await bahan(TA, 'ganjil', 'Laksana'); ok(h.o_target === 15, 'target mengikuti pengaturan (Laksana 15)');
await q(`delete from public.pengaturan where kunci = 'raport.pengaturan'`);

console.log('\n--- Pita nilai dan batas 74/75/89/90 ---');
const pred = async (skor) => (await q('select sigarda.raport_predikat($1) p', [skor]))[0].p;
const uji2 = [[100, 'A'], [90, 'A'], [89, 'B'], [75, 'B'], [74, 'C'], [60, 'C'], [59, 'D'], [0, 'D']];
for (const [s, e] of uji2) ok((await pred(s)) === e && predikatDariSkor(s, PENGATURAN_RAPORT_BAWAAN) === e, `skor ${s} -> ${e} (server dan klien)`);
ok((await pred(null)) === null && predikatDariSkor(null, PENGATURAN_RAPORT_BAWAAN) === null, 'skor kosong -> tanpa predikat');
await rpc('pembina', 'sg_raport_pengaturan_simpan', { p_nilai: { ...set(), pita: { sangatBaik: 85, baik: 70, cukup: 50 } } });
ok((await pred(85)) === 'A' && (await pred(84)) === 'B' && (await pred(70)) === 'B' && (await pred(69)) === 'C' && (await pred(49)) === 'D', 'pita kustom 85/70/50 dipakai server');
await q(`delete from public.pengaturan where kunci = 'raport.pengaturan'`);
ok(bagiBulat(29 * 100, 200) === 15 && (await q('select round(29 * 100.0 / 200)::int n'))[0].n === 15, 'setengah dibulatkan ke atas: 14,5 -> 15 (bukan artefak 14,4999 dari pecahan)');
ok(persenKehadiran(29, 200) === 15 && Math.round((29 / 200) * 100) === 14, 'pecahan JS memang meleset (Math.round -> 14); raport memakai bilangan bulat -> 15');

console.log('\n--- Kesetaraan acak klien (JS) dan server (SQL) ---');
let selisih = 0, total = 0;
const acak = (() => { let s = 12345; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; })();
const pilih = (a) => a[Math.floor(acak() * a.length)];
const tanggalAcak = (dari, sampai) => { const a = new Date(dari + 'T00:00:00Z').getTime(), z = new Date(sampai + 'T00:00:00Z').getTime(); return new Date(a + Math.floor(acak() * ((z - a) / 86400000 + 1)) * 86400000).toISOString().slice(0, 10); };
const jumatSemua = []; for (let d = new Date('2026-06-05T00:00:00Z'); d <= new Date('2027-07-09T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 7)) jumatSemua.push(d.toISOString().slice(0, 10));
const unitPeserta = {};
for (const x of peserta) unitPeserta[x.id] = await q(`select id, tingkat, butir_id, butir_no from public.sku_unit where agama is null or agama = $1`, [x.agama]);
const RONDE = 40;
for (let ronde = 0; ronde < RONDE; ronde++) {
  await bersihkan();
  // pengaturan acak yang sah (kadang bawaan)
  let png = PENGATURAN_RAPORT_BAWAAN;
  if (acak() < 0.7) {
    const c = 1 + Math.floor(acak() * 60), b2 = c + 1 + Math.floor(acak() * 20), a2 = Math.min(100, b2 + 1 + Math.floor(acak() * 15));
    if (a2 > b2) {
      const wc = 1 + Math.floor(acak() * 98), wh = Math.floor(acak() * (100 - wc)), ws = 100 - wc - wh;
      png = { pita: { sangatBaik: a2, baik: b2, cukup: c }, bobot: { kehadiran: wh, capaian: wc, sikap: ws }, target: { Bantara: 1 + Math.floor(acak() * 30), Laksana: 1 + Math.floor(acak() * 30) } };
      const rr = await rpc('pembina', 'sg_raport_pengaturan_simpan', { p_nilai: png });
      if (rr.err) { console.log('   pengaturan acak ditolak:', rr.err, JSON.stringify(png)); png = PENGATURAN_RAPORT_BAWAAN; }
    }
  }
  const sesiDipakai = jumatSemua.filter(() => acak() < 0.6);
  for (const t of sesiDipakai) await q('insert into public.absensi_sesi (tanggal) values ($1) on conflict do nothing', [t]);
  for (const x of peserta) {
    const kemungkinanHadir = acak();
    for (const t of sesiDipakai) { if (acak() < 0.85) await q('insert into public.absensi_hadir (tanggal, peserta_id, status) values ($1, $2, $3)', [t, x.id, acak() < kemungkinanHadir ? 'H' : pilih(['I', 'S', 'A'])]); }
    // progres: sebagian butir lulus dengan tanggal di sekitar batas semester, sebagian status lain
    const butirIds = [...new Set(unitPeserta[x.id].map((u) => u.butir_id))];
    for (const bid of butirIds) {
      if (acak() < 0.5) continue;
      const tgl = acak() < 0.25 ? pilih(['2026-06-30', '2026-07-01', '2026-12-31', '2027-01-01', '2027-06-30', '2027-07-01']) : tanggalAcak('2026-05-01', '2027-08-31');
      for (const u of unitPeserta[x.id].filter((u2) => u2.butir_id === bid)) {
        const st = acak() < 0.9 ? 'lulus' : pilih(['ulang', 'proses', 'diajukan', 'belum']);
        await q(`insert into public.sku_progress (peserta_id, sku_id, status, tanggal_uji) values ($1, $2, $3, $4::date)`, [x.id, u.id, st, st === 'lulus' ? (acak() < 0.7 ? tgl : tanggalAcak(tgl, '2027-08-31') > tgl ? tanggalAcak(tgl, '2027-08-31') : tgl) : null]);
      }
    }
  }
  const apiP = K.pembina.a;
  const [u, pr, sesi, hd] = await Promise.all([apiP.muatProfil(), apiP.muatProgress(), apiP.muatSesiAbsen(), apiP.muatHadirRentang('2026-06-01', '2027-08-01')]);
  const absensi = { sesi: sesi.data, hadir: hd.data };
  for (const x of peserta) {
    const pes = u.data.find((y) => y.id === x.id);
    for (const [ta, sem] of [['2026/2027', 'ganjil'], ['2026/2027', 'genap']]) {
      for (const tingkat of ['Bantara', 'Laksana']) {
        const sikap = acak() < 0.25 ? null : 1 + Math.floor(acak() * 5);
        const bh = hitungBahan(pr.data, absensi, pes, tingkat, ta, sem);
        const sv = (await q('select * from sigarda.raport_hitung($1, $2, $3, $4)', [x.id, ta, sem, tingkat]))[0];
        const skorSv = (await q('select sigarda.raport_skor($1, $2, $3, $4) s', [bh.kehadiran, sv.o_lulus, sv.o_target, sikap]))[0].s;
        const skorJs = hitungSkor({ kehadiran: bh.kehadiran, lulus: bh.lulus, target: gabungPengaturan(png).target[tingkat], sikap }, gabungPengaturan(png));
        const predSv = (await q('select sigarda.raport_predikat($1) p', [skorSv]))[0].p;
        const persenSv = sv.o_dicatat > 0 ? (await q('select round($1 * 100.0 / $2)::int p', [sv.o_hadir, sv.o_dicatat]))[0].p : null;
        total++;
        const sama = bh.hadir === sv.o_hadir && bh.dicatat === sv.o_dicatat && bh.lulus === sv.o_lulus && gabungPengaturan(png).target[tingkat] === sv.o_target
          && bh.kehadiran === persenSv && skorJs === skorSv && predikatDariSkor(skorJs, gabungPengaturan(png)) === predSv;
        if (!sama) { selisih++; if (selisih <= 5) console.log('   BEDA', x.username, ta, sem, tingkat, JSON.stringify({ js: { ...bh, skorJs }, sv: { ...sv, skorSv, predSv, persenSv } })); }
      }
    }
  }
  // jalur simpan sesungguhnya: yang tersimpan = hitungan klien
  const x = pilih(peserta); const tingkat = pilih(['Bantara', 'Laksana']); const sikap = 1 + Math.floor(acak() * 5);
  const rr = await rpc('pembina', 'sg_raport_simpan', args({ p_peserta_id: x.id, p_tingkat: tingkat, p_sikap: sikap, p_karakter: [], p_deskripsi: 'x' }));
  if (rr.err) { selisih++; console.log('   simpan gagal:', rr.err); continue; }
  const baris = (await K.pembina.a.muatRaport(TA, 'ganjil')).data[x.id];
  const pes = u.data.find((y) => y.id === x.id);
  const js = susunBaris({ peserta: pes, progress: pr.data, absensi, tahunAjaran: TA, semester: 'ganjil', tersimpan: baris, pengaturan: gabungPengaturan(png) });
  total++;
  if (js.skor !== baris.skor || js.predikatHitung !== baris.predikatHitung || js.kehadiran !== baris.kehadiranPersen || js.lulus !== baris.capaianLulus) { selisih++; console.log('   BEDA simpan', JSON.stringify({ js: { skor: js.skor, p: js.predikatHitung, k: js.kehadiran, l: js.lulus }, db: baris })); }
}
ok(selisih === 0, `klien dan server menghasilkan angka yang sama pada ${total} perbandingan acak (selisih: ${selisih})`);

console.log('\n--- Tingkat bawaan dan saran deskripsi ---');
{
  const apiP = K.pembina.a;
  await bersihkan();
  for (let no = 1; no <= 23; no++) await lulusKan(bagas, 'Bantara', no, '2026-03-10');
  const [u, pr] = await Promise.all([apiP.muatProfil(), apiP.muatProgress()]);
  const pes = u.data.find((y) => y.id === bagas);
  ok(tingkatBawaan(pr.data, pes, TA, 'ganjil') === 'Laksana', 'Bantara selesai sebelum semester -> bawaan Laksana');
  ok(tingkatBawaan(pr.data, pes, '2025/2026', 'genap') === 'Bantara', 'Bantara selesai di semester itu -> masih Bantara');
  const bh = hitungBahan(pr.data, { sesi: {}, hadir: {} }, pes, 'Bantara', '2025/2026', 'genap');
  ok(bh.seluruhLulus && bh.lulus === 23, 'seluruh butir Bantara lulus di semester genap 2025/2026');
  const png = PENGATURAN_RAPORT_BAWAAN;
  const s = (o) => saranDeskripsi({ tingkat: 'Bantara', kehadiran: 90, butirTerakhir: 5, seluruhLulus: false, sikap: 5, karakter: [], ...o }, png);
  ok(/Sangat Baik dalam keaktifan/.test(s({ kehadiran: 90 })) && /\bBaik dalam/.test(s({ kehadiran: 75 })) && /Cukup dalam/.test(s({ kehadiran: 60 })) && /perlu meningkatkan keaktifan/.test(s({ kehadiran: 59 })), 'kalimat keaktifan mengikuti pita');
  ok(/belum tercatat/.test(s({ kehadiran: null })), 'tanpa absensi: dinyatakan belum tercatat');
  ok(/seluruh butir pengujian SKU Penegak Bantara/.test(s({ seluruhLulus: true })) && /Sedang menjalani proses/.test(s({ butirTerakhir: 0 })), 'kalimat SKU: seluruh butir / sedang menjalani');
  ok(/sikap mandiri, disiplin, dan kerja sama yang sangat konsisten dalam aktivitas Ambalan\.$/.test(s({ karakter: ['Mandiri', 'Disiplin', 'Kerja sama'] })), 'daftar karakter tiga: ' + s({ karakter: ['Mandiri', 'Disiplin', 'Kerja sama'] }));
  ok(!/sikap/.test(s({ sikap: null })) && s({ sikap: null }).endsWith('.'), 'sikap belum diisi: kalimat sikap tidak dibuat');
  ok(/masih perlu dikembangkan/.test(s({ sikap: 2 })), 'sikap rendah tidak dikatakan konsisten');
}

console.log(`\nRINGKASAN RAPORT: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);

