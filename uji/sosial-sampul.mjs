// Gambar pratinjau otomatis Instagram/TikTok: fungsi server `sosial-sampul` (membaca og:image, keamanan pengalihan dan host gambar, isi berkas, penyalinan ke
// Storage, pembersihan salinan yatim, hak pengurus dibandingkan langsung dengan SQL), cermin klien (platformSampul), pemanggil api().ambilSampulSosial, dan
// penyambungan di formulir Media Sosial (otomatis saat menempel tautan, dan "Lengkapi gambar otomatis" untuk kiriman yang sudah tampil di beranda).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh, isiStatusContoh } from '../src/lokal/seedLokal.js';
import { platformSampul as platformKlien, bisaAmbilSampulSosial, perluAmbilSampulSosial, kirimanTanpaGambar } from '../src/lib/sosialSampulLogic.js';
import { BATAS_GAMBAR, UMUR_YATIM_MS, ambilGambarPostingan, ambilMeta, hostGambarSah, jenisGambar, namaBerkas, pengurusAktif, pilihUntukDibuang, platformSampul, tangani } from '../supabase/functions/sosial-sampul/index.ts';
import { buatApi } from '../src/lib/api.js';
import { kandidatGambar } from '../src/lib/berandaLogic.js';

let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const P = process.cwd().replace(/\\/g, '/');

const IG = 'https://www.instagram.com/reel/CUbHfhpswxt/?igsh=abc';
const IG_SHARE = 'https://www.instagram.com/share/reel/BAabc123xyz';
const TT = 'https://www.tiktok.com/@gudep.bukateja/video/7412345678901234567';
const TT_PENDEK = 'https://vt.tiktok.com/ZSabc123/';
const GAMBAR_IG = 'https://scontent.cdninstagram.com/v/t51.82787-15/649141724_n.jpg?stp=dst-jpg_e35_s640x640&_nc_cat=106&oe=6ADB4F79';
const GAMBAR_TT = 'https://p16-common-sign.tiktokcdn.com/tos-maliva-p-0068/2367c7d45cf54a~tplv-photomode-video-share-card:1200:630:20.jpeg?x-expires=1823918400&x-signature=Z56';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const WEBP = new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0))));
const HTML = (og) => `<!doctype html><html><head><meta property="og:title" content="Gudep"><meta property="og:image" content="${og.replace(/&/g, '&amp;')}"></head><body></body></html>`;

