// Tahap 2 (G2b): Penegak mengajukan TKK sendiri dan Pembina meninjau (server, PGlite): hak, validasi (pemeriksa bersama dengan pencatatan langsung), status,
// persetujuan menjadi capaian resmi, keadaan berubah saat ditinjau, batas 20 menunggu, notifikasi, RLS, Penegak tak aktif, dan cadangan.
// Klien: uji/tkk-pengajuan-klien.mjs. Migrasi: uji/migrasi-tkk-pengajuan.mjs.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';

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
const ajukan = (id, tkk, tk, tgl, p1 = 'Pak Budi', p2 = 'Bu Sari', mel = 'Andi, Siaga', url = '', cat = '') =>
  sebagai(id, 'select public.sg_tkk_ajukan($1, $2, $3::date, $4, $5, $6, $7, $8) as id', [tkk, tk, tgl, p1, p2, mel, url, cat]);
const tinjau = (id, pid, keputusan, cat = '') => sebagai(id, 'select public.sg_tkk_tinjau($1::bigint, $2, $3)', [pid, keputusan, cat]);
const pengajuan = (pid) => q('select id, tkk_id, tingkat, status, ditinjau_nama, catatan_tinjauan, capaian_id from public.tkk_pengajuan where peserta_id = $1 order by id', [pid]);
const notif = (pid) => q(`select judul, isi, tautan from public.notifikasi where penerima_id = $1 and jenis = 'tkk' order by id`, [pid]);
const tulisSku = (pid) => q(
  `insert into public.sku_progress (peserta_id, sku_id, status) select p.id, u.id, 'lulus' from public.profiles p join public.sku_unit u on u.tingkat = 'Bantara' and (u.agama is null or u.agama = p.agama)
   where p.id = $1 on conflict (peserta_id, sku_id) do update set status = 'lulus'`, [pid]);

console.log('--- Persiapan: Siti (Islam) dan Dimas (Hindu) selesai Bantara; Ahmad belum ---');
await q('delete from public.sku_progress where peserta_id = any($1::uuid[])', [[ahmad, siti, dimas]]);
await q(`update public.profiles set agama = 'Islam' where id = $1`, [siti]);
await q(`update public.profiles set agama = 'Hindu' where id = $1`, [dimas]);
for (const id of [siti, dimas]) await tulisSku(id);

console.log('\n--- Hak dan validasi pengajuan (pemeriksa bersama dengan pencatatan langsung) ---');
let r = await ajukan(K.pembina.id, 'juru-masak', 'purwa', t30);
ok(cocok(r, /Hanya Penegak yang dapat mengajukan TKK/), 'Pembina tidak mengajukan (Pembina mencatat langsung)');
r = await ajukan(K.admin.id, 'juru-masak', 'purwa', t30);
ok(cocok(r, /Hanya Penegak yang dapat mengajukan TKK/), 'Admin tidak mengajukan');
r = await ajukan(ahmad, 'juru-masak', 'purwa', t30);
ok(cocok(r, /belum menyelesaikan SKU Bantara/), 'Penegak yang belum selesai Bantara ditolak');
r = await ajukan(dimas, 'sholat', 'purwa', t30);
ok(cocok(r, /khusus penganut agama Islam/), 'TKK khusus Islam ditolak untuk Penegak Hindu');
r = await ajukan(siti, 'pengatur-ruangan', 'purwa', t30);
ok(cocok(r, /khusus golongan Siaga/), 'TKK khusus Siaga ditolak');
r = await ajukan(siti, 'juru-masak', 'purwa', tDepan);
ok(cocok(r, /masa depan/), 'tanggal masa depan ditolak');
r = await ajukan(siti, 'juru-masak', 'purwa', t30, 'Pak Budi', ' pak  BUDI ');
ok(cocok(r, /dua orang yang berbeda/), 'penguji kembar ditolak');
r = await ajukan(siti, 'juru-masak', 'purwa', t30, 'Pak Budi', 'Bu Sari', '');
ok(cocok(r, /bukti melatih/), 'bukti melatih wajib');
r = await ajukan(siti, 'juru-masak', 'madya', t30);
ok(cocok(r, /Utama butuh Madya, dan Madya butuh Purwa/), 'Madya tanpa Purwa resmi ditolak');
ok((await pengajuan(siti)).length === 0, 'percobaan yang ditolak tidak meninggalkan baris');

