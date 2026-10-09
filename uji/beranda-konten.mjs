// Fase 2 landing page: Kelola Beranda konten (berita, prestasi, galeri, media sosial, FAQ) di server (PGlite): hak, validasi, alur tinjauan,
// kepemilikan, whitelist sg_beranda_publik, dan cadangan. Klien: uji/beranda-konten-klien.mjs. Migrasi: uji/migrasi-beranda-konten.mjs.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh, isiStatusContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await isiStatusContoh(pg); // Nadia (10008) berjabatan Sekretaris (Dewan)
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const K = { admin: await masuk('admin', PIN_DEMO.admin), pembina: await masuk('pembina', PIN_DEMO.pembina), dewan: await masuk('dewan', PIN_DEMO.dewan), sekretaris: await masuk('10008', PIN_DEMO.penegak), biasa: await masuk('10231', PIN_DEMO.penegak) };
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const cocok = (r, re) => !r.ok && re.test(r.pesan ?? '');
const publik = async () => (await sebagai(null, 'select public.sg_beranda_publik() as d')).rows[0].d;

console.log('--- Berita: hak dan alur tinjauan ---');
{
  let r = await sebagai(K.biasa.id, "select public.sg_berita_simpan(null, 'kegiatan', 'Judul', '', 'Isi', '', 'draf', null) as id");
  ok(cocok(r, /Hanya pengurus/), 'Penegak biasa tidak dapat menulis berita');
  r = await sebagai(K.sekretaris.id, "select public.sg_berita_simpan(null, 'kegiatan', 'Latihan perdana', 'Ringkas', 'Isi lengkap berita', '', 'terbit', null) as id");
  ok(cocok(r, /Hanya Pembina dan Admin Gudep yang dapat menerbitkan/), 'Dewan tidak dapat langsung menerbitkan berita');
  r = await sebagai(K.sekretaris.id, "select public.sg_berita_simpan(null, 'kegiatan', 'Latihan perdana', 'Ringkas', 'Isi lengkap berita', '', 'menunggu', null) as id");
  ok(r.ok, 'Dewan dapat mengajukan berita (menunggu) ' + (r.pesan ?? ''));
  const idBerita = r.rows[0].id;
  ok((await q('select status from public.beranda_berita where id = $1', [idBerita]))[0].status === 'menunggu', 'status tersimpan menunggu');
  r = await sebagai(K.biasa.id, `select public.sg_berita_tinjau(${idBerita}, 'terbit', '') as x`);
  ok(cocok(r, /Hanya Pembina dan Admin Gudep yang dapat meninjau/), 'Penegak biasa tidak dapat meninjau');
  r = await sebagai(K.pembina.id, `select public.sg_berita_tinjau(${idBerita}, 'ditolak', '') as x`);
  ok(cocok(r, /Alasan penolakan wajib diisi/), 'menolak tanpa catatan ditolak');
  r = await sebagai(K.pembina.id, `select public.sg_berita_tinjau(${idBerita}, 'ditolak', 'Foto belum ada') as x`);
  ok(r.ok, 'Pembina menolak dengan catatan');
  const setelahTolak = (await q('select status, catatan_tinjauan, ditinjau_oleh_nama from public.beranda_berita where id = $1', [idBerita]))[0];
  ok(setelahTolak.status === 'ditolak' && setelahTolak.catatan_tinjauan === 'Foto belum ada' && setelahTolak.ditinjau_oleh_nama, 'catatan dan peninjau tersimpan');
  r = await sebagai(K.sekretaris.id, `select public.sg_berita_hapus(${idBerita}) as x`);
  ok(r.ok, 'Dewan membatalkan (menghapus) pengajuannya sendiri yang ditolak');
  ok((await q('select count(*)::int n from public.beranda_berita where id = $1', [idBerita]))[0].n === 0, 'baris benar-benar terhapus');

  r = await sebagai(K.pembina.id, "select public.sg_berita_simpan(null, 'pengumuman', 'Pengumuman resmi', '', 'Isi pengumuman', '', 'terbit', null) as id");
  ok(r.ok, 'Pembina menerbitkan langsung');
  const idTerbit = r.rows[0].id;
  r = await sebagai(K.sekretaris.id, `select public.sg_berita_simpan(${idTerbit}, 'pengumuman', 'Ubah', '', 'Isi', '', 'draf', null) as id`);
  ok(cocok(r, /Anda hanya dapat mengubah berita sendiri/), 'Dewan tidak dapat mengubah berita terbit milik Pembina');
  r = await sebagai(K.pembina.id, `select public.sg_berita_simpan(${idTerbit}, 'pengumuman', 'Pengumuman resmi (revisi)', '', 'Isi baru', '', 'terbit', null) as id`);
  ok(r.ok, 'Pembina dapat mengubah berita terbit sendiri');
  r = await sebagai(K.dewan.id, "select public.sg_berita_simpan(null, 'kegiatan', 'Draf saya', '', 'Isi', '', 'draf', null) as id");
  const idDrafDewanLama = r.rows[0].id;
  r = await sebagai(K.dewan.id, `select public.sg_berita_hapus(${idDrafDewanLama}) as x`);
  ok(r.ok, 'akun Dewan lama juga pengurus: dapat menulis dan menghapus draf sendiri');

  // Penjadwalan: terbit_pada masa depan tetap tersimpan (Pembina/Admin).
  const depan = (await q("select (sigarda.hari_ini() + 30)::text d"))[0].d;
  r = await sebagai(K.admin.id, `select public.sg_berita_simpan(null, 'lainnya', 'Kegiatan terjadwal', '', 'Isi', '', 'terbit', $1::timestamptz) as id`, [`${depan} 00:00:00+07`]);
  ok(r.ok, 'Admin menjadwalkan berita ke masa depan');
  const idJadwal = r.rows[0].id;
  ok(new Date((await q('select terbit_pada from public.beranda_berita where id = $1', [idJadwal]))[0].terbit_pada) > new Date(), 'terbit_pada tersimpan di masa depan');
}

