import { renderToStaticMarkup } from 'react-dom/server';
import LogoMark from '../components/LogoMark';
import TeksKaya from '../components/TeksKaya';
import { pecahTanggal, tanggalWib, tautanBagikanWa, urlGambar } from '../lib/berandaLogic';
import { LABEL_KATEGORI_BERITA } from '../lib/berandaKontenLogic';
import { susunDokumenBerita, urlBerita } from '../lib/beritaStatisLogic';

/** Skrip kecil (tanpa pustaka) untuk panah ke atas: tersembunyi di puncak halaman, tampil sesudah menggulir, menggulir mulus. Tanpa JavaScript panah tetap tampil dan berfungsi sebagai tautan #atas. */
const SKRIP_KE_ATAS = "(function(){var a=document.getElementById('ke-atas');if(!a)return;function u(){a.style.display=window.pageYOffset>240?'flex':'none'}u();window.addEventListener('scroll',u,{passive:true});a.addEventListener('click',function(e){e.preventDefault();window.scrollTo({top:0,behavior:'smooth'})})})();";

/**
 * Halaman satu berita (dirender SAAT BUILD menjadi HTML statis, tanpa JavaScript di peramban; lihat scripts/berita-statis.mjs). Hanya kelas Tailwind yang sudah
 * ada di CSS hasil build (dipakai halaman muka juga); semua tautan memakai alamat utama situs agar jalan dari alamat bersarang berita/<id>-<slug>/.
 */
export default function HalamanBerita({ b, namaGudep, alamatSitus }) {
  const dasar = `${String(alamatSitus).replace(/\/+$/, '')}/`;
  const t = pecahTanggal(tanggalWib(b.terbitPada));
  const sampul = urlGambar(b.sampulUrl);
  return (
    <div id="atas" className="min-h-screen bg-pramuka-50 text-pramuka-900">
      <div className="sticky top-0 z-40">
        <header className="border-b border-emas/25 bg-pramuka-900 text-pramuka-50">
          <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-3 px-5">
            <a href={dasar} className="flex min-w-0 items-center gap-3 no-underline">
              <LogoMark size={38} judul="Lambang SIGARDA" />
              <span className="min-w-0 truncate font-display text-[15px] font-bold tracking-wide">{namaGudep}</span>
            </a>
            <a href={`${dasar}#masuk`} className="btn btn-gold ml-auto shrink-0 !rounded-full !px-5">Masuk</a>
          </div>
        </header>
        <nav aria-label="Jejak halaman" className="border-b border-pramuka-200 bg-pramuka-50">
          <div className="mx-auto flex h-11 w-full max-w-3xl items-center px-5">
            <a className="inline-flex items-center text-sm font-bold text-emas-dark no-underline hover:underline" href={`${dasar}#berita`}>← Semua berita</a>
          </div>
        </nav>
      </div>
      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
        <article>
          <span className="inline-block w-fit rounded-full bg-emas/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emas-dark">{LABEL_KATEGORI_BERITA[b.kategori] ?? 'Berita'}</span>
          <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">{b.judul}</h1>
          {t && <p className="mt-2 text-sm text-pramuka-500"><time dateTime={b.terbitPada}>{t.namaHari}, {t.hari} {t.bulan} {t.tahun}</time></p>}
          {b.penulis && <p className="mt-1 text-sm text-pramuka-500">Ditulis oleh <span className="font-semibold text-pramuka-700">{b.penulis}</span></p>}
          {sampul && <img src={sampul} alt="" className="mt-6 w-full rounded-2xl object-cover" />}
          {b.ringkasan && <p className="mt-6 text-lg leading-relaxed text-pramuka-700">{b.ringkasan}</p>}
          <TeksKaya isi={b.isi} kelas="mt-5 space-y-4 text-base leading-relaxed text-pramuka-800" />
          <p className="mt-8 border-t border-pramuka-200 pt-4">
            <a href={tautanBagikanWa(b.judul, urlBerita(dasar, b))} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-emas-dark">Bagikan lewat WhatsApp ↗</a>
          </p>
        </article>
      </main>
      <footer className="bg-[#150b05] py-8 text-center text-sm text-pramuka-200">
        <p>© {namaGudep}. <a className="underline" href={dasar}>Kembali ke halaman muka</a></p>
      </footer>
      {/* Panah ke atas melayang: bentuk dan warna sama dengan TombolKeAtas di halaman butir SKU dan SPG (src/components/ProgresKotak.jsx). */}
      <a id="ke-atas" href="#atas" aria-label="Kembali ke atas" title="Kembali ke atas" className="no-print fixed bottom-6 right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-pramuka-800 text-pramuka-50 shadow-lg ring-2 ring-emas transition-transform hover:scale-105">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
      </a>
      <script dangerouslySetInnerHTML={{ __html: SKRIP_KE_ATAS }} />
    </div>
  );
}

/** Dokumen HTML utuh satu berita. `kepalaTambahan` = tag gaya dan ikon dari index.html hasil build. */
export function renderHalamanBerita({ b, namaGudep, alamatSitus, gambarCadangan, kepalaTambahan }) {
  const badanHtml = renderToStaticMarkup(<HalamanBerita b={b} namaGudep={namaGudep} alamatSitus={alamatSitus} />);
  return susunDokumenBerita({ b, badanHtml, alamatSitus, namaGudep, gambarCadangan, kepalaTambahan });
}
