// Tahap 2 (G1): pelantikan dan Saka di klien. Logika murni (calon, pemeriksaan isian, pengelompokan), cermin validasi yang DIBANDINGKAN LANGSUNG dengan SQL pada kisi masukan,
// lapisan api (pemetaan dan aksi lewat klien palsu), dan render halaman. Server: uji/pelantikan-saka.mjs.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { KonteksApp } from '../src/context/AppContext.jsx';
import Pelantikan from '../src/pages/Pelantikan.jsx';
import KartuPelantikanSaya from '../src/components/KartuPelantikanSaya.jsx';
import {
  calonPelantikan, kelompokPelantikan, labelTingkatPelantikan, pelantikanPeserta, periksaPelantikan, periksaSaka, ringkasPelantikan, sakaPeserta, SARAN_SAKA, tingkatSku,
} from '../src/lib/pelantikanLogic.js';
import { daftarPoin } from '../src/lib/skuLogic.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

console.log('--- Logika murni ---');
{
  ok(tingkatSku('bantara') === 'Bantara' && tingkatSku('laksana') === 'Laksana' && labelTingkatPelantikan('laksana') === 'Laksana', 'nama tingkat');
  ok(SARAN_SAKA.length >= 8 && new Set(SARAN_SAKA).size === SARAN_SAKA.length, 'saran nama Saka tanpa duplikat');
  // calonPelantikan: progres sintetis dengan butir sungguhan
  const semuaBantara = (id, agama = 'Islam') => Object.fromEntries(daftarPoin('Bantara', agama).map((p) => [p.id, { status: 'lulus' }]));
  const u = (id, nama, kelas, extra = {}) => ({ id, nama, kelas, role: 'peserta', status: 'aktif', agama: 'Islam', ...extra });
  const users = [u('a', 'Ani', 'X-02'), u('b', 'Budi', 'X-01'), u('c', 'Cici', 'X-01', { status: 'nonaktif' }), u('d', 'Dedi', 'X-03'), u('e', 'Eko', 'XI-01'), { id: 'p', role: 'penguji', nama: 'Pembina', jabatan: 'Pembina', status: 'aktif' }];
  const progress = { a: semuaBantara(), b: semuaBantara(), c: semuaBantara(), d: { [daftarPoin('Bantara', 'Islam')[0].id]: { status: 'lulus' } }, e: semuaBantara() };
  const pel = [{ id: 1, pesertaId: 'e', tingkat: 'bantara', tanggal: '2026-08-01', tempat: 'Lapangan', agendaId: null }];
  let c = calonPelantikan({ users, progress, pelantikan: pel, tingkat: 'bantara' });
  ok(c.map((x) => x.nama).join() === 'Budi,Ani', 'calon Bantara: aktif, semua butir lulus, belum dilantik, urut kelas lalu nama (Cici nonaktif, Dedi belum lulus, Eko sudah, Pembina bukan Penegak tidak masuk)');
  c = calonPelantikan({ users, progress, pelantikan: pel, tingkat: 'bantara', termasukSudah: true });
  ok(c.map((x) => x.nama).join() === 'Budi,Ani,Eko', 'termasukSudah untuk koreksi menambahkan yang sudah tercatat');
  ok(calonPelantikan({ users, progress, pelantikan: pel, tingkat: 'laksana' }).length === 0, 'calon Laksana kosong bila butir Laksana belum lulus');
  ok(pelantikanPeserta(pel, 'e').bantara?.tempat === 'Lapangan' && pelantikanPeserta(pel, 'e').laksana === null && pelantikanPeserta(pel, 'x').bantara === null, 'pelantikanPeserta');
  const saka = [{ id: 1, pesertaId: 'a', saka: 'Saka Wanabakti', status: 'selesai' }, { id: 2, pesertaId: 'a', saka: 'Saka Bahari', status: 'aktif' }, { id: 3, pesertaId: 'b', saka: 'Saka Bahari', status: 'aktif' }];
  ok(sakaPeserta(saka, 'a').map((s) => s.id).join() === '2,1', 'sakaPeserta: aktif lebih dulu');
  ok(JSON.stringify(ringkasPelantikan([...pel, { tingkat: 'laksana' }, { tingkat: 'bantara' }], saka)) === '{"bantara":2,"laksana":1,"sakaAktif":2}', 'ringkasPelantikan (Penegak berbeda yang aktif di Saka)');
  const banyak = [
    { id: 1, pesertaId: 'a', tingkat: 'bantara', tanggal: '2026-08-01', tempat: 'Lapangan', agendaId: null },
    { id: 2, pesertaId: 'b', tingkat: 'bantara', tanggal: '2026-08-01', tempat: 'Lapangan', agendaId: null },
    { id: 3, pesertaId: 'a', tingkat: 'laksana', tanggal: '2026-09-10', tempat: 'Aula', agendaId: 4 },
    { id: 4, pesertaId: 'zz', tingkat: 'laksana', tanggal: '2026-09-10', tempat: 'Aula', agendaId: 4 },
  ];
  const g = kelompokPelantikan(banyak, users);
  ok(g.length === 2 && g[0].tingkat === 'laksana' && g[0].anggota.length === 2 && g[1].anggota.map((x) => x.nama).join() === 'Ani,Budi', 'kelompok per upacara, terbaru dulu, anggota terurut nama');
  ok(g[0].anggota.some((x) => x.nama === '(anggota dihapus)'), 'anggota yang tidak ditemukan tetap tampil dengan nama pengganti');
}

