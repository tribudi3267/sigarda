import { useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { gabungPengaturanInstrumen, KUNCI_PENGATURAN_INSTRUMEN } from '../lib/instrumenLogic';

/**
 * Menjamin instrumen penilaian sudah dimuat (sekali per sesi; permintaan yang sama dipakai bersama) dan menyediakannya.
 *   const { instrumen, siap, pengaturan, galat } = useInstrumen();
 * `instrumen` = { [skuId]: { status, caraUji, instruksi, kriteria } }. Sebelum `siap`, jangan menyimpulkan bahwa sebuah butir tanpa instrumen.
 * Pada database yang belum dimigrasi `instrumen` kosong dan `galat` berisi pesannya; penilaian lama tetap berjalan.
 */
export default function useInstrumen() {
  const { instrumen, instrumenSiap, instrumenGalat, pastikanInstrumen, pengaturan } = useApp();
  useEffect(() => {
    if (!instrumenSiap) pastikanInstrumen();
  }, [instrumenSiap, pastikanInstrumen]);
  const png = useMemo(() => gabungPengaturanInstrumen(pengaturan[KUNCI_PENGATURAN_INSTRUMEN]), [pengaturan]);
  return { instrumen, siap: instrumenSiap, pengaturan: png, galat: instrumenGalat };
}
