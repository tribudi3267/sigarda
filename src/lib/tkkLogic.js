/**
 * TKK (Tahap 2, G2; murni tanpa React). Server yang menegakkan pencatatan (sg_tkk_catat, sg_tkk_hapus, sg_tkk_krida_*, sg_tkk_ambang_simpan; hanya Pembina dan Admin);
 * di sini: kemajuan menuju ambang Garuda (dihitung HANYA di klien dari capaian dan ambang, tanpa padanan SQL), pilihan tingkat berikutnya, dan cermin validasi isian
 * yang DIBANDINGKAN LANGSUNG dengan SQL pada kisi masukan di uji/tkk-klien.mjs. Tanggal memakai WIB (`hariIni`), sama dengan sigarda.hari_ini().
 */
import { hariIni } from './format';
import { AMBANG_TKK_BAWAAN, BIDANG_TKK, INDEKS_TKK, KATALOG_TKK, TINGKAT_TKK, tkkUntukPenegak } from '../data/tkkData';

export { AMBANG_TKK_BAWAAN, BIDANG_TKK, TINGKAT_TKK };
export const labelTingkatTkk = (id) => TINGKAT_TKK.find((t) => t.id === id)?.label ?? id;
const URUT = { purwa: 1, madya: 2, utama: 3 };

const rapikan = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const TANDA_TERLARANG = /[\u0000-\u001f\u007f<>]/;
const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;
const urlSah = (u) => !u || (/^https?:\/\//i.test(u) && u.length <= 500 && !/[\u0000-\u001f\u007f\s<>]/.test(u));

/** Capaian satu Penegak, tingkat terendah dulu per TKK. */
export const capaianPeserta = (capaian = [], pesertaId) => capaian.filter((c) => c.pesertaId === pesertaId).sort((a, b) => a.tkkId.localeCompare(b.tkkId) || URUT[a.tingkat] - URUT[b.tingkat]);

/** Tingkat tertinggi tiap TKK milik satu Penegak: { [tkkId]: 'purwa' | 'madya' | 'utama' }. */
export function tingkatTertinggi(capaianSatuPeserta = []) {
  const h = {};
  for (const c of capaianSatuPeserta) if (!h[c.tkkId] || URUT[c.tingkat] > URUT[h[c.tkkId]]) h[c.tkkId] = c.tingkat;
  return h;
}

/** Tingkat berikutnya yang boleh dicatat untuk satu TKK (purwa bila belum ada, madya sesudah purwa, utama sesudah madya) atau null bila sudah Utama. */
export function tingkatBerikut(capaianSatuPeserta = [], tkkId) {
  const t = tingkatTertinggi(capaianSatuPeserta)[tkkId];
  return !t ? 'purwa' : t === 'purwa' ? 'madya' : t === 'madya' ? 'utama' : null;
}

/**
 * Kemajuan satu Penegak menuju ambang Garuda. TKK dihitung berbeda menurut TINGKAT TERTINGGINYA; TKK bertingkat lebih tinggi ikut dihitung untuk tingkat di bawahnya:
 *   total  = jumlah TKK berbeda (Purwa ke atas) >= ambang.total
 *   madya  = jumlah TKK Madya ke atas >= jumlah TKK wajib Utama + ambang.madya   (yang Utama ikut mengisi kuota Madya)
 *   wajib  = setiap TKK wajib (ambang.utamaWajib) bertingkat Utama
 * Hasil: { total, utama, madyaKeAtas, perBidang, wajib: [{ id, nama, tingkat }], syarat: { total, madya, wajib }, kurang: { total, madya, wajib }, penuh }.
 */
export function hitungKemajuan(capaianSatuPeserta = [], ambang = AMBANG_TKK_BAWAAN) {
  const tertinggi = tingkatTertinggi(capaianSatuPeserta);
  const semua = Object.entries(tertinggi);
  const utama = semua.filter(([, t]) => t === 'utama').length;
  const madyaKeAtas = semua.filter(([, t]) => URUT[t] >= URUT.madya).length;
  const perBidang = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const [id] of semua) { const b = INDEKS_TKK[id]?.bidang; if (b) perBidang[b] += 1; }
  const wajib = ambang.utamaWajib.map((id) => ({ id, nama: INDEKS_TKK[id]?.nama ?? id, tingkat: tertinggi[id] ?? null }));
  const wajibKurang = wajib.filter((w) => w.tingkat !== 'utama').length;
  const perluMadya = ambang.utamaWajib.length + ambang.madya;
  const syarat = { total: semua.length >= ambang.total, madya: madyaKeAtas >= perluMadya, wajib: wajibKurang === 0 };
  return {
    total: semua.length, utama, madyaKeAtas, perBidang, wajib, syarat,
    kurang: { total: Math.max(0, ambang.total - semua.length), madya: Math.max(0, perluMadya - madyaKeAtas), wajib: wajibKurang },
    penuh: syarat.total && syarat.madya && syarat.wajib,
  };
}

