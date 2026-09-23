// Migrasi fase 2a (dokumen terbit dan surat pengantar guru agama): kesetaraan dengan skema baru, data utuh, idempoten, dan perilaku pada data lama.
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
const M = ['sidang-dk', 'sidang-format-nomor', 'raport', 'instrumen', 'verifikasi-sesi', 'nta-anggota', 'butir-agama-pembina', 'indeks-kode-verifikasi', 'iuran', 'penugasan', 'penegakan', 'dokumen'].map((n) => bersih(readFileSync(`${P}/supabase/migrasi/2026-09-${n}.sql`, 'utf8')));
const MP = M[11]; // hanya migrasi dokumen yang diuji di sini

// Skema "sebelum migrasi" diambil dari riwayat git: 'git:<commit>' = supabase/skema.sql pada commit itu (commit TEPAT sebelum fase 2a).
const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.sku_riwayat)::int r, (select count(*) from auth.users)::int u`)).rows[0];
const TABEL = `('pengaturan','sidang_dk','sidang_urut','profiles','raport','instrumen','instrumen_kriteria','instrumen_penguji','instrumen_panduan','sku_penilaian','sku_progress','sku_riwayat','sertifikat_tingkat','sesi_ujian','sesi_ujian_butir','sesi_ujian_peserta','iuran','iuran_log','iuran_kas','asisten_iuran','penugasan_rombel','penugasan_log','guru_agama','dokumen_terbit','dokumen_urut')`;
const potret = async (db) => {
  const q = async (sql) => (await db.query(sql)).rows;
  return {
    kolom: await q(`select table_name, column_name, data_type, is_nullable, column_default, is_identity from information_schema.columns where table_schema = 'public' and table_name in ${TABEL} order by table_name, column_name`),
    batasan: await q(`select conrelid::regclass::text tabel, conname, pg_get_constraintdef(oid) def from pg_constraint where connamespace = 'public'::regnamespace and conrelid::regclass::text in ${TABEL} order by 1, 2`),
    indeks: await q(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' and tablename in ${TABEL} order by 1, 2`),
    kebijakan: await q(`select tablename, policyname, cmd, roles::text, qual from pg_policies where schemaname = 'public' order by 1, 2`),
    rls: await q(`select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ${TABEL} order by 1`),
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

// Skema "sesudah dokumen" = skema.sql pada commit tepat sesudah fase 2a.
const A = await baru('git:709a260'); // skema tepat sesudah fase 2a (supabase/skema.sql terbaru sudah memuat migrasi berikutnya)
const pa = await potret(A);
ok(pa.fungsi.some((x) => x.proname === 'sg_dokumen_surat_agama_terbit') && pa.kolom.some((x) => x.table_name === 'dokumen_terbit'), 'skema baru memuat sg_dokumen_surat_agama_terbit dan tabel dokumen_terbit');

const SEBELUM = 'git:428ec5a'; // commit TEPAT sebelum fase dokumen (sudah memuat penegakan)

console.log('--- Jalur 1: database Anda sekarang (sampai penegakan), berisi data ---');
const B1 = await baru(SEBELUM);
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const sebelum = await cacah(B1);
const fungsiLama = (await B1.query(`select md5(prosrc) m from pg_proc where proname = 'sg_verifikasi_token'`)).rows[0].m;
ok((await B1.query(`select count(*)::int n from pg_proc where proname in ('sg_dokumen_surat_agama_terbit', 'sg_dokumen_cabut')`)).rows[0].n === 0, 'prasyarat: skema lama belum punya fungsi dokumen');
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
ok((await B1.query(`select md5(prosrc) m from pg_proc where proname = 'sg_verifikasi_token'`)).rows[0].m !== fungsiLama, 'sg_verifikasi_token diperbarui');
await B1.exec(MP); await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'menjalankan migrasi tiga kali: data tetap sama');
bandingkan('jalur 1', pa, await potret(B1));

console.log('\n--- Sesudah migrasi: perilaku pada data lama ---');
{
  const id = async (sql, a = []) => (await B1.query(sql, a)).rows[0].id;
  const pembina = await id(`select id from public.profiles where role = 'penguji' and jabatan = 'Pembina'`);
  const dewan = await id(`select id from public.profiles where role = 'penguji' and jabatan = 'Dewan Ambalan'`);
  const rina = await id(`select id from public.profiles where username = '10119'`);
  const sebagai = async (uid, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(B1, uid, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
  // Rina (Katolik) tidak punya Pembina seagama (Pembina contoh beragama Islam): surat pengantar diterbitkan, lalu Pembina mencatat hasil butir agamanya.
  let r = await sebagai(dewan, `select public.sg_dokumen_surat_agama_terbit($1, array['BAN-01-KAT-1'], null, 'Guru X', current_date, 'Gudep', 'Pembina', 'Pembina Gudep')`, [rina]);
  ok(!r.ok && /Hanya Pembina atau Admin/.test(r.pesan), 'Dewan Ambalan tidak dapat menerbitkan surat');
  await B1.query(`delete from public.sku_progress where peserta_id = $1 and sku_id = 'BAN-01-KAT-1'`, [rina]);
  r = await sebagai(pembina, `select public.sg_dokumen_surat_agama_terbit($1, array['BAN-01-KAT-1'], null, 'Yohanes Wibowo', current_date, 'Gugus Depan SMAN 1 Bukateja', 'Diana', 'Pembina Gudep') d`, [rina]);
  ok(r.ok && /^001\/SP\/\d{4}$/.test(r.rows[0].d.nomor) && /^[0-9a-f]{32}$/.test(r.rows[0].d.token), 'Pembina menerbitkan surat: nomor otomatis ' + (r.rows[0]?.d?.nomor ?? r.pesan));
  const token = r.rows?.[0]?.d?.token;
  r = await sebagai(null, `select public.sg_verifikasi_token($1) d`, [token]);
  ok(r.ok && r.rows[0].d.ditemukan && r.rows[0].d.jenis === 'dokumen' && r.rows[0].d.nama === 'Rina Wulandari', 'QR surat terverifikasi tanpa login');
  const catat = () => B1.query(`select public.sg_sku_catat_internal($1, $2, 'BAN-01-KAT-1', 'proses', current_date, null, '')`, [pembina, rina]);
  await catat();
  ok(/dinilai guru agama Yohanes Wibowo, surat nomor 001/.test((await B1.query(`select teks from public.sku_riwayat where peserta_id = $1 and sku_id = 'BAN-01-KAT-1' order by id desc limit 1`, [rina])).rows[0].teks), 'Pembina mencatat butir agama lewat surat: riwayat menyebut guru dan nomor surat');
}

console.log('\n--- Jalur 2: database sebelum Sidang, semua migrasi berurutan ---');
const B2 = await baru('git:be46788');
await isiDataContoh(B2);
const s2 = await cacah(B2);
for (const m of M) await B2.exec(m);
ok(JSON.stringify(await cacah(B2)) === JSON.stringify(s2), 'data tidak berubah oleh semua migrasi');
bandingkan('jalur 2', pa, await potret(B2));

console.log('\n--- Jalur 3: tanpa migrasi penegakan: gagal jelas ---');
const B3 = await baru('git:e83a8d3');
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));

console.log(`\nRINGKASAN MIGRASI DOKUMEN: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
