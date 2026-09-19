/**
 * LOGIKA PENGUJIAN SKU (murni, tanpa React)
 *
 * Bentuk data progres (kunci = id unit, lihat data/skuData.js):
 *   progress[pesertaId][unitId] = {
 *     status: 'belum' | 'diajukan' | 'proses' | 'ulang' | 'lulus',
 *     jadwal, pengujiId, tanggalUji, nilai, catatan, catatanPeserta,
 *     verifikasi, diverifikasiPada, riwayat: [{ waktu, teks, oleh }]
 *   }
 *
 * Unit = satu butir biasa, atau satu sub-butir dari butir 1 (agama). Sebuah butir dinyatakan
 * lulus bila seluruh unitnya lulus. Persentase dihitung per butir agar sama dengan jumlah
 * butir resmi (Bantara 23, Laksana 22).
 *
 * Alur status:
 *   belum/ulang --(peserta ajukan)--> diajukan --(penguji mulai)--> proses
 *   diajukan/proses/belum --(penguji putuskan)--> lulus | ulang
 *   apa pun --(penguji batalkan)--> belum
 *
 * Aturan: butir Laksana baru bisa diajukan setelah seluruh butir Bantara lulus.
 *
 * Peran peserta:
 *   calon-bantara : sedang mengerjakan SKU Bantara
 *   calon-laksana : SKU Bantara lulus, mengerjakan SKU Laksana
 *   calon-garuda  : SKU Bantara dan Laksana lulus, lalu mendaftarkan diri (user.calonGaruda)
 */
import { TINGKAT, INDEKS_POIN, unitButir } from '../data/skuData';
import { kodeVerifikasi } from './format';

