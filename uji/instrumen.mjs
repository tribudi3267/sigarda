import { PGlite } from '@electric-sql/pglite';
import { existsSync, readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { hitungSkorInstrumen, gabungPengaturanInstrumen, PENGATURAN_INSTRUMEN_BAWAAN, periksaPengaturanInstrumen, periksaInstrumen } from '../src/lib/instrumenLogic.js';

const P = process.cwd().replace(/\\/g, '/');
const SKEMA = process.env.SKEMA_UJI || `${P}/supabase/skema.sql`;
// Isi instrumen (panduan penguji) bersifat rahasia dan TIDAK ada di repositori. Pengujian ini butuh berkas SQL pemuatnya:
//   ISI_INSTRUMEN=C:/jalur/isi-instrumen-draf.sql npm run uji -- instrumen
const ISI = process.env.ISI_INSTRUMEN || '';
if (!ISI || !existsSync(ISI)) { console.log('RINGKASAN INSTRUMEN: DILEWATI (isi ISI_INSTRUMEN dengan jalur SQL isi instrumen untuk menjalankannya)'); process.exit(0); }
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(SKEMA, 'utf8').replace(/^\uFEFF/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;

const klienDari = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const K = { dewan: await klienDari('dewan', PIN_DEMO.dewan), pembina: await klienDari('pembina', PIN_DEMO.pembina), admin: await klienDari('admin', PIN_DEMO.admin), peserta: await klienDari('10231', PIN_DEMO.penegak), bagasKlien: await klienDari('10007', PIN_DEMO.penegak) };
const rpc = async (who, nama, args) => { const { data, error } = await K[who].k.rpc(nama, args); return { data, err: error?.message ?? null }; };
const tulisLangsung = async (who, sql) => { try { await pg.transaction(async (tx) => { await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: K[who].id, role: 'authenticated' })]); await tx.query('set local role authenticated'); await tx.query(sql); }); return null; } catch (e) { return e.message; } };
const bagas = (await q(`select id from public.profiles where username = '10007'`))[0].id;
const idPembina = K.pembina.id;
await q('delete from public.sku_progress'); await q('delete from public.sku_riwayat');

console.log('--- Muat isi draf (SQL privat) ---');
await pg.exec(readFileSync(ISI, 'utf8'));
let n = (await q(`select (select count(*) from public.instrumen)::int i, (select count(*) from public.instrumen where status = 'draf')::int d, (select count(*) from public.instrumen_kriteria)::int k, (select count(*) from public.instrumen_panduan)::int p, (select count(*) from public.instrumen_penguji)::int g, (select count(*) from public.instrumen_kriteria where wajib)::int w, (select count(*) from public.sku_unit)::int u`))[0];
ok(n.i === 90 && n.u === 90 && n.d === 90, `90 instrumen, semuanya draf (${n.i}/${n.u})`);
ok(n.k === 367 && n.p === 367 && n.g === 90, `367 kriteria, 367 panduan, 90 instruksi (${n.k}/${n.p}/${n.g})`);
ok(n.w > 20, `kriteria wajib terbaca: ${n.w}`);
const sebelumIsi = JSON.stringify(await q('select * from public.instrumen_kriteria order by id'));
await pg.exec(readFileSync(ISI, 'utf8'));
ok(JSON.stringify(await q('select * from public.instrumen_kriteria order by id')) === sebelumIsi, 'memuat isi dua kali (mode baru): tidak ada yang berubah');

console.log('\n--- Hak baca (RLS) ---');
const hitungBaris = async (who, tabel) => { const r = await K[who].k.from(tabel).select('*'); return r.error ? `galat ${r.error.message}` : r.data.length; };
ok((await hitungBaris('peserta', 'instrumen')) === 0 && (await hitungBaris('peserta', 'instrumen_kriteria')) === 0, 'Penegak tidak melihat instrumen draf maupun kriterianya');
ok((await hitungBaris('dewan', 'instrumen')) === 90 && (await hitungBaris('dewan', 'instrumen_kriteria')) === 367, 'Dewan melihat semua instrumen dan kriteria (termasuk draf)');
ok((await hitungBaris('dewan', 'instrumen_panduan')) === 367 && (await hitungBaris('dewan', 'instrumen_penguji')) === 90, 'Dewan membaca panduan dan instruksi');
ok((await hitungBaris('peserta', 'instrumen_panduan')) === 0 && (await hitungBaris('peserta', 'instrumen_penguji')) === 0, 'Penegak TIDAK membaca panduan dan instruksi penguji');
ok((await hitungBaris('admin', 'instrumen_panduan')) === 367, 'Admin membaca panduan');
ok(/permission denied/i.test(await tulisLangsung('pembina', `insert into public.instrumen_kriteria (sku_id, urutan, jenis, teks) values ('BAN-02', 9, 'Lisan', 'x')`)), 'Pembina tidak boleh menulis kriteria langsung');
ok(/permission denied/i.test(await tulisLangsung('admin', `update public.instrumen set status = 'ditetapkan'`)), 'Admin tidak boleh mengubah status langsung');
ok(/permission denied/i.test(await tulisLangsung('pembina', `insert into public.sku_penilaian (peserta_id, sku_id, tanggal_uji, rincian, skor, wajib_ok, saran, hasil) values ('${bagas}', 'BAN-02', current_date, '[]', 90, true, 'lulus', 'lulus')`)), 'penilaian tidak boleh ditulis langsung');

