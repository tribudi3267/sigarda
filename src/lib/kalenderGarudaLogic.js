/**
 * KALENDER TAHAP GARUDA DARI KWARCAB (Tahap 2, G4c; murni tanpa React). Alur mengikuti pedoman Kwarcab Purbalingga 2026: Pembina menguji SPG, Ketua Gudep mengajukan SK tim penilai
 * melalui Kwarran, penilaian dan rekomendasi, portofolio ke Kwarran, penilaian Kwarran, pengiriman ke Kwarcab, verifikasi dan visitasi, iuran gotong royong, pelantikan bersama.
 * Tanggal tiap tahap diisi Pembina atau Admin dari jadwal Kwarcab (server: sg_garuda_tahap_simpan); daftar tahap DIPEGANG BERSAMA dengan SQL (dibandingkan di
 * uji/tim-kalender-klien.mjs; nama tahap juga ada di sigarda.garuda_tahap_label untuk notifikasi). Pengingat (H-7, H-3, H-1, hari-H, berakhir besok) dikirim server, bukan di sini.
 * Tanggal memakai WIB (`hariIni`).
 */
import { hariIni } from './format';

export const TAHAP_GARUDA = [
  { id: 'uji_spg', label: 'Pengujian SPG oleh Pembina', keterangan: '13 butir Syarat Pramuka Garuda diuji dan ditetapkan Pembina.' },
  { id: 'ajukan_tim', label: 'Pengajuan SK tim penilai', keterangan: 'Ketua Gugus Depan mengajukan tim penilai ke Kwarcab melalui Kwarran.' },
  { id: 'ambil_sk', label: 'Pengambilan SK tim penilai', keterangan: 'SK tim penilai diambil di Kwarcab.' },
  { id: 'penilaian_gudep', label: 'Penilaian tim penilai gugus depan', keterangan: 'Tanya jawab panel dan penilaian; menghasilkan rekomendasi.' },
  { id: 'serah_kwarran', label: 'Penyerahan portofolio ke Kwarran', keterangan: 'Satu berkas portofolio per calon.' },
  { id: 'nilai_kwarran', label: 'Penilaian portofolio oleh Kwarran', keterangan: 'Kwarran menilai kelengkapan dan isi portofolio.' },
  { id: 'kirim_kwarcab', label: 'Pengiriman berkas ke Kwarcab', keterangan: 'Kwarran meneruskan berkas ke Kwarcab.' },
  { id: 'verifikasi_visitasi', label: 'Verifikasi dan visitasi Kwarcab', keterangan: 'Portofolio, tes komputer, dan hasta karya.' },
  { id: 'iuran', label: 'Iuran gotong royong', keterangan: 'Iuran Calon Garuda menurut ketentuan Kwarcab.' },
  { id: 'pelantikan', label: 'Pelantikan Pramuka Garuda', keterangan: 'Pelantikan bersama di tingkat Kwarcab.' },
];
export const labelTahap = (id) => TAHAP_GARUDA.find((t) => t.id === id)?.label ?? id;

const rapikan = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const TANDA_TERLARANG = /[\u0000-\u001f\u007f<>]/;
const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/** Cermin validasi sg_garuda_tahap_simpan. Mengembalikan pesan galat atau ''. */
export function periksaTahap({ tahunAjaran, tahap, mulai, akhir = null, catatan = '' }) {
  if (!tahunAjaran || !/^[0-9]{4}\/[0-9]{4}$/.test(tahunAjaran)) return 'Tahun ajaran tidak sah.';
  if (!TAHAP_GARUDA.some((t) => t.id === tahap)) return 'Tahap tidak dikenal.';
  if (!mulai) return 'Tanggal mulai wajib diisi.';
  if (!TANGGAL.test(mulai) || mulai < '2000-01-01' || mulai > '2100-12-31') return 'Tanggal mulai tidak sah.';
  if (akhir && (!TANGGAL.test(akhir) || akhir < mulai || akhir > '2100-12-31')) return 'Tanggal akhir tidak boleh sebelum tanggal mulai.';
  const c = rapikan(catatan);
  if (c.length > 200 || TANDA_TERLARANG.test(c)) return 'Catatan maksimal 200 karakter, tanpa tanda < atau >.';
  return '';
}

/** Status satu tahap terhadap hari ini: 'belum-diatur' | 'akan' | 'berjalan' | 'lewat'. `baris` = { mulai, akhir } atau undefined. */
export function statusTahap(baris, hari = hariIni()) {
  if (!baris) return 'belum-diatur';
  const akhir = baris.akhir ?? baris.mulai;
  if (hari < baris.mulai) return 'akan';
  if (hari > akhir) return 'lewat';
  return 'berjalan';
}

/** Kalender satu tahun ajaran: [{ ...tahap, baris (atau null), status, sisaHari (hari sampai mulai bila 'akan', selain itu null) }] menurut urutan alur. */
export function kalenderGaruda(daftar = [], tahunAjaran, hari = hariIni()) {
  const hitungHari = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
  return TAHAP_GARUDA.map((t) => {
    const baris = daftar.find((d) => d.tahunAjaran === tahunAjaran && d.tahap === t.id) ?? null;
    const status = statusTahap(baris, hari);
    return { ...t, baris, status, sisaHari: status === 'akan' ? hitungHari(hari, baris.mulai) : null };
  });
}

/** Tahap yang sedang berjalan atau paling dekat akan datang (null bila semua sudah lewat atau belum diatur). */
export const tahapBerikut = (kalender) => kalender.filter((k) => k.status === 'berjalan').at(0) ?? kalender.filter((k) => k.status === 'akan').sort((a, b) => a.baris.mulai.localeCompare(b.baris.mulai)).at(0) ?? null;

export const STATUS_TAHAP = {
  'belum-diatur': { label: 'Belum diatur', kelas: 'bg-stone-100 text-stone-700 ring-stone-300' },
  akan: { label: 'Akan datang', kelas: 'bg-sky-50 text-sky-900 ring-sky-300' },
  berjalan: { label: 'Sedang berjalan', kelas: 'bg-amber-50 text-amber-900 ring-amber-300' },
  lewat: { label: 'Selesai', kelas: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
};
