import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { KATEGORI_PEMERIKSAAN, gabungHasilPemeriksaan, jumlahKategori, tabPerbaikan, totalMasalah } from '../lib/pemeriksaanLogic';
import { bolehDihubungi, nomorWaAnggota, teksWaAjakMasuk } from '../lib/eskalasiLogic';
import { alamatDasar } from '../lib/verifikasiLogic';
import RingkasanPerangkat from '../components/RingkasanPerangkat';
import TombolWhatsapp from '../components/TombolWhatsapp';
import { Icon } from '../components/ui';

/** Satu kategori: judul, keterangan, jumlah, tombol "Perbaiki" (bila peran ini bisa), dan daftar yang dapat dibuka/tutup. */
function Kategori({ kategori, daftar, tab, onNav, render }) {
  const [buka, setBuka] = useState(false);
  const kosong = daftar.length === 0;
  return (
    <section className="panel p-4" aria-label={kategori.judul}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Icon nama={kosong ? 'cek' : 'jam'} className={`mt-0.5 h-4 w-4 shrink-0 ${kosong ? 'text-emerald-600' : 'text-amber-600'}`} />
          <div>
            <h2 className="font-semibold text-pramuka-900">{kategori.judul}</h2>
            <p className="mt-0.5 text-sm text-pramuka-700">{kosong ? 'Tidak ada masalah.' : `${daftar.length} ditemukan.`}</p>
          </div>
        </div>
        {!kosong && tab && (
          <button className="btn btn-outline btn-sm shrink-0" onClick={() => onNav(tab)}>Perbaiki</button>
        )}
      </div>
      {!kosong && (
        <>
          <p className="mt-2 text-xs text-pramuka-500">{kategori.keterangan}</p>
          <button
            className="mt-2 text-sm font-semibold text-pramuka-700 underline underline-offset-2 hover:text-pramuka-900"
            aria-expanded={buka}
            onClick={() => setBuka(!buka)}
          >
            {buka ? 'Sembunyikan daftar' : `Lihat ${daftar.length === 1 ? '1 baris' : `${daftar.length} baris`}`}
          </button>
          {buka && (
            <ul className="mt-2 max-h-64 divide-y divide-pramuka-100 overflow-y-auto rounded-lg border border-pramuka-100 text-sm">
              {daftar.map(render)}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

const Baris = ({ kiri, kanan, aksi }) => (
  <li className={aksi ? 'flex flex-wrap items-center justify-between gap-2 px-3 py-1.5' : 'flex items-baseline justify-between gap-2 px-3 py-1.5'}>
    {aksi ? (
      <div className="min-w-0">
        <p className="truncate font-medium">{kiri}</p>
        {kanan && <p className="text-xs text-pramuka-500">{kanan}</p>}
      </div>
    ) : (
      <>
        <span className="min-w-0 truncate font-medium">{kiri}</span>
        {kanan && <span className="shrink-0 text-xs text-pramuka-500">{kanan}</span>}
      </>
    )}
    {aksi}
  </li>
);

/** Perender per kategori (bentuk baris server berbeda-beda; lihat sg_pemeriksaan_data di supabase/sumber/inti.sql). `users` = untuk mencari nomor WhatsApp. */
const RENDER = (users, user) => ({
  kelasLama: (x) => <Baris key={x.id} kiri={x.nama} kanan={`NIS ${x.nis || '-'}, kelas "${x.kelas || '-'}"`} />,
  tanpaNta: (x) => <Baris key={x.id} kiri={x.nama} kanan={`NIS ${x.nis || '-'}, ${x.kelas || '-'}`} />,
  tanpaJk: (x) => <Baris key={x.id} kiri={x.nama} kanan={[x.peran, x.kelas].filter(Boolean).join(', ')} />,
  rombelTanpaPenguji: (x) => <Baris key={x.rombel} kiri={x.rombel} kanan={`${x.jumlah} Penegak aktif`} />,
  pembinaTanpaAgama: (x) => <Baris key={x.id} kiri={x.nama} />,
  belumPernahMasuk: (x) => (
    <Baris
      key={x.id} kiri={x.nama} kanan={x.peran}
      aksi={bolehDihubungi(user, x) ? <TombolWhatsapp nomor={nomorWaAnggota(users, x.id)} nama={x.nama} teks={teksWaAjakMasuk(x.nama, alamatDasar())} /> : null}
    />
  ),
});

/**
 * Periksa Data (tahap L3; Pembina, Dewan Ambalan, dan Admin): ringkasan masalah kualitas data yang umum, dengan tombol "Perbaiki" ke
 * menu yang tepat bila peran ini bisa memperbaikinya sendiri (sebagian besar HANYA Admin Gudep, lihat pemeriksaanLogic.js).
 * Tombol WhatsApp per orang mengikuti bolehDihubungi (eskalasiLogic.js).
 * `onNav(tab)` berpindah menu (sama seperti tujuan tautan Notifikasi).
 */
export default function PemeriksaanData({ onNav }) {
  const { api, user, users } = useApp();
  const render = RENDER(users, user);
  const [hasil, setHasil] = useState(null);
  const [galat, setGalat] = useState('');
  const [memuat, setMemuat] = useState(true);

  const muat = useCallback(async () => {
    setMemuat(true);
    const [d, p] = await Promise.all([api().muatPemeriksaanData(), api().ringkasanPush()]);
    if (d.ok) { setHasil(gabungHasilPemeriksaan(d.data, p.ok ? p.data : null)); setGalat(''); } else setGalat(d.pesan);
    setMemuat(false);
  }, [api]);
  useEffect(() => { muat(); }, [muat]);

  const total = hasil ? totalMasalah(hasil) - jumlahKategori(hasil, 'tanpaPerangkat') : null; // perangkat dihitung terpisah (RingkasanPerangkat)

  return (
    <div className="animasi-naik">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Periksa Data</h1>
        <p className="text-sm text-pramuka-600">
          {memuat ? 'Memuat...' : total === null ? '' : total === 0 ? 'Tidak ada masalah data yang ditemukan.' : `${total} hal perlu diperiksa.`}
        </p>
      </div>
      {galat && <p className="mb-4 text-sm text-red-700" role="alert">{galat}</p>}
      {hasil && (
        <div className="grid gap-3 md:grid-cols-2">
          {KATEGORI_PEMERIKSAAN.filter((k) => k.kunci !== 'tanpaPerangkat').map((k) => (
            <Kategori key={k.kunci} kategori={k} daftar={hasil[k.kunci] ?? []} tab={tabPerbaikan(k, user)} onNav={onNav} render={render[k.kunci]} />
          ))}
          <div className="md:col-span-2">
            <RingkasanPerangkat />
          </div>
        </div>
      )}
    </div>
  );
}
