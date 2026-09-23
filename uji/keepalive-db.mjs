// Keep-alive Supabase dari dalam database: sigarda.keepalive_atur / _ping / _catat / _periksa / _matikan (PGlite; pg_net dan pg_cron DIPALSUKAN,
// seperti pada uji notifikasi). Yang dijaga: hanya pemilik (SQL Editor, tanpa login aplikasi) yang dapat mengatur, ping benar-benar dikirim ke API proyek
// sendiri dengan kunci di header, hasil dicatat, jadwal dibuat/dihapus, dan tabel tidak terbaca dari aplikasi.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
const skema = readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '');
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: stub, sqlSkema: skema });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const galat = async (sql, p = []) => { try { await pg.query(sql, p); return null; } catch (e) { return e.message; } };
const URL = 'https://abcdefghijklmnop.supabase.co';
const KUNCI = 'sb_publishable_abcdefghijklmnopqrstuvwxyz0123456789';
const konf = async () => (await q('select * from public.keepalive_konfigurasi'))[0];

const PALSU_NET = `create schema net;
  create table public.tes_net (id bigserial primary key, url text, headers jsonb, body jsonb, waktu int);
  create table net._http_response (id bigint primary key, status_code int, error_msg text);
  create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds int default 2000)
    returns bigint language plpgsql as $$ declare v bigint; begin insert into public.tes_net (url, headers, body, waktu) values (url, headers, body, timeout_milliseconds) returning id into v; return v; end $$;`;
const PALSU_CRON = `create schema cron;
  create table cron.job (jobid serial, jobname text unique, schedule text, command text, active boolean default true);
  create function cron.schedule(job_name text, schedule text, command text) returns bigint language plpgsql as
    $$ begin insert into cron.job (jobname, schedule, command) values (job_name, schedule, command) on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command; return 1; end $$;
  create function cron.unschedule(job_name text) returns boolean language plpgsql as $$ begin delete from cron.job where jobname = job_name; return true; end $$;`;

console.log('--- Hak akses tabel dan pengaturan ---');
{
  const t = (await q(`select relrowsecurity r, has_table_privilege('authenticated', c.oid, 'select') s, has_table_privilege('anon', c.oid, 'select') a,
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'keepalive_konfigurasi')::int k from pg_class c where relname = 'keepalive_konfigurasi' and relnamespace = 'public'::regnamespace`))[0];
  ok(t.r && !t.s && !t.a && t.k === 0, 'tabel keepalive_konfigurasi: RLS aktif, tanpa kebijakan, tanpa hak baca untuk authenticated dan anon');
  const ahmad = (await q(`select id from public.profiles where username = '10231'`))[0].id;
  let g = null; try { await sqlSebagai(pg, ahmad, 'select * from public.keepalive_konfigurasi'); } catch (e) { g = e.message; }
  ok(/permission denied/i.test(g ?? ''), 'akun aplikasi tidak dapat membaca kunci/alamat lewat kueri tabel: ' + (g ?? 'TIDAK DITOLAK'));
  g = null; try { await sqlSebagai(pg, ahmad, `select sigarda.keepalive_atur('${URL}', '${KUNCI}')`); } catch (e) { g = e.message; }
  ok(/hanya dari SQL Editor/.test(g ?? ''), 'pengguna yang sudah login DITOLAK mengatur keep-alive');
  ok((await konf()) === undefined, 'penolakan tidak meninggalkan konfigurasi');
}

console.log('\n--- Validasi masukan ---');
{
  ok(/https:\/\/<ref>\.supabase\.co/.test(await galat(`select sigarda.keepalive_atur('http://abcdefghijklmnop.supabase.co', '${KUNCI}')`) ?? ''), 'alamat http (bukan https) ditolak dengan petunjuk');
  ok(/Alamat proyek/.test(await galat(`select sigarda.keepalive_atur('https://abc.supabase.co/rest/v1', '${KUNCI}')`) ?? ''), 'alamat dengan /rest/v1 ditolak');
  ok(/Kunci anon/.test(await galat(`select sigarda.keepalive_atur('${URL}', 'pendek')`) ?? ''), 'kunci terlalu pendek ditolak');
  ok((await konf()) === undefined, 'masukan tidak sah tidak tersimpan');
}

