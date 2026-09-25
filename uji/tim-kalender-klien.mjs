// Tahap 2 (G4b dan G4c): tim penilai dan kalender Garuda di klien. Logika murni (peringatan komposisi, tim untuk calon, status kalender), cermin validasi yang DIBANDINGKAN
// LANGSUNG dengan SQL pada kisi masukan (termasuk daftar tahap = daftar di tabel), pemetaan, dan render halaman. Server: uji/tim-kalender.mjs.
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
import TimPenilaiPanel from '../src/components/TimPenilaiPanel.jsx';
import KalenderGarudaPanel from '../src/components/KalenderGarudaPanel.jsx';
import { AMBANG_TKK_BAWAAN } from '../src/data/tkkData.js';
import { GERBANG_BAWAAN } from '../src/lib/gerbangLogic.js';
import { UNSUR_TIM, peringatanTim, periksaTim, timUntukCalon } from '../src/lib/timLogic.js';
import { TAHAP_GARUDA, kalenderGaruda, periksaTahap, statusTahap, tahapBerikut } from '../src/lib/kalenderGarudaLogic.js';
import { susunGarudaTahap, susunTimPenilai } from '../src/lib/mapDb.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const teks = (el) => renderToStaticMarkup(el).replace(/<!-- -->/g, '');

console.log('--- Peringatan komposisi tim ---');
{
  const lengkap = { untuk: 'putri', nomorSk: '1/2026', anggota: [
    { unsur: 'ketua_gudep', jabatan: 'ketua' }, { unsur: 'pembina', jabatan: 'anggota' }, { unsur: 'andalan_ranting', jabatan: 'anggota' }, { unsur: 'tokoh_masyarakat', jabatan: 'anggota' }, { unsur: 'orang_tua', jabatan: 'anggota' },
  ] };
  ok(peringatanTim(lengkap).length === 0, 'tim lengkap (5 anggota, semua unsur, ketua, SK): tanpa peringatan');
  const w = peringatanTim({ untuk: 'putra', nomorSk: '', anggota: [{ unsur: 'pembina', jabatan: 'anggota' }] });
  ok(w.some((x) => /SK Kwarcab belum/.test(x)) && w.some((x) => /baru 1 anggota/.test(x)) && w.some((x) => /Ketua Gugus Depan/.test(x)) && w.some((x) => /ketua tim/.test(x)) && w.some((x) => /Andalan Ranting/.test(x)) && w.some((x) => /tokoh masyarakat/.test(x)) && w.some((x) => /ayah untuk tim putra/.test(x)), 'tim kurang: semua kekurangan disebut (ayah untuk putra)');
  ok(peringatanTim({ ...lengkap, untuk: 'putri', anggota: lengkap.anggota.filter((a) => a.unsur !== 'orang_tua') }).some((x) => /ibu untuk tim putri/.test(x)), 'orang tua yang dibutuhkan: ibu untuk tim putri');
  ok(timUntukCalon([{ tahunAjaran: '2026/2027', untuk: 'putri', id: 1 }, { tahunAjaran: '2026/2027', untuk: 'putra', id: 2 }], '2026/2027', 'P').id === 1 && timUntukCalon([{ tahunAjaran: '2026/2027', untuk: 'putra', id: 2 }], '2026/2027', 'P') === null
    && timUntukCalon([], '2026/2027', null) === null && timUntukCalon([{ tahunAjaran: '2025/2026', untuk: 'putra', id: 2 }], '2026/2027', 'L') === null, 'timUntukCalon: menurut jenis kelamin dan tahun ajaran; jenis kelamin kosong = null');
}

