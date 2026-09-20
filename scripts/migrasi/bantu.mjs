/**
 * Pembantu untuk menyusun berkas migrasi (supabase/migrasi/*.sql) dari supabase/sumber/inti.sql, satu-satunya sumber kebenaran skema.
 * Cara pakai: salin scripts/migrasi/2026-09-iuran.mjs sebagai contoh, ganti penanda blok dan isi kepala, jalankan `node scripts/migrasi/<nama>.mjs`.
 * Blok di inti.sql diberi penanda komentar (mis. `-- ===== Nama: tabel =====` ... `-- ===== akhir tabel nama =====`) agar dapat diambil utuh.
 * Migrasi harus AMAN untuk database berisi data: `create table if not exists`, `create or replace function`, `drop policy if exists` sebelum
 * `create policy`, `add column if not exists`, dan tanpa menghapus data. Kesetaraan migrasi dengan skema baru diuji (lihat uji/migrasi-iuran.mjs).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const akar = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inti = readFileSync(path.join(akar, 'supabase/sumber/inti.sql'), 'utf8').replace(/\r\n/g, '\n');

/** Mengambil potongan inti.sql dari penanda awal sampai penanda akhir (penanda akhir ikut bila sertakanAkhir). */
export const ambil = (awal, akhir, sertakanAkhir = false) => {
  const i = inti.indexOf(awal);
  if (i < 0) throw new Error(`penanda awal tidak ditemukan: ${awal}`);
  const j = inti.indexOf(akhir, i);
  if (j < 0) throw new Error(`penanda akhir tidak ditemukan: ${akhir}`);
  return inti.slice(i, sertakanAkhir ? j + akhir.length : j).trimEnd();
};

/** create function -> create or replace function (agar fungsi lama diperbarui, bukan galat). */
export const gantiFungsi = (s) => s.replace(/^create function /gm, 'create or replace function ');
/** create table -> create table if not exists. */
export const tabelJikaBelumAda = (s) => s.replace(/^create table public\./gm, 'create table if not exists public.');
/** Tiap create policy didahului drop policy if exists (kebijakan tidak punya "or replace"). */
export const kebijakanIdempoten = (s) => s.replace(/^create policy (\w+) on (public\.\w+)/gm, (m, nama, tabel) => `drop policy if exists ${nama} on ${tabel};\n${m}`);

/** Menulis supabase/migrasi/<nama>.sql. */
export const tulisMigrasi = (nama, isi) => {
  writeFileSync(path.join(akar, 'supabase/migrasi', `${nama}.sql`), isi);
  console.log(`ditulis supabase/migrasi/${nama}.sql (${isi.length} karakter)`);
};
