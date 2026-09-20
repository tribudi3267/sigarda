import { useApp } from '../context/AppContext';
import { APP, GUDEP } from '../config';
import { PERAN } from '../lib/skuLogic';
import Footer from './Footer';
import LogoMark from './LogoMark';
import { Icon } from './ui';

/**
 * Menu di header (layar md ke atas) selalu menampilkan ikon; TULISAN menu dan NAMA pengguna hanya bila cukup lebar.
 * Kebutuhan lebar bertambah menurut jumlah menu (terukur: sekitar 108px per menu berlabel, ditambah logo dan tombol akun),
 * jadi ambangnya dipilih menurut jumlah menu. Nama kelas ditulis utuh karena Tailwind tidak membaca nama kelas yang dirangkai.
 */
const TAMPILAN_HEADER = {
  12: { label: 'hidden min-[1780px]:inline', labelSr: 'sr-only min-[1780px]:hidden', nama: 'hidden', wadah: 'max-w-[120rem]' },
  11: { label: 'hidden min-[1680px]:inline', labelSr: 'sr-only min-[1680px]:hidden', nama: 'hidden', wadah: 'max-w-[110rem]' },
  10: { label: 'hidden min-[1560px]:inline', labelSr: 'sr-only min-[1560px]:hidden', nama: 'hidden', wadah: 'max-w-[100rem]' },
  9: { label: 'hidden min-[1460px]:inline', labelSr: 'sr-only min-[1460px]:hidden', nama: 'hidden min-[1640px]:block', wadah: 'max-w-[100rem]' },
  8: { label: 'hidden min-[1360px]:inline', labelSr: 'sr-only min-[1360px]:hidden', nama: 'hidden min-[1540px]:block', wadah: 'max-w-[100rem]' },
  0: { label: 'hidden xl:inline', labelSr: 'sr-only xl:hidden', nama: 'hidden xl:block', wadah: 'max-w-6xl' },
};
const tampilanHeader = (jumlahMenu) => TAMPILAN_HEADER[jumlahMenu >= 12 ? 12 : jumlahMenu >= 8 ? jumlahMenu : 0];

export default function Layout({ nav, tab, setTab, children }) {
  const { user, peranUser, logout } = useApp();
  const tampil = tampilanHeader(nav.length);

  // Peserta: peran turunan (Penegak Calon Bantara/Laksana/Garuda). Penguji: jabatan.
  const labelPeran =
    user.role === 'peserta' ? PERAN[peranUser]?.label : user.role === 'penguji' ? user.jabatan : 'Admin Gudep';

  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print sticky top-0 z-40 border-b-4 border-emas bg-pramuka-800 text-pramuka-50">
        <div className={`mx-auto flex ${tampil.wadah} items-center gap-3 px-4 py-3`}>
          <button
            onClick={() => setTab(nav[0].id)}
            className="flex min-w-0 items-center gap-3 text-left md:shrink-0"
            aria-label={`${APP.nama}, ke halaman utama`}
          >
            <LogoMark size={42} />
            <span className="min-w-0 leading-tight">
              <span className="block font-display text-lg font-bold tracking-[0.12em]">{APP.nama}</span>
              <span className="hidden truncate text-[11px] text-pramuka-300 sm:block">{APP.kepanjangan}</span>
              <span className="block truncate text-[11px] text-pramuka-300 sm:hidden">{GUDEP.singkat}</span>
            </span>
          </button>

          {/* min-w-0 + overflow-x-auto: bila ruang kurang, menu yang bergulir ke samping; tidak pernah menimpa logo */}
          <nav className="ml-auto hidden min-w-0 gap-1 overflow-x-auto md:flex" aria-label="Menu utama">
            {nav.map((n) => (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                aria-current={tab === n.id ? 'page' : undefined}
                title={n.label}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors xl:px-3 ${
                  tab === n.id ? 'bg-pramuka-900 text-emas-light' : 'text-pramuka-200 hover:bg-pramuka-700'
                }`}
              >
                <Icon nama={n.ikon} className="h-4 w-4" />
                <span className={tampil.label}>{n.label}</span>
                <span className={tampil.labelSr}>{n.label}</span>
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <button
              onClick={() => setTab('akun')}
              aria-current={tab === 'akun' ? 'page' : undefined}
              aria-label="Akun saya"
              className={`flex items-center gap-2 rounded-lg p-2 text-left hover:bg-pramuka-700 ${tab === 'akun' ? 'bg-pramuka-900' : ''}`}
            >
              <span className={`max-w-[11rem] text-right leading-tight ${tampil.nama}`}>
                <span className="block truncate text-sm font-semibold">{user.nama}</span>
                <span className="block truncate text-xs text-pramuka-300">{labelPeran}</span>
              </span>
              <Icon nama="akun" className="h-5 w-5 text-pramuka-200" />
            </button>
            <button onClick={logout} className="rounded-lg p-2 text-pramuka-200 hover:bg-pramuka-700" aria-label="Keluar">
              <Icon nama="keluar" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 pt-5">{children}</main>

      <Footer />

      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-pramuka-200 bg-white md:hidden" aria-label="Menu utama">
        {/* overscroll-x-contain: bila geseran menu sudah mentok, tidak diteruskan ke halaman (halaman tidak ikut bergeser).
            touch-pan-x + overflow-y-hidden: sentuhan pada menu hanya dipakai menggeser menu ke samping; pada halaman yang panjang
            (bisa di-scroll vertikal), geseran yang agak miring tidak lagi direbut oleh scroll halaman. */}
        <ul className="mx-auto flex max-w-lg touch-pan-x overflow-x-auto overflow-y-hidden overscroll-x-contain">
          {nav.map((n) => (
            <li key={n.id} className="min-w-[60px] flex-1">
              <button
                onClick={() => setTab(n.id)}
                aria-current={tab === n.id ? 'page' : undefined}
                className={`flex w-full flex-col items-center gap-0.5 border-t-2 py-2 text-[11px] font-semibold ${
                  tab === n.id ? 'border-emas text-pramuka-800' : 'border-transparent text-pramuka-500'
                }`}
              >
                <Icon nama={n.ikon} className="h-5 w-5" />
                {n.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
