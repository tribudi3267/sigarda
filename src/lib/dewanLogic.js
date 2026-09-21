/**
 * JABATAN DEWAN AMBALAN (murni, tanpa React)
 *
 * Anggota Dewan Ambalan boleh diberi jabatan (kolom profiles.jabatan_dewan, diatur Admin lewat sg_anggota_jabatan_dewan_atur). Pradana dan Pradani
 * masing-masing hanya satu pemegang: Pradana menjadi ketua sidang pada Berita Acara; Pradana dan Pradani menandatangani Surat Tanda Lulus.
 * Nama dan NTA mereka diambil dari akun anggota (bukan diketik ulang di Data Gudep). Aturan di sini dicerminkan di SQL (dijaga pengujian).
 */

export const JABATAN_DEWAN = ['Pradana', 'Pradani', 'Wakil Pradana', 'Wakil Pradani', 'Sekretaris', 'Bendahara'];
/** Jabatan yang hanya boleh dipegang satu anggota. */
export const JABATAN_TUNGGAL = ['Pradana', 'Pradani'];

export const jabatanDewanSah = (j) => j === '' || j == null || JABATAN_DEWAN.includes(j);
const hurufSaja = (t) => String(t ?? '').toLowerCase().replace(/[^a-z]/g, '');
/** "wakil pradana" atau "Wakil-Pradana" menjadi "Wakil Pradana"; tidak dikenal = ''. */
export const normalisasiJabatanDewan = (teks) => JABATAN_DEWAN.find((j) => hurufSaja(j) === hurufSaja(teks)) ?? '';
const rapikan = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const dewan = (u) => u.role === 'penguji' && u.jabatan === 'Dewan Ambalan';

/** "Pradana Dewan Ambalan" / "Pradani Dewan Ambalan": sebutan pada tanda tangan dokumen. */
export const sebutanPejabat = (jabatan) => `${jabatan} Dewan Ambalan`;

/**
 * Pradana dan Pradani dari daftar anggota: { pradana, pradani }, masing-masing { id, jabatan (sebutan), nama, nta }.
 * Belum ada pemegang: nama dan NTA kosong (dokumen mencetak garis untuk diisi tangan).
 */
export function pejabatDewan(users) {
  const buat = (jabatan) => {
    const u = (users ?? []).find((x) => dewan(x) && x.jabatanDewan === jabatan);
    return { id: u?.id ?? null, jabatan: sebutanPejabat(jabatan), nama: u?.nama ?? '', nta: u?.nta ?? '' };
  };
  return { pradana: buat('Pradana'), pradani: buat('Pradani') };
}

/**
 * Pimpinan Dewan yang menandatangani Surat Tanda Lulus: Pradana dan/atau Pradani yang terisi (keduanya bila kedua jabatan ada pemegangnya).
 * Belum ada yang terisi: cukup Pradana (dicetak garis).
 */
export const penandaTanganDewan = (pejabat) => {
  const terisi = [pejabat.pradana, pejabat.pradani].filter((o) => o.nama);
  return terisi.length ? terisi : [pejabat.pradana];
};

/**
 * Ketua sidang untuk Berita Acara = Pradana (nama dan sebutan). Cermin sigarda.ketua_sidang: belum ada Pradana = pengaturan lama sidang
 * (`namaLama`, `sebutanLama`; sebutanLama sudah membawa bawaannya).
 */
export function ketuaSidang(pejabat, { namaLama = '', sebutanLama = '' } = {}) {
  if (pejabat?.pradana?.nama) return { nama: rapikan(pejabat.pradana.nama), sebutan: pejabat.pradana.jabatan };
  return { nama: rapikan(namaLama), sebutan: rapikan(sebutanLama) };
}

/**
 * Perubahan jabatan satu anggota menjadi daftar untuk sg_anggota_jabatan_dewan_atur. Pradana/Pradani yang sudah dipegang orang lain
 * dikosongkan lebih dulu pada daftar yang sama. Hasil { daftar: [{ username, jabatan }], menggantikan: anggota | null }.
 */
export function rencanaJabatanDewan(users, anggota, jabatanBaru) {
  const jabatan = rapikan(jabatanBaru);
  const daftar = [];
  let menggantikan = null;
  if (JABATAN_TUNGGAL.includes(jabatan)) {
    menggantikan = (users ?? []).find((u) => dewan(u) && u.jabatanDewan === jabatan && u.id !== anggota.id) ?? null;
    if (menggantikan) daftar.push({ username: menggantikan.username, jabatan: '' });
  }
  daftar.push({ username: anggota.username, jabatan });
  return { daftar, menggantikan };
}
