// Tahap L4: cadanganLogic.js (murni), sg_cadangan_admin/sg_cadangan_status (server, PGlite + data contoh), dan pengingat bulanan.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { masukCepat } from '../src/lokal/masukCepat.js';
import { buatApi } from '../src/lib/api.js';
import { namaBerkasCadangan, perluCadangan } from '../src/lib/cadanganLogic.js';

let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const P = process.cwd().replace(/\\/g, '/');

console.log('--- cadanganLogic.js (murni) ---');
{
  ok(namaBerkasCadangan(new Date('2026-09-23T07:05:00')) === 'cadangan-sigarda-2026-09-23-0705.json', `nama berkas terbentuk: ${namaBerkasCadangan(new Date('2026-09-23T07:05:00'))}`);
  ok(perluCadangan({}) === true, 'belum pernah diunduh (pada kosong) -> perlu cadangan');
  ok(perluCadangan(null) === true, 'status null -> perlu cadangan');
  const kemarin = new Date(Date.now() - 5 * 86400000).toISOString();
  ok(perluCadangan({ pada: kemarin }) === false, '5 hari lalu -> belum perlu');
  const lama = new Date(Date.now() - 45 * 86400000).toISOString();
  ok(perluCadangan({ pada: lama }) === true, '45 hari lalu -> sudah perlu');
}

console.log('\n--- sg_cadangan_admin dan sg_cadangan_status (server, PGlite + data contoh) ---');
{
  const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
  const skema = readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '');
  const pg = new PGlite();
  await siapkanPg(pg, { sqlStub: stub, sqlSkema: skema });
  await isiDataContoh(pg);
  const q = async (sql, p = []) => (await pg.query(sql, p)).rows;

  const penyimpan = () => { let v = null; return { ambil: () => v, simpan: (x) => { v = x; } }; };
  const sesi = async (username) => { const k = buatKlienFake(pg, penyimpan()); const r = await masukCepat(pg, k, username); if (!r.ok) throw new Error(r.pesan); return buatApi(k); };
  const admin = await sesi('admin');
  const pembina = await sesi('pembina');
  const peserta = await sesi('10231');

  const s0 = await admin.statusCadangan();
  ok(s0.ok && JSON.stringify(s0.data) === '{}', 'sebelum pernah diunduh: status kosong');

  const rPembina = await pembina.unduhCadangan();
  ok(!rPembina.ok, 'Pembina DITOLAK mengunduh cadangan (hanya Admin)');
  const rPeserta = await peserta.statusCadangan();
  ok(!rPeserta.ok, 'Penegak biasa DITOLAK melihat status cadangan');

  const r = await admin.unduhCadangan();
  ok(r.ok, `Admin dapat mengunduh cadangan (${r.ok ? 'ok' : r.pesan})`);
  const tabel = r.data.tabel;
  ok(Array.isArray(tabel.profiles) && tabel.profiles.length > 0, `tabel.profiles berisi data (${tabel.profiles?.length} baris)`);
  const jProfiles = (await q('select count(*)::int n from public.profiles'))[0].n;
  ok(tabel.profiles.length === jProfiles, `jumlah baris profiles sama dengan tabel sungguhan: ${tabel.profiles.length} = ${jProfiles}`);
  const jProgress = (await q('select count(*)::int n from public.sku_progress'))[0].n;
  ok(tabel.sku_progress.length === jProgress, `jumlah baris sku_progress sama dengan tabel sungguhan: ${tabel.sku_progress.length} = ${jProgress}`);
  for (const t of ['login_gagal', 'push_konfigurasi', 'push_langganan', 'notifikasi']) {
    ok(!(t in tabel), `tabel rahasia/sementara "${t}" TIDAK disertakan dalam cadangan`);
  }
  const teks = JSON.stringify(r.data);
  ok(!/encrypted_password|password/i.test(teks), 'cadangan TIDAK memuat hash PIN atau kata sandi (auth.users tidak disentuh)');

  const s1 = await admin.statusCadangan();
  ok(s1.ok && typeof s1.data.pada === 'string' && s1.data.oleh, `sesudah diunduh: status terisi (${JSON.stringify(s1.data)})`);
  ok(new Date(s1.data.pada).getTime() > Date.now() - 10000, 'waktu cadangan baru saja (dalam 10 detik terakhir)');

  await pg.close();
}

console.log('\n--- Pengingat bulanan cadangan (sigarda.notif_pengingat) ---');
{
  const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
  const skema = readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '');
  const pg = new PGlite();
  await siapkanPg(pg, { sqlStub: stub, sqlSkema: skema });
  await isiDataContoh(pg);
  const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
  const idAdmin = (await q("select id from public.profiles where username = 'admin'"))[0].id;
  const notifCadangan = async () => q("select * from public.notifikasi where penerima_id = $1 and kunci like 'cadangan:%'", [idAdmin]);

  ok((await notifCadangan()).length === 0, 'sebelum pengingat berjalan: belum ada notifikasi cadangan');
  await q('select sigarda.notif_pengingat()');
  let n = await notifCadangan();
  ok(n.length === 1 && n[0].tautan?.tab === 'gudep', `belum pernah dicadangkan: Admin diberi 1 pengingat menuju menu Data Gudep (${JSON.stringify(n[0]?.tautan)})`);

  await q('select sigarda.notif_pengingat()');
  ok((await notifCadangan()).length === 1, 'dijalankan lagi bulan yang sama: tidak ada pengingat ganda (dideduplikasi lewat kunci)');

  await q(`insert into public.pengaturan (kunci, nilai) values ('cadangan.terakhir', jsonb_build_object('pada', now(), 'oleh', 'Admin')) on conflict (kunci) do update set nilai = excluded.nilai`);
  await q("delete from public.notifikasi where kunci like 'cadangan:%'");
  await q('select sigarda.notif_pengingat()');
  ok((await notifCadangan()).length === 0, 'cadangan baru saja diunduh: TIDAK ada pengingat baru');

  await q(`update public.pengaturan set nilai = jsonb_build_object('pada', (now() - interval '45 days')::text, 'oleh', 'Admin') where kunci = 'cadangan.terakhir'`);
  await q('select sigarda.notif_pengingat()');
  ok((await notifCadangan()).length === 1, 'cadangan 45 hari lalu (lebih dari sebulan): pengingat dikirim lagi');

  await pg.close();
}

console.log(`\nRINGKASAN CADANGAN: ${lulus} lulus, ${gagal} GAGAL.`);
if (gagal) process.exit(1);
