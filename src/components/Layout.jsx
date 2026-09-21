import { useState } from 'react';
import { APP } from '../config';
import { useApp } from '../context/AppContext';
import { KETERANGAN_STATUS, statusAnggota } from '../lib/naikKelasLogic';
import { useGudep } from '../lib/gudepStore';
import BilahTampilan from './BilahTampilan';
import Footer from './Footer';
import LogoMark from './LogoMark';
import MenuAkun from './MenuAkun';
import MenuBawah from './MenuBawah';
import MenuSamping from './MenuSamping';

const KUNCI_CIUT = 'sigarda_menu_ciut';

/** Menu samping dibuka lebar di layar lebar, dan ciut (ikon saja) di tablet; pilihan pengguna diingat di peramban ini. */
const bacaCiut = () => {
  try {
    const simpan = localStorage.getItem(KUNCI_CIUT);
    if (simpan !== null) return simpan === '1';
  } catch { /* abaikan */ }
  return typeof window !== 'undefined' && window.innerWidth < 1024;
};

/**
 * Kerangka halaman setelah masuk.
 *  - Tablet, laptop, PC (md ke atas): menu samping kiri berkelompok (dapat diciutkan); akun di bagian bawahnya.
 *  - Ponsel: header ringkas (merek dan akun) dan menu ikon di bawah yang dapat digeser, dengan panah penunjuk menu tersembunyi.
 * Nama tampilan akun selalu terlihat di tempat yang sama: bawah menu samping, atau kanan atas header ponsel.
 * `nav` = daftar datar semua menu, `grup` = [{ judul, item }].
 */
export default function Layout({ nav, grup, tab, setTab, children }) {
  const G = useGudep();
  const { user, hanyaLihatSaya } = useApp();
  const [ciut, setCiutState] = useState(bacaCiut);
  const setCiut = (nilai) => {
    setCiutState(nilai);
    try { localStorage.setItem(KUNCI_CIUT, nilai ? '1' : '0'); } catch { /* abaikan */ }
  };

  return (
    <div className="min-h-screen">
      <MenuSamping grup={grup} tab={tab} setTab={setTab} ciut={ciut} setCiut={setCiut} pertama={nav[0].id} />

      <div className={`flex min-h-screen flex-col transition-[padding] duration-200 print:pl-0 ${ciut ? 'md:pl-[4.5rem]' : 'md:pl-60'}`}>
        <header className="no-print sticky top-0 z-40 border-b-4 border-emas bg-pramuka-800 text-pramuka-50 md:hidden">
          <div className="mx-auto flex items-center gap-2 px-4 py-2.5">
            <button
              onClick={() => setTab(nav[0].id)}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              aria-label={`${APP.nama}, ke halaman utama`}
            >
              <LogoMark size={38} />
              <span className="min-w-0 leading-tight">
                <span className="block font-display text-base font-bold tracking-[0.12em]">{APP.nama}</span>
                <span className="block truncate text-[11px] text-pramuka-300">{G.singkat}</span>
              </span>
            </button>
            <MenuAkun varian="ringkas" tab={tab} setTab={setTab} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 pt-5">
          {hanyaLihatSaya && (
            <p role="status" className="no-print mb-4 rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
              Akun Anda berstatus <b>{statusAnggota(user) === 'alumni' ? 'alumni' : 'nonaktif'}</b>. {KETERANGAN_STATUS[statusAnggota(user)]} Untuk aktif kembali, hubungi Pembina atau Admin Gudep.
            </p>
          )}
          <BilahTampilan />
          {children}
        </main>

        <Footer ciut={ciut} />
      </div>

      <MenuBawah nav={nav} tab={tab} setTab={setTab} />
    </div>
  );
}