/** Katalog TKK yang boleh dipilih untuk satu Penegak (golongan Penegak; khusus satu agama hanya untuk agama itu), dikelompokkan per bidang: [{ bidang, nama, daftar }]. */
export function pilihanTkk(agama) {
  const boleh = tkkUntukPenegak(agama);
  return Object.entries(BIDANG_TKK).map(([no, b]) => ({ bidang: Number(no), nama: b.nama, singkat: b.singkat, daftar: boleh.filter((t) => t.bidang === Number(no)) }));
}

/**
 * Memeriksa isian pencatatan capaian TKK (cermin validasi sg_tkk_catat pada isian, sebelum memeriksa Penegak, urutan tingkat, dan tanggal antar-tingkat, yang bergantung
 * data). Mengembalikan pesan galat atau ''.
 */
export function periksaCapaian({ tkkId, tingkat, tanggal, penguji1, penguji2, melatih, buktiUrl = '', catatan = '', agama = null, hari = hariIni() }) {
  const t = INDEKS_TKK[tkkId];
  if (!t) return 'TKK tidak dikenal.';
  if (t.golongan !== 'penegak') return `TKK ${t.nama} khusus golongan Siaga, tidak untuk Penegak.`;
  if (t.agama && t.agama !== agama) return `TKK ${t.nama} khusus penganut agama ${t.agama}.`;
  if (!URUT[tingkat]) return 'Tingkat TKK harus Purwa, Madya, atau Utama.';
  if (!tanggal) return 'Tanggal lulus wajib diisi.';
  if (!TANGGAL.test(tanggal) || tanggal < '2000-01-01' || tanggal > hari) return 'Tanggal lulus tidak boleh sebelum tahun 2000 atau di masa depan.';
  const p1 = rapikan(penguji1), p2 = rapikan(penguji2);
  if (p1.length < 1 || p1.length > 80 || p2.length < 1 || p2.length > 80 || TANDA_TERLARANG.test(p1) || TANDA_TERLARANG.test(p2)) return 'Isi nama kedua penguji (tim 2 orang; maksimal 80 karakter, tanpa tanda < atau >).';
  if (p1.toLowerCase() === p2.toLowerCase()) return 'Kedua penguji harus dua orang yang berbeda.';
  const m = rapikan(melatih);
  if (m.length < 1 || m.length > 200 || TANDA_TERLARANG.test(m)) return 'Isi bukti melatih: siapa yang telah dilatih sampai TKK tingkat di bawahnya (maksimal 200 karakter, tanpa tanda < atau >).';
  if (!urlSah(String(buktiUrl ?? '').trim())) return 'Tautan bukti harus berawalan http:// atau https:// (maksimal 500 karakter, tanpa spasi).';
  const c = rapikan(catatan);
  if (c.length > 200 || TANDA_TERLARANG.test(c)) return 'Catatan maksimal 200 karakter, tanpa tanda < atau >.';
  return '';
}

