import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { rentangPeriode, sesiPeriode, PERIODE } from '../lib/absensiLogic';
import { rekapPeserta, ringkasAgregat, rupiah } from '../lib/iuranLogic';
import { fmtTanggal } from '../lib/format';
import { useIuranRentang } from '../hooks/useIuran';
import { periodeAwal } from './PilihPeriode';
import { Icon, ProgressBar } from './ui';

/**
 * Kartu iuran bumbung untuk dashboard semua peran, semester berjalan.
 *   Penegak          : iuran rutin miliknya (persen pertemuan beriuran) dan total gudep
 *   Dewan/Pembina/Admin: total gudep, Jumat terakhir, sangga teratas, jumlah Penegak di bawah ambang rutin, dan kas yang belum ditutup
 * Tidak tampil sama sekali bila basis data belum dimigrasi (tanpa mengganggu dashboard).
 */
export default function KartuIuran({ onBuka }) {
  const { user, absensi, daftarPeserta, pengaturanIuran } = useApp();
  const ambang = pengaturanIuran.ambang;
  const pengurus = user.role !== 'peserta';
  const per = useMemo(() => periodeAwal(), []);
  const { mulai, akhir } = rentangPeriode(per.ta, per.periode);
  const sesi = useMemo(() => sesiPeriode(absensi, per.ta, per.periode), [absensi, per.ta, per.periode]);
  const r = useIuranRentang(mulai, akhir, { baris: true, kas: pengurus });
  const ring = useMemo(() => ringkasAgregat(r.agregat), [r.agregat]);

  const saya = useMemo(() => (pengurus ? null : rekapPeserta(r.baris, [user], sesi)[0]), [pengurus, r.baris, user, sesi]);
  const rekap = useMemo(() => (pengurus ? rekapPeserta(r.baris, daftarPeserta, sesi) : []), [pengurus, r.baris, daftarPeserta, sesi]);

  if (r.galat) return null;
  if (!r.siap) return <section className="panel p-4" aria-label="Iuran bumbung" role="status"><p className="text-sm text-pramuka-500">Memuat iuran bumbung...</p></section>;

  const terakhir = [...sesi].reverse().find((s) => ring.perTanggal[s.tanggal]);
  const dibawah = rekap.filter((x) => x.persen !== null && x.persen < ambang).length;
  const kasBelum = sesi.filter((s) => (ring.perTanggal[s.tanggal]?.jumlah ?? 0) > 0 && !r.kas[s.tanggal]).length;

  return (
    <section className="panel p-4" aria-label="Iuran bumbung">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Iuran bumbung kepramukaan</h2>
          <p className="text-sm text-pramuka-600">{PERIODE[per.periode]} {per.ta}</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={onBuka}>
          <Icon nama="iuran" className="h-4 w-4" /> Buka menu Iuran
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-pramuka-500">Total gudep</dt>
          <dd className="font-display text-xl font-bold text-pramuka-800">{rupiah(ring.total)}</dd>
        </div>
        <div>
          <dt className="text-xs text-pramuka-500">Jumat terakhir</dt>
          <dd className="font-semibold text-pramuka-900">{terakhir ? rupiah(ring.perTanggal[terakhir.tanggal].jumlah) : '-'}</dd>
          {terakhir && <dd className="text-[11px] text-pramuka-500">{fmtTanggal(terakhir.tanggal)}</dd>}
        </div>
        {saya && (
          <>
            <div>
              <dt className="text-xs text-pramuka-500">Iuran saya</dt>
              <dd className="font-semibold text-pramuka-900">{rupiah(saya.total)}</dd>
            </div>
            <div>
              <dt className="text-xs text-pramuka-500">Beriuran</dt>
              <dd className={`font-semibold ${saya.persen !== null && saya.persen < ambang ? 'text-red-700' : 'text-emerald-800'}`}>
                {saya.persen === null ? '-' : `${saya.kali}/${sesi.length} (${saya.persen}%)`}
              </dd>
            </div>
          </>
        )}
        {pengurus && (
          <>
            <div>
              <dt className="text-xs text-pramuka-500">Sangga teratas</dt>
              <dd className="font-semibold text-pramuka-900">{ring.sangga[0] ? `${ring.sangga[0].kunci || '-'}` : '-'}</dd>
              {ring.sangga[0] && <dd className="text-[11px] text-pramuka-500">{rupiah(ring.sangga[0].jumlah)}</dd>}
            </div>
            <div>
              <dt className="text-xs text-pramuka-500">Perlu perhatian</dt>
              <dd className={`font-semibold ${dibawah || kasBelum ? 'text-red-700' : 'text-emerald-800'}`}>
                {dibawah} di bawah {ambang}%
              </dd>
              <dd className="text-[11px] text-pramuka-500">{kasBelum} Jumat belum tutup kas</dd>
            </div>
          </>
        )}
      </dl>

      {saya && saya.persen !== null && (
        <div className="mt-3">
          <ProgressBar persen={Math.min(100, saya.persen)} label="Iuran rutin saya" />
          <p className={`mt-1 text-xs ${saya.persen < ambang ? 'font-semibold text-red-700' : 'text-pramuka-500'}`}>
            {saya.persen < ambang
              ? `Di bawah batas rutin ${ambang}%. Beriuranlah setiap Jumat; ini menjadi dasar penilaian SKU tentang iuran.`
              : `Memenuhi batas rutin ${ambang}%. Pertahankan.`}
          </p>
        </div>
      )}
    </section>
  );
}
