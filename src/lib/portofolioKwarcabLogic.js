/**
 * PORTOFOLIO GARUDA FORMAT KWARCAB (Tahap 3, H2; murni tanpa React). Menyusun baris-baris dokumen cetak "02. Portofolio Penegak Garuda 2026" (Kwarcab Purbalingga)
 * dari data aplikasi (pelantikan, Saka, TKK, Krida, SPG, tim penilai, tanggal lahir) dan isian data diri yang diisi Penegak sendiri (src/lib/isianLogic.js: tempat lahir, alamat,
 * keluarga, pendidikan, prestasi, kegiatan, bidang kecakapan, perangkat IT). Tanpa padanan SQL. Isian yang belum diisi dicetak sebagai titik-titik untuk ditulis tangan.
 */
import { AMBANG_TKK_BAWAAN, INDEKS_TKK } from '../data/tkkData';
import { hariIni } from './format';
import { BIDANG_BAWAAN } from './isianLogic';
import { pelantikanPeserta, sakaPeserta } from './pelantikanLogic';
import { capaianPeserta, tingkatTertinggi } from './tkkLogic';

const URUT = { utama: 3, madya: 2, purwa: 1 };
const LABEL = { utama: 'Utama', madya: 'Madya', purwa: 'Purwa' };
/** Banyak baris kosong minimal pada tiap tabel isian tangan (mengikuti lembar Kwarcab). */
export const BARIS_KRIDA = 8;
export const BARIS_KEGIATAN = 7;
export const BARIS_BIDANG = 6;
export const BARIS_PERANGKAT = 4;
export const JUMLAH_PENANDA_TANGAN_TIM = 5;

/** Usia "17 tahun 3 bulan" pada `hari` dari tanggal lahir ISO, atau '' bila tanggal lahir belum ada atau di masa depan. */
export function usiaTeks(tanggalLahir, hari = hariIni()) {
  if (!tanggalLahir) return '';
  const [y1, m1, d1] = tanggalLahir.split('-').map(Number);
  const [y2, m2, d2] = hari.split('-').map(Number);
  let bulan = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (bulan < 0) return '';
  const tahun = Math.floor(bulan / 12);
  bulan %= 12;
  return bulan ? `${tahun} tahun ${bulan} bulan` : `${tahun} tahun`;
}

/**
 * 45 baris tabel TKK: (1) TKK wajib Utama sesuai ambang, urut ambang, tingkat "Utama" (tanggal terisi bila Utama sudah tercatat; kosong = belum),
 * (2) TKK lain yang dimiliki, tingkat tertinggi dulu lalu tanggal, (3) baris kosong sampai jumlah ambang (tiga pertama sesudah yang wajib berlabel Madya, sisanya Purwa).
 * Bila yang dimiliki melebihi ambang, semua tetap dicetak. Baris: { no, nama, tingkat (teks), tanggal (ISO atau ''), kosong }.
 */
export function barisTkkKwarcab(capaianSatuPeserta = [], ambang = AMBANG_TKK_BAWAAN) {
  const tertinggi = tingkatTertinggi(capaianSatuPeserta);
  const tanggalDi = (id, tingkat) => capaianSatuPeserta.find((c) => c.tkkId === id && c.tingkat === tingkat)?.tanggal ?? '';
  const baris = [];
  for (const id of ambang.utamaWajib) {
    baris.push({ nama: INDEKS_TKK[id]?.nama ?? id, tingkat: LABEL.utama, tanggal: tanggalDi(id, 'utama'), kosong: false });
  }
  const lain = Object.entries(tertinggi)
    .filter(([id]) => !ambang.utamaWajib.includes(id))
    .sort((a, b) => URUT[b[1]] - URUT[a[1]] || tanggalDi(a[0], a[1]).localeCompare(tanggalDi(b[0], b[1])) || (INDEKS_TKK[a[0]]?.nama ?? a[0]).localeCompare(INDEKS_TKK[b[0]]?.nama ?? b[0], 'id'));
  for (const [id, t] of lain) baris.push({ nama: INDEKS_TKK[id]?.nama ?? id, tingkat: LABEL[t], tanggal: tanggalDi(id, t), kosong: false });
  const jumlah = Math.max(ambang.total, baris.length);
  while (baris.length < jumlah) {
    const i = baris.length;
    baris.push({ nama: '', tingkat: i < ambang.utamaWajib.length + ambang.madya ? LABEL.madya : LABEL.purwa, tanggal: '', kosong: true });
  }
  return baris.map((b, i) => ({ no: i + 1, ...b }));
}