console.log('\n--- Hak mengubah dan validasi editor ---');
const kriteriaBaru = (o = {}) => ({ jenis: 'Lisan', teks: 'Kriteria uji', bobot: 1, wajib: false, panduan: 'Panduan uji', ...o });
const simpan = (who, sku, o = {}) => rpc(who, 'sg_instrumen_simpan', { p_sku_id: sku, p_cara_uji: 'Cara uji', p_instruksi: 'Instruksi', p_kriteria: [kriteriaBaru()], p_status: 'draf', ...o });
for (const who of ['peserta', 'dewan']) { const r = await simpan(who, 'BAN-02'); ok(/Hanya Pembina dan Admin/.test(r.err ?? ''), `${who} tidak boleh menyimpan instrumen: ${r.err}`); }
let r = await rpc('dewan', 'sg_instrumen_status', { p_sku_ids: ['BAN-02'], p_status: 'ditetapkan' }); ok(/Hanya Pembina dan Admin/.test(r.err ?? ''), 'Dewan tidak boleh menetapkan');
r = await rpc('dewan', 'sg_instrumen_pengaturan_simpan', { p_nilai: PENGATURAN_INSTRUMEN_BAWAAN }); ok(/Hanya Pembina dan Admin/.test(r.err ?? ''), 'Dewan tidak boleh mengubah pengaturan');
const salah = [
  ['butir tak dikenal', { sku: 'XYZ-99' }, /Butir SKU tidak ditemukan/],
  ['status salah', { p_status: 'aktif' }, /draf atau ditetapkan/],
  ['cara uji panjang', { p_cara_uji: 'x'.repeat(301) }, /Cara uji maksimal 300/],
  ['instruksi panjang', { p_instruksi: 'x'.repeat(1501) }, /Instruksi penguji maksimal 1500/],
  ['kriteria bukan array', { p_kriteria: { a: 1 } }, /Daftar kriteria tidak sah/],
  ['16 kriteria', { p_kriteria: Array.from({ length: 16 }, () => kriteriaBaru()) }, /maksimal 15/],
  ['ditetapkan tanpa kriteria', { p_kriteria: [], p_status: 'ditetapkan' }, /minimal satu kriteria/],
  ['jenis salah', { p_kriteria: [kriteriaBaru({ jenis: 'Tulis' })] }, /pilih jenis penilaian/],
  ['teks kosong', { p_kriteria: [kriteriaBaru({ teks: '   ' })] }, /teks wajib diisi/],
  ['teks panjang', { p_kriteria: [kriteriaBaru({ teks: 'x'.repeat(401) })] }, /maksimal 400/],
  ['bobot 0', { p_kriteria: [kriteriaBaru({ bobot: 0 })] }, /bobot harus 1 sampai 5/],
  ['bobot 6', { p_kriteria: [kriteriaBaru({ bobot: 6 })] }, /bobot harus 1 sampai 5/],
  ['bobot desimal', { p_kriteria: [kriteriaBaru({ bobot: 1.5 })] }, /bobot harus 1 sampai 5/],
  ['wajib bukan boolean', { p_kriteria: [kriteriaBaru({ wajib: 'ya' })] }, /penanda wajib tidak sah/],
  ['panduan panjang', { p_kriteria: [kriteriaBaru({ panduan: 'x'.repeat(1501) })] }, /panduan maksimal 1500/],
  ['id kriteria asing', { p_kriteria: [kriteriaBaru({ id: 999999 })] }, /tidak ditemukan pada butir ini/],
];
for (const [nama, o, re] of salah) { const { sku, ...sisa } = o; r = await simpan('pembina', sku ?? 'BAN-02', sisa); ok(re.test(r.err ?? ''), `ditolak (${nama}): ${(r.err ?? 'DITERIMA').slice(0, 70)}`); }
ok((await q(`select count(*)::int n from public.instrumen_kriteria where sku_id = 'BAN-02'`))[0].n === 4, 'BAN-02 tidak berubah oleh masukan yang ditolak (tetap 4 kriteria)');

