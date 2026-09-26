import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';

/**
 * Isian data diri dan tanggal lahir milik Penegak yang masuk (Tahap 3, H1), dimuat saat komponen tampil. `muat()` memuat ulang (sesudah menyimpan).
 * `galat` kosong bila berhasil; pada basis data yang belum dimigrasi berisi pesan dan datanya kosong. `siap` = sudah selesai dimuat (berhasil atau tidak).
 */
export default function useIsianSaya(aktif = true) {
  const { api } = useApp();
  const [data, setData] = useState({ isian: {}, lahir: null });
  const [siap, setSiap] = useState(!aktif);
  const [galat, setGalat] = useState('');
  const muat = useCallback(async () => {
    const r = await api().muatIsian();
    if (r.ok) { setData(r.data); setGalat(''); } else setGalat(r.pesan ?? 'Data diri tidak dapat dimuat.');
    setSiap(true);
  }, [api]);
  useEffect(() => { if (aktif) muat(); }, [aktif, muat]);
  return { ...data, siap, galat, muat };
}
