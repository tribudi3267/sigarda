// Fase 1a: penugasan penguji per rombel, format rombel baku, alat perbarui rombel massal, agama Pembina, guru agama.
// Server (PGlite + Edge Function tiruan lewat api), logika klien murni, dan berkas Excel.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import {
  SEMUA_ROMBEL, cakupanAgama, daftarPengujiUrut, daftarRombelKelas, geserTahunAjaran, kelasDariRombel, kunciPenugasan, normalisasiRombel,
  pembinaTanpaAgama, pesertaRombelLama, ringkasRombel, rombelSah, tahunAjaranSah, jumlahPesertaPerRombel,
} from '../src/lib/rombelLogic.js';
import { bacaExcelRombel, buatBerkasRombel, daftarRombelLama, periksaRombelMassal } from '../src/lib/rombelExcel.js';
import { bacaExcelAnggota, buatTemplateAnggota, kolomTemplate, periksaBaris } from '../src/lib/importAnggota.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const K = { admin: await masuk('admin', PIN_DEMO.admin), pembina: await masuk('pembina', PIN_DEMO.pembina), dewan: await masuk('dewan', PIN_DEMO.dewan), ahmad: await masuk('10231', PIN_DEMO.penegak) };
const cocok = (r, re) => !r.ok && re.test(r.pesan ?? '');
const taKini = (await q('select sigarda.tahun_ajaran_kini() t'))[0].t;
const TA = '2030/2031', TA2 = '2031/2032';

console.log('--- Rombel: logika klien murni ---');
ok(SEMUA_ROMBEL.length === 30 && SEMUA_ROMBEL[0] === 'X-01' && SEMUA_ROMBEL[9] === 'X-10' && SEMUA_ROMBEL[10] === 'XI-01' && SEMUA_ROMBEL[29] === 'XII-10', '30 rombel baku: X-01..X-10, XI-01..XI-10, XII-01..XII-10');
ok(daftarRombelKelas('XI').join() === 'XI-01,XI-02,XI-03,XI-04,XI-05,XI-06,XI-07,XI-08,XI-09,XI-10', 'daftarRombelKelas("XI")');
const contohRombel = ['X-01', 'X-10', 'XI-05', 'XII-10', 'X-00', 'X-11', 'XIII-01', 'X', 'XI', 'x-01', 'X-1', 'X 01', 'XII-1', '', null, 'X-010', ' X-01'];
ok(contohRombel.filter(rombelSah).join() === 'X-01,X-10,XI-05,XII-10', 'rombelSah: hanya dua angka 01-10 dan huruf besar');
const hasilNorm = ['xi 3', 'XI-3', 'xi.03', 'XII/10', 'x-1', 'XI03', 'X', 'XI-11', 'XIII-01', 'X-00', '', null, 'x - 05'].map(normalisasiRombel);
ok(hasilNorm.join() === 'XI-03,XI-03,XI-03,XII-10,X-01,XI-03,,,,,,,X-05', 'normalisasiRombel membakukan isian bebas: ' + hasilNorm.join());
ok(kelasDariRombel('XI-05') === 'XI' && kelasDariRombel('X') === null, 'kelasDariRombel');
ok(tahunAjaranSah('2026/2027') && !tahunAjaranSah('2026/2028') && !tahunAjaranSah('2026') && !tahunAjaranSah('1999/2000') && geserTahunAjaran('2026/2027', -1) === '2025/2026' && geserTahunAjaran('2026/2027', 1) === '2027/2028', 'tahun ajaran: sah dan geser');
// Server dan klien sepakat (cermin sigarda.rombel_sah dan sigarda.tahun_ajaran_sah)
{
  let sama = true;
  for (const r of contohRombel) if ((await q('select sigarda.rombel_sah($1) v', [r]))[0].v !== rombelSah(r)) { sama = false; console.log('   beda rombel_sah:', r); }
  for (const t of ['2026/2027', '2026/2028', '2026', '1999/2000', '2100/2101', '2101/2102', 'abcd/efgh', null]) if ((await q('select sigarda.tahun_ajaran_sah($1) v', [t]))[0].v !== tahunAjaranSah(t)) { sama = false; console.log('   beda tahun_ajaran_sah:', t); }
  ok(sama, 'server (rombel_sah, tahun_ajaran_sah) dan klien menilai sama');
  ok((await q('select sigarda.rombel_baku($1) v', [' xi - 03 ']))[0].v === 'XI-03', 'rombel_baku membuang spasi dan membesarkan huruf');
}

