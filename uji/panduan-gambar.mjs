// Panduan bergambar (menu Bantuan): logika murni pembuat gambar (scripts/panduan/logika.mjs), definisi layar, data dan berkas gambar yang dihasilkan,
// keterkaitan dengan isi panduan (panduanData.js), logika tampilan (panduanGambarLogic.js), dan komponen FigurPanduan / halaman Bantuan (dirender di server).
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { DEFINISI } from '../scripts/panduan/definisi.mjs';
import { FOLDER_GAMBAR, MAKS_PENANDA, MODE, NAMA_MODE, PERAN_GAMBAR, gabungTeks, kotakKePersen, namaBerkas, pencariUntuk, periksaDefinisi, susunData } from '../scripts/panduan/logika.mjs';
import { BAGIAN_UMUM, PANDUAN, PERAN_PANDUAN } from '../src/data/panduanData.js';
import { KUNCI_MODE, LABEL_MODE, MODE_GAMBAR, alamatGambar, ambilFigur, gayaKotak, gayaLencana, modeSah, varianTampil } from '../src/lib/panduanGambarLogic.js';
import FigurPanduan from '../src/components/FigurPanduan.jsx';
import Bantuan from '../src/pages/Bantuan.jsx';
import { KonteksApp } from '../src/context/AppContext.jsx';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const DATA = JSON.parse(readFileSync(`${P}/src/data/panduanGambar.json`, 'utf8'));
const hitung = (s, pola) => (s.match(pola) || []).length;

console.log('--- kotakKePersen ---');
{
  ok(JSON.stringify(kotakKePersen({ x: 100, y: 50, w: 200, h: 100 }, 1000, 500)) === JSON.stringify({ x: 10, y: 10, w: 20, h: 20 }), 'kotak di dalam gambar diubah ke persen');
  const p = kotakKePersen({ x: -20, y: -10, w: 120, h: 60 }, 200, 100);
  ok(p && p.x === 0 && p.y === 0 && p.w === 50 && p.h === 50, 'kotak yang keluar tepi kiri/atas dipotong ke gambar: ' + JSON.stringify(p));
  const q = kotakKePersen({ x: 900, y: 450, w: 300, h: 300 }, 1000, 500);
  ok(q && q.x === 90 && q.y === 90 && q.w === 10 && q.h === 10, 'kotak yang keluar tepi kanan/bawah dipotong');
  ok(kotakKePersen({ x: 2000, y: 0, w: 50, h: 50 }, 1000, 500) === null, 'kotak di luar gambar: ditolak (null)');
  ok(kotakKePersen({ x: 10, y: 10, w: 1, h: 30 }, 1000, 500) === null, 'kotak tanpa luas (lebar < 2 px): ditolak');
  ok(kotakKePersen(null, 1000, 500) === null && kotakKePersen({ x: 0, y: 0, w: 5, h: 5 }, 0, 500) === null, 'masukan rusak: null');
}

console.log('\n--- periksaDefinisi ---');
{
  const baik = { id: 'penegak-uji', akun: '1', judul: 'Judul uji', alt: 'Teks alternatif yang cukup panjang.', penanda: [{ teks: 'Keterangan penunjuk yang jelas.', cari: { teks: 'X' } }] };
  ok(periksaDefinisi([baik]).length === 0, 'definisi yang baik: tanpa galat');
  ok(periksaDefinisi([]).length === 1, 'daftar kosong: galat');
  ok(periksaDefinisi([baik, { ...baik }]).some((g) => /id ganda/.test(g)), 'id ganda: galat');
  ok(periksaDefinisi([{ ...baik, id: 'Bukan Id' }]).some((g) => /id tidak sah/.test(g)), 'id tidak sah: galat');
  ok(periksaDefinisi([{ ...baik, id: 'lainnya-x' }]).some((g) => /awalan id/.test(g)), 'awalan id di luar daftar peran: galat');
  ok(periksaDefinisi([{ ...baik, alt: 'pendek' }]).some((g) => /alt/.test(g)), 'teks alternatif terlalu pendek: galat');
  ok(periksaDefinisi([{ ...baik, judul: '' }]).some((g) => /judul/.test(g)), 'judul kosong: galat');
  ok(periksaDefinisi([{ ...baik, akun: '' }]).some((g) => /akun/.test(g)), 'akun kosong: galat');
  ok(periksaDefinisi([{ ...baik, penanda: [] }]).some((g) => /belum ada penunjuk/.test(g)), 'tanpa penunjuk: galat');
  ok(periksaDefinisi([{ ...baik, penanda: Array.from({ length: MAKS_PENANDA + 1 }, () => baik.penanda[0]) }]).some((g) => /melebihi batas/.test(g)), `lebih dari ${MAKS_PENANDA} penunjuk: galat`);
  ok(periksaDefinisi([{ ...baik, penanda: [{ teks: 'pendek', cari: { teks: 'X' } }] }]).some((g) => /terlalu pendek/.test(g)), 'keterangan penunjuk terlalu pendek: galat');
  ok(periksaDefinisi([{ ...baik, penanda: [{ teks: 'Keterangan yang panjang cukup.' }] }]).some((g) => /belum lengkap/.test(g)), 'tanpa cara menemukan elemen: galat');
  ok(periksaDefinisi([{ ...baik, penanda: [{ teks: 'Keterangan yang panjang cukup.', layar: { teks: 'X' } }] }]).some((g) => /kedua mode/.test(g)), 'cara menemukan hanya untuk satu mode: galat');
  ok(periksaDefinisi([{ ...baik, penanda: [{ teks: 'Keterangan yang panjang cukup.', cari: { label: 'Akun' } }] }]).length === 0, 'pencari berbasis label diterima');
  const beda = { teks: 'Y', cari: { teks: 'X' }, ponsel: { teks: 'Z' } };
  ok(pencariUntuk(beda, 'ponsel').teks === 'Z' && pencariUntuk(beda, 'layar').teks === 'X', 'pencariUntuk: khusus mode menang atas pencari bersama');
}