/** Baris Krida ("Nama SKK", tanggal pengujian, tanggal pemberian) dipenuhi sampai BARIS_KRIDA. Tanggal pengujian dan pemberian sama (aplikasi mencatat satu tanggal). */
export function barisKrida(krida = [], pesertaId) {
  const milik = krida.filter((k) => k.pesertaId === pesertaId).sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.id - b.id);
  const baris = milik.map((k) => ({ nama: k.saka ? `${k.nama} (${k.saka})` : k.nama, tanggal: k.tanggal, kosong: false }));
  while (baris.length < BARIS_KRIDA) baris.push({ nama: '', tanggal: '', kosong: true });
  return baris.map((b, i) => ({ no: i + 1, ...b }));
}

/** Ringkasan Kepramukaan: pelantikan Bantara/Laksana ({ tanggal, tempat } atau null), Saka aktif dan yang pernah diikuti, jumlah Krida. */
export function ringkasKepramukaan({ pelantikan = [], saka = [], krida = [], pesertaId }) {
  const p = pelantikanPeserta(pelantikan, pesertaId);
  const daftarSaka = sakaPeserta(saka, pesertaId);
  return {
    bantara: p.bantara ?? null,
    laksana: p.laksana ?? null,
    saka: daftarSaka.map((s) => s.saka).join(', '),
    jumlahKrida: krida.filter((k) => k.pesertaId === pesertaId).length,
  };
}

/** Lembar SPG: 13 baris { no, uraian, tanggal (dari penetapan Pembina, kosong bila belum), terpenuhi } dari keluaran hitungSpg. Paraf dan tanda tangan dibiarkan kosong (basah). */
export const barisLembarSpg = (hasilSpg = []) =>
  hasilSpg.map((r) => ({ no: r.no, uraian: r.uraian, tanggal: r.penetapan?.tanggal ?? '', terpenuhi: r.status === 'terpenuhi' }));

/** Penandatangan lembar penilaian: nama anggota tim menurut urutan, dipenuhi sampai JUMLAH_PENANDA_TANGAN_TIM (lebih banyak anggota tetap dicetak semua). */
export function penandaTanganTim(tim) {
  const nama = (tim?.anggota ?? []).map((a) => a.nama);
  while (nama.length < JUMLAH_PENANDA_TANGAN_TIM) nama.push('');
  return nama.map((n, i) => ({ no: i + 1, nama: n }));
}

/** Butir dokumen lampiran untuk daftar lampiran cetak: [{ no, jenis, status }] dari ITEM_PORTOFOLIO. */
export const daftarLampiran = (items, ambilStatus) => items.map((it) => ({ no: it.no, jenis: it.jenis, status: ambilStatus(it.id) }));

const urutan = (n) => Array.from({ length: n }, (_, i) => i + 1);

/** Kegiatan Pramuka yang pernah diikuti: BARIS_KEGIATAN baris { no, nama, tingkat ('kwarran' | 'kwarcab' | 'kwarda' | '') } dari isian Penegak. */
export const barisKegiatan = (isian = {}) => urutan(BARIS_KEGIATAN).map((i) => ({ no: i, nama: isian[`keg${i}_nama`] ?? '', tingkat: isian[`keg${i}_tingkat`] ?? '' }));

/** Bidang kecakapan lain: BARIS_BIDANG baris { no, nama, jenis }; jenis kosong memakai jenis pracetak lembar Kwarcab (Seni Budaya, Olahraga, Ilmu Pengetahuan pada baris ganjil). */
export const barisBidang = (isian = {}) => urutan(BARIS_BIDANG).map((i) => ({ no: i, nama: isian[`bid${i}_nama`] ?? '', jenis: isian[`bid${i}_jenis`] || BIDANG_BAWAAN[i - 1] || '' }));

/** Perangkat komunikasi/IT yang dikuasai: BARIS_PERANGKAT baris { no, nama, level ('bisa' | 'cukup' | 'kurang' | '') }. */
export const barisPerangkat = (isian = {}) => urutan(BARIS_PERANGKAT).map((i) => ({ no: i, nama: isian[`it${i}_nama`] ?? '', level: isian[`it${i}_level`] ?? '' }));
