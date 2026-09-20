import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { DAFTAR_TINGKAT } from '../data/skuData';
import { INDEKS_BUTIR, KATALOG_BUTIR, hitungMateriPerButir, labelButir, saringMateri } from '../lib/materiLogic';
import TerkaitButir from '../components/TerkaitButir';
import PratinjauDrive from '../components/PratinjauDrive';
import { Icon, Kosong } from '../components/ui';

const idMateri = (id) => `materi-${id}`;
const idBagian = (id) => `bagian-${id}`;

const gulirKe = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

/** Daftar isi bergaya Google Site: judul materi bernomor, dengan bagian-bagiannya di bawah tiap judul. */
function DaftarIsi({ daftar, aktifId, onPilih }) {
  return (
    <nav aria-label="Daftar isi materi">
      <ol className="space-y-1">
        {daftar.map((m, i) => {
          const aktif = aktifId === m.id;
          return (
            <li key={m.id}>
              <a
                href={`#${idMateri(m.id)}`}
                onClick={(e) => { e.preventDefault(); onPilih(idMateri(m.id)); }}
                aria-current={aktif ? 'location' : undefined}
                className={`flex gap-2 rounded-md px-2 py-1.5 text-sm font-semibold leading-snug transition-colors ${
                  aktif ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-800 hover:bg-pramuka-100'
                }`}
              >
                <span className={`shrink-0 tabular-nums ${aktif ? 'text-emas-light' : 'text-pramuka-500'}`}>{i + 1}.</span>
                <span className="min-w-0">{m.judul}</span>
              </a>
              {m.bagian.length > 0 && (
                <ol className="ml-6 mt-0.5 space-y-0.5 border-l border-pramuka-200 pl-2">
                  {m.bagian.map((b) => (
                    <li key={b.id}>
                      <a
                        href={`#${idBagian(b.id)}`}
                        onClick={(e) => { e.preventDefault(); onPilih(idBagian(b.id)); }}
                        className="flex items-baseline justify-between gap-2 rounded px-2 py-1 text-xs leading-snug text-pramuka-700 hover:bg-pramuka-100"
                      >
                        <span className="min-w-0">{b.judul}</span>
                        {b.halaman && <span className="shrink-0 text-pramuka-400">hlm. {b.halaman}</span>}
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Halaman Materi SKU (semua peran). Setiap materi adalah PDF Google Drive yang dilampirkan Pembina/Admin,
 * ditampilkan sebagai pratinjau. `butirAwal` (opsional) membuka halaman langsung tersaring pada satu butir SKU,
 * dipakai tombol "Materi" pada daftar butir.
 */
export default function Materi({ butirAwal = null, onKelola }) {
  const { materi, bolehKelolaMateri } = useApp();
  const [tingkat, setTingkat] = useState(() => INDEKS_BUTIR.get(butirAwal)?.tingkat ?? 'semua');
  const [butir, setButir] = useState(butirAwal ?? '');
  const [q, setQ] = useState('');
  const [tocBuka, setTocBuka] = useState(false);
  const [aktifId, setAktifId] = useState(null);
  const asideRef = useRef(null);

  const daftar = useMemo(() => saringMateri(materi, { tingkat, butir, q }), [materi, tingkat, butir, q]);
  const perButir = useMemo(() => hitungMateriPerButir(materi), [materi]);

  // Butir yang tersedia untuk disaring: hanya yang punya materi, pada tingkat terpilih
  const opsiButir = useMemo(
    () => KATALOG_BUTIR.filter((b) => perButir.has(b.id) && (tingkat === 'semua' || b.tingkat === tingkat)),
    [perButir, tingkat]
  );

  // Sorot judul yang sedang dibaca pada daftar isi
  useEffect(() => {
    const el = [...document.querySelectorAll('[data-materi-id]')];
    if (!el.length || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver(
      (entri) => {
        const tampak = entri.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (tampak[0]) setAktifId(tampak[0].target.dataset.materiId);
      },
      // di ponsel bilah daftar isi melayang di bawah header, jadi batas atas area baca lebih rendah
      { rootMargin: `-${window.matchMedia?.('(min-width: 1024px)').matches ? 90 : 140}px 0px -60% 0px` }
    );
    el.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [daftar]);

  // Daftar isi ponsel yang terbuka ditutup dengan mengetuk di luarnya atau menekan Esc
  useEffect(() => {
    if (!tocBuka) return undefined;
    const luar = (e) => { if (!asideRef.current?.contains(e.target)) setTocBuka(false); };
    const esc = (e) => { if (e.key === 'Escape') setTocBuka(false); };
    document.addEventListener('pointerdown', luar);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', luar); document.removeEventListener('keydown', esc); };
  }, [tocBuka]);

  const pilihTingkat = (t) => {
    setTingkat(t);
    if (butir && t !== 'semua' && INDEKS_BUTIR.get(butir)?.tingkat !== t) setButir('');
  };
  const pilihButir = (id) => {
    setButir(id);
    if (id) setTingkat(INDEKS_BUTIR.get(id).tingkat);
  };
  const pilihDariDaftar = (id) => {
    setTocBuka(false);
    // beri waktu daftar isi tertutup (mode ponsel) sebelum menggulir
    setTimeout(() => gulirKe(id), 30);
  };
  const semuaKosong = materi.length === 0;
  const adaSaringan = tingkat !== 'semua' || butir || q;

  return (
    <div className="animasi-naik">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Materi SKU</h1>
        <p className="text-sm text-pramuka-600">
          Bahan belajar untuk butir SKU Bantara dan Laksana, dilampirkan Pembina dan Admin Gudep dari Google Drive.
        </p>
      </div>

      {semuaKosong ? (
        <Kosong
          judul="Belum ada materi"
          teks={
            bolehKelolaMateri
              ? 'Tambahkan materi pertama dengan menempel tautan berbagi file PDF dari Google Drive.'
              : 'Pembina dan Admin Gudep belum melampirkan materi. Materi akan tampil di sini setelah ditambahkan.'
          }
        >
          {bolehKelolaMateri && (
            <button className="btn btn-primary btn-sm" onClick={() => onKelola?.('baru')}>
              <Icon nama="tambah" className="h-4 w-4" /> Tambah materi
            </button>
          )}
        </Kosong>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div role="group" aria-label="Tingkat SKU" className="inline-flex rounded-lg bg-pramuka-100 p-1">
              {['semua', ...DAFTAR_TINGKAT].map((t) => (
                <button
                  key={t}
                  onClick={() => pilihTingkat(t)}
                  aria-pressed={tingkat === t}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tingkat === t ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-700 hover:bg-pramuka-200'}`}
                >
                  {t === 'semua' ? 'Semua' : t}
                </button>
              ))}
            </div>

            <div>
              <label htmlFor="saring-butir" className="label">Butir SKU</label>
              <select id="saring-butir" className="input min-w-[10rem]" value={butir} onChange={(e) => pilihButir(e.target.value)}>
                <option value="">Semua butir</option>
                {opsiButir.map((b) => (
                  <option key={b.id} value={b.id}>{labelButir(b.id)} ({perButir.get(b.id)} materi)</option>
                ))}
              </select>
            </div>

            <div className="min-w-[12rem] flex-1 sm:max-w-xs">
              <label htmlFor="cari-materi" className="label">Cari materi</label>
              <div className="relative">
                <Icon nama="cari" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pramuka-400" />
                <input id="cari-materi" type="search" className="input pl-9" placeholder="Judul atau bagian" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
          </div>

          {butir && (
            <p className="jahitan mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white px-4 py-2.5 text-sm text-pramuka-800">
              <span>
                Materi untuk <span className="font-bold">Butir {INDEKS_BUTIR.get(butir)?.no} SKU {INDEKS_BUTIR.get(butir)?.tingkat}</span>:{' '}
                <span className="text-pramuka-600">{INDEKS_BUTIR.get(butir)?.teks}</span>
              </span>
              <button className="font-semibold underline underline-offset-2" onClick={() => pilihButir('')}>Tampilkan semua butir</button>
            </p>
          )}

          {daftar.length === 0 ? (
            <Kosong judul="Tidak ada materi yang cocok" teks="Ubah tingkat, butir, atau kata pencarian.">
              {adaSaringan && (
                <button className="btn btn-outline btn-sm" onClick={() => { setTingkat('semua'); setButir(''); setQ(''); }}>
                  Hapus semua saringan
                </button>
              )}
            </Kosong>
          ) : (
            <div className="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-6">
              {/* Ponsel: bilah daftar isi melayang, menempel tepat di bawah header saat halaman digulir ke mana pun (sticky terhadap
                  seluruh daftar materi). Tablet, laptop, dan PC: kolom samping yang ikut menggulir seperti semula. */}
              <aside ref={asideRef} className="sticky top-[3.75rem] z-30 -mx-4 mb-4 bg-pramuka-50/95 px-4 py-2 backdrop-blur-sm lg:static lg:z-auto lg:mx-0 lg:mb-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
                <div className="relative lg:sticky lg:top-24">
                  <button
                    className={`btn btn-outline flex w-full items-center justify-between !border-emas/70 lg:hidden ${tocBuka ? 'glow-emas-tetap' : 'glow-emas'}`}
                    aria-expanded={tocBuka}
                    aria-controls="daftar-isi-materi"
                    onClick={() => setTocBuka((b) => !b)}
                  >
                    <span className="flex items-center gap-2"><Icon nama="daftar" className="h-4 w-4 text-emas-dark" /> Daftar isi ({daftar.length} materi)</span>
                    <Icon nama={tocBuka ? 'panahAtas' : 'panahBawah'} className="h-4 w-4" />
                  </button>
                  <div
                    id="daftar-isi-materi"
                    className={`${tocBuka ? 'block' : 'hidden'} panel absolute inset-x-0 top-full z-10 mt-2 max-h-[calc(100vh-14rem)] overflow-y-auto p-3 shadow-lg lg:static lg:mt-0 lg:block lg:max-h-[calc(100vh-8rem)] lg:shadow-none`}
                  >
                    <p className="mb-2 hidden px-2 font-display text-sm font-bold uppercase tracking-wide text-pramuka-700 lg:block">Daftar isi</p>
                    <DaftarIsi daftar={daftar} aktifId={aktifId} onPilih={pilihDariDaftar} />
                  </div>
                </div>
              </aside>

              <div className="space-y-6">
                {daftar.map((m, i) => (
                  <article key={m.id} id={idMateri(m.id)} data-materi-id={m.id} className="panel scroll-mt-36 p-4 sm:p-5 lg:scroll-mt-24">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-xl font-bold leading-snug text-pramuka-900">
                        <span className="mr-2 text-pramuka-400">{i + 1}.</span>{m.judul}
                      </h2>
                      {bolehKelolaMateri && (
                        <button className="btn btn-outline btn-sm shrink-0" onClick={() => onKelola?.(m.id)} aria-label={`Ubah materi ${m.judul}`}>
                          <Icon nama="ubah" className="h-3.5 w-3.5" /> Ubah
                        </button>
                      )}
                    </div>

                    {m.butir.length > 0 ? (
                      <TerkaitButir ids={m.butir} aktif={butir} onKlik={pilihButir} />
                    ) : (
                      <p className="mt-2 text-xs text-pramuka-500">Materi umum, tidak terkait butir tertentu.</p>
                    )}

                    {m.deskripsi && <p className="mt-3 text-sm leading-relaxed text-pramuka-700">{m.deskripsi}</p>}

                    {m.bagian.length > 0 && (
                      <div className="mt-4 rounded-lg bg-pramuka-50 px-3 py-3">
                        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-pramuka-600">Isi materi</p>
                        <ol className="space-y-1 text-sm">
                          {m.bagian.map((b, k) => (
                            <li key={b.id} id={idBagian(b.id)} className="flex scroll-mt-36 items-baseline justify-between gap-3 lg:scroll-mt-24">
                              <span className="min-w-0 text-pramuka-800"><span className="mr-1.5 text-pramuka-400">{k + 1}.</span>{b.judul}</span>
                              {b.halaman && (
                                <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-xs font-semibold text-pramuka-700 ring-1 ring-inset ring-pramuka-200">
                                  hlm. {b.halaman}
                                </span>
                              )}
                            </li>
                          ))}
                        </ol>
                        <p className="mt-2 text-xs text-pramuka-500">Nomor halaman menunjukkan letak bagian pada PDF. Gulir pratinjau di bawah untuk menuju halaman tersebut.</p>
                      </div>
                    )}

                    <div className="mt-4">
                      <PratinjauDrive materi={m} />
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
