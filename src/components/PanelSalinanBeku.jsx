import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { fmtWaktu } from '../lib/format';
import { MAKS_BYTE_ISI, MAKS_SALINAN, periksaCatatanSnapshot, ukuranIsi } from '../lib/snapshotLogic';

/**
 * Panel "Salinan beku" pada Portofolio format Kwarcab (Pembina dan Admin): membekukan dokumen SAAT INI (semua data pembentuknya disimpan apa adanya) sebagai arsip yang dicetak
 * atau dikirim ke Kwarcab, dan membuka kembali salinan lama tanpa terpengaruh perubahan data sesudahnya. `buatIsi()` menyusun isi dari data yang sedang tampil;
 * `daftar` = { salinan, muat }; `dibuka` = salinan yang sedang ditampilkan (atau null); `onBuka(salinan | null)`.
 */
export default function PanelSalinanBeku({ pesertaId, buatIsi, daftar, dibuka, onBuka, siap }) {
  const { api, notify } = useApp();
  const [catatan, setCatatan] = useState('');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);

  const bekukan = async () => {
    const p = periksaCatatanSnapshot(catatan);
    if (p) { setGalat(p); return; }
    const isi = buatIsi();
    if (ukuranIsi(isi) > MAKS_BYTE_ISI) { setGalat('Isi dokumen terlalu besar untuk dibekukan (maksimal 600 kB).'); return; }
    setSibuk(true);
    const r = await api().simpanSnapshot(pesertaId, catatan.trim(), isi);
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); return; }
    setGalat('');
    setCatatan('');
    notify('Salinan beku tersimpan.');
    await daftar.muat();
  };
  const hapus = async (s) => {
    if (!window.confirm('Hapus salinan beku ini? Dokumen yang sudah dicetak tetap ada, tetapi salinan digitalnya hilang.')) return;
    setSibuk(true);
    const r = await api().hapusSnapshot(s.id);
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); return; }
    if (dibuka?.id === s.id) onBuka(null);
    notify('Salinan beku dihapus.');
    await daftar.muat();
  };

  return (
    <details className="no-print panel mb-4 p-4">
      <summary className="cursor-pointer select-none text-sm font-bold text-pramuka-900">
        Salinan beku ({daftar.salinan.length}){dibuka ? ' - sedang membuka salinan beku' : ''}
      </summary>
      <p className="mt-2 text-xs text-pramuka-600">
        Membekukan menyimpan dokumen ini apa adanya (identitas, TKK, SPG, data diri, rubrik surat, dan data gudep saat ini) sebagai arsip yang dikirim ke Kwarcab. Salinan beku tidak berubah
        walau data aplikasi berubah kemudian. Paling banyak {MAKS_SALINAN} salinan per Penegak.
      </p>
      {daftar.galat && <p role="alert" className="mt-2 text-xs text-red-700">{daftar.galat}</p>}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="snap-catatan" className="label">Catatan (opsional)</label>
          <input id="snap-catatan" className="input" maxLength={200} placeholder="mis. Diserahkan ke Kwarcab 12 Okt 2026" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
        </div>
        <button type="button" className="btn btn-primary" disabled={sibuk || !siap || !!dibuka} onClick={bekukan} title={dibuka ? 'Kembali ke data terkini dulu' : undefined}>
          {sibuk ? 'Menyimpan...' : 'Bekukan salinan sekarang'}
        </button>
      </div>
      {galat && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{galat}</p>}
      {daftar.salinan.length > 0 && (
        <ul className="mt-3 divide-y divide-pramuka-100 text-sm">
          {daftar.salinan.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="font-semibold">{fmtWaktu(s.dibuatPada)}{s.catatan ? `: ${s.catatan}` : ''}</p>
                <p className="text-xs text-pramuka-500">Tahun ajaran {s.tahunAjaran}, dibekukan oleh {s.dibuatOlehNama || '-'}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-outline btn-sm" disabled={dibuka?.id === s.id} onClick={() => onBuka(s)}>{dibuka?.id === s.id ? 'Sedang dibuka' : 'Buka'}</button>
                <button type="button" className="btn btn-outline btn-sm text-red-700" disabled={sibuk} onClick={() => hapus(s)}>Hapus</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
