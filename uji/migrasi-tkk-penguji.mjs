// Migrasi penguji TKK (Tahap 2, G2c): kesetaraan dengan skema baru (fungsi dengan tanda tangan baru, kolom baru tkk_pengajuan), pengajuan lama tetap terbaca, idempoten,
// perilaku baru, dan gagal jelas bila prasyarat (migrasi pengajuan TKK) belum ada.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { skemaLama } from '../scripts/skema-lama.mjs';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';

const P = process.cwd().replace(/\\/g, '/');
let g = 0, l = 0;
const ok = (c, m) => { if (c) { l++; console.log('ok   :', m); } else { g++; console.log('GAGAL:', m); } };
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
const bersih = (s) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-tkk-penguji.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.penugasan_rombel)::int pr,
  (select count(*) from public.agenda)::int a, (select count(*) from public.notifikasi)::int no, (select count(*) from public.bina_damping)::int bd, (select count(*) from public.sku_pra_uji)::int pu, (select count(*) from public.agenda)::int ag`)).rows[0];
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sigarda') and p.prokind = 'f' order by 1, 2, 3`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema in ('public', 'sigarda') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
    hakTabel: await q(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name in ('tkk_pengajuan') and grantee in ('anon','authenticated') order by 1, 2, 3`),
    rls: await q(`select relname, relrowsecurity from pg_class where oid in ('public.tkk_pengajuan'::regclass) order by 1`),
    kebijakan: await q(`select tablename, policyname, qual from pg_policies where schemaname = 'public' and tablename in ('tkk_pengajuan') order by 1, 2`),
    kolom: await q(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name in ('tkk_pengajuan') order by 1, 2`),
    indeks: await q(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in ('tkk_pengajuan') order by 1, 2`),
    pemicu: await q(`select tgrelid::regclass::text tabel, tgname, pg_get_triggerdef(t.oid) def from pg_trigger t where tgrelid in ('public.tkk_pengajuan'::regclass) and not tgisinternal order by 1, 2`),
    batasan: await q(`select conrelid::regclass::text tabel, conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid in ('public.tkk_pengajuan'::regclass) order by 1, 2`),
  };
};

const A = await baru('git:71a2f19'); // skema TEPAT sesudah migrasi ini (main sesudah G2c); skema.sql terbaru memuat tahap sesudahnya (SPG menulis ulang sg_cadangan_admin)
const pa = await potret(A);

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru('git:2d5172f'); // commit TEPAT sebelum migrasi ini (main sesudah G2b)
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
// satu pengajuan lama (tanda tangan sebelum G2c) yang harus tetap terbaca sesudah migrasi
await B1.query("insert into public.tkk_pengajuan (peserta_id, tkk_id, tingkat, tanggal, penguji1, penguji2, melatih) select id, 'juru-masak', 'purwa', current_date, 'Pak Budi', 'Bu Sari', 'Andi' from public.profiles where username = '10232'");
const sebelum = await cacah(B1);
const md5Fungsi = async (db, nama) => (await db.query(`select md5(p.prosrc) m from pg_proc p where p.proname = $1`, [nama])).rows[0].m;
ok((await B1.query("select count(*)::int n from information_schema.columns where table_name = 'tkk_pengajuan' and column_name in ('penguji1_id', 'penguji_awal')")).rows[0].n === 0, 'prasyarat: skema lama belum punya kolom penguji1_id dan penguji_awal');
const lamaAjukan = await B1.query("select to_regprocedure('public.sg_tkk_ajukan(text, text, date, text, text, text, text, text)') as f");
ok(lamaAjukan.rows[0].f !== null, 'prasyarat: sg_tkk_ajukan masih bertanda tangan lama (Penguji 1 teks)');
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
ok((await B1.query("select to_regprocedure('public.sg_tkk_ajukan(text, text, date, text, text, text, text, text)') as a, to_regprocedure('public.sg_tkk_tinjau(bigint, text, text)') as b, to_regprocedure('public.sg_tkk_ajukan(text, text, date, uuid, text, text, text, text)') as c, to_regprocedure('public.sg_tkk_tinjau(bigint, text, text, text, text)') as d, to_regprocedure('public.sg_tkk_penguji_pilihan()') as e")).rows[0]
  && JSON.stringify(Object.values((await B1.query("select to_regprocedure('public.sg_tkk_ajukan(text, text, date, text, text, text, text, text)') is null as a, to_regprocedure('public.sg_tkk_tinjau(bigint, text, text)') is null as b, to_regprocedure('public.sg_tkk_ajukan(text, text, date, uuid, text, text, text, text)') is not null as c, to_regprocedure('public.sg_tkk_tinjau(bigint, text, text, text, text)') is not null as d, to_regprocedure('public.sg_tkk_penguji_pilihan()') is not null as e")).rows[0])) === '[true,true,true,true,true]',
  'tanda tangan lama sg_tkk_ajukan dan sg_tkk_tinjau dibuang, yang baru dan sg_tkk_penguji_pilihan ada');
ok((await B1.query("select penguji1_id, penguji_awal, penguji1 from public.tkk_pengajuan")).rows.length === 1 && (await B1.query("select penguji1_id, penguji_awal, penguji1 from public.tkk_pengajuan")).rows[0].penguji1_id === null && (await B1.query("select penguji_awal from public.tkk_pengajuan")).rows[0].penguji_awal === '', 'pengajuan lama tetap terbaca (penguji1_id kosong, penguji_awal kosong)');
await B1.exec(MP); await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'menjalankan migrasi tiga kali: data tetap sama');
const pb = await potret(B1);
for (const k of Object.keys(pa)) {
  const sama = JSON.stringify(pa[k]) === JSON.stringify(pb[k]);
  ok(sama, `katalog setara (${k}): ${pa[k].length} entri`);
  if (!sama) {
    const a = new Set(pa[k].map((x) => JSON.stringify(x))), b = new Set(pb[k].map((x) => JSON.stringify(x)));
    console.log('   hanya di skema baru =', [...a].filter((x) => !b.has(x)).slice(0, 5), '\n   hanya di migrasi =', [...b].filter((x) => !a.has(x)).slice(0, 5));
  }
}

console.log('\n--- Sesudah migrasi: Penguji 1 dari penugasan dan penggantian penguji ---');
{
  const masuk = async (username) => { const k = buatKlienFake(B1); const a = buatApi(k); const r = await a.masuk(username, PIN_DEMO[username] ?? PIN_DEMO.penegak); return { k, a, id: r.id }; };
  const pembina = await masuk('pembina');
  const siti = await masuk('10232');
  const admin = await masuk('admin');
  await B1.query('delete from public.sku_progress where peserta_id = $1', [siti.id]);
  await B1.query("insert into public.sku_progress (peserta_id, sku_id, status) select p.id, u.id, 'lulus' from public.profiles p join public.sku_unit u on u.tingkat = 'Bantara' and (u.agama is null or u.agama = p.agama) where p.id = $1", [siti.id]);
  await B1.query('delete from public.penugasan_rombel'); await B1.query('delete from public.penugasan_peserta');
  await B1.query("update public.profiles set kelas = 'X-01' where id = $1", [siti.id]);
  await B1.query("insert into public.penugasan_rombel (tahun_ajaran, rombel, penguji_id) values (sigarda.tahun_ajaran_kini(), 'X-01', $1)", [pembina.id]);
  let r = await siti.a.pilihanPengujiTkk();
  ok(r.ok && r.data.length === 1 && r.data[0].id === pembina.id, 'pilihan Penguji 1: Pembina yang ditugaskan untuk rombel Siti');
  const isi = { tkkId: 'penabung', tingkat: 'purwa', tanggal: '2026-09-01', penguji1Id: pembina.id, penguji2: 'Bu Sari', melatih: 'Andi, Siaga' };
  r = await siti.a.ajukanTkk({ ...isi, penguji1Id: null });
  ok(!r.ok && /Penguji 1 harus Pembina yang ditugaskan/.test(r.pesan), 'Penguji 1 wajib dari daftar');
  r = await siti.a.ajukanTkk(isi);
  ok(r.ok, 'Penegak mengajukan dengan Penguji 1 yang ditugaskan ' + (r.pesan ?? ''));
  const id = r.data;
  const baris1 = (await B1.query('select penguji1, penguji1_id from public.tkk_pengajuan where id = $1', [id])).rows[0];
  ok(baris1.penguji1_id === pembina.id && baris1.penguji1.length > 0, 'nama dan id Penguji 1 disalin server');
  r = await pembina.a.tinjauTkk(id, 'disetujui', '', 'Pak Pengganti', 'Bu Sari');
  ok(!r.ok && /Nama penguji diganti: isi alasannya/.test(r.pesan), 'mengganti penguji tanpa alasan ditolak');
  r = await pembina.a.tinjauTkk(id, 'disetujui', 'Pembina 1 berhalangan hadir', 'Pak Pengganti', 'Bu Sari');
  ok(r.ok, 'menyetujui dengan mengganti penguji dan menyebut alasan');
  const cap = (await B1.query("select penguji1, penguji2 from public.tkk_capaian where peserta_id = $1 and tkk_id = 'penabung'", [siti.id])).rows[0];
  const aj = (await B1.query('select penguji_awal from public.tkk_pengajuan where id = $1', [id])).rows[0];
  ok(cap.penguji1 === 'Pak Pengganti' && aj.penguji_awal.endsWith(' dan Bu Sari'), 'capaian memuat penguji pengganti; nama semula tersimpan');
  r = await admin.k.rpc('sg_cadangan_admin');
  ok(!r.error && r.data.tabel.tkk_pengajuan.length === 2 && r.data.tabel.tkk_pengajuan.every((x) => 'penguji1_id' in x && 'penguji_awal' in x), 'cadangan data memuat kolom baru pengajuan');
}

console.log('\n--- Tanpa migrasi sebelumnya: gagal jelas ---');
const B3 = await baru('git:30070fa'); // sebelum G2b (tanpa tabel tkk_pengajuan)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
ok((await B3.query(`select to_regclass('public.tkk_pengajuan') as t`)).rows[0].t === null, 'kegagalan membatalkan seluruh migrasi (tabel tidak dibuat)');

console.log(`\nRINGKASAN MIGRASI TKK-PENGUJI: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
