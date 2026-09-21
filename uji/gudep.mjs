// Data gudep: identitas gudep, ambalan, dan pejabat yang diatur Admin (bukan di kode). Server (hak, validasi, RLS, identitas publik tanpa login)
// dan logika klien murni (gabung dengan nilai bawaan, pemeriksaan yang sama dengan server, penyimpanan di perambah, kop surat).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { GUDEP_BAWAAN } from '../src/config.js';
import {
  KOLOM_ORANG, KOLOM_TEKS, barisKop, gabungGudep, kepinganPublik, namaAmbalan, penandaTanganSurat, periksaGudep, samaGudep, untukForm,
} from '../src/lib/gudepLogic.js';
import { ambilGudep, gudepTersimpan, resetGudep, setGudep, tambahGudep } from '../src/lib/gudepStore.js';
import { penandaTanganSurat as pts } from '../src/lib/gudepLogic.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const K = { admin: await masuk('admin', PIN_DEMO.admin), pembina: await masuk('pembina', PIN_DEMO.pembina), dewan: await masuk('dewan', PIN_DEMO.dewan), ahmad: await masuk('10231', PIN_DEMO.penegak) };
const cocok = (r, re) => !r.ok && re.test(r.pesan ?? '');
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const salin = (o) => JSON.parse(JSON.stringify(o));

const contoh = {
  nama: 'Gugus Depan SMAN 2 Contoh', singkat: 'Ambalan Diponegoro/Kartini', sekolah: 'SMA Negeri 2 Contoh', alamat: 'Jl. Merdeka No. 1, Contoh', kota: 'Contoh',
  nomorGudep: '12.345/12.346', kwarran: 'Kwartir Ranting Contoh', kwarcab: 'Kwartir Cabang Contoh', kodeSurat: 'GD-SMAN2-CTH', telepon: '(0281) 123-456', email: 'gudep@sman2.sch.id',
  pembina: { jabatan: 'Pembina Gudep', nama: 'Budi Santoso, S.Pd.', nta: '11.03.12.345.00001', nip: '198001012005011001' },
  kamabigus: { jabatan: 'Kepala Sekolah / Kamabigus', nama: 'Dra. Siti Aminah, M.Pd.', nta: '11.03.12.345.00002', nip: '197001011995122001' },
};

console.log('--- Nilai bawaan dan keadaan awal ---');
ok(GUDEP_BAWAAN.nama === 'Gugus Depan SMAN 1 Bukateja' && GUDEP_BAWAAN.pembina.nama.length > 0 && !('ketuaAmbalan' in GUDEP_BAWAAN), 'GUDEP_BAWAAN memuat identitas dan pejabat baru (tanpa ketuaAmbalan lama)');
ok(KOLOM_ORANG.join() === 'pembina,kamabigus' && KOLOM_TEKS.every((k) => k in GUDEP_BAWAAN), 'semua kolom teks ada pada nilai bawaan');
ok(Object.keys(periksaGudep(GUDEP_BAWAAN)).length === 0, 'nilai bawaan lolos pemeriksaan');
ok((await K.admin.a.muatGudep()).ok && (await K.admin.a.muatGudep()).data === null, 'belum pernah disimpan: muatGudep mengembalikan null');
ok(JSON.stringify((await sebagai(null, 'select public.sg_gudep_publik() d')).rows[0].d) === '{}', 'identitas publik: objek kosong bila belum ada data');

console.log('\n--- Server: siapa boleh mengubah ---');
for (const [nama, kk] of [['Pembina', K.pembina], ['Dewan Ambalan', K.dewan], ['Penegak', K.ahmad]]) {
  ok(cocok(await kk.a.simpanGudep(contoh), /Hanya Admin/), `${nama} tidak dapat mengubah data gudep`);
}
ok((await sebagai(null, `select public.sg_gudep_simpan('{}'::jsonb)`)).ok === false, 'tanpa login tidak dapat mengubah data gudep');
ok((await q(`select count(*)::int n from public.pengaturan where kunci = 'gudep.data'`))[0].n === 0, 'permintaan yang ditolak tidak menyimpan apa pun');
{
  const r = await sebagai(K.admin.id, `insert into public.pengaturan (kunci, nilai) values ('gudep.data', '{}'::jsonb)`);
  ok(!r.ok, 'tulis langsung ke tabel pengaturan ditolak (hanya lewat fungsi)');
}

