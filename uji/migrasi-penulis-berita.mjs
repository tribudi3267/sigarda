// Migrasi nama penulis berita (sg_beranda_publik, sg_berita_publik, sg_berita_lagi ditulis ulang): kesetaraan dengan skema baru (fungsi dan hak), data utuh,
// idempoten, perilaku baru (penulis = nama tampilan, termasuk untuk berita yang sudah terbit sebelum migrasi), dan gagal jelas bila prasyarat belum ada.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { skemaLama } from '../scripts/skema-lama.mjs';
import { siapkanPg } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';

const P = process.cwd().replace(/\\/g, '/');
let g = 0, l = 0;
const ok = (c, m) => { if (c) { l++; console.log('ok   :', m); } else { g++; console.log('GAGAL:', m); } };
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
const bersih = (s) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-10-penulis-berita.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.beranda_berita)::int b, (select count(*) from public.agenda)::int a`)).rows[0];
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sigarda') and p.prokind = 'f' order by 1, 2, 3`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema in ('public', 'sigarda') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
  };
};

const A = await baru(`${P}/supabase/skema.sql`); // migrasi ini yang paling baru: skema.sql terbaru = keadaan sesudahnya
const pa = await potret(A);

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru('git:c174198'); // commit TEPAT sebelum migrasi ini (main sesudah PR #77)
await isiDataContoh(B1);
const pembina = (await B1.query(`select id, nama from public.profiles where role = 'penguji' and jabatan = 'Pembina' limit 1`)).rows[0];
await B1.query(`insert into public.beranda_berita (kategori, judul, isi, status, terbit_pada, dibuat_oleh, dibuat_oleh_nama) values
  ('kegiatan', 'Lama bernama', 'Isi', 'terbit', now() - interval '1 day', $1, $2), ('kegiatan', 'Lama tanpa nama', 'Isi', 'terbit', now() - interval '2 day', null, '')`, [pembina.id, pembina.nama]);
const sebelum = await cacah(B1);
const lama = (await B1.query(`select (public.sg_beranda_publik() -> 'berita' -> 0) ? 'penulis' as ada`)).rows[0].ada;
ok(lama === false, 'sebelum migrasi: berita publik belum membawa penulis');
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
  const d = (await B1.query(`select public.sg_beranda_publik() as d`)).rows[0].d;
  const bn = d.berita.find((b) => b.judul === 'Lama bernama');
  ok(bn?.penulis === pembina.nama, 'berita yang sudah terbit sebelum migrasi tampil dengan nama tampilan penulis: ' + bn?.penulis);
  ok(d.berita.find((b) => b.judul === 'Lama tanpa nama')?.penulis === '', 'berita tanpa nama tercatat: penulis kosong (klien tidak menampilkan apa pun)');
  const arsip = (await B1.query(`select public.sg_berita_publik() as d`)).rows[0].d;
  ok(arsip.find((b) => b.judul === 'Lama bernama')?.penulis === pembina.nama, 'arsip berita publik membawa penulis');
  const lagi = (await B1.query(`select public.sg_berita_lagi(0) as d`)).rows[0].d;
  ok(lagi.berita.find((b) => b.judul === 'Lama bernama')?.penulis === pembina.nama, 'berita lebih lama membawa penulis');
  ok(!JSON.stringify([d.berita, arsip, lagi.berita]).includes(pembina.id), 'id akun penulis tidak ikut keluar');
}

console.log('\n--- Tanpa migrasi sebelumnya: gagal jelas ---');
const B3 = new PGlite();
await B3.exec('create schema sigarda');
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi sebelumnya/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));

console.log(`\nRINGKASAN MIGRASI PENULIS-BERITA: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
