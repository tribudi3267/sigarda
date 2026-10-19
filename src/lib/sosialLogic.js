/**
 * MEDIA SOSIAL (murni, tanpa React): mengenali tautan BAGIKAN sebuah postingan (milik akun mana pun, tidak harus akun gudep) dan membangun alamat pemutarnya.
 *
 * Beranda tidak memuat skrip pihak ketiga: kartu awalnya hanya gambar pratinjau + tombol putar, dan pemutar (iframe resmi platform) baru dibuat saat pengunjung
 * mengetuk tombol itu (lihat KartuSosial di src/landing/bagian.jsx). Pengetahuan tentang bentuk tautan tiap platform ada di sini, satu tempat, dan hanya
 * membentuk alamat dari ID yang lolos pola ketat (bukan menyalin tautan mentah ke iframe).
 *
 * analisisSosial(tautan) -> {
 *   jenis:   'kosong' | 'tidak-sah' | 'tidak-dikenal' (bukan Instagram/YouTube/Facebook/TikTok) | 'bukan-postingan' (profil, beranda, playlist, story) | 'postingan'
 *   platform: 'instagram' | 'youtube' | 'facebook' | 'tiktok' | ''
 *   embedUrl: alamat pemutar ('' = tidak dapat diputar di beranda; kartu membuka postingannya di platform)
 *   thumbUrl: gambar pratinjau yang dihitung di sini (hanya YouTube; Instagram/TikTok diambil fungsi sosial-sampul saat disimpan, lihat sosialSampulLogic.js)
 *   bentuk:   'video' (16:9) | 'tegak' (pemutar tinggi) | ''
 *   pesan:    penjelasan untuk pengurus bila bukan postingan
 * }
 */
import { rapikan, tautanSah } from './berandaLogic';

const HOST = {
  youtube: new Set(['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'youtube-nocookie.com']),
  instagram: new Set(['instagram.com', 'instagr.am']),
  tiktok: new Set(['tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']),
  facebook: new Set(['facebook.com', 'm.facebook.com', 'mbasic.facebook.com', 'fb.com', 'fb.watch']),
};
export const LABEL_PLATFORM_SOSIAL = { instagram: 'Instagram', youtube: 'YouTube', facebook: 'Facebook', tiktok: 'TikTok' };

const ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/;
const KODE_INSTAGRAM = /^[A-Za-z0-9_-]{5,40}$/;
const ID_TIKTOK = /^\d{10,25}$/;
const PESAN_BUKAN_POSTINGAN = 'Ini tautan profil atau halaman akun, bukan sebuah postingan. Buka postingannya, ketuk Bagikan, lalu salin tautannya (tidak harus akun gudep sendiri).';

/** Pesan galat bila tautan tidak boleh disimpan sebagai kiriman media sosial (profil/halaman akun, atau bukan dari empat platform); '' bila sah atau bukan urusan fungsi ini. */
export function galatTautanSosial(tautan) {
  const a = analisisSosial(tautan);
  return a.jenis === 'bukan-postingan' || a.jenis === 'tidak-dikenal' ? a.pesan : '';
}

const hasil = (jenis, platform = '', tambahan = {}) => ({ jenis, platform, embedUrl: '', thumbUrl: '', bentuk: '', pesan: '', ...tambahan });
const bukanPostingan = (platform) => hasil('bukan-postingan', platform, { pesan: PESAN_BUKAN_POSTINGAN });
const postingan = (platform, tambahan = {}) => hasil('postingan', platform, tambahan);

export function analisisSosial(tautan) {
  const s = rapikan(tautan);
  if (!s) return hasil('kosong');
  if (!tautanSah(s)) return hasil('tidak-sah');
  let u;
  try { u = new URL(s); } catch { return hasil('tidak-sah'); }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const bagian = u.pathname.split('/').filter(Boolean);
  const platform = Object.keys(HOST).find((p) => HOST[p].has(host));
  if (!platform) return hasil('tidak-dikenal', '', { pesan: 'Tempel tautan postingan dari Instagram, YouTube, Facebook, atau TikTok.' });

  if (platform === 'youtube') {
    let id = '';
    if (host === 'youtu.be') id = bagian[0] ?? '';
    else if (bagian[0] === 'watch') id = u.searchParams.get('v') ?? '';
    else if (['shorts', 'live', 'embed', 'v'].includes(bagian[0])) id = bagian[1] ?? '';
    if (!ID_YOUTUBE.test(id)) return bukanPostingan(platform);
    return postingan(platform, { embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`, thumbUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, bentuk: 'video' });
  }

  if (platform === 'instagram') {
    if (bagian[0] === 'share' && bagian.length >= 2) return postingan(platform); // tautan Bagikan baru (share/reel/KODE): kode itu BUKAN kode postingan, kartu membuka postingannya
    const i = bagian.findIndex((b) => ['p', 'reel', 'reels', 'tv'].includes(b));
    if (i >= 0 && i <= 1 && KODE_INSTAGRAM.test(bagian[i + 1] ?? '')) {
      const jenis = bagian[i] === 'reels' ? 'reel' : bagian[i];
      return postingan(platform, { embedUrl: `https://www.instagram.com/${jenis}/${bagian[i + 1]}/embed`, bentuk: 'tegak' });
    }
    return bukanPostingan(platform);
  }

  if (platform === 'tiktok') {
    const v = bagian.indexOf('video');
    // Pemutar resmi "player/v1" (bukan embed/v2): pas di kotak kartu tanpa bilah gulir, dan rel=0 membuat video terkait berisi video dari pembuat yang sama (bukan rekomendasi TikTok).
    // TikTok tidak menyediakan cara mematikan video terkait sepenuhnya. Diuji dari alamat situs sungguhan: dijeda hanya menampilkan bilah kendali. autoplay=1 karena pemutar baru dimuat sesudah tombol putar diketuk.
    if (bagian[0]?.startsWith('@') && v === 1 && ID_TIKTOK.test(bagian[2] ?? '')) return postingan(platform, { embedUrl: `https://www.tiktok.com/player/v1/${bagian[2]}?rel=0&autoplay=1`, bentuk: 'tegak' });
    if (host !== 'tiktok.com' && bagian.length >= 1) return postingan(platform); // vm.tiktok.com/xxxx (tautan pendek): tidak dapat diputar langsung
    if (bagian[0] === 't' && bagian.length >= 2) return postingan(platform);
    return bukanPostingan(platform);
  }

  // facebook
  if (host === 'fb.watch' && bagian.length >= 1) return postingan(platform);
  const alamat = `https://www.facebook.com${u.pathname}${u.search}`;
  const videoId = bagian[0] === 'watch' ? (u.searchParams.get('v') ?? '') : '';
  const adalahVideo = bagian.includes('videos') || bagian[0] === 'reel' || /^\d+$/.test(videoId);
  if (adalahVideo) return postingan(platform, { embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(alamat)}&show_text=false`, bentuk: 'video' });
  if (bagian.includes('posts') || bagian[0] === 'permalink.php' || bagian.includes('photos') || bagian[0] === 'photo') {
    return postingan(platform, { embedUrl: `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(alamat)}&show_text=true`, bentuk: 'tegak' });
  }
  if (bagian[0] === 'share' && bagian.length >= 2) return postingan(platform);
  return bukanPostingan(platform);
}
