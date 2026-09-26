// Fase 6a: status anggota (aktif, nonaktif, alumni) dan naik kelas massal. Server (PGlite + api): pratinjau, penerapan atomik, pembatalan, penjagaan
// penulisan untuk Penegak nonaktif dan alumni, hak Admin dan Pembina.
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
const P_ = {}; for (const nis of ['10231', '10232', '10118', '10119', '10007', '10008', '10233']) P_[nis] = await masuk(nis, PIN_DEMO.penegak);
const cocok = (r, re) => !r.ok && re.test(r.pesan ?? '');
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const profil = async (nis) => (await q('select kelas, status, status_pada::text sp, lulus_ta from public.profiles where username = $1', [nis]))[0];
const hariIni = (await q('select sigarda.hari_ini()::text d'))[0].d;
const TA = '2027/2028';

console.log('--- Bentuk data ---');
ok((await q("select count(*)::int n from public.profiles where status = 'aktif'"))[0].n === (await q('select count(*)::int n from public.profiles'))[0].n, 'semua akun berstatus aktif pada awalnya');
ok((await q("select count(*)::int n from information_schema.columns where table_name = 'profiles' and column_name in ('status','status_pada','lulus_ta')"))[0].n === 3, 'kolom status, status_pada, lulus_ta ada');
{ let g = ''; try { await pg.query("update public.profiles set status = 'kabur' where username = '10231'"); } catch (e) { g = e.message; } ok(/check|status/i.test(g), 'status di luar aktif/nonaktif/alumni ditolak batasan'); }
{
  const t = (await q('select sigarda.tingkat_rombel($1) a, sigarda.tingkat_rombel($2) b, sigarda.tingkat_rombel($3) c, sigarda.tingkat_rombel($4) d', ['X-03', 'XI-10', 'XII-01', 'X']))[0];
  ok(t.a === 1 && t.b === 2 && t.c === 3 && t.d === null, 'tingkat_rombel: X=1, XI=2, XII=3, selain rombel baku kosong');
}

console.log('\n--- Hak: hanya Admin menaikkan kelas ---');
const baris = (nis, rombel, aksi) => ({ username: nis, rombel, aksi });
for (const [nama, k] of [['Pembina', K.pembina], ['Dewan', K.dewan], ['Penegak', P_['10231']]]) {
  const r = await k.a.naikKelas(TA, [baris('10231', 'XI-05', 'lanjut')], false);
  ok(!r.ok, `${nama} tidak dapat memakai sg_naik_kelas`);
}
ok(!(await K.pembina.a.batalkanNaikKelas(1)).ok && !(await P_['10231'].a.batalkanNaikKelas(1)).ok, 'Pembina dan Penegak tidak dapat membatalkan kenaikan kelas');

