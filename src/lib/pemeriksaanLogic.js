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
  { kunci: 'belumPernahMasuk', judul: 'Akun belum pernah masuk', keterangan: 'Akun sudah dibuat tetapi belum pernah dipakai masuk. Ingatkan pemiliknya, atau reset PIN lewat menu Anggota bila lupa.', tab: { admin: 'anggota' } },
  { kunci: 'tanpaPerangkat', judul: 'Belum aktifkan notifikasi di HP', keterangan: 'Belum ada perangkat berlangganan notifikasi. Tidak dapat diperbaiki oleh Admin/Pembina: minta pemiliknya membuka menu Notifikasi di HP-nya sendiri dan mengizinkan notifikasi.', tab: {} },
];

/** Jumlah baris pada satu kategori (0 bila kosong atau kategori tidak dikenal). */
export const jumlahKategori = (hasil, kunci) => (Array.isArray(hasil?.[kunci]) ? hasil[kunci].length : 0);

/** Total seluruh kategori (untuk lencana/ringkasan). */
export const totalMasalah = (hasil) => KATEGORI_PEMERIKSAAN.reduce((n, k) => n + jumlahKategori(hasil, k.kunci), 0);

/** Id menu tujuan tombol "Perbaiki" kategori ini untuk peran pengguna saat ini; null = tanpa tombol (hanya Admin/Pembina tertentu yang bisa). */
export function tabPerbaikan(kategori, user) {
  if (user?.role === 'admin') return kategori.tab.admin ?? null;
  if (user?.role === 'penguji' && user?.jabatan === 'Pembina') return kategori.tab.pembina ?? null;
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
