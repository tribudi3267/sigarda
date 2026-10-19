// Verifikasi PIN tanpa sesi Auth (sg_pin_periksa_internal + Edge Function sigarda): PIN penguji saat mencatat hasil dan PIN lama saat ganti PIN
// dicocokkan dengan hash bcrypt sungguhan (pgcrypto) TANPA masuk ulang ke Auth, percobaan salah tetap dihitung dan mengunci, hanya service_role
// yang dapat memanggilnya, cara lama tetap menjadi cadangan (hash bukan bcrypt, pgcrypto tidak ada, migrasi belum dijalankan), dan migrasinya
// setara dengan skema baru, idempoten, serta gagal jelas tanpa prasyarat.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';
import { skemaLama } from '../scripts/skema-lama.mjs';
import { siapkanPg, buatDepsEdge } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { tangani } from '../supabase/functions/sigarda/index.ts';

const P = process.cwd().replace(/\\/g, '/');
let g = 0, l = 0;
const ok = (c, m) => { if (c) { l++; console.log('ok   :', m); } else { g++; console.log('GAGAL:', m); } };
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
const bersih = (s) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-10-pin-tanpa-sesi.sql`, 'utf8'));
const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (ref, opsi = {}) => { const db = new PGlite(opsi); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(ref)) }); return db; };

/* ------------------------------ Perilaku (bcrypt sungguhan) ------------------------------ */
const pg = await baru(`${P}/supabase/skema.sql`, { extensions: { pgcrypto } });
await isiDataContoh(pg);
await pg.exec('create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions;');
await pg.query('update public.profiles set wajib_ganti_pin = false');
const idDari = async (u) => (await pg.query('select id from public.profiles where username = $1', [u])).rows[0].id;
const idPembina = await idDari('pembina');
const PIN = '851362';
// Hash bergaya Supabase Auth (GoTrue: bcrypt $2a$, biaya 10).
await pg.query(`update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf', 10)) where id = $1`, [idPembina, PIN]);
const hashAwal = (await pg.query('select encrypted_password h from auth.users where id = $1', [idPembina])).rows[0].h;
ok(/^\$2a\$10\$.{53}$/.test(hashAwal), 'hash uji berbentuk bcrypt Supabase Auth: ' + hashAwal.slice(0, 7));

const dasar = buatDepsEdge(pg);
let masukUlang = 0;
const deps = { ...dasar, masukDenganPassword: async (...a) => { masukUlang++; return dasar.masukDenganPassword(...a); } };
const token = (id) => `lokal.${id}.1`;
const gagalPembina = async () => (await pg.query(`select jumlah, terkunci_sampai from public.login_gagal where username = 'pembina'`)).rows[0];

console.log('--- Catat hasil: PIN penguji dicocokkan di basis data, tanpa sesi baru ---');
const ahmad = await idDari('10231');
const catat = (pin) => tangani({ aksi: 'catat-hasil', pin, pesertaId: ahmad, skuId: 'BAN-08', hasil: 'lulus', tanggalUji: '2026-09-19', nilai: 'Baik', catatan: '' }, `Bearer ${token(idPembina)}`, deps);
let r = await catat('000000');
ok(!r.ok && /PIN verifikasi salah\. Hasil belum disimpan\. Sisa 4 percobaan/.test(r.pesan), 'PIN salah ditolak dengan sisa percobaan: ' + r.pesan);
ok((await gagalPembina())?.jumlah === 1, 'percobaan salah tercatat di login_gagal');
r = await catat('12a456');
ok(!r.ok && /Sisa 3/.test(r.pesan), 'PIN bukan 6 angka juga dihitung salah: ' + r.pesan);
r = await catat(PIN);
ok(r.ok, 'PIN benar: hasil tercatat' + (r.ok ? '' : ': ' + r.pesan));
ok(!(await gagalPembina()), 'PIN benar melepas hitungan salah');
const status = (await pg.query(`select status from public.sku_progress where peserta_id = $1 and sku_id = 'BAN-08'`, [ahmad])).rows[0]?.status;
ok(status === 'lulus', 'hasil uji tersimpan: ' + status);
ok(masukUlang === 0, 'tidak ada masuk ulang ke Auth (tanpa sesi dan refresh token baru)');
ok((await pg.query('select encrypted_password h from auth.users where id = $1', [idPembina])).rows[0].h === hashAwal, 'hash bcrypt tidak berubah (kekuatan sama, PIN tidak perlu diganti)');

