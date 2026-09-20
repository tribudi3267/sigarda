/**
 * LOGIKA INSTRUMEN PENILAIAN SKU (murni, tanpa React)
 *
 * Tiap unit SKU (butir; butir agama per sub-butir) dapat punya instrumen: cara uji, instruksi penguji, dan 1-15 kriteria
 * (jenis penilaian, bobot 1-5, tanda wajib, panduan penguji). Penguji memberi nilai 1-5 pada tiap kriteria.
 *   skor (0-100) = 20 x jumlah(nilai x bobot) / jumlah(bobot), dibulatkan setengah ke atas
 *   saran LULUS bila skor >= ambang (bawaan 75) dan, bila gerbang wajib aktif, setiap kriteria wajib bernilai >= nilaiWajibMin
 *   predikat (nilai) dari pita: >= 90 Sangat baik, >= 75 Baik, selebihnya Cukup
 * Server selalu menghitung ulang (sigarda.instrumen_hitung di supabase/sumber/inti.sql; kesetaraannya dijaga pengujian).
 * Hanya instrumen berstatus 'ditetapkan' yang dipakai menilai; butir tanpa instrumen ditetapkan memakai alur penilaian lama.
 */
import { bagiBulat } from './raportLogic';

export const KUNCI_PENGATURAN_INSTRUMEN = 'instrumen.pengaturan';

export const PENGATURAN_INSTRUMEN_BAWAAN = {
  ambang: 75,
  pita: { sangatBaik: 90, baik: 75, cukup: 60 },
  gerbangWajib: true,
  nilaiWajibMin: 3,
};

export const JENIS_KRITERIA = ['Lisan', 'Praktik', 'Bukti kegiatan', 'Pengamatan'];
export const NILAI_KRITERIA = {
  1: 'Belum',
  2: 'Kurang',
  3: 'Cukup',
  4: 'Baik',
  5: 'Sangat baik',
};
export const MAKS_KRITERIA = 15;
export const STATUS_INSTRUMEN = { draf: 'Draf', ditetapkan: 'Ditetapkan' };

const bulat = (v) => (Number.isInteger(v) ? v : null);

/** Pengaturan tersimpan (bisa kosong atau sebagian) digabung dengan bawaan, per isian. */
export function gabungPengaturanInstrumen(tersimpan) {
  const t = tersimpan && typeof tersimpan === 'object' ? tersimpan : {};
  const B = PENGATURAN_INSTRUMEN_BAWAAN;
  return {
    ambang: bulat(t.ambang) ?? B.ambang,
    pita: {
      sangatBaik: bulat(t.pita?.sangatBaik) ?? B.pita.sangatBaik,
      baik: bulat(t.pita?.baik) ?? B.pita.baik,
      cukup: bulat(t.pita?.cukup) ?? B.pita.cukup,
    },
    gerbangWajib: typeof t.gerbangWajib === 'boolean' ? t.gerbangWajib : B.gerbangWajib,
    nilaiWajibMin: bulat(t.nilaiWajibMin) ?? B.nilaiWajibMin,
  };
}

/** Pesan galat (bahasa Indonesia) atau '' bila pengaturan sah. Aturan sama dengan sg_instrumen_pengaturan_simpan. */
export function periksaPengaturanInstrumen(p) {
  const semua = [['Ambang lulus', p.ambang], ['Batas Sangat Baik', p.pita.sangatBaik], ['Batas Baik', p.pita.baik], ['Batas Cukup', p.pita.cukup], ['Nilai minimal kriteria wajib', p.nilaiWajibMin]];
  for (const [nama, v] of semua) if (!Number.isInteger(v) || v < 0 || v > 999) return `${nama} harus berupa bilangan bulat.`;
  const { sangatBaik, baik, cukup } = p.pita;
  if (!(sangatBaik <= 100 && sangatBaik > baik && baik > cukup && cukup >= 1)) {
    return 'Batas nilai harus berurutan: Sangat Baik (maks. 100) lebih besar dari Baik, Baik lebih besar dari Cukup, Cukup minimal 1.';
  }
  if (p.ambang < 1 || p.ambang > 100) return 'Ambang lulus harus antara 1 dan 100.';
  if (p.nilaiWajibMin < 2 || p.nilaiWajibMin > 5) return 'Nilai minimal kriteria wajib harus antara 2 dan 5.';
  if (typeof p.gerbangWajib !== 'boolean') return 'Pilih apakah kriteria wajib menjadi syarat lulus.';
  return '';
}

