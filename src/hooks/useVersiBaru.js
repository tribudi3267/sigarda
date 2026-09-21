import { useEffect, useState } from 'react';
import { adaVersiBaru, ambilVersiTerbit, ID_BUILD } from '../lib/versi';

const JEDA_MS = 10 * 60 * 1000;

/** true bila versi aplikasi yang terbit berbeda dari yang sedang berjalan (diperiksa tiap 10 menit dan saat halaman kembali terlihat). */
export default function useVersiBaru() {
  const [baru, setBaru] = useState(false);
  useEffect(() => {
    if (!ID_BUILD) return undefined;
    let batal = false;
    const periksa = async () => {
      if (document.visibilityState !== 'visible') return;
      const jauh = await ambilVersiTerbit(import.meta.env.BASE_URL);
      if (!batal && adaVersiBaru(ID_BUILD, jauh)) setBaru(true);
    };
    const t = setInterval(periksa, JEDA_MS);
    document.addEventListener('visibilitychange', periksa);
    return () => { batal = true; clearInterval(t); document.removeEventListener('visibilitychange', periksa); };
  }, []);
  return baru;
}
