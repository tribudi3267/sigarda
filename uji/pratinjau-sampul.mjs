// Pratinjau gambar sampul pada Kelola Beranda: penilaian tautan (diagnosaGambar, murni), tampilan awal komponen (dirender statis; pengujian muat gambar di
// peramban dilakukan manual di dev:lokal), dan penyambungannya ke formulir Berita, Galeri, dan Media Sosial.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { RUJUK_LANGKAH_DRIVE, diagnosaGambar, kandidatGambar } from '../src/lib/berandaLogic.js';
import PratinjauSampul from '../src/components/PratinjauSampul.jsx';
import { SKEMA_BERITA, SKEMA_GALERI } from '../src/lib/berandaKontenSkema.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const teks = (el) => renderToStaticMarkup(el);
const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456';

console.log('--- diagnosaGambar (murni) ---');
{
  const halamanFoto = 'https://photos.google.com/photo/AF1QipMhQvkbJImFTiDebbAW7dh60XssV9O5OCfktKzp';
  ok(diagnosaGambar(halamanFoto).jenis === 'halaman-photos' && kandidatGambar(halamanFoto).length === 0, 'halaman foto Google Photos (kasus nyata pengurus): halaman-photos dan tanpa kandidat gambar');
  ok(diagnosaGambar(halamanFoto).pesan.includes('bukan file gambar') && diagnosaGambar(halamanFoto).pesan.includes(RUJUK_LANGKAH_DRIVE), 'pesannya menjelaskan sebabnya dan merujuk ke langkah Google Drive di bawah kolom');
  ok(diagnosaGambar('https://photos.app.goo.gl/AbCdEf123').jenis === 'halaman-photos', 'tautan pendek Bagikan photos.app.goo.gl: halaman-photos');
  ok(diagnosaGambar(`https://drive.google.com/drive/folders/${id}`).jenis === 'folder-drive' && diagnosaGambar(`https://drive.google.com/drive/u/0/folders/${id}?usp=sharing`).jenis === 'folder-drive', 'folder Drive: folder-drive');
  ok(diagnosaGambar('https://drive.google.com/drive/my-drive').jenis === 'drive-tanpa-id', 'tautan Drive tanpa ID file: drive-tanpa-id');
  ok(diagnosaGambar(`https://drive.google.com/file/d/${id}/view?usp=sharing`).jenis === 'drive' && diagnosaGambar(`https://drive.google.com/open?id=${id}`).jenis === 'drive', 'berkas Drive: drive (layak diuji pratinjau)');
  ok(diagnosaGambar('https://lh3.googleusercontent.com/pw/AbCd').jenis === 'langsung' && diagnosaGambar('https://contoh.com/foto.jpg').jenis === 'langsung', 'alamat gambar biasa: langsung');
  ok(diagnosaGambar('').jenis === 'kosong' && diagnosaGambar('   ').jenis === 'kosong' && diagnosaGambar(null).jenis === 'kosong', 'kosong: kosong');
  ok(diagnosaGambar('foto.jpg').jenis === 'tidak-sah' && diagnosaGambar('javascript:alert(1)').jenis === 'tidak-sah' && diagnosaGambar('http://a.com/x.jpg').jenis === 'tidak-sah', 'bukan https yang sah: tidak-sah (galatnya ditampilkan validasi formulir)');
  const semuaTautan = [halamanFoto, 'https://photos.app.goo.gl/x', `https://drive.google.com/drive/folders/${id}`, 'https://drive.google.com/drive/my-drive', `https://drive.google.com/file/d/${id}/view`, 'https://lh3.googleusercontent.com/a', 'https://contoh.com/f.png', '', 'x'];
  ok(semuaTautan.every((t) => (['halaman-photos', 'folder-drive', 'drive-tanpa-id'].includes(diagnosaGambar(t).jenis)) === (kandidatGambar(t).length === 0 && diagnosaGambar(t).jenis !== 'kosong' && diagnosaGambar(t).jenis !== 'tidak-sah')), 'penilaian selaras dengan kandidatGambar: jenis yang tak mungkin tampil = tanpa kandidat');
}

console.log('\n--- PratinjauSampul (tampilan awal) ---');
{
  ok(teks(h(PratinjauSampul, { nilai: '' })) === '' && teks(h(PratinjauSampul, { nilai: 'bukan-tautan' })) === '', 'kolom kosong atau bukan tautan: tidak menampilkan apa-apa (galat validasi ditampilkan formulir)');
  const t1 = teks(h(PratinjauSampul, { nilai: 'https://photos.google.com/photo/AF1QipMhQvkbJImFTiDebbAW7dh60XssV9O5OCfktKzp' }));
  ok(t1.includes('role="alert"') && t1.includes('halaman Google Photos') && t1.includes('langkah Google Drive') && !t1.includes('<img'), 'tautan halaman Photos: peringatan merah dengan langkah Drive, tanpa gambar dan tanpa pengujian');
  ok(teks(h(PratinjauSampul, { nilai: `https://drive.google.com/drive/folders/${id}` })).includes('tautan folder Google Drive'), 'folder Drive: peringatan folder');
  const t2 = teks(h(PratinjauSampul, { nilai: `https://drive.google.com/file/d/${id}/view`, rasio: 'galeri' }));
  ok(t2.includes('data-pratinjau="menguji"') && t2.includes('aspect-[4/3]') && t2.includes('Menguji apakah foto dapat dimuat') && !t2.includes('<img'), 'berkas Drive: mulai dari status menguji, kotak berasio kartu galeri (4/3), belum ada gambar');
  ok(teks(h(PratinjauSampul, { nilai: 'https://contoh.com/f.png', rasio: 'sosial' })).includes('aspect-square') && teks(h(PratinjauSampul, { nilai: 'https://contoh.com/f.png' })).includes('aspect-[16/10]'), 'rasio pratinjau mengikuti kartu: sosial persegi, bawaan berita 16/10');
}

console.log('\n--- Penyambungan ke formulir ---');
{
  ok(SKEMA_BERITA.fields.find((f) => f.kunci === 'sampulUrl').pratinjau === 'berita' && SKEMA_GALERI.fields.find((f) => f.kunci === 'sampulUrl').pratinjau === 'galeri', 'isian sampul Berita dan Galeri bertanda pratinjau dengan rasio kartunya');
  const bantuan = SKEMA_GALERI.fields.find((f) => f.kunci === 'sampulUrl').bantuan;
  ok(bantuan.includes('Google Drive') && bantuan.includes('Siapa saja yang memiliki link') && !/klik kanan|Salin alamat gambar/i.test(bantuan), 'petunjuk mengutamakan Google Drive dan tidak lagi menyuruh "klik kanan > Salin alamat gambar"');
  ok(/f\.pratinjau && <PratinjauSampul nilai=\{nilai\} rasio=\{f\.pratinjau\}/.test(readFileSync(`${P}/src/components/PanelKontenTinjau.jsx`, 'utf8')), 'formulir Berita/Galeri (PanelKontenTinjau) menampilkan pratinjau di bawah isian bertanda');
  const sosial = readFileSync(`${P}/src/components/PanelSosial.jsx`, 'utf8');
  ok(/<PratinjauSampul nilai=\{form\.gambarUrl\} rasio="sosial"/.test(sosial) && sosial.includes('bantuan={bantuanGambar}'), 'formulir Media Sosial menampilkan pratinjau dan petunjuk yang sama');
}

console.log(`\nRINGKASAN PRATINJAU-SAMPUL: ${lulus} lulus, ${gagal} GAGAL.`);
if (gagal) process.exit(1);
