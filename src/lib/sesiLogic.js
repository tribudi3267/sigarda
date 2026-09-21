/**
 * LOGIKA SESI UJIAN (murni, tanpa React)
 *
 * Sesi = jadwal ujian bersama: tanggal, tempat, butir yang diuji, dan daftar peserta. Hasil penilaian tetap dicatat pada progres SKU
 * seperti biasa (lembar penilaian yang sama, dengan tanggal uji awal = tanggal sesi). Papan sesi MENURUNKAN statusnya dari progres:
 *   lulus       dinyatakan lulus pada atau sesudah tanggal sesi
 *   ulang       dinyatakan perlu diulang pada atau sesudah tanggal sesi
 *   sudahLulus  sudah lulus sebelum tanggal sesi (tidak perlu diuji lagi)
 *   proses      ditandai sedang diuji
 *   terkunci    butir Laksana tetapi Bantara peserta belum selesai (belum dapat diuji)
 *   menunggu    belum ada hasil
 */
import { TINGKAT, hurufSub } from '../data/skuData';
import { butirPeserta, getEntry, laksanaTerbuka } from './skuLogic';

export const STATUS_SESI = {
  terjadwal: { label: 'Terjadwal', kelas: 'bg-sky-100 text-sky-900 ring-sky-300' },
  berlangsung: { label: 'Berlangsung', kelas: 'bg-emerald-100 text-emerald-900 ring-emerald-300' },
  selesai: { label: 'Selesai', kelas: 'bg-stone-100 text-stone-700 ring-stone-300' },
};

