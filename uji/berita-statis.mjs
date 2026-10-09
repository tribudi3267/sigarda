// Fase 4 landing page: halaman berita statis (satu HTML per berita terbit) dan sitemap dari data publik. Logika murni, fungsi server sg_berita_publik (PGlite),
// pembangun halaman (fetch palsu + folder hasil build sementara), dan penyambungan di alur build/deploy. Migrasi: uji/migrasi-berita-publik.mjs.
import { PGlite } from '@electric-sql/pglite';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { GUDEP_BAWAAN } from '../src/config.js';
import { ALAMAT_SITUS } from '../src/landing/landingData.js';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Berita } from '../src/landing/bagian.jsx';
import { ambilIndeksHalamanBerita } from '../src/lib/publikClient.js';
import { BATAS_BERITA_ARSIP, deskripsiBerita, halamanBerita, indeksHalamanBerita, jsonLdBerita, kunciBerita, pathBerita, petaHalamanBerita, slugBerita, susunBeritaArsip, susunDokumenBerita, susunSitemap, urlBerita } from '../src/lib/beritaStatisLogic.js';
import { alamatDariIndex, bangunBeritaStatis, kepalaDariIndex, panggilRpc } from '../scripts/berita-statis.mjs';

let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const P = process.cwd().replace(/\\/g, '/');

