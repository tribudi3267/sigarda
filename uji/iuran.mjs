import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';

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
const anon = buatKlienFake(pg);
const rpc = async (k, nama, args) => { const { data, error } = await k.rpc(nama, args); return { data, err: error?.message ?? null }; };
const baca = async (k, tabel) => { const { data, error } = await k.from(tabel).select('*'); return { n: data?.length ?? 0, data: data ?? [], err: error?.message ?? null }; };
const uid = async (u) => (await q(`select id from public.profiles where username = $1`, [u]))[0].id;
const ahmad = await uid('10231'), kevin = await uid('10234');
const peserta = await q(`select id, username, nama, kelas, sangga from public.profiles where role = 'peserta' order by username`);
const calonLaksana = await q(`select id, username from public.profiles where role = 'peserta' and sigarda.tingkat_selesai(id, 'Bantara') and not sigarda.tingkat_selesai(id, 'Laksana') order by username`);
const calonGaruda = await q(`select id, username from public.profiles where role = 'peserta' and sigarda.tingkat_selesai(id, 'Laksana') order by username`);
const calonBantara = await q(`select id, username from public.profiles where role = 'peserta' and not sigarda.tingkat_selesai(id, 'Bantara') order by username`);
console.log(`   (peserta ${peserta.length}; calon laksana ${calonLaksana.length}; calon garuda ${calonGaruda.length}; calon bantara ${calonBantara.length})`);
const T = (await q(`select tanggal::text t from public.absensi_sesi order by tanggal desc limit 1`))[0].t;
const T2 = (await q(`select tanggal::text t from public.absensi_sesi order by tanggal desc offset 1 limit 1`))[0].t;
await q(`delete from public.iuran`); await q(`delete from public.iuran_log`);
const set = (k, tgl, pid, jml) => rpc(k, 'sg_iuran_set', { p_tanggal: tgl, p_peserta_id: pid, p_jumlah: jml });

console.log('--- Pencatatan oleh Dewan Ambalan ---');
let r = await set(K.dewan.k, T, ahmad, 1000); ok(!r.err, 'Dewan mencatat Rp 1.000: ' + (r.err ?? 'ok'));
ok((await q(`select jumlah, jenis, oleh from public.iuran where tanggal = $1 and peserta_id = $2`, [T, ahmad]))[0].jumlah === 1000, 'tersimpan (jenis rutin, dicatat oleh Dewan)');
r = await set(K.dewan.k, T, ahmad, 2500); ok(!r.err && (await q(`select jumlah from public.iuran where peserta_id = $1 and tanggal = $2`, [ahmad, T]))[0].jumlah === 2500, 'nominal manual (Rp 2.500) mengubah nominal sebelumnya');
r = await set(K.dewan.k, T, ahmad, 2500);
ok(!r.err && (await q(`select count(*)::int n from public.iuran_log where peserta_id = $1`, [ahmad]))[0].n === 2, 'mencatat nilai yang sama tidak menambah riwayat');
const log = await q(`select jumlah_lama, jumlah_baru, jenis from public.iuran_log where peserta_id = $1 order by id`, [ahmad]);
ok(log[0].jumlah_lama === null && log[0].jumlah_baru === 1000 && log[1].jumlah_lama === 1000 && log[1].jumlah_baru === 2500, 'riwayat: (kosong -> 1000), (1000 -> 2500)');
r = await set(K.dewan.k, T, ahmad, 0);
ok(!r.err && (await q(`select count(*)::int n from public.iuran where peserta_id = $1`, [ahmad]))[0].n === 0, 'jumlah 0 = tidak iuran (baris dihapus)');
ok((await q(`select jumlah_lama, jumlah_baru from public.iuran_log where peserta_id = $1 order by id desc limit 1`, [ahmad]))[0].jumlah_baru === null, '...dan tercatat di riwayat (2500 -> kosong)');
r = await set(K.dewan.k, T, ahmad, null); ok(!r.err, 'menghapus yang memang kosong: tanpa galat dan tanpa riwayat baru');
ok((await q(`select count(*)::int n from public.iuran_log where peserta_id = $1`, [ahmad]))[0].n === 3, 'jumlah baris riwayat tetap 3');
for (const [nama, nilai, re] of [['negatif', -500, /antara Rp 1/], ['terlalu besar', 1000001, /antara Rp 1/]]) { r = await set(K.dewan.k, T, ahmad, nilai); ok(/antara Rp 1/.test(r.err ?? ''), `jumlah ${nama} ditolak: ${r.err}`); }
r = await set(K.dewan.k, T, ahmad, 1000000); ok(!r.err, 'batas atas Rp 1.000.000 diterima'); await set(K.dewan.k, T, ahmad, 0);
r = await set(K.dewan.k, '2000-01-07', ahmad, 500); ok(/Sesi absensi belum dibuat/.test(r.err ?? ''), 'tanggal tanpa sesi absensi ditolak: ' + r.err);
r = await set(K.dewan.k, T, '00000000-0000-0000-0000-000000000000', 500); ok(/Peserta tidak ditemukan/.test(r.err ?? ''), 'peserta tak dikenal ditolak');
r = await set(K.dewan.k, T, K.pembina.id, 500); ok(/Peserta tidak ditemukan/.test(r.err ?? ''), 'iuran hanya untuk Penegak (bukan Pembina)');
// titip: semua status absensi
await q(`delete from public.absensi_hadir where tanggal = $1 and peserta_id in ($2, $3)`, [T, ahmad, kevin]);
await q(`insert into public.absensi_hadir (tanggal, peserta_id, status) values ($1, $2, 'I')`, [T, ahmad]);
r = await set(K.dewan.k, T, ahmad, 1000); ok(!r.err, 'peserta berstatus Izin boleh menitip iuran');
await q(`update public.absensi_hadir set status = 'S' where tanggal = $1 and peserta_id = $2`, [T, ahmad]); r = await set(K.dewan.k, T, ahmad, 1500); ok(!r.err, 'status Sakit boleh menitip');
r = await set(K.dewan.k, T, kevin, 500); ok(!r.err, 'peserta tanpa catatan absensi (belum dicatat) tetap dapat dicatat iurannya');
r = await set(K.dewan.k, T2, ahmad, 1000); ok(!r.err, 'Jumat sebelumnya (pengisian susulan) dapat dicatat');

