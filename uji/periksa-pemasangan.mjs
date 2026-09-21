// Tahap L0: skrip supabase/demo/periksa_pemasangan.sql (hanya membaca) dan notifikasi uji (sg_notifikasi_tes). Pemeriksa harus: tidak usang terhadap skema terbaru,
// menyatakan OK pada skema terbaru, mendeteksi KURANG/BEDA pada skema lama, sembuh sesudah migrasi dijalankan, dan tidak tertipu CRLF.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { penjelasanTes, KAPAN_NOTIFIKASI, LABEL_JENIS } from '../src/lib/notifikasiLogic.js';
import { susunPeriksa } from '../scripts/buat-periksa.mjs';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const bersih = (s) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
const skemaDari = (ref) => (ref === 'kini' ? readFileSync(`${P}/supabase/skema.sql`, 'utf8') : execFileSync('git', ['show', `${ref}:supabase/skema.sql`], { cwd: P, encoding: 'utf8', maxBuffer: 1 << 26 }));
const baru = async (ref) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(ref)) }); return db; };
const berkas = bersih(readFileSync(`${P}/supabase/demo/periksa_pemasangan.sql`, 'utf8'));
const jalankan = async (db, sql = berkas) => (await db.query(sql)).rows;
const masalah = (r) => r.filter((x) => x.urut === 1);

console.log('--- Berkas periksa_pemasangan.sql tidak usang ---');
ok(bersih(await susunPeriksa(P)) === berkas, 'isi berkas sama dengan hasil npm run periksa (jalankan npm run periksa bila gagal)');
ok(/HANYA MEMBACA/.test(berkas) && !/\b(insert|update|delete|drop|alter|truncate|create)\b\s+(into|table|function|from|policy|index|extension)/i.test(berkas.replace(/^--.*$/gm, '')), 'berkas hanya membaca (tanpa perintah penulisan)');

console.log('\n--- Skema terbaru: semua OK ---');
const A = await baru('kini');
{
  const r = await jalankan(A);
  ok(masalah(r).length === 0, 'tidak ada masalah pada skema terbaru' + (masalah(r).length ? ': ' + JSON.stringify(masalah(r).slice(0, 5)) : ''));
  const ring = r.filter((x) => x.urut === 0);
  ok(ring.length >= 7 && ring.every((x) => x.status === 'OK'), 'ringkasan per kategori: ' + ring.map((x) => x.objek).join(' | '));
  ok(r.some((x) => x.kategori === 'Edge Function' && /PERIKSA MANUAL/.test(x.status)), 'pengingat memeriksa Edge Function secara manual');
  const ling = r.filter((x) => x.kategori === 'Lingkungan');
  ok(ling.length === 4 && ling.every((x) => /PERHATIAN|KURANG/.test(x.status)), 'lingkungan: pg_net, pg_cron, jadwal, dan push belum aktif di PGlite dilaporkan sebagai PERHATIAN');
}

console.log('\n--- Kerusakan terdeteksi ---');
{
  const B = await baru('kini');
  const status = async (kat, objek) => (await jalankan(B)).find((x) => x.kategori === kat && x.objek.includes(objek))?.status;
  await B.exec('alter table public.profiles drop constraint profil_jabatan_dewan');
  ok((await status('Batasan', 'profiles.profil_jabatan_dewan')) === 'KURANG', 'batasan yang hilang: KURANG');
  await B.exec("alter table public.profiles add constraint profil_jabatan_dewan check (jabatan_dewan is null or (role = 'penguji' and jabatan = 'Dewan Ambalan'))");
  ok((await status('Batasan', 'profiles.profil_jabatan_dewan')) === 'BEDA', 'batasan versi lama (makna berbeda): BEDA');
  await B.exec('drop policy baca_penugasan_peserta on public.penugasan_peserta');
  ok((await status('Kebijakan akses', 'penugasan_peserta.baca_penugasan_peserta')) === 'KURANG', 'kebijakan yang hilang: KURANG');
  await B.exec('alter table public.kepengurusan_log disable row level security');
  ok((await status('Tabel', 'kepengurusan_log')) === 'RLS BEDA', 'RLS dimatikan: RLS BEDA');
  await B.exec('drop trigger notif_dokumen on public.dokumen_terbit');
  ok((await status('Pemicu', 'dokumen_terbit.notif_dokumen')) === 'KURANG', 'pemicu hilang: KURANG');
  await B.exec('alter table public.iuran drop column jumlah');
  ok((await status('Kolom', 'iuran.jumlah')) === 'KURANG', 'kolom hilang: KURANG');
  await B.exec('drop index public.sku_progress_verifikasi_idx');
  ok((await status('Indeks', 'sku_progress_verifikasi_idx')) === 'KURANG', 'indeks hilang: KURANG');
  await B.exec(`create or replace function sigarda.rapikan(p_teks text) returns text language sql immutable as $$ select btrim(coalesce(p_teks, '')) $$`);
  ok((await status('Fungsi', 'sigarda.rapikan(')).startsWith('BEDA'), 'isi fungsi berubah: BEDA');
  await B.exec('revoke execute on function public.sg_sku_ajukan(text, date, uuid, text) from authenticated');
  ok((await status('Fungsi', 'public.sg_sku_ajukan(')) === 'HAK BEDA', 'hak eksekusi dicabut: HAK BEDA');
  await B.exec('drop function public.sg_sku_batal(text)');
  ok((await status('Fungsi', 'public.sg_sku_batal(')) === 'KURANG', 'fungsi hilang: KURANG');
  const r = await jalankan(B);
  ok(r.filter((x) => x.urut === 0 && /^PERIKSA/.test(x.status)).length >= 6, 'ringkasan menandai kategori yang bermasalah');
}