console.log('\n--- Mengajukan, duplikat, batal ---');
r = await ajukan(siti, 'juru-masak', 'purwa', t30, 'Pak Budi', 'Bu Sari', 'Andi, Siaga', 'https://drive.example/p', 'lulus uji');
ok(r.ok && Number(r.rows[0].id) > 0, 'Siti mengajukan Purwa Juru Masak ' + (r.pesan ?? ''));
const id1 = Number(r.rows[0].id);
let p = await pengajuan(siti);
ok(p.length === 1 && p[0].status === 'menunggu' && p[0].ditinjau_nama === null && p[0].capaian_id === null, 'pengajuan berstatus menunggu, belum ditinjau');
r = await ajukan(siti, 'juru-masak', 'purwa', t10);
ok(cocok(r, /masih menunggu ditinjau/), 'pengajuan yang sama tidak digandakan selama menunggu');
r = await sebagai(dimas, 'select public.sg_tkk_ajukan_batal($1)', [id1]);
ok(cocok(r, /tidak ditemukan atau sudah ditinjau/), 'Penegak lain tidak dapat membatalkan pengajuan Siti');
r = await sebagai(siti, 'select public.sg_tkk_ajukan_batal($1)', [id1]);
ok(r.ok && (await pengajuan(siti))[0].status === 'dibatalkan', 'Siti membatalkan pengajuannya');
r = await sebagai(siti, 'select public.sg_tkk_ajukan_batal($1)', [id1]);
ok(cocok(r, /tidak ditemukan atau sudah ditinjau/), 'membatalkan dua kali: pesan jelas');
r = await ajukan(siti, 'juru-masak', 'purwa', t30, 'Pak Budi', 'Bu Sari', 'Andi, Siaga', 'https://drive.example/p', 'lulus uji');
ok(r.ok, 'sesudah dibatalkan Siti dapat mengajukan lagi');
const id2 = Number(r.rows[0].id);

console.log('\n--- Notifikasi pengajuan baru ---');
{
  const n = await notif(K.pembina.id);
  ok(n.length === 2 && n.every((x) => x.judul === 'Pengajuan TKK baru' && x.tautan.tab === 'tkk' && /mengajukan TKK Juru Masak Purwa/.test(x.isi)), 'Pembina menerima notifikasi tiap pengajuan baru (tautan ke menu TKK)');
  ok((await notif(siti)).length === 0 && (await notif(K.admin.id)).length === 0, 'Penegak pengaju dan Admin tidak menerima notifikasi pengajuan baru');
}

