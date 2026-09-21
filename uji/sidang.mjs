import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';

const P = process.cwd().replace(/\\/g, '/');
const SKEMA = process.env.SKEMA_UJI || `${P}/supabase/skema.sql`;
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const galat = (r) => (r?.ok === false ? r.pesan : null);

const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(SKEMA, 'utf8').replace(/^\uFEFF/, '') });
if (process.env.MIGRASI_UJI) await pg.exec(readFileSync(process.env.MIGRASI_UJI, 'utf8'));
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');

const masuk = async (nama, pin) => { const a = buatApi(buatKlienFake(pg)); const r = await a.masuk(nama, pin); if (!r.ok) throw new Error(nama + ': ' + r.pesan); return { a, klien: a, id: r.id }; };
const dewan = await masuk('dewan', PIN_DEMO.dewan);
const pembina = await masuk('pembina', PIN_DEMO.pembina);
const admin = await masuk('admin', PIN_DEMO.admin);
const ahmad = await masuk('10231', PIN_DEMO.penegak);
const idDari = async (u) => (await pg.query('select id from public.profiles where username = $1', [u])).rows[0].id;
const bagas = await idDari('10007');   // peserta pada data contoh
const rizky = await idDari('10231');

// rpc mentah lewat klien (agar peran pengguna ikut diperiksa)
const rpcKlien = (u) => (nama, args) => u.a.__klien ? null : null;
const klienDari = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, id: r.id }; };
const K = { dewan: await klienDari('dewan', PIN_DEMO.dewan), pembina: await klienDari('pembina', PIN_DEMO.pembina), admin: await klienDari('admin', PIN_DEMO.admin), peserta: await klienDari('10231', PIN_DEMO.penegak) };
const rpc = async (who, nama, args) => { const { data, error } = await K[who].k.rpc(nama, args); return { data, err: error?.message ?? null }; };

console.log('--- Hak akses tabel ---');
const langsung = async (who, sql) => { try { const r = await K[who].k.from(sql.tabel).select('*'); return r; } catch (e) { return { error: e }; } };
await pg.query(`insert into public.pengaturan (kunci, nilai) values ('sidang.nama_ketua', '"Uji Awal"')`);
let r = await K.peserta.k.from('sidang_dk').select('*');
ok(!r.error && r.data.length === 0, 'Penegak membaca sidang_dk: 0 baris (dibatasi RLS)');
r = await K.peserta.k.from('pengaturan').select('*');
ok(!r.error && r.data.length === 1, 'Penegak boleh membaca pengaturan');
r = await K.dewan.k.from('sidang_dk').select('*');
ok(!r.error, 'Dewan boleh membaca sidang_dk');
const tulisLangsung = async (who, sql) => { try { await pg.transaction(async (tx) => { await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: K[who].id, role: 'authenticated' })]); await tx.query('set local role authenticated'); await tx.query(sql); }); return null; } catch (e) { return e.message; } };
ok(/permission denied/i.test(await tulisLangsung('pembina', `insert into public.sidang_dk (peserta_id, tingkat, tanggal, keputusan, magang, tugas_adat, nomor_ba, capaian_lulus, capaian_total) values ('${bagas}', 'Bantara', current_date, 'layak', 'memenuhi', 'lulus', 'X', 1, 1)`)), 'Pembina tidak boleh menulis langsung ke sidang_dk');
ok(/permission denied/i.test(await tulisLangsung('admin', `update public.pengaturan set nilai = '"x"'`)), 'Admin tidak boleh menulis langsung ke pengaturan');
r = await K.dewan.k.from('sidang_urut').select('*');
ok(!r.error, 'Dewan boleh membaca penghitung nomor urut (sidang_urut)');
r = await K.peserta.k.from('sidang_urut').select('*');
ok(!r.error && r.data.length === 0, 'Penegak tidak melihat baris sidang_urut (RLS)');
ok(/permission denied/i.test(await tulisLangsung('pembina', `update public.sidang_urut set terakhir = 99`)), 'penghitung tidak boleh diubah langsung');

