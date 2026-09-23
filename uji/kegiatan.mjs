// Tahap L6b: kegiatanLogic.js (murni) dan alur usulan kegiatan (sg_kegiatan_usul/tinjau/ping, pengingat, RLS) untuk 11 jenis
// (Musyawarah Ambalan + 10 kegiatan lain).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { JENIS_USULAN, bolehIngatkan, dokumenUrlSah, labelJenisUsulan, periksaTinjauan, periksaUsulan, usulanMenunggu, usulanTerakhir } from '../src/lib/kegiatanLogic.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

console.log('--- kegiatanLogic.js (murni) ---');
{
  ok(JENIS_USULAN.length === 11 && JENIS_USULAN[0].id === 'musyawarah', `JENIS_USULAN: 11 jenis, musyawarah pertama (${JENIS_USULAN.length})`);
  ok(labelJenisUsulan('ptgd') === 'PTGD (Penerimaan Tamu Gugus Depan)', 'labelJenisUsulan: PTGD');
  ok(labelJenisUsulan('tidak-dikenal') === 'tidak-dikenal', 'labelJenisUsulan: jenis tidak dikenal -> kode itu sendiri');
  ok(dokumenUrlSah('https://drive.google.com/x') && dokumenUrlSah('http://x.com') && !dokumenUrlSah('drive.google.com/x') && !dokumenUrlSah(''), 'dokumenUrlSah: wajib http(s)://');
  const dasar = { jenis: 'musyawarah', tahunAjaran: '2026/2027', tanggalUsul: '2027-05-01', dokumenUrl: 'https://drive.google.com/x', catatan: '' };
  ok(Object.keys(periksaUsulan(dasar)).length === 0, 'usulan lengkap: lolos');
  ok(periksaUsulan({ ...dasar, jenis: 'tidak-dikenal' }).jenis, 'jenis tidak dikenal: ditolak');
  ok(periksaUsulan({ ...dasar, tanggalUsul: '' }).tanggalUsul, 'tanpa tanggal: ditolak');
  ok(periksaUsulan({ ...dasar, dokumenUrl: 'bukan-url' }).dokumenUrl, 'tautan bukan url: ditolak');
  ok(periksaUsulan({ ...dasar, tahunAjaran: '2026/2029' }).tahunAjaran, 'tahun ajaran tidak berurutan: ditolak');
  ok(Object.keys(periksaTinjauan('disetujui', '')).length === 0, 'setuju tanpa catatan: lolos');
  ok(periksaTinjauan('ditolak', '').catatan, 'tolak tanpa catatan: ditolak');
  ok(Object.keys(periksaTinjauan('ditolak', 'alasan')).length === 0, 'tolak dengan catatan: lolos');
  ok(bolehIngatkan(null) === true, 'belum pernah diping: boleh');
  ok(bolehIngatkan(new Date(Date.now() - 25 * 3600000).toISOString()) === true, '25 jam lalu: boleh lagi');
  ok(bolehIngatkan(new Date(Date.now() - 1 * 3600000).toISOString()) === false, '1 jam lalu: belum boleh');
  const daftar = [
    { id: 1, jenis: 'musyawarah', tahunAjaran: '2026/2027', status: 'ditolak' },
    { id: 2, jenis: 'musyawarah', tahunAjaran: '2026/2027', status: 'menunggu' },
    { id: 3, jenis: 'ptgd', tahunAjaran: '2026/2027', status: 'menunggu' },
    { id: 4, jenis: 'musyawarah', tahunAjaran: '2025/2026', status: 'menunggu' },
  ];
  ok(usulanMenunggu(daftar, '2026/2027', 'musyawarah')?.id === 2, 'usulanMenunggu: cocok (tahun ajaran, jenis), status menunggu');
  ok(usulanMenunggu(daftar, '2026/2027', 'ptgd')?.id === 3, 'usulanMenunggu: jenis lain pada tahun ajaran sama, tidak tertukar');
  ok(usulanMenunggu(daftar, '2099/2100', 'musyawarah') === null, 'usulanMenunggu: tidak ada -> null');
  ok(usulanTerakhir(daftar, '2026/2027', 'musyawarah')?.id === 2, 'usulanTerakhir: id tertinggi untuk (tahun ajaran, jenis) itu');
}

