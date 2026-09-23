// Tahap L10: panduan pengguna -- struktur isi (panduanData.js) dan panduanLogic.js (murni).
import { readFileSync } from 'node:fs';
import { BAGIAN_UMUM, PANDUAN, PERAN_PANDUAN } from '../src/data/panduanData.js';
import { panduanAwal } from '../src/lib/panduanLogic.js';

let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

console.log('--- Struktur isi (panduanData.js) ---');
{
  ok(PERAN_PANDUAN.length === 4, `PERAN_PANDUAN: 4 peran: ${PERAN_PANDUAN.join(', ')}`);
  ok(BAGIAN_UMUM.isi.length > 0, 'BAGIAN_UMUM: ada isi untuk semua peran');
  const semuaId = new Set();
  for (const kode of PERAN_PANDUAN) {
    const p = PANDUAN[kode];
    ok(!!p, `PANDUAN.${kode} ada`);
    ok(typeof p.label === 'string' && p.label.length > 0, `${kode}: punya label: "${p.label}"`);
    ok(typeof p.ringkasan === 'string' && p.ringkasan.length > 0, `${kode}: punya ringkasan`);
    ok(Array.isArray(p.bagian) && p.bagian.length > 0, `${kode}: punya minimal satu bagian (${p.bagian?.length})`);
    for (const b of p.bagian) {
      ok(typeof b.id === 'string' && b.id.length > 0, `${kode}: bagian punya id: "${b.id}"`);
      ok(!semuaId.has(b.id), `${kode}: id "${b.id}" tidak bentrok dengan bagian lain (perlu unik untuk tautan #jangkar)`);
      semuaId.add(b.id);
      ok(typeof b.judul === 'string' && b.judul.length > 0, `${kode}/${b.id}: punya judul`);
      ok(Array.isArray(b.isi) && b.isi.length > 0, `${kode}/${b.id}: punya isi (tidak kosong)`);
      for (const baris of b.isi) ok(typeof baris === 'string' && baris.trim().length > 0, `${kode}/${b.id}: setiap baris isi berupa teks tidak kosong`);
    }
  }
  ok(!semuaId.has(BAGIAN_UMUM.id), 'id BAGIAN_UMUM tidak bentrok dengan id bagian per peran');
}

console.log('\n--- panduanAwal (murni) ---');
{
  ok(panduanAwal(null) === 'penegak', 'tanpa pengguna: bawaan penegak');
  ok(panduanAwal({ role: 'peserta' }) === 'penegak', 'Penegak (tampilan Penegak): panduan penegak');
  ok(panduanAwal({ role: 'penguji', jabatan: 'Pembina' }) === 'pembina', 'Pembina: panduan pembina');
  ok(panduanAwal({ role: 'penguji', jabatan: 'Dewan Ambalan' }) === 'dewan', 'akun Dewan lama: panduan dewan');
  ok(panduanAwal({ role: 'penguji', jabatan: 'Dewan Ambalan', jabatanDewan: 'Pradana' }) === 'dewan', 'Penegak berjabatan (tampilan Dewan): panduan dewan');
  ok(panduanAwal({ role: 'admin' }) === 'admin', 'Admin Gudep: panduan admin');
}

console.log('\n--- Panduan mencakup setiap menu di App.jsx (panduan dijaga manual: uji ini menangkap yang ketinggalan) ---');
{
  const app = readFileSync(`${process.cwd()}/src/App.jsx`, 'utf8');
  const menu = [...new Set([...app.matchAll(/label: '([^']+)'/g)].map((m) => m[1]))];
  const teksPanduan = JSON.stringify([BAGIAN_UMUM, PANDUAN]).toLowerCase();
  ok(menu.length >= 20, `${menu.length} nama menu terbaca dari buatNav`);
  const tanpaPanduan = menu.filter((m) => !teksPanduan.includes(m.toLowerCase()));
  ok(tanpaPanduan.length === 0, tanpaPanduan.length ? `menu BELUM ada di panduan (tambahkan bagiannya di src/data/panduanData.js): ${tanpaPanduan.join(', ')}` : 'setiap nama menu disebut di panduan');
}

console.log(`\nRINGKASAN PANDUAN: ${lulus} lulus, ${gagal} GAGAL.`);
if (gagal) process.exit(1);