console.log('--- Cermin klien dan server: tautan yang dapat diambil gambarnya ---');
{
  const kisi = [IG, IG_SHARE, TT, TT_PENDEK, 'https://instagram.com/p/ABCDE12345/', 'https://instagr.am/p/ABCDE12345', 'https://m.tiktok.com/v/123.html', 'https://vm.tiktok.com/ZS1/',
    'https://WWW.INSTAGRAM.COM/p/ABCDE12345/', 'http://www.instagram.com/p/ABCDE12345/', 'https://www.instagram.com.evil.com/p/x', 'https://evil.com/instagram.com/p/x',
    'https://user@www.instagram.com/p/x', 'https://www.instagram.com:8443/p/x', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.facebook.com/x/videos/1',
    'https://lite.tiktok.com/x', 'javascript:alert(1)', '', null, undefined, 42, ['x']];
  const beda = kisi.filter((k) => platformKlien(k) !== platformSampul(k));
  ok(beda.length === 0, `klien dan fungsi server sepakat pada ${kisi.length} tautan${beda.length ? ' (beda: ' + JSON.stringify(beda) + ')' : ''}`);
  ok(platformKlien(IG) === 'instagram' && platformKlien(TT) === 'tiktok' && platformKlien(TT_PENDEK) === 'tiktok' && platformKlien('https://www.youtube.com/watch?v=dQw4w9WgXcQ') === '' && platformKlien('http://www.instagram.com/p/ABCDE12345/') === '' && platformKlien('https://www.instagram.com.evil.com/p/x') === '', 'hanya https Instagram/TikTok; YouTube (sudah otomatis), http, dan host mirip-mirip ditolak');
  ok(bisaAmbilSampulSosial(IG) && bisaAmbilSampulSosial(IG_SHARE) && bisaAmbilSampulSosial(TT) && bisaAmbilSampulSosial(TT_PENDEK) && !bisaAmbilSampulSosial('https://www.instagram.com/gudep.bukateja/') && !bisaAmbilSampulSosial('https://www.tiktok.com/@gudep.bukateja'), 'tautan postingan (termasuk tautan Bagikan baru dan tautan pendek) diambil; tautan profil tidak');
  ok(perluAmbilSampulSosial({ tautan: IG, gambarUrl: '' }) && perluAmbilSampulSosial({ tautan: TT, gambarUrl: '  ' }), 'postingan tanpa gambar: perlu diambil');
  ok(!perluAmbilSampulSosial({ tautan: IG, gambarUrl: 'https://drive.google.com/file/d/abc/view' }) && !perluAmbilSampulSosial({ tautan: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', gambarUrl: '' }) && !perluAmbilSampulSosial({ tautan: '', gambarUrl: '' }), 'gambar sudah diisi (manual menang), YouTube, atau tautan kosong: tidak diambil');
  ok(!perluAmbilSampulSosial({ tautan: IG, gambarUrl: '' }, IG) && !perluAmbilSampulSosial({ tautan: ` ${IG}`, gambarUrl: '' }, IG) && perluAmbilSampulSosial({ tautan: TT, gambarUrl: '' }, IG), 'tautan yang sudah dicoba tidak diminta ulang; tautan lain diminta');
  const daftar = [
    { id: 1, tautan: IG, gambarUrl: '', dibuatOleh: 'a' }, { id: 2, tautan: TT, gambarUrl: 'https://x.id/a.jpg', dibuatOleh: 'a' }, { id: 3, tautan: 'https://youtu.be/dQw4w9WgXcQ', gambarUrl: '', dibuatOleh: 'a' },
    { id: 4, tautan: TT_PENDEK, gambarUrl: '', dibuatOleh: 'b' }, { id: 5, tautan: 'https://www.instagram.com/gudep/', gambarUrl: '', dibuatOleh: 'a' },
  ];
  ok(kirimanTanpaGambar(daftar, () => true).map((s) => s.id).join() === '1,4', 'kiriman tersimpan yang dilengkapi: hanya postingan Instagram/TikTok tanpa gambar');
  ok(kirimanTanpaGambar(daftar, (s) => s.dibuatOleh === 'a').map((s) => s.id).join() === '1' && kirimanTanpaGambar(null, () => true).length === 0, 'hanya kiriman yang boleh diubah pengguna itu (Dewan: miliknya sendiri)');
}

console.log('\n--- Fungsi server: membaca halaman dan memeriksa gambar ---');
{
  ok(ambilMeta(HTML(GAMBAR_IG), 'og:image') === GAMBAR_IG && ambilMeta(`<meta content="${GAMBAR_TT}" name="og:image">`, 'og:image') === GAMBAR_TT, 'og:image terbaca (entitas &amp; dibuka; property= atau name=, urutan bebas)');
  ok(ambilMeta('<meta property="og:image:width" content="600">', 'og:image') === '' && ambilMeta(null, 'og:image') === '', 'og:image:width bukan og:image; kosong = kosong');
  ok(hostGambarSah('instagram', GAMBAR_IG) && hostGambarSah('instagram', 'https://instagram.fsub1-1.fna.fbcdn.net/v/t51/x.jpg') && hostGambarSah('tiktok', GAMBAR_TT) && hostGambarSah('tiktok', 'https://p77-sign.tiktokcdn-us.com/x.jpeg'), 'CDN gambar Instagram (cdninstagram, fbcdn) dan TikTok (tiktokcdn) diterima');
  const jahat = [['instagram', 'https://static.cdninstagram.com/rsrc.php/v3/logo.png'], ['instagram', 'https://scontent.cdninstagram.com/rsrc.php/x.png'], ['instagram', GAMBAR_TT], ['tiktok', GAMBAR_IG],
    ['instagram', 'http://scontent.cdninstagram.com/x.jpg'], ['instagram', 'https://cdninstagram.com.evil.com/x.jpg'], ['tiktok', 'https://evil.com/tiktokcdn.com/x.jpg'], ['tiktok', 'https://127.0.0.1/x.jpg'],
    ['instagram', 'https://a@scontent.cdninstagram.com/x.jpg'], ['tiktok', 'https://p16.tiktokcdn.com:8443/x.jpg'], ['youtube', 'https://i.ytimg.com/vi/x/hq.jpg'], ['instagram', ''], ['tiktok', null]];
  ok(jahat.every(([p, u]) => !hostGambarSah(p, u)), 'logo umum Instagram, CDN platform lain, http, host mirip-mirip, alamat internal, dan port lain ditolak');
  ok(jenisGambar(JPEG)?.ext === 'jpg' && jenisGambar(PNG)?.ext === 'png' && jenisGambar(WEBP)?.ext === 'webp', 'JPEG, PNG, WebP dikenali dari isi berkas');
  ok(jenisGambar(new TextEncoder().encode('<html><body>login</body></html>')) === null && jenisGambar(new TextEncoder().encode('<svg onload=alert(1)>....')) === null && jenisGambar(new Uint8Array(3)) === null, 'HTML, SVG (dapat memuat skrip), dan berkas terpotong bukan gambar');
  ok(namaBerkas('instagram', 'https://www.instagram.com/reel/CUbHfhpswxt/', 'jpg', 1000) === 'instagram/CUbHfhpswxt-1000.jpg' && namaBerkas('tiktok', TT, 'jpg', 5) === 'tiktok/7412345678901234567-5.jpg', 'nama berkas dari kode postingan dan waktu');
  ok(namaBerkas('tiktok', 'https://www.tiktok.com/t/../../etc', 'png', 7) === 'tiktok/postingan-7.png' && namaBerkas('instagram', 'bukan url', 'jpg', 7) === 'instagram/postingan-7.jpg' && namaBerkas('instagram', 'https://www.instagram.com/p/a%2F..%2Fb/', 'jpg', 7) === 'instagram/postingan-7.jpg', 'kode aneh atau tanpa kode: nama aman "postingan" (tidak dapat keluar dari folder)');
}

console.log('\n--- Fungsi server: pengalihan, batas, dan isi berkas ---');
{
  const catat = (peta) => { const dipanggil = []; const ambil = async (u, opsi) => { dipanggil.push(u); ambil.ua = opsi?.headers?.['User-Agent']; ambil.redirect = opsi?.redirect; const r = peta(u); if (r instanceof Error) throw r; return r; }; ambil.dipanggil = dipanggil; return ambil; };
  const alih = (ke, kode = 302) => new Response(null, { status: kode, headers: { location: ke } });
  const halaman = (og) => new Response(HTML(og), { status: 200, headers: { 'content-type': 'text/html' } });
  const berkas = (isi = JPEG, tipe = 'image/jpeg') => new Response(isi, { status: 200, headers: { 'content-type': tipe } });

  let f = catat((u) => (u === IG ? halaman(GAMBAR_IG) : u === GAMBAR_IG ? berkas() : new Response('x', { status: 404 })));
  let r = await ambilGambarPostingan(IG, f, 1000);
  ok(r.tipe === 'image/jpeg' && r.path === 'instagram/CUbHfhpswxt-1000.jpg' && r.isi.length === JPEG.length && f.dipanggil.join() === `${IG},${GAMBAR_IG}`, 'Instagram: halaman dibaca, gambar og:image diunduh (dua permintaan saja)');
  ok(/facebookexternalhit/.test(f.ua) && f.redirect === 'manual', 'meminta sebagai perayap pratinjau tautan, pengalihan diikuti manual');
  f = catat((u) => (u === TT_PENDEK ? alih(TT) : u === TT ? halaman(GAMBAR_TT) : u === GAMBAR_TT ? berkas(WEBP, 'image/webp') : new Response('x', { status: 404 })));
  r = await ambilGambarPostingan(TT_PENDEK, f, 9);
  ok(r.tipe === 'image/webp' && r.path === 'tiktok/7412345678901234567-9.webp', 'TikTok tautan pendek: dialihkan ke halaman video, kode diambil dari alamat akhir, jenis dari isi berkas');
  f = catat((u) => (u === IG_SHARE ? alih('/reel/CUbHfhpswxt/') : u === 'https://www.instagram.com/reel/CUbHfhpswxt/' ? halaman(GAMBAR_IG) : berkas()));
  ok((await ambilGambarPostingan(IG_SHARE, f, 1)).path === 'instagram/CUbHfhpswxt-1.jpg', 'tautan Bagikan baru Instagram: pengalihan relatif diikuti sampai postingannya');
  f = catat((u) => (u === IG ? alih('http://169.254.169.254/latest/meta-data') : halaman(GAMBAR_IG)));
  r = await ambilGambarPostingan(IG, f);
  ok(!!r.galat && f.dipanggil.length === 1, 'pengalihan halaman ke alamat internal DITOLAK sebelum diminta');
  f = catat((u) => (u === TT ? alih(IG) : halaman(GAMBAR_IG)));
  ok(!!(await ambilGambarPostingan(TT, f)).galat && f.dipanggil.length === 1, 'pengalihan TikTok ke platform lain (walau Instagram) tidak diikuti');
  f = catat((u) => (u === IG ? halaman(GAMBAR_IG) : u === GAMBAR_IG ? alih('https://evil.com/x.jpg') : berkas()));
  r = await ambilGambarPostingan(IG, f);
  ok(!!r.galat && !f.dipanggil.some((u) => /evil/.test(u)), 'pengalihan gambar ke luar CDN platform tidak diikuti');
  f = catat((u) => (u === IG ? halaman('https://evil.com/foto.jpg') : berkas()));
  r = await ambilGambarPostingan(IG, f);
  ok(/tidak ditemukan/.test(r.galat) && f.dipanggil.length === 1, 'og:image di luar CDN Instagram tidak pernah diunduh');
  f = catat(() => halaman('https://static.cdninstagram.com/rsrc.php/v3/yx/r/logo.png'));
  ok(/postingan Instagram itu publik/.test((await ambilGambarPostingan(IG, f)).galat), 'halaman masuk Instagram (logo umum, akun privat): pesan menuntun, bukan logo yang disimpan');
  f = catat(() => new Response('<html></html>', { status: 200 }));
  ok(/tidak ditemukan/.test((await ambilGambarPostingan(TT, f)).galat), 'halaman tanpa og:image: pesan menuntun');
  f = catat((u) => (u === IG ? halaman(GAMBAR_IG) : berkas(new TextEncoder().encode('<html>bukan gambar</html>'), 'image/jpeg')));
  ok(/bukan gambar/.test((await ambilGambarPostingan(IG, f)).galat), 'berkas berlabel image/jpeg tetapi berisi HTML ditolak');
  f = catat((u) => (u === IG ? halaman(GAMBAR_IG) : berkas(new Uint8Array(BATAS_GAMBAR + 10).fill(0xff))));
  ok(/lebih dari 2 MB/.test((await ambilGambarPostingan(IG, f)).galat), 'gambar lebih dari 2 MB tidak disalin');
  f = catat((u) => (u === IG ? halaman(GAMBAR_IG) : new Response('x', { status: 403 })));
  ok(/403/.test((await ambilGambarPostingan(IG, f)).galat), 'gambar tidak dapat diunduh: pesan menyebut kode');
  f = catat(() => new Response('x', { status: 404 }));
  ok(/404/.test((await ambilGambarPostingan(TT, f)).galat), 'postingan tidak ada (404): pesan menyebut kode');
  f = catat(() => new Error('putus'));
  ok(/tidak dapat dihubungi/.test((await ambilGambarPostingan(TT, f)).galat), 'jaringan putus: pesan jelas tanpa melempar galat');
  f = catat((u) => alih(`${u}x`));
  r = await ambilGambarPostingan(IG, f);
  ok(/Terlalu banyak pengalihan/.test(r.galat) && f.dipanggil.length === 6, 'pengalihan tanpa akhir dihentikan (paling banyak 5)');
  f = catat(() => new Response(`${'a'.repeat(3_100_000)}${HTML(GAMBAR_IG)}`, { status: 200 }));
  ok(/tidak ditemukan/.test((await ambilGambarPostingan(IG, f)).galat), 'halaman lebih dari 3 MB dibaca hanya sampai batasnya');
}

console.log('\n--- Fungsi server: pembersihan salinan yatim ---');
{
  const dasar = 'https://abc.supabase.co/storage/v1/object/public/beranda-sosial/';
  const kini = Date.parse('2026-10-19T10:00:00Z');
  const lama = new Date(kini - UMUR_YATIM_MS - 60_000).toISOString(), baru = new Date(kini - 60_000).toISOString();
  const objek = [{ path: 'instagram/a-1.jpg', dibuat: lama }, { path: 'instagram/b-1.jpg', dibuat: lama }, { path: 'tiktok/c-1.jpg', dibuat: baru }, { path: 'tiktok/d-1.jpg', dibuat: null }];
  const buang = pilihUntukDibuang(objek, new Set([`${dasar}instagram/a-1.jpg`]), dasar, kini);
  ok(buang.join() === 'instagram/b-1.jpg', 'hanya salinan yang tidak dipakai kiriman mana pun DAN berumur > 24 jam yang dibuang (gambar formulir yang belum disimpan aman)');
  ok(pilihUntukDibuang(objek, new Set(), dasar, kini).length === 2, 'objek tanpa waktu dibuat tidak dibuang');
}

console.log('\n--- Fungsi server: tangani (hak, masukan, penyimpanan) ---');
{
  const profil = { role: 'penguji', jabatan_dewan: null, status: 'aktif', wajib_ganti_pin: false };
  const buat = (p = profil) => {
    const d = { keluar: 0, disimpan: [], dibersihkan: 0, sekarang: () => 77,
      profilDari: async (t) => (t === 'sah' ? p : null),
      ambil: async (u) => { d.keluar += 1; return u === GAMBAR_IG ? new Response(JPEG, { status: 200 }) : new Response(HTML(GAMBAR_IG), { status: 200 }); },
      simpan: async (path, isi, tipe) => { d.disimpan.push({ path, n: isi.length, tipe }); return `https://abc.supabase.co/storage/v1/object/public/beranda-sosial/${path}`; },
      bersihkan: async () => { d.dibersihkan += 1; } };
    return d;
  };
  let d = buat();
  ok((await tangani('GET', 'Bearer sah', { tautan: IG }, d)).pesan === 'Gunakan POST.' && d.keluar === 0, 'selain POST ditolak');
  ok((await tangani('POST', null, { tautan: IG }, d)).sesiBerakhir === true && (await tangani('POST', 'Bearer palsu', { tautan: IG }, d)).sesiBerakhir === true && d.keluar === 0, 'tanpa sesi atau sesi tidak sah: ditolak sebelum menghubungi Instagram');
  d = buat({ role: 'peserta', jabatan_dewan: null, status: 'aktif', wajib_ganti_pin: false });
  ok(/Hanya pengurus/.test((await tangani('POST', 'Bearer sah', { tautan: IG }, d)).pesan) && d.keluar === 0 && d.disimpan.length === 0, 'Penegak biasa ditolak sebelum menghubungi apa pun atau menyimpan');
  d = buat();
  ok(/Hanya tautan postingan Instagram atau TikTok/.test((await tangani('POST', 'Bearer sah', { tautan: 'https://evil.com/x' }, d)).pesan) && /Hanya tautan/.test((await tangani('POST', 'Bearer sah', {}, d)).pesan) && /Hanya tautan/.test((await tangani('POST', 'Bearer sah', { tautan: ['x'] }, d)).pesan) && d.keluar === 0, 'tautan selain Instagram/TikTok, kosong, atau bukan teks ditolak tanpa menghubungi apa pun');
  const b = await tangani('POST', 'Bearer sah', { tautan: ` ${IG} ` }, d);
  ok(b.ok === true && b.gambar === 'https://abc.supabase.co/storage/v1/object/public/beranda-sosial/instagram/CUbHfhpswxt-77.jpg' && Object.keys(b).sort().join() === 'gambar,ok', 'pengurus dilayani: gambar disalin, yang dikembalikan hanya alamat salinan SIGARDA');
  ok(d.disimpan.length === 1 && d.disimpan[0].tipe === 'image/jpeg' && d.disimpan[0].n === JPEG.length && d.dibersihkan === 1, 'gambar disimpan sekali dengan jenis dari isi berkas, lalu salinan yatim dibersihkan');
  ok(!JSON.stringify(b).includes('cdninstagram'), 'alamat CDN Instagram (kedaluwarsa) tidak pernah dikembalikan');
  d = buat(); d.bersihkan = async () => { throw new Error('storage sibuk'); };
  ok((await tangani('POST', 'Bearer sah', { tautan: IG }, d)).ok === true, 'pembersihan yang gagal tidak menggagalkan pengambilan');
  d = buat(); d.simpan = async () => { throw new Error('bucket penuh'); };
  const s = await tangani('POST', 'Bearer sah', { tautan: IG }, d);
  ok(s.ok === false && /gagal disimpan/.test(s.pesan) && /bucket penuh/.test(s.pesan), 'gagal menyimpan ke Storage: ok:false dengan pesan');
  d = buat(); d.ambil = async () => new Response('x', { status: 500 });
  ok((await tangani('POST', 'Bearer sah', { tautan: TT }, d)).ok === false && d.disimpan.length === 0, 'galat dari platform: tidak ada yang disimpan');
}

console.log('\n--- Hak pengurus fungsi server = sigarda.pengurus() di SQL ---');
{
  const pg = new PGlite();
  await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
  await isiDataContoh(pg);
  await isiStatusContoh(pg);
  const bandingkan = async () => {
    const baris = (await pg.query('select id, role, jabatan, jabatan_dewan, status, wajib_ganti_pin from public.profiles')).rows;
    const beda = [];
    for (const p of baris) {
      const sql = (await sqlSebagai(pg, p.id, 'select sigarda.pengurus() as b')).rows[0].b;
      if (sql !== pengurusAktif(p)) beda.push({ role: p.role, jabatan_dewan: p.jabatan_dewan, status: p.status, wajib: p.wajib_ganti_pin, sql, fungsi: pengurusAktif(p) });
    }
    return { jumlah: baris.length, beda };
  };
  await pg.query('update public.profiles set wajib_ganti_pin = false');
  let h = await bandingkan();
  ok(h.beda.length === 0 && h.jumlah > 5, `akun contoh (${h.jumlah}): fungsi dan SQL sepakat ${h.beda.length ? JSON.stringify(h.beda) : ''}`);
  await pg.query(`update public.profiles set wajib_ganti_pin = true where role = 'admin'`);
  await pg.query(`update public.profiles set status = 'nonaktif' where role = 'penguji' and jabatan = 'Pembina'`);
  await pg.query(`update public.profiles set jabatan_dewan = 'Bendahara' where role = 'peserta' and jabatan_dewan is null and nis = (select min(nis) from public.profiles where role = 'peserta' and jabatan_dewan is null)`);
  await pg.query(`update public.profiles set status = 'alumni' where role = 'peserta' and jabatan_dewan is not null and nis = (select max(nis) from public.profiles where role = 'peserta' and jabatan_dewan is not null)`);
  h = await bandingkan();
  ok(h.beda.length === 0, `sesudah wajib ganti PIN, nonaktif, alumni, dan jabatan Dewan baru: tetap sepakat ${h.beda.length ? JSON.stringify(h.beda) : ''}`);

  // Alamat salinan Storage lolos aturan gambar sg_sosial_simpan (https) dan tampil apa adanya di kartu beranda.
  const salinan = 'https://abcdefgh.supabase.co/storage/v1/object/public/beranda-sosial/instagram/CUbHfhpswxt-1760000000000.jpg';
  const pembina = (await pg.query(`select id from public.profiles where role = 'penguji' and status = 'aktif' and not wajib_ganti_pin limit 1`)).rows[0]?.id
    ?? (await pg.query(`update public.profiles set status = 'aktif' where role = 'penguji' and jabatan = 'Pembina' returning id`)).rows[0].id;
  const id = (await sqlSebagai(pg, pembina, `select public.sg_sosial_simpan(null, 'instagram', '${IG}', 'Latihan', '', true) as id`)).rows[0].id;
  await sqlSebagai(pg, pembina, `select public.sg_sosial_simpan(${id}, 'instagram', '${IG}', 'Latihan', '${salinan}', true)`);
  const tersimpan = (await pg.query(`select gambar_url, tampil, keterangan from public.beranda_sosial where id = ${id}`)).rows[0];
  ok(tersimpan.gambar_url === salinan && tersimpan.tampil === true && tersimpan.keterangan === 'Latihan', 'kiriman yang sudah tampil dilengkapi gambar lewat sg_sosial_simpan: gambar tersimpan, tampil dan keterangan tetap');
  ok(kandidatGambar(salinan).join() === salinan, 'kartu beranda memakai alamat salinan apa adanya (tanpa diubah seperti tautan Drive)');
  await pg.close();
}

console.log('\n--- api().ambilSampulSosial, mode lokal, dan formulir Media Sosial ---');
{
  const klien = (jawab) => { const k = { functions: { invoke: async (nama, opsi) => { k.dipanggil = { nama, opsi }; return jawab; } } }; return k; };
  const k1 = klien({ data: { ok: true, gambar: 'https://abc.supabase.co/storage/v1/object/public/beranda-sosial/tiktok/1-2.jpg' }, error: null });
  const r = await buatApi(k1).ambilSampulSosial(TT);
  ok(r.ok && r.gambar.endsWith('/tiktok/1-2.jpg') && k1.dipanggil.nama === 'sosial-sampul' && k1.dipanggil.opsi.body.tautan === TT, 'memanggil fungsi bernama sosial-sampul dengan tautan; alamat gambar diteruskan');
  const g = await buatApi(klien({ data: { ok: false, pesan: 'Gambar pratinjau tidak ditemukan.' }, error: null })).ambilSampulSosial(TT);
  ok(!g.ok && g.pesan === 'Gambar pratinjau tidak ditemukan.', 'pesan galat fungsi diteruskan apa adanya');
  const belum = await buatApi(klien({ data: null, error: { context: { status: 404 } } })).ambilSampulSosial(TT);
  ok(!belum.ok && /belum dipasang/.test(belum.pesan) && /sosial-sampul/.test(belum.pesan) && /diisi manual/.test(belum.pesan), 'fungsi belum di-deploy (404): pesan menuntun dan menyebut isian manual');
  const putus = await buatApi({ functions: { invoke: async () => { throw new Error('jaringan'); } } }).ambilSampulSosial(TT);
  ok(!putus.ok && typeof putus.pesan === 'string', 'galat jaringan tidak dilempar keluar');
  ok((await buatApi(klien({ data: { ok: false, pesan: 'Sesi berakhir.', sesiBerakhir: true }, error: null })).ambilSampulSosial(TT)).sesiBerakhir === true, 'penanda sesi berakhir diteruskan');

  const fake = readFileSync(`${P}/src/lokal/klienFake.js`, 'utf8');
  ok(/nama === 'sosial-sampul'/.test(fake), 'mode lokal: fungsi sosial-sampul dijawab "tidak tersedia", tidak dikirim ke fungsi sigarda');

  const panel = readFileSync(`${P}/src/components/PanelSosial.jsx`, 'utf8');
  ok(/perluAmbilSampulSosial\(form, sudahDicoba\.current\)/.test(panel) && /setTimeout\(\(\) => ambilSampul\(form\.tautan\), 800\)/.test(panel) && /Ambil ulang gambar dari postingan/.test(panel), 'formulir mengambil gambar otomatis (ditunda 800 ms, sekali per tautan) dan punya tombol ambil ulang');
  ok(/String\(f\.tautan\)\.trim\(\) !== t \? f :/.test(panel), 'hasil untuk tautan yang sudah diganti dibuang');
  ok(/kirimanTanpaGambar\(daftar, bolehUbahKiriman\)/.test(panel) && /Lengkapi gambar otomatis/.test(panel) && /simpanSosial\(\{ \.\.\.s, id: s\.id, gambarUrl: r\.gambar \}\)/.test(panel), 'kiriman yang sudah tersimpan/tampil dilengkapi lewat tombol, disimpan dengan isian lain apa adanya');
  const fungsi = readFileSync(`${P}/supabase/functions/sosial-sampul/index.ts`, 'utf8');
  ok(/redirect: 'manual'/.test(fungsi) && /AbortSignal\.timeout/.test(fungsi) && !/from\('beranda_sosial'\)\.(insert|update|delete|upsert)/.test(fungsi) && /public: true/.test(fungsi), 'fungsi: pengalihan manual, batas waktu, bucket publik, dan tidak menulis tabel kiriman (penyimpanan tetap lewat sg_sosial_simpan)');
  const bagian = readFileSync(`${P}/src/landing/bagian.jsx`, 'utf8');
  ok(!/sosial-sampul|cdninstagram|tiktokcdn/.test(bagian), 'beranda tidak menghubungi Instagram/TikTok maupun fungsi ini; hanya memuat gambar yang tersimpan');
}

console.log(`\nRINGKASAN SOSIAL-SAMPUL: ${lulus} lulus, ${gagal} GAGAL.`);
if (gagal) process.exit(1);
