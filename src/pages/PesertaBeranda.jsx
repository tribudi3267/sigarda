import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { AMBANG_HADIR } from '../config';
import { cariPoin, hitungProgres, laksanaTerbuka, layakGaruda, PERAN, tingkatSelesai } from '../lib/skuLogic';
import { periodeDari, rekapAbsensi, sesiPeriode, tahunAjaranDari, PERIODE } from '../lib/absensiLogic';
import { fmtTanggal, hariIni } from '../lib/format';
import useAbsensiPeriode from '../hooks/useAbsensiPeriode';
import JadwalUjianBersama from '../components/JadwalUjianBersama';
import KartuIuran from '../components/KartuIuran';
import { Badge, Icon, Kosong, Lencana, ProgressBar, TeksPoin } from '../components/ui';

export default function PesertaBeranda({ setTab, setTingkat }) {
  const { user, users, progress, absensi, peranUser, batalkanAjuan, daftarCalonGaruda } = useApp();

  const bantara = hitungProgres(progress, user, 'Bantara');
  const laksana = hitungProgres(progress, user, 'Laksana');
  const bantaraSelesai = tingkatSelesai(progress, user, 'Bantara');
  const laksanaBuka = laksanaTerbuka(progress, user);
  const fokus = bantaraSelesai ? { nama: 'Laksana', ...laksana } : { nama: 'Bantara', ...bantara };

  const entri = Object.entries(progress[user.id] ?? {})
    .map(([skuId, entry]) => ({ poin: cariPoin(skuId), entry }))
    .filter((x) => x.poin);
  const agenda = entri
    .filter((x) => x.entry.status === 'diajukan' || x.entry.status === 'proses')
    .sort((a, b) => (a.entry.jadwal ?? '9999').localeCompare(b.entry.jadwal ?? '9999'));
  const diulang = entri.filter((x) => x.entry.status === 'ulang');
  const namaPenguji = (id) => users.find((u) => u.id === id)?.nama ?? '-';

  // Kehadiran saya pada semester berjalan
  const saya = useMemo(() => {
    const ta = tahunAjaranDari(hariIni());
    const periode = periodeDari(hariIni());
    const sesi = sesiPeriode(absensi, ta, periode);
    return { ta, periode, ...rekapAbsensi(absensi, [user], sesi)[0] };
  }, [absensi, user]);
  const abs = useAbsensiPeriode(saya.ta, saya.periode); // semester berjalan sudah dimuat saat masuk

  const lihat = (tingkat) => {
    setTingkat(tingkat);
    setTab('sku');
  };

  const mendaftarGaruda = () => {
    if (window.confirm('Daftarkan diri sebagai Penegak Calon Garuda? Anda akan mulai menyiapkan jurnal portofolio.')) {
      daftarCalonGaruda();
    }
  };

  return (
    <div className="space-y-5 animasi-naik">
      <section className="flex items-center gap-5 rounded-lg border-2 border-emas bg-pramuka-800 p-5 text-pramuka-50">
        <Lencana persen={fokus.persen} />
        <div className="min-w-0">
          <p className="text-sm text-pramuka-300">Selamat datang,</p>
          <h1 className="text-2xl font-bold leading-tight">{user.nama}</h1>
          <p className="mt-1 text-sm text-pramuka-200">Kelas {user.kelas}, {user.sangga}, {user.agama}</p>
          <p className="mt-2 inline-block rounded-md bg-emas px-2.5 py-1 text-sm font-bold text-pramuka-900">
            {PERAN[peranUser]?.label}
          </p>
          <p className="mt-2 text-xs text-pramuka-300">
            Lencana menunjukkan progres SKU {fokus.nama}: {fokus.lulus} dari {fokus.total} butir lulus.
          </p>
        </div>
      </section>

      {layakGaruda(progress, user) && (
        <section className="jahitan flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-4">
          <div>
            <p className="flex items-center gap-2 font-semibold text-pramuka-900">
              <Icon nama="bintang" className="h-4 w-4 text-emas" />
              Seluruh SKU Bantara dan Laksana sudah lulus
            </p>
            <p className="mt-1 text-sm text-pramuka-600">
              Kamu memenuhi syarat untuk mencalonkan diri sebagai Penegak Garuda. Setelah mendaftar, dashboard jurnal
              portofolio akan terbuka.
            </p>
          </div>
          <button className="btn btn-gold" onClick={mendaftarGaruda}>Daftar sebagai Calon Garuda</button>
        </section>
      )}

      <section className="panel divide-y divide-pramuka-100">
        {[
          { nama: 'Bantara', h: bantara, terkunci: false },
          { nama: 'Laksana', h: laksana, terkunci: !laksanaBuka },
        ].map(({ nama, h, terkunci }) => (
          <div key={nama} className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">SKU Penegak {nama}</h2>
                <p className="text-sm text-pramuka-600">
                  {h.lulus} dari {h.total} butir lulus
                  {h.diproses > 0 && `, ${h.diproses} dalam proses`}
                </p>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => lihat(nama)}>
                {terkunci && <Icon nama="kunci" className="h-3.5 w-3.5" />}
                Lihat butir
              </button>
            </div>
            <div className="mt-3"><ProgressBar persen={h.persen} tinggi="h-2.5" label={`Progres ${nama}`} /></div>
            {terkunci && (
              <p className="mt-2 text-xs text-pramuka-500">Laksana terbuka setelah seluruh butir Bantara lulus.</p>
            )}
          </div>
        ))}
      </section>

      <section className="panel p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Kehadiran latihan Jumat</h2>
            <p className="text-sm text-pramuka-600">
              {PERIODE[saya.periode]} {saya.ta}: {!abs.siap ? 'memuat kehadiran...' : saya.total ? `${saya.H} hadir dari ${saya.total} pertemuan` : 'belum ada pertemuan tercatat'}
            </p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => setTab('absensi')}>
            <Icon nama="absensi" className="h-4 w-4" /> Lihat absensi
          </button>
        </div>
        {abs.siap && saya.persen !== null && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-sm">
              <span className={saya.persen < AMBANG_HADIR ? 'font-semibold text-red-700' : 'text-pramuka-700'}>
                {saya.persen}% hadir
              </span>
              <span className="text-pramuka-500">batas minimal {AMBANG_HADIR}%</span>
            </div>
            <ProgressBar persen={saya.persen} tinggi="h-2.5" label="Kehadiran" />
          </div>
        )}
      </section>

      <KartuIuran onBuka={() => setTab('iuran')} />

      <JadwalUjianBersama />

      <section>
        <h2 className="mb-2 text-lg font-bold">Agenda pengujian</h2>
        {agenda.length === 0 ? (
          <Kosong judul="Belum ada jadwal pengujian" teks="Pilih butir yang sudah kamu kuasai, lalu ajukan ke penguji.">
            <button className="btn btn-primary btn-sm" onClick={() => lihat(bantaraSelesai ? 'Laksana' : 'Bantara')}>
              Pilih butir untuk diajukan
            </button>
          </Kosong>
        ) : (
          <ul className="panel divide-y divide-pramuka-100">
            {agenda.map(({ poin, entry }) => (
              <li key={poin.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><TeksPoin poin={poin} /></div>
                  <Badge status={entry.status} />
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-pramuka-600">
                  <Icon nama="kalender" className="h-3.5 w-3.5" />
                  {poin.tingkat}, {fmtTanggal(entry.jadwal ?? entry.tanggalUji)}, penguji {entry.pengujiId ? namaPenguji(entry.pengujiId) : 'antrian rombel'}
                </p>
                {entry.status === 'diajukan' && (
                  <button className="btn btn-outline btn-sm mt-2" onClick={() => batalkanAjuan(poin.id)}>
                    Batalkan pengajuan
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {diulang.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold">Perlu diulang</h2>
          <ul className="panel divide-y divide-pramuka-100">
            {diulang.map(({ poin, entry }) => (
              <li key={poin.id} className="p-4">
                <TeksPoin poin={poin} />
                <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
                  <span className="font-semibold">Catatan penguji:</span> {entry.catatan}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {bantaraSelesai && (
        <section className="jahitan flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-4">
          <p className="text-sm font-semibold text-pramuka-800">
            Selamat, seluruh butir Bantara lulus. Surat Tanda Lulus siap dicetak.
          </p>
          <button className="btn btn-gold btn-sm" onClick={() => setTab('cetak')}>
            <Icon nama="cetak" className="h-4 w-4" /> Buka dokumen cetak
          </button>
        </section>
      )}
    </div>
  );
}