console.log('\n--- Pratinjau (tidak mengubah apa pun) ---');
// Siapkan: 10232 mengajukan uji (akan dibatalkan saat nonaktif) dan masuk sesi ujian yang belum selesai.
{
  const sku = (await q("select id from public.sku_unit where tingkat = 'Bantara' order by id limit 1"))[0].id;
  await pg.query("delete from public.sku_progress where peserta_id = (select id from public.profiles where username = '10232') and sku_id = $1", [sku]);
  await pg.query("insert into public.sku_progress (peserta_id, sku_id, status, jadwal, penguji_id) select id, $1, 'diajukan', sigarda.hari_ini() + 3, (select id from public.profiles where username = 'pembina') from public.profiles where username = '10232'", [sku]);
  const ses = (await q("insert into public.sesi_ujian (nama, tanggal, status) values ('Ujian contoh', sigarda.hari_ini() + 5, 'terjadwal') returning id"))[0].id;
  await pg.query("insert into public.sesi_ujian_peserta (sesi_id, peserta_id) select $1, id from public.profiles where username in ('10232', '10233')", [ses]);
  var SKU = sku, SESI = ses;
}
const berkas = [
  baris('10231', 'XI-05', 'lanjut'),          // Ahmad X-01 -> XI-05 (naik)
  baris('10232', '', 'tidak_lanjut'),         // Siti: nonaktif, rombel tetap; punya 1 pengajuan
  baris('10233', 'XI-07', 'tidak_lanjut'),    // Rizky: nonaktif tetapi rombel baru dicatat
  baris('10007', '', 'lulus'),                // Bagas XII-01 lulus (Calon Garuda)
  baris('10008', 'XII-01', 'lanjut'),         // Nadia sudah XII-01 dan aktif: sama
];
{
  const r = await K.admin.a.naikKelas(TA, berkas, false);
  ok(r.ok && r.data.galat === 0, 'pratinjau berkas benar: tanpa galat');
  const s = r.data.ringkasan;
  ok(s.lanjut === 1 && s.tidak_lanjut === 2 && s.lulus === 1 && s.sama === 1 && s.galat === 0, `ringkasan: lanjut 1, tidak lanjut 2, lulus 1, sama 1 (${JSON.stringify(s)})`);
  ok(s.pengajuan_batal === 2, 'ringkasan memuat 2 pengajuan yang akan dibatalkan (1 dari contoh + 1 dari uji ini)');
  const b = Object.fromEntries(r.data.baris.map((x) => [x.username, x]));
  ok(b['10231'].hasil === 'ubah' && b['10231'].ke_kelas === 'XI-05' && b['10231'].ke_status === 'aktif' && b['10231'].dari_kelas === 'X-01', 'baris lanjut: dari X-01 ke XI-05 aktif');
  ok(b['10232'].ke_kelas === 'X-01' && b['10232'].ke_status === 'nonaktif' && b['10232'].pesan.some((m) => /2 pengajuan/.test(m)), 'baris tidak lanjut tanpa rombel: rombel terakhir tetap, peringatan pengajuan');
  ok(b['10233'].ke_kelas === 'XI-07' && b['10233'].ke_status === 'nonaktif', 'tidak lanjut dengan rombel baru: rombel dicatat');
  ok(b['10007'].ke_status === 'alumni' && b['10007'].ke_kelas === 'XII-01' && b['10007'].pesan.some((m) => /Calon Garuda/.test(m)), 'lulus: alumni, peringatan Calon Garuda');
  ok(b['10008'].hasil === 'sama', 'tidak ada perubahan: dilewati (sama)');
  ok((await profil('10231')).kelas === 'X-01' && (await profil('10232')).status === 'aktif' && (await q('select count(*)::int n from public.naik_kelas_batch'))[0].n === 0, 'pratinjau tidak mengubah apa pun dan tidak membuat batch');
}
{
  const r = await K.admin.a.naikKelas(TA, [baris('10231', 'X-05', 'lanjut'), baris('10118', 'X-02', 'lanjut'), baris('10233', 'XII-05', 'lanjut'), baris('10008', 'XI-09', 'tidak_lanjut'), baris('10119', '', 'lulus'), baris('10232', 'X-04', 'lanjut')], false);
  const w = Object.fromEntries(r.data.baris.map((x) => [x.username, x.pesan.join(' ')]));
  ok(/Tingkat tidak naik/.test(w['10231']) && /Tingkat turun/.test(w['10118']) && /melompat/.test(w['10233']) && /turun/.test(w['10008']) && /Tingkat tidak naik/.test(w['10232']), 'peringatan tingkat: tidak naik (juga pindah rombel sesama tingkat), turun, melompat');
  ok(/Bukan kelas XII/.test(w['10119']), 'peringatan lulus bukan kelas XII');
}

