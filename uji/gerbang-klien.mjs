// Tahap 2 (G4): gerbang calon Garuda di klien. Logika murni (kelas, usia, SKU, kuota), cermin validasi yang DIBANDINGKAN LANGSUNG dengan SQL pada kisi masukan, pemetaan,
// dan render halaman. Server: uji/gerbang.mjs.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { KonteksApp } from '../src/context/AppContext.jsx';
import Kelayakan from '../src/pages/Kelayakan.jsx';
import { AMBANG_TKK_BAWAAN } from '../src/data/tkkData.js';
import { GERBANG_BAWAAN, hitungGerbang, kuotaCalon, periksaGerbang, periksaTanggalLahir, tanggalLahirPeserta, tingkatKelas } from '../src/lib/gerbangLogic.js';
import { susunGerbang, susunTanggalLahir } from '../src/lib/mapDb.js';
import { daftarPoin } from '../src/lib/skuLogic.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

console.log('--- Logika murni ---');
{
  ok(tingkatKelas('XI-03') === 'XI' && tingkatKelas('X-10') === 'X' && tingkatKelas('XII-01') === 'XII' && tingkatKelas('XI') === 'XI' && tingkatKelas(' xii ') === 'XII' && tingkatKelas('XIII-01') === null && tingkatKelas('') === null && tingkatKelas(null) === null, 'tingkatKelas: rombel baku dan data lama ("XI"), selain itu null');
  const aktif = (n, calon = 0) => Array.from({ length: n }, (_, i) => ({ id: `u${i}`, calonGaruda: i < calon ? '2026-09-01' : null }));
  ok(JSON.stringify(kuotaCalon(aktif(700, 10))) === '{"aktif":700,"maks":35,"terdaftar":10,"sisa":25}', 'kuotaCalon: 5% dari 700 = 35, terdaftar 10, sisa 25');
  ok(kuotaCalon(aktif(39), GERBANG_BAWAAN).maks === 1 && kuotaCalon(aktif(19), GERBANG_BAWAAN).maks === 0, 'kuotaCalon: dibulatkan ke bawah');
  ok(kuotaCalon(aktif(100, 7)).sisa === -2, 'kuotaCalon: melebihi kuota = sisa negatif');
  ok(kuotaCalon(aktif(100), { ...GERBANG_BAWAAN, kuotaPersen: 12 }).maks === 12, 'kuotaCalon mengikuti aturan yang diatur');

  const semua = Object.fromEntries([...daftarPoin('Bantara', 'Islam'), ...daftarPoin('Laksana', 'Islam')].map((p) => [p.id, { status: 'lulus' }]));
  const ani = { id: 'a', nama: 'Ani', kelas: 'XI-01', role: 'peserta', status: 'aktif', agama: 'Islam' };
  let g = hitungGerbang({ peserta: ani, tanggalLahir: '2008-06-01', progress: { a: semua } });
  ok(g.ok === 3 && g.tidak === 0 && g.belumData === 0 && g.syarat.map((s) => s.id).join() === 'kelas,usia,sku', 'semua syarat terpenuhi');
  g = hitungGerbang({ peserta: { ...ani, kelas: 'X-02' }, tanggalLahir: '2008-06-01', progress: { a: semua } });
  ok(g.syarat[0].status === 'tidak' && /minimal XI/.test(g.syarat[0].teks), 'kelas X di bawah kelas minimal XI');
  g = hitungGerbang({ peserta: { ...ani, kelas: 'XII-05' }, tanggalLahir: '2008-06-01', progress: { a: semua } });
  ok(g.syarat[0].status === 'ok', 'kelas XII memenuhi');
  g = hitungGerbang({ peserta: { ...ani, kelas: 'X-02' }, tanggalLahir: '2008-06-01', progress: { a: semua }, aturan: { ...GERBANG_BAWAAN, kelasMin: 'X' } });
  ok(g.syarat[0].status === 'ok', 'kelas minimal mengikuti aturan yang diatur');
  g = hitungGerbang({ peserta: { ...ani, kelas: 'XI' }, tanggalLahir: '2008-06-01', progress: { a: semua } });
  ok(g.syarat[0].status === 'ok', 'data lama "XI" tetap dikenali');
  g = hitungGerbang({ peserta: { ...ani, kelas: 'kelas sebelas' }, tanggalLahir: '2008-06-01', progress: { a: semua } });
  ok(g.syarat[0].status === 'belum-data' && g.belumData === 1, 'kelas tak dikenal: data belum ada (bukan gagal)');
  g = hitungGerbang({ peserta: ani, tanggalLahir: null, progress: { a: semua } });
  ok(g.syarat[1].status === 'belum-data' && /belum diisi/.test(g.syarat[1].teks), 'tanpa tanggal lahir: data belum ada');
  const batas = (t) => hitungGerbang({ peserta: ani, tanggalLahir: t, progress: { a: semua } }).syarat[1].status;
  ok(batas('2007-10-31') === 'tidak' && batas('2007-11-01') === 'ok' && batas('2009-05-01') === 'ok' && batas('2009-05-02') === 'tidak', 'usia: batas rentang lahir termasuk kedua ujungnya (1 Nov 2007 s.d. 1 Mei 2009)');
  g = hitungGerbang({ peserta: ani, tanggalLahir: '2008-06-01', progress: {} });
  ok(g.syarat[2].status === 'tidak' && g.tidak === 1, 'SKU belum selesai');
  ok(tanggalLahirPeserta([{ pesertaId: 'a', tanggal: '2008-06-01' }], 'a') === '2008-06-01' && tanggalLahirPeserta([], 'a') === null, 'tanggalLahirPeserta');
}

