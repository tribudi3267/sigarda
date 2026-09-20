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
const anon = buatKlienFake(pg);                       // tanpa masuk = peran anon
const rpc = async (k, nama, args) => { const { data, error } = await k.rpc(nama, args); return { data, err: error?.message ?? null }; };
const uid = async (u) => (await q(`select id from public.profiles where username = $1`, [u]))[0].id;
const bagas = await uid('10007'), ahmad = await uid('10231'), kevin = await uid('10234');
const catat = (o) => K.pembina.a.catatHasil({ pin: PIN_DEMO.pembina, pesertaId: bagas, skuId: 'BAN-05', hasil: 'lulus', tanggalUji: '2026-09-10', nilai: 'Baik', catatan: '', ...o });
await q('delete from public.sku_progress'); await q('delete from public.sku_riwayat');

console.log('--- Token QR mengikuti status butir ---');
let r = await catat({});
ok(r.ok, 'butir dinyatakan lulus');
let pr = (await q(`select verifikasi_token t, verifikasi v, status from public.sku_progress where peserta_id = $1 and sku_id = 'BAN-05'`, [bagas]))[0];
ok(/^[0-9a-f]{32}$/.test(pr.t) && /^VRF-/.test(pr.v), 'lulus: token 32 heksadesimal dan kode VRF terbentuk');
const token1 = pr.t;
r = await catat({ hasil: 'ulang', catatan: 'coba lagi' });
pr = (await q(`select verifikasi_token t, status from public.sku_progress where peserta_id = $1 and sku_id = 'BAN-05'`, [bagas]))[0];
ok(r.ok && pr.status === 'ulang' && pr.t === null, 'perlu diulang: token dihapus');
r = await catat({});
pr = (await q(`select verifikasi_token t from public.sku_progress where peserta_id = $1 and sku_id = 'BAN-05'`, [bagas]))[0];
ok(/^[0-9a-f]{32}$/.test(pr.t) && pr.t !== token1, 'lulus lagi: token BARU (dokumen lama tidak lagi sah)');
r = await catat({ hasil: 'proses' }); pr = (await q(`select verifikasi_token t from public.sku_progress where peserta_id = $1 and sku_id = 'BAN-05'`, [bagas]))[0]; ok(pr.t === null, 'mulai uji: token dihapus');
r = await catat({}); r = await catat({ hasil: 'reset', catatan: 'salah pencet' }); pr = (await q(`select verifikasi_token t from public.sku_progress where peserta_id = $1 and sku_id = 'BAN-05'`, [bagas]))[0]; ok(pr.t === null, 'dikembalikan ke belum diuji: token dihapus');
for (const s of ['BAN-02', 'BAN-03', 'BAN-04']) await catat({ skuId: s });
const tokens = await q(`select verifikasi_token t from public.sku_progress where verifikasi_token is not null`);
ok(tokens.length === 3 && new Set(tokens.map((x) => x.t)).size === 3, 'token setiap butir unik');
ok((await q(`select count(*)::int n from pg_indexes where tablename = 'sku_progress' and indexdef ilike '%unique%verifikasi_token%'`))[0].n === 1, 'ada indeks unik pada token');
// entropi kasar: 500 token acak tanpa kembar, semua huruf heksa, sebaran nibble merata
const banyak = await q(`select sigarda.token_acak() t from generate_series(1, 500)`);
const hitung = {}; for (const { t } of banyak) for (const c of t) hitung[c] = (hitung[c] ?? 0) + 1;
ok(new Set(banyak.map((x) => x.t)).size === 500 && banyak.every((x) => /^[0-9a-f]{32}$/.test(x.t)) && Object.values(hitung).every((n) => n > 500 * 32 / 16 * 0.75 && n < 500 * 32 / 16 * 1.25), 'token_acak: 500 nilai unik, sebaran karakter merata');
const uuidTetap = banyak.filter((x) => x.t[12] === '4').length;
ok(uuidTetap < 500 * 0.2, 'token tidak memuat penanda versi UUID yang tetap pada posisi tertentu (semua bit acak)');

