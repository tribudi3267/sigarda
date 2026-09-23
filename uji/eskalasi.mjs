// Tahap L5: eskalasiLogic.js (murni), nomor WhatsApp (sg_profil_whatsapp_atur), dan tangga eskalasi server (sigarda.eskalasi_*, sg_eskalasi_daftar).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { labelJenisEskalasi, bolehDihubungi, nomorWaAnggota, teksWaAjakMasuk, teksWaAktifkanNotifikasi, teksWaSiap, waLink, whatsappSah } from '../src/lib/eskalasiLogic.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

console.log('--- eskalasiLogic.js (murni) ---');
{
  ok(whatsappSah('08123456789') && whatsappSah('+62 812-3456-789'), 'format lazim diterima');
  ok(!whatsappSah('abc') && !whatsappSah('12345') && !whatsappSah(''), 'terlalu pendek/bukan angka ditolak (kosong juga, dianggap belum diisi bukan sah)');
  ok(labelJenisEskalasi('sku') === 'SKU' && labelJenisEskalasi('absensi').toLowerCase().includes('absensi') && labelJenisEskalasi('iuran').toLowerCase().includes('iuran'), 'label jenis kejadian: ' + [labelJenisEskalasi('sku'), labelJenisEskalasi('absensi'), labelJenisEskalasi('iuran')].join(', '));
  const link = waLink('08123456789', 'halo dunia');
  ok(link.startsWith('https://wa.me/62') && link.includes('halo%20dunia'), 'waLink mengubah 08... jadi 62... dan menyandikan teks: ' + link);
  ok(waLink('', 'halo').startsWith('https://wa.me/?'), 'tanpa nomor: wa.me tanpa nomor (pengguna pilih kontak sendiri)');
  const teks = teksWaSiap({ nama: 'Budi', jenis: 'sku', hari: 10 });
  ok(teks.includes('Budi') && teks.length > 10, 'teksWaSiap menyebut nama: ' + teks);
  const ingat = teksWaAktifkanNotifikasi('Sari');
  ok(ingat.includes('Sari') && /Notifikasi/.test(ingat) && /Aktifkan notifikasi/.test(ingat) && !/lulus|ulang/i.test(ingat), 'teksWaAktifkanNotifikasi menyebut nama dan langkah, tanpa hasil lulus/ulang');
  const ajak = teksWaAjakMasuk('Dewi', 'https://contoh.id/');
  ok(ajak.includes('Dewi') && ajak.includes('https://contoh.id/') && /belum pernah dipakai masuk/.test(ajak) && !/PIN\s*[:=]?\s*\d/.test(ajak) && !/lulus|ulang/i.test(ajak), 'teksWaAjakMasuk menyebut nama dan alamat, tanpa PIN atau hasil lulus/ulang');
  const pembinaU = { id: 'p', role: 'penguji', jabatan: 'Pembina' }, dewanU = { id: 'd', role: 'penguji', jabatan: 'Dewan Ambalan' }, adminU = { id: 'a', role: 'admin' };
  const semua = [{ id: 'x', peran: 'Penegak' }, { id: 'y', peran: 'Dewan Ambalan' }, { id: 'z', peran: 'Pembina' }, { id: 'w', peran: 'Admin Gudep' }];
  ok(JSON.stringify(semua.map((t) => bolehDihubungi(pembinaU, t))) === '[true,true,true,false]' && JSON.stringify(semua.map((t) => bolehDihubungi(adminU, t))) === '[true,true,true,false]', 'bolehDihubungi: Pembina dan Admin menghubungi Penegak, Dewan, dan Pembina, bukan Admin');
  ok(JSON.stringify(semua.map((t) => bolehDihubungi(dewanU, t))) === '[true,true,false,false]', 'bolehDihubungi: Dewan Ambalan menghubungi Penegak dan sesama Dewan, bukan Pembina/Admin');
  ok(!bolehDihubungi({ role: 'peserta' }, semua[0]) && !bolehDihubungi(null, semua[0]) && !bolehDihubungi(pembinaU, { id: 'p', peran: 'Pembina' }), 'bolehDihubungi: Penegak biasa tidak, tanpa pengguna tidak, diri sendiri tidak');
  const us = [{ id: 'a', whatsapp: ' 08123456789 ' }, { id: 'b' }, { id: 'c', whatsapp: 'abc' }];
  ok(nomorWaAnggota(us, 'a') === '08123456789' && nomorWaAnggota(us, 'b') === '' && nomorWaAnggota(us, 'c') === '' && nomorWaAnggota(us, 'x') === '' && nomorWaAnggota(null, 'a') === '', 'nomorWaAnggota: hanya nomor sah, selain itu kosong');
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
  const idDari = async (username) => (await q('select id from public.profiles where username = $1', [username]))[0].id;
  const masuk = async (username) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(username, PIN_DEMO[username] ?? PIN_DEMO.penegak); return { k, a, id: r.id }; };
  const sebagai = async (uid, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, uid, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };

  const admin = await idDari('admin');
  const pembina = await idDari('pembina');
  const ahmad = await idDari('10231'); // Ahmad Fauzi, X-01 (dipakai sebagai target uji, jangan jabatan Dewan)
  ok((await q('select jabatan_dewan from public.profiles where id = $1', [ahmad]))[0].jabatan_dewan === null, 'prasyarat: 10231 bukan Dewan Ambalan (agar tidak ikut sebagai penerima pengurus)');

  const hariIni = (await q('select sigarda.hari_ini()::text d'))[0].d;
  // Jumat paling akhir <= hari ini, lalu mundur per minggu (perhitungan tanggal, bukan simulasi hari_ini()).
  const dow = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();
  const jumatKe = (n) => { const d = new Date(hariIni + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ((dow(hariIni) + 2) % 7) - n * 7); return d.toISOString().slice(0, 10); };
  const J = [0, 1, 2, 3, 4, 5].map(jumatKe); // J[0] = Jumat terbaru, J[1] seminggu sebelumnya, dst.

  for (const tgl of J) await q(`insert into public.absensi_sesi (tanggal) values ($1) on conflict do nothing`, [tgl]);
  const setHadir = async (peserta, tgl, status) =>
    q(`insert into public.absensi_hadir (tanggal, peserta_id, status) values ($1,$2,$3) on conflict (tanggal, peserta_id) do update set status = excluded.status`, [tgl, peserta, status]);
  const setIuran = async (peserta, tgl, ada) => {
    await q(`delete from public.iuran where tanggal = $1 and peserta_id = $2`, [tgl, peserta]);
    if (ada) await q(`insert into public.iuran (tanggal, peserta_id, jumlah) values ($1,$2,2000)`, [tgl, peserta]);
  };

  console.log('  - sigarda.eskalasi_mulai_sku');
  await q(`update public.sku_progress set diubah = now() - interval '20 days' where peserta_id = $1`, [ahmad]);
  await q(`update public.sku_riwayat set waktu = now() - interval '20 days' where peserta_id = $1`, [ahmad]);
  let mulai = (await q('select sigarda.eskalasi_mulai_sku($1)::text m', [ahmad]))[0].m;
  ok(mulai !== null, `20 hari tanpa aktivitas: kejadian aktif, mulai = ${mulai}`);
  let elapsed = Math.round((new Date(hariIni) - new Date(mulai)) / 86400000);
  ok(elapsed >= 8, `sudah 20 hari (mulai 13 hari lalu): tingkat mendesak (elapsed ${elapsed})`);
  await q(`update public.sku_progress set diubah = now() where peserta_id = $1`, [ahmad]);
  mulai = (await q('select sigarda.eskalasi_mulai_sku($1)::text m', [ahmad]))[0].m;
  ok(mulai === null, 'sesudah ada aktivitas baru: kejadian otomatis reset (dihitung ulang dari data, bukan status tersimpan)');
  await q(`update public.sku_progress set diubah = now() - interval '20 days' where peserta_id = $1`, [ahmad]); // dikembalikan untuk uji berikutnya

  console.log('  - sigarda.eskalasi_mulai_absensi');
  for (const tgl of J) await setHadir(ahmad, tgl, 'H'); // bersihkan dulu
  await setHadir(ahmad, J[0], 'A'); await setHadir(ahmad, J[1], 'A'); // 2 kali berturut-turut (terbaru)
  mulai = (await q('select sigarda.eskalasi_mulai_absensi($1)::text m', [ahmad]))[0].m;
  ok(mulai === J[0], `2 Alpa berturut-turut (J0,J1): mulai = tanggal ke-2 terbaru (J0=${J[0]}): dapat ${mulai}`);
  await setHadir(ahmad, J[0], 'I'); // izin: memutus beruntun sejak awal
  mulai = (await q('select sigarda.eskalasi_mulai_absensi($1)::text m', [ahmad]))[0].m;
  ok(mulai === null, 'Jumat terbaru izin (bukan Alpa): tidak ada kejadian, walau minggu sebelumnya Alpa');
  for (const tgl of J) await setHadir(ahmad, tgl, 'A'); // 6 minggu Alpa berturut-turut
  mulai = (await q('select sigarda.eskalasi_mulai_absensi($1)::text m', [ahmad]))[0].m;
  ok(mulai === J[4], `beruntun 6 Alpa (J0..J5): mulai = tanggal ke-2 TERTUA (J4=${J[4]}, bukan bergeser tiap minggu): dapat ${mulai}`);
  elapsed = Math.round((new Date(hariIni) - new Date(mulai)) / 86400000);
  ok(elapsed >= 8, `beruntun panjang: tingkat mendesak (elapsed ${elapsed})`);

  console.log('  - sigarda.eskalasi_mulai_iuran');
  for (const tgl of J) await setIuran(ahmad, tgl, true); // bersihkan (semua bayar)
  await setIuran(ahmad, J[0], false); await setIuran(ahmad, J[1], false); // 2 kali berturut-turut belum bayar
  mulai = (await q('select sigarda.eskalasi_mulai_iuran($1)::text m', [ahmad]))[0].m;
  ok(mulai === J[0], `2 kali belum bayar berturut-turut: mulai = ${mulai} (J0=${J[0]})`);
  await setIuran(ahmad, J[0], true);
  mulai = (await q('select sigarda.eskalasi_mulai_iuran($1)::text m', [ahmad]))[0].m;
  ok(mulai === null, 'Jumat terbaru sudah bayar: tidak ada kejadian walau minggu sebelumnya belum');

  console.log('  - sigarda.eskalasi_tingkat');
  ok((await q('select sigarda.eskalasi_tingkat(0) t'))[0].t === 1 && (await q('select sigarda.eskalasi_tingkat(3) t'))[0].t === 1, 'hari 0-3: tingkat 1 (ramah)');
  ok((await q('select sigarda.eskalasi_tingkat(4) t'))[0].t === 2 && (await q('select sigarda.eskalasi_tingkat(7) t'))[0].t === 2, 'hari 4-7: tingkat 2 (tegas)');
  ok((await q('select sigarda.eskalasi_tingkat(8) t'))[0].t === 3 && (await q('select sigarda.eskalasi_tingkat(30) t'))[0].t === 3, 'hari 8+: tingkat 3 (mendesak)');

  console.log('  - sigarda.eskalasi_proses + notifikasi (Ahmad: SKU 20 hari & absensi 6 Alpa -> mendesak; iuran sudah dibayar minggu ini -> tidak aktif)');
  await q(`delete from public.notifikasi`);
  const pengurusIds = (await q(`select id from public.profiles where status = 'aktif' and (role in ('penguji','admin') or (role = 'peserta' and jabatan_dewan is not null))`)).map((r) => r.id);
  ok(pengurusIds.length >= 2 && !pengurusIds.includes(ahmad), `daftar pengurus terkumpul (${pengurusIds.length} akun), tidak termasuk Ahmad sendiri`);
  await q('select sigarda.eskalasi_proses()');
  const notifAhmad = await q(`select jenis, judul, tautan, kunci from public.notifikasi where penerima_id = $1 and jenis = 'eskalasi'`, [ahmad]);
  ok(notifAhmad.some((n) => n.kunci.startsWith('eskalasi:sku:')) && notifAhmad.some((n) => n.kunci.startsWith('eskalasi:absensi:')), `Ahmad menerima pengingat SKU dan absensi (${notifAhmad.length} baris): ${JSON.stringify(notifAhmad.map((n) => n.kunci))}`);
  ok(!notifAhmad.some((n) => n.kunci.startsWith('eskalasi:iuran:')), 'Ahmad TIDAK menerima pengingat iuran (sudah dibayar minggu ini)');
  ok(notifAhmad.every((n) => n.tautan?.tab), 'setiap notifikasi punya tujuan tab');
  for (const pid of pengurusIds) {
    const np = await q(`select kunci from public.notifikasi where penerima_id = $1 and jenis = 'eskalasi' and kunci like 'eskalasi-p:%'`, [pid]);
    ok(np.length >= 1, `pengurus ${pid} ikut diberi tahu di tingkat mendesak (${np.length} baris)`);
  }
  const totalSebelum = (await q(`select count(*)::int n from public.notifikasi`))[0].n;
  await q('select sigarda.eskalasi_proses()');
  const totalSesudah = (await q(`select count(*)::int n from public.notifikasi`))[0].n;
  ok(totalSebelum === totalSesudah, `dijalankan lagi pada hari yang sama: tidak ada notifikasi ganda (${totalSebelum} = ${totalSesudah})`);

  console.log('  - sg_eskalasi_daftar (Pembina/Admin melihat, Penegak biasa ditolak)');
  const K = { admin: await masuk('admin'), pembina: await masuk('pembina'), ahmad: await masuk('10231') };
  let r = await K.pembina.a.muatEskalasi();
  ok(r.ok, `Pembina dapat memuat daftar tindak lanjut (${r.ok ? 'ok' : r.pesan})`);
  ok(r.data.some((x) => x.pesertaId === ahmad && x.jenis === 'sku') && r.data.some((x) => x.pesertaId === ahmad && x.jenis === 'absensi'), 'Ahmad muncul di daftar untuk SKU dan absensi: ' + JSON.stringify(r.data.filter((x) => x.pesertaId === ahmad)));
  ok(!r.data.some((x) => x.pesertaId === ahmad && x.jenis === 'iuran'), 'Ahmad TIDAK muncul untuk iuran (sudah dibayar)');
  r = await K.admin.a.muatEskalasi();
  ok(r.ok, 'Admin juga dapat memuat daftar tindak lanjut');
  r = await K.ahmad.a.muatEskalasi();
  ok(!r.ok, 'Penegak biasa DITOLAK memuat daftar tindak lanjut');

  console.log('  - sg_profil_whatsapp_atur (self-service, format-only)');
  r = await K.ahmad.a.simpanWhatsapp('08123456789');
  ok(r.ok, `Ahmad menyimpan nomor sendiri (${r.ok ? 'ok' : r.pesan})`);
  ok((await q('select whatsapp from public.profiles where id = $1', [ahmad]))[0].whatsapp === '08123456789', 'nomor tersimpan di profil');
  r = await K.ahmad.a.simpanWhatsapp('bukan-nomor');
  ok(!r.ok, 'format tidak sah ditolak: ' + r.pesan);
  r = await K.ahmad.a.simpanWhatsapp('');
  ok(r.ok && (await q('select whatsapp from public.profiles where id = $1', [ahmad]))[0].whatsapp === null, 'teks kosong mengosongkan nomor');
  const rLain = await sebagai(pembina, 'select public.sg_profil_whatsapp_atur($1)', ['08129999999']);
  ok(rLain.ok, 'fungsi hanya mengubah milik pemanggil sendiri (auth.uid()), tidak butuh id target -> selalu berhasil untuk diri sendiri');
  ok((await q('select whatsapp from public.profiles where id = $1', [pembina]))[0].whatsapp === '08129999999', 'Pembina mengubah nomornya sendiri, bukan milik Ahmad');

  await pg.close();
}

console.log(`\nRINGKASAN ESKALASI: ${lulus} lulus, ${gagal} GAGAL.`);
if (gagal) process.exit(1);
