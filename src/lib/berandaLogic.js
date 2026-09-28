/**
 * BERANDA PUBLIK (murni, tanpa React): isian yang diatur pengurus untuk halaman muka (landing page) dan cara menyusunnya untuk ditampilkan.
 *
 * Isian tersimpan sebagai satu objek pada pengaturan `beranda.kontak` (sg_beranda_kontak_simpan; Pembina, Admin Gudep, dan Dewan Ambalan) dan dibaca tanpa
 * login lewat sg_beranda_publik. Aturan isian di sini HARUS sama dengan sg_beranda_kontak_simpan di SQL (dibandingkan langsung oleh uji/beranda-klien.mjs).
 */
import { waLink, whatsappSah } from './eskalasiLogic';

/** Isian satu baris (teks), lalu tautan, lalu paragraf (boleh berbaris banyak). Urutan = urutan di formulir. */
export const KOLOM_TEKS = ['whatsapp', 'email', 'telepon', 'jadwal'];
export const KOLOM_TAUTAN = ['instagram', 'youtube', 'facebook', 'tiktok', 'peta'];
export const KOLOM_PARAGRAF = ['sambutanPembina', 'sambutanKepsek', 'cerita'];
export const SEMUA_KOLOM = [...KOLOM_TEKS, ...KOLOM_TAUTAN, ...KOLOM_PARAGRAF];

export const BATAS = {
  whatsapp: 20, email: 100, telepon: 40, jadwal: 120,
  instagram: 300, youtube: 300, facebook: 300, tiktok: 300, peta: 300,
  sambutanPembina: 1500, sambutanKepsek: 1500, cerita: 2000,
};

export const LABEL = {
  whatsapp: 'WhatsApp gudep', email: 'Email', telepon: 'Telepon', jadwal: 'Jadwal latihan',
  instagram: 'Instagram', youtube: 'YouTube', facebook: 'Facebook', tiktok: 'TikTok', peta: 'Tautan Google Maps',
  sambutanPembina: 'Sambutan Pembina', sambutanKepsek: 'Sambutan Kepala Sekolah', cerita: 'Cerita singkat gudep',
};

