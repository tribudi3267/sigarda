// Mengambil tangkapan layar aplikasi (mode lokal, data contoh) dalam dua mode (laptop/PC/tablet dan ponsel) untuk panduan bergambar di menu Bantuan,
// sekaligus menghitung letak setiap penunjuk (kotak bernomor) dari elemen aslinya. Hasil: public/panduan/<id>-<mode>.webp dan src/data/panduanGambar.json.
//
// ALAT PENGEMBANG (tidak ikut build dan tidak ikut `npm run uji`; logika murninya diuji di uji/panduan-gambar.mjs). Butuh:
//   1. server lokal berjalan:  npm run dev:lokal   (atau vite --mode lokal --port 5199), alamatnya lewat --url= (bawaan http://localhost:5199)
//   2. paket puppeteer-core yang TIDAK ditambahkan ke package.json: pasang di folder mana saja (npm i puppeteer-core) lalu beri tahu lewat PUPPETEER_DIR=<folder itu>
//   3. peramban Chrome/Edge terpasang (dicari otomatis di lokasi umum Windows, atau BROWSER_JALUR=<berkas .exe>)
// Pemakaian:
//   node scripts/panduan/ambil.mjs                      semua gambar
//   node scripts/panduan/ambil.mjs --id=penegak-beranda,pembina-antrian   sebagian (data lain dipertahankan)
//   node scripts/panduan/ambil.mjs --teks               hanya perbarui teks (judul, alt, keterangan) tanpa mengambil gambar lagi
// Hanya data contoh yang tampil (nama fiktif); jangan pernah mengambil gambar dari server produksi.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFINISI } from './definisi.mjs';
import { MODE, NAMA_MODE, gabungTeks, kotakKePersen, namaBerkas, pencariUntuk, periksaDefinisi, susunData } from './logika.mjs';

const akar = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const berkasData = path.join(akar, 'src/data/panduanGambar.json');
const arg = (nama) => process.argv.slice(2).find((a) => a === `--${nama}` || a.startsWith(`--${nama}=`));
const nilai = (nama) => { const a = arg(nama); return a && a.includes('=') ? a.split('=').slice(1).join('=') : null; };
const DEBUG = !!arg('debug');
const url = (nilai('url') || 'http://localhost:5199').replace(/\/$/, '');
const bacaData = () => (existsSync(berkasData) ? JSON.parse(readFileSync(berkasData, 'utf8')) : { figur: {} });
const tulisData = (d) => writeFileSync(berkasData, JSON.stringify(d, null, 1) + '\n');

const galat = periksaDefinisi(DEFINISI);
if (galat.length) { console.error('Definisi tidak sah:\n- ' + galat.join('\n- ')); process.exit(1); }

if (arg('teks')) {
  tulisData(gabungTeks(bacaData(), DEFINISI));
  console.log('Teks diperbarui di src/data/panduanGambar.json (gambar tidak diambil ulang).');
  process.exit(0);
}

const pilih = nilai('id') ? new Set(nilai('id').split(',')) : null;
const daftar = DEFINISI.filter((d) => !pilih || pilih.has(d.id));
if (pilih && daftar.length !== pilih.size) { console.error('Ada --id yang tidak ada di definisi.'); process.exit(1); }

const dirPup = process.env.PUPPETEER_DIR;
if (!dirPup) { console.error('Set PUPPETEER_DIR ke folder tempat puppeteer-core dipasang (npm i puppeteer-core).'); process.exit(1); }
const puppeteer = createRequire(path.join(path.resolve(dirPup), 'x.js'))('puppeteer-core');
const calonPeramban = [process.env.BROWSER_JALUR, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean);
const jalurPeramban = calonPeramban.find((j) => existsSync(j));
if (!jalurPeramban) { console.error('Peramban tidak ditemukan; set BROWSER_JALUR.'); process.exit(1); }

/** Pembantu di halaman: menemukan elemen dari spesifikasi { selector | teks/tag/mengandung/label, dalam, nth, naik, pad }. */
function pasangPembantu() {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const lihat = (e) => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 1 && r.height > 1 && st.visibility !== 'hidden' && st.display !== 'none'; };
  window.__temukan = (spec) => {
    const lingkup = spec.dalam ? [...document.querySelectorAll(spec.dalam)].filter(lihat) : [document];
    let calon = [];
    for (const a of lingkup) {
      if (spec.label) calon.push(...a.querySelectorAll(`[aria-label="${spec.label}"]`));
      else if (spec.selector) calon.push(...a.querySelectorAll(spec.selector));
      else calon.push(...a.querySelectorAll(spec.tag || '*'));
    }
    calon = calon.filter(lihat);
    if (spec.teks) {
      const t = norm(spec.teks);
      calon = calon.filter((e) => { const x = norm(e.innerText ?? e.textContent); return spec.mengandung ? x.includes(t) : x === t; });
      calon = calon.filter((e) => !calon.some((o) => o !== e && e.contains(o)));
    }
    let e = calon[spec.nth ?? 0];
    if (!e) return null;
    if (spec.induk) e = e.closest(spec.induk) || e;
    for (let i = 0; i < (spec.naik || 0); i++) e = e.parentElement || e;
    return e;
  };
  window.__kotak = (spec) => {
    const e = window.__temukan(spec);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    const pad = spec.pad ?? 4;
    // Tertutup bila titik tengah bagian yang terlihat ditimpa elemen lain (mis. menu bawah ponsel atau jendela) yang bukan bagian dari elemen ini.
    const x0 = Math.max(r.x, 0), x1 = Math.min(r.right, window.innerWidth), y0 = Math.max(r.y, 0), y1 = Math.min(r.bottom, window.innerHeight);
    const cx = Math.min(Math.max((x0 + x1) / 2, 1), window.innerWidth - 1), cy = Math.min(Math.max((y0 + y1) / 2, 1), window.innerHeight - 1);
    const atas = document.elementFromPoint(cx, cy);
    const tertutup = !!atas && !(e.contains(atas) || atas.contains(e));
    return { x: r.x - pad, y: r.y - pad, w: r.width + 2 * pad, h: r.height + 2 * pad, tertutup };
  };
}

