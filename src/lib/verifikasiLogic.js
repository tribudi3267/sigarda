/**
 * LOGIKA VERIFIKASI KEASLIAN DOKUMEN (murni, tanpa React)
 *
 * QR pada Kartu SKU (per butir) dan Surat Tanda Lulus (per tingkat) memuat alamat aplikasi dengan token acak 128 bit:
 *   https://<alamat aplikasi>/?v=<32 heksadesimal>
 * Halaman itu dapat dibuka tanpa login dan memanggil sg_verifikasi_token. Kode pendek VRF-XXXXXXX (tercetak di dokumen) hanya
 * dapat menjawab sah atau tidak tanpa nama, karena mudah ditebak.
 */
import { INDEKS_POIN, hurufSub } from '../data/skuData';

export const POLA_TOKEN = /^[0-9a-f]{32}$/i;
export const POLA_KODE = /^VRF-[0-9A-F]{7}$/i;

/** Alamat dasar aplikasi (mengikuti alamat yang sedang dibuka dan VITE_BASE, mis. https://sigarda.smabukateja.sch.id/). */
export function alamatDasar(lokasi = typeof window !== 'undefined' ? window.location : null, basis = import.meta.env?.BASE_URL ?? '/') {
  if (!lokasi) return basis;
  return `${lokasi.origin}${basis.startsWith('/') ? basis : `/${basis}`}`;
}

export const urlVerifikasi = (token, dasar = alamatDasar()) => `${dasar}?v=${token}`;

/** Nilai parameter `v` pada alamat (string, mungkin kosong) atau null bila tidak ada: null = halaman biasa, string = halaman verifikasi. */
export function parameterVerifikasi(search) {
  const p = new URLSearchParams(search ?? '');
  return p.has('v') ? (p.get('v') ?? '').trim() : null;
}

/** "Butir 5", "Butir 1a" untuk unit SKU. */
export function labelUnit(skuId) {
  const p = INDEKS_POIN[skuId];
  return p ? `Butir ${p.butirNo}${p.sub ? hurufSub(p.sub) : ''}` : skuId;
}

export const teksUnit = (skuId) => INDEKS_POIN[skuId]?.teks ?? '';
