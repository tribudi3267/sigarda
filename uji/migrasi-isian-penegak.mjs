// Migrasi isian data diri Penegak dan templat dokumen (Tahap 3, H1): kesetaraan dengan skema baru (fungsi, tabel, kebijakan, pemicu, hak, batasan profil), data utuh, idempoten,
// perilaku baru, dan gagal jelas bila prasyarat (migrasi cakupan pra-uji) belum ada.
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
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-isian-penegak.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.penugasan_rombel)::int pr,
  (select count(*) from public.agenda)::int a, (select count(*) from public.notifikasi)::int no, (select count(*) from public.bina_damping)::int bd, (select count(*) from public.sku_pra_uji)::int pu,
  (select count(*) from public.pelantikan)::int pl, (select count(*) from public.tkk_capaian)::int tk, (select count(*) from public.tanggal_lahir)::int tl, (select count(*) from public.tim_penilai)::int tim`)).rows[0];
const TABEL = `('penegak_isian', 'dokumen_templat')`;
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  const ada = (await q(`select to_regclass('public.penegak_isian') t`))[0].t !== null;
  return {
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'sigarda') and p.prokind = 'f' order by 1, 2, 3`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema in ('public', 'sigarda') and grantee in ('anon','authenticated','service_role') order by 1, 2, 3, 4`),
    hakTabel: await q(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name in ${TABEL} and grantee in ('anon','authenticated') order by 1, 2, 3`),
    rls: ada ? await q(`select relname, relrowsecurity from pg_class where oid in ('public.penegak_isian'::regclass, 'public.dokumen_templat'::regclass) order by 1`) : [],
    kebijakan: await q(`select tablename, policyname, qual from pg_policies where schemaname = 'public' and tablename in ${TABEL} order by 1, 2`),
    kolom: await q(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name in ${TABEL} order by 1, 2`),
    indeks: await q(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in ${TABEL} order by 1, 2`),
    pemicu: ada ? await q(`select tgrelid::regclass::text tabel, tgname, pg_get_triggerdef(t.oid) def from pg_trigger t where tgrelid in ('public.penegak_isian'::regclass, 'public.dokumen_templat'::regclass) and not tgisinternal order by 1, 2`) : [],
    batasan: ada ? await q(`select conrelid::regclass::text tabel, conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid in ('public.penegak_isian'::regclass, 'public.dokumen_templat'::regclass) order by 1, 2`) : [],
    batasanProfil: await q(`select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid = 'public.profiles'::regclass order by 1`),
    semuaPemicu: await q(`select tgrelid::regclass::text tabel, tgname from pg_trigger where not tgisinternal and tgrelid::regclass::text like 'public.%' order by 1, 2`),
  };
};

