// Tahap L7: Berkas Calon Garuda -- garudaLogic.js (murni) dan fungsi server (sg_garuda_berkas_baca, sg_garuda_token_buat/cabut/baca).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { susunProgress, susunPortofolio, petaProfil } from '../src/lib/mapDb.js';
import { parameterBerkasGaruda, urlBerkasGaruda } from '../src/lib/garudaLogic.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

console.log('--- garudaLogic.js (murni) ---');
{
  ok(urlBerkasGaruda('abc123', 'https://sigarda.smabukateja.sch.id/') === 'https://sigarda.smabukateja.sch.id/?berkas=abc123', 'urlBerkasGaruda: menyusun alamat');
  ok(parameterBerkasGaruda('?berkas=abc123') === 'abc123', 'parameterBerkasGaruda: membaca parameter');
  ok(parameterBerkasGaruda('?berkas=') === '', 'parameterBerkasGaruda: kosong tetap terbaca (bukan null)');
  ok(parameterBerkasGaruda('?v=xyz') === null, 'parameterBerkasGaruda: null bila parameter tidak ada (halaman biasa)');
  ok(parameterBerkasGaruda('') === null, 'parameterBerkasGaruda: null untuk query kosong');
}

console.log('\n--- Server (PGlite + data contoh) ---');
{
  const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
  const skema = readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '');
  const pg = new PGlite();
  await siapkanPg(pg, { sqlStub: stub, sqlSkema: skema });
  await isiDataContoh(pg);
  await pg.query('update public.profiles set wajib_ganti_pin = false');
  const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
  const masuk = async (username) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(username, PIN_DEMO[username] ?? PIN_DEMO.penegak); return { k, a, id: r.id }; };

  const K = { admin: await masuk('admin'), pembina: await masuk('pembina'), dewan: await masuk('dewan'), ahmad: await masuk('10231') };
  const dewanId = K.dewan.id;

  // Siapkan satu Penegak (10231/Ahmad) sebagai Calon Garuda: seluruh unit Bantara dan Laksana lulus, lalu tandai calon_garuda.
  const luluskan = (pid, tingkat) => pg.query(
    `insert into public.sku_progress (peserta_id, sku_id, status, tanggal_uji, nilai, penguji_id, verifikasi)
     select p.id, u.id, 'lulus', current_date, 'Baik', $3, 'VRF-TESTGRD'
     from public.profiles p join public.sku_unit u on u.tingkat = $2 and (u.agama is null or u.agama = p.agama)
     where p.id = $1
     on conflict (peserta_id, sku_id) do update set status = 'lulus', tanggal_uji = excluded.tanggal_uji, penguji_id = excluded.penguji_id`,
    [pid, tingkat, dewanId]
  );
  await luluskan(K.ahmad.id, 'Bantara');
  await luluskan(K.ahmad.id, 'Laksana');

  console.log('  - sg_garuda_berkas_baca dan sg_garuda_token_buat: ditolak sebelum mendaftar sebagai Calon Garuda');
  let r = await K.pembina.k.rpc('sg_garuda_berkas_baca', { p_peserta_id: K.ahmad.id });
  ok(r.error && /belum mendaftar sebagai Calon Garuda/.test(r.error.message), 'sg_garuda_berkas_baca: ditolak sebelum mendaftar (lulus SKU saja belum cukup): ' + (r.error?.message ?? '(lolos)'));

  await pg.query(`update public.profiles set calon_garuda = current_date where id = $1`, [K.ahmad.id]);

  console.log('  - sg_garuda_berkas_baca: hanya Pembina dan Admin (BUKAN Dewan Ambalan, sengaja lebih ketat dari menilai portofolio)');
  r = await K.dewan.k.rpc('sg_garuda_berkas_baca', { p_peserta_id: K.ahmad.id });
  ok(r.error && /Hanya Pembina dan Admin/.test(r.error.message), 'Dewan Ambalan DITOLAK membuka berkas: ' + (r.error?.message ?? '(lolos)'));
  r = await K.ahmad.k.rpc('sg_garuda_berkas_baca', { p_peserta_id: K.ahmad.id });
  ok(r.error && /Hanya Pembina dan Admin/.test(r.error.message), 'Penegak sendiri DITOLAK membuka berkasnya sendiri lewat jalur ini');
  r = await K.pembina.k.rpc('sg_garuda_berkas_baca', { p_peserta_id: K.ahmad.id });
  ok(!r.error, `Pembina dapat membuka berkas Calon Garuda (${r.error?.message ?? 'ok'})`);
  const berkas = r.data;
  ok(berkas.peserta.nama && berkas.peserta.id === K.ahmad.id, 'berkas.peserta terisi');
  ok(Array.isArray(berkas.sku_progress) && berkas.sku_progress.length > 0, `berkas.sku_progress terisi (${berkas.sku_progress?.length})`);
  ok(Array.isArray(berkas.portofolio), 'berkas.portofolio berupa larik (boleh kosong bagi Penegak yang belum mengisi apa pun)');
  ok(berkas.token === null, 'belum ada tautan berbagi: token null');

  console.log('  - susunProgress/susunPortofolio (mapDb.js) dapat langsung memetakan hasil RPC ini (sumber data seragam dengan halaman biasa)');
  const progress = susunProgress(berkas.sku_progress, berkas.sku_riwayat);
  ok(progress[K.ahmad.id] && Object.values(progress[K.ahmad.id]).every((e) => e.status === 'lulus'), 'seluruh unit Bantara+Laksana berstatus lulus setelah dipetakan');
  const portofolioPeta = susunPortofolio(berkas.portofolio, berkas.portofolio_jurnal);
  ok(typeof portofolioPeta === 'object', 'susunPortofolio tidak melempar galat pada data kosong');
  const petaPeserta = petaProfil({ ...berkas.peserta, role: 'peserta', username: 'x' });
  ok(petaPeserta.id === K.ahmad.id, 'petaProfil dapat memetakan bentuk objek peserta dari RPC ini');

  r = await K.admin.k.rpc('sg_garuda_berkas_baca', { p_peserta_id: K.ahmad.id });
  ok(!r.error, 'Admin juga dapat membuka berkas');

  console.log('  - sg_garuda_token_buat: hanya Pembina/Admin, satu token aktif per peserta (regenerasi mencabut yang lama)');
  r = await K.dewan.k.rpc('sg_garuda_token_buat', { p_peserta_id: K.ahmad.id });
  ok(r.error && /Hanya Pembina dan Admin/.test(r.error.message), 'Dewan Ambalan DITOLAK membuat tautan berbagi');
  r = await K.pembina.k.rpc('sg_garuda_token_buat', { p_peserta_id: K.ahmad.id });
  ok(!r.error && /^[0-9a-f]{32}$/.test(r.data), `Pembina dapat membuat tautan berbagi, token 32 heksadesimal (${r.data})`);
  const token1 = r.data;
  const aktifSetelah1 = (await q(`select count(*)::int n from public.garuda_berkas_token where peserta_id = $1 and dicabut_pada is null`, [K.ahmad.id]))[0].n;
  ok(aktifSetelah1 === 1, 'satu baris token aktif setelah dibuat pertama kali');
  r = await K.admin.k.rpc('sg_garuda_token_buat', { p_peserta_id: K.ahmad.id });
  const token2 = r.data;
  ok(!r.error && token2 !== token1, `regenerasi oleh Admin menghasilkan token BARU yang berbeda (${token1 !== token2})`);
  const aktifSetelah2 = (await q(`select count(*)::int n from public.garuda_berkas_token where peserta_id = $1 and dicabut_pada is null`, [K.ahmad.id]))[0].n;
  ok(aktifSetelah2 === 1, 'tetap hanya satu baris token AKTIF setelah regenerasi (yang lama tercabut, bukan terhapus)');
  const totalBaris = (await q(`select count(*)::int n from public.garuda_berkas_token where peserta_id = $1`, [K.ahmad.id]))[0].n;
  ok(totalBaris === 2, 'baris token lama tetap ada (tercabut), bukan dihapus -- jejak riwayat tersimpan: ' + totalBaris);

  console.log('  - sg_garuda_berkas_baca sesudah token dibuat: menyertakan token aktif yang terbaru');
  r = await K.pembina.k.rpc('sg_garuda_berkas_baca', { p_peserta_id: K.ahmad.id });
  ok(r.data.token === token2, 'field token pada berkas = token AKTIF terbaru (bukan yang sudah dicabut)');

  console.log('  - sg_garuda_token_baca (TANPA LOGIN): mengembalikan isi lengkap berkas bagi token yang valid');
  const kAnon = buatKlienFake(pg); // klien tanpa sesi masuk (mensimulasikan pengunjung tautan berbagi)
  let rp = await kAnon.rpc('sg_garuda_token_baca', { p_token: token1 });
  ok(!rp.error && rp.data.ditemukan === false, 'token LAMA (sudah dicabut oleh regenerasi): ditemukan=false, BUKAN galat keras: ' + JSON.stringify(rp.data));
  rp = await kAnon.rpc('sg_garuda_token_baca', { p_token: token2 });
  ok(!rp.error && rp.data.ditemukan === true && rp.data.peserta.nama === berkas.peserta.nama, `token AKTIF tanpa login: berhasil membaca berkas (${rp.data?.peserta?.nama})`);
  ok(Array.isArray(rp.data.sku_progress) && rp.data.sku_progress.length === berkas.sku_progress.length, 'isi sku_progress sama dengan jalur berlogin (satu sumber data)');
  rp = await kAnon.rpc('sg_garuda_token_baca', { p_token: 'tidak-dikenal-sama-sekali-xx' });
  ok(!rp.error && rp.data.ditemukan === false, 'token yang bukan format 32 heksadesimal: ditemukan=false tanpa galat keras');
  rp = await kAnon.rpc('sg_garuda_token_baca', { p_token: 'ff'.repeat(16) });
  ok(!rp.error && rp.data.ditemukan === false, 'token 32 heksadesimal tetapi tidak terdaftar: ditemukan=false');

  console.log('  - sg_garuda_token_cabut: hanya Pembina/Admin; sesudah dicabut, tautan berhenti berfungsi');
  r = await K.dewan.k.rpc('sg_garuda_token_cabut', { p_peserta_id: K.ahmad.id });
  ok(r.error && /Hanya Pembina dan Admin/.test(r.error.message), 'Dewan Ambalan DITOLAK mencabut tautan');
  r = await K.pembina.k.rpc('sg_garuda_token_cabut', { p_peserta_id: K.ahmad.id });
  ok(!r.error, `Pembina dapat mencabut tautan aktif (${r.error?.message ?? 'ok'})`);
  rp = await kAnon.rpc('sg_garuda_token_baca', { p_token: token2 });
  ok(!rp.error && rp.data.ditemukan === false, 'sesudah dicabut: tautan yang sama tidak lagi menjawab isi berkas');
  r = await K.pembina.k.rpc('sg_garuda_berkas_baca', { p_peserta_id: K.ahmad.id });
  ok(r.data.token === null, 'sg_garuda_berkas_baca: field token kembali null sesudah dicabut (tanpa membuat lagi)');
  r = await K.pembina.k.rpc('sg_garuda_token_cabut', { p_peserta_id: K.ahmad.id });
  ok(!r.error, 'mencabut lagi padahal sudah tidak ada yang aktif: tidak menghasilkan galat (aman, tanpa efek)');

  console.log('  - Peserta yang bukan Calon Garuda (mis. akun Dewan Ambalan) ditolak sepenuhnya');
  r = await K.pembina.k.rpc('sg_garuda_token_buat', { p_peserta_id: dewanId });
  ok(r.error != null, 'membuat tautan untuk akun yang bukan peserta ditolak: ' + (r.error?.message ?? '(lolos)'));

  await pg.close();
}

console.log(`\nRINGKASAN GARUDA: ${lulus} lulus, ${gagal} GAGAL.`);
if (gagal) process.exit(1);