console.log('\n--- Berita: validasi ---');
{
  const s = async (judul, isi = 'Isi', kategori = 'kegiatan', sampul = '') => sebagai(K.pembina.id, "select public.sg_berita_simpan(null, $1, $2, '', $3, $4, 'draf', null) as id", [kategori, judul, isi, sampul]);
  ok(cocok(await s(''), /Judul berita wajib diisi/), 'judul kosong ditolak');
  ok(cocok(await s('x'.repeat(151)), /maksimal 150/), 'judul terlalu panjang ditolak');
  ok(cocok(await s('Judul', ''), /Isi berita wajib diisi/), 'isi kosong ditolak');
  ok(cocok(await s('Judul', 'x', 'bukan-kategori'), /Kategori berita tidak dikenal/), 'kategori tidak dikenal ditolak');
  ok(cocok(await s('Judul', 'x', 'kegiatan', 'javascript:alert(1)'), /https/), 'sampul javascript: ditolak');
  ok((await s('Judul sah', 'Isi sah')).ok, 'isian sah diterima');
}

console.log('\n--- Prestasi ---');
{
  const tahunIni = Number((await q('select extract(year from sigarda.hari_ini())::int y'))[0].y);
  let r = await sebagai(K.sekretaris.id, `select public.sg_prestasi_simpan(null, 'Juara 1 Tali-Temali', 'ranting', 'Juara 1', ${tahunIni}, 'Regu Putra', '', 'menunggu') as id`);
  ok(r.ok, 'Dewan mengajukan prestasi');
  const id = r.rows[0].id;
  r = await sebagai(K.pembina.id, `select public.sg_prestasi_tinjau(${id}, 'terbit', '') as x`);
  ok(r.ok, 'Pembina menyetujui prestasi');
  r = await sebagai(K.pembina.id, `select public.sg_prestasi_simpan(null, 'x', 'ranting', 'y', ${tahunIni + 1}, 'z', '', 'terbit') as id`);
  ok(cocok(r, /Tahun tidak sah/), 'tahun di masa depan ditolak');
  r = await sebagai(K.pembina.id, `select public.sg_prestasi_simpan(null, 'x', 'entah', 'y', ${tahunIni}, 'z', '', 'terbit') as id`);
  ok(cocok(r, /Tingkat prestasi tidak dikenal/), 'tingkat tidak dikenal ditolak');
  ok((await publik()).prestasi.some((p) => p.judul === 'Juara 1 Tali-Temali'), 'prestasi terbit muncul di sg_beranda_publik');
}

