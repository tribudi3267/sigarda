import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { daftarSemester } from '../lib/absensiLogic';

/**
 * Menjamin kehadiran untuk tahun ajaran + periode ini sudah dimuat, memuatnya bila belum (permintaan menyusul setelah
 * filter dipilih). Halaman hanya boleh menghitung rekap ketika `siap` benar; sebelum itu semua anggota tampak "belum dicatat".
 *
 *   const { siap, galat, coba } = useAbsensiPeriode(ta, periode);   // ta/periode kosong = tidak memuat apa pun
 */
export default function useAbsensiPeriode(tahunAjaran, periode) {
  const { semesterSiap, pastikanAbsensi } = useApp();
  const ada = Boolean(tahunAjaran && periode);
  const siap = ada ? daftarSemester(tahunAjaran, periode).every((k) => semesterSiap[k]) : true;
  const [galat, setGalat] = useState('');
  const [ulang, setUlang] = useState(0);

  useEffect(() => {
    if (!ada || siap) return undefined;
    let batal = false;
    setGalat('');
    pastikanAbsensi(tahunAjaran, periode).then((r) => {
      if (!batal && !r.ok) setGalat(r.pesan || 'Data absensi belum dapat dimuat.');
    });
    return () => { batal = true; };
  }, [ada, siap, tahunAjaran, periode, ulang, pastikanAbsensi]);

  return { siap, memuat: !siap && !galat, galat, coba: () => setUlang((n) => n + 1) };
}
