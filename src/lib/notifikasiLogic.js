/**
 * NOTIFIKASI (murni, tanpa React). Dijaga oleh uji/notifikasi-klien.mjs.
 * Notifikasi dibuat server (pemicu di basis data); di sini hanya penghitung lencana, label, tujuan tautan, dan waktu relatif.
 */
import { fmtTanggal } from './format';

export const LABEL_JENIS = {
  ajukan: 'Pengajuan', alih: 'Dialihkan', mulai: 'Pengujian', hasil: 'Hasil', pengingat: 'Pengingat', lama: 'Menunggu lama', sesi: 'Sesi ujian', surat: 'Surat',
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
