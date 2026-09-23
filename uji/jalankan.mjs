/**
 * Menjalankan pengujian di folder uji/ (Postgres sungguhan lewat PGlite, tanpa Supabase).
 *   npm run uji                       semua pengujian
 *   npm run uji -- iuran api          hanya yang disebut (nama berkas tanpa .mjs)
 *   npm run uji -- --shard=2/4        hanya bagian ke-2 dari 4 (dipakai CI paralel; lihat scripts/uji-shard.mjs)
 *   PENUH=40 npm run uji -- api       tampilkan 40 baris terakhir keluaran (bawaan: hanya ringkasan)
 * Tiap berkas dibundel dengan esbuild (agar dapat mengimpor src/ langsung), lalu dijalankan sebagai proses Node terpisah.
 * Berkas uji mencetak baris "ok" atau "GAGAL" dan satu baris RINGKASAN; kode keluar bukan nol bila ada yang gagal.
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { pilihShard } from '../scripts/uji-shard.mjs';

const akar = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Dicari lewat Node (bukan jalur tetap) agar juga jalan di git worktree, yang memakai node_modules milik repo induk.
const supabaseJs = createRequire(import.meta.url).resolve('@supabase/supabase-js');
const keluarDir = path.join(akar, '.uji');
fs.mkdirSync(path.join(keluarDir, 'tmp'), { recursive: true });

const semua = fs.readdirSync(path.join(akar, 'uji')).filter((f) => f.endsWith('.mjs') && f !== 'jalankan.mjs').map((f) => f.replace(/\.mjs$/, ''));
const argumen = process.argv.slice(2);
const diminta = argumen.filter((a) => !a.startsWith('--'));
const spekShard = (argumen.find((a) => a.startsWith('--shard=')) ?? '').slice('--shard='.length);
const salah = argumen.filter((a) => a.startsWith('--') && !a.startsWith('--shard='));
if (salah.length) { console.error(`Opsi tidak dikenal: ${salah.join(', ')}. Yang ada: --shard=i/n`); process.exit(2); }
let daftar = diminta.length ? diminta : semua;
if (argumen.some((a) => a.startsWith('--shard='))) {
  try { daftar = pilihShard(daftar, spekShard); } catch (e) { console.error(e.message); process.exit(2); }
}
const tidakAda = daftar.filter((n) => !semua.includes(n));
if (tidakAda.length) { console.error(`Pengujian tidak ada: ${tidakAda.join(', ')}. Tersedia: ${semua.join(', ')}`); process.exit(2); }

let gagal = 0;
for (const nama of daftar) {
  const keluar = path.join(keluarDir, `${nama}.mjs`);
  try {
    await build({
      entryPoints: [path.join(akar, 'uji', `${nama}.mjs`)], outfile: keluar, bundle: true, platform: 'node', format: 'esm',
      external: ['@electric-sql/pglite', 'exceljs', 'node:*', 'virtual:backend-lokal'], define: { 'import.meta.env': '{}' }, // komponen halaman mengimpor AppContext (supabaseClient)
      alias: { 'npm:@supabase/supabase-js@2': supabaseJs, 'npm:web-push@3.6.7': path.join(akar, 'uji', 'palsu', 'web-push.mjs') },
      loader: { '.ts': 'ts', '.png': 'dataurl' /* gambar (logo kop) dibundel sebagai data URL */ }, jsx: 'automatic', logLevel: 'silent',
      banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    });
  } catch (e) { console.log(`### ${nama}: GAGAL BUNDEL ${String(e.message).split('\n')[0]}`); gagal += 1; continue; }

  const r = spawnSync('node', [keluar], { cwd: akar, encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 26 });
  const teks = (r.stdout || '') + (r.stderr || '');
  if (process.env.PENUH) { console.log(`--- ${nama} (kode ${r.status}) ---\n${teks.split('\n').slice(-Number(process.env.PENUH)).join('\n')}`); if (r.status !== 0) gagal += 1; continue; }
  const baris = teks.split('\n');
  const ringkas = baris.filter((l) => /RINGKASAN|\d+ lulus/.test(l)).slice(-2).join(' | ') || '(tanpa ringkasan)';
  const gagalBaris = baris.filter((l) => /^GAGAL/.test(l));
  console.log(`${r.status === 0 && !gagalBaris.length ? 'OK   ' : 'GAGAL'} ${nama}: ${ringkas}`);
  gagalBaris.slice(0, 8).forEach((l) => console.log(`       ${l}`));
  if (r.status !== 0 || gagalBaris.length) { gagal += 1; if (!gagalBaris.length) console.log(baris.slice(-8).join('\n')); }
}
console.log(gagal ? `\n${gagal} dari ${daftar.length} pengujian GAGAL.` : `\nSemua ${daftar.length} pengujian lulus.`);
process.exit(gagal ? 1 : 0);
