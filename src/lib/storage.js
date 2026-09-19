/**
 * Lapisan penyimpanan. Versi prototipe memakai localStorage.
 * Untuk Supabase/Firebase, ganti isi file ini (lihat README bagian "Pindah ke Supabase").
 *
 * Kunci v2: struktur data berubah (butir SKU resmi, absensi, portofolio Garuda), sehingga
 * data prototipe v1 tidak dibaca lagi dan aplikasi mulai dari data contoh baru.
 */
const KEY_DB = 'sku_bukateja_db_v2';
const KEY_SESI = 'sku_bukateja_sesi_v2';
const KEY_KUNCI = 'sigarda_kunci_login_v1';

const aman = (fn, cadangan = null) => {
  try {
    return fn();
  } catch {
    return cadangan;
  }
};

export const storage = {
  load: () => aman(() => JSON.parse(localStorage.getItem(KEY_DB))),
  save: (db) => aman(() => localStorage.setItem(KEY_DB, JSON.stringify(db))),
  loadSession: () => aman(() => localStorage.getItem(KEY_SESI)),
  saveSession: (id) =>
    aman(() => (id ? localStorage.setItem(KEY_SESI, id) : localStorage.removeItem(KEY_SESI))),
  loadKunci: () => aman(() => JSON.parse(localStorage.getItem(KEY_KUNCI))),
  saveKunci: (kunci) => aman(() => localStorage.setItem(KEY_KUNCI, JSON.stringify(kunci))),
};