console.log('\n--- Galat pada baris ---');
{
  const r = await K.admin.a.naikKelas(TA, [
    baris('99999', 'XI-01', 'lanjut'), baris('10231', 'XI-01', 'pindah'), baris('10231', '', 'lanjut'), baris('10118', 'XI-1x', 'lanjut'),
    baris('10119', 'XII-99', 'tidak_lanjut'), baris('10233', 'XI-02', 'lanjut'), baris('10233', 'XI-03', 'lanjut'),
  ], false);
  ok(r.ok && r.data.galat === 6, `enam baris galat dilaporkan tanpa membatalkan pratinjau (galat ${r.data?.galat})`);
  const h = r.data.baris.map((x) => `${x.username}:${x.hasil}`).join();
  ok(h === '99999:galat,10231:galat,10231:galat,10118:galat,10119:galat,10233:ubah,10233:galat', `hasil per baris: ${h}`);
  ok(/tidak ditemukan/.test(r.data.baris[0].pesan[0]) && /tidak dikenal/.test(r.data.baris[1].pesan[0]) && /lebih dari sekali/.test(r.data.baris[2].pesan[0]) && /Rombel baru wajib/.test(r.data.baris[3].pesan[0]) && /tidak sah/.test(r.data.baris[4].pesan[0]) && /lebih dari sekali/.test(r.data.baris[6].pesan[0]), 'pesan galat jelas (tidak ditemukan, aksi, rombel, ganda)');
  const t = await K.admin.a.naikKelas(TA, [baris('10231', 'XI-05', 'lanjut'), baris('99999', 'XI-01', 'lanjut')], true);
  ok(cocok(t, /1 baris bermasalah/) && (await profil('10231')).kelas === 'X-01' && (await q('select count(*)::int n from public.naik_kelas_batch'))[0].n === 0, 'menerapkan berkas bergalat ditolak; tidak ada yang berubah');
  ok(cocok(await K.admin.a.naikKelas('2027', [baris('10231', 'XI-05', 'lanjut')], false), /Tahun ajaran tidak sah/), 'tahun ajaran tidak sah ditolak');
  ok(cocok(await K.admin.a.naikKelas(TA, { a: 1 }, false), /tidak valid/) && cocok(await K.admin.a.naikKelas(TA, [baris('10231', 'XI-05', 'lanjut')].concat(Array.from({ length: 1500 }, () => baris('x', '', ''))), false), /Maksimal 1500/), 'bentuk data dan batas 1500 baris');
  ok(cocok(await K.admin.a.naikKelas(TA, [baris('10008', 'XII-01', 'lanjut')], true), /Tidak ada perubahan/), 'menerapkan berkas tanpa perubahan ditolak');
}

console.log('\n--- Menerapkan ---');
let batch1;
{
  const r = await K.admin.a.naikKelas(TA, berkas, true);
  ok(r.ok && r.data.batch > 0, 'berkas benar diterapkan; batch dibuat');
  batch1 = r.data.batch;
  const a = await profil('10231'), s = await profil('10232'), rz = await profil('10233'), bg = await profil('10007'), nd = await profil('10008');
  ok(a.kelas === 'XI-05' && a.status === 'aktif' && a.sp === hariIni, 'Ahmad: XI-05 aktif, tanggal status hari ini');
  ok(s.kelas === 'X-01' && s.status === 'nonaktif' && rz.kelas === 'XI-07' && rz.status === 'nonaktif', 'Siti nonaktif (rombel tetap), Rizky nonaktif (rombel baru dicatat)');
  ok(bg.status === 'alumni' && bg.kelas === 'XII-01' && bg.lulus_ta === '2026/2027', 'Bagas alumni, lulus tahun ajaran 2026/2027 (tahun sebelum 2027/2028)');
  ok(nd.status === 'aktif' && nd.kelas === 'XII-01', 'Nadia tidak berubah');
  const sk = (await q("select status, penguji_id, jadwal from public.sku_progress where peserta_id = (select id from public.profiles where username = '10232') and sku_id = $1", [SKU]))[0];
  ok(sk.status === 'belum' && sk.penguji_id === null && sk.jadwal === null, 'pengajuan uji Siti dibatalkan');
  ok((await q("select count(*)::int n from public.sku_riwayat where peserta_id = (select id from public.profiles where username = '10232') and sku_id = $1 and teks like 'Pengajuan dibatalkan%'", [SKU]))[0].n === 1, 'riwayat mencatat pembatalan pengajuan');
  ok((await q('select count(*)::int n from public.sesi_ujian_peserta where sesi_id = $1', [SESI]))[0].n === 0, 'Siti dan Rizky dikeluarkan dari sesi ujian yang belum selesai');
  const lg = await q('select aksi, dari_kelas, ke_kelas, dari_status, ke_status, oleh_nama from public.naik_kelas_log where batch_id = $1 order by id', [batch1]);
  ok(lg.length === 4 && lg.map((x) => x.aksi).join() === 'lanjut,tidak_lanjut,tidak_lanjut,lulus', `log: 4 baris yang berubah (yang sama tidak dicatat): ${lg.map((x) => x.aksi)}`);
  const bt = (await q('select ringkasan, oleh_nama, tahun_ajaran from public.naik_kelas_batch where id = $1', [batch1]))[0];
  ok(bt.tahun_ajaran === TA && bt.oleh_nama === 'Admin Gudep' && bt.ringkasan.lanjut === 1 && bt.ringkasan.lulus === 1, 'batch mencatat tahun ajaran, pelaku, dan ringkasan');
  const ulang = await K.admin.a.naikKelas(TA, berkas, false);
  ok(ulang.data.baris.filter((x) => x.hasil === 'sama').length === 4, 'menjalankan berkas yang sama lagi: baris yang sudah sesuai dilewati (sama)');
  ok(ulang.data.baris.find((x) => x.username === '10007').hasil === 'galat', 'alumni tidak dapat diproses lagi lewat berkas (galat: sudah alumni)');
}

