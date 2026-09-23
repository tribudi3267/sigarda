// Pembagian pengujian (scripts/uji-shard.mjs) untuk CI paralel, dan pemasangannya di uji/jalankan.mjs serta .github/workflows/uji.yml.
import { readFileSync, readdirSync } from 'node:fs';
import { bacaShard, pilihShard } from '../scripts/uji-shard.mjs';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const galat = (f) => { try { f(); return null; } catch (e) { return e.message; } };

console.log('--- bacaShard ---');
{
  const s = bacaShard('2/4');
  ok(s.ke === 2 && s.dari === 4, 'bentuk 2/4 dibaca');
  for (const salah of ['', 'x', '0/4', '5/4', '1/0', '1-4', '2/', undefined]) ok(/--shard harus i\/n/.test(galat(() => bacaShard(salah)) ?? ''), `bentuk salah ditolak: ${JSON.stringify(salah)}`);
}

console.log('\n--- pilihShard ---');
{
  const nama = Array.from({ length: 10 }, (_, i) => `uji${String(i).padStart(2, '0')}`).reverse(); // sengaja tidak berurutan
  const bagian = [1, 2, 3, 4].map((k) => pilihShard(nama, `${k}/4`));
  const gabung = bagian.flat().sort();
  ok(JSON.stringify(gabung) === JSON.stringify([...nama].sort()), 'gabungan keempat bagian = semua pengujian, tanpa yang hilang atau ganda');
  ok(bagian.every((b) => b.length >= 2 && b.length <= 3), `pembagian merata: ${bagian.map((b) => b.length).join(', ')}`);
  ok(JSON.stringify(pilihShard(nama, '1/1')) === JSON.stringify([...nama].sort()), '1/1 = semua, terurut');
  ok(JSON.stringify(pilihShard(nama, '2/4')) === JSON.stringify(pilihShard([...nama].reverse(), '2/4')), 'hasil tidak bergantung urutan masukan');
  ok(nama.length === 10 && nama[0] === 'uji09', 'daftar asli tidak diubah');
}

console.log('\n--- Pemasangan ---');
{
  const j = readFileSync(`${P}/uji/jalankan.mjs`, 'utf8');
  ok(j.includes("from '../scripts/uji-shard.mjs'") && j.includes('--shard'), 'jalankan.mjs memakai --shard');
  const y = readFileSync(`${P}/.github/workflows/uji.yml`, 'utf8').replace(/\r\n/g, '\n');
  const bagian = (y.match(/shard:\s*\[([^\]]+)\]/) ?? [])[1]?.split(',').map((x) => Number(x.trim())) ?? [];
  const dari = Number((y.match(/--shard=\$\{\{ matrix\.shard \}\}\/(\d+)/) ?? [])[1]);
  ok(bagian.length >= 2 && bagian.length === dari && bagian.every((n, i) => n === i + 1), `matriks CI [${bagian}] cocok dengan pembagi /${dari}`);
  ok(!/fetch-depth/.test(y), 'CI cukup clone dangkal: uji migrasi memakai snapshot skema di supabase/riwayat, bukan riwayat git');
  ok(/pull_request:/.test(y) && /push:\s*\n\s+branches:\s*\[main\]/.test(y), 'berjalan pada pull request dan push ke main');
  ok(/permissions:\n\s+contents: read\n/.test(y), 'izin minimal (hanya baca)');
  ok(/npm run build/.test(y) && /npm ci/.test(y), 'CI membangun aplikasi dan memasang dependensi dari lockfile');
  ok(readdirSync(`${P}/uji`).length > 20, 'folder uji terbaca');
  ok(/git status --porcelain/.test(y), 'CI menggagalkan proses bila uji mengubah atau membuat berkas di repositori');
}

console.log(`\nRINGKASAN SHARD: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
