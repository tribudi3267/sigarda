/**
 * PELANTIKAN DAN SAKA (Tahap 2, G1; murni tanpa React). Server yang menegakkan (sg_pelantikan_catat, sg_saka_simpan; hanya Pembina dan Admin); di sini aturan yang sama
 * dicerminkan untuk menampilkan pesan lebih awal dan menyusun daftar: siapa layak dilantik, pemeriksaan isian, dan pengelompokan per upacara.
 * Cermin dibandingkan langsung dengan SQL di uji/pelantikan-klien.mjs. Tanggal memakai WIB (`hariIni`), sama dengan sigarda.hari_ini().
 */
import { tingkatSelesai } from './skuLogic';
import { hariIni } from './format';

export const TINGKAT_PELANTIKAN = [{ id: 'bantara', label: 'Bantara' }, { id: 'laksana', label: 'Laksana' }];
export const labelTingkatPelantikan = (id) => TINGKAT_PELANTIKAN.find((t) => t.id === id)?.label ?? id;
/** Nama tingkat SKU untuk satu tingkat pelantikan ('bantara' -> 'Bantara'), dipakai tingkatSelesai. */
export const tingkatSku = (id) => (id === 'bantara' ? 'Bantara' : 'Laksana');

/** Nama Saka yang lazim (hanya saran pada isian; nama tetap bebas diketik). */
export const SARAN_SAKA = [
  'Saka Bahari', 'Saka Bakti Husada', 'Saka Bhayangkara', 'Saka Dirgantara', 'Saka Kencana', 'Saka Pariwisata', 'Saka Taruna Bumi', 'Saka Wanabakti', 'Saka Wira Kartika', 'Saka Widya Budaya Bakti',
];

const rapikan = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const TANDA_TERLARANG = /[\u0000-\u001f\u007f<>]/;
const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/** Pelantikan Penegak ini: { bantara, laksana } (baris atau null). */
export const pelantikanPeserta = (pelantikan = [], pesertaId) => ({
  bantara: pelantikan.find((p) => p.pesertaId === pesertaId && p.tingkat === 'bantara') ?? null,
  laksana: pelantikan.find((p) => p.pesertaId === pesertaId && p.tingkat === 'laksana') ?? null,
});

/** Keanggotaan Saka Penegak ini (aktif lebih dulu). */
export const sakaPeserta = (saka = [], pesertaId) => saka.filter((s) => s.pesertaId === pesertaId).sort((a, b) => Number(b.status === 'aktif') - Number(a.status === 'aktif') || a.saka.localeCompare(b.saka, 'id'));

/**
 * Penegak yang layak dilantik pada satu tingkat: aktif, sudah menyelesaikan SELURUH butir SKU tingkat itu, dan belum tercatat dilantik pada tingkat itu
 * (cermin syarat sg_pelantikan_catat; mencatat ulang untuk koreksi tetap dimungkinkan lewat `termasukSudah`). Urut kelas lalu nama.
 */
export function calonPelantikan({ users = [], progress = {}, pelantikan = [], tingkat, termasukSudah = false }) {
  return users
    .filter((u) => u.role === 'peserta' && (u.status ?? 'aktif') === 'aktif' && tingkatSelesai(progress, u, tingkatSku(tingkat)))
    .filter((u) => termasukSudah || !pelantikan.some((p) => p.pesertaId === u.id && p.tingkat === tingkat))
    .sort((a, b) => String(a.kelas ?? '').localeCompare(String(b.kelas ?? ''), 'id', { numeric: true }) || a.nama.localeCompare(b.nama, 'id'));
}

/**
 * Memeriksa isian pencatatan pelantikan (cermin validasi sg_pelantikan_catat sebelum memeriksa Penegaknya). Mengembalikan pesan galat atau ''.
 * `jumlah` = banyak Penegak yang dipilih.
 */
