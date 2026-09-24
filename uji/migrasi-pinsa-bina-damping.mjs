// Migrasi Pinsa dan Bina Damping (fase B): kesetaraan dengan skema baru, data utuh, idempoten, hak akses, dan gagal jelas bila prasyarat belum ada.
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
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-pinsa-bina-damping.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.penugasan_rombel)::int pr,
  (select count(*) from public.agenda)::int a, (select count(*) from public.notifikasi)::int no`)).rows[0];
const NAMA_PUBLIK = ['sg_bina_damping_atur', 'sg_bina_damping_daftar', 'sg_sangga_rombel', 'sg_sangga_atur', 'sg_pendampingan_saya', 'sg_cadangan_admin'];
const NAMA_SIGARDA = ['tingkat_penegak', 'bina_damping_rombel', 'sangga_bisa_atur', 'sangga_peringatan', 'pinsa_bersihkan', 'bina_damping_bersihkan'];
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  const dafPublik = NAMA_PUBLIK.map((n) => `'${n}'`).join(','), dafSigarda = NAMA_SIGARDA.map((n) => `'${n}'`).join(',');
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where (n.nspname = 'public' and p.proname in (${dafPublik}) and p.proname <> 'sg_cadangan_admin') or (n.nspname = 'sigarda' and p.proname in (${dafSigarda})) order by 1, 2`),
    hakFungsi: await q(`select routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema = 'public' and routine_name in (${dafPublik}) and grantee in ('anon','authenticated','service_role') order by 1, 2, 3`),
    hakTabel: await q(`select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'bina_damping' and grantee in ('anon','authenticated') order by 1, 2`),
    kebijakan: await q(`select policyname from pg_policies where schemaname = 'public' and tablename = 'bina_damping'`),
    rls: await q(`select relrowsecurity from pg_class where oid = 'public.bina_damping'::regclass`),
    kolom: await q(`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name in ('bina_damping') order by 1`),
    kolomPinsa: await q(`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'pinsa'`),
    indeks: await q(`select indexname, indexdef from pg_indexes where schemaname = 'public' and (tablename = 'bina_damping' or indexname = 'profil_pinsa_unik') order by 1`),
    pemicu: await q(`select tgname, pg_get_triggerdef(t.oid) def from pg_trigger t where tgrelid = 'public.profiles'::regclass and not tgisinternal and tgname like 'profiles\\_%' order by 1`),
    batasan: await q(`select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profil_pinsa'`),
  };
};
const bandingkan = (nama, pa, pb) => {
  for (const k of Object.keys(pa)) {
    const sama = JSON.stringify(pa[k]) === JSON.stringify(pb[k]);
    ok(sama, `${nama}: katalog setara (${k}): ${pa[k].length} entri`);
    if (!sama) console.log('   baru =', JSON.stringify(pa[k]), '\n   migrasi =', JSON.stringify(pb[k]));
  }
};

// Skema "sesudah" = skema.sql terbaru (migrasi ini adalah yang paling baru; belum ada migrasi lagi sesudahnya).
const A = await baru(`${P}/supabase/skema.sql`);
const pa = await potret(A);
// sg_cadangan_admin tidak ikut dibandingkan isinya: migrasi Fase A (pengukuhan-dewan) menulisnya ulang dengan tabel tambahan; perilakunya dicek di bawah.
ok(pa.fungsi.length === 11, `skema baru memuat semua fungsi Pinsa/Bina Damping (5 public + 6 sigarda): ${pa.fungsi.length}`);
ok(pa.hakTabel.length === 0 && pa.kebijakan.length === 0 && pa.rls[0].relrowsecurity === true, 'bina_damping: RLS aktif, tanpa kebijakan dan tanpa hak tabel bagi pengguna (hanya lewat fungsi)');
ok(pa.hakFungsi.filter((x) => x.grantee === 'authenticated').length === 6 && !pa.hakFungsi.some((x) => x.grantee === 'anon'), 'kelima fungsi baru dan cadangan hanya dapat dipanggil authenticated');

