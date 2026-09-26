// Tahap 2 (G3): SPG di klien. Logika murni (hasil hitung otomatis butir 2, 4, 6, 11, saran dokumen, status akhir), cermin validasi yang DIBANDINGKAN LANGSUNG dengan SQL pada
// kisi masukan, lapisan api, dan render halaman. Server: uji/spg.mjs.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { KonteksApp } from '../src/context/AppContext.jsx';
import Spg from '../src/pages/Spg.jsx';
import { BUTIR_SPG } from '../src/data/spgData.js';
import { ITEM_PORTOFOLIO } from '../src/data/portofolioData.js';
import { KATALOG_TKK, AMBANG_TKK_BAWAAN } from '../src/data/tkkData.js';
import { hitungSpg, menimpaSaran, periksaSpg, pesertaSpg, ringkasSpg, tambahBulan } from '../src/lib/spgLogic.js';
import { daftarPoin } from '../src/lib/skuLogic.js';
import { susunSpg } from '../src/lib/mapDb.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

console.log('--- Data butir ---');
{
  ok(BUTIR_SPG.length === 13 && BUTIR_SPG.every((b, i) => b.no === i + 1), '13 butir bernomor 1-13 berurutan');
  ok(BUTIR_SPG.every((b) => b.judul && b.uraian && (b.jenis === 'otomatis' || (b.jenis === 'dokumen' && b.dokumen.length > 0))), 'tiap butir berjudul, beruraian, dan berjenis otomatis atau dokumen (dokumen punya tautan cek list)');
  const idPf = new Set(ITEM_PORTOFOLIO.map((x) => x.id));
  ok(BUTIR_SPG.flatMap((b) => b.dokumen ?? []).every((d) => idPf.has(d)), 'setiap dokumen yang dirujuk ada pada cek list portofolio');
  ok(BUTIR_SPG.filter((b) => b.jenis === 'otomatis').map((b) => b.no).join() === '2,4,6,11', 'butir otomatis: 2, 4, 6, 11');
}

console.log('\n--- tambahBulan ---');
{
  const kasus = [['2026-06-15', 3, '2026-09-15'], ['2026-01-31', 1, '2026-02-28'], ['2026-11-30', 3, '2027-02-28'], ['2026-10-31', 3, '2027-01-31'], ['2028-02-29', 12, '2029-02-28'], ['2028-11-30', 3, '2029-02-28']];
  ok(kasus.every(([t, n, e]) => tambahBulan(t, n) === e), 'tambahBulan: melintasi tahun, akhir bulan dipangkas ' + kasus.map(([t, n]) => tambahBulan(t, n)).join(' '));
}

