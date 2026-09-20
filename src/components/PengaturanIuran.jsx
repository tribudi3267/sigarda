import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { PENGATURAN_IURAN_BAWAAN, periksaPengaturanIuran, rupiah, saranNilaiIuran } from '../lib/iuranLogic';

const ISIAN = [
  { kunci: 'ambang', label: 'Batas rutin (nilai 4)', ket: 'Persen pertemuan beriuran yang dianggap rutin. Juga menjadi garis merah pada rekap.' },
  { kunci: 'lima', label: 'Batas nilai 5', ket: 'Persen pertemuan beriuran untuk nilai terbaik.' },
  { kunci: 'tiga', label: 'Batas nilai 3', ket: 'Di bawah batas rutin tetapi masih cukup.' },
  { kunci: 'dua', label: 'Batas nilai 2', ket: 'Di bawahnya nilai saran 1.' },
];

/**
 * Pengaturan iuran bumbung untuk Pembina dan Admin: iuran standar (dasar rekomendasi iuran susulan), ambang rutin, dan batas persen
 * untuk saran nilai kriteria iuran pada butir Bantara 6 dan Laksana 6. Perubahan berlaku untuk penilaian berikutnya; nilai yang sudah
 * tersimpan tidak berubah (snapshot saran ikut tersimpan pada rincian penilaian).
 */
export default function PengaturanIuran() {
  const { pengaturanIuran, simpanPengaturanIuran } = useApp();
  const [isi, setIsi] = useState(() => Object.fromEntries(Object.entries(pengaturanIuran).map(([k, v]) => [k, String(v)])));
  const [proses, setProses] = useState(false);

  useEffect(() => {
    setIsi(Object.fromEntries(Object.entries(pengaturanIuran).map(([k, v]) => [k, String(v)])));
  }, [pengaturanIuran]);

  const angka = Object.fromEntries(Object.entries(isi).map(([k, v]) => [k, /^\d+$/.test(String(v).trim()) ? Number(v) : NaN]));
  const galat = periksaPengaturanIuran(angka);
  const berubah = Object.keys(PENGATURAN_IURAN_BAWAAN).some((k) => angka[k] !== pengaturanIuran[k]);
  const sama = Object.keys(PENGATURAN_IURAN_BAWAAN).every((k) => angka[k] === PENGATURAN_IURAN_BAWAAN[k]);

  const simpan = async (e) => {
    e.preventDefault();
    if (galat || proses) return;
    setProses(true);
    await simpanPengaturanIuran(angka);
    setProses(false);
  };

  return (
    <form onSubmit={simpan} className="space-y-4">
      <section className="panel p-4 text-sm leading-relaxed text-pramuka-700">
        <p>
          Pengaturan ini menentukan <b>saran nilai</b> kriteria iuran pada butir SKU Bantara 6 dan Laksana 6 serta rekomendasi iuran susulan. Penguji tetap boleh
          mengubah nilai saran dengan catatan alasan. Perubahan berlaku untuk penilaian berikutnya; penilaian yang sudah tersimpan tidak berubah.
        </p>
      </section>

      <section className="panel p-4">
        <label className="block text-sm font-semibold text-pramuka-800" htmlFor="iuran-standar">Iuran standar per pertemuan (Rp)</label>
        <p className="text-xs text-pramuka-500">Dasar rekomendasi iuran susulan. Kelipatan Rp 500, antara Rp 500 dan Rp 50.000.</p>
        <input
          id="iuran-standar"
          inputMode="numeric"
          className="input mt-1.5 w-40"
          value={isi.standar ?? ''}
          onChange={(e) => setIsi((d) => ({ ...d, standar: e.target.value }))}
        />
        {Number.isFinite(angka.standar) && <span className="ml-2 text-sm text-pramuka-600">{rupiah(angka.standar)}</span>}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {ISIAN.map((f) => (
            <div key={f.kunci}>
              <label className="block text-sm font-semibold text-pramuka-800" htmlFor={`iuran-${f.kunci}`}>{f.label} (%)</label>
              <p className="text-xs text-pramuka-500">{f.ket}</p>
              <input
                id={`iuran-${f.kunci}`}
                inputMode="numeric"
                className="input mt-1.5 w-28"
                value={isi[f.kunci] ?? ''}
                onChange={(e) => setIsi((d) => ({ ...d, [f.kunci]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        {!galat && (
          <p className="mt-4 rounded-md bg-pramuka-50 px-3 py-2 text-xs text-pramuka-700" aria-live="polite">
            Contoh: beriuran 70% pertemuan mendapat saran nilai <b>{saranNilaiIuran(70, angka)}</b>; 80% mendapat <b>{saranNilaiIuran(80, angka)}</b>; 95% mendapat <b>{saranNilaiIuran(95, angka)}</b>.
          </p>
        )}
        {galat && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{galat}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-gold" disabled={!!galat || !berubah || proses}>Simpan pengaturan</button>
          <button type="button" className="btn btn-outline btn-sm" disabled={sama || proses} onClick={() => setIsi(Object.fromEntries(Object.entries(PENGATURAN_IURAN_BAWAAN).map(([k, v]) => [k, String(v)])))}>
            Kembalikan ke bawaan
          </button>
        </div>
      </section>
    </form>
  );
}