export function periksaPelantikan({ tingkat, tanggal, tempat, catatan = '', jumlah = 0, hari = hariIni() }) {
  if (tingkat !== 'bantara' && tingkat !== 'laksana') return 'Tingkat pelantikan harus Bantara atau Laksana.';
  if (!tanggal) return 'Tanggal pelantikan wajib diisi.';
  if (!TANGGAL.test(tanggal) || tanggal < '2000-01-01' || tanggal > hari) return 'Tanggal pelantikan tidak boleh sebelum tahun 2000 atau di masa depan. Catat pelantikan sesudah terlaksana.';
  const t = rapikan(tempat);
  if (t.length < 1 || t.length > 120 || TANDA_TERLARANG.test(t)) return 'Tempat pelantikan wajib diisi (maksimal 120 karakter, tanpa tanda < atau >).';
  const c = rapikan(catatan);
  if (c.length > 200 || TANDA_TERLARANG.test(c)) return 'Catatan maksimal 200 karakter, tanpa tanda < atau >.';
  if (jumlah < 1) return 'Pilih sedikitnya satu Penegak.';
  if (jumlah > 200) return 'Maksimal 200 Penegak sekali catat.';
  return '';
}

/**
 * Memeriksa isian keanggotaan Saka (cermin validasi sg_saka_simpan sebelum memeriksa Penegaknya). Mengembalikan pesan galat atau ''.
 */
export function periksaSaka({ saka, tanggalMasuk, status = 'aktif', tanggalSelesai = null, suratUrl = '', catatan = '', hari = hariIni() }) {
  const s = rapikan(saka);
  if (s.length < 1 || s.length > 60 || TANDA_TERLARANG.test(s)) return 'Nama Saka wajib diisi (maksimal 60 karakter, tanpa tanda < atau >).';
  if (!tanggalMasuk) return 'Tanggal masuk Saka wajib diisi.';
  if (!TANGGAL.test(tanggalMasuk) || tanggalMasuk < '2000-01-01' || tanggalMasuk > hari) return 'Tanggal masuk Saka tidak boleh sebelum tahun 2000 atau di masa depan.';
  if (status !== 'aktif' && status !== 'selesai') return 'Status Saka harus aktif atau selesai.';
  if (status === 'aktif' && tanggalSelesai) return 'Anggota Saka yang masih aktif tidak punya tanggal selesai.';
  if (status === 'selesai' && (!tanggalSelesai || !TANGGAL.test(tanggalSelesai) || tanggalSelesai < tanggalMasuk || tanggalSelesai > hari)) return 'Isi tanggal selesai (tidak sebelum tanggal masuk dan tidak di masa depan).';
  const u = String(suratUrl ?? '').trim();
  if (u && (!/^https?:\/\//i.test(u) || u.length > 500 || /[\u0000-\u001f\u007f\s<>]/.test(u))) return 'Tautan surat keterangan harus berawalan http:// atau https:// (maksimal 500 karakter, tanpa spasi).';
  const c = rapikan(catatan);
  if (c.length > 200 || TANDA_TERLARANG.test(c)) return 'Catatan maksimal 200 karakter, tanpa tanda < atau >.';
  return '';
}

/**
 * Pelantikan dikelompokkan per upacara (tingkat + tanggal + tempat), terbaru dulu: [{ kunci, tingkat, tanggal, tempat, agendaId, anggota: [{ id (baris), pesertaId, nama, kelas }] }].
 * Penegak yang tidak ditemukan di `users` tetap tampil bernama "(anggota dihapus)".
 */
export function kelompokPelantikan(pelantikan = [], users = []) {
  const peta = new Map();
  for (const p of pelantikan) {
    const kunci = `${p.tingkat}|${p.tanggal}|${p.tempat}`;
    const g = peta.get(kunci) ?? { kunci, tingkat: p.tingkat, tanggal: p.tanggal, tempat: p.tempat, agendaId: p.agendaId, anggota: [] };
    const u = users.find((x) => x.id === p.pesertaId);
    g.anggota.push({ id: p.id, pesertaId: p.pesertaId, nama: u?.nama ?? '(anggota dihapus)', kelas: u?.kelas ?? '' });
    peta.set(kunci, g);
  }
  return [...peta.values()]
    .map((g) => ({ ...g, anggota: g.anggota.sort((a, b) => a.nama.localeCompare(b.nama, 'id')) }))
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal) || a.tingkat.localeCompare(b.tingkat));
}

/** Ringkasan jumlah untuk kepala halaman: { bantara, laksana, sakaAktif } (Penegak berbeda yang tercatat). */
export function ringkasPelantikan(pelantikan = [], saka = []) {
  return {
    bantara: pelantikan.filter((p) => p.tingkat === 'bantara').length,
    laksana: pelantikan.filter((p) => p.tingkat === 'laksana').length,
    sakaAktif: new Set(saka.filter((s) => s.status === 'aktif').map((s) => s.pesertaId)).size,
  };
}
