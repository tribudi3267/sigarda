import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';

/** Pembina dan Admin: berapa anggota yang sudah punya perangkat notifikasi, dan siapa yang belum (agar bisa diingatkan mengaktifkannya). */
export default function RingkasanPerangkat() {
  const { api } = useApp();
  const [d, setD] = useState(null);
  const [galat, setGalat] = useState('');
  const [buka, setBuka] = useState(false);

  const muat = useCallback(async () => {
    const r = await api().ringkasanPush();
    if (r.ok) { setD(r.data); setGalat(''); } else setGalat(r.pesan);
  }, [api]);
  useEffect(() => { muat(); }, [muat]);

  if (galat) return <p className="mb-5 text-sm text-red-700" role="alert">{galat}</p>;
  if (!d) return null;
  const persen = d.total ? Math.round((d.aktif / d.total) * 100) : 0;
  return (
    <section className="panel mb-5 p-4" aria-label="Perangkat notifikasi anggota">
      <h2 className="font-semibold text-pramuka-900">Perangkat notifikasi anggota</h2>
      <p className="mt-1 text-sm text-pramuka-700">
        <span className="font-display text-xl font-bold text-pramuka-800">{d.aktif}</span> dari {d.total} Penegak, Dewan Ambalan, dan Pembina sudah punya perangkat yang menerima notifikasi ({persen}%).
      </p>
      {!d.terkonfigurasi && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-300">
          Pengiriman push ke perangkat belum diatur di server (lihat README, bagian Notifikasi dan PWA). Selama itu notifikasi hanya tampil di dalam aplikasi.
        </p>
      )}
      {d.tanpa.length > 0 && (
        <>
          <button className="mt-2 text-sm font-semibold text-pramuka-700 underline underline-offset-2 hover:text-pramuka-900" aria-expanded={buka} onClick={() => setBuka(!buka)}>
            {buka ? 'Sembunyikan daftar' : `Lihat ${d.tanpa.length} anggota yang belum punya perangkat`}
          </button>
          {buka && (
            <ul className="mt-2 max-h-64 divide-y divide-pramuka-100 overflow-y-auto rounded-lg border border-pramuka-100 text-sm">
              {d.tanpa.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-2 px-3 py-1.5">
                  <span className="min-w-0 truncate font-medium">{a.nama}</span>
                  <span className="shrink-0 text-xs text-pramuka-500">{[a.peran, a.kelas].filter(Boolean).join(', ')}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
