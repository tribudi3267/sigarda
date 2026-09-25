// Tahap 2 (G2): TKK di server (PGlite): katalog = src/data/tkkData.js, hak, validasi, urutan tingkat Purwa > Madya > Utama, koreksi dan hapus, RLS baca, ambang
// (pengaturan tkk.ambang), TKK Krida, Penegak tak aktif, dan cadangan. Logika klien: uji/tkk-klien.mjs. Migrasi: uji/migrasi-tkk.mjs.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { AMBANG_TKK_BAWAAN, KATALOG_TKK } from '../src/data/tkkData.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const K = { admin: await masuk('admin', PIN_DEMO.admin), pembina: await masuk('pembina', PIN_DEMO.pembina), dewan: await masuk('dewan', PIN_DEMO.dewan) };
const NIS = ['10231', '10232', '10118'];
const N = {}; for (const nis of NIS) N[nis] = await masuk(nis, PIN_DEMO.penegak);
const [ahmad, siti, dimas] = NIS.map((n) => N[n].id);
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const cocok = (r, re) => !r.ok && re.test(r.pesan ?? '');
const geser = async (n) => (await q(`select (sigarda.hari_ini() + $1::int)::text d`, [n]))[0].d;
const [t60, t30, t10, tDepan] = [await geser(-60), await geser(-30), await geser(-10), await geser(3)];
const catat = (id, pid, tkk, tk, tgl, p1 = 'Pak Budi', p2 = 'Bu Sari', melatih = 'Andi, Siaga Gugus Depan 02', url = '', cat = '') =>
  sebagai(id, 'select public.sg_tkk_catat($1::uuid, $2, $3, $4::date, $5, $6, $7, $8, $9) as id', [pid, tkk, tk, tgl, p1, p2, melatih, url, cat]);
const baris = (pid) => q('select tkk_id, tingkat, tanggal::text t from public.tkk_capaian where peserta_id = $1 order by tkk_id, tanggal', [pid]);
const tulisSku = (pid, tingkat) => q(
  `insert into public.sku_progress (peserta_id, sku_id, status) select p.id, u.id, 'lulus' from public.profiles p join public.sku_unit u on u.tingkat = $2 and (u.agama is null or u.agama = p.agama)
   where p.id = $1 on conflict (peserta_id, sku_id) do update set status = 'lulus'`, [pid, tingkat]);

console.log('--- Katalog dan ambang bawaan ---');
{
  const rows = await q('select id, nama, bidang, golongan, agama, sumber, urut from public.tkk_katalog order by urut');
  ok(rows.length === KATALOG_TKK.length && rows.every((r, i) => JSON.stringify(r) === JSON.stringify({ id: KATALOG_TKK[i].id, nama: KATALOG_TKK[i].nama, bidang: KATALOG_TKK[i].bidang, golongan: KATALOG_TKK[i].golongan, agama: KATALOG_TKK[i].agama, sumber: KATALOG_TKK[i].sumber, urut: KATALOG_TKK[i].urut })),
    `tabel tkk_katalog sama dengan src/data/tkkData.js (${rows.length} TKK)`);
  const a = (await q(`select nilai from public.pengaturan where kunci = 'tkk.ambang'`))[0]?.nilai;
  ok(JSON.stringify(a) === JSON.stringify(AMBANG_TKK_BAWAAN) || (a.total === 45 && a.madya === 3 && a.utamaWajib.join() === AMBANG_TKK_BAWAAN.utamaWajib.join()), 'ambang bawaan pada pengaturan sama dengan AMBANG_TKK_BAWAAN');
  ok(AMBANG_TKK_BAWAAN.utamaWajib.every((id) => rows.some((r) => r.id === id && r.golongan === 'penegak')), 'semua TKK wajib Utama ada di katalog dan berlaku untuk Penegak');
}

