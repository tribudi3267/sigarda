// Pemeriksaan Data: JUMLAH SEBENARNYA untuk daftar yang terpotong di 300 baris (temuan simulasi beban 26 September 2026). Server (PGlite, data sekolah penuh 700 Penegak) dan
// klien (pemeriksaanLogic.jumlahKategori). Migrasi: uji/migrasi-pemeriksaan-jumlah.mjs.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { isiSekolahPenuh } from '../src/lokal/sekolahPenuh.js';
import { barisDikirim, jumlahKategori, totalMasalah } from '../src/lib/pemeriksaanLogic.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

console.log('--- Klien: jumlahKategori ---');
{
  const h = { a: [1, 2, 3], b: [], jumlahSebenarnya: { a: 10, b: 0, c: 5 } };
  ok(jumlahKategori(h, 'a') === 10 && barisDikirim(h, 'a') === 3, 'memakai jumlah sebenarnya bila lebih besar dari baris yang dikirim');
  ok(jumlahKategori(h, 'b') === 0 && jumlahKategori(h, 'c') === 0, 'kategori kosong atau tanpa daftar = 0 (jumlah tanpa daftar tidak dipercaya)');
  ok(jumlahKategori({ a: [1, 2] }, 'a') === 2 && jumlahKategori({ a: [1, 2], jumlahSebenarnya: { a: 1 } }, 'a') === 2 && jumlahKategori({ a: [1], jumlahSebenarnya: { a: 'x' } }, 'a') === 1, 'tanpa jumlahSebenarnya, lebih kecil, atau bukan angka: jumlah baris');
  ok(jumlahKategori(null, 'a') === 0 && jumlahKategori({ a: 'bukan daftar' }, 'a') === 0, 'hasil kosong atau rusak = 0');
  ok(totalMasalah({ kelasLama: Array(300).fill(1), jumlahSebenarnya: { kelasLama: 700 } }) === 700, 'totalMasalah memakai jumlah sebenarnya');
}

console.log('\n--- Server: data sekolah penuh ---');
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const periksa = async () => { const r = await sebagai(pembinaId, 'select public.sg_pemeriksaan_data() as d'); if (!r.ok) throw new Error(r.pesan); return r.rows[0].d; };
const pembinaId = (await q(`select id from public.profiles where username = 'pembina'`))[0].id;

let d = await periksa();
ok(d.jumlahSebenarnya && ['kelasLama', 'tanpaNta', 'tanpaJk', 'dataDiriBelum', 'belumPernahMasuk'].every((k) => Number.isInteger(d.jumlahSebenarnya[k])) && Object.keys(d.jumlahSebenarnya).length === 5, 'hasil memuat jumlahSebenarnya untuk lima daftar yang dapat terpotong');
ok(['kelasLama', 'tanpaNta', 'tanpaJk', 'dataDiriBelum', 'belumPernahMasuk'].every((k) => d.jumlahSebenarnya[k] === d[k].length), 'data contoh kecil (di bawah 300): jumlah sebenarnya = jumlah baris');

await isiSekolahPenuh(pg, { penegak: 700, alumni: 150, pembina: 3 });
await q(`update public.profiles set nta = null where role = 'peserta'`);
d = await periksa();
const nyata = async (sql) => Number((await q(sql))[0].n);
const nNta = await nyata(`select count(*)::int n from public.profiles where role = 'peserta' and status = 'aktif' and (nta is null or btrim(nta) = '')`);
const nDiri = await nyata(`select count(*)::int n from public.profiles p where p.role = 'peserta' and p.status = 'aktif' and (
  p.whatsapp is null or btrim(p.whatsapp) = '' or p.jenis_kelamin is null or p.agama is null or not exists (select 1 from public.tanggal_lahir t where t.peserta_id = p.id)
  or not exists (select 1 from public.penegak_isian i where i.peserta_id = p.id and i.kunci = 'tempat_lahir') or not exists (select 1 from public.penegak_isian i where i.peserta_id = p.id and i.kunci = 'alamat')
  or not exists (select 1 from public.penegak_isian i where i.peserta_id = p.id and i.kunci in ('ayah_nama', 'ibu_nama', 'wali_nama')))`);
ok(nNta > 300 && d.tanpaNta.length === 300 && d.jumlahSebenarnya.tanpaNta === nNta, `tanpaNta: 300 baris dikirim, jumlah sebenarnya ${d.jumlahSebenarnya.tanpaNta} = ${nNta}`);
ok(nDiri > 300 && d.dataDiriBelum.length === 300 && d.jumlahSebenarnya.dataDiriBelum === nDiri, `dataDiriBelum: 300 baris dikirim, jumlah sebenarnya ${d.jumlahSebenarnya.dataDiriBelum} = ${nDiri}`);
ok(jumlahKategori(d, 'tanpaNta') === nNta && barisDikirim(d, 'tanpaNta') === 300, 'klien membaca jumlah sebenarnya dan tahu daftarnya terpotong');
ok(d.jumlahSebenarnya.kelasLama === d.kelasLama.length && d.jumlahSebenarnya.tanpaJk === d.tanpaJk.length, 'daftar yang tidak penuh: jumlah sebenarnya = jumlah baris');

// mengisi sebagian: daftar menyusut di bawah 300 dan jumlah kembali = jumlah baris
await q(`update public.profiles set nta = '11.03.10.701.' || right(username, 5) where id in (select id from public.profiles where role = 'peserta' and status = 'aktif' order by username limit $1)`, [nNta - 250]);
d = await periksa();
ok(d.tanpaNta.length === 250 && d.jumlahSebenarnya.tanpaNta === 250, 'sesudah diisi sampai 250: tanpa pemotongan, jumlah sebenarnya = 250');

const hak = await sebagai((await q(`select id from public.profiles where username = '10231'`))[0].id, 'select public.sg_pemeriksaan_data()');
ok(!hak.ok && /Hanya pengurus/.test(hak.pesan), 'Penegak tetap tidak dapat melihat pemeriksaan data');

console.log(`\nRINGKASAN PEMERIKSAAN-JUMLAH: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