console.log('\n--- Akses tanpa login (anon) ---');
const tokenButir = (await q(`select verifikasi_token t, verifikasi v from public.sku_progress where sku_id = 'BAN-02' and peserta_id = $1`, [bagas]))[0];
r = await rpc(anon, 'sg_verifikasi_token', { p_token: tokenButir.t });
ok(!r.err && r.data.ditemukan === true && r.data.jenis === 'butir' && r.data.nama && r.data.sku_id === 'BAN-02' && r.data.tingkat === 'Bantara' && r.data.butir_no === 2 && r.data.tanggal === '2026-09-10' && r.data.penguji && r.data.jabatan_penguji === 'Pembina' && r.data.kode === tokenButir.v, 'token butir sah: nama, butir, tanggal, penguji, kode: ' + JSON.stringify(r.data));
const kunciDiizinkan = new Set(['ditemukan', 'jenis', 'nama', 'sku_id', 'tingkat', 'butir_no', 'sub', 'tanggal', 'penguji', 'jabatan_penguji', 'kode']);
ok(Object.keys(r.data).every((k) => kunciDiizinkan.has(k)), 'jawaban hanya berisi bidang yang dimaksud (tidak ada id pengguna, NIS, kelas, PIN, dll.)');
const teksJawaban = JSON.stringify(r.data);
ok(!/-[0-9a-f]{4}-/.test(teksJawaban) && !teksJawaban.includes(bagas) && !teksJawaban.includes('10007'), 'jawaban tidak memuat UUID peserta maupun NIS');
r = await rpc(anon, 'sg_verifikasi_token', { p_token: tokenButir.t.toUpperCase() }); ok(r.data.ditemukan === true, 'token huruf besar/kecil sama saja');
r = await rpc(anon, 'sg_verifikasi_token', { p_token: `  ${tokenButir.t}  ` }); ok(r.data.ditemukan === true, 'spasi di tepi diabaikan');
const tidak = JSON.stringify({ ditemukan: false });
for (const [nama, nilai] of [['acak valid', 'a'.repeat(32)], ['pendek', 'abc'], ['panjang', tokenButir.t + 'ff'], ['bukan heksa', 'z'.repeat(32)], ['kosong', ''], ['null', null], ['suntikan', "' or 1=1 --"], ['kode VRF di token', tokenButir.v]]) {
  r = await rpc(anon, 'sg_verifikasi_token', { p_token: nilai });
  ok(!r.err && JSON.stringify(r.data) === tidak, `token tidak sah/tidak dikenal (${nama}): jawaban seragam {ditemukan:false}`);
}
r = await rpc(anon, 'sg_verifikasi_kode', { p_kode: tokenButir.v });
ok(!r.err && r.data.ditemukan === true && r.data.tingkat === 'Bantara' && r.data.butir_no === 2 && r.data.tanggal === '2026-09-10' && !('nama' in r.data) && !('penguji' in r.data) && !('sku_id' in r.data), 'kode VRF sah: hanya tingkat, butir, tanggal (TANPA nama dan penguji): ' + JSON.stringify(r.data));
r = await rpc(anon, 'sg_verifikasi_kode', { p_kode: tokenButir.v.toLowerCase() }); ok(r.data.ditemukan === true, 'kode VRF huruf kecil diterima');
for (const [nama, nilai] of [['tidak ada', 'VRF-0000000'], ['salah format', 'VRF-123'], ['tanpa awalan', tokenButir.v.slice(4)], ['suntikan', "VRF-' or 1=1"], ['token diberikan sebagai kode', tokenButir.t], ['null', null]]) {
  r = await rpc(anon, 'sg_verifikasi_kode', { p_kode: nilai }); ok(!r.err && JSON.stringify(r.data) === tidak, `kode tidak sah (${nama}): {ditemukan:false}`);
}
// anon tidak dapat apa pun selain dua fungsi itu
for (const [nama, args] of [['sg_sertifikat_tingkat', { p_peserta_id: bagas, p_tingkat: 'Bantara' }], ['sg_sku_ajukan', { p_sku_id: 'BAN-02', p_jadwal: '2026-10-01', p_penguji_id: null, p_catatan: '' }], ['sg_sesi_simpan', {}], ['sg_instrumen_status', { p_sku_ids: ['BAN-02'], p_status: 'draf' }], ['sg_absen_buat_sesi', { p_tanggal: '2026-09-11' }]]) {
  r = await rpc(anon, nama, args); ok(/permission denied|Could not find|not exist|tidak ditemukan/i.test(r.err ?? ''), `anon tidak dapat memanggil ${nama}: ${(r.err ?? 'DIIZINKAN!').slice(0, 60)}`);
}
for (const tabel of ['sku_progress', 'profiles', 'sertifikat_tingkat', 'sesi_ujian', 'instrumen_panduan', 'pengaturan']) {
  const x = await anon.from(tabel).select('*'); ok(x.error != null || (x.data ?? []).length === 0, `anon tidak dapat membaca tabel ${tabel}`);
}
r = await rpc(anon, 'sigarda.token_acak', {}); ok(r.err != null, 'anon tidak dapat memanggil fungsi internal skema sigarda');

