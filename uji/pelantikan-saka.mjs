// Tahap 2 (G1): pencatatan pelantikan Bantara/Laksana dan keanggotaan Saka di server (PGlite): hak, validasi, semua-atau-tidak-sama-sekali, koreksi, tautan Agenda,
// RLS baca, Penegak tak aktif, dan cadangan. Logika klien: uji/pelantikan-klien.mjs. Migrasi: uji/migrasi-pelantikan-saka.mjs.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { tahunAjaranKini } from '../src/lib/rombelLogic.js';

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
const NIS = ['10231', '10232', '10118', '10007', '10233'];
const N = {}; for (const nis of NIS) N[nis] = await masuk(nis, PIN_DEMO.penegak);
const [ahmad, siti, dimas, bagas, rizky] = NIS.map((n) => N[n].id);
const ta = tahunAjaranKini();
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const cocok = (r, re) => !r.ok && re.test(r.pesan ?? '');
const hari = (await q('select sigarda.hari_ini()::text d'))[0].d;
const geser = async (n) => (await q(`select (sigarda.hari_ini() + $1::int)::text d`, [n]))[0].d;
const catat = (id, tk, tgl, tempat, ids, agenda = null, cat = '') => sebagai(id, 'select public.sg_pelantikan_catat($1, $2::date, $3, $4::uuid[], $5::bigint, $6) as n', [tk, tgl, tempat, ids, agenda, cat]);
const baris = (tk) => q('select p.username, l.tanggal::text, l.tempat, l.agenda_id, l.catatan from public.pelantikan l join public.profiles p on p.id = l.peserta_id where l.tingkat = $1 order by p.username', [tk]);
const tulisSku = (pid, tingkat) => q(
  `insert into public.sku_progress (peserta_id, sku_id, status) select p.id, u.id, 'lulus' from public.profiles p join public.sku_unit u on u.tingkat = $2 and (u.agama is null or u.agama = p.agama)
   where p.id = $1 on conflict (peserta_id, sku_id) do update set status = 'lulus'`, [pid, tingkat]);

console.log('--- Persiapan: Siti, Dimas, Bagas lulus Bantara; Bagas juga Laksana; Ahmad belum ---');
await q('delete from public.sku_progress where peserta_id = any($1::uuid[])', [[ahmad, siti, dimas, bagas, rizky]]);
for (const id of [siti, dimas, bagas]) await tulisSku(id, 'Bantara');
await tulisSku(bagas, 'Laksana');
const tglLalu = await geser(-30), tglLebihLalu = await geser(-60), tglDepan = await geser(3);

console.log('\n--- Hak dan validasi pelantikan ---');
let r = await catat(ahmad, 'bantara', tglLalu, 'Lapangan', [siti]);
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'Penegak tidak dapat mencatat pelantikan');
r = await catat(K.dewan.id, 'bantara', tglLalu, 'Lapangan', [siti]);
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'akun Dewan lama tidak dapat mencatat pelantikan');
r = await catat(K.pembina.id, 'garuda', tglLalu, 'Lapangan', [siti]);
ok(cocok(r, /Bantara atau Laksana/), 'tingkat selain Bantara/Laksana ditolak');
r = await catat(K.pembina.id, 'bantara', null, 'Lapangan', [siti]);
ok(cocok(r, /Tanggal pelantikan wajib/), 'tanggal wajib');
r = await catat(K.pembina.id, 'bantara', tglDepan, 'Lapangan', [siti]);
ok(cocok(r, /masa depan/), 'tanggal masa depan ditolak (dicatat sesudah terlaksana)');
r = await catat(K.pembina.id, 'bantara', '1999-05-01', 'Lapangan', [siti]);
ok(cocok(r, /sebelum tahun 2000/), 'tanggal sebelum tahun 2000 ditolak');
r = await catat(K.pembina.id, 'bantara', tglLalu, '   ', [siti]);
ok(cocok(r, /Tempat pelantikan wajib/), 'tempat wajib');
r = await catat(K.pembina.id, 'bantara', tglLalu, 'Aula <b>', [siti]);
ok(cocok(r, /Tempat pelantikan wajib/), 'tempat tanpa tanda < atau >');
r = await catat(K.pembina.id, 'bantara', tglLalu, 'Lapangan', []);
ok(cocok(r, /sedikitnya satu Penegak/), 'daftar Penegak tidak boleh kosong');
r = await catat(K.pembina.id, 'bantara', tglLalu, 'Lapangan', [K.pembina.id]);
ok(cocok(r, /bukan Penegak/), 'Pembina bukan Penegak: ditolak');
r = await catat(K.pembina.id, 'bantara', tglLalu, 'Lapangan', [ahmad]);
ok(cocok(r, /belum menyelesaikan seluruh butir SKU Bantara/), 'Penegak yang belum menyelesaikan SKU Bantara ditolak (nama tampil)');
r = await catat(K.pembina.id, 'laksana', tglLalu, 'Lapangan', [siti]);
ok(cocok(r, /belum menyelesaikan seluruh butir SKU Laksana/), 'Laksana: Siti baru Bantara, ditolak');
ok((await baris('bantara')).length === 0 && (await baris('laksana')).length === 0, 'tidak ada baris tercatat oleh percobaan yang ditolak');