export const STATUS = {
  belum: { label: 'Belum diuji', kelas: 'bg-stone-100 text-stone-700 ring-stone-300' },
  diajukan: { label: 'Menunggu uji', kelas: 'bg-sky-50 text-sky-800 ring-sky-300' },
  proses: { label: 'Sedang diuji', kelas: 'bg-amber-50 text-amber-900 ring-amber-300' },
  ulang: { label: 'Perlu diulang', kelas: 'bg-red-50 text-red-800 ring-red-300' },
  lulus: { label: 'Lulus', kelas: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
};

export const PERAN = {
  'calon-bantara': { label: 'Penegak Calon Bantara', singkat: 'Calon Bantara', kelas: 'bg-sky-100 text-sky-900 ring-sky-300' },
  'calon-laksana': { label: 'Penegak Calon Laksana', singkat: 'Calon Laksana', kelas: 'bg-amber-100 text-amber-900 ring-amber-300' },
  'calon-garuda': { label: 'Penegak Calon Garuda', singkat: 'Calon Garuda', kelas: 'bg-emerald-100 text-emerald-900 ring-emerald-300' },
};
export const URUTAN_PERAN = Object.keys(PERAN);

/* ---------- Butir dan unit per agama ---------- */

const cacheButir = new Map();

/** Daftar butir tingkat ini untuk agama tertentu; tiap butir membawa `unit` (yang diuji). */
export function butirPeserta(tingkat, agama = '') {
  const kunci = `${tingkat}|${agama}`;
  if (!cacheButir.has(kunci)) {
    cacheButir.set(
      kunci,
      TINGKAT[tingkat].butir.map((b) => ({ ...b, unit: unitButir(tingkat, b, agama) }))
    );
  }
  return cacheButir.get(kunci);
}

export const daftarPoin = (tingkat, agama = '') => butirPeserta(tingkat, agama).flatMap((b) => b.unit);
export const cariPoin = (skuId) => INDEKS_POIN[skuId] ?? null;

export const getEntry = (progress, pesertaId, skuId) =>
  progress?.[pesertaId]?.[skuId] ?? { status: 'belum', riwayat: [] };

/* ---------- Perhitungan progres ---------- */

export function hitungProgres(progress, peserta, tingkat) {
  const butir = butirPeserta(tingkat, peserta.agama);
  let lulus = 0;
  let diproses = 0;
  let totalUnit = 0;
  let lulusUnit = 0;
  for (const b of butir) {
    const status = b.unit.map((u) => getEntry(progress, peserta.id, u.id).status);
    const unitLulus = status.filter((s) => s === 'lulus').length;
    totalUnit += status.length;
    lulusUnit += unitLulus;
    if (unitLulus === status.length) lulus += 1;
    else if (status.some((s) => s === 'diajukan' || s === 'proses')) diproses += 1;
  }
  return {
    total: butir.length,
    lulus,
    diproses,
    totalUnit,
    lulusUnit,
    persen: butir.length ? Math.round((lulus / butir.length) * 100) : 0,
  };
}

export const tingkatSelesai = (progress, peserta, tingkat) => {
  const h = hitungProgres(progress, peserta, tingkat);
  return h.total > 0 && h.lulus === h.total;
};

export const laksanaTerbuka = (progress, peserta) => tingkatSelesai(progress, peserta, 'Bantara');

/** Memenuhi syarat mencalonkan diri: seluruh SKU Bantara dan Laksana lulus. */
export const layakGaruda = (progress, peserta) =>
  tingkatSelesai(progress, peserta, 'Bantara') && tingkatSelesai(progress, peserta, 'Laksana');

export function peranPeserta(progress, peserta) {
  if (peserta.calonGaruda && layakGaruda(progress, peserta)) return 'calon-garuda';
  return tingkatSelesai(progress, peserta, 'Bantara') ? 'calon-laksana' : 'calon-bantara';
}

/** Daftar peserta lengkap dengan peran turunannya, dipakai filter dan rekap. */
export const pesertaDenganPeran = (progress, users) =>
  users.filter((u) => u.role === 'peserta').map((u) => ({ ...u, peran: peranPeserta(progress, u) }));

export function tanggalLulusTingkat(progress, peserta, tingkat) {
  if (!tingkatSelesai(progress, peserta, tingkat)) return null;
  const tgl = daftarPoin(tingkat, peserta.agama)
    .map((p) => getEntry(progress, peserta.id, p.id).tanggalUji)
    .filter(Boolean)
    .sort();
  return tgl[tgl.length - 1] ?? null;
}

/* ---------- Aturan dan transisi status ---------- */

function tulis(progress, pesertaId, skuId, patch, teksRiwayat, oleh) {
  const lama = getEntry(progress, pesertaId, skuId);
  const entry = {
    ...lama,
    ...patch,
    riwayat: [...(lama.riwayat ?? []), { waktu: new Date().toISOString(), teks: teksRiwayat, oleh }],
  };
  return { ...progress, [pesertaId]: { ...(progress[pesertaId] ?? {}), [skuId]: entry } };
}

export function bisaDiajukan(progress, peserta, skuId) {
  const poin = cariPoin(skuId);
  if (!poin) return { ok: false, alasan: 'Poin SKU tidak ditemukan.' };
  const { status } = getEntry(progress, peserta.id, skuId);
  if (status === 'lulus') return { ok: false, alasan: 'Poin ini sudah lulus.' };
  if (status === 'diajukan' || status === 'proses')
    return { ok: false, alasan: 'Poin ini sedang menunggu atau dalam pengujian.' };
  if (poin.tingkat === 'Laksana' && !laksanaTerbuka(progress, peserta))
    return { ok: false, alasan: 'Selesaikan seluruh butir Bantara lebih dulu.' };
  return { ok: true };
}

/** Peserta mengajukan pengujian. Melempar Error bila melanggar aturan. */
export function ajukanPengujian(progress, { peserta, skuId, jadwal, pengujiId, catatan = '' }) {
  const cek = bisaDiajukan(progress, peserta, skuId);
  if (!cek.ok) throw new Error(cek.alasan);
  if (!jadwal) throw new Error('Tanggal pengujian wajib diisi.');
  if (!pengujiId) throw new Error('Pilih penguji terlebih dulu.');
  return tulis(
    progress,
    peserta.id,
    skuId,
    { status: 'diajukan', jadwal, pengujiId, catatanPeserta: catatan.trim() },
    `Mengajukan pengujian untuk ${jadwal}`,
    peserta.id
  );
}

export function batalkanPengajuan(progress, { pesertaId, skuId }) {
  if (getEntry(progress, pesertaId, skuId).status !== 'diajukan')
    throw new Error('Hanya pengajuan yang belum mulai diuji yang bisa dibatalkan.');
  return tulis(
    progress,
    pesertaId,
    skuId,
    { status: 'belum', jadwal: null, pengujiId: null, catatanPeserta: '' },
    'Pengajuan dibatalkan peserta',
    pesertaId
  );
}

/**
 * Penguji mencatat hasil.
 * hasil: 'proses' | 'lulus' | 'ulang' | 'reset'
 * Verifikasi PIN dilakukan pemanggil (AppContext) sebelum fungsi ini dipanggil.
 */
export function catatHasilUji(progress, { peserta, skuId, pengujiId, hasil, tanggalUji, nilai, catatan = '' }) {
  const pesertaId = peserta.id;
  const poin = cariPoin(skuId);
  if (!poin) throw new Error('Poin SKU tidak ditemukan.');
  if (hasil !== 'reset' && !tanggalUji) throw new Error('Tanggal uji wajib diisi.');
  if (hasil !== 'reset' && poin.tingkat === 'Laksana' && !laksanaTerbuka(progress, peserta))
    throw new Error('Peserta belum menyelesaikan seluruh butir Bantara.');

  const catatanBersih = catatan.trim();

  switch (hasil) {
    case 'proses':
      return tulis(
        progress, pesertaId, skuId,
        { status: 'proses', pengujiId, tanggalUji, verifikasi: null, diverifikasiPada: null },
        'Pengujian dimulai',
        pengujiId
      );

    case 'lulus': {
      if (!nilai) throw new Error('Pilih predikat penilaian.');
      const kode = kodeVerifikasi([pesertaId, skuId, pengujiId, tanggalUji]);
      return tulis(
        progress, pesertaId, skuId,
        {
          status: 'lulus', pengujiId, tanggalUji, nilai, catatan: catatanBersih,
          verifikasi: kode, diverifikasiPada: new Date().toISOString(),
        },
        `Dinyatakan lulus (${nilai}), kode ${kode}`,
        pengujiId
      );
    }

    case 'ulang':
      if (!catatanBersih) throw new Error('Isi catatan agar peserta tahu bagian yang perlu diperbaiki.');
      return tulis(
        progress, pesertaId, skuId,
        { status: 'ulang', pengujiId, tanggalUji, nilai: null, catatan: catatanBersih, verifikasi: null, diverifikasiPada: null },
        'Perlu diulang',
        pengujiId
      );

    case 'reset':
      if (!catatanBersih) throw new Error('Isi alasan pembatalan status.');
      return tulis(
        progress, pesertaId, skuId,
        {
          status: 'belum', pengujiId: null, tanggalUji: null, jadwal: null, nilai: null,
          catatan: '', catatanPeserta: '', verifikasi: null, diverifikasiPada: null,
        },
        `Status dikembalikan ke belum diuji. Alasan: ${catatanBersih}`,
        pengujiId
      );

    default:
      throw new Error('Hasil pengujian tidak dikenal.');
  }
}

/* ---------- Kueri untuk dashboard ---------- */

/** Daftar pengajuan/pengujian yang masih berjalan, urut jadwal terdekat. */
export function antrianPengujian(progress, users, pengujiId = null) {
  const hasil = [];
  for (const u of users) {
    if (u.role !== 'peserta') continue;
    for (const [skuId, entry] of Object.entries(progress[u.id] ?? {})) {
      if (entry.status !== 'diajukan' && entry.status !== 'proses') continue;
      if (pengujiId && entry.pengujiId && entry.pengujiId !== pengujiId) continue;
      const poin = cariPoin(skuId);
      if (poin) hasil.push({ peserta: u, poin, entry });
    }
  }
  return hasil.sort((a, b) => (a.entry.jadwal ?? '9999').localeCompare(b.entry.jadwal ?? '9999'));
}

export function rekapAnggota(progress, users) {
  return pesertaDenganPeran(progress, users).map((u) => ({
    user: u,
    peran: u.peran,
    bantara: hitungProgres(progress, u, 'Bantara'),
    laksana: hitungProgres(progress, u, 'Laksana'),
    tglBantara: tanggalLulusTingkat(progress, u, 'Bantara'),
    tglLaksana: tanggalLulusTingkat(progress, u, 'Laksana'),
  }));
}

export function rekapPerSangga(rekap) {
  const peta = new Map();
  for (const r of rekap) {
    const k = r.user.sangga || 'Tanpa sangga';
    const g = peta.get(k) ?? { sangga: k, jumlah: 0, bantaraLulus: 0, laksanaLulus: 0, totalPersen: 0 };
    g.jumlah += 1;
    g.bantaraLulus += r.bantara.persen === 100 ? 1 : 0;
    g.laksanaLulus += r.laksana.persen === 100 ? 1 : 0;
    g.totalPersen += r.bantara.persen;
    peta.set(k, g);
  }
  return [...peta.values()]
    .map((g) => ({ ...g, rataBantara: Math.round(g.totalPersen / g.jumlah) }))
    .sort((a, b) => a.sangga.localeCompare(b.sangga, 'id', { numeric: true }));
}
