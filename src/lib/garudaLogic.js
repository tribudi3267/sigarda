/**
 * BERKAS CALON GARUDA (tahap L7, murni tanpa React). Tautan berbagi baca-saja (tanpa login) dari sg_garuda_token_buat:
 *   https://<alamat aplikasi>/?berkas=<32 heksadesimal>
 * Halaman itu dapat dibuka tanpa login dan memanggil sg_garuda_token_baca. BEDA dari verifikasiLogic.js (?v=<token>):
 * token di sini memberi akses BACA ISI LENGKAP berkas, bukan sekadar ringkasan pembuktian keaslian.
 */
import { alamatDasar } from './verifikasiLogic';

export { alamatDasar };

export const urlBerkasGaruda = (token, dasar = alamatDasar()) => `${dasar}?berkas=${token}`;

/** Nilai parameter `berkas` pada alamat (string, mungkin kosong) atau null bila tidak ada. */
export function parameterBerkasGaruda(search) {
  const p = new URLSearchParams(search ?? '');
  return p.has('berkas') ? (p.get('berkas') ?? '').trim() : null;
}
