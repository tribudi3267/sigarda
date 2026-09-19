import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { AMBANG_HADIR } from '../config';
import {
  adalahJumat, jumatBerdekatan, jumatTerakhir, KODE_STATUS, namaBulan, namaHari, periodeDari, PERIODE,
  rekapAbsensi, ringkasAbsensi, sesiPeriode, STATUS_ABSEN, tahunAjaranDari, tanggalValid,
} from '../lib/absensiLogic';
import { unduhAbsensiXlsx } from '../lib/exportLaporan';
import { fmtHariTanggal, fmtTglPendek, hariIni } from '../lib/format';
import FilterBar, { FILTER_AWAL, terapkanFilter } from '../components/FilterBar';
import PilihPeriode, { periodeAwal } from '../components/PilihPeriode';
import useAbsensiPeriode from '../hooks/useAbsensiPeriode';
import { Avatar, BadgeAbsen, BadgePeran, Icon, Kosong, MuatAbsensi, ProgressBar } from '../components/ui';

const KOTAK = 'inline-flex h-6 w-6 items-center justify-center rounded text-xs font-bold ring-1 ring-inset';

function Angka({ nilai, label, ket }) {
  return (
    <div className="p-4">
      <p className="font-display text-3xl font-bold text-pramuka-800">{nilai}</p>
      <p className="text-sm text-pramuka-600">{label}</p>
      {ket && <p className="text-xs text-pramuka-500">{ket}</p>}
    </div>
  );
}

/* ============================== PESERTA ============================== */

export function AbsensiPeserta() {
  const { user, absensi } = useApp();
  const [per, setPer] = useState(periodeAwal);
  const abs = useAbsensiPeriode(per.ta, per.periode);

  const sesi = sesiPeriode(absensi, per.ta, per.periode);
  const saya = rekapAbsensi(absensi, [user], sesi)[0];

  return (
    <div className="animasi-naik">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Absensi latihan Jumat</h1>
          <p className="text-sm text-pramuka-600">Kehadiran latihan rutin ambalan setiap hari Jumat, dicatat oleh pengurus.</p>
        </div>
        <PilihPeriode nilai={per} ubah={setPer} />
      </div>

      {!abs.siap ? <MuatAbsensi galat={abs.galat} coba={abs.coba} /> : (<>
      <section className="panel mb-5 grid grid-cols-2 divide-pramuka-100 md:grid-cols-5 md:divide-x">
        <Angka nilai={saya.H} label="Hadir" />
        <Angka nilai={saya.I} label="Izin" />
        <Angka nilai={saya.S} label="Sakit" />
        <Angka nilai={saya.A} label="Alpa" />
        <Angka nilai={saya.persen === null ? '-' : `${saya.persen}%`} label="Kehadiran" ket={`Batas minimal ${AMBANG_HADIR}%`} />
      </section>

      {saya.persen !== null && (
        <div className="panel mb-5 p-4">
          <ProgressBar persen={saya.persen} tinggi="h-3" label="Kehadiran" />
          <p className={`mt-2 text-sm ${saya.persen < AMBANG_HADIR ? 'font-semibold text-red-700' : 'text-pramuka-600'}`}>
            {saya.persen < AMBANG_HADIR
              ? `Kehadiranmu di bawah ${AMBANG_HADIR}%. Usahakan hadir pada latihan berikutnya.`
              : 'Kehadiranmu memenuhi batas minimal. Pertahankan.'}
          </p>
        </div>
      )}

      <h2 className="mb-2 text-lg font-bold">Riwayat pertemuan ({PERIODE[per.periode]} {per.ta})</h2>
      {sesi.length === 0 ? (
        <Kosong judul="Belum ada pertemuan tercatat" teks="Pengurus akan mencatat absensi setiap latihan Jumat." />
      ) : (
        <ul className="panel divide-y divide-pramuka-100">
          {[...sesi].reverse().map((s) => (
            <li key={s.tanggal} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm font-medium">{fmtHariTanggal(s.tanggal)}</span>
              <BadgeAbsen status={saya.perSesi[s.tanggal]} />
            </li>
          ))}
        </ul>
      )}
      </>)}
    </div>
  );
}

/* ============================== PENGURUS ============================== */

function Kotak({ label, nilai }) {
  return (
    <div className="px-3 py-2.5">
      <dt className="text-xs text-pramuka-500">{label}</dt>
      <dd className="font-semibold text-pramuka-900">{nilai}</dd>
    </div>
  );
}