console.log('\n--- Data contoh ---');
const users = (await K.admin.a.muatProfil()).data;
ok(users.filter((u) => u.role === 'peserta').every((u) => rombelSah(u.kelas)), 'seluruh Penegak contoh berrombel baku');
ok((await q('select count(*)::int n from public.penugasan_rombel where tahun_ajaran = $1', [taKini]))[0].n === 6 && (await q('select count(*)::int n from public.penugasan_log where tahun_ajaran = $1', [taKini]))[0].n === 6, `penugasan contoh: 6 penugasan dan 6 catatan riwayat pada ${taKini}`);
{
  const r = await K.pembina.a.muatPenugasan(taKini);
  ok(r.ok && r.data.length === 6 && r.data.every((x) => x.rombel && x.pengujiId), 'Pembina membaca penugasan (bentuk { rombel, pengujiId })');
  const ring = ringkasRombel(r.data, users);
  ok(ring.filter((x) => x.tanpaPenguji).map((x) => x.rombel).join() === 'XII-02', 'peringatan: hanya XII-02 berisi Penegak tanpa penguji');
  ok(ring.find((x) => x.rombel === 'X-01').penguji === 2 && ring.find((x) => x.rombel === 'X-01').peserta === 2 && ring.find((x) => x.rombel === 'X-03').peserta === 0, 'ringkasan per rombel: jumlah penguji dan Penegak');
  ok(kunciPenugasan(r.data).has(`${K.pembina.id}|X-01`) && !kunciPenugasan(r.data).has(`${K.pembina.id}|X-02`), 'kunciPenugasan');
  ok(jumlahPesertaPerRombel(users)['X-01'] === 2, 'jumlahPesertaPerRombel');
  ok(daftarPengujiUrut(users).map((u) => u.jabatan).join() === 'Pembina,Dewan Ambalan', 'penguji diurut: Pembina lebih dulu');
  const r2 = await K.ahmad.a.muatPenugasan(taKini);
  ok(r2.ok && r2.data.length === 0, 'Penegak tidak melihat penugasan (RLS)');
}

console.log('\n--- Server: mengatur penugasan (khusus Admin) ---');
const pembinaId = K.pembina.id, dewanId = K.dewan.id, ahmadId = K.ahmad.id;
let r = await K.admin.a.aturPenugasan(TA, pembinaId, ['X-01', 'x-02', ' XI-03 '], true);
ok(r.ok && r.data === 3, 'Admin menugaskan Pembina pada 3 rombel (huruf dan spasi dibakukan)');
ok((await q('select rombel from public.penugasan_rombel where tahun_ajaran = $1 and penguji_id = $2 order by rombel', [TA, pembinaId])).map((x) => x.rombel).join() === 'X-01,X-02,XI-03', 'tersimpan sebagai X-01, X-02, XI-03');
r = await K.admin.a.aturPenugasan(TA, pembinaId, ['X-01', 'X-02'], true);
ok(r.ok && r.data === 0, 'mengulang: tidak ada perubahan nyata (0)');
ok((await q('select count(*)::int n from public.penugasan_log where tahun_ajaran = $1', [TA]))[0].n === 3, 'riwayat hanya mencatat perubahan nyata (3)');
r = await K.admin.a.aturPenugasan(TA, pembinaId, ['X-01', 'X-11'], true);
ok(cocok(r, /X-11.*tidak sah/), 'rombel tidak sah ditolak: ' + r.pesan);
ok((await q('select count(*)::int n from public.penugasan_rombel where tahun_ajaran = $1', [TA]))[0].n === 3, 'permintaan yang ditolak tidak menyimpan sebagian (atomik)');
r = await K.admin.a.aturPenugasan(TA, pembinaId, ['X'], true);
ok(cocok(r, /tidak sah/), 'kelas tanpa nomor ("X") bukan rombel');
ok(cocok(await K.admin.a.aturPenugasan('2030', pembinaId, ['X-01'], true), /Tahun ajaran tidak sah/) && cocok(await K.admin.a.aturPenugasan('2030/2032', pembinaId, ['X-01'], true), /Tahun ajaran tidak sah/), 'tahun ajaran tidak sah ditolak');
ok(cocok(await K.admin.a.aturPenugasan(TA, ahmadId, ['X-01'], true), /Penguji tidak ditemukan/), 'Penegak tidak dapat ditugaskan sebagai penguji');
ok(cocok(await K.admin.a.aturPenugasan(TA, K.admin.id, ['X-01'], true), /Penguji tidak ditemukan/), 'Admin sendiri bukan penguji');
ok(cocok(await K.admin.a.aturPenugasan(TA, pembinaId, Array.from({ length: 31 }, () => 'X-01'), true), /Maksimal 30/), 'maksimal 30 rombel per permintaan');
ok((await K.admin.a.aturPenugasan(TA, pembinaId, [], true)).data === 0, 'daftar kosong: tidak berbuat apa-apa');
for (const [nama, kk] of [['Dewan Ambalan (akun lama)', K.dewan], ['Penegak', K.ahmad]]) {
  ok(cocok(await kk.a.aturPenugasan(TA, pembinaId, ['X-05'], true), /Hanya Pembina dan Admin/), `${nama} tidak dapat mengatur penugasan`);
}
r = await K.admin.a.aturPenugasan(TA, dewanId, daftarRombelKelas('X'), true);
ok(r.ok && r.data === 10, 'Admin menugaskan Dewan Ambalan pada seluruh kelas X (10 rombel sekaligus)');
r = await K.admin.a.aturPenugasan(TA, dewanId, ['X-03', 'X-04'], false);
ok(r.ok && r.data === 2, 'mencabut 2 penugasan');
ok((await K.admin.a.aturPenugasan(TA, dewanId, ['X-03'], false)).data === 0, 'mencabut yang sudah tidak ada: 0 perubahan');
{
  const lg = await K.pembina.a.muatLogPenugasan(TA);
  ok(lg.ok && lg.data.length === 3 + 10 + 2 && lg.data.at(-1).tindakan === 'hapus' && lg.data.at(-1).olehNama === 'Admin Gudep' && lg.data.at(-1).pengujiNama === users.find((u) => u.id === dewanId).nama, 'riwayat: lama ke baru, memuat nama penguji dan pelaku');
  ok(lg.data.filter((x) => x.tindakan === 'tambah').length === 13 && lg.data.filter((x) => x.tindakan === 'hapus').length === 2, 'riwayat: 13 penambahan, 2 pencabutan');
}
ok(cocok(await K.admin.a.aturPenugasan(TA, dewanId, ['X-05'], null), /wajib diisi/), 'pilihan tambah/cabut wajib');
{
  const e = await sqlSebagai(pg, K.admin.id, 'delete from public.penugasan_log').then(() => null, (x) => x.message);
  const e2 = await sqlSebagai(pg, K.admin.id, "insert into public.penugasan_rombel (tahun_ajaran, rombel, penguji_id) values ('2030/2031','X-09', $1)", [pembinaId]).then(() => null, (x) => x.message);
  const e3 = await sqlSebagai(pg, K.admin.id, "update public.penugasan_log set rombel = 'X-01'").then(() => null, (x) => x.message);
  ok(e && e2 && e3, 'tulis langsung ke tabel penugasan dan riwayat ditolak, termasuk oleh Admin: ' + [e, e2, e3].map((x) => String(x).slice(0, 30)).join(' | '));
}

