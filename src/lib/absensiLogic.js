/**
 * LOGIKA ABSENSI LATIHAN RUTIN JUMAT (murni, tanpa React)
 *
 *   absensi.sesi[tanggal]  = { tanggal, dibuatOleh, dibuatPada }
 *   absensi.hadir[tanggal] = { [pesertaId]: { status: 'H'|'I'|'S'|'A', waktu, oleh } }
 *
 * Absensi HANYA dicatat pengurus (Dewan Ambalan, Pembina, Admin).
 *
 * Tahun ajaran mengikuti kalender sekolah dan dihitung dari tanggal, sehingga berlaku untuk
 * tahun berapa pun: Semester Ganjil Juli sampai Desember, Semester Genap Januari sampai Juni.
 *
 * Aturan hitung: peserta yang belum dicatat pada sebuah sesi berstatus 'B' (belum dicatat)
 * dan TIDAK dihitung pada rekap. Alpa harus dicatat eksplisit. Anggota dapat dicatat pada tanggal
 * berapa pun, termasuk sesi sebelum tanggal mereka didaftarkan di aplikasi (pengisian susulan).
 */
import { hariIni, keIso } from './format';

export const STATUS_ABSEN = {
  H: { label: 'Hadir', kelas: 'bg-emerald-50 text-emerald-800 ring-emerald-300', aktif: 'bg-emerald-600 text-white ring-emerald-600' },
  I: { label: 'Izin', kelas: 'bg-sky-50 text-sky-800 ring-sky-300', aktif: 'bg-sky-600 text-white ring-sky-600' },
  S: { label: 'Sakit', kelas: 'bg-amber-50 text-amber-900 ring-amber-300', aktif: 'bg-amber-500 text-white ring-amber-500' },
  A: { label: 'Alpa', kelas: 'bg-red-50 text-red-800 ring-red-300', aktif: 'bg-red-700 text-white ring-red-700' },
};
export const KODE_STATUS = ['H', 'I', 'S', 'A'];

export const PERIODE = {
  ganjil: 'Semester Ganjil',
  genap: 'Semester Genap',
  setahun: 'Satu Tahun Ajaran',
};

export const absensiKosong = () => ({ sesi: {}, hadir: {} });

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/** Tanggal ISO yang nyata (bukan 2026-02-31) dan berada di tahun 2000-2100. */
export function tanggalValid(iso) {
  if (!POLA_TANGGAL.test(iso ?? '')) return false;
  const d = new Date(`${iso}T00:00:00`);
  const tahun = Number(iso.slice(0, 4));
  return !Number.isNaN(d.getTime()) && keIso(d) === iso && tahun >= 2000 && tahun <= 2100;
}

export const adalahJumat = (iso) => tanggalValid(iso) && new Date(`${iso}T00:00:00`).getDay() === 5;

const fmt = (iso, opsi) => new Date(`${iso}T00:00:00`).toLocaleDateString('id-ID', opsi);
export const namaHari = (iso) => fmt(iso, { weekday: 'long' });
export const namaBulan = (iso) => fmt(iso, { month: 'long' });

