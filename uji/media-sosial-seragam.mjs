// Media sosial di halaman muka: kotak media SERAGAM (rasio 4:5) untuk semua platform dan semua keadaan (gambar pratinjau, tanpa gambar, tautan biasa, pemutar), latar
// pengganti bertuliskan platform bila tidak ada gambar, dan menu header "Media Sosial" yang hanya ada bila bagiannya dirender. Pemutaran sungguhan (iframe dibuat
// saat diketuk) diperiksa lewat kode sumber karena render statis tidak dapat mengetuk.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { MediaSosial, NavBeranda } from '../src/landing/bagian.jsx';
import { MENU, menuTampil } from '../src/landing/landingData.js';
import { GUDEP_BAWAAN } from '../src/config.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const teks = (el) => renderToStaticMarkup(el);
const banyak = (t, pola) => (t.match(pola) ?? []).length;

const KARTU = [
  { platform: 'youtube', tautan: 'https://youtu.be/dQw4w9WgXcQ', keterangan: 'Landscape', gambarUrl: '' },
  { platform: 'instagram', tautan: 'https://www.instagram.com/reel/C8xYz12AbCd/', keterangan: '', gambarUrl: '' },
  { platform: 'tiktok', tautan: 'https://www.tiktok.com/@akun/video/7669012227113995540', keterangan: '', gambarUrl: '' },
  { platform: 'instagram', tautan: 'https://www.instagram.com/p/C8xYz12AbCd/', keterangan: 'Dengan gambar', gambarUrl: 'https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456=w1000' },
  { platform: 'facebook', tautan: 'https://www.facebook.com/gudep/posts/1234567890', keterangan: 'Tegak', gambarUrl: '' },
  { platform: 'facebook', tautan: 'https://fb.watch/abcDEF/', keterangan: 'Tautan pendek', gambarUrl: '' },
];

