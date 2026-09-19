import { useMemo, useState } from 'react';
import { hurufSub } from '../data/skuData';
import { useApp } from '../context/AppContext';
import { hitungMateriPerButir } from '../lib/materiLogic';
import { butirPeserta, getEntry } from '../lib/skuLogic';
import { fmtTanggal, fmtWaktu } from '../lib/format';
import { Badge, Icon } from './ui';

const FILTER = [
  { id: 'semua', label: 'Semua', status: null },
  { id: 'belum', label: 'Belum', status: ['belum', 'ulang'] },
  { id: 'proses', label: 'Proses', status: ['diajukan', 'proses'] },
  { id: 'lulus', label: 'Lulus', status: ['lulus'] },
];

/**
 * Daftar butir SKU resmi (Kwarnas). Butir 1 (agama) tampil sebagai kartu dengan sub-butir
 * bersusun sesuai agama peserta; butir lain tampil satu baris.
 * renderAksi(poin, entry) mengembalikan tombol aksi per unit (ajukan, uji, dll).
 */
export default function SkuChecklist({ tingkat, peserta, renderAksi, onBukaMateri }) {
  const { progress, users, materi } = useApp();
  const [filter, setFilter] = useState('semua');
  const [terbuka, setTerbuka] = useState(null);

  const syarat = FILTER.find((f) => f.id === filter).status;
  const namaOrang = (id) => users.find((u) => u.id === id)?.nama ?? '-';
  const jumlahMateri = useMemo(() => hitungMateriPerButir(materi), [materi]);

  /** Tombol menuju materi yang dihubungkan Pembina/Admin dengan butir ini. Tidak tampil bila belum ada materi. */
  const tombolMateri = (b) => {
    const n = jumlahMateri.get(b.id) ?? 0;
    if (!n || !onBukaMateri) return null;
    return (
      <button
        className="btn btn-gold btn-sm"
        onClick={() => onBukaMateri(b.id)}
        title={`Buka materi untuk Butir ${b.no}`}
        aria-label={`Materi untuk butir ${b.no}, ${n} materi`}
      >
        <Icon nama="buku" className="h-3.5 w-3.5" /> Materi ({n})
      </button>
    );
  };

  /** Isi satu unit: status, jadwal, hasil uji, catatan, aksi, dan riwayat. `ekstra` = tombol tambahan pada baris aksi. */
  const detailUnit = (poin, entry, ekstra = null) => {
    const lulusPoin = entry.status === 'lulus';
    const riwayat = entry.riwayat ?? [];
    return (
      <>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge status={entry.status} />
          {entry.status === 'diajukan' && (
            <span className="text-xs text-pramuka-600">
              Jadwal {fmtTanggal(entry.jadwal)}, penguji {namaOrang(entry.pengujiId)}
            </span>
          )}
          {entry.status === 'proses' && (
            <span className="text-xs text-pramuka-600">
              Mulai diuji {fmtTanggal(entry.tanggalUji)} oleh {namaOrang(entry.pengujiId)}
            </span>
          )}
        </div>

        {lulusPoin && (
          <p className="mt-2 text-xs leading-relaxed text-pramuka-600">
            Diuji {fmtTanggal(entry.tanggalUji)} oleh {namaOrang(entry.pengujiId)}, predikat {entry.nilai}.
            Kode verifikasi{' '}
            <span className="whitespace-nowrap font-mono font-semibold text-pramuka-800">{entry.verifikasi}</span>
          </p>
        )}

        {entry.catatan && (
          <p className="mt-2 rounded-md bg-pramuka-50 px-3 py-2 text-sm text-pramuka-800">
            <span className="font-semibold">Catatan penguji:</span> {entry.catatan}
          </p>
        )}

        <div className="no-print mt-3 flex flex-wrap items-center gap-3">
          {renderAksi?.(poin, entry)}
          {ekstra}
          {riwayat.length > 0 && (
            <button
              onClick={() => setTerbuka(terbuka === poin.id ? null : poin.id)}
              aria-expanded={terbuka === poin.id}
              className="text-xs font-semibold text-pramuka-600 underline underline-offset-2 hover:text-pramuka-800"
            >
              Riwayat ({riwayat.length})
            </button>
          )}
        </div>

        {terbuka === poin.id && (
          <ol className="animasi-naik mt-2 space-y-1 border-l-2 border-emas/60 pl-3 text-xs text-pramuka-600">
            {riwayat.map((r, i) => (
              <li key={i}>
                <span className="font-semibold text-pramuka-800">{fmtWaktu(r.waktu)}</span>, {r.teks}
                {r.oleh && <> (oleh {namaOrang(r.oleh)})</>}
              </li>
            ))}
          </ol>
        )}
      </>
    );
  };

  const daftar = butirPeserta(tingkat, peserta.agama);
  const tampilan = daftar
    .map((b) => {
      const semua = b.unit.map((u) => [u, getEntry(progress, peserta.id, u.id)]);
      return {
        b,
        semua,
        baris: semua.filter(([, e]) => !syarat || syarat.includes(e.status)),
        lulusUnit: semua.filter(([, e]) => e.status === 'lulus').length,
      };
    })
    .filter((x) => x.baris.length);

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter status poin">
        {FILTER.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-inset transition-colors ${
              filter === f.id
                ? 'bg-pramuka-800 text-pramuka-50 ring-pramuka-800'
                : 'bg-white text-pramuka-700 ring-pramuka-300 hover:bg-pramuka-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {tampilan.length === 0 && (
        <p className="jahitan rounded-lg bg-white px-4 py-6 text-center text-sm text-pramuka-600">
          Tidak ada butir pada filter ini.
        </p>
      )}

      <ol className="space-y-3">
        {tampilan.map(({ b, semua, baris, lulusUnit }) => {
          const butirLulus = lulusUnit === semua.length;
          const bersub = !!b.agama;

          return (
            <li key={b.id} className="overflow-hidden rounded-lg border border-pramuka-200 bg-white">
              <div className="flex gap-3 px-3 py-3 sm:px-4">
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    butirLulus ? 'bg-emerald-600 text-white' : 'bg-pramuka-100 text-pramuka-700'
                  }`}
                  title={`Butir ${b.no}`}
                >
                  {butirLulus ? <Icon nama="cek" className="h-4 w-4" /> : b.no}
                </span>

                <div className="min-w-0 flex-1">
                  {!bersub ? (
                    <>
                      <p className="text-sm leading-relaxed">{b.teks}</p>
                      {detailUnit(baris[0][0], baris[0][1], tombolMateri(b))}
                    </>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-pramuka-900">Butir {b.no}. Sesuai agama yang dianut</p>
                        <p className="text-xs text-pramuka-600">
                          Agama <span className="font-semibold text-pramuka-800">{baris[0][0].agama}</span>, {semua.length} sub-butir
                        </p>
                      </div>
                      <div className="no-print flex flex-wrap items-center gap-2">
                        {tombolMateri(b)}
                        <span className="rounded-md bg-pramuka-50 px-2 py-1 text-xs font-semibold text-pramuka-700">
                          {lulusUnit} dari {semua.length} lulus
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {bersub && (
                <ol className="divide-y divide-pramuka-100 border-t border-pramuka-100 bg-pramuka-50/50">
                  {baris.map(([poin, entry]) => (
                    <li key={poin.id} className="flex gap-3 py-3 pl-6 pr-3 sm:pl-14 sm:pr-4">
                      <span
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold ${
                          entry.status === 'lulus' ? 'bg-emerald-600 text-white' : 'bg-white text-pramuka-700 ring-1 ring-inset ring-pramuka-300'
                        }`}
                        title={`Sub-butir ${b.no}${hurufSub(poin.sub)}`}
                      >
                        {hurufSub(poin.sub)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-relaxed">{poin.teks}</p>
                        {detailUnit(poin, entry)}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
