// ============================================================================
// SIGARDA: Edge Function `sosial-sampul` (gambar pratinjau postingan Instagram dan TikTok, disalin ke Storage SIGARDA)
//
// Dipanggil aplikasi (menu Kelola Beranda > Media Sosial) saat pengurus menempel tautan postingan Instagram/TikTok, dan oleh tombol
// "Lengkapi gambar otomatis" untuk kiriman lama yang belum bergambar:
//   POST { "tautan": "https://www.instagram.com/reel/..." }   dengan header Authorization: Bearer <sesi pengguna>
// Jawaban (selalu HTTP 200): { ok: true, gambar } atau { ok: false, pesan }.
//
// Halaman postingan memuat gambar pratinjau tautan (meta og:image, yang dipakai WhatsApp/Facebook saat tautan dibagikan). Alamat gambar itu DITANDATANGANI dan
// KEDALUWARSA (Instagram: beberapa hari), jadi fungsi ini mengunduh gambarnya dan menyalinnya ke bucket Storage publik `beranda-sosial`; alamat salinan itulah
// yang dikembalikan dan disimpan aplikasi lewat sg_sosial_simpan seperti biasa (hak dan validasi tetap di SQL). Pengunjung beranda hanya memuat gambar salinan
// itu, tidak pernah menghubungi Instagram/TikTok. Bucket dibuat sendiri saat pertama dipakai; salinan yang tidak lagi dipakai kiriman mana pun (dihapus, gambar
// diganti) dan berumur lebih dari 24 jam dibersihkan setiap kali fungsi berhasil menyimpan gambar baru.
//
// Keamanan: hanya pengurus aktif (Pembina, Admin Gudep, Dewan Ambalan) yang dilayani; hanya tautan instagram.com/tiktok.com (https) yang diambil; setiap
// pengalihan diperiksa lagi SEBELUM diikuti (tidak dapat dipakai sebagai proxy); gambar hanya diunduh dari CDN platform itu (cdninstagram.com/fbcdn.net,
// tiktokcdn.com), dibatasi 2 MB, dan harus benar-benar JPEG/PNG/WebP (dicek dari isi berkas, bukan dari header).
//
// Secret: tidak ada yang perlu diisi (SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY tersedia otomatis).
// Deploy: lihat README bagian "Gambar pratinjau Instagram dan TikTok otomatis". Matikan "Verify JWT" (pemeriksaan dilakukan di dalam fungsi).
// Berkas ini SENGAJA satu berkas agar bisa ditempel di editor dashboard Supabase. Logika (tangani) tidak bergantung pada Deno dan diuji (uji/sosial-sampul.mjs).
// ============================================================================

// deno-lint-ignore-file no-explicit-any
// Harus import tetap (bukan import() dinamis): runtime Supabase hanya mengemas pustaka yang terlihat saat deploy.
import { createClient } from 'npm:@supabase/supabase-js@2';

declare const Deno: any;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const BUCKET = 'beranda-sosial';
const HOST_TAUTAN: Record<string, Set<string>> = {
  instagram: new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com', 'instagr.am', 'www.instagr.am']),
  tiktok: new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']),
};
const LABEL: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok' };
// Instagram dan TikTok memberi gambar pratinjau (og:image) kepada perayap pratinjau tautan; peramban biasa sering mendapat halaman masuk tanpa gambar.
const UA_PRATINJAU = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const MAKS_LONCAT = 5;
const BATAS_HALAMAN = 3_000_000;
export const BATAS_GAMBAR = 2_000_000;
const BATAS_MS = 12_000;
export const UMUR_YATIM_MS = 24 * 60 * 60 * 1000;

/** Platform tautan postingan yang dapat diambil gambarnya ('instagram' | 'tiktok' | ''): https dan host dikenal. Dicerminkan src/lib/sosialSampulLogic.js (dijaga uji/sosial-sampul.mjs). */
export function platformSampul(tautan: unknown) {
  try {
    const u = new URL(String(tautan ?? '').trim());
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return '';
    const host = u.hostname.toLowerCase();
    return Object.keys(HOST_TAUTAN).find((p) => HOST_TAUTAN[p].has(host)) ?? '';
  } catch { return ''; }
}

/** Alamat gambar boleh diunduh: https, CDN milik platform itu sendiri, dan bukan gambar umum (logo halaman masuk Instagram ada di static.cdninstagram.com). */
export function hostGambarSah(platform: string, url: unknown) {
  try {
    const u = new URL(String(url ?? ''));
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
    const h = u.hostname.toLowerCase();
    if (platform === 'instagram') return (h.endsWith('.cdninstagram.com') || h.endsWith('.fbcdn.net')) && !h.startsWith('static.') && !u.pathname.includes('rsrc.php');
    if (platform === 'tiktok') return /\.(tiktokcdn|tiktokcdn-us|tiktokcdn-eu|ibyteimg|byteimg)\.com$/.test(h);
    return false;
  } catch { return false; }
}

