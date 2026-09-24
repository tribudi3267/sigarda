// Tahap L0: skrip supabase/demo/periksa_pemasangan.sql (hanya membaca) dan notifikasi uji (sg_notifikasi_tes). Pemeriksa harus: tidak usang terhadap skema terbaru,
// menyatakan OK pada skema terbaru, mendeteksi KURANG/BEDA pada skema lama, sembuh sesudah migrasi dijalankan, dan tidak tertipu CRLF.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { skemaLama } from '../scripts/skema-lama.mjs';
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
const skemaDari = (ref) => (ref === 'kini' ? readFileSync(`${P}/supabase/skema.sql`, 'utf8') : skemaLama(ref, P));
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

console.log('\n--- Sebelum L0: notifikasi uji dan pemeriksaan data belum ada; migrasi menyembuhkan ---');
{
  const S = await baru('9eb504d'); // tepat sebelum tahap L0 (skema sesudah fase 6b)
  const m = masalah(await jalankan(S));
  ok(m.length === 244 && m.some((x) => /sg_notifikasi_tes/.test(x.objek) && x.status === 'KURANG') && m.some((x) => /notifikasi_jenis_check/.test(x.objek) && x.status === 'BEDA')
      && m.some((x) => /sg_pemeriksaan_data/.test(x.objek) && x.status === 'KURANG') && m.some((x) => /sg_push_ringkasan/.test(x.objek) && /^BEDA/.test(x.status)) && m.some((x) => /sg_cadangan_admin/.test(x.objek) && x.status === 'KURANG')
      && m.some((x) => /sg_cadangan_status/.test(x.objek) && x.status === 'KURANG') && m.some((x) => /notif_pengingat/.test(x.objek) && /^BEDA/.test(x.status))
      && m.some((x) => x.objek === 'profiles.whatsapp' && x.status === 'KURANG') && m.some((x) => /sg_profil_whatsapp_atur/.test(x.objek) && x.status === 'KURANG')
      && m.some((x) => /sg_eskalasi_daftar/.test(x.objek) && x.status === 'KURANG')
      && m.some((x) => x.objek === 'agenda' && x.status === 'KURANG') && m.some((x) => /sg_agenda_simpan/.test(x.objek) && x.status === 'KURANG')
      && m.some((x) => /sg_agenda_hapus/.test(x.objek) && x.status === 'KURANG') && m.some((x) => /agenda_proses/.test(x.objek) && x.status === 'KURANG')
      && m.some((x) => x.objek === 'kegiatan_usulan' && x.status === 'KURANG') && m.some((x) => /sg_kegiatan_usul/.test(x.objek) && x.status === 'KURANG')
      && m.some((x) => /sg_kegiatan_tinjau/.test(x.objek) && x.status === 'KURANG') && m.some((x) => /sg_kegiatan_ping/.test(x.objek) && x.status === 'KURANG')
      && m.some((x) => /musyawarah_pengingat/.test(x.objek) && x.status === 'KURANG') && m.some((x) => /kegiatan_pengingat/.test(x.objek) && x.status === 'KURANG')
      && m.some((x) => x.objek === 'garuda_berkas_token' && x.status === 'KURANG') && m.some((x) => /sg_garuda_berkas_baca/.test(x.objek) && x.status === 'KURANG')
      && m.some((x) => /sg_garuda_token_buat/.test(x.objek) && x.status === 'KURANG') && m.some((x) => /sg_garuda_token_baca/.test(x.objek) && x.status === 'KURANG')
      && m.some((x) => x.objek === 'bina_damping' && x.status === 'KURANG') && m.some((x) => x.objek === 'profiles.pinsa' && x.status === 'KURANG') && m.some((x) => /sg_bina_damping_atur/.test(x.objek) && x.status === 'KURANG')
      && m.some((x) => x.objek === 'sku_pra_uji' && x.status === 'KURANG') && m.some((x) => /sg_pra_uji_catat/.test(x.objek) && x.status === 'KURANG') && m.some((x) => /pra_uji_aktif/.test(x.objek) && x.status === 'KURANG'),
    `${m.length} temuan (tabel agenda, kegiatan_usulan, dan garuda_berkas_token baru membawa banyak kolom/batasan/indeks/kebijakan sekaligus): notifikasi uji, pemeriksaan data, cadangan (L4), eskalasi (L5), agenda (L6), usulan kegiatan (L6b), berkas Calon Garuda (L7), pengukuhan Dewan (Fase A), Pinsa dan Bina Damping (Fase B), pra-uji (Fase C), sg_push_ringkasan versi lama (periksa-dewan), , 10 indeks kunci asing, dan keep-alive dari dalam database, serta Pinsa dan Bina Damping (fase B) belum ada/berbeda: ` + JSON.stringify(m.map((x) => x.objek)));
  const migrasiL0L6b = ['2026-09-tes-notifikasi', '2026-09-pemeriksaan-data', '2026-09-cadangan', '2026-09-eskalasi', '2026-09-agenda', '2026-09-usulan-kegiatan', '2026-09-berkas-garuda', '2026-09-periksa-dewan', '2026-09-indeks-fk', '2026-09-keepalive', '2026-09-pinsa-bina-damping', '2026-09-pengukuhan-dewan', '2026-09-pra-uji'];
  for (const nama of migrasiL0L6b) await S.exec(bersih(readFileSync(`${P}/supabase/migrasi/${nama}.sql`, 'utf8')));
  ok(masalah(await jalankan(S)).length === 0, 'sesudah migrasi tes-notifikasi, pemeriksaan-data, cadangan, eskalasi, agenda, usulan-kegiatan, berkas-garuda, periksa-dewan, indeks-fk, keepalive, pinsa-bina-damping, pengukuhan-dewan, dan pra-uji: tidak ada masalah');
  for (const nama of migrasiL0L6b) await S.exec(bersih(readFileSync(`${P}/supabase/migrasi/${nama}.sql`, 'utf8')));
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

console.log('\n--- NOT NULL bukan batasan (PostgreSQL 18 mencatatnya di pg_constraint) ---');
ok(!berkas.includes('_not_null'), 'berkas periksa tidak memuat batasan bernama *_not_null (temuan palsu 229 baris pada Supabase PostgreSQL 15/17)');

console.log('\n--- periksa_push.sql (diagnosis push; hanya membaca) ---');
{
  const push = bersih(readFileSync(`${P}/supabase/demo/periksa_push.sql`, 'utf8'));
  ok(/HANYA MEMBACA/.test(push) && !/\b(insert|update|delete|drop|alter|truncate)\b\s+(into|table|from|function)/i.test(push.replace(/^--.*$/gm, '')), 'berkas hanya membaca');
  const D = await baru('kini');
  await D.exec('create schema net; create table net._http_response (id bigint, status_code int, content_type text, headers jsonb, content text, timed_out boolean, error_msg text, created timestamptz default now())');
  let r = (await D.query(push)).rows;
  ok(r.some((x) => x.bagian === 'Konfigurasi' && /belum diisi/.test(x.keterangan)) && r.some((x) => x.bagian === 'Respons pg_net terbaru' && /TIDAK ADA respons/.test(x.keterangan)), 'tanpa konfigurasi dan tanpa respons: keduanya dilaporkan');
  ok(r.filter((x) => x.bagian === 'Petunjuk').length === 7, 'petunjuk pembacaan hasil ikut ditampilkan');
  await D.exec("insert into public.push_konfigurasi (url, rahasia, kunci_publik) values ('https://abcdefgh.supabase.co/functions/v1/notif-push', 'rahasia-rahasia-rahasia-rahasia', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')");
  await D.exec(`insert into net._http_response (id, status_code, content, timed_out, error_msg) values (1, 401, '{"code":401,"message":"Missing authorization header"}', false, null), (2, null, null, true, 'Timeout was reached')`);
  r = (await D.query(push)).rows;
  const k = r.find((x) => x.bagian === 'Konfigurasi');
  ok(k && /panjang rahasia: 31/.test(k.keterangan) && !/rahasia-rahasia/.test(JSON.stringify(r)), 'konfigurasi tampil tanpa membocorkan rahasia (hanya panjangnya)');
  ok(r.some((x) => x.bagian === 'Respons pg_net terbaru' && /HTTP 401/.test(x.keterangan) && /Missing authorization header/.test(x.keterangan)) && r.some((x) => /WAKTU HABIS/.test(x.keterangan) && /Timeout/.test(x.keterangan)), 'respons pg_net (401 dan waktu habis) tampil beserta isinya');
  ok(!r.some((x) => /PERHATIAN: alamat fungsi/.test(x.keterangan)), 'alamat fungsi yang benar tidak diberi peringatan');
  await D.exec("update public.push_konfigurasi set url = 'https://abcdefgh.supabase.co/functions/v1/push'");
  ok((await D.query(push)).rows.some((x) => /PERHATIAN: alamat fungsi/.test(x.keterangan)), 'alamat fungsi yang salah nama diberi peringatan');
  await D.exec("insert into public.notifikasi (penerima_id, jenis, judul) select id, 'tes', 'Notifikasi uji' from public.profiles limit 1").catch(() => {});
}

console.log(`\nRINGKASAN PERIKSA-PEMASANGAN: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
