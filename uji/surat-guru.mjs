// Tahap 3 (H1): templat surat keterangan guru. Cermin klien periksaTemplat DIBANDINGKAN LANGSUNG dengan sg_dokumen_templat_simpan; daftar jenis = batasan check tabel;
// pemilihan templat per tahun ajaran; baris cetak; dokumen cetak surat dan Portofolio format Kwarcab dengan isian data diri.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { INDEKS_SURAT, PITA_BAWAAN, SURAT_GURU } from '../src/data/suratGuruData.js';
import { barisSurat, formDariIsi, isiDariForm, periksaTemplat, pitaSurat, templatBerlaku } from '../src/lib/suratGuruLogic.js';
import SuratKeteranganGuru from '../src/components/SuratKeteranganGuru.jsx';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const pembina = await (async () => { const a = buatApi(buatKlienFake(pg)); const r = await a.masuk('pembina', PIN_DEMO.pembina); return r.id; })();
const sebagai = async (sql, args = []) => { try { await sqlSebagai(pg, pembina, sql, args); return true; } catch (e) { return false; } };

console.log('--- Daftar jenis = batasan tabel ---');
const def = (await pg.query(`select pg_get_constraintdef(oid) d from pg_constraint where conrelid = 'public.dokumen_templat'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%jenis%'`)).rows[0].d;
const dariDb = [...def.matchAll(/'(surat_[a-z_]+)'/g)].map((m) => m[1]).sort();
ok(JSON.stringify(dariDb) === JSON.stringify(SURAT_GURU.map((s) => s.id).sort()) && SURAT_GURU.length === 8, 'delapan jenis surat di kode = batasan check jenis pada tabel dokumen_templat');
ok(SURAT_GURU.every((s) => s.spg >= 1 && s.spg <= 13 && s.penerbit && s.ujiBawaan) && SURAT_GURU.filter((s) => s.kop === 'gudep').length === 1, 'tiap surat bertaut ke butir SPG; hanya surat UU Gerakan Pramuka berkop gudep');

console.log('\n--- periksaTemplat dibandingkan dengan server ---');
const isiUji = [
  { baris: ['a'] }, { baris: [] }, { uji: 'x', baris: ['a'], pita: ['1', '2', '3'] }, { baris: ['a'], pita: null }, { baris: ['a'], pita: ['1', '2'] }, { baris: ['a'], pita: [1, 2, 3] },
  { baris: ['a'], pita: ['x'.repeat(20), 'b', 'c'] }, { baris: ['a'], pita: ['x'.repeat(21), 'b', 'c'] }, { baris: ['<a>'] }, { baris: [''] }, { baris: ['  '] }, { baris: [5] },
  { baris: ['x'.repeat(300)] }, { baris: ['x'.repeat(301)] }, { baris: Array.from({ length: 40 }, (_, i) => `b${i}`) }, { baris: Array.from({ length: 41 }, (_, i) => `b${i}`) },
  { uji: 'x'.repeat(200), baris: ['a'] }, { uji: 'x'.repeat(201), baris: ['a'] }, { uji: '<x>', baris: ['a'] }, { uji: 5, baris: ['a'] }, { uji: null, baris: ['a'] }, { uji: '', baris: ['a'] },
  { baris: 'a' }, { uji: 'x' }, {}, { baris: ['a'], lain: 1 }, { baris: ['# Judul', 'butir'] }, [], null,
];
const ta = ['2026/2027', '2025/2026', '2026/2028', '2026-2027', '26/27', '', '2026/2026', '1999/2000'];
const jenisUji = ['surat_uud', 'surat_olahraga', 'surat_lain', '', 'SURAT_UUD'];
let n = 0, beda = 0;
for (const i of isiUji) for (const t of ta.slice(0, 3)) for (const j of jenisUji.slice(0, 3)) {
  const s = await sebagai('select public.sg_dokumen_templat_simpan($1, $2, $3::jsonb)', [t, j, JSON.stringify(i)]);
  const c = periksaTemplat({ tahunAjaran: t, jenis: j, isi: i }) === '';
  n += 1;
  if (s !== c) { beda += 1; if (beda <= 6) console.log('  BEDA', t, j, JSON.stringify(i).slice(0, 60), 'server sah:', s, 'klien sah:', c); }
}
for (const t of ta) for (const j of jenisUji) {
  const s = await sebagai('select public.sg_dokumen_templat_simpan($1, $2, $3::jsonb)', [t, j, JSON.stringify({ baris: ['a'] })]);
  const c = periksaTemplat({ tahunAjaran: t, jenis: j, isi: { baris: ['a'] } }) === '';
  n += 1;
  if (s !== c) { beda += 1; console.log('  BEDA', JSON.stringify(t), JSON.stringify(j), 'server sah:', s, 'klien sah:', c); }
}
ok(beda === 0, `klien dan server sepakat pada ${n} kombinasi (tahun ajaran, jenis, isi)`);

