import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { pembinaAtauAdmin } from '../lib/hakLogic';
import AsistenIuran from '../components/AsistenIuran';
import KasIuran from '../components/KasIuran';
import LembarIuran from '../components/LembarIuran';
import PengaturanIuran from '../components/PengaturanIuran';
import RekapIuran from '../components/RekapIuran';

/**
 * Menu Iuran bumbung kepramukaan.
 *   Dewan Ambalan : Catat, Rekap, Kas (tutup kas), Asisten
 *   Asisten       : Catat, Rekap
 *   Pembina/Admin : Rekap, Kas (lihat), Asisten (Pembina menunjuk; Admin melihat), Pengaturan (standar, ambang, batas nilai)
 *   Penegak       : Rekap (iuran sendiri dan total sangga, kelas, gudep)
 */
export default function Iuran() {
  const { user, pencatatIuran } = useApp();
  const pengurus = user.role !== 'peserta';
  const tab = [
    ...(pencatatIuran ? [{ id: 'catat', label: 'Catat' }] : []),
    { id: 'rekap', label: 'Rekap' },
    ...(pengurus ? [{ id: 'kas', label: 'Kas' }, { id: 'asisten', label: 'Asisten' }] : []),
    ...(pembinaAtauAdmin(user) ? [{ id: 'pengaturan', label: 'Pengaturan' }] : []),
  ];
  const [aktif, setAktif] = useState(tab[0].id);
  const dipakai = tab.some((t) => t.id === aktif) ? aktif : tab[0].id;

  return (
    <div className="animasi-naik">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Iuran bumbung kepramukaan</h1>
        <p className="text-sm text-pramuka-600">Iuran rutin latihan Jumat, dicatat oleh Dewan Ambalan atau asisten bendahara.</p>
      </div>

      <div role="tablist" aria-label="Bagian iuran" className="mb-4 inline-flex flex-wrap rounded-lg bg-pramuka-100 p-1">
        {tab.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={dipakai === t.id}
            onClick={() => setAktif(t.id)}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${dipakai === t.id ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-700 hover:bg-pramuka-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {dipakai === 'catat' && <LembarIuran />}
      {dipakai === 'rekap' && <RekapIuran />}
      {dipakai === 'kas' && <KasIuran />}
      {dipakai === 'asisten' && <AsistenIuran />}
      {dipakai === 'pengaturan' && <PengaturanIuran />}
    </div>
  );
}