console.log('\n--- Pembatasan percobaan: 5 kali salah mengunci, PIN benar pun ditolak selama terkunci ---');
for (let i = 0; i < 4; i++) r = await catat('000000');
ok(!r.ok && !r.terkunci && /Sisa 1/.test(r.pesan), 'percobaan ke-4: ' + r.pesan);
r = await catat('000000');
ok(!r.ok && r.terkunci && /dikunci sementara 5 menit/.test(r.pesan), 'percobaan ke-5 mengunci: ' + r.pesan);
r = await catat(PIN);
ok(!r.ok && r.terkunci && /Coba lagi 5 menit lagi/.test(r.pesan), 'selama terkunci PIN benar ditolak: ' + r.pesan);
const rMasuk = await tangani({ aksi: 'masuk', username: 'pembina', pin: PIN }, null, deps);
ok(!rMasuk.ok && rMasuk.terkunci, 'kunci yang sama berlaku untuk masuk');
await pg.query(`delete from public.login_gagal`);
ok(masukUlang === 0, 'jalur bcrypt tetap tanpa masuk ulang');

console.log('\n--- Ganti PIN: PIN lama dicocokkan di basis data ---');
r = await tangani({ aksi: 'ganti-pin', pinLama: '000000', pinBaru: '274916', ulangi: '274916' }, `Bearer ${token(idPembina)}`, deps);
ok(!r.ok && /PIN lama tidak sesuai\. Sisa 4/.test(r.pesan), 'PIN lama salah: ' + r.pesan);
await pg.query(`update public.profiles set wajib_ganti_pin = true where id = $1`, [idPembina]);
r = await tangani({ aksi: 'ganti-pin', pinLama: PIN, pinBaru: '274916', ulangi: '274916' }, `Bearer ${token(idPembina)}`, deps);
const prof = (await pg.query('select wajib_ganti_pin w from public.profiles where id = $1', [idPembina])).rows[0];
ok(r.ok && prof.w === false && !(await gagalPembina()), 'PIN lama benar: PIN diganti, wajib ganti PIN selesai, hitungan dilepas');
ok(masukUlang === 0, 'ganti PIN tanpa masuk ulang ke Auth');

console.log('\n--- Cadangan cara lama ---');
// Sesudah ganti PIN, ubahPassword versi lokal menyimpan hash SHA-256 (bukan bcrypt): jalur lama dipakai.
r = await catat('274916');
ok(r.ok || !/PIN/.test(r.pesan), 'hash bukan bcrypt: PIN tetap diverifikasi' + (r.ok ? '' : ': ' + r.pesan));
ok(masukUlang === 1, 'hash bukan bcrypt: kembali ke masuk dengan kata sandi');
const tanpaFungsi = { ...deps, db: { ...deps.db, rpc: (n, a) => (n === 'sg_pin_periksa_internal' ? Promise.resolve({ data: null, error: { message: 'Could not find the function' } }) : deps.db.rpc(n, a)) } };
r = await tangani({ aksi: 'catat-hasil', pin: '000000', pesertaId: ahmad, skuId: 'BAN-09', hasil: 'lulus', tanggalUji: '2026-09-19', nilai: 'Baik', catatan: '' }, `Bearer ${token(idPembina)}`, tanpaFungsi);
ok(!r.ok && /Sisa 4/.test(r.pesan) && masukUlang === 2, 'migrasi belum dijalankan: cara lama, salah tetap dihitung');
await pg.query(`delete from public.login_gagal`);