console.log('\n--- Pemilihan templat, baris, formulir ---');
const daftar = [
  { id: 1, tahunAjaran: '2025/2026', jenis: 'surat_uud', isi: { uji: '', baris: ['lama'], pita: null } },
  { id: 2, tahunAjaran: '2026/2027', jenis: 'surat_uud', isi: { uji: '', baris: ['baru'], pita: null } },
  { id: 3, tahunAjaran: '2024/2025', jenis: 'surat_seni', isi: { uji: '', baris: ['seni'], pita: null } },
];
ok(templatBerlaku(daftar, '2026/2027', 'surat_uud').templat.id === 2 && !templatBerlaku(daftar, '2026/2027', 'surat_uud').warisan, 'tahun ajaran sama: templat tahun itu');
ok(templatBerlaku(daftar, '2027/2028', 'surat_uud').templat.id === 2 && templatBerlaku(daftar, '2027/2028', 'surat_uud').warisan, 'tahun ajaran baru: memakai templat terdekat sebelumnya (warisan)');
ok(templatBerlaku(daftar, '2025/2026', 'surat_uud').templat.id === 1, 'tahun ajaran lama tidak memakai templat yang lebih baru');
ok(templatBerlaku(daftar, '2023/2024', 'surat_uud') === null && templatBerlaku(daftar, '2026/2027', 'surat_tik') === null, 'tanpa templat: null');
let b = barisSurat({ baris: ['satu', 'dua'] });
ok(b.length === 2 && b[0].no === 1 && b[1].no === 2 && b[0].jenis === 'butir', 'tanpa judul: butir bernomor urut');
b = barisSurat({ baris: ['# Word', 'margin', 'spasi', '# Excel', 'rumus'] });
ok(b.map((x) => `${x.jenis}:${x.no}`).join() === 'judul:1,butir:,butir:,judul:2,butir:' && b[0].teks === 'Word', 'dengan judul kelompok: judul bernomor, butir tidak');
b = barisSurat(null);
ok(b.length === 7 && b.every((x) => x.jenis === 'kosong') && b[6].no === 7, 'templat kosong: tujuh baris kosong bernomor (seperti lembar Kwarcab)');
ok(pitaSurat(null).join() === PITA_BAWAAN.join() && pitaSurat({ pita: ['a', 'b', 'c'] }).join() === 'a,b,c' && pitaSurat({ pita: ['a'] }).join() === PITA_BAWAAN.join(), 'pita: bawaan bila tidak tiga');
const isi = isiDariForm({ uji: '  topik  ', rubrik: 'a\n\n  b  \r\nc', pita: ['', '', ''] });
ok(JSON.stringify(isi) === JSON.stringify({ baris: ['a', 'b', 'c'], uji: 'topik' }), 'isiDariForm: baris kosong dibuang, spasi dirapikan, pita kosong tidak dikirim');
ok(isiDariForm({ rubrik: 'a', pita: ['x', '', ''] }).pita.length === 3, 'pita dikirim bila salah satu terisi');
const fm = formDariIsi({ uji: 'u', baris: ['a', 'b'], pita: ['1', '2', '3'] });
ok(fm.rubrik === 'a\nb' && fm.uji === 'u' && fm.pita.join() === '1,2,3' && formDariIsi(null).pita.join() === ',,', 'formDariIsi: kebalikannya');

console.log('\n--- Dokumen surat ---');
const peserta = { id: 'p1', nama: 'Siti Aminah', kelas: 'XI-01', sangga: 'Sangga Elang' };
const surat = (jenis, isiSurat) => renderToStaticMarkup(h(SuratKeteranganGuru, { jenis, peserta, isi: isiSurat, tahun: '2026', hari: '2026-09-25' }));
let a = surat('surat_uud', { uji: '', baris: ['Hafal pembukaan', 'Hafal pasal'], pita: ['Cukup 60 - 70', 'Baik 70 - 85', 'Sangat Baik 85 - 100'] });
ok(a.includes('SURAT KETERANGAN') && a.includes('Guru PPKN') && a.includes('Siti Aminah') && a.includes('XI-01') && a.includes('memahami UUD 1945'), 'surat UUD: penerbit, nama, kelas, topik bawaan');
ok(a.includes('Hafal pembukaan') && a.includes('Hafal pasal') && a.includes('Sangat Baik 85 - 100'), 'rubrik dan pita dari templat tercetak');
ok(a.includes('Kepala Sekolah') && !a.includes('Sangga Elang'), 'surat sekolah: tanda tangan Kepala Sekolah, tanpa sangga');
a = surat('surat_uu_pramuka', null);
ok(a.includes('Ketua Gugus Depan') && a.includes('Ka. Mabigus') && a.includes('Sangga Elang') && a.includes('Ambalan') && a.includes('GERAKAN PRAMUKA'), 'surat gudep: kop gudep, sangga dan ambalan, tanda tangan Ketua Gudep dan Ka. Mabigus');
ok(a.includes('Rubrik surat ini belum diisi') && (a.match(/<tr class="h-7/g) ?? []).length === 7, 'templat kosong: tujuh baris kosong dan catatan (hanya di layar)');
ok(a.includes('no-print') && a.includes('Cukup') && a.includes('Sangat Baik'), 'pita bawaan dipakai bila templat kosong');
a = surat('surat_tik', { uji: 'penggunaan MS Word dan Excel', baris: ['# Word', 'Margin'] });
ok(a.includes('penggunaan MS Word dan Excel') && a.includes('bg-pramuka-50 font-semibold'), 'topik dari templat dan baris judul kelompok');
ok(SURAT_GURU.every((s) => surat(s.id, null).includes(INDEKS_SURAT[s.id].penerbit)), 'kedelapan surat dapat dicetak');

console.log(`RINGKASAN SURAT-GURU: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
