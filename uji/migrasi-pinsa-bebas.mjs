// Migrasi "pinsa bebas" (syarat SKU Bantara selesai untuk Pinsa dicabut): kesetaraan dengan skema baru (fungsi dan hak), data utuh, idempoten, perilaku baru,
// dan gagal jelas bila prasyarat (skema dan migrasi sebelumnya) belum ada.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { skemaLama } from '../scripts/skema-lama.mjs';
import { siapkanPg, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';

const P = process.cwd().replace(/\\/g, '/');
let g = 0, l = 0;
const ok = (c, m) => { if (c) { l++; console.log('ok   :', m); } else { g++; console.log('GAGAL:', m); } };
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
const bersih = (s) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-10-pinsa-bebas.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.bina_damping)::int b, (select count(*) from public.pinsa_tugas)::int t, (select count(*) from public.sku_progress)::int s`)).rows[0];
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sigarda') and p.prokind = 'f' order by 1, 2, 3`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema in ('public', 'sigarda') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
  };
};

const A = await baru('git:c174198'); // skema tepat SESUDAH migrasi ini (main sesudah PR #77); migrasi penulis-berita menulis ulang fungsi berita
const pa = await potret(A);

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru('git:ec23136'); // commit TEPAT sebelum migrasi ini
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const sebelum = await cacah(B1);
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
  const admin = (await B1.query(`select id from public.profiles where role = 'admin' limit 1`)).rows[0].id;
  const rombel = (await B1.query(`select kelas from public.profiles where role = 'peserta' and status = 'aktif' order by kelas limit 1`)).rows[0].kelas;
  const calon = (await sqlSebagai(B1, admin, 'select public.sg_pinsa_calon($1) as d', [rombel])).rows[0].d.calon;
  ok(calon.length > 0 && calon.some((c) => c.tingkat === 'calon-bantara'), 'calon Pinsa memuat Penegak yang belum menyelesaikan Bantara (' + calon.length + ' calon)');
  const sr = (await sqlSebagai(B1, admin, 'select public.sg_sangga_rombel($1) as d', [rombel])).rows[0].d;
  ok(sr.anggota.length > 0 && sr.anggota.every((a) => a.layak_pinsa === true), 'layak_pinsa benar untuk semua anggota rombel');
}

console.log('\n--- Tanpa migrasi sebelumnya: gagal jelas ---');
const B3 = await baru('git:90cb914'); // sebelum migrasi pinsa-bina-damping (tanpa sg_sangga_rombel)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi sebelumnya/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));

console.log(`\nRINGKASAN MIGRASI PINSA-BEBAS: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