console.log('\n--- Yang TIDAK boleh mencatat ---');
for (const [nama, kk] of [['Pembina', K.pembina], ['Admin', K.admin], ['Penegak', K.ahmad]]) {
  r = await set(kk.k, T, kevin, 3000); ok(/Dewan Ambalan atau asisten/.test(r.err ?? ''), `${nama} ditolak: ${r.err}`);
  r = await rpc(kk.k, 'sg_iuran_set_banyak', { p_tanggal: T, p_peserta_ids: [kevin], p_jumlah: 1000, p_hanya_kosong: false }); ok(!!r.err, `${nama} ditolak untuk pengisian banyak`);
  r = await rpc(kk.k, 'sg_iuran_lembar', { p_tanggal: T }); ok(!!r.err, `${nama} tidak dapat membuka lembar catat`);
}
r = await rpc(anon, 'sg_iuran_set', { p_tanggal: T, p_peserta_id: kevin, p_jumlah: 500 }); ok(!!r.err, 'tanpa login ditolak');
ok((await q(`select jumlah from public.iuran where peserta_id = $1 and tanggal = $2`, [kevin, T]))[0].jumlah === 500, 'nilai tidak berubah oleh percobaan yang ditolak');
const eu = await K.dewan.k.from('iuran').update({ jumlah: 5 }).eq('peserta_id', ahmad); ok(!!eu.error, 'Dewan tidak dapat mengubah tabel iuran langsung (hanya lewat fungsi)');
for (const t of ['iuran', 'iuran_log', 'iuran_kas', 'asisten_iuran']) {
  const h = (await q(`select has_table_privilege('authenticated', 'public.${t}', 'insert') i, has_table_privilege('authenticated', 'public.${t}', 'update') u, has_table_privilege('authenticated', 'public.${t}', 'delete') d, has_table_privilege('authenticated', 'public.${t}', 'select') s, has_table_privilege('anon', 'public.${t}', 'select') sa`))[0];
  ok(!h.i && !h.u && !h.d && h.s && !h.sa, `tabel ${t}: peran login hanya boleh membaca; tanpa login tidak boleh apa pun`);
}

