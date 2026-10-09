// Editor teks berformat untuk isi berita (Kelola Beranda > Berita): parser penanda ringan, keamanan (tanpa HTML/skrip/tautan berbahaya), aksi tombol editor,
// tampilan di beranda dan halaman berita statis, deskripsi mesin pencari, dan batas isi sama dengan server. TANPA migrasi (isi tetap teks biasa di kolom `isi`).
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { BATAS_ISI, bacaBlok, inline, paragrafPolos, terapkanAksi, terapkanTautan } from '../src/lib/teksKayaLogic.js';
import TeksKaya from '../src/components/TeksKaya.jsx';
import EditorTeksKaya from '../src/components/EditorTeksKaya.jsx';
import { Berita } from '../src/landing/bagian.jsx';
import HalamanBerita from '../src/landing/HalamanBerita.jsx';
import { deskripsiBerita } from '../src/lib/beritaStatisLogic.js';
import { periksaBerita } from '../src/lib/berandaKontenLogic.js';
import { SKEMA_BERITA } from '../src/lib/berandaKontenSkema.js';

let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const P = process.cwd().replace(/\\/g, '/');
const html = (el) => renderToStaticMarkup(el);
const tampil = (isi) => html(h(TeksKaya, { isi, kelas: 'x' }));

console.log('--- Parser: penanda ringan ---');
{
  const b = bacaBlok('Paragraf satu\nbaris dua\n\nParagraf dua');
  ok(b.length === 2 && b[0].t === 'p' && b[0].baris.length === 2 && b[1].t === 'p', 'baris kosong memisahkan paragraf; baris baru di dalam paragraf tetap satu paragraf');
  ok(bacaBlok('Teks lama tanpa penanda apa pun.').length === 1, 'teks lama tanpa penanda tetap sah (satu paragraf)');
  const j = bacaBlok('## Judul\n### Sub\nisi');
  ok(j[0].t === 'h2' && j[1].t === 'h3' && j[2].t === 'p', 'judul bagian (##), sub judul (###), lalu paragraf');
  const l = bacaBlok('- satu\n- dua\n\n1. a\n2. b\n3) c');
  ok(l[0].t === 'ul' && l[0].butir.length === 2 && l[1].t === 'ol' && l[1].butir.length === 3, 'daftar poin dan daftar bernomor digabung per butir');
  const k = bacaBlok('> kutipan satu\n> kutipan dua');
  ok(k.length === 1 && k[0].t === 'kutip' && k[0].baris.length === 2, 'kutipan beberapa baris menjadi satu blok');
  ok(bacaBlok('a\n---\nb').map((x) => x.t).join() === 'p,pemisah,p', 'tiga garis menjadi pemisah');
  ok(bacaBlok('-bukan daftar\n#bukan judul\n2020. tahun').every((x) => x.t === 'p'), 'tanpa spasi sesudah penanda atau angka tahun: tetap paragraf biasa');
  const d = bacaBlok('- satu\nlanjutan\n- dua');
  ok(d.map((x) => x.t).join() === 'ul,p,ul', 'baris biasa di antara butir memutus daftar');
  ok(bacaBlok('').length === 0 && bacaBlok(null).length === 0 && bacaBlok('   \n\n  ').length === 0, 'isi kosong: tanpa blok');
}

console.log('--- Parser: tebal, miring, tautan ---');
{
  const n = inline('a **tebal** b *miring* c [kami](https://sma.sch.id/x?y=1) d');
  ok(n.map((x) => x.t).join() === 'teks,tebal,teks,miring,teks,tautan,teks' && n[5].href === 'https://sma.sch.id/x?y=1', 'tebal, miring, dan tautan dikenali');
  ok(inline('**tebal *miring* di dalam**')[0].c.some((x) => x.t === 'miring'), 'miring di dalam tebal');
  ok(inline('[**tebal** link](https://a.id)')[0].c[0].t === 'tebal', 'tebal di dalam teks tautan');
  ok(inline('2 * 3 * 4')[0].t === 'teks' && inline('2 * 3 * 4').length === 1, 'tanda * dengan spasi (hitungan) bukan miring');
  ok(inline('**belum ditutup').map((x) => x.t).join() === 'teks', 'penanda tidak berpasangan tampil apa adanya');
  const bahaya = inline('[klik](javascript:alert(1)) [x](http://tidak-aman.id) [y](data:text/html;base64,AAA)');
  ok(bahaya.every((x) => x.t === 'teks'), 'tautan non-https (javascript:, http:, data:) TIDAK dijadikan tautan');
  ok(inline('[a [b](https://x.id)](https://y.id)').filter((x) => x.t === 'tautan').length <= 1, 'tautan tidak bersarang di dalam tautan');
}

