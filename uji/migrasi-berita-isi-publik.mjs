// Migrasi "berita isi publik" (sg_beranda_publik menambahkan isi lengkap berita): kesetaraan dengan skema baru, data utuh, idempoten,
// perilaku baru (isi tampil di jawaban publik), dan gagal jelas bila prasyarat (migrasi 2026-09-beranda-konten.sql) belum ada.
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
const MP = bersih(readFileSync(`${P}/supabase/migrasi/2026-09-berita-isi-publik.sql`, 'utf8'));

const skemaDari = (ref) => (ref.startsWith('git:') ? skemaLama(ref.slice(4), P) : readFileSync(ref, 'utf8'));
const baru = async (skemaFile) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skemaDari(skemaFile)) }); return db; };
const cacah = async (db) => (await db.query(`select (select count(*) from public.profiles)::int p, (select count(*) from public.beranda_berita)::int b`)).rows[0];
const fungsiPublik = async (db) => (await db.query(`select md5(prosrc) badan from pg_proc where proname = 'sg_beranda_publik'`)).rows[0].badan;

const A = await baru('supabase/skema.sql'); // migrasi ini yang paling baru: skema.sql terbaru = keadaan sesudahnya
const fa = await fungsiPublik(A);

console.log('--- Database berisi data: kesetaraan, data utuh, idempoten ---');
const B1 = await baru('git:a0baf15'); // commit TEPAT sebelum migrasi ini
await isiDataContoh(B1);
await B1.query('update public.profiles set wajib_ganti_pin = false');
const masuk = async (username) => { const k = buatKlienFake(B1); const a = buatApi(k); const r = await a.masuk(username, PIN_DEMO[username] ?? PIN_DEMO.penegak); return { k, a, id: r.id }; };
const pembina = await masuk('pembina');
let r = await sqlSebagai(B1, pembina.id, "select public.sg_berita_simpan(null, 'kegiatan', 'Latihan perdana', 'Ringkas', 'Isi lengkap berita, dua paragraf.\n\nParagraf kedua.', '', 'terbit', null) as id");
const idBerita = r.rows[0].id;
const publikSebelum = (await sqlSebagai(B1, null, 'select public.sg_beranda_publik() as d')).rows[0].d;
ok(!('isi' in (publikSebelum.berita.find((b) => b.judul === 'Latihan perdana') ?? {})), 'prasyarat: sebelum migrasi, sg_beranda_publik belum menyertakan isi berita');

const sebelum = await cacah(B1);
await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'jumlah data tidak berubah oleh migrasi: ' + JSON.stringify(sebelum));
await B1.exec(MP); await B1.exec(MP);
ok(JSON.stringify(await cacah(B1)) === JSON.stringify(sebelum), 'menjalankan migrasi tiga kali: data tetap sama');
ok(await fungsiPublik(B1) === fa, 'sg_beranda_publik setara dengan skema.sql terbaru sesudah migrasi');

console.log('\n--- Sesudah migrasi: perilaku baru ---');
{
  const publik = (await sqlSebagai(B1, null, 'select public.sg_beranda_publik() as d')).rows[0].d;
  const b = publik.berita.find((x) => x.judul === 'Latihan perdana');
  ok(b?.isi === 'Isi lengkap berita, dua paragraf.\n\nParagraf kedua.', 'sg_beranda_publik (ditulis ulang) kini menyertakan isi lengkap berita terbit: ' + JSON.stringify(b?.isi));

  await sqlSebagai(B1, pembina.id, "select public.sg_berita_simpan(null, 'kegiatan', 'Draf saja', '', 'RAHASIA-ISI-DRAF', '', 'draf', null) as id");
  const teks = JSON.stringify(await sqlSebagai(B1, null, 'select public.sg_beranda_publik() as d'));
  ok(!teks.includes('RAHASIA-ISI-DRAF'), 'isi berita berstatus draf tetap tidak keluar ke publik');

  const anon = await sqlSebagai(B1, null, `select public.sg_berita_hapus(${idBerita}) as x`).catch((e) => ({ galat: e.message }));
  ok(!!anon.galat, 'anon tetap tidak dapat memanggil fungsi tulis konten beranda sesudah migrasi');
}

console.log('\n--- Tanpa migrasi sebelumnya (2026-09-beranda-konten.sql): gagal jelas ---');
const B3 = await baru('git:bab5bfd'); // commit TEPAT sebelum migrasi 2026-09-beranda-konten.sql (Fase 1 beranda saja)
let galat = null;
try { await B3.exec(MP); } catch (e) { galat = e.message; await B3.exec('rollback'); }
ok(/Jalankan lebih dulu migrasi 2026-09-beranda-konten\.sql/.test(galat ?? ''), 'pesan yang menuntun: ' + (galat ?? 'TIDAK GAGAL').slice(0, 100));
ok((await B3.query(`select to_regclass('public.beranda_berita') as t`)).rows[0].t === null, 'kegagalan membatalkan seluruh migrasi (tabel prasyarat tidak ada)');

console.log(`\nRINGKASAN MIGRASI BERITA-ISI-PUBLIK: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
