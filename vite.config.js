import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const BOOT_LOKAL = fileURLToPath(new URL('./src/lokal/bootLokal.js', import.meta.url));

/**
 * Modul virtual `virtual:backend-lokal`.
 *  - mode "lokal" (`npm run dev:lokal`) : memuat src/lokal/bootLokal.js (Postgres di browser, PGlite).
 *  - mode lain, termasuk build produksi : diganti stub kosong. Ini mencegah PGlite (belasan MB) ikut ke hasil build;
 *    tanpa ini Rollup tetap menelusuri import() pada cabang yang mati dan menyalin berkas .wasm-nya ke dist.
 */
const backendLokal = (aktif) => ({
  name: 'sigarda-backend-lokal',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'virtual:backend-lokal') return aktif ? BOOT_LOKAL : '\0virtual:backend-lokal';
    return null;
  },
  load(id) {
    if (id === '\0virtual:backend-lokal') {
      return 'export const bootLokal = () => { throw new Error("Backend lokal tidak tersedia pada build ini."); };';
    }
    return null;
  },
});

/**
 * Versi terbit: tiap build punya ID unik (juga tertanam di kode sebagai __BUILD_ID__) dan menerbitkan version.json berisi ID itu. Aplikasi yang
 * masih terbuka memeriksanya berkala dan menawarkan "Muat ulang" (lihat src/lib/versi.js). Hanya untuk build produksi.
 */
const ID_BUILD = (process.env.GITHUB_SHA || '').slice(0, 8) + Date.now().toString(36);
const versiTerbit = (aktif) => ({
  name: 'sigarda-versi',
  generateBundle() {
    if (aktif) this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: ID_BUILD }) });
  },
});

// VITE_BASE dipakai saat deploy ke GitHub Pages, mis. VITE_BASE=/sigarda/
export default defineConfig(({ mode, command }) => ({
  base: process.env.VITE_BASE || '/',
  plugins: [backendLokal(mode === 'lokal'), versiTerbit(command === 'build' && mode !== 'lokal'), react()],
  define: { __BUILD_ID__: JSON.stringify(command === 'build' && mode !== 'lokal' ? ID_BUILD : '') },
  // Edge Function memakai alamat gaya Deno ("npm:..."); di sini dialihkan ke paket yang terpasang (mode lokal).
  resolve: { alias: { 'npm:@supabase/supabase-js@2': '@supabase/supabase-js' } },
  // PGlite memuat berkas .wasm sendiri; jangan diproses ulang oleh pra-bundel Vite.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
}));
