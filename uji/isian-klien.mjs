// Tahap 3 (H1): cermin klien isian data diri (src/lib/isianLogic.js) DIBANDINGKAN LANGSUNG dengan sigarda.isian_periksa dan isian_periksa_profil pada kisi masukan.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg } from '../src/lokal/klienFake.js';
import { KUNCI_PROFIL, POKOK, SEMUA_KUNCI, namaOrangTua, nilaiAwal, periksaIsian, periksaProfil, periksaSemua, pokokKurang } from '../src/lib/isianLogic.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
const sql = async (q, a) => (await pg.query(q, a)).rows[0].h;
const hari = await sql('select sigarda.hari_ini()::text h');

console.log('--- Daftar kunci ---');
ok(new Set(SEMUA_KUNCI).size === SEMUA_KUNCI.length && SEMUA_KUNCI.length === 78, `78 kunci isian unik (${SEMUA_KUNCI.length})`);
let semuaSah = true;
for (const k of SEMUA_KUNCI) if ((await sql('select sigarda.isian_periksa($1, $2) h', [k, ''])) !== null) semuaSah = false;
ok(semuaSah, 'setiap kunci klien dikenal server (nilai kosong sah)');
const asing = ['sdr4_nama', 'sdr0_nama', 'keg8_nama', 'keg0_nama', 'bid7_nama', 'it5_nama', 'pend_ta_nama', 'pend_sd_tahun', 'ibu_gaji', 'wali_', 'ALAMAT', 'alamat ', '', 'jk', 'agama', 'lahir', 'nta', 'akd_lain', 'non_'];
let asingSama = true;
for (const k of asing) {
  const s = (await sql('select sigarda.isian_periksa($1, $2) h', [k, 'x'])) === null;
  const c = periksaIsian(k, 'x') === '';
  if (s !== false || c !== false) { asingSama = false; console.log('  kunci asing diterima:', JSON.stringify(k), s, c); }
}
ok(asingSama, 'kunci di luar daftar ditolak server dan klien (termasuk kunci profil, yang punya pemeriksa sendiri)');

console.log('\n--- Kisi masukan isian ---');
const nilai = ['', ' ', 'A', 'AB', 'O', 'C', 'abc', '0812', '081234567890', '+62 812-3456-7890', '(021) 555.123', '12345678901234567890123', '12', '19', '20', '49', '50', '165', '250', '251', '1000', '0', '1', '2', '21', '1989', '1990', '2024', '2100', '2101', 'kwarran', 'kwarcab', 'kwarda', 'nasional', 'bisa', 'cukup', 'kurang', 'mahir',
  'x'.repeat(30), 'x'.repeat(31), 'x'.repeat(40), 'x'.repeat(41), 'x'.repeat(60), 'x'.repeat(61), 'x'.repeat(80), 'x'.repeat(81), 'x'.repeat(100), 'x'.repeat(101), 'x'.repeat(120), 'x'.repeat(121), 'x'.repeat(200), 'x'.repeat(201),
  '<b>', 'a>b', 'a\tb', 'a\nb', 'a  b   c', 'Sekolah Dasar Negeri 1', 'M. Fauzi, S.Pd.', "O'Brien"];
let n = 0, beda = 0;
for (const k of SEMUA_KUNCI) {
  for (const v of nilai) {
    const s = (await sql('select sigarda.isian_periksa($1, $2) h', [k, String(v).replace(/\s+/g, ' ').trim()])) === null;
    const c = periksaIsian(k, v) === '';
    n += 1;
    if (s !== c) { beda += 1; if (beda <= 8) console.log('  BEDA', JSON.stringify(k), JSON.stringify(String(v).slice(0, 25)), 'server sah:', s, 'klien sah:', c); }
  }
}
ok(beda === 0, `klien dan server sepakat pada ${n} pasangan kunci-nilai (${SEMUA_KUNCI.length} kunci x ${nilai.length} nilai)`);

