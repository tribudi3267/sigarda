import { PGlite } from '@electric-sql/pglite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { isiInstrumenContoh } from '../src/lokal/instrumenContoh.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { susunInstrumenXlsx, susunIuranXlsx } from '../src/lib/exportLaporan.js';
import { buatBufferXlsx } from '../src/lib/exportXlsx.js';
import { daftarUnitInstrumen, periksaInstrumen } from '../src/lib/instrumenLogic.js';
import { PENGATURAN_IURAN_BAWAAN, gabungPengaturanIuran, periksaPengaturanIuran, saranNilaiIuran, rekapPeserta, ringkasAgregat } from '../src/lib/iuranLogic.js';
import { INDEKS_POIN, hurufSub } from '../src/data/skuData.js';
import ExcelJS from 'exceljs';

const P = process.cwd().replace(/\\/g, '/');
const SP = `${P}/.uji/tmp`;
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const baru = async () => {
  const pg = new PGlite();
  await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^\uFEFF/, '') });
  await isiDataContoh(pg); await isiInstrumenContoh(pg);
  await pg.query('update public.profiles set wajib_ganti_pin = false');
  return pg;
};
const q = async (db, sql, p = []) => (await db.query(sql, p)).rows;
const pg = await baru();
const pembina = buatApi(buatKlienFake(pg)); await pembina.masuk('pembina', PIN_DEMO.pembina);
const admin = buatApi(buatKlienFake(pg)); await admin.masuk('admin', PIN_DEMO.admin);
const dewan = buatApi(buatKlienFake(pg)); await dewan.masuk('dewan', PIN_DEMO.dewan);

console.log('--- periksaInstrumen: sumber nilai ---');
const dasar = { caraUji: '', instruksi: '', status: 'draf' };
const kr = (sumber) => ({ jenis: 'Lisan', teks: 'a', bobot: 1, wajib: false, panduan: '', ...(sumber === undefined ? {} : { sumber }) });
ok(periksaInstrumen({ ...dasar, kriteria: [kr()] }) === '', 'tanpa sumber: sah (kompatibel dengan data lama)');
ok(periksaInstrumen({ ...dasar, kriteria: [kr('manual'), kr('iuran')] }) === '', 'manual + satu iuran: sah');
ok(/satu kriteria/.test(periksaInstrumen({ ...dasar, kriteria: [kr('iuran'), kr('iuran')] })), 'dua iuran ditolak');
ok(/tidak dikenal/.test(periksaInstrumen({ ...dasar, kriteria: [kr('lain')] })), 'sumber asing ditolak');

console.log('--- pengaturan iuran ---');
ok(periksaPengaturanIuran(PENGATURAN_IURAN_BAWAAN) === '', 'pengaturan bawaan sah');
ok(periksaPengaturanIuran({ ...PENGATURAN_IURAN_BAWAAN, standar: 750 }) !== '', 'standar bukan kelipatan 500 ditolak');
ok(periksaPengaturanIuran({ ...PENGATURAN_IURAN_BAWAAN, tiga: 80 }) !== '', 'urutan batas salah ditolak');
ok(periksaPengaturanIuran({ ...PENGATURAN_IURAN_BAWAAN, ambang: NaN }) !== '', 'isian kosong/bukan angka ditolak');
ok(saranNilaiIuran(70, { ...PENGATURAN_IURAN_BAWAAN, ambang: 70, lima: 95 }) === 4 && saranNilaiIuran(70) === 3, 'ambang yang diubah memengaruhi saran (70% = 4 bila ambang 70, 3 bila bawaan)');
let r = await admin.simpanPengaturanIuran({ standar: 1500, ambang: 70, lima: 95, tiga: 60, dua: 40 });
ok(r.ok, 'Admin menyimpan pengaturan: ' + (r.pesan ?? ''));
let m = await pembina.muatPengaturanIuran();
const g = gabungPengaturanIuran(m.data);
ok(m.ok && g.standar === 1500 && g.ambang === 70 && g.lima === 95 && g.tiga === 60 && g.dua === 40, 'pengaturan termuat dan tergabung');
r = await dewan.simpanPengaturanIuran({ standar: 1000, ambang: 75, lima: 90, tiga: 65, dua: 50 });
ok(!r.ok, 'Dewan Ambalan tidak boleh mengubah pengaturan: ' + (r.pesan ?? '').slice(0, 60));
r = await pembina.simpanPengaturanIuran({ ...PENGATURAN_IURAN_BAWAAN }); ok(r.ok, 'Pembina mengembalikan ke bawaan');

console.log('--- ekspor Excel rekap iuran memakai ambang dari pengaturan ---');
const sesi = ['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25'].map((tanggal) => ({ tanggal }));
const iuran = { '2026-09-04': { a: { jumlah: 1000, jenis: 'rutin' } }, '2026-09-11': { a: { jumlah: 1000, jenis: 'rutin' } }, '2026-09-18': { a: { jumlah: 1000, jenis: 'rutin' } } };
const rk = rekapPeserta(iuran, [{ id: 'a', nama: 'A' }], sesi);
const ring = ringkasAgregat([], sesi);
const kirim = (ambang) => susunIuranXlsx({ tahunAjaran: '2026/2027', periode: 'ganjil', rekap: rk, sesi, ring, filter: {}, ...(ambang ? { ambang } : {}) });
const s75 = kirim(), s80 = kirim(80);
ok(s75[0].baris[0].ket === 'Memenuhi 75%', 'bawaan: 75% memenuhi ambang 75');
ok(s80[0].baris[0].ket === 'Di bawah 80%' && s80[0].warna(s80[0].baris[0], 'persen') !== undefined, 'ambang 80: 75% di bawah dan ditandai');
ok(s80.at(-1).baris.some((b) => /Ambang rutin 80%/.test(b.a)), 'lembar keterangan menyebut ambang yang dipakai');