console.log('\n--- Penjagaan: nonaktif dan alumni hanya dapat dilihat ---');
{
  const bebas = (await q("select id from public.sku_unit where tingkat = 'Bantara' and agama is null and id not in (select sku_id from public.sku_progress where peserta_id = (select id from public.profiles where username = '10232')) order by id limit 1"))[0].id;
  const via = await sebagai(P_['10232'].id, 'select public.sg_sku_ajukan($1, sigarda.hari_ini() + 2, null, $2)', [bebas, '']);
  ok(!via.ok && /berstatus nonaktif/.test(via.pesan) && /Akun Anda/.test(via.pesan), 'Penegak nonaktif tidak dapat mengajukan uji (pesan: akun Anda berstatus nonaktif)');
  const idDimas = (await q("select id from public.profiles where username = '10118'"))[0].id;
  const lak = (await q("select id from public.sku_unit where tingkat = 'Laksana' and agama is null and id not in (select sku_id from public.sku_progress where peserta_id = $1) order by id limit 1", [idDimas]))[0].id;
  await K.admin.a.aturStatusAnggota(idDimas, 'alumni');
  const alu = await sebagai(P_['10118'].id, 'select public.sg_sku_ajukan($1, sigarda.hari_ini() + 2, null, $2)', [lak, '']);
  ok(!alu.ok && /berstatus alumni/.test(alu.pesan), `alumni tidak dapat mengajukan uji (${alu.pesan})`);
  await K.admin.a.aturStatusAnggota(idDimas, 'aktif', 'XI-01');
  const tandai = await sebagai(K.pembina.id, "select public.sg_absen_buat_sesi(d::date) from generate_series(sigarda.hari_ini() - 6, sigarda.hari_ini(), interval '1 day') d where extract(dow from d) = 5");
  const jumat = (await q("select d::date::text t from generate_series(sigarda.hari_ini() - 6, sigarda.hari_ini(), interval '1 day') d where extract(dow from d) = 5"))[0].t;
  await q('delete from public.absensi_hadir where tanggal = $1::date', [jumat]); // data contoh sudah mengisi kehadiran Jumat ini bila hari ini Jumat; kosongkan agar hasil tidak bergantung pada hari uji
  const a1 = await sebagai(K.pembina.id, "select public.sg_absen_set($1::date, (select id from public.profiles where username = '10232'), 'H')", [jumat]);
  ok(!a1.ok && /Siti Nurhaliza berstatus nonaktif/.test(a1.pesan), 'absensi Penegak nonaktif ditolak (pesan menyebut nama dan status)');
  await sebagai(K.pembina.id, "select public.sg_absen_set_banyak($1::date, array(select id from public.profiles where username in ('10231','10232','10007')), 'H', true)", [jumat]);
  const hadir = (await q("select p.username from public.absensi_hadir h join public.profiles p on p.id = h.peserta_id where h.tanggal = $1::date order by 1", [jumat])).map((x) => x.username).join();
  ok(hadir === '10231', `absen banyak hanya mencatat Penegak aktif (${hadir})`);
  const iu = await sebagai(K.dewan.id, "select public.sg_iuran_set($1::date, (select id from public.profiles where username = '10232'), 2000)", [jumat]);
  ok(!iu.ok && /nonaktif/.test(iu.pesan), 'iuran Penegak nonaktif ditolak');
  const lembar = await sebagai(K.dewan.id, 'select public.sg_iuran_lembar($1::date) l', [jumat]);
  const nama = lembar.rows[0].l.map((x) => x.nama);
  ok(lembar.ok && nama.includes('Nadia Putri') && !nama.includes('Siti Nurhaliza') && !nama.includes('Bagas Saputra'), 'lembar iuran hanya memuat Penegak aktif');
  const ring = await sebagai(K.admin.id, 'select public.sg_push_ringkasan() r');
  ok(!ring.rows[0].r.tanpa.some((x) => x.nama === 'Siti Nurhaliza' || x.nama === 'Bagas Saputra'), 'ringkasan perangkat notifikasi tidak memuat nonaktif dan alumni');
  const cg = await pg.query("update public.profiles set calon_garuda = sigarda.hari_ini() where username = '10232'").then(() => ({ ok: true }), (e) => ({ ok: false, pesan: e.message }));
  ok(!cg.ok && /Calon Garuda hanya dapat diberikan/.test(cg.pesan), 'status Calon Garuda tidak dapat diberikan kepada Penegak nonaktif');
  const pf = await pg.query("insert into public.sku_riwayat (peserta_id, sku_id, teks) select id, $1, 'x' from public.profiles where username = '10007'", [SKU]).then(() => ({ ok: true }), (e) => ({ ok: false, pesan: e.message }));
  ok(!pf.ok && /alumni/.test(pf.pesan), 'penulisan riwayat untuk alumni ditolak pemicu (berlaku untuk semua jalur tulis)');
  // Membaca tetap boleh: Penegak alumni dan nonaktif melihat progres sendiri; sertifikat dapat dicetak
  const bacaAlu = await P_['10007'].k.from('sku_progress').select('sku_id').limit(5);
  ok(!bacaAlu.error && bacaAlu.data.length > 0, 'alumni tetap dapat MEMBACA progres sendiri');
  const sertif = await sebagai(P_['10007'].id, "select public.sg_sertifikat_tingkat((select id from public.profiles where username = '10007'), 'Bantara') t");
  ok(sertif.ok && /^[0-9a-f]{32}$/.test(String(sertif.rows[0].t)), 'alumni tetap dapat mencetak (sertifikat tingkat tetap dibuat)');
}