console.log('\n--- Tanpa pg_net dan pg_cron: tersimpan dengan catatan, tidak galat ---');
{
  const r = (await q(`select sigarda.keepalive_atur('${URL}/', '${KUNCI}') h`))[0].h;
  ok(/pg_cron belum aktif/.test(r) && /pg_net belum aktif/.test(r), 'hasil menyebut pg_cron dan pg_net yang belum aktif: ' + r);
  const k = await konf();
  ok(k.url === URL && k.kunci === KUNCI, 'alamat dirapikan (garis miring akhir dibuang) dan kunci tersimpan');
  ok((await q('select sigarda.keepalive_ping() p'))[0].p === null, 'ping tanpa pg_net: tidak melakukan apa pun (null), tanpa galat');
  const per = (await q('select sigarda.keepalive_periksa() p'))[0].p;
  ok(per.terkonfigurasi === true && per.sehat === false && per.pekerjaan_cron_aktif === 0, 'periksa: terkonfigurasi tetapi belum sehat');
}

console.log('\n--- Dengan pg_net dan pg_cron (palsu) ---');
await pg.exec(PALSU_NET);
await pg.exec(PALSU_CRON);
{
  const r = (await q(`select sigarda.keepalive_atur('${URL}', '${KUNCI}') h`))[0].h;
  ok(/Ping pertama dikirim/.test(r) && !/belum aktif/.test(r), 'pengaturan lengkap: ping pertama dikirim: ' + r);
  const jadwal = await q('select jobname, schedule, command from cron.job order by jobname');
  ok(jadwal.length === 2 && jadwal[0].jobname === 'sigarda-keepalive' && jadwal[0].schedule === '30 1 * * *' && jadwal[0].command === 'select sigarda.keepalive_ping()'
    && jadwal[1].jobname === 'sigarda-keepalive-catat' && jadwal[1].schedule === '35 1 * * *' && jadwal[1].command === 'select sigarda.keepalive_catat()', 'dua pekerjaan pg_cron: ping harian dan pencatatan hasil 5 menit sesudahnya');
  const p = await q('select * from public.tes_net');
  ok(p.length === 1 && p[0].url === `${URL}/rest/v1/rpc/sg_gudep_publik` && JSON.stringify(p[0].body) === '{}' && p[0].waktu === 10000, 'satu permintaan ke fungsi publik sg_gudep_publik di API proyek sendiri (badan kosong, batas 10 detik)');
  ok(p[0].headers.apikey === KUNCI && p[0].headers.Authorization === `Bearer ${KUNCI}` && p[0].headers['Content-Type'] === 'application/json', 'kunci dikirim lewat header apikey dan Authorization');
  const k = await konf();
  ok(k.ping_id === Number(p[0].id) && k.pesan_terakhir === 'Menunggu jawaban' && k.status_terakhir === null && k.ping_terakhir !== null, 'ping tercatat, menunggu jawaban');
  await pg.exec('select sigarda.keepalive_atur($1, $2)'.replace('$1', `'${URL}'`).replace('$2', `'${KUNCI}'`));
  ok((await q('select count(*)::int c from public.keepalive_konfigurasi'))[0].c === 1 && (await q('select count(*)::int c from cron.job'))[0].c === 2, 'diulang: tetap satu baris konfigurasi dan dua jadwal (tidak menggandakan)');
}

