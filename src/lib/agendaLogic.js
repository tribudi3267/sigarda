/**
 * AGENDA TAHUNAN (tahap L6, murni tanpa React). Cermin syarat di sg_agenda_simpan dan sigarda.agenda_* (SQL), dijaga uji/agenda.mjs.
 * Bentuk satu kegiatan: { id, tahunAjaran, jenis, judul, tanggal, keterangan, pesertaTerkait, lewatiBatas }
 */

import { hariIni as hariIniWib } from './format';
import { tahunAjaranKini } from './rombelLogic';

/** Jenis baku (dengan judul bawaan yang bisa diubah pengguna) + 'lainnya' (judul bebas). Judul bawaan sama dengan
 * sigarda.kegiatan_judul_bawaan (SQL) untuk jenis yang juga didukung alur usulan (lihat JENIS_USULAN di kegiatanLogic.js). */
export const JENIS_AGENDA = [
  { id: 'musyawarah', label: 'Musyawarah Ambalan', judulBawaan: 'Musyawarah Ambalan' },
  { id: 'naik_kelas', label: 'Naik Kelas', judulBawaan: 'Naik Kelas' },
  { id: 'sidang', label: 'Sidang Dewan Kehormatan', judulBawaan: 'Sidang Dewan Kehormatan' },
  { id: 'pelantikan_bantara', label: 'Pembayatan dan Pelantikan Bantara', judulBawaan: 'Pembayatan dan Pelantikan Bantara' },
  { id: 'pelantikan_laksana', label: 'Pelantikan Laksana', judulBawaan: 'Pelantikan Laksana' },
  { id: 'pelantikan_garuda', label: 'Pelantikan Garuda', judulBawaan: 'Pelantikan Garuda' },
  { id: 'pengembaraan', label: 'Pengembaraan', judulBawaan: 'Pengembaraan' },
  { id: 'perkemahan', label: 'Perkemahan', judulBawaan: 'Perkemahan' },
  { id: 'gelora_saka_expo', label: 'Gelora Saka Expo', judulBawaan: 'Gelora Saka Expo' },
  { id: 'gladi_tangguh_1', label: 'Gladi Tangguh 1', judulBawaan: 'Gladi Tangguh 1' },
  { id: 'gladi_tangguh_2', label: 'Gladi Tangguh 2', judulBawaan: 'Gladi Tangguh 2' },
  { id: 'penempuhan_sku_laksana', label: 'Penempuhan SKU Laksana', judulBawaan: 'Penempuhan SKU Laksana' },
  { id: 'ptgd', label: 'PTGD (Penerimaan Tamu Gugus Depan)', judulBawaan: 'PTGD (Penerimaan Tamu Gugus Depan)' },
  { id: 'pembekalan_dewan', label: 'Pembekalan Dewan Ambalan Angkatan Berikutnya', judulBawaan: 'Pembekalan Dewan Ambalan Angkatan Berikutnya' },
  { id: 'lainnya', label: 'Lainnya', judulBawaan: '' },
];
const PETA_JENIS = Object.fromEntries(JENIS_AGENDA.map((j) => [j.id, j]));

export const labelJenisAgenda = (jenis) => PETA_JENIS[jenis]?.label ?? jenis;
export const judulBawaanJenis = (jenis) => PETA_JENIS[jenis]?.judulBawaan ?? '';

/** Batas keras Musyawarah Ambalan: harus sebelum 1 Juli tahun kedua tahun ajaran (ISO date, string). */
export function batasMusyawarah(tahunAjaran) {
  const tahun2 = String(tahunAjaran ?? '').split('/')[1];
  return tahun2 && /^\d{4}$/.test(tahun2) ? `${tahun2}-07-01` : null;
}

/** Aturan isian sama dengan sg_agenda_simpan di SQL. `lewatiBatasBoleh` = pemanggil benar-benar Pembina (server yang menegakkan). */
export function periksaAgenda(a, lewatiBatasBoleh = false) {
  const galat = {};
  if (!/^[0-9]{4}\/[0-9]{4}$/.test(a.tahunAjaran ?? '') || Number(a.tahunAjaran.split('/')[1]) !== Number(a.tahunAjaran.split('/')[0]) + 1) {
    galat.tahunAjaran = 'Tahun ajaran tidak sah. Contoh: 2026/2027.';
  }
  if (!JENIS_AGENDA.some((j) => j.id === a.jenis)) galat.jenis = 'Pilih jenis kegiatan.';
  const judul = String(a.judul ?? '').trim();
  if (!judul) galat.judul = 'Judul wajib diisi.';
  else if (judul.length > 120) galat.judul = 'Maksimal 120 karakter.';
  if (!a.tanggal) galat.tanggal = 'Tanggal wajib diisi.';
  if ((a.keterangan ?? '').length > 500) galat.keterangan = 'Maksimal 500 karakter.';
  const batas = batasMusyawarah(a.tahunAjaran);
  if (a.jenis === 'musyawarah' && a.tanggal && batas && a.tanggal >= batas && !(a.lewatiBatas && lewatiBatasBoleh)) {
    galat.tanggal = `Harus sebelum 1 Juli ${batas.slice(0, 4)} (sebelum Naik Kelas dan tahun ajaran baru).` + (lewatiBatasBoleh ? ' Centang "Lewati batas" bila Dewan Ambalan sudah mengusulkannya.' : ' Hanya Pembina yang dapat melewati batas ini.');
  }
  return galat;
}

