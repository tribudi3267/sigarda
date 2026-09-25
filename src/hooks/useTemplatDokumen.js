import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';

/**
 * Templat isi dokumen (rubrik surat keterangan guru) yang boleh dibaca Pembina dan Admin (Tahap 3, H1). `muat()` memuat ulang (sesudah menyimpan). `galat` kosong bila berhasil;
 * pada basis data yang belum dimigrasi berisi pesan dan daftarnya kosong.
 */
export default function useTemplatDokumen() {
  const { api } = useApp();
  const [templat, setTemplat] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');
  const sudah = useRef(false); // penanda memuat hanya pada pemuatan pertama (memuat ulang sesudah menyimpan tidak mengosongkan tampilan)
  const muat = useCallback(async () => {
    if (!sudah.current) setMemuat(true);
    const r = await api().muatTemplatDokumen();
    if (r.ok) { setTemplat(r.data); setGalat(''); } else setGalat(r.pesan ?? 'Templat dokumen tidak dapat dimuat.');
    sudah.current = true;
    setMemuat(false);
  }, [api]);
  useEffect(() => { muat(); }, [muat]);
  return { templat, memuat, galat, muat };
}
