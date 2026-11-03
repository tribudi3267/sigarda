// Migrasi hemat ruang notifikasi (eskalasi_proses, notif_pengingat ditulis ulang; notifikasi_bersihkan baru): kesetaraan dengan skema baru
// (fungsi dan hak), data aplikasi utuh, pembersihan sekali (bentuk lama Tindak Lanjut ke pengurus, notifikasi lama), idempoten, dan gagal
// jelas bila prasyarat belum ada.
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
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-11-hemat-notifikasi.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.agenda)::int a`)).rows[0];
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sigarda') and p.prokind = 'f' order by 1, 2, 3`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema in ('public', 'sigarda') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
  };
};

const A = await baru(`${P}/supabase/skema.sql`);
const pa = await potret(A);

console.log('--- Database berisi data: kesetaraan, data utuh, pembersihan sekali, idempoten ---');
const B1 = await baru('git:4791a42'); // commit TEPAT sebelum migrasi ini (main sesudah PR #86)
await isiDataContoh(B1);
const sebelum = await cacah(B1);
const pid = (await B1.query(`select id from public.profiles where username = 'pembina'`)).rows[0].id;
const tambah = (kunci, umur, jenis = 'eskalasi') => B1.query(`insert into public.notifikasi (penerima_id, jenis, judul, kunci, dibuat)
  values ($1, $2, 'uji', $3, now() - ($4 || ' days')::interval)`, [pid, jenis, kunci, String(umur)]);
await B1.query('delete from public.notifikasi');
await tambah('eskalasi-p:sku:00000000-0000-0000-0000-000000000001:2026-11-01', 1);   // bentuk lama: dihapus
await tambah('eskalasi-p:2026-11-02', 1);                                               // bentuk ringkasan: tetap
await tambah(null, 70, 'pengingat');                                                    // > 60 hari: dihapus
await tambah(null, 5, 'pengingat');                                                     // tetap
await B1.exec(MP);
const sisa = (await B1.query('select coalesce(kunci, jenis) k from public.notifikasi order by id')).rows.map((x) => x.k);
ok(JSON.stringify(sisa) === JSON.stringify(['eskalasi-p:2026-11-02', 'pengingat']), 'pembersihan sekali: Tindak Lanjut bentuk lama dan notifikasi > 60 hari dihapus, sisanya tetap: ' + JSON.stringify(sisa));
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data aplikasi tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
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
{
  let galat = null;
  try { await B1.query('select sigarda.notif_pengingat()'); } catch (e) { galat = e.message; }
  ok(galat === null, 'pengingat harian berjalan sesudah migrasi' + (galat ? ': ' + galat : ''));
}

console.log('\n--- Tanpa migrasi sebelumnya: gagal jelas ---');
const B3 = await baru('git:a0f5941'); // sebelum 2026-10-pin-tanpa-sesi.sql
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi sebelumnya/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));

console.log(`\nRINGKASAN MIGRASI HEMAT-NOTIFIKASI: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