/** "H-30", "H-1", "Hari ini", atau "Lewat" (relatif terhadap `hariIni`, ISO date string, bawaan hari ini nyata). */
export function hariMenuju(tanggal, hariIni = hariIniWib()) {
  const selisih = Math.round((new Date(tanggal) - new Date(hariIni)) / 86400000);
  if (selisih < 0) return 'Lewat';
  if (selisih === 0) return 'Hari ini';
  return `H-${selisih}`;
}

/* ------------------------------- Penjadwalan berulang -------------------------------
 * Hanya KLIEN: pengulangan dibuka menjadi beberapa kegiatan biasa (satu baris agenda per tanggal) lalu disimpan satu per satu lewat
 * sg_agenda_simpan, jadi server, pengingat H-30/H-7/H-1, dan RLS tidak berubah. Kegiatan hasil pengulangan berdiri sendiri (ubah
 * atau hapus satu tidak memengaruhi yang lain). */

export const POLA_ULANG = [
  { id: 'sekali', label: 'Sekali (tidak berulang)' },
  { id: 'harian', label: 'Setiap hari (daily)' },
  { id: 'mingguan', label: 'Setiap minggu (weekly)' },
  { id: 'hari_kerja', label: 'Hari kerja, Senin-Jumat (weekday)' },
  { id: 'akhir_pekan', label: 'Akhir pekan, Sabtu-Minggu (weekend)' },
  { id: 'bulanan', label: 'Setiap bulan (monthly)' },
  { id: 'tahunan', label: 'Setiap tahun (yearly)' },
  { id: 'kustom', label: 'Kustom (setiap N hari/minggu/bulan/tahun)' },
];
export const SATUAN_ULANG = [
  { id: 'hari', label: 'hari' }, { id: 'minggu', label: 'minggu' }, { id: 'bulan', label: 'bulan' }, { id: 'tahun', label: 'tahun' },
];
/** Batas jumlah kegiatan dari satu pengulangan (tiap kegiatan = satu permintaan ke server dan satu baris log). */
export const MAKS_ULANG = 60;
export const ULANG_BAWAAN = { pola: 'sekali', interval: 1, satuan: 'minggu', akhir: 'kali', jumlah: 5, sampai: '' };

const MS_HARI = 86400000;
const utc = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const iso = (t) => new Date(t).toISOString().slice(0, 10);
/** Tambah n bulan dari tanggal awal; hari dipotong ke akhir bulan (31 Jan + 1 bulan = 28/29 Feb), dihitung dari tanggal AWAL agar tidak bergeser. */
function tambahBulan(awal, n) {
  const [y, m, d] = awal.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ty = Math.floor(total / 12), tm = total % 12;
  return iso(Date.UTC(ty, tm, Math.min(d, new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate())));
}

/** Deretan tanggal sesudah `mulai` menurut pola (tak berhingga; pemanggil yang berhenti). */
function* calonTanggal(mulai, aturan) {
  const t0 = utc(mulai);
  const n = Math.max(1, Math.floor(Number(aturan.interval) || 1));
  for (let i = 1; ; i++) {
    switch (aturan.pola) {
      case 'harian': yield iso(t0 + i * MS_HARI); break;
      case 'mingguan': yield iso(t0 + i * 7 * MS_HARI); break;
      case 'hari_kerja': { const t = t0 + i * MS_HARI; const h = new Date(t).getUTCDay(); if (h >= 1 && h <= 5) yield iso(t); break; }
      case 'akhir_pekan': { const t = t0 + i * MS_HARI; const h = new Date(t).getUTCDay(); if (h === 0 || h === 6) yield iso(t); break; }
      case 'bulanan': yield tambahBulan(mulai, i); break;
      case 'tahunan': yield tambahBulan(mulai, 12 * i); break;
      case 'kustom':
        if (aturan.satuan === 'hari') yield iso(t0 + n * i * MS_HARI);
        else if (aturan.satuan === 'minggu') yield iso(t0 + n * i * 7 * MS_HARI);
        else if (aturan.satuan === 'bulan') yield tambahBulan(mulai, n * i);
        else yield tambahBulan(mulai, 12 * n * i);
        break;
      default: return;
    }
  }
}