console.log('\n--- Kalender: status dan urutan ---');
{
  ok(TAHAP_GARUDA.length === 10 && new Set(TAHAP_GARUDA.map((t) => t.id)).size === 10 && TAHAP_GARUDA.every((t) => t.label && t.keterangan), '10 tahap berurutan dengan id unik');
  ok(statusTahap(undefined, '2026-09-25') === 'belum-diatur' && statusTahap({ mulai: '2026-10-01' }, '2026-09-25') === 'akan' && statusTahap({ mulai: '2026-09-20', akhir: '2026-09-30' }, '2026-09-25') === 'berjalan'
    && statusTahap({ mulai: '2026-09-20', akhir: '2026-09-30' }, '2026-09-30') === 'berjalan' && statusTahap({ mulai: '2026-09-20', akhir: '2026-09-30' }, '2026-10-01') === 'lewat' && statusTahap({ mulai: '2026-09-25' }, '2026-09-25') === 'berjalan'
    && statusTahap({ mulai: '2026-09-25' }, '2026-09-26') === 'lewat', 'statusTahap: batas akhir termasuk; tanpa akhir = satu hari');
  const data = [
    { tahunAjaran: '2026/2027', tahap: 'ajukan_tim', mulai: '2026-09-12', akhir: '2026-09-16' },
    { tahunAjaran: '2026/2027', tahap: 'serah_kwarran', mulai: '2026-09-20', akhir: '2026-09-24' },
    { tahunAjaran: '2026/2027', tahap: 'kirim_kwarcab', mulai: '2026-10-07', akhir: null },
    { tahunAjaran: '2026/2027', tahap: 'pelantikan', mulai: '2026-10-28', akhir: null },
    { tahunAjaran: '2025/2026', tahap: 'iuran', mulai: '2026-01-01', akhir: null },
  ];
  const k = kalenderGaruda(data, '2026/2027', '2026-09-25');
  ok(k.length === 10 && k[0].status === 'belum-diatur' && k[1].status === 'lewat' && k[4].status === 'lewat' && k[6].status === 'akan' && k[6].sisaHari === 12 && k[8].status === 'belum-diatur' && k[9].sisaHari === 33, 'kalenderGaruda: status dan sisa hari (tahun ajaran lain tidak ikut)');
  ok(tahapBerikut(k).id === 'kirim_kwarcab', 'tahapBerikut: yang akan datang paling dekat');
  ok(tahapBerikut(kalenderGaruda(data, '2026/2027', '2026-09-22')).id === 'serah_kwarran', 'tahapBerikut: yang sedang berjalan didahulukan');
  ok(tahapBerikut(kalenderGaruda([], '2026/2027', '2026-09-22')) === null && tahapBerikut(kalenderGaruda(data, '2026/2027', '2027-01-01')) === null, 'tahapBerikut: null bila belum diatur atau semua lewat');
}

console.log('\n--- Pemetaan ---');
{
  const t = susunTimPenilai(
    [{ id: '2', tahun_ajaran: '2026/2027', untuk: 'putri', nomor_sk: '', tanggal_sk: null, sk_url: '', catatan: null, dicatat_pada: 'x' }, { id: '1', tahun_ajaran: '2026/2027', untuk: 'putra', nomor_sk: 'A/1', tanggal_sk: '2026-09-10T00:00:00', sk_url: 'https://x', catatan: 'c', dicatat_pada: 'x' }, { id: '3', tahun_ajaran: '2025/2026', untuk: 'putri', nomor_sk: '', tanggal_sk: null, dicatat_pada: 'x' }],
    [{ id: '9', tim_id: '1', urut: 2, nama: 'B', unsur: 'pembina', jabatan: 'anggota', keterangan: null }, { id: '8', tim_id: '1', urut: 1, nama: 'A', unsur: 'ketua_gudep', jabatan: 'ketua', keterangan: 'k' }, { id: '7', tim_id: '2', urut: 1, nama: 'C', unsur: 'lainnya', jabatan: 'anggota' }],
  );
  ok(t.map((x) => x.id).join() === '1,2,3' && t[0].tanggalSk === '2026-09-10' && t[1].tanggalSk === null && t[0].anggota.map((a) => a.nama).join() === 'A,B' && t[0].anggota[1].keterangan === '' && t[1].catatan === '' && t[2].anggota.length === 0, 'susunTimPenilai: anggota diurut per tim; tahun ajaran terbaru dulu, putra dahulu; kosong menjadi teks/null');
  const k = susunGarudaTahap([{ id: '4', tahun_ajaran: '2026/2027', tahap: 'iuran', mulai: '2026-10-20', akhir: null, catatan: null, dicatat_pada: 'x' }]);
  ok(k[0].id === 4 && k[0].akhir === null && k[0].catatan === '' && k[0].mulai === '2026-10-20', 'susunGarudaTahap');
}

