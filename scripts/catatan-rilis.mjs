/**
 * Membuat catatan rilis untuk sebuah perubahan terhadap cabang dasar: migrasi SQL yang harus dijalankan dan Edge Function yang harus di-deploy.
 *   node scripts/catatan-rilis.mjs [dasar=origin/main] [kepala=HEAD] [--keluar=<berkas>]
 * Dipakai `npm run catatan-rilis` (pratinjau lokal) dan .github/workflows/catatan-rilis.yml (komentar otomatis pada pull request).
 * Hanya membaca git; tidak menjalankan migrasi atau deploy.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { susunCatatanRilis, urutanMigrasiReadme } from './catatan-rilis-lib.mjs';

const akar = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: akar, encoding: 'utf8', maxBuffer: 1 << 26 });
const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dasar = pos[0] ?? 'origin/main';
const kepala = pos[1] ?? 'HEAD';
const keluar = process.argv.find((a) => a.startsWith('--keluar='))?.slice(9);

// Tiga titik: perubahan cabang ini sejak bercabang dari dasar (bukan perubahan main yang belum ada di cabang).
const berkas = git('diff', '--name-status', '--no-renames', `${dasar}...${kepala}`)
  .split('\n').filter(Boolean).map((l) => { const [status, ...p] = l.split('\t'); return { status, path: p.join('\t') }; });
const skemaBerubah = berkas.some((b) => b.path === 'supabase/skema.sql');
const readme = readFileSync(path.join(akar, 'README.md'), 'utf8');
const hasil = susunCatatanRilis({ berkas, skemaBerubah, urutanReadme: urutanMigrasiReadme(readme) });

if (keluar) writeFileSync(keluar, hasil.markdown);
else process.stdout.write(hasil.markdown);
