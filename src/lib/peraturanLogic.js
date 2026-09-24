/**
 * RUJUKAN PERATURAN (murni, tanpa React)
 *
 * Bentuk rujukan pada komponen SumberPeraturan: string id ('garuda-038-2017') atau { id, bagian } dengan `bagian` = pasal/bab yang menjadi dasar
 * ('Bab II butir 1c', 'Pasal 35 ayat (3)'). Daftar peraturannya ada di src/data/peraturanData.js (satu-satunya tempat judul dan tautan).
 */
import { PERATURAN, HALAMAN_PERATURAN } from '../data/peraturanData';

/** Rujukan menjadi { id, bagian, nama, judul, url, catatan } atau null bila id tidak ada di registri. */
export function selesaikanRujukan(r) {
  const id = typeof r === 'string' ? r : r?.id;
  const p = PERATURAN[id];
  if (!p) return null;
  return { id, bagian: (typeof r === 'object' && r.bagian) || '', nama: p.nama, judul: p.judul, url: p.url, catatan: p.catatan ?? '' };
}

/** Daftar rujukan (tunggal atau larik) menjadi daftar peraturan yang dikenal; id yang tidak dikenal dibuang. Id yang sama tidak dimuat dua kali. */
export function daftarRujukan(rujukan) {
  const larik = Array.isArray(rujukan) ? rujukan : rujukan ? [rujukan] : [];
  const lihat = new Set();
  const hasil = [];
  for (const r of larik) {
    const x = selesaikanRujukan(r);
    if (x && !lihat.has(x.id + '|' + x.bagian)) {
      lihat.add(x.id + '|' + x.bagian);
      hasil.push(x);
    }
  }
  return hasil;
}

/** Satu baris teks: "Jukran Kwarnas 05/2026, Pasal 24 ayat (15)". */
export const labelRujukan = (x) => (x.bagian ? `${x.nama}, ${x.bagian}` : x.nama);

/** Tautan sah: https tanpa spasi. Asalnya bebas (peraturan terbaru boleh berada di situs Kwarnas, Kwarda, atau Kwarcab; yang penting berisi peraturan terkini). */
export const tautanSah = (url) => typeof url === 'string' && /^https:\/\/[^\s]+$/.test(url);

export { HALAMAN_PERATURAN };
