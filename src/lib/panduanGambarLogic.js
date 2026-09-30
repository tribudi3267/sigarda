/**
 * Panduan bergambar (murni tanpa React): memilih varian gambar dan menyaring data gambar untuk halaman Bantuan.
 * Data gambar dihasilkan scripts/panduan/ambil.mjs ke src/data/panduanGambar.json: per gambar ada dua varian, `layar` (laptop/PC/tablet) dan `ponsel` (HP),
 * masing-masing dengan berkas dan kotak penunjuk bernomor (persen ukuran gambar). Nomor penunjuk = urutan pada `keterangan`.
 */

export const MODE_GAMBAR = ['otomatis', 'ponsel', 'layar'];
export const LABEL_MODE = { otomatis: 'Ikuti layar', ponsel: 'Ponsel', layar: 'Laptop, PC, tablet' };
export const KUNCI_MODE = 'sigarda_mode_gambar';

/** Mode yang sah; nilai lain (mis. dari penyimpanan yang rusak) jatuh ke `otomatis`. */
export const modeSah = (m) => (MODE_GAMBAR.includes(m) ? m : 'otomatis');

/** Varian yang ditampilkan pada mode tertentu; `otomatis` mengembalikan kedua varian (dipilih CSS menurut lebar layar). */
export function varianTampil(mode) {
  if (mode === 'ponsel') return ['ponsel'];
  if (mode === 'layar') return ['layar'];
  return ['ponsel', 'layar'];
}

/** Satu gambar lengkap dari data (atau null bila tidak ada/rusak), termasuk kotak yang jumlahnya sama dengan keterangan. */
export function ambilFigur(data, id) {
  const f = data?.figur?.[id];
  if (!f || !Array.isArray(f.keterangan) || !f.layar || !f.ponsel) return null;
  if (f.layar.kotak?.length !== f.keterangan.length || f.ponsel.kotak?.length !== f.keterangan.length) return null;
  return f;
}

/** Gaya penempatan kotak penunjuk (persen). */
export const gayaKotak = (k) => ({ left: `${k.x}%`, top: `${k.y}%`, width: `${k.w}%`, height: `${k.h}%` });

/**
 * Posisi lencana nomor: pojok kiri-atas kotak, digeser ke dalam bila kotak menempel tepi kiri/atas gambar supaya nomor tidak terpotong.
 * Mengembalikan gaya dalam persen relatif terhadap gambar.
 */
export function gayaLencana(k) {
  const kiri = k.x < 2.5 ? k.x + 0.6 : k.x;
  const atas = k.y < 2.5 ? k.y + 0.6 : k.y;
  return { left: `${kiri}%`, top: `${atas}%` };
}

/** Alamat berkas gambar di bawah public/ (mengikuti base Vite). */
export const alamatGambar = (berkas, dasar = '/') => `${dasar.endsWith('/') ? dasar : `${dasar}/`}${berkas}`;
