// Hemat log (Fase 2): sg_muat_awal() memberi SAMA PERSIS dengan enam permintaan terpisah (gudep, pengaturan iuran, pendampingan, sakelar pra-uji, asisten, notifikasi)
// untuk tiap peran, tunduk pada RLS, tidak dapat dipanggil tanpa login, bagian yang gagal (PIN awal belum diganti) bernilai null, dan klien kembali ke permintaan terpisah
// pada basis data yang belum dimigrasi.
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
const baru = async (ref) => {
  const sql = ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8');
  const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(sql) }); return db;
};
const J = (x) => JSON.stringify(x);

console.log('--- Setara dengan permintaan terpisah, per peran ---');
const DB = await baru(`${P}/supabase/skema.sql`);
await isiDataContoh(DB);
await DB.query('update public.profiles set wajib_ganti_pin = false');
const masuk = async (username) => { const a = buatApi(buatKlienFake(DB)); const r = await a.masuk(username === 'penegak' ? '10231' : username, PIN_DEMO[username]); if (!r.ok) console.log('   masuk gagal', username, r.pesan); return { a, id: r.id }; };
const akun = {};
for (const u of ['penegak', 'pembina', 'admin', 'dewan']) akun[u] = await masuk(u);

// Data yang membuat tiap bagian tidak kosong: gudep, asisten, 70 notifikasi (lebih dari batas 60), dan sakelar pra-uji hidup.
await DB.query(`insert into public.pengaturan (kunci, nilai) values ('gudep.data', '{"namaGudep":"Gudep Uji","ambalan":"Ambalan Uji"}'::jsonb) on conflict (kunci) do update set nilai = excluded.nilai`);
await DB.query(`insert into public.asisten_iuran (peserta_id) select id from public.profiles where role = 'peserta' order by id limit 2`);
for (const u of ['penegak', 'pembina']) {
  await DB.query(`insert into public.notifikasi (penerima_id, jenis, judul, isi, dibaca_pada) select $1::uuid, 'tes', 'Uji ' || g, 'isi ' || g, case when g % 3 = 0 then now() else null end from generate_series(1, 70) g`, [akun[u].id]);
}
await sqlSebagai(DB, akun.pembina.id, 'select public.sg_pra_uji_sakelar(true)');

for (const [u, { a }] of Object.entries(akun)) {
  const awal = await a.muatAwal();
  ok(awal.ok === true, `${u}: sg_muat_awal berhasil`);
  if (!awal.ok) { console.log('   ', awal.pesan); continue; }
  const d = awal.data;
  const [gudep, iuran, pend, aktif, asisten, notif] = await Promise.all([a.muatGudep(), a.muatPengaturanIuran(), a.muatPendampinganSaya(), a.muatPraUjiAktif(), a.muatAsisten(), a.muatNotifikasi()]);
  ok(J(d.gudep) === J(gudep.data) && d.gudep?.namaGudep === 'Gudep Uji', `${u}: data gudep sama`);
  ok(J(d.iuran) === J(iuran.data) && d.iuran?.standar > 0, `${u}: pengaturan iuran sama`);
  ok(J(d.pendampingan) === J(pend.data), `${u}: pendampingan sama`);
  ok(d.praUjiAktif === true && aktif.data === true, `${u}: sakelar pra-uji sama (hidup)`);
  ok(J(d.asisten) === J(asisten.data) && (u === 'penegak' ? d.asisten.length <= 1 : d.asisten.length === 2), `${u}: asisten sama (${d.asisten.length}; Penegak hanya melihat barisnya sendiri menurut RLS)`);
  ok(J(d.notifikasi) === J(notif.data), `${u}: notifikasi sama (${d.notifikasi.length})`);
  if (u === 'penegak' || u === 'pembina') ok(d.notifikasi.length === 60 && d.notifikasi[0].judul === 'Uji 70', `${u}: notifikasi dibatasi 60 terbaru, terbaru dulu`);
  else ok(d.notifikasi.length === 0, `${u}: tanpa notifikasi (RLS: hanya milik sendiri)`);
}
{
  const a = akun.pembina.a;
  const awal = (await a.muatAwal()).data;
  const punyaPenegak = awal.notifikasi.every((n) => /^Uji \d+$/.test(n.judul));
  ok(punyaPenegak && awal.notifikasi.length === 60, 'pembina hanya melihat notifikasinya sendiri, bukan milik Penegak (RLS berlaku)');
}