console.log('\n--- Pengaturan ---');
r = await rpc('peserta', 'sg_pengaturan_simpan', { p_kunci: 'sidang.nama_ketua', p_nilai: ('Budi') });
ok(/Hanya Dewan Ambalan, Pembina/.test(r.err ?? ''), 'Penegak tidak boleh mengubah pengaturan: ' + r.err);
for (const who of ['dewan', 'pembina', 'admin']) {
  r = await rpc(who, 'sg_pengaturan_simpan', { p_kunci: 'sidang.nama_ketua', p_nilai: (`  Ketua ${who}   Uji  `) });
  ok(!r.err, `${who} boleh mengubah nama ketua`);
}
ok((await pg.query(`select nilai #>> '{}' v from public.pengaturan where kunci = 'sidang.nama_ketua'`)).rows[0].v === 'Ketua admin Uji', 'spasi dirapikan');
r = await rpc('dewan', 'sg_pengaturan_simpan', { p_kunci: 'sidang.lain', p_nilai: ('x') });
ok(/tidak dikenal/.test(r.err ?? ''), 'kunci tidak dikenal ditolak');
r = await rpc('dewan', 'sg_pengaturan_simpan', { p_kunci: 'sidang.nama_ketua', p_nilai: (123) });
ok(/tidak sah/.test(r.err ?? ''), 'nilai bukan teks ditolak');
r = await rpc('dewan', 'sg_pengaturan_simpan', { p_kunci: 'sidang.sebutan_ketua', p_nilai: ('   ') });
ok(/wajib diisi/.test(r.err ?? ''), 'sebutan kosong ditolak');
r = await rpc('dewan', 'sg_pengaturan_simpan', { p_kunci: 'sidang.nama_ketua', p_nilai: ('a'.repeat(121)) });
ok(/maksimal 120/.test(r.err ?? ''), 'nama ketua terlalu panjang ditolak');
const formatSalah = [
  ['', /wajib diisi/], ['{no3}/DK', /\{tahun\}/], ['DK/{tahun}', /kode nomor urut/], ['{no3}/{xx}/{tahun}', /tidak dikenal/], ['{no7}/{tahun}', /tidak dikenal/], ['{NO4}/{tahun}', /tidak dikenal/],
  ['{no3}/{tahun', /kurawal|tidak sah|hanya boleh/], ['{no3}/DK/{tahun}<', /hanya boleh/], ['{no3}/' + 'a'.repeat(80) + '/{tahun}', /maksimal 80/],
];
for (const [f, re] of formatSalah) { r = await rpc('dewan', 'sg_pengaturan_simpan', { p_kunci: 'sidang.format_nomor', p_nilai: (f) }); ok(re.test(r.err ?? ''), `format ditolak: "${f.slice(0, 30)}" -> ${(r.err ?? 'DITERIMA').slice(0, 60)}`); }
r = await rpc('dewan', 'sg_pengaturan_simpan', { p_kunci: 'sidang.format_nomor', p_nilai: ('{no}/DK-AMB/{romawi}/{tahun}') });
ok(!r.err, 'format sah diterima');
await rpc('dewan', 'sg_pengaturan_simpan', { p_kunci: 'sidang.format_nomor', p_nilai: ('{no3}/DK/{tahun}') });

console.log('\n--- Data uji sidang ---');
// Bagas: semua butir Bantara lulus (peserta lain diatur sendiri)
const lulusKan = (pid, tingkat) => pg.query(`
  insert into public.sku_progress (peserta_id, sku_id, status, tanggal_uji, penguji_id, nilai, verifikasi)
  select p.id, u.id, 'lulus', date '2026-09-01', (select id from public.profiles where username = 'pembina'), 'Baik', 'VRF-UJI'
  from public.profiles p join public.sku_unit u on u.tingkat = $2 and (u.agama is null or u.agama = p.agama) where p.id = $1
  on conflict (peserta_id, sku_id) do update set status = 'lulus', tanggal_uji = date '2026-09-01', verifikasi = 'VRF-UJI'`, [pid, tingkat]);
