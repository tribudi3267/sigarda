/**
 * JENIS KELAMIN ANGGOTA (murni, tanpa React). Kode 'L' (laki-laki) dan 'P' (perempuan) untuk semua peran. Dijaga oleh uji/jenis-kelamin.mjs.
 * Anggota baru wajib mengisinya (formulir dan import); anggota lama boleh kosong sampai dilengkapi Admin (Ubah anggota, atau "Lengkapi jenis kelamin").
 * Server (sg_anggota_jk_atur) hanya menerima 'L', 'P', atau kosong; penulisan bebas dari Excel dibakukan di sini.
 */
import { urutAlami } from './format';

export const JENIS_KELAMIN = [{ kode: 'L', label: 'Laki-laki' }, { kode: 'P', label: 'Perempuan' }];
export const PESAN_JK = 'Pilih Laki-laki atau Perempuan.';
/** Nilai khusus pada filter: anggota yang jenis kelaminnya belum diisi. */
export const JK_BELUM_DIISI = '-';
export const MAKS_BARIS_JK = 500; // batas sg_anggota_jk_atur per permintaan

const ALIAS = {
  l: 'L', lk: 'L', laki: 'L', lakilaki: 'L', pria: 'L', putra: 'L', cowok: 'L', male: 'L',
  p: 'P', pr: 'P', perempuan: 'P', wanita: 'P', putri: 'P', cewek: 'P', female: 'P',
};

/** "Laki-laki", "laki laki", "L", "Pria" -> 'L'; "Perempuan", "P", "Wanita" -> 'P'; selain itu ''. */
export const normalisasiJenisKelamin = (teks) => ALIAS[String(teks ?? '').toLowerCase().replace(/[^a-z]/g, '')] ?? '';

export const labelJenisKelamin = (kode) => JENIS_KELAMIN.find((j) => j.kode === kode)?.label ?? '';

/** Anggota yang jenis kelaminnya belum diisi (semua peran; akun Admin Gudep ikut). */
export const anggotaTanpaJk = (users) => users.filter((u) => !u.jenisKelamin);

const URUT_PERAN = { peserta: 0, penguji: 1, admin: 2 };
export const labelPeranAnggota = (u) => (u.role === 'peserta' ? 'Penegak' : u.role === 'admin' ? 'Admin Gudep' : u.jabatan ?? 'Pembina');

/** Urutan tampil: Penegak (menurut rombel), lalu Dewan Ambalan, Pembina, Admin; masing-masing menurut nama. */
export const urutAnggotaJk = (daftar) =>
  daftar.slice().sort((a, b) =>
    (URUT_PERAN[a.role] ?? 9) - (URUT_PERAN[b.role] ?? 9)
    || (a.role === 'peserta' ? urutAlami(String(a.kelas ?? ''), String(b.kelas ?? '')) : String(a.jabatan ?? '').localeCompare(String(b.jabatan ?? ''), 'id'))
    || a.nama.localeCompare(b.nama, 'id'));

/**
 * Menilai baris dari Excel "Lengkapi jenis kelamin": [{ no, id (NIS atau nama pengguna), jk }] terhadap daftar pengguna.
 * Hasil per baris: { no, id, nama, jk ('L' | 'P' | ''), userId, username, galat: [pesan], siap }. Baris yang kolom jenis kelaminnya kosong tidak ikut.
 */
export function periksaJkMassal(baris, users) {
  const peta = new Map(users.map((u) => [String(u.username ?? '').toLowerCase(), u]));
  const terlihat = new Set();
  return baris.map((b) => {
    const kunci = String(b.id ?? '').trim().toLowerCase();
    const u = peta.get(kunci);
    const jk = normalisasiJenisKelamin(b.jk);
    const galat = [];
    if (!kunci) galat.push('Nama pengguna atau NIS kosong');
    else if (!u) galat.push('Nama pengguna atau NIS tidak terdaftar');
    else if (terlihat.has(kunci)) galat.push('Muncul lebih dari sekali dalam berkas');
    if (!jk) galat.push(`Jenis kelamin "${b.jk}" tidak dikenal. ${PESAN_JK}`);
    if (!galat.length) terlihat.add(kunci);
    return { no: b.no, id: b.id, nama: u?.nama ?? '', jk, userId: u?.id ?? null, username: u?.username ?? kunci, galat, siap: galat.length === 0 };
  });
}

/** Jumlah laki-laki, perempuan, dan yang belum diisi pada daftar anggota: { L, P, kosong }. */
export const hitungJenisKelamin = (daftar) => ({
  L: daftar.filter((u) => u.jenisKelamin === 'L').length,
  P: daftar.filter((u) => u.jenisKelamin === 'P').length,
  kosong: daftar.filter((u) => !u.jenisKelamin).length,
});
