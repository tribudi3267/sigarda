// Migrasi jenis kelamin anggota: kesetaraan dengan skema baru, data utuh, idempoten, perilaku pada data lama, dan gagal jelas bila prasyarat belum ada.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { skemaLama } from '../scripts/skema-lama.mjs';
import { siapkanPg, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';

const P = process.cwd().replace(/\\/g, '/');
let g = 0, l = 0;
const ok = (c, m) => { if (c) { l++; console.log('ok   :', m); } else { g++; console.log('GAGAL:', m); } };
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
// Akhir baris disamakan (LF): checkout Windows dapat mengubah berkas menjadi CRLF, sedangkan skema lama dari git berakhir LF.
const bersih = (s) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const M = ['sidang-dk', 'sidang-format-nomor', 'raport', 'instrumen', 'verifikasi-sesi', 'nta-anggota', 'butir-agama-pembina', 'indeks-kode-verifikasi', 'iuran', 'penugasan', 'penegakan', 'dokumen', 'data-gudep', 'jabatan-dewan', 'notifikasi', 'jenis-kelamin'].map((n) => bersih(readFileSync(`${P}/supabase/migrasi/2026-09-${n}.sql`, 'utf8')));
const MP = M[15]; // hanya migrasi jenis kelamin yang diuji di sini

// Skema "sebelum migrasi" diambil dari riwayat git: 'git:<commit>' = supabase/skema.sql pada commit itu (commit TEPAT sebelum migrasi notifikasi).
const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.sku_riwayat)::int r, (select count(*) from auth.users)::int u`)).rows[0];
const TABEL = `('notifikasi','push_langganan','push_konfigurasi','pengaturan','sidang_dk','sidang_urut','profiles','raport','instrumen','instrumen_kriteria','instrumen_penguji','instrumen_panduan','sku_penilaian','sku_progress','sku_riwayat','sertifikat_tingkat','sesi_ujian','sesi_ujian_butir','sesi_ujian_peserta','iuran','iuran_log','iuran_kas','asisten_iuran','penugasan_rombel','penugasan_log','guru_agama','dokumen_terbit','dokumen_urut')`;
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    kolom: await q(`select table_name, column_name, data_type, is_nullable, column_default, is_identity from information_schema.columns where table_schema = 'public' and table_name in ${TABEL} order by table_name, column_name`),
    batasan: await q(`select conrelid::regclass::text tabel, conname, pg_get_constraintdef(oid) def from pg_constraint where connamespace = 'public'::regnamespace and conrelid::regclass::text in ${TABEL} order by 1, 2`),
    indeks: await q(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in ${TABEL} order by 1, 2`),
    kebijakan: await q(`select tablename, policyname, cmd, roles::text, qual from pg_policies where schemaname = 'public' order by 1, 2`),
    rls: await q(`select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ${TABEL} order by 1`),
    pemicu: await q(`select tgrelid::regclass::text tabel, tgname, pg_get_triggerdef(oid) def from pg_trigger where not tgisinternal and tgrelid::regclass::text in ${TABEL} order by 1, 2`),
    fungsi: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_function_result(p.oid) hasil, md5(p.prosrc) badan
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','sigarda') and (p.proname like 'sg\\_%' or n.nspname = 'sigarda') order by 1, 2, 3`),
    hakTabel: await q(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name in ${TABEL} and grantee in ('anon','authenticated','service_role') order by 1, 2, 3`),
    hakFungsi: await q(`select routine_schema, routine_name, grantee, privilege_type from information_schema.role_routine_grants
      where routine_schema in ('public','sigarda') and grantee in ('anon','authenticated','service_role') and (routine_name like 'sg\\_%' or routine_schema = 'sigarda') order by 1, 2, 3, 4`),
  };
};
const bandingkan = (nama, pa, pb) => {
  for (const k of Object.keys(pa)) {
    const sama = JSON.stringify(pa[k]) === JSON.stringify(pb[k]);
    ok(sama, `${nama}: katalog setara (${k}): ${pa[k].length} entri`);
    if (!sama) {
      const sa = new Set(pa[k].map((x) => JSON.stringify(x))), sb = new Set(pb[k].map((x) => JSON.stringify(x)));
      console.log('   hanya di skema baru =', [...sa].filter((x) => !sb.has(x)).slice(0, 3), '| hanya di migrasi =', [...sb].filter((x) => !sa.has(x)).slice(0, 3));
    }
  }
};

// Skema "sesudah jenis kelamin" = skema.sql terbaru (dibuat dari inti.sql).
const A = await baru('git:2a8ebc3'); // skema tepat sesudah migrasi jenis kelamin (bukan skema.sql terbaru, yang sudah memuat migrasi sesudahnya)
const pa = await potret(A);
ok(pa.fungsi.some((x) => x.proname === 'sg_anggota_jk_atur') && pa.kolom.some((x) => x.table_name === 'profiles' && x.column_name === 'jenis_kelamin'), 'skema baru memuat sg_anggota_jk_atur dan kolom profiles.jenis_kelamin');

const SEBELUM = 'git:060fe49'; // commit TEPAT sebelum migrasi jenis kelamin (notifikasi dan PWA sudah terbit)

console.log('--- Jalur 1: database Anda sekarang (sampai notifikasi), berisi data ---');
const B1 = await baru(SEBELUM);
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const sebelum = await cacah(B1);
ok((await B1.query(`select count(*)::int n from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'jenis_kelamin'`)).rows[0].n === 0, 'prasyarat: skema lama belum punya kolom jenis_kelamin');
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
ok((await B1.query('select count(*)::int n from public.profiles where jenis_kelamin is not null')).rows[0].n === 0, 'anggota yang sudah ada tetap kosong (dilengkapi Admin kemudian)');
await B1.exec(MP); await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'menjalankan migrasi tiga kali: data tetap sama');
bandingkan('jalur 1', pa, await potret(B1));

console.log('\n--- Sesudah migrasi: perilaku pada data lama ---');
{
  const id = async (sql, a = []) => (await B1.query(sql, a)).rows[0].id;
  const pembina = await id(`select id from public.profiles where role = 'penguji' and jabatan = 'Pembina'`);
  const admin = await id(`select id from public.profiles where role = 'admin'`);
  const sebagai = async (uid, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(B1, uid, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
  let r = await sebagai(pembina, `select public.sg_anggota_jk_atur('[{"username":"10231","jk":"L"}]'::jsonb)`);
  ok(!r.ok && /Hanya Admin Gudep/.test(r.pesan), 'Pembina tidak dapat mengatur jenis kelamin');
  r = await sebagai(admin, `select public.sg_anggota_jk_atur('[{"username":"10231","jk":"l"},{"username":"pembina","jk":"P"}]'::jsonb) n`);
  ok(r.ok && r.rows[0].n === 2, 'Admin mengatur dua anggota pada database hasil migrasi');
  r = await sebagai(admin, `select public.sg_anggota_jk_atur('[{"username":"10231","jk":"P"},{"username":"pembina","jk":"Z"}]'::jsonb)`);
  ok(!r.ok && (await B1.query(`select jenis_kelamin from public.profiles where username = '10231'`)).rows[0].jenis_kelamin === 'L', 'baris tidak sah membatalkan seluruh permintaan');
}

console.log('\n--- Jalur 2: database sebelum Sidang, semua migrasi berurutan ---');
const B2 = await baru('git:be46788');
await isiDataContoh(B2);
const s2 = await cacah(B2);
for (const m of M) await B2.exec(m);
ok(JSON.stringify(await cacah(B2)) === JSON.stringify(s2), 'data tidak berubah oleh semua migrasi');
bandingkan('jalur 2', pa, await potret(B2));

console.log('\n--- Jalur 3: tanpa migrasi penugasan: gagal jelas ---');
const B3 = await baru('git:be46788'); // sebelum penugasan (tanpa sigarda.wajib_admin)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
ok((await B3.query(`select count(*)::int n from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'jenis_kelamin'`)).rows[0].n === 0, 'kegagalan membatalkan seluruh migrasi (kolom tidak tertambah)');

console.log(`\nRINGKASAN MIGRASI JENIS KELAMIN: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