console.log('\n--- Server (PGlite + data contoh) ---');
{
  const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
  const skema = readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '');
  const pg = new PGlite();
  await siapkanPg(pg, { sqlStub: stub, sqlSkema: skema });
  await isiDataContoh(pg);
  await pg.query('update public.profiles set wajib_ganti_pin = false');
  const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
  const masuk = async (username) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(username, PIN_DEMO[username] ?? PIN_DEMO.penegak); return { k, a, id: r.id }; };
  const sebagai = async (uid, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, uid, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };

  const K = { admin: await masuk('admin'), pembina: await masuk('pembina'), dewan: await masuk('dewan'), ahmad: await masuk('10231') };
  ok((await q('select jabatan_dewan from public.profiles where id = $1', [K.dewan.id]))[0].jabatan_dewan === 'Pradana', 'prasyarat: akun "dewan" (contoh) berjabatan Pradana');

  console.log('  - sg_kegiatan_usul: hanya Pradana/Pradani, validasi isian, jenis tidak dikenal ditolak');
  let r = await K.ahmad.a.usulkanKegiatan({ jenis: 'musyawarah', tahunAjaran: '2026/2027', tanggalUsul: '2027-05-01', dokumenUrl: 'https://drive.google.com/x' });
  ok(!r.ok, 'Penegak biasa (bukan Pradana/Pradani) DITOLAK mengajukan: ' + r.pesan);
  r = await K.pembina.a.usulkanKegiatan({ jenis: 'musyawarah', tahunAjaran: '2026/2027', tanggalUsul: '2027-05-01', dokumenUrl: 'https://drive.google.com/x' });
  ok(!r.ok, 'Pembina DITOLAK mengajukan (bukan Dewan)');
  r = await sebagai(K.dewan.id, `select public.sg_kegiatan_usul('bukan-jenis', '2026/2027', '2027-05-01'::date, 'https://drive.google.com/x', '')`);
  ok(!r.ok && /tidak dikenal/.test(r.pesan), 'jenis tidak dikenal: ditolak server: ' + r.pesan);
  r = await K.dewan.a.usulkanKegiatan({ jenis: 'musyawarah', tahunAjaran: '2026/2027', tanggalUsul: '2027-05-01', dokumenUrl: 'bukan-url' });
  ok(!r.ok && /alamat web/.test(r.pesan), 'tautan bukan url: ditolak server: ' + r.pesan);
  r = await K.dewan.a.usulkanKegiatan({ jenis: 'musyawarah', tahunAjaran: '2026/2027', tanggalUsul: '2027-05-01', dokumenUrl: 'https://drive.google.com/proposal', catatan: 'Diusulkan lebih awal' });
  ok(r.ok && typeof r.data === 'number', `Pradana (akun Dewan lama) dapat mengajukan Musyawarah Ambalan (${r.ok ? r.data : r.pesan})`);
  const idMusyawarah = r.data;

  console.log('  - Jenis berbeda pada tahun ajaran yang sama TIDAK saling menghalangi (unik per tahun_ajaran+jenis)');
  r = await K.dewan.a.usulkanKegiatan({ jenis: 'ptgd', tahunAjaran: '2026/2027', tanggalUsul: '2026-05-01', dokumenUrl: 'https://drive.google.com/ptgd' });
  ok(r.ok, `mengajukan PTGD selagi usulan Musyawarah Ambalan masih menunggu: diterima (${r.ok ? 'ok' : r.pesan})`);
  const idPtgd = r.data;

  console.log('  - Notifikasi ke semua Pembina saat diajukan (jenis="kegiatan", judul memuat nama jenisnya)');
  const pembinaIds = (await q("select id from public.profiles where role='penguji' and jabatan='Pembina' and status='aktif'")).map((x) => x.id);
  ok(pembinaIds.length >= 1, 'prasyarat: ada akun Pembina');
  for (const pid of pembinaIds) {
    const n = await q(`select judul from public.notifikasi where penerima_id = $1 and jenis = 'kegiatan' and kunci = $2`, [pid, `kegiatan:${idPtgd}:diajukan`]);
    ok(n.length === 1 && n[0].judul === 'Usulan PTGD (Penerimaan Tamu Gugus Depan)', `Pembina ${pid} menerima notifikasi usulan PTGD diajukan: ${JSON.stringify(n)}`);
  }

  console.log('  - Satu usulan "menunggu" per (tahun ajaran, jenis)');
  r = await K.dewan.a.usulkanKegiatan({ jenis: 'musyawarah', tahunAjaran: '2026/2027', tanggalUsul: '2027-05-10', dokumenUrl: 'https://drive.google.com/lain' });
  ok(!r.ok && /menunggu/.test(r.pesan), 'mengajukan lagi selagi masih menunggu (jenis sama): ditolak: ' + r.pesan);

  console.log('  - sg_kegiatan_ping: rate limit 24 jam');
  r = await K.ahmad.a.ingatkanKegiatan(idMusyawarah);
  ok(!r.ok, 'Penegak biasa DITOLAK mengingatkan');
  r = await K.dewan.a.ingatkanKegiatan(idMusyawarah);
  ok(r.ok, `Pradana dapat mengingatkan Pembina (${r.ok ? 'ok' : r.pesan})`);
  r = await K.dewan.a.ingatkanKegiatan(idMusyawarah);
  ok(!r.ok && /24 jam/.test(r.pesan), 'mengingatkan lagi segera: ditolak (rate limit): ' + r.pesan);
  const jumlahPing = (await q(`select count(*)::int n from public.notifikasi where jenis = 'kegiatan' and kunci like $1`, [`kegiatan:${idMusyawarah}:ping:%`]))[0].n;
  ok(jumlahPing === pembinaIds.length, `pengingat ping terkirim ke semua Pembina (${jumlahPing})`);

  console.log('  - sg_kegiatan_tinjau: hanya Pembina, tolak wajib catatan, setuju membuat entri Agenda dengan judul bawaan jenisnya');
  r = await K.admin.a.tinjauKegiatan(idPtgd, 'disetujui');
  ok(!r.ok, 'Admin DITOLAK meninjau (hanya Pembina)');
  r = await K.pembina.a.tinjauKegiatan(idPtgd, 'ditolak', '');
  ok(!r.ok, 'menolak tanpa catatan: ditolak server');
  r = await K.pembina.a.tinjauKegiatan(idPtgd, 'disetujui');
  ok(r.ok, `Pembina menyetujui usulan PTGD (${r.ok ? 'ok' : r.pesan})`);
  const barisPtgd = (await q('select * from public.kegiatan_usulan where id = $1', [idPtgd]))[0];
  ok(barisPtgd.status === 'disetujui' && barisPtgd.agenda_id !== null, `status disetujui dan agenda_id terisi: ${JSON.stringify({ status: barisPtgd.status, agenda_id: barisPtgd.agenda_id })}`);
  const entriAgendaPtgd = (await q('select jenis, judul, tanggal::text tanggal, lewati_batas from public.agenda where id = $1', [barisPtgd.agenda_id]))[0];
  ok(entriAgendaPtgd.jenis === 'ptgd' && entriAgendaPtgd.judul === 'PTGD (Penerimaan Tamu Gugus Depan)' && entriAgendaPtgd.tanggal === '2026-05-01' && entriAgendaPtgd.lewati_batas === false,
    'entri Agenda PTGD tercipta dengan judul bawaan dan lewati_batas selalu false (bukan jenis musyawarah): ' + JSON.stringify(entriAgendaPtgd));
  r = await K.pembina.a.tinjauKegiatan(idPtgd, 'disetujui');
  ok(!r.ok, 'meninjau ulang usulan yang sudah ditinjau: ditolak');

  console.log('  - Musyawarah Ambalan yang disetujui: lewati_batas mengikuti aturan lama (hanya true bila di atas/pada batas 1 Juli)');
  r = await K.pembina.a.tinjauKegiatan(idMusyawarah, 'disetujui');
  ok(r.ok, `Pembina menyetujui usulan Musyawarah Ambalan (${r.ok ? 'ok' : r.pesan})`);
  const barisMusyawarah = (await q('select agenda_id from public.kegiatan_usulan where id = $1', [idMusyawarah]))[0];
  const entriAgendaMusyawarah = (await q('select jenis, tanggal::text tanggal, lewati_batas from public.agenda where id = $1', [barisMusyawarah.agenda_id]))[0];
  ok(entriAgendaMusyawarah.jenis === 'musyawarah' && entriAgendaMusyawarah.tanggal === '2027-05-01' && entriAgendaMusyawarah.lewati_batas === false, 'entri Agenda Musyawarah (sebelum 1 Juli): lewati_batas false: ' + JSON.stringify(entriAgendaMusyawarah));

  console.log('  - Penolakan mencatat alasan dan boleh mengajukan lagi (jenis yang sama)');
  r = await K.dewan.a.usulkanKegiatan({ jenis: 'gelora_saka_expo', tahunAjaran: '2099/2100', tanggalUsul: '2100-08-01', dokumenUrl: 'https://drive.google.com/telat' });
  ok(r.ok, 'usulan baru (jenis Gelora Saka Expo, tahun ajaran lain): diterima');
  const idTelat = r.data;
  r = await K.pembina.a.tinjauKegiatan(idTelat, 'ditolak', 'Tanggal terlalu mepet, mohon diajukan ulang.');
  ok(r.ok, 'Pembina menolak dengan catatan');
  const barisTelat = (await q('select status, catatan_tinjauan, agenda_id from public.kegiatan_usulan where id = $1', [idTelat]))[0];
  ok(barisTelat.status === 'ditolak' && barisTelat.catatan_tinjauan === 'Tanggal terlalu mepet, mohon diajukan ulang.' && barisTelat.agenda_id === null, 'status ditolak, catatan tersimpan, TIDAK ada entri Agenda: ' + JSON.stringify(barisTelat));
  r = await K.dewan.a.usulkanKegiatan({ jenis: 'gelora_saka_expo', tahunAjaran: '2099/2100', tanggalUsul: '2100-06-01', dokumenUrl: 'https://drive.google.com/baru' });
  ok(r.ok, 'sesudah ditolak: boleh mengajukan lagi jenis yang sama untuk tahun ajaran yang sama');

  console.log('  - Musyawarah: setuju melewati batas 1 Juli -> lewati_batas otomatis true; jenis lain TIDAK PERNAH true');
  await q(`delete from public.kegiatan_usulan where tahun_ajaran = '2099/2100'`);
  const idLewat = (await q(`insert into public.kegiatan_usulan (tahun_ajaran, jenis, tanggal_usul, dokumen_url, diajukan_oleh, diajukan_oleh_nama) values ('2099/2100', 'musyawarah', '2100-08-01', 'https://drive.google.com/x', $1, 'Pradana Contoh') returning id`, [K.dewan.id]))[0].id;
  r = await K.pembina.a.tinjauKegiatan(idLewat, 'disetujui');
  ok(r.ok, `Pembina menyetujui usulan Musyawarah yang tanggalnya SESUDAH 1 Juli (${r.ok ? 'ok' : r.pesan})`);
  const agendaLewat = (await q(`select a.lewati_batas from public.kegiatan_usulan u join public.agenda a on a.id = u.agenda_id where u.id = $1`, [idLewat]))[0];
  ok(agendaLewat.lewati_batas === true, 'entri Agenda Musyawarah yang terbentuk: lewati_batas otomatis true');
  const idLewatLain = (await q(`insert into public.kegiatan_usulan (tahun_ajaran, jenis, tanggal_usul, dokumen_url, diajukan_oleh, diajukan_oleh_nama) values ('2098/2099', 'pembekalan_dewan', '2099-08-01', 'https://drive.google.com/x', $1, 'Pradana Contoh') returning id`, [K.dewan.id]))[0].id;
  r = await K.pembina.a.tinjauKegiatan(idLewatLain, 'disetujui');
  ok(r.ok, 'Pembina menyetujui usulan Pembekalan Dewan Ambalan (tanggal apapun, tidak mengenal batas 1 Juli)');
  const agendaLewatLain = (await q(`select a.lewati_batas from public.kegiatan_usulan u join public.agenda a on a.id = u.agenda_id where u.id = $1`, [idLewatLain]))[0];
  ok(agendaLewatLain.lewati_batas === false, 'entri Agenda jenis lain (bukan musyawarah): lewati_batas SELALU false, walau tanggal jauh: ' + JSON.stringify(agendaLewatLain));

  console.log('  - Baca usulan: pengurus saja (RLS), Penegak biasa ditolak');
  r = await K.pembina.a.muatUsulanKegiatan();
  ok(r.ok && r.data.length >= 2, `Pembina dapat membaca daftar usulan (${r.ok ? r.data.length : r.pesan})`);
  r = await K.dewan.a.muatUsulanKegiatan();
  ok(r.ok, 'Dewan (pengurus) dapat membaca');
  const rAhmad = await sebagai(K.ahmad.id, 'select * from public.kegiatan_usulan limit 1');
  ok(rAhmad.ok && rAhmad.rows.length === 0, 'Penegak biasa: baris tidak terlihat (RLS pengurus saja), bukan galat keras: ' + JSON.stringify(rAhmad.rows));

  console.log('  - sigarda.musyawarah_pengingat(): H-60, berhenti begitu ada entri Agenda musyawarah (tidak berubah tahap L6b)');
  await q(`delete from public.agenda`);
  await q(`delete from public.kegiatan_usulan`);
  await q(`delete from public.notifikasi`);
  const taKini = (await q('select sigarda.tahun_ajaran_kini() ta'))[0].ta;
  const batas = (await q('select sigarda.agenda_batas_musyawarah($1)::text b', [taKini]))[0].b;
  const pengurusIds = (await q(`select id from public.profiles where status='aktif' and (role in ('penguji','admin') or (role='peserta' and jabatan_dewan is not null))`)).map((x) => x.id);
  await q('select sigarda.musyawarah_pengingat()');
  const hariIni = (await q('select sigarda.hari_ini()::text d'))[0].d;
  const sisaHari = Math.round((new Date(batas) - new Date(hariIni)) / 86400000);
  if (sisaHari <= 60) {
    const n = await q(`select * from public.notifikasi where jenis = 'musyawarah' and judul = 'Musyawarah Ambalan belum terjadwal'`);
    ok(n.length === pengurusIds.length, `dalam jendela H-60 (sisa ${sisaHari} hari): pengingat terkirim ke semua pengurus (${n.length})`);
    await q('select sigarda.musyawarah_pengingat()');
    ok((await q(`select count(*)::int c from public.notifikasi where jenis = 'musyawarah' and judul = 'Musyawarah Ambalan belum terjadwal'`))[0].c === n.length, 'dijalankan lagi: tidak ada duplikat (dedup 14 hari)');
  } else {
    const n = await q(`select count(*)::int c from public.notifikasi where jenis = 'musyawarah' and judul = 'Musyawarah Ambalan belum terjadwal'`);
    ok(n[0].c === 0, `di luar jendela H-60 (sisa ${sisaHari} hari): belum ada pengingat`);
  }
  await q(`insert into public.agenda (tahun_ajaran, jenis, judul, tanggal) values ($1, 'musyawarah', 'Musyawarah Ambalan', sigarda.hari_ini())`, [taKini]);
  await q(`delete from public.notifikasi where jenis = 'musyawarah'`);
  await q('select sigarda.musyawarah_pengingat()');
  ok((await q(`select count(*)::int c from public.notifikasi where jenis = 'musyawarah' and judul = 'Musyawarah Ambalan belum terjadwal'`))[0].c === 0, 'sesudah ada entri Agenda musyawarah: pengingat berhenti');

  console.log('  - sigarda.kegiatan_pengingat(): H-30/H-60 per jenis, dua bulan sasaran -> yang paling awal yang berlaku, berhenti begitu ada entri Agenda');
  await q(`delete from public.agenda`);
  await q(`delete from public.kegiatan_usulan`);
  await q(`delete from public.notifikasi`);
  await q('select sigarda.kegiatan_pengingat()');
  const hariIni2 = (await q('select sigarda.hari_ini()::text d'))[0].d;
  for (const [jenis, hN, bulan1, bulan2] of [
    ['pelantikan_bantara', 30, 12, 2], ['pelantikan_laksana', 30, 4, 6], ['pengembaraan', 30, 12, 2], ['perkemahan', 30, 12, 2],
    ['gelora_saka_expo', 30, 9, null], ['gladi_tangguh_1', 30, 12, 2], ['gladi_tangguh_2', 30, 4, 6], ['penempuhan_sku_laksana', 30, 12, 2],
    ['ptgd', 60, 7, null], ['pembekalan_dewan', 30, 8, null],
  ]) {
    const t1 = (await q('select (sigarda.kegiatan_bulan_tanggal($1, $2::int) - $3::int)::text m', [taKini, bulan1, hN]))[0].m;
    let mulai = t1;
    if (bulan2) { const t2 = (await q('select (sigarda.kegiatan_bulan_tanggal($1, $2::int) - $3::int)::text m', [taKini, bulan2, hN]))[0].m; mulai = t1 < t2 ? t1 : t2; }
    const jumlah = (await q(`select count(*)::int n from public.notifikasi where jenis = 'kegiatan' and judul = $1`, [labelJenisUsulan(jenis) + ' belum terjadwal']))[0].n;
    if (hariIni2 >= mulai) ok(jumlah === pengurusIds.length, `${jenis}: dalam jendela (mulai ${mulai}, hari ini ${hariIni2}): pengingat terkirim ke semua pengurus (${jumlah})`);
    else ok(jumlah === 0, `${jenis}: di luar jendela (mulai ${mulai}, hari ini ${hariIni2}): belum ada pengingat`);
  }
  await q('select sigarda.kegiatan_pengingat()');
  const totalSesudahDuaKali = (await q(`select count(*)::int c from public.notifikasi where jenis = 'kegiatan'`))[0].c;
  const totalSetelahSatuKali = (await q(`select count(*)::int c from public.notifikasi where jenis = 'kegiatan'`))[0].c;
  ok(totalSesudahDuaKali === totalSetelahSatuKali, 'dijalankan lagi: tidak ada duplikat (dedup 14 hari)');
  await q(`insert into public.agenda (tahun_ajaran, jenis, judul, tanggal) values ($1, 'ptgd', 'PTGD', sigarda.hari_ini())`, [taKini]);
  await q(`delete from public.notifikasi where jenis = 'kegiatan'`);
  await q('select sigarda.kegiatan_pengingat()');
  ok((await q(`select count(*)::int c from public.notifikasi where jenis = 'kegiatan' and judul like 'PTGD%'`))[0].c === 0, 'sesudah ada entri Agenda PTGD: pengingat PTGD berhenti (jenis lain tetap berjalan bila dalam jendela)');

  await pg.close();
}

console.log(`\nRINGKASAN KEGIATAN: ${lulus} lulus, ${gagal} GAGAL.`);
if (gagal) process.exit(1);