const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const pembina = await masuk('pembina', PIN_DEMO.pembina);
const siti = await masuk('10232', PIN_DEMO.penegak);
const dimas = await masuk('10118', PIN_DEMO.penegak);
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const hari = (await q('select sigarda.hari_ini()::text d'))[0].d;
const geser = async (n) => (await q(`select (sigarda.hari_ini() + $1::int)::text d`, [n]))[0].d;
await q('delete from public.sku_progress where peserta_id = any($1::uuid[])', [[siti.id, dimas.id]]);
for (const id of [siti.id, dimas.id]) await q(`insert into public.sku_progress (peserta_id, sku_id, status) select p.id, u.id, 'lulus' from public.profiles p join public.sku_unit u on u.tingkat = 'Bantara' and (u.agama is null or u.agama = p.agama) where p.id = $1`, [id]);

console.log('\n--- Cermin validasi pelantikan = sg_pelantikan_catat (kisi masukan) ---');
{
  const tingkatL = ['bantara', 'garuda', null];
  const tanggalL = [null, '1999-12-31', '2000-01-01', hari, await geser(1)];
  const tempatL = ['Lapangan', '   ', 'a<b', 'x'.repeat(121), 'x'.repeat(120), 'Aula   Besar'];
  const catatanL = ['', 'x'.repeat(201), 'ok<'];
  let n = 0, beda = 0;
  for (const tk of tingkatL) for (const tg of tanggalL) for (const tm of tempatL) for (const ct of catatanL) for (const jml of [0, 1]) {
    const klien = periksaPelantikan({ tingkat: tk, tanggal: tg, tempat: tm, catatan: ct, jumlah: jml, hari });
    const r = await sebagai(pembina.id, 'select public.sg_pelantikan_catat($1, $2::date, $3, $4::uuid[], null, $5) as n', [tk, tg, tm, jml ? [siti.id] : [], ct]);
    n++;
    if ((klien === '') !== r.ok) { beda++; if (beda < 6) console.log('   beda:', { tk, tg, tm: tm?.slice(0, 12), ct: ct.slice(0, 5), jml }, 'klien:', klien || 'ok', 'server:', r.ok ? 'ok' : r.pesan); }
  }
  ok(beda === 0, `${n} kombinasi: klien menerima atau menolak sama dengan server`);
  ok(periksaPelantikan({ tingkat: 'bantara', tanggal: hari, tempat: 'A', jumlah: 201, hari }) !== '' && (await sebagai(pembina.id, 'select public.sg_pelantikan_catat($1, $2::date, $3, $4::uuid[]) as n', ['bantara', hari, 'A', Array.from({ length: 201 }, () => siti.id)])).ok === true,
    'batas 201 Penegak: klien menolak; server menghitung id kembar sekali (jadi hanya klien yang lebih ketat, tidak berbahaya)');
  await q('delete from public.pelantikan');
}

console.log('\n--- Cermin validasi Saka = sg_saka_simpan (kisi masukan) ---');
{
  const sakaL = ['Saka Bhayangkara', '', 'a<b', 'x'.repeat(61)];
  const masukL = [null, '1999-12-31', '2000-01-01', hari, await geser(1)];
  const statusL = ['aktif', 'selesai', 'lain', null];
  const selesaiL = [null, hari, '2000-01-01', await geser(1)];
  const urlL = ['', 'https://drive.example/s', 'ftp://x/y', 'https://a b', 'https://' + 'x'.repeat(500)];
  let n = 0, beda = 0;
  for (const sk of sakaL) for (const ms of masukL) for (const st of statusL) for (const sl of selesaiL) for (const ur of urlL) {
    const klien = periksaSaka({ saka: sk, tanggalMasuk: ms, status: st, tanggalSelesai: sl, suratUrl: ur, hari });
    const r = await sebagai(pembina.id, 'select public.sg_saka_simpan(null, $1::uuid, $2, $3::date, $4, $5::date, $6, $7) as id', [dimas.id, sk, ms, st, sl, ur, '']);
    n++;
    if (r.ok) await q('delete from public.saka_anggota');
    if ((klien === '') !== r.ok) { beda++; if (beda < 6) console.log('   beda:', { sk: sk.slice(0, 10), ms, st, sl, ur: ur.slice(0, 12) }, 'klien:', klien || 'ok', 'server:', r.ok ? 'ok' : r.pesan); }
  }
  ok(beda === 0, `${n} kombinasi: klien menerima atau menolak sama dengan server`);
}

