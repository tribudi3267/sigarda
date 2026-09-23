import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { skemaLama } from '../scripts/skema-lama.mjs';
import { siapkanPg } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { sqlSebagai } from '../src/lokal/klienFake.js';

const P = process.cwd().replace(/\\/g, '/');
const SP = `${P}/.uji/tmp`;
let g = 0, l = 0;
const ok = (c, m) => { if (c) { l++; console.log('ok   :', m); } else { g++; console.log('GAGAL:', m); } };
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
// Akhir baris disamakan (LF): checkout Windows dapat mengubah berkas menjadi CRLF, sedangkan skema lama dari git berakhir LF; isi fungsi dibandingkan lewat md5.
const bersih = (s) => s.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const M = ['sidang-dk', 'sidang-format-nomor', 'raport', 'instrumen', 'verifikasi-sesi', 'nta-anggota', 'butir-agama-pembina', 'indeks-kode-verifikasi', 'iuran', 'penugasan'].map((n) => bersih(readFileSync(`${P}/supabase/migrasi/2026-09-${n}.sql`, 'utf8')));
const MP = M[9]; // hanya migrasi penugasan yang diuji di sini

// Skema "sebelum migrasi" diambil dari riwayat git: 'git:<commit>' = supabase/skema.sql pada commit itu (mis. git:e2236da = sebelum iuran).
// Untuk migrasi berikutnya, pakai commit TEPAT SEBELUM perubahan skema itu.
const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.sku_progress)::int s, (select count(*) from public.absensi_hadir)::int a, (select count(*) from auth.users)::int u`)).rows[0];
const TABEL = `('pengaturan','sidang_dk','sidang_urut','profiles','raport','instrumen','instrumen_kriteria','instrumen_penguji','instrumen_panduan','sku_penilaian','sku_progress','sku_riwayat','sertifikat_tingkat','sesi_ujian','sesi_ujian_butir','sesi_ujian_peserta','iuran','iuran_log','iuran_kas','asisten_iuran','penugasan_rombel','penugasan_log','guru_agama')`;
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

// Skema "sesudah penugasan" = skema.sql pada commit tepat sesudah fase 1a.
const A = await baru('git:496687c'); // skema tepat sesudah fase 1a (supabase/skema.sql terbaru sudah memuat fase berikutnya)
const pa = await potret(A);
ok(pa.kolom.some((x) => x.table_name === 'penugasan_rombel' && x.column_name === 'rombel') && pa.kolom.some((x) => x.table_name === 'guru_agama'), 'skema baru memuat tabel penugasan dan guru agama');

const SEBELUM = 'git:b804088'; // commit TEPAT sebelum fase penugasan (sudah memuat iuran)

console.log('--- Jalur 1: database Anda sekarang (sampai iuran), berisi data ---');
const B1 = await baru(SEBELUM);
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
// Data lama: sebagian Penegak masih berkelas "X"/"XI"; agama Pembina belum diisi.
await B1.query(`update public.profiles set kelas = 'X' where username in ('10231', '10232')`);
await B1.query(`update public.profiles set kelas = 'XI' where username = '10118'`);
const sebelum = await cacah(B1);
const fungsiLama = (await B1.query(`select md5(prosrc) m from pg_proc where proname = 'sg_anggota_ubah'`)).rows[0].m;
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah: ' + JSON.stringify(sebelum));
ok((await B1.query(`select count(*)::int n from public.profiles where kelas in ('X', 'XI')`)).rows[0].n === 3, 'kelas lama ("X", "XI") tidak diubah oleh migrasi');
ok((await B1.query(`select md5(prosrc) m from pg_proc where proname = 'sg_anggota_ubah'`)).rows[0].m !== fungsiLama, 'sg_anggota_ubah diperbarui');
await B1.exec(MP); await B1.exec(MP);
ok((await B1.query(`select count(*)::int n from pg_policies where tablename in ('penugasan_rombel','penugasan_log','guru_agama')`)).rows[0].n === 3, 'menjalankan migrasi berulang tidak menggandakan kebijakan (3 kebijakan)');
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'menjalankan migrasi tiga kali: data tetap sama');
bandingkan('jalur 1', pa, await potret(B1));

console.log('\n--- Sesudah migrasi: perilaku pada data lama ---');
{
  const admin = (await B1.query(`select id from public.profiles where role = 'admin'`)).rows[0].id;
  const pembina = (await B1.query(`select id from public.profiles where role = 'penguji' and jabatan = 'Pembina'`)).rows[0].id;
  const p1 = (await B1.query(`select id from public.profiles where username = '10231'`)).rows[0].id;
  const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(B1, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
  // Kelas lama yang TIDAK diubah tetap dapat disimpan (mis. mengganti nama), tetapi diubah ke nilai bukan rombel ditolak.
  let r = await sebagai(admin, `select public.sg_anggota_ubah($1, 'Ahmad Fauzi B.', 'X', 'Sangga Elang', 'Islam', null)`, [p1]);
  ok(r.ok, 'data lama: ubah nama dengan kelas lama yang sama tetap boleh' + (r.pesan ?? ''));
  r = await sebagai(admin, `select public.sg_anggota_ubah($1, 'Ahmad Fauzi B.', 'XI', 'Sangga Elang', 'Islam', null)`, [p1]);
  ok(!r.ok && /rombel/.test(r.pesan), 'data lama: mengganti kelas ke "XI" (bukan rombel) ditolak');
  r = await sebagai(admin, `select public.sg_anggota_ubah($1, 'Ahmad Fauzi B.', 'xi-03', 'Sangga Elang', 'Islam', null)`, [p1]);
  ok(r.ok && (await B1.query('select kelas from public.profiles where id = $1', [p1])).rows[0].kelas === 'XI-03', 'mengganti ke rombel baku diterima (huruf dibesarkan): XI-03');
  r = await sebagai(admin, `select public.sg_rombel_perbarui('[{"username":"10232","rombel":"X-04"},{"username":"10118","rombel":"xi 5"}]'::jsonb)`);
  ok(!r.ok && /Baris 2/.test(r.pesan), 'perbarui rombel massal: baris keliru membatalkan semua dengan nomor baris: ' + (r.pesan ?? ''));
  ok((await B1.query(`select kelas from public.profiles where username = '10232'`)).rows[0].kelas === 'X', 'pembatalan atomik: baris pertama juga tidak berubah');
  r = await sebagai(admin, `select public.sg_rombel_perbarui('[{"username":"10232","rombel":"X-04"},{"username":"10118","rombel":"XI-05"}]'::jsonb) n`);
  ok(r.ok && r.rows[0].n === 2 && (await B1.query(`select kelas from public.profiles where username = '10118'`)).rows[0].kelas === 'XI-05', 'perbarui rombel massal berhasil (2 Penegak)');
  r = await sebagai(pembina, `select public.sg_penugasan_atur('2026/2027', $1, array['X-01'], true)`, [pembina]);
  ok(!r.ok && /Hanya Admin/.test(r.pesan), 'Pembina tidak dapat mengatur penugasan (hanya Admin)');
  r = await sebagai(pembina, `select count(*)::int n from public.penugasan_rombel`);
  ok(r.ok && r.rows[0].n === 0, 'Pembina dapat membaca tabel penugasan (kosong setelah migrasi)');
  r = await sebagai(p1, `select count(*)::int n from public.penugasan_rombel`);
  ok(r.ok && r.rows[0].n === 0, 'Penegak tidak melihat penugasan (kebijakan baca hanya pengurus)');
  r = await sebagai(admin, `insert into public.penugasan_rombel (tahun_ajaran, rombel, penguji_id) values ('2026/2027', 'X-01', '${pembina}')`);
  ok(!r.ok, 'tulis langsung ke tabel penugasan ditolak (hanya lewat fungsi)');
}

console.log('\n--- Jalur 2: database sebelum Sidang, semua migrasi berurutan ---');
const B2 = await baru('git:be46788');
await isiDataContoh(B2);
const s2 = await cacah(B2);
for (const m of M) await B2.exec(m);
ok(JSON.stringify(await cacah(B2)) === JSON.stringify(s2), 'data tidak berubah oleh semua migrasi');
bandingkan('jalur 2', pa, await potret(B2));

console.log('\n--- Jalur 3: tanpa skema dasar: gagal jelas ---');
const B3 = new PGlite();
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu skema dan migrasi/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));

console.log(`\nRINGKASAN MIGRASI PENUGASAN: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
