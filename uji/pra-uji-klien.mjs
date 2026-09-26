// Fase D: pra-uji di klien. Logika murni (jalur per butir, menu, uji resmi hanya Pembina) dibandingkan dengan keadaan nyata di server (PGlite) lewat
// lapisan api yang sama dengan aplikasi: sakelar, pengajuan, antrian penilai, keputusan, melewati tahap, dan jalur yang tampil pada tiap langkah.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { tahunAjaranKini } from '../src/lib/rombelLogic.js';
import { butirMenungguPra, hariMenunggu, jalurPraUji, jalurTahap, menuPraUjiTampil, namaTahap, penilaiPraUji, teksPosisiPraUji, ujiResmiTampil } from '../src/lib/praUjiLogic.js';
import { tujuanNotifikasi } from '../src/lib/notifikasiLogic.js';
import { KonteksApp } from '../src/context/AppContext.jsx';
import JalurPraUji from '../src/components/JalurPraUji.jsx';
import PraUji from '../src/pages/PraUji.jsx';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const keadaan = (j) => j.langkah.map((l) => l.keadaan).join();

console.log('--- Logika murni: jalur per butir ---');
{
  const b = (id, tahap, status, extra = {}) => ({ id, pesertaId: 'p', skuId: 'BAN-01', tahap, status, penilaiNama: extra.oleh ?? null, catatan: extra.catatan ?? '' });
  ok(jalurPraUji([], 'belum', 'Bantara') === null, 'tanpa baris: tidak ada jalur');
  ok(jalurPraUji([b(1, 'pinsa', 'lulus'), b(2, 'bina_damping', 'lulus')], 'ulang', 'Bantara') === null, 'sesudah Pembina "ulang": jalur lama tidak ditampilkan');
  let j = jalurPraUji([b(1, 'pinsa', 'menunggu')], 'belum', 'Bantara');
  ok(j.menunggu.tahap === 'pinsa' && keadaan(j) === 'menunggu,nanti,nanti' && teksPosisiPraUji(j) === 'Menunggu pra-uji Pinsa', 'menunggu Pinsa: Pinsa menunggu, tahap lain berikutnya');
  j = jalurPraUji([b(1, 'pinsa', 'lulus', { oleh: 'Siti' }), b(2, 'bina_damping', 'menunggu')], 'belum', 'Bantara');
  ok(keadaan(j) === 'lulus,menunggu,nanti' && j.langkah[0].oleh === 'Siti', 'menunggu Bina Damping sesudah Pinsa lulus (nama penilai tampil)');
  j = jalurPraUji([b(1, 'pinsa', 'lulus'), b(2, 'bina_damping', 'lulus')], 'diajukan', 'Bantara');
  ok(keadaan(j) === 'lulus,lulus,menunggu' && teksPosisiPraUji(j) === 'Lulus pra-uji, menunggu uji resmi Pembina', 'lulus semua tahap: menunggu uji resmi Pembina');
  j = jalurPraUji([b(1, 'pinsa', 'lulus'), b(2, 'bina_damping', 'lulus')], 'proses', 'Bantara');
  ok(j.langkah[2].keadaan === 'diuji' && teksPosisiPraUji(j) === 'Sedang diuji Pembina', 'Pembina mulai menguji: langkah terakhir "diuji"');
  j = jalurPraUji([b(1, 'bina_damping', 'menunggu')], 'belum', 'Bantara');
  ok(keadaan(j) === 'tanpa-penilai,menunggu,nanti', 'tahap tanpa penilai (mis. Pinsa melewati tahapnya sendiri): tanda "tanpa penilai"');
  j = jalurPraUji([b(1, 'bina_damping', 'dilewati')], 'diajukan', 'Bantara');
  ok(keadaan(j) === 'tanpa-penilai,dilewati,menunggu', 'dilewati Pembina tampil sebagai "dilewati"');
  j = jalurPraUji([b(1, 'pinsa', 'belum', { catatan: 'hafalkan lagi', oleh: 'Siti' })], 'belum', 'Bantara');
  ok(j.belum?.catatan === 'hafalkan lagi' && j.langkah.length === 0 && teksPosisiPraUji(j) === 'Belum lulus pra-uji Pinsa', 'belum lulus: catatan perbaikan tersedia');
  j = jalurPraUji([b(1, 'pinsa', 'belum', { catatan: 'x' }), b(2, 'pinsa', 'menunggu')], 'belum', 'Bantara');
  ok(j.belum === null && j.menunggu.id === 2 && j.langkah[0].keadaan === 'menunggu', 'mengajukan ulang memulai jalur dari awal (percobaan lama diabaikan)');
  j = jalurPraUji([b(1, 'bina_damping', 'menunggu')], 'belum', 'Laksana');
  ok(j.langkah.map((l) => l.tahap).join() === 'bina_damping,pembina' && keadaan(j) === 'menunggu,nanti', 'jalur Laksana tanpa tahap Pinsa');
  ok(jalurTahap('Bantara').join() === 'pinsa,bina_damping,pembina' && jalurTahap('Laksana').join() === 'bina_damping,pembina', 'urutan tahap nominal');
  ok(namaTahap('bina_damping') === 'Bina Damping' && hariMenunggu('2026-09-20T00:00:00Z', Date.parse('2026-09-24T12:00:00Z')) === 4 && hariMenunggu(null) === 0, 'nama tahap dan lama menunggu');
}

