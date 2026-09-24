/**
 * HAK (murni tanpa React): satu-satunya tempat predikat peran di klien. Setiap fungsi mencerminkan fungsi SQL bernama sama di skema `sigarda`
 * (dijaga uji/paritas-hak.mjs, yang membandingkan hasilnya dengan server untuk banyak kombinasi peran, jabatan Dewan, dan status).
 * Hanya untuk menyembunyikan tombol dan menu; server tetap menegakkan hak dari data akun. Bentuk masukan = pengguna klien
 * ({ role, jabatan, jabatanDewan, status }); `status` kosong dianggap 'aktif'. Tidak memeriksa wajib ganti PIN (aplikasi memaksa ganti PIN lebih dulu).
 *
 * Perhatikan: `user` di AppContext = pengguna MENURUT TAMPILAN (Penegak berjabatan dalam tampilan Dewan berperan 'penguji'); hak yang
 * diberikan tampilan tidak pernah melebihi hak akun (uji paritas menegaskannya).
 */

const aktif = (u) => (u.status ?? 'aktif') === 'aktif';

/** Pembina atau Admin Gudep (sigarda.pembina_atau_admin dan sigarda.kelola_materi; server tidak memeriksa status untuk keduanya). */
export const pembinaAtauAdmin = (u) => !!u && (u.role === 'admin' || (u.role === 'penguji' && u.jabatan === 'Pembina'));

/** Hanya Pembina aktif, bukan Admin (sigarda.pembina_saja). */
export const pembinaSaja = (u) => !!u && u.role === 'penguji' && u.jabatan === 'Pembina' && aktif(u);

/** Pengurus: penguji dan Admin aktif, atau Penegak aktif berjabatan Dewan (sigarda.pengurus). */
export const pengurus = (u) => !!u && aktif(u) && (u.role === 'penguji' || u.role === 'admin' || (u.role === 'peserta' && !!u.jabatanDewan));

/** Dewan Ambalan: akun Dewan lama aktif, atau Penegak aktif berjabatan Dewan (sigarda.dewan). */
export const dewan = (u) => !!u && aktif(u) && ((u.role === 'penguji' && u.jabatan === 'Dewan Ambalan') || (u.role === 'peserta' && !!u.jabatanDewan));

/** Pradana atau Pradani aktif: Penegak berjabatan itu atau akun Dewan lama yang masih menjabat itu (sigarda.pradana_atau_pradani). */
export const pradanaAtauPradani = (u) =>
  !!u && aktif(u) && (u.role === 'peserta' || (u.role === 'penguji' && u.jabatan === 'Dewan Ambalan')) && ['Pradana', 'Pradani'].includes(u.jabatanDewan);