// simpan: pertahankan id, ubah urutan, hapus, tambah
let awal = await q(`select id, urutan, teks from public.instrumen_kriteria where sku_id = 'BAN-02' order by urutan`);
const [k1, k2, k3, k4] = awal;
r = await simpan('pembina', 'BAN-02', { p_kriteria: [
  kriteriaBaru({ id: k3.id, teks: 'Ketiga menjadi pertama', bobot: 2, wajib: true, panduan: 'P3 baru' }),
  kriteriaBaru({ id: k1.id, teks: k1.teks, panduan: 'P1' }),
  kriteriaBaru({ teks: 'Kriteria tambahan', jenis: 'Praktik', bobot: 3, panduan: 'P-baru' }),
], p_cara_uji: '  Cara   baru  ', p_instruksi: '  Instruksi baru  ' });
ok(!r.err, 'Pembina menyimpan instrumen: ' + r.err);
let sesudah = await q(`select id, urutan, teks, bobot, wajib, jenis from public.instrumen_kriteria where sku_id = 'BAN-02' order by urutan`);
ok(sesudah.length === 3 && sesudah[0].id === k3.id && sesudah[1].id === k1.id && sesudah[2].id !== k2.id && sesudah[2].id !== k4.id, 'id dipertahankan, urutan mengikuti larik, kriteria yang tidak dikirim dihapus');
ok(sesudah.map((x) => x.urutan).join() === '1,2,3' && sesudah[0].bobot === 2 && sesudah[0].wajib === true && sesudah[2].jenis === 'Praktik' && sesudah[2].bobot === 3, 'nilai kriteria tersimpan');
ok((await q(`select panduan from public.instrumen_panduan where kriteria_id = ${k3.id}`))[0].panduan === 'P3 baru', 'panduan ikut diperbarui');
ok((await q(`select count(*)::int n from public.instrumen_panduan where kriteria_id in (${k2.id}, ${k4.id})`))[0].n === 0, 'panduan kriteria yang dihapus ikut terhapus');
ok((await q(`select cara_uji c from public.instrumen where sku_id = 'BAN-02'`))[0].c === 'Cara   baru', 'cara uji dirapikan pinggirnya (isi tengah apa adanya)');
ok((await q(`select instruksi i from public.instrumen_penguji where sku_id = 'BAN-02'`))[0].i === 'Instruksi baru', 'instruksi tersimpan');
ok((await q(`select diubah_oleh from public.instrumen where sku_id = 'BAN-02'`))[0].diubah_oleh === idPembina, 'pengubah tercatat');
r = await simpan('admin', 'BAN-03', {}); ok(!r.err, 'Admin dapat menyimpan instrumen');
// butir tanpa baris instrumen (dihapus) dapat dibuat baru
await q(`delete from public.instrumen where sku_id = 'BAN-04'`);
r = await simpan('pembina', 'BAN-04', { p_status: 'ditetapkan' }); ok(!r.err && (await q(`select status from public.instrumen where sku_id = 'BAN-04'`))[0].status === 'ditetapkan', 'instrumen baru dapat dibuat lewat editor');

console.log('\n--- Status: tetapkan dan kembalikan ---');
r = await rpc('pembina', 'sg_instrumen_status', { p_sku_ids: [], p_status: 'ditetapkan' }); ok(/minimal satu butir/.test(r.err ?? ''), 'daftar kosong ditolak');
r = await rpc('pembina', 'sg_instrumen_status', { p_sku_ids: ['BAN-02', 'XYZ-99'], p_status: 'ditetapkan' }); ok(/belum memiliki instrumen/.test(r.err ?? ''), 'butir tanpa instrumen ditolak: ' + r.err);
await q(`insert into public.instrumen (sku_id) values ('BAN-06') on conflict do nothing`); await q(`delete from public.instrumen_kriteria where sku_id = 'BAN-06'`);
r = await rpc('pembina', 'sg_instrumen_status', { p_sku_ids: ['BAN-02', 'BAN-06'], p_status: 'ditetapkan' }); ok(/Belum memiliki kriteria: BAN-06/.test(r.err ?? ''), 'menetapkan instrumen tanpa kriteria ditolak: ' + r.err);
ok((await q(`select status from public.instrumen where sku_id = 'BAN-02'`))[0].status === 'draf', '...dan tidak ada yang berubah (semua atau tidak sama sekali)');
r = await rpc('pembina', 'sg_instrumen_status', { p_sku_ids: ['BAN-02', 'BAN-05', 'BAN-05'], p_status: 'ditetapkan' }); ok(!r.err, 'menetapkan dua butir (duplikat diabaikan)');
ok((await hitungBaris('peserta', 'instrumen')) === 3 && (await hitungBaris('peserta', 'instrumen_kriteria')) > 0, 'Penegak kini melihat instrumen yang ditetapkan (BAN-02, BAN-04, BAN-05) dan kriterianya');
ok((await hitungBaris('peserta', 'instrumen_panduan')) === 0, '...tetapi tetap tanpa panduan penguji');
const dilihat = await K.peserta.k.from('instrumen_kriteria').select('*'); ok(dilihat.data.every((x) => ['BAN-02', 'BAN-04', 'BAN-05'].includes(x.sku_id)), 'Penegak hanya melihat kriteria butir yang ditetapkan');

