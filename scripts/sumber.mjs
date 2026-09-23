/**
 * Merakit sumber skema: supabase/sumber/*.sql (bernomor, mis. 10-tabel-inti.sql) disambung urut nama, tanpa pemisah tambahan,
 * menjadi satu teks utuh (dahulu satu berkas inti.sql). Dipakai buat-skema.mjs, migrasi/bantu.mjs, dan pengujian.
 * Urutan berkas = urutan definisi di database (tabel dulu, lalu fungsi bantu, kebijakan, fungsi aksi, hak akses); jangan menyusun ulang.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const akarBawaan = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Nama berkas sumber, urut. Hanya berkas berawalan angka (README dan lainnya diabaikan). */
export const daftarSumber = (akar = akarBawaan) =>
  readdirSync(path.join(akar, 'supabase/sumber')).filter((n) => /^\d+-.+\.sql$/.test(n)).sort();

/** Seluruh sumber sebagai satu teks (akhir baris apa adanya). */
export const bacaInti = (akar = akarBawaan) =>
  daftarSumber(akar).map((n) => readFileSync(path.join(akar, 'supabase/sumber', n), 'utf8')).join('');
