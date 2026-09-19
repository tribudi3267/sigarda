import { useEffect, useMemo } from 'react';
import { PERAN, URUTAN_PERAN } from '../lib/skuLogic';
import { urutAlami, urutTeks } from '../lib/format';
import { Icon } from './ui';

export const FILTER_AWAL = { q: '', sangga: '', kelas: '', peran: '', agama: '' };

export const terapkanFilter = (daftar, f) =>
  daftar.filter(
    (u) =>
      (!f.sangga || u.sangga === f.sangga) &&
      (!f.kelas || u.kelas === f.kelas) &&
      (!f.peran || u.peran === f.peran) &&
      (!f.agama || u.agama === f.agama) &&
      (!f.q || `${u.nama} ${u.nis ?? ''}`.toLowerCase().includes(f.q.trim().toLowerCase()))
  );

const unik = (daftar, kunci, urut) => [...new Set(daftar.map((u) => u[kunci]).filter(Boolean))].sort(urut);
const TAMPIL_STANDAR = ['sangga', 'kelas', 'peran'];

/**
 * Filter data anggota. Semua pilihan (sangga, kelas, peran, agama) dibangun dari `data`,
 * yaitu daftar peserta yang belum disaring, sehingga otomatis mengikuti data yang masuk.
 * Pilihan yang datanya sudah tidak ada akan dikosongkan sendiri.
 *
 * tampil: kolom mana saja yang dipakai, mis. ['sangga', 'kelas', 'peran'].
 */
export default function FilterBar({ data, filter, setFilter, tampil = TAMPIL_STANDAR }) {
  const opsi = useMemo(
    () => ({
      sangga: unik(data, 'sangga', urutTeks),
      kelas: unik(data, 'kelas', urutAlami),
      peran: URUTAN_PERAN.filter((p) => data.some((u) => u.peran === p)),
      agama: unik(data, 'agama', urutTeks),
    }),
    [data]
  );

  // Bila nilai yang dipilih sudah tidak ada pada data (mis. anggota dihapus), kembalikan ke "semua"
  useEffect(() => {
    const salah = tampil.filter((k) => filter[k] && !opsi[k].includes(filter[k]));
    if (salah.length) setFilter({ ...filter, ...Object.fromEntries(salah.map((k) => [k, ''])) });
  }, [opsi, filter, setFilter, tampil]);

  const ubah = (k) => (e) => setFilter({ ...filter, [k]: e.target.value });
  const aktif = filter.q || tampil.some((k) => filter[k]);

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1">
        <Icon nama="cari" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pramuka-400" />
        <input
          className="input pl-9"
          placeholder="Cari nama atau NIS"
          value={filter.q}
          onChange={ubah('q')}
          aria-label="Cari nama atau NIS"
        />
      </div>

      {tampil.includes('sangga') && (
        <select className="input w-full sm:w-44" value={filter.sangga} onChange={ubah('sangga')} aria-label="Filter sangga">
          <option value="">Semua sangga</option>
          {opsi.sangga.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {tampil.includes('kelas') && (
        <select className="input w-full sm:w-36" value={filter.kelas} onChange={ubah('kelas')} aria-label="Filter kelas">
          <option value="">Semua kelas</option>
          {opsi.kelas.map((k) => <option key={k} value={k}>Kelas {k}</option>)}
        </select>
      )}
      {tampil.includes('peran') && (
        <select className="input w-full sm:w-44" value={filter.peran} onChange={ubah('peran')} aria-label="Filter peran">
          <option value="">Semua peran</option>
          {opsi.peran.map((p) => <option key={p} value={p}>{PERAN[p].singkat}</option>)}
        </select>
      )}
      {tampil.includes('agama') && (
        <select className="input w-full sm:w-36" value={filter.agama} onChange={ubah('agama')} aria-label="Filter agama">
          <option value="">Semua agama</option>
          {opsi.agama.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      )}

      {aktif && (
        <button
          type="button"
          className="text-sm font-semibold text-pramuka-700 underline underline-offset-2 hover:text-pramuka-900"
          onClick={() => setFilter({ ...FILTER_AWAL })}
        >
          Bersihkan filter
        </button>
      )}
    </div>
  );
}
