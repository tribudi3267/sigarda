/**
 * DAFTAR HADIR LATIHAN SETELAH PELANTIKAN LAKSANA (Tahap 4; murni tanpa React). Syarat Garuda butir 2: menyelesaikan SKU Laksana dan berlatih sekurang-kurangnya tiga bulan
 * setelah terlantik. Pedoman Kwarcab Purbalingga 2026 meminta lampiran "daftar hadir latihan 3 bulan setelah dilantik Penegak Laksana" (3 bulan / 12 kali latihan, kertas A4).
 * Di sini daftar itu disusun dari sesi latihan dan kehadiran yang sudah tercatat: sesi sesudah tanggal pelantikan sampai tiga bulan kemudian (paling banyak 12, sampai hari ini).
 * Hanya keterangan bagi Pembina (tidak mengubah penetapan butir 2) dan lampiran cetak.
 */
import { hariIni } from './format';
import { tambahBulan } from './spgLogic';

export const JUMLAH_LATIHAN = 12;
export const BULAN_LATIHAN = 3;

/** Rentang tanggal yang perlu dimuat kehadirannya: dari tanggal pelantikan Laksana sampai tiga bulan sesudahnya. */
export const rentangLatihan = (tanggalLaksana) => (tanggalLaksana ? { mulai: tanggalLaksana, akhir: tambahBulan(tanggalLaksana, BULAN_LATIHAN) } : null);

/**
 * Daftar latihan satu Penegak. `sesi` = objek { [tanggal]: ... } atau daftar tanggal; `hadir` = { [tanggal]: { [pesertaId]: { status: 'H'|'I'|'S'|'A' } } }.
 * Hasil (null bila belum dilantik Laksana): { mulai, akhir, latihan: [{ tanggal, status ('H'|'I'|'S'|'A' | null bila belum tercatat) }], total, hadir, izin, sakit, alpa, belumTercatat, lengkap (total sama dengan JUMLAH_LATIHAN) }.
 */
export function daftarLatihanLaksana({ sesi = {}, hadir = {}, pesertaId, tanggalLaksana, hari = hariIni() }) {
  const r = rentangLatihan(tanggalLaksana);
  if (!r) return null;
  const tanggal = (Array.isArray(sesi) ? sesi : Object.keys(sesi)).filter((d) => d > r.mulai && d <= r.akhir && d <= hari).sort().slice(0, JUMLAH_LATIHAN);
  const latihan = tanggal.map((d) => ({ tanggal: d, status: hadir?.[d]?.[pesertaId]?.status ?? null }));
  const hitung = (k) => latihan.filter((l) => l.status === k).length;
  return {
    ...r, latihan, total: latihan.length, hadir: hitung('H'), izin: hitung('I'), sakit: hitung('S'), alpa: hitung('A'), belumTercatat: latihan.filter((l) => l.status === null).length,
    lengkap: latihan.length === JUMLAH_LATIHAN,
  };
}

/** Ringkasan satu baris untuk butir 2 SPG: "Hadir 10 dari 12 latihan sejak pelantikan Laksana". */
export const teksLatihan = (d) => (d ? `Hadir ${d.hadir} dari ${d.total} latihan${d.total < JUMLAH_LATIHAN ? ` (baru ${d.total} dari ${JUMLAH_LATIHAN} latihan yang seharusnya ada dalam ${BULAN_LATIHAN} bulan)` : ''} sejak pelantikan Laksana.` : '');
