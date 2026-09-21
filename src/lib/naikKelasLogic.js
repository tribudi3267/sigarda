/**
 * STATUS ANGGOTA DAN NAIK KELAS (fase 6a). Logika murni; server (sg_naik_kelas) memeriksa ulang semuanya dan menjadi penentu.
 *
 * Status Penegak: 'aktif' (masih ikut Pramuka dan pengujian), 'nonaktif' (masih siswa tetapi tidak melanjutkan Pramuka), 'alumni' (sudah lulus).
 * Nonaktif dan alumni hanya dapat DILIHAT dan dicetak. Nonaktif menjadi alumni saat kelulusan kelas XII.
 *
 * Kenaikan kelas: satu berkas/tabel untuk seluruh Penegak yang belum alumni. Tiap baris punya Rombel baru dan Aksi:
 *   Lanjut (aktif di rombel baru), Tidak lanjut (nonaktif; rombel baru boleh kosong = rombel terakhir tetap), Lulus (alumni).
 * Bawaan (`bangunBaris`): kelas X = Tidak lanjut (komposisi rombel berubah dan hanya sebagian yang melanjutkan; Admin menandai yang lanjut),
 * kelas XI aktif = Lanjut ke XII dengan nomor rombel yang sama (komposisi rombel tetap), kelas XI nonaktif = Tidak lanjut, kelas XII = Lulus.
 */
import { normalisasiRombel, rombelSah, tahunAjaranKini, geserTahunAjaran } from './rombelLogic';
import { hariIni, urutAlami } from './format';

export const STATUS_ANGGOTA = ['aktif', 'nonaktif', 'alumni'];
export const LABEL_STATUS = { aktif: 'Aktif', nonaktif: 'Nonaktif', alumni: 'Alumni' };
export const KETERANGAN_STATUS = {
  aktif: 'Masih mengikuti Pramuka dan pengujian SKU.',
  nonaktif: 'Masih siswa tetapi tidak melanjutkan Pramuka. Hanya dapat dilihat; menjadi alumni saat lulus kelas XII.',
  alumni: 'Sudah lulus. Hanya dapat dilihat dan dicetak.',
};
export const statusAnggota = (u) => u?.status ?? 'aktif';
export const labelStatus = (u) => LABEL_STATUS[statusAnggota(u)] ?? 'Aktif';
/** Penegak yang aktif (belum status lain). Akun selain Penegak dianggap aktif. */
export const anggotaAktif = (u) => statusAnggota(u) === 'aktif';
export const hanyaLihat = (u) => u?.role === 'peserta' && !anggotaAktif(u);

/** Tingkat kelas dari rombel baku: X = 1, XI = 2, XII = 3; null bila bukan rombel baku (cermin sigarda.tingkat_rombel). */
export const tingkatRombel = (rombel) => (rombelSah(rombel) ? ['X', 'XI', 'XII'].indexOf(String(rombel).split('-')[0]) + 1 : null);

/** Tahun ajaran yang baru dimulai. Sebelum Juli (mis. Mei) = tahun ajaran depan; Juli dan sesudahnya = yang sedang berjalan. */
export const tahunAjaranBaruBawaan = (tanggalIso) => {
  const tgl = tanggalIso ?? hariIni();
  const ta = tahunAjaranKini(tgl);
  const bulan = Number(String(tgl).slice(5, 7));
  return bulan >= 1 && bulan <= 6 ? geserTahunAjaran(ta, 1) : ta;
};

/** Tahun ajaran kelulusan bagi alumni yang diluluskan saat tahun ajaran `ta` dimulai (cermin server: tahun ajaran sebelumnya). */
export const tahunLulus = (ta) => geserTahunAjaran(ta, -1);

export const AKSI = ['lanjut', 'tidak_lanjut', 'lulus'];
export const LABEL_AKSI = { lanjut: 'Lanjut', tidak_lanjut: 'Tidak lanjut', lulus: 'Lulus' };
export const LABEL_AKSI_CATAT = { lanjut: 'Naik/lanjut', tidak_lanjut: 'Tidak lanjut', lulus: 'Lulus', aktifkan: 'Diaktifkan kembali', nonaktifkan: 'Dinonaktifkan' };

const hurufSaja = (t) => String(t ?? '').toLowerCase().replace(/[^a-z]/g, '');
/**
 * Mengenali isian Aksi dari Excel atau layar: '' (kosong), 'lanjut', 'tidak_lanjut', 'lulus'; null bila tidak dikenal.
 * Dikenali: Lanjut/Ya/Y/Naik/Aktif; Tidak lanjut/Tidak/T/Berhenti/Nonaktif; Lulus/Alumni.
 */
export function normalisasiAksi(teks) {
  const k = hurufSaja(teks);
  if (!k) return '';
  if (['lanjut', 'ya', 'y', 'naik', 'aktif', 'melanjutkan'].includes(k)) return 'lanjut';
  if (['tidaklanjut', 'tidak', 't', 'berhenti', 'nonaktif', 'tidakmelanjutkan', 'arsip'].includes(k)) return 'tidak_lanjut';
  if (['lulus', 'alumni'].includes(k)) return 'lulus';
  return null;
}