console.log('\n--- Hasil hitung otomatis dan status akhir ---');
const HARI = '2026-10-10';
const semuaLulus = (agama = 'Islam') => Object.fromEntries([...daftarPoin('Bantara', agama), ...daftarPoin('Laksana', agama)].map((p) => [p.id, { status: 'lulus' }]));
const ani = { id: 'a', nama: 'Ani', kelas: 'XI-01', role: 'peserta', status: 'aktif', agama: 'Islam' };
const progress = { a: semuaLulus() };
const pf = (ids) => ({ a: Object.fromEntries(ids.map((id) => [id, { status: 'siap' }])) });
const wajib = AMBANG_TKK_BAWAAN.utamaWajib;
const lain = KATALOG_TKK.filter((t) => !t.agama && !wajib.includes(t.id)).map((t) => t.id);
const tkkPenuh = [...wajib.map((id) => ({ pesertaId: 'a', tkkId: id, tingkat: 'utama' })), ...lain.slice(0, 3).map((id) => ({ pesertaId: 'a', tkkId: id, tingkat: 'madya' })), ...lain.slice(3, 35).map((id) => ({ pesertaId: 'a', tkkId: id, tingkat: 'purwa' }))];
const dasar = { peserta: ani, progress, pelantikan: [], saka: [], capaianTkk: [], ambang: AMBANG_TKK_BAWAAN, portofolio: {}, penetapan: [], hari: HARI };
{
  let b = hitungSpg(dasar);
  ok(b.length === 13 && b.every((x) => x.status === 'belum'), 'tanpa data apa pun: 13 butir belum');
  ok(/pelantikan Laksana belum dicatat/.test(b[1].saran.teks) && b[1].saran.terpenuhi === false, 'butir 2: SKU selesai tetapi pelantikan Laksana belum dicatat');
  b = hitungSpg({ ...dasar, progress: {} });
  ok(/SKU Laksana belum selesai/.test(b[1].saran.teks), 'butir 2: SKU Laksana belum selesai');
  b = hitungSpg({ ...dasar, pelantikan: [{ pesertaId: 'a', tingkat: 'laksana', tanggal: '2026-08-01' }] });
  ok(b[1].status === 'belum' && /genap 3 bulan pada/.test(b[1].saran.teks), 'butir 2: baru 2 bulan sesudah dilantik belum cukup');
  b = hitungSpg({ ...dasar, pelantikan: [{ pesertaId: 'a', tingkat: 'laksana', tanggal: '2026-07-10' }] });
  ok(b[1].status === 'terpenuhi', 'butir 2: tepat 3 bulan sesudah dilantik terpenuhi (otomatis, tanpa penetapan)');
  b = hitungSpg({ ...dasar, pelantikan: [{ pesertaId: 'x', tingkat: 'laksana', tanggal: '2026-01-01' }] });
  ok(b[1].status === 'belum', 'butir 2: pelantikan Penegak lain tidak dihitung');

  b = hitungSpg({ ...dasar, capaianTkk: tkkPenuh });
  ok(b[3].status === 'terpenuhi' && /45 dari 45/.test(b[3].saran.teks), 'butir 4: TKK memenuhi ambang bawaan (45 total, 3 Madya, 10 wajib Utama)');
  b = hitungSpg({ ...dasar, capaianTkk: tkkPenuh.slice(0, 20) });
  ok(b[3].status === 'belum', 'butir 4: TKK belum memenuhi ambang');
  b = hitungSpg({ ...dasar, capaianTkk: tkkPenuh, ambang: { total: 20, madya: 1, utamaWajib: [] } });
  ok(b[3].status === 'terpenuhi', 'butir 4 mengikuti ambang yang diatur (bukan angka tetap)');

  b = hitungSpg({ ...dasar, saka: [{ pesertaId: 'a', saka: 'Saka Bahari', status: 'aktif' }] });
  ok(b[5].status === 'terpenuhi' && /Saka Bahari \(aktif, surat keterangan belum ditautkan\)/.test(b[5].saran.teks), 'butir 6: tergabung di Saka');
  b = hitungSpg({ ...dasar, saka: [{ pesertaId: 'a', saka: 'Saka Bahari', status: 'selesai' }] });
  ok(b[5].status === 'terpenuhi', 'butir 6: pernah tergabung (selesai) tetap terpenuhi');
  b = hitungSpg({ ...dasar, saka: [{ pesertaId: 'x', saka: 'Saka Bahari', status: 'aktif' }] });
  ok(b[5].status === 'belum', 'butir 6: Saka Penegak lain tidak dihitung');

  b = hitungSpg({ ...dasar, capaianTkk: [{ pesertaId: 'a', tkkId: 'penabung', tingkat: 'purwa' }], portofolio: pf(['PF-16']) });
  ok(b[10].status === 'terpenuhi', 'butir 11: TKK Penabung tercatat dan buku tabungan siap');
  b = hitungSpg({ ...dasar, capaianTkk: [{ pesertaId: 'a', tkkId: 'penabung', tingkat: 'purwa' }] });
  ok(b[10].status === 'belum' && /buku tabungan belum siap/.test(b[10].saran.teks), 'butir 11: tanpa buku tabungan belum');
  b = hitungSpg({ ...dasar, portofolio: pf(['PF-16']) });
  ok(b[10].status === 'belum', 'butir 11: tanpa TKK Penabung belum');

  // butir dokumen
  b = hitungSpg({ ...dasar, portofolio: pf(['PF-01']) });
  ok(b[0].status === 'belum' && /1 dari 2/.test(b[0].saran.teks), 'butir 1: satu dari dua dokumen siap = belum');
  b = hitungSpg({ ...dasar, portofolio: pf(['PF-01', 'PF-02']) });
  ok(b[0].status === 'menunggu' && b[0].saran.terpenuhi, 'butir 1: dokumen lengkap tetapi belum ditetapkan Pembina = menunggu');
  const tetap = (butir, nilai, extra = {}) => ({ pesertaId: 'a', butir, nilai, tanggal: '2026-10-01', catatan: '', timpa: false, ...extra });
  b = hitungSpg({ ...dasar, portofolio: pf(['PF-01', 'PF-02']), penetapan: [tetap(1, 100)] });
  ok(b[0].status === 'terpenuhi' && b[0].nilai === 100 && b[0].penetapan.tanggal === '2026-10-01', 'butir 1: ditetapkan 100 = terpenuhi');
  b = hitungSpg({ ...dasar, portofolio: pf(['PF-01', 'PF-02']), penetapan: [tetap(1, 0, { timpa: true, catatan: 'dokumen palsu' })] });
  ok(b[0].status === 'belum' && b[0].timpa, 'butir 1: ditetapkan 0 walau dokumen lengkap = belum (penimpaan tercatat)');
  b = hitungSpg({ ...dasar, penetapan: [tetap(3, 100, { timpa: true, catatan: 'surat menyusul' })] });
  ok(b[2].status === 'terpenuhi', 'butir 3: Pembina menetapkan 100 walau dokumen belum siap (penimpaan)');
  b = hitungSpg({ ...dasar, penetapan: [tetap(2, 100, { timpa: true, catatan: 'latihan 12x di gudep lain' })] });
  ok(b[1].status === 'terpenuhi', 'butir otomatis: penetapan Pembina menimpa hasil aplikasi (belum -> terpenuhi)');
  b = hitungSpg({ ...dasar, pelantikan: [{ pesertaId: 'a', tingkat: 'laksana', tanggal: '2026-07-10' }], penetapan: [tetap(2, 0, { timpa: true, catatan: 'absensi kurang' })] });
  ok(b[1].status === 'belum', 'butir otomatis: penetapan 0 menimpa hasil aplikasi (terpenuhi -> belum)');
  b = hitungSpg({ ...dasar, penetapan: [tetap(1, 100, { pesertaId: 'x' })] });
  ok(b[0].status === 'belum', 'penetapan Penegak lain tidak dihitung');

  const semua = hitungSpg({ ...dasar, penetapan: BUTIR_SPG.map((x) => tetap(x.no, 100, { timpa: true, catatan: 'lengkap semua' })) });
  const rs = ringkasSpg(semua);
  ok(rs.terpenuhi === 13 && rs.penuh && rs.menunggu === 0 && rs.belum === 0, 'ringkasSpg: 13 terpenuhi = penuh');
  const rp = ringkasSpg(hitungSpg({ ...dasar, portofolio: pf(['PF-01', 'PF-02']) }));
  ok(rp.terpenuhi === 0 && rp.menunggu === 1 && rp.belum === 12 && !rp.penuh, 'ringkasSpg: menunggu dihitung tersendiri');

  ok(menimpaSaran(100, { terpenuhi: false }) && menimpaSaran(0, { terpenuhi: true }) && !menimpaSaran(100, { terpenuhi: true }) && !menimpaSaran(0, { terpenuhi: false }), 'menimpaSaran: hanya bila nilai berbeda dari saran aplikasi');

  const users = [ani, { ...ani, id: 'b', nama: 'Budi', kelas: 'X-01' }, { ...ani, id: 'c', nama: 'Cici', status: 'nonaktif' }, { ...ani, id: 'd', nama: 'Dedi', kelas: 'XI-02' }, { id: 'p', role: 'penguji', nama: 'Pembina', status: 'aktif' }];
  const pr = { a: semuaLulus(), b: semuaLulus(), c: semuaLulus(), d: {} };
  ok(pesertaSpg(users, pr).map((u) => u.nama).join() === 'Budi,Ani', 'pesertaSpg: Penegak aktif yang seluruh SKU-nya lulus, urut kelas lalu nama (nonaktif, belum lulus, dan Pembina tidak masuk)');
}