console.log('\n--- Galeri ---');
{
  let r = await sebagai(K.sekretaris.id, "select public.sg_galeri_simpan(null, 'Latihan Jumat', 'https://drive.google.com/x', '', 'latihan', 'menunggu') as id");
  ok(r.ok, 'Dewan mengajukan album');
  const id = r.rows[0].id;
  r = await sebagai(K.sekretaris.id, `select public.sg_galeri_tinjau(${id}, 'terbit', '') as x`);
  ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'Dewan tidak dapat meninjau album sendiri');
  r = await sebagai(K.pembina.id, `select public.sg_galeri_tinjau(${id}, 'terbit', '') as x`);
  ok(r.ok, 'Pembina menyetujui album');
  r = await sebagai(K.admin.id, "select public.sg_galeri_simpan(null, 'Tanpa tautan sah', 'bukan-url', '', 'lainnya', 'draf') as id");
  ok(cocok(r, /Tautan album harus diawali https/), 'tautan tidak sah ditolak');
  r = await sebagai(K.admin.id, "select public.sg_galeri_simpan(null, 'Kelompok aneh', 'https://drive.google.com/y', '', 'sabtu', 'draf') as id");
  ok(cocok(r, /Kelompok album tidak dikenal/), 'kelompok tidak dikenal ditolak');
  ok((await publik()).galeri.some((g) => g.judul === 'Latihan Jumat'), 'album terbit muncul di sg_beranda_publik');
}