console.log('\n--- Logika murni: butir menunggu pra-uji di Beranda ---');
{
  const e = (id, status) => ({ poin: { id, tingkat: 'Bantara' }, entry: { status } });
  const r = (id, skuId, status, jadwal) => ({ id, skuId, status, jadwal, tahap: 'pinsa' });
  const hasil = butirMenungguPra([e('A', 'belum'), e('B', 'ulang'), e('C', 'diajukan'), e('D', 'lulus'), e('E', 'belum')],
    [r(1, 'A', 'menunggu', '2030-02-01'), r(2, 'B', 'menunggu', '2030-01-05'), r(3, 'C', 'menunggu', '2030-01-01'), r(4, 'D', 'menunggu', '2030-01-01'), r(5, 'E', 'lulus', '2030-01-01')]);
  ok(hasil.map((x) => x.poin.id).join() === 'B,A', 'hanya butir yang menunggu pra-uji dan belum diajukan/lulus, jadwal terdekat dulu');
  ok(butirMenungguPra([], []).length === 0 && butirMenungguPra([e('A', 'belum')], []).length === 0, 'tanpa baris pra-uji: kosong');
}

console.log('\n--- Logika murni: menu dan uji resmi ---');
{
  const pembina = { role: 'penguji', jabatan: 'Pembina' }, admin = { role: 'admin' };
  const dewanTampilan = { role: 'penguji', jabatan: 'Dewan Ambalan', peranAsli: 'peserta', jabatanDewan: 'Sekretaris' };
  const penegak = { role: 'peserta' };
  const pinsa = { binaDamping: [], pinsa: true }, bd = { binaDamping: ['X-01'], pinsa: false }, biasa = { binaDamping: [], pinsa: false };
  ok(menuPraUjiTampil(pembina, biasa, false) && menuPraUjiTampil(admin, biasa, false), 'Pembina dan Admin melihat menu Pra-uji selalu (sakelar ada di sana)');
  ok(!menuPraUjiTampil(penegak, pinsa, false) && menuPraUjiTampil(penegak, pinsa, true) && menuPraUjiTampil(penegak, bd, true) && !menuPraUjiTampil(penegak, biasa, true), 'Penegak: hanya Pinsa atau Bina Damping dan hanya bila pra-uji hidup');
  ok(menuPraUjiTampil(dewanTampilan, bd, true) && !menuPraUjiTampil(dewanTampilan, biasa, true), 'tampilan Dewan mengikuti peran pendampingan');
  ok(penilaiPraUji(pinsa) && penilaiPraUji(bd) && !penilaiPraUji(biasa) && !penilaiPraUji(null), 'penilaiPraUji');
  ok(ujiResmiTampil(pembina, true) && ujiResmiTampil(dewanTampilan, false) && !ujiResmiTampil(dewanTampilan, true) && !ujiResmiTampil(penegak, true), 'uji resmi (Antrian, Sesi ujian): Dewan hanya bila pra-uji mati');
  ok(tujuanNotifikasi({ jenis: 'pra_uji', tautan: { tab: 'antrian' } }, ['antrian', 'pra-uji']) === 'pra-uji' && tujuanNotifikasi({ jenis: 'ajukan', tautan: { tab: 'antrian' } }, ['antrian', 'pra-uji']) === 'antrian' && tujuanNotifikasi({ jenis: 'pra_uji', tautan: { tab: 'pra-uji' } }, ['sku']) === null,
    'notifikasi pra-uji tanpa penilai ke Pembina membuka menu Pra-uji; jenis lain tetap');
}