const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const pembina = await masuk('pembina', PIN_DEMO.pembina);
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const hari = (await q('select sigarda.hari_ini()::text d'))[0].d;
const geser = async (n) => (await q(`select (sigarda.hari_ini() + $1::int)::text d`, [n]))[0].d;

console.log('\n--- Daftar tahap klien = daftar tahap di tabel ---');
{
  let salah = [];
  for (const t of TAHAP_GARUDA) {
    const r = await sebagai(pembina.id, 'select public.sg_garuda_tahap_simpan($1, $2, $3::date, null, $4)', ['2026/2027', t.id, '2026-10-01', '']);
    if (!r.ok) salah.push(t.id);
  }
  const r2 = await sebagai(pembina.id, 'select public.sg_garuda_tahap_simpan($1, $2, $3::date, null, $4)', ['2026/2027', 'tidak_ada', '2026-10-01', '']);
  ok(salah.length === 0 && !r2.ok, 'setiap tahap di klien diterima server; tahap di luar daftar ditolak ' + salah.join());
  const cek = (await q(`select pg_get_constraintdef(c.oid) d from pg_constraint c where conrelid = 'public.garuda_tahap'::regclass and contype = 'c' and pg_get_constraintdef(c.oid) like '%uji_spg%'`))[0]?.d ?? '';
  ok(TAHAP_GARUDA.every((t) => cek.includes(`'${t.id}'`)) && (cek.match(/'[a-z_]+'::text/g) ?? []).length === TAHAP_GARUDA.length, 'batasan check pada tabel memuat tepat tahap yang sama dengan klien');
  const unsur = (await q(`select pg_get_constraintdef(c.oid) d from pg_constraint c where conrelid = 'public.tim_penilai_anggota'::regclass and contype = 'c' and pg_get_constraintdef(c.oid) like '%ketua_gudep%'`))[0]?.d ?? '';
  ok(UNSUR_TIM.every((u) => unsur.includes(`'${u.id}'`)) && (unsur.match(/'[a-z_]+'::text/g) ?? []).length === UNSUR_TIM.length, 'unsur tim di klien = batasan check pada tabel');
  await q('delete from public.garuda_tahap');
  const labelSql = (await q("select sigarda.garuda_tahap_label(x) l, x from unnest($1::text[]) x", [TAHAP_GARUDA.map((t) => t.id)]));
  ok(labelSql.every((r) => r.l === TAHAP_GARUDA.find((t) => t.id === r.x).label), 'nama tahap untuk notifikasi (SQL) = label di klien untuk semua tahap');
}

