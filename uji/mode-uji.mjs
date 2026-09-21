// Tahap L1: mode uji tanpa PIN (?masuk=), data sekolah penuh (?data=penuh), dan jaminan bahwa build produksi tidak memuatnya.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh, isiStatusContoh } from '../src/lokal/seedLokal.js';
import { AKUN_CEPAT, alamatMasukCepat, bacaParameterUji } from '../src/lokal/parameterUji.js';
import { masukCepat } from '../src/lokal/masukCepat.js';
import { isiSekolahPenuh, buatPenegak } from '../src/lokal/sekolahPenuh.js';
import { buatApi } from '../src/lib/api.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
const skema = readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '');
const penyimpan = () => { let v = null; return { ambil: () => v, simpan: (x) => { v = x; } }; };

console.log('--- Parameter alamat ---');
{
  ok(JSON.stringify(bacaParameterUji('')) === JSON.stringify({ masuk: '', penuh: false, ulang: false }), 'tanpa parameter: tidak ada yang aktif');
  ok(JSON.stringify(bacaParameterUji('?masuk=Pembina&data=penuh&ulang=1')) === JSON.stringify({ masuk: 'pembina', penuh: true, ulang: true }), '?masuk, ?data=penuh, dan ?ulang=1 terbaca (huruf kecil)');
  ok(bacaParameterUji('?data=lain').penuh === false && bacaParameterUji('?ulang=0').ulang === false, 'nilai lain diabaikan');
  ok(alamatMasukCepat('pembina', '') === '?masuk=pembina' && alamatMasukCepat('10231', '?data=penuh') === '?data=penuh&masuk=10231' && alamatMasukCepat('admin', '?ulang=1&x=2') === '?masuk=admin', 'tautan mempertahankan ?data=penuh dan membuang parameter lain');
  ok(AKUN_CEPAT.length >= 5 && AKUN_CEPAT.every((a) => a.kunci && a.label && a.username) && AKUN_CEPAT.some((a) => a.username === '10008'), 'daftar akun cepat memuat semua peran termasuk Penegak berjabatan');
}

console.log('\n--- Masuk cepat tanpa PIN ---');
{
  const pg = new PGlite();
  await siapkanPg(pg, { sqlStub: stub, sqlSkema: skema });
  await isiDataContoh(pg);
  await isiStatusContoh(pg);
  const sesi = async (kunci) => { const k = buatKlienFake(pg, penyimpan()); const r = await masukCepat(pg, k, kunci); const s = (await k.auth.getSession()).data.session; return { r, id: s?.user?.id ?? null }; };
  const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
  ok((await q("select count(*)::int n from public.profiles where wajib_ganti_pin")).at(0).n > 10, 'prasyarat: semua akun contoh wajib ganti PIN');
  for (const a of AKUN_CEPAT) {
    const { r, id } = await sesi(a.kunci);
    const p = (await q('select id, username, wajib_ganti_pin from public.profiles where username = $1', [a.username]))[0];
    ok(r.ok && id === p.id && p.wajib_ganti_pin === false, `masuk cepat sebagai ${a.label} (${a.username}): sesi dibuat, tanpa wajib ganti PIN`);
  }
  ok((await q("select count(*)::int n from public.profiles where wajib_ganti_pin")).at(0).n > 5, 'akun lain tidak ikut dibebaskan dari wajib ganti PIN');
  const tak = await sesi('tidak.ada');
  ok(!tak.r.ok && /tidak ada pada data lokal/.test(tak.r.pesan) && tak.id === null, 'akun yang tidak ada: pesan jelas, tanpa sesi');
  const nadia = (await q("select jabatan_dewan j from public.profiles where username = '10008'"))[0].j;
  ok(nadia === 'Sekretaris', 'akun contoh Nadia berjabatan Sekretaris (untuk menguji tampilan Dewan)');
}

