/**
 * GERBANG CALON GARUDA (Tahap 2, G4; murni tanpa React). Gerbang hanya PERINGATAN (keputusan pemilik 25 Sep 2026): kelas, usia, SKU, dan kuota dihitung di sini dan
 * ditampilkan; server tidak memblokir pendaftaran Calon Garuda. Server hanya menyimpan tanggal lahir (sg_tanggal_lahir_atur) dan aturan gerbang (sg_gerbang_simpan);
 * `periksaTanggalLahir` dan `periksaGerbang` dicerminkan dan DIBANDINGKAN LANGSUNG dengan SQL pada kisi masukan di uji/gerbang-klien.mjs. Aturan bawaan mengikuti
 * pedoman Kwarcab Purbalingga 2026 (usia 16-20 tahun: lahir 1 Nov 2007 s.d. 1 Mei 2009; minimal kelas XI; calon maksimal 5% dari Penegak aktif) dan diperbarui tiap tahun.
 */
import { hariIni } from './format';
import { kelasDariRombel } from './rombelLogic';
import { layakGaruda } from './skuLogic';

export const GERBANG_BAWAAN = { kelasMin: 'XI', lahirDari: '2007-11-01', lahirSampai: '2009-05-01', kuotaPersen: 5 };
const URUT_KELAS = { X: 1, XI: 2, XII: 3 };
const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/** Tingkat kelas Penegak: 'X' | 'XI' | 'XII', atau null bila belum berbentuk rombel baku (data lama "X" tetap dikenali). */
export function tingkatKelas(kelas) {
  const r = kelasDariRombel(kelas);
  if (r) return r;
  const t = String(kelas ?? '').toUpperCase().replace(/\s+/g, '');
  return URUT_KELAS[t] ? t : null;
}

/** Tanggal lahir Penegak ini (YYYY-MM-DD) atau null. */
export const tanggalLahirPeserta = (lahir = [], pesertaId) => lahir.find((l) => l.pesertaId === pesertaId)?.tanggal ?? null;

const fmt = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Kuota Calon Garuda: maksimal `kuotaPersen` persen dari Penegak aktif (dibulatkan ke bawah). `users` = Penegak aktif (yang `calonGaruda`-nya terisi = sudah terdaftar).
 * Hasil: { aktif, maks, terdaftar, sisa } (sisa negatif = melebihi kuota).
 */
export function kuotaCalon(users = [], aturan = GERBANG_BAWAAN) {
  const aktif = users.length;
  const maks = Math.floor((aktif * aturan.kuotaPersen) / 100);
  const terdaftar = users.filter((u) => u.calonGaruda).length;
  return { aktif, maks, terdaftar, sisa: maks - terdaftar };
}

/**
 * Syarat gerbang satu Penegak: { syarat: [{ id: 'kelas'|'usia'|'sku', label, status: 'ok'|'tidak'|'belum-data', teks }], ok, tidak, belumData }.
 * `data` = { peserta, tanggalLahir (atau null), progress, aturan }.
 */
