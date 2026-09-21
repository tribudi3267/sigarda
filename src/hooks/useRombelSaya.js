import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { FILTER_AWAL } from '../components/FilterBar';
import { filterEfektif, rombelSaya, tahunAjaranKini } from '../lib/rombelLogic';

/**
 * Rombel yang ditugaskan kepada pengguna (Pembina atau Dewan Ambalan) pada tahun ajaran berjalan; larik kosong untuk Admin, untuk penguji
 * yang belum ditugaskan, dan selama penugasan belum termuat (halaman lalu menampilkan semua, aturan lama). Penugasan dimuat sekali per
 * sesi bila belum ada; halaman Antrian dan Dashboard memuat ulang sendiri.
 */
export default function useRombelSaya() {
  const { user, penugasan, muatPenugasan } = useApp();
  const ta = tahunAjaranKini();
  const penguji = user?.role === 'penguji';
  const termuat = penugasan[ta] != null;
  useEffect(() => { if (penguji && !termuat) muatPenugasan(ta); }, [penguji, termuat, ta, muatPenugasan]);
  return useMemo(() => (penguji ? rombelSaya(penugasan[ta], user.id) : []), [penguji, penugasan, ta, user?.id]);
}

/**
 * Keadaan filter daftar Penegak untuk halaman pengurus. Awalnya "Hanya rombel saya" menyala (bila pengguna punya rombel tugas).
 * `filter` dan `setFilter` untuk FilterBar; `efektif` untuk terapkanFilter dan ekspor (sudah membawa daftar rombel yang berlaku).
 */
export function useFilterRombel(awalSaya = true) {
  const rombel = useRombelSaya();
  const [filter, setFilter] = useState(() => ({ ...FILTER_AWAL, saya: awalSaya }));
  const efektif = useMemo(() => filterEfektif(filter, rombel), [filter, rombel]);
  return { filter, setFilter, efektif, rombelSaya: rombel };
}