console.log('\n--- Tidak tertipu CRLF (tempelan dari Windows) ---');
{
  const C = await baru('kini');
  const asli = (await C.query(`select prosrc from pg_proc where proname = 'wajib_aktif' and pronamespace = 'sigarda'::regnamespace`)).rows[0].prosrc;
  ok(asli.includes('\n'), 'prasyarat: fungsi uji berisi banyak baris');
  await C.exec(`create or replace function sigarda.wajib_aktif() returns void language plpgsql stable security definer set search_path = public as $tanda$${asli.replace(/\n/g, '\r\n')}$tanda$`);
  ok((await C.query(`select prosrc like '%' || chr(13) || '%' as ada from pg_proc where proname = 'wajib_aktif' and pronamespace = 'sigarda'::regnamespace`)).rows[0].ada, 'prasyarat: isi fungsi kini bercampur CRLF');
  ok(masalah(await jalankan(C)).length === 0, 'CRLF tidak dianggap perbedaan');
}

console.log('\n--- Skema lama: pemeriksa menunjukkan yang belum dimigrasi ---');
{
  const L = await baru('cc55c61'); // sebelum fase 6b
  const r = await jalankan(L);
  const m = masalah(r);
  ok(m.some((x) => x.kategori === 'Tabel' && x.objek === 'penugasan_peserta' && x.status === 'KURANG') && m.some((x) => x.kategori === 'Fungsi' && /sg_kepengurusan_terapkan/.test(x.objek) && x.status === 'KURANG'), 'sebelum 6b: tabel dan fungsi kepengurusan KURANG');
  ok(m.some((x) => /penguji_peran_ok/.test(x.objek) && /^BEDA/.test(x.status)), 'sebelum 6b: fungsi yang ditimpa migrasi dilaporkan BEDA');
  ok(m.some((x) => x.kategori === 'Batasan' && /jabatan_dewan/.test(x.objek)), 'sebelum 6b: batasan jabatan Dewan versi lama terdeteksi');
  ok(r.some((x) => x.urut === 0 && /^PERIKSA/.test(x.status)), 'ringkasan menyatakan PERIKSA');
}

console.log('\n--- Sebelum L0: hanya notifikasi uji yang belum ada; migrasi menyembuhkan ---');
{
  const S = await baru('9eb504d'); // tepat sebelum tahap L0 (skema sesudah fase 6b)
  const m = masalah(await jalankan(S));
  ok(m.length === 2 && m.some((x) => /sg_notifikasi_tes/.test(x.objek) && x.status === 'KURANG') && m.some((x) => /notifikasi_jenis_check/.test(x.objek) && x.status === 'BEDA'), 'hanya dua temuan: sg_notifikasi_tes KURANG dan notifikasi_jenis_check BEDA: ' + JSON.stringify(m.map((x) => x.objek)));
  await S.exec(bersih(readFileSync(`${P}/supabase/migrasi/2026-09-tes-notifikasi.sql`, 'utf8')));
  ok(masalah(await jalankan(S)).length === 0, 'sesudah migrasi 2026-09-tes-notifikasi.sql: tidak ada masalah');
  await S.exec(bersih(readFileSync(`${P}/supabase/migrasi/2026-09-tes-notifikasi.sql`, 'utf8')));
  ok(masalah(await jalankan(S)).length === 0, 'migrasi dijalankan dua kali: tetap tidak ada masalah');
  let g = ''; const T = await baru('2a8ebc3'); try { await T.exec(bersih(readFileSync(`${P}/supabase/migrasi/2026-09-tes-notifikasi.sql`, 'utf8'))); } catch (e) { g = e.message; }
  ok(/Jalankan lebih dulu skema dan migrasi/.test(g), 'tanpa migrasi sebelumnya: gagal dengan pesan yang menuntun');
}