export function hitungGerbang({ peserta, tanggalLahir = null, progress = {}, aturan = GERBANG_BAWAAN }) {
  const syarat = [];
  const tk = tingkatKelas(peserta.kelas);
  syarat.push(!tk
    ? { id: 'kelas', label: 'Kelas', status: 'belum-data', teks: `Kelas "${peserta.kelas || '-'}" belum berbentuk rombel baku (mis. XI-01).` }
    : URUT_KELAS[tk] >= URUT_KELAS[aturan.kelasMin]
      ? { id: 'kelas', label: 'Kelas', status: 'ok', teks: `Kelas ${tk}; minimal ${aturan.kelasMin}.` }
      : { id: 'kelas', label: 'Kelas', status: 'tidak', teks: `Kelas ${tk}; minimal ${aturan.kelasMin}.` });
  syarat.push(!tanggalLahir
    ? { id: 'usia', label: 'Usia', status: 'belum-data', teks: 'Tanggal lahir belum diisi.' }
    : tanggalLahir >= aturan.lahirDari && tanggalLahir <= aturan.lahirSampai
      ? { id: 'usia', label: 'Usia', status: 'ok', teks: `Lahir ${fmt(tanggalLahir)}; rentang sah ${fmt(aturan.lahirDari)} s.d. ${fmt(aturan.lahirSampai)}.` }
      : { id: 'usia', label: 'Usia', status: 'tidak', teks: `Lahir ${fmt(tanggalLahir)}; di luar rentang ${fmt(aturan.lahirDari)} s.d. ${fmt(aturan.lahirSampai)}.` });
  syarat.push(layakGaruda(progress, peserta)
    ? { id: 'sku', label: 'SKU', status: 'ok', teks: 'SKU Bantara dan Laksana selesai.' }
    : { id: 'sku', label: 'SKU', status: 'tidak', teks: 'SKU Bantara dan Laksana belum selesai.' });
  return {
    syarat,
    ok: syarat.filter((s) => s.status === 'ok').length,
    tidak: syarat.filter((s) => s.status === 'tidak').length,
    belumData: syarat.filter((s) => s.status === 'belum-data').length,
  };
}

/** Cermin validasi sg_tanggal_lahir_atur sesudah memeriksa Penegaknya. Tanggal kosong = menghapus catatan (sah). Mengembalikan pesan galat atau ''. */
export function periksaTanggalLahir({ tanggal, hari = hariIni() }) {
  if (!tanggal) return '';
  if (!TANGGAL.test(tanggal) || tanggal < '1990-01-01' || tanggal > hari) return 'Tanggal lahir tidak boleh sebelum tahun 1990 atau di masa depan.';
  return '';
}

const tanggalSah = (t) => {
  if (Number(t.slice(0, 4)) < 1) return false;
  const d = new Date(`${t}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
};

/** Cermin validasi sg_gerbang_simpan. `nilai` = { kelasMin, lahirDari, lahirSampai, kuotaPersen } (angka bulat, bukan teks). Mengembalikan pesan galat atau ''. */
export function periksaGerbang(nilai) {
  const KUNCI = ['kelasMin', 'lahirDari', 'lahirSampai', 'kuotaPersen'];
  if (!nilai || typeof nilai !== 'object' || Array.isArray(nilai) || Object.keys(nilai).some((k) => !KUNCI.includes(k))) return 'Bentuk aturan gerbang tidak sah.';
  if (typeof nilai.kelasMin !== 'string' || typeof nilai.lahirDari !== 'string' || typeof nilai.lahirSampai !== 'string' || typeof nilai.kuotaPersen !== 'number') return 'Bentuk aturan gerbang tidak sah.';
  if (!URUT_KELAS[nilai.kelasMin]) return 'Kelas minimal harus X, XI, atau XII.';
  if (!TANGGAL.test(nilai.lahirDari) || !TANGGAL.test(nilai.lahirSampai)) return 'Tanggal lahir harus berbentuk TTTT-BB-HH.';
  if (!tanggalSah(nilai.lahirDari) || !tanggalSah(nilai.lahirSampai)) return 'Tanggal lahir tidak sah.';
  if (nilai.lahirDari < '1990-01-01' || nilai.lahirSampai > '2030-12-31') return 'Rentang tanggal lahir harus antara tahun 1990 dan 2030.';
  if (nilai.lahirDari > nilai.lahirSampai) return 'Tanggal lahir awal tidak boleh sesudah tanggal akhir.';
  if (!Number.isInteger(nilai.kuotaPersen) || nilai.kuotaPersen < 0 || nilai.kuotaPersen > 100) return 'Kuota harus bilangan bulat 0 sampai 100 persen.';
  return '';
}

export const STATUS_GERBANG = {
  ok: { label: 'Memenuhi', kelas: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
  tidak: { label: 'Belum memenuhi', kelas: 'bg-red-50 text-red-800 ring-red-300' },
  'belum-data': { label: 'Data belum ada', kelas: 'bg-amber-50 text-amber-900 ring-amber-300' },
};
