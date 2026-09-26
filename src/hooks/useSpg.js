import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';

/**
 * Penetapan Syarat Pramuka Garuda (SPG) yang boleh dilihat pengguna (Penegak: miliknya; pengurus: semua; dibatasi RLS), dimuat saat komponen tampil.
 * `muat()` memuat ulang (sesudah menetapkan). `galat` kosong bila berhasil; pada basis data yang belum dimigrasi berisi pesan dan datanya kosong.
 */
export default function useSpg() {
  const { api } = useApp();
  const [penetapan, setPenetapan] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');
  const muat = useCallback(async () => {
    setMemuat(true);
    const r = await api().muatSpg();
    if (r.ok) { setPenetapan(r.data); setGalat(''); } else setGalat(r.pesan ?? 'Data SPG tidak dapat dimuat.');
    setMemuat(false);
  }, [api]);
  useEffect(() => { muat(); }, [muat]);
  return { penetapan, memuat, galat, muat };
}