console.log('\n--- Hak baca ---');
ok((await baca(K.dewan.k, 'iuran')).n >= 3 && (await baca(K.pembina.k, 'iuran')).n === (await baca(K.dewan.k, 'iuran')).n && (await baca(K.admin.k, 'iuran')).n === (await baca(K.dewan.k, 'iuran')).n, 'Dewan, Pembina, dan Admin membaca semua iuran');
const bAhmad = await baca(K.ahmad.k, 'iuran'); ok(bAhmad.n >= 1 && bAhmad.data.every((x) => x.peserta_id === ahmad), `Penegak hanya membaca iuran miliknya (${bAhmad.n} baris)`);
ok((await baca(K.ahmad.k, 'iuran_log')).n === 0 && (await baca(K.ahmad.k, 'iuran_kas')).n === 0, 'Penegak tidak membaca riwayat dan kas');
ok((await baca(K.dewan.k, 'iuran_log')).n > 5 && (await baca(K.pembina.k, 'iuran_log')).n > 5 && (await baca(K.admin.k, 'iuran_log')).n > 5, 'pengurus membaca riwayat');
ok((await baca(anon, 'iuran')).err !== null || (await baca(anon, 'iuran')).n === 0, 'tanpa login tidak membaca apa pun');

console.log('\n--- Pengisian banyak ---');
const idSemua = peserta.map((x) => x.id);
r = await rpc(K.dewan.k, 'sg_iuran_set_banyak', { p_tanggal: T, p_peserta_ids: idSemua, p_jumlah: 1000, p_hanya_kosong: true });
const yangAda = (await q(`select count(*)::int n from public.iuran where tanggal = $1`, [T]))[0].n;
ok(!r.err && yangAda === peserta.length && r.data === peserta.length - 2, `hanya kosong: ${r.data} baris baru; yang sudah berisi (Ahmad Rp 1.500, Kevin Rp 500) tidak diubah`);
ok((await q(`select jumlah from public.iuran where tanggal = $1 and peserta_id = $2`, [T, ahmad]))[0].jumlah === 1500, 'nilai Ahmad tetap Rp 1.500');
r = await rpc(K.dewan.k, 'sg_iuran_set_banyak', { p_tanggal: T, p_peserta_ids: [ahmad, kevin], p_jumlah: 2000, p_hanya_kosong: false });
ok(!r.err && r.data === 2 && (await q(`select jumlah from public.iuran where tanggal = $1 and peserta_id = $2`, [T, kevin]))[0].jumlah === 2000, 'timpa: dua baris diubah menjadi Rp 2.000');
r = await rpc(K.dewan.k, 'sg_iuran_set_banyak', { p_tanggal: T, p_peserta_ids: [ahmad], p_jumlah: 0, p_hanya_kosong: false }); ok(!!r.err, 'pengisian banyak dengan jumlah 0 ditolak (hapus hanya per orang)');
r = await rpc(K.dewan.k, 'sg_iuran_set_banyak', { p_tanggal: T, p_peserta_ids: Array.from({ length: 501 }, () => ahmad), p_jumlah: 500 }); ok(/Maksimal 500/.test(r.err ?? ''), 'lebih dari 500 ditolak');
r = await rpc(K.dewan.k, 'sg_iuran_set_banyak', { p_tanggal: T, p_peserta_ids: [K.pembina.id, K.admin.id], p_jumlah: 500 }); ok(!r.err && r.data === 0, 'akun non-Penegak diabaikan');

