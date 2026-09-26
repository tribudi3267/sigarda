// Tahap 4: Perlindungan anggota / Safe From Harm (Jukran Kwarnas 004/2021) di server dan klien (PGlite): hak, validasi, koreksi, hapus, RLS baca, pemicu tak aktif, kategori Periksa Data
// 'sfhBelum', penerima laporan gugus depan, cadangan, dan cermin klien (periksaCatatSfh, periksaGudepSfh) yang DIBANDINGKAN LANGSUNG dengan SQL pada kisi masukan. Migrasi: uji/migrasi-perlindungan-anggota.mjs.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { susunSfh } from '../src/lib/mapDb.js';
import { GUDEP_SFH_KOSONG, JENIS_SFH, anggotaSfh, gudepSfhTerisi, jenisWajib, jumlahKurangSfh, periksaCatatSfh, periksaGudepSfh, peranSfh, statusSfh, susunGudepSfh, teksWaLengkapiSfh } from '../src/lib/perlindunganLogic.js';
import { KATEGORI_PEMERIKSAAN, jumlahKategori, tabPerbaikan } from '../src/lib/pemeriksaanLogic.js';

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
const siti = (await masuk('10232', PIN_DEMO.penegak)).id;
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const cocok = (r, re) => !r.ok && re.test(r.pesan ?? '');
const hari = (await q('select sigarda.hari_ini()::text d'))[0].d;
const geser = async (n) => (await q(`select (sigarda.hari_ini() + $1::int)::text d`, [n]))[0].d;
const catat = (id, anggota, jenis, tgl, url = '', cat = '') => sebagai(id, 'select public.sg_sfh_catat($1::uuid, $2, $3::date, $4, $5)', [anggota, jenis, tgl, url, cat]);
const baris = () => q('select p.username, s.jenis, s.tanggal::text, s.bukti_url, s.catatan from public.sfh_catatan s join public.profiles p on p.id = s.anggota_id order by 1, 2');
const tampilan = async (id) => { const p = (await q('select role, jabatan, status from public.profiles where id = $1', [id]))[0]; return { id, role: p.role, jabatan: p.jabatan, status: p.status }; };

console.log('--- Logika murni ---');
{
  const pb = { id: 'p', role: 'penguji', jabatan: 'Pembina', status: 'aktif', nama: 'Bu Pembina' };
  const ad = { id: 'a', role: 'admin', status: 'aktif', nama: 'Admin' };
  const dw = { id: 'd', role: 'penguji', jabatan: 'Dewan Ambalan', status: 'aktif', nama: 'Dewan' };
  const pe = { id: 'e', role: 'peserta', status: 'aktif', nama: 'Penegak' };
  ok(peranSfh(pb) === 'Pembina' && peranSfh(ad) === 'Admin Gudep' && peranSfh(dw) === null && peranSfh(pe) === null, 'peranSfh: hanya Pembina dan Admin Gudep');
  ok(jenisWajib(pb).length === 3 && jenisWajib(ad).map((j) => j.id).join() === 'pelatihan' && jenisWajib(dw).length === 0 && jenisWajib(pe).length === 0, 'jenisWajib: Pembina tiga jenis, Admin hanya pelatihan, lainnya tidak ada');
  const daftar = anggotaSfh([ad, pe, dw, { ...pb, id: 'p2', nama: 'Aan', status: 'nonaktif' }, pb]);
  ok(daftar.map((u) => u.id).join() === 'p,a', 'anggotaSfh: hanya dewasa aktif, Pembina dulu lalu Admin');
  const cs = [{ id: 1, anggotaId: 'p', jenis: 'pelatihan', tanggal: '2026-01-01' }, { id: 2, anggotaId: 'x', jenis: 'rekam_jejak', tanggal: '2026-01-01' }];
  ok(statusSfh(cs, pb).filter((s) => s.catatan).length === 1 && jumlahKurangSfh(cs, pb) === 2 && jumlahKurangSfh(cs, ad) === 1 && jumlahKurangSfh(cs, pe) === 0, 'statusSfh dan jumlahKurangSfh menghitung menurut anggota');
  ok(JSON.stringify(susunGudepSfh(null)) === JSON.stringify(GUDEP_SFH_KOSONG) && JSON.stringify(susunGudepSfh([1])) === JSON.stringify(GUDEP_SFH_KOSONG) && susunGudepSfh({ penerima: 'X', kontak: 5 }).kontak === '', 'susunGudepSfh: bentuk rusak = kosong');
  ok(!gudepSfhTerisi(GUDEP_SFH_KOSONG) && !gudepSfhTerisi({ penerima: '  ' }) && gudepSfhTerisi({ penerima: 'Ka. Mabigus' }), 'gudepSfhTerisi: minimal penerima');
  ok(/Halo Ani/.test(teksWaLengkapiSfh('Ani', ['pelatihan'])) && /pelatihan/.test(teksWaLengkapiSfh('Ani', ['pelatihan'])), 'teksWaLengkapiSfh memuat nama dan yang kurang');
  ok(JENIS_SFH.every((j) => /^Pasal/.test(j.pasal)), 'tiap jenis menyebut pasal');
}