console.log('\n--- Cermin validasi tim = sg_tim_penilai_simpan (kisi masukan) ---');
{
  const anggotaSah = [{ nama: 'Ibu Ketua', unsur: 'ketua_gudep', jabatan: 'ketua', keterangan: '' }, { nama: 'Pak Pembina', unsur: 'pembina', jabatan: 'anggota' }];
  const anggotaL = [
    anggotaSah, [], null, 'bukan larik', Array.from({ length: 15 }, (_, i) => ({ nama: `O${i}`, unsur: 'lainnya' })), Array.from({ length: 16 }, (_, i) => ({ nama: `O${i}`, unsur: 'lainnya' })),
    [{ nama: '   ', unsur: 'pembina' }], [{ nama: 'a<b', unsur: 'pembina' }], [{ nama: 'x'.repeat(81), unsur: 'pembina' }], [{ nama: 'A', unsur: 'raja' }], [{ nama: 'A' }], [{ nama: 'A', unsur: 'pembina', jabatan: 'wakil' }],
    [{ nama: 'A', unsur: 'pembina', jabatan: 'ketua' }, { nama: 'B', unsur: 'pembina', jabatan: 'ketua' }], [{ nama: 'A', unsur: 'pembina', keterangan: 'x'.repeat(121) }], [{ nama: 'A', unsur: 'pembina', keterangan: 'ok<' }], [5],
  ];
  const dasarL = [
    {}, { tahunAjaran: '2026' }, { tahunAjaran: null }, { untuk: 'campur' }, { untuk: null }, { nomorSk: 'x'.repeat(81), tanggalSk: '2026-09-10' }, { nomorSk: 'SK<', tanggalSk: '2026-09-10' }, { nomorSk: '', tanggalSk: '2026-09-10' }, { nomorSk: '1/2', tanggalSk: null },
    { nomorSk: '1/2', tanggalSk: '1999-12-31' }, { nomorSk: '1/2', tanggalSk: hari }, { nomorSk: '1/2', tanggalSk: await geser(1) }, { skUrl: 'https://drive.example/x' }, { skUrl: 'ftp://x' }, { skUrl: 'https://a b' }, { skUrl: 'https://' + 'x'.repeat(500) },
    { catatan: 'x'.repeat(301) }, { catatan: 'ok<' }, { catatan: 'aman' },
  ];
  let n = 0, beda = 0;
  for (const dasar of dasarL) for (const ang of anggotaL) {
    const nilai = { tahunAjaran: '2026/2027', untuk: 'putri', nomorSk: '', tanggalSk: null, skUrl: '', catatan: '', ...dasar, anggota: ang };
    const klien = periksaTim({ ...nilai, hari });
    const r = await sebagai(pembina.id, 'select public.sg_tim_penilai_simpan(null, $1, $2, $3, $4::date, $5, $6, $7::jsonb)', [nilai.tahunAjaran, nilai.untuk, nilai.nomorSk, nilai.tanggalSk, nilai.skUrl, nilai.catatan, JSON.stringify(nilai.anggota)]);
    n++;
    if (r.ok) await q('delete from public.tim_penilai');
    if ((klien === '') !== r.ok || (!r.ok && !r.pesan.includes(klien))) { beda++; if (beda < 6) console.log('   beda:', JSON.stringify(dasar).slice(0, 60), JSON.stringify(ang)?.slice(0, 60), 'klien:', klien || 'ok', 'server:', r.ok ? 'ok' : r.pesan); }
  }
  ok(beda === 0, `${n} kombinasi: klien menerima atau menolak sama dengan server, dengan pesan yang sama`);
}

console.log('\n--- Cermin validasi tahap = sg_garuda_tahap_simpan (kisi masukan) ---');
{
  const taL = ['2026/2027', '2026', null];
  const tahapL = ['pelantikan', 'rapat', null];
  const mulaiL = [null, '1999-12-31', '2000-01-01', '2026-10-28', '2100-12-31'];
  const akhirL = [null, '2026-10-01', '2026-10-28', '2027-01-01', '2101-01-01'];
  const catL = ['', 'x'.repeat(201), 'ok<'];
  let n = 0, beda = 0;
  for (const ta of taL) for (const th of tahapL) for (const mu of mulaiL) for (const ak of akhirL) for (const ct of catL) {
    const klien = periksaTahap({ tahunAjaran: ta, tahap: th, mulai: mu, akhir: ak, catatan: ct });
    const r = await sebagai(pembina.id, 'select public.sg_garuda_tahap_simpan($1, $2, $3::date, $4::date, $5)', [ta, th, mu, ak, ct]);
    n++;
    if (r.ok) await q('delete from public.garuda_tahap');
    if ((klien === '') !== r.ok || (!r.ok && !r.pesan.includes(klien))) { beda++; if (beda < 6) console.log('   beda:', { ta, th, mu, ak, ct: ct.slice(0, 4) }, 'klien:', klien || 'ok', 'server:', r.ok ? 'ok' : r.pesan); }
  }
  ok(beda === 0, `${n} kombinasi: klien menerima atau menolak sama dengan server, dengan pesan yang sama`);
}

