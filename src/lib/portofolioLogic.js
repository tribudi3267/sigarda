/**
 * LOGIKA JURNAL PORTOFOLIO GARUDA (murni, tanpa React)
 *
 *   portofolio[pesertaId][itemId] = {
 *     status: 'belum' | 'proses' | 'siap',
 *     catatan, tautan, catatanPenguji, diperbarui,
 *     riwayat: [{ waktu, teks, oleh }]     <- inilah "jurnal" kesiapan
 *   }
 */
import { ITEM_PORTOFOLIO, INDEKS_ITEM } from '../data/portofolioData';

export const getItem = (portofolio, pesertaId, itemId) =>
  portofolio?.[pesertaId]?.[itemId] ?? { status: 'belum', catatan: '', tautan: '', catatanPenguji: '', riwayat: [] };

export function hitungPortofolio(portofolio, pesertaId) {
  let siap = 0;
  let proses = 0;
  for (const it of ITEM_PORTOFOLIO) {
    const s = getItem(portofolio, pesertaId, it.id).status;
    if (s === 'siap') siap += 1;
    else if (s === 'proses') proses += 1;
  }
  const total = ITEM_PORTOFOLIO.length;
  return {
    total,
    siap,
    proses,
    belum: total - siap - proses,
    belumSiap: total - siap, // belum + sedang disiapkan
    persen: total ? Math.round((siap / total) * 100) : 0,
  };
}

const LABEL = { belum: 'Belum siap', proses: 'Sedang disiapkan', siap: 'Siap (Ada)' };

/**
 * Perbarui satu dokumen. patch boleh berisi status, catatan, tautan.
 * Setiap perubahan dicatat pada riwayat sebagai jurnal.
 */
export function ubahItemPortofolio(portofolio, { pesertaId, itemId, patch, oleh }) {
  if (!INDEKS_ITEM[itemId]) throw new Error('Dokumen portofolio tidak dikenal.');
  const lama = getItem(portofolio, pesertaId, itemId);
  const baru = { ...lama, ...patch };
  if (patch.status && !LABEL[patch.status]) throw new Error('Status tidak dikenal.');

  const catatan = [];
  if (patch.status && patch.status !== lama.status) catatan.push(`Status: ${LABEL[lama.status]} menjadi ${LABEL[patch.status]}`);
  if (patch.catatan !== undefined && patch.catatan.trim() !== (lama.catatan ?? '').trim()) catatan.push('Catatan diperbarui');
  if (patch.tautan !== undefined && patch.tautan.trim() !== (lama.tautan ?? '').trim()) catatan.push('Tautan berkas diperbarui');
  if (!catatan.length) return portofolio; // tidak ada yang berubah

  const waktu = new Date().toISOString();
  const entry = {
    ...baru,
    catatan: (baru.catatan ?? '').trim(),
    tautan: (baru.tautan ?? '').trim(),
    diperbarui: waktu,
    riwayat: [...(lama.riwayat ?? []), { waktu, teks: catatan.join('. '), oleh }],
  };
  return { ...portofolio, [pesertaId]: { ...(portofolio[pesertaId] ?? {}), [itemId]: entry } };
}

/** Catatan Pembina atau Dewan Ambalan pada satu dokumen. */
export function catatPengujiPortofolio(portofolio, { pesertaId, itemId, catatan, oleh }) {
  if (!INDEKS_ITEM[itemId]) throw new Error('Dokumen portofolio tidak dikenal.');
  const lama = getItem(portofolio, pesertaId, itemId);
  const bersih = (catatan ?? '').trim();
  if (bersih === (lama.catatanPenguji ?? '').trim()) return portofolio;
  const waktu = new Date().toISOString();
  const entry = {
    ...lama,
    catatanPenguji: bersih,
    catatanPengujiOleh: oleh,
    riwayat: [...(lama.riwayat ?? []), { waktu, teks: bersih ? 'Catatan penguji ditambahkan' : 'Catatan penguji dihapus', oleh }],
  };
  return { ...portofolio, [pesertaId]: { ...(portofolio[pesertaId] ?? {}), [itemId]: entry } };
}

/** Jurnal terbaru lintas dokumen untuk satu peserta, paling baru di atas. */
export function jurnalTerbaru(portofolio, pesertaId, batas = 8) {
  const semua = [];
  for (const [itemId, entry] of Object.entries(portofolio?.[pesertaId] ?? {})) {
    const item = INDEKS_ITEM[itemId];
    if (!item) continue;
    for (const r of entry.riwayat ?? []) semua.push({ ...r, item });
  }
  return semua.sort((a, b) => b.waktu.localeCompare(a.waktu)).slice(0, batas);
}

/** Rekap semua Calon Garuda. `daftarPeserta` = peserta lengkap dengan peran (lihat pesertaDenganPeran). */
export function rekapPortofolio(portofolio, daftarPeserta) {
  return daftarPeserta
    .filter((u) => u.peran === 'calon-garuda')
    .map((u) => ({ user: u, ...hitungPortofolio(portofolio, u.id) }));
}

export function ringkasPortofolio(rekap) {
  const jumlah = rekap.length;
  const totalDok = rekap.reduce((n, r) => n + r.total, 0);
  const siap = rekap.reduce((n, r) => n + r.siap, 0);
  return {
    jumlah,
    totalDok,
    siap,
    belumSiap: totalDok - siap,
    persen: totalDok ? Math.round((siap / totalDok) * 100) : 0,
    lengkap: rekap.filter((r) => r.persen === 100).length,
  };
}
