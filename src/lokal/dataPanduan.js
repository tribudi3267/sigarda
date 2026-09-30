/**
 * DATA CONTOH UNTUK GAMBAR PANDUAN (`?data=panduan`, mode lokal). Menambah di atas data contoh biasa (isiDataContoh) supaya halaman yang kosong di data bawaan
 * (Agenda, Materi, TKK, Pelantikan, Saka, Sesi ujian, Bina Damping, pra-uji) tampil berisi pada gambar panduan (scripts/panduan). Basis data lokalnya TERPISAH dari
 * data contoh biasa, jadi data contoh bawaan dan pengujian lama tidak berubah. Hanya dimuat (import dinamis) oleh bootLokal; tidak ikut build produksi.
 *
 * Semua data ditulis LEWAT fungsi sg_* sebagai pengguna yang berhak (bukan insert langsung) supaya lolos aturan server yang sama dengan pemakaian nyata.
 * Isi dibagi per kelompok (KELOMPOK) agar tiap tahap gambar panduan dapat menambah kelompoknya sendiri tanpa mengubah yang lama. Semua nama fiktif.
 */
import { sqlSebagai } from './klienFake';

const nisPenegak = { ahmad: '10231', anisa: '10120', bagas: '10007', dimas: '10118', nadia: '10008', made: '10121' };

async function konteks(pg) {
  const id = async (kolom, nilai) => (await pg.query(`select id from public.profiles where ${kolom} = $1`, [nilai])).rows[0]?.id;
  const penegak = {};
  for (const [nama, nis] of Object.entries(nisPenegak)) {
    penegak[nama] = await id('nis', nis);
    if (!penegak[nama]) throw new Error(`Data contoh panduan: Penegak ${nama} (NIS ${nis}) tidak ditemukan; data contoh dasar berubah?`);
  }
  const pembina = await id('username', 'pembina');
  const admin = await id('username', 'admin');
  if (!pembina || !admin) throw new Error('Data contoh panduan: akun pembina/admin tidak ditemukan.');
  const ta = (await pg.query('select sigarda.tahun_ajaran_kini() as t')).rows[0].t;
  /** Tanggal relatif terhadap "hari ini" menurut server (WIB), format ISO. */
  const tgl = async (selisihHari) => (await pg.query('select (sigarda.hari_ini() + $1::int)::text as d', [selisihHari])).rows[0].d;
  /** Menjalankan satu SQL sebagai pengguna; galat diberi nama langkah supaya mudah dilacak. */
  const jalan = async (sub, langkah, sql, params = []) => {
    try { return await sqlSebagai(pg, sub, sql, params); } catch (e) { throw new Error(`Data contoh panduan, langkah "${langkah}": ${e.message}`); }
  };
  return { penegak, pembina, admin, ta, tgl, jalan };
}

/** Kegiatan agenda tahun ajaran berjalan (Pembina). */
async function agenda({ penegak, pembina, ta, tgl, jalan }) {
  const daftar = [
    ['sidang', 'Sidang Dewan Kehormatan Penegak', 14, 'Penilaian kelayakan Penegak Laksana.', [penegak.bagas]],
    ['pelantikan_bantara', 'Pelantikan Penegak Bantara', 21, 'Di lapangan sekolah, pukul 15.30.', [penegak.ahmad, penegak.anisa]],
    ['musyawarah', 'Musyawarah Ambalan', 40, 'Pemilihan Dewan Ambalan baru.', []],
    ['perkemahan', 'Perkemahan Bakti Ambalan', 60, 'Bumi perkemahan Kwartir Ranting Bukateja.', []],
    ['lainnya', 'Latihan gabungan dengan gudep tetangga', 7, 'Membawa perlengkapan PBB.', []],
  ];
  for (const [jenis, judul, hari, ket, terkait] of daftar) {
    await jalan(pembina, `agenda ${jenis}`, 'select public.sg_agenda_simpan(null, $1, $2, $3, $4::date, $5, $6::uuid[], false)', [ta, jenis, judul, await tgl(hari), ket, terkait]);
  }
}

/** Materi belajar dengan tautan Google Drive (tautan contoh; tidak mengarah ke berkas nyata). */
async function materi({ pembina, jalan }) {
  const daftar = [
    ['Dasadarma dan Trisatya dalam keseharian', 'Penjelasan ringkas dan contoh penerapannya bagi Penegak.', 'BAN-01', '1AbCdEfGhIjKlMnOpQrStUvWxYz012345', [{ judul: 'Trisatya', halaman: '1-3' }, { judul: 'Dasadarma', halaman: '4-9' }]],
    ['Panduan berkemah dan perlengkapan regu', 'Mendirikan tenda, membuat dapur lapangan, dan menjaga kebersihan.', 'BAN-05', '1BcDeFgHiJkLmNoPqRsTuVwXyZ0123456', [{ judul: 'Perlengkapan', halaman: '1-4' }]],
    ['Sandi dan isyarat Pramuka', 'Semaphore, morse, dan sandi rumput.', 'LAK-01', '1CdEfGhIjKlMnOpQrStUvWxYzA1234567', []],
  ];
  for (const [judul, deskripsi, butir, fileId, bagian] of daftar) {
    await jalan(pembina, `materi ${judul}`, 'select public.sg_materi_simpan(null, $1, $2, $3, $4, $5, $6::text[], $7::jsonb)',
      [judul, deskripsi, `https://drive.google.com/file/d/${fileId}/view`, fileId, '', [butir], JSON.stringify(bagian)]);
  }
}

