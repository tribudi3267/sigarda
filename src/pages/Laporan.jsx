import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { daftarTahunAjaran, ringkasAbsensi, rekapAbsensi, tahunAjaranDari } from '../lib/absensiLogic';
import {
  daftarTahunKalender, JENIS_PERIODE, namaFileLaporan, rekapKeanggotaan, rekapKegiatan, rekapPencapaianSku, rentangLaporan, sesiRentang,
} from '../lib/laporanLogic';
import { ringkasAgregat } from '../lib/iuranLogic';
import { daftarPengurusDewan } from '../lib/dewanLogic';
import { AMBANG_HADIR } from '../config';
import { unduhLaporanTahunanXlsx } from '../lib/exportLaporanTahunan';
import { fmtTanggal, hariIni } from '../lib/format';
import CetakLaporanTahunan from '../components/CetakLaporanTahunan';
import { Icon, Kosong } from '../components/ui';

/**
 * Laporan berjenjang tahunan (tahap L8): satu berkas gabungan (Excel banyak lembar + PDF) berisi rekap keanggotaan,
 * kepengurusan Dewan Ambalan, kegiatan, pencapaian SKU, kehadiran, dan keuangan iuran untuk satu periode pilihan --
 * Tahun Ajaran (Juli-Juni) atau Tahun Kalender (Januari-Desember). Untuk diserahkan ke Kwartir Ranting/Cabang.
 * TANPA API pengiriman otomatis: hanya menghasilkan berkas siap diunduh dan dikirim manual. Pembina dan Admin.
 */