console.log('\n--- Notifikasi pengajuan (Fase 3) ---');
{
  const notif = async (id) => q('select jenis, judul, isi, tautan from public.notifikasi where penerima_id = $1 and jenis = $2 order by id desc', [id, 'beranda']);
  let r = await sebagai(K.sekretaris.id, "select public.sg_prestasi_simpan(null, 'Notif prestasi', 'ranting', 'Juara 2', extract(year from sigarda.hari_ini())::int, 'Regu Putri', '', 'menunggu') as id");
  const idPrestasi = r.rows[0].id;
  ok((await notif(K.pembina.id))[0]?.judul === 'Pengajuan Prestasi baru', 'Pembina diberi tahu pengajuan Prestasi baru');
  ok((await notif(K.admin.id))[0]?.judul === 'Pengajuan Prestasi baru', 'Admin Gudep juga diberi tahu (bukan hanya Pembina)');
  ok(!(await notif(K.sekretaris.id)).some((n) => n.judul === 'Pengajuan Prestasi baru'), 'pengaju sendiri tidak menerima notifikasi pengajuannya sendiri');
  ok(!(await notif(K.dewan.id)).some((n) => n.judul === 'Pengajuan Prestasi baru'), 'pengurus lain (bukan Pembina/Admin) tidak ikut diberi tahu pengajuan');
  await sebagai(K.pembina.id, `select public.sg_prestasi_tinjau(${idPrestasi}, 'terbit', '') as x`);
  const tinjauSekretaris = (await q('select jenis, judul, isi from public.notifikasi where penerima_id = $1 and jenis = $2 order by id desc', [K.sekretaris.id, 'beranda']))[0];
  ok(tinjauSekretaris?.judul === 'Pengajuan Prestasi ditinjau' && /diterbitkan/.test(tinjauSekretaris.isi), 'pengaju diberi tahu prestasinya diterbitkan');

  r = await sebagai(K.sekretaris.id, "select public.sg_galeri_simpan(null, 'Notif galeri', 'https://drive.google.com/notif', '', 'latihan', 'menunggu') as id");
  const idGaleri = r.rows[0].id;
  await sebagai(K.pembina.id, `select public.sg_galeri_tinjau(${idGaleri}, 'ditolak', 'Tautan belum bisa dibuka') as x`);
  const tolakSekretaris = (await q('select judul, isi from public.notifikasi where penerima_id = $1 and jenis = $2 order by id desc', [K.sekretaris.id, 'beranda']))[0];
  ok(tolakSekretaris.judul === 'Pengajuan Galeri ditinjau' && /ditolak/.test(tolakSekretaris.isi) && !/Tautan belum bisa dibuka/.test(tolakSekretaris.isi), 'penolakan diberi tahu tanpa menyalin alasan ke isi singkat (alasan dilihat di aplikasi)');

  r = await sebagai(K.sekretaris.id, "select public.sg_berita_simpan(null, 'kegiatan', 'Notif berita ulang', '', 'Isi', '', 'menunggu', null) as id");
  const idUlang = r.rows[0].id;
  await sebagai(K.pembina.id, `select public.sg_berita_tinjau(${idUlang}, 'ditolak', 'Perlu revisi') as x`);
  await sebagai(K.sekretaris.id, `select public.sg_berita_simpan(${idUlang}, 'kegiatan', 'Notif berita ulang (revisi)', '', 'Isi baru', '', 'menunggu', null) as id`);
  const notifUlang = await notif(K.pembina.id);
  ok(notifUlang.filter((n) => n.judul === 'Pengajuan Berita baru').length >= 2, 'diajukan ulang sesudah ditolak: Pembina diberi tahu lagi (bukan dianggap notifikasi ganda)');
}

console.log('\n--- Media sosial (tanpa alur tinjauan) ---');
{
  let r = await sebagai(K.sekretaris.id, "select public.sg_sosial_simpan(null, 'instagram', 'https://instagram.com/x', 'Latihan perdana', '', true) as id");
  ok(r.ok, 'Dewan menempel kiriman, langsung tersimpan (tanpa status menunggu)');
  const id = r.rows[0].id;
  ok((await publik()).sosial.some((s) => s.tautan === 'https://instagram.com/x'), 'langsung tampil di sg_beranda_publik (tanpa tinjauan)');
  r = await sebagai(K.dewan.id, `select public.sg_sosial_simpan(${id}, 'instagram', 'https://instagram.com/y', '', '', true) as id`);
  ok(cocok(r, /Anda hanya dapat mengubah kiriman milik Anda sendiri/), 'pengurus lain (bukan Pembina/Admin) tidak dapat mengubah kiriman orang lain');
  r = await sebagai(K.pembina.id, `select public.sg_sosial_simpan(${id}, 'instagram', 'https://instagram.com/x', '', '', false) as id`);
  ok(r.ok, 'Pembina dapat menyembunyikan (tampil=false) kiriman siapa pun');
  ok(!(await publik()).sosial.some((s) => s.tautan === 'https://instagram.com/x'), 'kiriman disembunyikan tidak lagi tampil di publik');
  r = await sebagai(K.biasa.id, "select public.sg_sosial_simpan(null, 'entah', 'https://a.co', '', '', true) as id");
  ok(cocok(r, /Hanya pengurus|Platform tidak dikenal/), 'Penegak biasa ditolak sebelum sempat memvalidasi platform');
}

