import { NILAI_KRITERIA, kriteriaWajibGagal } from '../lib/instrumenLogic';

const CHIP = 'inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset';
export const KELAS_NILAI = {
  1: 'bg-red-100 text-red-900 ring-red-300',
  2: 'bg-red-50 text-red-800 ring-red-200',
  3: 'bg-amber-100 text-amber-900 ring-amber-300',
  4: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  5: 'bg-emerald-100 text-emerald-900 ring-emerald-400',
};

/** Ringkasan satu kriteria: jenis, bobot, dan tanda wajib. */
export function LencanaKriteria({ k }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`${CHIP} bg-pramuka-50 text-pramuka-700 ring-pramuka-200`}>{k.jenis}</span>
      {k.bobot > 1 && <span className={`${CHIP} bg-pramuka-50 text-pramuka-700 ring-pramuka-200`}>bobot {k.bobot}</span>}
      {k.wajib && <span className={`${CHIP} bg-amber-100 text-amber-900 ring-amber-300`}>Wajib</span>}
    </span>
  );
}

/**
 * Lembar nilai instrumen untuk penguji: instruksi, kriteria (dengan panduan), tombol nilai 1-5, dan ringkasan skor.
 *   hit  = hasil hitungSkorInstrumen (skor, saran, lengkap, belum, wajibOk)
 *   nilai / ubahNilai = { [idKriteria]: 1-5 } dan pengubahnya (fungsi setState; dipanggil dengan pembaruan fungsional)
 */
export default function InstrumenNilai({ instr, pengaturan, nilai, ubahNilai, hit }) {
  const gagalWajib = kriteriaWajibGagal(instr.kriteria, nilai, pengaturan);
  return (
    <div className="mb-4">
      {instr.caraUji && <p className="mb-2 text-xs text-pramuka-600">Cara uji: {instr.caraUji}</p>}
      {instr.instruksi && (
        <details className="mb-3 rounded-lg border border-pramuka-200 bg-pramuka-50/60 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-semibold text-pramuka-800">Instruksi untuk penguji</summary>
          <p className="mt-2 whitespace-pre-wrap leading-relaxed text-pramuka-800">{instr.instruksi}</p>
        </details>
      )}

      <ol className="space-y-3">
        {instr.kriteria.map((k, i) => (
          <li key={k.id} className="rounded-lg border border-pramuka-200 p-3">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pramuka-100 text-xs font-bold text-pramuka-700">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug">{k.teks}</p>
                <div className="mt-1"><LencanaKriteria k={k} /></div>
                {k.panduan && (
                  <details className="mt-1.5 text-xs">
                    <summary className="cursor-pointer font-semibold text-pramuka-600 underline underline-offset-2">Panduan penguji</summary>
                    <p className="mt-1 whitespace-pre-wrap leading-relaxed text-pramuka-700">{k.panduan}</p>
                  </details>
                )}
              </div>
            </div>
            <div role="group" aria-label={`Nilai kriteria ${i + 1}`} className="mt-2.5 grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={nilai[k.id] === n}
                  title={NILAI_KRITERIA[n]}
                  onClick={() => ubahNilai((d) => ({ ...d, [k.id]: n }))}
                  className={`rounded-lg px-1 py-2 text-center ring-1 ring-inset transition-colors ${
                    nilai[k.id] === n ? 'bg-pramuka-800 text-pramuka-50 ring-pramuka-800' : 'bg-white text-pramuka-700 ring-pramuka-300 hover:bg-pramuka-100'
                  }`}
                >
                  <span className="block text-base font-bold leading-none">{n}</span>
                  <span className="mt-0.5 block text-[10px] leading-tight opacity-80">{NILAI_KRITERIA[n]}</span>
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-3 rounded-lg border border-pramuka-200 bg-white p-3" aria-live="polite">
        {hit.lengkap ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-pramuka-600">Skor</p>
              <p className="font-display text-3xl font-bold text-pramuka-800">{hit.skor}<span className="text-base font-semibold text-pramuka-500"> / 100</span></p>
            </div>
            <p className={`mt-1 text-sm font-semibold ${hit.saran === 'lulus' ? 'text-emerald-700' : 'text-red-700'}`}>
              Saran: {hit.saran === 'lulus' ? `Lulus (predikat ${hit.nilaiPredikat})` : 'Perlu diulang'}
              <span className="font-normal text-pramuka-500">, ambang lulus {pengaturan.ambang}</span>
            </p>
            {gagalWajib.length > 0 && (
              <p className="mt-1 text-xs font-semibold text-amber-800">
                {gagalWajib.length} kriteria wajib bernilai di bawah {pengaturan.nilaiWajibMin}
                {pengaturan.gerbangWajib ? ', sehingga saran menjadi perlu diulang.' : ' (tidak menggagalkan saran karena gerbang wajib dimatikan).'}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-pramuka-600">Nilai semua kriteria untuk melihat skor ({hit.belum} kriteria belum dinilai).</p>
        )}
      </div>
    </div>
  );
}
