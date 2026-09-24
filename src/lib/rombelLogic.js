/**
 * ROMBEL DAN PENUGASAN PENGUJI (murni, tanpa React)
 *
 * Rombel baku: X-01 sampai X-10, XI-01 sampai XI-10, XII-01 sampai XII-10 (30 rombel). Kolom `kelas` pada profil Penegak
 * menyimpan rombel. Aturan yang sama ditegakkan server (sigarda.rombel_sah, sg_profil_buat_internal, sg_anggota_ubah,
 * sg_rombel_perbarui); di sini hanya untuk umpan balik cepat dan tampilan. Dijaga oleh uji/penugasan-klien.mjs.
 *
 * Penugasan (penugasan_rombel): Pembina dan Admin menetapkan Pembina dan Penegak berjabatan Dewan Ambalan untuk tiap rombel per tahun ajaran, dan
 * (penugasan_peserta) untuk satu Penegak tertentu sebagai pengecualian. Rombel tanpa penugasan tetap memakai aturan lama (semua penguji) sampai
 * diatur. Penegakannya (siapa yang sah dipilih dan dinilai) ada di bagian "Penegakan penugasan" di bawah, yang mencerminkan sigarda.penguji_sah.
 * Dewan Ambalan adalah ATRIBUT akun Penegak (profiles.jabatan_dewan), bukan akun terpisah: penegakDewan, bisaMenguji.
 */
import { AGAMA } from '../data/skuData';
import { hariIni, urutAlami } from './format';
import { suratAgamaAktif } from './dokumenLogic';

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
export const pesertaRombelLama = (users) => users.filter((u) => u.role === 'peserta' && (u.status ?? 'aktif') === 'aktif' && !rombelSah(u.kelas));

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

/** Penegak aktif berjabatan Dewan Ambalan (cermin klausa `role = 'peserta' and jabatan_dewan is not null` pada sigarda.pengurus/dewan/bisa_menguji; dijaga uji/paritas-hak.mjs). */
export const penegakDewan = (u) => !!u && u.role === 'peserta' && !!u.jabatanDewan && (u.status ?? 'aktif') === 'aktif';
/** Boleh menjadi penguji: penguji aktif (Pembina, atau akun Dewan lama yang belum diarsipkan) atau Penegak berjabatan Dewan (cermin sigarda.bisa_menguji). */
export const bisaMenguji = (u) => !!u && (u.role === 'penguji' ? (u.status ?? 'aktif') === 'aktif' : penegakDewan(u));
export const adalahPembina = (u) => !!u && u.role === 'penguji' && u.jabatan === 'Pembina';

/** Pembina lebih dulu, lalu Dewan Ambalan, masing-masing menurut nama. */
export const daftarPengujiUrut = (users) =>
  users
    .filter(bisaMenguji)
    .sort((a, b) => Number(!adalahPembina(a)) - Number(!adalahPembina(b)) || a.nama.localeCompare(b.nama, 'id'));

/** Himpunan kunci `${pengujiId}|${rombel}` dari daftar [{ rombel, pengujiId }]. */
export const kunciPenugasan = (baris = []) => new Set(baris.map((b) => `${b.pengujiId}|${b.rombel}`));

/** Jumlah Penegak per rombel baku: { 'X-01': 3, ... } (rombel format lama tidak dihitung). */
export const jumlahPesertaPerRombel = (users) => {
  const h = {};
  for (const u of users) if (u.role === 'peserta' && (u.status ?? 'aktif') === 'aktif' && rombelSah(u.kelas)) h[u.kelas] = (h[u.kelas] ?? 0) + 1;
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
    const penegak = users.filter((u) => u.role === 'peserta' && (u.status ?? 'aktif') === 'aktif' && u.agama === agama).length;
    const pembina = users.filter((u) => u.role === 'penguji' && u.jabatan === 'Pembina' && u.agama === agama);
    const guru = guruAgama.filter((g) => g.agama === agama);
    return { agama, penegak, pembina, guru, perluSurat: penegak > 0 && pembina.length === 0 };
  });
}

/** Pembina yang agamanya belum diisi (butir agama tidak dapat diarahkan kepadanya sebelum diisi). */
export const pembinaTanpaAgama = (users) => users.filter((u) => u.role === 'penguji' && u.jabatan === 'Pembina' && !u.agama);

/* ------------------------------ Rombel saya (fase 3) ------------------------------ */

/** Rombel yang ditugaskan kepada satu penguji pada baris penugasan tahun ajaran berjalan, terurut (X-01, ..., XII-10). */
export const rombelSaya = (penugasan, pengujiId) =>
  [...new Set((penugasan ?? []).filter((b) => b.pengujiId === pengujiId).map((b) => b.rombel))].sort(urutAlami);

