/**
 * LENGKAPI TANGGAL LAHIR PENEGAK LEWAT EXCEL (Tahap 2, G4d; murni tanpa React). Untuk Penegak yang sudah terdaftar tetapi tanggal lahirnya belum diisi (data lama, atau import
 * sebelum kolom Tanggal Lahir ada). Penegak yang sudah punya tanggal lahir TIDAK disentuh dari berkas ini (koreksi satu per satu di halaman Kelayakan). Server:
 * sg_tanggal_lahir_impor (semua atau tidak sama sekali, maksimal 500 baris per permintaan). Bentuk isian Excel dibakukan `normalisasiTanggalLahir` (importAnggota.js).
 */
import { urutAlami } from './format';
import { normalisasiTanggalLahir, PESAN_LAHIR } from './importAnggota';
import { periksaTanggalLahir } from './gerbangLogic';

export const MAKS_BARIS_LAHIR = 500; // batas sg_tanggal_lahir_impor per permintaan

/** Penegak aktif yang tanggal lahirnya belum diisi, urut rombel lalu nama. `lahir` = daftar dari useGerbang. */
export const pesertaTanpaLahir = (users = [], lahir = []) => {
  const ada = new Set(lahir.map((l) => l.pesertaId));
  return users
    .filter((u) => u.role === 'peserta' && (u.status ?? 'aktif') === 'aktif' && !ada.has(u.id))
    .sort((a, b) => urutAlami(String(a.kelas ?? ''), String(b.kelas ?? '')) || a.nama.localeCompare(b.nama, 'id'));
};

/**
 * Menilai baris berkas [{ no, id (NIS), tanggal (isian asli) }] terhadap Penegak yang tanggal lahirnya masih kosong.
 * Hasil per baris: { no, id, nama, tanggalAsli, tanggal ('YYYY-MM-DD' atau ''), userId, username, galat: [pesan], siap, dilewati (Penegak sudah punya tanggal lahir) }.
 */
export function periksaLahirMassal(baris, users = [], lahir = [], hari) {
  const peta = new Map(users.filter((u) => u.role === 'peserta').map((u) => [String(u.username ?? '').toLowerCase(), u]));
  const punya = new Set(lahir.map((l) => l.pesertaId));
  const terlihat = new Set();
  return baris.map((b) => {
    const kunci = String(b.id ?? '').trim().toLowerCase();
    const u = peta.get(kunci);
    const tanggal = normalisasiTanggalLahir(b.tanggal);
    const galat = [];
    let dilewati = false;
    if (!kunci) galat.push('NIS kosong');
    else if (!u) galat.push('NIS tidak terdaftar sebagai Penegak');
    else if ((u.status ?? 'aktif') !== 'aktif') galat.push('Penegak tidak aktif');
    else if (terlihat.has(kunci)) galat.push('Muncul lebih dari sekali dalam berkas');
    else if (punya.has(u.id)) dilewati = true;
    if (!tanggal) galat.push(`Tanggal lahir "${b.tanggal}" tidak dikenal. ${PESAN_LAHIR}`);
    else { const p = periksaTanggalLahir({ tanggal, ...(hari ? { hari } : {}) }); if (p) galat.push(p); }
    if (!galat.length) terlihat.add(kunci);
    return { no: b.no, id: b.id, nama: u?.nama ?? '', tanggalAsli: b.tanggal ?? '', tanggal, userId: u?.id ?? null, username: u?.username ?? kunci, galat, siap: galat.length === 0 && !dilewati, dilewati: dilewati && galat.length === 0 };
  });
}
