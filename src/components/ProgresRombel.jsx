import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { rombelSaya } from '../lib/rombelLogic';
import { progresPerRombel, rombelBerPenegak } from '../lib/progresRombel';
import { BadgePeran, Icon, ProgressBar } from './ui';

/**
 * Dashboard progres per rombel untuk Pembina dan Dewan Ambalan: rombel tugas (penugasan tahun ajaran berjalan), atau semua rombel yang
 * punya Penegak bila belum ditugaskan. Tiap kartu: rata-rata progres Bantara dan Laksana, jumlah yang sudah selesai, antrian pengujian,
 * dan daftar Penegak (ketuk nama untuk membuka detail). `penugasan` = baris penugasan tahun ajaran berjalan atau null selama belum termuat.
 */
export default function ProgresRombel({ penugasan, onNav }) {
  const { user, users, daftarPeserta, progress, dokumen } = useApp();
  const saya = useMemo(() => rombelSaya(penugasan, user.id), [penugasan, user.id]);
  const [semua, setSemua] = useState(false);
  const tampilSaya = saya.length > 0 && !semua;

  const kartu = useMemo(
    () => progresPerRombel({
      progress, daftarPeserta, users, penugasan, dokumen: dokumen ?? [],
      rombel: tampilSaya ? saya : rombelBerPenegak(daftarPeserta),
    }),
    [progress, daftarPeserta, users, penugasan, dokumen, saya, tampilSaya]
  );

  return (
    <section className="mb-5" aria-label="Progres per rombel">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Progres per rombel</h2>
          <p className="text-sm text-pramuka-600">
            {tampilSaya
              ? `Rombel yang Anda tangani tahun ajaran ini (${saya.length}).`
              : saya.length > 0 ? 'Semua rombel yang punya Penegak.' : 'Anda belum ditugaskan ke rombel mana pun, jadi semua rombel ditampilkan.'}
          </p>
        </div>
        {saya.length > 0 && (
          <label className="flex items-center gap-2 text-sm font-medium text-pramuka-700">
            <input type="checkbox" className="h-4 w-4 accent-pramuka-800" checked={semua} onChange={(e) => setSemua(e.target.checked)} />
            Tampilkan semua rombel
          </label>
        )}
      </div>
      <KartuRombel kartu={kartu} penugasanAda={penugasan != null} onNav={onNav} />
    </section>
  );
}

/** Kartu-kartu progres (tampilan saja; `kartu` = keluaran progresPerRombel). `bukaAwal` = rombel yang daftar Penegaknya terbuka sejak awal. */
export function KartuRombel({ kartu, penugasanAda, onNav, bukaAwal = null }) {
  const [buka, setBuka] = useState(bukaAwal);
  return (
    <>
      {kartu.length === 0 ? (
        <p className="jahitan rounded-lg bg-white px-4 py-5 text-center text-sm text-pramuka-600">Belum ada Penegak yang terdaftar.</p>
      ) : (
        <ul className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
          {kartu.map((k) => {
            const nama = k.rombel || 'Tanpa rombel';
            const terbuka = buka === k.rombel;
            return (
              <li key={k.rombel || '-'} className="panel min-w-0 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-display text-lg font-bold text-pramuka-900">{nama}</h3>
                  <p className="shrink-0 text-sm text-pramuka-600">{k.jumlah} Penegak</p>
                </div>
                <p className="mt-0.5 truncate text-xs text-pramuka-500" title={k.penguji.join(', ')}>
                  {k.penguji.length ? `Penguji: ${k.penguji.join(', ')}` : penugasanAda ? 'Belum ada penguji bertugas' : ''}
                </p>

                {k.jumlah === 0 ? (
                  <p className="mt-3 text-sm text-pramuka-600">Belum ada Penegak di rombel ini.</p>
                ) : (
                  <>
                    <div className="mt-3 space-y-2">
                      <div>
                        <p className="mb-1 flex justify-between text-xs text-pramuka-600">
                          <span>Bantara (rata-rata)</span><span className="font-semibold">{k.rataBantara}%</span>
                        </p>
                        <ProgressBar persen={k.rataBantara} label={`Rata-rata Bantara ${nama}`} />
                      </div>
                      <div>
                        <p className="mb-1 flex justify-between text-xs text-pramuka-600">
                          <span>Laksana (rata-rata)</span><span className="font-semibold">{k.rataLaksana}%</span>
                        </p>
                        <ProgressBar persen={k.rataLaksana} label={`Rata-rata Laksana ${nama}`} />
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-pramuka-600">
                      Selesai Bantara {k.selesaiBantara}/{k.jumlah}, Laksana {k.selesaiLaksana}/{k.jumlah}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
                      <span className={`rounded-md px-2 py-0.5 ring-1 ring-inset ${k.menunggu ? 'bg-sky-50 text-sky-800 ring-sky-300' : 'bg-white text-pramuka-500 ring-pramuka-200'}`}>
                        {k.menunggu} menunggu uji
                      </span>
                      <span className={`rounded-md px-2 py-0.5 ring-1 ring-inset ${k.diuji ? 'bg-amber-50 text-amber-900 ring-amber-300' : 'bg-white text-pramuka-500 ring-pramuka-200'}`}>
                        {k.diuji} sedang diuji
                      </span>
                    </div>
                    <button
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-pramuka-700 underline underline-offset-2 hover:text-pramuka-900"
                      aria-expanded={terbuka}
                      onClick={() => setBuka(terbuka ? null : k.rombel)}
                    >
                      {terbuka ? 'Sembunyikan Penegak' : `Lihat ${k.jumlah} Penegak`}
                    </button>
                    {terbuka && (
                      <ul className="mt-2 divide-y divide-pramuka-100 rounded-lg border border-pramuka-100">
                        {k.peserta.map((p) => (
                          <li key={p.id}>
                            <button onClick={() => onNav('peserta', p.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-pramuka-50">
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold">{p.nama}</span>
                                <span className="flex flex-wrap items-center gap-x-2 text-xs text-pramuka-500">
                                  Bantara {p.bantara.persen}%, Laksana {p.laksana.persen}% <BadgePeran peran={p.peran} singkat />
                                </span>
                              </span>
                              <Icon nama="panah" className="h-4 w-4 shrink-0 text-pramuka-400" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
