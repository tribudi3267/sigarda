/**
 * Gambar pratinjau otomatis kiriman Instagram/TikTok (murni): menentukan kapan formulir Media Sosial boleh meminta gambar ke fungsi server `sosial-sampul`
 * (supabase/functions/sosial-sampul/index.ts, yang menyalin gambarnya ke Storage SIGARDA). Fungsi itu memeriksa ulang semuanya; pemeriksaan di sini hanya
 * menghindari permintaan yang pasti ditolak. `platformSampul` dicerminkan dari fungsi server yang sama dan dibandingkan langsung di uji/sosial-sampul.mjs.
 */
import { analisisSosial } from './sosialLogic';

const HOST_TAUTAN = {
  instagram: new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com', 'instagr.am', 'www.instagr.am']),
  tiktok: new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']),
};

/** Platform tautan yang dapat diambil gambarnya ('instagram' | 'tiktok' | ''): https dan host dikenal. */
export function platformSampul(tautan) {
  try {
    const u = new URL(String(tautan ?? '').trim());
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return '';
    const host = u.hostname.toLowerCase();
    return Object.keys(HOST_TAUTAN).find((p) => HOST_TAUTAN[p].has(host)) ?? '';
  } catch { return ''; }
}

/** Tautan postingan (bukan profil) Instagram/TikTok: layak diminta gambarnya. */
export const bisaAmbilSampulSosial = (tautan) => !!platformSampul(tautan) && analisisSosial(tautan).jenis === 'postingan';

/**
 * Perlu mengambil gambar otomatis untuk isian ini? Ya bila tautannya postingan Instagram/TikTok, gambar belum diisi (isian manual menang), dan tautan itu
 * belum dicoba (`sudahDicoba` = tautan terakhir yang sudah diminta), supaya satu tautan tidak diminta berulang-ulang tiap ketikan.
 */
export const perluAmbilSampulSosial = ({ tautan, gambarUrl }, sudahDicoba = '') =>
  bisaAmbilSampulSosial(tautan) && !String(gambarUrl ?? '').trim() && String(tautan).trim() !== sudahDicoba;

/** Kiriman yang sudah tersimpan (termasuk yang sudah tampil di beranda) tetapi belum bergambar, dan boleh diubah pengguna ini (`boleh(s)`). */
export const kirimanTanpaGambar = (daftar, boleh) => (daftar ?? []).filter((s) => bisaAmbilSampulSosial(s.tautan) && !String(s.gambarUrl ?? '').trim() && boleh(s));
