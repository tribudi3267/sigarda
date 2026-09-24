// Migrasi mesin pra-uji (fase C): kesetaraan dengan skema baru (seluruh fungsi di skema public dan sigarda), data utuh, idempoten, hak akses, dan gagal jelas bila prasyarat belum ada.
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
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-pra-uji.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.penugasan_rombel)::int pr,
  (select count(*) from public.agenda)::int a, (select count(*) from public.notifikasi)::int no, (select count(*) from public.bina_damping)::int bd`)).rows[0];
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    // seluruh fungsi buatan aplikasi (badan, tanda tangan, keamanan): migrasi harus menghasilkan katalog yang sama dengan skema baru
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sigarda') and p.prokind = 'f' order by 1, 2, 3`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema in ('public', 'sigarda') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
    hakTabel: await q(`select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'sku_pra_uji' and grantee in ('anon','authenticated') order by 1, 2`),
    kebijakan: await q(`select policyname, qual from pg_policies where schemaname = 'public' and tablename = 'sku_pra_uji'`),
    rls: await q(`select relrowsecurity from pg_class where oid = 'public.sku_pra_uji'::regclass`),
    kolom: await q(`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'sku_pra_uji' order by 1`),
    indeks: await q(`select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'sku_pra_uji' order by 1`),
    pemicu: await q(`select tgname, pg_get_triggerdef(t.oid) def from pg_trigger t where tgrelid in ('public.sku_pra_uji'::regclass) and not tgisinternal order by 1`),
    batasan: await q(`select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid = 'public.sku_pra_uji'::regclass order by 1`),
    jenisNotif: await q(`select pg_get_constraintdef(oid) def from pg_constraint where conname = 'notifikasi_jenis_check'`),
  };
};
const bandingkan = (nama, pa, pb) => {
  for (const k of Object.keys(pa)) {
    const sama = JSON.stringify(pa[k]) === JSON.stringify(pb[k]);
    ok(sama, `${nama}: katalog setara (${k}): ${pa[k].length} entri`);
    if (!sama) {
      const a = new Set(pa[k].map((x) => JSON.stringify(x))), b = new Set(pb[k].map((x) => JSON.stringify(x)));
      console.log('   hanya di skema baru =', [...a].filter((x) => !b.has(x)).slice(0, 5), '\n   hanya di migrasi =', [...b].filter((x) => !a.has(x)).slice(0, 5));
    }
  }
};

const A = await baru(`${P}/supabase/skema.sql`);
const pa = await potret(A);
ok(pa.fungsi.some((f) => f.proname === 'sg_pra_uji_catat') && pa.fungsi.some((f) => f.proname === 'pra_uji_aktif'), 'skema baru memuat fungsi pra-uji');
ok(pa.hakTabel.length === 1 && pa.hakTabel[0].privilege_type === 'SELECT' && pa.rls[0].relrowsecurity === true, 'sku_pra_uji: RLS aktif, hanya hak SELECT bagi authenticated');
ok(pa.hakFungsi.filter((x) => x.routine_name === 'sg_pra_uji_catat' && x.grantee === 'authenticated').length === 1 && !pa.hakFungsi.some((x) => x.routine_name.startsWith('sg_pra_uji') && x.grantee === 'anon'), 'fungsi pra-uji hanya dapat dipanggil authenticated');

const SEBELUM = 'git:6ad8610'; // commit TEPAT sebelum migrasi ini (main sesudah PR #13 dan #14)

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru(SEBELUM);
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const sebelum = await cacah(B1);
ok((await B1.query(`select to_regclass('public.sku_pra_uji') as t`)).rows[0].t === null, 'prasyarat: skema lama belum punya tabel sku_pra_uji');
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
ok((await B1.query(`select count(*)::int n from public.sku_pra_uji`)).rows[0].n === 0 && (await B1.query(`select count(*)::int n from public.pengaturan where kunci = 'pra_uji.aktif'`)).rows[0].n === 0, 'migrasi tidak mengarang pra-uji dan sakelar tetap mati (bawaan)');
await B1.exec(MP); await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'menjalankan migrasi tiga kali: data tetap sama');
bandingkan('database berisi data', pa, await potret(B1));

console.log('\n--- Sesudah migrasi: sakelar dan pra-uji berfungsi ---');
{
  const masuk = async (username) => { const k = buatKlienFake(B1); const a = buatApi(k); const r = await a.masuk(username, PIN_DEMO[username] ?? PIN_DEMO.penegak); return { k, a, id: r.id }; };
  const pembina = await masuk('pembina');
  const ahmad = await masuk('10231');
  const bagas = await masuk('10007');
  const admin = await masuk('admin');
  let r = await ahmad.k.rpc('sg_pra_uji_sakelar', { p_aktif: true });
  ok(r.error != null, 'Penegak ditolak mengubah sakelar');
  r = await bagas.k.rpc('sg_pra_uji_antrian');
  ok(!r.error && r.data.aktif === false, 'antrian: sakelar mati (bawaan)');
  r = await pembina.k.rpc('sg_pra_uji_sakelar', { p_aktif: true });
  ok(!r.error && r.data.aktif === true, `Pembina menghidupkan sakelar (${r.error?.message ?? 'ok'})`);
  await B1.query("delete from public.sku_progress where peserta_id = $1 and sku_id = 'BAN-05'", [ahmad.id]);
  r = await ahmad.k.rpc('sg_sku_ajukan', { p_sku_id: 'BAN-05', p_jadwal: '2030-01-10', p_penguji_id: null, p_catatan: '' });
  ok(!r.error, `Penegak mengajukan lewat jalur baru (${r.error?.message ?? 'ok'})`);
  r = await admin.k.rpc('sg_cadangan_admin');
  ok(!r.error && Array.isArray(r.data.tabel.sku_pra_uji) && Array.isArray(r.data.tabel.bina_damping) && Array.isArray(r.data.tabel.agenda), 'cadangan data memuat sku_pra_uji tanpa kehilangan tabel lain');
}

console.log('\n--- Tanpa migrasi sebelumnya: gagal jelas ---');
const B3 = await baru('git:6a4d494'); // sebelum Fase B (tanpa bina_damping)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
ok((await B3.query(`select to_regclass('public.sku_pra_uji') as t`)).rows[0].t === null, 'kegagalan membatalkan seluruh migrasi (tabel tidak dibuat)');

console.log(`\nRINGKASAN MIGRASI PRA-UJI: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
