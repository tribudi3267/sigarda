// Cadangan data SIGARDA dari Supabase ke satu berkas SQL. Tanpa Docker, hanya butuh Node.
//
// Yang disimpan : semua tabel di schema public (kecuali login_gagal) + akun login (auth.users, auth.identities).
// Cara kerja    : sambung ke database (Session pooler) dalam transaksi BACA-SAJA, ambil isi tiap tabel
//                 sebagai JSON, lalu tulis perintah INSERT yang bisa dijalankan ulang untuk memulihkan.
// Keamanan      : password database diketik di jendela ini (tidak tampil, tidak disimpan). Yang disimpan hanya
//                 alamat sambungan tanpa password.
//
// Variabel lingkungan (opsional, untuk pengujian/otomatisasi):
//   SIGARDA_DB_KONEKSI, SIGARDA_DB_PASSWORD, SIGARDA_FOLDER_CADANGAN

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { bacaSemua, cadanganWajar, susunSql } from './dump.mjs';

const FOLDER_UTAMA = process.env.SIGARDA_FOLDER_CADANGAN || path.join(os.homedir(), 'Cadangan-SIGARDA');
const BERKAS_KONEKSI = path.join(FOLDER_UTAMA, 'koneksi.json');

const cetak = (t = '') => console.log(t);
const keluar = (pesan, kode = 1) => { console.error('\nGAGAL: ' + pesan + '\n'); process.exit(kode); };

// ---------- masukan dari pengguna ----------

function tanyaBiasa(pertanyaan) {
  return new Promise((resolve) => {
    process.stdout.write(pertanyaan);
    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    process.stdin.once('data', (d) => { process.stdin.pause(); resolve(String(d).replace(/[\r\n]+$/, '')); });
  });
}

function tanyaSembunyi(pertanyaan) {
  return new Promise((resolve) => {
    process.stdout.write(pertanyaan);
    if (!process.stdin.isTTY) { tanyaBiasa('').then(resolve); return; }
    let isi = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const saatData = (potongan) => {
      for (const c of potongan) {
        if (c === '\r' || c === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', saatData);
          process.stdout.write('\n');
          resolve(isi);
          return;
        }
        if (c === '') { process.stdout.write('\n'); process.exit(130); }
        if (c === '' || c === '') isi = isi.slice(0, -1);
        else isi += c;
      }
    };
    process.stdin.on('data', saatData);
  });
}

// ---------- sambungan ----------

/** Ambil pengguna/host/port/database dari alamat sambungan; bagian password (jika ada) dibuang. */
export function uraiKoneksi(teks) {
  const m = /^postgres(?:ql)?:\/\/([^:@/\s]+)(?::.*)?@([^@:/\s]+):(\d+)\/([^\s?]+)/.exec(String(teks).trim());
  if (!m) return null;
  return { user: m[1], host: m[2], port: Number(m[3]), database: m[4] };
}

async function ambilKoneksi() {
  const dariEnv = process.env.SIGARDA_DB_KONEKSI;
  if (dariEnv) {
    const k = uraiKoneksi(dariEnv);
    if (!k) keluar('SIGARDA_DB_KONEKSI tidak dikenali.');
    return k;
  }
  if (fs.existsSync(BERKAS_KONEKSI)) {
    try {
      const k = JSON.parse(fs.readFileSync(BERKAS_KONEKSI, 'utf8'));
      if (k.user && k.host && k.port && k.database) {
        cetak(`Memakai sambungan tersimpan: ${k.user} @ ${k.host}:${k.port}`);
        cetak(`(Untuk mengganti, hapus berkas ${BERKAS_KONEKSI})\n`);
        return k;
      }
    } catch { /* rusak: minta ulang */ }
  }
  cetak('Sambungan database belum tersimpan. Cara mengambilnya:');
  cetak('  Dashboard Supabase > tombol "Connect" (atas) > tab "Session pooler" > salin alamatnya.');
  cetak('  Bentuknya: postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-....pooler.supabase.com:5432/postgres');
  cetak('  Boleh ditempel apa adanya; bagian password tidak dipakai dan tidak disimpan.\n');
  for (;;) {
    const teks = await tanyaBiasa('Tempel alamat sambungan lalu tekan Enter: ');
    const k = uraiKoneksi(teks);
    if (k) {
      fs.mkdirSync(FOLDER_UTAMA, { recursive: true });
      fs.writeFileSync(BERKAS_KONEKSI, JSON.stringify(k, null, 2));
      cetak('Alamat disimpan (tanpa password).\n');
      return k;
    }
    cetak('Format tidak dikenali. Pastikan diawali postgresql:// dan memuat @host:port/database.');
  }
}

