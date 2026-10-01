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

/** Lebar (piksel) di bawahnya layar dianggap ponsel; sama dengan breakpoint `md` Tailwind (768). */
export const BATAS_LEBAR_LAYAR = 768;
export const layarSempit = (lebar) => Number.isFinite(lebar) && lebar < BATAS_LEBAR_LAYAR;

/** Varian yang ditampilkan di layar: mode `ponsel`/`layar` dipaksa, `otomatis` mengikuti lebar layar (sempit = ponsel). Hanya SATU varian yang diunduh. */
export function varianLayar(mode, sempit) {
  if (mode === 'ponsel' || mode === 'layar') return mode;
  return sempit ? 'ponsel' : 'layar';
}

/**
 * Pilihan gambar saat dicetak: `tampilan` = gambar yang sedang tampil di layar (ponsel di HP, laptop di layar lebar; bawaan),
 * `layar` = selalu gambar laptop. Lebar halaman cetak = lebar kertas, jadi CSS responsif tidak dapat dipakai untuk memilih: pilihan dihitung dari layar SEBELUM mencetak.
 */
export const CETAK_GAMBAR = ['tampilan', 'layar'];
export const LABEL_CETAK = { tampilan: 'Sama dengan tampilan layar', layar: 'Selalu laptop' };
export const KUNCI_CETAK = 'sigarda_cetak_gambar';
export const cetakSah = (c) => (CETAK_GAMBAR.includes(c) ? c : 'tampilan');

/** Varian yang tercetak menurut mode tampilan, pilihan cetak, dan lebar layar. */
export function varianCetak(mode, cetak, sempit) {
  if (cetakSah(cetak) === 'layar') return 'layar';
  return varianLayar(mode, sempit);
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