console.log('\n--- Pengaturan instrumen ---');
const set = (o = {}) => JSON.parse(JSON.stringify({ ...PENGATURAN_INSTRUMEN_BAWAAN, ...o }));
const pengSalah = [
  ['bukan objek', 'x', /tidak sah/], ['tanpa isian', { ambang: 75 }, /bilangan bulat/],
  ['pita tak berurutan', { ...set(), pita: { sangatBaik: 70, baik: 75, cukup: 60 } }, /berurutan/], ['ambang 0', { ...set(), ambang: 0 }, /Ambang lulus/], ['ambang 101', { ...set(), ambang: 101 }, /Ambang lulus/],
  ['nilai wajib 1', { ...set(), nilaiWajibMin: 1 }, /antara 2 dan 5/], ['nilai wajib 6', { ...set(), nilaiWajibMin: 6 }, /antara 2 dan 5/],
  ['gerbang bukan boolean', { ...set(), gerbangWajib: 'ya' }, /gerbangWajib/], ['desimal', { ...set(), ambang: 75.5 }, /bilangan bulat/],
];
for (const [nm, nilai, re] of pengSalah) { r = await rpc('pembina', 'sg_instrumen_pengaturan_simpan', { p_nilai: nilai }); ok(re.test(r.err ?? ''), `pengaturan ditolak (${nm}): ${(r.err ?? 'DITERIMA').slice(0, 60)}`); if (typeof nilai === 'object' && nilai.pita && typeof nilai.gerbangWajib === 'boolean') ok(periksaPengaturanInstrumen(nilai) !== '', '  klien juga menolak'); }
ok((await q(`select count(*)::int n from public.pengaturan where kunci = 'instrumen.pengaturan'`))[0].n === 0, 'tidak ada yang tersimpan dari yang ditolak');
ok(/tidak dikenal/i.test((await rpc('pembina', 'sg_pengaturan_simpan', { p_kunci: 'instrumen.pengaturan', p_nilai: 'x' })).err ?? ''), 'pengaturan instrumen tidak dapat ditulis lewat sg_pengaturan_simpan umum');

console.log('\n--- Penilaian dengan instrumen (server) ---');
const kriteriaDari = async (sku) => q(`select id, bobot, wajib, teks from public.instrumen_kriteria where sku_id = '${sku}' order by urutan`);
const rincian = (kri, nilaiFn) => kri.map((k, i) => ({ kriteria_id: Number(k.id), nilai: typeof nilaiFn === 'function' ? nilaiFn(k, i) : nilaiFn }));
const catat = (o = {}) => K.pembina.a.catatHasil({ pin: PIN_DEMO.pembina, pesertaId: bagas, skuId: 'BAN-05', hasil: 'lulus', tanggalUji: '2026-09-10', catatan: '', ...o });
let kr = await kriteriaDari('BAN-05'); console.log('   BAN-05 kriteria:', kr.map((k) => `${k.bobot}${k.wajib ? 'W' : ''}`).join(' '));

// jalur lama ditutup untuk butir yang ditetapkan
r = await catat({ hasil: 'lulus', nilai: 'Baik' });
ok(!r.ok && /dinilai dengan instrumen/.test(r.pesan), 'penilaian gaya lama pada butir berinstrumen ditolak: ' + r.pesan);
r = await catat({ hasil: 'ulang', catatan: 'coba lagi' });
ok(!r.ok && /dinilai dengan instrumen/.test(r.pesan), '...juga untuk "perlu diulang" gaya lama');
r = await catat({ hasil: 'proses' }); ok(r.ok, '"Mulai uji" tetap dapat dipakai pada butir berinstrumen');
r = await catat({ hasil: 'reset', catatan: 'salah pencet' }); ok(r.ok, '"Kembalikan" tetap dapat dipakai');
// butir yang belum ditetapkan tetap alur lama
r = await catat({ skuId: 'BAN-07', hasil: 'lulus', nilai: 'Baik' }); ok(r.ok, 'butir tanpa instrumen ditetapkan: alur lama tetap berjalan');
await q(`delete from public.sku_progress where sku_id = 'BAN-07'`); await q(`delete from public.sku_riwayat where sku_id = 'BAN-07'`);

