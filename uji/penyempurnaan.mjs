import { PGlite } from '@electric-sql/pglite';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { siapkanPg, buatKlienFake, buatDepsEdge } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { isiInstrumenContoh } from '../src/lokal/instrumenContoh.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { susunPenilaian } from '../src/lib/mapDb.js';
import { susunInstrumenXlsx, namaFileInstrumen } from '../src/lib/exportLaporan.js';
import { buatBufferXlsx } from '../src/lib/exportXlsx.js';
import { daftarUnitInstrumen } from '../src/lib/instrumenLogic.js';
import { INDEKS_POIN, hurufSub } from '../src/data/skuData.js';
import { periksaBaris, bacaExcelAnggota, buatTemplateAnggota, POLA_NTA } from '../src/lib/importAnggota.js';
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
const pg = await baru();
const q = async (db, sql, p = []) => (await db.query(sql, p)).rows;
const masuk = async (db, nama, pin) => { const k = buatKlienFake(db); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const K = { pembina: await masuk(pg, 'pembina', PIN_DEMO.pembina), dewan: await masuk(pg, 'dewan', PIN_DEMO.dewan), admin: await masuk(pg, 'admin', PIN_DEMO.admin), ahmad: await masuk(pg, '10231', PIN_DEMO.penegak), kevin: await masuk(pg, '10234', PIN_DEMO.penegak) };
const uid = async (u) => (await q(pg, `select id from public.profiles where username = $1`, [u]))[0].id;
const ahmad = await uid('10231'), kevin = await uid('10234');

console.log('--- Rincian nilai (sku_penilaian) ---');
ok(susunPenilaian().length === 0, 'susunPenilaian tanpa argumen aman');
const bentuk = susunPenilaian([
  { id: '7', waktu: 't2', penguji_id: 'p', tanggal_uji: '2026-09-11', skor: 80, wajib_ok: true, saran: 'lulus', hasil: 'lulus', diganti: false, catatan: null, rincian: [{ kriteria_id: '5', urutan: 1, jenis: 'Lisan', teks: 'a', bobot: 2, wajib: true, nilai: 4 }] },
  { id: '3', waktu: 't1', penguji_id: null, tanggal_uji: '2026-09-10T00:00:00', skor: 50, wajib_ok: false, saran: 'ulang', hasil: 'ulang', diganti: true, catatan: 'x', rincian: null },
]);
ok(bentuk.map((b) => b.id).join() === '3,7' && bentuk[0].tanggalUji === '2026-09-10' && bentuk[0].rincian.length === 0 && bentuk[0].catatan === 'x' && bentuk[1].catatan === '' && bentuk[1].rincian[0].kriteriaId === 5 && bentuk[1].rincian[0].wajib === true, 'susunPenilaian: urut lama ke baru, tanggal dipotong, rincian null aman, id numerik');

const kr = await q(pg, `select id from public.instrumen_kriteria where sku_id = 'BAN-02' order by urutan`);
await q(pg, `delete from public.sku_progress where peserta_id in ($1,$2)`, [ahmad, kevin]);
const nilai = (n) => kr.map((k, i) => ({ kriteria_id: Number(k.id), nilai: typeof n === 'function' ? n(i) : n }));
const catat = (o) => K.pembina.a.catatHasil({ pin: PIN_DEMO.pembina, pesertaId: ahmad, skuId: 'BAN-02', hasil: 'lulus', tanggalUji: '2026-09-10', catatan: '', ...o });
let r = await catat({ rincian: nilai(2), hasil: 'ulang', catatan: 'Belum lancar' });
ok(r.ok && r.rubrik, 'penilaian pertama (perlu diulang) tercatat lewat instrumen');
r = await catat({ rincian: nilai(4), tanggalUji: '2026-09-17' });
ok(r.ok && r.rubrik, 'penilaian kedua (lulus) tercatat');
r = await K.ahmad.a.muatPenilaian(ahmad, 'BAN-02');
ok(r.ok && r.data.length === 2 && r.data[0].hasil === 'ulang' && r.data[1].hasil === 'lulus' && r.data[0].tanggalUji === '2026-09-10' && r.data[1].skor === 80, 'Penegak membaca dua penilaian miliknya (lama ke baru): ' + JSON.stringify(r.data?.map((x) => [x.hasil, x.skor])));
ok(r.data[1].rincian.length === kr.length && r.data[1].rincian.every((k) => k.nilai === 4 && k.teks && k.jenis && Number.isInteger(k.kriteriaId)), 'rincian memuat teks, jenis, dan nilai tiap kriteria');
ok(r.data.every((p) => !('panduan' in p) && p.rincian.every((k) => !('panduan' in k) || k.panduan === undefined)) && !JSON.stringify(r.data).includes('CONTOH.'), 'tidak ada panduan atau instruksi penguji pada rincian untuk Penegak');
ok(r.data[0].catatan === 'Belum lancar' && r.data[0].wajibOk !== undefined && r.data[0].pengujiId === K.pembina.id, 'catatan penguji dan penguji terbawa');
r = await K.kevin.a.muatPenilaian(ahmad, 'BAN-02');
ok(r.ok && r.data.length === 0, 'Penegak lain tidak dapat membaca penilaian Ahmad (kosong)');
r = await K.pembina.a.muatPenilaian(ahmad, 'BAN-02');
ok(r.ok && r.data.length === 2, 'Pembina membaca rincian Penegak');
r = await K.ahmad.a.muatPenilaian(ahmad, 'BAN-03');
ok(r.ok && r.data.length === 0, 'butir tanpa penilaian instrumen: daftar kosong');
const riwayat = (await K.ahmad.a.muatProgress(ahmad)).data[ahmad]['BAN-02'].riwayat;
ok(riwayat.some((x) => /^Skor instrumen/.test(x.teks)), 'riwayat memuat kalimat "Skor instrumen ..." (pemicu tombol Rincian nilai di layar)');
// butir yang dinilai lama tidak punya penanda
await q(pg, `delete from public.sku_progress where peserta_id = $1 and sku_id = 'BAN-07'`, [kevin]);
r = await K.pembina.a.catatHasil({ pin: PIN_DEMO.pembina, pesertaId: kevin, skuId: 'BAN-07', hasil: 'lulus', tanggalUji: '2026-09-10', nilai: 'Baik', catatan: '' });
const rk = (await K.kevin.a.muatProgress(kevin)).data[kevin]['BAN-07'].riwayat;
ok(r.ok && !rk.some((x) => /^Skor instrumen/.test(x.teks)), 'penilaian gaya lama tidak memicu tombol rincian');
// database lama tanpa tabel
const pgLama = await baru(); await pgLama.query('drop table public.sku_penilaian');
const apiLama = buatApi(buatKlienFake(pgLama)); await apiLama.masuk('10231', PIN_DEMO.penegak);
r = await apiLama.muatPenilaian(ahmad, 'BAN-02');
ok(!r.ok && /migrasi|belum diperbarui/i.test(r.pesan), 'tabel belum ada: pesan menuntun ke migrasi (tanpa melempar): ' + (r.pesan ?? '').slice(0, 60));

console.log('\n--- Ekspor instrumen ke Excel ---');
const UNIT = daftarUnitInstrumen(INDEKS_POIN, hurufSub);
const ins = (await K.pembina.a.muatInstrumen()).data;
ok(Object.keys(ins).length === 3 && ins['BAN-02'].instruksi.length > 5 && ins['BAN-02'].kriteria[0].panduan.length > 3, 'Pembina memuat 3 instrumen contoh lengkap dengan instruksi dan panduan');
const ex = susunInstrumenXlsx({ unit: UNIT, instrumen: ins });
const sh = ex.sheets[0];
const jumlahKriteria = Object.values(ins).reduce((s, i) => s + i.kriteria.length, 0);
ok(ex.jumlah === 3 && sh.baris.length === jumlahKriteria && sh.nama === 'Instrumen', `3 butir dan ${jumlahKriteria} baris kriteria; lembar bernama "Instrumen"`);
ok(sh.kolom[0].header === 'Kode unit' && ['Cara uji', 'Instruksi untuk penguji', 'Jenis skala', 'Kriteria / pertanyaan', 'Bobot', 'Wajib?'].every((h) => sh.kolom.some((k) => k.header === h)) && sh.kolom.some((k) => k.header.startsWith('Panduan')), 'kolom sama dengan format berkas tinjauan (Kode unit di kolom A)');
const awal = sh.baris.filter((b) => b.cara || b.instruksi);
ok(awal.length === 3 && sh.baris.filter((b) => b.kode === 'BAN-02').slice(1).every((b) => !b.cara && !b.instruksi && !b.status), 'cara uji, instruksi, dan status hanya pada baris pertama tiap butir');
ok(sh.baris.find((b) => b.kode === 'BAN-04').status === 'Draf' && sh.baris.find((b) => b.kode === 'BAN-02').status === 'Ditetapkan', 'status Draf/Ditetapkan tercatat');
ok(sh.judul.some((j) => /RAHASIA/.test(j)), 'judul berisi peringatan rahasia');
ok(susunInstrumenXlsx({ unit: UNIT, instrumen: {} }).jumlah === 0 && susunInstrumenXlsx({ unit: UNIT, instrumen: { 'BAN-02': { ...ins['BAN-02'], kriteria: [] } } }).jumlah === 0, 'butir tanpa kriteria tidak diekspor (skrip pemuat menolaknya)');
ok(/^instrumen-penilaian-sku-\d{4}-\d{2}-\d{2}\.xlsx$/.test(namaFileInstrumen()), 'nama berkas');

// putaran balik: ekspor -> ubah di Excel -> skrip -> SQL -> database
const dir = `${SP}/tmp-instrumen`; mkdirSync(dir, { recursive: true });
const buf = await buatBufferXlsx(ex.sheets);
const xlsx = `${dir}/ekspor.xlsx`; writeFileSync(xlsx, Buffer.from(buf));
const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(xlsx);
ok(wb.worksheets[0].name === 'Instrumen', 'berkas terbaca ulang oleh ExcelJS');
// ubah satu kriteria BAN-04 (draf) dan BAN-02 (ditetapkan) di Excel
const ws = wb.worksheets[0];
let barisKepala = 0; ws.eachRow((row, n) => { if (!barisKepala && String(row.getCell(1).value) === 'Kode unit') barisKepala = n; });
const kolomKrit = 8;
ws.eachRow((row, n) => { if (n <= barisKepala) return; const kode = String(row.getCell(1).value); if (kode === 'BAN-04' || kode === 'BAN-02') { if (!ws._sudah?.[kode]) { (ws._sudah ??= {})[kode] = 1; row.getCell(kolomKrit).value = `DIUBAH DI EXCEL untuk ${kode}`; } } });
await wb.xlsx.writeFile(xlsx);
const keluar = `${dir}/hasil.sql`;
const run = spawnSync('node', [`${P}/scripts/instrumen-ke-sql.mjs`, keluar, xlsx, '--mode=perbarui-draf'], { cwd: P, encoding: 'utf8' });
ok(run.status === 0 && /3 butir/.test(run.stdout), 'skrip instrumen-ke-sql menerima berkas ekspor: ' + (run.stdout + run.stderr).trim().split('\n')[0]);
const sql = readFileSync(keluar, 'utf8');
ok(sql.includes('DIUBAH DI EXCEL untuk BAN-04') && sql.includes('BAN-03'), 'SQL memuat perubahan dan butir lain');
const pg2 = await baru();
await pg2.exec(sql);
const krit = async (db, sku) => (await q(db, `select teks from public.instrumen_kriteria where sku_id = $1 order by urutan`, [sku])).map((x) => x.teks);
ok((await krit(pg2, 'BAN-04'))[0] === 'DIUBAH DI EXCEL untuk BAN-04', 'butir DRAF (BAN-04) diperbarui dari Excel');
ok((await krit(pg2, 'BAN-02'))[0] !== 'DIUBAH DI EXCEL untuk BAN-02', 'butir DITETAPKAN (BAN-02) tidak tertimpa pada mode perbarui-draf');
ok(JSON.stringify(await krit(pg2, 'BAN-03')) === JSON.stringify(await krit(pg, 'BAN-03')), 'butir tanpa perubahan (BAN-03) tetap sama setelah putaran balik');
const panduanAwal = (await q(pg, `select p.panduan from public.instrumen_panduan p join public.instrumen_kriteria k on k.id = p.kriteria_id where k.sku_id = 'BAN-03' order by k.urutan`)).map((x) => x.panduan);
const panduanBalik = (await q(pg2, `select p.panduan from public.instrumen_panduan p join public.instrumen_kriteria k on k.id = p.kriteria_id where k.sku_id = 'BAN-03' order by k.urutan`)).map((x) => x.panduan);
ok(JSON.stringify(panduanAwal) === JSON.stringify(panduanBalik) && panduanAwal.length > 0, 'panduan penguji ikut kembali utuh');
const pg3 = await baru(); await pg3.exec(readFileSync(keluar, 'utf8').replace('mode: perbarui-draf', 'x'));
const run2 = spawnSync('node', [`${P}/scripts/instrumen-ke-sql.mjs`, `${dir}/timpa.sql`, xlsx, '--mode=timpa-semua'], { cwd: P, encoding: 'utf8' });
await pg3.exec(readFileSync(`${dir}/timpa.sql`, 'utf8'));
ok(run2.status === 0 && (await krit(pg3, 'BAN-02'))[0] === 'DIUBAH DI EXCEL untuk BAN-02', 'mode timpa-semua menerapkan perubahan juga pada butir ditetapkan');

console.log('\n--- NTA anggota ---');
const nta = (a, d) => a.aturNta(d);
r = await nta(K.admin.a, [{ username: '10231', nta: '11.03.10.701.00123' }, { username: '10234', nta: '  11.03.10.701.00124  ' }]);
ok(r.ok && r.data === 2, 'Admin mengatur NTA dua anggota: diperbarui ' + r.data);
let p = await q(pg, `select username, nta from public.profiles where username in ('10231','10234') order by username`);
ok(p[0].nta === '11.03.10.701.00123' && p[1].nta === '11.03.10.701.00124', 'NTA tersimpan dan dirapikan (spasi tepi dibuang)');
r = await nta(K.admin.a, [{ username: '10231', nta: '' }]);
p = await q(pg, `select nta from public.profiles where username = '10231'`);
ok(r.ok && r.data === 1 && p[0].nta === null, 'NTA kosong menghapus NTA (menjadi null)');
r = await nta(K.admin.a, [{ username: 'tidakada', nta: '123' }]);
ok(r.ok && r.data === 0, 'nama pengguna tidak dikenal: 0 diperbarui, tanpa galat');
r = await nta(K.admin.a, [{ username: '10231', nta: '11.03.10.701.00123' }, { username: '10234', nta: 'rusak;drop' }]);
ok(!r.ok && /tidak valid/.test(r.pesan), 'NTA tidak sah ditolak: ' + r.pesan);
p = await q(pg, `select nta from public.profiles where username = '10231'`);
ok(p[0].nta === null, '...dan tidak ada yang tersimpan sebagian (satu permintaan = satu transaksi)');
ok(!(await nta(K.admin.a, [{ username: '10231', nta: 'x'.repeat(41) }])).ok, 'NTA lebih dari 40 karakter ditolak');
ok(!(await nta(K.admin.a, [{ username: '', nta: '1' }])).ok, 'nama pengguna kosong ditolak');
ok(!(await nta(K.admin.a, 'bukan larik')).ok && !(await nta(K.admin.a, null)).ok, 'data bukan larik ditolak');
ok(!(await nta(K.admin.a, Array.from({ length: 501 }, (_, i) => ({ username: `u${i}`, nta: '1' })))).ok, 'lebih dari 500 baris ditolak');
for (const [nama, a] of [['Pembina', K.pembina.a], ['Dewan', K.dewan.a], ['Penegak', K.ahmad.a]]) {
  r = await nta(a, [{ username: '10231', nta: '999' }]);
  ok(!r.ok && /Admin Gudep/.test(r.pesan), `${nama} tidak dapat mengatur NTA: ${r.pesan}`);
}
ok((await q(pg, `select nta from public.profiles where username = '10231'`))[0].nta === null, 'tidak ada perubahan dari peran yang ditolak');
const langsung = await K.admin.k.from('profiles').update({ nta: '1' }).eq('username', '10231');
ok(!!langsung.error, 'penulisan langsung ke tabel profiles tetap ditolak untuk Admin');

// integrasi dengan pembuatan akun (alur impor): akun dibuat lebih dulu, NTA menyusul
const b = await K.admin.a.buatAkun('peserta', [{ no: 1, nama: 'Uji Nta Satu', nis: '99101', kelas: 'X-01', sangga: 'Sangga Elang', agama: 'Islam', username: '', pin: '' }, { no: 2, nama: 'Uji Nta Dua', nis: '99102', kelas: 'X-01', sangga: 'Sangga Elang', agama: 'Hindu', username: '', pin: '' }]);
ok(b.ok && b.hasil.every((h) => h.ok && h.username), 'buatAkun (impor): dua akun dibuat, hasil memuat username dan nomor baris');
r = await nta(K.admin.a, b.hasil.map((h) => ({ username: h.username, nta: `NTA-${h.no}` })));
p = await q(pg, `select username, nta from public.profiles where username in ('99101','99102') order by username`);
ok(r.ok && r.data === 2 && p[0].nta === 'NTA-1' && p[1].nta === 'NTA-2', 'NTA menyusul sesudah akun dibuat, dipetakan lewat nama pengguna');
const prof = (await K.admin.a.muatProfil()).data.find((u) => u.username === '99101');
ok(prof.nta === 'NTA-1', 'profil yang dimuat membawa NTA (petaProfil)');
// sidang tetap memakai NTA profil
ok(POLA_NTA.test('11.03.10.701.00123') && !POLA_NTA.test('a;b') && !POLA_NTA.test('') && !POLA_NTA.test('x'.repeat(41)), 'POLA_NTA sama dengan aturan server');

console.log('\n--- NTA di Excel impor ---');
const tpl = await buatTemplateAnggota('peserta');
const wbT = new ExcelJS.Workbook(); await wbT.xlsx.load(tpl);
const wsT = wbT.getWorksheet('Anggota'); const kepala = []; wsT.getRow(1).eachCell((c) => kepala.push(c.value));
ok(kepala.includes('NTA (opsional)') && kepala.indexOf('NTA (opsional)') < kepala.indexOf('PIN Awal (opsional)'), 'template Penegak memuat kolom NTA (opsional) sebelum PIN: ' + kepala.join(' | '));
const kNta = kepala.indexOf('NTA (opsional)') + 1;
ok(wsT.getCell(2, kNta).numFmt === '@', 'kolom NTA berformat teks');
const bar = (no, nama, nis, ntaTeks) => { const rr = wsT.getRow(no); rr.getCell(kepala.indexOf('Nama Lengkap') + 1).value = nama; rr.getCell(kepala.indexOf('Jenis Kelamin') + 1).value = 'Laki-laki'; rr.getCell(kepala.indexOf('NIS') + 1).value = nis; rr.getCell(kepala.indexOf('Rombel') + 1).value = 'X-01'; rr.getCell(kepala.indexOf('Sangga') + 1).value = 'Sangga Elang'; rr.getCell(kepala.indexOf('Agama') + 1).value = 'Islam'; if (ntaTeks !== null) rr.getCell(kNta).value = ntaTeks; };
bar(2, 'Ada Nta', '88001', '11.03.10.701.00500'); bar(3, 'Tanpa Nta', '88002', null); bar(4, 'Nta Angka', '88003', 12345); bar(5, 'Nta Rusak', '88004', 'a;b');
const bufIsi = await wbT.xlsx.writeBuffer();
const dibaca = await bacaExcelAnggota(bufIsi, 'peserta');
ok(dibaca.length === 4 && dibaca[0].nta === '11.03.10.701.00500' && dibaca[1].nta === '' && dibaca[2].nta === '12345', 'bacaExcelAnggota membaca kolom NTA (teks, kosong, angka)');
const per = periksaBaris(dibaca, (await K.admin.a.muatProfil()).data, 'peserta');
ok(per[0].siap && per[1].siap && per[2].siap && !per[3].siap && /NTA tidak valid/.test(per[3].galat.join()), 'pemeriksaan: NTA rusak menandai baris tidak siap: ' + per[3].galat.join('; '));
ok(per[0].data.nta === '11.03.10.701.00500', 'data siap impor membawa NTA');
// template Dewan Ambalan punya kolom NTA (untuk Pradana dan Pradani); Pembina tidak
const tplD = new ExcelJS.Workbook(); await tplD.xlsx.load(await buatTemplateAnggota('dewan'));
const kepD = []; tplD.getWorksheet('Anggota').getRow(1).eachCell((c) => kepD.push(c.value));
ok(kepD.some((h) => /NTA/.test(h)), 'template Dewan Ambalan memuat NTA (dipakai Pradana dan Pradani pada tanda tangan)');
// berkas Penegak lama (tanpa kolom NTA) tetap terbaca
const tplLama = new ExcelJS.Workbook(); const wl = tplLama.addWorksheet('Anggota'); wl.addRow(['Nama Lengkap', 'NIS', 'Kelas', 'Sangga', 'Agama', 'PIN Awal (opsional)']); wl.addRow(['Budi Lama', '77001', 'XI-01', 'Sangga Merak', 'Islam', '']);
const lama = await bacaExcelAnggota(await tplLama.xlsx.writeBuffer(), 'peserta');
ok(lama.length === 1 && lama[0].nta === '', 'berkas lama tanpa kolom NTA tetap dapat diimpor (NTA kosong)');

console.log(`\nRINGKASAN PENYEMPURNAAN: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
