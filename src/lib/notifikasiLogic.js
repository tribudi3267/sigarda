/**
 * NOTIFIKASI (murni, tanpa React). Dijaga oleh uji/notifikasi-klien.mjs.
 * Notifikasi dibuat server (pemicu di basis data); di sini hanya penghitung lencana, label, tujuan tautan, dan waktu relatif.
 */
import { fmtTanggal } from './format';

export const LABEL_JENIS = {
  ajukan: 'Pengajuan', alih: 'Dialihkan', mulai: 'Pengujian', hasil: 'Hasil', pengingat: 'Pengingat', lama: 'Menunggu lama', sesi: 'Sesi ujian', surat: 'Surat', tes: 'Uji', eskalasi: 'Eskalasi', agenda: 'Agenda',
};

/**
 * Penjelasan hasil "Kirim notifikasi uji". `hasil` = { perangkat, terkonfigurasi, pg_net } dari server; `pushStatus` = null (belum ada laporan),
 * 'dikirim' atau 'gagal' (dilaporkan Edge Function notif-push); `habisWaktu` = sudah menunggu cukup lama tanpa laporan.
 * Mengembalikan { tingkat: 'ok' | 'tunggu' | 'galat', teks }.
 */
export function penjelasanTes(hasil, pushStatus = null, habisWaktu = false) {
  if (!hasil?.terkonfigurasi) return { tingkat: 'galat', teks: 'Notifikasi uji masuk ke daftar di bawah, tetapi server belum diatur untuk mengirim ke HP. Admin: jalankan select sigarda.push_atur(...) di SQL Editor (lihat README, bagian Notifikasi).' };
  if (!hasil.pg_net) return { tingkat: 'galat', teks: 'Ekstensi pg_net belum aktif di database, sehingga tidak ada yang dikirim ke HP. Admin: aktifkan lewat Database > Extensions, lalu jalankan ulang migrasi notifikasi.' };
  if (!hasil.perangkat) return { tingkat: 'galat', teks: 'Belum ada perangkat yang mengaktifkan notifikasi untuk akun ini. Tekan "Aktifkan notifikasi" di perangkat yang ingin dipakai (iPhone: pasang ke Layar Utama lebih dulu), lalu coba lagi.' };
  if (pushStatus === 'dikirim') return { tingkat: 'ok', teks: 'Terkirim ke layanan notifikasi. Seharusnya muncul di HP dalam beberapa detik. Bila tidak muncul: periksa izin notifikasi, mode hemat baterai, dan (iPhone) apakah aplikasi dipasang di Layar Utama.' };
  if (pushStatus === 'gagal') return { tingkat: 'galat', teks: 'Pengiriman gagal. Penyebab umum: kunci VAPID atau alamat fungsi tidak cocok, atau perangkat sudah tidak berlaku (matikan lalu aktifkan lagi notifikasi). Admin: periksa log Edge Function notif-push.' };
  if (habisWaktu) return { tingkat: 'galat', teks: 'Belum ada laporan dari server push setelah 20 detik. Admin: jalankan supabase/demo/periksa_push.sql di SQL Editor untuk melihat jawaban Edge Function notif-push (penyebab umum: Verify JWT masih menyala, atau rahasia NOTIF_RAHASIA berbeda dengan yang diisi lewat sigarda.push_atur).' };
  return { tingkat: 'tunggu', teks: 'Mengirim...' };
}

/** Kejadian yang memunculkan notifikasi, per peran (untuk keterangan "Kapan notifikasi muncul"). */
export const KAPAN_NOTIFIKASI = {
  penegak: [
    'Penguji mulai menguji butir yang Anda ajukan.',
    'Hasil penilaian butir Anda sudah dicatat (isi tidak menyebut lulus atau ulang).',
    'Anda dimasukkan ke sesi ujian bersama.',
    'Surat pengantar guru agama untuk Anda terbit.',
    'Pengingat pukul 07.00 WIB sehari sebelum jadwal pengujian atau sesi ujian Anda.',
    'Pengingat pukul 07.00 WIB bila SKU, absensi, atau iuran Anda sudah beberapa hari tidak bergerak (nadanya makin sering bila terus tidak bergerak).',
    'Pengingat H-30/H-7/H-1 untuk kegiatan agenda yang menandai Anda sebagai Penegak terkait (mis. calon sidang atau pelantikan).',
  ],
  penguji: [
    'Penegak mengajukan pengujian kepada Anda, atau ke antrian rombel yang Anda tangani.',
    'Pengujian dialihkan kepada Anda, atau masuk antrian rombel.',
    'Pengajuan menunggu lebih dari 3 hari tanpa penguji yang mulai menguji (sekali per pengajuan).',
    'Pengingat pukul 07.00 WIB sehari sebelum jadwal pengujian yang menjadi tugas Anda.',
    'Seorang Penegak sudah 8 hari lebih tidak bergerak (SKU, absensi, atau iuran) — juga muncul di menu Tindak Lanjut.',
    'Pengingat H-30/H-7/H-1 untuk setiap kegiatan agenda (Musyawarah Ambalan, Naik Kelas, Sidang, Pelantikan, dll).',
  ],
};

export const jumlahBelumDibaca = (daftar = []) => daftar.filter((n) => !n.dibaca).length;

/** Angka lencana: "1".."99", lalu "99+". Kosong untuk 0 (lencana disembunyikan). */
export const teksLencana = (n) => (n > 99 ? '99+' : n > 0 ? String(n) : '');

/** Menu tujuan dari tautan notifikasi bila menu itu ada di daftar menu pengguna; selain itu null (tetap di Kotak Notifikasi). */
export const tujuanNotifikasi = (notif, idMenu = []) => {
  const tab = notif?.tautan?.tab;
  return typeof tab === 'string' && idMenu.includes(tab) ? tab : null;
};

/** "baru saja", "5 menit lalu", "3 jam lalu", "2 hari lalu"; lebih dari seminggu memakai tanggal. */
export function waktuRelatif(iso, sekarang = Date.now()) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const menit = Math.floor((sekarang - t) / 60000);
  if (menit < 1) return 'baru saja';
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  if (hari < 7) return `${hari} hari lalu`;
  return fmtTanggal(new Date(t).toISOString().slice(0, 10));
}

/** Menandai secara lokal (sebelum server menjawab): id tertentu, atau semua bila ids kosong. */
export const tandaiLokal = (daftar, ids = null, waktu = new Date().toISOString()) =>
  daftar.map((n) => (!n.dibaca && (!ids || ids.includes(n.id)) ? { ...n, dibaca: true, dibacaPada: waktu } : n));