console.log('\n--- Pemetaan ---');
{
  const m = susunSpg([{ peserta_id: 'b', butir: 2, nilai: 0, tanggal: '2026-10-02', catatan: null, timpa: true, dicatat_pada: 'x' }, { peserta_id: 'a', butir: 10, nilai: 100, tanggal: '2026-10-01', catatan: 'ok', timpa: false, dicatat_pada: 'x' }, { peserta_id: 'a', butir: 2, nilai: '100', tanggal: '2026-10-01', catatan: '', timpa: false, dicatat_pada: 'x' }]);
  ok(m.map((x) => `${x.pesertaId}${x.butir}`).join() === 'a2,a10,b2' && m[0].nilai === 100 && m[2].catatan === '' && m[2].timpa === true, 'susunSpg: butir dan nilai angka, urut Penegak lalu butir, catatan kosong menjadi ""');
}

const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const pembina = await masuk('pembina', PIN_DEMO.pembina);
const siti = await masuk('10232', PIN_DEMO.penegak);
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const hari = (await q('select sigarda.hari_ini()::text d'))[0].d;
const geser = async (n) => (await q(`select (sigarda.hari_ini() + $1::int)::text d`, [n]))[0].d;
await q('delete from public.sku_progress where peserta_id = $1', [siti.id]);
for (const t of ['Bantara', 'Laksana']) await q(`insert into public.sku_progress (peserta_id, sku_id, status) select p.id, u.id, 'lulus' from public.profiles p join public.sku_unit u on u.tingkat = $2 and (u.agama is null or u.agama = p.agama) where p.id = $1`, [siti.id, t]);