console.log('\n--- Asisten bendahara ---');
const cl = calonLaksana[0], cl2 = calonLaksana[1];
r = await rpc(K.dewan.k, 'sg_asisten_iuran_atur', { p_peserta_id: cl.id, p_aktif: true }); ok(!r.err, `Dewan menunjuk Calon Laksana (${cl.username}) sebagai asisten`);
r = await rpc(K.pembina.k, 'sg_asisten_iuran_atur', { p_peserta_id: cl2.id, p_aktif: true }); ok(!r.err, 'Pembina juga dapat menunjuk');
r = await rpc(K.admin.k, 'sg_asisten_iuran_atur', { p_peserta_id: calonLaksana[2]?.id ?? cl.id, p_aktif: true }); ok(/Dewan Ambalan atau Pembina/.test(r.err ?? ''), 'Admin tidak dapat menunjuk: ' + r.err);
r = await rpc(K.ahmad.k, 'sg_asisten_iuran_atur', { p_peserta_id: cl.id, p_aktif: false }); ok(/Dewan Ambalan atau Pembina/.test(r.err ?? ''), 'Penegak tidak dapat mengatur asisten');
r = await rpc(K.dewan.k, 'sg_asisten_iuran_atur', { p_peserta_id: calonBantara[0].id, p_aktif: true }); ok(/Calon Laksana/.test(r.err ?? ''), 'Calon Bantara tidak boleh ditunjuk: ' + r.err);
if (calonGaruda.length) { r = await rpc(K.dewan.k, 'sg_asisten_iuran_atur', { p_peserta_id: calonGaruda[0].id, p_aktif: true }); ok(/Calon Laksana/.test(r.err ?? ''), 'Calon Garuda (Laksana selesai) tidak boleh ditunjuk'); }
r = await rpc(K.dewan.k, 'sg_asisten_iuran_atur', { p_peserta_id: K.pembina.id, p_aktif: true }); ok(/Peserta tidak ditemukan/.test(r.err ?? ''), 'hanya Penegak yang dapat ditunjuk');
r = await rpc(K.dewan.k, 'sg_asisten_iuran_atur', { p_peserta_id: cl.id, p_aktif: true }); ok(!r.err && (await q(`select count(*)::int n from public.asisten_iuran where peserta_id = $1`, [cl.id]))[0].n === 1, 'menunjuk ulang: idempoten');
const A = await masuk(cl.username, PIN_DEMO.penegak); // asisten sungguhan
ok((await baca(A.k, 'asisten_iuran')).n === 1, 'asisten membaca penunjukan miliknya sendiri');
r = await set(A.k, T2, kevin, 1000); ok(!r.err, 'asisten dapat mencatat iuran Penegak lain');
ok((await q(`select oleh from public.iuran where tanggal = $1 and peserta_id = $2`, [T2, kevin]))[0].oleh === A.id, '...dan tercatat atas namanya');
r = await set(A.k, T, A.id, 1000); ok(/dicatat oleh Dewan Ambalan/.test(r.err ?? ''), 'asisten tidak dapat mencatat iurannya sendiri: ' + r.err);
r = await rpc(A.k, 'sg_iuran_kas_simpan', { p_tanggal: T, p_total: 1, p_catatan: '' }); ok(/Dewan Ambalan/.test(r.err ?? ''), 'asisten tidak dapat menutup kas');
const lembar = await rpc(A.k, 'sg_iuran_lembar', { p_tanggal: T });
ok(!lembar.err && lembar.data.length === peserta.length - 1 && !lembar.data.some((x) => x.id === A.id), `lembar asisten: ${lembar.data?.length} Penegak, tanpa dirinya sendiri`);
ok(lembar.data.every((x) => 'id' in x && 'nama' in x && 'jumlah' in x && 'status' in x) && Object.keys(lembar.data[0]).sort().join() === 'id,jenis,jumlah,kelas,nama,sangga,status', 'lembar hanya memuat bidang yang perlu (tanpa NIS, agama, dll.)');
ok(lembar.data.find((x) => x.id === ahmad).status === 'S' && lembar.data.find((x) => x.id === ahmad).jumlah === 2000, 'lembar memuat status absensi dan iuran hari itu');
const bA = await baca(A.k, 'iuran'); ok(bA.data.every((x) => x.peserta_id === A.id), 'asisten membaca tabel iuran hanya miliknya (bukan milik Penegak lain)');
const profilLain = await A.k.from('profiles').select('id'); ok((profilLain.data ?? []).filter((x) => x.id !== A.id && peserta.some((p) => p.id === x.id)).length === 0, 'asisten tetap tidak dapat membaca profil Penegak lain');
r = await rpc(K.dewan.k, 'sg_asisten_iuran_atur', { p_peserta_id: cl.id, p_aktif: false }); ok(!r.err, 'Dewan mencabut penunjukan');
r = await set(A.k, T2, kevin, 1500); ok(/Dewan Ambalan atau asisten/.test(r.err ?? ''), 'setelah dicabut, asisten tidak dapat mencatat lagi');
// batas 5
const sisa = calonLaksana.length; const jumlahAsisten = async () => (await q(`select count(*)::int n from public.asisten_iuran`))[0].n;
await q(`delete from public.asisten_iuran`);
await q(`insert into public.asisten_iuran (peserta_id) select id from public.profiles where role = 'peserta' and id <> $1 and id not in (select peserta_id from public.asisten_iuran) order by username limit 5`, [cl.id]); // bukan cl: urutan fisik baris tidak boleh menentukan hasil uji
ok((await jumlahAsisten()) === 5, 'data uji: 5 asisten terpasang');
r = await rpc(K.dewan.k, 'sg_asisten_iuran_atur', { p_peserta_id: cl.id, p_aktif: true }); ok(/maksimal 5/i.test(r.err ?? ''), 'asisten keenam ditolak: ' + r.err);
await q(`delete from public.asisten_iuran`);