/** Aturan pengulangan yang sah? Mengembalikan { interval, jumlah, sampai } berisi pesan galat. */
export function periksaUlang(aturan, mulai) {
  const galat = {};
  if (!aturan || aturan.pola === 'sekali') return galat;
  if (!POLA_ULANG.some((p) => p.id === aturan.pola)) galat.pola = 'Pilih pola pengulangan.';
  if (aturan.pola === 'kustom') {
    const n = Number(aturan.interval);
    if (!Number.isInteger(n) || n < 1 || n > 365) galat.interval = 'Isi angka bulat 1 sampai 365.';
    if (!SATUAN_ULANG.some((s) => s.id === aturan.satuan)) galat.satuan = 'Pilih satuan.';
  }
  if (aturan.akhir === 'tanggal') {
    if (!aturan.sampai) galat.sampai = 'Tanggal akhir wajib diisi.';
    else if (mulai && aturan.sampai <= mulai) galat.sampai = 'Tanggal akhir harus sesudah tanggal kegiatan pertama.';
  } else {
    const j = Number(aturan.jumlah);
    if (!Number.isInteger(j) || j < 2 || j > MAKS_ULANG) galat.jumlah = `Isi angka bulat 2 sampai ${MAKS_ULANG}.`;
  }
  return galat;
}

/**
 * Menjabarkan tanggal-tanggal kegiatan. Tanggal pertama = `mulai` apa adanya (juga bila bukan hari yang cocok dengan pola);
 * berikutnya mengikuti pola. `terpotong` = daftar dihentikan batas MAKS_ULANG padahal aturan masih memungkinkan lebih banyak.
 */
export function susunTanggalUlang(mulai, aturan) {
  if (!mulai) return { tanggal: [], terpotong: false };
  if (!aturan || aturan.pola === 'sekali' || Object.keys(periksaUlang(aturan, mulai)).length > 0) return { tanggal: [mulai], terpotong: false };
  const sampai = aturan.akhir === 'tanggal' ? aturan.sampai : null;
  const target = sampai ? MAKS_ULANG : Math.min(Number(aturan.jumlah), MAKS_ULANG);
  const tanggal = [mulai];
  let terpotong = !sampai && Number(aturan.jumlah) > MAKS_ULANG;
  for (const t of calonTanggal(mulai, aturan)) {
    if (sampai && t > sampai) break;
    if (t.slice(0, 4) > '2100') break;
    if (tanggal.length >= target) { if (sampai) terpotong = true; break; }
    tanggal.push(t);
    if (!sampai && tanggal.length >= target) break;
  }
  return { tanggal, terpotong };
}

/**
 * Daftar kegiatan yang akan disimpan. Sekali = satu kegiatan apa adanya. Berulang: satu kegiatan per tanggal dan tahun ajaran
 * MENGIKUTI tanggalnya (Juli-Juni), supaya deretan yang melintasi tahun ajaran tetap tercatat pada tahun ajaran yang benar.
 * Mengembalikan { daftar, terpotong, galat } (galat = pesan pertama dari periksaAgenda/periksaUlang, kosong bila sah).
 */
export function bangunSeri(a, aturan, lewatiBatasBoleh = false) {
  const galatUlang = periksaUlang(aturan, a.tanggal);
  if (Object.keys(galatUlang).length > 0) return { daftar: [], terpotong: false, galat: Object.values(galatUlang)[0] };
  if (!aturan || aturan.pola === 'sekali') {
    const g = periksaAgenda(a, lewatiBatasBoleh);
    return { daftar: Object.keys(g).length ? [] : [a], terpotong: false, galat: Object.values(g)[0] ?? '' };
  }
  if (!a.tanggal) return { daftar: [], terpotong: false, galat: 'Tanggal wajib diisi.' };
  const { tanggal, terpotong } = susunTanggalUlang(a.tanggal, aturan);
  const daftar = tanggal.map((t) => ({ ...a, tanggal: t, tahunAjaran: tahunAjaranKini(t) }));
  for (const k of daftar) {
    const g = periksaAgenda(k, lewatiBatasBoleh);
    if (Object.keys(g).length > 0) return { daftar: [], terpotong, galat: `${k.tanggal}: ${Object.values(g)[0]}` };
  }
  return { daftar, terpotong, galat: '' };
}

/** Ringkasan satu kalimat untuk pratinjau pengulangan. */
export function ringkasUlang(aturan, mulai) {
  const { tanggal, terpotong } = susunTanggalUlang(mulai, aturan);
  if (tanggal.length <= 1) return '';
  return `${tanggal.length} kegiatan, ${tanggal[0]} sampai ${tanggal[tanggal.length - 1]}${terpotong ? ` (dibatasi ${MAKS_ULANG} kegiatan)` : ''}.`;
}

/** Kegiatan agenda mendatang (tanggal >= hariIni), terurut tanggal terdekat lebih dulu. */
export const agendaMendatang = (daftar = [], hariIni = hariIniWib()) =>
  daftar.filter((a) => a.tanggal >= hariIni).sort((a, b) => a.tanggal.localeCompare(b.tanggal));
