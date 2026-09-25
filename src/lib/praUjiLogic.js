/**
 * PRA-UJI BERJENJANG (fase D, murni tanpa React). Server yang memutuskan siapa penilai dan ke mana pengajuan diteruskan (sg_sku_ajukan, sg_pra_uji_*); di sini
 * hanya menyusun tampilan dari baris `sku_pra_uji` (dibaca lewat RLS): jalur per butir, teks status, dan siapa yang melihat menu Pra-uji.
 * Jalur nominal mencerminkan `sigarda.pra_uji_tahap_berikut` (Bantara: Pinsa > Bina Damping > Pembina; Laksana: Bina Damping > Pembina); tahap yang tidak punya
 * penilai dilewati server, dan tampilan menandainya "tanpa penilai". Dijaga uji/pra-uji.mjs (dibandingkan langsung dengan SQL) dan uji/pra-uji-klien.mjs.
 */
import { pembinaAtauAdmin } from './hakLogic';

export const NAMA_TAHAP = { pinsa: 'Pinsa', bina_damping: 'Bina Damping', pembina: 'Pembina' };
export const namaTahap = (tahap) => NAMA_TAHAP[tahap] ?? tahap;

/** Urutan tahap nominal untuk satu tingkat SKU, diakhiri uji resmi Pembina. */
export const jalurTahap = (tingkat) => (tingkat === 'Bantara' ? ['pinsa', 'bina_damping', 'pembina'] : ['bina_damping', 'pembina']);

/** Pengajuan pra-uji yang sedang menunggu penilai untuk satu butir (atau null). */
export const praUjiMenunggu = (baris = []) => baris.find((r) => r.status === 'menunggu') ?? null;

/**
 * Jalur satu butir bagi Penegak: dari baris pra-uji butir itu (`baris` = semua baris Penegak untuk butir ini), status progres butir, dan tingkatnya.
 * Percobaan berjalan = baris sesudah baris "belum" atau "dibatalkan" terakhir (mengajukan ulang memulai jalur dari awal).
 * Mengembalikan null bila tidak ada yang perlu ditampilkan, selain itu:
 *   { menunggu: baris | null, belum: baris | null, langkah: [{ tahap, nama, keadaan, oleh, catatan }] }
 * keadaan: 'lulus' | 'dilewati' (Pembina/Admin melewati) | 'menunggu' | 'tanpa-penilai' | 'nanti' | 'diuji' (Pembina sedang menguji).
 * `belum` diisi bila pra-uji terakhir belum lulus dan Penegak belum mengajukan lagi (catatan perbaikan ada di baris itu).
 */
export function jalurPraUji(baris = [], statusButir = 'belum', tingkat = 'Bantara') {
  const urut = [...baris].sort((a, b) => a.id - b.id);
  let mulai = 0;
  urut.forEach((r, i) => { if (r.status === 'belum' || r.status === 'dibatalkan') mulai = i + 1; });
  const percobaan = urut.slice(mulai);
  const menunggu = percobaan.find((r) => r.status === 'menunggu') ?? null;
  const terakhir = urut[urut.length - 1] ?? null;
  const belum = terakhir?.status === 'belum' && (statusButir === 'belum' || statusButir === 'ulang') ? terakhir : null;
  const diResmi = statusButir === 'diajukan' || statusButir === 'proses';
  const lewat = percobaan.some((r) => r.status === 'lulus' || r.status === 'dilewati');
  if (!menunggu && !belum && !(diResmi && lewat)) return null;
  if (belum) return { menunggu: null, belum, langkah: [] };

  const jalur = jalurTahap(tingkat);
  const tercapai = diResmi ? jalur.length - 1 : Math.max(-1, ...jalur.map((t, i) => (percobaan.some((r) => r.tahap === t && r.status !== 'dibatalkan') ? i : -1)));
  const langkah = jalur.map((tahap, i) => {
    if (tahap === 'pembina') return { tahap, nama: namaTahap(tahap), keadaan: statusButir === 'proses' ? 'diuji' : diResmi ? 'menunggu' : 'nanti', oleh: null, catatan: '' };
    const r = percobaan.filter((x) => x.tahap === tahap && x.status !== 'dibatalkan').pop();
    if (r) return { tahap, nama: namaTahap(tahap), keadaan: r.status, oleh: r.penilaiNama ?? null, catatan: r.catatan ?? '' };
    return { tahap, nama: namaTahap(tahap), keadaan: i < tercapai ? 'tanpa-penilai' : 'nanti', oleh: null, catatan: '' };
  });
  return { menunggu, belum: null, langkah };
}

