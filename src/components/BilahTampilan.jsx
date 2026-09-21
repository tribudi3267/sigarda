import { useApp } from '../context/AppContext';

const PILIHAN = [
  { id: 'penegak', label: 'Penegak' },
  { id: 'dewan', label: 'Dewan' },
];

/**
 * Penegak berjabatan Dewan Ambalan memilih tampilan: Penegak (Poin SKU sendiri, absensi, iuran) atau Dewan (antrian, peserta, sesi, iuran pengurus).
 * Hanya mengubah tampilan; hak sebenarnya ditegakkan server dari data akun. Tidak tampil bagi anggota lain.
 */
export default function BilahTampilan() {
  const { punyaDewan, mode, ubahMode, akun } = useApp();
  if (!punyaDewan) return null;
  return (
    <div role="group" aria-label="Tampilan akun" className="no-print mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-pramuka-200 bg-pramuka-50 px-3 py-2">
      <p className="min-w-0 text-sm text-pramuka-800">
        <span className="font-semibold">{akun.jabatanDewan}</span> Dewan Ambalan
        <span className="hidden text-pramuka-600 sm:inline"> · pilih tampilan sesuai yang sedang Anda kerjakan</span>
      </p>
      <div className="inline-flex rounded-lg bg-pramuka-100 p-1" role="radiogroup" aria-label="Tampilan">
        {PILIHAN.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={mode === p.id}
            onClick={() => ubahMode(p.id)}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold ${mode === p.id ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-700 hover:bg-pramuka-200'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
