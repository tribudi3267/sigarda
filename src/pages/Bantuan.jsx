import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { BAGIAN_UMUM, PANDUAN } from '../data/panduanData';
import { panduanAwal, PERAN_PANDUAN } from '../lib/panduanLogic';
import { daftarRujukan } from '../lib/peraturanLogic';
import { Icon } from '../components/ui';

const ID_RUJUKAN = 'rujukan-peraturan';
const gulirKe = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

function DaftarIsi({ panduan, tocBuka, setTocBuka }) {
  return (
    <aside className="no-print sticky top-[3.75rem] z-30 -mx-4 mb-4 bg-pramuka-50/95 px-4 py-2 backdrop-blur-sm lg:static lg:z-auto lg:mx-0 lg:mb-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
      <div className="relative lg:sticky lg:top-24">
        <button
          className={`btn btn-outline flex w-full items-center justify-between !border-emas/70 lg:hidden ${tocBuka ? 'glow-emas-tetap' : 'glow-emas'}`}
          aria-expanded={tocBuka}
          aria-controls="daftar-isi-bantuan"
          onClick={() => setTocBuka((b) => !b)}
        >
          <span className="flex items-center gap-2"><Icon nama="daftar" className="h-4 w-4 text-emas-dark" /> Daftar isi</span>
          <Icon nama={tocBuka ? 'panahAtas' : 'panahBawah'} className="h-4 w-4" />
        </button>
        <div id="daftar-isi-bantuan" className={`${tocBuka ? 'block' : 'hidden'} panel absolute inset-x-0 top-full z-10 mt-2 p-3 shadow-lg lg:static lg:mt-0 lg:block lg:shadow-none`}>
          <p className="mb-2 hidden px-2 font-display text-sm font-bold uppercase tracking-wide text-pramuka-700 lg:block">Daftar isi</p>
          <nav aria-label="Daftar isi panduan">
            <ol className="space-y-0.5">
              <li>
                <a href={`#${BAGIAN_UMUM.id}`} onClick={(e) => { e.preventDefault(); setTocBuka(false); gulirKe(BAGIAN_UMUM.id); }} className="block rounded-md px-2 py-1.5 text-sm font-semibold text-pramuka-800 hover:bg-pramuka-100">
                  {BAGIAN_UMUM.judul}
                </a>
              </li>
              {panduan.bagian.map((b) => (
                <li key={b.id}>
                  <a href={`#${b.id}`} onClick={(e) => { e.preventDefault(); setTocBuka(false); gulirKe(b.id); }} className="block rounded-md px-2 py-1.5 text-sm text-pramuka-700 hover:bg-pramuka-100">
                    {b.judul}
                  </a>
                </li>
              ))}
              {daftarRujukan(panduan.rujukan).length > 0 && (
                <li>
                  <a href={`#${ID_RUJUKAN}`} onClick={(e) => { e.preventDefault(); setTocBuka(false); gulirKe(ID_RUJUKAN); }} className="block rounded-md px-2 py-1.5 text-sm text-pramuka-700 hover:bg-pramuka-100">
                    Rujukan peraturan
                  </a>
                </li>
              )}
            </ol>
          </nav>
        </div>
      </div>
    </aside>
  );
}

/** Panduan pengguna (tahap L10): satu halaman ringkas per peran, dapat dicetak/disimpan sebagai PDF. Isi murni di src/data/panduanData.js. */
export default function Bantuan() {
  const { user } = useApp();
  const [aktif, setAktif] = useState(() => panduanAwal(user));
  const [tocBuka, setTocBuka] = useState(false);
  const panduan = useMemo(() => PANDUAN[aktif], [aktif]);

  return (
    <div className="animasi-naik">
      <style>{'@page { size: A4 portrait; margin: 14mm; }'}</style>
      <div className="no-print mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bantuan</h1>
          <p className="text-sm text-pramuka-600">Panduan pemakaian SIGARDA, ringkas per peran.</p>
        </div>
        <button className="btn btn-gold" onClick={() => window.print()}>
          <Icon nama="cetak" className="h-4 w-4" /> Cetak atau simpan PDF
        </button>
      </div>

      <div role="tablist" aria-label="Pilih peran" className="no-print mb-4 inline-flex flex-wrap rounded-lg bg-pramuka-100 p-1">
        {PERAN_PANDUAN.map((kode) => (
          <button
            key={kode}
            role="tab"
            aria-selected={aktif === kode}
            onClick={() => setAktif(kode)}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${aktif === kode ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-700 hover:bg-pramuka-200'}`}
          >
            {PANDUAN[kode].label}
          </button>
        ))}
      </div>

      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6">
        <DaftarIsi panduan={panduan} tocBuka={tocBuka} setTocBuka={setTocBuka} />

        <div className="space-y-5 print-area">
          <h2 className="font-display text-xl font-bold text-pramuka-900">Panduan {panduan.label}</h2>
          <p className="text-sm text-pramuka-700">{panduan.ringkasan}</p>

          <article id={BAGIAN_UMUM.id} className="panel scroll-mt-36 p-4 sm:p-5 lg:scroll-mt-24">
            <h3 className="text-lg font-bold text-pramuka-900">{BAGIAN_UMUM.judul}</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-pramuka-800">
              {BAGIAN_UMUM.isi.map((baris, i) => <li key={i}>{baris}</li>)}
            </ul>
          </article>

          {panduan.bagian.map((b) => (
            <article key={b.id} id={b.id} className="panel scroll-mt-36 p-4 sm:p-5 lg:scroll-mt-24">
              <h3 className="text-lg font-bold text-pramuka-900">{b.judul}</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-pramuka-800">
                {b.isi.map((baris, i) => <li key={i}>{baris}</li>)}
              </ul>
            </article>
          ))}

          {daftarRujukan(panduan.rujukan).length > 0 && (
            <article id={ID_RUJUKAN} className="panel scroll-mt-36 p-4 sm:p-5 lg:scroll-mt-24">
              <h3 className="text-lg font-bold text-pramuka-900">Rujukan peraturan</h3>
              <p className="mt-1 text-sm text-pramuka-700">Aturan di panduan ini bersandar pada peraturan Kwartir Nasional berikut. Judul di bawah adalah tautan ke berkas aslinya.</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-pramuka-800">
                {daftarRujukan(panduan.rujukan).map((x) => (
                  <li key={`${x.id}|${x.bagian}`} className="break-words">
                    <a href={x.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-pramuka-700 underline decoration-dotted underline-offset-2 hover:text-pramuka-900">{x.judul}</a>
                    {x.bagian && <span>, {x.bagian}</span>}
                    <span className="hidden print:inline"> ({x.url})</span>
                  </li>
                ))}
              </ul>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