console.log('\n--- Persiapan: Siti dan Dimas selesai Bantara (Siti Islam, Dimas Hindu); Ahmad belum ---');
await q('delete from public.sku_progress where peserta_id = any($1::uuid[])', [[ahmad, siti, dimas]]);
for (const id of [siti, dimas]) await tulisSku(id, 'Bantara');
await q(`update public.profiles set agama = 'Islam' where id = $1`, [siti]);
await q(`update public.profiles set agama = 'Hindu' where id = $1`, [dimas]);
await q(`delete from public.sku_progress where peserta_id = $1 and sku_id like 'BAN-01-%' and sku_id not like 'BAN-01-HIN-%'`, [dimas]);
await tulisSku(dimas, 'Bantara');

console.log('\n--- Hak dan validasi capaian ---');
let r = await catat(siti, siti, 'juru-masak', 'purwa', t60);
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'Penegak tidak dapat mencatat TKK');
r = await catat(K.dewan.id, siti, 'juru-masak', 'purwa', t60);
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'akun Dewan lama tidak dapat mencatat TKK');
r = await catat(K.pembina.id, K.pembina.id, 'juru-masak', 'purwa', t60);
ok(cocok(r, /Pilih Penegak/), 'hanya untuk Penegak');
r = await catat(K.pembina.id, ahmad, 'juru-masak', 'purwa', t60);
ok(cocok(r, /belum menyelesaikan SKU Bantara/), 'Penegak yang belum selesai Bantara ditolak (nama tampil)');
r = await catat(K.pembina.id, siti, 'tidak-ada', 'purwa', t60);
ok(cocok(r, /TKK tidak dikenal/), 'TKK tidak dikenal');
r = await catat(K.pembina.id, siti, 'pengatur-ruangan', 'purwa', t60);
ok(cocok(r, /khusus golongan Siaga/), 'TKK khusus Siaga ditolak');
r = await catat(K.pembina.id, dimas, 'sholat', 'purwa', t60);
ok(cocok(r, /khusus penganut agama Islam/), 'TKK khusus Islam (Sholat) ditolak untuk Penegak Hindu');
r = await catat(K.pembina.id, siti, 'sholat', 'purwa', t60);
ok(r.ok, 'TKK khusus Islam (Sholat) diterima untuk Penegak Islam ' + (r.pesan ?? ''));
await q('delete from public.tkk_capaian');
r = await catat(K.pembina.id, siti, 'juru-masak', 'garuda', t60);
ok(cocok(r, /Purwa, Madya, atau Utama/), 'tingkat tidak sah');
r = await catat(K.pembina.id, siti, 'juru-masak', 'purwa', null);
ok(cocok(r, /Tanggal lulus wajib/), 'tanggal wajib');
r = await catat(K.pembina.id, siti, 'juru-masak', 'purwa', tDepan);
ok(cocok(r, /masa depan/), 'tanggal masa depan ditolak');
r = await catat(K.pembina.id, siti, 'juru-masak', 'purwa', '1999-12-31');
ok(cocok(r, /sebelum tahun 2000/), 'tanggal sebelum tahun 2000 ditolak');
r = await catat(K.pembina.id, siti, 'juru-masak', 'purwa', t60, '', 'Bu Sari');
ok(cocok(r, /nama kedua penguji/), 'penguji pertama wajib');
r = await catat(K.pembina.id, siti, 'juru-masak', 'purwa', t60, 'Pak Budi', 'a<b');
ok(cocok(r, /nama kedua penguji/), 'penguji tanpa tanda < atau >');
r = await catat(K.pembina.id, siti, 'juru-masak', 'purwa', t60, 'Pak Budi', ' pak   BUDI ');
ok(cocok(r, /dua orang yang berbeda/), 'kedua penguji harus berbeda (huruf besar/kecil dan spasi diabaikan)');
r = await catat(K.pembina.id, siti, 'juru-masak', 'purwa', t60, 'Pak Budi', 'Bu Sari', '   ');
ok(cocok(r, /bukti melatih/), 'bukti melatih wajib');
r = await catat(K.pembina.id, siti, 'juru-masak', 'purwa', t60, 'Pak Budi', 'Bu Sari', 'Andi', 'ftp://x/y');
ok(cocok(r, /http:\/\/ atau https:\/\//), 'tautan bukti harus http(s)');
r = await catat(K.pembina.id, siti, 'juru-masak', 'purwa', t60, 'Pak Budi', 'Bu Sari', 'Andi', 'https://a b');
ok(cocok(r, /tanpa spasi/), 'tautan bukti tanpa spasi');
ok((await baris(siti)).length === 0, 'percobaan yang ditolak tidak meninggalkan baris');

console.log('\n--- Urutan tingkat Purwa > Madya > Utama, koreksi, dan hapus ---');
r = await catat(K.pembina.id, siti, 'juru-masak', 'madya', t30);
ok(cocok(r, /Utama butuh Madya, dan Madya butuh Purwa/), 'Madya tanpa Purwa ditolak');
r = await catat(K.pembina.id, siti, 'juru-masak', 'utama', t30);
ok(cocok(r, /Utama butuh Madya/), 'Utama tanpa Madya ditolak');
r = await catat(K.pembina.id, siti, 'juru-masak', 'purwa', t60, 'Pak Budi', 'Bu Sari', 'Andi, Siaga', 'https://drive.example/piagam', 'lulus uji');
ok(r.ok && Number(r.rows[0].id) > 0, 'Pembina mencatat Purwa ' + (r.pesan ?? ''));
const idPurwa = Number(r.rows[0].id);
r = await catat(K.pembina.id, siti, 'juru-masak', 'madya', t60);
ok(r.ok, 'Madya pada tanggal yang sama dengan Purwa diterima');
r = await catat(K.pembina.id, siti, 'juru-masak', 'madya', await geser(-70));
ok(cocok(r, /tidak boleh sebelum tanggal tingkat di bawahnya/), 'Madya sebelum Purwa ditolak');
r = await catat(K.admin.id, siti, 'juru-masak', 'madya', t30, 'Pak Budi', 'Bu Dewi', 'Budi, Purwa');
ok(r.ok, 'Admin mengoreksi Madya (tanggal dan penguji)');
let b = await baris(siti);
ok(b.length === 2 && b.find((x) => x.tingkat === 'madya').t === t30, 'koreksi mengganti catatan, bukan menggandakan');
r = await catat(K.pembina.id, siti, 'juru-masak', 'purwa', t10);
ok(cocok(r, /tidak boleh sesudah tanggal tingkat di atasnya/), 'koreksi Purwa yang melewati tanggal Madya ditolak');
r = await catat(K.pembina.id, siti, 'juru-masak', 'utama', t10);
ok(r.ok, 'Utama sesudah Madya');
r = await sebagai(K.pembina.id, 'select public.sg_tkk_hapus($1)', [idPurwa]);
ok(cocok(r, /Hapus tingkat yang lebih tinggi/), 'Purwa tidak dapat dihapus selama Madya masih ada');
r = await sebagai(siti, 'select public.sg_tkk_hapus($1)', [idPurwa]);
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'Penegak tidak dapat menghapus');
for (const tk of ['utama', 'madya', 'purwa']) {
  const id = (await q(`select id from public.tkk_capaian where peserta_id = $1 and tkk_id = 'juru-masak' and tingkat = $2`, [siti, tk]))[0].id;
  r = await sebagai(K.pembina.id, 'select public.sg_tkk_hapus($1)', [id]);
  if (!r.ok) break;
}
ok(r.ok && (await baris(siti)).length === 0, 'dihapus berurutan dari Utama ke Purwa: semua bersih');
r = await sebagai(K.pembina.id, 'select public.sg_tkk_hapus($1)', [idPurwa]);
ok(cocok(r, /tidak ditemukan/), 'menghapus yang sudah tidak ada: pesan jelas');

console.log('\n--- RLS baca ---');
await catat(K.pembina.id, siti, 'penabung', 'purwa', t60);
await catat(K.pembina.id, dimas, 'penabung', 'purwa', t60);
r = await sebagai(siti, 'select peserta_id from public.tkk_capaian');
ok(r.ok && r.rows.length === 1 && r.rows[0].peserta_id === siti, 'Penegak hanya membaca capaian miliknya');
r = await sebagai(K.pembina.id, 'select id from public.tkk_capaian');
ok(r.ok && r.rows.length === 2, 'Pembina membaca semua');
r = await sebagai(K.dewan.id, 'select id from public.tkk_capaian');
ok(r.ok && r.rows.length === 2, 'Dewan (pengurus) membaca semua');
r = await sebagai(siti, 'select id from public.tkk_katalog');
ok(r.ok && r.rows.length === KATALOG_TKK.length, 'katalog dibaca semua pengguna aktif');
r = await sebagai(siti, `insert into public.tkk_capaian (peserta_id, tkk_id, tingkat, tanggal, penguji1, penguji2, melatih) values ($1, 'juru-kebun', 'purwa', current_date, 'a', 'b', 'c')`, [siti]);
ok(!r.ok, 'Penegak tidak dapat menulis langsung ke tabel capaian');
r = await sebagai(K.pembina.id, `update public.tkk_katalog set nama = 'x'`);
ok(!r.ok || r.rows.length === 0, 'katalog tidak dapat diubah lewat klien');

console.log('\n--- Ambang ---');
const ambang = (id, nilai) => sebagai(id, 'select public.sg_tkk_ambang_simpan($1::jsonb)', [JSON.stringify(nilai)]);
r = await ambang(siti, { total: 40, madya: 3, utamaWajib: ['penabung'] });
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'Penegak tidak dapat mengubah ambang');
r = await ambang(K.pembina.id, [1, 2]);
ok(cocok(r, /Bentuk ambang TKK tidak sah/), 'bukan objek ditolak');
r = await ambang(K.pembina.id, { total: 40, madya: 3, utamaWajib: ['penabung'], lain: 1 });
ok(cocok(r, /Bentuk ambang TKK tidak sah/), 'kunci tambahan ditolak');
r = await ambang(K.pembina.id, { total: '40', madya: 3, utamaWajib: [] });
ok(cocok(r, /Bentuk ambang TKK tidak sah/), 'total bukan angka ditolak');
r = await ambang(K.pembina.id, { total: 40.5, madya: 3, utamaWajib: [] });
ok(cocok(r, /bilangan bulat/), 'bilangan pecahan ditolak');
r = await ambang(K.pembina.id, { total: 0, madya: 0, utamaWajib: [] });
ok(cocok(r, /1 sampai 200/), 'total 0 ditolak');
r = await ambang(K.pembina.id, { total: 201, madya: 0, utamaWajib: [] });
ok(cocok(r, /1 sampai 200/), 'total di atas 200 ditolak');
r = await ambang(K.pembina.id, { total: 40, madya: 101, utamaWajib: [] });
ok(cocok(r, /0 sampai 100/), 'Madya di atas 100 ditolak');
r = await ambang(K.pembina.id, { total: 40, madya: 3, utamaWajib: ['penabung', 'penabung'] });
ok(cocok(r, /tidak boleh berulang/), 'TKK wajib tidak boleh berulang');
r = await ambang(K.pembina.id, { total: 40, madya: 3, utamaWajib: ['tidak-ada'] });
ok(cocok(r, /tidak dikenal atau khusus Siaga/), 'TKK wajib tidak dikenal ditolak');
r = await ambang(K.pembina.id, { total: 40, madya: 3, utamaWajib: ['pengatur-ruangan'] });
ok(cocok(r, /tidak dikenal atau khusus Siaga/), 'TKK khusus Siaga tidak boleh wajib');
r = await ambang(K.pembina.id, { total: 4, madya: 3, utamaWajib: ['penabung', 'juru-masak'] });
ok(cocok(r, /memuat semua TKK wajib Utama ditambah TKK Madya/), 'total harus memuat wajib Utama dan Madya');
r = await ambang(K.pembina.id, { total: 30, madya: 2, utamaWajib: ['penabung', 'juru-masak'] });
ok(r.ok, 'Pembina mengubah ambang (30 TKK, 2 Madya, 2 wajib) ' + (r.pesan ?? ''));
{
  const n = (await q(`select nilai from public.pengaturan where kunci = 'tkk.ambang'`))[0].nilai;
  ok(n.total === 30 && n.madya === 2 && n.utamaWajib.join() === 'penabung,juru-masak', 'ambang baru tersimpan (urutan TKK wajib dipertahankan)');
}
r = await ambang(K.admin.id, AMBANG_TKK_BAWAAN);
ok(r.ok, 'Admin mengembalikan ambang bawaan');

