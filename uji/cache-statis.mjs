// Hemat log Supabase (Fase 1): salinan sementara data yang jarang berubah di peramban (cacheStatis.js) dan pemakaiannya di AppContext.
import { readFileSync } from 'node:fs';
import { bacaCache, hapusCache, simpanCache } from '../src/lib/cacheStatis.js';
import { ID_BUILD } from '../src/lib/versi.js';

let lulus = 0; let gagal = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const P = process.cwd().replace(/\\/g, '/');
const sumber = (f) => readFileSync(`${P}/${f}`, 'utf8');

/** localStorage palsu dengan key()/length seperti aslinya. */
function penyimpanPalsu() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    mentah: m,
  };
}

console.log('--- Salinan di peramban ---');
{
  const s = penyimpanPalsu();
  const t0 = 1_000_000;
  const TTL = 30 * 60 * 1000;
  ok(bacaCache('materi', TTL, { penyimpan: s, sekarang: t0 }) === null, 'kosong = tidak ada salinan');
  simpanCache('materi', [{ id: 1, judul: 'A' }], { penyimpan: s, sekarang: t0 });
  const c = bacaCache('materi', TTL, { penyimpan: s, sekarang: t0 + 1000 });
  ok(c && c.nilai[0].judul === 'A', 'salinan yang masih berlaku dibaca kembali');
  ok(bacaCache('materi', TTL, { penyimpan: s, sekarang: t0 + TTL }) !== null, 'tepat pada batas masa berlaku masih dipakai');
  ok(bacaCache('materi', TTL, { penyimpan: s, sekarang: t0 + TTL + 1 }) === null, 'lewat masa berlaku = dimuat ulang dari server');
  ok(bacaCache('materi', TTL, { penyimpan: s, sekarang: t0 - 120000 }) === null, 'jam perangkat mundur jauh: salinan tidak dipercaya');

  simpanCache('gudep', null, { penyimpan: s, sekarang: t0 });
  const g = bacaCache('gudep', TTL, { penyimpan: s, sekarang: t0 });
  ok(g && g.nilai === null, 'data null (gudep belum tersimpan) tetap sah sebagai salinan');

  s.setItem('sigarda.cache.materi', JSON.stringify({ v: `${ID_BUILD}-lama`, t: t0, d: [] }));
  ok(bacaCache('materi', TTL, { penyimpan: s, sekarang: t0 }) === null, 'terbitan aplikasi lain (ID build beda) = salinan diabaikan');
  s.setItem('sigarda.cache.materi', '{rusak');
  ok(bacaCache('materi', TTL, { penyimpan: s, sekarang: t0 }) === null, 'isi rusak = diabaikan, tidak menimbulkan galat');

  simpanCache('materi', [1], { penyimpan: s, sekarang: t0 });
  s.setItem('lainnya', 'tetap');
  hapusCache('materi', { penyimpan: s });
  ok(bacaCache('materi', TTL, { penyimpan: s, sekarang: t0 }) === null && bacaCache('gudep', TTL, { penyimpan: s, sekarang: t0 }) !== null, 'hapus satu salinan tidak mengganggu yang lain');
  hapusCache(null, { penyimpan: s });
  ok(bacaCache('gudep', TTL, { penyimpan: s, sekarang: t0 }) === null && s.getItem('lainnya') === 'tetap', 'hapus semua (keluar) hanya membuang salinan aplikasi, bukan penyimpanan lain');

  const rusak = { getItem() { throw new Error('diblokir'); }, setItem() { throw new Error('penuh'); }, removeItem() { throw new Error('x'); }, key() { throw new Error('x'); }, length: 3 };
  let galat = false;
  try { simpanCache('materi', [1], { penyimpan: rusak }); hapusCache(null, { penyimpan: rusak }); hapusCache('materi', { penyimpan: rusak }); ok(bacaCache('materi', TTL, { penyimpan: rusak }) === null, 'penyimpanan diblokir/penuh: tanpa salinan, tanpa galat'); } catch { galat = true; }
  ok(!galat, 'penyimpanan yang melempar galat tidak merusak aplikasi');
  ok(bacaCache('materi', TTL, { penyimpan: null }) === null, 'tanpa penyimpanan sama sekali: tanpa salinan');
}

console.log('\n--- Pemakaian di AppContext ---');
{
  const ctx = sumber('src/context/AppContext.jsx');
  ok(/dariCache\('materi'/.test(ctx), 'pemuatan penuh memakai salinan untuk materi');
  ok(!/dariCache\('(asisten|profil|progress|portofolio|notifikasi|pendampingan|gudep|iuran-pengaturan)/.test(ctx), 'data pribadi dan yang sering berubah TIDAK disalin (gudep dan pengaturan iuran datang dari muat awal)');
  ok(/if \(lokalRef\.current\) return ambil\(\)/.test(ctx), 'mode lokal (basis data di peramban) selalu membaca langsung');
  ok(/simpanBilaOk\('materi'\)/.test(ctx) && !/simpanCache\('gudep'/.test(ctx) && !/simpanBilaOk\('iuran-pengaturan'\)/.test(ctx), 'jalur tulis memperbarui salinan materi; tidak ada salinan basi untuk gudep dan pengaturan iuran');
  const iKosong = ctx.indexOf('const kosongkan = useCallback');
  ok(iKosong > 0 && ctx.slice(iKosong, iKosong + 900).includes('hapusCache()'), 'keluar/sesi berakhir membuang semua salinan');
  ok(/if \(!id\) apiRef\.current\.muatGudepPublik\(\)/.test(ctx), 'identitas gudep publik hanya diminta bila tidak ada sesi tersimpan');
  ok(/JEDA_DATA_JARANG_MS\s*=\s*1800000/.test(ctx) && /JEDA_SEGARKAN_MS\s*=\s*300000/.test(ctx) && /JEDA_NOTIFIKASI_MS\s*=\s*180000/.test(ctx) && /BATAS_GAGAL_NOTIFIKASI/.test(ctx), 'jeda hemat log (5 menit, 30 menit, 3 menit, batas gagal notifikasi) tidak berubah diam-diam');
}

console.log(`\nRINGKASAN CACHE-STATIS: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