console.log('--- ekspor instrumen: kolom Sumber nilai + putaran balik ke SQL ---');
const UNIT = daftarUnitInstrumen(INDEKS_POIN, hurufSub);
const kriteriaBaru = (sumber) => [
  { jenis: 'Lisan', teks: 'Menjelaskan manfaat iuran', bobot: 1, wajib: false, panduan: 'Tanya jawab', sumber: 'manual' },
  { jenis: 'Bukti kegiatan', teks: 'Setia membayar iuran secara rutin', bobot: 2, wajib: true, panduan: 'Lihat rekap iuran', sumber },
];
r = await pembina.simpanInstrumen({ skuId: 'BAN-06', caraUji: 'Lisan dan catatan', instruksi: 'x', status: 'draf', kriteria: kriteriaBaru('iuran') });
ok(r.ok, 'BAN-06 dengan kriteria iuran disimpan: ' + (r.pesan ?? ''));
const ins = (await pembina.muatInstrumen()).data;
const ex = susunInstrumenXlsx({ unit: UNIT, instrumen: ins });
const sh = ex.sheets[0];
ok(sh.kolom.some((k) => k.key === 'sumber' && /Sumber nilai/.test(k.header)), 'kolom "Sumber nilai" ada');
const barisSumber = sh.baris.filter((b) => b.kode === 'BAN-06').map((b) => b.sumber);
ok(barisSumber.join() === 'manual,iuran', 'BAN-06: sumber terekspor (manual, iuran)');
ok(sh.baris.filter((b) => b.kode !== 'BAN-06').every((b) => b.sumber === 'manual'), 'butir lain: manual');

const dir = `${SP}/tmp-iuran-d`; mkdirSync(dir, { recursive: true });
const xlsx = `${dir}/ekspor.xlsx`; writeFileSync(xlsx, Buffer.from(await buatBufferXlsx(ex.sheets)));
const keluar = `${dir}/hasil.sql`;
const run = spawnSync('node', [`${P}/scripts/instrumen-ke-sql.mjs`, keluar, xlsx, '--mode=timpa-semua'], { cwd: P, encoding: 'utf8' });
ok(run.status === 0, 'skrip menerima berkas ekspor: ' + (run.stdout + run.stderr).trim().split('\n')[0]);
const sql = readFileSync(keluar, 'utf8');
ok(/, sumber\) values \('BAN-06'/.test(sql) && (sql.match(/, sumber\)/g) || []).length === 1, 'SQL menyebut kolom sumber hanya untuk kriteria iuran (satu kali)');
const pg2 = await baru();
await pg2.exec(sql);
const sumber = (await q(pg2, `select sumber from public.instrumen_kriteria where sku_id = 'BAN-06' order by urutan`)).map((x) => x.sumber);
ok(sumber.join() === 'manual,iuran', 'putaran balik: sumber kembali utuh di basis data: ' + sumber.join());

// tanpa kriteria iuran, SQL tidak menyebut kolom sumber (aman untuk basis data yang belum dimigrasi)
const tanpa = { ...ins, 'BAN-06': { ...ins['BAN-06'], kriteria: ins['BAN-06'].kriteria.map((k) => ({ ...k, sumber: 'manual' })) } };
const xlsx2 = `${dir}/tanpa.xlsx`; writeFileSync(xlsx2, Buffer.from(await buatBufferXlsx(susunInstrumenXlsx({ unit: UNIT, instrumen: tanpa }).sheets)));
const run2 = spawnSync('node', [`${P}/scripts/instrumen-ke-sql.mjs`, `${dir}/tanpa.sql`, xlsx2, '--mode=timpa-semua'], { cwd: P, encoding: 'utf8' });
ok(run2.status === 0 && !/sumber/.test(readFileSync(`${dir}/tanpa.sql`, 'utf8').replace(/-- .*\n/g, '')), 'tanpa kriteria iuran: SQL tidak menyebut kolom sumber');

// sumber iuran pada butir selain BAN-06/LAK-06 ditolak skrip
const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(xlsx);
const ws = wb.worksheets[0];
let kepala = 0, kolomSumber = 0;
ws.eachRow((row, n) => { if (!kepala && String(row.getCell(1).value) === 'Kode unit') { kepala = n; row.eachCell((c, i) => { if (/Sumber nilai/.test(String(c.value))) kolomSumber = i; }); } });
let diubah = false;
ws.eachRow((row, n) => { if (n > kepala && !diubah && String(row.getCell(1).value) === 'BAN-02') { row.getCell(kolomSumber).value = 'iuran'; diubah = true; } });
const xlsx3 = `${dir}/salah.xlsx`; await wb.xlsx.writeFile(xlsx3);
const run3 = spawnSync('node', [`${P}/scripts/instrumen-ke-sql.mjs`, `${dir}/salah.sql`, xlsx3, '--mode=timpa-semua'], { cwd: P, encoding: 'utf8' });
ok(run3.status !== 0 && /Bantara 6 dan Laksana 6/.test(run3.stdout + run3.stderr), 'sumber iuran pada butir lain ditolak skrip');

console.log(`\nRINGKASAN IURAN-D: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);

