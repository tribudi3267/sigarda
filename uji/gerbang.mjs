// Tahap 2 (G4): tanggal lahir dan aturan gerbang calon Garuda di server (PGlite): hak, validasi, koreksi, hapus, RLS baca (termasuk privasi antar-Penegak), tak aktif, cadangan.
// Logika klien: uji/gerbang-klien.mjs. Migrasi: uji/migrasi-gerbang.mjs.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { GERBANG_BAWAAN } from '../src/lib/gerbangLogic.js';

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
const N = {}; for (const nis of ['10231', '10232']) N[nis] = await masuk(nis, PIN_DEMO.penegak);
const [ahmad, siti] = ['10231', '10232'].map((n) => N[n].id);
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const cocok = (r, re) => !r.ok && re.test(r.pesan ?? '');
const hari = (await q('select sigarda.hari_ini()::text d'))[0].d;
const geser = async (n) => (await q(`select (sigarda.hari_ini() + $1::int)::text d`, [n]))[0].d;
const lahir = (id, pid, tgl) => sebagai(id, 'select public.sg_tanggal_lahir_atur($1::uuid, $2::date)', [pid, tgl]);
const aturan = (id, nilai) => sebagai(id, 'select public.sg_gerbang_simpan($1::jsonb)', [JSON.stringify(nilai)]);
const baris = () => q('select p.username, t.tanggal::text from public.tanggal_lahir t join public.profiles p on p.id = t.peserta_id order by 1');

console.log('--- Bawaan ---');
{
  const b = (await q(`select nilai from public.pengaturan where kunci = 'garuda.gerbang'`))[0]?.nilai;
  ok(JSON.stringify(b) === JSON.stringify(GERBANG_BAWAAN) || (b.kelasMin === GERBANG_BAWAAN.kelasMin && b.lahirDari === GERBANG_BAWAAN.lahirDari && b.lahirSampai === GERBANG_BAWAAN.lahirSampai && b.kuotaPersen === GERBANG_BAWAAN.kuotaPersen), 'aturan gerbang bawaan di basis data = GERBANG_BAWAAN di klien');
}

console.log('\n--- Tanggal lahir: hak dan validasi ---');
let r = await lahir(siti, siti, '2008-03-01');
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'Penegak tidak dapat mengisi tanggal lahir (termasuk miliknya)');
r = await lahir(K.dewan.id, siti, '2008-03-01');
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'akun Dewan lama tidak dapat mengisi tanggal lahir');
r = await lahir(K.pembina.id, K.pembina.id, '2008-03-01');
ok(cocok(r, /Pilih Penegak/), 'hanya untuk Penegak');
r = await lahir(K.pembina.id, siti, '1989-12-31');
ok(cocok(r, /sebelum tahun 1990/), 'sebelum tahun 1990 ditolak');
r = await lahir(K.pembina.id, siti, await geser(1));
ok(cocok(r, /masa depan/), 'masa depan ditolak');
ok((await baris()).length === 0, 'tidak ada baris tercatat oleh isian yang ditolak');
r = await lahir(K.pembina.id, siti, '2008-03-01');
ok(r.ok, 'Pembina mengisi tanggal lahir Siti ' + (r.pesan ?? ''));
r = await lahir(K.admin.id, ahmad, '2007-12-15');
ok(r.ok, 'Admin mengisi tanggal lahir Ahmad');
r = await lahir(K.admin.id, siti, '2008-04-02');
ok(r.ok && (await baris()).length === 2 && (await baris()).find((x) => x.username === '10232').tanggal === '2008-04-02', 'mengisi ulang = koreksi (jumlah baris tetap)');
ok((await q(`select dicatat_oleh = $1 as o from public.tanggal_lahir where peserta_id = $2`, [K.admin.id, siti]))[0].o, 'pencatat terakhir tersimpan');

console.log('\n--- RLS baca dan privasi ---');
r = await sebagai(siti, 'select p.username from public.tanggal_lahir t join public.profiles p on p.id = t.peserta_id');
ok(r.ok && r.rows.length === 1 && r.rows[0].username === '10232', 'Penegak hanya membaca tanggal lahir miliknya (tidak milik Penegak lain)');
r = await sebagai(K.pembina.id, 'select 1 from public.tanggal_lahir');
ok(r.ok && r.rows.length === 2, 'Pembina membaca semua');
r = await sebagai(K.dewan.id, 'select 1 from public.tanggal_lahir');
ok(r.ok && r.rows.length === 2, 'Dewan (pengurus) membaca semua');
r = await sebagai(siti, `insert into public.tanggal_lahir (peserta_id, tanggal) values ($1, '2008-01-01') on conflict (peserta_id) do update set tanggal = excluded.tanggal`, [siti]);
ok(!r.ok, 'Penegak tidak dapat menulis langsung ke tabel');
r = await sebagai(siti, `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name ilike '%lahir%'`);
ok(r.ok && r.rows.length === 0, 'tanggal lahir tidak ada di tabel profiles (yang terbaca semua Penegak berjabatan)');
r = await N['10232'].a.muatGerbang(GERBANG_BAWAAN);
ok(r.ok && r.data.lahir.length === 1 && r.data.lahir[0].pesertaId === siti && r.data.lahir[0].tanggal === '2008-04-02' && r.data.aturan.kuotaPersen === 5, 'api().muatGerbang memetakan tanggal lahir (Penegak: miliknya) dan aturan');