console.log('\n--- Tampilan (render tanpa peramban) ---');
{
  const pembinaU = { id: 'pb', role: 'penguji', jabatan: 'Pembina', nama: 'Pak Pembina', status: 'aktif' };
  const dewanU = { id: 'dw', role: 'penguji', jabatan: 'Dewan Ambalan', nama: 'Dewan', status: 'aktif' };
  const timAda = susunTimPenilai(
    [{ id: 1, tahun_ajaran: '2026/2027', untuk: 'putri', nomor_sk: '123/2026', tanggal_sk: '2026-09-10', sk_url: 'https://drive.example/sk', catatan: '' }],
    [{ id: 1, tim_id: 1, urut: 1, nama: 'Ibu Ketua', unsur: 'ketua_gudep', jabatan: 'ketua', keterangan: '' }, { id: 2, tim_id: 1, urut: 2, nama: 'Ibu Wali', unsur: 'orang_tua', jabatan: 'anggota', keterangan: 'ibu dari Calon' }],
  );
  const api = () => ({
    muatTimKalender: async () => ({ ok: true, data: { tim: [], tahap: [] } }), muatGerbang: async () => ({ ok: true, data: { lahir: [], aturan: GERBANG_BAWAAN } }), muatSpg: async () => ({ ok: true, data: [] }),
    muatPelantikanSaka: async () => ({ ok: true, data: { pelantikan: [], saka: [] } }), muatTkk: async () => ({ ok: true, data: { capaian: [], krida: [], ambang: AMBANG_TKK_BAWAAN, pengajuan: [] } }),
  });
  const konteks = (user) => ({ api, user, daftarPeserta: [], progress: {}, portofolio: {}, notify: () => {} });
  const panel = (user, boleh, data) => teks(h(KonteksApp.Provider, { value: konteks(user) }, h(TimPenilaiPanel, { data: { tim: data, muat: () => {} }, tahunAjaran: '2026/2027', boleh })));
  let html = panel(pembinaU, true, timAda);
  ok(html.includes('Tim penilai putra') && html.includes('Tim penilai putri') && html.includes('Belum ada tim penilai putra') && html.includes('Ibu Ketua') && html.includes('Ketua tim') && html.includes('SK 123/2026') && html.includes('Buka SK') && html.includes('Catat tim') && html.includes('Ubah'), 'Pembina: tim putri tampil dengan anggota, ketua, SK; tim putra belum ada dengan tombol Catat tim');
  ok(html.includes('Belum ada Andalan Ranting') && html.includes('baru 2 anggota'), 'peringatan komposisi tampil');
  html = panel(dewanU, false, timAda);
  ok(html.includes('Ibu Ketua') && !html.includes('Catat tim') && !html.includes('>Ubah<') && !html.includes('>Hapus<'), 'Dewan hanya melihat: tanpa tombol catat, ubah, hapus');
  const kal = (user, boleh, tahap) => teks(h(KonteksApp.Provider, { value: konteks(user) }, h(KalenderGarudaPanel, { data: { tahap, muat: () => {} }, tahunAjaran: '2026/2027', boleh })));
  const tahapAda = susunGarudaTahap([{ id: 1, tahun_ajaran: '2026/2027', tahap: 'pelantikan', mulai: '2999-10-28', akhir: null, catatan: 'bersama' }, { id: 2, tahun_ajaran: '2026/2027', tahap: 'serah_kwarran', mulai: '2020-09-20', akhir: '2020-09-24', catatan: '' }]);
  html = kal(pembinaU, true, tahapAda);
  ok(html.includes('Pelantikan Pramuka Garuda') && html.includes('Akan datang') && html.includes('Selesai') && html.includes('Belum diatur') && html.includes('>Isi tanggal<') && html.includes('Berikutnya:') && html.includes('hari lagi'), 'Pembina: 10 tahap dengan status, tombol isi tanggal, dan tahap berikutnya');
  html = kal(dewanU, false, tahapAda);
  ok(html.includes('Pelantikan Pramuka Garuda') && !html.includes('>Isi tanggal<') && !html.includes('>Ubah<'), 'Dewan hanya melihat kalender');
  html = teks(h(KonteksApp.Provider, { value: konteks(pembinaU) }, h(Kelayakan)));
  ok(html.includes('Kelayakan Calon Garuda') && html.includes('role="tablist"') && html.includes('>Calon<') && html.includes('>Tim penilai<') && html.includes('>Kalender<') && html.includes('data-sumber-peraturan'), 'halaman Kelayakan: tab Calon, Tim penilai, dan Kalender');
}

console.log(`\nRINGKASAN TIM-KALENDER-KLIEN: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
