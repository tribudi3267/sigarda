/**
 * ROMBEL DAN PENUGASAN PENGUJI (murni, tanpa React)
 *
 * Rombel baku: X-01 sampai X-10, XI-01 sampai XI-10, XII-01 sampai XII-10 (30 rombel). Kolom `kelas` pada profil Penegak
 * menyimpan rombel. Aturan yang sama ditegakkan server (sigarda.rombel_sah, sg_profil_buat_internal, sg_anggota_ubah,
 * sg_rombel_perbarui); di sini hanya untuk umpan balik cepat dan tampilan. Dijaga oleh uji/penugasan-klien.mjs.
 *
 * Penugasan (penugasan_rombel): Admin menetapkan Pembina dan Dewan Ambalan untuk tiap rombel per tahun ajaran. Rombel tanpa
 * penugasan tetap memakai aturan lama (semua penguji) sampai diatur. Penegakannya (siapa yang sah dipilih dan dinilai) ada di bagian
 * "Penegakan penugasan" di bawah, yang mencerminkan sigarda.penguji_sah di server.
 */
import { AGAMA } from '../data/skuData';
import { hariIni } from './format';

export const KELAS_ROMBEL = ['X', 'XI', 'XII'];
export const ROMBEL_PER_KELAS = 10;
export const POLA_ROMBEL = /^(X|XI|XII)-(0[1-9]|10)$/;
export const PESAN_ROMBEL = 'Rombel harus X-01 sampai X-10, XI-01 sampai XI-10, atau XII-01 sampai XII-10.';

/** Rombel satu kelas: daftarRombelKelas('XI') = ['XI-01', ..., 'XI-10']. */
export const daftarRombelKelas = (kelas) => Array.from({ length: ROMBEL_PER_KELAS }, (_, i) => `${kelas}-${String(i + 1).padStart(2, '0')}`);
export const SEMUA_ROMBEL = KELAS_ROMBEL.flatMap(daftarRombelKelas);

export const rombelSah = (r) => POLA_ROMBEL.test(String(r ?? ''));
export const kelasDariRombel = (r) => (rombelSah(r) ? String(r).split('-')[0] : null);

/**
 * Membakukan isian rombel yang ditulis bebas: "xi 3", "XI-3", "xi.03", "XI03" menjadi "XI-03".
 * Mengembalikan '' bila bukan rombel yang sah (mis. "X" saja, "XI-11", "XIII-01").
 */
export function normalisasiRombel(teks) {
  const t = String(teks ?? '').toUpperCase().replace(/\s+/g, '');
  const m = /^(XII|XI|X)[-._/]?(\d{1,2})$/.exec(t);
  if (!m) return '';
  const r = `${m[1]}-${m[2].padStart(2, '0')}`;
  return rombelSah(r) ? r : '';
}

/** Penegak yang kelasnya belum berupa rombel baku (data lama: "X", "XI", "XII", dan sejenisnya). */
export const pesertaRombelLama = (users) => users.filter((u) => u.role === 'peserta' && !rombelSah(u.kelas));

/* ------------------------------ Tahun ajaran ------------------------------ */

export const tahunAjaranSah = (ta) => {
  const m = /^(\d{4})\/(\d{4})$/.exec(String(ta ?? ''));
  return !!m && Number(m[2]) === Number(m[1]) + 1 && Number(m[1]) >= 2000 && Number(m[1]) <= 2100;
};

/** Menggeser tahun ajaran: geserTahunAjaran('2026/2027', -1) = '2025/2026'. */
export const geserTahunAjaran = (ta, n) => {
  const a = Number(String(ta).split('/')[0]) + n;
  return `${a}/${a + 1}`;
};

/* ------------------------------ Penugasan ------------------------------ */

/** Pembina lebih dulu, lalu Dewan Ambalan, masing-masing menurut nama. */
export const daftarPengujiUrut = (users) =>
  users
    .filter((u) => u.role === 'penguji')
    .sort((a, b) => (a.jabatan === b.jabatan ? 0 : a.jabatan === 'Pembina' ? -1 : 1) || a.nama.localeCompare(b.nama, 'id'));

/** Himpunan kunci `${pengujiId}|${rombel}` dari daftar [{ rombel, pengujiId }]. */
export const kunciPenugasan = (baris = []) => new Set(baris.map((b) => `${b.pengujiId}|${b.rombel}`));

/** Jumlah Penegak per rombel baku: { 'X-01': 3, ... } (rombel format lama tidak dihitung). */
export const jumlahPesertaPerRombel = (users) => {
  const h = {};
  for (const u of users) if (u.role === 'peserta' && rombelSah(u.kelas)) h[u.kelas] = (h[u.kelas] ?? 0) + 1;
  return h;
};