console.log('\n--- FAQ (hanya Pembina dan Admin Gudep) ---');
{
  let r = await sebagai(K.sekretaris.id, "select public.sg_faq_simpan(null, 'Pertanyaan?', 'Jawaban.') as id");
  ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'Dewan tidak dapat menulis FAQ sama sekali (tanpa alur mengajukan)');
  const buat = async (p, j) => (await sebagai(K.pembina.id, 'select public.sg_faq_simpan(null, $1, $2) as id', [p, j])).rows[0].id;
  const id1 = await buat('Pertanyaan satu', 'Jawaban satu');
  const id2 = await buat('Pertanyaan dua', 'Jawaban dua');
  const id3 = await buat('Pertanyaan tiga', 'Jawaban tiga');
  const urutan = async () => (await q('select id, urutan from public.beranda_faq order by urutan')).map((r) => r.id);
  ok(JSON.stringify(await urutan()) === JSON.stringify([id1, id2, id3]), 'urutan sesuai saat ditulis');
  await sebagai(K.pembina.id, `select public.sg_faq_geser(${id1}, 1) as x`); // turunkan id1
  ok(JSON.stringify(await urutan()) === JSON.stringify([id2, id1, id3]), 'geser turun menukar dengan tetangga bawah');
  await sebagai(K.pembina.id, `select public.sg_faq_geser(${id3}, 1) as x`); // di ujung bawah: tanpa efek
  ok(JSON.stringify(await urutan()) === JSON.stringify([id2, id1, id3]), 'geser di ujung bawah tidak melakukan apa pun');
  const rTolak = await sebagai(K.sekretaris.id, `select public.sg_faq_geser(${id1}, -1) as x`);
  ok(cocok(rTolak, /Hanya Pembina dan Admin Gudep/), 'Dewan tidak dapat mengubah urutan');
  const p = await publik();
  ok(p.faq.length === 3 && p.faq[0].pertanyaan === 'Pertanyaan dua', 'sg_beranda_publik mengembalikan FAQ sesuai urutan');
  await sebagai(K.pembina.id, `select public.sg_faq_hapus(${id2}) as x`);
  ok((await publik()).faq.length === 2, 'hapus FAQ mengurangi daftar publik');
}

console.log('\n--- Nama penulis berita (nama tampilan, bukan nama pengguna akun) ---');
{
  const nama = async (id) => (await q('select nama from public.profiles where id = $1', [id]))[0].nama;
  const pengguna = async (id) => (await q('select username from public.profiles where id = $1', [id]))[0]?.username ?? null;
  const rP = await sebagai(K.pembina.id, "select public.sg_berita_simpan(null, 'kegiatan', 'Berita Pembina', '', 'Isi', '', 'terbit', null) as id");
  const rD = await sebagai(K.sekretaris.id, "select public.sg_berita_simpan(null, 'kegiatan', 'Berita Dewan', '', 'Isi', '', 'menunggu', null) as id");
  await sebagai(K.pembina.id, `select public.sg_berita_tinjau(${rD.rows[0].id}, 'terbit', '') as x`);
  const pub = (await publik()).berita;
  const bP = pub.find((b) => b.judul === 'Berita Pembina'), bD = pub.find((b) => b.judul === 'Berita Dewan');
  ok(bP?.penulis === await nama(K.pembina.id) && bP.penulis.length > 0, 'berita Pembina: penulis = nama tampilan Pembina (' + bP?.penulis + ')');
  ok(bD?.penulis === await nama(K.sekretaris.id), 'berita Dewan yang disetujui Pembina: penulis tetap Dewan yang menulis, bukan peninjau (' + bD?.penulis + ')');
  const pengenal = await pengguna(K.pembina.id).catch(() => null);
  ok(!pengenal || bP.penulis !== pengenal, 'penulis bukan nama pengguna akun');
  await sebagai(K.pembina.id, `select public.sg_berita_simpan(${rD.rows[0].id}, 'kegiatan', 'Berita Dewan (diubah)', '', 'Isi', '', 'terbit', null) as id`);
  ok((await publik()).berita.find((b) => b.judul === 'Berita Dewan (diubah)')?.penulis === await nama(K.sekretaris.id), 'Pembina mengubah berita Dewan: penulis asli tidak berganti');
  const arsip = (await sebagai(null, 'select public.sg_berita_publik() as d')).rows[0].d;
  ok(arsip.find((b) => b.judul === 'Berita Pembina')?.penulis === bP.penulis, 'arsip publik (halaman berita statis) membawa penulis yang sama');
  ok(!/dibuat_oleh|dibuatOleh|ditinjau/.test(JSON.stringify(await publik())) && !JSON.stringify(arsip).includes(K.pembina.id), 'tetap tanpa id akun, peninjau, atau catatan tinjauan');
}

