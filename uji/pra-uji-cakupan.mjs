// Tahap 2 (G4e): cakupan pra-uji (hasil simulasi). Fungsi server sg_pra_uji_cakupan (hak, validasi, hitungan dari riwayat pengajuan yang sesungguhnya, jendela hari, sakelar mati),
// pemetaan api, logika ringkasCakupan, dan render panel.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { KonteksApp } from '../src/context/AppContext.jsx';
import PraUji from '../src/pages/PraUji.jsx';
import { ringkasCakupan } from '../src/lib/praUjiLogic.js';
import { tahunAjaranKini } from '../src/lib/rombelLogic.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

console.log('--- ringkasCakupan ---');
{
  ok(JSON.stringify(ringkasCakupan([])) === '{"lewat":0,"langsung":0,"total":0,"persenLewat":null,"rombelKurang":[]}', 'tanpa data: total 0, persen null');
  const r = ringkasCakupan([{ rombel: 'X-02', lewat: 0, langsung: 5, binaDamping: 0 }, { rombel: 'X-01', lewat: 6, langsung: 1, binaDamping: 2 }, { rombel: 'XI-03', lewat: 1, langsung: 4, binaDamping: 1 }, { rombel: 'XI-01', lewat: 2, langsung: 2, binaDamping: 1 }]);
  ok(r.lewat === 9 && r.langsung === 12 && r.total === 21 && r.persenLewat === 43 && r.rombelKurang.map((x) => x.rombel).join() === 'X-02,XI-03', 'jumlah, persen, dan rombel yang lebih banyak langsung daripada lewat (urut terbanyak; seri tidak masuk)');
}

const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const K = { admin: await masuk('admin', PIN_DEMO.admin), pembina: await masuk('pembina', PIN_DEMO.pembina), dewan: await masuk('dewan', PIN_DEMO.dewan) };
const NIS = ['10231', '10232', '10118', '10007', '10008', '10233', '10234'];
const N = {}; for (const nis of NIS) N[nis] = await masuk(nis, PIN_DEMO.penegak);
const [ahmad, siti, dimas, bagas, nadia, rizky, kevin] = NIS.map((n) => N[n].id);
const ta = tahunAjaranKini();
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const cocok = (r, re) => !r.ok && re.test(r.pesan ?? '');
const ajukan = (id, sku) => sebagai(id, 'select public.sg_sku_ajukan($1, $2::date, null, $3)', [sku, '2030-01-10', 'siap']);
const cakupan = (id, hari = 30) => sebagai(id, 'select public.sg_pra_uji_cakupan($1) as c', [hari]);
const tulisSku = (pid, tingkat) => q(
  `insert into public.sku_progress (peserta_id, sku_id, status) select p.id, u.id, 'lulus' from public.profiles p join public.sku_unit u on u.tingkat = $2 and (u.agama is null or u.agama = p.agama)
   where p.id = $1 on conflict (peserta_id, sku_id) do update set status = 'lulus'`, [pid, tingkat]);

console.log('\n--- Persiapan: X-01 punya Bina Damping (Bagas, Nadia); X-02 (Dimas, Rizky) tidak ---');
const B = (await q(`select id from public.sku_unit where tingkat = 'Bantara' and agama is null order by butir_no, id limit 4`)).map((x) => x.id);
await q('delete from public.penugasan_rombel'); await q('delete from public.penugasan_peserta');
await q('delete from public.sku_progress where peserta_id = any($1::uuid[])', [[ahmad, siti, dimas, bagas, nadia, rizky, kevin]]);
await q(`update public.profiles set kelas = 'X-01', sangga = 'Sangga Merak' where id = any($1::uuid[])`, [[ahmad, kevin]]);
await q(`update public.profiles set kelas = 'X-01', sangga = 'Sangga Elang' where id = any($1::uuid[])`, [[bagas, nadia, siti]]);
await q(`update public.profiles set kelas = 'X-02', sangga = 'Sangga Rajawali' where id = any($1::uuid[])`, [[dimas, rizky]]);
for (const id of [bagas, nadia]) await tulisSku(id, 'Bantara');
await tulisSku(bagas, 'Laksana');
await q(`update public.profiles set jabatan_dewan = 'Bendahara' where id = $1`, [bagas]);
await q(`update public.profiles set jabatan_dewan = 'Sekretaris' where id = $1`, [nadia]);
await q(`insert into public.bina_damping (tahun_ajaran, rombel, penegak_id) values ($1, 'X-01', $2), ($1, 'X-01', $3)`, [ta, bagas, nadia]);
await q(`insert into public.penugasan_rombel (tahun_ajaran, rombel, penguji_id) values ($1, 'X-01', $2), ($1, 'X-02', $2)`, [ta, K.pembina.id]);

console.log('\n--- Hak dan validasi ---');
let r = await cakupan(siti);
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'Penegak tidak dapat melihat cakupan');
r = await cakupan(bagas);
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'Penegak berjabatan Dewan (Bina Damping) tidak dapat melihat cakupan');
r = await cakupan(K.dewan.id);
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'akun Dewan lama tidak dapat melihat cakupan');
for (const hari of [0, 366, null]) { r = await cakupan(K.pembina.id, hari); ok(cocok(r, /1 sampai 365/), `hari ${hari} ditolak`); }