export function tahunAjaranDari(iso) {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return m >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

export const periodeDari = (iso) => (Number(iso.slice(5, 7)) >= 7 ? 'ganjil' : 'genap');

export function rentangPeriode(tahunAjaran, periode) {
  const [y1, y2] = tahunAjaran.split('/').map(Number);
  const ganjil = { mulai: `${y1}-07-01`, akhir: `${y1}-12-31` };
  const genap = { mulai: `${y2}-01-01`, akhir: `${y2}-06-30` };
  if (periode === 'ganjil') return ganjil;
  if (periode === 'genap') return genap;
  return { mulai: ganjil.mulai, akhir: genap.akhir };
}

/* ---------------------- Pemuatan kehadiran per semester ----------------------
 * Daftar sesi (satu baris per Jumat) selalu dimuat penuh, tetapi catatan kehadiran (satu baris per anggota per Jumat,
 * jadi ribuan baris per tahun) dimuat per SEMESTER dan hanya bila diperlukan. Sebuah semester dikenali dengan kunci
 * "2026/2027|ganjil". absensi.hadir[tanggal] hanya ada untuk tanggal pada semester yang sudah dimuat.
 */
export const kunciSemester = (tahunAjaran, periode) => `${tahunAjaran}|${periode}`;

/** Kunci semester yang memuat tanggal ini. */
export const semesterDari = (iso) => kunciSemester(tahunAjaranDari(iso), periodeDari(iso));

/** Semester yang harus dimuat untuk sebuah pilihan periode ('setahun' = ganjil dan genap). */
export function daftarSemester(tahunAjaran, periode) {
  const daftar = periode === 'setahun' ? ['ganjil', 'genap'] : [periode];
  return daftar.map((p) => kunciSemester(tahunAjaran, p));
}

export function rentangKunci(kunci) {
  const [ta, periode] = kunci.split('|');
  return rentangPeriode(ta, periode);
}

/**
 * Menyusun absensi baru: `sesi` diganti seluruhnya, kehadiran pada semester-semester `daftarKunci` diganti dengan
 * `hadirBaru`, kehadiran semester lain dibiarkan. Tanggal sesi pada semester itu tanpa catatan menjadi {}.
 */
export function gabungHadirSemester(absensi, sesiBaru, daftarKunci, hadirBaru) {
  const rentang = daftarKunci.map(rentangKunci);
  const dalam = (t) => rentang.some((r) => t >= r.mulai && t <= r.akhir);
  const hadir = {};
  for (const [t, v] of Object.entries(absensi?.hadir ?? {})) if (!dalam(t) && sesiBaru[t]) hadir[t] = v;
  for (const t of Object.keys(sesiBaru)) if (dalam(t)) hadir[t] = hadirBaru[t] ?? {};
  return { sesi: sesiBaru, hadir };
}

/** Hari Jumat terakhir pada atau sebelum tanggal ini. */
export function jumatTerakhir(iso) {
  const d = new Date(`${iso}T00:00:00`);
  while (d.getDay() !== 5) d.setDate(d.getDate() - 1);
  return keIso(d);
}

/** Jumat sebelumnya (arah -1) atau sesudahnya (arah +1), selalu berbeda dari tanggal awal. */
export function jumatBerdekatan(iso, arah) {
  const d = new Date(`${iso}T00:00:00`);
  do d.setDate(d.getDate() + arah);
  while (d.getDay() !== 5);
  return keIso(d);
}

/** Semua hari Jumat pada rentang [mulai, akhir], urut naik. */
export function jumatDalamRentang(mulai, akhir) {
  const hasil = [];
  const d = new Date(`${mulai}T00:00:00`);
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  for (; keIso(d) <= akhir; d.setDate(d.getDate() + 7)) hasil.push(keIso(d));
  return hasil;
}

/**
 * Tahun ajaran yang dapat dipilih: dari yang tertua (data atau 3 tahun ke belakang) sampai
 * 2 tahun ke depan dari hari ini, terbaru dulu. Selalu memuat setiap tahun ajaran yang punya data.
 */
export function daftarTahunAjaran(absensi, sekarang = hariIni()) {
  const awal = (ta) => Number(ta.slice(0, 4));
  const saatIni = awal(tahunAjaranDari(sekarang));
  let dari = saatIni - 3;
  for (const t of Object.keys(absensi?.sesi ?? {})) dari = Math.min(dari, awal(tahunAjaranDari(t)));
  const hasil = [];
  for (let y = saatIni + 2; y >= dari; y -= 1) hasil.push(`${y}/${y + 1}`);
  return hasil;
}

export function sesiPeriode(absensi, tahunAjaran, periode) {
  const { mulai, akhir } = rentangPeriode(tahunAjaran, periode);
  return Object.values(absensi?.sesi ?? {})
    .filter((s) => s.tanggal >= mulai && s.tanggal <= akhir)
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
}

/** 'H' | 'I' | 'S' | 'A' | 'B' (belum dicatat) */
export function statusPeserta(absensi, sesi, peserta) {
  return absensi?.hadir?.[sesi.tanggal]?.[peserta.id]?.status ?? 'B';
}

export function rekapAbsensi(absensi, daftarPeserta, sesiList) {
  return daftarPeserta.map((u) => {
    const hitung = { H: 0, I: 0, S: 0, A: 0 };
    const perSesi = {};
    for (const s of sesiList) {
      const st = statusPeserta(absensi, s, u);
      perSesi[s.tanggal] = st;
      if (st in hitung) hitung[st] += 1;
    }
    const total = hitung.H + hitung.I + hitung.S + hitung.A;
    return { user: u, ...hitung, total, persen: total ? Math.round((hitung.H / total) * 100) : null, perSesi };
  });
}

export function ringkasAbsensi(rekap, sesiList, ambang) {
  const berdata = rekap.filter((r) => r.persen !== null);
  const rata = berdata.length ? Math.round(berdata.reduce((n, r) => n + r.persen, 0) / berdata.length) : null;
  return {
    pertemuan: sesiList.length,
    rata,
    baik: berdata.filter((r) => r.persen >= ambang).length,
    rendah: berdata.filter((r) => r.persen < ambang).length,
  };
}