export default function Laporan() {
  const { api, users, progress, daftarPesertaSemua, absensi, notify } = useApp();
  const [jenis, setJenis] = useState('ajaran');
  const tahunAjaranList = useMemo(() => daftarTahunAjaran(absensi), [absensi]);
  const tahunKalenderList = useMemo(() => daftarTahunKalender(), []);
  const [nilaiAjaran, setNilaiAjaran] = useState(() => tahunAjaranDari(hariIni()));
  const [nilaiKalender, setNilaiKalender] = useState(() => tahunKalenderList[0]);
  const nilai = jenis === 'ajaran' ? nilaiAjaran : nilaiKalender;
  const rentang = useMemo(() => rentangLaporan(jenis, nilai), [jenis, nilai]);

  const [data, setData] = useState(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');
  const [tampilCetak, setTampilCetak] = useState(false);
  const [mengunduh, setMengunduh] = useState(false);

  const buatLaporan = async () => {
    setSibuk(true);
    setGalat('');
    setData(null);
    setTampilCetak(false);
    const [rAgenda, rHadir, rIuran] = await Promise.all([
      api().muatAgenda(),
      api().muatHadirRentang(rentang.mulai, rentang.akhir),
      api().muatIuranAgregat(rentang.mulai, rentang.akhir),
    ]);
    setSibuk(false);
    if (!rAgenda.ok) return setGalat(rAgenda.pesan);
    if (!rHadir.ok) return setGalat(rHadir.pesan);
    if (!rIuran.ok) return setGalat(rIuran.pesan);

    const absensiRentang = { sesi: absensi.sesi, hadir: rHadir.data };
    const sesiList = sesiRentang(absensiRentang, rentang.mulai, rentang.akhir);
    const kehadiran = ringkasAbsensi(rekapAbsensi(absensiRentang, daftarPesertaSemua, sesiList), sesiList, AMBANG_HADIR);

    setData({
      rentang,
      keanggotaan: rekapKeanggotaan(users, progress),
      pengurus: daftarPengurusDewan(users),
      kegiatan: rekapKegiatan(rAgenda.data, rentang.mulai, rentang.akhir),
      sku: rekapPencapaianSku(users, progress, rentang.mulai, rentang.akhir),
      kehadiran,
      iuran: ringkasAgregat(rIuran.data),
    });
    return undefined;
  };

  const unduh = async () => {
    if (!data) return;
    setMengunduh(true);
    try {
      await unduhLaporanTahunanXlsx(data, namaFileLaporan(rentang));
      notify('File Excel laporan tahunan diunduh.');
    } catch (e) {
      notify(`Gagal membuat file Excel: ${e.message}`, 'err');
    } finally {
      setMengunduh(false);
    }
  };

  if (tampilCetak && data) {
    return (
      <div className="animasi-naik">
        <style>{'@page { size: A4 portrait; margin: 10mm; }'}</style>
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => setTampilCetak(false)} className="flex items-center gap-1.5 text-sm font-semibold text-pramuka-700 hover:text-pramuka-900">
            <Icon nama="kembali" className="h-4 w-4" /> Kembali
          </button>
          <button className="btn btn-gold" onClick={() => window.print()}>
            <Icon nama="cetak" className="h-4 w-4" /> Cetak atau simpan PDF
          </button>
        </div>
        <div className="overflow-x-auto pb-4"><CetakLaporanTahunan {...data} /></div>
      </div>
    );
  }

  return (
    <div className="animasi-naik">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Laporan</h1>
        <p className="text-sm text-pramuka-600">Laporan tahunan gugus depan untuk diserahkan ke Kwartir Ranting, dengan tembusan Kwartir Cabang.</p>
      </div>

      <section className="panel mb-4 space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Jenis periode" className="inline-flex flex-wrap rounded-lg bg-pramuka-100 p-1">
            {JENIS_PERIODE.map((j) => (
              <button
                key={j.id}
                role="tab"
                aria-selected={jenis === j.id}
                onClick={() => { setJenis(j.id); setData(null); }}
                className={`rounded-md px-4 py-2 text-sm font-semibold ${jenis === j.id ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-700 hover:bg-pramuka-200'}`}
              >
                {j.label}
              </button>
            ))}
          </div>
          {jenis === 'ajaran' ? (
            <select className="input w-auto" value={nilaiAjaran} onChange={(e) => { setNilaiAjaran(e.target.value); setData(null); }} aria-label="Tahun ajaran">
              {tahunAjaranList.map((t) => <option key={t} value={t}>Tahun ajaran {t}</option>)}
            </select>
          ) : (
            <select className="input w-auto" value={nilaiKalender} onChange={(e) => { setNilaiKalender(e.target.value); setData(null); }} aria-label="Tahun kalender">
              {tahunKalenderList.map((t) => <option key={t} value={t}>Tahun {t}</option>)}
            </select>
          )}
          <button className="btn btn-primary" disabled={sibuk} onClick={buatLaporan}>
            {sibuk ? 'Menyusun laporan...' : 'Susun laporan'}
          </button>
        </div>
        <p className="text-xs text-pramuka-600">
          Periode: {rentang.label} ({fmtTanggal(rentang.mulai)} s.d. {fmtTanggal(rentang.akhir)})
        </p>
        {galat && <p role="alert" className="text-sm text-red-700">{galat}</p>}
      </section>

      {!data && !sibuk && (
        <Kosong judul="Belum ada laporan" teks='Pilih periode lalu tekan "Susun laporan" untuk menyiapkan rekapnya.' />
      )}

      {data && (
        <>
          <section className="panel mb-4 grid grid-cols-2 divide-pramuka-100 md:grid-cols-4 md:divide-x">
            {[
              { nilai: data.keanggotaan.find((r) => r.tingkat === 'Total')?.total ?? 0, label: 'Penegak aktif' },
              { nilai: data.pengurus.length, label: 'Pengurus Dewan Ambalan' },
              { nilai: data.kegiatan.length, label: 'Kegiatan pada periode ini' },
              { nilai: `${data.kehadiran.rata ?? '-'}%`, label: 'Rata-rata kehadiran' },
            ].map((a, i) => (
              <div key={a.label} className={`p-4 ${i > 1 ? 'border-t border-pramuka-100 md:border-t-0' : ''}`}>
                <p className="font-display text-3xl font-bold text-pramuka-800">{a.nilai}</p>
                <p className="text-sm text-pramuka-600">{a.label}</p>
              </div>
            ))}
          </section>

          <div className="flex flex-wrap gap-2">
            <button className="btn btn-gold" disabled={mengunduh} onClick={unduh}>
              <Icon nama="unduh" className="h-4 w-4" /> {mengunduh ? 'Menyiapkan...' : 'Unduh Excel (.xlsx)'}
            </button>
            <button className="btn btn-outline" onClick={() => setTampilCetak(true)}>
              <Icon nama="cetak" className="h-4 w-4" /> Cetak atau simpan PDF
            </button>
          </div>
        </>
      )}
    </div>
  );
}
