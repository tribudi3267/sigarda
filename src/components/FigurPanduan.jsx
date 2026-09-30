import DATA from '../data/panduanGambar.json';
import { alamatGambar, ambilFigur, gayaKotak, gayaLencana, varianTampil } from '../lib/panduanGambarLogic';

const LENCANA = 'grid h-6 w-6 shrink-0 place-items-center rounded-full bg-red-600 text-xs font-bold leading-none text-white shadow ring-2 ring-white';

/** Satu varian gambar dengan kotak dan nomor penunjuk di atasnya. */
function Gambar({ id, judul, alt, varian, nama }) {
  const dasar = import.meta.env.BASE_URL || '/';
  const lebarMaks = nama === 'ponsel' ? 'max-w-[19rem]' : 'max-w-full';
  return (
    <div className={`relative mx-auto ${lebarMaks} rounded-lg border border-pramuka-300 bg-white shadow-sm`} data-varian={nama}>
      <a href={alamatGambar(varian.berkas, dasar)} target="_blank" rel="noopener noreferrer" className="block rounded-lg" title="Buka gambar ukuran penuh di tab baru" aria-label={`Buka gambar ${judul} ukuran penuh di tab baru`}>
        <img
          src={alamatGambar(varian.berkas, dasar)}
          width={varian.l}
          height={varian.t}
          loading="lazy"
          decoding="async"
          alt={`${judul}. ${alt} (tampilan ${nama === 'ponsel' ? 'ponsel' : 'laptop, PC, atau tablet'})`}
          className="block h-auto w-full rounded-lg"
        />
      </a>
      {varian.kotak.map((k, i) => (
        <span key={i} aria-hidden="true">
          <span className="pointer-events-none absolute rounded-sm border-2 border-red-600 bg-red-500/10" style={gayaKotak(k)} />
          <span className={`${LENCANA} pointer-events-none absolute -translate-x-1/3 -translate-y-1/3`} style={gayaLencana(k)}>{i + 1}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Gambar layar aplikasi bergaris merah dan bernomor, dengan keterangan bernomor di bawahnya (panduan bergambar).
 * `mode`: 'otomatis' = ponsel di layar sempit dan laptop di layar lebar (hanya satu yang diunduh); 'ponsel' atau 'layar' = dipaksa.
 * Saat dicetak selalu varian laptop (lebih terbaca di kertas).
 */
export default function FigurPanduan({ id, mode = 'otomatis' }) {
  const f = ambilFigur(DATA, id);
  if (!f) return null;
  const varian = varianTampil(mode);
  const otomatis = varian.length === 2;
  return (
    <figure className="my-4 break-inside-avoid rounded-lg bg-pramuka-50/60 p-2 sm:p-3" data-figur={id}>
      <figcaption className="mb-2 text-sm font-bold text-pramuka-900">
        {f.judul} <span className="no-print text-xs font-normal text-pramuka-600">(ketuk gambar untuk memperbesar)</span>
      </figcaption>
      {varian.map((nama) => (
        <div
          key={nama}
          className={
            otomatis
              ? nama === 'ponsel' ? 'md:hidden print:hidden' : 'hidden md:block print:block'
              : nama === 'ponsel' ? 'print:hidden' : ''
          }
        >
          <Gambar id={id} judul={f.judul} alt={f.alt} varian={f[nama]} nama={nama} />
        </div>
      ))}
      {!otomatis && varian[0] === 'ponsel' && (
        <div className="hidden print:block"><Gambar id={id} judul={f.judul} alt={f.alt} varian={f.layar} nama="layar" /></div>
      )}
      <ol className="mt-3 space-y-1.5 text-sm text-pramuka-800">
        {f.keterangan.map((teks, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className={`${LENCANA} mt-0.5`} aria-hidden="true">{i + 1}</span>
            <span className="leading-relaxed">{teks}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
