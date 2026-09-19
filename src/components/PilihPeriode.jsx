import { useApp } from '../context/AppContext';
import { daftarTahunAjaran, periodeDari, PERIODE, tahunAjaranDari } from '../lib/absensiLogic';
import { hariIni } from '../lib/format';

export const periodeAwal = () => ({ ta: tahunAjaranDari(hariIni()), periode: periodeDari(hariIni()) });

/**
 * Pilih tahun ajaran dan periode (semester ganjil, genap, atau satu tahun ajaran).
 * Daftar tahun ajaran dibangun dari data absensi yang ada.
 */
export default function PilihPeriode({ nilai, ubah, tanpaSetahun = false }) {
  const { absensi } = useApp();
  const tahun = daftarTahunAjaran(absensi);
  const periode = Object.entries(PERIODE).filter(([k]) => !(tanpaSetahun && k === 'setahun'));
  const periodeSah = periode.some(([k]) => k === nilai.periode) ? nilai.periode : periode[0][0];

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <select
        className="input w-auto"
        value={nilai.ta}
        onChange={(e) => ubah({ ...nilai, ta: e.target.value })}
        aria-label="Tahun ajaran"
      >
        {tahun.map((t) => <option key={t} value={t}>Tahun ajaran {t}</option>)}
      </select>
      <select
        className="input w-auto"
        value={periodeSah}
        onChange={(e) => ubah({ ...nilai, periode: e.target.value })}
        aria-label="Periode"
      >
        {periode.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  );
}