console.log('\n--- Token Penegak dan akses baca ---');
const xAhmad = await K.ahmad.k.from('sku_progress').select('sku_id, verifikasi_token');
ok(!xAhmad.error && xAhmad.data.every((z) => z.verifikasi_token === null || /^[0-9a-f]{32}$/.test(z.verifikasi_token)), 'Penegak membaca kolom token pada progresnya sendiri');
const xLain = await K.kevin.k.from('sku_progress').select('*').eq('peserta_id', bagas); ok(!xLain.error && xLain.data.length === 0, 'Penegak lain tidak melihat progres (dan token) milik Bagas');
ok((await K.kevin.k.from('sertifikat_tingkat').select('*')).error != null, 'tabel sertifikat_tingkat tidak dapat dibaca langsung siapa pun');
ok((await K.pembina.k.from('sertifikat_tingkat').select('*')).error != null, '...termasuk Pembina');

console.log('\n--- Surat Tanda Lulus per tingkat ---');
const mapel = async (pid, tingkat) => q(`insert into public.sku_progress (peserta_id, sku_id, status, tanggal_uji, penguji_id, nilai, verifikasi, verifikasi_token)
  select p.id, u.id, 'lulus', date '2026-08-20', '${K.pembina.id}', 'Baik', 'VRF-T' || substr(md5(u.id), 1, 6), sigarda.token_acak() from public.profiles p join public.sku_unit u on u.tingkat = $2 and (u.agama is null or u.agama = p.agama) where p.id = $1
  on conflict (peserta_id, sku_id) do update set status = 'lulus', tanggal_uji = date '2026-08-20', verifikasi_token = sigarda.token_acak()`, [pid, tingkat]);
