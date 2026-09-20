import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { PERAN } from '../lib/skuLogic';
import { Avatar, Icon } from './ui';

/** Tempat kartu akun muncul: di atas tombol (menu samping lebar), di samping (menu samping ciut), atau di bawah (header ponsel). */
const POSISI = {
  atas: 'absolute bottom-full left-0 mb-2 w-72',
  samping: 'absolute bottom-0 left-full ml-2 w-72',
  bawah: 'absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-1.5rem)]',
};

const bisaHover = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

/**
 * Akun yang sedang masuk: SELALU menampilkan nama tampilan (bukan nama pengguna) di tempat yang sama pada semua halaman.
 * Diarahkan kursor (perangkat berkursor) atau diklik/disentuh akan membuka kartu berisi keterangan akun (tanpa PIN) dan
 * menu: Pengaturan akun (ganti PIN), Reset PIN anggota (Dewan, Pembina, Admin), dan Keluar.
 *   varian: 'kartu' (menu samping lebar), 'ikon' (menu samping ciut), 'ringkas' (header ponsel)
 */
export default function MenuAkun({ varian, tab, setTab }) {
  const { user, peranUser, logout } = useApp();
  const [buka, setBuka] = useState(false);
  const [sematkan, setSematkan] = useState(false);
  const pembungkus = useRef(null);
  const penunda = useRef(null);
  const posisi = varian === 'kartu' ? 'atas' : varian === 'ikon' ? 'samping' : 'bawah';
  const pengurus = user.role !== 'peserta';
  const labelPeran = user.role === 'peserta' ? PERAN[peranUser]?.label ?? 'Penegak' : user.role === 'penguji' ? user.jabatan : 'Admin Gudep';

  const tutup = () => { clearTimeout(penunda.current); setBuka(false); setSematkan(false); };

  useEffect(() => {
    if (!buka) return undefined;
    const saatTekan = (e) => { if (pembungkus.current && !pembungkus.current.contains(e.target)) tutup(); };
    const saatTombol = (e) => { if (e.key === 'Escape') tutup(); };
    document.addEventListener('mousedown', saatTekan);
    document.addEventListener('touchstart', saatTekan);
    document.addEventListener('keydown', saatTombol);
    return () => {
      document.removeEventListener('mousedown', saatTekan);
      document.removeEventListener('touchstart', saatTekan);
      document.removeEventListener('keydown', saatTombol);
    };
  }, [buka]);
  useEffect(() => () => clearTimeout(penunda.current), []);

  const masuk = () => { if (!bisaHover()) return; clearTimeout(penunda.current); setBuka(true); };
  const keluar = () => { if (!bisaHover() || sematkan) return; penunda.current = setTimeout(() => setBuka(false), 260); };
  const klik = () => {
    if (buka && sematkan) tutup();
    else { clearTimeout(penunda.current); setBuka(true); setSematkan(true); }
  };
  const pergi = (t) => { tutup(); setTab(t); };

  const rincian = [
    user.role === 'peserta' && ['NIS', user.nis || '-'],
    user.role === 'peserta' && ['Kelas', user.kelas],
    user.role === 'peserta' && ['Sangga', user.sangga],
    user.role === 'peserta' && ['Agama', user.agama],
    pengurus && ['Nama pengguna', user.username],
  ].filter(Boolean);
  const aktif = tab === 'akun' || tab === 'resetpin';

  const tombol = {
    kartu: (
      <span className={`flex w-full items-center gap-2.5 rounded-lg p-2 text-left ${aktif ? 'bg-pramuka-900' : 'hover:bg-pramuka-700'}`}>
        <Avatar nama={user.nama} ukuran="h-9 w-9" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="line-clamp-2 break-words text-sm font-semibold text-pramuka-50">{user.nama}</span>
          <span className="block truncate text-xs text-pramuka-300">{labelPeran}</span>
        </span>
        <Icon nama="panahAtas" className={`h-4 w-4 shrink-0 text-pramuka-300 transition-transform ${buka ? '' : 'rotate-180'}`} />
      </span>
    ),
    ikon: (
      <span className={`flex items-center justify-center rounded-lg p-1.5 ${aktif ? 'bg-pramuka-900' : 'hover:bg-pramuka-700'}`}>
        <Avatar nama={user.nama} ukuran="h-9 w-9" />
      </span>
    ),
    ringkas: (
      <span className={`flex max-w-[11rem] items-center gap-2 rounded-lg py-1 pl-1 pr-2 ${aktif ? 'bg-pramuka-900' : 'hover:bg-pramuka-700'}`}>
        <Avatar nama={user.nama} ukuran="h-8 w-8" />
        <span className="min-w-0 truncate text-sm font-semibold">{user.nama}</span>
      </span>
    ),
  }[varian];

  return (
    <div ref={pembungkus} className="relative" onMouseEnter={masuk} onMouseLeave={keluar}>
      <button
        type="button"
        onClick={klik}
        aria-haspopup="dialog"
        aria-expanded={buka}
        aria-label={`Akun ${user.nama}`}
        title={varian === 'ikon' ? user.nama : undefined}
        className="block w-full rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emas"
      >
        {tombol}
      </button>

      {buka && (
        <div role="dialog" aria-label="Akun saya" className={`${POSISI[posisi]} animasi-naik z-[70] overflow-hidden rounded-xl border border-pramuka-200 bg-white text-pramuka-900 shadow-2xl`}>
          <div className="flex items-center gap-3 bg-pramuka-800 px-4 py-3 text-pramuka-50">
            <Avatar nama={user.nama} ukuran="h-11 w-11" />
            <div className="min-w-0 leading-tight">
              <p className="truncate font-semibold">{user.nama}</p>
              <p className="truncate text-xs text-emas-light">{labelPeran}</p>
            </div>
          </div>

          {rincian.length > 0 && (
            <dl className="divide-y divide-pramuka-100 px-4 py-1 text-sm">
              {rincian.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-1.5">
                  <dt className="text-pramuka-500">{k}</dt>
                  <dd className="truncate text-right font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="border-t border-pramuka-100 p-1.5">
            <button type="button" onClick={() => pergi('akun')} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-pramuka-50">
              <Icon nama="akun" className="h-4 w-4 text-pramuka-500" /> Pengaturan akun
              <span className="ml-auto text-[11px] font-normal text-pramuka-400">ganti PIN</span>
            </button>
            {pengurus && (
              <button type="button" onClick={() => pergi('resetpin')} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-pramuka-50">
                <Icon nama="kunci" className="h-4 w-4 text-pramuka-500" /> Reset PIN anggota
              </button>
            )}
            <button type="button" onClick={() => { tutup(); logout(); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50">
              <Icon nama="keluar" className="h-4 w-4" /> Keluar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
