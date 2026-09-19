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

// VITE_BASE dipakai saat deploy ke GitHub Pages, mis. VITE_BASE=/sigarda/
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE || '/',
  plugins: [backendLokal(mode === 'lokal'), react()],
  // Edge Function memakai alamat gaya Deno ("npm:..."); di sini dialihkan ke paket yang terpasang (mode lokal).
  resolve: { alias: { 'npm:@supabase/supabase-js@2': '@supabase/supabase-js' } },
  // PGlite memuat berkas .wasm sendiri; jangan diproses ulang oleh pra-bundel Vite.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
}));
