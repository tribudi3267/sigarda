import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { fmtTanggal } from '../lib/format';
import { labelTingkatTkk } from '../lib/tkkLogic';
import { BATAS_BUKTI_SAMA, ringkasMelatih, teksRingkasMelatih } from '../lib/melatihLogic';
import { Kosong } from './ui';

/**
 * Tab "Melatih" pada halaman TKK (Pembina, Dewan Ambalan, Admin): rantai bukti melatih tiap Penegak (siapa yang dilatih dan untuk TKK apa saja), dengan tanda pada bukti yang sama
 * yang dipakai untuk banyak TKK berbeda. Syarat penguji TKK Penegak: telah melatih sedikitnya seorang Pramuka sampai TKK tingkat di bawahnya (petunjuk SK 134/1976).
 * Hanya bantuan pemeriksaan; keputusan tetap pada Pembina saat menguji dan meninjau pengajuan. `data` = hasil useTkk().
 */
export default function PanelMelatih({ data }) {
  const { daftarPesertaSemua } = useApp();
  const [cari, setCari] = useState('');
  const [hanyaTandai, setHanyaTandai] = useState(false);
  const [buka, setBuka] = useState(null);
  const semua = useMemo(() => ringkasMelatih(data.capaian, daftarPesertaSemua), [data.capaian, daftarPesertaSemua]);
  const daftar = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return semua.filter((r) => (!hanyaTandai || r.jumlahBerulang > 0) && (!k || `${r.nama} ${r.kelas}`.toLowerCase().includes(k))).slice(0, 100);
  }, [semua, cari, hanyaTandai]);
  const jumlahTandai = semua.filter((r) => r.jumlahBerulang > 0).length;

  return (
    <div>
      <p className="mb-3 text-sm text-pramuka-600">
        Penegak wajib telah melatih sedikitnya seorang Pramuka sampai TKK tingkat di bawahnya. Di sini catatan "bukti melatih" tiap Penegak dirangkai: siapa yang dilatih dan untuk TKK apa
        saja. Bukti yang sama untuk {BATAS_BUKTI_SAMA} TKK berbeda atau lebih ditandai agar Anda menanyakannya (mungkin wajar, mungkin salin tempel). Hanya bantuan pemeriksaan.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input className="input max-w-xs flex-1" aria-label="Cari Penegak" placeholder="Cari nama atau kelas Penegak" value={cari} onChange={(e) => setCari(e.target.value)} />
        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={hanyaTandai} onChange={(e) => setHanyaTandai(e.target.checked)} /> Hanya yang ditandai ({jumlahTandai})</label>
      </div>
      {daftar.length === 0 ? (
        <Kosong judul={semua.length === 0 ? 'Belum ada capaian TKK' : 'Tidak ada yang cocok'} teks={semua.length === 0 ? 'Rantai melatih muncul sesudah capaian TKK tercatat.' : 'Ubah kata pencarian atau matikan filter.'} />
      ) : (
        <ul className="panel divide-y divide-pramuka-100">
          {daftar.map((r) => (
            <li key={r.pesertaId} className="px-4 py-3">
              <button type="button" className="flex w-full flex-wrap items-baseline justify-between gap-2 text-left" aria-expanded={buka === r.pesertaId} onClick={() => setBuka(buka === r.pesertaId ? null : r.pesertaId)}>
                <span className="font-medium">{r.nama} <span className="text-xs font-normal text-pramuka-500">{r.kelas}</span></span>
                <span className={`text-xs ${r.jumlahBerulang ? 'font-semibold text-amber-900' : 'text-pramuka-600'}`}>{teksRingkasMelatih(r)}</span>
              </button>
              {buka === r.pesertaId && (
                <ul className="mt-2 space-y-2 text-sm">
                  {r.rantai.map((b) => (
                    <li key={b.siapa} className={`rounded-md px-3 py-2 ${b.berulang ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-pramuka-50'}`}>
                      <p className="font-semibold">{b.siapa}{b.berulang ? ' (perlu ditanyakan)' : ''}</p>
                      <p className="text-xs text-pramuka-600">
                        {b.tkk.map((t) => `${t.nama} ${labelTingkatTkk(t.tingkat)} (${fmtTanggal(t.tanggal)})`).join('; ')}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