console.log('\n--- Server: salin dari tahun ajaran lain ---');
r = await K.admin.a.salinPenugasan(taKini, TA2);
ok(r.ok && r.data === 6, `menyalin ${taKini} ke ${TA2}: 6 penugasan`);
ok((await q("select count(*)::int n from public.penugasan_log where tahun_ajaran = $1 and catatan = 'Disalin dari ' || $2", [TA2, taKini]))[0].n === 6, 'riwayat mencatat "Disalin dari ..." untuk tiap penugasan');
ok((await K.admin.a.salinPenugasan(taKini, TA2)).data === 0, 'menyalin ulang: tidak menambah apa pun (0)');
await K.admin.a.aturPenugasan(TA2, pembinaId, ['XII-09'], true);
ok((await K.admin.a.salinPenugasan(taKini, TA2)).data === 0 && (await q('select count(*)::int n from public.penugasan_rombel where tahun_ajaran = $1', [TA2]))[0].n === 7, 'penugasan yang sudah ada di tujuan dipertahankan, tidak ada yang dicabut');
ok(cocok(await K.admin.a.salinPenugasan(taKini, taKini), /tidak boleh sama/), 'asal dan tujuan sama ditolak');
ok(cocok(await K.admin.a.salinPenugasan('2040/2041', TA2), /belum memiliki penugasan/), 'sumber kosong ditolak dengan pesan jelas');
ok(cocok(await K.admin.a.salinPenugasan('x', TA2), /Tahun ajaran tidak sah/), 'tahun ajaran sumber tidak sah');
ok(cocok(await K.dewan.a.salinPenugasan(taKini, '2035/2036'), /Hanya Pembina dan Admin/), 'Dewan Ambalan tidak dapat menyalin (Pembina dan Admin boleh sejak fase 6b)');

