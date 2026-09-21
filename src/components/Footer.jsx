import { APP, GUDEP } from '../config';
import { TINGKAT } from '../data/skuData';
import { ITEM_PORTOFOLIO } from '../data/portofolioData';
import { LogoSigarda } from './LogoMark';

// Jalur SIGARDA: tiga tahap yang diwadahi aplikasi. Jumlah diambil dari data resmi, bukan angka tetap.
const JALUR = [
  { no: 1, judul: 'SKU Bantara', ket: `${TINGKAT.Bantara.butir.length} butir diuji Dewan Ambalan dan Pembina` },
  { no: 2, judul: 'SKU Laksana', ket: `${TINGKAT.Laksana.butir.length} butir, terbuka setelah Bantara lulus` },
  { no: 3, judul: 'Portofolio Garuda', ket: `${ITEM_PORTOFOLIO.length} dokumen disusun dalam jurnal kesiapan`, garuda: true },
];

// Tiga kolom butuh sekitar 540px isi; bila menu samping terbuka lebar (md:pl-60) lebar itu baru tercapai di lg,
// jadi di md kolom ketiga turun ke baris kedua. Kalau tidak, kolom melewati footer dan halaman melebar.
const KOLOM_3 = 'md:grid-cols-[1.3fr_1.2fr_1fr]';
const KOLOM_MD_2 = 'md:grid-cols-2 lg:grid-cols-[1.3fr_1.2fr_1fr]';

/** Footer aplikasi (setelah masuk). Ditampilkan di laptop dan ponsel; tidak ikut tercetak. `ciut` = menu samping sedang ciut. */
export default function Footer({ ciut = false }) {
  return (
    <footer className="no-print mt-auto border-t-4 border-emas bg-pramuka-900 pb-20 text-pramuka-200 md:pb-0">
      <div className="mx-auto max-w-6xl px-4 py-9">
        <div className={`grid gap-9 ${ciut ? KOLOM_3 : KOLOM_MD_2}`}>
          <div>
            <LogoSigarda size={48} className="text-pramuka-50" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-pramuka-300">
              {APP.tagline}, di {GUDEP.nama}.
            </p>
          </div>

          <div>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-emas-light">Jalur SIGARDA</h2>
            <ol className="space-y-3">
              {JALUR.map((j, i) => (
                <li key={j.no} className="relative flex gap-3">
                  {i < JALUR.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-4px)] w-px bg-pramuka-600" aria-hidden="true" />}
                  <span
                    className={`z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      j.garuda ? 'bg-emas text-pramuka-900' : 'bg-pramuka-700 text-emas-light ring-1 ring-pramuka-500'
                    }`}
                  >
                    {j.no}
                  </span>
                  <span className="min-w-0 leading-snug">
                    <span className="block text-sm font-semibold text-pramuka-50">{j.judul}</span>
                    <span className="block text-xs text-pramuka-300">{j.ket}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className={ciut ? '' : 'md:col-span-2 lg:col-span-1'}>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-emas-light">Gugus Depan</h2>
            <address className="space-y-1 text-sm not-italic leading-relaxed text-pramuka-300">
              <p className="font-semibold text-pramuka-50">{GUDEP.nama}</p>
              <p>{GUDEP.sekolah}</p>
              <p>{GUDEP.alamat}</p>
              <p>{GUDEP.kwarran}, {GUDEP.kwarcab}</p>
            </address>
          </div>
        </div>

        <div className="mt-9 flex flex-col gap-1.5 border-t border-pramuka-700 pt-4 text-xs text-pramuka-400 md:flex-row md:items-center md:justify-between">
          <p>
            &copy; {new Date().getFullYear()} {GUDEP.nama}. {APP.nama} v{APP.versi}
          </p>
          <p>Butir SKU mengacu pada Keputusan Kwarnas No. 198 Tahun 2011, Lampiran III (Golongan Penegak).</p>
        </div>
      </div>
    </footer>
  );
}

/** Footer ringkas untuk halaman masuk dan penggantian PIN. */
export function FooterRingkas() {
  return (
    <footer className="no-print border-t border-pramuka-700 bg-pramuka-900 px-4 py-4 text-center text-xs text-pramuka-400">
      <p>
        <span className="font-semibold tracking-wider text-emas-light">{APP.nama}</span> {APP.kepanjangan}
      </p>
      <p className="mt-0.5">&copy; {new Date().getFullYear()} {GUDEP.nama}</p>
    </footer>
  );
}