console.log('\n--- definisi layar yang ada ---');
{
  const g = periksaDefinisi(DEFINISI);
  ok(g.length === 0, 'definisi sah' + (g.length ? ': ' + g.join('; ') : ` (${DEFINISI.length} gambar)`));
  const peranTerwakili = new Set(DEFINISI.map((d) => d.id.split('-')[0]));
  ok(PERAN_GAMBAR.every((r) => peranTerwakili.has(r)), 'setiap peran (umum, penegak, dewan, pembina, admin) punya gambar: ' + [...peranTerwakili].join(', '));
  ok(NAMA_MODE.join() === 'layar,ponsel' && MODE.layar.lebar > MODE.ponsel.lebar && MODE.ponsel.seluler === true, 'dua mode: laptop/PC/tablet dan ponsel');
}

console.log('\n--- susunData dan gabungTeks ---');
{
  const def = [{ id: 'penegak-a', akun: '1', judul: 'A', alt: 'alt panjang sekali', penanda: [{ teks: 'satu keterangan' }, { teks: 'dua keterangan' }] }];
  const varian = { berkas: namaBerkas('penegak-a', 'layar'), l: 1024, t: 760, kotak: [{ x: 1, y: 1, w: 5, h: 5 }, { x: 10, y: 10, w: 5, h: 5 }] };
  const data = susunData(def, { 'penegak-a': { layar: varian, ponsel: { ...varian, berkas: namaBerkas('penegak-a', 'ponsel') } } });
  ok(data.figur['penegak-a'].keterangan.join('|') === 'satu keterangan|dua keterangan' && data.figur['penegak-a'].layar.kotak.length === 2, 'susunData: keterangan mengikuti definisi, varian ikut');
  ok(susunData(def, {}).figur['penegak-a'] === undefined, 'gambar yang belum diambil tidak masuk data');
  const baru = gabungTeks(data, [{ ...def[0], judul: 'Judul baru', penanda: [{ teks: 'satu diubah' }, { teks: 'dua keterangan' }] }]);
  ok(baru.figur['penegak-a'].judul === 'Judul baru' && baru.figur['penegak-a'].keterangan[0] === 'satu diubah' && baru.figur['penegak-a'].layar === data.figur['penegak-a'].layar, 'gabungTeks: hanya teks berubah, koordinat dipertahankan');
  let galat = null;
  try { gabungTeks(data, [{ ...def[0], penanda: [{ teks: 'hanya satu' }] }]); } catch (e) { galat = e.message; }
  ok(/jumlah penunjuk berubah/.test(galat ?? ''), 'gabungTeks menolak bila jumlah penunjuk berubah (gambar perlu diambil ulang)');
}