// kasus skor
const pastikanBersih = async () => { await q(`delete from public.sku_progress where peserta_id = '${bagas}' and sku_id = 'BAN-05'`); };
r = await catat({ rincian: rincian(kr, 4) });
ok(r.ok && r.rubrik === true && r.hasil.skor === 80 && r.hasil.saran === 'lulus' && r.hasil.nilai === 'Baik', 'semua 4 -> skor 80, saran lulus, predikat Baik: ' + JSON.stringify(r.hasil ?? r.pesan));
let pr = (await q(`select status, nilai, verifikasi, tanggal_uji::text t, penguji_id from public.sku_progress where peserta_id = '${bagas}' and sku_id = 'BAN-05'`))[0];
ok(pr.status === 'lulus' && pr.nilai === 'Baik' && /^VRF-/.test(pr.verifikasi) && pr.t === '2026-09-10' && pr.penguji_id === idPembina, 'status lulus, predikat, kode verifikasi, dan penguji tercatat');
let pen = (await q(`select * from public.sku_penilaian where sku_id = 'BAN-05' order by id`)); const penTerakhir = pen[pen.length - 1];
ok(pen.length === 1 && penTerakhir.skor === 80 && penTerakhir.hasil === 'lulus' && penTerakhir.saran === 'lulus' && penTerakhir.diganti === false && penTerakhir.wajib_ok === true, 'catatan penilaian tersimpan');
ok(Array.isArray(penTerakhir.rincian) && penTerakhir.rincian.length === kr.length && penTerakhir.rincian.every((x) => x.nilai === 4 && x.teks && x.jenis && 'wajib' in x), 'rincian menyimpan salinan kriteria (teks, jenis, bobot, wajib, nilai)');
const riw = await q(`select teks from public.sku_riwayat where sku_id = 'BAN-05' and peserta_id = '${bagas}' order by id`);
ok(riw.some((x) => /Skor instrumen 80 dari 100 \(saran: lulus\)/.test(x.teks)) && riw.some((x) => /Dinyatakan lulus \(Baik\), kode VRF-/.test(x.teks)), 'riwayat memuat skor dan pernyataan lulus: ' + riw.map((x) => x.teks).slice(-2).join(' | '));
ok((await K.bagasKlien.k.from('sku_penilaian').select('*')).data.length === 1, 'Penegak membaca penilaian miliknya sendiri');
ok((await K.peserta.k.from('sku_penilaian').select('*')).data.length === 0, 'Penegak lain tidak melihat penilaian orang lain');

await pastikanBersih();
r = await catat({ rincian: rincian(kr, 3), hasil: 'ulang', catatan: 'Perlu latihan' });
ok(r.ok && r.hasil.skor === 60 && r.hasil.saran === 'ulang', 'semua 3 -> skor 60, saran perlu diulang');
ok((await q(`select status from public.sku_progress where peserta_id = '${bagas}' and sku_id = 'BAN-05'`))[0].status === 'ulang', 'status perlu diulang');
r = await catat({ rincian: rincian(kr, 3), hasil: 'lulus', catatan: '' });
ok(!r.ok && /berbeda dari saran \(skor 60, saran: perlu diulang\)/.test(r.pesan), 'lulus padahal saran ulang tanpa catatan ditolak: ' + r.pesan);
r = await catat({ rincian: rincian(kr, 3), hasil: 'lulus', catatan: 'Sudah terbukti di lapangan' });
ok(r.ok && r.hasil.diganti === true && r.hasil.nilai === 'Cukup', 'lulus dengan catatan diterima; predikat Cukup (skor 60)');
pen = await q(`select diganti, catatan, hasil, saran from public.sku_penilaian where sku_id = 'BAN-05' order by id desc limit 1`);
ok(pen[0].diganti === true && pen[0].catatan === 'Sudah terbukti di lapangan' && pen[0].saran === 'ulang' && pen[0].hasil === 'lulus', 'penggantian hasil tercatat (saran ulang, hasil lulus, catatan)');
ok((await q(`select teks from public.sku_riwayat where sku_id = 'BAN-05' order by id desc limit 1`))[0].teks.length > 0 && (await q(`select count(*)::int n from public.sku_riwayat where sku_id = 'BAN-05' and teks like '%berbeda dari saran%'`))[0].n === 1, 'riwayat mencatat bahwa hasil berbeda dari saran');
await pastikanBersih();
r = await catat({ rincian: rincian(kr, 5), hasil: 'ulang', catatan: '' });
ok(!r.ok && /berbeda dari saran/.test(r.pesan), 'ulang padahal saran lulus tanpa catatan ditolak');
r = await catat({ rincian: rincian(kr, 5), hasil: 'ulang', catatan: 'Ragu pada kejujuran bukti' });
ok(r.ok && r.hasil.skor === 100 && r.hasil.nilai === 'Sangat baik' && r.hasil.saran === 'lulus', 'semua 5 = 100, Sangat baik; hasil ulang dengan catatan diterima');
await pastikanBersih();

