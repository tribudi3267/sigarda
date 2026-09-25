import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';

/**
 * Tim penilai Calon Garuda dan kalender tahap Garuda dari Kwarcab (hanya pengurus yang dapat membaca; dibatasi RLS), dimuat saat komponen tampil.
 * `muat()` memuat ulang (sesudah menyimpan). `galat` kosong bila berhasil; pada basis data yang belum dimigrasi berisi pesan dan datanya kosong.
 */
export default function useTimKalender() {
  const { api } = useApp();
  const [data, setData] = useState({ tim: [], tahap: [] });
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');
  const muat = useCallback(async () => {
    setMemuat(true);
    const r = await api().muatTimKalender();
    if (r.ok) { setData(r.data); setGalat(''); } else setGalat(r.pesan ?? 'Data tim penilai dan kalender tidak dapat dimuat.');
    setMemuat(false);
  }, [api]);
  useEffect(() => { muat(); }, [muat]);
  return { ...data, memuat, galat, muat };
}
