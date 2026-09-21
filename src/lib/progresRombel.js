/**
 * PROGRES PER ROMBEL (murni, tanpa React)
 *
 * Bahan dashboard Pembina dan Dewan Ambalan: untuk tiap rombel, jumlah Penegak, rata-rata progres SKU Bantara dan Laksana, banyaknya yang
 * sudah menyelesaikan tiap tingkat, komposisi peran, antrian pengujian, dan penguji yang bertugas. Dijaga oleh uji/rombel-saya.mjs.
 */
import { antrianPengujian, hitungProgres, tingkatSelesai, URUTAN_PERAN } from './skuLogic';
import { urutAlami } from './format';

const rata = (angka) => (angka.length ? Math.round(angka.reduce((a, b) => a + b, 0) / angka.length) : 0);

/**
 * Rombel (atau kelas format lama) yang punya Penegak, terurut. Penegak tanpa kelas dikelompokkan dengan kunci '' (ditampilkan "Tanpa rombel").
 * Dipakai bila penguji belum ditugaskan ke rombel mana pun, atau saat memilih "semua rombel".
 */
export const rombelBerPenegak = (daftarPeserta) =>
  [...new Set(daftarPeserta.map((u) => u.kelas ?? ''))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : urutAlami(a, b)));

/**
 * Progres tiap rombel dalam `rombel` (larik kunci; '' = tanpa rombel).
 * daftarPeserta = Penegak lengkap dengan peran (pesertaDenganPeran); users = semua akun (untuk nama penguji dan antrian);
 * penugasan = baris penugasan tahun ajaran berjalan ([{ rombel, pengujiId }]) atau null bila belum termuat.
 * Hasil: [{ rombel, jumlah, peserta: [{ ...penegak, bantara, laksana }], rataBantara, rataLaksana, selesaiBantara, selesaiLaksana,
 *           perPeran: { peran: jumlah }, menunggu, diuji, penguji: [nama] }]
 */
export function progresPerRombel({ progress, daftarPeserta, users, penugasan, rombel, dokumen = [] }) {
  const antrian = antrianPengujian(progress, users, null, null, dokumen);
  return rombel.map((kunci) => {
    const anggota = daftarPeserta.filter((u) => (u.kelas ?? '') === kunci);
    const peserta = anggota
      .map((u) => ({ ...u, bantara: hitungProgres(progress, u, 'Bantara'), laksana: hitungProgres(progress, u, 'Laksana') }))
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
    const dalam = antrian.filter((a) => (a.peserta.kelas ?? '') === kunci);
    const namaPenguji = (penugasan ?? [])
      .filter((b) => b.rombel === kunci)
      .map((b) => users.find((u) => u.id === b.pengujiId))
      .filter(Boolean)
      .sort((a, b) => (a.jabatan === b.jabatan ? 0 : a.jabatan === 'Pembina' ? -1 : 1) || a.nama.localeCompare(b.nama, 'id'))
      .map((u) => u.nama);
    return {
      rombel: kunci,
      jumlah: peserta.length,
      peserta,
      rataBantara: rata(peserta.map((p) => p.bantara.persen)),
      rataLaksana: rata(peserta.map((p) => p.laksana.persen)),
      selesaiBantara: anggota.filter((u) => tingkatSelesai(progress, u, 'Bantara')).length,
      selesaiLaksana: anggota.filter((u) => tingkatSelesai(progress, u, 'Laksana')).length,
      perPeran: Object.fromEntries(URUTAN_PERAN.map((p) => [p, anggota.filter((u) => u.peran === p).length])),
      menunggu: dalam.filter((a) => a.entry.status === 'diajukan').length,
      diuji: dalam.filter((a) => a.entry.status === 'proses').length,
      penguji: namaPenguji,
    };
  });
}
