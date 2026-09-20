import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { fmtHariTanggal } from '../lib/format';
import { ringkasButirSesi, sesiUntukPeserta } from '../lib/sesiLogic';
import { Icon } from './ui';

/**
 * Jadwal ujian bersama yang mencantumkan Penegak yang masuk (sesi yang belum selesai, terdekat dulu).
 * Tidak menampilkan apa pun bila tidak ada jadwal atau basis data belum dimigrasi. Dipakai di Beranda Penegak dan dashboard Calon Garuda.
 */
export default function JadwalUjianBersama() {
  const { user, sesiUjian, pastikanSesiUjian } = useApp();
  useEffect(() => { pastikanSesiUjian(); }, [pastikanSesiUjian]);
  const jadwal = sesiUntukPeserta(sesiUjian, user.id);
  if (!jadwal.length) return null;

  return (
    <section>
      <h2 className="mb-2 text-lg font-bold">Jadwal ujian bersama</h2>
      <ul className="panel divide-y divide-pramuka-100">
        {jadwal.map((s) => (
          <li key={s.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-semibold">{s.nama}</p>
              {s.status === 'berlangsung' && (
                <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900 ring-1 ring-inset ring-emerald-300">Sedang berlangsung</span>
              )}
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-pramuka-700">
              <Icon nama="kalender" className="h-4 w-4 shrink-0" />
              {fmtHariTanggal(s.tanggal)}{s.tempat ? `, ${s.tempat}` : ''}
            </p>
            <p className="mt-1 text-xs text-pramuka-600">Butir yang diuji: {ringkasButirSesi(s.butir)}</p>
            {s.catatan && <p className="mt-1 text-xs text-pramuka-600">{s.catatan}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
