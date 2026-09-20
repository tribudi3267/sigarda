import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { layakGaruda } from '../lib/skuLogic';
import { fmtTanggal } from '../lib/format';
import { Avatar, Kosong } from './ui';

const MAKS_ASISTEN = 5;

/**
 * Asisten bendahara: Penegak Calon Laksana yang ditunjuk untuk membantu mencatat iuran (tanpa mengubah kehadiran, tanpa mencatat iurannya
 * sendiri, tanpa menutup kas). Ditunjuk dan dicabut oleh Dewan Ambalan atau Pembina; Admin hanya melihat. Pengalaman membantu ini juga
 * menjadi bahan penilaian butir Laksana tentang membantu administrasi keuangan Ambalan.
 */
export default function AsistenIuran() {
  const { asisten, users, daftarPeserta, progress, penunjukAsisten, aturAsisten } = useApp();
  const [pilih, setPilih] = useState('');
  const [proses, setProses] = useState(false);

  const nama = (id) => users.find((u) => u.id === id)?.nama ?? 'Penegak';
  const idAsisten = new Set(asisten.map((a) => a.pesertaId));
  // Calon Laksana: SKU Bantara selesai dan Laksana belum (yang Laksana-nya selesai, walau belum mendaftar Calon Garuda, tidak dapat ditunjuk; sama dengan server)
  const calon = daftarPeserta.filter((p) => p.peran === 'calon-laksana' && !layakGaruda(progress, p) && !idAsisten.has(p.id)).sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  const penuh = asisten.length >= MAKS_ASISTEN;

  const jalankan = async (id, aktif) => {
    setProses(true);
    const r = await aturAsisten(id, aktif);
    setProses(false);
    if (r.ok && aktif) setPilih('');
  };

  return (
    <div className="space-y-4">
      <section className="panel p-4 text-sm leading-relaxed text-pramuka-700">
        <p>
          Asisten bendahara dipilih dari <b>Penegak Calon Laksana</b> (SKU Bantara selesai, Laksana belum), paling banyak {MAKS_ASISTEN} orang. Asisten dapat mencatat iuran Penegak lain
          di menu Iuran, tetapi tidak dapat mengubah kehadiran, mencatat iurannya sendiri, atau menutup kas. Setiap catatannya tercatat atas namanya.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-lg font-bold">Asisten saat ini ({asisten.length}/{MAKS_ASISTEN})</h3>
        {asisten.length === 0 ? (
          <Kosong judul="Belum ada asisten bendahara" teks={penunjukAsisten ? 'Tunjuk Penegak Calon Laksana di bawah ini.' : 'Dewan Ambalan atau Pembina dapat menunjuk asisten.'} />
        ) : (
          <ul className="panel divide-y divide-pramuka-100">
            {asisten.map((a) => (
              <li key={a.pesertaId} className="flex items-center gap-3 p-3 sm:p-4">
                <Avatar nama={nama(a.pesertaId)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{nama(a.pesertaId)}</p>
                  <p className="text-xs text-pramuka-500">Ditunjuk {fmtTanggal(a.ditunjukPada)}{a.ditunjukOleh ? ` oleh ${nama(a.ditunjukOleh)}` : ''}</p>
                </div>
                {penunjukAsisten && (
                  <button className="btn btn-outline btn-sm text-red-700" disabled={proses} onClick={() => window.confirm(`Cabut penunjukan ${nama(a.pesertaId)} sebagai asisten bendahara?`) && jalankan(a.pesertaId, false)}>
                    Cabut
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {penunjukAsisten && (
        <section className="panel p-4">
          <h3 className="text-base font-bold">Tunjuk asisten</h3>
          {penuh ? (
            <p className="mt-1 text-sm text-pramuka-600">Sudah {MAKS_ASISTEN} asisten. Cabut salah satu untuk menunjuk yang baru.</p>
          ) : calon.length === 0 ? (
            <p className="mt-1 text-sm text-pramuka-600">Tidak ada Penegak Calon Laksana yang dapat ditunjuk saat ini.</p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select className="input w-full sm:w-72" value={pilih} onChange={(e) => setPilih(e.target.value)} aria-label="Pilih Penegak Calon Laksana">
                <option value="">Pilih Penegak Calon Laksana...</option>
                {calon.map((p) => <option key={p.id} value={p.id}>{p.nama} (kelas {p.kelas})</option>)}
              </select>
              <button className="btn btn-primary" disabled={!pilih || proses} onClick={() => jalankan(pilih, true)}>Tunjuk</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