console.log('\n--- Tampilan (render tanpa peramban) ---');
{
  const b = (id, tahap, status, extra = {}) => ({ id, pesertaId: 'p', skuId: 'BAN-01', tahap, status, penilaiNama: extra.oleh ?? null, catatan: extra.catatan ?? '' });
  ok(renderToStaticMarkup(h(JalurPraUji, { jalur: null })) === '', 'tanpa jalur tidak menampilkan apa pun');
  const menunggu = renderToStaticMarkup(h(JalurPraUji, { jalur: jalurPraUji([b(1, 'pinsa', 'lulus', { oleh: 'Siti' }), b(2, 'bina_damping', 'menunggu')], 'belum', 'Bantara') }));
  ok(menunggu.includes('Menunggu pra-uji Bina Damping') && menunggu.includes('Pinsa') && menunggu.includes('(Siti)') && menunggu.includes('berikutnya'), 'jalur menunggu: posisi, langkah, dan nama penilai tampil');
  const belum = renderToStaticMarkup(h(JalurPraUji, { jalur: jalurPraUji([b(1, 'pinsa', 'belum', { catatan: 'hafalkan lagi', oleh: 'Siti' })], 'belum', 'Bantara') }));
  ok(belum.includes('Belum lulus pra-uji Pinsa') && belum.includes('hafalkan lagi') && belum.includes('ajukan uji lagi'), 'jalur belum lulus: catatan perbaikan dan petunjuk mengajukan lagi');
  const users = [{ id: 'pb', role: 'penguji', jabatan: 'Pembina', nama: 'Pak Pembina', status: 'aktif' }];
  const tampil = (nilai) => renderToStaticMarkup(h(KonteksApp.Provider, { value: { users, notify: () => {}, muatAntrianPraUji: async () => ({ ok: true, data: { aktif: true, menunggu: [], selesai: [] } }), muatPraUjiMenunggu: async () => ({ ok: true, data: [] }), aturSakelarPraUji: async () => ({ ok: true }), ...nilai } }, h(PraUji)));
  const pembina = { role: 'penguji', jabatan: 'Pembina', id: 'pb' };
  const mati = tampil({ user: pembina, pendampingan: { binaDamping: [], pinsa: false }, praUjiAktif: false });
  ok(mati.includes('Pra-uji: mati') && mati.includes('Hidupkan pra-uji') && !mati.includes('Menunggu pra-uji ('), 'Pembina, sakelar mati: tombol Hidupkan, tanpa daftar tahap');
  const hidup = tampil({ user: pembina, pendampingan: { binaDamping: [], pinsa: false }, praUjiAktif: true });
  ok(hidup.includes('Pra-uji: hidup') && hidup.includes('Matikan pra-uji') && hidup.includes('Memuat pengajuan pra-uji'), 'Pembina, sakelar hidup: tombol Matikan dan daftar yang menunggu');
  ok(hidup.includes('data-sumber-peraturan') && hidup.includes('Pasal 33 ayat (6)'), 'halaman memuat judul dan tautan peraturan');
  const penilai = tampil({ user: { role: 'peserta', id: 'x' }, pendampingan: { binaDamping: ['X-01'], pinsa: false }, praUjiAktif: true });
  ok(penilai.includes('Antrian pra-uji saya') === false && penilai.includes('Memuat antrian pra-uji') && !penilai.includes('Hidupkan') && !penilai.includes('Matikan'), 'Bina Damping: hanya antrian penilai, tanpa sakelar');
  const biasa = tampil({ user: { role: 'peserta', id: 'y' }, pendampingan: { binaDamping: [], pinsa: false }, praUjiAktif: true });
  ok(biasa.includes('Belum ada tugas pra-uji'), 'Penegak biasa: pesan belum ada tugas');
}

