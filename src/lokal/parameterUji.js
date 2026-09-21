/**
 * PARAMETER UJI MODE LOKAL (tanpa PIN dan tanpa akses basis data): daftar akun contoh untuk tautan masuk cepat, pembacaan parameter alamat, dan pembuat
 * tautan. Sengaja dipisah dari masukCepat.js (yang memuat PIN contoh dan api) supaya halaman masuk hanya membawa daftar nama ini. Lihat masukCepat.js.
 */

/** Akun contoh yang ditawarkan sebagai tautan pada halaman masuk mode lokal. `kunci` = nilai parameter ?masuk=. */
export const AKUN_CEPAT = [
  { kunci: 'admin', label: 'Admin Gudep', username: 'admin' },
  { kunci: 'pembina', label: 'Pembina', username: 'pembina' },
  { kunci: 'dewan', label: 'Dewan Ambalan (akun lama)', username: 'dewan' },
  { kunci: '10231', label: 'Penegak (Ahmad, X-01)', username: '10231' },
  { kunci: '10008', label: 'Penegak berjabatan Dewan (Nadia, Sekretaris)', username: '10008' },
  { kunci: '10007', label: 'Calon Garuda (Bagas, XII-01)', username: '10007' },
];

/** Membaca parameter uji dari `location.search`: { masuk, penuh, ulang }. */
export function bacaParameterUji(search = '') {
  const p = new URLSearchParams(search);
  return { masuk: (p.get('masuk') ?? '').trim().toLowerCase(), penuh: p.get('data') === 'penuh', ulang: p.get('ulang') === '1' };
}

/** Alamat tautan masuk cepat yang mempertahankan pilihan data (mis. ?data=penuh). */
export function alamatMasukCepat(kunci, search = '') {
  const p = new URLSearchParams(search);
  const baru = new URLSearchParams();
  if (p.get('data')) baru.set('data', p.get('data'));
  baru.set('masuk', kunci);
  return `?${baru.toString()}`;
}

