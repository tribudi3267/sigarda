/**
 * Menyalakan backend lokal di browser: Postgres (PGlite) tersimpan di IndexedDB, dengan skema dan data contoh.
 * Hanya dimuat saat VITE_BACKEND=lokal (`npm run dev:lokal`). Tidak ikut ke build produksi.
 */
import { buatKlienFake, siapkanPg } from './klienFake';
import { isiDataContoh, isiStatusContoh } from './seedLokal';
import { isiInstrumenContoh } from './instrumenContoh';
import { bacaParameterUji } from './parameterUji';
import { masukCepat } from './masukCepat';
import { isiSekolahPenuh } from './sekolahPenuh';

const NAMA_DB_DASAR = 'sigarda-lokal';
const NAMA_DB_PENUH = 'sigarda-lokal-penuh'; // ?data=penuh: data sekolah penuh (ratusan Penegak), terpisah dari data contoh biasa
const hapusDb = (nama) => new Promise((selesai) => {
  const req = indexedDB.deleteDatabase(`/pglite/${nama}`);
  req.onsuccess = req.onerror = req.onblocked = () => selesai();
});
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
  const uji = bacaParameterUji(window.location.search);
  const NAMA_DB = uji.penuh ? NAMA_DB_PENUH : NAMA_DB_DASAR;
  if (uji.ulang) await hapusDb(NAMA_DB);
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
    await isiStatusContoh(pg);
    await isiInstrumenContoh(pg);
    if (uji.penuh) {
      document.title = 'Menyiapkan data sekolah penuh...';
      const ringkas = await isiSekolahPenuh(pg, { kemajuan: (teks) => console.info('[data penuh]', teks) });
      console.info('[data penuh] selesai', ringkas);
      document.title = 'SIGARDA';
    }
  }

  const klien = buatKlienFake(pg, penyimpanSesi);
  // Masuk cepat tanpa PIN untuk pengujian (?masuk=pembina). Parameter dibuang dari alamat agar muat ulang tidak mengulanginya.
  if (uji.masuk) {
    const r = await masukCepat(pg, klien, uji.masuk);
    if (!r.ok) console.warn('[masuk cepat]', r.pesan);
  }
  if (uji.masuk || uji.ulang) window.history.replaceState(null, '', window.location.pathname + (uji.penuh ? '?data=penuh' : ''));

  return {
    klien,
    /** Menghapus seluruh data lokal lalu memuat ulang halaman (data contoh dibuat lagi). */
    async reset() {
      penyimpanSesi.simpan(null);
      await pg.close();
      await hapusDb(NAMA_DB);
      window.location.reload();
    },
  };
}