console.log('\n--- Server: menyimpan dan membaca ---');
let r = await K.admin.a.simpanGudep(contoh);
ok(r.ok, 'Admin menyimpan data gudep');
r = await K.admin.a.muatGudep();
ok(r.ok && r.data.nama === 'Gugus Depan SMAN 2 Contoh' && r.data.pembina.nta === '11.03.12.345.00001' && r.data.kamabigus.nip === '197001011995122001' && !('pradana' in r.data) && !('pradani' in r.data), 'tersimpan lengkap (identitas, pembina, kamabigus beserta NTA); Pradana dan Pradani tidak disimpan di sini');
ok((await q(`select diubah_oleh::text o from public.pengaturan where kunci = 'gudep.data'`))[0].o === K.admin.id, 'pelaku perubahan tercatat');
for (const [nama, kk] of [['Pembina', K.pembina], ['Dewan Ambalan', K.dewan], ['Penegak', K.ahmad]]) {
  const b = await kk.a.muatGudep();
  ok(b.ok && b.data?.nama === 'Gugus Depan SMAN 2 Contoh', `${nama} membaca data gudep setelah masuk (untuk dokumen cetak)`);
}
r = await K.admin.a.simpanGudep({ ...salin(contoh), nama: '  Gugus   Depan  SMAN 2   Contoh ', kamabigus: { jabatan: 'Kepala   Sekolah', nama: '', nta: '', nip: '' } });
ok(r.ok, 'spasi ganda dan tepi dirapikan, isian opsional boleh dikosongkan');
r = await K.admin.a.muatGudep();
ok(r.data.nama === 'Gugus Depan SMAN 2 Contoh' && r.data.kamabigus.jabatan === 'Kepala Sekolah' && r.data.kamabigus.nama === '' && r.data.kamabigus.nta === '', 'tersimpan dirapikan dan isian yang dikosongkan tetap kosong');
r = await K.admin.a.simpanGudep({ nama: 'Gugus Depan Lain', singkat: 'Ambalan X', sekolah: 'SMA X', kota: 'X', pembina: { jabatan: 'Pembina', nama: 'Y' } });
ok(r.ok, 'isian yang tidak dikirim boleh dilewati (disimpan kosong)');
r = await K.admin.a.muatGudep();
ok(r.data.alamat === '' && r.data.pembina.nta === '', 'isian yang tidak dikirim tersimpan kosong');
await K.admin.a.simpanGudep(contoh);

