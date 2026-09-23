/**
 * Eskalasi (tahap L5, murni tanpa React). Cermin syarat di sigarda.eskalasi_* dan sg_profil_whatsapp_atur (inti.sql).
 * Server menghitung kejadian dan tingkat; di sini hanya format nomor WhatsApp, tautan wa.me, dan label tampilan.
 */

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

export { JENIS as JENIS_ESKALASI };
