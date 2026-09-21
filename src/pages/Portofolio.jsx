import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { layakGaruda } from '../lib/skuLogic';
import { rekapPortofolio, ringkasPortofolio } from '../lib/portofolioLogic';
import { unduhPortofolioXlsx } from '../lib/exportLaporan';
import { fmtTanggal } from '../lib/format';
import FilterBar, { terapkanFilter } from '../components/FilterBar';
import { useFilterRombel } from '../hooks/useRombelSaya';
import PortofolioChecklist from '../components/PortofolioChecklist';
import RekapKesiapan, { JurnalTerbaru } from '../components/RekapKesiapan';
import { Avatar, Icon, Kosong, ProgressBar } from '../components/ui';

function Detail({ pesertaId, onKembali, onBukaSku }) {
  const { daftarPeserta } = useApp();
  const peserta = daftarPeserta.find((u) => u.id === pesertaId);
  if (!peserta || peserta.peran !== 'calon-garuda') {
    return (
      <div className="animasi-naik">
        <button onClick={onKembali} className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-pramuka-700 hover:text-pramuka-900">
          <Icon nama="kembali" className="h-4 w-4" /> Kembali
        </button>
        <Kosong judul="Peserta bukan Calon Garuda" teks="Jurnal portofolio hanya tersedia untuk Penegak Calon Garuda." />
      </div>
    );
  }

  return (
    <div className="animasi-naik">
      <button onClick={onKembali} className="no-print mb-3 flex items-center gap-1.5 text-sm font-semibold text-pramuka-700 hover:text-pramuka-900">
        <Icon nama="kembali" className="h-4 w-4" /> Kembali ke rekap portofolio
      </button>

      <section className="panel mb-5 flex flex-wrap items-center gap-4 p-4">
        <Avatar nama={peserta.nama} ukuran="h-14 w-14" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold leading-tight">{peserta.nama}</h1>
          <p className="text-sm text-pramuka-600">
            NIS {peserta.nis || '-'}, kelas {peserta.kelas}, {peserta.sangga}. Calon Garuda sejak {fmtTanggal(peserta.calonGaruda)}
          </p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => onBukaSku(peserta.id)}>Lihat SKU</button>
      </section>

      <div className="mb-5 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <RekapKesiapan pesertaId={peserta.id} />
        <JurnalTerbaru pesertaId={peserta.id} />
      </div>

      <h2 className="mb-3 text-xl font-bold">Cek list dokumen portofolio</h2>
      <PortofolioChecklist pesertaId={peserta.id} mode="tinjau" />
    </div>
  );
}

