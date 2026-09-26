/**
 * TEMPLAT SURAT KETERANGAN GURU (Tahap 3, H1; murni tanpa React). Rubrik tiap surat disimpan per tahun ajaran di tabel dokumen_templat (hanya Pembina dan Admin dapat
 * membaca dan mengisi; tidak ada di repositori). Tahun ajaran tanpa templat memakai templat tahun ajaran sebelumnya yang terdekat. `periksaTemplat` mencerminkan
 * sg_dokumen_templat_simpan dan DIBANDINGKAN LANGSUNG dengan SQL pada kisi masukan (uji/surat-guru.mjs).
 */
import { INDEKS_SURAT, JUMLAH_BARIS_KOSONG, PITA_BAWAAN } from '../data/suratGuruData';

const rapikan = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const TERLARANG = /[\u0000-\u001f\u007f<>]/;

/** Templat yang berlaku untuk satu jenis pada tahun ajaran itu: yang bertahun ajaran sama, atau yang terdekat sebelumnya; { templat, warisan } atau null. */
export function templatBerlaku(daftar = [], tahunAjaran, jenis) {
  const milik = daftar.filter((t) => t.jenis === jenis && t.tahunAjaran <= tahunAjaran).sort((a, b) => b.tahunAjaran.localeCompare(a.tahunAjaran));
  return milik[0] ? { templat: milik[0], warisan: milik[0].tahunAjaran !== tahunAjaran } : null;
}

/**
 * Baris surat yang siap dicetak: [{ jenis: 'judul' | 'butir' | 'kosong', no, teks }]. Bila ada judul kelompok ("# ..."), judul yang bernomor dan butirnya tidak;
 * tanpa judul, butir yang bernomor. Templat kosong = baris kosong bernomor untuk diisi tangan.
 */
export function barisSurat(isi) {
  const baris = isi?.baris ?? [];
  if (!baris.length) return Array.from({ length: JUMLAH_BARIS_KOSONG }, (_, i) => ({ jenis: 'kosong', no: i + 1, teks: '' }));
  const adaJudul = baris.some((b) => b.startsWith('# '));
  let n = 0;
  return baris.map((b) => {
    if (b.startsWith('# ')) { n += 1; return { jenis: 'judul', no: n, teks: b.slice(2).trim() }; }
    if (!adaJudul) { n += 1; return { jenis: 'butir', no: n, teks: b }; }
    return { jenis: 'butir', no: '', teks: b };
  });
}

export const pitaSurat = (isi) => (Array.isArray(isi?.pita) && isi.pita.length === 3 ? isi.pita : PITA_BAWAAN);

/** Isi formulir (topik, rubrik satu baris per teks, tiga pita) -> isi templat untuk server. Baris kosong dibuang; pita kosong semua = tidak dikirim. */
export function isiDariForm({ uji = '', rubrik = '', pita = ['', '', ''] }) {
  const isi = { baris: String(rubrik).split(/\r?\n/).map(rapikan).filter(Boolean) };
  if (rapikan(uji)) isi.uji = rapikan(uji);
  if (pita.some((p) => rapikan(p))) isi.pita = pita.map(rapikan);
  return isi;
}

/** Kebalikannya: nilai awal formulir dari templat tersimpan (atau kosong). */
export const formDariIsi = (isi) => ({ uji: isi?.uji ?? '', rubrik: (isi?.baris ?? []).join('\n'), pita: Array.isArray(isi?.pita) ? isi.pita : ['', '', ''] });

/** Cermin sg_dokumen_templat_simpan: teks galat atau '' bila sah. `isi` = { uji?, baris, pita? } (bentuk yang dikirim ke server). */
export function periksaTemplat({ tahunAjaran, jenis, isi }) {
  const ta = rapikan(tahunAjaran);
  if (!/^\d{4}\/\d{4}$/.test(ta)) return 'Tahun ajaran harus berbentuk 2026/2027.';
  const [a, b] = ta.split('/').map(Number);
  if (b !== a + 1) return 'Tahun ajaran harus berbentuk 2026/2027.';
  if (!INDEKS_SURAT[jenis]) return 'Jenis templat tidak dikenal.';
  if (!isi || typeof isi !== 'object' || Array.isArray(isi) || Object.keys(isi).some((k) => !['uji', 'baris', 'pita'].includes(k))) return 'Bentuk isi templat tidak sah.';
  if ('uji' in isi) {
    if (typeof isi.uji !== 'string') return 'Topik uji harus berupa teks.';
    const u = rapikan(isi.uji);
    if (u.length > 200 || TERLARANG.test(u)) return 'Topik uji maksimal 200 karakter dan tanpa karakter khusus.';
  }
  if (!Array.isArray(isi.baris)) return 'Baris rubrik harus berupa daftar.';
  if (isi.baris.length > 40) return 'Baris rubrik maksimal 40.';
  for (const x of isi.baris) {
    if (typeof x !== 'string') return 'Setiap baris rubrik harus berupa teks.';
    const t = rapikan(x);
    if (t === '' || t.length > 300 || TERLARANG.test(t)) return 'Setiap baris rubrik 1 sampai 300 karakter dan tanpa karakter khusus.';
  }
  if ('pita' in isi && isi.pita !== null) {
    if (!Array.isArray(isi.pita) || isi.pita.length !== 3) return 'Pita nilai harus tiga teks.';
    for (const x of isi.pita) {
      if (typeof x !== 'string') return 'Pita nilai harus berupa teks.';
      const t = rapikan(x);
      if (t.length > 20 || TERLARANG.test(t)) return 'Setiap pita nilai maksimal 20 karakter dan tanpa karakter khusus.';
    }
  }
  return '';
}
