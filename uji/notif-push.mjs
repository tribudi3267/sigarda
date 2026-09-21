// Edge Function notif-push: pemeriksaan rahasia, validasi masukan, pengiriman ke banyak perangkat, pencatatan status, dan penghapusan perangkat
// yang sudah tidak berlaku (404/410). Dijalankan terhadap fungsi SQL sungguhan (PGlite) dengan layanan push palsu (uji/palsu/web-push.mjs).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import palsu from './palsu/web-push.mjs';
import { samaAman, susunPayload, tangani } from '../supabase/functions/notif-push/index.ts';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const RAHASIA = 'rahasia-bersama-panjang';

console.log('--- Fungsi bantu ---');
ok(samaAman('abc', 'abc') && !samaAman('abc', 'abd') && !samaAman('abc', 'abcd') && !samaAman('abc', undefined), 'samaAman: sama, beda isi, beda panjang, bukan teks');
const p = JSON.parse(susunPayload({ id: 7, judul: 'J'.repeat(200), isi: 'I'.repeat(500), tautan: { tab: 'sku' }, rahasia: 'x' }));
ok(Object.keys(p).sort().join() === 'id,isi,judul' && p.judul.length === 120 && p.isi.length === 300, 'payload hanya id, judul, isi (dipotong), tanpa tautan atau data lain');

console.log('\n--- Pemeriksaan permintaan ---');
const depsKosong = { rahasia: RAHASIA, ambil: async () => { throw new Error('tidak boleh dipanggil'); }, kirim: async () => {}, catat: async () => {} };
let r = await tangani('GET', RAHASIA, { ids: [1] }, depsKosong);
ok(r.status === 405, 'metode selain POST ditolak (405)');
r = await tangani('POST', 'salah', { ids: [1] }, depsKosong);
ok(r.status === 401, 'rahasia salah ditolak (401), tanpa menyentuh basis data');
r = await tangani('POST', null, { ids: [1] }, depsKosong);
ok(r.status === 401, 'tanpa header rahasia ditolak (401)');
r = await tangani('POST', 'pendek', { ids: [1] }, { ...depsKosong, rahasia: 'pendek' });
ok(r.status === 401, 'rahasia yang dikonfigurasi terlalu pendek: ditolak walau cocok');
for (const body of [{}, { ids: [] }, { ids: 'x' }, { ids: ['a', -1, 0, 1.5] }, { ids: Array.from({ length: 201 }, (_, i) => i + 1) }]) {
  r = await tangani('POST', RAHASIA, body, depsKosong);
  ok(r.status === 400, `ids tidak sah ditolak (400): ${JSON.stringify(body).slice(0, 40)}`);
}

console.log('\n--- Pengiriman terhadap basis data sungguhan ---');
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
const q = async (sql, a = []) => (await pg.query(sql, a)).rows;
const [ahmad, pembina, dewan] = [(await q(`select id::text from public.profiles where username = '10231'`))[0].id, (await q(`select id::text from public.profiles where username = 'pembina'`))[0].id, (await q(`select id::text from public.profiles where username = 'dewan'`))[0].id];
const sub = (penerima, kode) => q(`insert into public.push_langganan (penerima_id, endpoint, p256dh, auth) values ($1, $2, $3, $4) returning id::int`, [penerima, `https://push.example/${kode}-` + 'x'.repeat(30), 'P'.repeat(40), 'A'.repeat(16)]);
const s1 = (await sub(ahmad, 'hidup'))[0].id, s2 = (await sub(ahmad, 'mati'))[0].id, s3 = (await sub(pembina, 'rusak'))[0].id;
const notif = async (penerima, judul, isi) => (await q(`insert into public.notifikasi (penerima_id, jenis, judul, isi) values ($1, 'hasil', $2, $3) returning id::int`, [penerima, judul, isi]))[0].id;
const n1 = await notif(ahmad, 'N1', 'isi 1'), n2 = await notif(pembina, 'N2', 'isi 2'), n3 = await notif(dewan, 'N3', 'tanpa perangkat');
const deps = {
  rahasia: RAHASIA,
  ambil: async (ids) => (await q('select public.sg_push_ambil_internal($1::bigint[]) d', [ids]))[0].d,
  kirim: async (l, payload) => palsu.sendNotification({ endpoint: l.endpoint, keys: { p256dh: l.p256dh, auth: l.auth } }, payload, { TTL: 86400 }),
  catat: async (h) => { await q('select public.sg_push_hasil_internal($1::jsonb)', [JSON.stringify(h)]); },
};
globalThis.__webpush = {
  tolak: (l) => (l.endpoint.includes('/mati-') ? Object.assign(new Error('Gone'), { statusCode: 410 }) : l.endpoint.includes('/rusak-') ? Object.assign(new Error('Server error'), { statusCode: 500 }) : null),
};
r = await tangani('POST', RAHASIA, { ids: [n1, n2, n3, n1, 999999] }, deps);
ok(r.status === 200 && r.isi.ok && r.isi.notifikasi === 3 && r.isi.terkirim === 1 && r.isi.dihapus === 1, 'tanggapan: 3 notifikasi diproses, 1 perangkat terkirim, 1 dihapus: ' + JSON.stringify(r.isi));
const w = globalThis.__webpush.terkirim;
ok(w.length === 3 && w.every((x) => x.opsi.TTL === 86400), 'tiap perangkat dicoba satu kali (n1: 2 perangkat, n2: 1, n3: 0)');
const isiKirim = JSON.parse(w.find((x) => x.langganan.endpoint.includes('/hidup-')).payload);
ok(isiKirim.id === n1 && isiKirim.judul === 'N1' && isiKirim.isi === 'isi 1', 'perangkat menerima id, judul, dan isi notifikasinya');
const st = Object.fromEntries((await q('select id::int, push_status from public.notifikasi')).map((x) => [x.id, x.push_status]));
ok(st[n1] === 'dikirim' && st[n2] === 'gagal' && st[n3] === 'gagal', 'status: n1 dikirim (satu perangkat cukup), n2 gagal (500), n3 gagal (tanpa perangkat)');
const sisa = (await q('select id::int from public.push_langganan order by id')).map((x) => x.id);
ok(sisa.includes(s1) && sisa.includes(s3) && !sisa.includes(s2), 'hanya perangkat 410 yang dihapus; perangkat yang gagal sementara (500) dipertahankan');

globalThis.__webpush.terkirim = [];
r = await tangani('POST', RAHASIA, { ids: [n1, n2, n3] }, deps);
ok(r.status === 200 && r.isi.notifikasi === 0 && globalThis.__webpush.terkirim.length === 0, 'diminta lagi: notifikasi yang sudah berstatus tidak dikirim ulang');

console.log(`\nRINGKASAN NOTIF-PUSH: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