console.log('\n--- Lapisan api: pemetaan dan aksi ---');
{
  let r = await pembina.a.catatPelantikan({ tingkat: 'bantara', tanggal: await geser(-10), tempat: 'Lapangan Upacara', pesertaIds: [siti.id, dimas.id], catatan: 'angkatan 2026' });
  ok(r.ok && r.data === 2, 'catatPelantikan: 2 Penegak ' + (r.pesan ?? ''));
  r = await pembina.a.muatPelantikanSaka();
  ok(r.ok && r.data.pelantikan.length === 2 && r.data.pelantikan.every((x) => x.tingkat === 'bantara' && /^\d{4}-\d{2}-\d{2}$/.test(x.tanggal) && x.tempat === 'Lapangan Upacara' && x.catatan === 'angkatan 2026' && x.agendaId === null && typeof x.id === 'number'), 'muatPelantikanSaka memetakan pelantikan (tanggal teks, agendaId null, id angka)');
  r = await siti.a.muatPelantikanSaka();
  ok(r.ok && r.data.pelantikan.length === 1 && r.data.pelantikan[0].pesertaId === siti.id, 'Penegak hanya memuat pelantikan miliknya (RLS)');
  const rs = await pembina.a.simpanSaka({ pesertaId: siti.id, saka: 'Saka Bahari', tanggalMasuk: await geser(-20), suratUrl: 'https://drive.example/surat' });
  ok(rs.ok && typeof rs.data === 'number' || rs.ok, 'simpanSaka (tambah) ' + (rs.pesan ?? ''));
  r = await siti.a.muatPelantikanSaka();
  ok(r.data.saka.length === 1 && r.data.saka[0].saka === 'Saka Bahari' && r.data.saka[0].status === 'aktif' && r.data.saka[0].tanggalSelesai === null && r.data.saka[0].suratUrl === 'https://drive.example/surat', 'muatPelantikanSaka memetakan Saka');
  const idS = r.data.saka[0].id;
  r = await pembina.a.simpanSaka({ id: idS, pesertaId: siti.id, saka: 'Saka Bahari', tanggalMasuk: await geser(-20), status: 'selesai', tanggalSelesai: hari });
  ok(r.ok, 'simpanSaka (ubah) menjadi selesai');
  r = await siti.a.simpanSaka({ pesertaId: siti.id, saka: 'Saka X', tanggalMasuk: hari });
  ok(!r.ok && /Hanya Pembina dan Admin Gudep/.test(r.pesan), 'Penegak ditolak mencatat Saka lewat api');
  r = await pembina.a.hapusSaka(idS);
  ok(r.ok, 'hapusSaka');
  const idP = (await pembina.a.muatPelantikanSaka()).data.pelantikan[0].id;
  r = await pembina.a.hapusPelantikan(idP);
  ok(r.ok && (await pembina.a.muatPelantikanSaka()).data.pelantikan.length === 1, 'hapusPelantikan');
}

console.log('\n--- Tampilan (render tanpa peramban) ---');
{
  const users = [{ id: 'pb', role: 'penguji', jabatan: 'Pembina', nama: 'Pak Pembina', status: 'aktif' }, { id: 'a', role: 'peserta', nama: 'Ani', kelas: 'X-01', status: 'aktif', agama: 'Islam' }];
  const api = () => ({ muatPelantikanSaka: async () => ({ ok: true, data: { pelantikan: [], saka: [] } }), muatAgenda: async () => ({ ok: true, data: [] }) });
  const html = renderToStaticMarkup(h(KonteksApp.Provider, { value: { api, users, daftarPeserta: [users[1]], progress: {}, notify: () => {}, user: users[0] } }, h(Pelantikan)));
  ok(html.includes('Pelantikan dan Saka') && html.includes('Catat pelantikan') && html.includes('data-sumber-peraturan') && html.includes('role="tablist"'), 'halaman Pelantikan dirender dengan judul, formulir, rujukan peraturan, dan tab');
  ok(html.includes('Belum ada Penegak yang layak'), 'tanpa Penegak yang lulus SKU: pesan belum ada yang layak');
  const kartu = renderToStaticMarkup(h(KonteksApp.Provider, { value: { api, user: users[1], users } }, h(KartuPelantikanSaya)));
  ok(kartu === '', 'kartu Beranda tidak tampil selama belum ada catatan');
}

console.log(`\nRINGKASAN PELANTIKAN-KLIEN: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