console.log('\n--- Semua atau tidak sama sekali, koreksi, dan Agenda ---');
r = await catat(K.pembina.id, 'bantara', tglLalu, 'Lapangan', [siti, dimas, ahmad]);
ok(cocok(r, /Ahmad.*belum menyelesaikan/) && (await baris('bantara')).length === 0, 'satu Penegak tidak layak: seluruh pencatatan dibatalkan (Siti dan Dimas tidak tersimpan)');
r = await catat(K.pembina.id, 'bantara', tglLalu, 'Lapangan Upacara SMAN 1 Bukateja', [siti, dimas, bagas, siti], null, 'Pelantikan angkatan 2026');
ok(r.ok && r.rows[0].n === 3, 'Pembina mencatat 3 Penegak Bantara (duplikat id dihitung sekali) ' + (r.pesan ?? ''));
let b = await baris('bantara');
ok(b.length === 3 && b.every((x) => x.tanggal === tglLalu && x.tempat === 'Lapangan Upacara SMAN 1 Bukateja' && x.catatan === 'Pelantikan angkatan 2026'), 'baris tersimpan lengkap');
r = await catat(K.admin.id, 'bantara', tglLebihLalu, 'Aula', [siti]);
ok(r.ok && r.rows[0].n === 1, 'Admin mengoreksi tanggal dan tempat Siti (mencatat ulang mengganti, bukan menggandakan)');
b = await baris('bantara');
ok(b.length === 3 && b.find((x) => x.username === '10232').tanggal === tglLebihLalu && b.find((x) => x.username === '10232').tempat === 'Aula', 'Siti diperbarui, jumlah baris tetap 3');
ok((await q(`select dicatat_oleh = $1 as oleh from public.pelantikan l join public.profiles p on p.id = l.peserta_id where p.username = '10232'`, [K.admin.id]))[0].oleh, 'pencatat terakhir tersimpan');
// Agenda
const agBantara = (await sebagai(K.pembina.id, `select public.sg_agenda_simpan(null, $1, 'pelantikan_bantara', 'Pelantikan Bantara', $2::date, '', '{}'::uuid[], false) as id`, [ta, tglDepan])).rows?.[0]?.id;
const agSidang = (await sebagai(K.pembina.id, `select public.sg_agenda_simpan(null, $1, 'perkemahan', 'Perkemahan', $2::date, '', '{}'::uuid[], false) as id`, [ta, tglDepan])).rows?.[0]?.id;
ok(!!agBantara && !!agSidang, 'dua kegiatan Agenda dibuat (pelantikan Bantara dan perkemahan)');
r = await catat(K.pembina.id, 'laksana', tglLalu, 'Lapangan', [bagas], agBantara);
ok(cocok(r, /bukan pelantikan Laksana/), 'kegiatan Agenda harus berjenis pelantikan tingkat yang sama');
r = await catat(K.pembina.id, 'bantara', tglLalu, 'Lapangan', [dimas], agSidang);
ok(cocok(r, /bukan pelantikan Bantara/), 'kegiatan Agenda berjenis lain ditolak');
r = await catat(K.pembina.id, 'bantara', tglLalu, 'Lapangan', [dimas], agBantara);
ok(r.ok && (await baris('bantara')).find((x) => x.username === '10118').agenda_id === Number(agBantara), 'pelantikan terhubung ke kegiatan Agenda');
r = await sebagai(K.pembina.id, 'select public.sg_agenda_hapus($1)', [agBantara]);
ok(r.ok && (await baris('bantara')).find((x) => x.username === '10118').agenda_id === null, 'kegiatan Agenda dihapus: catatan pelantikan tetap, tautannya kosong (set null)');

