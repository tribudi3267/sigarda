// Kelola Beranda: daftar dan formulir pada tab Berita, Prestasi, Galeri, Media Sosial, dan Pertanyaan Umum harus tetap dua kolom sama lebar (dan tidak
// menjorok keluar di ponsel) walau ada judul panjang. Penyebab masalah sebelumnya: kolom grid `1.1fr 1fr` (dan grid tanpa templat kolom di ponsel) tidak
// boleh lebih sempit dari isinya, sehingga judul panjang melebarkan kolom daftar dan mendorong formulir. Ukuran sungguhan diperiksa manual di dev:lokal
// (320, 768, 1024, 1280 px); uji ini menjaga sumbernya.
import { readFileSync } from 'node:fs';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const baca = (berkas) => readFileSync(`${P}/src/components/${berkas}`, 'utf8');

for (const berkas of ['PanelKontenTinjau.jsx', 'PanelSosial.jsx', 'PanelFaq.jsx']) {
  const s = baca(berkas);
  ok(s.includes('<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">\n      <div className="min-w-0">'), `${berkas}: grid satu kolom bertrek minmax(0,1fr) di ponsel dan dua kolom sama lebar mulai lg; kolom daftar boleh menyempit (min-w-0)`);
  ok(!s.includes('lg:grid-cols-[1.1fr_1fr]'), `${berkas}: tidak memakai lagi kolom fr yang melebar mengikuti isi`);
  ok(s.includes('<form className="min-w-0 space-y-4"') || s.includes('<form className="order-first min-w-0 space-y-4 lg:order-none"'), `${berkas}: kolom formulir juga boleh menyempit (min-w-0)`);
  if (berkas !== 'PanelFaq.jsx') ok(s.includes('<form className="order-first min-w-0 space-y-4 lg:order-none"'), `${berkas}: formulir tambah/ubah di ATAS daftar pada layar sempit (order-first), berdampingan mulai lg`);
}
ok(/\[overflow-wrap:anywhere\]">\{r\.judul\}/.test(baca('PanelKontenTinjau.jsx')) && !/truncate[^"]*">\{r\.judul\}/.test(baca('PanelKontenTinjau.jsx')), 'judul pada daftar berita/prestasi/galeri membungkus ke baris berikutnya (bukan melebar atau terpotong)');
ok(baca('PanelFaq.jsx').includes('[overflow-wrap:anywhere]">{f.pertanyaan}') && baca('PanelSosial.jsx').includes('[overflow-wrap:anywhere]">{LABEL_PLATFORM'), 'pertanyaan FAQ dan keterangan kiriman sosial juga membungkus');

console.log(`\nRINGKASAN KELOLA-BERANDA-LEBAR: ${lulus} lulus, ${gagal} GAGAL.`);
if (gagal) process.exit(1);