/**
 * Filter "rombel saya" untuk daftar Penegak: `saya` menyala dan penguji punya rombel tugas -> hanya rombel itu; selain itu tidak menyaring
 * (penguji tanpa penugasan, Admin, atau penugasan belum termuat tetap melihat semua). Mengembalikan salinan filter dengan `rombel` (larik).
 */
export const filterEfektif = (filter, rombel = []) => ({ ...filter, rombel: filter.saya && rombel.length ? rombel : [] });

/** Ringkas untuk lencana: ["XI-01", "XI-02", "XI-03", "XII-01"] dengan maks 3 menjadi "XI-01, XI-02, XI-03 (+1)". */
export const ringkasDaftarRombel = (rombel, maks = 3) =>
  rombel.length <= maks ? rombel.join(', ') : `${rombel.slice(0, maks).join(', ')} (+${rombel.length - maks})`;

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
 * Penguji ini DITUGASKAN untuk Penegak ini (tahun ajaran berjalan)? Penugasan khusus Penegak (`penugasanPeserta` = [{ pesertaId, pengujiId }]) bila ada
 * menggantikan penugasan rombelnya (`penugasan` = [{ rombel, pengujiId }]). Cermin sigarda.ditugaskan.
 */
export function ditugaskanUntuk({ penugasan = [], penugasanPeserta = [], peserta, pengujiId }) {
  const khusus = penugasanPeserta.filter((b) => b.pesertaId === peserta?.id);
  if (khusus.length) return khusus.some((b) => b.pengujiId === pengujiId);
  return rombelSah(peserta?.kelas) && penugasan.some((b) => b.rombel === peserta.kelas && b.pengujiId === pengujiId);
}

/**
 * Aturan peran penguji untuk satu butir (berlaku saat memilih penguji DAN mencatat hasil): penguji = Pembina atau Penegak berjabatan Dewan (aktif), bukan
 * Penegak itu sendiri. Butir agama hanya Pembina yang agamanya sama dengan Penegak (selama belum ada satu pun Pembina yang agamanya terisi, masa
 * peralihan, semua Pembina dianggap sah); pengecualian: surat pengantar ke guru agama yang masih berlaku untuk Penegak dan butir itu (`dokumen`).
 * Butir Laksana: Pembina, atau penguji yang ditugaskan untuk Penegak itu (`tugas` = { penugasan, penugasanPeserta }); tanpa penugasan, Dewan hanya
 * menguji butir Bantara. Cermin sigarda.penguji_peran_ok.
 */
export function pengujiPeranOk(users, peserta, penguji, poin, dokumen = [], tugas = {}) {
  if (!bisaMenguji(penguji) || !poin || penguji.id === peserta?.id) return false;
  const pembina = adalahPembina(penguji);
  if (!pembina && poin.agama) return false;
  if (!pembina && poin.tingkat === 'Laksana' && !ditugaskanUntuk({ ...tugas, peserta, pengujiId: penguji.id })) return false;
  if (poin.agama && users.some((u) => adalahPembina(u) && u.agama)) {
    if ((!penguji.agama || penguji.agama !== peserta?.agama) && !suratAgamaAktif(dokumen, peserta?.id, poin.id)) return false;
  }
  return true;
}

/**
 * Penguji yang sah untuk satu Penegak dan satu butir. `penugasan` = baris penugasan rombel tahun ajaran berjalan ([{ rombel, pengujiId }]),
 * `penugasanPeserta` = penugasan khusus Penegak ([{ pesertaId, pengujiId }]). Urutan: (1) penugasan khusus Penegak itu, (2) penugasan rombelnya,
 * masing-masing bila ada penguji bertugas yang memenuhi aturan peran (dariRombel true); bila tidak (belum diatur, kelas format lama, atau tak seorang
 * pun yang bertugas boleh menguji butir itu): semua penguji yang memenuhi aturan peran. Cermin sigarda.penguji_sah.
 * Mengembalikan { penguji: [pengguna], dariRombel }.
 */
export function pengujiSah({ users, penugasan = [], penugasanPeserta = [], peserta, poin, dokumen = [] }) {
  const layak = (u) => pengujiPeranOk(users, peserta, u, poin, dokumen, { penugasan, penugasanPeserta });
  const khusus = new Set(penugasanPeserta.filter((b) => b.pesertaId === peserta?.id).map((b) => b.pengujiId));
  if (khusus.size) {
    const dariKhusus = users.filter((u) => khusus.has(u.id) && layak(u));
    if (dariKhusus.length) return { penguji: dariKhusus, dariRombel: true };
  }
  if (rombelSah(peserta?.kelas)) {
    const ditugaskan = new Set(penugasan.filter((b) => b.rombel === peserta.kelas).map((b) => b.pengujiId));
    const dariRombel = users.filter((u) => ditugaskan.has(u.id) && layak(u));
    if (dariRombel.length) return { penguji: dariRombel, dariRombel: true };
  }
  return { penguji: users.filter(layak), dariRombel: false };
}
