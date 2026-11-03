// Skrip supabase/demo/data_demo_penegak.sql (dan pembersihnya hapus_data_demo.sql): dijalankan APA ADANYA pada Postgres sungguhan (PGlite dengan pgcrypto dan
// tiruan auth.identities) di atas data contoh, lalu diperiksa: cakupan skenario, keutuhan data, keamanan (tidak ada notifikasi/push ke akun asli, pemicu menyala
// kembali), dapat diulang, dan bersih saat dihapus.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';
import { siapkanPg, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { hitungKemajuan } from '../src/lib/tkkLogic.js';
import { AMBANG_TKK_BAWAAN } from '../src/data/tkkData.js';
import { periksaIsian } from '../src/lib/isianLogic.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const baca = (f) => readFileSync(`${P}/supabase/demo/${f}`, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
const DEMO = baca('data_demo_penegak.sql');
const HAPUS = baca('hapus_data_demo.sql');

console.log('--- Teks berkas: peringatan dan pengaman ---');
ok(/hapus_data_demo\.sql/.test(DEMO), 'menunjuk pembersih pasangannya');
ok(/PIN ACAK/.test(DEMO) && /repositori ini publik/i.test(DEMO), 'menyatakan PIN akun berjabatan Dewan diacak (repositori publik)');
ok(/disable trigger user/.test(DEMO) && /enable trigger user/.test(DEMO), 'pemicu dimatikan lalu dinyalakan kembali');
ok(/true as eskalasi_contoh/.test(DEMO), 'ada sakelar eskalasi_contoh');
ok(!/insert into public\.(agenda|tim_penilai|garuda_tahap|penugasan_rombel|pengaturan|sesi_ujian|dokumen_terbit|guru_agama|kegiatan_usulan|sfh_catatan)\b/.test(DEMO),
  'tidak menambah data gugus depan (agenda, tim, kalender, penugasan rombel, pengaturan, sesi ujian, surat, guru agama, usulan, SFH)');
ok(!/'(penguji|admin)'\s*,\s*'Demo/.test(DEMO) && !/role\s*=\s*'admin'\s*\)\s*insert/.test(DEMO), 'tidak membuat akun Pembina/Admin');

async function bangun() {
  const pg = new PGlite({ extensions: { pgcrypto } });
  await pg.exec('create extension if not exists pgcrypto');
  await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
  // Supabase sungguhan: kolom tambahan auth.users dan tabel auth.identities (tidak ada pada stub)
  await pg.exec(`
    alter table auth.users add column instance_id uuid, add column aud text, add column role text, add column email_confirmed_at timestamptz,
      add column raw_app_meta_data jsonb, add column raw_user_meta_data jsonb, add column updated_at timestamptz, add column confirmation_token text,
      add column recovery_token text, add column email_change_token_new text, add column email_change text;
    create table auth.identities (id uuid primary key, user_id uuid not null references auth.users on delete cascade, identity_data jsonb, provider text,
      provider_id text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);`);
  await isiDataContoh(pg);
  await pg.query('update public.profiles set wajib_ganti_pin = false');
  return pg;
}
const jalankan = async (pg, sql) => { const r = await pg.exec(sql); return r[r.length - 1]; };
const q = (pg) => async (sql, p = []) => (await pg.query(sql, p)).rows;
const n = (pg) => async (sql, p = []) => Number((await pg.query(sql, p)).rows[0].n);

const pg = await bangun();
const Q = q(pg), N = n(pg);
const demoIds = "(select id from public.profiles where nis ~ '^9900[0-9]{2}$' and nama like 'Demo %')";

// Keadaan awal (akun asli): notifikasi, progres, dan tabel pengaturan tidak boleh berubah karena skrip ini
const asli = async () => ({
  notif: await N(`select count(*)::int n from public.notifikasi`),
  progres: await N(`select count(*)::int n from public.sku_progress`),
  profil: await N(`select count(*)::int n from public.profiles`),
  pengaturan: (await Q(`select md5(string_agg(kunci || nilai::text, ',' order by kunci)) m from public.pengaturan`))[0].m,
  agenda: await N(`select count(*)::int n from public.agenda`),
  tim: await N(`select count(*)::int n from public.tim_penilai`),
  penugasan: await N(`select count(*)::int n from public.penugasan_rombel`),
  sesi: await N(`select count(*)::int n from public.absensi_sesi`),
});
const cacah = async () => ({
  profil: await N(`select count(*)::int n from public.profiles where nis ~ '^9900[0-9]{2}$'`),
  progres: await N(`select count(*)::int n from public.sku_progress where peserta_id in ${demoIds}`),
  riwayat: await N(`select count(*)::int n from public.sku_riwayat where peserta_id in ${demoIds}`),
  capaian: await N(`select count(*)::int n from public.tkk_capaian where peserta_id in ${demoIds}`),
  isian: await N(`select count(*)::int n from public.penegak_isian where peserta_id in ${demoIds}`),
  notif: await N(`select count(*)::int n from public.notifikasi where penerima_id in ${demoIds}`),
  pra: await N(`select count(*)::int n from public.sku_pra_uji where peserta_id in ${demoIds}`),
  hadir: await N(`select count(*)::int n from public.absensi_hadir where peserta_id in ${demoIds}`),
  iuran: await N(`select count(*)::int n from public.iuran where peserta_id in ${demoIds}`),
  auth: await N(`select count(*)::int n from auth.users where email like '9900%'`),
  ident: await N(`select count(*)::int n from auth.identities i join auth.users u on u.id = i.user_id where u.email like '9900%'`),
});
const awal = await asli();
const jabatanTunggalAsli = await Q(`select id, jabatan_dewan from public.profiles where jabatan_dewan in ('Pradana','Pradani','Pemangku Adat')`);

console.log('\n--- Menjalankan skrip demo (apa adanya) ---');
let hasil, galat = null;
try { hasil = await jalankan(pg, DEMO); } catch (e) { galat = e; }
ok(!galat, 'berjalan tanpa galat SQL' + (galat ? `: ${galat.message}` : ''));
if (galat) { console.log(`\nRINGKASAN: ${lulus} lulus, ${gagal} gagal`); process.exit(1); }
const sebelum2 = await cacah();

const baris = hasil.rows;
ok(baris.length === 57, `hasil akhir memuat 57 akun (dapat ${baris.length})`);
ok(await N(`select count(*)::int n from public.profiles where nis ~ '^9900[0-9]{2}$' and nama like 'Demo %'`) === 57, '57 profil demo ada');
ok(await N(`select count(*)::int n from public.profiles where nis ~ '^9900[0-9]{2}$' and nama not like 'Demo %'`) === 0, 'semua profil ber-NIS 9900xx berawalan "Demo "');
ok(await N(`select count(*)::int n from pg_trigger where tgenabled = 'D' and not tgisinternal`) === 0, 'tidak ada pemicu yang tertinggal dalam keadaan mati');

console.log('\n--- Keamanan: tidak menyentuh akun asli dan tidak memicu notifikasi/push ke akun asli ---');
const sesudah = await asli();
ok(sesudah.progres > awal.progres && sesudah.profil === awal.profil + 57, 'hanya menambah progres dan 57 profil');
ok(sesudah.pengaturan === awal.pengaturan && sesudah.agenda === awal.agenda && sesudah.tim === awal.tim && sesudah.penugasan === awal.penugasan && sesudah.sesi === awal.sesi,
  'pengaturan, agenda, tim penilai, penugasan rombel, dan sesi latihan tidak berubah');
ok(await N(`select count(*)::int n from public.notifikasi where penerima_id not in ${demoIds}`) === awal.notif, 'tidak ada notifikasi baru untuk akun asli');
ok(await N(`select count(*)::int n from public.notifikasi where penerima_id in ${demoIds}`) > 40, 'akun demo mendapat notifikasi contoh (>40)');
ok(await N(`select count(*)::int n from public.notifikasi where penerima_id in ${demoIds} and jenis not in ('mulai','hasil','pra_uji','tkk','eskalasi','agenda','pengingat')`) === 0, 'jenis notifikasi contoh sah');
ok(await N(`select count(*)::int n from public.notifikasi where penerima_id in ${demoIds} and jenis = 'hasil' and isi ~* '(lulus|ulang)'`) === 0, 'notifikasi hasil tanpa kata lulus/ulang');
ok(await N(`select count(*)::int n from public.push_langganan where penerima_id in ${demoIds}`) === 0, 'tidak ada langganan push demo');
const tunggalSesudah = await Q(`select id, jabatan_dewan from public.profiles where jabatan_dewan in ('Pradana','Pradani','Pemangku Adat')`);
const dipegangAsli = new Set(jabatanTunggalAsli.map((r) => r.jabatan_dewan));
ok(tunggalSesudah.length === jabatanTunggalAsli.length + ['Pradana', 'Pradani', 'Pemangku Adat'].filter((j) => !dipegangAsli.has(j)).length,
  'jabatan tunggal: hanya yang belum dipegang akun asli diambil demo (sisanya "(Demo)")');
ok(await N(`select count(*)::int n from public.sku_progress where peserta_id in ${demoIds} and status = 'diajukan' and penguji_id is not null`) === 0, 'pengajuan yang menunggu selalu berpenguji kosong (antrian rombel)');
ok(await N(`select count(*)::int n from public.sku_progress where peserta_id in ${demoIds} and status = 'diajukan' and jadwal < sigarda.hari_ini() + 3`) === 0, 'jadwal pengajuan jauh dari hari ini (tidak memicu pengingat "besok")');

console.log('\n--- Cakupan skenario: profil dan variasi ---');
const rombelBaku = await N(`select count(*)::int n from public.profiles where nis ~ '^9900[0-9]{2}$' and status = 'aktif' and sigarda.rombel_sah(kelas)`);
ok(rombelBaku === 50, `50 Penegak aktif berkelas rombel baku (dapat ${rombelBaku})`);
ok(await N(`select count(*)::int n from public.profiles where nis ~ '^9900[0-9]{2}$' and kelas in ('X','XI')`) === 2, '2 akun berkelas format lama');
ok(await N(`select count(*)::int n from public.profiles where nis ~ '^9900[0-9]{2}$' and status = 'nonaktif'`) === 2, '2 nonaktif');
ok(await N(`select count(*)::int n from public.profiles where nis ~ '^9900[0-9]{2}$' and status = 'alumni' and lulus_ta = '2025/2026'`) === 3, '3 alumni');
ok((await Q(`select distinct agama from public.profiles where nis ~ '^9900[0-9]{2}$' and agama is not null order by 1`)).length === 6, 'keenam agama terwakili');
ok(await N(`select count(*)::int n from public.profiles where nis ~ '^9900[0-9]{2}$' and agama is null`) === 1, 'satu akun tanpa agama');
ok(await N(`select count(*)::int n from public.profiles where nis ~ '^9900[0-9]{2}$' and jenis_kelamin is null`) === 2, 'dua akun tanpa jenis kelamin');
ok(await N(`select count(*)::int n from public.profiles where nis ~ '^9900[0-9]{2}$' and sangga is null and status = 'aktif' and kelas ~ '-'`) === 3, 'tiga Penegak aktif tanpa sangga');
const ntaAda = await N(`select count(*)::int n from public.profiles where nis ~ '^9900[0-9]{2}$' and nta is not null`);
ok(ntaAda > 5 && await N(`select count(*)::int n from public.profiles where nis ~ '^9900[0-9]{2}$' and nta is null and status = 'aktif'`) > 20, `NTA ada (${ntaAda}) dan kosong (bervariasi)`);
ok(await N(`select count(*)::int n from public.profiles where nis ~ '^9900[0-9]{2}$' and whatsapp is not null`) > 20 && await N(`select count(*)::int n from public.profiles where nis ~ '^9900[0-9]{2}$' and whatsapp is null`) > 5, 'WhatsApp ada dan kosong');
ok(await N(`select count(*)::int n from auth.users u join public.profiles p on p.id = u.id where p.nis ~ '^9900[0-9]{2}$' and u.last_sign_in_at is null`) === 4, 'empat akun belum pernah masuk');
const tingkat = Object.fromEntries((await Q(`select nis, sigarda.tingkat_penegak(id) t from public.profiles where nis ~ '^9900[0-9]{2}$'`)).map((r) => [r.nis, r.t]));
const hitung = (t) => Object.values(tingkat).filter((x) => x === t).length;
ok(hitung('calon-bantara') > 25 && hitung('calon-laksana') >= 10 && hitung('laksana') >= 8, `ketiga tingkat terwakili (calon-bantara ${hitung('calon-bantara')}, calon-laksana ${hitung('calon-laksana')}, laksana ${hitung('laksana')})`);
ok(tingkat['990002'] === 'laksana' && tingkat['990001'] === 'calon-laksana' && tingkat['990005'] === 'calon-bantara' && tingkat['990007'] === 'calon-laksana', 'tingkat akun rujukan sesuai (Bintang laksana, Aditya calon-laksana, Eka calon-bantara, Gita calon-laksana)');
ok(await N(`select count(*)::int n from public.sku_progress g join public.profiles p on p.id = g.peserta_id where p.nis = '990056'`) === 0, 'akun tanpa agama tidak punya progres SKU');
ok(await N(`select count(*)::int n from public.sku_progress where sku_id like 'BAN-01-KAT-%' and status = 'lulus' and peserta_id = (select id from public.profiles where nis = '990013')`) === 1, 'Mega: satu dari dua sub-butir agama Katolik lulus');
ok(await N(`select count(*)::int n from public.sku_progress where peserta_id in ${demoIds} and status = 'lulus' and verifikasi_token is null`) === 0, 'setiap butir lulus punya token QR');
ok(await N(`select count(*)::int n from public.sku_progress g where g.peserta_id in ${demoIds} and not exists (select 1 from public.sku_unit u join public.profiles p on p.id = g.peserta_id where u.id = g.sku_id and (u.agama is null or u.agama = p.agama))`) === 0, 'tidak ada butir agama lain pada progres Penegak');
ok(await N(`select count(distinct status)::int n from public.sku_progress where peserta_id in ${demoIds}`) === 4, 'status progres lulus, diajukan, proses, ulang semua ada');
ok(await N(`select count(*)::int n from public.sku_riwayat where peserta_id in ${demoIds}`) > 500, 'riwayat SKU terisi');
ok(await N(`select count(*)::int n from public.sku_progress where peserta_id in ${demoIds} and status = 'lulus' and tanggal_uji > sigarda.hari_ini()`) === 0, 'tanggal lulus tidak di masa depan');
ok(await N(`select count(*)::int n from (select peserta_id from public.sku_progress g join public.sku_unit u on u.id = g.sku_id where g.peserta_id in ${demoIds} and g.status = 'lulus' group by peserta_id
   having min(case when u.tingkat = 'Laksana' then g.tanggal_uji end) <= max(case when u.tingkat = 'Bantara' then g.tanggal_uji end)) x`) === 0, 'butir Laksana selalu sesudah butir Bantara');

console.log('\n--- Dewan Ambalan, Pinsa, Bina Damping, sangga ---');
ok(await N(`select count(*)::int n from public.profiles where nis ~ '^9900[0-9]{2}$' and jabatan_dewan is not null`) === 7, '7 Penegak berjabatan Dewan');
ok(await N(`select count(*)::int n from public.profiles where nis ~ '^9900[0-9]{2}$' and pinsa`) === 4, '4 Pinsa dari anggota sangga sendiri');
ok(await N(`select count(*)::int n from public.pinsa_tugas where penegak_id in ${demoIds}`) === 3, '3 Pinsa tertugas lintas rombel');
ok(await N(`select count(*)::int n from public.bina_damping where penegak_id in ${demoIds}`) === 5, '5 Bina Damping');
const bd = await Q(`select rombel, count(*)::int n from public.bina_damping where penegak_id in ${demoIds} group by rombel order by rombel`);
ok(JSON.stringify(bd) === JSON.stringify([{ rombel: 'X-10', n: 2 }, { rombel: 'XI-10', n: 2 }, { rombel: 'XII-10', n: 1 }]), 'Bina Damping X-10 dan XI-10 dua orang, XII-10 satu orang');
ok(await N(`select count(*)::int n from public.bina_damping b where b.penegak_id in ${demoIds} and sigarda.tingkat_penegak(b.penegak_id) = 'calon-bantara'`) === 0, 'tidak ada Bina Damping yang masih calon Bantara');
const peringatan = async (r) => (await Q(`select sigarda.sangga_peringatan($1) j`, [r]))[0].j.map((x) => x.teks);
const tX = await peringatan('X-10');
ok(tX.some((t) => /Cendrawasih/.test(t)) && tX.some((t) => /Rajawali.*Pinsa/.test(t)) && tX.some((t) => /belum punya sangga/.test(t)), 'peringatan X-10: sangga kecil, sangga tanpa Pinsa, Penegak tanpa sangga');
ok(!tX.some((t) => /Merak/.test(t) && /Pinsa/.test(t)) && !tX.some((t) => /Cendrawasih/.test(t) && /Pinsa/.test(t)), 'Pinsa tertugas menghapus peringatan Pinsa sangga Merak dan Cendrawasih');
ok((await peringatan('XII-10')).some((t) => /baru 1 dari 2/.test(t)), 'peringatan XII-10: Bina Damping baru 1 dari 2');
ok((await peringatan('XI-10')).some((t) => /Kenari/.test(t) && /Pinsa/.test(t)), 'peringatan XI-10: sangga Kenari tanpa Pinsa');
const idDemo = async (nis) => (await Q(`select id from public.profiles where nis = $1`, [nis]))[0].id;
const idPembina = (await Q(`select id from public.profiles where role = 'penguji' and jabatan = 'Pembina' limit 1`))[0].id;
const sanggaX = (await sqlSebagai(pg, idPembina, `select public.sg_sangga_rombel('X-10') j`)).rows[0].j;
ok(sanggaX.pinsa_tugas?.length === 3, 'sg_sangga_rombel memuat 3 Pinsa tertugas');
const bdDaftar = (await sqlSebagai(pg, idPembina, `select public.sg_bina_damping_daftar() j`)).rows[0].j;
ok(JSON.stringify(bdDaftar).includes('Demo Kartika Sari'), 'sg_bina_damping_daftar memuat Bina Damping demo');

console.log('\n--- Pra-uji berjenjang: data ---');
const status = async (nis, sku) => (await Q(`select tahap, status from public.sku_pra_uji where peserta_id = (select id from public.profiles where nis = $1) and sku_id = $2 order by id`, [nis, sku])).map((r) => `${r.tahap}:${r.status}`).join(',');
ok(await status('990011', 'BAN-18') === 'pinsa:menunggu', 'Pinsa menunggu');
ok(await status('990014', 'BAN-22') === 'pinsa:lulus,bina_damping:menunggu', 'Pinsa lulus lalu Bina Damping menunggu');
ok(await status('990017', 'BAN-20') === 'pinsa:lulus,bina_damping:lulus', 'lulus semua tahap');
ok((await Q(`select status from public.sku_progress where peserta_id = (select id from public.profiles where nis = '990017') and sku_id = 'BAN-20'`))[0]?.status === 'diajukan', 'lulus semua tahap -> uji resmi diajukan');
ok(await status('990023', 'BAN-11') === 'pinsa:belum', 'belum lulus Pinsa');
ok(await status('990024', 'BAN-08') === 'pinsa:dibatalkan', 'dibatalkan');
ok(await status('990015', 'BAN-09') === 'pinsa:dilewati,bina_damping:menunggu', 'tahap dilewati Pembina');
ok(await status('990016', 'BAN-04') === 'pinsa:lulus,bina_damping:belum', 'belum lulus Bina Damping');
ok(await status('990003', 'LAK-12') === 'bina_damping:menunggu' && await status('990032', 'LAK-16') === 'bina_damping:lulus', 'butir Laksana hanya lewat Bina Damping');
ok(await N(`select count(*)::int n from public.sku_pra_uji where status = 'menunggu' and diputuskan_pada is not null`) === 0, 'baris menunggu tanpa waktu keputusan');
ok(await N(`select count(*)::int n from public.sku_pra_uji where peserta_id in ${demoIds} and status = 'menunggu' and dibuat < now() - interval '3 days'`) === 1, 'satu pra-uji macet lebih dari 3 hari');
// Setiap keputusan dibuat penilai yang sah menurut aturan server (Pinsa/Bina Damping pada butir yang sudah ia lulus)
const keputusan = await Q(`select q.id, pl.nis as penilai_nis from public.sku_pra_uji q join public.profiles pl on pl.id = q.penilai_id
  where q.peserta_id in ${demoIds} and q.status in ('lulus','belum') and pl.role = 'peserta'`);
const tidakSah = [];
for (const r of keputusan) {
  const ada = await N(`select count(*)::int n from public.sku_pra_uji q where q.id = $1 and sigarda.pra_uji_penilai_ok(q.peserta_id, q.sku_id, q.tahap, (select id from public.profiles where nis = $2))`, [r.id, r.penilai_nis]);
  if (!ada) tidakSah.push(`${r.id}:${r.penilai_nis}`);
}
ok(tidakSah.length === 0 && keputusan.length >= 7, `semua ${keputusan.length} keputusan pra-uji dibuat penilai yang sah menurut server` + (tidakSah.length ? ': ' + tidakSah.join(', ') : ''));

console.log('\n--- Pelantikan, Saka, TKK, SPG, Garuda ---');
ok(await N(`select count(*)::int n from public.pelantikan where peserta_id in ${demoIds} and tingkat = 'bantara'`) === 16, '16 pelantikan Bantara');
ok(await N(`select count(*)::int n from public.pelantikan where peserta_id in ${demoIds} and tingkat = 'laksana'`) === 7, '7 pelantikan Laksana');
ok(await N(`select count(*)::int n from public.pelantikan p where peserta_id in ${demoIds} and not sigarda.tingkat_selesai(p.peserta_id, initcap(p.tingkat))`) === 0, 'setiap pelantikan atas tingkat yang sudah selesai');
ok(await N(`select count(*)::int n from public.pelantikan b join public.pelantikan l on l.peserta_id = b.peserta_id and l.tingkat = 'laksana' where b.tingkat = 'bantara' and l.tanggal <= b.tanggal`) === 0, 'pelantikan Laksana sesudah Bantara');
ok(await N(`select count(*)::int n from public.pelantikan where peserta_id in ${demoIds} and tanggal > sigarda.hari_ini()`) === 0, 'tanggal pelantikan bukan masa depan');
ok(await N(`select count(*)::int n from public.saka_anggota where peserta_id in ${demoIds}`) === 10 && await N(`select count(*)::int n from public.saka_anggota where peserta_id in ${demoIds} and status = 'selesai'`) === 4, '10 keanggotaan Saka (4 selesai)');
ok(await N(`select count(*)::int n from public.tkk_capaian where peserta_id in ${demoIds}`) > 250, 'capaian TKK terisi banyak');
ok(await N(`select count(*)::int n from public.tkk_capaian c where peserta_id in ${demoIds} and not sigarda.tingkat_selesai(c.peserta_id, 'Bantara')`) === 0, 'TKK hanya untuk Penegak yang Bantara-nya selesai');
ok(await N(`select count(*)::int n from public.tkk_capaian c join public.tkk_katalog k on k.id = c.tkk_id join public.profiles p on p.id = c.peserta_id
  where c.peserta_id in ${demoIds} and (k.golongan <> 'penegak' or (k.agama is not null and k.agama <> p.agama))`) === 0, 'TKK cocok golongan dan agama');
ok(await N(`select count(*)::int n from public.tkk_capaian m where m.peserta_id in ${demoIds} and m.tingkat in ('madya','utama') and not exists
  (select 1 from public.tkk_capaian b where b.peserta_id = m.peserta_id and b.tkk_id = m.tkk_id and b.tingkat = case m.tingkat when 'madya' then 'purwa' else 'madya' end and b.tanggal < m.tanggal)`) === 0, 'urutan Purwa < Madya < Utama (tingkat dan tanggal)');
ok(await N(`select count(*)::int n from public.tkk_capaian where peserta_id in ${demoIds} and tanggal > sigarda.hari_ini()`) === 0, 'tanggal TKK bukan masa depan');
const kemajuan = async (nis) => {
  const id = await idDemo(nis);
  const cap = (await Q(`select tkk_id, tingkat from public.tkk_capaian where peserta_id = $1`, [id])).map((r) => ({ tkkId: r.tkk_id, tingkat: r.tingkat }));
  return hitungKemajuan(cap, AMBANG_TKK_BAWAAN);
};
const kF = await kemajuan('990006'), kK = await kemajuan('990039'), kA = await kemajuan('990054'), kBintang = await kemajuan('990002');
ok(kF.penuh === true && kA.penuh === true, 'Fajar dan alumni Qonita memenuhi ambang TKK');
ok(kK.penuh === false && kK.total === 44 && kK.kurang.total === 1, 'Kartika kurang satu TKK dari ambang');
ok(kBintang.penuh === false && kBintang.total === 30, 'Bintang belum memenuhi ambang (30 TKK)');
ok(await N(`select count(*)::int n from public.tkk_pengajuan where peserta_id in ${demoIds}`) === 5 && (await Q(`select distinct status from public.tkk_pengajuan where peserta_id in ${demoIds} order by 1`)).length === 4, '5 pengajuan TKK dengan keempat status');
ok(await N(`select count(*)::int n from public.tkk_pengajuan p join public.tkk_capaian c on c.id = p.capaian_id where p.status = 'disetujui' and p.peserta_id in ${demoIds}`) === 1, 'pengajuan disetujui terkait capaian resmi');
ok(await N(`select count(*)::int n from public.tkk_krida where peserta_id in ${demoIds}`) === 4, '4 TKK Krida');
ok(await N(`select count(*)::int n from public.spg_penetapan where peserta_id in ${demoIds}`) === 28 && await N(`select count(*)::int n from public.spg_penetapan where peserta_id in ${demoIds} and timpa`) === 1, 'SPG: 28 penetapan (1 penimpaan)');
ok(await N(`select count(*)::int n from public.spg_penetapan s where peserta_id in ${demoIds} and not sigarda.layak_garuda(s.peserta_id)`) === 0, 'SPG hanya untuk yang layak Garuda');
ok(await N(`select count(*)::int n from public.profiles where nis ~ '^9900[0-9]{2}$' and calon_garuda is not null`) === 3, '3 calon Garuda (dua aktif, satu alumni)');
ok(await N(`select count(*)::int n from public.profiles p where nis ~ '^9900[0-9]{2}$' and calon_garuda is not null and not sigarda.layak_garuda(p.id)`) === 0, 'calon Garuda layak menurut server');
ok(await N(`select count(*)::int n from public.portofolio where peserta_id in ${demoIds}`) === 18 + 26 + 26, 'portofolio: 18 + 26 + 26 baris');
ok(await N(`select count(*)::int n from public.sertifikat_tingkat where peserta_id in ${demoIds}`) === 10, '10 Surat Tanda Lulus bertoken');
ok(await N(`select count(*)::int n from public.sertifikat_tingkat s where peserta_id in ${demoIds} and not sigarda.tingkat_selesai(s.peserta_id, s.tingkat)`) === 0, 'Surat Tanda Lulus hanya untuk tingkat selesai');
ok(await N(`select count(*)::int n from public.raport where peserta_id in ${demoIds} and status = 'final'`) === 5 && await N(`select count(*)::int n from public.raport where peserta_id in ${demoIds} and status = 'draf'`) === 1, 'raport final dan draf');

console.log('\n--- Gerbang usia, tanggal lahir, data diri, Periksa Data ---');
const lahir = Object.fromEntries((await Q(`select p.nis, t.tanggal::text d from public.profiles p join public.tanggal_lahir t on t.peserta_id = p.id where p.nis ~ '^9900[0-9]{2}$'`)).map((r) => [r.nis, r.d]));
ok(Object.keys(lahir).length === 51, '51 akun punya tanggal lahir (6 tidak)');
ok(lahir['990006'] >= '2007-11-01' && lahir['990006'] <= '2009-05-01' && lahir['990039'] >= '2007-11-01' && lahir['990039'] <= '2009-05-01', 'calon Garuda aktif berusia dalam rentang gerbang');
ok(lahir['990040'] < '2007-11-01' && lahir['990045'] > '2009-05-01', 'ada yang terlalu tua dan terlalu muda untuk gerbang');
const isian = await Q(`select kunci, nilai from public.penegak_isian where peserta_id in ${demoIds}`);
ok(isian.length > 500, `data diri terisi (${isian.length} isian)`);
ok(isian.filter((r) => periksaIsian(r.kunci, r.nilai)).length === 0, 'semua isian sah menurut aturan klien');
ok(await N(`select count(*)::int n from public.penegak_isian where peserta_id in ${demoIds} and sigarda.isian_periksa(kunci, nilai) <> ''`) === 0, 'semua isian sah menurut sigarda.isian_periksa (server)');
const jumlahKunci = await Q(`select p.nis, count(i.*)::int c from public.profiles p left join public.penegak_isian i on i.peserta_id = p.id where p.nis ~ '^9900[0-9]{2}$' group by p.nis`);
const ragamC = [...new Set(jumlahKunci.map((r) => r.c))].sort((a, b) => a - b);
ok(ragamC[0] === 0 && ragamC.includes(2) && ragamC.includes(15) && ragamC[ragamC.length - 1] >= 40, 'data diri: kosong, sebagian, pokok, dan penuh semua ada: ' + ragamC.join(','));
const pd = (await sqlSebagai(pg, idPembina, `select public.sg_pemeriksaan_data() j`)).rows[0].j;
const nDemo = (arr) => (arr ?? []).filter((x) => /^9900\d\d$/.test(x.nis ?? '') || /^Demo /.test(x.nama ?? '')).length;
ok(nDemo(pd.kelasLama) === 2, 'Periksa Data: 2 kelas format lama');
ok(nDemo(pd.tanpaJk) === 2 && nDemo(pd.tanpaNta) > 20, 'Periksa Data: tanpa jenis kelamin (2) dan tanpa NTA');
ok(nDemo(pd.belumPernahMasuk) === 4, 'Periksa Data: 4 belum pernah masuk');
ok(nDemo(pd.dataDiriBelum) > 15, 'Periksa Data: data diri belum lengkap (' + nDemo(pd.dataDiriBelum) + ')');
ok(nDemo(pd.sanggaTanpaPinsa) === 0 || Array.isArray(pd.sanggaTanpaPinsa), 'Periksa Data: daftar sangga tanpa Pinsa dapat dibaca');

console.log('\n--- Absensi, iuran, eskalasi ---');
const sesi = await N(`select count(*)::int n from public.absensi_sesi`);
const hadirDemo = await N(`select count(*)::int n from public.absensi_hadir where peserta_id in ${demoIds}`);
ok(sesi === 0 ? hadirDemo === 0 : hadirDemo > 100, `kehadiran demo hanya pada sesi yang ada (${sesi} sesi, ${hadirDemo} baris)`);
ok(await N(`select count(*)::int n from public.absensi_hadir where peserta_id in ${demoIds} and tanggal not in (select tanggal from public.absensi_sesi)`) === 0, 'tidak ada sesi baru yang dibuat');
if (sesi >= 2) {
  ok(await N(`select count(distinct status)::int n from public.absensi_hadir where peserta_id in ${demoIds}`) === 4, 'keempat status kehadiran (H, I, S, A) ada');
  ok(await N(`select count(*)::int n from public.iuran where peserta_id in ${demoIds}`) > 100, 'iuran terisi');
  ok((await Q(`select sigarda.eskalasi_mulai_absensi(id) d from public.profiles where nis = '990020'`))[0].d != null, 'Galih: dua Alpa berturut-turut terdeteksi eskalasi');
  ok((await Q(`select sigarda.eskalasi_mulai_iuran(id) d from public.profiles where nis = '990022'`))[0].d != null, 'Bayu: dua kali tanpa iuran terdeteksi eskalasi');
  const lain = await Q(`select p.nis from public.profiles p where p.nis ~ '^9900[0-9]{2}$' and p.status = 'aktif' and p.nis not in ('990020', '990022')
    and (sigarda.eskalasi_mulai_absensi(p.id) is not null or sigarda.eskalasi_mulai_iuran(p.id) is not null)`);
  ok(lain.length === 0, 'akun demo aktif lain tidak memicu eskalasi absensi/iuran' + (lain.length ? ': ' + lain.map((r) => r.nis).join(',') : ''));
}
const skuEsk = Object.fromEntries((await Q(`select p.nis, sigarda.eskalasi_mulai_sku(p.id)::text d from public.profiles p where p.nis ~ '^9900[0-9]{2}$' and p.status = 'aktif'`)).filter((r) => r.d).map((r) => [r.nis, r.d]));
ok(JSON.stringify(Object.keys(skuEsk).sort()) === JSON.stringify(['990009', '990012', '990020']), 'eskalasi SKU hanya pada tiga akun contoh: ' + Object.keys(skuEsk).join(','));
const hari = (await Q(`select sigarda.hari_ini()::text d`))[0].d;
const selisih = (d) => Math.round((Date.parse(hari) - Date.parse(d)) / 864e5);
ok(selisih(skuEsk['990009']) === 0 && selisih(skuEsk['990012']) === 5 && selisih(skuEsk['990020']) === 11, 'tingkat 1, 2, dan 3 (hari sejak mulai 0, 5, 11)');
ok(await N(`select count(*)::int n from public.asisten_iuran where peserta_id in ${demoIds}`) === 1, 'satu asisten bendahara');

console.log('\n--- PIN ---');
const pinBaris = baris.map((r) => ({ nis: r['NIS (nama pengguna)'], pin: r['PIN'] }));
let pinSalah = 0;
for (const r of pinBaris) {
  const cocok = await N(`select count(*)::int n from auth.users u join public.profiles p on p.id = u.id where p.nis = $1 and u.encrypted_password = crypt($2, u.encrypted_password)`, [r.nis, r.pin]);
  if (!cocok) pinSalah++;
}
ok(pinSalah === 0, 'PIN pada hasil akhir cocok dengan hash di auth.users untuk semua 57 akun');
const acak = pinBaris.filter((r) => r.pin !== '352817');
ok(acak.length === 7 && acak.every((r) => /^[0-9]{6}$/.test(r.pin)), '7 akun berjabatan Dewan memakai PIN acak 6 angka');
ok(new Set(acak.map((r) => r.pin)).size >= 6, 'PIN acak berbeda-beda');
ok(await N(`select count(*)::int n from public.profiles where nis ~ '^9900[0-9]{2}$' and wajib_ganti_pin`) === 0, 'tidak ada yang wajib ganti PIN');

console.log('\n--- Akun demo dipakai lewat RPC (RLS dan hak sebenarnya) ---');
const rpc = async (sub, sql) => (await sqlSebagai(pg, sub, sql)).rows;
ok((await rpc(await idDemo('990029'), `select public.sg_pemeriksaan_data() j`))[0].j !== null, 'Dewan berjabatan demo (Sekretaris) membaca Periksa Data');
const idAditya = await idDemo('990001');
const lihat = (await rpc(idAditya, `select count(*)::int n from public.sku_progress`))[0].n;
ok(lihat > 0 && lihat < 60, 'Penegak demo hanya melihat progres miliknya sendiri (' + lihat + ' baris)');
ok((await rpc(idAditya, `select count(*)::int n from public.tkk_capaian`))[0].n === await N(`select count(*)::int n from public.tkk_capaian where peserta_id = $1`, [idAditya]), 'Penegak demo hanya melihat TKK miliknya');
ok((await rpc(idAditya, `select count(*)::int n from public.penegak_isian`))[0].n === await N(`select count(*)::int n from public.penegak_isian where peserta_id = $1`, [idAditya]), 'Penegak demo hanya melihat data dirinya');
ok((await rpc(idAditya, `select count(*)::int n from public.tanggal_lahir`))[0].n === 1, 'Penegak demo hanya melihat tanggal lahirnya');

console.log('\n--- Pengingat harian nyata: akun asli hanya diberi tahu bila eskalasi tingkat 3 ---');
const maksId = await N(`select coalesce(max(id), 0)::int n from public.notifikasi`);
await pg.query('select sigarda.notif_pengingat()');
const soal = await Q(`select n.jenis, n.judul, n.isi from public.notifikasi n where n.id > $1 and n.penerima_id not in ${demoIds} and (n.judul ~ 'Demo ' or n.isi ~ 'Demo ')`, [maksId]);
// Pengurus menerima SATU ringkasan "Perlu tindak lanjut: N Penegak" (paling banyak tiga nama di isi), bukan satu per Penegak.
const ringkasDemo = (x) => x.jenis === 'eskalasi' && /^Perlu tindak lanjut: \d+ Penegak$/.test(x.judul) && /Demo (Galih Permadi|Bayu Aji)/.test(x.isi);
ok(soal.every(ringkasDemo),
  'satu-satunya pemberitahuan ke akun asli tentang akun demo: ringkasan eskalasi tingkat 3 Galih/Bayu (dapat dimatikan): ' + soal.length + ' ' + JSON.stringify(soal.filter((x) => !ringkasDemo(x)).slice(0, 3)));
{
  const ringkasan = await N(`select count(*)::int n from public.notifikasi where id > $1 and kunci like 'eskalasi-p:%' and penerima_id not in ${demoIds}`, [maksId]);
  const galih = await N(`select count(*)::int n from public.notifikasi where id > $1 and penerima_id = $2 and kunci ~ '^eskalasi:[a-z]+:.*:3:'`, [maksId, await idDemo('990020')]);
  ok(ringkasan > 0 && galih > 0, `eskalasi tingkat 3 contoh memang sampai ke pengurus sebagai ringkasan (${ringkasan}) dan ke Galih (${galih}) (untuk menguji menu Tindak Lanjut)`);
}
ok((await Q(`select 1 from public.notifikasi where id > $1 and jenis in ('ajukan','lama') and penerima_id not in ${demoIds} and (judul ~ 'Demo ' or isi ~ 'Demo ')`, [maksId])).length === 0, 'tidak ada pengingat pengajuan/antrian tentang akun demo ke akun asli');

console.log('\n--- Menjalankan ulang (tidak menggandakan; PIN acak berganti) ---');
const idLama = (await Q(`select id from public.profiles where nis = '990006'`))[0].id;
await pg.query(`update public.sku_progress set nilai = 'Cukup' where peserta_id = $1`, [idLama]);   // ubahan tester harus terhapus
await pg.query(`delete from public.tkk_capaian where peserta_id = $1`, [idLama]);
let hasil2, galat2 = null;
try { hasil2 = await jalankan(pg, DEMO); } catch (e) { galat2 = e; }
ok(!galat2, 'berjalan ulang tanpa galat' + (galat2 ? `: ${galat2.message}` : ''));
const sesudah2 = await cacah();
ok(JSON.stringify(sesudah2) === JSON.stringify(sebelum2), 'jumlah baris tiap tabel sama sesudah eksekusi kedua (data demo direset, tidak digandakan): ' + JSON.stringify(sesudah2).slice(0, 200));
ok((await Q(`select id from public.profiles where nis = '990006'`))[0].id === idLama, 'akun demo dipakai lagi (id tetap)');
ok(await N(`select count(*)::int n from public.tkk_capaian where peserta_id = $1`, [idLama]) > 40, 'ubahan tester dikembalikan ke keadaan awal');
const acak2 = hasil2 ? hasil2.rows.filter((r) => r['PIN'] !== '352817').map((r) => r['PIN']) : [];
ok(acak2.length === 7 && acak2.join() !== acak.map((r) => r.pin).join(), 'PIN acak diganti pada eksekusi kedua');
ok(await N(`select count(*)::int n from pg_trigger where tgenabled = 'D' and not tgisinternal`) === 0, 'pemicu menyala setelah eksekusi kedua');

console.log('\n--- Antrian pra-uji di layar (sakelar dihidupkan; instans terpisah) ---');
{
  const pg5 = await bangun();
  await jalankan(pg5, DEMO);
  const Q5 = q(pg5);
  const pembina5 = (await Q5(`select id from public.profiles where role = 'penguji' and jabatan = 'Pembina' limit 1`))[0].id;
  await sqlSebagai(pg5, pembina5, `select public.sg_pra_uji_sakelar(true)`);
  const id5 = async (nis) => (await Q5(`select id from public.profiles where nis = $1`, [nis]))[0].id;
  const antrian = async (nis) => (await sqlSebagai(pg5, await id5(nis), `select public.sg_pra_uji_antrian() j`)).rows[0].j;
  const aPinsa = await antrian('990001');
  ok(aPinsa.aktif && aPinsa.menunggu.some((x) => x.sku_id === 'BAN-18'), 'Pinsa sangga Elang melihat pra-uji Salsabila (BAN-18)');
  ok(!aPinsa.menunggu.some((x) => x.sku_id === 'BAN-22'), 'Pinsa tidak melihat pengajuan tahap Bina Damping');
  const aTugas = await antrian('990003');
  ok(aTugas.selesai.length >= 3, 'Pinsa tertugas Citra punya riwayat keputusan (' + aTugas.selesai.length + ')');
  const aBd = await antrian('990039');
  ok(aBd.menunggu.some((x) => x.sku_id === 'BAN-22') && aBd.menunggu.some((x) => x.sku_id === 'BAN-07'), 'Bina Damping X-10 melihat pra-uji tahap Bina Damping (termasuk sangga tanpa Pinsa)');
  const aBd2 = await antrian('990040');
  ok(aBd2.menunggu.some((x) => x.sku_id === 'LAK-12'), 'Bina Damping XI-10 (Laksana) melihat pra-uji Laksana Citra');
  const aBd3 = await antrian('990029');
  ok(!aBd3.menunggu.some((x) => x.sku_id === 'LAK-12') && !aBd3.menunggu.some((x) => x.sku_id === 'BAN-22'), 'Bina Damping XII-10 tidak melihat pengajuan rombel lain');
  // sesuatu yang benar-benar dapat dikerjakan: Pinsa meluluskan pra-uji Salsabila -> tahap Bina Damping terbentuk
  const pu = aPinsa.menunggu.find((x) => x.sku_id === 'BAN-18');
  const r = (await sqlSebagai(pg5, await id5('990001'), `select public.sg_pra_uji_catat($1, 'lulus', '') j`, [pu.id])).rows[0].j;
  ok(r.hasil === 'lulus' && r.tujuan === 'bina_damping', 'Pinsa dapat meluluskan pra-uji demo dan diteruskan ke Bina Damping');
  await pg5.close();
}

console.log('\n--- Sakelar eskalasi_contoh = false: tidak ada pemberitahuan ke akun asli ---');
{
  const pg2 = await bangun();
  const netral = DEMO.replace('true as eskalasi_contoh', 'false as eskalasi_contoh');
  ok(netral !== DEMO, 'sakelar dapat diubah');
  await jalankan(pg2, netral);
  const N2 = n(pg2), Q2 = q(pg2);
  const maks = await N2(`select coalesce(max(id), 0)::int n from public.notifikasi`);
  await pg2.query('select sigarda.notif_pengingat()');
  const tentangDemo = await Q2(`select jenis, judul from public.notifikasi where id > $1 and penerima_id not in (select id from public.profiles where nis ~ '^9900[0-9]{2}$') and (judul ~ 'Demo ' or isi ~ 'Demo ')`, [maks]);
  ok(tentangDemo.length === 0, 'pengingat harian tidak memberi tahu akun asli apa pun tentang akun demo' + (tentangDemo.length ? ': ' + JSON.stringify(tentangDemo.slice(0, 3)) : ''));
  const esk = await Q2(`select p.nis from public.profiles p where nis ~ '^9900[0-9]{2}$' and p.status = 'aktif' and (sigarda.eskalasi_mulai_sku(p.id) is not null or sigarda.eskalasi_mulai_absensi(p.id) is not null or sigarda.eskalasi_mulai_iuran(p.id) is not null)`);
  ok(esk.length === 0, 'tidak ada eskalasi untuk akun demo aktif mana pun' + (esk.length ? ': ' + esk.map((r) => r.nis).join(',') : ''));
  await pg2.close();
}

console.log('\n--- Jabatan tunggal sudah dipegang akun asli: akun demo memakai "(Demo)" ---');
{
  const pg3 = await bangun();
  // data contoh sudah punya Pradana (akun Dewan lama); tambahkan Pradani dan Pemangku Adat pada Penegak asli
  await pg3.query(`update public.profiles set jabatan_dewan = 'Pradani' where nis = '10231'`);
  await pg3.query(`update public.profiles set jabatan_dewan = 'Pemangku Adat' where nis = '10232'`);
  await jalankan(pg3, DEMO);
  const r = (await pg3.query(`select nis, jabatan_dewan from public.profiles where nis in ('990039','990040','990041') order by nis`)).rows;
  ok(r[0].jabatan_dewan === 'Pradani (Demo)' && r[1].jabatan_dewan === 'Pradana (Demo)' && r[2].jabatan_dewan === 'Pemangku Adat (Demo)', 'ketiga jabatan tunggal sudah dipegang akun asli: demo memakai "(Demo)": ' + JSON.stringify(r.map((x) => x.jabatan_dewan)));
  ok((await pg3.query(`select count(*)::int n from public.profiles where jabatan_dewan = 'Pradana'`)).rows[0].n === 1, 'tetap satu Pradana');
  await pg3.close();
}

console.log('\n--- Tanpa Pembina sama sekali ---');
{
  const pg4 = await bangun();
  await pg4.query(`delete from auth.users where id in (select id from public.profiles where role = 'penguji')`);
  let g = null; try { await jalankan(pg4, DEMO); } catch (e) { g = e; }
  ok(!g, 'berjalan tanpa Pembina' + (g ? `: ${g.message}` : ''));
  ok(!g && (await pg4.query(`select count(*)::int n from public.sku_progress where peserta_id in (select id from public.profiles where nis ~ '^9900[0-9]{2}$') and penguji_id is not null`)).rows[0].n === 0, 'penguji dikosongkan');
  await pg4.close();
}

console.log('\n--- Menghapus: hapus_data_demo.sql ---');
const idAcak = await Q(`select id from public.profiles where nis ~ '^9900[0-9]{2}$'`);
let g3 = null;
try { await jalankan(pg, HAPUS); } catch (e) { g3 = e; }
ok(!g3, 'pembersih berjalan' + (g3 ? `: ${g3.message}` : ''));
ok(await N(`select count(*)::int n from public.profiles where nis ~ '^9900[0-9]{2}$'`) === 0, 'seluruh akun demo terhapus');
ok(await N(`select count(*)::int n from auth.users where email like '9900%'`) === 0 && await N(`select count(*)::int n from auth.identities`) === 0, 'akun Auth dan identitas ikut terhapus');
const ids = idAcak.map((r) => r.id);
const kolom = await Q(`select c.conrelid::regclass::text tabel, a.attname kolom from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass and array_length(c.conkey, 1) = 1`);
let sisa = 0;
for (const k of kolom) sisa += await N(`select count(*)::int n from ${k.tabel} where ${k.kolom} = any($1::uuid[])`, [ids]);
ok(sisa === 0, 'tidak ada baris yang masih menyebut akun demo di tabel mana pun (' + kolom.length + ' kolom rujukan diperiksa)');
const akhir = await asli();
ok(akhir.profil === awal.profil && akhir.agenda === awal.agenda && akhir.pengaturan === awal.pengaturan && akhir.sesi === awal.sesi, 'sesudah dihapus: jumlah profil kembali seperti awal, pengaturan dan agenda tak berubah');
ok((await Q(`select count(*)::int n from public.profiles where jabatan_dewan in ('Pradana','Pradani','Pemangku Adat')`))[0].n === jabatanTunggalAsli.length, 'jabatan tunggal kembali seperti awal');

await pg.close();
console.log(`\nRINGKASAN: ${lulus} lulus, ${gagal} gagal`);
if (gagal) process.exit(1);
