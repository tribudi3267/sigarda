// Fase 1 landing page: tampilan halaman muka (render sisi server tanpa peramban), keamanan isi yang berasal dari pengurus (tautan, teks), tidak ada data pribadi di HTML,
// klien publik tanpa login, dan berkas SEO statis (robots.txt, sitemap.xml, gambar pratinjau, data terstruktur di index.html).
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { Berita, CekDokumen, Galeri, Hero, Kaki, KabarAgenda, Kontak, MediaSosial, NavBeranda, Perjalanan, Prestasi, Program, Tentang, TanyaJawab } from '../src/landing/bagian.jsx';
import Landing from '../src/landing/Landing.jsx';
import { DASA_DARMA, MENU, menuTampil, PERJALANAN, PROGRAM, TANYA_JAWAB, TRI_SATYA } from '../src/landing/landingData.js';
import { renderBeranda } from '../src/landing/prarender.jsx';
import { alamatRpc, panggilRpcPublik } from '../src/lib/publikClient.js';
import { GUDEP_BAWAAN } from '../src/config.js';
import { untukForm } from '../src/lib/berandaLogic.js';

let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const P = process.cwd().replace(/\\/g, '/');
const teks = (el) => renderToStaticMarkup(el);
const G = GUDEP_BAWAAN;
const KOSONG = untukForm(null);
const kontak = (sebagian) => ({ ...KOSONG, ...sebagian });

console.log('--- Halaman utuh (tanpa data server) ---');
const utuh = renderBeranda();
{
  ok(utuh.length > 10000 && !/<script/i.test(utuh), `dirender ke HTML (${(utuh.length / 1024).toFixed(0)} kB) tanpa skrip`);
  ok(/<h1[^>]*>\s*Gugus Depan/.test(utuh) && (utuh.match(/<h1/g) ?? []).length === 1, 'tepat satu <h1>, memuat nama gudep');
  for (const m of MENU.filter((x) => !x.bilaAda)) ok(utuh.includes(`id="${m.href.slice(1)}"`), `menu ${m.label}: bagian ${m.href} ada`);
  ok(!utuh.includes('id="sosial"') && !utuh.includes('href="#sosial"'), 'tanpa data server: bagian Media Sosial tidak dirender dan menunya juga tidak ada (tidak ada tautan mati)');
  ok(utuh.includes('id="atas"') && utuh.includes('id="cek"'), 'bagian atas dan cek dokumen ada');
  ok(TANYA_JAWAB.every((q) => utuh.includes(q.t)) && TRI_SATYA.every((t) => utuh.includes(t.slice(0, 30))) && DASA_DARMA.every((d) => utuh.includes(d)), 'tanya jawab, Tri Satya, dan Dasa Darma tampil utuh');
  ok(PROGRAM.every((p) => utuh.includes(p.judul)) && PERJALANAN.every((p) => utuh.includes(p.judul)), 'semua program dan pos perjalanan tampil');
  ok(utuh.includes('href="#masuk"') && (utuh.match(/href="#masuk"/g) ?? []).length >= 3, 'tombol Masuk mengarah ke #masuk (bilah atas, hero, kaki)');
  ok(/<form method="get" action="\.\/"/.test(utuh) && utuh.includes('name="v"'), 'cek dokumen: formulir GET ke ./?v= (bekerja tanpa JavaScript)');
  ok(utuh.includes('Buka di Google Maps') && utuh.includes('google.com/maps/search/?api=1&amp;query='), 'peta memakai pencarian nama sekolah bila tautan belum diisi');
  ok(!utuh.includes('aria-label="Agenda terdekat"') && utuh.includes('Memuat agenda'), 'tanpa data server: tidak ada kartu agenda terdekat; agenda berstatus memuat');
  ok(/<details[^>]*open/.test(utuh) && (utuh.match(/<details/g) ?? []).length === TANYA_JAWAB.length, 'tanya jawab memakai <details> (buka-tutup tanpa JavaScript), yang pertama terbuka');
  ok(utuh.includes('UU 12/2010') || utuh.includes('Undang-Undang Nomor 12 Tahun 2010'), 'Tri Satya dan Dasa Darma menyebut dasar aturannya (UU 12/2010) dengan tautan ke berkas asli');
}