console.log('\n--- Server: penguji dihapus, riwayat tetap ---');
{
  const pb = await K.admin.a.buatAkun('dewan', [{ no: 1, nama: 'Dewan Sementara', username: 'dewan.sementara', pin: '482913' }]);
  const id = (await q("select id from public.profiles where username = 'dewan.sementara'"))[0].id;
  ok(pb.ok && (await K.admin.a.aturPenugasan(TA, id, ['XII-05'], true)).data === 1, 'Dewan sementara ditugaskan pada XII-05');
  await K.admin.a.hapusAkun(id);
  ok((await q('select count(*)::int n from public.penugasan_rombel where penguji_id = $1', [id]))[0].n === 0, 'penugasan ikut terhapus bersama akun (cascade)');
  ok((await q("select count(*)::int n from public.penugasan_log where penguji_nama = 'Dewan Sementara' and penguji_id is null"))[0].n === 1, 'riwayat tetap ada dengan nama tersalin (penguji_id dikosongkan)');
}

console.log('\n--- Server: guru agama ---');
r = await K.admin.a.simpanGuruAgama({ agama: 'Hindu', nama: '  Ni Made  Sari, S.Ag. ', keterangan: 'NIP 1970' });
ok(r.ok && Number(r.data) > 0, 'Admin menambah guru agama Hindu');
const idGuru = Number(r.data);
ok((await q('select nama, keterangan from public.guru_agama where id = $1', [idGuru]))[0].nama === 'Ni Made Sari, S.Ag.', 'nama dirapikan (spasi ganda dibuang)');
ok(cocok(await K.admin.a.simpanGuruAgama({ agama: 'Hindu', nama: 'ni made sari, s.ag.' }), /sudah terdaftar/), 'nama kembar pada agama yang sama (abaikan huruf besar) ditolak');
ok((await K.admin.a.simpanGuruAgama({ agama: 'Buddha', nama: 'Ni Made Sari, S.Ag.' })).ok, 'nama yang sama pada agama lain boleh');
ok(cocok(await K.admin.a.simpanGuruAgama({ agama: 'Zoroaster', nama: 'X' }), /Agama tidak dikenal/) && cocok(await K.admin.a.simpanGuruAgama({ agama: 'Islam', nama: '  ' }), /wajib diisi/), 'agama tidak dikenal dan nama kosong ditolak');
ok(cocok(await K.admin.a.simpanGuruAgama({ agama: 'Islam', nama: 'A'.repeat(121) }), /maksimal 120/) && cocok(await K.admin.a.simpanGuruAgama({ agama: 'Islam', nama: 'A', keterangan: 'K'.repeat(201) }), /maksimal 200/), 'batas panjang nama dan keterangan');
r = await K.admin.a.simpanGuruAgama({ id: idGuru, agama: 'Hindu', nama: 'Ni Made Sari, M.Pd.H.', keterangan: '' });
ok(r.ok && (await q('select nama from public.guru_agama where id = $1', [idGuru]))[0].nama === 'Ni Made Sari, M.Pd.H.', 'Admin mengubah guru agama');
ok(cocok(await K.admin.a.simpanGuruAgama({ id: 999999, agama: 'Hindu', nama: 'Tidak Ada' }), /tidak ditemukan/), 'mengubah yang tidak ada ditolak');
for (const [nama, kk] of [['Pembina', K.pembina], ['Dewan Ambalan', K.dewan], ['Penegak', K.ahmad]]) {
  ok(cocok(await kk.a.simpanGuruAgama({ agama: 'Islam', nama: 'Peretas' }), /Hanya Admin/) && cocok(await kk.a.hapusGuruAgama(idGuru), /Hanya Admin/), `${nama} tidak dapat mengelola guru agama`);
}
{
  const g = await K.pembina.a.muatGuruAgama();
  ok(g.ok && g.data.length === 4 && g.data[0].agama && g.data[0].nama, 'Pembina membaca daftar guru agama');
  ok((await K.ahmad.a.muatGuruAgama()).data.length === 0, 'Penegak tidak melihat guru agama (RLS)');
  const ca = cakupanAgama(users, g.data);
  ok(ca.length === 6 && ca.find((x) => x.agama === 'Hindu').guru.length === 2 && ca.find((x) => x.agama === 'Hindu').perluSurat === true, 'cakupan agama: Hindu punya Penegak, tanpa Pembina seagama -> perlu surat, ada 2 guru (1 dari data contoh, 1 ditambahkan di atas)');
  ok(ca.find((x) => x.agama === 'Khonghucu').penegak === 0 && ca.find((x) => x.agama === 'Khonghucu').perluSurat === false, 'agama tanpa Penegak tidak memerlukan surat');
}
ok((await K.admin.a.hapusGuruAgama(idGuru)).ok && (await q('select count(*)::int n from public.guru_agama where id = $1', [idGuru]))[0].n === 0, 'Admin menghapus guru agama');