console.log('\n--- sg_beranda_publik: whitelist ketat (tidak membocorkan data internal) ---');
{
  await sebagai(K.pembina.id, "select public.sg_berita_simpan(null, 'kegiatan', 'RAHASIA-JUDUL', 'RAHASIA-RINGKASAN', 'RAHASIA-ISI', '', 'draf', null) as id");
  const teks = JSON.stringify(await publik());
  ok(!teks.includes('RAHASIA-JUDUL') && !teks.includes('RAHASIA-ISI'), 'berita berstatus draf TIDAK keluar ke publik');
  ok(!/dibuatOleh|catatanTinjauan|ditinjau/i.test(teks), 'tidak ada nama penulis, peninjau, atau catatan tinjauan di jawaban publik');
  const anon = await sebagai(null, "select public.sg_berita_simpan(null, 'kegiatan', 'x', '', 'y', '', 'draf', null) as id");
  ok(!anon.ok, 'anon tidak dapat memanggil sg_berita_simpan (dan fungsi tulis lain)');
}

console.log('\n--- Tanggal terbit berita (dipilih penulis) ---');
{
  await q('delete from public.beranda_berita');
  const hari = async (n) => (await q('select (sigarda.hari_ini() + $1::int)::text d', [n]))[0].d;
  const tglWib = async (id) => (await q("select to_char(terbit_pada at time zone 'Asia/Jakarta', 'YYYY-MM-DD') d, status from public.beranda_berita where id = $1", [id]))[0];
  const simpanB = (pelaku, judul, status, waktu, id = null) => sebagai(pelaku, "select public.sg_berita_simpan($4::bigint, 'kegiatan', $1, '', 'Isi', '', $2, $3::timestamptz) as id", [judul, status, waktu, id]);
  const lalu = await hari(-20), lebihLalu = await hari(-40);

  let r = await simpanB(K.pembina.id, 'Berita lama', 'terbit', `${lalu}T00:00:00+07:00`);
  const idLama = r.rows[0].id;
  ok(r.ok && (await tglWib(idLama)).d === lalu, 'Pembina menerbitkan berita dengan tanggal lampau (terlambat ditulis): terbit_pada = tanggal pilihan, bukan saat klik');
  r = await simpanB(K.pembina.id, 'Berita baru', 'terbit', null);
  ok(r.ok && (await tglWib(r.rows[0].id)).d === (await hari(0)), 'tanpa tanggal: berita terbit memakai saat ini (perilaku lama tetap)');
  ok((await publik()).berita.map((b) => b.judul).join() === 'Berita baru,Berita lama', 'beranda mengurutkan menurut tanggal terbit (yang baru dulu), bukan menurut kapan ditulis');
  r = await simpanB(K.pembina.id, 'Berita lama', 'terbit', `${lebihLalu}T00:00:00+07:00`, idLama);
  ok(r.ok && (await tglWib(idLama)).d === lebihLalu, 'mengubah berita terbit dapat mengganti tanggal terbitnya');

  r = await simpanB(K.sekretaris.id, 'Dewan telat menulis', 'menunggu', `${lalu}T00:00:00+07:00`);
  const idDewan = r.rows[0].id;
  ok(r.ok && (await tglWib(idDewan)).d === lalu && (await tglWib(idDewan)).status === 'menunggu', 'Dewan mengajukan dengan tanggal lampau: tanggal pilihan tersimpan sejak pengajuan');
  ok(!(await publik()).berita.some((b) => b.judul === 'Dewan telat menulis'), 'pengajuan yang belum disetujui tidak tampil, walau tanggalnya sudah lewat');
  r = await sebagai(K.pembina.id, `select public.sg_berita_tinjau(${idDewan}, 'terbit', '') as x`);
  ok(r.ok && (await tglWib(idDewan)).d === lalu && (await tglWib(idDewan)).status === 'terbit', 'Pembina menyetujui: berita terbit dengan tanggal pilihan Dewan, bukan tanggal persetujuan');
  ok((await publik()).berita.map((b) => b.judul).join() === 'Berita baru,Dewan telat menulis,Berita lama', 'urutan di beranda mengikuti tanggal terbit yang dipilih (Dewan telat menulis berada di antaranya)');

  r = await simpanB(K.sekretaris.id, 'Dewan tanpa tanggal', 'menunggu', null);
  const idTanpa = r.rows[0].id;
  await sebagai(K.pembina.id, `select public.sg_berita_tinjau(${idTanpa}, 'terbit', '') as x`);
  ok((await tglWib(idTanpa)).d === (await hari(0)), 'pengajuan tanpa tanggal: saat disetujui memakai saat persetujuan (perilaku lama tetap)');

  r = await simpanB(K.sekretaris.id, 'Dewan ditolak', 'menunggu', `${lalu}T00:00:00+07:00`);
  const idTolak = r.rows[0].id;
  await sebagai(K.pembina.id, `select public.sg_berita_tinjau(${idTolak}, 'ditolak', 'Foto belum ada') as x`);
  ok((await tglWib(idTolak)).status === 'ditolak' && (await tglWib(idTolak)).d === lalu, 'ditolak: tanggal pilihan penulis tetap tersimpan (muncul lagi saat diperbaiki)');

  r = await simpanB(K.sekretaris.id, 'Dewan terjadwal', 'draf', `${await hari(30)}T00:00:00+07:00`);
  ok(r.ok && (await tglWib(r.rows[0].id)).d === await hari(30), 'draf menyimpan tanggal pilihan (bahkan di masa depan)');

  console.log('  - Batas tanggal');
  const tolak = async (waktu, judul) => cocok(await simpanB(K.pembina.id, judul, 'draf', waktu), /Tanggal terbit tidak sah/);
  ok(await tolak(`${await hari(367)}T00:00:00+07:00`, 'lewat batas depan'), 'lebih dari 366 hari ke depan ditolak');
  ok((await simpanB(K.pembina.id, 'tepat batas depan', 'draf', `${await hari(366)}T00:00:00+07:00`)).ok, 'tepat 366 hari ke depan diterima');
  ok(await tolak('2014-12-31T00:00:00+07:00', 'sebelum 2015'), 'sebelum 2015 ditolak');
  ok((await simpanB(K.pembina.id, 'tepat 2015', 'draf', '2015-01-01T00:00:00+07:00')).ok, 'tepat 1 Januari 2015 diterima');
}

