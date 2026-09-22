/**
 * Menjalankan model profil muat (scripts/profil/model.mjs): membundel dengan esbuild (agar dapat mengimpor src/), lalu menjalankannya di Node.
 *   npm run profil [-- --cpu=6 --server=40 --dist=<folder build> --json=<berkas>]
 * Lihat model.mjs untuk semua pilihan. Hanya membaca; tidak menyentuh Supabase produksi.
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const akar = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const supabaseJs = createRequire(import.meta.url).resolve('@supabase/supabase-js');
fs.mkdirSync(path.join(akar, '.uji', 'tmp'), { recursive: true });
const keluar = path.join(akar, '.uji', 'profil-model.mjs');

await build({
  entryPoints: [path.join(akar, 'scripts', 'profil', 'model.mjs')], outfile: keluar, bundle: true, platform: 'node', format: 'esm',
  external: ['@electric-sql/pglite', 'exceljs', 'node:*', 'virtual:backend-lokal'], define: { 'import.meta.env': '{}' },
  alias: { 'npm:@supabase/supabase-js@2': supabaseJs, 'npm:web-push@3.6.7': path.join(akar, 'uji', 'palsu', 'web-push.mjs') },
  loader: { '.ts': 'ts' }, jsx: 'automatic', logLevel: 'silent',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const r = spawnSync('node', [keluar, ...process.argv.slice(2)], { cwd: akar, stdio: 'inherit', maxBuffer: 1 << 26 });
process.exit(r.status ?? 1);