console.log('\n--- TKK Krida ---');
const krida = (id, pid, nama, saka = 'Saka Bhayangkara', tgl = t30, url = '', cat = '', idK = null) =>
  sebagai(id, 'select public.sg_tkk_krida_simpan($1::bigint, $2::uuid, $3, $4, $5::date, $6, $7) as id', [idK, pid, nama, saka, tgl, url, cat]);
r = await krida(siti, siti, 'Krida Lalu Lintas');
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'Penegak tidak dapat mencatat Krida');
r = await krida(K.pembina.id, siti, '   ');
ok(cocok(r, /Nama TKK Krida wajib/), 'nama Krida wajib');
r = await krida(K.pembina.id, siti, 'Krida Lalu Lintas', 'Saka Bhayangkara', tDepan);
ok(cocok(r, /masa depan/), 'tanggal Krida masa depan ditolak');
r = await krida(K.pembina.id, siti, 'Krida Lalu Lintas', 'a<b');
ok(cocok(r, /Nama Saka maksimal/), 'nama Saka tanpa tanda < atau >');
r = await krida(K.pembina.id, siti, 'Krida Lalu Lintas', 'Saka Bhayangkara', t30, 'https://drive.example/krida');
ok(r.ok, 'Pembina mencatat Krida');
const idKrida = Number(r.rows[0].id);
r = await krida(K.admin.id, siti, ' krida   LALU lintas ');
ok(cocok(r, /sudah tercatat memiliki TKK Krida/), 'nama Krida yang sama tidak digandakan');
r = await krida(K.pembina.id, siti, 'Krida Lalu Lintas', 'Saka Bhayangkara', t10, '', 'ulang', idKrida);
ok(r.ok && (await q('select tanggal::text t, catatan from public.tkk_krida where id = $1', [idKrida]))[0].t === t10, 'mengubah catatan Krida');
r = await sebagai(dimas, 'select id from public.tkk_krida');
ok(r.ok && r.rows.length === 0, 'Penegak lain tidak melihat Krida Siti');
r = await sebagai(siti, 'select public.sg_tkk_krida_hapus($1)', [idKrida]);
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'Penegak tidak dapat menghapus Krida');
r = await sebagai(K.pembina.id, 'select public.sg_tkk_krida_hapus($1)', [idKrida]);
ok(r.ok && (await q('select count(*)::int n from public.tkk_krida'))[0].n === 0, 'Pembina menghapus Krida');
await krida(K.pembina.id, siti, 'Krida Pertolongan');

