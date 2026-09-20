import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './ui';

/**
 * Panah penunjuk bahwa masih ada menu tersembunyi di sisi itu. Muncul hanya bila memang ada yang tersembunyi dan hilang
 * lagi bila sudah tergeser sampai ujung. Dapat disentuh untuk menggeser satu layar.
 */
function PanahGeser({ arah, tampil, onKlik }) {
  const kiri = arah === 'kiri';
  return (
    <button
      type="button"
      onClick={onKlik}
      tabIndex={tampil ? 0 : -1}
      aria-hidden={!tampil}
      aria-label={kiri ? 'Geser menu ke kiri: masih ada menu lain' : 'Geser menu ke kanan: masih ada menu lain'}
      className={`absolute inset-y-0 z-10 flex w-12 touch-manipulation items-center transition-opacity duration-300 focus:outline-none ${
        kiri ? 'left-0 justify-start bg-gradient-to-r pl-1' : 'right-0 justify-end bg-gradient-to-l pr-1'
      } from-white via-white/90 to-transparent ${tampil ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      <span className={`panah-geser ${kiri ? 'panah-geser-kiri' : 'panah-geser-kanan'} flex h-6 w-6 items-center justify-center rounded-full bg-pramuka-800 text-emas-light ring-1 ring-emas/70`}>
        <Icon nama="panah" className={`h-3.5 w-3.5 ${kiri ? 'rotate-180' : ''}`} />
      </span>
    </button>
  );
}

/**
 * Menu bawah untuk ponsel: ikon dapat digeser ke kiri dan kanan berapa pun jumlahnya. Panah bercahaya di tepi kiri atau kanan
 * menunjukkan masih ada menu yang tersembunyi di sisi itu.
 */
export default function MenuBawah({ nav, tab, setTab }) {
  const daftar = useRef(null);
  const [tersembunyi, setTersembunyi] = useState({ kiri: false, kanan: false });

  const ukur = useCallback(() => {
    const el = daftar.current;
    if (!el) return;
    const kiri = el.scrollLeft > 4;
    const kanan = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setTersembunyi((d) => (d.kiri === kiri && d.kanan === kanan ? d : { kiri, kanan }));
  }, []);

  useEffect(() => {
    ukur();
    const el = daftar.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const pengamat = new ResizeObserver(ukur);
    pengamat.observe(el);
    return () => pengamat.disconnect();
  }, [ukur, nav.length]);

  // Menu yang aktif digeser ke tengah bila tersembunyi (tanpa menggulung halaman)
  useEffect(() => {
    const el = daftar.current;
    const aktif = el?.querySelector('[aria-current="page"]')?.parentElement;
    if (!el || !aktif) return;
    const tujuan = aktif.offsetLeft - (el.clientWidth - aktif.offsetWidth) / 2;
    el.scrollTo({ left: Math.max(0, tujuan), behavior: 'smooth' });
  }, [tab]);

  const geser = (arah) => {
    const el = daftar.current;
    if (el) el.scrollBy({ left: arah * el.clientWidth * 0.7, behavior: 'smooth' });
  };

  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-pramuka-200 bg-white md:hidden" aria-label="Menu utama">
      <div className="relative mx-auto max-w-lg">
        {/* overscroll-x-contain: geseran yang sudah mentok tidak diteruskan ke halaman. touch-pan-x + overflow-y-hidden: sentuhan pada menu
            hanya dipakai menggeser menu ke samping, tidak direbut scroll halaman yang panjang. */}
        <ul ref={daftar} onScroll={ukur} className="flex touch-pan-x overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {nav.map((n) => (
            <li key={n.id} className="min-w-[64px] flex-1">
              <button
                onClick={() => setTab(n.id)}
                aria-current={tab === n.id ? 'page' : undefined}
                className={`flex w-full flex-col items-center gap-0.5 border-t-2 pb-1 pt-2.5 text-[11px] font-semibold ${
                  tab === n.id ? 'border-emas text-pramuka-900' : 'border-transparent text-pramuka-500'
                }`}
              >
                {/* Menu yang sedang dibuka: ikon dibayangi cahaya emas yang berdenyut, senada dengan panah geser */}
                <span className={`flex h-6 w-10 items-center justify-center rounded-full ${tab === n.id ? 'ikon-aktif text-pramuka-900' : ''}`}>
                  <Icon nama={n.ikon} className="h-5 w-5" />
                </span>
                {n.label}
              </button>
            </li>
          ))}
        </ul>
        <PanahGeser arah="kiri" tampil={tersembunyi.kiri} onKlik={() => geser(-1)} />
        <PanahGeser arah="kanan" tampil={tersembunyi.kanan} onKlik={() => geser(1)} />
      </div>
    </nav>
  );
}