console.log('\n--- Pencatatan: hak dan validasi ---');
const pembinaId = K.pembina.id, adminId = K.admin.id, dewanId = K.dewan.id;
let r = await catat(siti, pembinaId, 'pelatihan', '2026-01-10');
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'Penegak tidak dapat mencatat');
r = await catat(dewanId, pembinaId, 'pelatihan', '2026-01-10');
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'akun Dewan lama tidak dapat mencatat');
r = await catat(pembinaId, pembinaId, 'lain', '2026-01-10');
ok(cocok(r, /Jenis catatan harus/), 'jenis tak dikenal ditolak');
r = await catat(pembinaId, siti, 'pelatihan', '2026-01-10');
ok(cocok(r, /hanya untuk anggota dewasa aktif/), 'Penegak bukan sasaran catatan');
r = await catat(pembinaId, dewanId, 'pelatihan', '2026-01-10');
ok(cocok(r, /hanya untuk anggota dewasa aktif/), 'akun Dewan lama bukan sasaran catatan');
r = await catat(pembinaId, adminId, 'pakta_integritas', '2026-01-10');
ok(cocok(r, /Admin Gudep hanya dicatat untuk pelatihan/), 'Admin hanya untuk pelatihan');
r = await catat(pembinaId, pembinaId, 'pelatihan', '2014-12-31');
ok(cocok(r, /sebelum tahun 2015/), 'sebelum 2015 ditolak');
r = await catat(pembinaId, pembinaId, 'pelatihan', await geser(1));
ok(cocok(r, /masa depan/), 'masa depan ditolak');
r = await catat(pembinaId, pembinaId, 'pelatihan', '2026-01-10', 'ftp://x.id/a');
ok(cocok(r, /berawalan http/), 'tautan bukan http(s) ditolak');
r = await catat(pembinaId, pembinaId, 'pelatihan', '2026-01-10', 'https://x.id/a b');
ok(cocok(r, /berawalan http/), 'tautan dengan spasi ditolak');
r = await catat(pembinaId, pembinaId, 'pelatihan', '2026-01-10', '', 'a'.repeat(201));
ok(cocok(r, /Catatan maksimal 200/), 'catatan terlalu panjang ditolak');
ok((await baris()).length === 0, 'tidak ada baris dari isian yang ditolak');
r = await catat(pembinaId, pembinaId, 'pelatihan', '2026-01-10', 'https://drive.google.com/x', 'Pelatihan Kwarcab');
ok(r.ok, 'Pembina mencatat pelatihan miliknya ' + (r.pesan ?? ''));
r = await catat(adminId, pembinaId, 'pakta_integritas', '2026-02-01');
ok(r.ok, 'Admin mencatat pakta integritas Pembina');
r = await catat(adminId, adminId, 'pelatihan', '2026-03-01');
ok(r.ok, 'Admin mencatat pelatihan miliknya');
r = await catat(adminId, pembinaId, 'pelatihan', '2026-01-20', '', '  koreksi  tanggal ');
ok(r.ok && (await baris()).length === 3, 'mencatat ulang = koreksi (jumlah baris tetap)');
const b1 = (await baris()).find((x) => x.username === 'pembina' && x.jenis === 'pelatihan');
ok(b1.tanggal === '2026-01-20' && b1.catatan === 'koreksi tanggal' && b1.bukti_url === '', 'koreksi mengganti tanggal, merapikan catatan, dan mengosongkan tautan');
ok((await q(`select dicatat_oleh = $1 as o from public.sfh_catatan where anggota_id = $2 and jenis = 'pelatihan'`, [adminId, pembinaId]))[0].o, 'pencatat terakhir tersimpan');

