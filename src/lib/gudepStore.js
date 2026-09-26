/**
 * PENYIMPANAN DATA GUDEP DI PERAMBAN
 *
 * Satu salinan data gudep yang dipakai seluruh halaman dan dokumen cetak. Dimulai dari nilai bawaan (src/config.js); saat sambungan ke server
 * siap, identitas publik (nama gudep, ambalan, sekolah, kota) dimuat tanpa login, dan setelah masuk data lengkap (termasuk pejabat dan NTA)
 * dimuat dari pengaturan `gudep.data`. Halaman membaca lewat useGudep() (ikut tampil ulang bila data berubah); kode non-React (mis. ekspor
 * Excel) memakai ambilGudep().
 */
import { createContext, useContext, useSyncExternalStore } from 'react';
import { GUDEP_BAWAAN, gabungGudep } from './gudepLogic';

let sekarang = GUDEP_BAWAAN;
let tersimpan = false; // sudah pernah disimpan Admin? (belum = nilai bawaan dari kode)
const pendengar = new Set();
const umumkan = () => pendengar.forEach((f) => f());
const langgan = (f) => { pendengar.add(f); return () => pendengar.delete(f); };

/** Data gudep saat ini (objek lengkap). */
export const ambilGudep = () => sekarang;

/** Sudah pernah disimpan Admin (data lengkap dimuat dari server)? Belum = nilai bawaan. */
export const gudepTersimpan = () => tersimpan;

/**
 * Mengganti seluruh data dengan `data` (tersimpan di server). Belum pernah disimpan (null) = nilai bawaan; sudah disimpan = hanya isian yang tercatat
 * (isian yang dikosongkan Admin tetap kosong, tidak kembali ke nilai bawaan).
 */
export function setGudep(data) {
  tersimpan = !!data && typeof data === 'object';
  sekarang = tersimpan ? gabungGudep(GUDEP_BAWAAN, data) : GUDEP_BAWAAN;
  umumkan();
}

/** Menimpa sebagian isian (identitas publik sebelum login) tanpa menghapus isian lain yang sudah dimuat. */
export function tambahGudep(sebagian) {
  sekarang = gabungGudep(sekarang, sebagian);
  umumkan();
}

/** Kembali ke nilai bawaan (keluar dari akun): pejabat dan NTA tidak boleh tertinggal di perambah sesudah keluar. */
export function resetGudep() {
  tersimpan = false;
  sekarang = GUDEP_BAWAAN;
  umumkan();
}

/**
 * Konteks penimpa data gudep: salinan beku dokumen (Tahap 3, H3) memasangnya dengan data gudep saat dibekukan, sehingga kop, kota, dan penanda tangan tetap seperti semula
 * walau Data Gudep kemudian diubah. Tanpa penimpa (null), useGudep memakai data terkini.
 */
export const GudepBeku = createContext(null);

/** Hook: data gudep terkini (atau data beku bila dipasang GudepBeku); komponen tampil ulang saat data berubah. */
export const useGudep = () => {
  const beku = useContext(GudepBeku);
  const terkini = useSyncExternalStore(langgan, ambilGudep, ambilGudep);
  return beku ?? terkini;
};

/** Hook: apakah data gudep sudah pernah disimpan Admin. */
export const useGudepTersimpan = () => useSyncExternalStore(langgan, gudepTersimpan, gudepTersimpan);