const bukaEntitas = (s: string) => s.replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Isi meta bernama `nama` (mis. og:image) dari HTML; urutan atribut bebas; property= atau name=; '' bila tidak ada. */
export function ambilMeta(html: string, nama: string) {
  for (const tag of String(html ?? '').match(/<meta\b[^>]*>/gi) ?? []) {
    if (!new RegExp(`\\b(?:property|name)\\s*=\\s*["']${nama}["']`, 'i').test(tag)) continue;
    const isi = /\bcontent\s*=\s*"([^"]*)"/i.exec(tag)?.[1] ?? /\bcontent\s*=\s*'([^']*)'/i.exec(tag)?.[1] ?? '';
    return bukaEntitas(isi).trim();
  }
  return '';
}

/** Jenis gambar dari isi berkas (bukan dari header yang dapat berbohong): JPEG, PNG, atau WebP; null bila bukan. */
export function jenisGambar(b: Uint8Array) {
  if (!b || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { tipe: 'image/jpeg', ext: 'jpg' };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { tipe: 'image/png', ext: 'png' };
  const teks = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
  if (teks(0, 4) === 'RIFF' && teks(8, 4) === 'WEBP') return { tipe: 'image/webp', ext: 'webp' };
  return null;
}

/** Nama berkas salinan: <platform>/<kode postingan>-<waktu>.<ext>; kode dari alamat akhir halaman (sesudah pengalihan), hanya huruf/angka/_-. */
export function namaBerkas(platform: string, urlHalaman: string, ext: string, sekarang: number) {
  let kode = '';
  try {
    const bagian = new URL(urlHalaman).pathname.split('/').filter(Boolean);
    const i = platform === 'tiktok' ? bagian.indexOf('video') : bagian.findIndex((x) => ['p', 'reel', 'reels', 'tv'].includes(x));
    kode = i >= 0 ? (bagian[i + 1] ?? '') : '';
  } catch { /* kode kosong */ }
  kode = /^[A-Za-z0-9_-]{1,40}$/.test(kode) ? kode : 'postingan';
  return `${platform}/${kode}-${sekarang}.${ext}`;
}

/**
 * Salinan yang boleh dibuang: tidak dirujuk kiriman mana pun (alamat publiknya tidak ada di `dipakai`) DAN berumur lebih dari 24 jam (gambar yang baru diambil
 * tetapi formulirnya belum disimpan tidak ikut terhapus). Objek tanpa waktu dibuat dibiarkan.
 */
export function pilihUntukDibuang(objek: { path: string; dibuat?: string | null }[], dipakai: Set<string>, dasarPublik: string, sekarang: number) {
  return objek.filter((o) => {
    const waktu = Date.parse(o.dibuat ?? '');
    return Number.isFinite(waktu) && sekarang - waktu > UMUR_YATIM_MS && !dipakai.has(`${dasarPublik}${o.path}`);
  }).map((o) => o.path);
}

/** Pengurus aktif: penguji dan Admin aktif, atau Penegak aktif berjabatan Dewan, dan sudah mengganti PIN awal. Dicerminkan dari sigarda.pengurus() (dijaga uji/sosial-sampul.mjs). */
export function pengurusAktif(p: any) {
  if (!p || (p.status ?? 'aktif') !== 'aktif' || p.wajib_ganti_pin) return false;
  return p.role === 'penguji' || p.role === 'admin' || (p.role === 'peserta' && !!p.jabatan_dewan);
}

/** Membaca badan jawaban paling banyak `batas` byte; `lebih` = true bila masih ada sisa (berkas terlalu besar). */
async function bacaTerbatas(res: Response, batas: number) {
  const pembaca = res.body?.getReader();
  if (!pembaca) return { isi: new Uint8Array(0), lebih: false };
  const potongan: Uint8Array[] = [];
  let total = 0;
  let lebih = false;
  while (true) {
    const { done, value } = await pembaca.read();
    if (done) break;
    potongan.push(value);
    total += value.length;
    if (total > batas) { lebih = true; break; }
  }
  try { await pembaca.cancel(); } catch { /* sudah selesai */ }
  const gabung = new Uint8Array(total);
  let posisi = 0;
  for (const p of potongan) { gabung.set(p, posisi); posisi += p.length; }
  return { isi: gabung.subarray(0, Math.min(total, batas)), lebih }; // satu potongan dapat melampaui batas: dipotong tegas
}

/** Mengikuti pengalihan secara manual; setiap alamat diperiksa `boleh` SEBELUM diminta. Mengembalikan jawaban akhir (bukan pengalihan) dan alamatnya. */
async function ikuti(url: string, boleh: (u: string) => boolean, ambil: typeof fetch, headers: Record<string, string>, nama: string): Promise<{ res: Response; url: string } | { galat: string }> {
  for (let i = 0; i <= MAKS_LONCAT; i++) {
    if (!boleh(url)) return { galat: `Tautan dialihkan ke alamat yang bukan ${nama}, jadi tidak diikuti.` };
    let res: Response;
    try {
      res = await ambil(url, { redirect: 'manual', headers, signal: AbortSignal.timeout(BATAS_MS) });
    } catch {
      return { galat: `${nama} tidak dapat dihubungi. Coba lagi nanti.` };
    }
    if (res.status >= 300 && res.status < 400) {
      const lokasi = res.headers.get('location');
      if (!lokasi) return { galat: `Pengalihan dari ${nama} tidak lengkap.` };
      try { url = new URL(lokasi, url).href; } catch { return { galat: `Pengalihan dari ${nama} tidak sah.` }; }
      continue;
    }
    return { res, url };
  }
  return { galat: `Terlalu banyak pengalihan dari ${nama}.` };
}

/** Mengambil halaman postingan, membaca og:image, lalu mengunduh gambarnya. Hasil: isi gambar beserta jenis dan nama berkas, atau pesan galat. */
export async function ambilGambarPostingan(tautan: string, ambil: typeof fetch = fetch, sekarang = Date.now()): Promise<{ isi: Uint8Array; tipe: string; path: string } | { galat: string }> {
  const platform = platformSampul(tautan);
  if (!platform) return { galat: 'Hanya tautan postingan Instagram atau TikTok yang dapat diambil gambarnya.' };
  const nama = LABEL[platform];
  const halaman = await ikuti(tautan, (u) => platformSampul(u) === platform, ambil, { 'User-Agent': UA_PRATINJAU, 'Accept-Language': 'id,en;q=0.8' }, nama);
  if ('galat' in halaman) return halaman;
  if (!halaman.res.ok) return { galat: `${nama} menjawab ${halaman.res.status}. Pastikan postingannya publik dan tautannya benar.` };
  const html = new TextDecoder().decode((await bacaTerbatas(halaman.res, BATAS_HALAMAN)).isi);
  const og = ambilMeta(html, 'og:image');
  if (!hostGambarSah(platform, og)) return { galat: `Gambar pratinjau tidak ditemukan. Pastikan postingan ${nama} itu publik (bukan akun privat) dan tautannya tautan postingan. Gambar masih dapat diisi manual.` };
  const gambar = await ikuti(og, (u) => hostGambarSah(platform, u), ambil, { 'User-Agent': UA_PRATINJAU }, nama);
  if ('galat' in gambar) return gambar;
  if (!gambar.res.ok) return { galat: `Gambar dari ${nama} tidak dapat diunduh (${gambar.res.status}). Coba lagi nanti.` };
  const { isi, lebih } = await bacaTerbatas(gambar.res, BATAS_GAMBAR);
  if (lebih) return { galat: `Gambar dari ${nama} lebih dari 2 MB, jadi tidak disalin. Isi gambar manual.` };
  const jenis = jenisGambar(isi);
  if (!jenis) return { galat: `Berkas dari ${nama} bukan gambar JPEG, PNG, atau WebP.` };
  return { isi, tipe: jenis.tipe, path: namaBerkas(platform, halaman.url, jenis.ext, sekarang) };
}

export type Deps = {
  profilDari: (token: string) => Promise<any | null>;   // profil pemilik sesi (role, jabatan_dewan, status, wajib_ganti_pin) atau null bila sesi tidak sah
  ambil: typeof fetch;                                   // permintaan ke Instagram/TikTok
  simpan: (path: string, isi: Uint8Array, tipe: string) => Promise<string>; // menyimpan ke bucket, mengembalikan alamat publik
  bersihkan: () => Promise<void>;                        // membuang salinan yatim (galat diabaikan)
  sekarang?: () => number;
};

/** Titik masuk logika. Selalu mengembalikan objek jawaban (dikirim dengan HTTP 200, seperti fungsi sigarda). */
export async function tangani(metode: string, authHeader: string | null, body: any, d: Deps) {
  if (metode !== 'POST') return { ok: false, pesan: 'Gunakan POST.' };
  const token = authHeader?.replace(/^Bearer\s+/i, '') ?? '';
  const profil = token ? await d.profilDari(token) : null;
  if (!profil) return { ok: false, pesan: 'Sesi berakhir. Masuk kembali.', sesiBerakhir: true };
  if (!pengurusAktif(profil)) return { ok: false, pesan: 'Hanya pengurus (Pembina, Admin Gudep, dan Dewan Ambalan) yang dapat mengambil gambar pratinjau.' };
  const tautan = typeof body?.tautan === 'string' ? body.tautan.trim() : '';
  if (!platformSampul(tautan)) return { ok: false, pesan: 'Hanya tautan postingan Instagram atau TikTok yang dapat diambil gambarnya.' };
  const r = await ambilGambarPostingan(tautan, d.ambil, d.sekarang ? d.sekarang() : Date.now());
  if ('galat' in r) return { ok: false, pesan: r.galat };
  let gambar: string;
  try {
    gambar = await d.simpan(r.path, r.isi, r.tipe);
  } catch (e: any) {
    return { ok: false, pesan: `Gambar terambil tetapi gagal disimpan di Storage SIGARDA: ${e?.message ?? e}` };
  }
  try { await d.bersihkan(); } catch { /* pembersihan tidak boleh menggagalkan pengambilan */ }
  return { ok: true, gambar };
}

/* ============================================================================
 * Sambungan ke Supabase (hanya berjalan di Deno / Supabase Edge Functions)
 * ========================================================================== */

let depsDeno: Deps | null = null;
function ambilDepsDeno(): Deps {
  if (depsDeno) return depsDeno;
  const url = Deno.env.get('SUPABASE_URL');
  const layanan = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  // Periksa lebih dulu agar penyebabnya jelas di log, bukan "500 Internal Server Error".
  if (!url) throw new Error('SUPABASE_URL tidak tersedia pada fungsi.');
  if (!layanan) throw new Error('SUPABASE_SERVICE_ROLE_KEY tidak tersedia pada fungsi.');
  const admin = createClient(url, layanan, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const wadah = admin.storage.from(BUCKET);
  const dasarPublik = wadah.getPublicUrl('').data.publicUrl.replace(/\/?$/, '/');
  let bucketSiap = false;
  const pastikanBucket = async () => {
    if (bucketSiap) return;
    const { error } = await admin.storage.getBucket(BUCKET);
    if (error) {
      const buat = await admin.storage.createBucket(BUCKET, { public: true, fileSizeLimit: BATAS_GAMBAR, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] });
      if (buat.error && !/exist/i.test(buat.error.message)) throw new Error(buat.error.message);
    }
    bucketSiap = true;
  };
  depsDeno = {
    ambil: fetch,
    async profilDari(token: string) {
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user?.id) return null;
      const { data: p } = await admin.from('profiles').select('role, jabatan_dewan, status, wajib_ganti_pin').eq('id', data.user.id).maybeSingle();
      return p ?? null;
    },
    async simpan(path, isi, tipe) {
      await pastikanBucket();
      const { error } = await wadah.upload(path, isi, { contentType: tipe, cacheControl: '31536000', upsert: false });
      if (error) throw new Error(error.message);
      return `${dasarPublik}${path}`;
    },
    async bersihkan() {
      const { data: baris, error } = await admin.from('beranda_sosial').select('gambar_url');
      if (error || !baris) return; // gagal membaca = jangan menghapus apa pun
      const dipakai = new Set<string>(baris.map((b: any) => b.gambar_url).filter(Boolean));
      const objek: { path: string; dibuat?: string | null }[] = [];
      for (const folder of Object.keys(HOST_TAUTAN)) {
        const { data, error: e } = await wadah.list(folder, { limit: 1000 });
        if (e) return;
        for (const o of data ?? []) if (o.id) objek.push({ path: `${folder}/${o.name}`, dibuat: o.created_at });
      }
      const buang = pilihUntukDibuang(objek, dipakai, dasarPublik, Date.now());
      if (buang.length) await wadah.remove(buang);
    },
  };
  return depsDeno;
}

if (typeof Deno !== 'undefined' && Deno.serve) {
  Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    let body: any = {};
    try { body = await req.json(); } catch { /* badan kosong */ }
    let hasil: any;
    try {
      hasil = await tangani(req.method, req.headers.get('Authorization'), body, ambilDepsDeno());
    } catch (e: any) {
      hasil = { ok: false, pesan: `Fungsi sosial-sampul belum siap: ${e?.message ?? e}` };
    }
    return new Response(JSON.stringify(hasil), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  });
}