console.log('\n--- Meninjau ---');
r = await tinjau(siti, id2, 'disetujui');
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'Penegak tidak dapat meninjau');
r = await tinjau(K.dewan.id, id2, 'disetujui');
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'akun Dewan lama tidak dapat meninjau');
r = await tinjau(K.pembina.id, id2, 'mungkin');
ok(cocok(r, /disetujui atau ditolak/), 'keputusan tidak sah');
r = await tinjau(K.pembina.id, id2, 'ditolak', '  ');
ok(cocok(r, /Isi catatan agar Penegak tahu/), 'menolak wajib bercatatan');
r = await tinjau(K.pembina.id, id2, 'ditolak', 'a<b');
ok(cocok(r, /Catatan maksimal 200 karakter/), 'catatan tanpa tanda < atau >');
r = await tinjau(K.pembina.id, 999999, 'disetujui');
ok(cocok(r, /sudah tidak menunggu/), 'pengajuan yang tidak ada: pesan jelas');
r = await tinjau(K.pembina.id, id2, 'ditolak', 'Bukti melatih belum jelas');
ok(r.ok, 'Pembina menolak dengan catatan');
p = await pengajuan(siti);
ok(p.find((x) => x.id === id2).status === 'ditolak' && p.find((x) => x.id === id2).ditinjau_nama.length > 0 && p.find((x) => x.id === id2).catatan_tinjauan === 'Bukti melatih belum jelas' && Number((await q('select count(*)::int n from public.tkk_capaian where peserta_id = $1', [siti]))[0].n) === 0, 'ditolak: nama peninjau dan catatan tersimpan, tidak ada capaian');
{
  const n = await notif(siti);
  ok(n.length === 1 && n[0].judul === 'Pengajuan TKK ditinjau' && !/setuju|tolak/i.test(n[0].isi) && n[0].tautan.tab === 'tkk', 'Penegak diberi tahu pengajuannya ditinjau (isi singkat, hasil di aplikasi)');
}
r = await tinjau(K.pembina.id, id2, 'disetujui');
ok(cocok(r, /sudah tidak menunggu/), 'pengajuan yang sudah ditinjau tidak dapat ditinjau lagi');
r = await ajukan(siti, 'juru-masak', 'purwa', t30, 'Pak Budi', 'Bu Sari', 'Andi dan Budi, Siaga Gugus Depan 02');
ok(r.ok, 'sesudah ditolak Siti mengajukan lagi (pengajuan baru)');
const id3 = Number(r.rows[0].id);
r = await tinjau(K.admin.id, id3, 'disetujui');
ok(r.ok, 'Admin menyetujui');
p = await pengajuan(siti);
const cap = await q(`select id, tingkat, tanggal::text t, penguji1, melatih, dicatat_oleh from public.tkk_capaian where peserta_id = $1 and tkk_id = 'juru-masak'`, [siti]);
ok(cap.length === 1 && cap[0].tingkat === 'purwa' && cap[0].melatih === 'Andi dan Budi, Siaga Gugus Depan 02' && cap[0].dicatat_oleh === K.admin.id && p.find((x) => x.id === id3).status === 'disetujui' && Number(p.find((x) => x.id === id3).capaian_id) === Number(cap[0].id), 'disetujui: menjadi capaian resmi (dicatat oleh peninjau) dan tertaut ke pengajuan');
r = await ajukan(siti, 'juru-masak', 'purwa', t10);
ok(cocok(r, /sudah tercatat resmi/), 'tingkat yang sudah tercatat resmi tidak diajukan lagi');

console.log('\n--- Tingkat berikutnya dan keadaan berubah saat ditinjau ---');
r = await ajukan(siti, 'juru-masak', 'madya', t10, 'Pak Budi', 'Bu Dewi', 'Budi, Purwa');
ok(r.ok, 'Madya dapat diajukan sesudah Purwa resmi');
const idM = Number(r.rows[0].id);
r = await ajukan(siti, 'juru-masak', 'utama', t10);
ok(cocok(r, /Utama butuh Madya/), 'Utama belum dapat diajukan sebelum Madya resmi');
const idPurwaResmi = (await q(`select id from public.tkk_capaian where peserta_id = $1 and tkk_id = 'juru-masak' and tingkat = 'purwa'`, [siti]))[0].id;
await sebagai(K.pembina.id, 'select public.sg_tkk_hapus($1)', [idPurwaResmi]);
r = await tinjau(K.pembina.id, idM, 'disetujui');
ok(cocok(r, /Madya butuh Purwa/) && (await pengajuan(siti)).find((x) => x.id === idM).status === 'menunggu', 'Purwa dihapus sebelum ditinjau: persetujuan Madya ditolak, pengajuan tetap menunggu');
r = await sebagai(K.pembina.id, `select public.sg_tkk_catat($1::uuid, 'juru-masak', 'purwa', $2::date, 'Pak Budi', 'Bu Sari', 'Andi', '', '')`, [siti, t30]);
r = await tinjau(K.pembina.id, idM, 'disetujui');
ok(r.ok && (await baris('juru-masak')).map((x) => x.tingkat).sort().join() === 'madya,purwa', 'Purwa dicatat ulang: Madya kini dapat disetujui');
async function baris(tkk) { return q('select tingkat from public.tkk_capaian where peserta_id = $1 and tkk_id = $2', [siti, tkk]); }

