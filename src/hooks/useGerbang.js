import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { GERBANG_BAWAAN } from '../lib/gerbangLogic';

/**
 * Tanggal lahir Penegak dan aturan gerbang calon Garuda yang boleh dilihat pengguna (pengurus: semua; Penegak: miliknya; dibatasi RLS), dimuat saat komponen tampil.
 * `muat()` memuat ulang (sesudah mengisi). `galat` kosong bila berhasil; pada basis data yang belum dimigrasi berisi pesan dan datanya kosong (aturan = bawaan).
 */
export default function useGerbang() {
  const { api } = useApp();
  const [data, setData] = useState({ lahir: [], aturan: GERBANG_BAWAAN });
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');
  const muat = useCallback(async () => {
    setMemuat(true);
    const r = await api().muatGerbang(GERBANG_BAWAAN);
    if (r.ok) { setData(r.data); setGalat(''); } else setGalat(r.pesan ?? 'Data gerbang calon tidak dapat dimuat.');
    setMemuat(false);
  }, [api]);
  useEffect(() => { muat(); }, [muat]);
  return { ...data, memuat, galat, muat };
}
