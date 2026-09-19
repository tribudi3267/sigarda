/**
 * LOGIKA MATERI SKU (murni, tanpa React)
 *
 * Materi = satu file PDF di Google Drive yang dilampirkan Pembina atau Admin Gudep lewat tautan berbagi
 * ("Siapa saja yang memiliki link" dapat melihat). Aplikasi tidak menyimpan file, hanya tautannya.
 *
 *   materi = {
 *     id, judul, deskripsi,
 *     tautan,           tautan asli yang ditempel pengelola
 *     fileId,           ID file Drive hasil ekstraksi (satu-satunya bagian tautan yang dipakai untuk iframe)
 *     resourceKey,      kunci sumber daya untuk file Drive lama (opsional)
 *     butir: [id butir], mis. 'BAN-05', 'LAK-12' (lihat KATALOG_BUTIR); boleh kosong = materi umum
 *     bagian: [{ id, judul, halaman }],   daftar isi materi
 *     dibuat, diubah, dibuatOleh
 *   }
 *
 * Urutan array = urutan tampil pada daftar isi halaman Materi.
 */
import { DAFTAR_TINGKAT, TINGKAT } from '../data/skuData';
import { normalisasiNama } from './cariNama';
import { buatId } from './format';

/* ------------------------------- Katalog butir ------------------------------ */

export const KATALOG_BUTIR = DAFTAR_TINGKAT.flatMap((tingkat) =>
  TINGKAT[tingkat].butir.map((b) => ({
    id: b.id,
    tingkat,
    no: b.no,
    teks: b.teks ?? 'Sesuai agama yang dianut (ketakwaan)',
  }))
);
export const INDEKS_BUTIR = new Map(KATALOG_BUTIR.map((b) => [b.id, b]));

/** Contoh: "Bantara 5" */
export const labelButir = (id) => {
  const b = INDEKS_BUTIR.get(id);
  return b ? `${b.tingkat} ${b.no}` : id;
};

/** Urutkan id butir menurut tingkat lalu nomor. */
export const urutButir = (ids) =>
  [...ids].sort((a, b) => KATALOG_BUTIR.findIndex((x) => x.id === a) - KATALOG_BUTIR.findIndex((x) => x.id === b));

/** Ringkas daftar butir per tingkat, mis. { Bantara: '1, 5, 7', Laksana: '3' }. */
export function ringkasButir(ids) {
  const hasil = {};
  for (const id of urutButir(ids ?? [])) {
    const b = INDEKS_BUTIR.get(id);
    if (b) hasil[b.tingkat] = [...(hasil[b.tingkat] ?? []), b.no];
  }
  return Object.fromEntries(Object.entries(hasil).map(([t, nomor]) => [t, nomor.join(', ')]));
}

/* ------------------------------- Tautan Drive ------------------------------- */

const POLA_ID = /^[A-Za-z0-9_-]{15,120}$/;
const POLA_KUNCI = /^[A-Za-z0-9_-]{1,80}$/;
const HOST_DRIVE = new Set(['drive.google.com', 'drive.usercontent.google.com']);

/**
 * Mengambil ID file (dan resourceKey bila ada) dari tautan berbagi Google Drive. Bentuk yang dikenali:
 *   drive.google.com/file/d/ID/view?usp=sharing   (juga /edit, /preview, /file/u/0/d/ID)
 *   drive.google.com/open?id=ID
 *   drive.google.com/uc?id=ID&export=download
 * Tautan folder atau host lain ditolak. Hasilnya `{ ok, id, resourceKey }` atau `{ ok: false, pesan }`.
 */