console.log('\n--- Hak: hanya service_role ---');
const sebagai = (peran, sql, p) => pg.transaction(async (tx) => { await tx.query(`set local role ${peran}`); return tx.query(sql, p); });
for (const peran of ['anon', 'authenticated']) {
  let tolak = null;
  try { await sebagai(peran, 'select public.sg_pin_periksa_internal($1, $2)', [idPembina, '274916']); } catch (e) { tolak = e.message; }
  ok(/permission denied/.test(tolak ?? ''), `${peran} tidak dapat memanggil: ${tolak ?? 'TIDAK DITOLAK'}`);
}
const rl = (await sebagai('service_role', 'select public.sg_pin_periksa_internal($1, $2) r', [ahmad, '000000'])).rows[0].r;
ok(rl.ok === false && rl.dukung === false, 'service_role dapat memanggil; hash bukan bcrypt dijawab dukung:false tanpa menghitung salah');
ok(!(await pg.query(`select 1 from public.login_gagal where username = '10231'`)).rows.length, 'dukung:false tidak menambah hitungan salah');

/* -------------------------- Tanpa pgcrypto: kembali ke cara lama -------------------------- */
console.log('\n--- Tanpa pgcrypto di skema extensions ---');
{
  const db = await baru(`${P}/supabase/skema.sql`);
  await isiDataContoh(db);
  const id = (await db.query(`select id from public.profiles where username = 'pembina'`)).rows[0].id;
  await db.query(`update auth.users set encrypted_password = $2 where id = $1`, [id, hashAwal]);
  const x = (await db.query('select public.sg_pin_periksa_internal($1, $2) r', [id, PIN])).rows[0].r;
  ok(x.ok === false && x.dukung === false, 'pgcrypto tidak ada: dukung:false (Edge Function memakai cara lama)');
  const y = (await db.query('select public.sg_pin_periksa_internal($1, $2) r', ['00000000-0000-4000-8000-000000000000', PIN])).rows[0].r;
  ok(y.ok === false && y.dukung === false, 'id tanpa profil: ditolak');
  await db.close();
}

/* ------------------------------------ Migrasi ------------------------------------ */
console.log('\n--- Migrasi: kesetaraan, data utuh, idempoten ---');
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(replace(p.prosrc, chr(13), '')) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sigarda') and p.prokind = 'f' order by 1, 2, 3`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema in ('public', 'sigarda') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
  };
};
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from auth.users)::int u`)).rows[0];
const A = await baru(`${P}/supabase/skema.sql`);
const pa = await potret(A);
const B = await baru('git:5f0164c'); // commit tepat sebelum migrasi ini
await isiDataContoh(B);
ok(!(await B.query(`select to_regprocedure('public.sg_pin_periksa_internal(uuid, text)') f`)).rows[0].f, 'sebelum migrasi: fungsi belum ada');
const sebelum = await cacah(B);
await B.exec(MP); await B.exec(MP); await B.exec(MP);
ok(JSON.stringify(await cacah(B)) === JSON.stringify(sebelum), 'migrasi tiga kali: data tetap sama ' + JSON.stringify(sebelum));
const pb = await potret(B);
for (const k of Object.keys(pa)) {
  const sama = JSON.stringify(pa[k]) === JSON.stringify(pb[k]);
  ok(sama, `katalog setara (${k}): ${pa[k].length} entri`);
  if (!sama) {
    const a = new Set(pa[k].map((x) => JSON.stringify(x))), b = new Set(pb[k].map((x) => JSON.stringify(x)));
    console.log('   hanya di skema baru =', [...a].filter((x) => !b.has(x)).slice(0, 5), '\n   hanya di migrasi =', [...b].filter((x) => !a.has(x)).slice(0, 5));
  }
}

console.log('\n--- Tanpa migrasi sebelumnya: gagal jelas ---');
const C = new PGlite();
let galat = null;
try { await C.exec(MP); } catch (e) { galat = e.message; await C.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi sebelumnya/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));

console.log(`\nRINGKASAN PIN-TANPA-SESI: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