console.log('--- Logika murni ---');
{
  ok(slugBerita('Perkemahan Jumat Agung: 2026!') === 'perkemahan-jumat-agung-2026' && slugBerita('Tés Ñandú — ÉCOLE') === 'tes-nandu-ecole', 'slug: huruf kecil, tanpa tanda baca dan aksen');
  ok(slugBerita('') === 'berita' && slugBerita('!!!') === 'berita' && slugBerita(null) === 'berita', 'slug kosong menjadi "berita"');
  const panjang = slugBerita('kata '.repeat(40));
  ok(panjang.length <= 60 && !panjang.endsWith('-') && !panjang.startsWith('-'), 'slug paling panjang 60 dan tidak berujung tanda hubung');
  const b = { id: 12, judul: 'Latihan Perdana' };
  ok(pathBerita(b) === 'berita/12-latihan-perdana/' && urlBerita('https://x.id', b) === 'https://x.id/berita/12-latihan-perdana/' && urlBerita('https://x.id/', b) === 'https://x.id/berita/12-latihan-perdana/', 'alamat berdasarkan id + slug (judul berubah, id tetap)');
  const rusak = susunBeritaArsip([
    null, 'x', { id: 0, judul: 'nol', terbitPada: '2026-09-01T00:00:00Z' }, { id: 1.5, judul: 'pecahan', terbitPada: '2026-09-01T00:00:00Z' }, { id: 2, judul: '   ', terbitPada: '2026-09-01T00:00:00Z' },
    { id: 3, judul: 'tanpa tanggal' }, { id: 4, judul: 'tanggal rusak', terbitPada: 'kemarin sore' },
    { id: 5, judul: 'Sah', terbitPada: '2026-09-02T03:00:00Z', kategori: 'entah', ringkasan: 7, isi: 9, sampulUrl: 'javascript:alert(1)' },
    { id: 5, judul: 'Ganda', terbitPada: '2026-09-03T00:00:00Z' },
    { id: 6, judul: 'Sampul sah', terbitPada: '2026-09-04T00:00:00Z', diubahPada: '2026-09-05T00:00:00Z', kategori: 'pengumuman', sampulUrl: 'https://foto.test/a.jpg' },
  ]);
  ok(rusak.map((x) => x.id).join() === '5,6', 'data rusak disaring: id tidak sah, judul kosong, tanggal rusak, dan id ganda dibuang');
  ok(rusak[0].kategori === 'lainnya' && rusak[0].ringkasan === '' && rusak[0].isi === '' && rusak[0].sampulUrl === '' && rusak[0].diubahPada === rusak[0].terbitPada, 'nilai tak dikenal menjadi bawaan aman (kategori lainnya, sampul javascript: dibuang, diubah = terbit)');
  ok(rusak[1].sampulUrl === 'https://foto.test/a.jpg' && rusak[1].kategori === 'pengumuman' && rusak[1].diubahPada.startsWith('2026-09-05'), 'nilai sah dipertahankan');
  ok(susunBeritaArsip(undefined).length === 0 && susunBeritaArsip({}).length === 0, 'bukan larik = kosong');
  const banyak = susunBeritaArsip(Array.from({ length: 250 }, (_, i) => ({ id: i + 1, judul: `B${i}`, terbitPada: '2026-09-01T00:00:00Z' })));
  ok(banyak.length === BATAS_BERITA_ARSIP, `paling banyak ${BATAS_BERITA_ARSIP} berita`);
  ok(deskripsiBerita({ ringkasan: 'Ringkas saja', isi: 'Isi', judul: 'J' }) === 'Ringkas saja' && deskripsiBerita({ ringkasan: '', isi: 'Paragraf satu.\n\nDua.', judul: 'J' }) === 'Paragraf satu.' && deskripsiBerita({ ringkasan: '', isi: '', judul: 'Judul saja' }) === 'Judul saja', 'deskripsi: ringkasan, lalu paragraf pertama, lalu judul');
  const d = deskripsiBerita({ ringkasan: 'kata '.repeat(100), isi: '', judul: 'J' });
  ok(d.length <= 160 && d.endsWith('...'), 'deskripsi dipotong di batas kata, paling panjang 160');
  const ld = jsonLdBerita({ id: 1, judul: 'X'.repeat(200), ringkasan: 'r', isi: '', kategori: 'kegiatan', terbitPada: '2026-09-01T00:00:00.000Z', diubahPada: '2026-09-02T00:00:00.000Z' }, { url: 'https://x.id/berita/1-x/', alamatSitus: 'https://x.id', namaGudep: 'Gudep Uji', gambar: '' });
  ok(ld['@type'] === 'NewsArticle' && ld.headline.length === 110 && ld.author['@type'] === 'Organization' && ld.publisher.name === 'Gudep Uji' && !('image' in ld) && ld.articleSection === 'Kegiatan', 'JSON-LD NewsArticle: judul dipotong 110, penulis dan penerbit = organisasi (bukan orang), tanpa gambar bila tidak ada');
  const sm = susunSitemap('https://x.id', [{ id: 1, judul: 'A & B', diubahPada: '2026-09-02T23:00:00.000Z' }]);
  ok(sm.startsWith('<?xml') && sm.includes('<loc>https://x.id/</loc>') && sm.includes('<loc>https://x.id/berita/1-a-b/</loc>') && sm.includes('<lastmod>2026-09-02</lastmod>') && sm.includes('http://www.sitemaps.org/schemas/sitemap/0.9'), 'sitemap: halaman muka, berita, lastmod, dan ruang nama sah');
  ok(susunSitemap('https://x.id', []).match(/<url>/g).length === 1, 'sitemap tanpa berita hanya memuat halaman muka');
}

