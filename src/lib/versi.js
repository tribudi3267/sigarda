/**
 * VERSI APLIKASI TERBIT. Tiap build memuat ID unik (__BUILD_ID__, diisi vite.config.js) dan menerbitkan version.json berisi ID yang sama. Aplikasi yang
 * sedang terbuka (tab lama atau aplikasi terpasang) menanyakan version.json secara berkala; bila ID-nya berbeda, muncul ajakan "Muat ulang".
 * Tanpa cache service worker, memuat ulang cukup untuk mendapatkan versi terbaru. Kosong pada mode dev dan mode lokal (tidak ada pemeriksaan).
 */
export const ID_BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : '';

export const adaVersiBaru = (lokal, jauh) => Boolean(lokal) && Boolean(jauh) && lokal !== jauh;

/** ID versi yang sedang terbit, atau null bila tidak dapat diambil (offline dan sejenisnya). */
export async function ambilVersiTerbit(base = '/', ambil = globalThis.fetch) {
  try {
    const r = await ambil(`${base}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d?.id === 'string' && d.id ? d.id : null;
  } catch {
    return null;
  }
}
