/**
 * Membuat klien basis data.
 *
 *  - Produksi / pengembangan biasa : klien Supabase sungguhan (VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY).
 *  - `npm run dev:lokal`           : Postgres di dalam browser (PGlite) dengan skema dan Edge Function yang sama,
 *                                    tanpa akun Supabase. Kode lokal tidak ikut ke build produksi.
 */
import { createClient } from '@supabase/supabase-js';

export const LOKAL = import.meta.env.VITE_BACKEND === 'lokal';
export const GALAT_KONFIGURASI = 'KONFIGURASI_SUPABASE_KOSONG';

let janji = null;

/** Mengembalikan { klien, lokal } sekali saja. `lokal` (hanya mode lokal) berisi reset(). */
export function ambilKlien() {
  janji ??= (async () => {
    if (LOKAL) {
      const { bootLokal } = await import('virtual:backend-lokal'); // stub kosong di luar mode lokal (lihat vite.config.js)
      const b = await bootLokal();
      return { klien: b.klien, lokal: { reset: b.reset } };
    }
    const url = import.meta.env.VITE_SUPABASE_URL;
    const kunci = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !kunci) throw new Error(GALAT_KONFIGURASI);
    return {
      klien: createClient(url, kunci, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }),
      lokal: null,
    };
  })();
  return janji;
}
