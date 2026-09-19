import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { hitungProgres, laksanaTerbuka } from '../lib/skuLogic';
import { TINGKAT } from '../data/skuData';
import SkuChecklist from '../components/SkuChecklist';
import TingkatTabs from '../components/TingkatTabs';
import AjukanModal from '../components/AjukanModal';
import { Icon, ProgressBar } from '../components/ui';

export default function PesertaSku({ tingkat, setTingkat, onBukaMateri }) {
  const { user, progress, batalkanAjuan } = useApp();
  const [ajukanPoin, setAjukanPoin] = useState(null);

  const terbuka = tingkat === 'Bantara' || laksanaTerbuka(progress, user);
  const h = hitungProgres(progress, user, tingkat);

  const renderAksi = (poin, entry) => {
    if (entry.status === 'diajukan') {
      return (
        <button className="btn btn-outline btn-sm" onClick={() => batalkanAjuan(poin.id)}>
          Batalkan pengajuan
        </button>
      );
    }
    if (entry.status === 'belum' || entry.status === 'ulang') {
      return (
        <button
          className="btn btn-primary btn-sm"
          disabled={!terbuka}
          onClick={() => setAjukanPoin(poin)}
          title={terbuka ? undefined : 'Selesaikan seluruh butir Bantara lebih dulu'}
        >
          <Icon nama="kalender" className="h-3.5 w-3.5" />
          {entry.status === 'ulang' ? 'Ajukan ulang' : 'Ajukan uji'}
        </button>
      );
    }
    return null;
  };

  return (
    <div className="animasi-naik">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{TINGKAT[tingkat].judul}</h1>
          <p className="text-sm text-pramuka-600">
            {TINGKAT[tingkat].butir.length} butir resmi Kwarnas. Butir 1 menyesuaikan agama kamu ({user.agama}).
          </p>
        </div>
        <TingkatTabs nilai={tingkat} onUbah={setTingkat} kunciLaksana={!laksanaTerbuka(progress, user)} />
      </div>

      <div className="panel mb-5 p-4">
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="font-semibold">{h.lulus} dari {h.total} butir lulus</span>
          <span className="font-display text-lg font-bold text-pramuka-800">{h.persen}%</span>
        </div>
        <ProgressBar persen={h.persen} tinggi="h-3" label={`Progres ${tingkat}`} />
      </div>

      {!terbuka && (
        <p className="jahitan mb-5 flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm text-pramuka-700">
          <Icon nama="kunci" className="h-4 w-4 shrink-0" />
          Kamu bisa melihat daftar butir Laksana, tetapi pengajuan baru dibuka setelah seluruh butir Bantara lulus.
        </p>
      )}

      <SkuChecklist tingkat={tingkat} peserta={user} renderAksi={renderAksi} onBukaMateri={onBukaMateri} />
      {ajukanPoin && <AjukanModal poin={ajukanPoin} onTutup={() => setAjukanPoin(null)} />}
    </div>
  );
}