console.log('\n--- Pencatatan jawaban ---');
{
  const id = (await konf()).ping_id;
  await q('select sigarda.keepalive_catat()');
  ok((await konf()).pesan_terakhir === 'Jawaban belum atau tidak lagi tercatat di pg_net.' && (await konf()).status_terakhir === null, 'jawaban belum ada: dicatat apa adanya');
  await q('insert into net._http_response (id, status_code) values ($1, 200)', [id]);
  await q('select sigarda.keepalive_catat()');
  let k = await konf();
  ok(k.status_terakhir === 200 && /menjawab/.test(k.pesan_terakhir), 'HTTP 200: dicatat sehat');
  const per = (await q('select sigarda.keepalive_periksa() p'))[0].p;
  ok(per.sehat === true && per.pekerjaan_cron_aktif === 2 && per.status === 200 && per.alamat === URL, 'periksa: sehat (jawaban 2xx dan kedua jadwal aktif)');
  ok(!JSON.stringify(per).includes(KUNCI), 'periksa tidak menampilkan kunci');

  const id2 = (await q('select sigarda.keepalive_ping() p'))[0].p;
  await q('insert into net._http_response (id, status_code) values ($1, 401)', [id2]);
  await q('select sigarda.keepalive_catat()');
  k = await konf();
  ok(k.status_terakhir === 401 && /kunci anon/.test(k.pesan_terakhir) && (await q('select sigarda.keepalive_periksa() p'))[0].p.sehat === false, 'HTTP 401: dicatat gagal dengan petunjuk kunci, tidak sehat');
  const id3 = (await q('select sigarda.keepalive_ping() p'))[0].p;
  await q('insert into net._http_response (id, status_code) values ($1, 404)', [id3]);
  await q('select sigarda.keepalive_catat()');
  ok(/alamat proyek salah/.test((await konf()).pesan_terakhir), 'HTTP 404: petunjuk alamat/fungsi');
  const id4 = (await q('select sigarda.keepalive_ping() p'))[0].p;
  await q('insert into net._http_response (id, status_code, error_msg) values ($1, null, $2)', [id4, 'Timeout of 10000 ms reached']);
  await q('select sigarda.keepalive_catat()');
  k = await konf();
  ok(k.status_terakhir === 0 && /Timeout/.test(k.pesan_terakhir), 'waktu habis (tanpa status): dicatat dengan pesan galat pg_net');
}

console.log('\n--- Galat pengiriman tidak dilempar ---');
{
  await pg.exec('alter function net.http_post(text, jsonb, jsonb, jsonb, int) rename to http_post_asli');
  await pg.exec(`create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds int default 2000) returns bigint language plpgsql as $$ begin raise exception 'jaringan putus'; end $$`);
  const r = (await q('select sigarda.keepalive_ping() p'))[0].p;
  const k = await konf();
  ok(r === null && k.status_terakhir === 0 && /Gagal mengantre.*jaringan putus/.test(k.pesan_terakhir), 'galat pg_net ditangkap dan dicatat, pemanggil (pg_cron) tidak gagal');
  await pg.exec('drop function net.http_post(text, jsonb, jsonb, jsonb, int); alter function net.http_post_asli(text, jsonb, jsonb, jsonb, int) rename to http_post');
}

console.log('\n--- Mematikan ---');
{
  let g = null; const ahmad = (await q(`select id from public.profiles where username = '10231'`))[0].id;
  try { await sqlSebagai(pg, ahmad, 'select sigarda.keepalive_matikan()'); } catch (e) { g = e.message; }
  ok(/hanya dari SQL Editor/.test(g ?? '') && (await konf()) !== undefined, 'pengguna aplikasi tidak dapat mematikan');
  await q('select sigarda.keepalive_matikan()');
  ok((await konf()) === undefined && (await q('select count(*)::int c from cron.job'))[0].c === 0, 'dimatikan: konfigurasi dan kedua jadwal terhapus');
  ok((await q('select sigarda.keepalive_ping() p'))[0].p === null && (await q('select sigarda.keepalive_periksa() p'))[0].p.terkonfigurasi === false, 'sesudah dimatikan: ping tidak melakukan apa pun, periksa menyatakan belum terkonfigurasi');
}

console.log('\n--- Cadangan data tidak memuat kunci konfigurasi ---');
{
  await q(`select sigarda.keepalive_atur('${URL}', '${KUNCI}')`);
  const admin = (await q(`select id from public.profiles where role = 'admin' limit 1`))[0].id;
  const c = (await sqlSebagai(pg, admin, 'select public.sg_cadangan_admin() d')).rows[0].d;
  ok(!JSON.stringify(c).includes(KUNCI) && !('keepalive_konfigurasi' in (c.tabel ?? c)), 'sg_cadangan_admin tidak menyertakan tabel/isi keepalive_konfigurasi');
}

console.log(`\nRINGKASAN KEEPALIVE-DB: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