/** Cermin validasi sg_tkk_krida_simpan pada isian. Mengembalikan pesan galat atau ''. */
export function periksaKrida({ nama, saka = '', tanggal, buktiUrl = '', catatan = '', hari = hariIni() }) {
  const n = rapikan(nama);
  if (n.length < 1 || n.length > 80 || TANDA_TERLARANG.test(n)) return 'Nama TKK Krida wajib diisi (maksimal 80 karakter, tanpa tanda < atau >).';
  const s = rapikan(saka);
  if (s.length > 60 || TANDA_TERLARANG.test(s)) return 'Nama Saka maksimal 60 karakter, tanpa tanda < atau >.';
  if (!tanggal) return 'Tanggal lulus wajib diisi.';
  if (!TANGGAL.test(tanggal) || tanggal < '2000-01-01' || tanggal > hari) return 'Tanggal lulus tidak boleh sebelum tahun 2000 atau di masa depan.';
  if (!urlSah(String(buktiUrl ?? '').trim())) return 'Tautan bukti harus berawalan http:// atau https:// (maksimal 500 karakter, tanpa spasi).';
  const c = rapikan(catatan);
  if (c.length > 200 || TANDA_TERLARANG.test(c)) return 'Catatan maksimal 200 karakter, tanpa tanda < atau >.';
  return '';
}

/** Cermin validasi sg_tkk_ambang_simpan. `nilai` = { total, madya, utamaWajib } (angka bulat, bukan teks). Mengembalikan pesan galat atau ''. */
export function periksaAmbang(nilai) {
  if (!nilai || typeof nilai !== 'object' || Array.isArray(nilai) || Object.keys(nilai).some((k) => !['total', 'madya', 'utamaWajib'].includes(k))) return 'Bentuk ambang TKK tidak sah.';
  if (typeof nilai.total !== 'number' || typeof nilai.madya !== 'number' || !Array.isArray(nilai.utamaWajib)) return 'Bentuk ambang TKK tidak sah.';
  if (!Number.isInteger(nilai.total) || !Number.isInteger(nilai.madya) || nilai.total < 0 || nilai.madya < 0) return 'Jumlah TKK harus bilangan bulat tidak negatif.';
  if (nilai.total < 1 || nilai.total > 200) return 'Total TKK harus 1 sampai 200.';
  if (nilai.madya > 100) return 'Jumlah TKK Madya harus 0 sampai 100.';
  if (nilai.utamaWajib.some((x) => typeof x !== 'string')) return 'Daftar TKK wajib Utama tidak sah.';
  if (new Set(nilai.utamaWajib).size !== nilai.utamaWajib.length) return 'Daftar TKK wajib Utama tidak boleh berulang.';
  if (nilai.utamaWajib.some((id) => INDEKS_TKK[id]?.golongan !== 'penegak')) return 'Ada TKK wajib Utama yang tidak dikenal atau khusus Siaga.';
  if (nilai.total < nilai.utamaWajib.length + nilai.madya) return 'Total TKK harus memuat semua TKK wajib Utama ditambah TKK Madya.';
  return '';
}

/** Status pengajuan TKK oleh Penegak (Tahap 2, G2b). */
export const STATUS_PENGAJUAN = { menunggu: 'Menunggu ditinjau', disetujui: 'Disetujui', ditolak: 'Ditolak', dibatalkan: 'Dibatalkan' };
export const pengajuanPeserta = (pengajuan = [], pesertaId) => pengajuan.filter((p) => p.pesertaId === pesertaId);
export const pengajuanMenunggu = (pengajuan = []) => pengajuan.filter((p) => p.status === 'menunggu');

/** Cermin validasi sg_tkk_tinjau pada keputusan dan catatan (sebelum memeriksa pengajuannya). Mengembalikan pesan galat atau ''. */
export function periksaTinjau({ keputusan, catatan = '' }) {
  if (keputusan !== 'disetujui' && keputusan !== 'ditolak') return 'Keputusan harus disetujui atau ditolak.';
  const c = rapikan(catatan);
  if (c.length > 200 || TANDA_TERLARANG.test(c)) return 'Catatan maksimal 200 karakter, tanpa tanda < atau >.';
  if (keputusan === 'ditolak' && c === '') return 'Isi catatan agar Penegak tahu alasan penolakan.';
  return '';
}

/** Ringkasan singkat untuk daftar: "12 dari 45 TKK, 2 dari 10 wajib Utama". */
export const teksKemajuan = (k, ambang = AMBANG_TKK_BAWAAN) => `${k.total} dari ${ambang.total} TKK, ${ambang.utamaWajib.length - k.kurang.wajib} dari ${ambang.utamaWajib.length} wajib Utama`;

export { KATALOG_TKK };
