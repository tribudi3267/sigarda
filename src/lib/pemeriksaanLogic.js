/**
 * PEMERIKSAAN DATA (murni, tanpa React; tahap L3). Menyusun hasil sg_pemeriksaan_data() (server) + sg_push_ringkasan() menjadi
 * daftar kategori siap tampil, dengan tautan "Perbaiki" ke menu yang tepat menurut peran (sebagian besar perbaikan HANYA
 * bisa dilakukan Admin Gudep, lihat sg_anggota_jk_atur/sg_rombel_perbarui/sg_anggota_nta_atur/sg_anggota_agama_atur di server;
 * Pembina tetap melihat daftarnya agar tahu apa yang perlu diminta ke Admin). Dijaga oleh uji/pemeriksaan-data.mjs.
 */

/**
 * Definisi kategori. `tab` = id menu tujuan tombol "Perbaiki" untuk peran yang BISA memperbaikinya sendiri ('admin' selalu
 * berarti menu Admin; 'pembina' berarti menu Pembina); peran yang tidak disebut hanya melihat (tanpa tombol perbaiki).
 */
export const KATEGORI_PEMERIKSAAN = [
  { kunci: 'kelasLama', judul: 'Kelas belum format rombel baku', keterangan: 'Kelas Penegak masih format lama (bukan X-01..XII-10). Rapikan lewat tombol "Perbarui rombel" di menu Anggota.', tab: { admin: 'anggota' } },
  { kunci: 'tanpaNta', judul: 'Belum ada Nomor Tanda Anggota (NTA)', keterangan: 'NTA biasanya diisi saat Sidang Dewan Kehormatan. Lengkapi lewat menu Anggota.', tab: { admin: 'anggota' } },
  { kunci: 'tanpaJk', judul: 'Belum diisi jenis kelamin', keterangan: 'Wajib untuk anggota baru; anggota lama boleh dilengkapi lewat tombol "Lengkapi jenis kelamin" di menu Anggota.', tab: { admin: 'anggota' } },
  { kunci: 'rombelTanpaPenguji', judul: 'Rombel belum ada penugasan penguji', keterangan: 'Rombel berisi Penegak aktif tetapi belum ada penguji ditugaskan tahun ajaran ini. Atur lewat menu Penugasan.', tab: { pembina: 'penugasan' } },
  { kunci: 'pembinaTanpaAgama', judul: 'Pembina belum diisi agama', keterangan: 'Agama Pembina menentukan siapa yang boleh menilai butir agama. Lengkapi lewat menu Anggota.', tab: { admin: 'anggota' } },
  { kunci: 'belumPernahMasuk', judul: 'Akun belum pernah masuk', keterangan: 'Akun sudah dibuat tetapi belum pernah dipakai masuk. Ingatkan pemiliknya lewat tombol WhatsApp pada daftar, atau reset PIN lewat menu Anggota bila lupa.', tab: { admin: 'anggota' } },
  { kunci: 'dataDiriBelum', judul: 'Penegak belum melengkapi data diri', keterangan: 'Data diri untuk portofolio Garuda diisi Penegak sendiri di menu Akun saya (isian pokok: WhatsApp, jenis kelamin, agama, tanggal lahir, tempat lahir, alamat, nama orang tua/wali). Penegak tanpa agama belum dapat mengajukan SKU. Ingatkan lewat tombol WhatsApp pada daftar; hanya kode isian yang kurang yang tampil, bukan isinya.', tab: {} },
  { kunci: 'sfhBelum', judul: 'Catatan Safe From Harm belum lengkap', keterangan: 'Anggota dewasa gugus depan wajib lulus pelatihan perlindungan; Pembina juga menandatangani pakta integritas dan menjalani pemeriksaan rekam jejak (Jukran Kwarnas 004/2021). Catat di menu Perlindungan; ingatkan lewat tombol WhatsApp.', tab: { admin: 'perlindungan', pembina: 'perlindungan' } },
  // Pra-uji (Fase E): hanya ditampilkan bila pra-uji hidup (hasil.praUjiAktif dari sg_pemeriksaan_data); lihat kategoriTampil.
  { kunci: 'rombelTanpaBinaDamping', judul: 'Rombel belum lengkap Bina Damping', keterangan: 'Tiap rombel didampingi 2 Bina Damping (Penegak berjabatan Dewan Ambalan) agar pra-uji punya penilai butir Laksana. Tunjuk lewat menu Sangga, tab Bina Damping.', tab: { pembina: 'sangga', admin: 'sangga', dewan: 'sangga' }, praUji: true },
  { kunci: 'sanggaTanpaPinsa', judul: 'Sangga belum punya Pinsa', keterangan: 'Pinsa (Pimpinan Sangga) menilai butir Bantara lebih dulu. Tanpa Pinsa, tahap itu dilewati dan pengajuan langsung ke Bina Damping. Tentukan lewat menu Sangga.', tab: { pembina: 'sangga', admin: 'sangga', dewan: 'sangga' }, praUji: true },
  { kunci: 'praUjiMacet', judul: 'Pra-uji menunggu terlalu lama', keterangan: 'Menunggu penilai lebih dari 3 hari, atau tidak ada penilai yang memenuhi syarat. Buka menu Pra-uji untuk melewati tahap itu (pengajuan tidak pernah lolos sendiri).', tab: { pembina: 'pra-uji', admin: 'pra-uji' }, praUji: true },
  { kunci: 'tanpaPerangkat', judul: 'Belum aktifkan notifikasi di HP', keterangan: 'Belum ada perangkat berlangganan notifikasi. Tidak dapat diperbaiki oleh Admin/Pembina: ingatkan pemiliknya lewat tombol WhatsApp pada daftar, agar membuka menu Notifikasi di HP-nya sendiri dan mengizinkan notifikasi.', tab: {} },
];