console.log('\n--- Server: agama Pembina ---');
ok(pembinaTanpaAgama(users.map((u) => (u.jabatan === 'Pembina' ? { ...u, agama: undefined } : u))).length === 1, 'pembinaTanpaAgama menemukan Pembina tanpa agama');
const pembinaProfil = () => q('select agama from public.profiles where id = $1', [pembinaId]).then((x) => x[0].agama);
ok((await pembinaProfil()) === 'Islam', 'Pembina contoh beragama Islam');
r = await K.admin.a.ubahAnggota({ id: pembinaId, nama: 'Pembina Gudep (contoh)', agama: 'Hindu' });
ok(r.ok && (await pembinaProfil()) === 'Hindu', 'Admin mengubah agama Pembina lewat sg_anggota_ubah');
r = await K.admin.a.ubahAnggota({ id: pembinaId, nama: 'Pembina Gudep (contoh)' });
ok(r.ok && (await pembinaProfil()) === 'Hindu', 'agama tidak dikirim (null): tidak diubah');
r = await K.admin.a.ubahAnggota({ id: pembinaId, nama: 'Pembina Gudep (contoh)', agama: '' });
ok(r.ok && (await pembinaProfil()) === null, 'agama "" mengosongkan agama Pembina');
r = await K.admin.a.ubahAnggota({ id: pembinaId, nama: 'Pembina Gudep (contoh)', agama: 'Zoroaster' });
ok(cocok(r, /Agama tidak dikenal/) && (await pembinaProfil()) === null, 'agama tidak dikenal ditolak');
r = await K.admin.a.ubahAnggota({ id: dewanId, nama: 'Dewan Ambalan (contoh)', agama: 'Islam' });
ok(r.ok && (await q('select agama from public.profiles where id = $1', [dewanId]))[0].agama === null, 'Dewan Ambalan tidak berAgama (isian diabaikan)');
r = await K.admin.a.aturAgamaPembina([{ username: 'pembina', agama: 'Katolik' }, { username: 'dewan', agama: 'Katolik' }, { username: 'tidak.ada', agama: 'Katolik' }]);
ok(r.ok && r.data === 1 && (await pembinaProfil()) === 'Katolik' && (await q('select agama from public.profiles where id = $1', [dewanId]))[0].agama === null, 'aturAgamaPembina: hanya Pembina yang diperbarui (1 dari 3)');
ok(cocok(await K.admin.a.aturAgamaPembina([{ username: 'pembina', agama: 'Zoroaster' }]), /tidak dikenal/) && cocok(await K.admin.a.aturAgamaPembina([{ username: '', agama: 'Islam' }]), /wajib diisi/), 'aturAgamaPembina: agama tidak dikenal dan nama pengguna kosong ditolak');
ok((await K.admin.a.aturAgamaPembina([{ username: 'pembina', agama: '' }])).data === 1 && (await pembinaProfil()) === null, 'aturAgamaPembina: agama kosong menghapus');
ok(cocok(await K.pembina.a.aturAgamaPembina([{ username: 'pembina', agama: 'Islam' }]), /Hanya Admin/) && cocok(await K.dewan.a.aturAgamaPembina([{ username: 'pembina', agama: 'Islam' }]), /Hanya Admin/), 'selain Admin tidak dapat mengubah agama Pembina lewat fungsi');
await K.admin.a.aturAgamaPembina([{ username: 'pembina', agama: 'Islam' }]);

console.log('\n--- Server: format rombel pada akun dan perubahan ---');
{
  const b = await K.admin.a.buatAkun('peserta', [
    { no: 1, nama: 'Rombel Baru', nis: '88001', kelas: 'x-03', sangga: 'Sangga Elang', agama: 'Islam', pin: '482913' },
    { no: 2, nama: 'Kelas Lama', nis: '88002', kelas: 'X', sangga: 'Sangga Elang', agama: 'Islam', pin: '482913' },
    { no: 3, nama: 'Rombel Luar', nis: '88003', kelas: 'XII-11', sangga: 'Sangga Elang', agama: 'Islam', pin: '482913' },
  ]);
  ok(b.ok && b.hasil[0].ok && !b.hasil[1].ok && !b.hasil[2].ok, 'buat akun: hanya rombel baku yang diterima');
  ok(/rombel/.test(b.hasil[1].pesan) && (await q("select count(*)::int n from auth.users where email like '88002%' or email like '88003%'"))[0].n === 0, 'akun yang ditolak tidak meninggalkan akun yatim: ' + b.hasil[1].pesan);
  ok((await q("select kelas from public.profiles where username = '88001'"))[0].kelas === 'X-03', 'kelas "x-03" disimpan sebagai X-03');
  const id = (await q("select id from public.profiles where username = '88001'"))[0].id;
  ok(cocok(await K.admin.a.ubahAnggota({ id, nama: 'Rombel Baru', kelas: 'XI', sangga: 'Sangga Elang', agama: 'Islam' }), /rombel/), 'ubah anggota: kelas "XI" ditolak');
  ok((await K.admin.a.ubahAnggota({ id, nama: 'Rombel Baru', kelas: 'xii-10', sangga: 'Sangga Elang', agama: 'Islam' })).ok && (await q('select kelas from public.profiles where id = $1', [id]))[0].kelas === 'XII-10', 'ubah anggota: "xii-10" diterima sebagai XII-10');
}

