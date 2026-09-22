/**
 * UJI BEBAN SERENTAK (tahap L2-B): mengirim banyak permintaan BERSAMAAN ke Supabase SUNGGUHAN memakai akun uji dari
 * supabase/demo/data_uji_beban.sql, untuk melihat bagaimana database bereaksi pada beban 300-500 "pengguna" bersamaan.
 * TIDAK dijalankan otomatis: jalankan sendiri, dan JANGAN saat jam sekolah (memakai kuota egress dan sesi Auth yang
 * sama dengan pengguna sungguhan). Hanya membaca (mode "baca") atau login (mode "login"); tidak pernah menulis data.
 *
 * PERSIAPAN (sekali saja):
 *  1. Jalankan supabase/demo/data_uji_beban.sql di SQL Editor Supabase, SALIN daftar NIS+PIN dari hasil paling akhir.
 *  2. Simpan daftar itu di scripts/uji-beban/akun.json (berkas ini TIDAK ikut git, lihat .gitignore), bentuk:
 *     [{ "nis": "880700", "pin": "123456" }, ...]
 *  3. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di .env.local (dipakai juga oleh aplikasi; kunci anon BUKAN
 *     rahasia, sudah tertanam di kode yang dikirim ke peramban).
 *
 * CARA PAKAI
 *   node scripts/uji-beban/beban.mjs login --n=20                  20 login serentak (naikkan bertahap: 20, 50, 100)
 *   node scripts/uji-beban/beban.mjs baca --n=300 --sesi=30         300 "pengguna" membaca bersamaan, memakai 30 sesi
 *                                                                   Penegak-uji yang sudah login (dipakai bergantian)
 *   node scripts/uji-beban/beban.mjs baca --n=300 --sesi=30 --ulang=5   ulangi 5 gelombang (meniru beberapa menit beban)
 * Melaporkan: jumlah berhasil/gagal, dan latensi p50/p95/p99 (milidetik).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const AKAR = join(DIR, '..', '..');

function bacaEnvLocal() {
  try {
    const teks = readFileSync(join(AKAR, '.env.local'), 'utf8');
    const env = {};
    for (const baris of teks.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(baris);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return env;
  } catch { return {}; }
}

const env = { ...bacaEnvLocal(), ...process.env };
const URL_SB = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
if (!URL_SB || !ANON) {
  console.error('VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY belum ada (di .env.local atau variabel lingkungan). Lihat komentar di atas berkas ini.');
  process.exit(2);
}

const arg = (nama, bawaan) => { const a = process.argv.find((x) => x.startsWith(`--${nama}=`)); return a ? Number(a.slice(nama.length + 3)) : bawaan; };
const mode = process.argv[2];
const N = arg('n', 20);
const SESI = arg('sesi', 30);
const ULANG = arg('ulang', 1);

function persentil(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

function laporan(nama, hasil) {
  const ok = hasil.filter((r) => r.ok);
  const gagal = hasil.filter((r) => !r.ok);
  const ms = ok.map((r) => r.ms);
  console.log(`\n${nama}: ${ok.length} berhasil, ${gagal.length} gagal, dari ${hasil.length} permintaan`);
  if (ms.length) console.log(`  latensi (berhasil): p50=${persentil(ms, 50)} md | p95=${persentil(ms, 95)} md | p99=${persentil(ms, 99)} md | maks=${Math.max(...ms)} md`);
  if (gagal.length) {
    const contoh = new Map();
    for (const g of gagal) contoh.set(g.pesan, (contoh.get(g.pesan) ?? 0) + 1);
    console.log('  galat:', [...contoh].map(([p, n]) => `${n}x "${p}"`).join(' | '));
  }
}

async function ambilWaktu(fn) {
  const t0 = Date.now();
  try { const r = await fn(); return { ok: r.ok, pesan: r.ok ? '' : `HTTP ${r.status}`, ms: Date.now() - t0 }; }
  catch (e) { return { ok: false, pesan: String(e?.message ?? e).slice(0, 80), ms: Date.now() - t0 }; }
}

// Domain email tiruan: harus SAMA dengan yang dipakai akun sungguhan (lihat EMAIL_DOMAIN di supabase/functions/sigarda/index.ts).
// Bawaan 'sigarda.invalid'; bila proyek Anda memakai secret SIGARDA_EMAIL_DOMAIN yang lain, isi juga di .env.local.
const DOMAIN_EMAIL = env.SIGARDA_EMAIL_DOMAIN || 'sigarda.invalid';

async function login(nis, pin) {
  return fetch(`${URL_SB}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${nis}@${DOMAIN_EMAIL}`, password: pin }),
  });
}

async function modeLogin(akun) {
  const target = akun.slice(0, N);
  if (target.length < N) console.log(`(PERHATIAN: hanya ${target.length} akun tersedia di akun.json, diminta ${N})`);
  console.log(`Login SERENTAK: ${target.length} akun...`);
  const hasil = await Promise.all(target.map((a) => ambilWaktu(() => login(a.nis, a.pin))));
  laporan('Login serentak', hasil);
}

async function siapkanSesi(akun, jumlah) {
  const dipakai = akun.slice(0, jumlah);
  const token = [];
  for (const a of dipakai) {
    try {
      const r = await login(a.nis, a.pin);
      if (!r.ok) { console.log(`  (gagal login ${a.nis}: HTTP ${r.status}, dilewati untuk pembacaan)`); continue; }
      const j = await r.json();
      token.push(j.access_token);
    } catch (e) {
      console.log(`  (gagal login ${a.nis}: ${String(e?.message ?? e).slice(0, 80)}, dilewati untuk pembacaan)`);
    }
  }
  if (!token.length) throw new Error('Tidak ada sesi yang berhasil login. Periksa akun.json dan domain email (lihat header berkas).');
  console.log(`  ${token.length} dari ${dipakai.length} sesi siap dipakai bergantian.`);
  return token;
}

async function baca(token) {
  return fetch(`${URL_SB}/rest/v1/sku_progress?select=*&limit=50`, {
    headers: { apikey: ANON, authorization: `Bearer ${token}` },
  });
}

async function modeBaca(akun) {
  const token = await siapkanSesi(akun, SESI);
  for (let g = 1; g <= ULANG; g += 1) {
    console.log(`\nGelombang ${g}/${ULANG}: ${N} pembacaan serentak lewat ${token.length} sesi...`);
    const hasil = await Promise.all(Array.from({ length: N }, (_, i) => ambilWaktu(() => baca(token[i % token.length]))));
    laporan(`Baca serentak (gelombang ${g})`, hasil);
  }
}

if (!['login', 'baca'].includes(mode)) {
  console.error('Pakai: node scripts/uji-beban/beban.mjs login --n=20   ATAU   node scripts/uji-beban/beban.mjs baca --n=300 --sesi=30 [--ulang=5]');
  process.exit(2);
}
let akun;
try { akun = JSON.parse(readFileSync(join(DIR, 'akun.json'), 'utf8')); } catch {
  console.error(`Tidak dapat membaca ${join(DIR, 'akun.json')}. Buat dulu dari hasil supabase/demo/data_uji_beban.sql (lihat komentar di atas berkas ini).`);
  process.exit(2);
}
if (mode === 'login') await modeLogin(akun); else await modeBaca(akun);