export function ambilTautanDrive(teks) {
  let mentah = String(teks ?? '').trim();
  if (!mentah) return { ok: false, pesan: 'Tautan Google Drive belum diisi.' };
  if (!/^https?:\/\//i.test(mentah)) mentah = `https://${mentah}`;

  let url;
  try {
    url = new URL(mentah);
  } catch {
    return { ok: false, pesan: 'Tautan tidak valid. Salin tautan berbagi dari Google Drive.' };
  }
  if (!HOST_DRIVE.has(url.hostname.toLowerCase())) {
    return { ok: false, pesan: 'Hanya tautan Google Drive (drive.google.com) yang dapat dipakai.' };
  }
  if (/\/drive\/(u\/\d+\/)?folders\//.test(url.pathname) || /\/folderview/.test(url.pathname)) {
    return { ok: false, pesan: 'Ini tautan folder. Buka file PDF-nya, lalu salin tautan berbagi file tersebut.' };
  }

  const dariJalur = url.pathname.match(/\/d\/([A-Za-z0-9_-]+)/)?.[1];
  const id = dariJalur ?? url.searchParams.get('id') ?? '';
  if (!POLA_ID.test(id)) {
    return { ok: false, pesan: 'ID file tidak ditemukan pada tautan. Pastikan tautannya berbentuk drive.google.com/file/d/.../view.' };
  }
  const kunci = url.searchParams.get('resourcekey') ?? '';
  return { ok: true, id, resourceKey: POLA_KUNCI.test(kunci) ? kunci : '' };
}

/** Alamat iframe pratinjau, sama seperti embed PDF Drive pada Google Site. Null bila ID tidak sah. */
export function urlPratinjau(m) {
  if (!m || !POLA_ID.test(m.fileId ?? '')) return null;
  const kunci = m.resourceKey && POLA_KUNCI.test(m.resourceKey) ? `?resourcekey=${m.resourceKey}` : '';
  return `https://drive.google.com/file/d/${m.fileId}/preview${kunci}`;
}

/** Alamat untuk membuka file penuh di Google Drive (tab baru). */
export function urlBuka(m) {
  if (!m || !POLA_ID.test(m.fileId ?? '')) return null;
  const kunci = m.resourceKey && POLA_KUNCI.test(m.resourceKey) ? `?resourcekey=${m.resourceKey}` : '';
  return `https://drive.google.com/file/d/${m.fileId}/view${kunci}`;
}

/* ---------------------------------- Bagian ---------------------------------- */

const POLA_HALAMAN = /^(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?$/;

/** '3', '3-5' atau '3–5' menjadi '3' atau '3-5'; '' untuk kosong; null bila tidak sah. */
export function rapikanHalaman(teks) {
  const t = String(teks ?? '').trim();
  if (!t) return '';
  const m = t.match(POLA_HALAMAN);
  if (!m) return null;
  const awal = Number(m[1]);
  const akhir = m[2] === undefined ? null : Number(m[2]);
  if (awal < 1 || (akhir !== null && akhir < awal)) return null;
  return akhir === null ? String(awal) : `${awal}-${akhir}`;
}

/**
 * Mengubah teks tempelan menjadi daftar bagian. Satu baris satu bagian: "Judul | halaman".
 * Halaman boleh dikosongkan. Baris kosong dilewati. Mengembalikan { bagian, galat: [pesan] }.
 */
export function bacaBagianTeks(teks) {
  const bagian = [];
  const galat = [];
  String(teks ?? '').split(/\r?\n/).forEach((baris, i) => {
    const t = baris.trim();
    if (!t) return;
    const pisah = t.lastIndexOf('|');
    const judul = (pisah === -1 ? t : t.slice(0, pisah)).trim();
    const halaman = pisah === -1 ? '' : rapikanHalaman(t.slice(pisah + 1));
    if (!judul) galat.push(`Baris ${i + 1}: judul bagian kosong.`);
    else if (halaman === null) galat.push(`Baris ${i + 1}: halaman "${t.slice(pisah + 1).trim()}" tidak sah (contoh: 3 atau 3-5).`);
    else bagian.push({ id: buatId('b'), judul, halaman });
  });
  return { bagian, galat };
}

/* ------------------------------ Validasi materi ----------------------------- */

export const MAKS_JUDUL = 120;
export const MAKS_DESKRIPSI = 400;
export const MAKS_BAGIAN = 60;

/**
 * Memeriksa dan merapikan isian materi. `daftarAda` = materi yang sudah tersimpan (untuk cek tautan ganda).
 * Hasil: { ok: true, materi } (tanpa id/dibuat; diisi pemanggil) atau { ok: false, pesan }.
 */
export function validasiMateri(data, daftarAda = []) {
  const judul = String(data.judul ?? '').trim().replace(/\s+/g, ' ');
  if (!judul) return { ok: false, pesan: 'Judul materi wajib diisi.' };
  if (judul.length > MAKS_JUDUL) return { ok: false, pesan: `Judul materi maksimal ${MAKS_JUDUL} karakter.` };

  const deskripsi = String(data.deskripsi ?? '').trim();
  if (deskripsi.length > MAKS_DESKRIPSI) return { ok: false, pesan: `Deskripsi maksimal ${MAKS_DESKRIPSI} karakter.` };

  const tautan = ambilTautanDrive(data.tautan);
  if (!tautan.ok) return { ok: false, pesan: tautan.pesan };
  const kembar = daftarAda.find((m) => m.fileId === tautan.id && m.id !== data.id);
  if (kembar) return { ok: false, pesan: `File ini sudah dipakai pada materi "${kembar.judul}". Hubungkan butir tambahan pada materi tersebut.` };

  const butir = [];
  for (const id of data.butir ?? []) {
    if (!INDEKS_BUTIR.has(id)) return { ok: false, pesan: `Kode butir "${id}" tidak dikenal.` };
    if (!butir.includes(id)) butir.push(id);
  }

  const bagianMentah = (data.bagian ?? []).filter((b) => String(b.judul ?? '').trim() || String(b.halaman ?? '').trim());
  if (bagianMentah.length > MAKS_BAGIAN) return { ok: false, pesan: `Daftar isi maksimal ${MAKS_BAGIAN} bagian.` };
  const bagian = [];
  for (let i = 0; i < bagianMentah.length; i += 1) {
    const b = bagianMentah[i];
    const jd = String(b.judul ?? '').trim().replace(/\s+/g, ' ');
    if (!jd) return { ok: false, pesan: `Bagian daftar isi nomor ${i + 1} belum ada judulnya.` };
    if (jd.length > MAKS_JUDUL) return { ok: false, pesan: `Judul bagian nomor ${i + 1} maksimal ${MAKS_JUDUL} karakter.` };
    const hal = rapikanHalaman(b.halaman);
    if (hal === null) return { ok: false, pesan: `Halaman pada bagian "${jd}" tidak sah. Tulis angka, mis. 3 atau 3-5.` };
    bagian.push({ id: b.id || buatId('b'), judul: jd, halaman: hal });
  }

  return {
    ok: true,
    materi: {
      judul, deskripsi,
      tautan: String(data.tautan).trim(),
      fileId: tautan.id,
      resourceKey: tautan.resourceKey,
      butir: urutButir(butir),
      bagian,
    },
  };
}

/* -------------------------------- Pemilihan --------------------------------- */

export const materiUntukButir = (daftar, butirId) => (daftar ?? []).filter((m) => m.butir?.includes(butirId));

/** Jumlah materi per id butir: Map(id -> jumlah). */
export function hitungMateriPerButir(daftar) {
  const peta = new Map();
  for (const m of daftar ?? []) for (const id of m.butir ?? []) peta.set(id, (peta.get(id) ?? 0) + 1);
  return peta;
}

/** Butir yang belum punya materi sama sekali. */
export const butirTanpaMateri = (daftar) => {
  const peta = hitungMateriPerButir(daftar);
  return KATALOG_BUTIR.filter((b) => !peta.has(b.id));
};

/**
 * Saring materi untuk halaman Materi. tingkat: 'semua' | 'Bantara' | 'Laksana'; butir: id atau ''; q: pencarian
 * pada judul, deskripsi, dan judul bagian.
 */
export function saringMateri(daftar, { tingkat = 'semua', butir = '', q = '' } = {}) {
  const kata = normalisasiNama(q);
  return (daftar ?? []).filter((m) => {
    if (butir && !m.butir?.includes(butir)) return false;
    if (tingkat !== 'semua' && !m.butir?.some((id) => INDEKS_BUTIR.get(id)?.tingkat === tingkat)) return false;
    if (!kata) return true;
    const gudang = normalisasiNama([m.judul, m.deskripsi, ...(m.bagian ?? []).map((b) => b.judul)].join(' '));
    return kata.split(' ').every((k) => gudang.includes(k));
  });
}

/** Geser satu materi ke atas (-1) atau bawah (+1). Mengembalikan daftar baru (tidak mengubah asli). */
export function geserMateri(daftar, id, arah) {
  const i = daftar.findIndex((m) => m.id === id);
  const j = i + arah;
  if (i === -1 || j < 0 || j >= daftar.length) return daftar;
  const baru = [...daftar];
  [baru[i], baru[j]] = [baru[j], baru[i]];
  return baru;
}

/* ---------------------------------- Hak akses ------------------------------- */

/** Hanya Pembina dan Admin Gudep yang boleh menambah, mengubah, dan menghapus materi. */
export const bolehKelolaMateri = (user) =>
  !!user && (user.role === 'admin' || (user.role === 'penguji' && user.jabatan === 'Pembina'));
