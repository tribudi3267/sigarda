import { useState } from 'react';
import { ITEM_PORTOFOLIO, STATUS_PF } from '../data/portofolioData';
import { useApp } from '../context/AppContext';
import { getItem } from '../lib/portofolioLogic';
import { fmtWaktu } from '../lib/format';
import { BadgePortofolio, Icon } from './ui';

const FILTER = [
  { id: 'semua', label: 'Semua', cocok: () => true },
  { id: 'belum', label: 'Belum siap', cocok: (s) => s !== 'siap' },
  { id: 'proses', label: 'Sedang disiapkan', cocok: (s) => s === 'proses' },
  { id: 'siap', label: 'Siap (Ada)', cocok: (s) => s === 'siap' },
];

const PILIHAN_STATUS = ['belum', 'proses', 'siap'];

/**
 * Cek list 26 lampiran portofolio Garuda.
 *   mode 'peserta' : Calon Garuda mengisi status, catatan, dan tautan berkasnya sendiri
 *   mode 'tinjau'  : Pembina/Dewan Ambalan meninjau dan memberi catatan, admin hanya melihat
 */
export default function PortofolioChecklist({ pesertaId, mode }) {
  const { portofolio, user, users, ubahPortofolio, catatPortofolioPenguji, hanyaLihatSaya } = useApp();
  const [filter, setFilter] = useState('semua');
  const [form, setForm] = useState(null); // { id, catatan, tautan } atau { id, catatanPenguji }
  const [jurnalId, setJurnalId] = useState(null);

  const syarat = FILTER.find((f) => f.id === filter).cocok;
  const bisaMenilai = mode === 'tinjau' && user.role === 'penguji';
  const terkunci = mode === 'peserta' && hanyaLihatSaya; // nonaktif dan alumni hanya dapat melihat
  const namaOrang = (id) => users.find((u) => u.id === id)?.nama ?? '-';

  const buka = (it, item) => {
    if (form?.id === it.id) return setForm(null);
    setForm({ id: it.id, catatan: item.catatan ?? '', tautan: item.tautan ?? '', catatanPenguji: item.catatanPenguji ?? '' });
  };

  const [sibuk, setSibuk] = useState(false);
  const simpanPeserta = async () => {
    if (sibuk) return;
    setSibuk(true);
    const r = await ubahPortofolio(form.id, { catatan: form.catatan, tautan: form.tautan });
    setSibuk(false);
    if (r.ok) setForm(null);
  };
  const simpanPenguji = async () => {
    if (sibuk) return;
    setSibuk(true);
    const r = await catatPortofolioPenguji(pesertaId, form.id, form.catatanPenguji);
    setSibuk(false);
    if (r.ok) setForm(null);
  };

  const baris = ITEM_PORTOFOLIO.map((it) => [it, getItem(portofolio, pesertaId, it.id)]).filter(([, e]) => syarat(e.status));

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter status dokumen">
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

      {baris.length === 0 && (
        <p className="jahitan rounded-lg bg-white px-4 py-6 text-center text-sm text-pramuka-600">
          Tidak ada dokumen pada filter ini.
        </p>
      )}

      <ol className="divide-y divide-pramuka-100 overflow-hidden rounded-lg border border-pramuka-200 bg-white">
        {baris.map(([it, item]) => {
          const siap = item.status === 'siap';
          const terbuka = form?.id === it.id;
          const riwayat = item.riwayat ?? [];
          return (
            <li key={it.id} className="px-3 py-3 sm:px-4">
              <div className="flex gap-3">
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    siap ? 'bg-emerald-600 text-white' : item.status === 'proses' ? 'bg-amber-100 text-amber-900' : 'bg-pramuka-100 text-pramuka-700'
                  }`}
                >
                  {siap ? <Icon nama="cek" className="h-4 w-4" /> : it.no}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug text-pramuka-900">{it.jenis}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-pramuka-600">Kelengkapan: {it.isian}</p>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {mode === 'peserta' ? (
                      <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-inset ring-pramuka-300" role="group" aria-label={`Status dokumen ${it.no}`}>
                        {PILIHAN_STATUS.map((s) => (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={item.status === s}
                            disabled={terkunci}
                            onClick={() => ubahPortofolio(it.id, { status: s })}
                            className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                              item.status === s
                                ? s === 'siap' ? 'bg-emerald-600 text-white' : s === 'proses' ? 'bg-amber-500 text-white' : 'bg-pramuka-700 text-white'
                                : 'bg-white text-pramuka-700 hover:bg-pramuka-100'
                            }`}
                          >
                            {STATUS_PF[s].label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <BadgePortofolio status={item.status} />
                    )}
                    {item.tautan && (
                      <a
                        href={item.tautan}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-pramuka-700 underline underline-offset-2 hover:text-pramuka-900"
                      >
                        <Icon nama="tautan" className="h-3.5 w-3.5" /> Buka berkas
                      </a>
                    )}
                  </div>

                  {item.catatan && !terbuka && (
                    <p className="mt-2 rounded-md bg-pramuka-50 px-3 py-2 text-sm text-pramuka-800">
                      <span className="font-semibold">Catatan:</span> {item.catatan}
                    </p>
                  )}
                  {item.catatanPenguji && !terbuka && (
                    <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950">
                      <span className="font-semibold">Catatan penguji:</span> {item.catatanPenguji}
                    </p>
                  )}

                  {terbuka && mode === 'peserta' && (
                    <div className="animasi-naik mt-3 space-y-2 rounded-lg bg-pramuka-50 p-3">
                      <div>
                        <label className="label" htmlFor={`tautan-${it.id}`}>Tautan berkas (opsional)</label>
                        <input
                          id={`tautan-${it.id}`}
                          className="input"
                          inputMode="url"
                          placeholder="https://drive.google.com/..."
                          value={form.tautan}
                          onChange={(e) => setForm({ ...form, tautan: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor={`catatan-${it.id}`}>Catatan kesiapan</label>
                        <textarea
                          id={`catatan-${it.id}`}
                          rows={2}
                          className="input"
                          placeholder="Contoh: menunggu tanda tangan Kepala Sekolah"
                          value={form.catatan}
                          onChange={(e) => setForm({ ...form, catatan: e.target.value })}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button className="btn btn-primary btn-sm" onClick={simpanPeserta} disabled={sibuk}>Simpan</button>
                        <button className="btn btn-outline btn-sm" onClick={() => setForm(null)}>Batal</button>
                      </div>
                    </div>
                  )}

                  {terbuka && mode === 'tinjau' && bisaMenilai && (
                    <div className="animasi-naik mt-3 space-y-2 rounded-lg bg-amber-50 p-3">
                      <label className="label" htmlFor={`cp-${it.id}`}>Catatan Pembina atau Dewan Ambalan</label>
                      <textarea
                        id={`cp-${it.id}`}
                        rows={2}
                        className="input"
                        value={form.catatanPenguji}
                        onChange={(e) => setForm({ ...form, catatanPenguji: e.target.value })}
                      />
                      <div className="flex gap-2">
                        <button className="btn btn-primary btn-sm" onClick={simpanPenguji} disabled={sibuk}>Simpan catatan</button>
                        <button className="btn btn-outline btn-sm" onClick={() => setForm(null)}>Batal</button>
                      </div>
                    </div>
                  )}

                  <div className="no-print mt-2 flex flex-wrap items-center gap-3">
                    {((mode === 'peserta' && !terkunci) || bisaMenilai) && (
                      <button
                        onClick={() => buka(it, item)}
                        aria-expanded={terbuka}
                        className="text-xs font-semibold text-pramuka-600 underline underline-offset-2 hover:text-pramuka-800"
                      >
                        {mode === 'peserta' ? 'Catatan dan tautan' : 'Beri catatan'}
                      </button>
                    )}
                    {riwayat.length > 0 && (
                      <button
                        onClick={() => setJurnalId(jurnalId === it.id ? null : it.id)}
                        aria-expanded={jurnalId === it.id}
                        className="text-xs font-semibold text-pramuka-600 underline underline-offset-2 hover:text-pramuka-800"
                      >
                        Jurnal ({riwayat.length})
                      </button>
                    )}
                  </div>

                  {jurnalId === it.id && (
                    <ol className="animasi-naik mt-2 space-y-1 border-l-2 border-emas/60 pl-3 text-xs text-pramuka-600">
                      {riwayat.map((r, i) => (
                        <li key={i}>
                          <span className="font-semibold text-pramuka-800">{fmtWaktu(r.waktu)}</span>, {r.teks}
                          {r.oleh && <> (oleh {namaOrang(r.oleh)})</>}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
