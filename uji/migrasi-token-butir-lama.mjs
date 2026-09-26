// Migrasi token butir lama: butir lulus tanpa token QR/kode diisi; yang sudah bertoken tidak berubah; alumni ikut; tanpa notifikasi baru; idempoten.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';

const P = process.cwd().replace(/\\/g, '/');
let g = 0, l = 0;
const ok = (c, m) => { if (c) { l++; console.log('ok   :', m); } else { g++; console.log('GAGAL:', m); } };
const bersih = (s) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-token-butir-lama.sql`, 'utf8'));

const db = new PGlite();
await siapkanPg(db, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: bersih(readFileSync(`${P}/supabase/skema.sql`, 'utf8')) });
await isiDataContoh(db);
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
// Penegak dengan butir lulus terbanyak menjadi alumni (data contoh pengujian tidak memuat status alumni; itu hanya untuk dev:lokal).
const alumni = (await q(`select peserta_id id from public.sku_progress where status = 'lulus' group by 1 order by count(*) desc, 1 limit 1`))[0].id;
await q(`update public.profiles set status = 'alumni', status_pada = sigarda.hari_ini(), lulus_ta = '2025/2026' where id = $1`, [alumni]);

// Keadaan lama: butir lulus dari data contoh dibuat "sebelum kolom token ada" (token kosong); sebagian juga tanpa kode.
const semuaLulus = (await q(`select count(*)::int n from public.sku_progress where status = 'lulus'`))[0].n;
ok(semuaLulus > 50, `data contoh punya ${semuaLulus} butir lulus`);
await db.exec('alter table public.sku_progress disable trigger tak_aktif_sku_progress'); // hanya untuk menyiapkan keadaan lama (butir alumni ikut dikosongkan)
const tetap = await q(`select peserta_id, sku_id, verifikasi_token t, verifikasi k from public.sku_progress where status = 'lulus' order by peserta_id, sku_id limit 5`);
await q(`update public.sku_progress set verifikasi_token = null where status = 'lulus' and (peserta_id, sku_id) not in (select peserta_id, sku_id from public.sku_progress where status = 'lulus' order by peserta_id, sku_id limit 5)`);
const tanpaKode = await q(`select peserta_id, sku_id from public.sku_progress where status = 'lulus' and verifikasi_token is null order by peserta_id, sku_id limit 3`);
for (const r of tanpaKode) await q(`update public.sku_progress set verifikasi = null, diverifikasi_pada = null where peserta_id = $1 and sku_id = $2`, [r.peserta_id, r.sku_id]);
await db.exec('alter table public.sku_progress enable trigger tak_aktif_sku_progress');
// Satu Penegak lulus lalu menjadi alumni: butirnya tetap harus diisi (pemicu penolak dimatikan hanya selama migrasi).
const butirAlumni = (await q(`select count(*)::int n from public.sku_progress where peserta_id = $1 and status = 'lulus' and verifikasi_token is null`, [alumni]))[0].n;
const bukanLulus = await q(`select peserta_id, sku_id, status, verifikasi_token from public.sku_progress where status <> 'lulus' order by peserta_id, sku_id`);
const notifSebelum = (await q(`select count(*)::int n from public.notifikasi`))[0].n;
const ringkasan = async () => (await q(`select peserta_id, sku_id, status, penguji_id, tanggal_uji::text, nilai from public.sku_progress order by peserta_id, sku_id`));
const inti = JSON.stringify(await ringkasan());
ok((await q(`select count(*)::int n from public.sku_progress where status = 'lulus' and verifikasi_token is null`))[0].n === semuaLulus - 5, `prasyarat: ${semuaLulus - 5} butir lulus tanpa token`);

console.log('--- Migrasi mengisi token dan kode ---');
await db.exec(MP);
const sisa = (await q(`select count(*)::int n from public.sku_progress where status = 'lulus' and (verifikasi_token is null or verifikasi is null or diverifikasi_pada is null)`))[0].n;
ok(sisa === 0, 'semua butir lulus kini punya token, kode, dan waktu verifikasi');
const uniknya = (await q(`select count(distinct verifikasi_token)::int n, count(*)::int t from public.sku_progress where verifikasi_token is not null`))[0];
ok(uniknya.n === uniknya.t && uniknya.n === semuaLulus, `token unik satu per butir lulus (${uniknya.n})`);
ok((await q(`select bool_and(verifikasi_token ~ '^[0-9a-f]{32}$' and verifikasi ~ '^VRF-[0-9A-F]{7}$') ok from public.sku_progress where status = 'lulus'`))[0].ok === true, 'bentuk token (32 heksadesimal) dan kode (VRF-XXXXXXX) sah');
for (const t of tetap) {
  const s = (await q(`select verifikasi_token t, verifikasi k from public.sku_progress where peserta_id = $1 and sku_id = $2`, [t.peserta_id, t.sku_id]))[0];
  ok(s.t === t.t && s.k === t.k, 'token dan kode yang sudah ada tidak berubah (QR yang sudah dicetak tetap sah)');
}
for (const r of tanpaKode) {
  const s = (await q(`select verifikasi k, diverifikasi_pada is not null w from public.sku_progress where peserta_id = $1 and sku_id = $2`, [r.peserta_id, r.sku_id]))[0];
  ok(/^VRF-[0-9A-F]{7}$/.test(s.k) && s.w, 'butir lulus tanpa kode diberi kode dan waktu verifikasi');
}
ok(butirAlumni > 0 && (await q(`select count(*)::int n from public.sku_progress where peserta_id = $1 and status = 'lulus' and verifikasi_token is null`, [alumni]))[0].n === 0, `butir milik alumni ikut diisi (${butirAlumni} butir)`);
ok(JSON.stringify(await ringkasan()) === inti, 'status, penguji, tanggal uji, dan nilai tidak berubah');
const lain = await q(`select peserta_id, sku_id, status, verifikasi_token from public.sku_progress where status <> 'lulus' order by peserta_id, sku_id`);
ok(JSON.stringify(lain) === JSON.stringify(bukanLulus) && lain.every((r) => r.verifikasi_token === null), `butir yang belum lulus (${lain.length}) tidak diberi token`);
ok((await q(`select count(*)::int n from public.notifikasi`))[0].n === notifSebelum, 'tidak ada notifikasi baru');
ok((await q(`select tgenabled from pg_trigger where tgname = 'tak_aktif_sku_progress'`))[0].tgenabled === 'O', 'pemicu penolak peserta tak aktif menyala kembali');

console.log('\n--- Pengaman peserta tak aktif tetap berlaku sesudah migrasi ---');
let galat = null;
try { await db.query(`update public.sku_progress set catatan = 'x' where peserta_id = $1 and status = 'lulus'`, [alumni]); } catch (e) { galat = e.message; }
ok(/berstatus alumni/.test(galat ?? ''), 'menulis butir alumni tetap ditolak: ' + (galat ?? 'TIDAK DITOLAK').slice(0, 70));

console.log('\n--- Idempoten ---');
const tokenSebelum = JSON.stringify(await q(`select peserta_id, sku_id, verifikasi_token, verifikasi from public.sku_progress order by 1, 2`));
await db.exec(MP); await db.exec(MP);
ok(JSON.stringify(await q(`select peserta_id, sku_id, verifikasi_token, verifikasi from public.sku_progress order by 1, 2`)) === tokenSebelum, 'menjalankan migrasi lagi tidak mengubah apa pun');

console.log('\n--- Tanpa kolom token: gagal jelas ---');
{
  const B = new PGlite();
  await B.exec('create schema sigarda; create table public.sku_progress (peserta_id uuid, sku_id text, status text);');
  let e2 = null;
  try { await B.exec(MP); } catch (e) { e2 = e.message; await B.exec('rollback'); }
  ok(/Jalankan lebih dulu skema dan migrasi/.test(e2 ?? ''), 'pesan yang menuntun: ' + (e2 ?? 'TIDAK GAGAL').slice(0, 90));
}

console.log(`\nRINGKASAN MIGRASI TOKEN BUTIR LAMA: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