// kriteria wajib
const idxWajib = kr.findIndex((k) => k.wajib);
console.log('   indeks kriteria wajib pada BAN-05:', idxWajib);
r = await catat({ rincian: rincian(kr, (k, i) => (i === idxWajib ? 2 : 5)), hasil: 'ulang', catatan: 'Bukti kurang' });
ok(r.ok && r.hasil.wajib_ok === false && r.hasil.saran === 'ulang', `kriteria wajib bernilai 2 (di bawah 3): wajib tidak terpenuhi, saran ulang (skor ${r.hasil?.skor})`);
await pastikanBersih();
await rpc('pembina', 'sg_instrumen_pengaturan_simpan', { p_nilai: set({ nilaiWajibMin: 5 }) });
r = await catat({ rincian: rincian(kr, (k, i) => (i === idxWajib ? 4 : 5)), hasil: 'ulang', catatan: 'Bukti wajib belum sempurna' });
ok(r.ok && r.hasil.skor === 90 && r.hasil.wajib_ok === false && r.hasil.saran === 'ulang', `GERBANG: skor ${r.hasil?.skor} (>= 75) tetapi kriteria wajib 4 < 5: saran ulang`);
await pastikanBersih();
await rpc('pembina', 'sg_instrumen_pengaturan_simpan', { p_nilai: set({ nilaiWajibMin: 5, gerbangWajib: false }) });
r = await catat({ rincian: rincian(kr, (k, i) => (i === idxWajib ? 4 : 5)), hasil: 'lulus' });
ok(r.ok && r.hasil.wajib_ok === false && r.hasil.saran === 'lulus', 'gerbang dimatikan: skor 90 dengan wajib 4 < 5 menghasilkan saran lulus');
await pastikanBersih();
await q(`delete from public.pengaturan where kunci = 'instrumen.pengaturan'`);
ok((await q(`select teks from public.sku_riwayat where sku_id = 'BAN-05' and teks like '%syarat wajib belum terpenuhi%'`)).length >= 1, 'riwayat menyebut syarat wajib belum terpenuhi');
await pastikanBersih();
r = await catat({ rincian: rincian(kr, (k, i) => (i === idxWajib ? 3 : 5)), hasil: 'lulus' });
ok(r.ok && r.hasil.wajib_ok === true && r.hasil.saran === 'lulus', 'kriteria wajib bernilai 3: syarat terpenuhi');
await pastikanBersih();
await pastikanBersih();
await rpc('pembina', 'sg_instrumen_pengaturan_simpan', { p_nilai: set({ ambang: 90, pita: { sangatBaik: 95, baik: 85, cukup: 60 } }) });
r = await catat({ rincian: rincian(kr, 4), hasil: 'ulang', catatan: 'di bawah ambang 90' });
ok(r.ok && r.hasil.skor === 80 && r.hasil.saran === 'ulang', 'ambang 90: skor 80 -> saran ulang');
await pastikanBersih();
r = await catat({ rincian: rincian(kr, (k, i) => (i % 2 ? 5 : 4)), hasil: 'lulus', catatan: 'x' });
console.log('   skor campuran (ambang 90):', JSON.stringify(r.hasil ?? r.pesan));
await pastikanBersih();
await q(`delete from public.pengaturan where kunci = 'instrumen.pengaturan'`);

