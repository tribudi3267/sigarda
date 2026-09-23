/** Cadangan data (tahap L4): logika murni untuk menu Data Gudep. Cermin syarat di sg_cadangan_admin/notif_pengingat (inti.sql). */

/** Nama berkas unduhan, mis. "cadangan-sigarda-2026-09-23-1430.json". */
export function namaBerkasCadangan(sekarang = new Date()) {
  const p2 = (n) => String(n).padStart(2, '0');
  const tgl = `${sekarang.getFullYear()}-${p2(sekarang.getMonth() + 1)}-${p2(sekarang.getDate())}`;
  const jam = `${p2(sekarang.getHours())}${p2(sekarang.getMinutes())}`;
  return `cadangan-sigarda-${tgl}-${jam}.json`;
}

/** true bila cadangan belum pernah diunduh atau sudah lebih dari 30 hari (sama dengan syarat pengingat bulanan di server). */
export function perluCadangan(status, sekarang = new Date()) {
  const pada = status?.pada;
  if (!pada) return true;
  const t = new Date(pada).getTime();
  if (!Number.isFinite(t)) return true;
  return sekarang.getTime() - t > 30 * 24 * 60 * 60 * 1000;
}