console.log('\n--- Cermin validasi = sg_spg_catat (kisi masukan) ---');
{
  const butirL = [null, 0, 1, 13, 14];
  const nilaiL = [null, 0, 100, 50];
  const tanggalL = [null, '1999-12-31', '2000-01-01', hari, await geser(1)];
  const catatanL = ['', 'x'.repeat(201), 'ok<', 'ab', 'alasan cukup', '  a  b  '];
  let n = 0, beda = 0;
  for (const bt of butirL) for (const nl of nilaiL) for (const tg of tanggalL) for (const ct of catatanL) for (const tm of [false, true]) {
    const klien = periksaSpg({ butir: bt, nilai: nl, tanggal: tg, catatan: ct, timpa: tm, hari });
    const r = await sebagai(pembina.id, 'select public.sg_spg_catat($1::uuid, $2::int, $3::int, $4::date, $5, $6::boolean)', [siti.id, bt, nl, tg, ct, tm]);
    n++;
    if (r.ok) await q('delete from public.spg_penetapan');
    if ((klien === '') !== r.ok || (!r.ok && !r.pesan.includes(klien))) { beda++; if (beda < 6) console.log('   beda:', { bt, nl, tg, ct: ct.slice(0, 5), tm }, 'klien:', klien || 'ok', 'server:', r.ok ? 'ok' : r.pesan); }
  }
  ok(beda === 0, `${n} kombinasi: klien menerima atau menolak sama dengan server, dengan pesan yang sama`);
}

