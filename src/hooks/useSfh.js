import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { susunGudepSfh } from '../lib/perlindunganLogic';

/**
 * Catatan Safe From Harm dan penerima laporan gugus depan (Tahap 4), dimuat saat komponen tampil. Pembina dan Admin menerima semua catatan; pengguna lain hanya catatan miliknya
 * (RLS). `gudep` selalu berbentuk lengkap (kosong bila belum diisi). `muat()` memuat ulang; `galat` kosong bila berhasil (pada basis data yang belum dimigrasi berisi pesan).
 */
export default function useSfh() {
  const { api } = useApp();
  const [data, setData] = useState({ catatan: [], gudep: susunGudepSfh(null) });
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');
  const muat = useCallback(async () => {
    const r = await api().muatSfh();
    if (r.ok) { setData({ catatan: r.data.catatan, gudep: susunGudepSfh(r.data.gudep) }); setGalat(''); } else setGalat(r.pesan ?? 'Catatan Safe From Harm tidak dapat dimuat.');
    setMemuat(false);
  }, [api]);
  useEffect(() => { muat(); }, [muat]);
  return { ...data, memuat, galat, muat };
}
