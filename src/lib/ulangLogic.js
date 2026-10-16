/**
 * Coba ulang pemuatan yang gagal sementara (server sibuk, batas laju, koneksi putus). Murni, tanpa jaringan.
 * Saat ratusan perangkat memuat bersamaan (latihan Jumat), kegagalan sesaat biasanya sembuh bila diulang beberapa detik kemudian;
 * jeda DIACAK agar perangkat yang gagal bersamaan tidak mengulang pada detik yang sama.
 */

/** Pesan galat yang lazimnya hilang sendiri. Sengaja tidak memuat galat konfigurasi (fungsi belum di-deploy), izin, atau sesi berakhir. */
const POLA_SEMENTARA = /failed to fetch|networkerror|load failed|network request failed|too many requests|rate limit|too many clients|remaining connection slots|service unavailable|bad gateway|gateway time-?out|timed? ?out|timeout|upstream|connection (terminated|refused|reset)|\b(429|50[0-4])\b/i;

const teks = (galat) => String(galat?.message ?? galat ?? '');

export const galatSementara = (galat) => POLA_SEMENTARA.test(teks(galat));

/** Kode HTTP 429 atau 5xx yang tercantum pada pesan galat ('' bila tidak ada); membantu mencari penyebab dari tangkapan layar pengguna. */
export const kodeGalat = (galat) => teks(galat).match(/\b(429|5\d\d)\b/)?.[1] ?? '';

/** Jeda dasar sebelum percobaan ke-2 dan ke-3 (md). */
export const JEDA_ULANG_MS = [1500, 3500];

/** Jeda sebelum percobaan berikutnya sesudah gagal ke-`ke` (mulai 0): dasar x 0,5 sampai 1,5. */
export const jedaUlang = (ke, acak = Math.random) => Math.round(JEDA_ULANG_MS[Math.min(ke, JEDA_ULANG_MS.length - 1)] * (0.5 + acak()));

/**
 * Menjalankan `fn` (mengembalikan { ok, sementara?, ... }) hingga `maks` kali; mengulang HANYA bila gagal dan bertanda `sementara`.
 * Hasil percobaan terakhir dikembalikan apa adanya.
 */
export async function denganUlang(fn, { maks = 3, tidur = (ms) => new Promise((r) => setTimeout(r, ms)), acak = Math.random } = {}) {
  let r;
  for (let i = 0; i < maks; i++) {
    r = await fn();
    if (r?.ok || !r?.sementara || i === maks - 1) return r;
    await tidur(jedaUlang(i, acak));
  }
  return r;
}