console.log('\n--- Tidak ada data pribadi di HTML prarender ---');
{
  const pribadi = [G.pembina.nama, G.pembina.nta, G.kamabigus.nama, 'NTA', 'NIP'].filter(Boolean);
  ok(pribadi.every((p) => !utuh.includes(p)), 'nama Pembina, NTA, dan NIP bawaan tidak ada di HTML (nama hanya muncul dari data server yang diisi pengurus)');
  ok(!/https?:\/\/[^"' ]*(supabase|\.co\/rest|anon)/i.test(utuh), 'tidak ada alamat atau kunci Supabase di HTML');
  ok(!/@[a-z0-9-]+\.(sch\.id|com|id)/i.test(utuh.replace(/href="https?:[^"]*"/g, '')), 'tidak ada alamat email tertulis di HTML prarender');
}

console.log('\n--- Bagian: isi dari pengurus dan keamanannya ---');
{
  const t1 = teks(h(Tentang, { G, kontak: kontak({ sambutanPembina: 'Selamat datang.\n\nSemoga betah.', cerita: 'Cerita satu.\n\nCerita dua.' }), pembina: { jabatan: 'Pembina Gudep', nama: 'Bu Pembina Contoh' }, kamabigus: { jabatan: '', nama: '' } }));
  ok(t1.includes('Selamat datang.') && t1.includes('Semoga betah.') && t1.includes('Bu Pembina Contoh') && t1.includes('Cerita dua.'), 'sambutan dan cerita dari pengurus tampil per paragraf, dengan nama penyampai');
  ok(!t1.includes('Dewan Ambalan yang dipilih sesama Penegak'), 'cerita dari pengurus menggantikan kalimat bawaan');
  const t2 = teks(h(Tentang, { G, kontak: KOSONG, pembina: {}, kamabigus: {} }));
  ok(t2.includes('Dewan Ambalan yang dipilih sesama Penegak') && !t2.includes('<blockquote'), 'tanpa isian pengurus: kalimat bawaan dan tanpa kutipan sambutan');
  const jahat = teks(h(Tentang, { G, kontak: kontak({ cerita: '<script>alert(1)</script><img src=x onerror=alert(2)>', sambutanPembina: '<b>tebal</b>' }), pembina: { nama: '<i>Nama</i>' }, kamabigus: {} }));
  ok(!/<script|<img|<b>tebal|<i>Nama/.test(jahat) && jahat.includes('&lt;script&gt;'), 'HTML dari pengurus di-escape (tidak pernah dirender sebagai HTML)');

  const k1 = teks(h(Kontak, { G, kontak: kontak({ whatsapp: '0812 3456 7890', email: 'a@b.co', telepon: '0281 1', jadwal: 'Jumat 15.30', instagram: 'https://instagram.com/x', youtube: 'javascript:alert(1)', facebook: 'http://tidak-aman.com', peta: 'https://maps.app.goo.gl/abc' }) }));
  ok(k1.includes('https://wa.me/6281234567890') && k1.includes('a@b.co') && k1.includes('0281 1') && k1.includes('Jumat 15.30'), 'kontak yang terisi tampil (WhatsApp menjadi tautan wa.me)');
  ok(k1.includes('href="https://instagram.com/x"') && !k1.includes('javascript:') && !k1.includes('tidak-aman') && !k1.includes('YouTube') && !k1.includes('Facebook'), 'hanya tautan https yang sah yang tampil; javascript: dan http dibuang');
  ok(k1.includes('href="https://maps.app.goo.gl/abc"') && !k1.includes('maps/search'), 'tautan peta dari pengurus dipakai bila sah');
  ok(/rel="noopener noreferrer"/.test(k1) && !/target="_blank"(?![^>]*noopener)/.test(k1), 'tautan keluar memakai rel="noopener noreferrer"');
  const k2 = teks(h(Kontak, { G, kontak: KOSONG }));
  ok(!k2.includes('WhatsApp') && !k2.includes('Email') && !k2.includes('Telepon') && k2.includes('Setiap Jumat'), 'kolom kosong tidak ditampilkan; jadwal memakai kalimat bawaan');
}

console.log('\n--- Agenda dan hero ---');
{
  const agenda = [{ jenis: 'lainnya', judul: 'Latihan Jumat', tanggal: '2026-10-02' }, { jenis: 'musyawarah', judul: 'Musyawarah <b>Ambalan</b>', tanggal: '2026-10-24' }];
  const a = teks(h(KabarAgenda, { agenda }));
  ok(a.includes('Latihan Jumat') && a.includes('Jumat, 2 Oktober 2026') && a.includes('Sabtu, 24 Oktober 2026') && a.includes('Musyawarah &lt;b&gt;Ambalan&lt;/b&gt;') && !a.includes('<b>Ambalan'), 'agenda tampil dengan tanggal Indonesia; judul di-escape');
  ok(/<b class="[^"]*">2<\/b>/.test(a) && /<b class="[^"]*">24<\/b>/.test(a) && a.includes('>Okt<'), 'blok tanggal: angka dan bulan pendek');
  ok(teks(h(KabarAgenda, { agenda: [], memuat: true })).includes('Memuat agenda'), 'agenda kosong saat memuat: "Memuat agenda..."');
  ok(teks(h(KabarAgenda, { agenda: [], memuat: false })).includes('Belum ada agenda mendatang'), 'agenda kosong sesudah selesai: keterangan');
  const hero = teks(h(Hero, { G, agendaTerdekat: agenda[0] }));
  ok(hero.includes('Agenda terdekat') && hero.includes('Latihan Jumat') && hero.includes('Oktober 2026'), 'hero menampilkan kartu agenda terdekat');
  ok(!teks(h(Hero, { G, agendaTerdekat: { judul: 'X', jenis: 'lainnya', tanggal: 'rusak' } })).includes('Agenda terdekat'), 'tanggal rusak: kartu agenda tidak tampil (tidak galat)');
  ok(teks(h(NavBeranda, { G, sesi: false })).includes('>Masuk<') && teks(h(NavBeranda, { G, sesi: true })).includes('Buka SIGARDA'), 'bilah atas: "Masuk" bagi pengunjung, "Buka SIGARDA" bila ada sesi tersimpan');
  ok(teks(h(Kaki, { G })).includes('Cek keaslian dokumen') && teks(h(CekDokumen, {})).includes('Periksa'), 'kaki dan cek dokumen tampil');
  ok([Program, Perjalanan, TanyaJawab].every((K) => teks(h(K, {})).length > 500), 'Program, Perjalanan, dan Tanya Jawab dirender');
  ok(renderToStaticMarkup(h(Landing, { panggil: async () => ({ ok: false }) })).length === utuh.length, 'Landing dan renderBeranda menghasilkan HTML yang sama');
}

console.log('\n--- Berita, Prestasi, Galeri, Media Sosial, dan Tanya Jawab dinamis (Fase 2) ---');
{
  ok(utuh.includes('id="prestasi"'), 'bagian Prestasi ada di HTML prarender (tanpa menu navigasi tersendiri)');
  ok(!utuh.includes('id="sosial"'), 'tanpa data server: bagian Media Sosial tidak dirender sama sekali (kosong = disembunyikan, bukan status memuat)');

  const b1 = teks(h(Berita, { berita: [], memuat: true }));
  const b2 = teks(h(Berita, { berita: [], memuat: false }));
  ok(b1.includes('Memuat berita...') && b2.includes('Belum ada berita'), 'berita kosong: status memuat lalu keterangan kosong');
  const berita = [
    { kategori: 'kegiatan', judul: 'Perkemahan Jumat', ringkasan: 'Ringkas <b>satu</b>.', sampulUrl: 'https://foto.test/a.jpg', terbitPada: '2026-09-20' },
    { kategori: 'pengumuman', judul: 'Pengumuman Ulang Tahun', ringkasan: '', sampulUrl: '', terbitPada: '2026-09-01' },
  ];
  const b3 = teks(h(Berita, { berita }));
  ok(b3.includes('Perkemahan Jumat') && b3.includes('Pengumuman Ulang Tahun') && b3.includes('Kegiatan') && b3.includes('Pengumuman'), 'berita terbit tampil dengan label kategori');
  ok(b3.includes('&lt;b&gt;satu&lt;/b&gt;') && !b3.includes('<b>satu'), 'ringkasan berita di-escape (bukan HTML)');
  ok(b3.includes('Minggu, 20 September 2026'), 'tanggal terbit berita ditampilkan dalam format Indonesia');
  ok(b3.includes('img src="https://foto.test/a.jpg"'), 'sampul berita tampil bila diisi; tanpa sampul memakai ikon bawaan');

  const p1 = teks(h(Prestasi, { prestasi: [], memuat: true }));
  const p2 = teks(h(Prestasi, { prestasi: [], memuat: false }));
  ok(p1.includes('Memuat prestasi...') && p2.includes('Belum ada prestasi'), 'prestasi kosong: status memuat lalu keterangan kosong');
  const p3 = teks(h(Prestasi, { prestasi: [{ judul: 'Lomba Tegak', tingkat: 'cabang', peringkat: 'Juara 1', tahun: 2026, diraihOleh: 'Sangga Garuda' }] }));
  ok(p3.includes('Lomba Tegak') && p3.includes('Juara 1') && p3.includes('Cabang') && p3.includes('Sangga Garuda') && p3.includes('2026'), 'prestasi tampil: judul, peringkat, label tingkat, tahun, dan yang meraih');

  const g1 = teks(h(Galeri, { galeri: [], memuat: true }));
  const g2 = teks(h(Galeri, { galeri: [], memuat: false }));
  ok(g1.includes('Memuat galeri...') && g2.includes('Belum ada album'), 'galeri kosong: status memuat lalu keterangan kosong');
  const g3 = teks(h(Galeri, { galeri: [{ judul: 'Perkemahan 2026', tautan: 'https://drive.test/x', sampulUrl: '', kelompok: 'perkemahan' }] }));
  ok(g3.includes('Perkemahan 2026') && g3.includes('href="https://drive.test/x"') && g3.includes('Perkemahan') && /target="_blank"/.test(g3), 'album galeri tampil sebagai tautan keluar dengan label kelompok');

  ok(teks(h(MediaSosial, { sosial: [] })) === '', 'media sosial kosong: bagian tidak dirender sama sekali (bukan hanya kosong secara visual)');
  const s1 = teks(h(MediaSosial, { sosial: [{ platform: 'instagram', tautan: 'https://instagram.com/gudep', keterangan: 'Ikuti kami', gambarUrl: '' }] }));
  ok(s1.includes('id="sosial"') && s1.includes('Instagram') && s1.includes('href="https://instagram.com/gudep"') && s1.includes('Ikuti kami'), 'media sosial terisi: bagian tampil dengan label platform dan keterangan');

  const t1 = teks(h(TanyaJawab, { faq: [] }));
  ok(TANYA_JAWAB.every((q) => t1.includes(q.t)), 'faq belum diisi pengurus: memakai daftar bawaan (landingData.js)');
  const t2 = teks(h(TanyaJawab, { faq: [{ pertanyaan: 'Apakah ada iuran khusus Fase 2?', jawaban: 'Ada, diatur Pembina lewat Kelola Beranda.' }] }));
  ok(t2.includes('Apakah ada iuran khusus Fase 2?') && t2.includes('diatur Pembina lewat Kelola Beranda') && !TANYA_JAWAB.some((q) => t2.includes(q.t)), 'faq diisi pengurus: menggantikan seluruh daftar bawaan, bukan menambahkannya');
}

console.log('\n--- Klien publik (tanpa login) ---');
{
  ok(alamatRpc('https://abc.supabase.co/', 'sg_beranda_publik') === 'https://abc.supabase.co/rest/v1/rpc/sg_beranda_publik' && alamatRpc(' https://abc.supabase.co ', 'f') === 'https://abc.supabase.co/rest/v1/rpc/f', 'alamatRpc: garis miring ganda dan spasi dirapikan');
  // Di uji, import.meta.env kosong: tanpa alamat proyek, panggilan gagal dengan pesan jelas dan tidak memanggil jaringan
  let dipanggil = false;
  const r = await panggilRpcPublik('sg_beranda_publik', {}, { ambil: async () => { dipanggil = true; return { ok: true, json: async () => ({}) }; } });
  ok(!r.ok && /belum diatur/.test(r.pesan) && !dipanggil, 'tanpa VITE_SUPABASE_URL: gagal jelas tanpa memanggil jaringan');
}

console.log('\n--- Berkas SEO statis ---');
{
  const robots = readFileSync(`${P}/public/robots.txt`, 'utf8');
  const peta = readFileSync(`${P}/public/sitemap.xml`, 'utf8');
  const html = readFileSync(`${P}/index.html`, 'utf8');
  const ORIGIN = 'https://sigarda.smabukateja.sch.id';
  ok(/^User-agent: \*/m.test(robots) && /^Allow: \/$/m.test(robots) && /^Disallow: \/\*\?v=$/m.test(robots) && /^Disallow: \/\*\?berkas=$/m.test(robots), 'robots.txt: semua boleh, kecuali ?v= dan ?berkas=');
  ok(robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`), 'robots.txt menunjuk sitemap');
  ok(peta.includes(`<loc>${ORIGIN}/</loc>`) && /^<\?xml/.test(peta) && peta.includes('http://www.sitemaps.org/schemas/sitemap/0.9'), 'sitemap.xml sah memuat halaman muka');
  ok(html.includes(`<link rel="canonical" href="${ORIGIN}/" />`), 'canonical mengarah ke alamat utama');
  ok(html.includes(`<meta property="og:image" content="${ORIGIN}/og-gudep.png" />`) && html.includes(`<meta name="twitter:image" content="${ORIGIN}/og-gudep.png" />`), 'gambar pratinjau Open Graph dan Twitter mengarah ke og-gudep.png');
  const judul = /<title>([^<]+)<\/title>/.exec(html)[1];
  const deskripsi = /<meta name="description" content="([^"]+)"/.exec(html)[1];
  ok(judul.includes('Pramuka') && judul.includes('Bukateja') && judul.length <= 70, `judul memuat kata kunci dan tidak terlalu panjang (${judul.length}): ${judul}`);
  ok(deskripsi.includes('Bukateja') && deskripsi.length >= 80 && deskripsi.length <= 170, `deskripsi 80-170 karakter (${deskripsi.length})`);
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
  const tipe = ld['@graph'].map((x) => x['@type']).join();
  ok(tipe === 'WebSite,Organization' && ld['@graph'][1].parentOrganization['@type'] === 'EducationalOrganization' && ld['@graph'][1].address.addressLocality === 'Bukateja', 'data terstruktur JSON-LD sah: WebSite dan Organization (induk: sekolah)');
  ok(!/telephone|email|nta|nip/i.test(JSON.stringify(ld)), 'data terstruktur tidak memuat telepon, email, atau NTA');
  const origins = new Set([...(html + robots + peta).matchAll(/https:\/\/sigarda\.[a-z.]+/g)].map((m) => m[0]));
  ok(origins.size === 1 && origins.has(ORIGIN), 'satu alamat utama yang sama di index.html, robots.txt, dan sitemap.xml');
  const png = readFileSync(`${P}/public/og-gudep.png`);
  ok(png.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630 && png.length < 300 * 1024, `og-gudep.png: PNG 1200x630 (${(png.length / 1024).toFixed(0)} kB)`);
}

console.log('\n--- Sampul dan tombol "Muat berita lebih lama" ---');
{
  const satu = (i, sampulUrl = '') => ({ kategori: 'kegiatan', judul: `Berita ${i}`, ringkasan: 'r', isi: 'Isi satu.\n\nIsi dua.', sampulUrl, terbitPada: '2026-09-20' });
  const enam = Array.from({ length: 6 }, (_, i) => satu(i + 1));
  const fungsi = () => {};
  const t0 = teks(h(Berita, { berita: enam, adaLagi: true }));
  ok(!t0.includes('Muat berita lebih lama') && !t0.includes('Semua berita sudah ditampilkan'), 'tanpa onMuatLagi (prarender): tidak ada tombol maupun pesan');
  const t1 = teks(h(Berita, { berita: enam, adaLagi: true, onMuatLagi: fungsi }));
  ok(t1.includes('Muat berita lebih lama') && !t1.includes('disabled=""'), 'ada berita dan masih ada yang lebih lama: tombol "Muat berita lebih lama" tampil dan aktif');
  ok(teks(h(Berita, { berita: enam, adaLagi: true, memuatLagi: true, onMuatLagi: fungsi })).includes('Memuat...') && teks(h(Berita, { berita: enam, adaLagi: true, memuatLagi: true, onMuatLagi: fungsi })).includes('disabled=""'), 'sedang memuat: tombol menjadi "Memuat..." dan tidak dapat ditekan dua kali');
  ok(teks(h(Berita, { berita: enam, adaLagi: true, galatLagi: true, onMuatLagi: fungsi })).includes('belum dapat dimuat'), 'gagal memuat: pesan galat tampil dan tombol tetap ada untuk mencoba lagi');
  const t2 = teks(h(Berita, { berita: [...enam, satu(7)], adaLagi: false, onMuatLagi: fungsi }));
  ok(!t2.includes('Muat berita lebih lama') && t2.includes('Semua berita sudah ditampilkan'), 'sudah habis (lebih dari 6 tampil, adaLagi false): tombol hilang, pesan "Semua berita sudah ditampilkan"');
  ok(!teks(h(Berita, { berita: [satu(1), satu(2)], adaLagi: false, onMuatLagi: fungsi })).includes('Semua berita sudah ditampilkan'), 'hanya beberapa berita sejak awal: tidak ada pesan yang tak perlu');
  ok(!teks(h(Berita, { berita: [], onMuatLagi: fungsi, adaLagi: true })).includes('Muat berita lebih lama'), 'belum ada berita: tanpa tombol');

  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456';
  const tb = teks(h(Berita, { berita: [satu(1, `https://drive.google.com/file/d/${id}/view?usp=sharing`), satu(2, `https://drive.google.com/file/d/${id}/view`)] }));
  ok(tb.includes(`src="https://lh3.googleusercontent.com/d/${id}=w1000"`), 'sampul tautan berbagi Drive dipasang sebagai alamat gambar langsung (lh3)');
  ok(tb.includes('referrerPolicy="no-referrer"') || tb.includes('referrerpolicy="no-referrer"'), 'gambar dipasang tanpa Referer (Google tidak menolak pemasangan di situs lain)');
  const kartuPertama = tb.slice(tb.indexOf('<article'), tb.indexOf('</article>'));
  ok(/<img[^>]*aspect-\[16\/10\]/.test(kartuPertama) && !/sm:aspect-auto/.test(kartuPertama), 'sampul kartu: rasio tetap, tidak ikut memanjang saat "Baca selengkapnya" dibuka');
  ok(!tb.includes('sm:col-span-2') && !tb.includes('sm:flex-row') && !tb.includes('items-start'), 'semua kartu berita berukuran sama: tidak ada kartu besar yang melebar, baris grid meregang sama tinggi');
  const tp = teks(h(Berita, { berita: [satu(1, 'https://photos.app.goo.gl/AbCdEf123'), satu(2, 'https://drive.google.com/drive/folders/abcdefghijklmnopqrst')] }));
  ok(!tp.includes('<img') && tp.includes('aria-hidden="true"'), 'sampul berupa tautan halaman (Photos berbagi, folder Drive): tanpa <img>, memakai gambar pengganti');
  const tg = teks(h(Galeri, { galeri: [{ judul: 'Album A', tautan: 'https://photos.app.goo.gl/x', sampulUrl: `https://drive.google.com/open?id=${id}`, kelompok: 'lainnya' }, { judul: 'Album B', tautan: 'https://photos.app.goo.gl/y', sampulUrl: 'https://photos.app.goo.gl/z', kelompok: 'lainnya' }] }));
  ok(tg.includes(`src="https://lh3.googleusercontent.com/d/${id}=w1000"`) && (tg.match(/<img/g) ?? []).length === 1, 'galeri: sampul Drive tampil sebagai gambar; sampul berupa halaman Photos memakai gambar pengganti');
}

console.log(`\nRINGKASAN LANDING: ${lulus} lulus, ${gagal} GAGAL.`);
if (gagal) process.exit(1);