console.log('\n--- Batas 20 menunggu ---');
{
  const daftar = (await q(`select id from public.tkk_katalog where golongan = 'penegak' and agama is null order by urut limit 21`)).map((x) => x.id).filter((x) => x !== 'juru-masak');
  for (const tkk of daftar.slice(0, 20)) await q(`insert into public.tkk_pengajuan (peserta_id, tkk_id, tingkat, tanggal, penguji1, penguji2, melatih) values ($1, $2, 'purwa', $3::date, 'a', 'b', 'c')`, [dimas, tkk, t30]);
  r = await ajukan(dimas, daftar[20] ?? 'pengamat', 'purwa', t30);
  ok(cocok(r, /Terlalu banyak pengajuan yang menunggu/), 'lebih dari 20 pengajuan menunggu ditolak');
  await q('delete from public.tkk_pengajuan where peserta_id = $1', [dimas]);
}

console.log('\n--- RLS baca ---');
r = await ajukan(dimas, 'penabung', 'purwa', t30);
ok(r.ok, 'Dimas mengajukan (Hindu, TKK netral agama)');
r = await sebagai(dimas, 'select peserta_id from public.tkk_pengajuan');
ok(r.ok && r.rows.length === 1 && r.rows[0].peserta_id === dimas, 'Penegak hanya membaca pengajuannya sendiri');
r = await sebagai(K.pembina.id, 'select id from public.tkk_pengajuan');
ok(r.ok && r.rows.length >= 4, 'Pembina membaca semua');
r = await sebagai(K.dewan.id, 'select id from public.tkk_pengajuan');
ok(r.ok && r.rows.length >= 4, 'Dewan (pengurus) membaca semua');
r = await sebagai(siti, `insert into public.tkk_pengajuan (peserta_id, tkk_id, tingkat, tanggal, penguji1, penguji2, melatih) values ($1, 'juru-kebun', 'purwa', current_date, 'a', 'b', 'c')`, [siti]);
ok(!r.ok, 'Penegak tidak dapat menulis langsung ke tabel pengajuan');
r = await sebagai(K.pembina.id, `update public.tkk_pengajuan set status = 'disetujui'`);
ok(!r.ok || r.rows.length === 0, 'Pembina pun tidak dapat mengubah langsung (hanya lewat fungsi)');

console.log('\n--- Penegak tidak aktif dan cadangan ---');
r = await sebagai(K.pembina.id, `select public.sg_anggota_status_atur($1, 'nonaktif', 'tidak melanjutkan', null)`, [siti]);
ok(r.ok, 'Siti dinonaktifkan');
r = await ajukan(siti, 'juru-kebun', 'purwa', t30);
ok(cocok(r, /tidak aktif/), 'Penegak nonaktif tidak dapat mengajukan');
try { await q(`update public.tkk_pengajuan set catatan = 'ubah' where peserta_id = $1`, [siti]); ok(false, 'pemicu menolak ubahan langsung'); }
catch (e) { ok(/tidak aktif|nonaktif|alumni/i.test(e.message), 'pemicu tolak_peserta_tak_aktif menolak ubahan langsung pada Penegak nonaktif'); }
r = await sebagai(K.admin.id, 'select public.sg_cadangan_admin() as d');
const cad = r.rows?.[0]?.d; const data = cad?.data ?? cad?.tabel ?? cad;
ok(r.ok && Array.isArray(data.tkk_pengajuan) && data.tkk_pengajuan.length >= 4 && Array.isArray(data.tkk_capaian) && Array.isArray(data.tkk_krida), 'cadangan memuat tkk_pengajuan tanpa kehilangan tabel TKK lain');

console.log(`\nRINGKASAN TKK-PENGAJUAN: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