const SEBELUM = 'git:90cb914'; // commit TEPAT sebelum migrasi ini

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru(SEBELUM);
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const sebelum = await cacah(B1);
ok((await B1.query(`select to_regclass('public.bina_damping') as t`)).rows[0].t === null, 'prasyarat: skema lama belum punya tabel bina_damping');
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
ok((await B1.query(`select count(*)::int n from public.bina_damping`)).rows[0].n === 0 && (await B1.query(`select count(*)::int n from public.profiles where pinsa`)).rows[0].n === 0, 'tidak ada Bina Damping/Pinsa yang dikarang oleh migrasi');
await B1.exec(MP); await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'menjalankan migrasi tiga kali: data tetap sama');
bandingkan('database berisi data', pa, await potret(B1));

console.log('\n--- Sesudah migrasi: fungsi berfungsi ---');
{
  const masuk = async (username) => { const k = buatKlienFake(B1); const a = buatApi(k); const r = await a.masuk(username, PIN_DEMO[username] ?? PIN_DEMO.penegak); return { k, a, id: r.id }; };
  const pembina = await masuk('pembina');
  const admin = await masuk('admin');
  const bagas = await masuk('10007');
  const ahmad = await masuk('10231');
  const ta = (await B1.query('select sigarda.tahun_ajaran_kini() t')).rows[0].t;
  await B1.query(`insert into public.sku_progress (peserta_id, sku_id, status) select p.id, u.id, 'lulus' from public.profiles p join public.sku_unit u on (u.agama is null or u.agama = p.agama) where p.id = $1
                  on conflict (peserta_id, sku_id) do update set status = 'lulus'`, [bagas.id]);
  let r = await pembina.k.rpc('sg_anggota_jabatan_dewan_atur', { p_data: [{ username: '10007', jabatan: 'Bendahara' }] });
  ok(!r.error, 'jabatan Dewan diberikan pada database hasil migrasi');
  r = await ahmad.k.rpc('sg_bina_damping_atur', { p_tahun_ajaran: ta, p_rombel: 'XII-01', p_penegak_ids: [bagas.id] });
  ok(r.error != null, 'Penegak biasa ditolak menunjuk Bina Damping pada database hasil migrasi');
  r = await pembina.k.rpc('sg_bina_damping_atur', { p_tahun_ajaran: ta, p_rombel: 'X-01', p_penegak_ids: [bagas.id] });
  ok(!r.error && r.data === 1, `Pembina menunjuk Bina Damping (${r.error?.message ?? 'ok'})`);
  r = await bagas.k.rpc('sg_pendampingan_saya');
  ok(!r.error && r.data.bina_damping[0] === 'X-01', 'peran pendampingan terbaca pada database hasil migrasi');
  r = await bagas.k.rpc('sg_sangga_atur', { p_rombel: 'X-01', p_data: [{ id: ahmad.id, sangga: 'Sangga Merak' }] });
  ok(!r.error && r.data.diubah === 1, `Bina Damping membagi sangga (${r.error?.message ?? 'ok'})`);
  r = await admin.k.rpc('sg_cadangan_admin');
  ok(!r.error && r.data.tabel.bina_damping.length === 1 && Array.isArray(r.data.tabel.agenda) && Array.isArray(r.data.tabel.kegiatan_usulan), 'cadangan data memuat bina_damping tanpa kehilangan tabel lain');
  await B1.query(`update public.profiles set jabatan_dewan = null where id = $1`, [bagas.id]);
  ok((await B1.query('select count(*)::int n from public.bina_damping')).rows[0].n === 0, 'pemicu pembersihan bekerja pada database hasil migrasi');
}

console.log('\n--- Tanpa migrasi sebelumnya: gagal jelas ---');
const B3 = await baru('git:6a4d494'); // sebelum usulan kegiatan (tanpa sg_kegiatan_ping)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
ok((await B3.query(`select to_regclass('public.bina_damping') as t`)).rows[0].t === null, 'kegagalan membatalkan seluruh migrasi (tabel tidak dibuat)');

console.log(`\nRINGKASAN MIGRASI PINSA-BINA-DAMPING: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