r = await rpc(K.pembina.k, 'sg_sertifikat_tingkat', { p_peserta_id: ahmad, p_tingkat: 'Bantara' });
ok(/seluruh butirnya sudah lulus/.test(r.err ?? ''), 'tingkat belum lengkap: surat tidak diterbitkan: ' + r.err);
await mapel(ahmad, 'Bantara');
r = await rpc(K.ahmad.k, 'sg_sertifikat_tingkat', { p_peserta_id: ahmad, p_tingkat: 'Bantara' });
ok(!r.err && /^[0-9a-f]{32}$/.test(r.data), 'Penegak menerbitkan token surat miliknya sendiri');
const tokenStl = r.data;
r = await rpc(K.pembina.k, 'sg_sertifikat_tingkat', { p_peserta_id: ahmad, p_tingkat: 'Bantara' }); ok(!r.err && r.data === tokenStl, 'Pembina memperoleh token yang sama (idempoten)');
r = await rpc(K.kevin.k, 'sg_sertifikat_tingkat', { p_peserta_id: ahmad, p_tingkat: 'Bantara' }); ok(/tidak berwenang/.test(r.err ?? ''), 'Penegak lain tidak boleh menerbitkan untuk orang lain: ' + r.err);
r = await rpc(K.dewan.k, 'sg_sertifikat_tingkat', { p_peserta_id: ahmad, p_tingkat: 'Bantara' }); ok(!r.err && r.data === tokenStl, 'Dewan Ambalan dapat mengambil token peserta');
r = await rpc(K.pembina.k, 'sg_sertifikat_tingkat', { p_peserta_id: ahmad, p_tingkat: 'Garuda' }); ok(/Tingkat SKU tidak dikenal/.test(r.err ?? ''), 'tingkat tidak dikenal ditolak');
r = await rpc(K.pembina.k, 'sg_sertifikat_tingkat', { p_peserta_id: idAcak(), p_tingkat: 'Bantara' }); ok(/Peserta tidak ditemukan/.test(r.err ?? ''), 'peserta tidak ada ditolak');
function idAcak() { return '00000000-0000-0000-0000-000000000000'; }
ok((await q(`select count(*)::int n from public.sertifikat_tingkat where peserta_id = $1`, [ahmad]))[0].n === 1, 'hanya satu token per peserta per tingkat');
r = await rpc(anon, 'sg_verifikasi_token', { p_token: tokenStl });
ok(!r.err && r.data.ditemukan && r.data.jenis === 'tingkat' && r.data.tingkat === 'Bantara' && r.data.jumlah_butir === 23 && r.data.tanggal === '2026-08-20' && r.data.penguji && r.data.nama, 'token surat sah: nama, tingkat, 23 butir, tanggal, penguji: ' + JSON.stringify(r.data));
ok(!('sku_id' in r.data) && !('kode' in r.data), 'jawaban token surat tidak memuat bidang butir');
await q(`update public.sku_progress set status = 'ulang', verifikasi_token = null where peserta_id = $1 and sku_id = 'BAN-07'`, [ahmad]);
r = await rpc(anon, 'sg_verifikasi_token', { p_token: tokenStl }); ok(JSON.stringify(r.data) === tidak, 'satu butir tidak lagi lulus: surat tingkat tidak lagi sah (tanpa membocorkan nama)');
await q(`update public.sku_progress set status = 'lulus' where peserta_id = $1 and sku_id = 'BAN-07'`, [ahmad]);
r = await rpc(anon, 'sg_verifikasi_token', { p_token: tokenStl }); ok(r.data.ditemukan === true, 'lulus lagi: token surat yang sama sah kembali');
r = await rpc(K.pembina.k, 'sg_sertifikat_tingkat', { p_peserta_id: ahmad, p_tingkat: 'Laksana' }); ok(/seluruh butirnya/.test(r.err ?? ''), 'Laksana belum lengkap: ditolak');
await q(`update public.profiles set wajib_ganti_pin = true where username = '10231'`);
r = await rpc(K.ahmad.k, 'sg_sertifikat_tingkat', { p_peserta_id: ahmad, p_tingkat: 'Bantara' }); ok(/Ganti PIN/.test(r.err ?? ''), 'akun yang wajib ganti PIN ditolak');
await q(`update public.profiles set wajib_ganti_pin = false where username = '10231'`);

