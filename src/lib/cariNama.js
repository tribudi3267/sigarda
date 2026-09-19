/**
 * PENCARIAN NAMA UNTUK KOLOM MASUK (murni, tanpa React)
 *
 * Daftar nama tidak pernah ditampilkan utuh: hanya beberapa nama yang paling relevan dengan
 * huruf yang sedang diketik. Indeks dibangun sekali per daftar, lalu tiap ketikan hanya
 * menyaring dan mengurutkan, sehingga tetap ringan untuk ribuan nama.
 *
 * Urutan relevansi (angka kecil = lebih dekat):
 *   0  nama diawali huruf yang diketik
 *   1  salah satu kata pada nama diawali huruf yang diketik
 *   2  huruf yang diketik ada di tengah kata
 *   3  fallback: huruf cocok berurutan tetapi tidak berdekatan (mis. "ahmd" untuk "Ahmad")
 * Kueri beberapa kata ("budi san") harus cocok semuanya, urutan kata bebas.
 */

export const MAKS_SARAN = 8;

export const normalisasiNama = (teks) =>
  String(teks ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Membangun indeks dari daftar pengguna. Panggil ulang hanya saat daftar berubah. */
export const bangunIndeks = (daftar) =>
  daftar.map((user) => {
    const n = normalisasiNama(user.nama);
    return { user, n, kata: n.split(' ') };
  });

/** Skor satu kata kueri terhadap satu nama; null bila tidak cocok. */
function skorKata(item, token, indeksKata) {
  if (indeksKata === 0 && item.n.startsWith(token)) return 0;
  if (item.kata.some((k) => k.startsWith(token))) return 1;
  if (item.n.includes(token)) return 2;
  return null;
}

/** Huruf kueri cocok berurutan dalam nama; makin rapat makin baik. Null bila tidak cocok. */
function skorBerurutan(item, token) {
  if (token.length < 3) return null;
  const teks = item.n;
  let pos = -1;
  let pertama = -1;
  for (const huruf of token) {
    pos = teks.indexOf(huruf, pos + 1);
    if (pos === -1) return null;
    if (pertama === -1) pertama = pos;
  }
  return 3 + (pos - pertama + 1 - token.length) / 100;
}

/**
 * @returns {{ hasil: Array<object>, total: number }} `hasil` = paling banyak `maks` pengguna,
 *   `total` = jumlah seluruh nama yang cocok.
 */
export function cariNama(indeks, kueri, maks = MAKS_SARAN) {
  const tokens = normalisasiNama(kueri).split(' ').filter(Boolean);
  if (!tokens.length) return { hasil: [], total: 0 };

  const nilai = (ambil) => {
    const cocok = [];
    for (const item of indeks) {
      let jumlah = 0;
      let lolos = true;
      for (let i = 0; i < tokens.length; i += 1) {
        const s = ambil(item, tokens[i], i);
        if (s === null) { lolos = false; break; }
        jumlah += s;
      }
      if (lolos) cocok.push({ item, jumlah });
    }
    return cocok;
  };

  let cocok = nilai((item, t, i) => skorKata(item, t, i));
  if (!cocok.length) cocok = nilai((item, t) => skorKata(item, t, 1) ?? skorBerurutan(item, t));

  cocok.sort(
    (a, b) =>
      a.jumlah - b.jumlah ||
      a.item.n.length - b.item.n.length ||
      a.item.user.nama.localeCompare(b.item.user.nama, 'id')
  );
  return { hasil: cocok.slice(0, maks).map((c) => c.item.user), total: cocok.length };
}