console.log('\n--- Data sekolah penuh ---');
{
  const a = buatPenegak({ penegak: 700, alumni: 150 }), b = buatPenegak({ penegak: 700, alumni: 150 });
  ok(a.length === 850 && a.map((x) => x.id + x.nama + x.kelas).join() === b.map((x) => x.id + x.nama + x.kelas).join() && new Set(a.map((x) => x.id)).size === 850 && a.every((x) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x.id)), 'pembuat data deterministik (dua kali sama, termasuk id) dan id berbentuk UUID v4');
  ok(new Set(a.map((x) => x.nis)).size === 850 && a.every((x) => /^[XI]+-(0[1-9]|10)$/.test(x.kelas)), 'NIS unik dan rombel baku');

  const mulai = Date.now();
  const pg = new PGlite();
  await siapkanPg(pg, { sqlStub: stub, sqlSkema: skema });
  await isiDataContoh(pg);
  await isiStatusContoh(pg);
  const langkah = [];
  const ringkas = await isiSekolahPenuh(pg, { kemajuan: (t) => langkah.push(t) });
  const detik = (Date.now() - mulai) / 1000;
  const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
  const n = async (sql) => Number((await q(sql))[0].n);
  console.log(`   (dibuat dalam ${detik.toFixed(1)} detik: ${JSON.stringify(ringkas)})`);
  ok(detik < 180, `pembuatan selesai dalam waktu wajar (${detik.toFixed(1)} detik)`);
  ok(langkah.length >= 3, 'kemajuan dilaporkan per langkah: ' + langkah.join(' | '));
  ok(await n("select count(*)::int n from public.profiles where role = 'peserta' and status = 'aktif'") >= 650 && await n("select count(*)::int n from public.profiles where status = 'alumni'") === 151, 'sekitar 700 Penegak aktif dan 150 alumni (ditambah akun contoh)');
  ok(await n("select count(distinct kelas)::int n from public.profiles where role = 'peserta' and status = 'aktif' and kelas ~ '^(X|XI|XII)-(0[1-9]|10)$'") === 30, 'seluruh 30 rombel berisi Penegak');
  ok(await n("select count(*)::int n from public.profiles where role = 'penguji' and jabatan = 'Pembina'") === 4, 'Pembina: 1 contoh + 3 tambahan');
  ok(await n('select count(*)::int n from public.profiles where jabatan_dewan is not null') >= 13, 'Penegak berjabatan Dewan bertambah');
  ok(ringkas.progres > 10000 && ringkas.riwayat > 20000 && ringkas.hadir > 10000 && ringkas.iuran > 5000, 'volume data berskala sekolah: ' + JSON.stringify(ringkas));
  ok(await n("select count(*)::int n from public.sku_progress where status in ('diajukan','proses')") > 20, 'ada pengajuan yang sedang berjalan (antrian)');
  ok(await n('select count(*)::int n from public.penugasan_rombel') >= 30, 'penugasan untuk semua rombel');
  ok(await n('select count(*)::int n from public.iuran_kas') > 20 && await n('select count(*)::int n from public.portofolio') >= 26 * 10, 'kas iuran dan portofolio Calon Garuda terisi');
  ok(await n('select count(*)::int n from public.notifikasi') === 0 && await n('select count(*)::int n from public.profiles where wajib_ganti_pin') === 0, 'notifikasi kosong; tidak ada yang wajib ganti PIN');
  ok((await q('show session_replication_role'))[0].session_replication_role === 'origin', 'pemicu dan kunci asing dinyalakan kembali sesudah pemuatan');
  // konsistensi: tidak ada baris yatim
  const yatim = await n(`select (select count(*) from public.sku_progress p where not exists (select 1 from public.profiles x where x.id = p.peserta_id))
    + (select count(*) from public.sku_riwayat p where not exists (select 1 from public.profiles x where x.id = p.peserta_id))
    + (select count(*) from public.absensi_hadir p where not exists (select 1 from public.profiles x where x.id = p.peserta_id))
    + (select count(*) from public.iuran p where not exists (select 1 from public.absensi_sesi s where s.tanggal = p.tanggal))
    + (select count(*) from public.sku_progress p where not exists (select 1 from public.sku_unit u where u.id = p.sku_id)) as n`);
  ok(yatim === 0, 'tidak ada baris yatim (kunci asing konsisten)');
  ok(await n('select count(*)::int n from auth.users') === await n('select count(*)::int n from public.profiles'), 'setiap profil punya akun login');
  const dupTanggal = await n('select count(*)::int n from (select tanggal from public.absensi_sesi group by tanggal having count(*) > 1) x');
  ok(dupTanggal === 0, 'sesi latihan tidak ganda');

  // aplikasi berfungsi di atas data penuh: masuk cepat sebagai akun massal, RLS, dan fungsi server
  const k = buatKlienFake(pg, penyimpan());
  const xii = (await q("select username, id from public.profiles where kelas like 'XII-%' and status = 'aktif' and jabatan_dewan is null and username ~ '^3[0-9]{4}$' order by username limit 1"))[0];
  const r = await masukCepat(pg, k, xii.username);
  const api = buatApi(k);
  ok(r.ok, `akun massal (NIS ${xii.username}) dapat masuk cepat`);
  const prog = (await api.muatProgress()).data;
  ok(Object.keys(prog).length === 1 && prog[xii.id] && Object.keys(prog[xii.id]).length > 20, 'Penegak hanya membaca progresnya sendiri di atas data penuh (RLS)');
  const kp = buatKlienFake(pg, penyimpan());
  await masukCepat(pg, kp, 'pembina');
  const apiP = buatApi(kp);
  const t0 = Date.now();
  const profil = (await apiP.muatProfil()).data;
  const progP = (await apiP.muatProgress()).data;
  console.log(`   (Pembina memuat ${profil.length} profil dan progres ${Object.keys(progP).length} Penegak dalam ${Date.now() - t0} md; profil ${(JSON.stringify(profil).length / 1024).toFixed(0)} kB, progres ${(JSON.stringify(progP).length / 1024).toFixed(0)} kB)`);
  ok(profil.length > 850 && Object.keys(progP).length > 500, 'Pembina memuat seluruh profil dan progres sekolah penuh');
  const pil = await apiP.pengujiPilihan('BAN-05', profil.find((u) => u.username === '30005').id);
  ok(pil.ok && pil.data.penguji.length >= 1, 'daftar penguji yang sah berfungsi di atas data penuh');
  const aj = await api.ajukan({ skuId: 'BAN-23', jadwal: (await q('select sigarda.hari_ini()::text d'))[0].d, pengujiId: null, catatan: '' });
  ok(aj.ok || /sudah|Selesaikan|Poin/.test(aj.pesan ?? ''), 'alur ajukan berjalan di atas data penuh: ' + (aj.pesan ?? 'ok'));
  await pg.close();
}

console.log('\n--- Build produksi tidak memuat mode uji ---');
{
  const keluar = '.uji/dist-uji';
  rmSync(`${P}/${keluar}`, { recursive: true, force: true });
  const b = spawnSync(`npx vite build --outDir ${keluar} --emptyOutDir`, { cwd: P, shell: true, encoding: 'utf8', timeout: 300000 });
  ok(b.status === 0, 'build produksi berhasil' + (b.status === 0 ? '' : ': ' + (b.stdout + b.stderr).slice(-300)));
  const berkas = readdirSync(`${P}/${keluar}/assets`).filter((f) => f.endsWith('.js'));
  const semua = berkas.map((f) => readFileSync(`${P}/${keluar}/assets/${f}`, 'utf8')).join('\n');
  const penanda = ['sigarda-lokal-penuh', 'Sangga Cendrawasih', '[masuk cepat]', 'Menyiapkan data sekolah penuh', 'Masuk cepat tanpa PIN', 'tidak ada pada data lokal ini', '?data=penuh'];
  for (const t of penanda) ok(!semua.includes(t), `build produksi tidak memuat "${t}"`);
  rmSync(`${P}/${keluar}`, { recursive: true, force: true });
}

console.log(`\nRINGKASAN MODE-UJI: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