console.log('\n--- Rekap agregat untuk semua peran ---');
const total = (await q(`select sum(jumlah)::int s, count(*)::int n from public.iuran where tanggal = $1`, [T]))[0];
for (const [nama, kk] of [['Penegak', K.ahmad], ['Pembina', K.pembina], ['Admin', K.admin], ['Dewan', K.dewan]]) {
  const g = await rpc(kk.k, 'sg_iuran_agregat', { p_mulai: T, p_akhir: T });
  const gudep = g.data?.find((x) => x.tipe === 'gudep');
  ok(!g.err && gudep?.jumlah === total.s && gudep.orang === total.n, `${nama}: total gudep pada ${T} = Rp ${total.s} (${total.n} orang)`);
}
const g = (await rpc(K.ahmad.k, 'sg_iuran_agregat', { p_mulai: T, p_akhir: T })).data;
const sumTipe = (tipe) => g.filter((x) => x.tipe === tipe).reduce((s, x) => s + x.jumlah, 0);
ok(sumTipe('sangga') === total.s && sumTipe('kelas') === total.s, 'jumlah seluruh sangga = jumlah seluruh kelas = total gudep');
ok(g.every((x) => Object.keys(x).sort().join() === 'jumlah,kunci,orang,susulan,tanggal,tipe') && !JSON.stringify(g).includes(ahmad), 'jawaban agregat tanpa identitas perorangan');
const sanggaDb = await q(`select p.sangga, sum(i.jumlah)::int s from public.iuran i join public.profiles p on p.id = i.peserta_id where i.tanggal = $1 group by p.sangga order by 1`, [T]);
ok(JSON.stringify(sanggaDb.map((x) => [x.sangga, x.s])) === JSON.stringify(g.filter((x) => x.tipe === 'sangga').map((x) => [x.kunci, x.jumlah])), 'total per sangga sama dengan hitungan langsung dari tabel');
const dua = (await rpc(K.ahmad.k, 'sg_iuran_agregat', { p_mulai: T2, p_akhir: T })).data;
ok(new Set(dua.map((x) => x.tanggal)).size === 2, 'rentang dua Jumat menghasilkan dua tanggal');
r = await rpc(K.ahmad.k, 'sg_iuran_agregat', { p_mulai: T, p_akhir: T2 }); ok(/tidak valid/.test(r.err ?? ''), 'rentang terbalik ditolak');
r = await rpc(K.ahmad.k, 'sg_iuran_agregat', { p_mulai: '2020-01-01', p_akhir: '2026-01-01' }); ok(/tidak valid/.test(r.err ?? ''), 'rentang lebih dari sekitar 2 tahun ditolak');
r = await rpc(anon, 'sg_iuran_agregat', { p_mulai: T, p_akhir: T }); ok(!!r.err, 'tanpa login ditolak');
await q(`update public.iuran set jenis = 'susulan' where tanggal = $1 and peserta_id = $2`, [T, ahmad]);
const gs = (await rpc(K.ahmad.k, 'sg_iuran_agregat', { p_mulai: T, p_akhir: T })).data.find((x) => x.tipe === 'gudep');
ok(gs.susulan === 2000, 'bagian susulan dipisah pada agregat (Rp 2.000)');
r = await set(K.dewan.k, T, ahmad, 3000);
ok(!r.err && (await q(`select jenis, jumlah from public.iuran where tanggal = $1 and peserta_id = $2`, [T, ahmad]))[0].jenis === 'susulan', 'mengubah nominal baris susulan tidak mengubah jenisnya');
ok((await q(`select jenis from public.iuran_log where peserta_id = $1 order by id desc limit 1`, [ahmad]))[0].jenis === 'susulan', '...dan riwayat mencatat jenis susulan');

