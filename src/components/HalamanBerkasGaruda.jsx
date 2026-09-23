import { useEffect, useState } from 'react';
import { ambilKlien, GALAT_KONFIGURASI } from '../lib/supabaseClient';
import { buatApi } from '../lib/api';
import { KonteksApp } from '../context/AppContext';
import { tambahGudep, useGudep } from '../lib/gudepStore';
import { alamatDasar } from '../lib/verifikasiLogic';
import { APP } from '../config';
import { BerkasGarudaDokumen } from './BerkasGaruda';
import { FooterRingkas } from './Footer';
import LogoMark from './LogoMark';
import { Icon } from './ui';

/**
 * Tautan berbagi baca-saja Berkas Calon Garuda. DAPAT DIBUKA TANPA LOGIN (alamat: /?berkas=<token>). Berdiri sendiri seperti
 * HalamanVerifikasi.jsx: tidak memuat AppProvider/sesi login, hanya memanggil sg_garuda_token_baca (fungsi publik).
 * KartuSku (dipakai BerkasGarudaDokumen) butuh useApp() untuk { progress, users } -- di sini dipasok lewat KonteksApp.Provider
 * berisi data dari tautan itu sendiri, BUKAN AppProvider sungguhan (halaman ini tidak dan tidak boleh punya sesi login).
 */
export default function HalamanBerkasGaruda({ token }) {
  const G = useGudep();
  const [siap, setSiap] = useState('memuat'); // memuat | siap | konfigurasi | galat
  const [galatSambung, setGalatSambung] = useState('');
  const [data, setData] = useState(null); // { peserta, progress, portofolio, users, token } | undefined (tidak ditemukan)

  useEffect(() => {
    const lama = document.title;
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    document.title = `Berkas Calon Garuda | ${APP.nama}`;
    return () => { document.title = lama; meta.remove(); };
  }, []);

  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const { klien } = await ambilKlien();
        if (batal) return;
        const a = buatApi(klien);
        a.muatGudepPublik().then((r) => { if (r.ok && !batal) tambahGudep(r.data); });
        const r = await a.bacaTautanBerkasGaruda(token);
        if (batal) return;
        if (!r.ok) { setGalatSambung(r.pesan); setSiap('galat'); return; }
        setData(r.data ?? undefined);
        setSiap('siap');
      } catch (e) {
        if (batal) return;
        setGalatSambung(e?.message ?? String(e));
        setSiap(e?.message === GALAT_KONFIGURASI ? 'konfigurasi' : 'galat');
      }
    })();
    return () => { batal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="flex min-h-screen flex-col bg-pramuka-50">
      <header className="no-print border-b-4 border-emas bg-pramuka-800 px-4 py-5 text-pramuka-50">
        <div className="mx-auto flex max-w-3xl items-center gap-3.5">
          <LogoMark size={48} />
          <div className="leading-tight">
            <p className="font-display text-xl font-bold tracking-[0.14em]">{APP.nama}</p>
            <p className="text-xs text-emas-light">Berkas Calon Garuda (tautan berbagi)</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {siap === 'memuat' && <p className="mt-6 text-sm text-pramuka-600" role="status">Menghubungkan ke server...</p>}
        {siap === 'konfigurasi' && (
          <p className="mt-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-300" role="alert">
            Sambungan ke server belum diatur pada aplikasi ini, sehingga berkas belum dapat dibuka.
          </p>
        )}
        {siap === 'galat' && (
          <p className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-300" role="alert">
            Tidak dapat terhubung ke server. {galatSambung}
          </p>
        )}
        {siap === 'siap' && data === undefined && (
          <div className="mt-6 animasi-naik overflow-hidden rounded-xl border border-red-300 bg-white shadow-sm" role="alert">
            <div className="flex items-center gap-3 bg-red-50 px-4 py-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-700 text-white"><Icon nama="tutup" className="h-5 w-5" /></span>
              <div className="leading-tight">
                <p className="text-base font-bold text-red-900">Tautan tidak berlaku</p>
                <p className="text-xs text-red-800">Sudah dicabut, atau alamatnya salah</p>
              </div>
            </div>
            <p className="px-4 py-3 text-sm leading-relaxed text-pramuka-700">
              Tautan ini mungkin sudah dicabut oleh Pembina/Admin gudep, atau alamatnya tidak lengkap saat disalin. Hubungi Pembina Gudep untuk meminta tautan baru.
            </p>
          </div>
        )}
        {siap === 'siap' && data && (
          <>
            <div className="no-print mb-4 flex items-center justify-between">
              <p className="text-sm text-pramuka-700">Halaman baca-saja: tanpa login, tanpa dapat mengubah data.</p>
              <button className="btn btn-gold btn-sm" onClick={() => window.print()}>
                <Icon nama="cetak" className="h-4 w-4" /> Cetak atau simpan PDF
              </button>
            </div>
            <style>{'@page { size: A4 portrait; margin: 10mm; }'}</style>
            <div className="overflow-x-auto pb-4">
              <KonteksApp.Provider value={{ progress: data.progress, users: data.users }}>
                <BerkasGarudaDokumen peserta={data.peserta} portofolio={data.portofolio} token={data.token} />
              </KonteksApp.Provider>
            </div>
          </>
        )}

        <p className="no-print mt-6 flex gap-2 text-xs leading-relaxed text-pramuka-600">
          <Icon nama="perisai" className="mt-0.5 h-4 w-4 shrink-0 text-pramuka-500" />
          <span>Halaman ini hanya menampilkan data yang dibagikan lewat tautan ini oleh {G.nama}.</span>
        </p>
        <a href={alamatDasar()} className="no-print mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-pramuka-800 underline">
          <Icon nama="kembali" className="h-4 w-4" />Ke halaman masuk SIGARDA
        </a>
      </main>
      <div className="no-print"><FooterRingkas /></div>
    </div>
  );
}
