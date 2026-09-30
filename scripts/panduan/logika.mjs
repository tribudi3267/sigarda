// Logika murni pembuatan gambar panduan (dapat diuji tanpa peramban): ukuran mode, konversi kotak ke persen, pemeriksaan definisi, dan
// penyusunan data yang dibaca aplikasi (src/data/panduanGambar.json). Pengambil gambarnya ada di ambil.mjs; definisi layar di definisi.mjs.

/** Dua mode tangkapan. `layar` = laptop/PC/tablet (bilah samping terlihat), `ponsel` = HP (menu bawah). */
export const MODE = {
  layar: { lebar: 1024, tinggi: 760, seluler: false },
  ponsel: { lebar: 390, tinggi: 844, seluler: true },
};
export const NAMA_MODE = Object.keys(MODE);
export const PERAN_GAMBAR = ['umum', 'penegak', 'dewan', 'pembina', 'admin'];
/** Batas jumlah penunjuk per gambar: lebih banyak membuat gambar sesak dan legenda sulit dibaca. */
export const MAKS_PENANDA = 6;
/** Lokasi berkas gambar di bawah public/, dan nama berkas menurut id dan mode. */
export const FOLDER_GAMBAR = 'panduan';
export const namaBerkas = (id, mode) => `${FOLDER_GAMBAR}/${id}-${mode}.webp`;

const bulat = (n) => Math.round(n * 100) / 100;

/**
 * Mengubah kotak elemen (piksel, relatif terhadap tangkapan) menjadi persen ukuran gambar.
 * Kotak yang sebagian keluar gambar dipotong; kotak yang sama sekali di luar gambar (atau tanpa luas) ditolak (null).
 */
export function kotakKePersen(rect, lebar, tinggi) {
  if (!rect || !(lebar > 0) || !(tinggi > 0)) return null;
  const x0 = Math.max(0, rect.x), y0 = Math.max(0, rect.y);
  const x1 = Math.min(lebar, rect.x + rect.w), y1 = Math.min(tinggi, rect.y + rect.h);
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;
  return { x: bulat((x0 / lebar) * 100), y: bulat((y0 / tinggi) * 100), w: bulat(((x1 - x0) / lebar) * 100), h: bulat(((y1 - y0) / tinggi) * 100) };
}

/** Pemeriksaan definisi layar; mengembalikan daftar galat (kosong = sah). */
export function periksaDefinisi(daftar) {
  const galat = [];
  const id = new Set();
  if (!Array.isArray(daftar) || !daftar.length) return ['definisi kosong'];
  for (const d of daftar) {
    const nama = d && d.id;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(nama || '')) { galat.push(`id tidak sah: ${nama}`); continue; }
    if (id.has(nama)) galat.push(`${nama}: id ganda`);
    id.add(nama);
    if (!PERAN_GAMBAR.includes(nama.split('-')[0])) galat.push(`${nama}: awalan id harus salah satu dari ${PERAN_GAMBAR.join(', ')}`);
    if (!d.akun) galat.push(`${nama}: akun contoh belum diisi`);
    if (!d.judul || d.judul.trim().length < 3) galat.push(`${nama}: judul kosong`);
    if (!d.alt || d.alt.trim().length < 15) galat.push(`${nama}: teks alternatif (alt) terlalu pendek`);
    if (!Array.isArray(d.penanda) || !d.penanda.length) galat.push(`${nama}: belum ada penunjuk`);
    else {
      if (d.penanda.length > MAKS_PENANDA) galat.push(`${nama}: penunjuk ${d.penanda.length} melebihi batas ${MAKS_PENANDA}`);
      d.penanda.forEach((p, i) => {
        if (!p.teks || p.teks.trim().length < 8) galat.push(`${nama}#${i + 1}: keterangan penunjuk terlalu pendek`);
        const punya = (o) => !!o && !!(o.selector || o.teks || o.label);
        if (!(punya(p.cari) || (punya(p.layar) && punya(p.ponsel)))) galat.push(`${nama}#${i + 1}: cara menemukan elemen belum lengkap untuk kedua mode`);
      });
    }
  }
  return galat;
}

/** Cara menemukan elemen untuk satu mode: `layar`/`ponsel` bila ada, kalau tidak `cari` bersama. */
export const pencariUntuk = (penanda, mode) => penanda[mode] || penanda.cari;

/**
 * Menyusun data akhir dari definisi dan hasil tangkapan.
 * @param {object[]} daftar definisi
 * @param {Record<string, Record<string, {berkas:string,l:number,t:number,kotak:object[]}>>} hasil hasil[id][mode]
 */
export function susunData(daftar, hasil) {
  const figur = {};
  for (const d of daftar) {
    const h = hasil[d.id];
    if (!h) continue;
    figur[d.id] = { judul: d.judul, alt: d.alt, keterangan: d.penanda.map((p) => p.teks), ...Object.fromEntries(NAMA_MODE.filter((m) => h[m]).map((m) => [m, h[m]])) };
  }
  return { figur };
}

/** Memperbarui HANYA teks (judul, alt, keterangan) pada data yang sudah ada, tanpa mengambil gambar lagi; koordinat dan berkas dipertahankan. */
export function gabungTeks(lama, daftar) {
  const figur = {};
  for (const d of daftar) {
    const l = lama.figur?.[d.id];
    if (!l) continue;
    if ((l.layar?.kotak?.length ?? 0) !== d.penanda.length) throw new Error(`${d.id}: jumlah penunjuk berubah (${l.layar?.kotak?.length} -> ${d.penanda.length}); ambil ulang gambarnya.`);
    figur[d.id] = { ...l, judul: d.judul, alt: d.alt, keterangan: d.penanda.map((p) => p.teks) };
  }
  return { figur };
}