console.log('--- Kotak media seragam ---');
{
  const t = teks(h(MediaSosial, { sosial: KARTU }));
  ok(banyak(t, /aspect-\[4\/5\]/g) === KARTU.length, `tiap kartu (${KARTU.length}, campuran landscape/tegak/tautan pendek) punya tepat satu kotak media 4:5`);
  ok(banyak(t, /relative aspect-\[4\/5\] w-full bg-black/g) === KARTU.length, 'kotak yang sama membungkus semua keadaan (kelas kotak identik pada semua kartu)');
  ok(!/aspect-video|aspect-square|h-\[600px\]/.test(t), 'tidak ada lagi rasio 16:9, persegi, atau tinggi tetap 600px pada kartu');
  ok(banyak(t, /class="absolute inset-0/g) >= KARTU.length, 'isi kotak (gambar, latar pengganti, tombol) mengisi kotak penuh (absolute inset-0)');
  ok(/object-contain/.test(t) && /object-cover/.test(t), 'gambar landscape utuh (object-contain), gambar lain memenuhi kotak (object-cover)');
}

console.log('\n--- Tanpa gambar: latar pengganti bertuliskan platform ---');
{
  const ig = teks(h(MediaSosial, { sosial: [KARTU[1]] }));
  const tt = teks(h(MediaSosial, { sosial: [KARTU[2]] }));
  ok(/from-pramuka-700 to-pramuka-900/.test(ig) && />Instagram<\/span>/.test(ig) && !ig.includes('<img'), 'Instagram tanpa gambar: latar berwarna dengan tulisan Instagram, bukan kotak kosong');
  ok(/from-pramuka-700 to-pramuka-900/.test(tt) && />TikTok<\/span>/.test(tt) && !tt.includes('<img'), 'TikTok tanpa gambar: latar berwarna dengan tulisan TikTok');
  ok(ig.includes('aria-label="Putar postingan Instagram"') && !ig.includes('<iframe'), 'tombol putar tetap ada di atas latar pengganti, tanpa iframe saat dimuat');
  const pendek = teks(h(MediaSosial, { sosial: [KARTU[5]] }));
  ok(/aria-label="Buka postingan Facebook: Tautan pendek"/.test(pendek) && pendek.includes('aspect-[4/5]') && pendek.includes('>Facebook<'), 'tautan pendek: kartu tautan dengan kotak yang sama dan tulisan platform');
}

console.log('\n--- Sebelum dan sesudah diputar: kotak yang sama (kode sumber) ---');
{
  const sumber = readFileSync(`${P}/src/landing/bagian.jsx`, 'utf8');
  const awal = sumber.indexOf('function KartuSosial');
  const kartu = sumber.slice(awal, sumber.indexOf('export function MediaSosial'));
  ok(banyak(kartu, /aspect-\[4\/5\]/g) === 1, 'rasio kotak ditulis SATU kali di KartuSosial dan dipakai bersama oleh gambar, tautan, dan pemutar');
  const kotak = kartu.indexOf('aspect-[4/5]');
  const iframe = kartu.indexOf('<iframe');
  const tutup = kartu.indexOf('</div>', kotak);
  ok(kotak > 0 && iframe > kotak && iframe < tutup, 'iframe pemutar berada DI DALAM kotak yang sama (bukan menggantinya dengan kotak lain)');
  ok(/className="absolute inset-0 h-full w-full border-0"/.test(kartu), 'pemutar mengisi seluruh kotak, jadi ukurannya tidak berubah saat diputar');
  ok(!/aspect-video|h-\[600px\]|aspect-square/.test(kartu), 'tidak ada rasio atau tinggi lain di kartu');
}

console.log('\n--- Menu header "Media Sosial" ---');
{
  const nav = MENU.map((m) => m.href);
  ok(nav.indexOf('#sosial') === nav.indexOf('#galeri') + 1, 'menu Media Sosial ada tepat sesudah Galeri');
  ok(MENU.slice(0, 4).every((m) => !m.bilaAda), 'empat butir pertama (dipakai kaki halaman) tidak bersyarat');
  ok(!menuTampil().some((m) => m.href === '#sosial') && !menuTampil({ sosial: false }).some((m) => m.href === '#sosial'), 'tanpa kiriman media sosial: menu tidak menampilkan Media Sosial');
  ok(menuTampil({ sosial: true }).some((m) => m.href === '#sosial' && m.label === 'Media Sosial') && menuTampil({ sosial: true }).length === MENU.length, 'ada kiriman: seluruh menu tampil, termasuk Media Sosial');
  const G = GUDEP_BAWAAN;
  ok(!teks(h(NavBeranda, { G })).includes('href="#sosial"'), 'bilah atas tanpa data (HTML prarender): tidak ada tautan ke bagian yang tidak dirender');
  ok(teks(h(NavBeranda, { G, ada: { sosial: true } })).includes('href="#sosial"'), 'bilah atas dengan kiriman: tautan #sosial tampil');
  ok(teks(h(MediaSosial, { sosial: [KARTU[0]] })).includes('id="sosial"'), 'tautan #sosial menuju bagian yang benar-benar ada saat ada kiriman');
  const landing = readFileSync(`${P}/src/landing/Landing.jsx`, 'utf8');
  ok(/ada=\{\{ sosial: \(beranda\.sosial \?\? \[\]\)\.length > 0 \}\}/.test(landing), 'Landing memberi tahu bilah atas bahwa ada kiriman hanya bila daftarnya tidak kosong');
}

console.log('\n--- Formulir Kelola Beranda ---');
{
  const panel = readFileSync(`${P}/src/components/PanelSosial.jsx`, 'utf8');
  ok(/tidak menyediakan gambar otomatis/.test(panel), 'petunjuk untuk Facebook (dan tautan yang tidak dapat diambil gambarnya): tidak ada gambar otomatis, isi sendiri dari Drive');
}

console.log(`\nRINGKASAN MEDIA-SOSIAL-SERAGAM: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