console.log('\n--- Pelantikan Laksana: sesudah Bantara ---');
r = await catat(K.pembina.id, 'laksana', tglLebihLalu, 'Lapangan', [bagas]);
ok(cocok(r, /harus sesudah pelantikan Bantaranya/), 'Laksana pada tanggal yang sama atau sebelum Bantara ditolak');
r = await catat(K.pembina.id, 'laksana', hari, 'Lapangan', [bagas]);
ok(r.ok && (await baris('laksana')).length === 1, 'Bagas dilantik Laksana sesudah Bantaranya');
r = await catat(K.pembina.id, 'bantara', hari, 'Lapangan', [bagas]);
ok(r.ok, 'Bantara dapat dikoreksi tanpa memeriksa Laksananya (urutan hanya diperiksa saat mencatat Laksana)');
await catat(K.pembina.id, 'bantara', tglLalu, 'Lapangan', [bagas]);

console.log('\n--- Hapus pelantikan ---');
const idBagasLak = (await q(`select l.id from public.pelantikan l join public.profiles p on p.id = l.peserta_id where p.username = '10007' and l.tingkat = 'laksana'`))[0].id;
r = await sebagai(ahmad, 'select public.sg_pelantikan_hapus($1)', [idBagasLak]);
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'Penegak tidak dapat menghapus');
r = await sebagai(K.pembina.id, 'select public.sg_pelantikan_hapus($1)', [idBagasLak]);
ok(r.ok && (await baris('laksana')).length === 0, 'Pembina menghapus catatan Laksana Bagas');
r = await sebagai(K.pembina.id, 'select public.sg_pelantikan_hapus($1)', [idBagasLak]);
ok(cocok(r, /tidak ditemukan/), 'menghapus yang sudah tidak ada: pesan jelas');

console.log('\n--- RLS baca ---');
r = await sebagai(siti, 'select p.username from public.pelantikan l join public.profiles p on p.id = l.peserta_id');
ok(r.ok && r.rows.length === 1 && r.rows[0].username === '10232', 'Penegak hanya membaca pelantikan miliknya');
r = await sebagai(K.pembina.id, 'select id from public.pelantikan');
ok(r.ok && r.rows.length === 3, 'Pembina membaca semua');
r = await sebagai(K.dewan.id, 'select id from public.pelantikan');
ok(r.ok && r.rows.length === 3, 'Dewan (pengurus) membaca semua');
r = await sebagai(siti, `insert into public.pelantikan (peserta_id, tingkat, tanggal, tempat) values ($1, 'laksana', current_date, 'x')`, [siti]);
ok(!r.ok, 'Penegak tidak dapat menulis langsung ke tabel');
r = await sebagai(K.pembina.id, `update public.pelantikan set tempat = 'x'`);
ok(!r.ok || r.rows.length === 0, 'Pembina pun tidak dapat menulis langsung (hanya lewat fungsi)');

console.log('\n--- Saka ---');
const saka = (id, pid, nama, masuk = tglLalu, status = 'aktif', selesai = null, url = '', cat = '', idSaka = null) =>
  sebagai(id, 'select public.sg_saka_simpan($1::bigint, $2::uuid, $3, $4::date, $5, $6::date, $7, $8) as id', [idSaka, pid, nama, masuk, status, selesai, url, cat]);
