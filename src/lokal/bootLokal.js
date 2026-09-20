/**
 * Menyalakan backend lokal di browser: Postgres (PGlite) tersimpan di IndexedDB, dengan skema dan data contoh.
 * Hanya dimuat saat VITE_BACKEND=lokal (`npm run dev:lokal`). Tidak ikut ke build produksi.
 */
import { buatKlienFake, siapkanPg } from './klienFake';
import { isiDataContoh } from './seedLokal';
import { isiInstrumenContoh } from './instrumenContoh';

const NAMA_DB = 'sigarda-lokal';
const KUNCI_SESI = 'sigarda_lokal_sesi';

const penyimpanSesi = {
  ambil: () => {
    try { return JSON.parse(localStorage.getItem(KUNCI_SESI)); } catch { return null; }
  },
  simpan: (nilai) => {
    try { nilai ? localStorage.setItem(KUNCI_SESI, JSON.stringify(nilai)) : localStorage.removeItem(KUNCI_SESI); } catch { /* abaikan */ }
  },
};

export async function bootLokal() {
  const [{ PGlite }, stub, skema] = await Promise.all([
    import('@electric-sql/pglite'),
    import('../../supabase/lokal/stub.sql?raw'),
    import('../../supabase/skema.sql?raw'),
  ]);
  const pg = new PGlite(`idb://${NAMA_DB}`);
  await pg.waitReady;

  const sudahAda = (await pg.query("select to_regclass('public.profiles') as t")).rows[0].t;
  if (!sudahAda) {
    await siapkanPg(pg, { sqlStub: stub.default, sqlSkema: skema.default });
    await isiDataContoh(pg);
    await isiInstrumenContoh(pg);
  }

  return {
    klien: buatKlienFake(pg, penyimpanSesi),
    /** Menghapus seluruh data lokal lalu memuat ulang halaman (data contoh dibuat lagi). */
    async reset() {
      penyimpanSesi.simpan(null);
      await pg.close();
      await new Promise((selesai) => {
        const req = indexedDB.deleteDatabase(`/pglite/${NAMA_DB}`);
        req.onsuccess = req.onerror = req.onblocked = () => selesai();
      });
      window.location.reload();
    },
  };
}
