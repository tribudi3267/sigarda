/**
 * MASUK CEPAT TANPA PIN (khusus mode lokal `npm run dev:lokal`; TIDAK ikut build produksi karena hanya dimuat bootLokal).
 *
 * Untuk pengujian: alamat `/?masuk=pembina` langsung memasukkan akun contoh tanpa mengetik PIN dan tanpa wajib ganti PIN. Ini bukan celah keamanan
 * Supabase: hanya ada pada backend lokal (Postgres di browser dengan data fiktif). Parameter lain:
 *   ?data=penuh   memakai basis data lokal terpisah berisi data sekolah penuh (ratusan Penegak; lihat sekolahPenuh.js), dibuat sekali lalu diingat
 *   ?ulang=1      menghapus basis data yang dipakai lalu membuatnya lagi dari awal
 * Contoh: /?data=penuh&masuk=pembina
 */
import { buatApi } from '../lib/api';
import { PIN_DEMO } from './pinDemo';

// Daftar akun, pembacaan parameter, dan pembuat tautan ada di parameterUji.js (tanpa PIN dan tanpa api; itu yang dimuat halaman masuk).
export { AKUN_CEPAT, alamatMasukCepat, bacaParameterUji } from './parameterUji';

/** PIN contoh menurut peran akun (semua akun contoh dan akun massal sekolah penuh memakai PIN contoh perannya). */
const pinMenurutPeran = (p) => (p.role === 'admin' ? PIN_DEMO.admin : p.role === 'peserta' ? PIN_DEMO.penegak : p.jabatan === 'Pembina' ? PIN_DEMO.pembina : PIN_DEMO.dewan);

/**
 * Memasukkan akun `nama` (nama pengguna atau NIS) ke klien lokal. Akun itu dibebaskan dari wajib ganti PIN lebih dulu.
 * Mengembalikan { ok, id } atau { ok: false, pesan }.
 */
export async function masukCepat(pg, klien, nama) {
  const baris = (await pg.query('select id, role, jabatan from public.profiles where username = $1', [nama])).rows[0];
  if (!baris) return { ok: false, pesan: `Akun "${nama}" tidak ada pada data lokal ini.` };
  await pg.query('update public.profiles set wajib_ganti_pin = false where id = $1', [baris.id]);
  return buatApi(klien).masuk(nama, pinMenurutPeran(baris));
}