const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const K = { admin: await masuk('admin', PIN_DEMO.admin), pembina: await masuk('pembina', PIN_DEMO.pembina) };
const NIS = ['10231', '10232', '10118', '10007', '10008', '10233'];
const N = {}; for (const nis of NIS) N[nis] = await masuk(nis, PIN_DEMO.penegak);
const [ahmad, siti, dimas, bagas, nadia, rizky] = NIS.map((n) => N[n].id);
const A = N['10231'].a, S = N['10232'].a, BG = N['10007'].a, R = N['10233'].a;
const ta = tahunAjaranKini();
const tulisSku = (pid, tingkat) => q(
  `insert into public.sku_progress (peserta_id, sku_id, status) select p.id, u.id, 'lulus' from public.profiles p join public.sku_unit u on u.tingkat = $2 and (u.agama is null or u.agama = p.agama)
   where p.id = $1 on conflict (peserta_id, sku_id) do update set status = 'lulus'`, [pid, tingkat]);
const B = (await q(`select id from public.sku_unit where tingkat = 'Bantara' and agama is null order by butir_no, id limit 4`)).map((x) => x.id);
const L = (await q(`select id from public.sku_unit where tingkat = 'Laksana' and agama is null order by butir_no, id limit 2`)).map((x) => x.id);
const [B1, B2, B3] = B;
await q('delete from public.penugasan_rombel'); await q('delete from public.penugasan_peserta');
await q('delete from public.sku_progress where peserta_id = any($1::uuid[])', [[ahmad, siti, dimas, bagas, nadia, rizky]]);
await q(`update public.profiles set kelas = 'X-01', sangga = 'Sangga Merak' where id = any($1::uuid[])`, [[ahmad, siti]]);
await q(`update public.profiles set kelas = 'X-01', sangga = 'Sangga Elang' where id = any($1::uuid[])`, [[bagas, nadia]]);
await q(`update public.profiles set kelas = 'X-02', sangga = 'Sangga Rajawali' where id = any($1::uuid[])`, [[dimas, rizky]]);
for (const id of [siti, bagas, nadia, dimas, rizky]) await tulisSku(id, 'Bantara');
await tulisSku(bagas, 'Laksana');
await q('delete from public.sku_progress where peserta_id = $1 and sku_id = any($2::text[])', [rizky, [B1, B2]]); // Rizky masih mengajukan B1 dan B2
await K.pembina.a.aturJabatanDewan([{ username: '10007', jabatan: 'Bendahara' }, { username: '10008', jabatan: 'Sekretaris' }, { username: '10118', jabatan: 'Humas' }]);
await q(`update public.profiles set pinsa = true where id = $1`, [siti]);
await q(`insert into public.bina_damping (tahun_ajaran, rombel, penegak_id) values ($1, 'X-01', $2), ($1, 'X-01', $3), ($1, 'X-02', $4)`, [ta, bagas, nadia, dimas]);

const kini = async (api, pid, sku, tingkat = 'Bantara') => {
  const r = await api.muatPraUjiPeserta(pid);
  const status = (await q('select status from public.sku_progress where peserta_id = $1 and sku_id = $2', [pid, sku]))[0]?.status ?? 'belum';
  return jalurPraUji((r.data ?? []).filter((x) => x.skuId === sku), status, tingkat);
};
const statusButir = async (pid, sku) => (await q('select status from public.sku_progress where peserta_id = $1 and sku_id = $2', [pid, sku]))[0]?.status ?? 'belum';

