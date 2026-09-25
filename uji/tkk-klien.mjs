// Tahap 2 (G2): TKK di klien. Katalog (kualitas data), logika murni (tingkat, kemajuan menuju ambang), cermin validasi yang DIBANDINGKAN LANGSUNG dengan SQL pada kisi
// masukan, lapisan api, dan render halaman. Server: uji/tkk.mjs.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { KonteksApp } from '../src/context/AppContext.jsx';
import Tkk from '../src/pages/Tkk.jsx';
import { AMBANG_TKK_BAWAAN, BIDANG_TKK, INDEKS_TKK, KATALOG_TKK, TINGKAT_TKK, tkkUntukPenegak } from '../src/data/tkkData.js';
import { hitungKemajuan, periksaAmbang, periksaCapaian, periksaKrida, pilihanTkk, teksKemajuan, tingkatBerikut, tingkatTertinggi } from '../src/lib/tkkLogic.js';
import { PERATURAN } from '../src/data/peraturanData.js';
import { susunAmbangTkk } from '../src/lib/mapDb.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

console.log('--- Katalog ---');
{
  ok(KATALOG_TKK.length === 91 && new Set(KATALOG_TKK.map((t) => t.id)).size === 91, '91 TKK, id unik');
  ok(KATALOG_TKK.filter((t) => t.sumber === 'skk-132-1979').length === 84, '84 SKK dari daftar SK 132/1979 (5 + 8 + 8 + 48 + 15 sebelum tambahan)');
  const per = (b) => KATALOG_TKK.filter((t) => t.sumber === 'skk-132-1979' && t.bidang === b).length;
  ok([per(1), per(2), per(3), per(4), per(5)].join() === '5,8,8,48,15', 'jumlah per bidang sesuai Lampiran II: 5, 8, 8, 48, 15 ' + [per(1), per(2), per(3), per(4), per(5)].join());
  ok(KATALOG_TKK.filter((t) => t.golongan === 'siaga').map((t) => t.id).join() === 'pengatur-ruangan,pengumpul,pembantu-ibu', 'tiga SKK khusus Siaga ditandai (tidak berlaku bagi Penegak)');
  ok(KATALOG_TKK.filter((t) => t.agama).map((t) => `${t.id}:${t.agama}`).join() === 'sholat:Islam,khotib:Islam,qori:Islam,muadzin:Islam', 'empat SKK bidang agama khusus Islam');
  ok(tkkUntukPenegak('Hindu').length === 84 && tkkUntukPenegak('Islam').length === 88, 'pilihan TKK: 84 untuk non-Muslim, 88 untuk Muslim');
  ok(KATALOG_TKK.every((t) => BIDANG_TKK[t.bidang] && t.nama.trim() === t.nama && t.nama.length <= 80 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(t.id) && t.id.length <= 40), 'semua TKK bidangnya dikenal, nama bersih, id sah');
  ok(AMBANG_TKK_BAWAAN.utamaWajib.length === 10 && AMBANG_TKK_BAWAAN.utamaWajib.every((id) => INDEKS_TKK[id]?.golongan === 'penegak') && AMBANG_TKK_BAWAAN.total === 45 && AMBANG_TKK_BAWAAN.madya === 3, 'ambang bawaan: 45 TKK, 3 Madya, 10 TKK wajib Utama yang ada di katalog');
  ok(periksaAmbang(AMBANG_TKK_BAWAAN) === '', 'ambang bawaan lolos pemeriksaan');
  ok(['tkk-134-1976', 'skk-132-1979', 'penabung-01-2024'].every((id) => PERATURAN[id]?.url?.startsWith('https://') && PERATURAN[id].judul), 'peraturan TKK ada di registri dengan judul dan tautan https');
  ok(TINGKAT_TKK.map((t) => t.id).join() === 'purwa,madya,utama', 'urutan tingkat');
}