function InputAbsensi() {
  const { daftarPeserta, absensi, buatSesiAbsen, setStatusAbsen, tandaiBanyakAbsen, hapusSesiAbsen } = useApp();
  const [tanggal, setTanggal] = useState(() => jumatTerakhir(hariIni()));
  const [filter, setFilter] = useState(FILTER_AWAL);

  const valid = tanggalValid(tanggal);
  const jumat = valid && adalahJumat(tanggal);
  const belumTiba = valid && tanggal > hariIni();
  const bisaCatat = jumat && !belumTiba;

  // Tahun ajaran dan semester dihitung dari tanggal, sehingga berlaku untuk tahun berapa pun
  const ta = valid ? tahunAjaranDari(tanggal) : '';
  const periode = valid ? periodeDari(tanggal) : '';
  const abs = useAbsensiPeriode(ta, periode); // kehadiran semester dari tanggal terpilih (tahun lama dimuat saat dipilih)
  const tanggalLain = valid && !jumat ? { sebelum: jumatBerdekatan(tanggal, -1), sesudah: jumatBerdekatan(tanggal, 1) } : null;
  const jumatBerikut = valid ? jumatBerdekatan(tanggal, 1) : '';

  const sesiSemester = useMemo(() => (valid ? [...sesiPeriode(absensi, ta, periode)].reverse() : []), [absensi, valid, ta, periode]);

  const sesi = bisaCatat ? absensi.sesi[tanggal] : null;
  const catatan = absensi.hadir[tanggal] ?? {};

  // Semua anggota dapat dicatat pada tanggal berapa pun (termasuk pengisian susulan)
  const berhak = useMemo(() => (bisaCatat ? daftarPeserta : []), [daftarPeserta, bisaCatat]);
  const tersaring = useMemo(
    () => terapkanFilter(berhak, filter).sort((a, b) => a.nama.localeCompare(b.nama, 'id')),
    [berhak, filter]
  );

  const hitung = { H: 0, I: 0, S: 0, A: 0, B: 0 };
  for (const u of berhak) hitung[catatan[u.id]?.status ?? 'B'] += 1;

  const hapus = () => {
    if (window.confirm(`Hapus sesi ${fmtHariTanggal(tanggal)} beserta seluruh catatan absensinya?`)) hapusSesiAbsen(tanggal);
  };
  const idTersaring = tersaring.map((u) => u.id);

  return (
    <div>
      <section className="panel mb-4 p-4">
        <label htmlFor="tgl-absen" className="label">Tanggal latihan</label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="tgl-absen"
            type="date"
            className="input w-auto"
            value={tanggal}
            min="2000-01-01"
            max="2100-12-31"
            onChange={(e) => setTanggal(e.target.value)}
          />
          <button className="btn btn-outline btn-sm" disabled={!valid} onClick={() => setTanggal(jumatBerdekatan(tanggal, -1))}>
            <Icon nama="kembali" className="h-3.5 w-3.5" /> Jumat sebelumnya
          </button>
          <button className="btn btn-outline btn-sm" disabled={!valid || jumatBerikut > hariIni()} onClick={() => setTanggal(jumatBerikut)}>
            Jumat berikutnya <Icon nama="panahKanan" className="h-3.5 w-3.5" />
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setTanggal(jumatTerakhir(hariIni()))}>Jumat terakhir</button>
        </div>

        {valid ? (
          <dl className="mt-3 grid grid-cols-2 divide-x divide-y divide-pramuka-100 overflow-hidden rounded-lg border border-pramuka-100 sm:grid-cols-3 md:grid-cols-6 md:divide-y-0">
            <Kotak label="Hari" nilai={namaHari(tanggal)} />
            <Kotak label="Tanggal" nilai={Number(tanggal.slice(8, 10))} />
            <Kotak label="Bulan" nilai={namaBulan(tanggal)} />
            <Kotak label="Tahun" nilai={tanggal.slice(0, 4)} />
            <Kotak label="Tahun ajaran" nilai={ta} />
            <Kotak label="Semester" nilai={PERIODE[periode].replace('Semester ', '')} />
          </dl>
        ) : (
          <p className="mt-3 text-sm text-pramuka-600">Pilih tanggal pada kotak di atas (tahun 2000 sampai 2100).</p>
        )}

        {sesiSemester.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-semibold text-pramuka-600">Sesi tercatat pada {PERIODE[periode]} {ta}</p>
            <ul className="flex flex-wrap gap-1.5">
              {sesiSemester.map((s) => (
                <li key={s.tanggal}>
                  <button
                    onClick={() => setTanggal(s.tanggal)}
                    aria-pressed={s.tanggal === tanggal}
                    className={`rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${
                      s.tanggal === tanggal ? 'bg-pramuka-800 text-pramuka-50 ring-pramuka-800' : 'bg-white text-pramuka-700 ring-pramuka-300 hover:bg-pramuka-100'
                    }`}
                  >
                    {fmtTglPendek(s.tanggal)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {tanggalLain && (
        <div className="jahitan mb-4 rounded-lg bg-white p-4">
          <p className="font-semibold text-pramuka-900">{fmtHariTanggal(tanggal)} bukan hari Jumat</p>
          <p className="text-sm text-pramuka-600">Latihan rutin dicatat pada hari Jumat. Pilih Jumat terdekat:</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-primary btn-sm" onClick={() => setTanggal(tanggalLain.sebelum)}>
              {fmtHariTanggal(tanggalLain.sebelum)}
            </button>
            {tanggalLain.sesudah <= hariIni() && (
              <button className="btn btn-outline btn-sm" onClick={() => setTanggal(tanggalLain.sesudah)}>
                {fmtHariTanggal(tanggalLain.sesudah)}
              </button>
            )}
          </div>
        </div>
      )}

      {belumTiba && jumat && (
        <Kosong judul="Tanggal ini belum tiba" teks="Absensi hanya dapat dicatat pada hari latihan atau sesudahnya." />
      )}

      {bisaCatat && !sesi && (
        <Kosong
          judul="Belum ada sesi pada tanggal ini"
          teks={`Buat sesi absensi untuk ${fmtHariTanggal(tanggal)}, lalu catat kehadiran anggota.`}
        >
          <button className="btn btn-primary" onClick={() => buatSesiAbsen(tanggal)}>
            <Icon nama="tambah" className="h-4 w-4" /> Buat sesi absensi
          </button>
        </Kosong>
      )}

      {bisaCatat && sesi && !abs.siap && <MuatAbsensi galat={abs.galat} coba={abs.coba} />}

      {bisaCatat && sesi && abs.siap && (
        <>
          <section className="panel mb-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">{fmtHariTanggal(tanggal)}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-pramuka-600">
                  <span>Hadir <b className="text-emerald-700">{hitung.H}</b></span>
                  <span>Izin <b className="text-sky-700">{hitung.I}</b></span>
                  <span>Sakit <b className="text-amber-700">{hitung.S}</b></span>
                  <span>Alpa <b className="text-red-700">{hitung.A}</b></span>
                  <span>Belum dicatat <b>{hitung.B}</b></span>
                </p>
              </div>
              <button className="btn btn-outline btn-sm text-red-700" onClick={hapus}>
                <Icon nama="hapus" className="h-3.5 w-3.5" /> Hapus sesi
              </button>
            </div>
            <p className="mt-2 text-xs text-pramuka-500">
              Anggota yang belum dicatat tidak dihitung pada rekap. Catat Alpa secara eksplisit bila memang tidak hadir tanpa keterangan.
            </p>
          </section>

          <div className="mb-3"><FilterBar data={berhak} filter={filter} setFilter={setFilter} /></div>

          <div className="no-print mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-pramuka-600">Yang belum dicatat ({tersaring.filter((u) => !catatan[u.id]).length} tampil):</span>
            <button className="btn btn-outline btn-sm" onClick={() => tandaiBanyakAbsen(tanggal, idTersaring, 'H')}>Tandai hadir</button>
            <button className="btn btn-outline btn-sm" onClick={() => tandaiBanyakAbsen(tanggal, idTersaring, 'A')}>Tandai alpa</button>
          </div>

          {tersaring.length === 0 ? (
            <Kosong judul="Tidak ada anggota" teks="Ubah kata kunci, sangga, kelas, atau peran pada filter." />
          ) : (
            <ul className="panel divide-y divide-pramuka-100">
              {tersaring.map((u) => {
                const status = catatan[u.id]?.status;
                return (
                  <li key={u.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar nama={u.nama} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{u.nama}</p>
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-pramuka-500">
                          Kelas {u.kelas}, {u.sangga} <BadgePeran peran={u.peran} singkat />
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5" role="group" aria-label={`Absensi ${u.nama}`}>
                      {KODE_STATUS.map((k) => (
                        <button
                          key={k}
                          aria-pressed={status === k}
                          title={STATUS_ABSEN[k].label}
                          onClick={() => setStatusAbsen(tanggal, u.id, status === k ? null : k)}
                          className={`min-w-[3.5rem] rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 ring-inset transition-colors ${
                            status === k ? STATUS_ABSEN[k].aktif : 'bg-white text-pramuka-700 ring-pramuka-300 hover:bg-pramuka-100'
                          }`}
                        >
                          {STATUS_ABSEN[k].label}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function RekapAbsensi() {
  const { daftarPeserta, absensi, notify } = useApp();
  const [per, setPer] = useState(periodeAwal);
  const [filter, setFilter] = useState(FILTER_AWAL);
  const [tampil, setTampil] = useState('ringkas');
  const [mengunduh, setMengunduh] = useState(false);
  const abs = useAbsensiPeriode(per.ta, per.periode);

  const sesiList = useMemo(() => sesiPeriode(absensi, per.ta, per.periode), [absensi, per]);
  const rekap = useMemo(() => {
    const ids = new Set(terapkanFilter(daftarPeserta, filter).map((u) => u.id));
    return rekapAbsensi(absensi, daftarPeserta.filter((u) => ids.has(u.id)), sesiList).sort((a, b) =>
      a.user.nama.localeCompare(b.user.nama, 'id')
    );
  }, [absensi, daftarPeserta, filter, sesiList]);
  const ringkas = ringkasAbsensi(rekap, sesiList, AMBANG_HADIR);

  const unduh = async () => {
    setMengunduh(true);
    try {
      await unduhAbsensiXlsx({ tahunAjaran: per.ta, periode: per.periode, rekap, sesiList, filter });
      notify('File Excel rekap absensi diunduh.');
    } catch (e) {
      notify(`Gagal membuat file Excel: ${e.message}`, 'err');
    } finally {
      setMengunduh(false);
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <PilihPeriode nilai={per} ubah={setPer} />
        <button className="btn btn-gold btn-sm" onClick={unduh} disabled={mengunduh || !abs.siap || rekap.length === 0}>
          <Icon nama="unduh" className="h-4 w-4" /> {mengunduh ? 'Menyiapkan...' : 'Unduh Excel (.xlsx)'}
        </button>
      </div>
      <div className="mb-4"><FilterBar data={daftarPeserta} filter={filter} setFilter={setFilter} /></div>

      {!abs.siap ? <MuatAbsensi galat={abs.galat} coba={abs.coba} /> : (<>
      <section className="panel mb-4 grid grid-cols-2 divide-pramuka-100 md:grid-cols-4 md:divide-x">
        <Angka nilai={ringkas.pertemuan} label="Pertemuan terlaksana" ket={`${PERIODE[per.periode]} ${per.ta}`} />
        <Angka nilai={ringkas.rata === null ? '-' : `${ringkas.rata}%`} label="Rata-rata kehadiran" />
        <Angka nilai={ringkas.baik} label={`Kehadiran ${AMBANG_HADIR}% ke atas`} />
        <Angka nilai={ringkas.rendah} label={`Di bawah ${AMBANG_HADIR}%`} />
      </section>

      <div role="tablist" aria-label="Tampilan rekap" className="no-print mb-3 inline-flex rounded-lg bg-pramuka-100 p-1">
        {[['ringkas', 'Ringkas'], ['jumat', 'Per Jumat']].map(([k, v]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tampil === k}
            onClick={() => setTampil(k)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tampil === k ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-700 hover:bg-pramuka-200'}`}
          >
            {v}
          </button>
        ))}
      </div>

      {rekap.length === 0 ? (
        <Kosong judul="Tidak ada data" teks="Ubah kata kunci, sangga, kelas, atau peran pada filter." />
      ) : sesiList.length === 0 ? (
        <Kosong judul="Belum ada pertemuan pada periode ini" teks="Rekap terisi setelah pengurus mencatat absensi latihan Jumat." />
      ) : tampil === 'ringkas' ? (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-pramuka-100 text-pramuka-800">
              <tr>
                <th className="px-3 py-2 font-semibold">No</th>
                <th className="px-3 py-2 font-semibold">Nama</th>
                <th className="px-3 py-2 font-semibold">Kelas, sangga</th>
                <th className="px-3 py-2 font-semibold">Peran</th>
                <th className="px-3 py-2 text-center font-semibold">H</th>
                <th className="px-3 py-2 text-center font-semibold">I</th>
                <th className="px-3 py-2 text-center font-semibold">S</th>
                <th className="px-3 py-2 text-center font-semibold">A</th>
                <th className="px-3 py-2 font-semibold">Kehadiran</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pramuka-100">
              {rekap.map((r, i) => (
                <tr key={r.user.id} className={r.persen !== null && r.persen < AMBANG_HADIR ? 'bg-red-50/60' : ''}>
                  <td className="px-3 py-2.5 text-pramuka-500">{i + 1}</td>
                  <td className="px-3 py-2.5 font-semibold">{r.user.nama}</td>
                  <td className="px-3 py-2.5 text-pramuka-600">{r.user.kelas}, {r.user.sangga}</td>
                  <td className="px-3 py-2.5"><BadgePeran peran={r.user.peran} singkat /></td>
                  <td className="px-3 py-2.5 text-center">{r.H}</td>
                  <td className="px-3 py-2.5 text-center">{r.I}</td>
                  <td className="px-3 py-2.5 text-center">{r.S}</td>
                  <td className="px-3 py-2.5 text-center">{r.A}</td>
                  <td className="px-3 py-2.5">
                    {r.persen === null ? '-' : (
                      <div className="w-28">
                        <p className={`mb-1 text-xs ${r.persen < AMBANG_HADIR ? 'font-semibold text-red-700' : ''}`}>{r.persen}% ({r.H}/{r.total})</p>
                        <ProgressBar persen={r.persen} label="Kehadiran" />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-pramuka-100 text-pramuka-800">
              <tr>
                <th className="sticky left-0 z-10 bg-pramuka-100 px-3 py-2 font-semibold">Nama</th>
                {sesiList.map((s) => (
                  <th key={s.tanggal} className="px-1.5 py-2 text-center text-xs font-semibold" title={fmtHariTanggal(s.tanggal)}>
                    {fmtTglPendek(s.tanggal)}
                  </th>
                ))}
                <th className="px-3 py-2 text-center font-semibold">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pramuka-100">
              {rekap.map((r) => (
                <tr key={r.user.id}>
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-semibold">
                    {r.user.nama}
                    <span className="block text-xs font-normal text-pramuka-500">Kelas {r.user.kelas}, {r.user.sangga}</span>
                  </td>
                  {sesiList.map((s) => {
                    const st = r.perSesi[s.tanggal];
                    return (
                      <td key={s.tanggal} className="px-1.5 py-2 text-center">
                        {st && st !== 'B' ? (
                          <span className={`${KOTAK} ${STATUS_ABSEN[st].kelas}`} title={STATUS_ABSEN[st].label}>{st}</span>
                        ) : (
                          <span className="text-pramuka-300" title="Belum dicatat">?</span>
                        )}
                      </td>
                    );
                  })}
                  <td className={`px-3 py-2 text-center font-semibold ${r.persen !== null && r.persen < AMBANG_HADIR ? 'text-red-700' : ''}`}>
                    {r.persen === null ? '-' : `${r.persen}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-pramuka-500">
        H hadir, I izin, S sakit, A alpa, ? belum dicatat pengurus (tidak dihitung pada persentase).
      </p>
      </>)}
    </div>
  );
}

export function AbsensiPengurus() {
  const [tab, setTab] = useState('rekap');
  return (
    <div className="animasi-naik">
      <h1 className="mb-1 text-2xl font-bold">Absensi latihan Jumat</h1>
      <p className="mb-4 text-sm text-pramuka-600">
        Catat kehadiran latihan rutin setiap Jumat dan pantau rekapnya per semester atau per tahun ajaran.
      </p>
      <div role="tablist" aria-label="Menu absensi" className="mb-4 inline-flex rounded-lg bg-pramuka-100 p-1">
        {[['rekap', 'Rekap', 'tabel'], ['input', 'Catat absensi', 'absensi']].map(([k, v, ikon]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-700 hover:bg-pramuka-200'}`}
          >
            <Icon nama={ikon} className="h-4 w-4" /> {v}
          </button>
        ))}
      </div>
      {tab === 'rekap' ? <RekapAbsensi /> : <InputAbsensi />}
    </div>
  );
}



