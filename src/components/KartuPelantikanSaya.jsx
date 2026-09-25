import usePelantikanSaka from '../hooks/usePelantikanSaka';
import { useApp } from '../context/AppContext';
import { fmtTanggal } from '../lib/format';
import { pelantikanPeserta, sakaPeserta } from '../lib/pelantikanLogic';

/**
 * Pelantikan dan keanggotaan Saka milik Penegak yang sedang masuk (Beranda; dicatat Pembina). Tidak tampil sama sekali bila belum ada catatan
 * (atau data belum dapat dimuat, mis. basis data belum dimigrasi), agar Beranda tidak penuh.
 */
export default function KartuPelantikanSaya() {
  const { user } = useApp();
  const { pelantikan, saka } = usePelantikanSaka();
  const p = pelantikanPeserta(pelantikan, user.id);
  const s = sakaPeserta(saka, user.id);
  if (!p.bantara && !p.laksana && s.length === 0) return null;
  return (
    <section className="panel mb-5 p-4" aria-label="Pelantikan dan Saka saya">
      <h2 className="mb-2 text-lg font-bold">Pelantikan dan Saka</h2>
      <ul className="space-y-1 text-sm text-pramuka-800">
        {[['Bantara', p.bantara], ['Laksana', p.laksana]].filter(([, x]) => x).map(([label, x]) => (
          <li key={label}><b>Dilantik {label}</b> pada {fmtTanggal(x.tanggal)}, {x.tempat}.</li>
        ))}
        {s.map((x) => (
          <li key={x.id}>
            <b>{x.saka}</b>, {x.status === 'aktif' ? `aktif sejak ${fmtTanggal(x.tanggalMasuk)}` : `${fmtTanggal(x.tanggalMasuk)} sampai ${fmtTanggal(x.tanggalSelesai)}`}
            {x.suratUrl && <> (<a href={x.suratUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-pramuka-700 underline underline-offset-2">surat keterangan</a>)</>}.
          </li>
        ))}
      </ul>
    </section>
  );
}
