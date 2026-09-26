/**
 * PERLINDUNGAN ANGGOTA / SAFE FROM HARM (Tahap 4; murni tanpa React). Mengikuti Jukran Kwarnas 004/2021 (Peraturan Perlindungan bagi Anggota Gerakan Pramuka): kewajiban anggota
 * dewasa gugus depan (Pembina: lulus pelatihan perlindungan [Pasal 9 ayat 3 huruf b], menandatangani pakta integritas [Pasal 7 ayat 4 huruf f], pemeriksaan riwayat hidup dan rekam
 * jejak [Pasal 7 ayat 4 huruf e]; Admin Gudep: pelatihan) dicatat lewat sg_sfh_catat, dan penerima laporan gugus depan [Pasal 10 ayat 3] lewat sg_sfh_gudep_simpan. Aplikasi hanya
 * MENCATAT; laporan kejadian TIDAK disimpan di aplikasi (Pasal 8 ayat 4 huruf g: rahasia, ditangani Komite Perlindungan dan Dewan Kehormatan di luar aplikasi).
 * `periksaCatatSfh` dan `periksaGudepSfh` mencerminkan SQL dan DIBANDINGKAN LANGSUNG pada kisi masukan (uji/perlindungan.mjs).
 */
import { hariIni } from './format';

const rapikan = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const TERLARANG = /[\u0000-\u001f\u007f<>]/;
const URL_SAH = /^https?:\/\/[^\s<>]+$/i;

/** Jenis catatan; `untuk` = peran yang wajib. */
export const JENIS_SFH = [
  { id: 'pelatihan', label: 'Pelatihan Safe From Harm', pasal: 'Pasal 9 ayat (3) huruf b', untuk: ['Pembina', 'Admin Gudep'], bantuan: 'Semua orang dewasa yang terlibat dalam kegiatan harus lulus Pelatihan Perlindungan bagi Anggota Gerakan Pramuka.' },
  { id: 'pakta_integritas', label: 'Pakta integritas dan kode etik', pasal: 'Pasal 7 ayat (4) huruf f', untuk: ['Pembina'], bantuan: 'Pembina Pramuka harus menaati kode etik dan menandatangani pakta integritas.' },
  { id: 'rekam_jejak', label: 'Pemeriksaan riwayat hidup dan rekam jejak', pasal: 'Pasal 7 ayat (4) huruf e', untuk: ['Pembina'], bantuan: 'Pengangkatan anggota dewasa melalui pemeriksaan riwayat hidup dan rekam jejak yang sesuai prinsip perlindungan anggota.' },
];
export const labelJenisSfh = (id) => JENIS_SFH.find((j) => j.id === id)?.label ?? id;

/** Peran anggota dewasa yang dicatat: 'Pembina' | 'Admin Gudep' | null (bukan anggota dewasa yang dicatat). */
export const peranSfh = (u) => (u?.role === 'admin' ? 'Admin Gudep' : u?.role === 'penguji' && u?.jabatan === 'Pembina' ? 'Pembina' : null);

/** Jenis yang wajib dicatat untuk satu anggota (bentuk tampilan). */
export const jenisWajib = (u) => { const p = peranSfh(u); return p ? JENIS_SFH.filter((j) => j.untuk.includes(p)) : []; };

/** Anggota dewasa aktif yang dicatat: Pembina dan Admin Gudep, urut peran (Pembina dulu) lalu nama. */
export const anggotaSfh = (users = []) => users.filter((u) => peranSfh(u) && (u.status ?? 'aktif') === 'aktif')
  .sort((a, b) => Number(peranSfh(a) === 'Admin Gudep') - Number(peranSfh(b) === 'Admin Gudep') || a.nama.localeCompare(b.nama, 'id'));

/** Status satu anggota: [{ jenis, label, pasal, catatan (baris atau null) }] untuk jenis yang wajib baginya. */
export const statusSfh = (catatan = [], u) => jenisWajib(u).map((j) => ({ jenis: j.id, label: j.label, pasal: j.pasal, catatan: catatan.find((c) => c.anggotaId === u.id && c.jenis === j.id) ?? null }));

/** Kurang berapa jenis untuk satu anggota (0 = lengkap). */
export const jumlahKurangSfh = (catatan, u) => statusSfh(catatan, u).filter((s) => !s.catatan).length;

