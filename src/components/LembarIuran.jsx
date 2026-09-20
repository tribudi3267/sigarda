import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { jumatBerdekatan, jumatTerakhir, tanggalValid, adalahJumat } from '../lib/absensiLogic';
import { NOMINAL_TOMBOL, rupiah } from '../lib/iuranLogic';
import { fmtHariTanggal, hariIni } from '../lib/format';
import FilterBar, { FILTER_AWAL, terapkanFilter } from './FilterBar';
import PilihNominal from './PilihNominal';
import { Avatar, BadgeAbsen, Icon, Kosong } from './ui';

/**
 * Lembar catat iuran satu Jumat untuk Dewan Ambalan dan asisten bendahara. Daftar Penegak berasal dari fungsi server (asisten tidak
 * boleh membaca profil Penegak lain lewat tabel) dan sudah memuat status absensi serta iuran hari itu. Iuran sendiri tidak muncul.
 */
export default function LembarIuran() {
  const { absensi, aturIuran, aturIuranBanyak, bacaIuran, versiIuran, dewanAmbalan } = useApp();
  const [tanggal, setTanggal] = useState(() => jumatTerakhir(hariIni()));
  const [filter, setFilter] = useState(FILTER_AWAL);
  const [nominalMassal, setNominalMassal] = useState(1000);
  const [s, setS] = useState({ untuk: null, daftar: [], galat: '' });

  const valid = tanggalValid(tanggal) && adalahJumat(tanggal);
  const belumTiba = valid && tanggal > hariIni();
  const adaSesi = valid && !belumTiba && !!absensi.sesi[tanggal];

  useEffect(() => {
    if (!adaSesi) return undefined;
    let batal = false;
    bacaIuran('muatLembarIuran', tanggal).then((r) => {
      if (!batal) setS({ untuk: tanggal, daftar: r.ok ? r.data : [], galat: r.ok ? '' : r.pesan });
    });
    return () => { batal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tanggal, adaSesi, versiIuran]);

  const siap = s.untuk === tanggal;
  const daftar = siap ? s.daftar : [];
  const tersaring = useMemo(() => terapkanFilter(daftar, filter), [daftar, filter]);
  const jumlah = daftar.reduce((n, d) => n + (d.jumlah ?? 0), 0);
  const beriuran = daftar.filter((d) => d.jumlah != null).length;
  const hadirKosong = tersaring.filter((d) => d.status === 'H' && d.jumlah == null).map((d) => d.id);

  return (
    <div>
      <section className="panel mb-4 p-4">
        <label htmlFor="tgl-iuran" className="label">Tanggal latihan (Jumat)</label>
        <div className="flex flex-wrap items-center gap-2">
          <input id="tgl-iuran" type="date" className="input w-auto" value={tanggal} min="2000-01-01" max="2100-12-31" onChange={(e) => setTanggal(e.target.value)} />
          <button className="btn btn-outline btn-sm" disabled={!tanggalValid(tanggal)} onClick={() => setTanggal(jumatBerdekatan(tanggal, -1))}>
            <Icon nama="kembali" className="h-3.5 w-3.5" /> Jumat sebelumnya
          </button>
          <button className="btn btn-outline btn-sm" disabled={!tanggalValid(tanggal) || jumatBerdekatan(tanggal, 1) > hariIni()} onClick={() => setTanggal(jumatBerdekatan(tanggal, 1))}>
            Jumat berikutnya <Icon nama="panahKanan" className="h-3.5 w-3.5" />
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setTanggal(jumatTerakhir(hariIni()))}>Jumat terakhir</button>
        </div>
        {valid && <p className="mt-2 text-sm font-semibold text-pramuka-800">{fmtHariTanggal(tanggal)}</p>}
      </section>

      {!valid && <Kosong judul="Pilih hari Jumat" teks="Iuran dicatat pada sesi latihan Jumat." />}
      {valid && belumTiba && <Kosong judul="Tanggal ini belum tiba" teks="Iuran hanya dapat dicatat pada hari latihan atau sesudahnya." />}
      {valid && !belumTiba && !adaSesi && (
        <Kosong judul="Sesi absensi Jumat ini belum dibuat" teks="Iuran dicatat pada sesi latihan. Minta Dewan Ambalan membuka absensi Jumat ini di menu Absensi, lalu kembali ke sini." />
      )}
      {adaSesi && !siap && <div role="status" aria-live="polite"><Kosong judul="Memuat daftar..." teks="Mengambil daftar Penegak dan iuran hari ini." /></div>}
      {adaSesi && siap && s.galat && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900 ring-1 ring-red-300">{s.galat}</p>}

      {adaSesi && siap && !s.galat && (
        <>
          <section className="panel mb-4 p-4">
            <p className="text-sm text-pramuka-700">
              Iuran bumbung hari ini: <b className="text-amber-800">{rupiah(jumlah)}</b> dari {beriuran} Penegak
              {daftar.length > 0 && <>, {daftar.length - beriuran} belum beriuran</>}.
            </p>
            <p className="mt-1 text-xs text-pramuka-500">
              Pilih nominal atau ketik angka lain. Tekan nominal yang aktif sekali lagi untuk menghapus. Yang izin atau sakit boleh menitip iuran.
              Setiap perubahan tercatat (siapa dan kapan).
            </p>
          </section>

          <div className="mb-3"><FilterBar data={daftar} filter={filter} setFilter={setFilter} tampil={['sangga', 'kelas']} /></div>

          <div className="no-print mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-pramuka-600">Yang hadir dan belum beriuran ({hadirKosong.length} tampil):</span>
            <select className="input w-auto py-1" aria-label="Nominal iuran massal" value={nominalMassal} onChange={(e) => setNominalMassal(Number(e.target.value))}>
              {NOMINAL_TOMBOL.map((n) => <option key={n} value={n}>{rupiah(n)}</option>)}
            </select>
            <button className="btn btn-outline btn-sm" disabled={hadirKosong.length === 0} onClick={() => aturIuranBanyak(tanggal, hadirKosong, nominalMassal, true)}>Isi iuran</button>
          </div>

          {tersaring.length === 0 ? (
            <Kosong judul="Tidak ada Penegak" teks="Ubah kata kunci, sangga, atau kelas pada filter." />
          ) : (
            <ul className="panel divide-y divide-pramuka-100">
              {tersaring.map((d) => (
                <li key={d.id} className="p-3 sm:p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar nama={d.nama} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{d.nama}</p>
                      <p className="text-xs text-pramuka-500">Kelas {d.kelas}, {d.sangga}</p>
                    </div>
                    <BadgeAbsen status={d.status ?? 'B'} />
                  </div>
                  <div className="mt-2">
                    <PilihNominal
                      label={`Iuran ${d.nama}`}
                      nilai={d.jumlah}
                      onUbah={(jumlahBaru) => aturIuran(tanggal, d.id, jumlahBaru)}
                    />
                    {d.jenis === 'susulan' && <p className="mt-1 text-[11px] font-semibold text-amber-800">Iuran susulan (ditebus belakangan)</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!dewanAmbalan && <p className="mt-3 text-xs text-pramuka-500">Anda mencatat sebagai asisten bendahara. Iuran Anda sendiri dicatat oleh Dewan Ambalan.</p>}
        </>
      )}
    </div>
  );
}