console.log('\n--- RLS baca ---');
r = await sebagai(siti, 'select 1 from public.sfh_catatan');
ok(r.ok && r.rows.length === 0, 'Penegak tidak melihat catatan orang dewasa');
r = await sebagai(dewanId, 'select 1 from public.sfh_catatan');
ok(r.ok && r.rows.length === 0, 'akun Dewan lama tidak melihat catatan');
r = await sebagai(pembinaId, 'select 1 from public.sfh_catatan');
ok(r.ok && r.rows.length === 3, 'Pembina melihat semua catatan');
r = await sebagai(adminId, 'select 1 from public.sfh_catatan');
ok(r.ok && r.rows.length === 3, 'Admin melihat semua catatan');
r = await sebagai(pembinaId, `insert into public.sfh_catatan (anggota_id, jenis, tanggal) values ($1, 'rekam_jejak', '2026-01-01')`, [pembinaId]);
ok(!r.ok, 'klien tidak dapat menulis langsung ke tabel');
r = await K.pembina.a.muatSfh();
ok(r.ok && r.data.catatan.length === 3 && r.data.gudep === null && r.data.catatan[0].anggotaId && r.data.catatan[0].jenis, 'api().muatSfh memetakan catatan dan gudep kosong');
ok(susunSfh([{ id: 1, anggota_id: 'a', jenis: 'pelatihan', tanggal: '2026-01-01', bukti_url: '', catatan: '', dicatat_pada: '2026-01-01T00:00:00Z' }])[0].anggotaId === 'a', 'susunSfh memetakan kolom');

console.log('\n--- Periksa Data: sfhBelum ---');
r = await sebagai(pembinaId, 'select public.sg_pemeriksaan_data() as d');
let sb = r.rows[0].d.sfhBelum;
ok(r.ok && Array.isArray(sb) && sb.length === 1 && sb[0].nama && sb[0].peran === 'Pembina' && sb[0].kurang.join() === 'rekam_jejak', 'Pembina masih kurang rekam_jejak; Admin sudah lengkap (pelatihan saja)');
r = await catat(pembinaId, pembinaId, 'rekam_jejak', '2026-02-02');
r = await sebagai(pembinaId, 'select public.sg_pemeriksaan_data() as d');
ok(r.rows[0].d.sfhBelum.length === 0, 'lengkap: kategori kosong');
await q(`delete from public.sfh_catatan where anggota_id = $1 and jenis = 'pelatihan'`, [adminId]);
r = await sebagai(pembinaId, 'select public.sg_pemeriksaan_data() as d');
sb = r.rows[0].d.sfhBelum;
ok(sb.length === 1 && sb[0].peran === 'Admin Gudep' && sb[0].kurang.join() === 'pelatihan', 'Admin tanpa pelatihan tampil dengan kurang = pelatihan');
const kat = KATEGORI_PEMERIKSAAN.find((k) => k.kunci === 'sfhBelum');
ok(kat && jumlahKategori(r.rows[0].d, 'sfhBelum') === 1 && tabPerbaikan(kat, { role: 'admin' }) && tabPerbaikan(kat, { role: 'penguji', jabatan: 'Pembina' }), 'kategori sfhBelum ada pada susunan klien dengan tautan perbaikan');