console.log('\n--- Logika murni: tingkat dan kemajuan ---');
{
  const c = (tkkId, tingkat) => ({ pesertaId: 'p', tkkId, tingkat, tanggal: '2026-01-01', id: 1 });
  const wajib = AMBANG_TKK_BAWAAN.utamaWajib;
  ok(JSON.stringify(tingkatTertinggi([c('juru-masak', 'purwa'), c('juru-masak', 'madya'), c('penabung', 'purwa')])) === '{"juru-masak":"madya","penabung":"purwa"}', 'tingkat tertinggi per TKK');
  ok(tingkatBerikut([], 'juru-masak') === 'purwa' && tingkatBerikut([c('juru-masak', 'purwa')], 'juru-masak') === 'madya' && tingkatBerikut([c('juru-masak', 'madya'), c('juru-masak', 'purwa')], 'juru-masak') === 'utama' && tingkatBerikut([c('juru-masak', 'utama')], 'juru-masak') === null, 'tingkat berikutnya');
  let k = hitungKemajuan([], AMBANG_TKK_BAWAAN);
  ok(k.total === 0 && !k.penuh && k.kurang.total === 45 && k.kurang.madya === 13 && k.kurang.wajib === 10, 'tanpa capaian: kurang 45 total, 13 Madya ke atas, 10 wajib');
  // pas sesuai formulir Kwarcab: 10 wajib Utama + 3 Madya + 32 Purwa = 45
  const lain = KATALOG_TKK.filter((t) => t.golongan === 'penegak' && !t.agama && !wajib.includes(t.id)).map((t) => t.id);
  const pas = [
    ...wajib.flatMap((id) => [c(id, 'purwa'), c(id, 'madya'), c(id, 'utama')]),
    ...lain.slice(0, 3).flatMap((id) => [c(id, 'purwa'), c(id, 'madya')]),
    ...lain.slice(3, 35).map((id) => c(id, 'purwa')),
  ];
  k = hitungKemajuan(pas, AMBANG_TKK_BAWAAN);
  ok(k.total === 45 && k.utama === 10 && k.madyaKeAtas === 13 && k.penuh && k.syarat.total && k.syarat.madya && k.syarat.wajib, 'tepat 10 Utama + 3 Madya + 32 Purwa = 45: ambang terpenuhi');
  ok(teksKemajuan(k) === '45 dari 45 TKK, 10 dari 10 wajib Utama', 'teks ringkasan');
  k = hitungKemajuan(pas.filter((x) => !(x.tkkId === wajib[0] && x.tingkat === 'utama')), AMBANG_TKK_BAWAAN);
  ok(!k.penuh && !k.syarat.wajib && k.syarat.madya && k.kurang.wajib === 1 && k.kurang.madya === 0 && k.syarat.total && k.utama === 9 && k.madyaKeAtas === 13, 'satu wajib baru Madya: hanya syarat wajib Utama yang kurang (kuota Madya ke atas dan total tetap terpenuhi)');
  k = hitungKemajuan(pas.filter((x) => x.tkkId !== lain[0]), AMBANG_TKK_BAWAAN);
  ok(!k.penuh && k.kurang.total === 1 && k.kurang.madya === 1 && k.syarat.wajib, 'satu TKK Madya hilang: total dan Madya kurang satu');
  const lebih = [...pas, ...lain.slice(35, 40).map((id) => c(id, 'purwa')), c(lain[3], 'madya')];
  k = hitungKemajuan(lebih, AMBANG_TKK_BAWAAN);
  ok(k.penuh && k.total === 50 && k.madyaKeAtas === 14, 'melampaui ambang tetap terpenuhi (minimal, bukan tepat)');
  const utamaLebih = [...pas, ...lain.slice(0, 3).flatMap((id) => [c(id, 'utama')])];
  k = hitungKemajuan(utamaLebih, AMBANG_TKK_BAWAAN);
  ok(k.penuh && k.utama === 13, 'TKK bertingkat lebih tinggi ikut dihitung untuk tingkat di bawahnya');
  ok(hitungKemajuan(pas, { total: 30, madya: 0, utamaWajib: [] }).penuh, 'ambang lain (30 TKK, tanpa wajib) diikuti');
  ok(hitungKemajuan([c('tidak-dikenal', 'utama')], { total: 1, madya: 0, utamaWajib: [] }).total === 1, 'TKK di luar katalog tetap dihitung (tidak menggagalkan)');
  k = hitungKemajuan(pas, AMBANG_TKK_BAWAAN);
  ok(Object.values(k.perBidang).reduce((a, b) => a + b, 0) === 45, 'sebaran per bidang berjumlah 45');
  ok(pilihanTkk('Hindu').flatMap((b) => b.daftar).length === 84 && pilihanTkk('Islam').flatMap((b) => b.daftar).length === 88 && pilihanTkk('Islam').length === 5, 'pilihan per bidang: lima kelompok, sesuai agama');
  ok(JSON.stringify(susunAmbangTkk({ total: 40, madya: 2, utamaWajib: ['a'] }, 'B')) === '{"total":40,"madya":2,"utamaWajib":["a"]}' && susunAmbangTkk({ total: 'x' }, 'B') === 'B' && susunAmbangTkk(null, 'B') === 'B' && susunAmbangTkk({ total: 1, madya: 1, utamaWajib: [1] }, 'B') === 'B', 'susunAmbangTkk: bentuk rusak atau belum ada memakai bawaan');
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
await q(`update public.profiles set agama = 'Islam' where id = $1`, [siti.id]);
await q(`update public.profiles set agama = 'Hindu' where id = $1`, [dimas.id]);
for (const id of [siti.id, dimas.id]) { await q('delete from public.sku_progress where peserta_id = $1', [id]); await q(`insert into public.sku_progress (peserta_id, sku_id, status) select p.id, u.id, 'lulus' from public.profiles p join public.sku_unit u on u.tingkat = 'Bantara' and (u.agama is null or u.agama = p.agama) where p.id = $1`, [id]); }

console.log('\n--- Cermin validasi capaian = sg_tkk_catat (kisi masukan, Penegak Islam, TKK Sholat dan Juru Masak) ---');
{
  const tkkL = ['juru-masak', 'sholat', 'pengatur-ruangan', 'tidak-ada'];
  const tingkatL = ['purwa', 'garuda'];
  const tanggalL = [null, '1999-12-31', '2000-01-01', hari, await geser(1)];
  const p1L = ['Pak Budi', '', 'a<b', 'x'.repeat(81)];
  const p2L = ['Bu Sari', 'pak  BUDI', ' '];
  const melL = ['Andi, Siaga', '', 'x'.repeat(201), 'a<b'];
  const urlL = ['', 'https://drive.example/s', 'ftp://x', 'https://a b'];
  const catL = ['', 'x'.repeat(201)];
  let n = 0, beda = 0;
  for (const tk of tkkL) for (const ti of tingkatL) for (const tg of tanggalL) for (const a of p1L) for (const b of p2L) for (const m of melL) for (const u of urlL) for (const ct of catL) {
    // kisi penuh terlalu besar: ambil kombinasi yang memvariasikan tepat satu bidang dari isian dasar yang sah, ditambah beberapa kombinasi ganda
    const dasar = { tkkId: 'juru-masak', tingkat: 'purwa', tanggal: hari, penguji1: 'Pak Budi', penguji2: 'Bu Sari', melatih: 'Andi, Siaga', buktiUrl: '', catatan: '' };
    const ubah = [tk !== 'juru-masak', ti !== 'purwa', tg !== hari, a !== 'Pak Budi', b !== 'Bu Sari', m !== 'Andi, Siaga', u !== '', ct !== ''].filter(Boolean).length;
    if (ubah > 2) continue;
    const isi = { ...dasar, tkkId: tk, tingkat: ti, tanggal: tg, penguji1: a, penguji2: b, melatih: m, buktiUrl: u, catatan: ct };
    const klien = periksaCapaian({ ...isi, agama: 'Islam', hari });
    const r = await sebagai(pembina.id, 'select public.sg_tkk_catat($1::uuid, $2, $3, $4::date, $5, $6, $7, $8, $9) as id', [siti.id, tk, ti, tg, a, b, m, u, ct]);
    n++;
    if (r.ok) await q('delete from public.tkk_capaian');
    if ((klien === '') !== r.ok) { beda++; if (beda < 6) console.log('   beda:', { tk, ti, tg, a: a.slice(0, 8), b, m: m.slice(0, 8), u: u.slice(0, 10), ct: ct.slice(0, 3) }, 'klien:', klien || 'ok', 'server:', r.ok ? 'ok' : r.pesan); }
  }
  ok(n > 150 && beda === 0, `${n} kombinasi: klien menerima atau menolak sama dengan server`);
  const agamaLain = periksaCapaian({ tkkId: 'sholat', tingkat: 'purwa', tanggal: hari, penguji1: 'a', penguji2: 'b', melatih: 'c', agama: 'Hindu', hari });
  const server = await sebagai(pembina.id, 'select public.sg_tkk_catat($1::uuid, $2, $3, $4::date, $5, $6, $7) as id', [dimas.id, 'sholat', 'purwa', hari, 'a', 'b', 'c']);
  ok(agamaLain !== '' && !server.ok && /khusus penganut agama Islam/.test(server.pesan) && /khusus penganut agama Islam/.test(agamaLain), 'TKK khusus Islam untuk Penegak Hindu: ditolak sama di klien dan server (pesan sama)');
}

console.log('\n--- Cermin validasi Krida dan ambang = SQL (kisi masukan) ---');
{
  let n = 0, beda = 0;
  for (const nama of ['Krida Lalu Lintas', '', 'a<b', 'x'.repeat(81)]) for (const saka of ['', 'Saka Bhayangkara', 'x'.repeat(61), 'a<b']) for (const tg of [null, '1999-12-31', hari, await geser(1)]) for (const url of ['', 'https://ok/x', 'ftp://x']) for (const ct of ['', 'x'.repeat(201)]) {
    const klien = periksaKrida({ nama, saka, tanggal: tg, buktiUrl: url, catatan: ct, hari });
    const r = await sebagai(pembina.id, 'select public.sg_tkk_krida_simpan(null, $1::uuid, $2, $3, $4::date, $5, $6) as id', [siti.id, nama, saka, tg, url, ct]);
    n++;
    if (r.ok) await q('delete from public.tkk_krida');
    if ((klien === '') !== r.ok) { beda++; if (beda < 6) console.log('   beda krida:', { nama: nama.slice(0, 8), saka: saka.slice(0, 8), tg, url, ct: ct.slice(0, 3) }, klien || 'ok', r.ok ? 'ok' : r.pesan); }
  }
  ok(beda === 0, `Krida: ${n} kombinasi sama di klien dan server`);
  const wajib = AMBANG_TKK_BAWAAN.utamaWajib;
  const kasus = [
    AMBANG_TKK_BAWAAN, { total: 30, madya: 2, utamaWajib: ['penabung', 'juru-masak'] }, { total: 1, madya: 0, utamaWajib: [] }, { total: 200, madya: 100, utamaWajib: [] },
    { total: 0, madya: 0, utamaWajib: [] }, { total: 201, madya: 0, utamaWajib: [] }, { total: 40, madya: 101, utamaWajib: [] }, { total: -1, madya: 0, utamaWajib: [] }, { total: 40.5, madya: 0, utamaWajib: [] },
    { total: 40, madya: 0, utamaWajib: ['penabung', 'penabung'] }, { total: 40, madya: 0, utamaWajib: ['tidak-ada'] }, { total: 40, madya: 0, utamaWajib: ['pengatur-ruangan'] }, { total: 12, madya: 3, utamaWajib: wajib },
    { total: 13, madya: 3, utamaWajib: wajib }, { total: 40, madya: 3, utamaWajib: [7] }, { total: '40', madya: 3, utamaWajib: [] }, { total: 40, madya: 3 }, { total: 40, madya: 3, utamaWajib: [], lain: 1 }, [1, 2], null,
  ];
  let bedaA = 0;
  for (const nilai of kasus) {
    const klien = periksaAmbang(nilai);
    const r = await sebagai(pembina.id, 'select public.sg_tkk_ambang_simpan($1::jsonb)', [JSON.stringify(nilai)]);
    if ((klien === '') !== r.ok) { bedaA++; console.log('   beda ambang:', JSON.stringify(nilai)?.slice(0, 80), klien || 'ok', r.ok ? 'ok' : r.pesan); }
  }
  ok(bedaA === 0, `ambang: ${kasus.length} kasus sama di klien dan server`);
  await sebagai(pembina.id, 'select public.sg_tkk_ambang_simpan($1::jsonb)', [JSON.stringify(AMBANG_TKK_BAWAAN)]);
}

console.log('\n--- Lapisan api: pemetaan dan aksi ---');
{
  await q('delete from public.tkk_capaian'); await q('delete from public.tkk_krida');
  const t30 = await geser(-30), t10 = await geser(-10);
  let r = await pembina.a.catatTkk({ pesertaId: siti.id, tkkId: 'juru-masak', tingkat: 'purwa', tanggal: t30, penguji1: 'Pak Budi', penguji2: 'Bu Sari', melatih: 'Andi, Siaga', buktiUrl: 'https://drive.example/p' });
  ok(r.ok, 'catatTkk Purwa ' + (r.pesan ?? ''));
  r = await pembina.a.catatTkk({ pesertaId: siti.id, tkkId: 'juru-masak', tingkat: 'madya', tanggal: t10, penguji1: 'Pak Budi', penguji2: 'Bu Sari', melatih: 'Budi, Purwa' });
  ok(r.ok, 'catatTkk Madya');
  r = await pembina.a.simpanKrida({ pesertaId: siti.id, nama: 'Krida Lalu Lintas', saka: 'Saka Bhayangkara', tanggal: t10 });
  ok(r.ok, 'simpanKrida');
  r = await siti.a.muatTkk(AMBANG_TKK_BAWAAN);
  ok(r.ok && r.data.capaian.length === 2 && r.data.capaian[0].tingkat === 'madya' && r.data.capaian[1].buktiUrl === 'https://drive.example/p' && /^\d{4}-\d{2}-\d{2}$/.test(r.data.capaian[0].tanggal) && typeof r.data.capaian[0].id === 'number', 'muatTkk memetakan capaian (tanggal teks, terbaru dulu, id angka)');
  ok(r.data.krida.length === 1 && r.data.krida[0].saka === 'Saka Bhayangkara' && JSON.stringify(r.data.ambang) === JSON.stringify(AMBANG_TKK_BAWAAN) || (r.data.ambang.total === 45 && r.data.ambang.madya === 3), 'muatTkk memetakan Krida dan ambang');
  r = await dimas.a.muatTkk(AMBANG_TKK_BAWAAN);
  ok(r.ok && r.data.capaian.length === 0 && r.data.krida.length === 0, 'Penegak lain tidak memuat capaian Siti (RLS)');
  r = await siti.a.catatTkk({ pesertaId: siti.id, tkkId: 'penabung', tingkat: 'purwa', tanggal: t10, penguji1: 'a', penguji2: 'b', melatih: 'c' });
  ok(!r.ok && /Hanya Pembina dan Admin Gudep/.test(r.pesan), 'Penegak ditolak mencatat lewat api');
  r = await pembina.a.simpanAmbangTkk({ total: 30, madya: 2, utamaWajib: ['penabung'] });
  ok(r.ok, 'simpanAmbangTkk');
  r = await siti.a.muatTkk(AMBANG_TKK_BAWAAN);
  ok(r.data.ambang.total === 30 && r.data.ambang.madya === 2 && r.data.ambang.utamaWajib.join() === 'penabung', 'ambang baru dibaca Penegak');
  const idM = r.data.capaian.find((c) => c.tingkat === 'madya').id;
  r = await pembina.a.hapusTkk(idM);
  ok(r.ok, 'hapusTkk Madya');
  r = await pembina.a.hapusKrida((await siti.a.muatTkk(AMBANG_TKK_BAWAAN)).data.krida[0].id);
  ok(r.ok, 'hapusKrida');
}

console.log('\n--- Tampilan (render tanpa peramban) ---');
{
  const users = [{ id: 'pb', role: 'penguji', jabatan: 'Pembina', nama: 'Pak Pembina', status: 'aktif' }, { id: 'a', role: 'peserta', nama: 'Ani', kelas: 'X-01', status: 'aktif', agama: 'Islam' }];
  const api = () => ({ muatTkk: async () => ({ ok: true, data: { capaian: [], krida: [], ambang: AMBANG_TKK_BAWAAN } }) });
  const tampil = (user) => renderToStaticMarkup(h(KonteksApp.Provider, { value: { api, users, daftarPeserta: [users[1]], daftarPesertaSemua: [users[1]], notify: () => {}, user } }, h(Tkk)));
  const pengurus = tampil(users[0]);
  ok(pengurus.includes('Tanda Kecakapan Khusus') && pengurus.includes('data-sumber-peraturan') && pengurus.includes('role="tablist"') && pengurus.includes('Cari nama atau kelas Penegak'), 'pengurus: judul, rujukan peraturan, tab, dan pencarian Penegak');
  const penegak = tampil(users[1]);
  ok(penegak.includes('Kemajuan menuju syarat Garuda') && penegak.includes('0 dari 45') && !penegak.includes('role="tablist"') && !penegak.includes('Catat TKK'), 'Penegak: kemajuan miliknya, tanpa tab dan tanpa tombol catat');
  ok(penegak.includes('Belum ada TKK tercatat') && penegak.includes('Sudah lulus uji TKK?'), 'Penegak tanpa capaian: pesan kosong yang ramah');
}

console.log(`\nRINGKASAN TKK-KLIEN: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