console.log('\n--- Sakelar mati: pengajuan biasa tidak dihitung ---');
r = await ajukan(kevin, B[2]);
ok(r.ok, 'sakelar mati: Kevin mengajukan seperti biasa ' + (r.pesan ?? ''));
r = await cakupan(K.pembina.id);
ok(r.ok && r.rows[0].c.aktif === false && r.rows[0].c.perRombel.length === 0, 'cakupan kosong dan aktif = false selama sakelar mati');
await sebagai(K.pembina.id, 'select public.sg_pra_uji_sakelar(false)');
await q('delete from public.sku_progress where peserta_id = $1', [kevin]);
r = await sebagai(K.pembina.id, 'select public.sg_pra_uji_sakelar(true)');
ok(r.ok, 'Pembina menghidupkan sakelar');

console.log('\n--- Sakelar hidup: lewat pra-uji atau langsung ke Pembina ---');
for (const [id, sku] of [[ahmad, B[0]], [kevin, B[1]], [dimas, B[0]], [rizky, B[1]], [rizky, B[3]]]) { r = await ajukan(id, sku); ok(r.ok, 'ajukan ' + (r.pesan ?? '')); }
r = await cakupan(K.pembina.id);
const c = r.rows?.[0]?.c;
const byRombel = Object.fromEntries((c?.perRombel ?? []).map((x) => [x.rombel, x]));
ok(r.ok && c.aktif === true && c.hari === 30 && c.perRombel.length === 2, 'dua rombel tercatat ' + JSON.stringify(c));
ok(byRombel['X-01'].lewat === 2 && byRombel['X-01'].langsung === 0 && byRombel['X-01'].binaDamping === 2, 'X-01: 2 pengajuan lewat pra-uji, 0 langsung, 2 Bina Damping');
ok(byRombel['X-02'].lewat === 0 && byRombel['X-02'].langsung === 3 && byRombel['X-02'].binaDamping === 0, 'X-02: 0 lewat, 3 langsung ke Pembina (tanpa Bina Damping), 0 Bina Damping');
ok(c.perRombel[0].rombel === 'X-02', 'urut: rombel dengan pengajuan langsung terbanyak lebih dulu');
const nyata = await q(`select count(*)::int n from public.sku_progress where status = 'diajukan' and peserta_id = any($1::uuid[])`, [[dimas, rizky]]);
ok(nyata[0].n === 3, 'selaras dengan keadaan sebenarnya: 3 pengajuan X-02 memang langsung berstatus diajukan (antrian rombel)');
const menungguPra = await q(`select count(*)::int n from public.sku_pra_uji where status = 'menunggu' and peserta_id = any($1::uuid[])`, [[ahmad, kevin]]);
ok(menungguPra[0].n === 2, 'selaras dengan keadaan sebenarnya: 2 pengajuan X-01 memang menunggu pra-uji');
const rs = ringkasCakupan(c.perRombel);
ok(rs.persenLewat === 40 && rs.rombelKurang.length === 1 && rs.rombelKurang[0].rombel === 'X-02', 'ringkasCakupan pada hasil nyata: 2 dari 5 = 40%; X-02 kurang penilai');

console.log('\n--- Jendela hari ---');
await q(`update public.sku_riwayat set waktu = now() - interval '60 days' where peserta_id = $1 and teks like 'Mengajukan pengujian%'`, [dimas]);
r = await cakupan(K.pembina.id, 30);
ok(byRombel && r.rows[0].c.perRombel.find((x) => x.rombel === 'X-02').langsung === 2, '30 hari: pengajuan Dimas (60 hari lalu) tidak dihitung');
r = await cakupan(K.pembina.id, 90);
ok(r.rows[0].c.perRombel.find((x) => x.rombel === 'X-02').langsung === 3, '90 hari: pengajuan Dimas dihitung lagi');
r = await cakupan(K.admin.id, 7);
ok(r.ok && r.rows[0].c.hari === 7, 'Admin juga boleh');

console.log('\n--- Api dan tampilan ---');
r = await K.pembina.a.muatCakupanPraUji(30);
ok(r.ok && r.data.aktif === true && Array.isArray(r.data.perRombel) && r.data.perRombel[0].rombel === 'X-02', 'api().muatCakupanPraUji mengembalikan data');
r = await N['10232'].a.muatCakupanPraUji(30);
ok(!r.ok && /Hanya Pembina dan Admin Gudep/.test(r.pesan), 'Penegak ditolak lewat api');
{
  const pembinaU = { id: 'pb', role: 'penguji', jabatan: 'Pembina', nama: 'Pak Pembina', status: 'aktif' };
  const api = () => ({ muatCakupanPraUji: async () => ({ ok: true, data: { aktif: true, hari: 30, perRombel: [] } }) });
  const konteks = (user, praUjiAktif) => ({ api, user, users: [], pendampingan: null, praUjiAktif, notify: () => {}, aturSakelarPraUji: async () => ({ ok: true }), muatPraUjiMenunggu: async () => ({ ok: true, data: [] }), muatAntrianPraUji: async () => ({ ok: true, data: { menunggu: [], selesai: [] } }) });
  const html = renderToStaticMarkup(h(KonteksApp.Provider, { value: konteks(pembinaU, true) }, h(PraUji))).replace(/<!-- -->/g, '');
  ok(html.includes('Memuat cakupan pra-uji'), 'halaman Pra-uji (Pembina, pra-uji hidup) memuat panel Cakupan pra-uji');
  const mati = renderToStaticMarkup(h(KonteksApp.Provider, { value: konteks(pembinaU, false) }, h(PraUji))).replace(/<!-- -->/g, '');
  ok(!mati.includes('Cakupan pra-uji'), 'pra-uji mati: panel cakupan tidak tampil');
}

console.log(`\nRINGKASAN PRA-UJI-CAKUPAN: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
