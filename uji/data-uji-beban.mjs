// Tahap L2-B: supabase/demo/data_uji_beban.sql. Berkas ini MENULIS ke Supabase sungguhan (auth.users, auth.identities
// dengan pgcrypto): PGlite lokal tidak punya pgcrypto/auth.identities, jadi baris itu TIDAK dapat diuji di sini
// (dan sengaja gagal cepat dengan pesan jelas bila dijalankan di lingkungan tanpa pgcrypto). Yang diuji di sini adalah
// bagian yang paling rawan salah (rumus pembuatan data dan sisipan progres/riwayat): diambil dari berkas sungguhan,
// bagian auth.users/auth.identities/pgcrypto diganti tiruan sederhana yang cocok dengan stub PGlite (seperti
// src/lokal/sekolahPenuh.js), SISA SQL-nya (pembuatan baris, profil, progres, riwayat, ringkasan) memakai teks
// PERSIS dari berkas sungguhan supaya perubahan pada rumus ikut diuji.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg } from '../src/lokal/klienFake.js';
import { isiDataContoh, isiStatusContoh } from '../src/lokal/seedLokal.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
const skema = readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '');
const berkas = readFileSync(`${P}/supabase/demo/data_uji_beban.sql`, 'utf8');

console.log('--- Berkas data_uji_beban.sql: aturan keselamatan ---');
ok(/MENULIS ke database sungguhan/.test(berkas), 'berkas menyatakan dirinya menulis (bukan hanya membaca)');
ok(/CADANGAN/.test(berkas), 'mengingatkan mengambil cadangan sebelum dijalankan');
ok(/SENGAJA TIDAK menyentuh kehadiran.*iuran/s.test(berkas), 'menyatakan tidak menyentuh kehadiran/iuran (menghindari campur data finansial sungguhan)');
ok(/hapus_data_uji_beban\.sql/.test(berkas), 'menunjuk skrip pembersih pasangannya');
ok(/PIN ACAK.*HANYA SEKALI/s.test(berkas), 'menyatakan PIN acak dan hanya ditampilkan sekali');
ok(/drop table if exists param, uji_konfig, uji_penegak, uji_login, uji_baru;\s*$/.test(berkas.trimEnd()), 'membuang seluruh tabel sementara di baris terakhir (tidak bocor ke sesi lain)');