console.log('\n--- Tanpa login dan PIN awal belum diganti ---');
{
  let galat = null;
  try { await sqlSebagai(DB, null, 'select public.sg_muat_awal()'); } catch (e) { galat = e.message; }
  ok(/permission denied/i.test(galat ?? ''), 'tanpa login ditolak: ' + (galat ?? 'TIDAK DITOLAK').slice(0, 60));
  await DB.query('update public.profiles set wajib_ganti_pin = true where id = $1', [akun.penegak.id]);
  const r = await akun.penegak.a.muatAwal();
  ok(r.ok && r.data.iuran === null && r.data.pendampingan === null, 'PIN awal belum diganti: iuran dan pendampingan null (sama seperti permintaan terpisah yang ditolak), tidak menggagalkan panggilan');
  const [gudepLama, aktifLama, asistenLama, notifLama, lama] = await Promise.all([akun.penegak.a.muatGudep(), akun.penegak.a.muatPraUjiAktif(), akun.penegak.a.muatAsisten(), akun.penegak.a.muatNotifikasi(), akun.penegak.a.muatPengaturanIuran()]);
  ok(r.ok && J(r.data.gudep) === J(gudepLama.data) && r.data.praUjiAktif === aktifLama.data && J(r.data.asisten) === J(asistenLama.data) && J(r.data.notifikasi) === J(notifLama.data), 'bagian tabel sama persis dengan permintaan terpisah untuk akun itu (RLS yang sama)');
  ok(lama.ok === false, 'pembanding: permintaan iuran terpisah memang ditolak untuk akun itu');
  await DB.query('update public.profiles set wajib_ganti_pin = false where id = $1', [akun.penegak.id]);
}

console.log('\n--- Basis data belum dimigrasi: klien tahu harus kembali ke permintaan terpisah ---');
{
  const LAMA = await baru('git:9ded7b6');
  await isiDataContoh(LAMA);
  await LAMA.query('update public.profiles set wajib_ganti_pin = false');
  const a = buatApi(buatKlienFake(LAMA));
  await a.masuk('10231', PIN_DEMO.penegak);
  const r = await a.muatAwal();
  ok(r.ok === false && r.tidakAda === true, 'fungsi belum ada: tidakAda = true (' + (r.pesan ?? '').slice(0, 60) + ')');
  ok((await a.muatNotifikasi()).ok === true, 'permintaan terpisah tetap berfungsi di basis data lama');
}

console.log('\n--- AppContext memakainya ---');
{
  const ctx = readFileSync(`${P}/src/context/AppContext.jsx`, 'utf8');
  ok(/a\.muatAwal\(\)/.test(ctx) && /awal\.tidakAda/.test(ctx), 'muatSemua memakai muatAwal dan kembali ke permintaan terpisah bila fungsi belum ada');
  ok(/muatPraUjiKini\(\{ denganAktif: false \}\)/.test(ctx), 'sakelar pra-uji tidak diminta dua kali saat pemuatan penuh');
  const iMuat = ctx.indexOf('const muatSemua = useCallback');
  const badan = ctx.slice(iMuat, ctx.indexOf('const pastikanAbsensi', iMuat));
  const terpisah = (badan.match(/a\.muat(Asisten|PengaturanIuran|Gudep|Notifikasi|PendampinganSaya|PraUjiAktif)\(\)/g) ?? []).length;
  ok(terpisah === 6, 'permintaan terpisah hanya tersisa di cabang cadangan (6 pemanggilan, semua di dalam awal.tidakAda): ' + terpisah);
  ok(/awal\.tidakAda\) \{\n\s+const \[asisten, pengIuran, gudep, notif, pend, aktif\]/.test(badan), 'keenamnya hanya di cabang tidakAda');
}

console.log(`\nRINGKASAN MUAT-AWAL: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