console.log('\n--- Menghapus akun penguji yang pernah menguji alumni ---');
{
  const pid = (await q("select id from public.profiles where username = 'pembina'"))[0].id;
  const alumniId = (await q("select id from public.profiles where username = '10007'"))[0].id;
  const punya = (await q('select count(*)::int n from public.sku_progress where peserta_id = $1 and penguji_id = $2', [alumniId, pid]))[0].n;
  let galat = null; try { await pg.query('delete from public.profiles where id = $1', [pid]); } catch (e) { galat = e.message; }
  ok(punya > 0 && galat === null, `akun Pembina yang pernah menguji alumni dapat dihapus tanpa terhambat pemicu (progres alumni terkait ${punya}): ${galat ?? 'ok'}`);
}

console.log('\n--- Pembatalan kenaikan kelas ---');
{
  const K2 = { admin: K.admin };
  ok(cocok(await K2.admin.a.batalkanNaikKelas(99999), /tidak ditemukan/), 'batch yang tidak ada ditolak');
  const b2 = await K2.admin.a.naikKelas('2028/2029', [baris('10231', 'XII-05', 'lanjut'), baris('10118', 'XII-01', 'lanjut')], true);
  ok(b2.ok, 'kenaikan kedua diterapkan');
  ok(cocok(await K2.admin.a.batalkanNaikKelas(batch1), /paling akhir/), 'hanya kenaikan paling akhir yang dapat dibatalkan');
  await K2.admin.a.aturStatusAnggota((await q("select id from public.profiles where username = '10118'"))[0].id, 'nonaktif', null, 'uji');
  ok(cocok(await K2.admin.a.batalkanNaikKelas(b2.data.batch), /sudah diubah lagi/), 'batal ditolak bila ada Penegak yang diubah lagi sesudahnya');
  await K2.admin.a.aturStatusAnggota((await q("select id from public.profiles where username = '10118'"))[0].id, 'aktif', 'XII-01', 'kembali');
  const bt = await K2.admin.a.batalkanNaikKelas(b2.data.batch);
  ok(bt.ok && bt.data === 2, 'kenaikan kedua dibatalkan (2 Penegak dikembalikan)');
  ok((await profil('10231')).kelas === 'XI-05' && (await profil('10118')).kelas === 'XI-01', 'kelas dikembalikan ke keadaan sebelum kenaikan kedua');
  ok(cocok(await K2.admin.a.batalkanNaikKelas(b2.data.batch), /sudah dibatalkan/), 'membatalkan dua kali ditolak');
  const b1 = await K2.admin.a.batalkanNaikKelas(batch1);
  ok(b1.ok && b1.data === 4, 'kenaikan pertama kini dapat dibatalkan (4 Penegak)');
  const pulih = await profil('10007');
  ok(pulih.status === 'aktif' && pulih.lulus_ta === null && (await profil('10231')).kelas === 'X-01' && (await profil('10232')).status === 'aktif' && (await profil('10233')).kelas === 'X-02', 'status, kelas, dan tahun kelulusan kembali seperti semula');
  ok((await q('select count(*)::int n from public.naik_kelas_batch where dibatalkan_pada is not null'))[0].n === 2, 'batch yang dibatalkan ditandai (riwayat tetap ada)');
}

