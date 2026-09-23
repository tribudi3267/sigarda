import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { labelJenisEskalasi, teksWaSiap, waLink } from '../lib/eskalasiLogic';
import { Icon } from '../components/ui';

/** Satu Penegak, satu kejadian (SKU/absensi/iuran) yang sudah mendesak: nama, jenis, lama hari, dan tombol WhatsApp. */
function Baris({ entri, onNav }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
      <div className="min-w-0">
        <button className="truncate text-left font-semibold text-pramuka-900 underline-offset-2 hover:underline" onClick={() => onNav(entri.pesertaId)}>
          {entri.nama}
        </button>
        <p className="text-xs text-pramuka-500">
          {[entri.kelas, entri.sangga].filter(Boolean).join(', ')} &middot; {labelJenisEskalasi(entri.jenis)} &middot; {entri.hari} hari
        </p>
      </div>
      <a
        href={waLink(entri.whatsapp, teksWaSiap(entri))}
        target="_blank" rel="noreferrer"
        className="btn btn-outline btn-sm shrink-0"
        title={entri.whatsapp ? `Kirim WhatsApp ke ${entri.nama}` : 'Nomor belum diisi Penegak ini: pilih kontak sendiri di WhatsApp'}
      >
        Buka WhatsApp
      </a>
    </li>
  );
}

/**
 * Tindak Lanjut (tahap L5, Pembina/Dewan Ambalan/Admin): daftar Penegak dengan kejadian tingkat mendesak (SKU tidak bergerak,
 * absensi, atau iuran; lihat sigarda.eskalasi_* di supabase/sumber/inti.sql). Satu Penegak dapat muncul lebih dari sekali (per jenis kejadian).
 * `onNav(id)` membuka detail Penegak itu di menu Peserta.
 */
export default function TindakLanjut({ onNav }) {
  const { muatEskalasi } = useApp();
  const [daftar, setDaftar] = useState(null);
  const [galat, setGalat] = useState('');
  const [memuat, setMemuat] = useState(true);

  const muat = useCallback(async () => {
    setMemuat(true);
    const r = await muatEskalasi();
    if (r.ok) { setDaftar(r.data); setGalat(''); } else setGalat(r.pesan);
    setMemuat(false);
  }, [muatEskalasi]);
  useEffect(() => { muat(); }, [muat]);

  return (
    <div className="animasi-naik">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Tindak Lanjut</h1>
        <p className="text-sm text-pramuka-600">
          {memuat ? 'Memuat...' : daftar === null ? '' : daftar.length === 0
            ? 'Tidak ada yang perlu tindak lanjut saat ini.'
            : `${daftar.length} hal perlu tindak lanjut: sudah 8 hari lebih tidak ada pergerakan.`}
        </p>
      </div>
      {galat && <p className="mb-4 text-sm text-red-700" role="alert">{galat}</p>}
      {daftar && daftar.length > 0 && (
        <section className="panel" aria-label="Daftar perlu tindak lanjut">
          <ul className="divide-y divide-pramuka-100">
            {daftar.map((e) => <Baris key={`${e.pesertaId}-${e.jenis}`} entri={e} onNav={onNav} />)}
          </ul>
        </section>
      )}
      {daftar && daftar.length === 0 && (
        <div className="panel flex items-center gap-2 p-4 text-sm text-pramuka-600">
          <Icon nama="cek" className="h-4 w-4 text-emerald-600" /> Semua Penegak masih bergerak dengan wajar.
        </div>
      )}
    </div>
  );
}