console.log('\n--- Notifikasi uji (sg_notifikasi_tes) ---');
{
  const pg = new PGlite();
  await siapkanPg(pg, { sqlStub: stub, sqlSkema: bersih(skemaDari('kini')) });
  await isiDataContoh(pg);
  await pg.query('update public.profiles set wajib_ganti_pin = false');
  const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
  const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
  const ahmad = await masuk('10231', PIN_DEMO.penegak), pembina = await masuk('pembina', PIN_DEMO.pembina);
  await q('delete from public.notifikasi');
  let r = await ahmad.a.kirimNotifikasiTes();
  ok(r.ok && r.data.id > 0 && r.data.perangkat === 0 && r.data.terkonfigurasi === false && r.data.pg_net === false, 'notifikasi uji dibuat; tanpa perangkat dan tanpa konfigurasi dilaporkan apa adanya: ' + JSON.stringify(r.data));
  const n = (await ahmad.a.muatNotifikasiId(r.data.id)).data;
  ok(n && n.jenis === 'tes' && n.judul === 'Notifikasi uji' && n.dibaca === false && n.pushStatus === null && n.tautan.tab === 'notifikasi', 'notifikasi uji milik sendiri terbaca (jenis tes, belum ada status push)');
  ok((await pembina.a.muatNotifikasiId(r.data.id)).data === null, 'pengguna lain tidak melihat notifikasi uji orang lain (RLS)');
  ok((await q(`select count(*)::int n from public.notifikasi where penerima_id = $1`, [ahmad.id]))[0].n === 1 && (await q(`select count(*)::int n from public.notifikasi where penerima_id <> $1`, [ahmad.id]))[0].n === 0, 'hanya pemanggil yang menerima');
  await q(`insert into public.push_langganan (penerima_id, endpoint, p256dh, auth) values ($1, 'https://push.example/abcdefghijklmnop', 'p256dh-abcdefghijklmnopqrst', 'auth-abcdef')`, [ahmad.id]);
  await q(`insert into public.push_konfigurasi (url, rahasia, kunci_publik) values ('https://x.supabase.co/functions/v1/notif-push', 'rahasia-rahasia-rahasia-rahasia', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')`).catch(() => {});
  r = await ahmad.a.kirimNotifikasiTes();
  ok(r.ok && r.data.perangkat === 1, 'perangkat berlangganan terhitung: ' + JSON.stringify(r.data));
  for (let i = 0; i < 3; i++) await ahmad.a.kirimNotifikasiTes();
  r = await ahmad.a.kirimNotifikasiTes();
  ok(!r.ok && /Terlalu sering/.test(r.pesan), 'dibatasi 5 kali per 10 menit: ' + (r.pesan ?? ''));
  await q(`update public.notifikasi set dibuat = now() - interval '11 minutes' where jenis = 'tes'`);
  ok((await ahmad.a.kirimNotifikasiTes()).ok, 'sesudah 10 menit dapat mengirim lagi');
  const anon = await sqlSebagai(pg, null, `select public.sg_notifikasi_tes()`).then(() => 'jalan', (e) => e.message);
  ok(/permission denied|Ganti PIN|function/i.test(anon), 'tanpa login ditolak: ' + anon.slice(0, 60));
  await q(`update public.profiles set wajib_ganti_pin = true where id = $1`, [ahmad.id]);
  ok(!(await ahmad.a.kirimNotifikasiTes()).ok, 'PIN awal belum diganti: ditolak');
}

console.log('\n--- Penjelasan hasil uji (klien) ---');
{
  const H = { perangkat: 1, terkonfigurasi: true, pg_net: true };
  ok(penjelasanTes({ ...H, terkonfigurasi: false }).tingkat === 'galat' && /push_atur/.test(penjelasanTes({ ...H, terkonfigurasi: false }).teks), 'server belum dikonfigurasi: menyebut sigarda.push_atur');
  ok(/pg_net/.test(penjelasanTes({ ...H, pg_net: false }).teks), 'pg_net belum aktif: dijelaskan');
  ok(/Belum ada perangkat/.test(penjelasanTes({ ...H, perangkat: 0 }).teks), 'belum ada perangkat: dijelaskan');
  ok(penjelasanTes(H).tingkat === 'tunggu' && penjelasanTes(H, 'dikirim').tingkat === 'ok' && penjelasanTes(H, 'gagal').tingkat === 'galat' && /notif-push/.test(penjelasanTes(H, null, true).teks), 'menunggu, dikirim, gagal, dan habis waktu');
  ok(LABEL_JENIS.tes === 'Uji' && KAPAN_NOTIFIKASI.penegak.length >= 4 && KAPAN_NOTIFIKASI.penguji.length >= 4, 'label jenis uji dan daftar kejadian per peran');
}

console.log(`\nRINGKASAN PERIKSA-PEMASANGAN: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