const jeda = (ms) => new Promise((r) => setTimeout(r, ms));

async function jalankanLangkah(page, langkah, mode) {
  for (const l of langkah || []) {
    if (l.klikMenu) {
      const ok = await page.evaluate((t) => {
        const e = [...document.querySelectorAll('aside button, aside a, nav button, nav a')].find((x) => { const n = (x.innerText || '').replace(/\s+/g, ' ').trim(); return n === t || n.startsWith(t + ' ') || x.getAttribute('aria-label') === t; });
        if (!e) return false; e.click(); return true;
      }, l.klikMenu);
      if (!ok) throw new Error(`menu tidak ditemukan: ${l.klikMenu}`);
      await page.waitForFunction(() => !/Memuat/.test(document.querySelector('main')?.innerText ?? ''), { timeout: 12000 }).catch(() => {}); // halaman memuat datanya dulu (mis. rekap iuran)
      await jeda(900);
    } else if (l.klik) {
      const spec = 'layar' in l.klik || 'ponsel' in l.klik ? l.klik[mode] : l.klik;
      const ok = await page.evaluate((s) => { const e = window.__temukan(s); if (!e) return false; e.click(); return true; }, spec);
      if (!ok) throw new Error(`elemen klik tidak ditemukan: ${JSON.stringify(spec)}`);
    } else if (l.gulir) {
      const spec = 'layar' in l.gulir || 'ponsel' in l.gulir ? l.gulir[mode] : l.gulir;
      if (!spec) continue;
      const ok = await page.evaluate((s, atas) => { const e = window.__temukan(s); if (!e) return false; const y = e.getBoundingClientRect().top + window.scrollY - atas; window.scrollTo(0, Math.max(0, y)); return true; }, spec, l.atas ?? (mode === 'ponsel' ? 76 : 16));
      if (!ok) throw new Error(`elemen gulir tidak ditemukan: ${JSON.stringify(spec)}`);
    } else if (l.tutupDialog) {
      // Sesudah berganti tampilan, jendela ajakan data diri dapat muncul lagi: tunggu sebentar lalu tutup.
      const ada = await page.waitForSelector('[role=dialog]', { timeout: 4500 }).then(() => true, () => false);
      if (ada) { await page.keyboard.press('Escape'); await jeda(700); }
    } else if (l.tekan) {
      await page.keyboard.press(l.tekan);
    } else if (l.tunggu) {
      await jeda(l.tunggu);
    }
    await jeda(l.tunggu ? 0 : 900);
  }
}