// rincian tidak sah
const cobaSalah = [
  ['bukan larik', 'x', /Nilai kriteria tidak sah/],
  ['kurang satu kriteria', rincian(kr.slice(0, -1), 4), /tidak lengkap/],
  ['kriteria ganda', [...rincian(kr, 4).slice(0, -1), rincian(kr, 4)[0]], /tidak lengkap/],
  ['kriteria asing', [...rincian(kr, 4).slice(0, -1), { kriteria_id: Number((await kriteriaDari('BAN-02'))[0].id), nilai: 4 }], /tidak lengkap/],
  ['nilai 0', rincian(kr, (k, i) => (i ? 4 : 0)), /1 sampai 5/],
  ['nilai 6', rincian(kr, (k, i) => (i ? 4 : 6)), /1 sampai 5/],
  ['nilai teks', rincian(kr, (k, i) => (i ? 4 : 'a')), /1 sampai 5/],
  ['nilai desimal', rincian(kr, (k, i) => (i ? 4 : 3.5)), /1 sampai 5/],
];
for (const [nm, rin, re] of cobaSalah) {
  r = await catat({ rincian: rin, hasil: 'lulus' });
  ok(!r.ok && re.test(r.pesan), `rincian ditolak (${nm}): ${(r.pesan ?? 'DITERIMA').slice(0, 70)}`);
}
ok((await q(`select count(*)::int n from public.sku_progress where peserta_id = '${bagas}' and sku_id = 'BAN-05'`))[0].n === 0, 'tidak ada progres tersimpan dari rincian yang ditolak');
r = await catat({ rincian: rincian(kr, 4), hasil: 'proses' }); ok(!r.ok || r.rubrik === true ? !r.ok : false, 'hasil "proses" dengan rincian ditolak: ' + r.pesan);
r = await catat({ rincian: rincian(kr, 4), hasil: 'lulus', tanggalUji: null }); ok(!r.ok && /Tanggal uji/.test(r.pesan), 'tanggal uji wajib');
r = await catat({ rincian: rincian(kr, 4), hasil: 'lulus', pin: '000000' }); ok(!r.ok && /PIN/.test(r.pesan), 'PIN salah menolak penilaian: ' + r.pesan);
ok((await q(`select count(*)::int n from public.sku_penilaian where sku_id = 'BAN-05'`))[0].n >= 5, 'catatan penilaian dari percobaan yang berhasil tersimpan');
r = await catat({ skuId: 'BAN-08', rincian: [], hasil: 'lulus' }); ok(!r.ok && /belum memakai instrumen/.test(r.pesan), 'butir tanpa instrumen ditetapkan menolak jalur instrumen: ' + r.pesan);

// Dewan boleh menilai; Admin tidak (aturan lama)
const dewanApi = K.dewan.a;
await pastikanBersih();
r = await dewanApi.catatHasil({ pin: PIN_DEMO.dewan, pesertaId: bagas, skuId: 'BAN-05', hasil: 'lulus', tanggalUji: '2026-09-11', catatan: '', rincian: rincian(kr, 4) });
ok(r.ok && r.rubrik, 'Dewan Ambalan dapat menilai dengan instrumen');
await pastikanBersih();
r = await K.admin.a.catatHasil({ pin: PIN_DEMO.admin, pesertaId: bagas, skuId: 'BAN-05', hasil: 'lulus', tanggalUji: '2026-09-11', catatan: '', rincian: rincian(kr, 4) });
ok(!r.ok, 'Admin tidak dapat mencatat hasil (aturan lama tetap): ' + r.pesan);

// Laksana memerlukan Bantara selesai
await q(`delete from public.sku_penilaian`);
const laksana = (await q(`select id from public.sku_unit where tingkat = 'Laksana' and agama is null order by id limit 1`))[0].id;
await q(`update public.instrumen set status = 'ditetapkan' where sku_id = '${laksana}'`);
const krL = await kriteriaDari(laksana);
r = await catat({ skuId: laksana, rincian: rincian(krL, 4), hasil: 'lulus' });
ok(!r.ok && /Bantara/.test(r.pesan), `butir Laksana (${laksana}) dengan instrumen tetap butuh Bantara selesai: ` + r.pesan);
ok((await q(`select count(*)::int n from public.sku_penilaian where sku_id = '${laksana}'`))[0].n === 0, '...dan tidak meninggalkan catatan penilaian setengah jadi');

console.log('\n--- Instrumen diubah setelah dipakai ---');
r = await catat({ rincian: rincian(kr, 4), hasil: 'lulus' });
ok(r.ok, 'penilaian sebelum perubahan');
const salinanLama = JSON.stringify((await q(`select rincian, skor from public.sku_penilaian where sku_id = 'BAN-05' order by id desc limit 1`))[0]);
const kriteriaSekarang = await q(`select id, teks from public.instrumen_kriteria where sku_id = 'BAN-05' order by urutan`);
r = await simpan('pembina', 'BAN-05', { p_status: 'ditetapkan', p_kriteria: [kriteriaBaru({ teks: 'Kriteria pengganti' })] });
ok(!r.err, 'instrumen BAN-05 diganti seluruhnya');
ok(JSON.stringify((await q(`select rincian, skor from public.sku_penilaian where sku_id = 'BAN-05' order by id desc limit 1`))[0]) === salinanLama, 'penilaian lama tidak berubah (rincian tersimpan sebagai salinan)');
await pastikanBersih();
r = await catat({ rincian: rincian(kr, 4), hasil: 'lulus' });
ok(!r.ok && /tidak lengkap atau tidak sesuai instrumen/.test(r.pesan), 'lembar lama (kriteria sudah diganti) ditolak dengan pesan yang menuntun: ' + r.pesan);
const krBaru = await kriteriaDari('BAN-05');
r = await catat({ rincian: rincian(krBaru, 5), hasil: 'lulus' });
ok(r.ok && r.hasil.skor === 100, 'lembar baru diterima');
await pastikanBersih();

