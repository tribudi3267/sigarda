/**
 * BANTUAN TAMPILAN SURAT PENGANTAR GURU AGAMA (murni, tanpa React)
 *
 * Nomor surat dibuat server dari format pada pengaturan `surat.format_nomor` (bawaan {no3}/SP/{tahun}) dan penghitung per tahun,
 * memakai mesin nomor yang sama dengan berita acara sidang (sigarda.format_nomor), tetapi TANPA kode {tingkat}.
 */
import { formatNomor, periksaFormatNomor } from './sidangLogic';

export const KUNCI_FORMAT_SURAT = 'surat.format_nomor';
export const FORMAT_SURAT_BAWAAN = '{no3}/SP/{tahun}';

/** Pesan galat untuk format nomor surat, atau '' bila sah (aturan sama dengan sg_pengaturan_simpan, kunci surat.format_nomor). */
export function periksaFormatSurat(format) {
  if (/\{tingkat\}/.test(String(format ?? ''))) return 'Kode {tingkat} tidak dipakai pada nomor surat. Gunakan {no3}, {tahun}, {bulan}, atau {romawi}.';
  return periksaFormatNomor(format);
}

/** Contoh nomor dari format, untuk pratinjau. */
export const contohNomorSurat = (format, no, tanggal) => formatNomor(format, { no, tanggal, tingkat: '' });

/** Nomor urut berikutnya untuk tahun ini bila diketahui dari surat yang sudah terbit (perkiraan; server yang menentukan). */
export function nomorUrutBerikutnya(dokumen, tahun) {
  const semua = (dokumen ?? []).filter((d) => String(d.tanggal).slice(0, 4) === String(tahun) && d.nomorUrut != null).map((d) => d.nomorUrut);
  return (semua.length ? Math.max(...semua) : 0) + 1;
}

/** "Butir 1a, Butir 1b" dari daftar id unit; urutan mengikuti daftar. */
export function ringkasButir(ids, labelUnit) {
  return (ids ?? []).map((id) => labelUnit(id)).join(', ');
}
