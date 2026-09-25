// Migrasi integrasi pra-uji (fase E): kesetaraan dengan skema baru (seluruh fungsi di skema public dan sigarda), data utuh, idempoten, hak akses, perilaku baru,
// dan gagal jelas bila prasyarat (migrasi pra-uji, fase C) belum ada.
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
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-integrasi-pra-uji.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.penugasan_rombel)::int pr,
  (select count(*) from public.agenda)::int a, (select count(*) from public.notifikasi)::int no, (select count(*) from public.bina_damping)::int bd, (select count(*) from public.sku_pra_uji)::int pu`)).rows[0];
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

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru('git:535c4b5'); // commit TEPAT sebelum migrasi ini (Fase D)
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const sebelum = await cacah(B1);
const md5Fungsi = async (db, nama) => (await db.query(`select md5(p.prosrc) m from pg_proc p where p.proname = $1`, [nama])).rows[0].m;
const lamaEsk = await md5Fungsi(B1, 'eskalasi_mulai_sku'), lamaPeriksa = await md5Fungsi(B1, 'sg_pemeriksaan_data'), lamaPengingat = await md5Fungsi(B1, 'pra_uji_pengingat');
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
ok(await md5Fungsi(B1, 'eskalasi_mulai_sku') !== lamaEsk && await md5Fungsi(B1, 'sg_pemeriksaan_data') !== lamaPeriksa && await md5Fungsi(B1, 'pra_uji_pengingat') !== lamaPengingat, 'ketiga fungsi benar-benar berubah oleh migrasi');
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
  const ahmad = await masuk('10231');
  let r = await pembina.a.muatPemeriksaanData();
  ok(r.ok && r.data.praUjiAktif === false && Array.isArray(r.data.rombelTanpaBinaDamping) && Array.isArray(r.data.sanggaTanpaPinsa) && Array.isArray(r.data.praUjiMacet), 'sg_pemeriksaan_data memuat kunci pra-uji (sakelar mati)');
  ok((await B1.query(`select count(*)::int n from public.pengaturan where kunci = 'pra_uji.aktif'`)).rows[0].n === 0, 'migrasi tidak menghidupkan sakelar');
  r = await ahmad.a.muatPemeriksaanData();
  ok(!r.ok, 'Penegak tetap ditolak melihat Periksa Data');
  r = await pembina.k.rpc('sg_pra_uji_sakelar', { p_aktif: true });
  ok(!r.error && r.data.aktif === true, 'sakelar dapat dihidupkan sesudah migrasi');
  r = await pembina.a.muatPemeriksaanData();
  ok(r.ok && r.data.praUjiAktif === true, 'praUjiAktif mengikuti sakelar');
}

console.log('\n--- Tanpa migrasi pra-uji: gagal jelas ---');
const B3 = await baru('git:6ad8610'); // sebelum Fase C (tanpa sku_pra_uji)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
ok((await md5Fungsi(B3, 'sg_pemeriksaan_data')) !== undefined && !(await B3.query(`select prosrc from pg_proc where proname = 'sg_pemeriksaan_data'`)).rows[0].prosrc.includes('praUjiAktif'), 'kegagalan membatalkan seluruh migrasi (fungsi tidak berubah)');

console.log(`\nRINGKASAN MIGRASI INTEGRASI PRA-UJI: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