console.log('\n--- Pemetaan ---');
{
  const t = susunTanggalLahir([{ peserta_id: 'a', tanggal: '2008-06-01T00:00:00', dicatat_pada: 'x' }]);
  ok(t.length === 1 && t[0].pesertaId === 'a' && t[0].tanggal === '2008-06-01', 'susunTanggalLahir: tanggal teks YYYY-MM-DD');
  ok(JSON.stringify(susunGerbang({ kelasMin: 'X', lahirDari: '2006-01-01', lahirSampai: '2008-12-31', kuotaPersen: 7 }, GERBANG_BAWAAN)) === '{"kelasMin":"X","lahirDari":"2006-01-01","lahirSampai":"2008-12-31","kuotaPersen":7}', 'susunGerbang: nilai sah dipakai');
  ok(susunGerbang(undefined, GERBANG_BAWAAN) === GERBANG_BAWAAN && susunGerbang({ kelasMin: 'IX' }, GERBANG_BAWAAN) === GERBANG_BAWAAN && susunGerbang({ kelasMin: 'XI', lahirDari: 'x', lahirSampai: '2009-05-01', kuotaPersen: 5 }, GERBANG_BAWAAN) === GERBANG_BAWAAN, 'susunGerbang: belum ada atau rusak = bawaan');
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

console.log('\n--- Cermin validasi tanggal lahir = sg_tanggal_lahir_atur (kisi masukan) ---');
{
  let n = 0, beda = 0;
  for (const tg of [null, '1989-12-31', '1990-01-01', '2008-06-01', hari, await geser(1)]) {
    const klien = periksaTanggalLahir({ tanggal: tg, hari });
    const r = await sebagai(pembina.id, 'select public.sg_tanggal_lahir_atur($1::uuid, $2::date)', [siti.id, tg]);
    n++;
    if ((klien === '') !== r.ok || (!r.ok && !r.pesan.includes(klien))) { beda++; console.log('   beda:', { tg }, 'klien:', klien || 'ok', 'server:', r.ok ? 'ok' : r.pesan); }
  }
  ok(beda === 0, `${n} kombinasi: klien menerima atau menolak sama dengan server, dengan pesan yang sama`);
}

console.log('\n--- Cermin validasi aturan gerbang = sg_gerbang_simpan (kisi masukan) ---');
{
  const kelasL = ['X', 'XI', 'XII', 'IX', '', 'xi'];
  const dariL = ['2007-11-01', '1989-12-31', '2007-1-1', '2009-02-30', '2010-01-01', '0000-01-01', 'abc'];
  const sampaiL = ['2009-05-01', '2031-01-01', '2007-01-01', '2030-12-31', '2009-13-01'];
  const kuotaL = [5, 0, 100, 101, -1, 2.5];
  let n = 0, beda = 0;
  for (const km of kelasL) for (const dr of dariL) for (const sp of sampaiL) for (const kt of kuotaL) {
    const nilai = { kelasMin: km, lahirDari: dr, lahirSampai: sp, kuotaPersen: kt };
    const klien = periksaGerbang(nilai);
    const r = await sebagai(pembina.id, 'select public.sg_gerbang_simpan($1::jsonb)', [JSON.stringify(nilai)]);
    n++;
    if ((klien === '') !== r.ok || (!r.ok && !r.pesan.includes(klien))) { beda++; if (beda < 6) console.log('   beda:', nilai, 'klien:', klien || 'ok', 'server:', r.ok ? 'ok' : r.pesan); }
  }
  ok(beda === 0, `${n} kombinasi: klien menerima atau menolak sama dengan server, dengan pesan yang sama`);
  const bentuk = [null, [], 'x', { kelasMin: 'XI' }, { kelasMin: 'XI', lahirDari: '2007-11-01', lahirSampai: '2009-05-01' }, { kelasMin: 1, lahirDari: '2007-11-01', lahirSampai: '2009-05-01', kuotaPersen: 5 },
    { kelasMin: 'XI', lahirDari: '2007-11-01', lahirSampai: '2009-05-01', kuotaPersen: '5' }, { kelasMin: 'XI', lahirDari: '2007-11-01', lahirSampai: '2009-05-01', kuotaPersen: 5, lain: 1 }];
  let b2 = 0;
  for (const nilai of bentuk) {
    const klien = periksaGerbang(nilai);
    const r = await sebagai(pembina.id, 'select public.sg_gerbang_simpan($1::jsonb)', [JSON.stringify(nilai)]);
    if ((klien === '') !== r.ok || (!r.ok && !r.pesan.includes(klien))) { b2++; console.log('   beda bentuk:', JSON.stringify(nilai), 'klien:', klien || 'ok', 'server:', r.ok ? 'ok' : r.pesan); }
  }
  ok(b2 === 0, `${bentuk.length} bentuk masukan rusak: klien = server (bukan galat basis data)`);
}

console.log('\n--- Tampilan (render tanpa peramban) ---');
{
  const pembinaU = { id: 'pb', role: 'penguji', jabatan: 'Pembina', nama: 'Pak Pembina', status: 'aktif' };
  const api = () => ({
    muatGerbang: async () => ({ ok: true, data: { lahir: [], aturan: GERBANG_BAWAAN } }),
    muatSpg: async () => ({ ok: true, data: [] }),
    muatPelantikanSaka: async () => ({ ok: true, data: { pelantikan: [], saka: [] } }),
    muatTkk: async () => ({ ok: true, data: { capaian: [], krida: [], ambang: AMBANG_TKK_BAWAAN, pengajuan: [] } }),
  });
  const semua = Object.fromEntries([...daftarPoin('Bantara', 'Islam'), ...daftarPoin('Laksana', 'Islam')].map((p) => [p.id, { status: 'lulus' }]));
  const daftar = [
    { id: 'a', nama: 'Ani', kelas: 'XI-01', role: 'peserta', status: 'aktif', agama: 'Islam', calonGaruda: '2026-09-01' },
    { id: 'b', nama: 'Budi', kelas: 'X-01', role: 'peserta', status: 'aktif', agama: 'Islam' },
  ];
  const konteks = (user) => ({ api, user, daftarPeserta: daftar, progress: { a: semua }, portofolio: {}, notify: () => {} });
  const teks = (el) => renderToStaticMarkup(el).replace(/<!-- -->/g, '');
  const html = teks(h(KonteksApp.Provider, { value: konteks(pembinaU) }, h(Kelayakan)));
  ok(html.includes('Kelayakan Calon Garuda') && html.includes('data-sumber-peraturan') && html.includes('Ani') && html.includes('Calon Garuda') && html.includes('Isi tanggal lahir') && html.includes('Simpan aturan'), 'Pembina: halaman dirender dengan judul, rujukan, calon, tombol isi tanggal lahir, dan aturan yang dapat disimpan');
  ok(html.replace(/<[^>]+>/g, '').includes('1 terdaftar dari maksimal 0') && html.includes('Melebihi kuota 1 calon'), 'kuota: 2 Penegak aktif, maksimal 0, 1 terdaftar = melebihi kuota (peringatan)');
  ok(!html.includes('Budi'), 'Penegak yang SKU-nya belum selesai dan bukan calon tidak tampil secara bawaan');
  ok(html.includes('Usia: Data belum ada') && html.includes('Kelas: Memenuhi') && html.includes('SKU: Memenuhi'), 'chip syarat: kelas dan SKU memenuhi, usia data belum ada');
  const dewan = teks(h(KonteksApp.Provider, { value: konteks({ id: 'dw', role: 'penguji', jabatan: 'Dewan Ambalan', nama: 'Dewan', status: 'aktif' }) }, h(Kelayakan)));
  ok(!dewan.includes('Isi tanggal lahir') && !dewan.includes('Simpan aturan') && dewan.includes('Ani'), 'Dewan hanya melihat: tanpa tombol isi tanggal lahir dan simpan aturan');
}

console.log(`\nRINGKASAN GERBANG-KLIEN: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