console.log('\n--- sg_berita_lagi: berita lebih lama (tombol "Muat berita lebih lama") ---');
{
  await q('delete from public.beranda_berita');
  const simpan = (judul, status, waktu) => sebagai(K.pembina.id, "select public.sg_berita_simpan(null, 'kegiatan', $1, 'ringkas', $2, '', $3, $4::timestamptz) as id", [judul, `Isi ${judul}`, status, waktu]);
  // 14 berita terbit dengan waktu terbit menurun (B1 terbaru ... B14 terlama), 1 draf, 1 terjadwal di masa depan
  for (let i = 1; i <= 14; i++) await simpan(`B${i}`, 'terbit', `2026-08-${String(30 - i).padStart(2, '0')} 08:00:00+07`);
  await simpan('DRAF-RAHASIA', 'draf', null);
  await simpan('JADWAL-DEPAN', 'terbit', new Date(Date.now() + 200 * 864e5).toISOString());
  const lagi = async (n) => (await sebagai(null, 'select public.sg_berita_lagi($1) as d', [n]));
  const judul = (r) => r.rows[0].d.berita.map((b) => b.judul);

  ok((await publik()).berita.map((b) => b.judul).join() === 'B1,B2,B3,B4,B5,B6', 'prasyarat: beranda memuat 6 terbaru (B1..B6), tanpa draf dan tanpa yang terjadwal');
  let r = await lagi(6);
  ok(r.ok && judul(r).join() === 'B7,B8,B9,B10,B11,B12' && r.rows[0].d.adaLagi === true, 'anon (tanpa login): sesudah 6 yang tampil, datang B7..B12 dan adaLagi = true');
  r = await lagi(12);
  ok(judul(r).join() === 'B13,B14' && r.rows[0].d.adaLagi === false, 'gelombang terakhir: hanya sisa B13..B14 dan adaLagi = false');
  r = await lagi(14);
  ok(judul(r).length === 0 && r.rows[0].d.adaLagi === false, 'sudah habis: larik kosong dan adaLagi = false');
  r = await lagi(8);
  ok(judul(r).join() === 'B9,B10,B11,B12,B13,B14' && r.rows[0].d.adaLagi === false, 'tepat 6 tersisa: adaLagi = false (berita ke-7 tidak ada, jadi tombol hilang)');
  r = await lagi(null);
  ok(judul(r).join() === 'B1,B2,B3,B4,B5,B6' && r.rows[0].d.adaLagi === true, 'p_lewati kosong dianggap 0');
  r = await lagi(-5);
  ok(judul(r).join() === 'B1,B2,B3,B4,B5,B6', 'p_lewati negatif dianggap 0');
  r = await lagi(999999);
  ok(r.ok && judul(r).length === 0 && r.rows[0].d.adaLagi === false, 'p_lewati sangat besar dibatasi (tidak galat, tidak memindai tanpa batas)');
  const semua = JSON.stringify([await lagi(0), await lagi(6), await lagi(12)].map((x) => x.rows[0].d));
  ok(!semua.includes('DRAF-RAHASIA') && !semua.includes('JADWAL-DEPAN'), 'draf dan berita terjadwal (belum waktunya) tidak pernah keluar');
  ok((await lagi(0)).rows[0].d.berita.every((b) => Object.keys(b).sort().join() === 'isi,judul,kategori,penulis,ringkasan,sampulUrl,terbitPada'), 'hanya kolom yang diizinkan (nama penulis ikut; tanpa id, peninjau, catatan tinjauan)');
  ok((await lagi(0)).rows[0].d.berita[0].isi === 'Isi B1', 'isi lengkap ikut dikirim (untuk "Baca selengkapnya")');
  const dijalankanAnon = await sebagai(null, 'select public.sg_berita_lagi(0) as d');
  ok(dijalankanAnon.ok, 'anon boleh memanggil sg_berita_lagi (hanya membaca)');
}

console.log('\n--- Cadangan ---');
{
  const c = (await sebagai(K.admin.id, 'select public.sg_cadangan_admin() as d')).rows[0].d;
  for (const t of ['beranda_berita', 'beranda_prestasi', 'beranda_galeri', 'beranda_sosial', 'beranda_faq']) {
    ok(Array.isArray(c.tabel[t]) && c.tabel[t].length > 0, `cadangan memuat tabel ${t} (${c.tabel[t]?.length ?? 0} baris)`);
  }
}

console.log(`\nRINGKASAN BERANDA-KONTEN: ${lulus} lulus, ${gagal} GAGAL.`);
await pg.close();
if (gagal) process.exit(1);