console.log('\n--- Server: pemeriksaan isian (server dan klien harus sepakat) ---');
const kasus = [
  ['nama kosong', (d) => { d.nama = ''; }], ['ambalan kosong', (d) => { d.singkat = '  '; }], ['sekolah kosong', (d) => { d.sekolah = ''; }], ['kota kosong', (d) => { d.kota = ''; }],
  ['nama terlalu panjang', (d) => { d.nama = 'A'.repeat(121); }], ['alamat 200 karakter (sah)', (d) => { d.alamat = 'A'.repeat(200); }], ['alamat 201 karakter', (d) => { d.alamat = 'A'.repeat(201); }],
  ['kode surat dengan spasi', (d) => { d.kodeSurat = 'GD SMAN'; }], ['kode surat sah', (d) => { d.kodeSurat = 'GD.SMAN_1/BKT-2'; }], ['kode surat kosong (sah)', (d) => { d.kodeSurat = ''; }],
  ['telepon huruf', (d) => { d.telepon = 'abc123'; }], ['telepon +62', (d) => { d.telepon = '+62 (281) 123-456'; }], ['email tanpa @', (d) => { d.email = 'gudep.sch.id'; }], ['email kosong (sah)', (d) => { d.email = ''; }],
  ['email dua @', (d) => { d.email = 'a@b@c.id'; }], ['telepon terlalu panjang', (d) => { d.telepon = '1'.repeat(41); }],
  ['pembina tanpa nama', (d) => { d.pembina.nama = ''; }], ['pembina tanpa jabatan', (d) => { d.pembina.jabatan = ''; }], ['NTA pembina berkarakter terlarang', (d) => { d.pembina.nta = '11#03'; }],
  ['NTA 41 karakter', (d) => { d.kamabigus.nta = '1'.repeat(41); }], ['NIP kamabigus terlarang', (d) => { d.kamabigus.nip = 'NIP:123'; }], ['nama kamabigus 121 karakter', (d) => { d.kamabigus.nama = 'A'.repeat(121); }],
  ['jabatan kamabigus 81 karakter', (d) => { d.kamabigus.jabatan = 'A'.repeat(81); }], ['kamabigus dikosongkan seluruhnya (sah)', (d) => { d.kamabigus = { jabatan: '', nama: '', nta: '', nip: '' }; }],
];
{
  let sama = true;
  for (const [nama, ubah] of kasus) {
    const d = salin(contoh); ubah(d);
    const server = await K.admin.a.simpanGudep(d);
    const klien = Object.keys(periksaGudep(d)).length === 0;
    if (server.ok !== klien) { sama = false; console.log('   beda:', nama, 'server', server.ok, server.pesan ?? '', 'klien', klien); }
  }
  ok(sama, `${kasus.length} isian: server dan klien (periksaGudep) sama-sama menerima atau menolak`);
}
await K.admin.a.simpanGudep(contoh);
{
  // Klien lama masih dapat mengirim pradana/pradani: diterima (dan diperiksa) tetapi tidak disimpan
  const lama = { ...salin(contoh), pradana: { jabatan: 'Pradana Dewan Ambalan', nama: 'Ahmad Rizki', nta: '', nip: '' }, pradani: { jabatan: 'Pradani Dewan Ambalan', nama: 'Dewi', nta: '', nip: '' } };
  const r = await K.admin.a.simpanGudep(lama);
  const d = (await K.admin.a.muatGudep()).data;
  ok(r.ok && !('pradana' in d) && !('pradani' in d) && d.pembina.nama === contoh.pembina.nama, 'klien lama: pradana dan pradani diterima tetapi tidak disimpan (diambil dari anggota Dewan Ambalan)');
  ok(cocok(await K.admin.a.simpanGudep({ ...salin(contoh), pradana: { jabatan: 'x', nama: 'A'.repeat(121), nta: '', nip: '' } }), /maksimal 120/), 'klien lama: isian pradana tetap diperiksa');
  await K.admin.a.simpanGudep(contoh);
}
ok(cocok(await K.admin.a.simpanGudep({ ...salin(contoh), logo: 'x' }), /"logo" tidak dikenal/), 'isian yang tidak dikenal ditolak');
ok(cocok(await K.admin.a.simpanGudep({ ...salin(contoh), pembina: { ...contoh.pembina, gelar: 'x' } }), /pembina\.gelar" tidak dikenal/), 'bagian orang yang tidak dikenal ditolak');
ok(cocok(await K.admin.a.simpanGudep({ ...salin(contoh), nama: 123 }), /harus berupa teks/), 'nilai bukan teks ditolak');
ok(cocok(await K.admin.a.simpanGudep({ ...salin(contoh), pembina: 'Budi' }), /tidak sah/), 'orang bukan objek ditolak');
ok(cocok(await K.admin.a.simpanGudep([]), /tidak sah/) && cocok(await K.admin.a.simpanGudep(null), /tidak sah/), 'bukan objek ditolak');
ok(cocok(await K.admin.a.simpanGudep({ ...salin(contoh), email: 'x' }), /email/i), 'pesan galat email');
ok((await K.admin.a.muatGudep()).data.nama === 'Gugus Depan SMAN 2 Contoh', 'permintaan yang ditolak tidak mengubah data tersimpan');

console.log('\n--- Server: identitas publik tanpa login ---');
{
  const d = (await sebagai(null, 'select public.sg_gudep_publik() d')).rows[0].d;
  ok(Object.keys(d).sort().join() === 'kota,nama,sekolah,singkat' && d.nama === 'Gugus Depan SMAN 2 Contoh' && d.singkat === 'Ambalan Diponegoro/Kartini', 'tanpa login: hanya nama gudep, ambalan, sekolah, dan kota');
  ok(!JSON.stringify(d).includes('Budi') && !JSON.stringify(d).includes('11.03') && !JSON.stringify(d).includes('Merdeka'), 'nama pejabat, NTA, dan alamat tidak bocor');
  const a = await sebagai(null, 'select count(*)::int n from public.pengaturan');
  ok(!a.ok || a.rows[0].n === 0, 'tanpa login tabel pengaturan tidak terbaca');
  const via = await K.ahmad.a.muatGudepPublik();
  ok(via.ok && via.data.nama === 'Gugus Depan SMAN 2 Contoh', 'api.muatGudepPublik');
}

console.log('\n--- Klien: gabung, pemeriksaan, dan bentuk ---');
{
  const g = gabungGudep(GUDEP_BAWAAN, { nama: '  Nama   Baru ', kota: '', pembina: { nama: 'Orang', nta: '' }, ngawur: 'x', alamat: 5 });
  ok(g.nama === 'Nama Baru' && g.kota === '' && g.alamat === GUDEP_BAWAAN.alamat && g.sekolah === GUDEP_BAWAAN.sekolah, 'gabungGudep: isian ada = dipakai (dirapikan, kosong tetap kosong); tidak ada atau bukan teks = nilai dasar');
  ok(g.pembina.nama === 'Orang' && g.pembina.nta === '' && g.pembina.jabatan === GUDEP_BAWAAN.pembina.jabatan && !('ngawur' in g), 'gabungGudep: bagian orang digabung per bagian; isian tidak dikenal dibuang');
  ok(untukForm(null).nama === '' && untukForm(null).pembina.nta === '', 'untukForm: semua isian berupa teks');
  ok(samaGudep(contoh, { ...salin(contoh), nama: ' Gugus Depan   SMAN 2 Contoh ' }) && !samaGudep(contoh, { ...salin(contoh), kota: 'Lain' }), 'samaGudep: setelah dirapikan');
  ok(namaAmbalan({ singkat: 'Gajah Mada' }) === 'Ambalan Gajah Mada' && namaAmbalan({ singkat: 'ambalan Gajah Mada' }) === 'ambalan Gajah Mada', 'namaAmbalan menambah kata Ambalan bila belum ada');
  const kop = barisKop(contoh);
  ok(kop.alamat === 'Gudep No. 12.345/12.346. Jl. Merdeka No. 1, Contoh' && kop.kontak === 'Telp. (0281) 123-456, gudep@sman2.sch.id', 'barisKop: alamat dengan nomor gudep, dan kontak');
  ok(barisKop({ ...contoh, telepon: '', email: '' }).kontak === '' && barisKop({ ...contoh, nomorGudep: '' }).alamat === 'Jl. Merdeka No. 1, Contoh', 'barisKop: bagian kosong tidak tercetak');
  ok(penandaTanganSurat(contoh, 'intern') === contoh.pembina && penandaTanganSurat(contoh, 'keluar') === contoh.kamabigus && pts(contoh, 'apa saja') === contoh.pembina, 'penandaTanganSurat: intern = Pembina/Ka Gudep, keluar = Kamabigus/Kepala Sekolah');
  ok(Object.keys(kepinganPublik(contoh)).join() === 'nama,singkat,sekolah,kota', 'kepinganPublik hanya kolom publik (cocok dengan sg_gudep_publik)');
}

console.log('\n--- Klien: penyimpanan di perambah ---');
{
  resetGudep();
  ok(ambilGudep() === GUDEP_BAWAAN, 'awal: nilai bawaan');
  tambahGudep({ nama: 'Publik', kota: 'Kota Publik' });
  ok(ambilGudep().nama === 'Publik' && ambilGudep().kota === 'Kota Publik' && ambilGudep().pembina.nama === GUDEP_BAWAAN.pembina.nama, 'tambahGudep (identitas publik sebelum login) tidak menghapus isian lain');
  const data = (await K.admin.a.muatGudep()).data;
  setGudep(data);
  ok(ambilGudep().nama === 'Gugus Depan SMAN 2 Contoh' && ambilGudep().pembina.nta === '11.03.12.345.00001' && ambilGudep().kamabigus.nip === '197001011995122001', 'setGudep memuat data lengkap dari server');
  setGudep({ ...salin(contoh), telepon: '', kamabigus: { jabatan: 'KS', nama: '', nta: '', nip: '' } });
  ok(ambilGudep().telepon === '' && ambilGudep().kamabigus.nama === '', 'isian yang dikosongkan Admin tetap kosong (tidak kembali ke bawaan)');
  setGudep(null);
  ok(ambilGudep() === GUDEP_BAWAAN, 'setGudep(null) (belum pernah disimpan) = nilai bawaan');
  setGudep(contoh);
  resetGudep();
  ok(ambilGudep() === GUDEP_BAWAAN && ambilGudep().pembina.nta === GUDEP_BAWAAN.pembina.nta, 'resetGudep mengembalikan nilai bawaan (pejabat tidak tertinggal setelah keluar)');
}

console.log('\n--- Klien: status tersimpan ---');
{
  resetGudep();
  ok(gudepTersimpan() === false, 'gudepTersimpan() salah sesudah reset');
  setGudep(contoh);
  ok(gudepTersimpan() === true, 'gudepTersimpan() benar sesudah data dimuat');
}

console.log(`\nRINGKASAN GUDEP: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