await lulusKan(bagas, 'Bantara');
await pg.query(`delete from public.sku_progress where peserta_id = '${rizky}'`);   // Rizky: belum ada butir lulus
const args = (o = {}) => ({ p_peserta_id: bagas, p_tingkat: 'Bantara', p_tanggal: '2026-09-15', p_keputusan: 'layak', p_magang: 'memenuhi', p_tugas_adat: 'lulus', p_tugas_adat_ket: 'Pengembaraan', p_catatan: '', p_nomor_manual: null, p_nta: null, ...o });

console.log('\n--- Menyimpan keputusan: aturan ---');
r = await rpc('peserta', 'sg_sidang_simpan', args());
ok(/Hanya Dewan Ambalan, Pembina, atau Admin/.test(r.err ?? ''), 'Penegak tidak boleh mencatat keputusan');
r = await rpc('dewan', 'sg_sidang_simpan', args({ p_peserta_id: rizky }));
ok(/Belum dapat dinyatakan Layak dan Lulus: capaian SKU Bantara baru 0 dari \d+ butir/.test(r.err ?? ''), 'Layak DIBLOKIR bila capaian belum 100%: ' + r.err);
ok((await pg.query('select count(*)::int c from public.sidang_dk')).rows[0].c === 0, 'blokir tidak meninggalkan baris');
ok((await pg.query('select count(*)::int c from public.sidang_urut')).rows[0].c === 0, 'blokir tidak memakai nomor urut');
r = await rpc('dewan', 'sg_sidang_simpan', args({ p_tanggal: '2099-01-01' }));
ok(/tidak boleh melewati hari ini/.test(r.err ?? ''), 'tanggal masa depan ditolak');
r = await rpc('dewan', 'sg_sidang_simpan', args({ p_tingkat: 'Garuda' }));
ok(/Tingkat SKU tidak dikenal/.test(r.err ?? ''), 'tingkat tidak dikenal ditolak');
r = await rpc('dewan', 'sg_sidang_simpan', args({ p_keputusan: 'lulus' }));
ok(/Pilih keputusan/.test(r.err ?? ''), 'keputusan tidak dikenal ditolak');
r = await rpc('dewan', 'sg_sidang_simpan', args({ p_magang: null }));
ok(/masa magang/.test(r.err ?? ''), 'masa magang wajib dipilih');
r = await rpc('dewan', 'sg_sidang_simpan', args({ p_tugas_adat: 'mungkin' }));
ok(/tugas tambahan adat/.test(r.err ?? ''), 'tugas adat wajib dipilih');
r = await rpc('dewan', 'sg_sidang_simpan', args({ p_peserta_id: K.dewan.id }));
ok(/Peserta tidak ditemukan/.test(r.err ?? ''), 'hanya peserta yang dapat disidangkan');
r = await rpc('dewan', 'sg_sidang_simpan', args({ p_nta: 'NTA<script>' }));
ok(/NTA hanya boleh/.test(r.err ?? ''), 'NTA tidak sah ditolak');
r = await rpc('dewan', 'sg_sidang_simpan', args({ p_catatan: 'x'.repeat(501) }));
ok(/maksimal 500/.test(r.err ?? ''), 'catatan terlalu panjang ditolak');
r = await rpc('dewan', 'sg_sidang_simpan', args({ p_peserta_id: rizky, p_keputusan: 'tunda' }));
ok(!r.err, 'Ditunda boleh untuk yang belum 100%: ' + (r.err ?? 'ok'));
const tunda = (await pg.query(`select * from public.sidang_dk where peserta_id = '${rizky}'`)).rows[0];
ok(tunda.capaian_total === 23 && tunda.capaian_lulus === 0 && tunda.butir_belum.length === 28, `capaian per BUTIR (${tunda.capaian_lulus}/${tunda.capaian_total}), butir belum per unit (${tunda.butir_belum.length})`);