console.log('--- Keamanan tampilan ---');
{
  const t = tampil('<script>alert(1)</script> <img src=x onerror=alert(1)> **<b>x</b>**');
  ok(!t.includes('<script') && !t.includes('<img') && t.includes('&lt;script&gt;') && t.includes('&lt;img'), 'HTML yang diketik penulis ditampilkan sebagai teks, tidak pernah menjadi elemen');
  const a = tampil('[sumber](https://sma.sch.id/a)');
  ok(a.includes('href="https://sma.sch.id/a"') && a.includes('rel="noopener noreferrer nofollow"') && a.includes('target="_blank"'), 'tautan eksternal: tab baru, noopener noreferrer nofollow');
  ok(!tampil('[x](javascript:alert(1))').includes('href='), 'javascript: tidak pernah menjadi href');
  ok(!tampil('[x](https://a.id" onclick="alert(1))').includes('onclick="'), 'kutip di alamat tidak dapat keluar dari atribut');
  const baku = html(h(TeksKaya, { isi: '' }));
  ok(baku === '', 'isi kosong: tidak menampilkan apa pun');
}

console.log('--- Tampilan blok ---');
{
  const t = tampil('## Bagian\n\nIsi *miring* dan **tebal**\n\n- a\n- b\n\n1. c\n2. d\n\n> kutip\n\n---');
  ok(t.includes('<h4') && t.includes('Bagian') && t.includes('<em>miring</em>') && t.includes('<strong'), 'judul bagian, miring, tebal');
  ok(t.includes('<ul') && t.includes('<ol') && t.includes('<li>') && t.includes('<blockquote') && t.includes('<hr'), 'daftar poin, bernomor, kutipan, pemisah');
  ok(html(h(TeksKaya, { isi: 'a\nb' })).includes('<br/>'), 'baris baru di dalam paragraf menjadi pindah baris');
}

console.log('--- Aksi tombol editor ---');
{
  let r = terapkanAksi('halo dunia', 5, 10, 'tebal');
  ok(r.nilai === 'halo **dunia**' && r.nilai.slice(r.awal, r.akhir) === 'dunia', 'tebal membungkus pilihan dan pilihan tetap dipertahankan');
  r = terapkanAksi(r.nilai, r.awal, r.akhir, 'tebal');
  ok(r.nilai === 'halo dunia' && r.nilai.slice(r.awal, r.akhir) === 'dunia', 'tebal ditekan lagi melepas penanda');
  r = terapkanAksi('', 0, 0, 'miring');
  ok(r.nilai === '*teks miring*' && r.nilai.slice(r.awal, r.akhir) === 'teks miring', 'tanpa pilihan: menyisipkan teks contoh yang langsung terpilih');
  r = terapkanAksi('x **tebal** y', 4, 9, 'miring');
  ok(r.nilai === 'x ***tebal*** y', 'miring di dalam tebal menambah penanda (tidak salah melepas tebal)');
  r = terapkanAksi('satu\ndua\ntiga', 0, 8, 'daftar');
  ok(r.nilai === '- satu\n- dua\ntiga', 'daftar poin: tiap baris yang tersentuh pilihan diberi awalan, baris lain tidak');
  r = terapkanAksi(r.nilai, r.awal, r.akhir, 'daftar');
  ok(r.nilai === 'satu\ndua\ntiga', 'daftar poin ditekan lagi melepas awalan');
  r = terapkanAksi('a\nb\nc', 0, 5, 'nomor');
  ok(r.nilai === '1. a\n2. b\n3. c', 'daftar bernomor: nomor berurutan');
  r = terapkanAksi('- a\n- b', 0, 7, 'nomor');
  ok(r.nilai === '1. a\n2. b', 'mengganti daftar poin menjadi bernomor');
  r = terapkanAksi('Judul', 2, 2, 'judul');
  ok(r.nilai === '## Judul', 'judul bagian di baris tempat kursor berada');
  r = terapkanAksi('## Judul', 0, 0, 'subjudul');
  ok(r.nilai === '### Judul', 'sub judul menggantikan judul bagian (bukan menumpuk)');
  r = terapkanAksi('kutip', 0, 5, 'kutipan');
  ok(r.nilai === '> kutip', 'kutipan');
  r = terapkanAksi('ab', 1, 1, 'pemisah');
  ok(r.nilai === 'a\n\n---\n\nb', 'garis pemisah disisipkan di kursor sebagai blok sendiri');
  ok(bacaBlok(r.nilai).map((x) => x.t).join() === 'p,pemisah,p', 'garis pemisah hasil tombol dibaca sebagai pemisah');
  const t = terapkanTautan('lihat sini ya', 6, 10, 'https://sma.sch.id/x');
  ok(t.nilai === 'lihat [sini](https://sma.sch.id/x) ya' && inline(t.nilai).some((x) => x.t === 'tautan'), 'tautan membungkus pilihan dan terbaca sebagai tautan');
  ok(terapkanTautan('a', 0, 1, 'http://tidak-aman.id') === null && terapkanTautan('a', 0, 1, 'javascript:alert(1)') === null && terapkanTautan('a', 0, 1, 'https://a.id x') === null, 'alamat bukan https atau berspasi ditolak');
  ok(terapkanAksi('abc', 0, 3, 'tidakada').nilai === 'abc', 'aksi tak dikenal tidak mengubah isi');
}

