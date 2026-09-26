/**
 * Eskalasi (tahap L5, murni tanpa React). Cermin syarat di sigarda.eskalasi_* dan sg_profil_whatsapp_atur (inti.sql).
 * Server menghitung kejadian dan tingkat; di sini hanya format nomor WhatsApp, tautan wa.me, dan label tampilan.
 */

import { pembinaAtauAdmin } from './hakLogic';

const JENIS = ['sku', 'absensi', 'iuran'];
const LABEL_JENIS = { sku: 'SKU', absensi: 'Absensi', iuran: 'Iuran' };
const TINGKAT_LABEL = { 1: 'Ramah', 2: 'Tegas', 3: 'Mendesak' };

export const labelJenisEskalasi = (jenis) => LABEL_JENIS[jenis] ?? jenis;
export const labelTingkatEskalasi = (tingkat) => TINGKAT_LABEL[tingkat] ?? String(tingkat);

/** Nomor WhatsApp sah: hanya angka, spasi, dan tanda + ( ) . / -, 8-20 karakter (sama dengan pemeriksaan server). Kosong dianggap TIDAK sah (belum diisi). */
export function whatsappSah(nomor) {
  const v = String(nomor ?? '').trim();
  return v.length > 0 && /^[0-9 +()./-]{8,20}$/.test(v);
}

/** Nomor lokal (08...) atau internasional (+62.../62...) menjadi format internasional tanpa tanda, untuk wa.me. */
function nomorIntl(nomor) {
  const digit = String(nomor ?? '').replace(/\D/g, '');
  if (!digit) return '';
  if (digit.startsWith('0')) return '62' + digit.slice(1);
  if (digit.startsWith('62')) return digit;
  return '62' + digit;
}

/** Tautan wa.me: dengan nomor (langsung ke kontak itu) atau tanpa nomor (pengguna memilih kontak sendiri di WhatsApp), teks selalu siap-kirim. */
export function waLink(nomor, teks = '') {
  return `https://wa.me/${nomorIntl(nomor)}?text=${encodeURIComponent(teks)}`;
}

/** Pesan siap-kirim untuk satu entri daftar Tindak Lanjut ({ nama, jenis, hari }); nada ramah, tanpa menyebut hasil lulus/ulang. */
export function teksWaSiap({ nama, jenis, hari }) {
  const soal = jenis === 'sku' ? 'belum ada aktivitas SKU' : jenis === 'absensi' ? 'tidak hadir latihan Jumat tanpa keterangan' : 'iuran belum tercatat';
  return `Halo ${nama}, ini dari Pembina/Dewan Ambalan. Sudah ${hari} hari ${soal}. Ada kendala? Kabari kami ya, biar bisa dibantu.`;
}

/** Pesan siap-kirim untuk mengingatkan satu anggota yang belum mengaktifkan notifikasi di HP-nya (tanpa menyebut hasil lulus/ulang). */
export function teksWaAktifkanNotifikasi(nama) {
  return `Halo ${nama}, ini dari pengurus SIGARDA. Notifikasi SIGARDA di HP-mu belum aktif, jadi kabar penting (jadwal, pengajuan, pengingat) belum sampai. `
    + 'Mohon buka SIGARDA di HP, masuk ke menu Notifikasi, lalu ketuk "Aktifkan notifikasi" dan pilih Izinkan. Terima kasih.';
}

/** Pesan siap-kirim untuk mengajak anggota yang akunnya sudah dibuat tetapi belum pernah masuk. TIDAK memuat PIN (PIN awal disampaikan Pembina/Admin secara langsung). */
export function teksWaAjakMasuk(nama, alamat = '') {
  return `Halo ${nama}, ini dari pengurus SIGARDA. Akun SIGARDA-mu sudah dibuat tetapi belum pernah dipakai masuk${alamat ? `. Silakan buka ${alamat}` : '. Silakan buka SIGARDA'}`
    + ' lalu masuk dengan username dan PIN awal dari Pembina/Admin; kamu akan diminta membuat PIN baru saat masuk pertama. '
    + 'Kalau lupa PIN awal atau ada kendala, kabari kami ya, nanti dibantu. Terima kasih.';
}

/** Teks WhatsApp ajakan melengkapi data diri (Periksa Data): menyebut isian yang kurang dan tempat mengisinya. `kurang` = daftar label isian. */
export function teksWaLengkapiDataDiri(nama, kurang = [], alamat = '') {
  return `Halo ${nama}, ini dari pengurus SIGARDA. Data dirimu untuk portofolio Garuda masih perlu dilengkapi: ${kurang.join(', ')}. `
    + `Silakan buka ${alamat || 'SIGARDA'}, masuk, lalu pilih menu Akun saya > Data diri (atau isi lewat jendela yang muncul sesudah masuk). Kalau ada kendala, kabari kami ya. Terima kasih.`;
}

/**
 * Siapa boleh menghubungi siapa lewat tombol WhatsApp di Periksa Data dan daftar perangkat notifikasi. `peran` = label peran pada baris server
 * ('Penegak', 'Pembina', 'Admin Gudep', selain itu Dewan Ambalan). Pembina dan Admin: Penegak, Dewan Ambalan, dan sesama Pembina; Dewan Ambalan:
 * Penegak dan sesama Dewan. Admin Gudep tidak pernah dihubungi lewat tombol ini; diri sendiri juga tidak. `pengguna` = akun bentuk tampilan.
 */
export function bolehDihubungi(pengguna, { id, peran } = {}) {
  if (!pengguna || (id && id === pengguna.id) || peran === 'Admin Gudep') return false;
  const pembinaAdmin = pembinaAtauAdmin(pengguna);
  if (peran === 'Pembina') return pembinaAdmin;
  return pembinaAdmin || pengguna.role === 'penguji';
}

/** Nomor WhatsApp tersimpan milik anggota `id` pada daftar `users` (bentuk tampilan); '' bila belum diisi atau formatnya tidak sah. */
export function nomorWaAnggota(users, id) {
  const nomor = (users ?? []).find((u) => u.id === id)?.whatsapp;
  return whatsappSah(nomor) ? String(nomor).trim() : '';
}

export { JENIS as JENIS_ESKALASI };
