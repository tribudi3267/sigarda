// Tahap 2 (G3): penetapan Syarat Pramuka Garuda (SPG) di server (PGlite): hak, validasi, Penegak yang belum layak, koreksi, hapus, RLS baca, tak aktif, dan cadangan.
// Logika klien: uji/spg-klien.mjs. Migrasi: uji/migrasi-spg.mjs.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const K = { admin: await masuk('admin', PIN_DEMO.admin), pembina: await masuk('pembina', PIN_DEMO.pembina), dewan: await masuk('dewan', PIN_DEMO.dewan) };
const NIS = ['10231', '10232', '10118'];
const N = {}; for (const nis of NIS) N[nis] = await masuk(nis, PIN_DEMO.penegak);
const [ahmad, siti, dimas] = NIS.map((n) => N[n].id);
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const cocok = (r, re) => !r.ok && re.test(r.pesan ?? '');
const hari = (await q('select sigarda.hari_ini()::text d'))[0].d;
const geser = async (n) => (await q(`select (sigarda.hari_ini() + $1::int)::text d`, [n]))[0].d;
const tulisSku = (pid, tingkat) => q(
  `insert into public.sku_progress (peserta_id, sku_id, status) select p.id, u.id, 'lulus' from public.profiles p join public.sku_unit u on u.tingkat = $2 and (u.agama is null or u.agama = p.agama)
   where p.id = $1 on conflict (peserta_id, sku_id) do update set status = 'lulus'`, [pid, tingkat]);
const tetapkan = (id, pid, butir, nilai, tgl, cat = '', timpa = false) =>
  sebagai(id, 'select public.sg_spg_catat($1::uuid, $2::int, $3::int, $4::date, $5, $6::boolean)', [pid, butir, nilai, tgl, cat, timpa]);
const baris = () => q('select p.username, s.butir, s.nilai, s.tanggal::text, s.catatan, s.timpa from public.spg_penetapan s join public.profiles p on p.id = s.peserta_id order by p.username, s.butir');

console.log('--- Persiapan: Siti layak Garuda (SKU Bantara dan Laksana lulus); Ahmad belum ---');
await q('delete from public.sku_progress where peserta_id = any($1::uuid[])', [[ahmad, siti, dimas]]);
await tulisSku(siti, 'Bantara'); await tulisSku(siti, 'Laksana');
await tulisSku(dimas, 'Bantara'); await tulisSku(dimas, 'Laksana');
const tglLalu = await geser(-10), tglDepan = await geser(3);

console.log('\n--- Hak ---');
let r = await tetapkan(siti, siti, 1, 100, tglLalu);
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'Penegak tidak dapat menetapkan SPG (termasuk miliknya)');
r = await tetapkan(K.dewan.id, siti, 1, 100, tglLalu);
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'akun Dewan lama tidak dapat menetapkan SPG');
r = await sebagai(K.pembina.id, 'select public.sg_spg_hapus($1::uuid, 1)', [siti]);
ok(cocok(r, /tidak ditemukan/), 'hapus penetapan yang belum ada: pesan jelas');

console.log('\n--- Penegaknya ---');
r = await tetapkan(K.pembina.id, K.pembina.id, 1, 100, tglLalu);
ok(cocok(r, /Pilih Penegak/), 'hanya untuk Penegak');
r = await tetapkan(K.pembina.id, ahmad, 1, 100, tglLalu);
ok(cocok(r, /belum menyelesaikan seluruh SKU Bantara dan Laksana/), 'Penegak yang belum layak Garuda ditolak (nama tampil)');
ok((await baris()).length === 0, 'tidak ada baris tercatat oleh percobaan yang ditolak');

console.log('\n--- Validasi isian ---');
r = await tetapkan(K.pembina.id, siti, 0, 100, tglLalu);
ok(cocok(r, /Butir SPG harus 1 sampai 13/), 'butir 0 ditolak');
r = await tetapkan(K.pembina.id, siti, 14, 100, tglLalu);
ok(cocok(r, /Butir SPG harus 1 sampai 13/), 'butir 14 ditolak');
r = await tetapkan(K.pembina.id, siti, 1, 75, tglLalu);
ok(cocok(r, /Nilai harus 100/), 'nilai selain 100 atau 0 ditolak (tidak ada pita nilai di aplikasi)');
r = await tetapkan(K.pembina.id, siti, 1, 100, null);
ok(cocok(r, /Tanggal pengujian wajib/), 'tanggal wajib');
r = await tetapkan(K.pembina.id, siti, 1, 100, tglDepan);
ok(cocok(r, /masa depan/), 'tanggal masa depan ditolak');
r = await tetapkan(K.pembina.id, siti, 1, 100, '1999-01-01');
ok(cocok(r, /sebelum tahun 2000/), 'tanggal sebelum tahun 2000 ditolak');
r = await tetapkan(K.pembina.id, siti, 1, 100, tglLalu, 'catatan <b>');
ok(cocok(r, /Catatan maksimal 200/), 'catatan tanpa tanda < atau >');
r = await tetapkan(K.pembina.id, siti, 1, 100, tglLalu, 'x'.repeat(201));
ok(cocok(r, /Catatan maksimal 200/), 'catatan maksimal 200 karakter');
r = await tetapkan(K.pembina.id, siti, 4, 100, tglLalu, 'baik', true);
ok(cocok(r, /tulis alasannya/), 'menimpa hasil aplikasi tanpa alasan cukup (kurang dari 5 karakter) ditolak');
r = await tetapkan(K.pembina.id, siti, 4, 100, tglLalu, '', true);
ok(cocok(r, /tulis alasannya/), 'menimpa hasil aplikasi tanpa catatan ditolak');
ok((await baris()).length === 0, 'tidak ada baris tercatat oleh isian yang ditolak');