console.log('\n--- Server: sg_berita_publik ---');
{
  const pg = new PGlite();
  await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
  await isiDataContoh(pg);
  await pg.query('update public.profiles set wajib_ganti_pin = false');
  const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { id: r.id }; };
  const pembina = await masuk('pembina', PIN_DEMO.pembina);
  const dewan = await masuk('dewan', PIN_DEMO.dewan);
  const sebagai = async (id, sql, args = []) => (await sqlSebagai(pg, id, sql, args)).rows;
  const simpan = (id, judul, status, terbit = null) => sebagai(id, "select public.sg_berita_simpan(null, 'kegiatan', $1, 'Ringkas', 'Isi lengkap', '', $2, $3::timestamptz) as id", [judul, status, terbit]).then((r) => r[0].id);
  const idLama = await simpan(pembina.id, 'Terbit lama', 'terbit', '2026-01-01T00:00:00Z');
  const idBaru = await simpan(pembina.id, 'Terbit baru', 'terbit', '2026-06-01T00:00:00Z');
  await simpan(pembina.id, 'Terjadwal depan', 'terbit', new Date(Date.now() + 200 * 864e5).toISOString());
  await simpan(pembina.id, 'Masih draf', 'draf');
  await simpan(dewan.id, 'Menunggu Pembina', 'menunggu');
  const idTolak = await simpan(dewan.id, 'Akan ditolak', 'menunggu');
  await sebagai(pembina.id, 'select public.sg_berita_tinjau($1, $2, $3)', [idTolak, 'ditolak', 'Belum layak tayang']);
  const publik = async () => (await sebagai(null, 'select public.sg_berita_publik() as d'))[0].d;
  let d = await publik();
  ok(d.map((b) => b.judul).join('|') === 'Terbit baru|Terbit lama', 'anon hanya melihat berita terbit yang sudah waktunya, terbaru dulu (draf, menunggu, ditolak, dan terjadwal masa depan tidak keluar)');
  ok(d[0].id === idBaru && d[1].id === idLama && d.every((b) => Object.keys(b).sort().join() === 'diubahPada,id,isi,judul,kategori,penulis,ringkasan,sampulUrl,terbitPada'), 'kolom hanya id, kategori, judul, ringkasan, isi, sampulUrl, penulis, terbitPada, diubahPada');
  ok(!/dibuat|ditinjau|catatan|status|Menunggu Pembina|Akan ditolak|Belum layak/i.test(JSON.stringify(d)), 'tidak ada penulis, peninjau, catatan tinjauan, atau berita yang belum terbit');
  const beranda = (await sebagai(null, 'select public.sg_beranda_publik() as d'))[0].d;
  ok(beranda.berita.map((b) => b.judul).join() === d.map((b) => b.judul).join() && beranda.berita.every((b, i) => b.isi === d[i].isi), 'isi sama dengan yang tampil di halaman muka (sg_beranda_publik)');
  await pg.query(`insert into public.beranda_berita (kategori, judul, isi, status, terbit_pada) select 'lainnya', 'Massal ' || g, 'Isi', 'terbit', '2026-02-01T00:00:00Z'::timestamptz + (g || ' minutes')::interval from generate_series(1, 230) g`);
  d = await publik();
  ok(d.length === 200 && d[0].id === idBaru, 'paling banyak 200 berita, yang terbaru dipertahankan');
  const haknya = (await pg.query(`select grantee from information_schema.role_routine_grants where routine_name = 'sg_berita_publik' and privilege_type = 'EXECUTE' and grantee in ('anon', 'authenticated', 'public')`)).rows.map((r) => r.grantee).sort().join();
  ok(haknya === 'anon,authenticated', 'dapat dijalankan anon dan authenticated saja (bukan public)');
}

