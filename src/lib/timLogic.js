/**
 * TIM PENILAI CALON GARUDA (Tahap 2, G4b; murni tanpa React). Server yang menegakkan pencatatan (sg_tim_penilai_simpan, sg_tim_penilai_hapus; hanya Pembina dan Admin); di sini:
 * cermin validasi isian (DIBANDINGKAN LANGSUNG dengan SQL pada kisi masukan di uji/tim-kalender-klien.mjs), peringatan komposisi (hanya peringatan, tidak memblokir), dan tim mana
 * yang menilai seorang Calon. Aturan komposisi mengikuti pedoman Kwarcab Purbalingga 2026: tim dibentuk dengan SK Kwarcab, putra dan putri terpisah; anggotanya Ketua Gudep
 * (bukan Ka Mabigus sebagai ketua tim), Pembina Gudep, Andalan Ranting urusan Penegak, tokoh masyarakat, dan orang tua (ayah untuk putra, ibu untuk putri); lembar penilaian
 * bertanda tangan lima penilai. Tanggal memakai WIB (`hariIni`), sama dengan sigarda.hari_ini().
 */
import { hariIni } from './format';

export const UNTUK_TIM = [{ id: 'putra', label: 'Putra' }, { id: 'putri', label: 'Putri' }];
export const UNSUR_TIM = [
  { id: 'ketua_gudep', label: 'Ketua Gugus Depan' },
  { id: 'pembina', label: 'Pembina Gugus Depan' },
  { id: 'andalan_ranting', label: 'Andalan Ranting (urusan Penegak)' },
  { id: 'tokoh_masyarakat', label: 'Tokoh masyarakat' },
  { id: 'orang_tua', label: 'Orang tua' },
  { id: 'lainnya', label: 'Lainnya' },
];
export const labelUnsur = (id) => UNSUR_TIM.find((u) => u.id === id)?.label ?? id;
export const labelUntuk = (id) => UNTUK_TIM.find((u) => u.id === id)?.label ?? id;
export const MAKS_ANGGOTA_TIM = 15;
/** Jumlah penandatangan pada lembar penilaian tim (form Kwarcab). */
export const ANGGOTA_MINIMAL_LEMBAR = 5;

const rapikan = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const TANDA_TERLARANG = /[\u0000-\u001f\u007f<>]/;
const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;
const urlSah = (u) => !u || (/^https?:\/\//i.test(u) && u.length <= 500 && !/[\u0000-\u001f\u007f\s<>]/.test(u));

/** Cermin validasi sg_tim_penilai_simpan. `anggota` = [{ nama, unsur, jabatan ('ketua'|'anggota'), keterangan }]. Mengembalikan pesan galat atau ''. */
export function periksaTim({ tahunAjaran, untuk, nomorSk = '', tanggalSk = null, skUrl = '', catatan = '', anggota, hari = hariIni() }) {
  if (!tahunAjaran || !/^[0-9]{4}\/[0-9]{4}$/.test(tahunAjaran)) return 'Tahun ajaran tidak sah.';
  if (untuk !== 'putra' && untuk !== 'putri') return 'Tim penilai harus untuk putra atau putri.';
  const nomor = rapikan(nomorSk);
  if (nomor.length > 80 || TANDA_TERLARANG.test(nomor)) return 'Nomor SK maksimal 80 karakter, tanpa tanda < atau >.';
  if ((nomor === '') !== !tanggalSk) return 'Nomor SK dan tanggal SK diisi berpasangan (keduanya atau tidak sama sekali).';
  if (tanggalSk && (!TANGGAL.test(tanggalSk) || tanggalSk < '2000-01-01' || tanggalSk > hari)) return 'Tanggal SK tidak boleh sebelum tahun 2000 atau di masa depan.';
  if (!urlSah(String(skUrl ?? '').trim())) return 'Tautan SK harus berawalan http:// atau https:// (maksimal 500 karakter, tanpa spasi).';
  const cat = rapikan(catatan);
  if (cat.length > 300 || TANDA_TERLARANG.test(cat)) return 'Catatan maksimal 300 karakter, tanpa tanda < atau >.';
  if (!Array.isArray(anggota) || anggota.length < 1 || anggota.length > MAKS_ANGGOTA_TIM) return 'Isi 1 sampai 15 anggota tim penilai.';
  let ketua = 0;
  for (let i = 0; i < anggota.length; i += 1) {
    const a = anggota[i];
    const n = i + 1;
    if (!a || typeof a !== 'object' || Array.isArray(a)) return `Anggota tim nomor ${n} tidak sah.`;
    const nama = rapikan(a.nama);
    const jabatan = a.jabatan ?? 'anggota';
    if (nama.length < 1 || nama.length > 80 || TANDA_TERLARANG.test(nama)) return `Nama anggota tim nomor ${n} wajib diisi (maksimal 80 karakter, tanpa tanda < atau >).`;
    if (!UNSUR_TIM.some((u) => u.id === (a.unsur ?? ''))) return `Unsur anggota tim nomor ${n} tidak dikenal.`;
    if (jabatan !== 'ketua' && jabatan !== 'anggota') return `Jabatan anggota tim nomor ${n} harus ketua atau anggota.`;
    const ket = rapikan(a.keterangan);
    if (ket.length > 120 || TANDA_TERLARANG.test(ket)) return `Keterangan anggota tim nomor ${n} maksimal 120 karakter, tanpa tanda < atau >.`;
    if (jabatan === 'ketua') ketua += 1;
  }
  if (ketua > 1) return 'Tim penilai hanya boleh punya satu ketua.';
  return '';
}

/**
 * Peringatan komposisi satu tim (hanya peringatan): [teks]. `tim` = { untuk, nomorSk, anggota: [{ unsur, jabatan, keterangan }] }.
 */
export function peringatanTim(tim) {
  const w = [];
  const a = tim.anggota ?? [];
  if (!tim.nomorSk) w.push('Nomor dan tanggal SK Kwarcab belum dicatat.');
  if (a.length < ANGGOTA_MINIMAL_LEMBAR) w.push(`Lembar penilaian meminta ${ANGGOTA_MINIMAL_LEMBAR} penandatangan; baru ${a.length} anggota.`);
  if (!a.some((x) => x.unsur === 'ketua_gudep')) w.push('Belum ada Ketua Gugus Depan.');
  if (!a.some((x) => x.jabatan === 'ketua')) w.push('Belum ada ketua tim (Ketua Gugus Depan, bukan Ka Mabigus).');
  if (!a.some((x) => x.unsur === 'pembina')) w.push('Belum ada Pembina Gugus Depan.');
  if (!a.some((x) => x.unsur === 'andalan_ranting')) w.push('Belum ada Andalan Ranting urusan Penegak.');
  if (!a.some((x) => x.unsur === 'tokoh_masyarakat')) w.push('Belum ada tokoh masyarakat.');
  if (!a.some((x) => x.unsur === 'orang_tua')) w.push(`Belum ada orang tua (${tim.untuk === 'putri' ? 'ibu' : 'ayah'} untuk tim ${tim.untuk}).`);
  return w;
}

/** Tim yang menilai seorang Calon (menurut jenis kelamin 'L' | 'P') pada tahun ajaran itu, atau null. */
export const timUntukCalon = (daftarTim = [], tahunAjaran, jenisKelamin) => {
  const untuk = jenisKelamin === 'P' ? 'putri' : jenisKelamin === 'L' ? 'putra' : null;
  return untuk ? daftarTim.find((t) => t.tahunAjaran === tahunAjaran && t.untuk === untuk) ?? null : null;
};