console.log('\n--- Menetapkan, koreksi, dan hapus ---');
r = await tetapkan(K.pembina.id, siti, 1, 100, tglLalu, 'Uji lisan di ruang Pembina');
ok(r.ok, 'Pembina menetapkan butir 1 = 100 ' + (r.pesan ?? ''));
r = await tetapkan(K.admin.id, siti, 4, 100, tglLalu, 'Sertifikat TKK dari Kwarcab diakui', true);
ok(r.ok, 'Admin menimpa butir 4 dengan alasan');
let b = await baris();
ok(b.length === 2 && b[0].butir === 1 && b[0].nilai === 100 && b[0].catatan === 'Uji lisan di ruang Pembina' && !b[0].timpa && b[1].butir === 4 && b[1].timpa, 'baris tersimpan lengkap (timpa hanya pada butir 4)');
r = await tetapkan(K.pembina.id, siti, 1, 0, hari, '  Dokumen kurang   lengkap ');
ok(r.ok, 'menetapkan ulang butir yang sama = koreksi');
b = await baris();
ok(b.length === 2 && b[0].nilai === 0 && b[0].tanggal === hari && b[0].catatan === 'Dokumen kurang lengkap', 'koreksi mengganti nilai, tanggal, dan catatan (spasi dirapikan), jumlah baris tetap');
ok((await q(`select dicatat_oleh = $1 as oleh from public.spg_penetapan where butir = 1`, [K.pembina.id]))[0].oleh, 'pencatat terakhir tersimpan');
r = await sebagai(K.pembina.id, 'select public.sg_spg_hapus($1::uuid, 4)', [siti]);
ok(r.ok && (await baris()).length === 1, 'Pembina menghapus penetapan butir 4');
r = await sebagai(siti, 'select public.sg_spg_hapus($1::uuid, 1)', [siti]);
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'Penegak tidak dapat menghapus');

console.log('\n--- RLS baca ---');
await tetapkan(K.pembina.id, dimas, 2, 100, tglLalu);
r = await sebagai(siti, 'select p.username from public.spg_penetapan s join public.profiles p on p.id = s.peserta_id');
ok(r.ok && r.rows.length === 1 && r.rows[0].username === '10232', 'Penegak hanya membaca penetapan miliknya');
r = await sebagai(K.pembina.id, 'select 1 from public.spg_penetapan');
ok(r.ok && r.rows.length === 2, 'Pembina membaca semua');
r = await sebagai(K.dewan.id, 'select 1 from public.spg_penetapan');
ok(r.ok && r.rows.length === 2, 'Dewan (pengurus) membaca semua');
r = await sebagai(siti, `insert into public.spg_penetapan (peserta_id, butir, nilai, tanggal) values ($1, 3, 100, current_date)`, [siti]);
ok(!r.ok, 'Penegak tidak dapat menulis langsung ke tabel');
r = await sebagai(K.pembina.id, `update public.spg_penetapan set nilai = 0`);
ok(!r.ok || r.rows.length === 0, 'Pembina pun tidak dapat menulis langsung (hanya lewat fungsi)');
r = await N['10232'].a.muatSpg();
ok(r.ok && r.data.length === 1 && r.data[0].butir === 1 && r.data[0].nilai === 0 && r.data[0].pesertaId === siti, 'api().muatSpg memetakan baris (Penegak: miliknya)');
r = await K.pembina.a.catatSpg({ pesertaId: siti, butir: 5, nilai: 100, tanggal: tglLalu, catatan: 'Piagam Kwarran' });
ok(r.ok, 'api().catatSpg');
r = await K.pembina.a.hapusSpg(siti, 5);
ok(r.ok, 'api().hapusSpg');

console.log('\n--- Penegak tidak aktif dan cadangan ---');
r = await sebagai(K.pembina.id, `select public.sg_anggota_status_atur($1, 'nonaktif', 'tidak melanjutkan', null)`, [siti]);
ok(r.ok, 'Siti dinonaktifkan');
r = await tetapkan(K.pembina.id, siti, 6, 100, tglLalu);
ok(cocok(r, /tidak aktif/), 'penetapan untuk Penegak nonaktif ditolak');
try { await q(`update public.spg_penetapan set catatan = 'ubah' where peserta_id = $1`, [siti]); ok(false, 'pemicu menolak ubahan langsung pada Penegak nonaktif'); }
catch (e) { ok(/tidak aktif|nonaktif|alumni/i.test(e.message), 'pemicu tolak_peserta_tak_aktif menolak ubahan langsung pada Penegak nonaktif'); }
r = await sebagai(K.admin.id, 'select public.sg_cadangan_admin() as d');
const cad = r.rows?.[0]?.d;
ok(r.ok && Array.isArray((cad.data ?? cad.tabel ?? cad).spg_penetapan) && (cad.data ?? cad.tabel ?? cad).spg_penetapan.length === 2, 'cadangan data memuat spg_penetapan');

console.log(`\nRINGKASAN SPG: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