console.log('\n--- Jalur tahap nominal sama dengan SQL (sigarda.pra_uji_tahap_berikut) ---');
{
  const t = async (pid, sku, setelah) => (await q('select sigarda.pra_uji_tahap_berikut($1, $2, $3) t', [pid, sku, setelah]))[0].t;
  ok(await t(ahmad, B3, null) === jalurTahap('Bantara')[0] && await t(ahmad, B3, 'pinsa') === jalurTahap('Bantara')[1] && await t(ahmad, B3, 'bina_damping') === 'pembina', 'butir Bantara: Pinsa, Bina Damping, Pembina (server dan klien)');
  ok(await t(ahmad, L[0], null) === jalurTahap('Laksana')[0] && await t(ahmad, L[0], 'bina_damping') === 'pembina', 'butir Laksana: Bina Damping, Pembina (tanpa Pinsa)');
}

console.log('\n--- Sakelar lewat api ---');
let r = await A.muatPraUjiAktif();
ok(r.ok && r.data === false, 'bawaan: pra-uji mati (dibaca Penegak lewat pengaturan)');
r = await BG.muatPendampinganSaya();
ok(r.ok && penilaiPraUji(r.data) && !menuPraUjiTampil({ role: 'peserta' }, r.data, false) && menuPraUjiTampil({ role: 'peserta' }, r.data, true), 'Bagas Bina Damping: menu hanya bila pra-uji hidup');
r = await A.aturSakelarPraUji(true);
ok(!r.ok && /Hanya Pembina atau Admin/.test(r.pesan), 'Penegak tidak dapat mengubah sakelar');
r = await K.pembina.a.aturSakelarPraUji(true);
ok(r.ok && r.data.aktif === true, 'Pembina menghidupkan sakelar');
r = await A.muatPraUjiAktif();
ok(r.ok && r.data === true, 'Penegak membaca sakelar hidup');

console.log('\n--- Pengajuan Ahmad: Pinsa, lalu Bina Damping, lalu Pembina ---');
r = await A.ajukan({ skuId: B3, jadwal: '2030-01-10', pengujiId: null, catatan: 'siap' });
ok(r.ok, 'Ahmad mengajukan butir Bantara ' + (r.pesan ?? ''));
let j = await kini(A, ahmad, B3);
ok(j?.menunggu?.tahap === 'pinsa' && teksPosisiPraUji(j) === 'Menunggu pra-uji Pinsa', 'jalur Ahmad: menunggu Pinsa');
let a = await S.muatAntrianPraUji();
ok(a.ok && a.data.aktif && a.data.menunggu.length === 1 && a.data.menunggu[0].pesertaNama.length > 0, 'antrian Siti (Pinsa): 1 pengajuan dengan nama Penegak');
ok(a.data.menunggu[0].skuId === B3 && a.data.menunggu[0].tahap === 'pinsa' && a.data.menunggu[0].catatanPeserta === 'siap', 'baris antrian memuat butir, tahap, dan catatan Penegak');
r = await S.catatPraUji(a.data.menunggu[0].id, 'belum', '');
ok(!r.ok && /Isi catatan/.test(r.pesan), 'belum lulus tanpa catatan ditolak server');
r = await S.catatPraUji(a.data.menunggu[0].id, 'belum', 'hafalkan lagi');
ok(r.ok && r.data.hasil === 'belum', 'Siti mencatat belum lulus dengan catatan');
j = await kini(A, ahmad, B3);
ok(j?.belum?.catatan === 'hafalkan lagi' && j.belum.penilaiNama && teksPosisiPraUji(j) === 'Belum lulus pra-uji Pinsa', 'Ahmad melihat catatan perbaikan dan nama penilai');
a = await S.muatAntrianPraUji();
ok(a.data.menunggu.length === 0 && a.data.selesai.length === 1 && a.data.selesai[0].status === 'belum', 'antrian Siti kosong; keputusan tercatat di "sudah diputuskan"');
r = await A.ajukan({ skuId: B3, jadwal: '2030-01-11', pengujiId: null, catatan: '' });
ok(r.ok, 'Ahmad mengajukan ulang');
j = await kini(A, ahmad, B3);
ok(j?.belum === null && j.menunggu?.tahap === 'pinsa' && j.langkah[0].keadaan === 'menunggu', 'jalur dimulai dari awal lagi, catatan lama tidak ikut');
a = await S.muatAntrianPraUji();
r = await S.catatPraUji(a.data.menunggu[0].id, 'lulus', '');
ok(r.ok && r.data.tujuan === 'bina_damping', 'Siti meluluskan: diteruskan ke Bina Damping');
j = await kini(A, ahmad, B3);
ok(keadaan(j) === 'lulus,menunggu,nanti' && teksPosisiPraUji(j) === 'Menunggu pra-uji Bina Damping', 'jalur: Pinsa lulus, Bina Damping menunggu');
a = await BG.muatAntrianPraUji();
ok(a.ok && a.data.menunggu.length === 1 && a.data.menunggu[0].tahap === 'bina_damping', 'antrian Bagas (Bina Damping) memuat pengajuan itu');
r = await BG.catatPraUji(a.data.menunggu[0].id, 'lulus', 'bagus');
ok(r.ok && r.data.tujuan === 'pembina', 'Bagas meluluskan: diteruskan ke pengujian resmi Pembina');
j = await kini(A, ahmad, B3);
ok(await statusButir(ahmad, B3) === 'diajukan' && keadaan(j) === 'lulus,lulus,menunggu' && teksPosisiPraUji(j) === 'Lulus pra-uji, menunggu uji resmi Pembina', 'butir diajukan ke Pembina; jalur lengkap tampil');