/** Cermin sg_sfh_catat: teks galat atau '' bila sah. `anggota` = bentuk tampilan { role, jabatan, status }. */
export function periksaCatatSfh({ anggota, jenis, tanggal, buktiUrl = '', catatan = '', hari = hariIni() }) {
  if (!['pelatihan', 'pakta_integritas', 'rekam_jejak'].includes(jenis)) return 'Jenis catatan harus pelatihan, pakta_integritas, atau rekam_jejak.';
  if (!anggota) return 'Pilih anggota.';
  const peran = peranSfh(anggota);
  if ((anggota.status ?? 'aktif') !== 'aktif' || !peran) return 'Catatan Safe From Harm hanya untuk anggota dewasa aktif (Pembina dan Admin Gudep).';
  if (peran === 'Admin Gudep' && jenis !== 'pelatihan') return 'Admin Gudep hanya dicatat untuk pelatihan; pakta integritas dan rekam jejak untuk Pembina.';
  if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal) || tanggal < '2015-01-01' || tanggal > hari) return 'Tanggal tidak boleh sebelum tahun 2015 atau di masa depan.';
  const url = String(buktiUrl ?? '').trim();
  if (url.length > 500) return 'Tautan bukti maksimal 500 karakter.';
  if (url !== '' && !URL_SAH.test(url)) return 'Tautan bukti harus berawalan http:// atau https:// tanpa spasi.';
  const c = rapikan(catatan);
  if (c.length > 200 || TERLARANG.test(c)) return 'Catatan maksimal 200 karakter dan tanpa karakter khusus.';
  return '';
}

export const GUDEP_SFH_KOSONG = { penerima: '', kontak: '', prosedurUrl: '', catatan: '' };
const BATAS_GUDEP = { penerima: 120, kontak: 80, catatan: 300 };

/** Nilai pengaturan 'perlindungan.gudep' yang aman (bentuk rusak atau belum ada = kosong). */
export const susunGudepSfh = (nilai) => (nilai && typeof nilai === 'object' && !Array.isArray(nilai)
  ? Object.fromEntries(Object.keys(GUDEP_SFH_KOSONG).map((k) => [k, typeof nilai[k] === 'string' ? nilai[k] : '']))
  : { ...GUDEP_SFH_KOSONG });

/** Penerima laporan sudah diisi? (minimal penerima). */
export const gudepSfhTerisi = (g) => !!rapikan(g?.penerima);

/** Cermin sg_sfh_gudep_simpan: teks galat atau '' bila sah. */
export function periksaGudepSfh(nilai) {
  if (!nilai || typeof nilai !== 'object' || Array.isArray(nilai) || Object.keys(nilai).some((k) => !(k in GUDEP_SFH_KOSONG))) return 'Bentuk isian tidak sah.';
  for (const k of Object.keys(GUDEP_SFH_KOSONG)) {
    if (typeof nilai[k] !== 'string') return `Isian ${k} harus berupa teks.`;
    if (k === 'prosedurUrl') {
      const v = nilai[k].trim();
      if (v.length > 500 || (v !== '' && !URL_SAH.test(v))) return 'Tautan prosedur harus berawalan http:// atau https:// tanpa spasi (maksimal 500 karakter).';
    } else {
      const v = rapikan(nilai[k]);
      if (v.length > BATAS_GUDEP[k] || TERLARANG.test(v)) return `Isian ${k} terlalu panjang atau memuat karakter khusus.`;
    }
  }
  return '';
}

/** Teks WhatsApp ajakan melengkapi catatan Safe From Harm (Periksa Data). `kurang` = daftar label jenis. */
export function teksWaLengkapiSfh(nama, kurang = [], alamat = '') {
  return `Halo ${nama}, ini dari pengurus SIGARDA. Catatan perlindungan anggota (Safe From Harm) milikmu masih perlu dilengkapi: ${kurang.join(', ')}. `
    + `Bukti (mis. sertifikat pelatihan atau pakta integritas yang sudah ditandatangani) dapat diserahkan ke Pembina atau Admin Gudep untuk dicatat di ${alamat || 'SIGARDA'}. Terima kasih.`;
}