async function ambilSatu(browser, d, mode) {
  const ukuran = { ...MODE[mode], tinggi: d.tinggi?.[mode] ?? MODE[mode].tinggi };
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: ukuran.lebar, height: ukuran.tinggi, deviceScaleFactor: 1, isMobile: ukuran.seluler, hasTouch: ukuran.seluler });
    await page.evaluateOnNewDocument(pasangPembantu);
    await page.goto(`${url}/?${d.data ? `data=${encodeURIComponent(d.data)}&` : ''}masuk=${encodeURIComponent(d.akun)}`, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForFunction(() => !/Memuat SIGARDA/.test(document.body.innerText), { timeout: 180000 });
    await page.addStyleTag({ content: 'iframe{visibility:hidden !important}' }); // pratinjau berkas Drive milik pihak ketiga tidak ikut dipotret
    await jeda(1500);
    // Jendela ajakan "Lengkapi data dirimu" muncul beberapa detik sesudah masuk (Penegak yang datanya belum lengkap): tunggu, lalu tutup kecuali memang itu yang dipotret.
    const adaDialog = await page.waitForSelector('[role=dialog]', { timeout: 7000 }).then(() => true, () => false);
    if (adaDialog && !d.dialog) { await page.keyboard.press('Escape'); await jeda(700); }
    if (d.dialog && !adaDialog) throw new Error('jendela dialog yang dipotret tidak muncul');
    if (d.dialog) await jeda(900);
    await jalankanLangkah(page, d.langkah, mode);
    await jeda(1300);
    const kotak = [];
    const kotakPx = [];
    for (const [i, p] of d.penanda.entries()) {
      const spec = pencariUntuk(p, mode);
      const rect = await page.evaluate((s) => window.__kotak(s), spec);
      if (!rect) throw new Error(`penunjuk ${i + 1} (${p.teks.slice(0, 40)}) tidak ditemukan pada mode ${mode}: ${JSON.stringify(spec)}`);
      if (rect.tertutup) throw new Error(`penunjuk ${i + 1} (${p.teks.slice(0, 40)}) tertutup elemen lain pada mode ${mode}; atur tinggi gambar atau gulir`);
      const persen = kotakKePersen(rect, ukuran.lebar, ukuran.tinggi);
      if (!persen) throw new Error(`penunjuk ${i + 1} di luar gambar pada mode ${mode}: ${JSON.stringify(rect)}`);
      kotak.push(persen);
      kotakPx.push(rect);
    }
    if (DEBUG) {
      const folder = path.join(process.env.TEMP || '.', 'panduan-debug');
      mkdirSync(folder, { recursive: true });
      await page.evaluate((daftar) => {
        daftar.forEach((k, i) => {
          const kotak = document.createElement('div');
          kotak.style.cssText = 'position:fixed;z-index:99999;border:2px solid #dc2626;background:rgba(239,68,68,.12);pointer-events:none;left:' + k.x + 'px;top:' + k.y + 'px;width:' + k.w + 'px;height:' + k.h + 'px';
          const no = document.createElement('div');
          no.textContent = String(i + 1);
          no.style.cssText = 'position:absolute;left:-8px;top:-8px;width:20px;height:20px;border-radius:50%;background:#dc2626;color:#fff;font:700 12px sans-serif;display:grid;place-items:center';
          kotak.appendChild(no);
          document.body.appendChild(kotak);
        });
      }, kotakPx);
      await page.screenshot({ path: path.join(folder, d.id + '-' + mode + '.png') });
      console.log('  debug: ' + d.id + ' [' + mode + '] -> ' + folder);
      return { berkas: namaBerkas(d.id, mode), l: ukuran.lebar, t: ukuran.tinggi, kotak };
    }
    const buf = await page.screenshot({ type: 'webp', quality: 80 });
    const berkas = namaBerkas(d.id, mode);
    mkdirSync(path.join(akar, 'public', path.dirname(berkas)), { recursive: true });
    writeFileSync(path.join(akar, 'public', berkas), buf);
    console.log(`  ${d.id} [${mode}] ${(buf.length / 1024).toFixed(0)} kB, ${kotak.length} penunjuk`);
    return { berkas, l: ukuran.lebar, t: ukuran.tinggi, kotak };
  } finally {
    await page.close();
  }
}

const lama = bacaData();
const hasil = Object.fromEntries(Object.entries(lama.figur).map(([id, f]) => [id, Object.fromEntries(NAMA_MODE.filter((m) => f[m]).map((m) => [m, f[m]]))]));
// Profil peramban tetap: basis data contoh lokal (IndexedDB) tidak dibuat ulang tiap gambar. Peramban dibuka baru untuk tiap gambar dan diulang bila terputus.
const profil = path.join(process.env.TEMP || process.env.TMPDIR || '.', 'panduan-profil');
async function dengarPeramban(kerja, percobaan = 3) {
  let galatTerakhir;
  for (let n = 1; n <= percobaan; n++) {
    const browser = await puppeteer.launch({ executablePath: jalurPeramban, headless: 'new', args: ['--no-sandbox'], userDataDir: profil });
    try {
      return await kerja(browser);
    } catch (e) {
      galatTerakhir = e;
      if (!/Connection closed|Target closed|Session closed|Protocol error|detached/i.test(String(e.message))) throw e;
      console.error(`  (terputus, ulang ${n}/${percobaan}) ${e.message}`);
    } finally {
      await browser.close().catch(() => {});
    }
  }
  throw galatTerakhir;
}
let gagal = 0;
for (const d of daftar) {
  hasil[d.id] = {};
  for (const mode of NAMA_MODE) {
    try { hasil[d.id][mode] = await dengarPeramban((browser) => ambilSatu(browser, d, mode)); } catch (e) { gagal++; console.error(`GAGAL ${d.id} [${mode}]: ${e.message}`); }
  }
  if (!hasil[d.id].layar || !hasil[d.id].ponsel) delete hasil[d.id];
}
// Gambar yang tidak diambil ulang (--id) memakai teks terbaru dari definisi, koordinatnya dipertahankan.
const baru = susunData(DEFINISI, hasil);
if (!DEBUG) tulisData(baru);
console.log(`${Object.keys(baru.figur).length} gambar ${DEBUG ? 'diperiksa (mode debug, tidak disimpan)' : 'tersimpan di src/data/panduanGambar.json'}${gagal ? `; ${gagal} tangkapan GAGAL (lihat di atas)` : ''}.`);
process.exit(gagal ? 1 : 0);