export const STATUS_TUGAS = {
  menunggu: { label: 'Menunggu', kelas: 'bg-white text-pramuka-700 ring-pramuka-300' },
  proses: { label: 'Sedang diuji', kelas: 'bg-amber-100 text-amber-900 ring-amber-300' },
  lulus: { label: 'Lulus', kelas: 'bg-emerald-100 text-emerald-900 ring-emerald-300' },
  ulang: { label: 'Perlu diulang', kelas: 'bg-red-100 text-red-900 ring-red-300' },
  sudahLulus: { label: 'Sudah lulus sebelumnya', kelas: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  terkunci: { label: 'Bantara belum selesai', kelas: 'bg-stone-100 text-stone-500 ring-stone-200' },
};

/** "BAN-01-ISL-2" -> "BAN-01", "LAK-05" -> "LAK-05". */
export const butirIdDariUnit = (skuId) => String(skuId).split('-').slice(0, 2).join('-');
export const tingkatDariButirId = (butirId) => (String(butirId).startsWith('BAN') ? 'Bantara' : 'Laksana');

/** Semua butir katalog (untuk memilih butir sesi): [{ id, tingkat, no, teks }], Bantara lalu Laksana. */
export const daftarButirKatalog = () =>
  Object.entries(TINGKAT).flatMap(([tingkat, t]) => t.butir.map((b) => ({ id: b.id, tingkat, no: b.no, teks: b.teks ?? 'Sesuai agama yang dianut (diuji per sub-butir)' })));

/** [1,2,3,5] -> "1-3, 5" */
const ringkasNomor = (nomor) => {
  const urut = [...nomor].sort((a, b) => a - b);
  const bagian = [];
  for (let i = 0; i < urut.length; ) {
    let j = i;
    while (j + 1 < urut.length && urut[j + 1] === urut[j] + 1) j += 1;
    bagian.push(j - i >= 2 ? `${urut[i]}-${urut[j]}` : urut.slice(i, j + 1).join(', '));
    i = j + 1;
  }
  return bagian.join(', ');
};

/** Butir sesi untuk dibaca manusia: "Bantara 1-23; Laksana 1, 4". */
export const ringkasButirSesi = (butirIds) =>
  ['Bantara', 'Laksana']
    .map((tingkat) => {
      const nomor = daftarButirKatalog().filter((b) => b.tingkat === tingkat && butirIds.includes(b.id)).map((b) => b.no);
      return nomor.length ? `${tingkat} ${ringkasNomor(nomor)}` : '';
    })
    .filter(Boolean)
    .join('; ');
const singkatTingkat = (tingkat) => (tingkat === 'Bantara' ? 'B' : 'L');
export const labelTugas = (poin) => `${singkatTingkat(poin.tingkat)}${poin.butirNo}${poin.sub ? hurufSub(poin.sub) : ''}`;

function statusTugas(sesi, entry, tingkat, laksanaBuka) {
  const sejakSesi = entry.tanggalUji && entry.tanggalUji >= sesi.tanggal;
  if (entry.status === 'lulus') return sejakSesi ? 'lulus' : 'sudahLulus';
  if (entry.status === 'ulang' && sejakSesi) return 'ulang';
  if (tingkat === 'Laksana' && !laksanaBuka) return 'terkunci';
  if (entry.status === 'proses') return 'proses';
  return 'menunggu';
}

/**
 * Tugas tiap peserta pada sesi: [{ peserta, tugas: [{ poin, tingkat, label, entry, status }] }], urut kelas lalu nama.
 * Butir 1 (agama) menghasilkan satu tugas per sub-butir sesuai agama peserta.
 */
export function tugasSesi(sesi, users, progress) {
  const butirIds = [...sesi.butir].sort((a, b) => tingkatDariButirId(a).localeCompare(tingkatDariButirId(b)) || a.localeCompare(b));
  const hasil = [];
  for (const pid of sesi.peserta) {
    const peserta = users.find((u) => u.id === pid && u.role === 'peserta');
    if (!peserta) continue;
    const laksanaBuka = laksanaTerbuka(progress, peserta);
    const tugas = [];
    for (const butirId of butirIds) {
      const tingkat = tingkatDariButirId(butirId);
      const butir = butirPeserta(tingkat, peserta.agama).find((b) => b.id === butirId);
      if (!butir) continue;
      for (const poin of butir.unit) {
        const entry = getEntry(progress, peserta.id, poin.id);
        tugas.push({ poin, tingkat, label: labelTugas(poin), entry, status: statusTugas(sesi, entry, tingkat, laksanaBuka) });
      }
    }
    hasil.push({ peserta, tugas });
  }
  return hasil.sort((a, b) => (a.peserta.kelas ?? '').localeCompare(b.peserta.kelas ?? '', 'id', { numeric: true }) || a.peserta.nama.localeCompare(b.peserta.nama, 'id'));
}

/**
 * Ringkasan pemantauan. Tugas sesi = butir yang masih harus diuji: tugas terkunci (Bantara belum selesai) dan yang sudah lulus sebelum
 * sesi tidak dihitung. `selesai` = sudah ada hasil pada sesi ini (lulus atau perlu diulang).
 */
export function ringkasSesi(daftar) {
  const r = { total: 0, menunggu: 0, proses: 0, lulus: 0, ulang: 0, sudahLulus: 0, terkunci: 0, peserta: daftar.length, pesertaSelesai: 0 };
  for (const p of daftar) {
    let sisa = 0;
    for (const t of p.tugas) {
      r[t.status] += 1;
      if (t.status !== 'terkunci' && t.status !== 'sudahLulus') r.total += 1;
      if (t.status === 'menunggu' || t.status === 'proses') sisa += 1;
    }
    if (sisa === 0 && p.tugas.some((t) => t.status !== 'terkunci')) r.pesertaSelesai += 1;
  }
  r.selesai = r.lulus + r.ulang;
  r.persen = r.total ? Math.round((r.selesai / r.total) * 100) : 0;
  return r;
}

/** Sesi yang mencantumkan peserta ini dan belum selesai, terdekat dulu. */
export const sesiUntukPeserta = (daftarSesi, pesertaId) =>
  daftarSesi.filter((s) => s.peserta.includes(pesertaId) && s.status !== 'selesai').sort((a, b) => a.tanggal.localeCompare(b.tanggal));

/** Isian sesi dari pengajuan yang menunggu (status diajukan): peserta dan butir-nya. */
export function dariPengajuan(progress, users) {
  const peserta = new Set();
  const butir = new Set();
  for (const u of users) {
    if (u.role !== 'peserta' || (u.status ?? 'aktif') !== 'aktif') continue;
    for (const [skuId, e] of Object.entries(progress[u.id] ?? {})) {
      if (e.status !== 'diajukan') continue;
      peserta.add(u.id);
      butir.add(butirIdDariUnit(skuId));
    }
  }
  return { peserta: [...peserta], butir: [...butir] };
}

/** Pesan galat atau '' untuk isian editor sesi (aturan sama dengan sg_sesi_simpan). */
export function periksaSesi({ nama, tanggal, tempat, catatan, butir, peserta }) {
  if (!String(nama ?? '').trim() || nama.trim().length > 120) return 'Nama sesi wajib diisi (maksimal 120 karakter).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal ?? '')) return 'Isi tanggal sesi.';
  if (String(tempat ?? '').trim().length > 120) return 'Tempat maksimal 120 karakter.';
  if (String(catatan ?? '').length > 500) return 'Catatan maksimal 500 karakter.';
  if (!butir.length) return 'Pilih minimal satu butir.';
  if (butir.length > 60) return 'Butir maksimal 60 per sesi.';
  if (!peserta.length) return 'Pilih minimal satu peserta.';
  if (peserta.length > 300) return 'Peserta maksimal 300 per sesi.';
  return '';
}
