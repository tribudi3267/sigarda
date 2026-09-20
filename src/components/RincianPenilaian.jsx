import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { NILAI_KRITERIA } from '../lib/instrumenLogic';
import { fmtTanggal } from '../lib/format';
import { KELAS_NILAI, LencanaKriteria } from './InstrumenNilai';

const CHIP = 'inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset';

/**
 * Rincian penilaian instrumen satu butir: tiap kali dinilai, tanggal, skor, hasil, dan nilai 1-5 pada tiap kriteria (yang terbaru di atas).
 * Dimuat saat dibuka. Penegak hanya dapat membaca penilaian miliknya; panduan penguji tidak pernah ikut.
 */
export default function RincianPenilaian({ pesertaId, skuId }) {
  const { muatPenilaian, users } = useApp();
  const [keadaan, setKeadaan] = useState({ memuat: true, galat: '', data: [] });
  const namaOrang = (id) => users.find((u) => u.id === id)?.nama ?? 'penguji';

  useEffect(() => {
    let batal = false;
    muatPenilaian(pesertaId, skuId).then((r) => {
      if (!batal) setKeadaan({ memuat: false, galat: r.ok ? '' : r.pesan, data: r.ok ? [...r.data].reverse() : [] });
    });
    return () => { batal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pesertaId, skuId]);

  if (keadaan.memuat) return <p role="status" className="mt-2 text-xs text-pramuka-600">Memuat rincian nilai...</p>;
  if (keadaan.galat) return <p role="alert" className="mt-2 text-xs font-medium text-red-700">{keadaan.galat}</p>;
  if (!keadaan.data.length) {
    return <p className="mt-2 rounded-md bg-pramuka-50 px-3 py-2 text-xs text-pramuka-600">Belum ada rincian nilai. Butir ini dinilai tanpa instrumen (predikat saja).</p>;
  }

  return (
    <ol className="animasi-naik no-print mt-2 space-y-2">
      {keadaan.data.map((p, i) => (
        <li key={p.id} className="rounded-md border border-pramuka-200 bg-white px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs font-semibold text-pramuka-800">{fmtTanggal(p.tanggalUji)}{i === 0 && keadaan.data.length > 1 ? ' (terbaru)' : ''}</span>
            <span className={`${CHIP} ${p.hasil === 'lulus' ? 'bg-emerald-100 text-emerald-900 ring-emerald-300' : 'bg-red-100 text-red-900 ring-red-300'}`}>
              {p.hasil === 'lulus' ? 'Lulus' : 'Perlu diulang'}
            </span>
            <span className="text-sm font-bold text-pramuka-900">Skor {p.skor}<span className="text-xs font-normal text-pramuka-500"> dari 100</span></span>
            <span className="text-xs text-pramuka-500">oleh {namaOrang(p.pengujiId)}</span>
          </div>
          {!p.wajibOk && <p className="mt-1 text-xs text-amber-800">Ada kriteria wajib yang belum mencapai nilai minimal.</p>}
          <ul className="mt-2 space-y-1.5">
            {p.rincian.map((k) => (
              <li key={k.kriteriaId} className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0 leading-snug">
                  {k.teks} <LencanaKriteria k={k} />
                  {k.sumber === 'iuran' && k.saran != null && (
                    <span className={`ml-1 text-xs ${k.saran === k.nilai ? 'text-pramuka-500' : 'font-semibold text-amber-800'}`}>
                      saran iuran {k.saran}{k.saran === k.nilai ? ', diikuti' : `, penguji memberi ${k.nilai}`}
                    </span>
                  )}
                </span>
                <span className={`${CHIP} shrink-0 ${KELAS_NILAI[k.nilai] ?? ''}`} title={`Nilai ${k.nilai} dari 5`}>
                  {k.nilai} {NILAI_KRITERIA[k.nilai]}
                </span>
              </li>
            ))}
          </ul>
          {p.catatan && (
            <p className="mt-2 rounded-md bg-pramuka-50 px-2.5 py-1.5 text-xs text-pramuka-800">
              <span className="font-semibold">Catatan penguji:</span> {p.catatan}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