/**
 * Menghitung skor dari nilai kriteria. `kriteria` = [{ id, bobot, wajib }], `nilai` = { [id]: 1-5 }.
 * Bila ada kriteria yang belum dinilai, `lengkap` salah dan skor/saran null.
 */
export function hitungSkorInstrumen(kriteria, nilai, pengaturan) {
  const belum = kriteria.filter((k) => !(nilai?.[k.id] >= 1 && nilai?.[k.id] <= 5)).length;
  if (!kriteria.length || belum) return { lengkap: false, belum, skor: null, saran: null, nilaiPredikat: null, wajibOk: null };
  let s = 0;
  let w = 0;
  let wajibOk = true;
  for (const k of kriteria) {
    s += k.bobot * nilai[k.id];
    w += k.bobot;
    if (k.wajib && nilai[k.id] < pengaturan.nilaiWajibMin) wajibOk = false;
  }
  const skor = bagiBulat(20 * s, w);
  const saran = skor >= pengaturan.ambang && (wajibOk || !pengaturan.gerbangWajib) ? 'lulus' : 'ulang';
  const { sangatBaik, baik } = pengaturan.pita;
  const nilaiPredikat = skor >= sangatBaik ? 'Sangat baik' : skor >= baik ? 'Baik' : 'Cukup';
  return { lengkap: true, belum: 0, skor, saran, nilaiPredikat, wajibOk };
}

/** Kriteria yang wajib tetapi nilainya di bawah batas (untuk pesan kepada penguji). */
export const kriteriaWajibGagal = (kriteria, nilai, pengaturan) =>
  kriteria.filter((k) => k.wajib && nilai?.[k.id] >= 1 && nilai[k.id] < pengaturan.nilaiWajibMin);

/** Memeriksa isian editor instrumen. Mengembalikan pesan galat atau ''. Aturan sama dengan sg_instrumen_simpan. */
export function periksaInstrumen({ caraUji, instruksi, kriteria, status }) {
  if ((caraUji ?? '').trim().length > 300) return 'Cara uji maksimal 300 karakter.';
  if ((instruksi ?? '').trim().length > 1500) return 'Instruksi penguji maksimal 1500 karakter.';
  if (kriteria.length > MAKS_KRITERIA) return `Kriteria maksimal ${MAKS_KRITERIA} per butir.`;
  if (status === 'ditetapkan' && kriteria.length === 0) return 'Instrumen yang ditetapkan harus memiliki minimal satu kriteria.';
  for (let i = 0; i < kriteria.length; i += 1) {
    const k = kriteria[i];
    const n = i + 1;
    if (!JENIS_KRITERIA.includes(k.jenis)) return `Kriteria ${n}: pilih jenis penilaian.`;
    const t = (k.teks ?? '').trim();
    if (!t || t.length > 400) return `Kriteria ${n}: teks wajib diisi (maksimal 400 karakter).`;
    if (!Number.isInteger(k.bobot) || k.bobot < 1 || k.bobot > 5) return `Kriteria ${n}: bobot harus 1 sampai 5.`;
    if ((k.panduan ?? '').length > 1500) return `Kriteria ${n}: panduan maksimal 1500 karakter.`;
  }
  return '';
}

/** Tautan antar butir: daftar unit SKU untuk halaman kelola. `INDEKS_POIN` dari data katalog (tanpa varian -LAIN-). */
export function daftarUnitInstrumen(indeksPoin, hurufSub) {
  return Object.entries(indeksPoin)
    .filter(([id]) => !id.includes('-LAIN-'))
    .map(([id, p]) => ({
      id,
      tingkat: p.tingkat,
      butirNo: p.butirNo,
      sub: p.sub ?? null,
      agama: p.agama ?? null,
      teks: p.teks,
      label: `Butir ${p.butirNo}${p.sub ? hurufSub(p.sub) : ''}${p.agama ? ` (${p.agama})` : ''}`,
    }))
    .sort((a, b) => a.tingkat.localeCompare(b.tingkat) || a.butirNo - b.butirNo || (a.agama ?? '').localeCompare(b.agama ?? '') || (a.sub ?? 0) - (b.sub ?? 0));
}

/** Status kelengkapan untuk tabel kelola: belum ada, draf, atau ditetapkan. */
export const statusUnit = (instrumen, id) => instrumen?.[id]?.status ?? 'kosong';
