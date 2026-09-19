const p2 = (n) => String(n).padStart(2, '0');
export const keIso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

export const hariIni = () => keIso(new Date());

export const tanggalLalu = (hari) => {
  const d = new Date();
  d.setDate(d.getDate() - hari);
  return keIso(d);
};

export const fmtTanggal = (iso) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '-';

export const fmtHariTanggal = (iso) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '-';

/** "2026-09-18" menjadi "18/09" (untuk judul kolom yang sempit) */
export const fmtTglPendek = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export const fmtWaktu = (iso) =>
  iso
    ? new Date(iso).toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

export const buatId = (prefix = 'id') =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

export const inisial = (nama = '') =>
  nama
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((k) => k[0].toUpperCase())
    .join('');

/** Urutan alami untuk kelas dan sangga: "X" < "XI" < "XII", "Sangga 2" < "Sangga 10". */
export const urutAlami = (a, b) => a.length - b.length || a.localeCompare(b, 'id', { numeric: true });
export const urutTeks = (a, b) => a.localeCompare(b, 'id', { numeric: true });

/**
 * Kode verifikasi digital: sidik singkat (hash djb2) dari peserta, poin, penguji, dan tanggal.
 * Cukup untuk prototipe. Untuk produksi, buat dan simpan kode di server (Supabase Edge Function).
 */
export function kodeVerifikasi(bagian) {
  let h = 5381;
  for (const ch of bagian.join('|')) {
    h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  }
  return `VRF-${h.toString(36).toUpperCase().padStart(7, '0')}`;
}
