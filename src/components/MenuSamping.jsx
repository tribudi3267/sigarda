import { APP } from '../config';
import { useGudep } from '../lib/gudepStore';
import LogoMark from './LogoMark';
import MenuAkun from './MenuAkun';
import { Icon, LencanaMenu } from './ui';

/**
 * Menu samping kiri (layar md ke atas: tablet, laptop, PC). Kelompok menurut fungsi, dapat diciutkan menjadi ikon saja,
 * dan akun pengguna (nama tampilan) selalu ada di bagian bawah.
 */
export default function MenuSamping({ grup, tab, setTab, ciut, setCiut, pertama }) {
  const G = useGudep();
  return (
    <aside
      className={`no-print fixed inset-y-0 left-0 z-40 hidden flex-col bg-pramuka-800 text-pramuka-50 transition-[width] duration-200 md:flex ${ciut ? 'w-[4.5rem]' : 'w-60'}`}
      aria-label="Menu samping"
    >
      <div className="border-b-4 border-emas">
        <button
          onClick={() => setTab(pertama)}
          className={`flex w-full items-center gap-3 px-3.5 py-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emas ${ciut ? 'justify-center' : ''}`}
          aria-label={`${APP.nama}, ke halaman utama`}
        >
          <LogoMark size={40} />
          {!ciut && (
            <span className="min-w-0 leading-tight">
              <span className="block font-display text-lg font-bold tracking-[0.12em]">{APP.nama}</span>
              <span className="block truncate text-[11px] text-pramuka-300">{G.singkat}</span>
            </span>
          )}
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-3" aria-label="Menu utama">
        {grup.map((g, i) => (
          <div key={g.judul} role="group" aria-label={g.judul} className={i ? 'mt-4' : ''}>
            {ciut ? (
              i > 0 && <div className="mx-3 mb-2 border-t border-pramuka-700" aria-hidden="true" />
            ) : (
              <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-emas-light/80">{g.judul}</p>
            )}
            <ul className="space-y-0.5">
              {g.item.map((n) => {
                const aktif = tab === n.id;
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => setTab(n.id)}
                      aria-current={aktif ? 'page' : undefined}
                      title={ciut ? n.label : undefined}
                      className={`group relative flex w-full items-center gap-3 rounded-lg py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emas ${
                        ciut ? 'justify-center px-0' : 'px-3'
                      } ${aktif ? 'bg-pramuka-900 text-emas-light' : 'text-pramuka-200 hover:bg-pramuka-700 hover:text-pramuka-50'}`}
                    >
                      {aktif && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r bg-emas" aria-hidden="true" />}
                      <span className="relative shrink-0">
                        <Icon nama={n.ikon} className="h-[18px] w-[18px]" />
                        {ciut && <LencanaMenu jumlah={n.lencana} posisi="absolute -right-2 -top-1.5" />}
                      </span>
                      {ciut ? <span className="sr-only">{n.label}</span> : <span className="truncate">{n.label}</span>}
                      {!ciut && <span className="ml-auto"><LencanaMenu jumlah={n.lencana} /></span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-pramuka-700 p-2.5">
        <MenuAkun varian={ciut ? 'ikon' : 'kartu'} tab={tab} setTab={setTab} />
        <button
          onClick={() => setCiut(!ciut)}
          aria-pressed={ciut}
          title={ciut ? 'Lebarkan menu' : 'Ciutkan menu'}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-pramuka-300 hover:bg-pramuka-700 hover:text-pramuka-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emas ${ciut ? 'justify-center px-0' : ''}`}
        >
          <Icon nama="panahKanan" className={`h-3.5 w-3.5 transition-transform ${ciut ? '' : 'rotate-180'}`} />
          {ciut ? <span className="sr-only">Lebarkan menu</span> : 'Ciutkan menu'}
        </button>
      </div>
    </aside>
  );
}