console.log('\n--- Pembangun halaman statis (fetch palsu, folder hasil build sementara) ---');
{
  const akarUji = `${P}/.uji/tmp/berita-statis`;
  rmSync(akarUji, { recursive: true, force: true });
  const siapkanDist = (nama, html) => { const d = `${akarUji}/${nama}`; mkdirSync(d, { recursive: true }); writeFileSync(`${d}/index.html`, html); return d; };
  const INDEX = `<!doctype html><html><head><link rel="canonical" href="https://situs.uji/" /><link rel="icon" type="image/svg+xml" href="/favicon.svg" /><script type="module" crossorigin src="/assets/index-abc.js"></script><link rel="stylesheet" crossorigin href="/assets/index-abc.css"></head><body><div id="root"></div></body></html>`;
  ok(alamatDariIndex(INDEX) === 'https://situs.uji/' && alamatDariIndex('<html></html>') === null, 'alamat utama dibaca dari canonical index.html');
  ok(kepalaDariIndex(INDEX).includes('href="/assets/index-abc.css"') && kepalaDariIndex(INDEX).includes('rel="icon"') && !kepalaDariIndex(INDEX).includes('<script'), 'tag gaya dan ikon diambil dari index.html, tanpa skrip aplikasi');

  const berita = [
    { id: 7, kategori: 'kegiatan', judul: 'Perkemahan <b>Jumat</b> "Agung" & seru', ringkasan: 'Ringkas </script><script>alert(1)</script>', isi: 'Paragraf satu <img src=x onerror=alert(2)>.\n\nParagraf dua.', sampulUrl: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view?usp=sharing', terbitPada: '2026-09-20T03:00:00Z', diubahPada: '2026-09-21T03:00:00Z' },
    { id: 8, kategori: 'pengumuman', judul: 'Pengumuman tanpa sampul', ringkasan: '', isi: 'Isi pengumuman.', sampulUrl: '', terbitPada: '2026-09-10T03:00:00Z', diubahPada: '2026-09-10T03:00:00Z' },
  ];
  const palsu = (peta) => async (u) => {
    const nama = /rpc\/([a-z_]+)$/.exec(u)?.[1];
    const r = peta[nama];
    if (r === 'galat') throw new Error('jaringan putus');
    if (typeof r === 'number') return { ok: false, status: r, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => r };
  };
  const dist = siapkanDist('lengkap', INDEX);
  const h = await bangunBeritaStatis({ dist, akar: P, url: 'https://proyek.supabase.co', kunci: 'kunci-anon', ambil: palsu({ sg_berita_publik: berita, sg_gudep_publik: { nama: 'Gugus Depan Uji', sekolah: 'SMA Uji', kota: 42 } }) });
  ok(h.jumlah === 2 && /2 halaman berita/.test(h.pesan), 'dua halaman berita dibuat: ' + h.pesan);
  const p7 = readFileSync(`${dist}/berita/7-perkemahan-b-jumat-b-agung-seru/index.html`, 'utf8');
  ok(existsSync(`${dist}/berita/8-pengumuman-tanpa-sampul/index.html`), 'folder berita/<id>-<slug>/index.html untuk tiap berita');
  ok(p7.includes('<link rel="canonical" href="https://situs.uji/berita/7-perkemahan-b-jumat-b-agung-seru/" />') && p7.includes('<meta name="robots" content="index, follow" />') && p7.includes('lang="id"'), 'canonical mengarah ke alamat berita sendiri dan halaman boleh diindeks');
  ok(p7.includes('href="/assets/index-abc.css"') && !p7.includes('/assets/index-abc.js'), 'memakai CSS situs, tanpa JavaScript aplikasi');
  ok(!/<script>alert|<img src=x|<b>Jumat/.test(p7) && p7.includes('&lt;b&gt;Jumat&lt;/b&gt;') && p7.includes('onerror=alert(2)&gt;'), 'judul, ringkasan, dan isi di-escape (bukan HTML)');
  const jsonLd = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(p7)[1];
  const ld = JSON.parse(jsonLd);
  ok(ld['@type'] === 'NewsArticle' && ld.mainEntityOfPage['@id'] === 'https://situs.uji/berita/7-perkemahan-b-jumat-b-agung-seru/' && ld.publisher.name === 'Gugus Depan Uji', 'JSON-LD sah dan menyebut penerbit dari data gudep publik');
  ok(!jsonLd.includes('</') && (p7.match(/<script/g) ?? []).length === 2, 'isi tidak dapat menutup tag skrip JSON-LD (hanya dua tag skrip: JSON-LD dan skrip tetap panah ke atas)');
  {
    const skrip = p7.slice(p7.indexOf('<script>') + 8, p7.indexOf('</script>', p7.indexOf('<script>')));
    ok(skrip.includes("getElementById('ke-atas')") && !/alert|Jumat|Perkemahan/.test(skrip), 'skrip panah ke atas tetap (tidak memuat isi berita) dan hanya menyentuh #ke-atas');
    const bar = p7.indexOf('<div class="sticky top-0 z-40"><header');
    const dalam = bar >= 0 ? p7.slice(bar, p7.indexOf('<main')) : '';
    ok(bar >= 0 && dalam.includes('</header><nav aria-label="Jejak halaman"') && dalam.includes('← Semua berita</a>') && dalam.endsWith('</nav></div>'), 'header dan bilah "← Semua berita" berada dalam satu pembungkus sticky top-0 (tetap terlihat saat menggulir sampai akhir)');
    ok(dalam.includes('href="https://situs.uji/#berita"'), 'tombol "Semua berita" menuju bagian berita di halaman muka (alamat utama)');
    ok(p7.includes('id="atas"') && p7.includes('<a id="ke-atas" href="#atas" aria-label="Kembali ke atas"'), 'panah ke atas: tautan #atas yang tetap berfungsi tanpa JavaScript');
    const sku = readFileSync(P + '/src/components/ProgresKotak.jsx', 'utf8');
    const kelasSku = sku.slice(sku.indexOf('className="no-print fixed') + 11).split('"')[0];
    const kelasBerita = p7.slice(p7.indexOf('<a id="ke-atas"')).split('class="')[1].split('"')[0];
    const tanpaPosisi = (k) => k.split(' ').filter((c) => !c.startsWith('bottom-') && !c.startsWith('md:bottom-')).sort().join(' ');
    ok(kelasSku.startsWith('no-print fixed') && tanpaPosisi(kelasSku) === tanpaPosisi(kelasBerita), 'panah ke atas: kelas (ukuran, warna, cincin emas, bayangan, z-index) SAMA dengan TombolKeAtas di halaman butir SKU dan SPG; hanya jarak bawah tanpa menu ponsel');
    ok(p7.includes('<polyline points="5 12 12 5 19 12"></polyline>') && p7.includes('<line x1="12" y1="19" x2="12" y2="5">'), 'ikon panah ke atas: gambar yang sama dengan ikon panahAtas aplikasi');
  }
  ok(ld.image[0] === 'https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUv=w1000' && p7.includes('property="og:image" content="https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUv=w1000"'), 'sampul Google Drive diubah ke alamat gambar langsung untuk JSON-LD dan Open Graph');
  const p8 = readFileSync(`${dist}/berita/8-pengumuman-tanpa-sampul/index.html`, 'utf8');
  ok(p8.includes('property="og:image" content="https://situs.uji/og-gudep.png"') && !('image' in JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(p8)[1])), 'tanpa sampul: Open Graph memakai og-gudep.png; JSON-LD tanpa gambar');
  ok(p7.includes('href="https://situs.uji/#berita"') && p7.includes('href="https://situs.uji/#masuk"') && p7.includes('wa.me/?text='), 'tautan kembali, Masuk, dan Bagikan memakai alamat utama (jalan dari alamat bersarang)');
  const pribadi = [GUDEP_BAWAAN.pembina.nama, GUDEP_BAWAAN.pembina.nta, 'NTA', 'NIP'].filter(Boolean);
  ok(pribadi.every((x) => !p7.includes(x) && !p8.includes(x)), 'tidak ada nama Pembina, NTA, atau NIP di halaman berita');
  const sm = readFileSync(`${dist}/sitemap.xml`, 'utf8');
  ok(sm.includes('<loc>https://situs.uji/</loc>') && sm.includes('/berita/7-perkemahan-b-jumat-b-agung-seru/') && sm.includes('/berita/8-pengumuman-tanpa-sampul/') && sm.includes('<lastmod>2026-09-21</lastmod>'), 'sitemap.xml ditulis ulang memuat halaman muka dan kedua berita');

  const dGalatBerita = siapkanDist('galat-berita', INDEX);
  for (const [nama, peta] of [['jaringan putus', { sg_berita_publik: 'galat' }], ['migrasi belum dijalankan (404)', { sg_berita_publik: 404 }]]) {
    const r = await bangunBeritaStatis({ dist: dGalatBerita, url: 'https://proyek.supabase.co', kunci: 'k', ambil: palsu(peta) });
    ok(r.jumlah === 0 && /dilewati/.test(r.pesan) && !existsSync(`${dGalatBerita}/berita`) && !existsSync(`${dGalatBerita}/sitemap.xml`), `${nama}: dilewati tanpa galat, tanpa halaman, sitemap bawaan tidak diganti`);
  }
  ok(/migrasi 2026-09-berita-publik\.sql/.test((await bangunBeritaStatis({ dist: dGalatBerita, url: 'https://p.co', kunci: 'k', ambil: palsu({ sg_berita_publik: 404 }) })).pesan), 'pesan galat menuntun ke migrasi yang harus dijalankan');
  const dKosong = siapkanDist('kosong', INDEX);
  const rk = await bangunBeritaStatis({ dist: dKosong, url: 'https://p.co', kunci: 'k', ambil: palsu({ sg_berita_publik: [] }) });
  ok(rk.jumlah === 0 && existsSync(`${dKosong}/sitemap.xml`) && !existsSync(`${dKosong}/berita`), 'tanpa berita terbit: hanya sitemap (halaman muka), tanpa folder berita');
  const dRusak = siapkanDist('rusak', INDEX);
  const rr = await bangunBeritaStatis({ dist: dRusak, url: 'https://p.co', kunci: 'k', ambil: palsu({ sg_berita_publik: { bukan: 'larik' } }) });
  ok(rr.jumlah === 0 && !existsSync(`${dRusak}/berita`), 'jawaban server rusak: tanpa halaman berita');
  const tanpaKunci = await bangunBeritaStatis({ dist: dKosong, url: '', kunci: '' });
  ok(tanpaKunci.jumlah === 0 && /dilewati/.test(tanpaKunci.pesan), 'tanpa alamat/kunci Supabase: dilewati tanpa menyentuh jaringan');
  const dTanpaCanonical = siapkanDist('tanpa-canonical', '<html><head></head><body></body></html>');
  ok((await bangunBeritaStatis({ dist: dTanpaCanonical, url: 'https://p.co', kunci: 'k', ambil: palsu({ sg_berita_publik: berita }) })).jumlah === 0, 'index.html tanpa canonical: dilewati');
  const r = await panggilRpc({ url: 'https://p.co///', kunci: 'K', nama: 'sg_x', ambil: async (u, o) => ({ ok: true, status: 200, json: async () => ({ u, k: o.headers.apikey, m: o.method }) }) });
  ok(r.ok && r.data.u === 'https://p.co/rest/v1/rpc/sg_x' && r.data.k === 'K' && r.data.m === 'POST', 'panggilRpc: alamat RPC dirapikan, kunci anon di header');
  rmSync(akarUji, { recursive: true, force: true });
}