console.log('\n--- Menghapus tanggal lahir ---');
r = await lahir(K.pembina.id, ahmad, null);
ok(r.ok && (await baris()).length === 1, 'tanggal kosong = catatan dihapus');
r = await lahir(K.pembina.id, ahmad, null);
ok(r.ok, 'menghapus yang sudah tidak ada tidak galat');

console.log('\n--- Aturan gerbang ---');
const sah = { kelasMin: 'XII', lahirDari: '2007-01-01', lahirSampai: '2009-12-31', kuotaPersen: 8 };
r = await aturan(siti, sah);
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'Penegak tidak dapat mengubah aturan');
r = await aturan(K.dewan.id, sah);
ok(cocok(r, /Hanya Pembina dan Admin Gudep/), 'akun Dewan lama tidak dapat mengubah aturan');
r = await aturan(K.pembina.id, { ...sah, kelasMin: 'IX' });
ok(cocok(r, /Kelas minimal harus X, XI, atau XII/), 'kelas minimal harus X, XI, atau XII');
r = await aturan(K.pembina.id, { ...sah, lahirDari: '2007-1-1' });
ok(cocok(r, /berbentuk TTTT-BB-HH/), 'bentuk tanggal harus TTTT-BB-HH');
r = await aturan(K.pembina.id, { ...sah, lahirSampai: '2009-02-30' });
ok(cocok(r, /Tanggal lahir tidak sah/), 'tanggal yang tidak ada di kalender ditolak');
r = await aturan(K.pembina.id, { ...sah, lahirDari: '1980-01-01' });
ok(cocok(r, /antara tahun 1990 dan 2030/), 'rentang di luar 1990-2030 ditolak');
r = await aturan(K.pembina.id, { ...sah, lahirDari: '2010-01-01' });
ok(cocok(r, /awal tidak boleh sesudah/), 'awal sesudah akhir ditolak');
r = await aturan(K.pembina.id, { ...sah, kuotaPersen: 101 });
ok(cocok(r, /Kuota harus bilangan bulat/), 'kuota di atas 100 ditolak');
r = await aturan(K.pembina.id, { ...sah, kuotaPersen: 2.5 });
ok(cocok(r, /Kuota harus bilangan bulat/), 'kuota pecahan ditolak');
r = await aturan(K.pembina.id, { kelasMin: 'XI' });
ok(cocok(r, /Bentuk aturan gerbang tidak sah/), 'kunci yang hilang ditolak (bukan galat basis data)');
r = await aturan(K.pembina.id, { ...sah, lain: 1 });
ok(cocok(r, /Bentuk aturan gerbang tidak sah/), 'kunci tambahan ditolak');
ok((await q(`select nilai from public.pengaturan where kunci = 'garuda.gerbang'`))[0].nilai.kuotaPersen === 5, 'aturan tidak berubah oleh isian yang ditolak');
r = await aturan(K.pembina.id, sah);
ok(r.ok, 'Pembina menyimpan aturan ' + (r.pesan ?? ''));
r = await aturan(K.admin.id, { ...sah, kuotaPersen: 0 });
ok(r.ok, 'Admin menyimpan aturan (kuota 0 sah)');
r = await K.pembina.a.muatGerbang(GERBANG_BAWAAN);
ok(r.ok && r.data.aturan.kelasMin === 'XII' && r.data.aturan.kuotaPersen === 0 && r.data.aturan.lahirDari === '2007-01-01', 'api().muatGerbang membaca aturan yang diubah');
r = await K.pembina.a.simpanGerbang(GERBANG_BAWAAN);
ok(r.ok, 'api().simpanGerbang mengembalikan aturan bawaan');

console.log('\n--- Penegak tidak aktif dan cadangan ---');
r = await sebagai(K.pembina.id, `select public.sg_anggota_status_atur($1, 'nonaktif', 'tidak melanjutkan', null)`, [siti]);
ok(r.ok, 'Siti dinonaktifkan');
r = await lahir(K.pembina.id, siti, '2008-05-05');
ok(cocok(r, /tidak aktif/), 'tanggal lahir untuk Penegak nonaktif ditolak');
try { await q(`update public.tanggal_lahir set tanggal = '2008-06-06' where peserta_id = $1`, [siti]); ok(false, 'pemicu menolak ubahan langsung pada Penegak nonaktif'); }
catch (e) { ok(/tidak aktif|nonaktif|alumni/i.test(e.message), 'pemicu tolak_peserta_tak_aktif menolak ubahan langsung pada Penegak nonaktif'); }
r = await sebagai(K.admin.id, 'select public.sg_cadangan_admin() as d');
const cad = r.rows?.[0]?.d;
ok(r.ok && Array.isArray((cad.data ?? cad.tabel ?? cad).tanggal_lahir) && (cad.data ?? cad.tabel ?? cad).tanggal_lahir.length === 1, 'cadangan data memuat tanggal_lahir');

console.log(`\nRINGKASAN GERBANG: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