const A = await baru('git:56caa88'); // skema tepat sesudah migrasi ini (main sesudah PR #27); skema.sql terbaru memuat tahap sesudahnya
const pa = await potret(A);

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru('git:fe86d84'); // commit TEPAT sebelum migrasi ini (main sesudah G4e)
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const sebelum = await cacah(B1);
const md5Fungsi = async (db, nama) => (await db.query(`select md5(p.prosrc) m from pg_proc p where p.proname = $1`, [nama])).rows[0].m;
ok((await B1.query(`select to_regclass('public.penegak_isian') as t`)).rows[0].t === null, 'prasyarat: skema lama belum punya tabel penegak_isian');
const lama = { cad: await md5Fungsi(B1, 'sg_cadangan_admin'), ubah: await md5Fungsi(B1, 'sg_anggota_ubah'), tolak: await md5Fungsi(B1, 'tolak_peserta_tak_aktif'), sangga: await md5Fungsi(B1, 'sangga_peringatan'), atur: await md5Fungsi(B1, 'sg_sangga_atur') };
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
for (const [k, fn] of [['cad', 'sg_cadangan_admin'], ['ubah', 'sg_anggota_ubah'], ['tolak', 'tolak_peserta_tak_aktif'], ['sangga', 'sangga_peringatan'], ['atur', 'sg_sangga_atur']]) {
  ok(await md5Fungsi(B1, fn) !== lama[k], `${fn} ditulis ulang oleh migrasi`);
}
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
  const masuk = async (username, pin) => { const k = buatKlienFake(B1); const a = buatApi(k); const r = await a.masuk(username, pin); return { k, a, id: r.id }; };
  const admin = await masuk('admin', PIN_DEMO.admin);
  const pembina = await masuk('pembina', PIN_DEMO.pembina);
  const siti = await masuk('10232', PIN_DEMO.penegak);
  let r = await admin.a.buatAkun('peserta', [{ no: 1, nama: 'Budi Baru', nis: '20001', kelas: 'X-01' }]);
  ok(r.ok && r.hasil?.[0]?.ok, 'akun Penegak dibuat hanya dengan nama, NIS, dan rombel (batasan profil dilonggarkan) ' + JSON.stringify(r.hasil?.[0]));
  const budi = await masuk('20001', r.hasil?.[0]?.pin);
  await B1.query('update public.profiles set wajib_ganti_pin = false');
  let tolak = null;
  try { await B1.query(`insert into public.sku_progress (peserta_id, sku_id, status) select $1, id, 'diajukan' from public.sku_unit where tingkat = 'Bantara' and agama is null limit 1`, [budi.id]); } catch (e) { tolak = e.message; }
  ok(/belum mengisi agama/.test(tolak ?? ''), 'penjaga agama pada pemicu aktif di database hasil migrasi');
  r = await budi.a.simpanIsianSaya({ agama: 'Islam', tempat_lahir: 'Purbalingga', alamat: 'Jl. Melati 5' });
  ok(r.ok, 'Penegak mengisi data dirinya sendiri sesudah migrasi ' + (r.pesan ?? ''));
  r = await budi.a.muatIsian();
  ok(r.ok && r.data.isian.tempat_lahir === 'Purbalingga', 'Penegak membaca isian miliknya');
  r = await siti.a.muatIsian();
  ok(r.ok && Object.keys(r.data.isian).length === 0, 'Penegak lain tidak membaca isian Budi');
  r = await pembina.a.muatIsian(budi.id);
  ok(r.ok && r.data.isian.alamat === 'Jl. Melati 5', 'Pembina membaca isian Budi');
  r = await pembina.a.simpanTemplatDokumen({ tahunAjaran: '2026/2027', jenis: 'surat_uud', isi: { baris: ['Hafal pembukaan'] } });
  ok(r.ok, 'Pembina menyimpan templat surat ' + (r.pesan ?? ''));
  r = await siti.a.simpanTemplatDokumen({ tahunAjaran: '2026/2027', jenis: 'surat_uud', isi: { baris: ['x'] } });
  ok(!r.ok && /Hanya Pembina dan Admin/.test(r.pesan), 'Penegak ditolak mengisi templat');
  r = await admin.k.rpc('sg_cadangan_admin');
  ok(!r.error && Array.isArray(r.data.tabel.penegak_isian) && r.data.tabel.penegak_isian.length === 2 && Array.isArray(r.data.tabel.dokumen_templat) && r.data.tabel.dokumen_templat.length === 1 && Array.isArray(r.data.tabel.tim_penilai), 'cadangan data memuat tabel baru tanpa kehilangan tabel lama');
  r = await sqlSebagai(B1, admin.id, `select public.sg_anggota_ubah($1, 'Budi Baru 2', 'X-01', '', '', null)`, [budi.id]).then(() => ({ ok: true }), (e) => ({ ok: false, pesan: e.message }));
  ok(r.ok, 'sg_anggota_ubah tidak lagi mewajibkan sangga dan agama ' + (r.pesan ?? ''));
}

console.log('\n--- Tanpa migrasi sebelumnya: gagal jelas ---');
const B3 = await baru('git:91338f6'); // jauh sebelum migrasi cakupan pra-uji (tanpa sg_pra_uji_cakupan)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
ok((await B3.query(`select to_regclass('public.penegak_isian') as t`)).rows[0].t === null, 'kegagalan membatalkan seluruh migrasi (tabel tidak dibuat)');

console.log(`\nRINGKASAN MIGRASI ISIAN-PENEGAK: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
