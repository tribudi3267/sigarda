// Fase PWA + Notifikasi: sisi klien. Logika notifikasi (lencana, tujuan, waktu), klien Web Push (peramban dipalsukan: iOS, Android, ditolak, server belum diatur,
// Keluar), pemeriksaan versi terbit, dan pemasangan (service worker, manifest, ikon, menu, urutan Keluar).
import { readFileSync, existsSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { jumlahBelumDibaca, LABEL_JENIS, tandaiLokal, teksLencana, tujuanNotifikasi, waktuRelatif } from '../src/lib/notifikasiLogic.js';
import { aktifkanPush, berhentiPushPerangkat, daftarkanSW, keadaanPush, nonaktifkanPush, pulihkanPush, sudahBerlangganan, urlBase64KeBytes } from '../src/lib/pushClient.js';
import { adaVersiBaru, ambilVersiTerbit } from '../src/lib/versi.js';
import { LencanaMenu } from '../src/components/ui.jsx';
import { susunNotifikasi } from '../src/lib/mapDb.js';
import { bacaInti } from '../scripts/sumber.mjs';

let lulus = 0; let gagal = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const P = process.cwd().replace(/\\/g, '/');
const sumber = (f) => readFileSync(`${P}/${f}`, 'utf8');

console.log('--- Logika notifikasi ---');
{
  const daftar = susunNotifikasi([
    { id: '3', jenis: 'hasil', judul: 'A', isi: 'a', tautan: { tab: 'sku' }, dibuat: '2026-09-21T01:00:00Z', dibaca_pada: null },
    { id: '2', jenis: 'ajukan', judul: 'B', isi: '', tautan: { tab: 'antrian' }, dibuat: '2026-09-20T01:00:00Z', dibaca_pada: '2026-09-20T02:00:00Z' },
  ]);
  ok(daftar[0].id === 3 && daftar[0].dibaca === false && daftar[1].dibaca === true && daftar[1].dibacaPada, 'susunNotifikasi: id angka, dibaca dari dibaca_pada');
  ok(jumlahBelumDibaca(daftar) === 1 && jumlahBelumDibaca([]) === 0 && jumlahBelumDibaca(undefined) === 0, 'jumlahBelumDibaca');
  ok(teksLencana(0) === '' && teksLencana(1) === '1' && teksLencana(99) === '99' && teksLencana(100) === '99+', 'teksLencana: kosong untuk 0, "99+" di atas 99');
  ok(tujuanNotifikasi(daftar[0], ['beranda', 'sku']) === 'sku' && tujuanNotifikasi(daftar[0], ['beranda']) === null && tujuanNotifikasi({ tautan: {} }, ['sku']) === null && tujuanNotifikasi(null, ['sku']) === null, 'tujuanNotifikasi: hanya menu yang tersedia bagi pengguna');
  ok(tujuanNotifikasi({ tautan: { tab: ['x'] } }, ['x']) === null, 'tautan yang bukan teks diabaikan');
  const t = tandaiLokal(daftar, [3], '2026-09-21T05:00:00Z');
  ok(t[0].dibaca && t[0].dibacaPada === '2026-09-21T05:00:00Z' && daftar[0].dibaca === false, 'tandaiLokal: satu id, tidak mengubah daftar asal');
  ok(tandaiLokal(daftar).every((n) => n.dibaca) && tandaiLokal(daftar, [999]).filter((n) => !n.dibaca).length === 1, 'tandaiLokal: tanpa id = semua; id tak dikenal = tidak berubah');
  const skr = Date.parse('2026-09-21T12:00:00Z');
  ok(waktuRelatif('2026-09-21T11:59:40Z', skr) === 'baru saja' && waktuRelatif('2026-09-21T11:55:00Z', skr) === '5 menit lalu' && waktuRelatif('2026-09-21T09:00:00Z', skr) === '3 jam lalu' && waktuRelatif('2026-09-19T12:00:00Z', skr) === '2 hari lalu', 'waktuRelatif: detik, menit, jam, hari');
  ok(/2026/.test(waktuRelatif('2026-09-01T12:00:00Z', skr)) && waktuRelatif('bukan-tanggal', skr) === '', 'waktuRelatif: lebih dari seminggu memakai tanggal; masukan salah = kosong');
  ok(['ajukan', 'alih', 'mulai', 'hasil', 'pengingat', 'lama', 'sesi', 'surat'].every((j) => LABEL_JENIS[j]), 'setiap jenis notifikasi dari server punya label');
  const sqlJenis = /jenis in \(([^)]*)\)/.exec(bacaInti().split('create table public.notifikasi')[1])[1].split(',').map((x) => x.trim().replace(/'/g, ''));
  ok(sqlJenis.length === Object.keys(LABEL_JENIS).length && sqlJenis.every((j) => LABEL_JENIS[j]), 'daftar jenis pada tabel notifikasi = daftar label klien: ' + sqlJenis.join());
  const lencana = renderToStaticMarkup(h(LencanaMenu, { jumlah: 120, posisi: 'absolute -right-0.5 -top-1' }));
  ok(lencana.includes('99+') && lencana.includes('120 belum dibaca') && lencana.includes('absolute') && renderToStaticMarkup(h(LencanaMenu, { jumlah: 0 })) === '', 'LencanaMenu: 99+, teks untuk pembaca layar, tersembunyi bila 0');
}

console.log('\n--- Klien Web Push: kunci dan keadaan perangkat ---');
// Kunci contoh dari dokumentasi Web Push (base64url) dan hasil dekode yang diketahui.
const bytes = urlBase64KeBytes('AQID_-8');
ok(Array.from(bytes).join() === '1,2,3,255,239', 'urlBase64KeBytes: base64url (- dan _) didekode, padding ditambahkan');
ok(urlBase64KeBytes('').length === 0 && urlBase64KeBytes(null).length === 0, 'kunci kosong = larik kosong, tanpa galat');

const buatEnv = (o = {}) => {
  const cfg = { ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/120', platform: 'Linux armv8l', izin: 'default', standalone: false, sw: true, push: true, terdaftar: true, minta: 'granted', subAwal: false, ...o };
  const cat = { subscribe: [], unsubscribe: 0, register: [], minta: 0 };
  let sub = null;
  const buatSub = () => ({
    endpoint: 'https://push.example/abc-' + 'x'.repeat(30),
    toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'P'.repeat(87), auth: 'A'.repeat(22) } }; },
    async unsubscribe() { cat.unsubscribe += 1; sub = null; return true; },
  });
  if (cfg.subAwal) sub = buatSub();
  const reg = { pushManager: { getSubscription: async () => sub, subscribe: async (opsi) => { cat.subscribe.push(opsi); sub = buatSub(); return sub; } } };
  const navigator = { userAgent: cfg.ua, platform: cfg.platform, maxTouchPoints: cfg.platform === 'MacIntel' ? 5 : 0 };
  if (cfg.standalone === 'ios') navigator.standalone = true;
  if (cfg.sw) navigator.serviceWorker = { getRegistration: async () => (cfg.terdaftar ? reg : undefined), ready: Promise.resolve(reg), register: async (u, opsi) => { cat.register.push([u, opsi]); return reg; } };
  const env = { navigator, matchMedia: () => ({ matches: cfg.standalone === true }) };
  if (cfg.push) env.PushManager = function PushManager() {};
  env.Notification = { permission: cfg.izin, requestPermission: async () => { cat.minta += 1; return cfg.minta; } };
  return { env, cat, sub: () => sub };
};
const ANDROID = buatEnv();
ok(keadaanPush(ANDROID.env).dukung && !keadaanPush(ANDROID.env).perluPasang && keadaanPush(ANDROID.env).izin === 'default', 'Android Chrome: didukung, izin belum ditanyakan');
const IOS = buatEnv({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605', platform: 'iPhone' });
ok(!keadaanPush(IOS.env).dukung && keadaanPush(IOS.env).perluPasang && keadaanPush(IOS.env).ios, 'iPhone di Safari (belum dipasang): belum didukung, perlu "Tambah ke Layar Utama"');
const IOSPASANG = buatEnv({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone', standalone: 'ios' });
ok(keadaanPush(IOSPASANG.env).dukung && !keadaanPush(IOSPASANG.env).perluPasang && keadaanPush(IOSPASANG.env).terpasang, 'iPhone dari layar utama (standalone): didukung');
const IPAD = buatEnv({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', platform: 'MacIntel' });
ok(keadaanPush(IPAD.env).perluPasang, 'iPadOS yang menyamar sebagai Mac (layar sentuh): dikenali sebagai iOS');
ok(!keadaanPush(buatEnv({ sw: false }).env).dukung && !keadaanPush(buatEnv({ push: false }).env).dukung, 'tanpa Service Worker atau PushManager: tidak didukung');
ok(keadaanPush({ navigator: {} }).izin === 'tidak-ada', 'tanpa Notification: izin "tidak-ada"');

console.log('\n--- Klien Web Push: mengaktifkan ---');
const apiPalsu = (o = {}) => {
  const c = { simpan: [], hapus: [] };
  return {
    c,
    kunciPush: async () => (o.kunciGalat ? { ok: false, pesan: 'galat server' } : { ok: true, data: 'kunci' in o ? o.kunci : 'AQID_-8' }),
    simpanPush: async (d) => { c.simpan.push(d); return o.simpanGagal ? { ok: false, pesan: 'ditolak' } : { ok: true }; },
    hapusPush: async (e) => { c.hapus.push(e); return o.hapusGagal ? { ok: false, pesan: 'offline' } : { ok: true }; },
  };
};
{
  const a = apiPalsu(); const e = buatEnv();
  const r = await aktifkanPush(a, e.env);
  ok(r.ok && e.cat.minta === 1 && e.cat.subscribe.length === 1 && e.cat.subscribe[0].userVisibleOnly === true && Array.from(e.cat.subscribe[0].applicationServerKey).join() === '1,2,3,255,239', 'aktifkan: izin diminta, berlangganan dengan kunci VAPID server, userVisibleOnly');
  ok(a.c.simpan.length === 1 && a.c.simpan[0].endpoint.startsWith('https://push.example/') && a.c.simpan[0].p256dh.length === 87 && a.c.simpan[0].auth.length === 22 && a.c.simpan[0].agen.includes('Android'), 'perangkat dikirim ke server: endpoint, kunci p256dh dan auth, agen');
  ok(await sudahBerlangganan(e.env), 'sudahBerlangganan: ya');
}
{
  const a = apiPalsu(); const e = buatEnv({ subAwal: true });
  await aktifkanPush(a, e.env);
  ok(e.cat.subscribe.length === 0 && a.c.simpan.length === 1, 'sudah berlangganan di peramban: tidak berlangganan ganda, hanya disimpan ulang ke server');
}
{
  const r = await aktifkanPush(apiPalsu(), IOS.env);
  ok(!r.ok && /Tambah ke Layar Utama/.test(r.pesan) && IOS.cat.minta === 0, 'iPhone belum dipasang: penjelasan cara memasang, izin tidak diminta');
  const r2 = await aktifkanPush(apiPalsu(), buatEnv({ sw: false }).env);
  ok(!r2.ok && /belum mendukung/.test(r2.pesan), 'peramban tanpa dukungan: pesan jelas');
  const d = buatEnv({ izin: 'denied' });
  const r3 = await aktifkanPush(apiPalsu(), d.env);
  ok(!r3.ok && /diblokir/.test(r3.pesan) && d.cat.minta === 0, 'izin sudah ditolak sebelumnya: petunjuk membuka pengaturan situs, tidak meminta lagi');
  const r4 = await aktifkanPush(apiPalsu({ kunci: null }), buatEnv().env);
  ok(!r4.ok && /belum diaktifkan di server/.test(r4.pesan), 'server belum diatur (kunci kosong): pesan, izin tidak diminta');
  const w = buatEnv();
  await aktifkanPush(apiPalsu({ kunci: null }), w.env);
  ok(w.cat.minta === 0, 'izin tidak diminta bila server belum siap');
  const r5 = await aktifkanPush(apiPalsu({ kunciGalat: true }), buatEnv().env);
  ok(!r5.ok && r5.pesan === 'galat server', 'galat server saat mengambil kunci diteruskan');
  const u = buatEnv({ minta: 'denied' });
  const r6 = await aktifkanPush(apiPalsu(), u.env);
  ok(!r6.ok && /Izin notifikasi tidak diberikan/.test(r6.pesan) && u.cat.subscribe.length === 0, 'pengguna menolak permintaan izin: tidak berlangganan');
  const t = buatEnv({ terdaftar: false });
  const r7 = await aktifkanPush(apiPalsu(), t.env);
  ok(!r7.ok && /Muat ulang/.test(r7.pesan), 'service worker belum terdaftar (mode lokal atau baru dibuka): pesan muat ulang');
  const r8 = await aktifkanPush(apiPalsu({ simpanGagal: true }), buatEnv().env);
  ok(!r8.ok && r8.pesan === 'ditolak', 'server menolak menyimpan perangkat: pesan server');
}

console.log('\n--- Klien Web Push: mematikan, masuk, dan Keluar ---');
{
  const a = apiPalsu(); const e = buatEnv({ subAwal: true, izin: 'granted' });
  const r = await nonaktifkanPush(a, e.env);
  ok(r.ok && a.c.hapus.length === 1 && e.cat.unsubscribe === 1 && !(await sudahBerlangganan(e.env)), 'matikan: dihapus di server lalu berhenti berlangganan di peramban');
  const kosong = await nonaktifkanPush(apiPalsu(), buatEnv().env);
  ok(kosong.ok, 'matikan saat memang tidak berlangganan: tidak galat');
  const offline = apiPalsu({ hapusGagal: true }); const e2 = buatEnv({ subAwal: true, izin: 'granted' });
  const r2 = await nonaktifkanPush(offline, e2.env);
  ok(!r2.ok && e2.cat.unsubscribe === 1, 'server tidak terjangkau: peramban tetap berhenti berlangganan (perangkat tidak lagi menerima push)');
}
{
  const a = apiPalsu(); const e = buatEnv({ izin: 'granted' });
  const r = await pulihkanPush(a, e.env);
  ok(r.ok && r.diaktifkan && e.cat.minta === 0 && a.c.simpan.length === 1, 'masuk (izin sudah ada): langganan diaktifkan kembali untuk akun yang masuk, tanpa meminta izin');
  const b = apiPalsu(); const e2 = buatEnv({ izin: 'default' });
  const r2 = await pulihkanPush(b, e2.env);
  ok(r2.ok && !r2.diaktifkan && e2.cat.minta === 0 && b.c.simpan.length === 0, 'masuk tanpa izin sebelumnya: tidak melakukan apa-apa dan tidak memunculkan permintaan izin');
  const r3 = await pulihkanPush(apiPalsu({ kunci: null }), buatEnv({ izin: 'granted' }).env);
  ok(r3.ok && !r3.diaktifkan, 'masuk saat server belum mengatur push: diam');
  const r4 = await pulihkanPush(apiPalsu(), buatEnv({ izin: 'granted', terdaftar: false }).env);
  ok(r4.ok && !r4.diaktifkan, 'masuk tanpa service worker: diam');
  const r5 = await pulihkanPush(apiPalsu(), IOS.env);
  ok(r5.ok && !r5.diaktifkan, 'masuk di iPhone yang belum dipasang: diam');
}
{
  const a = apiPalsu(); const e = buatEnv({ subAwal: true, izin: 'granted' });
  const r = await berhentiPushPerangkat(a, e.env);
  ok(r.ok && a.c.hapus.length === 1 && e.cat.unsubscribe === 1, 'Keluar: langganan perangkat dihapus di server dan di peramban');
  const menggantung = { ...apiPalsu(), hapusPush: () => new Promise(() => {}) };
  const mulai = Date.now();
  const r2 = await berhentiPushPerangkat(menggantung, buatEnv({ subAwal: true, izin: 'granted' }).env, 60);
  ok(!r2.ok && Date.now() - mulai < 1500, 'Keluar tidak tertahan koneksi yang menggantung (dibatasi waktu)');
  const t0 = Date.now();
  const r3 = await berhentiPushPerangkat(apiPalsu(), buatEnv({ sw: false }).env);
  ok(r3.ok && Date.now() - t0 < 500, 'Keluar tanpa dukungan push (mis. mode lokal): langsung, tanpa menunggu');
  const t1 = Date.now();
  const r4 = await berhentiPushPerangkat(apiPalsu(), buatEnv({ terdaftar: false }).env);
  ok(r4.ok && Date.now() - t1 < 500, 'Keluar saat service worker tidak terdaftar: langsung');
  const reg = await daftarkanSW('/sigarda/', ANDROID.env);
  ok(reg && ANDROID.cat.register[0][0] === '/sigarda/sw.js' && ANDROID.cat.register[0][1].scope === '/sigarda/', 'daftarkanSW: memakai alamat dasar (mis. /sigarda/)');
  ok((await daftarkanSW('/', { navigator: {} })) === null, 'daftarkanSW tanpa dukungan: null');
}

console.log('\n--- Versi terbit ---');
{
  ok(adaVersiBaru('abc', 'abd') && !adaVersiBaru('abc', 'abc') && !adaVersiBaru('', 'abd') && !adaVersiBaru('abc', null), 'adaVersiBaru: beda ID; tanpa ID lokal (dev/lokal) atau tanpa jawaban = tidak ada');
  let dipanggil = '';
  const ambil = async (u, o) => { dipanggil = u + '|' + o.cache; return { ok: true, json: async () => ({ id: 'v2' }) }; };
  ok((await ambilVersiTerbit('/x/', ambil)) === 'v2' && dipanggil.startsWith('/x/version.json?t=') && dipanggil.endsWith('|no-store'), 'ambilVersiTerbit: version.json di alamat dasar, tanpa cache');
  ok((await ambilVersiTerbit('/', async () => ({ ok: false }))) === null && (await ambilVersiTerbit('/', async () => { throw new Error('offline'); })) === null && (await ambilVersiTerbit('/', async () => ({ ok: true, json: async () => ({}) }))) === null, 'gagal, offline, atau berkas tanpa id: null');
}

console.log('\n--- Pemasangan PWA dan aplikasi ---');
{
  const sw = sumber('public/sw.js');
  ok(/addEventListener\('push'/.test(sw) && /addEventListener\('notificationclick'/.test(sw) && /showNotification/.test(sw), 'sw.js: menangani push dan klik notifikasi');
  ok(!/addEventListener\('fetch'/.test(sw) && !/\bcaches\b/.test(sw), 'sw.js: TIDAK ada fetch handler dan TIDAK ada cache (data tidak tersimpan di perangkat)');
  ok(/buka-notifikasi/.test(sw) && /notifikasi-baru/.test(sw) && /\?buka=notifikasi/.test(sw), 'sw.js: pesan ke aplikasi terbuka dan alamat ?buka=notifikasi saat aplikasi tertutup');
  ok(!/lulus|ulang/i.test(sw.replace(/ulang\(/g, '')), 'sw.js tidak memuat teks hasil penilaian');
  const m = JSON.parse(sumber('public/manifest.webmanifest'));
  ok(m.name && m.short_name === 'SIGARDA' && m.display === 'standalone' && m.start_url === './' && m.scope === './' && /^#[0-9a-f]{6}$/i.test(m.theme_color) && /^#[0-9a-f]{6}$/i.test(m.background_color), 'manifest: nama, standalone, alamat relatif (jalan di alamat dasar mana pun), warna');
  const png = (f) => { const b = readFileSync(`${P}/public/${f}`); return { ok: b.slice(1, 4).toString() === 'PNG', w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
  for (const i of m.icons) {
    const [w, hh] = i.sizes.split('x').map(Number); const info = existsSync(`${P}/public/${i.src}`) ? png(i.src) : {};
    ok(info.ok && info.w === w && info.h === hh, `ikon ${i.src} (${i.purpose}): PNG ${w}x${hh} ada`);
  }
  ok(m.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512') && m.icons.some((i) => i.purpose === 'any' && i.sizes === '192x192') && m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any'), 'ikon 192 dan 512 (any) serta 512 (maskable) tersedia');
  ok(png('apple-touch-icon.png').w === 180, 'apple-touch-icon 180x180 ada');
  const html = sumber('index.html');
  ok(/rel="manifest" href="\/manifest\.webmanifest"/.test(html) && /rel="apple-touch-icon"/.test(html) && /apple-mobile-web-app-capable/.test(html), 'index.html: manifest, ikon iOS, dan tanda aplikasi web');
  const vite = sumber('vite.config.js');
  ok(/version\.json/.test(vite) && /__BUILD_ID__/.test(vite) && /command === 'build' && mode !== 'lokal'/.test(vite), 'vite.config.js: menerbitkan version.json dan ID build hanya pada build produksi');
  const ctx = sumber('src/context/AppContext.jsx');
  const iLogout = ctx.indexOf('const logout = async () => {');
  const blok = ctx.slice(iLogout, iLogout + 300);
  ok(blok.indexOf('berhentiPushPerangkat') > 0 && blok.indexOf('berhentiPushPerangkat') < blok.indexOf('api()?.keluar()'), 'Keluar: langganan push dihentikan SEBELUM sesi ditutup (masih berwenang menghapus di server)');
  ok(/pulihkanPush\(api\(\)\)/.test(ctx), 'masuk dan sesi yang dipulihkan: langganan perangkat diaktifkan kembali');
  ok(/muatNotifikasi/.test(ctx) && /JEDA_NOTIFIKASI_MS/.test(ctx), 'Kotak Notifikasi dimuat saat masuk dan ditarik berkala');
  const main = sumber('src/main.jsx');
  ok(/import\.meta\.env\.PROD/.test(main) && /daftarkanSW/.test(main), 'service worker hanya didaftarkan pada build terbit');
  const app = sumber('src/App.jsx');
  ok((app.match(/, notifikasi(, bantuan)?\] \}/g) ?? []).length === 3 && /tabAktif === 'notifikasi'/.test(app) && /buka=notifikasi|params\.get\('buka'\)/.test(app) && /<BannerVersi \/>/.test(app), 'menu Notifikasi untuk ketiga peran, halaman, pembukaan dari klik notifikasi, dan banner versi baru');
  ok(/LencanaMenu/.test(sumber('src/components/MenuSamping.jsx')) && /LencanaMenu/.test(sumber('src/components/MenuBawah.jsx')), 'lencana belum dibaca tampil di menu samping dan menu bawah');
}

console.log(`\nRINGKASAN NOTIFIKASI-KLIEN: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
