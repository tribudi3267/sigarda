/**
 * HALAMAN BERITA STATIS (murni, tanpa React): satu halaman HTML sungguhan per berita terbit, dibuat saat build (scripts/berita-statis.mjs) supaya berita
 * punya alamat tetap yang dapat dibuka, dibagikan, dan dibaca mesin pencari tanpa menunggu JavaScript. Data dari sg_berita_publik (tanpa login).
 * Alamat = berita/<id>-<slug>/ : id membuat alamat stabil walau judul diubah (slug hanya penyedap). Tanpa nama penulis atau data anggota.
 */
import { rapikan, tautanSah, urlGambar } from './berandaLogic';
import { paragrafPolos } from './teksKayaLogic';
import { KATEGORI_BERITA, LABEL_KATEGORI_BERITA } from './berandaKontenLogic';

export const BATAS_BERITA_ARSIP = 200;

/** Huruf kecil, tanpa tanda baca dan aksen, dipisah tanda hubung, paling panjang 60 karakter; kosong menjadi "berita". */
export function slugBerita(judul) {
  const s = String(judul ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return s || 'berita';
}

/** Alamat relatif dari akar situs, diakhiri garis miring. */
export const pathBerita = (b) => `berita/${b.id}-${slugBerita(b.judul)}/`;

const denganGarisMiring = (alamat) => `${String(alamat ?? '').replace(/\/+$/, '')}/`;
/** Alamat lengkap sebuah berita dari alamat utama situs. */
export const urlBerita = (alamatSitus, b) => `${denganGarisMiring(alamatSitus)}${pathBerita(b)}`;

const isoSah = (x) => { const t = Date.parse(String(x ?? '')); return Number.isFinite(t) ? new Date(t).toISOString() : ''; };

/** Bentuk jawaban sg_berita_publik yang aman dipakai, apa pun isinya (server lama, galat, data rusak): larik berita bersih, tanpa id ganda, paling banyak 200. */
export function susunBeritaArsip(mentah) {
  const lihat = new Set();
  const hasil = [];
  for (const x of Array.isArray(mentah) ? mentah : []) {
    const id = Number(x?.id);
    const judul = rapikan(typeof x?.judul === 'string' ? x.judul : '');
    const terbitPada = isoSah(x?.terbitPada);
    if (!Number.isInteger(id) || id < 1 || lihat.has(id) || !judul || !terbitPada) continue;
    lihat.add(id);
    const sampul = rapikan(typeof x?.sampulUrl === 'string' ? x.sampulUrl : '');
    hasil.push({
      id, judul, terbitPada, diubahPada: isoSah(x?.diubahPada) || terbitPada,
      kategori: KATEGORI_BERITA.includes(x?.kategori) ? x.kategori : 'lainnya',
      ringkasan: rapikan(typeof x?.ringkasan === 'string' ? x.ringkasan : ''),
      isi: typeof x?.isi === 'string' ? x.isi : '',
      sampulUrl: tautanSah(sampul) ? sampul : '',
    });
    if (hasil.length >= BATAS_BERITA_ARSIP) break;
  }
  return hasil;
}

/** Deskripsi untuk mesin pencari dan pratinjau tautan: ringkasan, atau awal isi; paling panjang 160 karakter. */
export function deskripsiBerita(b) {
  const dasar = rapikan(b.ringkasan) || rapikan(paragrafPolos(b.isi)[0] ?? '') || rapikan(b.judul);
  return dasar.length <= 160 ? dasar : `${dasar.slice(0, 157).replace(/\s+\S*$/, '')}...`;
}

/** Data terstruktur (JSON-LD) NewsArticle; penerbit dan penulis = organisasi gudep (tidak pernah nama orang). */
export function jsonLdBerita(b, { url, alamatSitus, namaGudep, gambar }) {
  const org = { '@type': 'Organization', name: namaGudep, url: denganGarisMiring(alamatSitus) };
  return {
    '@context': 'https://schema.org', '@type': 'NewsArticle', inLanguage: 'id',
    headline: b.judul.slice(0, 110), description: deskripsiBerita(b), articleSection: LABEL_KATEGORI_BERITA[b.kategori] ?? 'Berita',
    datePublished: b.terbitPada, dateModified: b.diubahPada, mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    ...(gambar ? { image: [gambar] } : {}), author: org, publisher: org,
  };
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** JSON dalam <script>: "<" dilepas supaya isi tidak dapat menutup tag skrip. */
const jsonAman = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

/**
 * Dokumen HTML utuh sebuah berita: kepala (judul, deskripsi, canonical, Open Graph, JSON-LD, gaya dari index.html hasil build) dan badan (`badanHtml`
 * dari HalamanBerita). `kepalaTambahan` = tag <link> gaya dan ikon yang diambil dari index.html.
 */
export function susunDokumenBerita({ b, badanHtml, alamatSitus, namaGudep, gambarCadangan, kepalaTambahan = '' }) {
  const url = urlBerita(alamatSitus, b);
  const sampul = urlGambar(b.sampulUrl); // tautan berbagi Drive diubah ke alamat gambar langsung (sama dengan halaman muka)
  const gambar = sampul || gambarCadangan;
  const desk = deskripsiBerita(b);
  const judulHalaman = `${b.judul} | ${namaGudep}`;
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(judulHalaman)}</title>
<meta name="description" content="${esc(desk)}" />
<link rel="canonical" href="${esc(url)}" />
<meta name="robots" content="index, follow" />
<meta property="og:type" content="article" />
<meta property="og:locale" content="id_ID" />
<meta property="og:site_name" content="${esc(namaGudep)}" />
<meta property="og:title" content="${esc(b.judul)}" />
<meta property="og:description" content="${esc(desk)}" />
<meta property="og:url" content="${esc(url)}" />
<meta property="og:image" content="${esc(gambar)}" />
<meta property="article:published_time" content="${esc(b.terbitPada)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(b.judul)}" />
<meta name="twitter:description" content="${esc(desk)}" />
<meta name="twitter:image" content="${esc(gambar)}" />
${kepalaTambahan}
<script type="application/ld+json">${jsonAman(jsonLdBerita(b, { url, alamatSitus, namaGudep, gambar: sampul }))}</script>
</head>
<body>
<div id="root">${badanHtml}</div>
</body>
</html>
`;
}

const POLA_PATH = /^berita\/[0-9]+-[a-z0-9-]+\/$/;
/** Kunci pencocokan kartu berita di halaman muka dengan halaman statisnya: judul dan waktu terbit (sg_beranda_publik tidak memuat id). */
export const kunciBerita = (judul, terbitPada) => `${rapikan(judul)}|${Date.parse(String(terbitPada ?? ''))}`;
/** Isi dist/berita/index.json: halaman yang BENAR-BENAR ada pada hasil build ini (dibaca halaman muka agar tidak menaut ke alamat yang belum ada). */
export const indeksHalamanBerita = (daftar) => daftar.map((b) => ({ path: pathBerita(b), judul: b.judul, terbitPada: b.terbitPada }));
/** Indeks dari server statis menjadi peta kunci -> alamat relatif; entri tak sah (alamat di luar berita/<id>-<slug>/, waktu rusak) dibuang. Tidak pernah melempar galat. */
export function petaHalamanBerita(indeks) {
  const peta = {};
  for (const x of Array.isArray(indeks) ? indeks : []) {
    if (!x || typeof x.path !== 'string' || !POLA_PATH.test(x.path) || typeof x.judul !== 'string' || !Number.isFinite(Date.parse(String(x.terbitPada ?? '')))) continue;
    peta[kunciBerita(x.judul, x.terbitPada)] = x.path;
  }
  return peta;
}
/** Alamat relatif halaman sebuah berita di halaman muka, atau '' bila halamannya belum ada di hasil build. */
export const halamanBerita = (peta, b) => (Number.isFinite(Date.parse(String(b?.terbitPada ?? ''))) ? peta?.[kunciBerita(b.judul, b.terbitPada)] ?? '' : '');

/** sitemap.xml: halaman muka dan setiap berita (lastmod = tanggal diubah, UTC). */
export function susunSitemap(alamatSitus, daftar) {
  const dasar = denganGarisMiring(alamatSitus);
  const baris = [`  <url>\n    <loc>${esc(dasar)}</loc>\n  </url>`];
  for (const b of daftar) baris.push(`  <url>\n    <loc>${esc(urlBerita(dasar, b))}</loc>\n    <lastmod>${b.diubahPada.slice(0, 10)}</lastmod>\n  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${baris.join('\n')}\n</urlset>\n`;
}
