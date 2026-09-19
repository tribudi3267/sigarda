import { APP } from '../config';

/**
 * Lambang SIGARDA: perisai cokelat-emas berisi elang (Garuda) bersayap tiga tingkat.
 *   Tiga tingkat sayap = jenjang SKU Bantara, Laksana, dan Garuda (emas, tertinggi).
 *   Tanda centang di dada = butir SKU yang diuji dan dinyatakan lulus.
 * Sengaja dibuat abstrak, bukan Lambang Negara Garuda Pancasila.
 * Bentuk yang sama dipakai untuk /public/favicon.svg.
 */
export default function LogoMark({ size = 44, judul = `Lambang ${APP.nama}` }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={judul}>
      <path d="M32 3 58 12v20c0 15-11 24-26 29C17 56 6 47 6 32V12z" fill="#45291a" stroke="#c99a1d" strokeWidth="3" strokeLinejoin="round" />
      {[false, true].map((cermin) => (
        <g key={cermin ? 'kanan' : 'kiri'} transform={cermin ? 'translate(64 0) scale(-1 1)' : undefined}>
          <path d="M28 31C22 25 14.500 19 8 11.500 7.500 21.500 15.500 31.500 28 38z" fill="#e2b84a" />
          <path d="M28 38.500C22 33.500 15 29.500 9.500 26.500 10.500 34.500 17.500 41 28 45z" fill="#cfae7f" />
          <path d="M28 45.500C23 42.500 18 40.500 13 40.500 15 46.500 21 50.500 28 51.500z" fill="#b48b5c" />
        </g>
      ))}
      <path d="M26.500 48.500 29 57.500 32 54.500 35 57.500 37.500 48.500z" fill="#cfae7f" />
      <path d="M32 20c5 2 7 8 6 16-1 8-3 14-6 16-3-2-5-8-6-16-1-8 1-14 6-16z" fill="#f8f2e4" />
      <path d="M27.500 18c0-6.500 9-6.500 9 0 0 2-2.500 3.500-4.500 3.500S27.500 20 27.500 18z" fill="#f8f2e4" />
      <path d="M29.800 18.800h4.400L32 24.500z" fill="#e2b84a" />
      <path d="M28.700 15.300 31 16.300M35.300 15.300 33 16.300" stroke="#45291a" strokeWidth="1.300" strokeLinecap="round" />
      <path d="M28.800 35.500l2.300 2.600 4.500-6" fill="none" stroke="#45291a" strokeWidth="1.900" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Lambang dengan nama aplikasi di sampingnya (header, footer, halaman masuk). */
export function LogoSigarda({ size = 40, subjudul = true, className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <LogoMark size={size} />
      <div className="min-w-0 leading-tight">
        <p className="font-display text-lg font-bold tracking-[0.12em]">{APP.nama}</p>
        {subjudul && <p className="truncate text-[11px] text-pramuka-300">{APP.kepanjangan}</p>}
      </div>
    </div>
  );
}
