import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ChipButir from './ChipButir';
import { Icon } from './ui';

const CELAH = 6; // gap-1.5
const TOMBOL = 'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-pramuka-700 ring-1 ring-inset ring-pramuka-300 transition-colors hover:bg-pramuka-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emas';

/**
 * Baris "Terkait butir:" pada kartu materi. Selalu SATU baris di lebar layar mana pun: lencana yang tidak muat disembunyikan otomatis
 * dan diwakili tombol "+N". Tombol itu membuka semua lencana (boleh lebih dari satu baris); "Sembunyikan" menutupnya kembali.
 * Lebar tiap lencana diukur pada lapisan tak terlihat (font dan ukuran sama), lalu dihitung berapa yang muat bersama tombolnya.
 * Lencana yang sedang dipakai sebagai saringan diutamakan agar tidak ikut tersembunyi.
 */
export default function TerkaitButir({ ids, aktif = '', onKlik }) {
  const urut = aktif && ids.includes(aktif) ? [aktif, ...ids.filter((id) => id !== aktif)] : ids;
  const n = urut.length;
  const wadah = useRef(null);
  const ukur = useRef(null);
  const [muat, setMuat] = useState(n); // jumlah lencana yang muat pada satu baris
  const [buka, setBuka] = useState(false);
  const kunci = urut.join('|');

  const hitung = useCallback(() => {
    const lebar = wadah.current?.clientWidth ?? 0;
    const anak = ukur.current?.children;
    if (!lebar || !anak || anak.length < n + 3) return;
    const label = anak[0].offsetWidth;
    const chip = Array.from({ length: n }, (_, i) => anak[i + 1].offsetWidth);
    const plus = anak[n + 1].offsetWidth; // "+N"
    let terpakai = label;
    let jumlah = 0;
    for (let i = 0; i < n; i += 1) {
      const sisa = n - i - 1;
      const tambah = terpakai + CELAH + chip[i];
      if (tambah + (sisa > 0 ? CELAH + plus : 0) > lebar) break;
      terpakai = tambah;
      jumlah += 1;
    }
    setMuat((d) => (d === jumlah ? d : jumlah));
  }, [n]);

  useLayoutEffect(() => {
    hitung();
    const el = wadah.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const pengamat = new ResizeObserver(hitung);
    pengamat.observe(el);
    return () => pengamat.disconnect();
  }, [hitung, kunci]);

  // Font web yang baru selesai dimuat mengubah lebar lencana
  useEffect(() => {
    document.fonts?.ready?.then(hitung);
  }, [hitung, kunci]);

  const tersembunyi = n - muat;
  const lipat = tersembunyi > 0;
  const tampil = lipat && !buka ? urut.slice(0, muat) : urut;
  const teksTombol = muat === 0 ? `${n} butir` : `+${tersembunyi}`;

  return (
    <div ref={wadah} className="relative mt-2 overflow-hidden">
      {/* Lapisan ukur: tidak terlihat, tidak mengubah tata letak */}
      <div ref={ukur} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex w-max items-center gap-1.5 whitespace-nowrap">
        <span className="text-xs">Terkait butir:</span>
        {urut.map((id) => <ChipButir key={id} id={id} />)}
        <span className={TOMBOL}>+{n}<Icon nama="panahBawah" className="h-3 w-3" /></span>
        <span className={TOMBOL}>{n} butir<Icon nama="panahBawah" className="h-3 w-3" /></span>
      </div>

      <div className={`flex items-center gap-1.5 ${lipat && buka ? 'flex-wrap' : 'flex-nowrap'}`}>
        <span className="shrink-0 whitespace-nowrap text-xs text-pramuka-500">Terkait butir:</span>
        {tampil.map((id) => <ChipButir key={id} id={id} aktif={id === aktif} onKlik={onKlik} />)}
        {lipat && (
          <button
            type="button"
            className={TOMBOL}
            aria-expanded={buka}
            title={buka ? 'Sembunyikan sebagian butir' : `Tampilkan semua ${n} butir terkait`}
            onClick={() => setBuka((b) => !b)}
          >
            {buka ? 'Sembunyikan' : teksTombol}
            <Icon nama={buka ? 'panahAtas' : 'panahBawah'} className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