console.log('\n--- Server: perbarui rombel massal ---');
{
  // Data lama: kelas "X"/"XI"/"XII" (mis. sebelum fase ini)
  await q(`update public.profiles set kelas = 'X' where username in ('10231', '10232', '10233', '10234')`);
  await q(`update public.profiles set kelas = 'XI' where username in ('10118', '10119')`);
  const semua = (await K.admin.a.muatProfil()).data;
  const lama = pesertaRombelLama(semua);
  ok(lama.length === 6 && lama.every((u) => ['X', 'XI'].includes(u.kelas)), 'pesertaRombelLama menemukan 6 Penegak berkelas lama');
  ok(daftarRombelLama(semua).map((u) => u.kelas).join() === 'X,X,X,X,XI,XI', 'daftarRombelLama urut kelas lalu nama');
  const hasil = await K.admin.a.perbaruiRombel([{ username: '10231', rombel: 'X-01' }, { username: '10232', rombel: 'X-02' }, { username: '10233', rombel: 'X-02' }]);
  ok(hasil.ok && hasil.data === 3 && (await q("select kelas from public.profiles where username = '10233'"))[0].kelas === 'X-02', 'perbarui 3 Penegak sekaligus');
  r = await K.admin.a.perbaruiRombel([{ username: '10234', rombel: 'X-03' }, { username: '99999999', rombel: 'X-03' }]);
  ok(cocok(r, /Baris 2.*tidak ditemukan/) && (await q("select kelas from public.profiles where username = '10234'"))[0].kelas === 'X', 'baris keliru membatalkan seluruhnya (atomik): ' + r.pesan);
  r = await K.admin.a.perbaruiRombel([{ username: '10234', rombel: 'X' }]);
  ok(cocok(r, /Baris 1.*tidak sah/), 'kelas lama sebagai tujuan ditolak');
  ok(cocok(await K.admin.a.perbaruiRombel([{ username: '', rombel: 'X-03' }]), /NIS wajib/) && cocok(await K.admin.a.perbaruiRombel('bukan larik'), /tidak valid/), 'NIS kosong dan bentuk data salah ditolak');
  r = await K.admin.a.perbaruiRombel([{ username: 'pembina', rombel: 'X-03' }]);
  ok(cocok(r, /tidak ditemukan/), 'akun bukan Penegak tidak dapat diberi rombel');
  ok(cocok(await K.pembina.a.perbaruiRombel([{ username: '10234', rombel: 'X-03' }]), /Hanya Admin/) && cocok(await K.ahmad.a.perbaruiRombel([{ username: '10231', rombel: 'X-03' }]), /Hanya Admin/), 'selain Admin tidak dapat memperbarui rombel');
  r = await K.admin.a.perbaruiRombel(Array.from({ length: 501 }, () => ({ username: '10234', rombel: 'X-03' })));
  ok(cocok(r, /Maksimal 500/), 'maksimal 500 baris per permintaan');

  console.log('\n--- Excel: perbarui rombel massal ---');
  const semua2 = (await K.admin.a.muatProfil()).data;
  const buf = await buatBerkasRombel(semua2);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet('Rombel');
  ok(ws.getRow(1).values.slice(1).join() === 'NIS,Nama,Kelas Sekarang,Rombel' && ws.rowCount === 1 + 3, 'berkas berisi judul dan 3 Penegak berkelas lama: ' + ws.rowCount);
  ok(ws.getCell(2, 4).dataValidation?.type === 'list' && String(ws.getCell(2, 4).dataValidation.formulae[0]).includes('XII-10'), 'kolom Rombel berdaftar pilihan 30 rombel');
  ok(String(ws.getCell(2, 1).value) === '10118' || String(ws.getCell(2, 1).value) === '10119' || /^\d+$/.test(String(ws.getCell(2, 1).value)), 'NIS tersimpan sebagai teks');
  // isi: baris 2 = "xi 3" (dibakukan), baris 3 = "XI-2", baris 4 = salah
  ws.getCell(2, 4).value = 'xi 3'; ws.getCell(3, 4).value = 'XI-2'; ws.getCell(4, 4).value = 'XIII-01';
  ws.addRow(['99999', 'Tak Ada', 'X', 'X-05']);
  ws.addRow([String(ws.getCell(2, 1).value), 'Ganda', 'XI', 'XI-06']);
  const baris = await bacaExcelRombel(await wb.xlsx.writeBuffer());
  ok(baris.length === 5 && baris[0].rombel === 'xi 3', 'bacaExcelRombel membaca NIS dan Rombel (5 baris)');
  const cek = periksaRombelMassal(baris, semua2);
  ok(cek.filter((x) => x.siap).length === 2 && cek[0].siap && cek[0].rombel === 'XI-03' && cek[1].siap && cek[1].rombel === 'XI-02', 'periksaRombelMassal: 2 siap, "xi 3" dibakukan menjadi XI-03');
  ok(/tidak sah/.test(cek[2].galat.join()) && /tidak terdaftar/.test(cek[3].galat.join()) && /lebih dari sekali/.test(cek[4].galat.join()), 'baris keliru: rombel tidak sah, NIS tidak terdaftar, NIS ganda dalam berkas');
  const sah = cek.filter((x) => x.siap).map((x) => ({ username: x.username, rombel: x.rombel }));
  ok((await K.admin.a.perbaruiRombel(sah)).ok && (await K.admin.a.muatProfil()).data.filter((u) => rombelSah(u.kelas)).length === (semua2.filter((u) => rombelSah(u.kelas)).length + 2), 'hasil pemeriksaan dapat disimpan ke server');
  let galatBaca = ''; try { await bacaExcelRombel(new ArrayBuffer(8)); } catch (e) { galatBaca = e.message; }
  ok(/tidak dapat dibaca/.test(galatBaca), 'berkas rusak ditolak dengan pesan jelas');
  const wbKosong = new ExcelJS.Workbook(); wbKosong.addWorksheet('Rombel').addRow(['Nama', 'Kelas']);
  galatBaca = ''; try { await bacaExcelRombel(await wbKosong.xlsx.writeBuffer()); } catch (e) { galatBaca = e.message; }
  ok(/Baris judul tidak ditemukan/.test(galatBaca), 'berkas tanpa kolom NIS dan Rombel ditolak');
}

