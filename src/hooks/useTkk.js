import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { AMBANG_TKK_BAWAAN } from '../data/tkkData';

/**
 * Capaian TKK, TKK Krida, dan ambang kesiapan Garuda yang boleh dilihat pengguna (Penegak: miliknya; pengurus: semua; dibatasi RLS), dimuat saat komponen tampil.
 * `muat()` memuat ulang (sesudah mencatat). `galat` kosong bila berhasil; pada basis data yang belum dimigrasi berisi pesan dan datanya kosong (ambang = bawaan).
 */
export default function useTkk() {
  const { api } = useApp();
  const [data, setData] = useState({ capaian: [], krida: [], ambang: AMBANG_TKK_BAWAAN });
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');
  const muat = useCallback(async () => {
    setMemuat(true);
    const r = await api().muatTkk(AMBANG_TKK_BAWAAN);
    if (r.ok) { setData(r.data); setGalat(''); } else setGalat(r.pesan ?? 'Data TKK tidak dapat dimuat.');
    setMemuat(false);
  }, [api]);
  useEffect(() => { muat(); }, [muat]);
  return { ...data, memuat, galat, muat };
}