console.log('\n--- Hapus ---');
const idHapus = (await q(`select id from public.sfh_catatan where jenis = 'rekam_jejak'`))[0].id;
r = await sebagai(siti, 'select public.sg_sfh_hapus($1::bigint)', [idHapus]);
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'Penegak tidak dapat menghapus');
r = await sebagai(dewanId, 'select public.sg_sfh_hapus($1::bigint)', [idHapus]);
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'akun Dewan lama tidak dapat menghapus');
r = await K.admin.a.hapusSfh(idHapus);
ok(r.ok && (await baris()).every((x) => x.jenis !== 'rekam_jejak'), 'Admin menghapus catatan');
r = await K.pembina.a.hapusSfh(idHapus);
ok(r.ok, 'menghapus yang sudah tidak ada tidak galat');

console.log('\n--- Penerima laporan gugus depan ---');
const gd = (id, nilai) => sebagai(id, 'select public.sg_sfh_gudep_simpan($1::jsonb)', [JSON.stringify(nilai)]);
const sahGd = { penerima: 'Ka. Mabigus dan Pembina', kontak: '0812-0000-0000', prosedurUrl: 'https://drive.google.com/prosedur', catatan: 'Setiap hari sekolah' };
r = await gd(siti, sahGd);
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'Penegak tidak dapat mengubah penerima laporan');
r = await gd(dewanId, sahGd);
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'akun Dewan lama tidak dapat mengubah penerima laporan');
r = await gd(pembinaId, { ...sahGd, lain: 'x' });
ok(cocok(r, /Bentuk isian tidak sah/), 'kunci tambahan ditolak');
r = await gd(pembinaId, { penerima: 'X' });
ok(cocok(r, /harus berupa teks/), 'kunci hilang ditolak (bukan galat basis data)');
r = await gd(pembinaId, { ...sahGd, penerima: 'a'.repeat(121) });
ok(cocok(r, /terlalu panjang/), 'penerima terlalu panjang ditolak');
r = await gd(pembinaId, sahGd);
ok(r.ok, 'Pembina menyimpan penerima laporan ' + (r.pesan ?? ''));
r = await sebagai(siti, `select nilai from public.pengaturan where kunci = 'perlindungan.gudep'`);
ok(r.ok && r.rows[0]?.nilai?.penerima === 'Ka. Mabigus dan Pembina', 'Penegak membaca penerima laporan (agar tahu kepada siapa melapor)');
r = await K.admin.a.simpanGudepSfh({ ...sahGd, kontak: '  a   b ' });
ok(r.ok, 'api().simpanGudepSfh oleh Admin');
r = await K.admin.a.muatSfh();
ok(r.ok && susunGudepSfh(r.data.gudep).kontak === 'a b' && gudepSfhTerisi(susunGudepSfh(r.data.gudep)), 'nilai dirapikan dan terbaca lewat api().muatSfh');

console.log('\n--- Tak aktif dan cadangan ---');
r = await sebagai(adminId, 'select public.sg_cadangan_admin() as d');
const cad = r.rows?.[0]?.d;
ok(r.ok && Array.isArray((cad.data ?? cad.tabel ?? cad).sfh_catatan) && (cad.data ?? cad.tabel ?? cad).sfh_catatan.length === (await baris()).length, 'cadangan data memuat sfh_catatan');
await q(`update public.profiles set status = 'nonaktif' where id = $1`, [pembinaId]);
r = await catat(adminId, pembinaId, 'rekam_jejak', '2026-02-02');
ok(cocok(r, /hanya untuk anggota dewasa aktif/), 'anggota nonaktif tidak dapat dicatat');
r = await sebagai(adminId, 'select public.sg_pemeriksaan_data() as d');
ok(!r.rows[0].d.sfhBelum.some((x) => x.id === pembinaId), 'anggota nonaktif tidak masuk daftar sfhBelum');
await q(`update public.profiles set status = 'aktif' where id = $1`, [pembinaId]);