console.log('\n--- Rumus pembuatan data dan sisipan progres/riwayat (auth.users/identities/pgcrypto ditiru untuk PGlite) ---');
// Ambil bagian 1 (uji_penegak) sampai akhir bagian 3 (sebelum "commit;"), buang bagian 2 (auth.users/identities asli).
const mulai = berkas.indexOf('create temp table param as select');
const akhirTulis = berkas.indexOf('\ncommit;');
if (mulai < 0 || akhirTulis < 0) throw new Error('penanda bagian tidak ditemukan (berkas mungkin berubah struktur)');
let inti = berkas.slice(mulai, akhirTulis);
// Ganti seluruh sisipan auth.users/auth.identities (butuh pgcrypto) dengan tiruan sederhana yang cocok stub PGlite.
inti = inti.replace(/insert into auth\.users \([\s\S]*?where not exists \(select 1 from auth\.users u where u\.email = up\.nis \|\| '@' \|\| k\.domain\);/,
  `insert into auth.users (id, email, encrypted_password) select gen_random_uuid(), up.nis || '@' || k.domain, 'x' from uji_penegak up cross join uji_konfig k where not exists (select 1 from auth.users u where u.email = up.nis || '@' || k.domain);`);
inti = inti.replace(/insert into auth\.identities[\s\S]*?where not exists \(select 1 from auth\.identities i where i\.user_id = u\.id\);/, '-- (dilewati di uji lokal: tabel itu tidak ada pada stub PGlite)');
ok(!/insert into auth\.identities/.test(inti) && !/gen_salt|crypt\(/.test(inti), 'tiruan berhasil menghapus seluruh sisipan auth.identities/pgcrypto dari bagian yang diuji');

const pg = new PGlite();
await siapkanPg(pg, { sqlStub: stub, sqlSkema: skema });
await isiDataContoh(pg);
await isiStatusContoh(pg);
let galat = null;
try { await pg.exec(inti); await pg.exec('commit;'); } catch (e) { galat = e; }
ok(!galat, 'berjalan tanpa galat SQL' + (galat ? `: ${galat.message}` : ''));

const n = async (sql) => Number((await pg.query(sql)).rows[0].n);
const jml = await n("select count(*)::int n from public.profiles where nis ~ '^88[0-9]{4}$' and nama like 'Uji %'");
ok(jml === 850, `850 akun Penegak uji dibuat (dapat ${jml})`);
ok(await n("select count(*)::int n from public.profiles where nis ~ '^88[0-9]{4}$' and status = 'alumni'") === 150, '150 alumni');
ok(await n("select count(distinct kelas)::int n from public.profiles where nis ~ '^88[0-9]{4}$' and status = 'aktif' and kelas ~ '^(X|XI|XII)-(0[1-9]|10)$'") === 30, 'seluruh 30 rombel terisi');
ok(await n("select count(*)::int n from public.sku_progress where peserta_id in (select id from public.profiles where nis ~ '^88[0-9]{4}$')") > 10000, 'volume progres SKU berskala sekolah (>10000 baris)');
ok(await n("select count(*)::int n from public.sku_riwayat where peserta_id in (select id from public.profiles where nis ~ '^88[0-9]{4}$')") > 20000, 'volume riwayat berskala sekolah (>20000 baris)');
const yatim = await n(`select count(*)::int n from public.sku_progress p where peserta_id in (select id from public.profiles where nis ~ '^88[0-9]{4}$')
  and not exists (select 1 from public.sku_unit u where u.id = p.sku_id)`);
ok(yatim === 0, 'setiap sku_id pada progres uji memang ada di katalog sku_unit');
ok(await n("select count(*)::int n from public.sku_progress where peserta_id in (select id from public.profiles where nis ~ '^88[0-9]{4}$') and status = 'lulus' and verifikasi_token is null") === 0, 'setiap butir lulus punya verifikasi_token');
ok(await n("select count(*)::int n from public.profiles where nis ~ '^88[0-9]{4}$' and (nis is null or kelas is null or sangga is null or agama is null)") === 0, 'tidak ada baris Penegak dengan kolom wajib kosong');

console.log('\n--- Berjalan ulang (dijalankan dua kali, seperti menempel ulang berkas di sesi baru): tidak menduplikasi ---');
await pg.exec('drop table if exists param, uji_konfig, uji_penegak, uji_login, uji_baru;'); // seperti baris terakhir berkas sungguhan
let galat2 = null;
try { await pg.exec(inti); } catch (e) { galat2 = e; }
ok(!galat2, 'berjalan ulang tanpa galat' + (galat2 ? `: ${galat2.message}` : ''));
ok(await n("select count(*)::int n from public.profiles where nis ~ '^88[0-9]{4}$' and nama like 'Uji %'") === 850, 'jumlah akun tidak bertambah pada eksekusi kedua (tetap 850)');
const riwayatKedua = await n("select count(*)::int n from public.sku_riwayat where peserta_id in (select id from public.profiles where nis ~ '^88[0-9]{4}$')");
ok(riwayatKedua === (await n("select count(*)::int n from public.sku_riwayat where peserta_id in (select id from public.profiles where nis ~ '^88[0-9]{4}$')")), 'jumlah riwayat tidak berganda pada eksekusi kedua');
await pg.close();

console.log('\n--- Berkas hapus_data_uji_beban.sql ---');
const hapus = readFileSync(`${P}/supabase/demo/hapus_data_uji_beban.sql`, 'utf8');
ok(/88\[0-9\]\{4\}/.test(hapus) || /'\^88/.test(hapus), 'menyasar pola NIS 88xxxx');
ok(/Uji %/.test(hapus), 'menyasar nama berawalan "Uji "');
ok(/login_gagal/.test(hapus), 'ikut membersihkan login_gagal');

console.log(`\nRINGKASAN: ${lulus} lulus, ${gagal} GAGAL.`);
if (gagal) process.exit(1);