console.log('\n--- Status satu Penegak (Pembina dan Admin) ---');
{
  const id = async (nis) => (await q('select id from public.profiles where username = $1', [nis]))[0].id;
  const idAhmad = await id('10231'), idRina = await id('10119');
  const koleksi = { dewan: K.dewan, ahmad: P_['10231'] };
  for (const [nama, k] of Object.entries(koleksi)) ok(!(await k.a.aturStatusAnggota(idRina, 'nonaktif')).ok, `${nama} tidak dapat mengubah status`);
  // Pembina dihapus pada bagian sebelumnya; masuk lagi tidak mungkin, jadi Pembina diuji lewat akun baru
  await pg.query("update public.profiles set jabatan_dewan = null, jabatan = 'Pembina' where username = 'dewan'"); // akun Dewan contoh dijadikan Pembina untuk uji hak
  ok((await K.dewan.a.aturStatusAnggota(idRina, 'nonaktif', null, 'tidak ikut ekskul')).ok, 'Pembina dapat menonaktifkan satu Penegak');
  ok((await profil('10119')).status === 'nonaktif', 'status Rina nonaktif');
  ok(cocok(await K.dewan.a.aturStatusAnggota(idRina, 'nonaktif'), /sudah berstatus nonaktif/), 'status yang sama ditolak');
  ok(cocok(await K.dewan.a.aturStatusAnggota(idRina, 'aktif', ''), /Rombel wajib/) && cocok(await K.dewan.a.aturStatusAnggota(idRina, 'aktif', 'XI'), /Rombel wajib/), 'mengaktifkan kembali wajib disertai rombel baku');
  ok(cocok(await K.dewan.a.aturStatusAnggota(idRina, 'alumni'), /Hanya Admin/), 'Pembina tidak dapat menetapkan alumni');
  ok((await K.dewan.a.aturStatusAnggota(idRina, 'aktif', 'xii 04', 'ikut lagi')).ok === false, 'rombel harus sudah baku dari klien (server hanya membesarkan huruf dan membuang spasi: "xii 04" tidak sah)');
  ok((await K.dewan.a.aturStatusAnggota(idRina, 'aktif', 'XII-04', 'ikut lagi')).ok && (await profil('10119')).status === 'aktif' && (await profil('10119')).kelas === 'XII-04', 'Pembina mengaktifkan kembali dengan rombel baru');
  ok((await K.admin.a.aturStatusAnggota(idRina, 'alumni')).ok && (await profil('10119')).lulus_ta === (await q('select sigarda.tahun_ajaran_kini() t'))[0].t, 'Admin menetapkan alumni (tahun kelulusan = tahun ajaran berjalan)');
  ok(cocok(await K.admin.a.aturStatusAnggota(idRina, 'nonaktif'), /Alumni tidak dapat dinonaktifkan/), 'alumni tidak dapat langsung dinonaktifkan');
  ok((await K.admin.a.aturStatusAnggota(idRina, 'aktif', 'XII-04')).ok, 'alumni dapat diaktifkan kembali');
  ok(cocok(await K.admin.a.aturStatusAnggota(idAhmad, 'kabur'), /tidak dikenal/) && cocok(await K.admin.a.aturStatusAnggota('00000000-0000-0000-0000-000000000000', 'nonaktif'), /tidak ditemukan/), 'status atau Penegak tidak dikenal ditolak');
  ok(cocok(await K.admin.a.aturStatusAnggota(await id('admin'), 'nonaktif'), /tidak ditemukan/), 'status hanya untuk Penegak (Admin/Pembina/Dewan ditolak)');
  const lg = await q("select aksi, dari_status, ke_status, catatan, oleh_nama from public.naik_kelas_log where batch_id is null and peserta_nama = 'Rina Wulandari' order by id");
  ok(lg.map((x) => x.aksi).join() === 'nonaktifkan,aktifkan,lulus,aktifkan', `perubahan satu orang tercatat tanpa batch: ${lg.map((x) => x.aksi)}`);
  ok(lg[0].catatan === 'tidak ikut ekskul', 'catatan tersimpan');
}

