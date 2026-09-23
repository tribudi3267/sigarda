/**
 * USULAN KEGIATAN (tahap L6b, murni tanpa React): Musyawarah Ambalan + 10 kegiatan lain. Cermin syarat di sg_kegiatan_usul/tinjau/ping
 * (SQL), dijaga uji/kegiatan.mjs. Bentuk satu usulan: { id, jenis, tahunAjaran, tanggalUsul, dokumenUrl, catatan, status, diajukanOleh,
 * diajukanOlehNama, diajukanPada, ditinjauOleh, ditinjauOlehNama, ditinjauPada, catatanTinjauan, dipingPada, agendaId }
 */

/** 11 jenis yang didukung alur usulan Pradana/Pradani -> Pembina (kode dan judul harus sama dengan sigarda.kegiatan_judul_bawaan di SQL). */
export const JENIS_USULAN = [
  { id: 'musyawarah', label: 'Musyawarah Ambalan' },
  { id: 'pelantikan_bantara', label: 'Pembayatan dan Pelantikan Bantara' },
  { id: 'pelantikan_laksana', label: 'Pelantikan Laksana' },
  { id: 'pengembaraan', label: 'Pengembaraan' },
  { id: 'perkemahan', label: 'Perkemahan' },
  { id: 'gelora_saka_expo', label: 'Gelora Saka Expo' },
  { id: 'gladi_tangguh_1', label: 'Gladi Tangguh 1' },
  { id: 'gladi_tangguh_2', label: 'Gladi Tangguh 2' },
  { id: 'penempuhan_sku_laksana', label: 'Penempuhan SKU Laksana' },
  { id: 'ptgd', label: 'PTGD (Penerimaan Tamu Gugus Depan)' },
  { id: 'pembekalan_dewan', label: 'Pembekalan Dewan Ambalan Angkatan Berikutnya' },
];

/** Judul bawaan untuk satu jenis usulan (atau kode itu sendiri, dirapikan, bila tidak dikenal). */
export const labelJenisUsulan = (jenis) => JENIS_USULAN.find((j) => j.id === jenis)?.label ?? jenis;

export const LABEL_STATUS_USULAN = { menunggu: 'Menunggu', disetujui: 'Disetujui', ditolak: 'Ditolak' };

/** Tautan dokumen proposal harus berupa alamat web (sama dengan pemeriksaan server). */
export const dokumenUrlSah = (url) => /^https?:\/\//.test(String(url ?? '').trim()) && String(url).trim().length <= 500;

/** Aturan isian pengajuan; sama dengan sg_kegiatan_usul di SQL. */
export function periksaUsulan(u) {
  const galat = {};
  if (!JENIS_USULAN.some((j) => j.id === u.jenis)) galat.jenis = 'Jenis kegiatan tidak dikenal.';
  if (!/^[0-9]{4}\/[0-9]{4}$/.test(u.tahunAjaran ?? '') || Number(u.tahunAjaran.split('/')[1]) !== Number(u.tahunAjaran.split('/')[0]) + 1) {
    galat.tahunAjaran = 'Tahun ajaran tidak sah. Contoh: 2026/2027.';
  }
  if (!u.tanggalUsul) galat.tanggalUsul = 'Tanggal usulan wajib diisi.';
  if (!dokumenUrlSah(u.dokumenUrl)) galat.dokumenUrl = 'Tautan dokumen proposal harus berupa alamat web (diawali http:// atau https://).';
  if ((u.catatan ?? '').length > 500) galat.catatan = 'Maksimal 500 karakter.';
  return galat;
}

/** Catatan tinjauan wajib diisi bila menolak. */
export function periksaTinjauan(keputusan, catatan) {
  if (keputusan === 'ditolak' && !String(catatan ?? '').trim()) return { catatan: 'Catatan alasan penolakan wajib diisi.' };
  if ((catatan ?? '').length > 500) return { catatan: 'Maksimal 500 karakter.' };
  return {};
}

/** Boleh mengingatkan lagi (belum pernah, atau sudah lebih dari 24 jam sejak terakhir). */
export function bolehIngatkan(dipingPada, sekarang = new Date()) {
  if (!dipingPada) return true;
  return sekarang.getTime() - new Date(dipingPada).getTime() > 24 * 60 * 60 * 1000;
}

/** Usulan berstatus "menunggu" untuk satu (tahun ajaran, jenis) (atau null), untuk menampilkan panel yang relevan. */
export const usulanMenunggu = (daftar = [], tahunAjaran, jenis) =>
  daftar.find((u) => u.tahunAjaran === tahunAjaran && u.jenis === jenis && u.status === 'menunggu') ?? null;

/** Usulan terakhir (apa pun statusnya) untuk satu (tahun ajaran, jenis), mis. untuk menampilkan alasan penolakan terakhir. */
export const usulanTerakhir = (daftar = [], tahunAjaran, jenis) =>
  daftar.filter((u) => u.tahunAjaran === tahunAjaran && u.jenis === jenis).sort((a, b) => b.id - a.id)[0] ?? null;