console.log('\n--- Kartu berita menaut ke halamannya hanya bila halaman itu ada ---');
{
  ok(kunciBerita('Judul  A', '2026-09-20T03:00:00+00:00') === kunciBerita('Judul A', '2026-09-20T03:00:00.000Z'), 'kunci sama untuk format waktu berbeda (sg_beranda_publik vs arsip) dan spasi ganda');
  ok(kunciBerita('A', '2026-09-20T03:00:00Z') !== kunciBerita('A', '2026-09-20T04:00:00Z') && kunciBerita('A', 'x') !== kunciBerita('B', 'x'), 'judul atau waktu terbit berbeda = kunci berbeda');
  const indeks = [
    { path: 'berita/7-latihan-perdana/', judul: 'Latihan Perdana', terbitPada: '2026-09-20T03:00:00.000Z' },
    { path: 'https://jahat.example/', judul: 'Luar', terbitPada: '2026-09-20T03:00:00Z' }, { path: '../rahasia/', judul: 'Naik', terbitPada: '2026-09-20T03:00:00Z' },
    { path: 'berita/x-tanpa-id/', judul: 'Tanpa id', terbitPada: '2026-09-20T03:00:00Z' }, { path: 'berita/8-a/../../', judul: 'Menyusup', terbitPada: '2026-09-20T03:00:00Z' },
    { path: 'javascript:alert(1)', judul: 'Skrip', terbitPada: '2026-09-20T03:00:00Z' }, { path: 'berita/9-waktu-rusak/', judul: 'Waktu rusak', terbitPada: 'kemarin' }, null, 'x', { path: 5, judul: 'A' },
  ];
  const peta = petaHalamanBerita(indeks);
  ok(Object.keys(peta).length === 1 && peta[kunciBerita('Latihan Perdana', '2026-09-20T03:00:00Z')] === 'berita/7-latihan-perdana/', 'hanya alamat berita/<id>-<slug>/ yang sah diterima; alamat luar, naik folder, javascript:, tanpa id, dan waktu rusak dibuang');
  ok(Object.keys(petaHalamanBerita({ bukan: 'larik' })).length === 0 && Object.keys(petaHalamanBerita(null)).length === 0, 'indeks yang bukan larik = peta kosong');
  ok(halamanBerita(peta, { judul: 'Latihan Perdana', terbitPada: '2026-09-20T03:00:00+00:00' }) === 'berita/7-latihan-perdana/', 'berita dicocokkan lewat judul dan waktu terbit');
  ok(halamanBerita(peta, { judul: 'Latihan Perdana (revisi)', terbitPada: '2026-09-20T03:00:00Z' }) === '' && halamanBerita(peta, { judul: 'Latihan Perdana', terbitPada: 'rusak' }) === '' && halamanBerita({}, { judul: 'A', terbitPada: '2026-09-20T03:00:00Z' }) === '', 'judul berubah, waktu rusak, atau tanpa peta = tanpa tautan (bukan tautan ke alamat yang belum ada)');

  const jawab = (isi, status = 200) => async (u) => { jawab.terakhir = u; return { ok: status < 400, status, json: async () => isi }; };
  ok((await ambilIndeksHalamanBerita({ ambil: jawab([{ path: 'berita/1-a/' }]), dasar: '/sigarda/' })).length === 1 && jawab.terakhir === '/sigarda/berita/index.json', 'indeks diambil dari berita/index.json di alamat dasar situs');
  ok((await ambilIndeksHalamanBerita({ ambil: jawab({}, 404) })).length === 0 && (await ambilIndeksHalamanBerita({ ambil: jawab({ bukan: 'larik' }) })).length === 0 && (await ambilIndeksHalamanBerita({ ambil: async () => { throw new Error('putus'); } })).length === 0, '404, isi bukan larik, dan jaringan putus = indeks kosong tanpa galat');
  ok((await ambilIndeksHalamanBerita({ ambil: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bukan JSON (mis. halaman HTML pengganti)'); } }) })).length === 0, 'jawaban yang bukan JSON (mis. HTML pengganti pada mode lokal) = indeks kosong');

  const dua = [
    { kategori: 'kegiatan', judul: 'Latihan Perdana', ringkasan: '', isi: '', sampulUrl: '', terbitPada: '2026-09-20T03:00:00+00:00' },
    { kategori: 'kegiatan', judul: 'Berita Baru', ringkasan: '', isi: '', sampulUrl: '', terbitPada: '2026-09-27T03:00:00+00:00' },
  ];
  const dengan = renderToStaticMarkup(h(Berita, { berita: dua, halaman: peta }));
  ok((dengan.match(/Halaman berita/g) ?? []).length === 1 && dengan.includes('href="./berita/7-latihan-perdana/"'), 'hanya kartu yang halamannya ada yang menaut ("Halaman berita"); berita baru tanpa halaman tidak menaut');
  const wa = [...dengan.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"/g)].map((m) => decodeURIComponent(/text=(.*)$/.exec(m[1].replace(/&amp;/g, '&'))[1]));
  ok(wa[0] === `Latihan Perdana\n${ALAMAT_SITUS}berita/7-latihan-perdana/` && wa[1] === `Berita Baru\n${ALAMAT_SITUS}#berita`, 'bagikan WhatsApp memakai alamat halaman berita bila ada; bila belum, alamat bagian #berita');
  ok(!renderToStaticMarkup(h(Berita, { berita: dua })).includes('Halaman berita'), 'tanpa indeks (bawaan) tidak ada tautan halaman berita');

  const akarUji = `${P}/.uji/tmp/berita-indeks`;
  rmSync(akarUji, { recursive: true, force: true });
  mkdirSync(akarUji, { recursive: true });
  writeFileSync(`${akarUji}/index.html`, '<html><head><link rel="canonical" href="https://situs.uji/" /></head><body></body></html>');
  const arsip = [{ id: 7, kategori: 'kegiatan', judul: 'Latihan Perdana', ringkasan: '', isi: 'Isi.', sampulUrl: '', terbitPada: '2026-09-20T03:00:00Z', diubahPada: '2026-09-20T03:00:00Z' }];
  const palsu = (b) => async (u) => ({ ok: true, status: 200, json: async () => (/sg_berita_publik$/.test(u) ? b : {}) });
  await bangunBeritaStatis({ dist: akarUji, akar: P, url: 'https://p.co', kunci: 'k', ambil: palsu(arsip) });
  const dariBuild = JSON.parse(readFileSync(`${akarUji}/berita/index.json`, 'utf8'));
  ok(dariBuild.length === 1 && existsSync(`${akarUji}/${dariBuild[0].path}index.html`), 'build menulis berita/index.json yang menunjuk halaman yang benar-benar ada');
  ok(halamanBerita(petaHalamanBerita(dariBuild), dua[0]) === dariBuild[0].path && halamanBerita(petaHalamanBerita(dariBuild), dua[1]) === '', 'alur utuh: indeks dari build dicocokkan dengan berita bentuk sg_beranda_publik (format waktu berbeda) tanpa salah cocok');
  ok(JSON.stringify(dariBuild) === JSON.stringify(indeksHalamanBerita(susunBeritaArsip(arsip))), 'isi indeks = indeksHalamanBerita dari arsip bersih');
  rmSync(akarUji, { recursive: true, force: true });
  mkdirSync(akarUji, { recursive: true });
  writeFileSync(`${akarUji}/index.html`, '<html><head><link rel="canonical" href="https://situs.uji/" /></head><body></body></html>');
  await bangunBeritaStatis({ dist: akarUji, akar: P, url: 'https://p.co', kunci: 'k', ambil: palsu([]) });
  ok(!existsSync(`${akarUji}/berita/index.json`), 'tanpa berita terbit: tidak ada berita/index.json (halaman muka memperlakukannya sebagai kosong)');
  rmSync(akarUji, { recursive: true, force: true });

  const hook = readFileSync(`${P}/src/landing/useBerandaPublik.js`, 'utf8');
  const landing = readFileSync(`${P}/src/landing/Landing.jsx`, 'utf8');
  ok(/Promise\.all\(\[panggil\('sg_beranda_publik'\), ambilIndeks\(\)\]\)/.test(hook) && /petaHalamanBerita\(indeks\)/.test(hook) && /halaman=\{beranda\.halaman\}/.test(landing), 'halaman muka memuat indeks bersama data beranda (satu gelombang, tanpa menunda tampilan) dan meneruskannya ke bagian Berita');
}

console.log('\n--- Penyambungan di alur build dan deploy ---');
{
  const deploy = readFileSync(`${P}/.github/workflows/deploy.yml`, 'utf8');
  const vite = readFileSync(`${P}/vite.config.js`, 'utf8');
  ok(!/^\s*schedule:/m.test(deploy) && /terbit-ulang\.sql/.test(deploy), 'deploy: TANPA jadwal harian (keputusan pemilik); terbit ulang dipicu basis data saat berita terbit (29-terbit-ulang.sql)');
  ok(/workflow_dispatch:/.test(deploy) && /SIGARDA_BERITA_STATIS: '1'/.test(deploy.slice(deploy.indexOf('npm run build'))), 'deploy: dapat dijalankan manual; SIGARDA_BERITA_STATIS=1 hanya pada langkah build');
  ok(/process\.env\.SIGARDA_BERITA_STATIS === '1'/.test(vite) && /mode !== 'lokal'/.test(vite.slice(vite.indexOf('beritaStatis(command'))), 'vite: pembuat halaman berita hanya aktif bila SIGARDA_BERITA_STATIS=1 dan bukan mode lokal (uji dan profil tidak menyentuh jaringan)');
  ok(/catch \(e\)/.test(vite.slice(vite.indexOf('closeBundle'))) && /::warning::/.test(vite), 'vite: galat pembuat halaman berita hanya peringatan, tidak menggagalkan build');
  ok(ALAMAT_SITUS.startsWith('https://') && readFileSync(`${P}/index.html`, 'utf8').includes(`<link rel="canonical" href="${ALAMAT_SITUS}" />`), 'alamat utama pada index.html (dipakai sebagai alamat semua halaman berita) sama dengan ALAMAT_SITUS');
  ok(/Sitemap: /.test(readFileSync(`${P}/public/robots.txt`, 'utf8')) && !/Disallow: \/berita/.test(readFileSync(`${P}/public/robots.txt`, 'utf8')), 'robots.txt menunjuk sitemap dan tidak melarang /berita/');
}

console.log(`\nRINGKASAN BERITA-STATIS: ${lulus} lulus, ${gagal} GAGAL.`);
if (gagal) process.exit(1);