console.log('\n--- data dan berkas gambar yang dihasilkan ---');
{
  const folder = `${P}/public/${FOLDER_GAMBAR}`;
  const ada = existsSync(folder) ? readdirSync(folder) : [];
  const dipakai = new Set();
  let total = 0, terbesar = 0;
  for (const d of DEFINISI) {
    const f = DATA.figur[d.id];
    ok(!!f, `${d.id}: ada di panduanGambar.json (jalankan scripts/panduan/ambil.mjs bila belum)`);
    if (!f) continue;
    ok(f.judul === d.judul && f.alt === d.alt && f.keterangan.join('|') === d.penanda.map((p) => p.teks).join('|'), `${d.id}: teks di data = definisi (jalankan ambil.mjs --teks bila berbeda)`);
    ok(NAMA_MODE.every((m) => f[m] && f[m].kotak.length === d.penanda.length), `${d.id}: kedua mode punya ${d.penanda.length} kotak`);
    for (const m of NAMA_MODE) {
      const v = f[m];
      if (!v) continue;
      ok(v.berkas === namaBerkas(d.id, m), `${d.id} [${m}]: nama berkas sesuai pola`);
      dipakai.add(v.berkas.split('/').pop());
      ok(v.l === MODE[m].lebar && v.t >= 600 && v.t <= 1600, `${d.id} [${m}]: ukuran ${v.l}x${v.t} wajar`);
      ok(v.kotak.every((k) => k.x >= 0 && k.y >= 0 && k.w > 0 && k.h > 0 && k.x + k.w <= 100.05 && k.y + k.h <= 100.05), `${d.id} [${m}]: semua kotak berada di dalam gambar`);
      const berkas = `${P}/public/${v.berkas}`;
      ok(existsSync(berkas), `${d.id} [${m}]: berkas ada`);
      if (existsSync(berkas)) {
        const b = readFileSync(berkas);
        total += b.length; terbesar = Math.max(terbesar, b.length);
        ok(b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP', `${d.id} [${m}]: format WebP`);
      }
    }
  }
  ok(ada.every((n) => dipakai.has(n)), 'tidak ada berkas gambar yatim di public/panduan' + (ada.filter((n) => !dipakai.has(n)).length ? ': ' + ada.filter((n) => !dipakai.has(n)).join(', ') : ''));
  ok(terbesar <= 260 * 1024, `gambar terbesar ${Math.round(terbesar / 1024)} kB (batas 260 kB per gambar)`);
  ok(total <= 9 * 1024 * 1024, `total gambar panduan ${(total / 1024 / 1024).toFixed(2)} MB (anggaran 9 MB; gambar besar memperlambat situs dan membesarkan repositori)`);
  ok(Object.keys(DATA.figur).every((id) => DEFINISI.some((d) => d.id === id)), 'tidak ada gambar di data yang tak ada di definisi');
}

console.log('\n--- keterkaitan dengan panduanData.js ---');
{
  const dipakai = new Map();
  const periksaBagian = (b, kode) => {
    for (const g of b.gambar || []) {
      ok(!!ambilFigur(DATA, g), `${b.id}: gambar "${g}" ada dan utuh`);
      ok(!dipakai.has(g), `gambar "${g}" dipakai sekali saja`);
      dipakai.set(g, b.id);
      ok(g.startsWith(`${kode}-`), `${b.id}: gambar "${g}" berawalan peran "${kode}"`);
    }
  };
  periksaBagian(BAGIAN_UMUM, 'umum');
  for (const kode of PERAN_PANDUAN) for (const b of PANDUAN[kode].bagian) periksaBagian(b, kode);
  ok(Object.keys(DATA.figur).every((id) => dipakai.has(id)), 'setiap gambar dipakai oleh satu bagian panduan' + (Object.keys(DATA.figur).filter((id) => !dipakai.has(id)).length ? ': belum dipakai ' + Object.keys(DATA.figur).filter((id) => !dipakai.has(id)).join(', ') : ''));
  ok(PERAN_PANDUAN.every((kode) => PANDUAN[kode].bagian.some((b) => (b.gambar || []).length)), 'setiap peran punya sedikitnya satu bagian bergambar');
}

console.log('\n--- panduanGambarLogic ---');
{
  ok(varianTampil('ponsel').join() === 'ponsel' && varianTampil('layar').join() === 'layar' && varianTampil('otomatis').join() === 'ponsel,layar', 'varianTampil menurut mode');
  ok(MODE_GAMBAR.join() === 'otomatis,ponsel,layar' && MODE_GAMBAR.every((m) => LABEL_MODE[m]), 'tiga mode punya label');
  ok(modeSah('ponsel') === 'ponsel' && modeSah('ngawur') === 'otomatis' && modeSah(null) === 'otomatis', 'modeSah: nilai rusak jatuh ke otomatis');
  ok(ambilFigur(DATA, 'tidak-ada') === null && ambilFigur(null, 'x') === null, 'ambilFigur: tidak ada -> null');
  const rusak = { figur: { x: { keterangan: ['a', 'b'], layar: { kotak: [{}] }, ponsel: { kotak: [{}, {}] } } } };
  ok(ambilFigur(rusak, 'x') === null, 'ambilFigur: jumlah kotak tak sama dengan keterangan -> null');
  ok(gayaKotak({ x: 1.5, y: 2, w: 30, h: 4 }).left === '1.5%' && gayaKotak({ x: 1.5, y: 2, w: 30, h: 4 }).width === '30%', 'gayaKotak dalam persen');
  ok(gayaLencana({ x: 0, y: 0 }).left === '0.6%' && gayaLencana({ x: 40, y: 50 }).top === '50%', 'gayaLencana: kotak menempel tepi digeser ke dalam');
  ok(alamatGambar('panduan/a.webp', '/') === '/panduan/a.webp' && alamatGambar('panduan/a.webp', '/sigarda') === '/sigarda/panduan/a.webp', 'alamatGambar mengikuti base');
  ok(typeof KUNCI_MODE === 'string' && KUNCI_MODE.startsWith('sigarda_'), 'kunci penyimpanan mode bernama sigarda_*');
}

console.log('\n--- komponen FigurPanduan (render) ---');
{
  const id = DEFINISI[0].id;
  const f = DATA.figur[id];
  const n = f.keterangan.length;
  const oto = renderToStaticMarkup(h(FigurPanduan, { id, mode: 'otomatis' }));
  ok(hitung(oto, /<img /g) === 2 && /md:hidden/.test(oto) && /hidden md:block/.test(oto), 'otomatis: dua varian, ponsel di layar sempit dan laptop di layar lebar');
  ok(hitung(oto, /loading="lazy"/g) === 2, 'gambar dimuat malas (lazy)');
  ok(hitung(oto, /width="\d+" height="\d+"/g) === 2, 'lebar dan tinggi ditetapkan (tanpa lompatan tata letak)');
  ok(oto.includes(f.judul) && oto.includes(f.keterangan[0]), 'judul dan keterangan tampil');
  ok(hitung(oto, /rounded-full bg-red-600/g) === 2 * n + n, `nomor penunjuk: ${n} per varian (x2) + ${n} di legenda`);
  ok(hitung(oto, /alt="[^"]{20,}"/g) === 2, 'setiap gambar punya teks alternatif yang bermakna');
  ok(/tampilan ponsel/.test(oto) && /tampilan laptop, PC, atau tablet/.test(oto), 'teks alternatif menyebut mode');
  ok(hitung(oto, /<a href="\/panduan\/[^"]+\.webp" target="_blank" rel="noopener noreferrer"/g) === 2 && /aria-label="Buka gambar /.test(oto), 'gambar dapat dibuka ukuran penuh di tab baru (rel noopener, ada label)');
  ok(/print:hidden/.test(oto) && /print:block/.test(oto), 'dicetak: hanya varian laptop');
  const po = renderToStaticMarkup(h(FigurPanduan, { id, mode: 'ponsel' }));
  ok(po.includes(f.ponsel.berkas) && hitung(po, /data-varian="ponsel"/g) === 1, 'mode ponsel: varian ponsel');
  const la = renderToStaticMarkup(h(FigurPanduan, { id, mode: 'layar' }));
  ok(la.includes(f.layar.berkas) && !la.includes(f.ponsel.berkas), 'mode laptop: hanya varian laptop (ponsel tidak diunduh)');
  ok(renderToStaticMarkup(h(FigurPanduan, { id: 'tidak-ada', mode: 'otomatis' })) === '', 'id tak dikenal: tidak menampilkan apa pun');
  ok(hitung(la, /<ol /g) === 1 && hitung(la, /<li /g) === n, 'legenda: satu daftar bernomor');
}

console.log('\n--- halaman Bantuan (render) ---');
{
  const dasar = { user: { role: 'peserta' } };
  const html = renderToStaticMarkup(h(KonteksApp.Provider, { value: dasar }, h(Bantuan)));
  ok(/Gambar contoh:/.test(html) && hitung(html, /aria-pressed/g) === 3, 'ada pilihan mode gambar (3 tombol)');
  ok(MODE_GAMBAR.every((m) => html.includes(LABEL_MODE[m])), 'label mode: ' + MODE_GAMBAR.map((m) => LABEL_MODE[m]).join(' / '));
  const idPenegak = PANDUAN.penegak.bagian.flatMap((b) => b.gambar || []);
  ok(idPenegak.length > 0 && idPenegak.every((g) => html.includes(`data-figur="${g}"`)), `panduan Penegak menampilkan ${idPenegak.length} gambar bagiannya`);
  ok((BAGIAN_UMUM.gambar || []).every((g) => html.includes(`data-figur="${g}"`)), 'bagian umum menampilkan gambarnya');
  ok(/no-print/.test(html.slice(html.indexOf('Gambar contoh:') - 400, html.indexOf('Gambar contoh:'))), 'pilihan mode tidak ikut dicetak');
  const adm = renderToStaticMarkup(h(KonteksApp.Provider, { value: { user: { role: 'admin' } } }, h(Bantuan)));
  ok(PANDUAN.admin.bagian.flatMap((b) => b.gambar || []).every((g) => adm.includes(`data-figur="${g}"`)), 'panduan Admin menampilkan gambarnya');
}

console.log(`\nRINGKASAN PANDUAN BERGAMBAR: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
