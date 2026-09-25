/**
 * Menjalankan skrip simulasi (bukan pengujian; TIDAK ikut `npm run uji`) di atas Postgres lokal (PGlite): dibundel dengan esbuild seperti uji/jalankan.mjs lalu dijalankan.
 *   npm run simulasi:pra-uji                        skenario bawaan (sebaran Dewan apa adanya)
 *   npm run simulasi:pra-uji -- --skenario=lengkap  Bina Damping dan Pinsa dipenuhi seideal mungkin (pembanding)
 * Laporan ditulis ke .uji/simulasi-pra-uji-<skenario>.json dan ringkasannya dicetak.
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const akar = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const supabaseJs = createRequire(import.meta.url).resolve('@supabase/supabase-js');
const keluarDir = path.join(akar, '.uji');
fs.mkdirSync(path.join(keluarDir, 'tmp'), { recursive: true });
const skrip = process.argv[2];
if (!skrip) { console.error('Sebutkan skrip, mis. scripts/simulasi-pra-uji.mjs'); process.exit(2); }
const keluar = path.join(keluarDir, `${path.basename(skrip, '.mjs')}.mjs`);
await build({
  entryPoints: [path.resolve(akar, skrip)], outfile: keluar, bundle: true, platform: 'node', format: 'esm',
  external: ['@electric-sql/pglite', 'exceljs', 'node:*', 'virtual:backend-lokal'], define: { 'import.meta.env': '{}' },
  alias: { 'npm:@supabase/supabase-js@2': supabaseJs, 'npm:web-push@3.6.7': path.join(akar, 'uji', 'palsu', 'web-push.mjs') },
  loader: { '.ts': 'ts', '.png': 'dataurl' }, jsx: 'automatic', logLevel: 'silent',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const r = spawnSync('node', [keluar, ...process.argv.slice(3)], { cwd: akar, stdio: 'inherit', timeout: 3600000 });
process.exit(r.status ?? 1);