console.log('\n--- Cermin klien = SQL (kisi masukan) ---');
{
  const pb = await tampilan(pembinaId), ad = await tampilan(adminId), dw = await tampilan(dewanId), pe = await tampilan(siti);
  const anggotaKisi = [['pembina', pb], ['admin', ad], ['dewan', dw], ['penegak', pe]];
  const jenisKisi = ['pelatihan', 'pakta_integritas', 'rekam_jejak', 'lain'];
  const tglKisi = ['2026-01-10', '2014-12-31', '2015-01-01', await geser(1), hari, null, 'bukan'];
  const urlKisi = ['', 'https://x.id/a', 'http://x.id', 'ftp://x.id', 'x.id', 'https://x.id/a b', 'https://' + 'a'.repeat(500)];
  const catKisi = ['', 'ok', 'a'.repeat(200), 'a'.repeat(201), 'a<b', 'a\u0001b'];
  let n = 0, beda = 0;
  const uji = async (nama, anggota, jenis, tanggal, url, cat) => {
    n++;
    const klien = periksaCatatSfh({ anggota, jenis, tanggal, buktiUrl: url, catatan: cat, hari });
    if (tanggal === 'bukan') return; // SQL menolak tipe date sebelum fungsi berjalan
    const s = await sebagai(adminId, 'select public.sg_sfh_catat($1::uuid, $2, $3::date, $4, $5)', [anggota.id, jenis, tanggal, url, cat]);
    const okSql = s.ok;
    const okKlien = klien === '';
    if (okSql !== okKlien || (!okSql && !s.pesan.includes(klien))) { beda++; console.log('  beda:', nama, jenis, tanggal, url.slice(0, 30), JSON.stringify(cat).slice(0, 20), '| klien:', klien || 'sah', '| sql:', okSql ? 'sah' : s.pesan); }
  };
  for (const [nama, a] of anggotaKisi) for (const j of jenisKisi) for (const t of tglKisi) await uji(nama, a, j, t, '', '');
  for (const u of urlKisi) await uji('pembina', pb, 'pelatihan', '2026-01-10', u, '');
  for (const c of catKisi) await uji('pembina', pb, 'pelatihan', '2026-01-10', '', c);
  ok(beda === 0, `periksaCatatSfh sama dengan sg_sfh_catat pada ${n} masukan`);
  const nonaktif = { ...pb, status: 'nonaktif' };
  ok(periksaCatatSfh({ anggota: nonaktif, jenis: 'pelatihan', tanggal: '2026-01-10', hari }) !== '', 'periksaCatatSfh menolak anggota nonaktif');

  const gdKisi = [
    sahGd, { ...sahGd, penerima: '' }, { ...sahGd, penerima: 'a'.repeat(120) }, { ...sahGd, penerima: 'a'.repeat(121) }, { ...sahGd, kontak: 'a'.repeat(81) }, { ...sahGd, catatan: 'a'.repeat(301) },
    { ...sahGd, prosedurUrl: '' }, { ...sahGd, prosedurUrl: 'ftp://x' }, { ...sahGd, prosedurUrl: 'https://x.id/a b' }, { ...sahGd, prosedurUrl: 'https://' + 'a'.repeat(500) },
    { ...sahGd, penerima: 'a<b' }, { ...sahGd, kontak: 'a\u0001b' }, { ...sahGd, lain: 'x' }, { penerima: 'X' }, { ...sahGd, kontak: 5 }, { ...sahGd, catatan: null }, {}, [], 'teks',
  ];
  let m = 0, bedaG = 0;
  for (const v of gdKisi) {
    m++;
    const klien = periksaGudepSfh(v);
    const s = await gd(adminId, v);
    if (s.ok !== (klien === '') || (!s.ok && !s.pesan.includes(klien))) { bedaG++; console.log('  beda:', JSON.stringify(v).slice(0, 60), '| klien:', klien || 'sah', '| sql:', s.ok ? 'sah' : s.pesan); }
  }
  ok(bedaG === 0, `periksaGudepSfh sama dengan sg_sfh_gudep_simpan pada ${m} masukan`);
}

console.log(`\nRINGKASAN PERLINDUNGAN: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