console.log('\n--- Penegak tidak aktif dan cadangan ---');
r = await sebagai(K.pembina.id, `select public.sg_anggota_status_atur($1, 'nonaktif', 'tidak melanjutkan', null)`, [siti]);
ok(r.ok, 'Siti dinonaktifkan');
r = await catat(K.pembina.id, siti, 'juru-kebun', 'purwa', t30);
ok(cocok(r, /tidak aktif/), 'TKK untuk Penegak nonaktif ditolak');
r = await krida(K.pembina.id, siti, 'Krida Baru');
ok(cocok(r, /tidak aktif/), 'Krida untuk Penegak nonaktif ditolak');
try { await q(`update public.tkk_capaian set catatan = 'ubah' where peserta_id = $1`, [siti]); ok(false, 'pemicu menolak ubahan langsung'); }
catch (e) { ok(/tidak aktif|nonaktif|alumni/i.test(e.message), 'pemicu tolak_peserta_tak_aktif menolak ubahan langsung pada Penegak nonaktif'); }
r = await sebagai(K.admin.id, 'select public.sg_cadangan_admin() as d');
const cad = r.rows?.[0]?.d; const data = cad?.data ?? cad?.tabel ?? cad;
ok(r.ok && Array.isArray(data.tkk_capaian) && data.tkk_capaian.length === 2 && Array.isArray(data.tkk_krida) && data.tkk_krida.length === 1 && data.tkk_katalog === undefined, 'cadangan memuat tkk_capaian dan tkk_krida (katalog tidak ikut: dibangkitkan dari kode)');

console.log(`\nRINGKASAN TKK: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
