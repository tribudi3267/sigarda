import { ITEM_PORTOFOLIO } from '../data/portofolioData';
import { useApp, usePastikanPortofolio } from '../context/AppContext';
import { getItem, hitungPortofolio, jurnalTerbaru } from '../lib/portofolioLogic';
import { fmtWaktu } from '../lib/format';
import { KotakBar, TombolKeAtas, gulirDanSorot } from './ProgresKotak';
import { ProgressBar } from './ui';

const STATUS_KOTAK = { siap: 'selesai', proses: 'proses', belum: 'belum' };
const ID_RINGKASAN = 'portofolio-progres-kotak';

/**
 * Ringkasan kesiapan portofolio: progress bar persentase, kartu Siap/Sedang disiapkan/Belum ada, lalu peta 26
 * dokumen (kotak-kotak bernomor) digabung dalam satu kartu yang sama supaya kartu ringkasannya tidak dobel
 * dengan yang ada di cek list. Kotak dapat diklik untuk menyorot dokumen terkait; `setFilter` (dari PortofolioChecklist
 * di halaman yang sama) direset ke "semua" dulu supaya dokumennya pasti ada di daftar sebelum digulir.
 */
export default function RekapKesiapan({ pesertaId, setFilter }) {
  const { portofolio } = useApp();
  usePastikanPortofolio();
  const h = hitungPortofolio(portofolio, pesertaId);

  const kotak = ITEM_PORTOFOLIO.map((it) => {
    const status = getItem(portofolio, pesertaId, it.id).status;
    return {
      key: it.id,
      no: it.no,
      status: STATUS_KOTAK[status] ?? 'belum',
      judul: `${it.no}. ${it.jenis}`,
      onKlik: () => { setFilter?.('semua'); gulirDanSorot(`portofolio-item-${it.id}`); },
    };
  });

  return (
    <>
      <section id={ID_RINGKASAN} className="panel scroll-mt-20 p-4" aria-label="Rekap kesiapan portofolio">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold">
            {h.siap} dari {h.total} dokumen siap
          </p>
          <p className="font-display text-2xl font-bold text-pramuka-800">{h.persen}%</p>
        </div>
        <div className="mt-2"><ProgressBar persen={h.persen} tinggi="h-3.5" label="Kesiapan portofolio" /></div>

        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-emerald-50 px-2 py-2.5">
            <dt className="text-xs font-semibold text-emerald-800">Siap</dt>
            <dd className="font-display text-2xl font-bold text-emerald-800">{h.siap}</dd>
          </div>
          <div className="rounded-lg bg-amber-50 px-2 py-2.5">
            <dt className="text-xs font-semibold text-amber-900">Sedang disiapkan</dt>
            <dd className="font-display text-2xl font-bold text-amber-900">{h.proses}</dd>
          </div>
          <div className="rounded-lg bg-pramuka-100 px-2 py-2.5">
            <dt className="text-xs font-semibold text-pramuka-700">Belum ada</dt>
            <dd className="font-display text-2xl font-bold text-pramuka-800">{h.belum}</dd>
          </div>
        </dl>
        <p className="mt-2 text-center text-xs text-pramuka-500">
          Belum siap seluruhnya: {h.belumSiap} dokumen ({100 - h.persen}%)
        </p>

        <KotakBar
          judul={`Peta ${h.total} dokumen (nomor sesuai tabel cek list)`}
          labelSelesai="Siap"
          labelProses="Sedang disiapkan"
          labelBelum="Belum ada"
          kotak={kotak}
        />
      </section>
      <TombolKeAtas targetId={ID_RINGKASAN} />
    </>
  );
}

/** Jurnal kesiapan: aktivitas terbaru lintas dokumen. */
export function JurnalTerbaru({ pesertaId, batas = 6 }) {
  const { portofolio, users } = useApp();
  usePastikanPortofolio();
  const daftar = jurnalTerbaru(portofolio, pesertaId, batas);
  const namaOrang = (id) => users.find((u) => u.id === id)?.nama ?? '-';

  return (
    <section className="panel p-4" aria-label="Jurnal kesiapan terbaru">
      <h2 className="mb-2 text-lg font-bold">Jurnal terbaru</h2>
      {daftar.length === 0 ? (
        <p className="text-sm text-pramuka-600">Belum ada aktivitas. Ubah status dokumen pada cek list untuk mulai mencatat jurnal.</p>
      ) : (
        <ol className="space-y-2 border-l-2 border-emas/60 pl-3">
          {daftar.map((r, i) => (
            <li key={i} className="text-sm">
              <p className="font-semibold text-pramuka-900">{r.item.no}. {r.item.jenis}</p>
              <p className="text-xs text-pramuka-600">
                {fmtWaktu(r.waktu)}, {r.teks}
                {r.oleh && <> (oleh {namaOrang(r.oleh)})</>}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
