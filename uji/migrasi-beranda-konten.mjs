// Migrasi Kelola Beranda konten (Fase 2 landing page): kesetaraan dengan skema baru (fungsi, tabel, kebijakan, hak), data utuh, idempoten,
// perilaku baru, dan gagal jelas bila prasyarat (migrasi 2026-09-beranda.sql) belum ada.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { skemaLama } from '../scripts/skema-lama.mjs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';

const P = process.cwd().replace(/\\/g, '/');
let g = 0, l = 0;
const ok = (c, m) => { if (c) { l++; console.log('ok   :', m); } else { g++; console.log('GAGAL:', m); } };
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
const bersih = (s) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-beranda-konten.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s,
  (select count(*) from public.agenda)::int a, (select count(*) from public.pengaturan)::int pe`)).rows[0];
const TABEL = `('beranda_berita','beranda_prestasi','beranda_galeri','beranda_sosial','beranda_faq')`;
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sigarda') and p.prokind = 'f' order by 1, 2, 3`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema in ('public', 'sigarda') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
    hakTabel: await q(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name in ${TABEL} and grantee in ('anon','authenticated') order by 1, 2, 3`),
    rls: await q(`select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ${TABEL} order by 1`),
    kebijakan: await q(`select tablename, policyname, qual from pg_policies where schemaname = 'public' and tablename in ${TABEL} order by 1, 2`),
    kolom: await q(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name in ${TABEL} order by 1, 2`),
    batasan: await q(`select conrelid::regclass::text tabel, conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid::regclass::text in ${TABEL} order by 1, 2`),
  };
};

const A = await baru('git:a0baf15'); // keadaan TEPAT sesudah migrasi ini (main sesudah PR #43); skema.sql terbaru kini juga memuat Fase 3 (beranda-notifikasi)
const pa = await potret(A);

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru('git:bab5bfd'); // commit TEPAT sebelum migrasi ini (main sesudah PR #40, Fase 1 beranda)
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const sebelum = await cacah(B1);
ok((await B1.query(`select to_regclass('public.beranda_berita') as t`)).rows[0].t === null, 'prasyarat: skema lama belum punya tabel beranda_berita');
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
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
ok(!pb.hakFungsi.some((h) => h.grantee === 'anon' && /^sg_(berita|prestasi|galeri|sosial|faq)_/.test(h.routine_name)), 'hak: anon tidak boleh memanggil fungsi tulis konten beranda');

console.log('\n--- Sesudah migrasi: perilaku baru ---');
{
  const masuk = async (username) => { const k = buatKlienFake(B1); const a = buatApi(k); const r = await a.masuk(username, PIN_DEMO[username] ?? PIN_DEMO.penegak); return { k, a, id: r.id }; };
  const pembina = await masuk('pembina');
  const dewan = await masuk('dewan');
  let r = await sqlSebagai(B1, dewan.id, "select public.sg_berita_simpan(null, 'kegiatan', 'Judul', '', 'Isi', '', 'menunggu', null) as id").catch((e) => ({ galat: e.message }));
  ok(!r.galat, 'Dewan mengajukan berita sesudah migrasi ' + (r.galat ?? ''));
  const idBerita = r.rows[0].id;
  r = await sqlSebagai(B1, pembina.id, `select public.sg_berita_tinjau(${idBerita}, 'terbit', '') as x`).catch((e) => ({ galat: e.message }));
  ok(!r.galat, 'Pembina menerbitkan pengajuan sesudah migrasi ' + (r.galat ?? ''));
  const publik = (await sqlSebagai(B1, null, 'select public.sg_beranda_publik() as d')).rows[0].d;
  ok(publik.berita.some((b) => b.judul === 'Judul') && Array.isArray(publik.prestasi) && Array.isArray(publik.galeri) && Array.isArray(publik.sosial) && Array.isArray(publik.faq),
    'sg_beranda_publik (ditulis ulang) memuat berita, prestasi, galeri, sosial, dan faq');
  const c = (await sqlSebagai(B1, (await masuk('admin')).id, 'select public.sg_cadangan_admin() as d')).rows[0].d;
  ok(Array.isArray(c.tabel.beranda_berita) && c.tabel.beranda_berita.length === 1 && Array.isArray(c.tabel.sfh_catatan),
    'sg_cadangan_admin (ditulis ulang) memuat beranda_berita tanpa kehilangan tabel lain (sfh_catatan)');
}

console.log('\n--- Tanpa migrasi sebelumnya: gagal jelas ---');
const B3 = await baru('git:89e2051'); // sebelum migrasi 2026-09-beranda.sql (Fase 1)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu migrasi 2026-09-beranda\.sql/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
ok((await B3.query(`select to_regclass('public.beranda_berita') as t`)).rows[0].t === null, 'kegagalan membatalkan seluruh migrasi (tabel tidak dibuat)');

console.log(`\nRINGKASAN MIGRASI BERANDA-KONTEN: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