console.log('--- Editor (komponen) ---');
{
  const e = html(h(EditorTeksKaya, { id: 'konten-isi', value: 'Halo **dunia**', onChange: () => {}, baris: 10 }));
  for (const nama of ['Tebal', 'Miring', 'Judul bagian', 'Sub judul', 'Daftar poin', 'Daftar bernomor', 'Kutipan', 'Tautan', 'Garis pemisah']) {
    ok(e.includes(`aria-label="${nama}"`), `tombol "${nama}" ada dan berlabel`);
  }
  ok(e.includes('Pratinjau') && e.includes('role="tablist"') && e.includes('<textarea') && e.includes('id="konten-isi"'), 'tab Tulis/Pratinjau dan kolom teks ber-id (label formulir tetap menaut)');
  ok(e.includes(`14/${BATAS_ISI} karakter`), 'penghitung karakter (penanda ikut dihitung, batas sama dengan server)');
  ok(html(h(EditorTeksKaya, { id: 'i', value: 'x'.repeat(BATAS_ISI + 1), onChange: () => {} })).includes('font-bold text-red-700'), 'melewati batas: penghitung bertanda merah');
  const skema = SKEMA_BERITA ?? null;
  const kolom = skema?.fields?.find((f) => f.kunci === 'isi');
  ok(kolom?.jenis === 'teks-kaya', 'kolom isi berita memakai editor teks berformat');
  const src = readFileSync(`${P}/src/components/PanelKontenTinjau.jsx`, 'utf8');
  ok(src.includes("f.jenis === 'teks-kaya'") && src.includes('EditorTeksKaya'), 'formulir Kelola Beranda memasang editor untuk jenis teks-kaya');
}

console.log('--- Beranda dan halaman berita ---');
{
  const b = { kategori: 'kegiatan', judul: 'Judul', ringkasan: 'Ringkas', isi: '## Bagian\n\nIsi **tebal**\n\n- a\n- b', sampulUrl: '', terbitPada: '2026-10-02T00:00:00+07:00' };
  const k = html(h(Berita, { berita: [b] }));
  ok(k.includes('<details') && k.includes('<strong') && k.includes('<ul') && k.includes('Bagian'), 'kartu berita di beranda menampilkan isi berformat di balik "Baca selengkapnya"');
  ok(!k.includes('**') && !k.includes('## '), 'penanda tidak bocor ke tampilan');
  const lama = html(h(Berita, { berita: [{ ...b, isi: 'Paragraf lama satu.\n\nParagraf lama dua.' }] }));
  ok(lama.includes('Paragraf lama satu.') && lama.includes('Paragraf lama dua.'), 'berita lama (tanpa penanda) tetap tampil');
  const hal = html(h(HalamanBerita, { b, namaGudep: 'Gudep', alamatSitus: 'https://sigarda.smabukateja.sch.id' }));
  ok(hal.includes('<h4') && hal.includes('<strong') && hal.includes('<ul'), 'halaman berita statis menampilkan isi berformat tanpa JavaScript');
  ok(!hal.includes('**') && !hal.includes('## '), 'penanda tidak bocor ke halaman berita statis');
  ok(!hal.includes('Ditulis oleh') && html(h(HalamanBerita, { b: { ...b, penulis: 'Siti Aminah' }, namaGudep: 'Gudep', alamatSitus: 'https://sigarda.smabukateja.sch.id' })).includes('Ditulis oleh') , 'halaman berita statis menampilkan nama penulis bila ada');
  const d = deskripsiBerita({ ...b, ringkasan: '' });
  ok(d === 'Bagian' && !d.includes('#') && !d.includes('*'), 'deskripsi mesin pencari dari isi tanpa penanda: ' + d);
  ok(paragrafPolos('Isi **tebal** dan [tautan](https://a.id)').join() === 'Isi tebal dan tautan', 'teks polos tanpa penanda');
  ok(paragrafPolos('- a\n- b\n\n---').join('|') === 'a; b', 'teks polos: daftar digabung, pemisah dibuang');
}

console.log('--- Batas isi sama dengan server ---');
{
  const dasar = { kategori: 'kegiatan', judul: 'J', ringkasan: '', isi: 'x', sampulUrl: '', status: 'draf', terbitPada: '' };
  ok(periksaBerita({ ...dasar, isi: 'x'.repeat(BATAS_ISI) }).isi === undefined && periksaBerita({ ...dasar, isi: 'x'.repeat(BATAS_ISI + 1) }).isi !== undefined, `isi sampai ${BATAS_ISI} karakter sah, lebih ditolak (penanda ikut dihitung)`);
  const sql = readFileSync(`${P}/supabase/sumber/586-aksi-beranda-konten.sql`, 'utf8');
  ok(sql.includes('char_length(v_isi) > 4000') && BATAS_ISI === 4000, 'batas klien = batas server (4000)');
}

console.log(`\nRINGKASAN TEKS-KAYA: ${lulus} lulus, ${gagal} GAGAL`);
if (gagal) process.exit(1);