/** Jumlah baris yang DIKIRIM untuk satu kategori (server memotong daftar di 300). */
export const barisDikirim = (hasil, kunci) => (Array.isArray(hasil?.[kunci]) ? hasil[kunci].length : 0);

/** Jumlah masalah pada satu kategori: jumlah sebenarnya dari server (hasil.jumlahSebenarnya, hanya untuk daftar yang terpotong) bila lebih besar dari baris yang dikirim; 0 bila kosong atau tidak dikenal. */
export const jumlahKategori = (hasil, kunci) => {
  if (!Array.isArray(hasil?.[kunci])) return 0;
  const n = hasil[kunci].length;
  const s = Number(hasil?.jumlahSebenarnya?.[kunci]);
  return Number.isFinite(s) && s > n ? s : n;
};

/** Kategori yang ditampilkan: kategori pra-uji hanya bila pra-uji hidup (hasil.praUjiAktif). */
export const kategoriTampil = (hasil) => KATEGORI_PEMERIKSAAN.filter((k) => !k.praUji || !!hasil?.praUjiAktif);

/** Total seluruh kategori yang ditampilkan (untuk lencana/ringkasan). */
export const totalMasalah = (hasil) => kategoriTampil(hasil).reduce((n, k) => n + jumlahKategori(hasil, k.kunci), 0);

/** Id menu tujuan tombol "Perbaiki" kategori ini untuk peran pengguna saat ini; null = tanpa tombol (hanya Admin/Pembina, dan Dewan untuk `tab.dewan`, yang bisa). */
export function tabPerbaikan(kategori, user) {
  if (user?.role === 'admin') return kategori.tab.admin ?? null;
  if (user?.role === 'penguji' && user?.jabatan === 'Pembina') return kategori.tab.pembina ?? null;
  if (user?.role === 'penguji') return kategori.tab.dewan ?? null; // Dewan Ambalan (tampilan Dewan atau akun lama): hanya yang boleh ia tangani sendiri
  return null;
}

/**
 * Menggabungkan hasil sg_pemeriksaan_data() (6 kategori) dengan sg_push_ringkasan() (kategori "tanpaPerangkat", dari
 * bentuk { tanpa: [...] }) menjadi satu objek { [kunci]: [...] } sesuai KATEGORI_PEMERIKSAAN. `ringkasanPush` boleh null
 * (mis. belum berhasil dimuat): kategori "tanpaPerangkat" jadi kosong, bukan galat.
 */
export function gabungHasilPemeriksaan(dataPemeriksaan, ringkasanPush) {
  return { ...(dataPemeriksaan ?? {}), tanpaPerangkat: ringkasanPush?.tanpa ?? [] };
}