console.log('\n--- Melewati tahap dan daftar Pembina ---');
await R.ajukan({ skuId: B1, jadwal: '2030-01-10', pengujiId: null, catatan: '' });
j = await kini(R, rizky, B1);
ok(keadaan(j) === 'tanpa-penilai,menunggu,nanti', 'Rizky (X-02 tanpa Pinsa): Pinsa tanpa penilai, menunggu Bina Damping');
r = await K.pembina.a.muatPraUjiMenunggu();
ok(r.ok && r.data.length === 1 && r.data[0].pesertaId === rizky && r.data[0].tahap === 'bina_damping', 'Pembina membaca daftar yang menunggu');
const idLewat = r.data[0].id;
r = await R.muatPraUjiMenunggu();
ok(r.ok && r.data.every((x) => x.pesertaId === rizky), 'Penegak hanya membaca pra-uji miliknya (RLS)');
r = await R.lewatiPraUji(idLewat, 'x');
ok(!r.ok && /Hanya Pembina atau Admin/.test(r.pesan), 'Penegak tidak dapat melewati tahap');
r = await K.pembina.a.lewatiPraUji(idLewat, 'Bina Damping berhalangan');
ok(r.ok && r.data === 'pembina', 'Pembina melewati tahap: ke uji resmi');
j = await kini(R, rizky, B1);
ok(keadaan(j) === 'tanpa-penilai,dilewati,menunggu', 'jalur Rizky: tahap dilewati, menunggu Pembina');

console.log('\n--- Pembatalan dan mematikan sakelar ---');
await R.ajukan({ skuId: B2, jadwal: '2030-01-10', pengujiId: null, catatan: '' });
r = await R.batalkanAjuan(B2);
ok(r.ok, 'pengajuan yang masih menunggu pra-uji dapat dibatalkan lewat api yang sama');
j = await kini(R, rizky, B2);
ok(j === null, 'sesudah dibatalkan jalur tidak tampil');
r = await K.admin.a.aturSakelarPraUji(false);
ok(r.ok && r.data.aktif === false, 'Admin mematikan sakelar');
r = await S.muatAntrianPraUji();
ok(r.ok && r.data.aktif === false && r.data.menunggu.length === 0, 'antrian kosong dan tidak aktif saat sakelar mati');

console.log(`\nRINGKASAN: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