/** Rombel tujuan bawaan bagi Penegak kelas XI aktif: XII dengan nomor yang sama (komposisi rombel XI ke XII tidak berubah). */
export const rombelLanjutanSama = (rombel) => (rombel && String(rombel).startsWith('XI-') ? `XII-${String(rombel).split('-')[1]}` : '');

/**
 * Baris kenaikan kelas untuk seluruh Penegak yang belum alumni, urut kelas lalu nama, dengan isian bawaan (lihat komentar berkas).
 * Bentuk: { id, nis, username, nama, rombelSekarang, statusSekarang, rombelBaru, aksi }.
 */
export function bangunBaris(users) {
  return users
    .filter((u) => u.role === 'peserta' && statusAnggota(u) !== 'alumni')
    .slice()
    .sort((a, b) => urutAlami(String(a.kelas ?? ''), String(b.kelas ?? '')) || a.nama.localeCompare(b.nama, 'id'))
    .map((u) => {
      const tk = tingkatRombel(u.kelas);
      const nonaktif = statusAnggota(u) === 'nonaktif';
      let aksi = ''; let rombelBaru = '';
      if (tk === 3) aksi = 'lulus';
      else if (tk === 2 && !nonaktif) { aksi = 'lanjut'; rombelBaru = rombelLanjutanSama(u.kelas); }
      else if (tk === 1 || tk === 2) aksi = 'tidak_lanjut';
      return { id: u.id, nis: String(u.nis ?? u.username ?? ''), username: String(u.username ?? u.nis ?? ''), nama: u.nama, rombelSekarang: u.kelas ?? '', statusSekarang: statusAnggota(u), rombelBaru, aksi };
    });
}

/**
 * Baris layar -> permintaan ke server, hanya baris yang aksinya terisi (baris kosong dilewati). Rombel dibakukan (xi 3 -> XI-03).
 * Rombel yang tidak dapat dibakukan dikirim apa adanya agar server melaporkannya.
 */
export function susunPermintaan(baris) {
  return baris
    .filter((b) => b.aksi)
    .map((b) => ({ username: b.username, rombel: b.rombelBaru ? normalisasiRombel(b.rombelBaru) || String(b.rombelBaru).trim() : '', aksi: b.aksi }));
}

/**
 * Menggabungkan baris dari berkas Excel [{ no, nis, rombel, aksi }] ke baris layar. Hasil: { baris, dilewati: [{ no, pesan }], terisi }.
 * NIS yang tidak ada di layar (alumni, atau salah ketik) dilewati dengan pesan; aksi yang tidak dikenal dilewati; baris tanpa aksi dan tanpa rombel dilewati diam-diam.
 */
export function gabungkanBerkas(baris, dariBerkas) {
  const peta = new Map(baris.map((b) => [b.nis.toLowerCase(), b]));
  const hasil = new Map();
  const dilewati = [];
  for (const x of dariBerkas) {
    const nis = String(x.nis ?? '').trim().toLowerCase();
    const aksi = normalisasiAksi(x.aksi);
    if (!nis) { dilewati.push({ no: x.no, pesan: 'NIS kosong.' }); continue; }
    const asal = peta.get(nis);
    if (!asal) { dilewati.push({ no: x.no, pesan: `NIS ${x.nis} tidak ditemukan di daftar (sudah alumni atau salah ketik).` }); continue; }
    if (aksi === null) { dilewati.push({ no: x.no, pesan: `${asal.nama}: Aksi "${x.aksi}" tidak dikenal (gunakan Lanjut, Tidak lanjut, atau Lulus).` }); continue; }
    if (hasil.has(nis)) { dilewati.push({ no: x.no, pesan: `${asal.nama}: NIS muncul lebih dari sekali dalam berkas.` }); continue; }
    if (!aksi && !x.rombel) continue; // tidak diisi = dibiarkan seperti bawaan layar
    hasil.set(nis, { ...asal, aksi: aksi || asal.aksi, rombelBaru: x.rombel ? String(x.rombel).trim() : asal.rombelBaru });
  }
  return { baris: baris.map((b) => hasil.get(b.nis.toLowerCase()) ?? b), dilewati, terisi: hasil.size };
}

/** Ringkasan tampilan dari hasil server: ['Lanjut 3', 'Tidak lanjut 200', ...]. */
export const ringkasanTeks = (r) => {
  if (!r) return [];
  const t = [];
  if (r.lanjut) t.push(`${r.lanjut} lanjut`);
  if (r.tidak_lanjut) t.push(`${r.tidak_lanjut} tidak lanjut (nonaktif)`);
  if (r.lulus) t.push(`${r.lulus} lulus (alumni)`);
  if (r.sama) t.push(`${r.sama} tanpa perubahan`);
  return t;
};

/** Daftar anggota per status untuk kartu ringkas: { aktif, nonaktif, alumni } dari Penegak. */
export const hitungStatus = (users) => {
  const h = { aktif: 0, nonaktif: 0, alumni: 0 };
  for (const u of users) if (u.role === 'peserta') h[statusAnggota(u)] += 1;
  return h;
};
