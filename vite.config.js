import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE dipakai saat deploy ke GitHub Pages, mis. VITE_BASE=/sku-bukateja/
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
});