/**
 * Ringkasan per rombel untuk tahun ajaran yang dipilih: { rombel, penguji (jumlah), peserta (jumlah), tanpaPenguji }.
 * `tanpaPenguji` hanya untuk rombel yang sudah punya Penegak (rombel kosong tanpa penguji tidak perlu diperingatkan).
 */
export function ringkasRombel(baris, users) {
  const peserta = jumlahPesertaPerRombel(users);
  const penguji = {};
  for (const b of baris) penguji[b.rombel] = (penguji[b.rombel] ?? 0) + 1;
  return SEMUA_ROMBEL.map((rombel) => {
    const p = peserta[rombel] ?? 0;
    const g = penguji[rombel] ?? 0;
    return { rombel, penguji: g, peserta: p, tanpaPenguji: p > 0 && g === 0 };
  });
}

/**
 * Cakupan agama: untuk tiap agama, jumlah Penegak, Pembina yang seagama, dan guru agama terdaftar. `perluSurat` bila ada Penegak
 * beragama itu tetapi tidak ada Pembina yang seagama (butir agama nanti perlu surat pengantar ke guru agama).
 */
export function cakupanAgama(users, guruAgama = []) {
  return AGAMA.map((agama) => {
    const penegak = users.filter((u) => u.role === 'peserta' && u.agama === agama).length;
    const pembina = users.filter((u) => u.role === 'penguji' && u.jabatan === 'Pembina' && u.agama === agama);
    const guru = guruAgama.filter((g) => g.agama === agama);
    return { agama, penegak, pembina, guru, perluSurat: penegak > 0 && pembina.length === 0 };
  });
}

/** Pembina yang agamanya belum diisi (butir agama tidak dapat diarahkan kepadanya sebelum diisi). */
export const pembinaTanpaAgama = (users) => users.filter((u) => u.role === 'penguji' && u.jabatan === 'Pembina' && !u.agama);

/* ------------------------------ Penegakan penugasan (fase 1b) ------------------------------ */

/**
 * Tahun ajaran berjalan menurut tanggal ISO: Juli sampai Desember = tahun ini/tahun depan, Januari sampai Juni = tahun lalu/tahun ini.
 * Cermin sigarda.tahun_ajaran_kini.
 */
export const tahunAjaranKini = (tanggalIso = hariIni()) => {
  const [y, m] = tanggalIso.split('-').map(Number);
  const awal = m >= 7 ? y : y - 1;
  return `${awal}/${awal + 1}`;
};

/**
 * Aturan peran penguji untuk satu butir (berlaku saat memilih penguji DAN mencatat hasil): butir Laksana dan butir agama hanya Pembina;
 * butir Bantara lain boleh Pembina atau Dewan Ambalan. Butir agama hanya untuk Pembina yang agamanya sama dengan Penegak; selama belum ada
 * satu pun Pembina yang agamanya terisi (masa peralihan), semua Pembina dianggap sah. Cermin sigarda.penguji_peran_ok.
 */
export function pengujiPeranOk(users, peserta, penguji, poin) {
  if (!penguji || penguji.role !== 'penguji' || !poin) return false;
  if (penguji.jabatan !== 'Pembina' && (poin.tingkat === 'Laksana' || poin.agama)) return false;
  if (poin.agama && users.some((u) => u.role === 'penguji' && u.jabatan === 'Pembina' && u.agama)) {
    if (!penguji.agama || penguji.agama !== peserta?.agama) return false;
  }
  return true;
}

/**
 * Penguji yang sah untuk satu Penegak dan satu butir. `penugasan` = baris penugasan tahun ajaran berjalan ([{ rombel, pengujiId }]).
 * Bila rombel Penegak diatur dan ada penguji bertugas yang memenuhi aturan peran: hanya mereka (dariRombel true); bila tidak (rombel belum
 * diatur, kelas format lama, atau tak seorang pun yang bertugas boleh menguji butir itu): semua penguji yang memenuhi aturan peran.
 * Cermin sigarda.penguji_sah. Mengembalikan { penguji: [pengguna], dariRombel }.
 */
export function pengujiSah({ users, penugasan = [], peserta, poin }) {
  const layak = (u) => pengujiPeranOk(users, peserta, u, poin);
  if (rombelSah(peserta?.kelas)) {
    const ditugaskan = new Set(penugasan.filter((b) => b.rombel === peserta.kelas).map((b) => b.pengujiId));
    const dariRombel = users.filter((u) => ditugaskan.has(u.id) && layak(u));
    if (dariRombel.length) return { penguji: dariRombel, dariRombel: true };
  }
  return { penguji: users.filter(layak), dariRombel: false };
}
