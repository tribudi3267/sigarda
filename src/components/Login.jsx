import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { APP, GUDEP, KELOMPOK_PENGGUNA, cocokKelompok } from '../config';
import { PERAN } from '../lib/skuLogic';
import { FooterRingkas } from './Footer';
import LogoMark from './LogoMark';
import PencarianNama from './PencarianNama';
import { Icon } from './ui';

const LANGKAH = [
  { judul: 'Uji SKU Bantara dan Laksana', ket: 'Ajukan, nilai, dan verifikasi tiap butir resmi Kwarnas.' },
  { judul: 'Susun portofolio Garuda', ket: 'Jurnal kesiapan dokumen untuk Penegak Calon Garuda.' },
  { judul: 'Catat latihan Jumat', ket: 'Absensi dan rekap per semester atau tahun ajaran.' },
];

export default function Login() {
  const { users, daftarPeserta, login, resetDemo } = useApp();
  const [peran, setPeran] = useState('peserta');
  const [userId, setUserId] = useState('');
  const [pin, setPin] = useState('');
  const [galat, setGalat] = useState('');

  const aktif = KELOMPOK_PENGGUNA.find((p) => p.id === peran);
  const daftar = useMemo(() => users.filter((u) => cocokKelompok(aktif, u)), [users, aktif]);
  const peranDari = useMemo(() => new Map(daftarPeserta.map((p) => [p.id, p.peran])), [daftarPeserta]);

  const keterangan = (u) =>
    u.role === 'peserta' ? `Kelas ${u.kelas}, ${u.sangga}, ${PERAN[peranDari.get(u.id)]?.singkat ?? ''}` : u.jabatan;

  useEffect(() => {
    setUserId('');
    setGalat('');
  }, [peran]);

  const kirim = (e) => {
    e.preventDefault();
    if (!userId) return setGalat('Ketik nama Anda, lalu pilih dari daftar yang muncul.');
    const hasil = login(userId, pin);
    if (!hasil.ok) {
      setGalat(hasil.pesan);
      setPin('');
    }
    return undefined;
  };

  return (
    <div className="flex min-h-screen flex-col bg-pramuka-800">
      <div className="md:grid md:flex-1 md:grid-cols-[1.1fr_1fr]">
        <section className="flex flex-col justify-center border-b-4 border-emas px-6 py-10 text-pramuka-50 md:border-b-0 md:border-r-4 md:px-14">
          <LogoMark size={84} />
          <h1 className="mt-5 font-display text-4xl font-bold tracking-[0.14em] md:text-5xl">{APP.nama}</h1>
          <p className="mt-1 text-lg font-semibold text-emas-light">{APP.kepanjangan}</p>
          <p className="mt-3 max-w-md text-pramuka-200">
            {APP.tagline}, di {GUDEP.nama}.
          </p>

          <ul className="mt-6 hidden max-w-md space-y-3 md:block">
            {LANGKAH.map((l, i) => (
              <li key={l.judul} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emas text-xs font-bold text-pramuka-900">{i + 1}</span>
                <span className="leading-snug">
                  <span className="block text-sm font-semibold">{l.judul}</span>
                  <span className="block text-xs text-pramuka-300">{l.ket}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex items-center justify-center bg-pramuka-50 px-5 py-10">
          <form onSubmit={kirim} className="panel animasi-naik w-full max-w-sm p-6">
            <h2 className="text-xl font-bold text-pramuka-900">Masuk</h2>

            <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-pramuka-100 p-1" role="tablist" aria-label="Peran">
              {KELOMPOK_PENGGUNA.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={peran === p.id}
                  onClick={() => setPeran(p.id)}
                  className={`rounded-md px-2 py-2 text-sm font-semibold transition-colors ${
                    peran === p.id ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-700 hover:bg-pramuka-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="mt-5">
              <label htmlFor="nama" className="label">Nama</label>
              <PencarianNama
                key={peran}
                id="nama"
                daftar={daftar}
                nilai={userId}
                onPilih={(id) => { setUserId(id); setGalat(''); }}
                keterangan={keterangan}
                namaKelompok={aktif.label}
              />
              <p className="mt-1 text-xs text-pramuka-500">Ketik beberapa huruf nama Anda, lalu pilih dari daftar.</p>
            </div>

            <div className="mt-4">
              <label htmlFor="pin" className="label">PIN</label>
              <input
                id="pin"
                className="input"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="4 sampai 6 angka"
              />
            </div>

            {galat && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{galat}</p>}

            <button type="submit" className="btn btn-gold mt-5 w-full">Masuk</button>

            <p className="mt-4 flex gap-2 text-xs leading-relaxed text-pramuka-600">
              <Icon nama="perisai" className="mt-0.5 h-4 w-4 shrink-0 text-pramuka-500" />
              <span>
                Masuk pertama kali dengan PIN awal dari admin, lalu buat PIN baru milik Anda sendiri.
                Lupa PIN? Minta reset kepada Dewan Ambalan, Pembina, atau Admin Gudep.
              </span>
            </p>

            <div className="mt-4 rounded-md bg-pramuka-100 px-3 py-2.5 text-xs leading-relaxed text-pramuka-700">
              <p className="font-semibold">Mode prototipe</p>
              <p>PIN awal demo: penegak 1111, Pembina 2222, Dewan Ambalan 3333, admin 1234 (wajib diganti saat masuk).</p>
              <button
                type="button"
                onClick={() => window.confirm('Kembalikan semua data ke contoh awal?') && resetDemo()}
                className="mt-1 font-semibold text-pramuka-800 underline"
              >
                Kembalikan data contoh
              </button>
            </div>
          </form>
        </section>
      </div>
      <FooterRingkas />
    </div>
  );
}