console.log('\n--- Tutup kas ---');
r = await rpc(K.dewan.k, 'sg_iuran_kas_simpan', { p_tanggal: T, p_total: 21500, p_catatan: 'Selisih Rp 500 (uang receh)' }); ok(!r.err, 'Dewan menutup kas');
ok((await baca(K.pembina.k, 'iuran_kas')).n === 1 && (await baca(K.admin.k, 'iuran_kas')).n === 1, 'Pembina dan Admin membaca tutup kas');
for (const [nama, kk] of [['Pembina', K.pembina], ['Admin', K.admin], ['Penegak', K.ahmad]]) { r = await rpc(kk.k, 'sg_iuran_kas_simpan', { p_tanggal: T, p_total: 1, p_catatan: '' }); ok(/Hanya Dewan Ambalan/.test(r.err ?? ''), `${nama} tidak dapat menutup kas`); }
r = await rpc(K.dewan.k, 'sg_iuran_kas_simpan', { p_tanggal: T, p_total: -1, p_catatan: '' }); ok(/tidak valid/.test(r.err ?? ''), 'total negatif ditolak');
r = await rpc(K.dewan.k, 'sg_iuran_kas_simpan', { p_tanggal: T, p_total: 5, p_catatan: 'x'.repeat(301) }); ok(/Catatan maksimal/.test(r.err ?? ''), 'catatan terlalu panjang ditolak');
r = await rpc(K.dewan.k, 'sg_iuran_kas_simpan', { p_tanggal: '2000-01-07', p_total: 5, p_catatan: '' }); ok(/Sesi absensi belum dibuat/.test(r.err ?? ''), 'kas untuk tanggal tanpa sesi ditolak');
r = await rpc(K.dewan.k, 'sg_iuran_kas_simpan', { p_tanggal: T, p_total: 22000, p_catatan: '' }); ok(!r.err && (await q(`select total_fisik from public.iuran_kas where tanggal = $1`, [T]))[0].total_fisik === 22000, 'tutup kas dapat diperbarui');

console.log('\n--- Sesi absensi yang memiliki catatan uang tidak dapat dihapus ---');
r = await rpc(K.pembina.k, 'sg_absen_hapus_sesi', { p_tanggal: T }); ok(/catatan iuran atau tutup kas/.test(r.err ?? ''), 'Pembina tidak dapat menghapus sesi berisi iuran: ' + r.err);
ok((await q(`select count(*)::int n from public.iuran where tanggal = $1`, [T]))[0].n > 0, 'iuran tetap ada');
const tanpaUang = (await q(`select tanggal::text t from public.absensi_sesi where tanggal not in (select tanggal from public.iuran) and tanggal not in (select tanggal from public.iuran_kas) order by tanggal limit 1`))[0].t;
r = await rpc(K.pembina.k, 'sg_absen_hapus_sesi', { p_tanggal: tanpaUang }); ok(!r.err, 'sesi tanpa catatan uang tetap dapat dihapus seperti biasa (' + tanpaUang + ')');
await q(`delete from public.iuran_kas where tanggal = $1`, [T]); await q(`delete from public.iuran where tanggal = $1`, [T]);
r = await rpc(K.pembina.k, 'sg_absen_hapus_sesi', { p_tanggal: T }); ok(!r.err, 'setelah iuran dan kas dikosongkan, sesi dapat dihapus');

console.log(`\nRINGKASAN IURAN: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
