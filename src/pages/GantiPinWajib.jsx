import { useApp } from '../context/AppContext';
import { APP } from '../config';
import { fmtWaktu } from '../lib/format';
import FormGantiPin from '../components/FormGantiPin';
import { FooterRingkas } from '../components/Footer';
import LogoMark from '../components/LogoMark';
import { Icon } from '../components/ui';

/**
 * Layar penuh yang menahan pengguna sampai PIN diganti. Muncul pada login pertama dengan
 * PIN awal dari admin dan pada login pertama setelah PIN direset pengurus.
 */
export default function GantiPinWajib() {
  const { user, users, logout } = useApp();
  const pereset = user.pinDireset ? users.find((u) => u.id === user.pinDireset.oleh) : null;

  return (
    <div className="flex min-h-screen flex-col bg-pramuka-800">
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="mb-5 flex items-center gap-3 text-pramuka-50">
            <LogoMark size={44} />
            <div className="leading-tight">
              <p className="font-display text-lg font-bold tracking-[0.12em]">{APP.nama}</p>
              <p className="text-[11px] text-pramuka-300">{APP.kepanjangan}</p>
            </div>
          </div>

          <div className="panel animasi-naik p-6">
            <p className="flex items-center gap-2 text-sm font-semibold text-pramuka-600">
              <Icon nama="perisai" className="h-4 w-4" /> Langkah keamanan
            </p>
            <h1 className="mt-1 text-2xl font-bold text-pramuka-900">Buat PIN baru</h1>
            <p className="mt-2 text-sm leading-relaxed text-pramuka-700">
              Halo, <span className="font-semibold">{user.nama}</span>.{' '}
              {pereset ? (
                <>
                  PIN Anda direset oleh <span className="font-semibold">{pereset.nama}</span> pada {fmtWaktu(user.pinDireset.waktu)}.
                  Ganti PIN hasil reset tersebut dengan PIN pilihan Anda sendiri agar hanya Anda yang mengetahuinya.
                </>
              ) : (
                <>
                  Anda masuk dengan PIN awal dari admin. Ganti dengan PIN pilihan Anda sendiri agar hanya Anda yang
                  mengetahuinya. Menu lain terbuka setelah PIN diganti.
                </>
              )}
            </p>

            <div className="mt-5">
              <FormGantiPin labelLama={pereset ? 'PIN hasil reset (yang baru Anda pakai masuk)' : 'PIN awal (yang baru Anda pakai masuk)'} />
            </div>

            <button onClick={logout} className="mt-4 w-full text-center text-sm font-semibold text-pramuka-600 underline underline-offset-2 hover:text-pramuka-900">
              Keluar dulu
            </button>
          </div>
        </div>
      </div>
      <FooterRingkas />
    </div>
  );
}