/** TKK: capaian resmi (dicatat Pembina) untuk Calon Garuda dan Calon Laksana, serta satu pengajuan Penegak yang menunggu tinjauan. */
async function tkk({ penegak, pembina, tgl, jalan }) {
  const capaian = [
    [penegak.bagas, 'penabung', 'purwa', -150], [penegak.bagas, 'penabung', 'madya', -110],
    [penegak.bagas, 'pengatur-rumah', 'purwa', -140], [penegak.bagas, 'pemimpin-menyanyi', 'purwa', -130],
    [penegak.bagas, 'gerak-jalan', 'purwa', -120], [penegak.bagas, 'pengamat', 'purwa', -100],
    [penegak.nadia, 'penabung', 'purwa', -90], [penegak.nadia, 'menyanyi', 'purwa', -80],
  ];
  for (const [pid, id, tingkat, hari] of capaian) {
    await jalan(pembina, `TKK ${id} ${tingkat}`, 'select public.sg_tkk_catat($1, $2, $3, $4::date, $5, $6, $7, $8, $9)',
      [pid, id, tingkat, await tgl(hari), 'Pembina Gudep (contoh)', 'Kak Rahmat (contoh)', 'Melatih adik Penegak Bantara di latihan Jumat', '', '']);
  }
  // Pengajuan oleh Penegak (Dimas): menunggu tinjauan Pembina.
  await jalan(penegak.dimas, 'TKK pengajuan', 'select public.sg_tkk_ajukan($1, $2, $3::date, $4::uuid, $5, $6, $7, $8)',
    ['pemimpin-menyanyi', 'purwa', await tgl(-5), pembina, 'Kak Rahmat (contoh)', 'Melatih regu di latihan Jumat', '', 'Sudah memimpin nyanyian upacara tiga kali.']);
}

/** Pelantikan dan keanggotaan Saka. */
async function pelantikanSaka({ penegak, pembina, tgl, jalan }) {
  await jalan(pembina, 'pelantikan bantara', "select public.sg_pelantikan_catat('bantara', $1::date, $2, $3::uuid[])",
    [await tgl(-200), 'Lapangan SMAN 1 Bukateja', [penegak.bagas, penegak.nadia, penegak.dimas]]);
  await jalan(pembina, 'pelantikan laksana', "select public.sg_pelantikan_catat('laksana', $1::date, $2, $3::uuid[])",
    [await tgl(-60), 'Bumi Perkemahan Bukateja', [penegak.bagas]]);
  await jalan(pembina, 'saka', "select public.sg_saka_simpan(null, $1, 'Saka Bhayangkara', $2::date, 'aktif', null, '', '')", [penegak.bagas, await tgl(-300)]);
}

/** Sesi ujian bersama terjadwal. */
async function sesiUjian({ penegak, pembina, tgl, jalan }) {
  await jalan(pembina, 'sesi ujian', "select public.sg_sesi_simpan(null, $1, $2::date, $3, $4, 'terjadwal', $5::text[], $6::uuid[])",
    ['Ujian bersama SKU Bantara', await tgl(9), 'Aula SMAN 1 Bukateja', 'Membawa kartu SKU.', ['BAN-05'], [penegak.ahmad, penegak.anisa]]);
}

/** Pra-uji berjenjang dihidupkan: Bina Damping rombel X-01 (Nadia), Pinsa tertugas (Dimas, sangga Elang), lalu satu pengajuan Penegak (Ahmad) yang menunggu Pinsa. */
async function praUji({ penegak, pembina, ta, tgl, jalan }) {
  await jalan(pembina, 'Bina Damping X-01', 'select public.sg_bina_damping_atur($1, $2, $3::uuid[])', [ta, 'X-01', [penegak.nadia]]);
  await jalan(pembina, 'Pinsa tertugas', 'select public.sg_pinsa_tugaskan($1, $2, $3)', ['X-01', 'Sangga Elang', penegak.dimas]);
  await jalan(pembina, 'sakelar pra-uji', 'select public.sg_pra_uji_sakelar(true)');
  await jalan(penegak.ahmad, 'pengajuan Ahmad', "select public.sg_sku_ajukan('BAN-06', $1::date, null, '')", [await tgl(5)]);
}

/** Urutan penting: pra-uji terakhir (mengubah aturan penguji untuk pengajuan sesudahnya). */
export const KELOMPOK = [
  ['agenda', agenda],
  ['materi', materi],
  ['TKK', tkk],
  ['pelantikan dan Saka', pelantikanSaka],
  ['sesi ujian', sesiUjian],
  ['pra-uji', praUji],
];

/** Menambahkan data panduan ke database lokal yang SUDAH berisi data contoh dasar. Mengembalikan daftar kelompok yang diisi. */
export async function isiDataPanduan(pg, { kemajuan = () => {} } = {}) {
  // Akun contoh memakai PIN awal yang wajib diganti; fungsi sg_* menolak sebelum itu. Di basis data lokal khusus panduan ini syarat itu dimatikan (masuk cepat memang tanpa PIN).
  await pg.query('update public.profiles set wajib_ganti_pin = false');
  const ctx = await konteks(pg);
  for (const [nama, isi] of KELOMPOK) {
    kemajuan(nama);
    await isi(ctx);
  }
  return KELOMPOK.map(([nama]) => nama);
}