export default function PortofolioPengurus({ fokusId, onBuka, onKembali, onBukaSku }) {
  const { daftarPeserta, portofolio, progress, notify } = useApp();
  const { filter, setFilter, efektif, rombelSaya } = useFilterRombel();
  const [mengunduh, setMengunduh] = useState(false);

  const semua = useMemo(() => rekapPortofolio(portofolio, daftarPeserta), [portofolio, daftarPeserta]);
  const dataFilter = useMemo(() => semua.map((r) => r.user), [semua]);
  const rekap = useMemo(() => {
    const ids = new Set(terapkanFilter(dataFilter, efektif).map((u) => u.id));
    return semua.filter((r) => ids.has(r.user.id)).sort((a, b) => a.user.nama.localeCompare(b.user.nama, 'id'));
  }, [semua, dataFilter, efektif]);
  const ringkas = ringkasPortofolio(rekap);
  const menunggu = terapkanFilter(daftarPeserta, { rombel: efektif.rombel }).filter((u) => u.peran !== 'calon-garuda' && layakGaruda(progress, u));

  if (fokusId) return <Detail pesertaId={fokusId} onKembali={onKembali} onBukaSku={onBukaSku} />;

  const unduh = async () => {
    setMengunduh(true);
    try {
      await unduhPortofolioXlsx({ rekap, portofolio, filter: efektif });
      notify('File Excel rekap portofolio diunduh.');
    } catch (e) {
      notify(`Gagal membuat file Excel: ${e.message}`, 'err');
    } finally {
      setMengunduh(false);
    }
  };

  const angka = [
    { nilai: ringkas.jumlah, label: 'Calon Garuda' },
    { nilai: `${ringkas.persen}%`, label: 'Kesiapan rata-rata' },
    { nilai: `${ringkas.siap}/${ringkas.totalDok}`, label: 'Dokumen siap' },
    { nilai: ringkas.lengkap, label: 'Portofolio lengkap' },
  ];

  return (
    <div className="animasi-naik">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Portofolio Penegak Garuda</h1>
          <p className="text-sm text-pramuka-600">Rekap kesiapan 26 dokumen portofolio seluruh Calon Garuda.</p>
        </div>
        <button className="btn btn-gold btn-sm" onClick={unduh} disabled={mengunduh || rekap.length === 0}>
          <Icon nama="unduh" className="h-4 w-4" /> {mengunduh ? 'Menyiapkan...' : 'Unduh Excel (.xlsx)'}
        </button>
      </div>

      <section className="panel mb-4 grid grid-cols-2 divide-pramuka-100 md:grid-cols-4 md:divide-x">
        {angka.map((a, i) => (
          <div key={a.label} className={`p-4 ${i > 1 ? 'border-t border-pramuka-100 md:border-t-0' : ''}`}>
            <p className="font-display text-3xl font-bold text-pramuka-800">{a.nilai}</p>
            <p className="text-sm text-pramuka-600">{a.label}</p>
          </div>
        ))}
      </section>

      {menunggu.length > 0 && (
        <p className="jahitan mb-4 rounded-lg bg-white px-4 py-3 text-sm text-pramuka-700">
          <span className="font-semibold">Memenuhi syarat tetapi belum mendaftar sebagai Calon Garuda:</span>{' '}
          {menunggu.map((u) => u.nama).join(', ')}.
        </p>
      )}

      <div className="mb-3"><FilterBar data={dataFilter} filter={filter} setFilter={setFilter} tampil={['sangga', 'kelas', 'jk']} rombelSaya={rombelSaya} /></div>

      {rekap.length === 0 ? (
        <Kosong
          judul={semua.length === 0 ? 'Belum ada Calon Garuda' : 'Tidak ada data'}
          teks={semua.length === 0
            ? 'Peserta yang seluruh SKU Bantara dan Laksana-nya lulus dapat mendaftar sebagai Calon Garuda dari halaman Beranda mereka.'
            : 'Ubah kata kunci, sangga, atau kelas pada filter, atau matikan "Hanya rombel saya".'}
        />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-pramuka-100 text-pramuka-800">
              <tr>
                <th className="px-4 py-2 font-semibold">Nama</th>
                <th className="px-4 py-2 font-semibold">Kelas, sangga</th>
                <th className="px-4 py-2 font-semibold">Kesiapan</th>
                <th className="px-4 py-2 text-center font-semibold">Siap</th>
                <th className="px-4 py-2 text-center font-semibold">Belum siap</th>
                <th className="px-4 py-2"><span className="sr-only">Aksi</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pramuka-100">
              {rekap.map((r) => (
                <tr key={r.user.id}>
                  <td className="px-4 py-3 font-semibold">{r.user.nama}</td>
                  <td className="px-4 py-3 text-pramuka-600">{r.user.kelas}, {r.user.sangga}</td>
                  <td className="px-4 py-3">
                    <div className="w-36">
                      <p className="mb-1 text-xs">{r.siap}/{r.total} ({r.persen}%)</p>
                      <ProgressBar persen={r.persen} label={`Kesiapan ${r.user.nama}`} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-emerald-800">{r.siap}</td>
                  <td className="px-4 py-3 text-center">
                    {r.belumSiap}
                    {r.proses > 0 && <span className="block text-xs text-pramuka-500">{r.proses} sedang disiapkan</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="btn btn-outline btn-sm" onClick={() => onBuka(r.user.id)}>Tinjau</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