console.log('\n--- Asisten bendahara harus aktif ---');
{
  const idNadia = (await q("select id from public.profiles where username = '10008'"))[0].id;
  await pg.query("insert into public.asisten_iuran (peserta_id, ditunjuk_oleh) select $1, (select id from public.profiles where username = 'admin')", [idNadia]);
  const aktifAwal = await sebagai(P_['10008'].id, 'select sigarda.asisten_iuran() a');
  ok(aktifAwal.ok && aktifAwal.rows[0].a === true, 'Penegak aktif yang ditunjuk = asisten bendahara');
  await pg.query("update public.profiles set status = 'nonaktif' where username = '10008'"); // ubah langsung: pemeriksaan fungsi tetap menolak
  const sesudah = await sebagai(P_['10008'].id, 'select sigarda.asisten_iuran() a');
  ok(sesudah.ok && sesudah.rows[0].a === false, 'asisten yang nonaktif tidak lagi dianggap asisten (tidak dapat mencatat iuran)');
  await pg.query("update public.profiles set status = 'aktif' where username = '10008'");
  const r = await K.admin.a.aturStatusAnggota(idNadia, 'nonaktif', null, '');
  ok(r.ok && (await q('select count(*)::int n from public.asisten_iuran where peserta_id = $1', [idNadia]))[0].n === 0, 'menonaktifkan Penegak mencabut penunjukannya sebagai asisten bendahara');
  await K.admin.a.aturStatusAnggota(idNadia, 'aktif', 'XII-01', 'kembali');
}

console.log('\n--- Membaca riwayat (RLS) ---');
{
  const admin = await K.admin.a.muatNaikKelas();
  ok(admin.ok && admin.data.batch.length === 2 && admin.data.log.length >= 10 && admin.data.batch[0].id > admin.data.batch[1].id, 'Admin membaca riwayat batch dan log (terbaru lebih dulu)');
  const dewanBaca = await K.dewan.a.muatNaikKelas();
  ok(dewanBaca.ok && dewanBaca.data.log.length > 0, 'pengurus lain membaca riwayat');
  const peserta = await P_['10231'].a.muatNaikKelas();
  ok(peserta.ok && peserta.data.batch.length === 0 && peserta.data.log.length === 0, 'Penegak tidak melihat riwayat kenaikan kelas (RLS)');
  const tulis = await sebagai(P_['10231'].id, "insert into public.naik_kelas_log (peserta_nama, aksi, dari_status, ke_status) values ('x', 'lulus', 'aktif', 'alumni')");
  ok(!tulis.ok, 'klien tidak dapat menulis riwayat langsung (RLS hanya baca)');
  const profilBaca = await K.admin.a.muatProfil();
  ok(profilBaca.ok && profilBaca.data.find((u) => u.username === '10231').status === 'aktif' && profilBaca.data.find((u) => u.username === '10233').status === 'aktif', 'muatProfil membawa status (bentuk { status, statusPada, lulusTa })');
}

console.log(`\nRINGKASAN naik-kelas: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
