// Migrasi notifikasi Kelola Beranda (Fase 3 landing page): kesetaraan dengan skema baru (fungsi, pemicu, batasan jenis notifikasi), data utuh,
// idempoten, perilaku baru (notifikasi dibuat), dan gagal jelas bila prasyarat (migrasi 2026-09-beranda-konten.sql) belum ada.
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
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-beranda-notifikasi.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s,
  (select count(*) from public.agenda)::int a, (select count(*) from public.beranda_berita)::int bb`)).rows[0];
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sigarda') and p.prokind = 'f' order by 1, 2, 3`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema in ('public', 'sigarda') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
    pemicu: await q(`select tgrelid::regclass::text tabel, tgname, pg_get_triggerdef(t.oid) def from pg_trigger t where tgrelid = any(array['public.beranda_berita'::regclass,'public.beranda_prestasi'::regclass,'public.beranda_galeri'::regclass]) and not tgisinternal order by 1, 2`),
    batasanNotif: await q(`select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid = 'public.notifikasi'::regclass and conname = 'notifikasi_jenis_check'`),
  };
};

const A = await baru('git:3b9e82c'); // keadaan TEPAT sesudah migrasi ini (main sesudah PR #44); skema.sql terbaru kini juga memuat berita-isi-publik
const pa = await potret(A);

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru('git:a0baf15'); // commit TEPAT sebelum migrasi ini (main sesudah PR #43, Fase 2 beranda konten)
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const sebelum = await cacah(B1);
ok((await B1.query(`select tgname from pg_trigger where tgrelid = 'public.beranda_berita'::regclass and tgname = 'notif_berita_status'`)).rows.length === 0, 'prasyarat: skema lama belum punya pemicu notif_berita_status');
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

console.log('\n--- Sesudah migrasi: perilaku baru ---');
{
  const masuk = async (username) => { const k = buatKlienFake(B1); const a = buatApi(k); const r = await a.masuk(username, PIN_DEMO[username] ?? PIN_DEMO.penegak); return { k, a, id: r.id }; };
  const pembina = await masuk('pembina');
  const admin = await masuk('admin');
  const dewan = await masuk('dewan');
  let r = await sqlSebagai(B1, dewan.id, "select public.sg_berita_simpan(null, 'kegiatan', 'Judul Notifikasi', '', 'Isi', '', 'menunggu', null) as id").catch((e) => ({ galat: e.message }));
  ok(!r.galat, 'Dewan mengajukan berita sesudah migrasi ' + (r.galat ?? ''));
  const idBerita = r.rows[0].id;
  const notifPembina = (await sqlSebagai(B1, pembina.id, 'select jenis, judul, isi, tautan from public.notifikasi where penerima_id = $1', [pembina.id])).rows;
  const notifAdmin = (await sqlSebagai(B1, admin.id, 'select jenis, judul, isi from public.notifikasi where penerima_id = $1', [admin.id])).rows;
  const beritaPembina = notifPembina.find((n) => n.jenis === 'beranda');
  ok(!!beritaPembina && /Pengajuan Berita baru/.test(beritaPembina.judul) && beritaPembina.isi.includes('Judul Notifikasi'), 'Pembina diberi tahu pengajuan berita baru, menyebut judulnya');
  ok(notifAdmin.some((n) => n.jenis === 'beranda' && n.isi.includes('Judul Notifikasi')), 'Admin Gudep juga diberi tahu pengajuan berita baru');
  ok(beritaPembina.tautan.tab === 'kelolaberanda', 'tautan notifikasi menuju menu Kelola Beranda');

  r = await sqlSebagai(B1, pembina.id, `select public.sg_berita_tinjau(${idBerita}, 'ditolak', 'Perlu foto pendukung') as x`).catch((e) => ({ galat: e.message }));
  ok(!r.galat, 'Pembina menolak pengajuan sesudah migrasi ' + (r.galat ?? ''));
  const notifDewan = (await sqlSebagai(B1, dewan.id, 'select jenis, judul, isi from public.notifikasi where penerima_id = $1', [dewan.id])).rows;
  ok(notifDewan.some((n) => n.jenis === 'beranda' && /ditinjau/i.test(n.judul)) && notifDewan.every((n) => n.jenis !== 'beranda' || !/lulus|ulang/i.test(n.isi)), 'Dewan (penulis) diberi tahu pengajuannya ditinjau, tanpa alasan penolakan di isi singkat');
}

console.log('\n--- Tanpa migrasi sebelumnya: gagal jelas ---');
const B3 = await baru('git:bab5bfd'); // sebelum migrasi 2026-09-beranda-konten.sql (Fase 2)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu migrasi 2026-09-beranda-konten\.sql/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
ok((await B3.query(`select to_regprocedure('sigarda.notif_beranda_konten()') as f`)).rows[0].f === null, 'kegagalan membatalkan seluruh migrasi (fungsi tidak dibuat)');

console.log(`\nRINGKASAN MIGRASI BERANDA-NOTIFIKASI: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
