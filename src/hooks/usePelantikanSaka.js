import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';

/**
 * Pelantikan dan keanggotaan Saka yang boleh dilihat pengguna (Penegak: miliknya; pengurus: semua; dibatasi RLS), dimuat saat komponen tampil.
 * `muat()` memuat ulang (dipakai sesudah mencatat). `galat` kosong bila berhasil; pada basis data yang belum dimigrasi berisi pesan dan datanya kosong.
 */
export default function usePelantikanSaka() {
  const { api } = useApp();
  const [data, setData] = useState({ pelantikan: [], saka: [] });
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');
  const muat = useCallback(async () => {
    setMemuat(true);
    const r = await api().muatPelantikanSaka();
    if (r.ok) { setData(r.data); setGalat(''); } else setGalat(r.pesan ?? 'Data pelantikan tidak dapat dimuat.');
    setMemuat(false);
  }, [api]);
  useEffect(() => { muat(); }, [muat]);
  return { ...data, memuat, galat, muat };
}