console.log('\n--- Lapisan api ---');
{
  let r = await pembina.a.catatSpg({ pesertaId: siti.id, butir: 7, nilai: 100, tanggal: await geser(-3), catatan: 'Surat aktif membantu Pembina' });
  ok(r.ok, 'catatSpg ' + (r.pesan ?? ''));
  r = await pembina.a.catatSpg({ pesertaId: siti.id, butir: 4, nilai: 100, tanggal: await geser(-3), catatan: '', timpa: true });
  ok(!r.ok && /tulis alasannya/.test(r.pesan), 'catatSpg: penimpaan tanpa alasan ditolak server');
  r = await siti.a.catatSpg({ pesertaId: siti.id, butir: 8, nilai: 100, tanggal: hari });
  ok(!r.ok && /Hanya Pembina dan Admin Gudep/.test(r.pesan), 'Penegak ditolak menetapkan lewat api');
  r = await siti.a.muatSpg();
  ok(r.ok && r.data.length === 1 && r.data[0].butir === 7 && r.data[0].nilai === 100 && r.data[0].timpa === false && /^\d{4}-\d{2}-\d{2}$/.test(r.data[0].tanggal), 'muatSpg memetakan baris (Penegak: miliknya)');
  r = await pembina.a.hapusSpg(siti.id, 7);
  ok(r.ok && (await pembina.a.muatSpg()).data.length === 0, 'hapusSpg');
}

console.log('\n--- Tampilan (render tanpa peramban) ---');
{
  const pembinaU = { id: 'pb', role: 'penguji', jabatan: 'Pembina', nama: 'Pak Pembina', status: 'aktif' };
  const api = () => ({
    muatSpg: async () => ({ ok: true, data: [] }),
    muatPelantikanSaka: async () => ({ ok: true, data: { pelantikan: [], saka: [] } }),
    muatTkk: async () => ({ ok: true, data: { capaian: [], krida: [], ambang: AMBANG_TKK_BAWAAN, pengajuan: [] } }),
  });
  const daftar = [ani, { ...ani, id: 'b', nama: 'Budi', kelas: 'X-01' }];
  const pr = { a: semuaLulus(), b: semuaLulus() };
  const untukPembina = renderToStaticMarkup(h(KonteksApp.Provider, { value: { api, user: pembinaU, daftarPesertaSemua: daftar, progress: pr, portofolio: {}, notify: () => {} } }, h(Spg)));
  ok(untukPembina.includes('Syarat Pramuka Garuda (SPG)') && untukPembina.includes('data-sumber-peraturan') && untukPembina.includes('Budi') && untukPembina.includes('Ani') && /0\D*dari\D*13/.test(untukPembina.replace(/<[^>]+>/g, ' ')), 'Pembina: daftar Penegak yang layak dengan kemajuan 0 dari 13 dan rujukan peraturan');
  const untukPenegak = renderToStaticMarkup(h(KonteksApp.Provider, { value: { api, user: ani, daftarPesertaSemua: daftar, progress: pr, portofolio: {}, notify: () => {} } }, h(Spg)));
  ok(untukPenegak.includes('butir terpenuhi') && untukPenegak.includes('UUD 1945 dan UU Gerakan Pramuka') && !untukPenegak.includes('Tetapkan'), 'Penegak: melihat 13 butir miliknya tanpa tombol Tetapkan');
  const belumLayak = renderToStaticMarkup(h(KonteksApp.Provider, { value: { api, user: { ...ani, id: 'z' }, daftarPesertaSemua: daftar, progress: pr, portofolio: {}, notify: () => {} } }, h(Spg)));
  ok(belumLayak.includes('SPG belum dapat dinilai'), 'Penegak yang belum menyelesaikan SKU: pesan belum dapat dinilai');
}

console.log(`\nRINGKASAN SPG-KLIEN: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
