import { useState } from 'react';
import { useApp } from '../context/AppContext';
import PanelBinaDamping from '../components/PanelBinaDamping';
import SumberPeraturan from '../components/SumberPeraturan';
import PanelSangga, { PilihRombel } from '../components/PanelSangga';
import { SEMUA_ROMBEL } from '../lib/rombelLogic';

const TAB = [{ id: 'sangga', label: 'Sangga' }, { id: 'bina', label: 'Bina Damping' }];

/**
 * Sangga dan Bina Damping (fase B). Pengurus (Pembina, Dewan, Admin): semua rombel dan penunjukan Bina Damping; Penegak yang menjadi Bina Damping: hanya
 * susunan sangga rombel yang didampinginya (membagi sangga dan menentukan Pinsa). Hak sebenarnya ditegakkan server.
 */
export default function Sangga() {
  const { user, pendampingan } = useApp();
  const pengurus = user.role === 'penguji' || user.role === 'admin';
  const rombelSaya = pendampingan?.binaDamping ?? [];
  const [tab, setTab] = useState('sangga');
  const [rombel, setRombel] = useState(pengurus ? SEMUA_ROMBEL[0] : rombelSaya[0]);
  const tabAktif = pengurus ? tab : 'sangga';

  return (
    <div className="animasi-naik">
      <h1 className="mb-1 text-2xl font-bold">Sangga dan Bina Damping</h1>
      <p className="mb-4 text-sm text-pramuka-600">
        Sangga 4 sampai 8 Penegak, satu rombel 4 sampai 5 sangga; tiap sangga dipimpin seorang Pinsa. Tiap rombel didampingi 2 Bina Damping.
      </p>
      <SumberPeraturan
        className="mb-4"
        rujukan={[
          { id: 'polmekbin-176-2013', bagian: 'butir 6 b (calon penegak didampingi dua penegak bantara/laksana: pendamping kanan dan kiri) dan butir 7 a (sangga 4-8 orang)' },
          { id: 'gudep-05-2026', bagian: 'Pasal 24 ayat (3)-(4) dan (12)-(13) (sangga 4-8 Penegak, Pemimpin Sangga, dan Pradana)' },
        ]}
      />

      {pengurus && (
        <div role="tablist" aria-label="Sangga dan Bina Damping" className="mb-4 inline-flex flex-wrap rounded-lg bg-pramuka-100 p-1">
          {TAB.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-2 text-sm font-semibold ${tab === t.id ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-700 hover:bg-pramuka-200'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tabAktif === 'sangga' && (
        <>
          <PilihRombel daftar={rombelSaya} nilai={rombel} onUbah={setRombel} semua={pengurus} />
          <PanelSangga key={rombel} rombel={rombel} />
        </>
      )}
      {tabAktif === 'bina' && <PanelBinaDamping />}
    </div>
  );
}