console.log('\n--- Kesetaraan acak klien (JS) dan server (SQL) ---');
let selisih = 0, total = 0;
const acak = (() => { let s = 424242; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; })();
const semuaIdUnit = (await q(`select sku_id, count(*)::int n from public.instrumen_kriteria group by sku_id having count(*) >= 3 order by sku_id`)).map((x) => x.sku_id);
await q(`update public.instrumen set status = 'ditetapkan'`);
for (let putaran = 0; putaran < 60; putaran++) {
  let png = PENGATURAN_INSTRUMEN_BAWAAN;
  if (acak() < 0.7) {
    const c = 1 + Math.floor(acak() * 60), b = c + 1 + Math.floor(acak() * 25), a = Math.min(100, b + 1 + Math.floor(acak() * 12));
    if (a > b) png = { ambang: 1 + Math.floor(acak() * 100), pita: { sangatBaik: a, baik: b, cukup: c }, gerbangWajib: acak() < 0.5, nilaiWajibMin: 2 + Math.floor(acak() * 4) };
    const rr = await rpc('pembina', 'sg_instrumen_pengaturan_simpan', { p_nilai: png });
    if (rr.err) { console.log('   pengaturan acak ditolak:', rr.err, JSON.stringify(png)); png = PENGATURAN_INSTRUMEN_BAWAAN; await q(`delete from public.pengaturan where kunci = 'instrumen.pengaturan'`); }
  } else await q(`delete from public.pengaturan where kunci = 'instrumen.pengaturan'`);
  const sku = semuaIdUnit[Math.floor(acak() * semuaIdUnit.length)];
  const kri = (await q(`select id, bobot, wajib from public.instrumen_kriteria where sku_id = '${sku}' order by urutan`)).map((k) => ({ id: Number(k.id), bobot: k.bobot, wajib: k.wajib }));
  const nilai = {}; kri.forEach((k) => { nilai[k.id] = 1 + Math.floor(acak() * 5); });
  const js = hitungSkorInstrumen(kri, nilai, gabungPengaturanInstrumen(png));
  const sv = (await q('select * from sigarda.instrumen_hitung($1, $2::jsonb)', [sku, JSON.stringify(kri.map((k) => ({ kriteria_id: k.id, nilai: nilai[k.id] })))]))[0];
  total++;
  if (js.skor !== sv.o_skor || js.saran !== sv.o_saran || js.nilaiPredikat !== sv.o_nilai || js.wajibOk !== sv.o_wajib_ok) { selisih++; if (selisih <= 5) console.log('   BEDA', sku, JSON.stringify({ js, sv, png })); }
}
ok(selisih === 0, `klien dan server menghasilkan skor, saran, dan predikat yang sama pada ${total} kasus acak (selisih: ${selisih})`);
ok(hitungSkorInstrumen([{ id: 1, bobot: 1, wajib: false }, { id: 2, bobot: 2, wajib: false }, { id: 3, bobot: 1, wajib: false }, { id: 4, bobot: 1, wajib: false }], { 1: 5, 2: 4, 3: 4, 4: 3 }, PENGATURAN_INSTRUMEN_BAWAAN).skor === 80, 'contoh pada berkas Excel (bobot 1,2,1,1; nilai 5,4,4,3) = 80');
ok(hitungSkorInstrumen([{ id: 1, bobot: 1 }], { 1: 4 }, PENGATURAN_INSTRUMEN_BAWAAN).skor === 80 && hitungSkorInstrumen([{ id: 1, bobot: 1 }, { id: 2, bobot: 1 }, { id: 3, bobot: 1 }], { 1: 4, 2: 4, 3: 3 }, PENGATURAN_INSTRUMEN_BAWAAN).skor === 73, 'pembulatan: 11/3 x 20 = 73,33 -> 73');
ok(hitungSkorInstrumen([{ id: 1, bobot: 1 }, { id: 2, bobot: 1 }], { 1: 4 }, PENGATURAN_INSTRUMEN_BAWAAN).lengkap === false, 'nilai yang belum lengkap: skor kosong');
ok(periksaInstrumen({ caraUji: '', instruksi: '', kriteria: [], status: 'ditetapkan' }) !== '' && periksaInstrumen({ caraUji: '', instruksi: '', kriteria: [], status: 'draf' }) === '', 'pemeriksa editor klien: ditetapkan wajib punya kriteria, draf boleh kosong');

console.log(`\nRINGKASAN INSTRUMEN: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