// ---------- utama ----------

async function utama() {
  cetak('=== Cadangan data SIGARDA ===\n');
  const koneksi = await ambilKoneksi();
  const password = process.env.SIGARDA_DB_PASSWORD ?? (await tanyaSembunyi('Password database (tidak tampil saat diketik): '));
  if (!password) keluar('Password kosong.');

  const lokal = ['127.0.0.1', 'localhost'].includes(koneksi.host);
  const db = new pg.Client({
    ...koneksi,
    password,
    ssl: lokal ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
    statement_timeout: 120000,
  });

  cetak('\nMenyambung ke database...');
  try {
    await db.connect();
  } catch (e) {
    const p = String(e.message || e);
    if (/password authentication|authentication failed/i.test(p)) keluar('Password database salah. (Ini password database, bukan PIN admin. Bisa direset di Project Settings > Database.)');
    if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN/i.test(p)) keluar('Tidak bisa menjangkau server. Cek internet, dan pastikan memakai alamat "Session pooler", bukan "Direct connection". Rincian: ' + p);
    keluar(p);
  }

  const cap = new Date();
  const dua = (x) => String(x).padStart(2, '0');
  const stempel = `${cap.getFullYear()}-${dua(cap.getMonth() + 1)}-${dua(cap.getDate())}_${dua(cap.getHours())}${dua(cap.getMinutes())}`;
  const folder = path.join(FOLDER_UTAMA, stempel);

  let blok;
  try {
    blok = await bacaSemua(db, { log: (nama, n) => cetak(`  ${nama.padEnd(28)} ${String(n).padStart(6)} baris`) });
  } catch (e) {
    keluar('Gagal membaca data: ' + (e.message || e));
  } finally {
    await db.end().catch(() => {});
  }

  if (!cadanganWajar(blok)) keluar('Tabel profiles kosong atau tidak ditemukan; cadangan tidak disimpan supaya tidak menimpa dengan berkas kosong. Pastikan alamat sambungan mengarah ke proyek yang benar.');

  const isi = susunSql(blok, cap);

  fs.mkdirSync(folder, { recursive: true });
  const berkas = path.join(folder, 'sigarda-cadangan.sql');
  fs.writeFileSync(berkas, isi, 'utf8');
  fs.writeFileSync(
    path.join(folder, 'BACA-SAYA.txt'),
    [
      'CADANGAN DATA SIGARDA',
      `Dibuat: ${cap.toLocaleString('id-ID')}`,
      '',
      'Berkas sigarda-cadangan.sql berisi akun login (hash PIN) dan data anggota. Simpan di tempat pribadi,',
      'jangan diunggah ke GitHub atau dikirim lewat pesan.',
      '',
      'CARA MEMULIHKAN (ke proyek Supabase yang sama atau proyek baru):',
      '1. Proyek baru saja: jalankan dulu supabase/skema.sql di SQL Editor (membuat tabel dan katalog).',
      '2. Buka SQL Editor, tempel seluruh isi sigarda-cadangan.sql, klik Run.',
      '   (Bila berkas terlalu besar untuk ditempel, minta bantuan; bisa dijalankan dengan psql.)',
      '3. Baris yang sudah ada dilewati, bukan ditimpa. Untuk menimpa data lama, kosongkan tabelnya lebih dulu.',
      '4. Pastikan Edge Function dan variabel repo GitHub mengarah ke proyek yang dipulihkan.',
      '',
      'Ringkasan isi:',
      ...blok.map((b) => `  ${b.nama.padEnd(28)} ${b.n} baris`),
      '',
    ].join('\r\n'),
    'utf8',
  );

  const kb = (fs.statSync(berkas).size / 1024).toFixed(1);
  cetak(`\nSELESAI. Cadangan tersimpan di:\n  ${folder}`);
  cetak(`  sigarda-cadangan.sql (${kb} KB) dan BACA-SAYA.txt`);
  cetak('\nSalin folder itu ke Google Drive pribadi atau flashdisk. Jangan diunggah ke GitHub.');
}

// Jalankan hanya bila dipanggil langsung (bukan saat diimpor untuk pengujian).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  utama().catch((e) => keluar(String(e && e.message ? e.message : e)));
}