r = await saka(ahmad, ahmad, 'Saka Bhayangkara');
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'Penegak tidak dapat mencatat Saka');
r = await saka(K.pembina.id, K.pembina.id, 'Saka Bhayangkara');
ok(cocok(r, /Pilih Penegak/), 'hanya untuk Penegak');
r = await saka(K.pembina.id, ahmad, '   ');
ok(cocok(r, /Nama Saka wajib/), 'nama Saka wajib');
r = await saka(K.pembina.id, ahmad, 'Saka Bhayangkara', tglDepan);
ok(cocok(r, /masa depan/), 'tanggal masuk di masa depan ditolak');
r = await saka(K.pembina.id, ahmad, 'Saka Bhayangkara', tglLalu, 'aktif', tglLalu);
ok(cocok(r, /tidak punya tanggal selesai/), 'aktif tidak boleh bertanggal selesai');
r = await saka(K.pembina.id, ahmad, 'Saka Bhayangkara', tglLalu, 'selesai', null);
ok(cocok(r, /Isi tanggal selesai/), 'selesai wajib bertanggal selesai');
r = await saka(K.pembina.id, ahmad, 'Saka Bhayangkara', tglLalu, 'selesai', tglLebihLalu);
ok(cocok(r, /Isi tanggal selesai/), 'tanggal selesai tidak boleh sebelum tanggal masuk');
r = await saka(K.pembina.id, ahmad, 'Saka Bhayangkara', tglLalu, 'aktif', null, 'ftp://x/y');
ok(cocok(r, /http:\/\/ atau https:\/\//), 'tautan surat harus http(s)');
r = await saka(K.pembina.id, ahmad, 'Saka Bhayangkara', tglLalu, 'aktif', null, 'https://drive.example/surat saka');
ok(cocok(r, /tanpa spasi/), 'tautan surat tanpa spasi');
r = await saka(K.pembina.id, ahmad, 'Saka Bhayangkara', tglLalu, 'aktif', null, 'https://drive.example/surat-saka', 'aktif tiap Minggu');
ok(r.ok && Number(r.rows[0].id) > 0, 'Pembina mencatat Ahmad di Saka Bhayangkara (aktif, dengan tautan surat)');
const idSaka = Number(r.rows[0].id);
r = await saka(K.admin.id, ahmad, ' saka   BHAYANGKARA ');
ok(cocok(r, /sudah tercatat di Saka/), 'nama Saka yang sama (huruf besar/kecil dan spasi diabaikan) tidak digandakan');
r = await saka(K.admin.id, ahmad, 'Saka Bakti Husada');
ok(r.ok, 'Penegak boleh di beberapa Saka');
r = await saka(K.pembina.id, ahmad, 'Saka Bhayangkara', tglLebihLalu, 'selesai', tglLalu, 'https://drive.example/surat-saka', '', idSaka);
ok(r.ok && Number(r.rows[0].id) === idSaka && (await q('select status, tanggal_selesai::text t from public.saka_anggota where id = $1', [idSaka]))[0].status === 'selesai', 'mengubah catatan (aktif menjadi selesai)');
r = await saka(K.pembina.id, ahmad, 'Saka X', tglLalu, 'aktif', null, '', '', 999999);
ok(cocok(r, /tidak ditemukan/), 'mengubah catatan yang tidak ada: pesan jelas');
r = await sebagai(siti, 'select id from public.saka_anggota');
ok(r.ok && r.rows.length === 0, 'Siti tidak melihat Saka Ahmad (RLS)');
r = await sebagai(ahmad, 'select id from public.saka_anggota');
ok(r.ok && r.rows.length === 2, 'Ahmad melihat 2 catatan Saka miliknya');
r = await sebagai(siti, 'select public.sg_saka_hapus($1)', [idSaka]);
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'Penegak tidak dapat menghapus Saka');
r = await sebagai(K.pembina.id, 'select public.sg_saka_hapus($1)', [idSaka]);
ok(r.ok && (await q('select count(*)::int n from public.saka_anggota'))[0].n === 1, 'Pembina menghapus satu catatan Saka');

console.log('\n--- Penegak tidak aktif dan cadangan ---');
r = await sebagai(K.pembina.id, `select public.sg_anggota_status_atur($1, 'nonaktif', 'tidak melanjutkan', null)`, [siti]);
ok(r.ok, 'Siti dinonaktifkan');
r = await catat(K.pembina.id, 'bantara', hari, 'Aula', [siti]);
ok(cocok(r, /tidak aktif/), 'pelantikan untuk Penegak nonaktif ditolak');
r = await saka(K.pembina.id, siti, 'Saka Wanabakti');
ok(cocok(r, /tidak aktif/), 'Saka untuk Penegak nonaktif ditolak');
r = await sebagai(K.pembina.id, `select 1 from public.pelantikan where peserta_id = $1`, [siti]);
ok(r.ok && r.rows.length === 1, 'catatan pelantikan lama Siti tetap ada (hanya dapat dilihat)');
try { await q(`update public.pelantikan set catatan = 'ubah' where peserta_id = $1`, [siti]); ok(false, 'pemicu menolak ubahan langsung pada Penegak nonaktif'); }
catch (e) { ok(/tidak aktif|nonaktif|alumni/i.test(e.message), 'pemicu tolak_peserta_tak_aktif menolak ubahan langsung pada Penegak nonaktif'); }
r = await sebagai(K.admin.id, 'select public.sg_cadangan_admin() as d');
const cad = r.rows?.[0]?.d;
ok(r.ok && Array.isArray((cad.data ?? cad.tabel ?? cad).pelantikan) && Array.isArray((cad.data ?? cad.tabel ?? cad).saka_anggota) && (cad.data ?? cad.tabel ?? cad).pelantikan.length === 3, 'cadangan data memuat pelantikan dan saka_anggota');

console.log(`\nRINGKASAN PELANTIKAN-SAKA: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