const POLA_WHATSAPP = /^[0-9 +()./-]{8,20}$/;
const POLA_TELEPON = /^[0-9 +()./-]*$/;
const POLA_EMAIL = /^[^@ ]+@[^@ ]+\.[^@ ]+$/;
const POLA_TAUTAN = /^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}([/?#][^ ]*)?$/;

/** Tautan https sah (dipakai juga oleh berandaKontenLogic.js untuk berita/prestasi/galeri/media sosial): kosong TIDAK dianggap sah di sini. */
export const tautanSah = (s) => POLA_TAUTAN.test(String(s ?? ''));

const HOST_DRIVE_GAMBAR = new Set(['drive.google.com', 'drive.usercontent.google.com']);
// Halaman (bukan berkas gambar): tidak akan pernah tampil di <img>, jadi tidak dicoba sama sekali (kartu memakai gambar pengganti).
const HOST_HALAMAN_SAJA = new Set(['photos.app.goo.gl', 'photos.google.com', 'goo.gl', 'g.co', 'share.google']);

/**
 * Daftar alamat yang dicoba berurutan untuk <img>, dari tautan yang ditempel pengurus pada sampulUrl/gambarUrl (Kelola Beranda); [] bila tidak ada yang
 * mungkin tampil (kosong, bukan https, tautan folder, atau tautan halaman berbagi Google Photos, yang hanya menuju HALAMAN, bukan berkas gambar).
 * Tautan BERBAGI Google Drive (drive.google.com/file/d/ID/view, .../open?id=ID, .../uc?id=ID) juga hanya menuju halaman; berkas yang dibagikan
 * "Siapa saja yang memiliki link" diubah ke alamat gambar langsung: lh3.googleusercontent.com/d/ID (lebih andal dipasang di situs lain) lalu thumbnail Drive
 * sebagai cadangan. Tautan lain (mis. alamat googleusercontent.com hasil "Salin alamat gambar" di Google Photos) dipakai apa adanya.
 */
export function kandidatGambar(mentah) {
  const s = rapikan(mentah);
  if (!tautanSah(s)) return [];
  let url;
  try { url = new URL(s); } catch { return []; }
  const host = url.hostname.toLowerCase();
  if (HOST_HALAMAN_SAJA.has(host)) return [];
  if (HOST_DRIVE_GAMBAR.has(host)) {
    const id = url.pathname.match(/\/d\/([A-Za-z0-9_-]{15,120})/)?.[1] ?? url.searchParams.get('id') ?? '';
    if (!/^[A-Za-z0-9_-]{15,120}$/.test(id)) return [];
    return [`https://lh3.googleusercontent.com/d/${id}=w1000`, `https://drive.google.com/thumbnail?id=${id}&sz=w1000`];
  }
  return [s];
}

export const RUJUK_LANGKAH_DRIVE = 'Ikuti langkah Google Drive di bawah kolom ini.';

/**
 * Penilaian tautan gambar untuk formulir Kelola Beranda: { jenis, pesan }. `jenis`: 'kosong', 'tidak-sah' (galatnya ditampilkan validasi lain), 'halaman-photos',
 * 'folder-drive', 'drive-tanpa-id' (ketiganya tidak mungkin tampil sebagai gambar; `pesan` menuntun langkahnya), 'drive' (berkas Drive: layak diuji pratinjau),
 * atau 'langsung' (alamat gambar biasa). Sejalan dengan kandidatGambar: jenis yang tidak mungkin tampil = tanpa kandidat.
 */
export function diagnosaGambar(mentah) {
  const s = rapikan(mentah);
  if (!s) return { jenis: 'kosong', pesan: '' };
  if (!tautanSah(s)) return { jenis: 'tidak-sah', pesan: '' };
  let url;
  try { url = new URL(s); } catch { return { jenis: 'tidak-sah', pesan: '' }; }
  const host = url.hostname.toLowerCase();
  if (HOST_HALAMAN_SAJA.has(host)) {
    return { jenis: 'halaman-photos', pesan: `Ini tautan halaman Google Photos, bukan file gambar, sehingga tidak akan tampil di beranda. ${RUJUK_LANGKAH_DRIVE}` };
  }
  if (HOST_DRIVE_GAMBAR.has(host)) {
    if (/\/folders\//.test(url.pathname) || /\/folderview/.test(url.pathname)) {
      return { jenis: 'folder-drive', pesan: `Ini tautan folder Google Drive, bukan satu file foto, sehingga tidak akan tampil di beranda. Buka SATU file foto di dalamnya lalu bagikan file itu. ${RUJUK_LANGKAH_DRIVE}` };
    }
    if (kandidatGambar(s).length === 0) return { jenis: 'drive-tanpa-id', pesan: `Tautan Drive ini tidak memuat ID file foto. Salin tautan Bagikan dari SATU file foto. ${RUJUK_LANGKAH_DRIVE}` };
    return { jenis: 'drive', pesan: '' };
  }
  return { jenis: 'langsung', pesan: '' };
}

/** Alamat gambar pertama dari kandidatGambar ('' bila tidak ada); dipakai halaman tanpa JavaScript (halaman berita statis, Open Graph). */
export const urlGambar = (mentah) => kandidatGambar(mentah)[0] ?? '';

/** Spasi ganda dan tepi dirapikan, sama dengan sigarda.rapikan di SQL. */
export const rapikan = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Untuk paragraf: baris baru dipertahankan, spasi dan tab ganda dirapikan, baris kosong berturut-turut menjadi satu.
 * Sama dengan sigarda.rapikan_paragraf di SQL.
 */
export const rapikanParagraf = (s) => String(s ?? '')
  .replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();

/** Panjang dalam karakter sesungguhnya (huruf di luar BMP, mis. emoji, dihitung satu), sama dengan char_length di SQL; `.length` menghitung dua. */
const panjang = (s) => [...s].length;

/** Salinan lengkap untuk formulir: semua kolom ada dan berupa teks. */
export function untukForm(nilai) {
  const n = nilai && typeof nilai === 'object' ? nilai : {};
  return Object.fromEntries(SEMUA_KOLOM.map((k) => [k, typeof n[k] === 'string' ? n[k] : '']));
}

/** Salinan yang sudah dirapikan, siap dikirim ke server. */
export function untukKirim(nilai) {
  const f = untukForm(nilai);
  return Object.fromEntries(SEMUA_KOLOM.map((k) => [k, KOLOM_PARAGRAF.includes(k) ? rapikanParagraf(f[k]) : rapikan(f[k])]));
}

/**
 * Pemeriksaan isian: { kolom: pesan } (kosong = sah). Sama dengan sg_beranda_kontak_simpan; isian dirapikan lebih dulu.
 * Semua kolom boleh kosong (kolom yang kosong tidak ditampilkan di beranda).
 */
export function periksaKontak(nilai) {
  const v = untukKirim(nilai);
  const galat = {};
  for (const k of SEMUA_KOLOM) {
    if (panjang(v[k]) > BATAS[k]) { galat[k] = `Maksimal ${BATAS[k]} karakter.`; continue; }
    if (!v[k]) continue;
    if (k === 'whatsapp' && !POLA_WHATSAPP.test(v[k])) galat[k] = 'Hanya angka, spasi, dan tanda + ( ) . / - (8-20 karakter).';
    else if (k === 'telepon' && !POLA_TELEPON.test(v[k])) galat[k] = 'Hanya angka, spasi, dan tanda + ( ) . / -.';
    else if (k === 'email' && !POLA_EMAIL.test(v[k])) galat[k] = 'Alamat email tidak sah.';
    else if (KOLOM_TAUTAN.includes(k) && !POLA_TAUTAN.test(v[k])) galat[k] = 'Harus diawali https:// dan berupa alamat yang sah.';
  }
  return galat;
}

/** Sama persis (setelah dirapikan)? Dipakai untuk menandai formulir yang berubah. */
export const samaKontak = (a, b) => JSON.stringify(untukKirim(a)) === JSON.stringify(untukKirim(b));

/** Paragraf untuk ditampilkan: pisah pada baris kosong, buang yang kosong. */
export const pecahParagraf = (teks) => rapikanParagraf(teks).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

/** Tautan WhatsApp ke nomor gudep (tanpa teks awal), atau '' bila nomor belum diisi atau bentuknya tidak sah. */
export const tautanWhatsapp = (nomor) => (whatsappSah(nomor) ? waLink(nomor, 'Halo, saya ingin bertanya tentang Gudep.') : '');

/** Jaringan sosial yang ditampilkan, urut seperti di beranda: [{ kunci, label, href }] hanya yang terisi. */
export function jaringanSosial(kontak) {
  const k = untukForm(kontak);
  return [['instagram', 'Instagram'], ['youtube', 'YouTube'], ['facebook', 'Facebook'], ['tiktok', 'TikTok']]
    .filter(([kunci]) => POLA_TAUTAN.test(k[kunci]))
    .map(([kunci, label]) => ({ kunci, label, href: k[kunci] }));
}

/** Tautan peta yang aman ditampilkan, atau ''. */
export const tautanPeta = (kontak) => (POLA_TAUTAN.test(untukForm(kontak).peta) ? untukForm(kontak).peta : '');

/**
 * Bentuk jawaban sg_beranda_publik yang aman dipakai halaman, apa pun isi jawabannya (server lama, galat, atau data rusak):
 * { gudep, pembina: { jabatan, nama }, kamabigus: { jabatan, nama }, kontak (lengkap, teks), agenda: [{ jenis, judul, tanggal }] }.
 */
/** Larik berita dari server (sg_beranda_publik atau sg_berita_lagi) yang aman ditampilkan: paling banyak 6, yang tanpa judul dibuang. */
export function susunBerita(mentah) {
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const teks = (x) => (typeof x === 'string' ? rapikan(x) : '');
  // isi = teks BERPARAGRAF (bukan lewat teks(), yang merapikan sebagai satu baris dan menghapus baris baru): server sudah merapikannya sendiri saat disimpan.
  return (Array.isArray(mentah) ? mentah : [])
    .map((b) => ({ kategori: teks(obj(b).kategori), judul: teks(obj(b).judul), ringkasan: teks(obj(b).ringkasan), isi: typeof obj(b).isi === 'string' ? obj(b).isi : '', sampulUrl: teks(obj(b).sampulUrl), terbitPada: teks(obj(b).terbitPada) }))
    .filter((b) => b.judul).slice(0, 6);
}

/** Berita yang sudah tampil + gelombang lebih lama, tanpa kembar (judul dan waktu terbit sama; berita baru terbit di antara dua permintaan menggeser urutan). */
export function gabungBerita(tampil, lama) {
  const kunci = (b) => `${b.judul}|${Date.parse(b.terbitPada)}`;
  const ada = new Set(tampil.map(kunci));
  const hasil = [...tampil];
  for (const b of lama) { if (!ada.has(kunci(b))) { ada.add(kunci(b)); hasil.push(b); } }
  return hasil;
}

/** Jawaban sg_berita_lagi: { berita: [...], adaLagi } (data rusak = tidak ada berita dan tidak ada lagi). */
export function susunBeritaLagi(mentah) {
  const m = mentah && typeof mentah === 'object' && !Array.isArray(mentah) ? mentah : {};
  return { berita: susunBerita(m.berita), adaLagi: m.adaLagi === true };
}

export function susunBerandaPublik(mentah) {
  const m = mentah && typeof mentah === 'object' ? mentah : {};
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const teks = (x) => (typeof x === 'string' ? rapikan(x) : '');
  const orang = (x) => ({ jabatan: teks(obj(x).jabatan), nama: teks(obj(x).nama) });
  const gudep = {};
  for (const k of ['nama', 'singkat', 'sekolah', 'kota', 'alamat', 'nomorGudep', 'kwarran', 'kwarcab']) {
    const t = teks(obj(m.gudep)[k]);
    if (t) gudep[k] = t;
  }
  const agenda = (Array.isArray(m.agenda) ? m.agenda : [])
    .map((a) => ({ jenis: teks(obj(a).jenis), judul: teks(obj(a).judul), tanggal: teks(obj(a).tanggal) }))
    .filter((a) => a.judul && /^\d{4}-\d{2}-\d{2}$/.test(a.tanggal))
    .slice(0, 6);
  const larik = (x) => (Array.isArray(x) ? x : []);
  const berita = susunBerita(m.berita);
  const prestasi = larik(m.prestasi)
    .map((p) => ({ judul: teks(obj(p).judul), tingkat: teks(obj(p).tingkat), peringkat: teks(obj(p).peringkat), tahun: Number(obj(p).tahun) || 0, diraihOleh: teks(obj(p).diraihOleh), fotoUrl: teks(obj(p).fotoUrl) }))
    .filter((p) => p.judul);
  const galeri = larik(m.galeri)
    .map((g) => ({ judul: teks(obj(g).judul), tautan: teks(obj(g).tautan), sampulUrl: teks(obj(g).sampulUrl), kelompok: teks(obj(g).kelompok) }))
    .filter((g) => g.judul && tautanSah(g.tautan));
  const sosial = larik(m.sosial)
    .map((s) => ({ platform: teks(obj(s).platform), tautan: teks(obj(s).tautan), keterangan: teks(obj(s).keterangan), gambarUrl: teks(obj(s).gambarUrl) }))
    .filter((s) => s.platform && tautanSah(s.tautan)).slice(0, 6);
  const faq = larik(m.faq)
    .map((f) => ({ pertanyaan: teks(obj(f).pertanyaan), jawaban: teks(obj(f).jawaban) }))
    .filter((f) => f.pertanyaan && f.jawaban);
  return { gudep, pembina: orang(m.pembina), kamabigus: orang(m.kamabigus), kontak: untukForm(m.kontak), agenda, berita, prestasi, galeri, sosial, faq };
}

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** 'YYYY-MM-DD' menjadi { hari (angka), bulan (nama), bulanPendek (3 huruf), tahun, namaHari }; null bila bentuknya tidak sah. Tanpa zona waktu perangkat. */
export function pecahTanggal(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return null;
  const [y, b, h] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(y, b - 1, h));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== b - 1 || d.getUTCDate() !== h) return null;
  return { hari: h, bulan: BULAN[b - 1], bulanPendek: BULAN[b - 1].slice(0, 3), tahun: y, namaHari: HARI[d.getUTCDay()] };
}

/** Tautan "Bagikan lewat WhatsApp" (tanpa nomor: pengguna memilih kontak sendiri). Teks dan alamat digabung satu pesan; bekerja tanpa JavaScript. */
export const tautanBagikanWa = (teks, alamat) => `https://wa.me/?text=${encodeURIComponent(`${rapikan(teks)}\n${alamat}`)}`;

/** Tautan pencarian Google Maps untuk sekolah, dipakai bila tautan peta belum diisi pengurus. */
export const tautanPencarianPeta = (sekolah, kota) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rapikan(`${sekolah} ${kota}`))}`;
