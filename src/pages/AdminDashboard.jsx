import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { PERAN, rekapAnggota, rekapPerSangga } from '../lib/skuLogic';
import { fmtTanggal, hariIni } from '../lib/format';
import { GUDEP } from '../config';
import FilterBar, { FILTER_AWAL, terapkanFilter } from '../components/FilterBar';
import RingkasanGudep from '../components/RingkasanGudep';
import { BadgePeran, Icon, Kosong, ProgressBar } from '../components/ui';

function unduhCsv(rekap) {
  const kepala = [
    'Nama', 'NIS', 'Kelas', 'Sangga', 'Agama', 'Peran',
    'Bantara lulus', 'Bantara total', 'Bantara persen', 'Tanggal lulus Bantara',
    'Laksana lulus', 'Laksana total', 'Laksana persen', 'Tanggal lulus Laksana',
  ];
  const baris = rekap.map((r) => [
    r.user.nama, r.user.nis ?? '', r.user.kelas ?? '', r.user.sangga ?? '', r.user.agama ?? '', PERAN[r.peran].label,
    r.bantara.lulus, r.bantara.total, r.bantara.persen, r.tglBantara ?? '',
    r.laksana.lulus, r.laksana.total, r.laksana.persen, r.tglLaksana ?? '',
  ]);
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  // Pemisah titik koma dan BOM agar terbaca benar di Excel berbahasa Indonesia
  const csv = `﻿${[kepala, ...baris].map((b) => b.map(esc).join(';')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `rekap-sku-${hariIni()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminDashboard({ onBuka, onNav }) {
  const { users, progress, daftarPeserta } = useApp();
  const [filter, setFilter] = useState(FILTER_AWAL);

  const rekap = useMemo(() => rekapAnggota(progress, users), [progress, users]);
  const tersaring = useMemo(() => {
    const idOk = new Set(terapkanFilter(rekap.map((r) => r.user), filter).map((u) => u.id));
    return rekap.filter((r) => idOk.has(r.user.id)).sort((a, b) => a.user.nama.localeCompare(b.user.nama, 'id'));
  }, [rekap, filter]);

  const perSangga = useMemo(() => rekapPerSangga(rekap), [rekap]);
  const lulusBantara = rekap.filter((r) => r.bantara.persen === 100).length;
  const lulusLaksana = rekap.filter((r) => r.laksana.persen === 100).length;
  const rata = rekap.length ? Math.round(rekap.reduce((n, r) => n + r.bantara.persen, 0) / rekap.length) : 0;

  const angka = [
    { nilai: rekap.length, label: 'Peserta terdaftar' },
    { nilai: lulusBantara, label: 'Lulus SKU Bantara' },
    { nilai: lulusLaksana, label: 'Lulus SKU Laksana' },
    { nilai: `${rata}%`, label: 'Rata-rata progres Bantara' },
  ];

  return (
    <div className="animasi-naik">
      <div className="print-only mb-4 border-b-2 border-pramuka-800 pb-2 text-center">
        <p className="text-lg font-bold">Rekapitulasi Kelulusan SKU Penegak</p>
        <p className="text-sm">{GUDEP.nama}. Dicetak {fmtTanggal(hariIni())}</p>
      </div>

      <div className="no-print mb-4">
        <h1 className="text-2xl font-bold">Dashboard Admin Gudep</h1>
        <p className="text-sm text-pramuka-600">Ringkasan anggota, absensi latihan Jumat, jurnal portofolio Garuda, dan kelulusan SKU.</p>
      </div>

      <div className="no-print mb-6"><RingkasanGudep onNav={onNav} /></div>

      <div className="no-print mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-bold">Rekapitulasi SKU</h2>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm" onClick={() => unduhCsv(tersaring)}>
            <Icon nama="unduh" className="h-4 w-4" /> Unduh CSV
          </button>
          <button className="btn btn-gold btn-sm" onClick={() => window.print()}>
            <Icon nama="cetak" className="h-4 w-4" /> Cetak atau simpan PDF
          </button>
        </div>
      </div>

      <section className="panel mb-5 grid grid-cols-2 divide-pramuka-100 md:grid-cols-4 md:divide-x">
        {angka.map((a, i) => (
          <div key={a.label} className={`p-4 ${i > 1 ? 'border-t border-pramuka-100 md:border-t-0' : ''}`}>
            <p className="font-display text-3xl font-bold text-pramuka-800">{a.nilai}</p>
            <p className="text-sm text-pramuka-600">{a.label}</p>
          </div>
        ))}
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-lg font-bold">Per sangga</h2>
        <div className="panel overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-pramuka-100 text-pramuka-800">
              <tr>
                <th className="px-4 py-2 font-semibold">Sangga</th>
                <th className="px-4 py-2 font-semibold">Anggota</th>
                <th className="px-4 py-2 font-semibold">Lulus Bantara</th>
                <th className="px-4 py-2 font-semibold">Lulus Laksana</th>
                <th className="px-4 py-2 font-semibold">Rata-rata Bantara</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pramuka-100">
              {perSangga.map((g) => (
                <tr key={g.sangga}>
                  <td className="px-4 py-2 font-semibold">{g.sangga}</td>
                  <td className="px-4 py-2">{g.jumlah}</td>
                  <td className="px-4 py-2">{g.bantaraLulus}</td>
                  <td className="px-4 py-2">{g.laksanaLulus}</td>
                  <td className="px-4 py-2">{g.rataBantara}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold">Rekap per anggota</h2>
        <div className="mb-3"><FilterBar data={daftarPeserta} filter={filter} setFilter={setFilter} tampil={['sangga', 'kelas', 'peran', 'agama']} /></div>

        {tersaring.length === 0 ? (
          <Kosong judul="Tidak ada data" teks="Ubah kata kunci, sangga, kelas, peran, atau agama pada filter." />
        ) : (
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-pramuka-100 text-pramuka-800">
                <tr>
                  <th className="px-4 py-2 font-semibold">Nama</th>
                  <th className="px-4 py-2 font-semibold">Kelas, sangga</th>
                  <th className="px-4 py-2 font-semibold">Bantara</th>
                  <th className="px-4 py-2 font-semibold">Laksana</th>
                  <th className="px-4 py-2 font-semibold">Peran</th>
                  <th className="no-print px-4 py-2"><span className="sr-only">Aksi</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pramuka-100">
                {tersaring.map((r) => (
                  <tr key={r.user.id}>
                    <td className="px-4 py-3 font-semibold">{r.user.nama}<span className="block text-xs font-normal text-pramuka-500">{r.user.agama}</span></td>
                    <td className="px-4 py-3 text-pramuka-600">{r.user.kelas}, {r.user.sangga}</td>
                    <td className="px-4 py-3">
                      <div className="w-28">
                        <p className="mb-1 text-xs">{r.bantara.lulus}/{r.bantara.total} ({r.bantara.persen}%)</p>
                        <ProgressBar persen={r.bantara.persen} label="Bantara" />
                        {r.tglBantara && <p className="mt-1 text-xs text-pramuka-500">Lulus {fmtTanggal(r.tglBantara)}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="w-28">
                        <p className="mb-1 text-xs">{r.laksana.lulus}/{r.laksana.total} ({r.laksana.persen}%)</p>
                        <ProgressBar persen={r.laksana.persen} label="Laksana" />
                        {r.tglLaksana && <p className="mt-1 text-xs text-pramuka-500">Lulus {fmtTanggal(r.tglLaksana)}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3"><BadgePeran peran={r.peran} singkat /></td>
                    <td className="no-print px-4 py-3 text-right">
                      <button className="btn btn-outline btn-sm" onClick={() => onBuka(r.user.id)}>Rincian</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