console.log('\n--- Sesi ujian ---');
const butirBan = (await q(`select id from public.sku_butir where tingkat = 'Bantara' order by no limit 4`)).map((x) => x.id);
const arg = (o = {}) => ({ p_id: null, p_nama: '  Ujian   Massal 1 ', p_tanggal: '2026-09-25', p_tempat: 'Lapangan', p_catatan: 'Uji perdana', p_status: 'terjadwal', p_butir: butirBan.slice(0, 3), p_peserta: [ahmad, kevin, bagas], ...o });
for (const who of ['ahmad']) { r = await rpc(K[who].k, 'sg_sesi_simpan', arg()); ok(/Hanya Dewan Ambalan, Pembina, atau Admin/.test(r.err ?? ''), `${who} (Penegak) tidak boleh membuat sesi`); }
for (const [nama, o, re] of [
  ['nama kosong', { p_nama: '   ' }, /Nama sesi wajib/], ['nama panjang', { p_nama: 'x'.repeat(121) }, /maksimal 120/], ['tanggal kosong', { p_tanggal: null }, /Tanggal sesi tidak valid/],
  ['tanggal tak wajar', { p_tanggal: '1999-01-01' }, /Tanggal sesi tidak valid/], ['tempat panjang', { p_tempat: 'x'.repeat(121) }, /Tempat maksimal/], ['catatan panjang', { p_catatan: 'x'.repeat(501) }, /Catatan maksimal/],
  ['status salah', { p_status: 'batal' }, /Status sesi tidak dikenal/], ['tanpa butir', { p_butir: [] }, /minimal satu butir/], ['tanpa peserta', { p_peserta: [] }, /minimal satu peserta/],
  ['butir asing', { p_butir: ['XYZ-99'] }, /butir yang tidak dikenal/], ['peserta asing', { p_peserta: [idAcak()] }, /peserta yang tidak dikenal/], ['pengurus sebagai peserta', { p_peserta: [K.pembina.id] }, /peserta yang tidak dikenal/],
  ['sesi tak ada', { p_id: 9999 }, /Sesi tidak ditemukan/],
]) { r = await rpc(K.dewan.k, 'sg_sesi_simpan', arg(o)); ok(re.test(r.err ?? ''), `ditolak (${nama}): ${(r.err ?? 'DITERIMA').slice(0, 60)}`); }
ok((await q('select count(*)::int n from public.sesi_ujian'))[0].n === 0, 'tidak ada sesi tersimpan dari masukan yang ditolak');
r = await rpc(K.dewan.k, 'sg_sesi_simpan', arg()); ok(!r.err && Number.isInteger(r.data), 'Dewan Ambalan membuat sesi (id ' + r.data + ')');
const idSesi = r.data;
let sesi = (await q('select * from public.sesi_ujian where id = $1', [idSesi]))[0];
ok(sesi.nama === 'Ujian Massal 1' && sesi.status === 'terjadwal' && sesi.tanggal.toISOString?.().startsWith('2026-09-25') !== false && sesi.dibuat_oleh === K.dewan.id, 'nama dirapikan, status terjadwal, pembuat tercatat');
ok((await q('select count(*)::int n from public.sesi_ujian_butir where sesi_id = $1', [idSesi]))[0].n === 3 && (await q('select count(*)::int n from public.sesi_ujian_peserta where sesi_id = $1', [idSesi]))[0].n === 3, '3 butir dan 3 peserta tersimpan');
r = await rpc(K.admin.k, 'sg_sesi_simpan', arg({ p_id: idSesi, p_butir: [butirBan[0], butirBan[0], butirBan[3]], p_peserta: [ahmad, ahmad, kevin], p_status: 'berlangsung', p_nama: 'Ujian Massal 1 (revisi)' }));
ok(!r.err && r.data === idSesi, 'Admin menyunting sesi (duplikat dalam daftar diabaikan)');
ok((await q('select butir_id from public.sesi_ujian_butir where sesi_id = $1 order by 1', [idSesi])).map((x) => x.butir_id).join() === [butirBan[0], butirBan[3]].sort().join() && (await q('select count(*)::int n from public.sesi_ujian_peserta where sesi_id = $1', [idSesi]))[0].n === 2, 'butir dan peserta diganti sesuai daftar baru');
ok((await q('select status, nama from public.sesi_ujian where id = $1', [idSesi]))[0].status === 'berlangsung', 'status ikut berubah lewat sunting');
r = await rpc(K.dewan.k, 'sg_sesi_status', { p_id: idSesi, p_status: 'selesai' }); ok(!r.err && (await q('select status from public.sesi_ujian where id = $1', [idSesi]))[0].status === 'selesai', 'ubah status oleh Dewan');
r = await rpc(K.dewan.k, 'sg_sesi_status', { p_id: idSesi, p_status: 'batal' }); ok(/Status sesi tidak dikenal/.test(r.err ?? ''), 'status tidak dikenal ditolak');
r = await rpc(K.dewan.k, 'sg_sesi_status', { p_id: 9999, p_status: 'selesai' }); ok(/Sesi tidak ditemukan/.test(r.err ?? ''), 'sesi tidak ada ditolak');
r = await rpc(K.ahmad.k, 'sg_sesi_status', { p_id: idSesi, p_status: 'selesai' }); ok(/Hanya Dewan Ambalan, Pembina, atau Admin/.test(r.err ?? ''), 'Penegak tidak boleh mengubah status');
const idSesi2 = (await rpc(K.pembina.k, 'sg_sesi_simpan', arg({ p_nama: 'Sesi kedua', p_peserta: [bagas], p_butir: [butirBan[1]] }))).data;
// RLS baca
ok((await K.dewan.k.from('sesi_ujian').select('*')).data.length === 2 && (await K.pembina.k.from('sesi_ujian_peserta').select('*')).data.length === 3, 'pengurus melihat semua sesi dan peserta sesi');
const sAhmad = await K.ahmad.k.from('sesi_ujian').select('*'); ok(!sAhmad.error && sAhmad.data.length === 1 && sAhmad.data[0].id === idSesi, 'Penegak hanya melihat sesi yang mencantumkan dirinya');
const pAhmad = await K.ahmad.k.from('sesi_ujian_peserta').select('*'); ok(pAhmad.data.length === 1 && pAhmad.data[0].peserta_id === ahmad, 'Penegak hanya melihat barisnya sendiri pada daftar peserta (tidak melihat teman)');
const bAhmad = await K.ahmad.k.from('sesi_ujian_butir').select('*'); ok(bAhmad.data.length === 2 && bAhmad.data.every((x) => x.sesi_id === idSesi), 'Penegak melihat butir sesinya saja');
const sKevin = await K.kevin.k.from('sesi_ujian').select('*'); ok(sKevin.data.length === 1, 'Kevin melihat sesi pertama saja');
ok(/permission denied/i.test(await tulis('dewan', `insert into public.sesi_ujian (nama, tanggal) values ('x', current_date)`)), 'sesi tidak dapat ditulis langsung');
async function tulis(who, sql) { try { await pg.transaction(async (tx) => { await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: K[who].id, role: 'authenticated' })]); await tx.query('set local role authenticated'); await tx.query(sql); }); return null; } catch (e) { return e.message; } }
r = await rpc(K.dewan.k, 'sg_sesi_hapus', { p_id: idSesi2 }); ok(/Hanya Pembina dan Admin/.test(r.err ?? ''), 'Dewan tidak boleh menghapus sesi');
await q(`update public.sku_progress set status = 'lulus' where peserta_id = $1 and sku_id = 'BAN-02'`, [bagas]);
r = await rpc(K.pembina.k, 'sg_sesi_hapus', { p_id: idSesi2 }); ok(!r.err && (await q('select count(*)::int n from public.sesi_ujian').then((x) => x[0].n)) === 1, 'Pembina menghapus sesi');
ok((await q('select count(*)::int n from public.sesi_ujian_butir where sesi_id = $1', [idSesi2]))[0].n === 0, 'butir dan peserta sesi ikut terhapus');
ok((await q(`select status from public.sku_progress where peserta_id = $1 and sku_id = 'BAN-02'`, [bagas]))[0].status === 'lulus', 'hasil penilaian TIDAK ikut terhapus bersama sesi');
r = await rpc(K.admin.k, 'sg_sesi_hapus', { p_id: idSesi }); ok(!r.err, 'Admin menghapus sesi');

console.log(`\nRINGKASAN VERIFIKASI-SESI: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