console.log('\n--- Import Excel: rombel baku dan agama Pembina ---');
{
  const users2 = (await K.admin.a.muatProfil()).data;
  const kp = { jk: 'L', nis: '', kelas: '', sangga: '', agama: '', pin: '', username: '' };
  let p = periksaBaris([
    { no: 2, nama: 'Baru A', jk: 'P', nis: '70001', kelas: 'xi 3', sangga: 'E', agama: 'Islam', pin: '', username: '' },
    { no: 3, nama: 'Baru B', jk: 'P', nis: '70002', kelas: 'X', sangga: 'E', agama: 'Islam', pin: '', username: '' },
    { no: 4, nama: 'Baru C', jk: 'P', nis: '70003', kelas: 'XII-11', sangga: 'E', agama: 'Islam', pin: '', username: '' },
    { no: 5, nama: 'Baru D', jk: 'P', nis: '70004', kelas: '', sangga: 'E', agama: 'Islam', pin: '', username: '' },
  ], users2);
  ok(p[0].siap && p[0].data.kelas === 'XI-03', 'Penegak: "xi 3" dibakukan menjadi XI-03');
  ok(!p[1].siap && /Rombel "X" tidak sah/.test(p[1].galat.join()) && !p[2].siap && !p[3].siap && /Rombel kosong/.test(p[3].galat.join()), 'Penegak: kelas lama, rombel di luar daftar, dan kosong ditolak');
  p = periksaBaris([
    { no: 2, nama: 'Bu Ani', ...kp, agama: 'Kristen' },
    { no: 3, nama: 'Bu Budi', ...kp, agama: 'Zoroaster' },
    { no: 4, nama: 'Bu Cici', ...kp },
  ], users2, 'pembina');
  ok(p[0].siap && p[0].data.agama === 'Protestan', 'Pembina: "Kristen" dibakukan menjadi Protestan');
  ok(!p[1].siap && /Agama "Zoroaster" tidak dikenal/.test(p[1].galat.join()) && p[2].siap && p[2].data.agama === '', 'Pembina: agama tidak dikenal ditolak; kosong diperbolehkan');
  p = periksaBaris([{ no: 2, nama: 'Pak Dedi', ...kp, agama: 'Islam' }], users2, 'dewan');
  ok(p[0].siap && p[0].data.agama === '', 'Dewan Ambalan: agama diabaikan');
  ok(kolomTemplate('pembina').map((c) => c.key).join() === 'nama,jk,username,agama,pin' && kolomTemplate('dewan').map((c) => c.key).join() === 'nama,jk,username,jabatanDewan,nta,pin' && kolomTemplate('peserta').map((c) => c.header)[3] === 'Rombel', 'kolom template: Pembina berAgama, Dewan berjabatan dan NTA (tanpa agama), Penegak memakai "Rombel"');

  // template Pembina: unduh, isi, baca
  const wbP = new ExcelJS.Workbook(); await wbP.xlsx.load(await buatTemplateAnggota('pembina'));
  const wsP = wbP.getWorksheet('Anggota');
  ok(wsP.getCell(2, 4).dataValidation?.type === 'list' && String(wsP.getCell(2, 4).dataValidation.formulae[0]).includes('Khonghucu'), 'template Pembina: kolom Agama berdaftar pilihan');
  wsP.getCell(2, 1).value = 'Bu Ani'; wsP.getCell(2, 4).value = 'Kristen';
  wsP.getCell(3, 1).value = 'Bu Budi';
  const bp = await bacaExcelAnggota(await wbP.xlsx.writeBuffer(), 'pembina');
  ok(bp.length === 2 && bp[0].agama === 'Kristen' && bp[1].agama === '', 'bacaExcelAnggota Pembina membaca kolom Agama');
  // template Dewan tidak boleh berkolom agama
  const wbD = new ExcelJS.Workbook(); await wbD.xlsx.load(await buatTemplateAnggota('dewan'));
  ok(wbD.getWorksheet('Anggota').getRow(1).values.slice(1).every((h) => !/agama/i.test(h)), 'template Dewan Ambalan: tanpa kolom Agama');
  let galatDewan = ''; try { await bacaExcelAnggota(await wbP.xlsx.writeBuffer(), 'dewan'); } catch (e) { galatDewan = e.message; }
  ok(/template Penegak/.test(galatDewan), 'berkas berkolom Agama ditolak sebagai impor Dewan Ambalan');
  // template Penegak: kolom Rombel berdaftar pilihan, dan template lama ("Kelas") tetap terbaca
  const wbS = new ExcelJS.Workbook(); await wbS.xlsx.load(await buatTemplateAnggota('peserta'));
  const wsS = wbS.getWorksheet('Anggota');
  ok(wsS.getCell(2, 4).dataValidation?.type === 'list' && String(wsS.getCell(2, 4).dataValidation.formulae[0]).includes('XII-10'), 'template Penegak: kolom Rombel berdaftar 30 rombel');
  ['Budi', 'Laki-laki', '70010', 'XI-07', 'Sangga Elang', 'Islam'].forEach((v, i) => { wsS.getCell(2, i + 1).value = v; });
  const bs = await bacaExcelAnggota(await wbS.xlsx.writeBuffer(), 'peserta');
  ok(bs.length === 1 && bs[0].kelas === 'XI-07' && bs[0].nis === '70010', 'bacaExcelAnggota Penegak membaca kolom Rombel');
  const wbLama = new ExcelJS.Workbook(); const wl = wbLama.addWorksheet('Anggota');
  wl.addRow(['Nama Lengkap', 'NIS', 'Kelas', 'Sangga', 'Agama']); wl.addRow(['Lama', '70011', 'XI-08', 'Sangga Merak', 'Islam']);
  ok((await bacaExcelAnggota(await wbLama.xlsx.writeBuffer(), 'peserta'))[0].kelas === 'XI-08', 'template lama dengan judul "Kelas" tetap terbaca');
}

console.log('\n--- Impor lewat Edge: agama Pembina disusulkan lewat fungsi ---');
{
  const b = await K.admin.a.buatAkun('pembina', [{ no: 1, nama: 'Bu Impor', username: 'bu.impor', agama: 'Hindu', pin: '482913' }]);
  const id = (await q("select id from public.profiles where username = 'bu.impor'"))[0].id;
  ok(b.ok && b.hasil[0].ok && (await q('select agama from public.profiles where id = $1', [id]))[0].agama === null, 'Edge Function tidak membawa agama Pembina (dibiarkan kosong)');
  ok((await K.admin.a.aturAgamaPembina([{ username: 'bu.impor', agama: 'Hindu' }])).data === 1 && (await q('select agama from public.profiles where id = $1', [id]))[0].agama === 'Hindu', 'agama disusulkan lewat sg_anggota_agama_atur (pola sama dengan NTA)');
}

console.log(`\nRINGKASAN PENUGASAN: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