/** Teks satu baris untuk status butir selama pra-uji, mis. "Menunggu pra-uji Pinsa". */
export function teksPosisiPraUji(jalur) {
  if (!jalur) return '';
  if (jalur.belum) return `Belum lulus pra-uji ${namaTahap(jalur.belum.tahap)}`;
  if (jalur.menunggu) return `Menunggu pra-uji ${namaTahap(jalur.menunggu.tahap)}`;
  const sekarang = jalur.langkah.find((l) => l.tahap === 'pembina');
  return sekarang?.keadaan === 'diuji' ? 'Sedang diuji Pembina' : 'Lulus pra-uji, menunggu uji resmi Pembina';
}

/** Ikon dan nada satu langkah pada jalur (untuk tampilan): [tanda, kelas warna]. */
export const TANDA_LANGKAH = {
  lulus: ['✓', 'text-emerald-700'],
  dilewati: ['↷', 'text-pramuka-600'],
  menunggu: ['…', 'text-amber-700'],
  diuji: ['…', 'text-amber-700'],
  'tanpa-penilai': ['–', 'text-pramuka-400'],
  nanti: ['○', 'text-pramuka-400'],
};
export const KET_LANGKAH = {
  lulus: 'lulus',
  dilewati: 'dilewati Pembina',
  menunggu: 'menunggu',
  diuji: 'sedang diuji',
  'tanpa-penilai': 'tanpa penilai',
  nanti: 'berikutnya',
};

/** Penegak yang dapat menjadi penilai pra-uji: Pinsa atau Bina Damping (dari `pendampingan` = { binaDamping: [rombel], pinsa }). */
export const penilaiPraUji = (pendampingan) => !!pendampingan && (!!pendampingan.pinsa || (pendampingan.binaDamping?.length ?? 0) > 0);

/**
 * Menu Pra-uji: Pembina dan Admin selalu (sakelar dan tahap yang macet); Penegak (juga dalam tampilan Dewan) hanya bila pra-uji hidup dan ia Pinsa atau Bina Damping.
 * Hanya tampilan; server yang menegakkan (sg_pra_uji_antrian, sg_pra_uji_catat, sg_pra_uji_lewati, sg_pra_uji_sakelar).
 */
export const menuPraUjiTampil = (user, pendampingan, praUjiAktif) => !!user && (pembinaAtauAdmin(user) || (!!praUjiAktif && penilaiPraUji(pendampingan)));

/**
 * Uji resmi yang dilakukan Dewan Ambalan tidak ada lagi bila pra-uji hidup: menu Antrian dan Sesi ujian disembunyikan bagi pengurus yang bukan Pembina.
 * Mengembalikan true bila pengguna (menurut tampilan) tetap boleh menguji secara resmi.
 */
export const ujiResmiTampil = (user, praUjiAktif) => !!user && (user.role === 'admin' ? true : user.role === 'penguji' && (!praUjiAktif || user.jabatan === 'Pembina'));

/** Lama menunggu dalam hari bulat (0 = hari ini), dari stempel waktu ISO. */
export const hariMenunggu = (dibuat, sekarang = Date.now()) => (dibuat ? Math.max(0, Math.floor((sekarang - Date.parse(dibuat)) / 86400000)) : 0);

/**
 * Butir milik satu Penegak yang masih menunggu penilai pra-uji (belum berstatus diajukan, sehingga tidak ada di daftar pengujian resmi), jadwal terdekat dulu.
 * `entri` = [{ poin, entry }], `baris` = baris pra-uji Penegak itu. Mengembalikan [{ poin, entry, pra }].
 */
export const butirMenungguPra = (entri = [], baris = []) =>
  entri
    .map((x) => ({ ...x, pra: praUjiMenunggu(baris.filter((r) => r.skuId === x.poin.id)) }))
    .filter((x) => x.pra && x.entry.status !== 'lulus' && x.entry.status !== 'diajukan' && x.entry.status !== 'proses')
    .sort((a, b) => (a.pra.jadwal ?? '9999').localeCompare(b.pra.jadwal ?? '9999'));
