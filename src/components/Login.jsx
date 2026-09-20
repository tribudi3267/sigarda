import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { APP, GUDEP } from '../config';
import { PIN_PANJANG } from '../lib/pinLogic';
import { LOKAL } from '../lib/supabaseClient';
import { alamatDasar } from '../lib/verifikasiLogic';
import { PIN_DEMO } from '../lokal/pinDemo';
import { FooterRingkas } from './Footer';
import LogoMark from './LogoMark';
import { Icon } from './ui';

const LANGKAH = [
  { judul: 'Uji SKU Bantara dan Laksana', ket: 'Ajukan, nilai, dan verifikasi tiap butir resmi Kwarnas.' },
  { judul: 'Susun portofolio Garuda', ket: 'Jurnal kesiapan dokumen untuk Penegak Calon Garuda.' },
  { judul: 'Catat latihan Jumat', ket: 'Absensi dan rekap per semester atau tahun ajaran.' },
];

export default function Login() {
  const { login, lokal } = useApp();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);

  const kirim = async (e) => {
    e.preventDefault();
    if (sibuk) return;
    if (!username.trim()) return setGalat('Isi NIS atau nama pengguna Anda.');
    if (pin.length !== PIN_PANJANG) return setGalat(`PIN terdiri dari ${PIN_PANJANG} angka.`);
    setSibuk(true);
    setGalat('');
    const hasil = await login(username.trim().toLowerCase(), pin);
    setSibuk(false);
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
          <form onSubmit={kirim} className="panel animasi-naik w-full max-w-sm p-6" noValidate>
            <h2 className="text-xl font-bold text-pramuka-900">Masuk</h2>

            <div className="mt-5">
              <label htmlFor="username" className="label">NIS atau nama pengguna</label>
              <input
                id="username"
                className="input"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={32}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Penegak: NIS. Lainnya: nama pengguna"
              />
            </div>

            <div className="mt-4">
              <label htmlFor="pin" className="label">PIN</label>
              <input
                id="pin"
                className="input"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                maxLength={PIN_PANJANG}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder={`${PIN_PANJANG} angka`}
              />
            </div>

            {galat && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{galat}</p>}

            <button type="submit" className="btn btn-gold mt-5 w-full" disabled={sibuk}>{sibuk ? 'Memeriksa...' : 'Masuk'}</button>

            <p className="mt-4 flex gap-2 text-xs leading-relaxed text-pramuka-600">
              <Icon nama="perisai" className="mt-0.5 h-4 w-4 shrink-0 text-pramuka-500" />
              <span>
                Masuk pertama kali dengan PIN awal dari admin, lalu buat PIN baru milik Anda sendiri.
                Lupa PIN? Minta reset kepada Dewan Ambalan, Pembina, atau Admin Gudep.
                Salah PIN 5 kali mengunci akun selama 5 menit.
              </span>
            </p>

            <a href={`${alamatDasar()}?v=`} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-pramuka-800 underline">
              <Icon nama="cek" className="h-3.5 w-3.5" />Periksa keaslian dokumen SKU
            </a>

            {LOKAL && lokal.aktif && (
              <div className="mt-4 rounded-md bg-pramuka-100 px-3 py-2.5 text-xs leading-relaxed text-pramuka-700">
                <p className="font-semibold">Mode lokal (tanpa Supabase)</p>
                <p>Data disimpan di browser ini saja. Akun contoh (wajib ganti PIN saat masuk):</p>
                <ul className="mt-1 space-y-0.5 font-mono">
                  <li>Penegak: 10231, PIN {PIN_DEMO.penegak}</li>
                  <li>Pembina: pembina, PIN {PIN_DEMO.pembina}</li>
                  <li>Dewan Ambalan: dewan, PIN {PIN_DEMO.dewan}</li>
                  <li>Admin Gudep: admin, PIN {PIN_DEMO.admin}</li>
                </ul>
                <button
                  type="button"
                  onClick={() => window.confirm('Hapus semua data lokal dan kembalikan ke data contoh?') && lokal.reset()}
                  className="mt-1.5 font-semibold text-pramuka-800 underline"
                >
                  Kembalikan data contoh
                </button>
              </div>
            )}
          </form>
        </section>
      </div>
      <FooterRingkas />
    </div>
  );
}
