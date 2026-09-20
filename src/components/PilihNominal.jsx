import { useEffect, useState } from 'react';
import { NOMINAL_TOMBOL, adalahNominalTombol, bacaJumlah, rupiah } from '../lib/iuranLogic';

/**
 * Pilihan nominal iuran: tombol Rp 500 sampai Rp 5.000 (kelipatan Rp 500), satu kolom untuk angka lain, dan penghapus.
 *   nilai   = jumlah tercatat (angka) atau null
 *   onUbah  = (jumlah | null) => void; menekan tombol yang sedang aktif mengosongkannya (tidak iuran)
 * Kolom manual dikirim saat Enter ditekan atau saat kolom ditinggalkan; angka yang sama dengan tombol ikut menandai tombolnya.
 */
export default function PilihNominal({ nilai, onUbah, disabled = false, label = 'Iuran', kelas = '' }) {
  const [teks, setTeks] = useState('');
  const [galat, setGalat] = useState('');

  // Kolom manual hanya menampilkan angka yang bukan salah satu tombol
  useEffect(() => {
    setTeks(nilai != null && !adalahNominalTombol(nilai) ? String(nilai) : '');
    setGalat('');
  }, [nilai]);

  const kirimManual = () => {
    const h = bacaJumlah(teks);
    if (!h.ok) { setGalat(h.pesan); return; }
    setGalat('');
    if (teks.trim() === '') {
      if (nilai != null && !adalahNominalTombol(nilai)) onUbah(null); // kolom manual dikosongkan = hapus angka manual
      return; // kolom kosong saat tombol nominal aktif: tidak ada perubahan
    }
    if (h.nilai !== nilai) onUbah(h.nilai);
  };

  return (
    <div className={kelas} role="group" aria-label={label}>
      <div className="flex flex-wrap items-center gap-1">
        {NOMINAL_TOMBOL.map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            aria-pressed={nilai === n}
            title={nilai === n ? `${rupiah(n)} (tekan lagi untuk menghapus)` : rupiah(n)}
            onClick={() => onUbah(nilai === n ? null : n)}
            className={`min-w-[2.9rem] rounded-md px-1.5 py-1 text-[11px] font-semibold ring-1 ring-inset transition-colors disabled:opacity-50 ${
              nilai === n ? 'bg-emas text-pramuka-900 ring-emas' : 'bg-white text-pramuka-700 ring-pramuka-300 hover:bg-pramuka-100'
            }`}
          >
            {n.toLocaleString('id-ID')}
          </button>
        ))}
        <input
          type="text"
          inputMode="numeric"
          disabled={disabled}
          value={teks}
          onChange={(e) => setTeks(e.target.value)}
          onBlur={kirimManual}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); kirimManual(); } }}
          placeholder="Lainnya"
          aria-label={`${label}: jumlah lain (angka)`}
          aria-invalid={galat ? 'true' : undefined}
          className={`h-[1.65rem] w-[4.6rem] rounded-md px-1.5 text-[11px] ring-1 ring-inset disabled:opacity-50 ${
            nilai != null && !adalahNominalTombol(nilai) ? 'bg-emas/20 font-semibold ring-emas' : 'bg-white ring-pramuka-300'
          }`}
        />
        {nilai != null && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onUbah(null)}
            className="rounded-md px-1.5 py-1 text-[11px] font-semibold text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50 disabled:opacity-50"
            title="Hapus iuran (tidak iuran)"
          >
            Hapus
          </button>
        )}
      </div>
      {galat && <p role="alert" className="mt-1 text-[11px] font-medium text-red-700">{galat}</p>}
    </div>
  );
}
