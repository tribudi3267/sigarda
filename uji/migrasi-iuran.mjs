import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { skemaLama } from '../scripts/skema-lama.mjs';
import { siapkanPg } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';

const P = process.cwd().replace(/\\/g, '/');
const SP = `${P}/.uji/tmp`;
let g = 0, l = 0;
const ok = (c, m) => { if (c) { l++; console.log('ok   :', m); } else { g++; console.log('GAGAL:', m); } };
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
// Akhir baris disamakan (LF): checkout Windows dapat mengubah berkas menjadi CRLF, sedangkan skema lama dari git berakhir LF; isi fungsi dibandingkan lewat md5.
const bersih = (s) => s.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const M = ['sidang-dk', 'sidang-format-nomor', 'raport', 'instrumen', 'verifikasi-sesi', 'nta-anggota', 'butir-agama-pembina', 'indeks-kode-verifikasi', 'iuran'].map((n) => bersih(readFileSync(`${P}/supabase/migrasi/2026-09-${n}.sql`, 'utf8')));
const M5 = M[8]; // hanya migrasi iuran yang diuji di sini

// Skema "sebelum migrasi" diambil dari riwayat git: 'git:<commit>' = supabase/skema.sql pada commit itu (mis. git:e2236da = sebelum iuran).
// Untuk migrasi berikutnya, pakai commit TEPAT SEBELUM perubahan skema itu.
const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.absensi_hadir)::int a, (select count(*) from auth.users)::int u`)).rows[0];
const TABEL = `('pengaturan','sidang_dk','sidang_urut','profiles','raport','instrumen','instrumen_kriteria','instrumen_penguji','instrumen_panduan','sku_penilaian','sku_progress','sku_riwayat','sertifikat_tingkat','sesi_ujian','sesi_ujian_butir','sesi_ujian_peserta','iuran','iuran_log','iuran_kas','asisten_iuran')`;
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

// Skema "sesudah iuran" = commit tepat sebelum fase penugasan (skema.sql terbaru sudah memuat penugasan, yang diuji di uji/migrasi-penugasan.mjs).
const A = await baru('git:b804088');
const pa = await potret(A);
ok(pa.kolom.some((x) => x.table_name === 'sku_progress' && x.column_name === 'verifikasi_token') && pa.kolom.filter((x) => x.table_name === 'sesi_ujian').length >= 8, 'skema baru memuat kolom token dan tabel sesi');

console.log('--- Jalur 1: database Anda sekarang (sampai instrumen), berisi data ---');
const B1 = await baru('git:e2236da');
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const lulusSebelum = (await B1.query(`select count(*)::int n from public.sku_progress where status = 'lulus'`)).rows[0].n;
const sebelum = await cacah(B1);
const sebelumBaris = JSON.stringify((await B1.query(`select peserta_id, sku_id, status, jadwal, penguji_id, tanggal_uji, nilai, catatan, verifikasi, diverifikasi_pada from public.sku_progress order by peserta_id, sku_id`)).rows);
await B1.exec(M5);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah: ' + JSON.stringify(sebelum));
ok(JSON.stringify((await B1.query(`select peserta_id, sku_id, status, jadwal, penguji_id, tanggal_uji, nilai, catatan, verifikasi, diverifikasi_pada from public.sku_progress order by peserta_id, sku_id`)).rows) === sebelumBaris, 'isi progres tidak berubah (selain token)');
let t = (await B1.query(`select count(*) filter (where status = 'lulus' and verifikasi_token is not null)::int a, count(*) filter (where status <> 'lulus' and verifikasi_token is not null)::int b, count(distinct verifikasi_token)::int c from public.sku_progress`)).rows[0];
ok(lulusSebelum > 50 && t.a === lulusSebelum && t.b === 0 && t.c === lulusSebelum, `semua ${lulusSebelum} butir lulus diberi token unik, yang lain tanpa token`);
const tokenSebelum = JSON.stringify((await B1.query('select peserta_id, sku_id, verifikasi_token from public.sku_progress where verifikasi_token is not null order by 1, 2')).rows);
await B1.exec(M5);
ok(JSON.stringify((await B1.query('select peserta_id, sku_id, verifikasi_token from public.sku_progress where verifikasi_token is not null order by 1, 2')).rows) === tokenSebelum, 'menjalankan migrasi dua kali: token yang sudah ada tidak berubah');
ok(/^[0-9a-f]{32}$/.test((await B1.query('select verifikasi_token t from public.sku_progress where verifikasi_token is not null limit 1')).rows[0].t), 'format token: 32 heksadesimal');
bandingkan('jalur 1', pa, await potret(B1));

console.log('\n--- Jalur 2: database sebelum Sidang, lima migrasi berurutan ---');
const B2 = await baru('git:be46788');
await isiDataContoh(B2);
const s2 = await cacah(B2);
for (const m of M) await B2.exec(m);
ok(JSON.stringify(await cacah(B2)) === JSON.stringify(s2), 'data tidak berubah oleh lima migrasi');
bandingkan('jalur 2', pa, await potret(B2));

console.log('--- Data sebelumnya utuh, hak akses, dan sg_absen_hapus_sesi diperbarui ---');
{
  const C = await baru('git:e2236da'); await isiDataContoh(C);
  const s0 = await cacah(C);
  const uraianLama = (await C.query(`select md5(prosrc) m from pg_proc where proname = 'sg_absen_hapus_sesi'`)).rows[0].m;
  await C.exec(M5);
  ok(JSON.stringify(await cacah(C)) === JSON.stringify(s0), 'jumlah data tidak berubah oleh migrasi iuran: ' + JSON.stringify(s0));
  ok((await C.query(`select md5(prosrc) m from pg_proc where proname = 'sg_absen_hapus_sesi'`)).rows[0].m !== uraianLama, 'sg_absen_hapus_sesi diperbarui (menolak sesi berisi catatan uang)');
  const h = (await C.query(`select has_function_privilege('authenticated', 'public.sg_iuran_set(date, uuid, int)', 'execute') a, has_function_privilege('anon', 'public.sg_iuran_set(date, uuid, int)', 'execute') b, has_function_privilege('anon', 'public.sg_iuran_agregat(date, date)', 'execute') c`)).rows[0];
  ok(h.a && !h.b && !h.c, 'fungsi iuran: hanya peran login yang dapat menjalankan; tanpa login tidak');
  await C.exec(M5); await C.exec(M5);
  ok((await C.query(`select count(*)::int n from pg_policies where tablename in ('iuran','iuran_log','iuran_kas','asisten_iuran')`)).rows[0].n === 4, 'menjalankan migrasi berulang tidak menggandakan kebijakan (4 kebijakan)');
}

console.log('\n--- Jalur 3: tanpa skema dasar: gagal jelas ---');
const B3 = new PGlite();
let galat = null;
try { await B3.exec(M5); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));

console.log(`\nRINGKASAN MIGRASI IURAN: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