console.log('\n--- Menyimpan keputusan: Layak, nomor, snapshot ---');
// Data contoh memasang Dewan contoh sebagai Pradana; di sini diuji jalur cadangan (pengaturan lama), jadi jabatan dikosongkan dulu (ketua dari Pradana: uji/jabatan-dewan.mjs)
await pg.query('update public.profiles set jabatan_dewan = null');
await rpc('dewan', 'sg_pengaturan_simpan', { p_kunci: 'sidang.nama_ketua', p_nilai: ('Andi Pradana') });
await rpc('dewan', 'sg_pengaturan_simpan', { p_kunci: 'sidang.sebutan_ketua', p_nilai: ('Pradana Dewan Ambalan') });
r = await rpc('dewan', 'sg_sidang_simpan', args({ p_nta: '11.03.10.701.00123' }));
ok(!r.err && Number.isInteger(r.data), 'Layak disimpan saat capaian 100%: id ' + r.data);
let s = (await pg.query(`select * from public.sidang_dk where id = ${r.data}`)).rows[0];
ok(s.nomor_ba === '002/DK/2026' && s.nomor_urut === 2, `nomor otomatis mengikuti urutan tahun (002/DK/2026): ${s.nomor_ba}`);
ok(s.ketua_nama === 'Andi Pradana' && s.ketua_sebutan === 'Pradana Dewan Ambalan', 'nama ketua dan sebutan dicatat saat sidang');
ok(s.nta === '11.03.10.701.00123' && (await pg.query(`select nta from public.profiles where id = '${bagas}'`)).rows[0].nta === '11.03.10.701.00123', 'NTA tersimpan di catatan dan profil');
ok(s.capaian_lulus === s.capaian_total && s.butir_belum.length === 0 && s.dibuat_oleh === K.dewan.id, 'capaian penuh dan pencatat tersimpan');
const idLayak = r.data;
r = await rpc('pembina', 'sg_sidang_simpan', args({ p_tanggal: '2026-09-16' }));
ok(/sudah dinyatakan Layak dan Lulus untuk SKU Bantara/.test(r.err ?? ''), 'Layak kedua kali untuk peserta+tingkat yang sama ditolak');
// pengaturan diubah kemudian tidak mengubah catatan lama
await rpc('admin', 'sg_pengaturan_simpan', { p_kunci: 'sidang.nama_ketua', p_nilai: ('Ketua Baru') });
s = (await pg.query(`select ketua_nama from public.sidang_dk where id = ${idLayak}`)).rows[0];
ok(s.ketua_nama === 'Andi Pradana', 'mengubah pengaturan tidak mengubah Berita Acara yang sudah tercatat');
// NTA berikutnya terisi dari profil
await lulusKan(bagas, 'Laksana');
r = await rpc('pembina', 'sg_sidang_simpan', args({ p_tingkat: 'Laksana', p_tanggal: '2026-09-17' }));
s = (await pg.query(`select nta, nomor_ba from public.sidang_dk where id = ${r.data}`)).rows[0];
ok(!r.err && s.nta === '11.03.10.701.00123' && s.nomor_ba === '003/DK/2026', `sidang berikutnya memakai NTA dari profil dan nomor 003: ${s.nomor_ba}`);
// nomor manual
const ahmadId = await idDari('10007');
r = await rpc('admin', 'sg_sidang_simpan', args({ p_peserta_id: rizky, p_keputusan: 'tunda', p_nomor_manual: '  001 / DK / 2026  ' }));
ok(/sudah dipakai|001/.test(r.err ?? '') || !r.err, 'nomor manual: ' + (r.err ?? 'diterima'));
r = await rpc('admin', 'sg_sidang_simpan', args({ p_peserta_id: rizky, p_keputusan: 'tunda', p_nomor_manual: 'BA-KHUSUS-7' }));
ok(!r.err, 'nomor manual unik diterima');
r = await rpc('admin', 'sg_sidang_simpan', args({ p_peserta_id: rizky, p_keputusan: 'tunda', p_nomor_manual: 'BA-KHUSUS-7' }));
ok(/sudah dipakai/.test(r.err ?? ''), 'nomor yang sama dua kali ditolak');
const urut1 = (await pg.query(`select terakhir from public.sidang_urut where tahun = 2026`)).rows[0].terakhir;
ok(urut1 === 3, `nomor manual tidak memakai penghitung (terakhir = ${urut1})`);
// tahun berbeda memulai dari 1 lagi
await pg.query(`insert into public.sku_progress (peserta_id, sku_id, status) select '${rizky}', id, 'lulus' from public.sku_unit where tingkat = 'Bantara' and (agama is null or agama = 'Islam') on conflict (peserta_id, sku_id) do update set status = 'lulus'`);
r = await rpc('dewan', 'sg_sidang_simpan', args({ p_peserta_id: rizky, p_tanggal: '2026-09-18' }));
ok(!r.err, 'peserta lain layak setelah semua lulus: ' + (r.err ?? 'ok'));
// tunda dengan semua lulus perlu catatan
await pg.query(`delete from public.sidang_dk where peserta_id = '${rizky}'`);
r = await rpc('dewan', 'sg_sidang_simpan', args({ p_peserta_id: rizky, p_keputusan: 'tunda' }));
ok(/isi catatan alasan penundaan/.test(r.err ?? ''), 'menunda padahal semua lulus wajib memberi alasan');
r = await rpc('dewan', 'sg_sidang_simpan', args({ p_peserta_id: rizky, p_keputusan: 'tunda', p_catatan: 'Belum tuntas tugas adat', p_tugas_adat: 'tidak' }));
ok(!r.err, 'menunda dengan catatan alasan diterima');

