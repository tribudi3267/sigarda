// Memeriksa bahwa semua tautan pada registri peraturan (src/data/peraturanData.js) masih hidup. Butuh internet; sengaja TIDAK ikut `npm run uji`.
// Pakai: npm run periksa-peraturan   (keluar dengan kode 1 bila ada tautan mati)
import { PERATURAN, DAFTAR_ID_PERATURAN, HALAMAN_PERATURAN } from '../src/data/peraturanData.js';

const cek = async (url) => {
  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (periksa-peraturan)' }, signal: AbortSignal.timeout(60000) });
    return { status: r.status, tipe: r.headers.get('content-type') ?? '' };
  } catch (e) {
    return { status: 0, tipe: String(e?.message ?? e) };
  }
};

let mati = 0;
for (const [nama, url] of [['halaman peraturan', HALAMAN_PERATURAN], ...DAFTAR_ID_PERATURAN.map((i) => [i, PERATURAN[i].url])]) {
  const h = await cek(url);
  const baik = h.status === 200;
  if (!baik) mati++;
  console.log(`${baik ? 'ok   ' : 'MATI '}: ${nama.padEnd(24)} ${h.status} ${h.tipe.slice(0, 40)}`);
}
console.log(mati ? `\n${mati} tautan bermasalah. Perbaiki src/data/peraturanData.js (lihat halaman ${HALAMAN_PERATURAN}).` : '\nSemua tautan peraturan hidup.');
if (mati) process.exit(1);
