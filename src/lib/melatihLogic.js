/**
 * RANTAI MELATIH TKK (Tahap 3, H4; murni tanpa React). Syarat penguji TKK Penegak (petunjuk SK 134/1976): Penegak telah melatih sedikitnya seorang Pramuka sampai TKK
 * tingkat di bawahnya. Aplikasi mencatat "bukti melatih" sebagai teks pada tiap capaian; di sini catatan itu dirangkai per Penegak: siapa yang dilatih dan untuk TKK
 * apa saja, sehingga Pembina dapat memeriksa kesungguhan bukti (mis. bukti yang sama dipakai untuk banyak TKK yang berbeda). Hanya bantuan pemeriksaan: tidak ada aturan
 * yang diblokir dan tidak ada padanan SQL.
 */
import { KATALOG_TKK } from '../data/tkkData';

const rapikan = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const kunci = (s) => rapikan(s).toLowerCase();
const NAMA_TKK = Object.fromEntries(KATALOG_TKK.map((t) => [t.id, t.nama]));

/** Bukti yang sama (menurut teks) dipakai untuk sekian TKK BERBEDA atau lebih ditandai untuk diperiksa (tingkat Purwa, Madya, Utama satu TKK dihitung satu). */
export const BATAS_BUKTI_SAMA = 3;

/**
 * Rantai satu Penegak: [{ siapa (teks pertama yang ditulis), tkk: [{ tkkId, nama, tingkat, tanggal }], jumlahTkk (TKK berbeda), berulang (jumlahTkk >= BATAS_BUKTI_SAMA) }],
 * yang dipakai untuk TKK terbanyak lebih dulu. Capaian = daftar capaian (semua Penegak boleh; disaring menurut `pesertaId`).
 */
export function rantaiMelatih(capaian = [], pesertaId) {
  const peta = new Map();
  for (const c of capaian.filter((x) => x.pesertaId === pesertaId).sort((a, b) => a.tanggal.localeCompare(b.tanggal))) {
    const k = kunci(c.melatih);
    if (!k) continue;
    if (!peta.has(k)) peta.set(k, { siapa: rapikan(c.melatih), tkk: [] });
    peta.get(k).tkk.push({ tkkId: c.tkkId, nama: NAMA_TKK[c.tkkId] ?? c.tkkId, tingkat: c.tingkat, tanggal: c.tanggal });
  }
  return [...peta.values()]
    .map((r) => { const jumlahTkk = new Set(r.tkk.map((t) => t.tkkId)).size; return { ...r, jumlahTkk, berulang: jumlahTkk >= BATAS_BUKTI_SAMA }; })
    .sort((a, b) => b.jumlahTkk - a.jumlahTkk || a.siapa.localeCompare(b.siapa, 'id'));
}

/**
 * Ringkasan seluruh Penegak yang punya capaian TKK: [{ pesertaId, nama, kelas, jumlahCapaian, jumlahOrang, jumlahBerulang, rantai }], yang punya bukti berulang lebih dulu, lalu nama.
 * `users` = daftar Penegak (bentuk tampilan); capaian milik yang tidak ada di `users` dilewati.
 */
export function ringkasMelatih(capaian = [], users = []) {
  return users
    .filter((u) => u.role === 'peserta' && capaian.some((c) => c.pesertaId === u.id))
    .map((u) => {
      const rantai = rantaiMelatih(capaian, u.id);
      return { pesertaId: u.id, nama: u.nama, kelas: u.kelas ?? '', jumlahCapaian: capaian.filter((c) => c.pesertaId === u.id).length, jumlahOrang: rantai.length, jumlahBerulang: rantai.filter((r) => r.berulang).length, rantai };
    })
    .sort((a, b) => b.jumlahBerulang - a.jumlahBerulang || a.nama.localeCompare(b.nama, 'id'));
}

/** Teks singkat ringkasan satu Penegak, mis. "5 capaian, 2 orang dilatih, 1 bukti dipakai untuk 3 TKK atau lebih". */
export function teksRingkasMelatih(r) {
  return `${r.jumlahCapaian} capaian, ${r.jumlahOrang} bukti berbeda${r.jumlahBerulang ? `, ${r.jumlahBerulang} bukti dipakai untuk ${BATAS_BUKTI_SAMA} TKK atau lebih` : ''}`;
}