console.log('\n--- Kisi masukan profil ---');
const profilNilai = { jk: ['', 'L', 'P', 'l', 'X', 'Laki-laki'], agama: ['', 'Islam', 'Katolik', 'Protestan', 'Hindu', 'Buddha', 'Khonghucu', 'islam', 'Pagan'],
  lahir: ['', '2009-03-15', '2009-3-15', '15/03/2009', '2009-02-30', '2009-13-01', '1989-12-31', '1990-01-01', hari, '2099-01-01', '2000-02-29', '2001-02-29', 'abc'],
  nta: ['', '11.03.10.701.00123', 'A/B-1 2', 'x'.repeat(40), 'x'.repeat(41), '<x>', 'a_b'] };
n = 0; beda = 0;
for (const [k, daftar] of Object.entries(profilNilai)) {
  for (const v of daftar) {
    const s = (await sql('select sigarda.isian_periksa_profil($1, $2) h', [k, v])) === null;
    const c = periksaProfil(k, v, hari) === '';
    n += 1;
    if (s !== c) { beda += 1; console.log('  BEDA', k, JSON.stringify(v), 'server sah:', s, 'klien sah:', c); }
  }
}
ok(beda === 0, `klien dan server sepakat pada ${n} pasangan kunci-nilai profil`);
ok((await sql('select sigarda.isian_periksa_profil($1, $2) h', ['panggilan', 'x'])) !== null && periksaProfil('panggilan', 'x') !== '', 'kunci non-profil ditolak pemeriksa profil (server dan klien)');
ok(KUNCI_PROFIL.join() === 'jk,agama,lahir,nta', 'empat kunci profil');

console.log('\n--- Isian pokok, nilai awal, orang tua ---');
const akunLengkap = { whatsapp: '0812345678', jenisKelamin: 'L', agama: 'Islam' };
const isianLengkap = { tempat_lahir: 'Purbalingga', alamat: 'Jl. A', ibu_nama: 'Siti' };
ok(pokokKurang({ akun: akunLengkap, isian: isianLengkap, lahir: '2009-03-15' }).length === 0, 'semua pokok terisi: tidak ada yang kurang');
ok(pokokKurang({ akun: {}, isian: {}, lahir: null }).join('|') === POKOK.map((p) => p.label).join('|'), 'kosong semua: seluruh pokok kurang, urut formulir');
ok(pokokKurang({ akun: akunLengkap, isian: { ...isianLengkap, ibu_nama: '' }, lahir: '2009-03-15' }).join() === 'Nama ayah, ibu, atau wali', 'tanpa nama orang tua/wali: kurang');
ok(pokokKurang({ akun: akunLengkap, isian: { ...isianLengkap, ibu_nama: '', wali_nama: 'Paman' }, lahir: '2009-03-15' }).length === 0, 'wali saja cukup');
ok(pokokKurang({ akun: { ...akunLengkap, agama: '' }, isian: isianLengkap, lahir: '2009-03-15' }).join() === 'Agama', 'agama kosong ("" dari petaProfil) dianggap kurang');
ok(namaOrangTua({ ayah_nama: 'Slamet', ibu_nama: 'Siti' }) === 'Slamet' && namaOrangTua({ ibu_nama: 'Siti', wali_nama: 'Paman' }) === 'Siti' && namaOrangTua({ wali_nama: 'Paman' }) === 'Paman' && namaOrangTua({}) === '', 'nama orang tua: ayah, lalu ibu, lalu wali');
const awal = nilaiAwal({ alamat: 'x' });
ok(Object.keys(awal).length === 78 && awal.alamat === 'x' && awal.panggilan === '', 'nilaiAwal: semua kunci ada (kosong bila belum)');
const g = periksaSemua({ ...awal, tinggi: '10', alamat: '<x>' }, { agama: 'Pagan', lahir: '2009-03-15' }, hari);
ok(Object.keys(g).sort().join() === 'agama,alamat,tinggi', 'periksaSemua: hanya yang salah (isian dan profil)');
ok(Object.keys(periksaSemua(awal, {}, hari)).length === 0, 'formulir kosong sah');

console.log(`RINGKASAN ISIAN-KLIEN: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