console.log('\n--- Hapus ---');
r = await rpc('dewan', 'sg_sidang_hapus', { p_id: idLayak });
ok(/Hanya Pembina dan Admin/.test(r.err ?? ''), 'Dewan tidak boleh menghapus catatan sidang');
r = await rpc('peserta', 'sg_sidang_hapus', { p_id: idLayak });
ok(/Hanya Pembina dan Admin/.test(r.err ?? ''), 'Penegak tidak boleh menghapus');
const sebelumUrut = (await pg.query(`select terakhir from public.sidang_urut where tahun = 2026`)).rows[0].terakhir;
r = await rpc('pembina', 'sg_sidang_hapus', { p_id: idLayak });
ok(!r.err && (await pg.query(`select count(*)::int c from public.sidang_dk where id = ${idLayak}`)).rows[0].c === 0, 'Pembina boleh menghapus');
ok((await pg.query(`select terakhir from public.sidang_urut where tahun = 2026`)).rows[0].terakhir === sebelumUrut, 'nomor urut tidak dipakai ulang setelah hapus');
r = await rpc('dewan', 'sg_sidang_simpan', args({ p_tanggal: '2026-09-19' }));
ok(!r.err, 'peserta yang catatan Layak-nya dihapus dapat disidangkan lagi');
s = (await pg.query(`select nomor_ba from public.sidang_dk where id = ${r.data}`)).rows[0];
ok(!/^00[123]\//.test(s.nomor_ba), `nomor baru tidak menabrak nomor lama: ${s.nomor_ba}`);
const bertahun = (await pg.query(`select tahun, terakhir from public.sidang_urut order by tahun`)).rows;
console.log('     penghitung:', JSON.stringify(bertahun));

console.log('\n--- Kode nomor baru dan pengaturan nomor urut ---');
for (const f of ['{no4}/DA/{romawi}/{tahun}', '{no2}-{tahun}', '{no5}.{bulan}.{tahun}', '{no6}/{tingkat}/{tahun}', '{no}/{tahun}']) {
  r = await rpc('dewan', 'sg_pengaturan_simpan', { p_kunci: 'sidang.format_nomor', p_nilai: f });
  ok(!r.err, `format baru diterima: ${f}`);
}
const hitungFmt = async (f, no, tgl) => (await pg.query('select sigarda.format_nomor($1, $2, $3::date, $4) as h', [f, no, tgl, 'Bantara'])).rows[0].h;
ok((await hitungFmt('{no4}/DA/{romawi}/{tahun}', 2, '2026-08-10')) === '0002/DA/VIII/2026', '{no4} menghasilkan 0002/DA/VIII/2026');
ok((await hitungFmt('{no2}/{no3}/{no5}/{no6}', 7, '2026-01-01')) === '07/007/00007/000007', 'lebar 2 sampai 6 angka');
ok((await hitungFmt('{no4}', 12345, '2026-01-01')) === '12345', 'angka lebih panjang dari lebar tidak dipotong (12345 dengan {no4})');
ok((await hitungFmt('{no3}', 1000, '2026-01-01')) === '1000', '{no3} untuk 1000 tetap 1000 (bukan 100)');
await rpc('dewan', 'sg_pengaturan_simpan', { p_kunci: 'sidang.format_nomor', p_nilai: '{no4}/DA/{romawi}/{tahun}' });
// atur nomor urut
r = await rpc('peserta', 'sg_sidang_urut_atur', { p_tahun: 2031, p_berikutnya: 5 });
ok(/Hanya Dewan Ambalan, Pembina/.test(r.err ?? ''), 'Penegak tidak boleh mengatur nomor urut');
r = await rpc('dewan', 'sg_sidang_urut_atur', { p_tahun: 1999, p_berikutnya: 5 });
ok(/Tahun tidak valid/.test(r.err ?? ''), 'tahun tidak valid ditolak');
r = await rpc('dewan', 'sg_sidang_urut_atur', { p_tahun: 2031, p_berikutnya: 0 });
ok(/antara 1 dan 999999/.test(r.err ?? ''), 'nomor 0 ditolak');
r = await rpc('dewan', 'sg_sidang_urut_atur', { p_tahun: 2031, p_berikutnya: 1000000 });
ok(/antara 1 dan 999999/.test(r.err ?? ''), 'nomor di atas 999999 ditolak');
r = await rpc('dewan', 'sg_sidang_urut_atur', { p_tahun: 2031, p_berikutnya: 12 });
ok(!r.err && (await pg.query('select terakhir from public.sidang_urut where tahun = 2031')).rows[0].terakhir === 11, 'tahun baru: berikutnya 12 -> penghitung 11');
// nomor terpakai pada tahun berjalan tidak boleh diputar mundur
const tertinggi = (await pg.query(`select coalesce(max(nomor_urut), 0) m from public.sidang_dk where extract(year from tanggal) = 2026`)).rows[0].m;
r = await rpc('pembina', 'sg_sidang_urut_atur', { p_tahun: 2026, p_berikutnya: tertinggi });
ok(new RegExp(`Nomor ${tertinggi} sudah terpakai`).test(r.err ?? ''), `tidak boleh mundur ke nomor yang sudah terpakai (${tertinggi}): ` + (r.err ?? '').slice(0, 70));
r = await rpc('pembina', 'sg_sidang_urut_atur', { p_tahun: 2026, p_berikutnya: tertinggi + 10 });
ok(!r.err, 'boleh melompat maju');
// simpan berikutnya memakai nomor yang diatur, mengikuti format {no4}/DA/{romawi}/{tahun} dan tanggal sidang
await pg.query(`delete from public.sidang_dk where peserta_id = '${bagas}'`);
r = await rpc('dewan', 'sg_sidang_simpan', args({ p_tanggal: '2026-09-18' }));
const sNo = (await pg.query(`select nomor_ba, nomor_urut from public.sidang_dk where id = ${r.data}`)).rows[0];
ok(!r.err && sNo.nomor_urut === tertinggi + 10 && sNo.nomor_ba === `${String(tertinggi + 10).padStart(4, '0')}/DA/IX/2026`, `nomor sesudah diatur: ${sNo.nomor_ba}`);
// nomor urut tahun lain terpisah
r = await rpc('dewan', 'sg_sidang_urut_atur', { p_tahun: 2026, p_berikutnya: tertinggi + 30 });
ok(!r.err, 'boleh diatur ulang maju lagi setelah dipakai');

console.log('\n--- Akun wajib ganti PIN ---');
await pg.query(`update public.profiles set wajib_ganti_pin = true where username = 'dewan'`);
r = await rpc('dewan', 'sg_sidang_simpan', args({ p_peserta_id: rizky, p_keputusan: 'tunda' }));
ok(/Ganti PIN awal/.test(r.err ?? ''), 'akun yang wajib ganti PIN ditolak: ' + (r.err ?? '').slice(0, 50));
r = await rpc('dewan', 'sg_pengaturan_simpan', { p_kunci: 'sidang.nama_ketua', p_nilai: ('x') });
ok(/Ganti PIN awal/.test(r.err ?? ''), 'pengaturan juga ditolak untuk akun wajib ganti PIN');

console.log(`\nRINGKASAN SIDANG: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
