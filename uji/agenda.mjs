// Tahap L6: agendaLogic.js (murni), CRUD agenda (sg_agenda_simpan/hapus, RLS baca), dan pengingat H-30/H-7/H-1 (sigarda.agenda_proses).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { JENIS_AGENDA, agendaMendatang, batasMusyawarah, hariMenuju, judulBawaanJenis, labelJenisAgenda, periksaAgenda } from '../src/lib/agendaLogic.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

console.log('--- agendaLogic.js (murni) ---');
{
  ok(JENIS_AGENDA.length === 15 && JENIS_AGENDA.some((j) => j.id === 'lainnya'), '15 jenis (6 baku awal + 8 baku tahap L6b + lainnya)');
  ok(labelJenisAgenda('musyawarah') === 'Musyawarah Ambalan' && labelJenisAgenda('pelantikan_garuda') === 'Pelantikan Garuda', 'label jenis');
  ok(judulBawaanJenis('sidang') === 'Sidang Dewan Kehormatan' && judulBawaanJenis('lainnya') === '', 'judul bawaan (lainnya kosong, diisi bebas)');
  ok(batasMusyawarah('2026/2027') === '2027-07-01' && batasMusyawarah('') === null, 'batas Musyawarah = 1 Juli tahun kedua: ' + batasMusyawarah('2026/2027'));

  const dasar = { tahunAjaran: '2026/2027', jenis: 'musyawarah', judul: 'Musyawarah Ambalan', tanggal: '2027-06-01', keterangan: '', pesertaTerkait: [] };
  ok(Object.keys(periksaAgenda(dasar)).length === 0, 'agenda musyawarah sebelum batas: lolos');
  ok(periksaAgenda({ ...dasar, tanggal: '2027-07-01' }).tanggal, 'tepat 1 Juli (bukan sebelum): ditolak');
  ok(periksaAgenda({ ...dasar, tanggal: '2027-08-01' }).tanggal, 'sesudah batas: ditolak');
  ok(Object.keys(periksaAgenda({ ...dasar, tanggal: '2027-08-01' }, true)).length > 0, 'sesudah batas walau lewatiBatasBoleh=true TANPA lewatiBatas dicentang: tetap ditolak');
  ok(Object.keys(periksaAgenda({ ...dasar, tanggal: '2027-08-01', lewatiBatas: true }, true)).length === 0, 'sesudah batas + lewatiBatas dicentang + boleh (Pembina): lolos');
  ok(Object.keys(periksaAgenda({ ...dasar, tanggal: '2027-08-01', lewatiBatas: true }, false)).length > 0, 'sesudah batas + lewatiBatas dicentang tapi TIDAK boleh (bukan Pembina): tetap ditolak');
  ok(periksaAgenda({ ...dasar, jenis: 'naik_kelas', tanggal: '2027-08-01' }).tanggal === undefined, 'batas 1 Juli hanya untuk jenis musyawarah, bukan naik_kelas');
  ok(periksaAgenda({ ...dasar, judul: '' }).judul, 'judul kosong ditolak');
  ok(periksaAgenda({ ...dasar, tahunAjaran: '2026/2028' }).tahunAjaran, 'tahun ajaran tidak berurutan ditolak');
  ok(periksaAgenda({ ...dasar, tanggal: '' }).tanggal, 'tanggal kosong ditolak');

  ok(hariMenuju('2026-10-01', '2026-09-01') === 'H-30', 'hariMenuju H-30: ' + hariMenuju('2026-10-01', '2026-09-01'));
  ok(hariMenuju('2026-09-01', '2026-09-01') === 'Hari ini', 'hariMenuju hari ini');
  ok(hariMenuju('2026-08-01', '2026-09-01') === 'Lewat', 'hariMenuju sudah lewat');

  const daftar = [{ id: 1, tanggal: '2026-08-01' }, { id: 2, tanggal: '2026-10-01' }, { id: 3, tanggal: '2026-09-01' }];
  ok(agendaMendatang(daftar, '2026-09-01').map((a) => a.id).join(',') === '3,2', 'agendaMendatang: hanya >= hari ini, terurut terdekat: ' + agendaMendatang(daftar, '2026-09-01').map((a) => a.id).join(','));
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
  const idDari = async (username) => (await q('select id from public.profiles where username = $1', [username]))[0].id;
  const masuk = async (username) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(username, PIN_DEMO[username] ?? PIN_DEMO.penegak); return { k, a, id: r.id }; };
  const K = { admin: await masuk('admin'), pembina: await masuk('pembina'), dewan: await masuk('dewan'), ahmad: await masuk('10231') };
  const ahmad = K.ahmad.id;

  console.log('  - sg_agenda_simpan: hak dan validasi');
  let r = await K.ahmad.a.simpanAgenda({ tahunAjaran: '2026/2027', jenis: 'sidang', judul: 'Sidang DK', tanggal: '2026-10-01' });
  ok(!r.ok, 'Penegak biasa DITOLAK menyimpan agenda: ' + r.pesan);
  r = await K.dewan.a.simpanAgenda({ tahunAjaran: '2026/2027', jenis: 'sidang', judul: 'Sidang DK', tanggal: '2026-10-01' });
  ok(!r.ok, 'Dewan Ambalan (bukan Pembina/Admin) DITOLAK menyimpan agenda: ' + r.pesan);
  r = await K.pembina.a.simpanAgenda({ tahunAjaran: '2026/2027', jenis: 'sidang', judul: 'Sidang DK Oktober', tanggal: '2026-10-01', keterangan: 'Aula sekolah' });
  ok(r.ok && typeof r.data === 'number', `Pembina dapat menambah agenda, id dikembalikan (${r.ok ? r.data : r.pesan})`);
  const idSidang = r.data;
  r = await K.admin.a.simpanAgenda({ tahunAjaran: '2026/2027', jenis: 'naik_kelas', judul: 'Naik Kelas', tanggal: '2027-07-05' });
  ok(r.ok, `Admin juga dapat menambah agenda (${r.ok ? 'ok' : r.pesan})`);

  console.log('  - Batas Musyawarah Ambalan (1 Juli) ditegakkan server, hanya Pembina dapat melewati');
  r = await K.admin.a.simpanAgenda({ tahunAjaran: '2026/2027', jenis: 'musyawarah', judul: 'Musyawarah', tanggal: '2027-08-01' });
  ok(!r.ok && /1 Juli/.test(r.pesan), 'Admin ditolak melewati batas: ' + r.pesan);
  r = await K.admin.a.simpanAgenda({ tahunAjaran: '2026/2027', jenis: 'musyawarah', judul: 'Musyawarah', tanggal: '2027-08-01', lewatiBatas: true });
  ok(!r.ok && /1 Juli/.test(r.pesan), 'Admin mencentang lewatiBatas TETAP ditolak (bukan Pembina): ' + r.pesan);
  r = await K.pembina.a.simpanAgenda({ tahunAjaran: '2026/2027', jenis: 'musyawarah', judul: 'Musyawarah', tanggal: '2027-08-01' });
  ok(!r.ok && /1 Juli/.test(r.pesan), 'Pembina TANPA centang lewatiBatas juga ditolak: ' + r.pesan);
  r = await K.pembina.a.simpanAgenda({ tahunAjaran: '2026/2027', jenis: 'musyawarah', judul: 'Musyawarah (usulan Dewan)', tanggal: '2027-08-01', lewatiBatas: true });
  ok(r.ok, `Pembina mencentang lewatiBatas: diterima (${r.ok ? 'ok' : r.pesan})`);
  const idMusyawarah = r.data;
  ok((await q('select lewati_batas from public.agenda where id = $1', [idMusyawarah]))[0].lewati_batas === true, 'lewati_batas tersimpan true');
  r = await K.pembina.a.simpanAgenda({ tahunAjaran: '2026/2027', jenis: 'musyawarah', judul: 'Musyawarah OK', tanggal: '2027-06-15' });
  ok(r.ok, 'Musyawarah sebelum batas: tidak perlu lewatiBatas, langsung diterima');

  console.log('  - Ubah dan hapus');
  r = await K.pembina.a.simpanAgenda({ id: idSidang, tahunAjaran: '2026/2027', jenis: 'sidang', judul: 'Sidang DK Oktober (diundur)', tanggal: '2026-10-08' });
  ok(r.ok && r.data === idSidang, 'ubah agenda memakai id yang sama');
  ok((await q('select judul from public.agenda where id = $1', [idSidang]))[0].judul === 'Sidang DK Oktober (diundur)', 'perubahan tersimpan');
  r = await K.admin.a.hapusAgenda(idSidang);
  ok(r.ok, 'Admin dapat menghapus agenda');
  ok((await q('select count(*)::int n from public.agenda where id = $1', [idSidang]))[0].n === 0, 'baris benar-benar terhapus');
  r = await K.ahmad.a.hapusAgenda(idMusyawarah);
  ok(!r.ok, 'Penegak biasa DITOLAK menghapus agenda');

  console.log('  - peserta_terkait: hanya Penegak aktif, maksimal 500');
  r = await K.pembina.a.simpanAgenda({ tahunAjaran: '2026/2027', jenis: 'pelantikan_bantara', judul: 'Pelantikan Bantara', tanggal: '2026-11-01', pesertaTerkait: [ahmad] });
  ok(r.ok, `peserta_terkait berisi Penegak aktif: diterima (${r.ok ? 'ok' : r.pesan})`);
  const idPelantikan = r.data;
  ok((await q('select peserta_terkait from public.agenda where id = $1', [idPelantikan]))[0].peserta_terkait.includes(ahmad), 'tersimpan');
  const admin2 = await idDari('admin');
  r = await K.pembina.a.simpanAgenda({ tahunAjaran: '2026/2027', jenis: 'pelantikan_bantara', judul: 'X', tanggal: '2026-11-01', pesertaTerkait: [admin2] });
  ok(!r.ok, 'peserta_terkait berisi akun bukan Penegak: ditolak');

  console.log('  - Baca agenda: semua yang sudah masuk (RLS), termasuk Penegak');
  r = await K.ahmad.a.muatAgenda();
  ok(r.ok && r.data.some((a) => a.id === idPelantikan), `Penegak dapat MEMBACA agenda walau tidak dapat menulis (${r.data.length} baris)`);

  console.log('  - sigarda.agenda_proses: pengingat H-30/H-7/H-1 ke pengurus dan peserta_terkait');
  await q('delete from public.agenda');
  await q('delete from public.notifikasi');
  const hariIni = (await q('select sigarda.hari_ini()::text d'))[0].d;
  const tgl = (n) => q(`select (sigarda.hari_ini() + $1)::text d`, [n]).then((x) => x[0].d);
  const idH30 = (await q(
    `insert into public.agenda (tahun_ajaran, jenis, judul, tanggal, peserta_terkait) values ('2026/2027','sidang','Sidang H-30', sigarda.hari_ini() + 30, array[$1]::uuid[]) returning id`, [ahmad]
  ))[0].id;
  const idH7 = (await q(`insert into public.agenda (tahun_ajaran, jenis, judul, tanggal) values ('2026/2027','naik_kelas','Naik Kelas H-7', sigarda.hari_ini() + 7) returning id`))[0].id;
  const idH1 = (await q(`insert into public.agenda (tahun_ajaran, jenis, judul, tanggal, keterangan) values ('2026/2027','lainnya','Kegiatan H-1', sigarda.hari_ini() + 1, 'Kumpul jam 7 pagi') returning id`))[0].id;
  await q(`insert into public.agenda (tahun_ajaran, jenis, judul, tanggal) values ('2026/2027','sidang','Bukan hari pengingat', sigarda.hari_ini() + 5)`);

  const pengurusIds = (await q(`select id from public.profiles where status = 'aktif' and (role in ('penguji','admin') or (role = 'peserta' and jabatan_dewan is not null))`)).map((x) => x.id);
  await q('select sigarda.agenda_proses()');
  const notifAgenda = await q(`select penerima_id, judul, isi, kunci from public.notifikasi where jenis = 'agenda'`);
  ok(notifAgenda.length > 0, `notifikasi agenda terbentuk (${notifAgenda.length} baris)`);
  ok(notifAgenda.some((n) => n.kunci === `agenda:${idH30}:${hariIni}`), 'H-30 memakai kunci agenda:<id>:<hari ini>');
  ok(!notifAgenda.some((n) => n.judul.includes('Bukan hari pengingat')), 'kegiatan H-5 (bukan 30/7/1) TIDAK memicu pengingat');
  for (const pid of pengurusIds) {
    ok(notifAgenda.filter((n) => n.penerima_id === pid).length === 3, `pengurus ${pid} menerima 3 pengingat (H-30, H-7, H-1)`);
  }
  ok(notifAgenda.filter((n) => n.penerima_id === ahmad).length === 1 && notifAgenda.some((n) => n.penerima_id === ahmad && n.kunci.includes(String(idH30))),
    'Ahmad (peserta_terkait pada kegiatan H-30 saja) menerima TEPAT 1 pengingat, bukan untuk kegiatan lain');
  ok(notifAgenda.find((n) => n.kunci.includes(String(idH1)))?.isi === 'Kumpul jam 7 pagi', 'isi notifikasi memakai keterangan agenda apa adanya');
  ok(notifAgenda.find((n) => n.kunci.includes(String(idH7)))?.isi.includes('Dijadwalkan'), 'tanpa keterangan: isi bawaan "Dijadwalkan <tanggal>."');

  const totalSebelum = (await q(`select count(*)::int n from public.notifikasi`))[0].n;
  await q('select sigarda.agenda_proses()');
  ok((await q(`select count(*)::int n from public.notifikasi`))[0].n === totalSebelum, 'dijalankan lagi pada hari yang sama: tidak ada notifikasi ganda');

  await pg.close();
}

console.log(`\nRINGKASAN AGENDA: ${lulus} lulus, ${gagal} GAGAL.`);
if (gagal) process.exit(1);
