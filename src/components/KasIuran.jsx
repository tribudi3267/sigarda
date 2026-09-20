import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { rentangPeriode, sesiPeriode, PERIODE } from '../lib/absensiLogic';
import { bacaJumlah, bandingkanKas, ringkasAgregat, rupiah } from '../lib/iuranLogic';
import { fmtHariTanggal } from '../lib/format';
import { useIuranRentang } from '../hooks/useIuran';
import PilihPeriode, { periodeAwal } from './PilihPeriode';
import { Kosong } from './ui';

const KELAS_STATUS = {
  cocok: 'bg-emerald-100 text-emerald-900 ring-emerald-300',
  lebih: 'bg-amber-100 text-amber-900 ring-amber-300',
  kurang: 'bg-red-100 text-red-900 ring-red-300',
};
const LABEL_STATUS = { cocok: 'Cocok', lebih: 'Uang lebih', kurang: 'Uang kurang' };

function BarisKas({ tanggal, catatanTotal, kas, boleh, simpan }) {
  const [teks, setTeks] = useState(kas ? String(kas.totalFisik) : '');
  const [catatan, setCatatan] = useState(kas?.catatan ?? '');
  const [galat, setGalat] = useState('');
  const [proses, setProses] = useState(false);
  const banding = bandingkanKas(catatanTotal, kas);

  const kirim = async () => {
    const h = bacaJumlah(teks);
    if (!h.ok) return setGalat(h.pesan);
    if (teks.trim() === '') return setGalat('Isi total uang fisik (boleh 0).');
    setGalat('');
    setProses(true);
    const hasil = await simpan(tanggal, h.nilai ?? 0, catatan);
    setProses(false);
    if (!hasil.ok) setGalat(hasil.pesan ?? 'Belum dapat disimpan.');
    return undefined;
  };
  const hapus = async () => {
    if (!window.confirm(`Hapus catatan tutup kas ${fmtHariTanggal(tanggal)}?`)) return;
    setProses(true);
    const hasil = await simpan(tanggal, null, '');
    setProses(false);
    if (hasil.ok) { setTeks(''); setCatatan(''); }
  };

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{fmtHariTanggal(tanggal)}</p>
        {banding.status ? (
          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${KELAS_STATUS[banding.status]}`}>
            {LABEL_STATUS[banding.status]}{banding.status !== 'cocok' && `: ${banding.selisih > 0 ? '+' : ''}${rupiah(banding.selisih)}`}
          </span>
        ) : <span className="text-xs text-pramuka-500">Kas belum ditutup</span>}
      </div>
      <p className="mt-0.5 text-sm text-pramuka-600">Catatan iuran: <b className="text-pramuka-900">{rupiah(catatanTotal)}</b>{kas && <>, uang fisik: <b className="text-pramuka-900">{rupiah(kas.totalFisik)}</b></>}</p>
      {kas?.catatan && <p className="mt-0.5 text-xs text-pramuka-500">Catatan: {kas.catatan}</p>}

      {boleh && (
        <div className="mt-2 grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
          <input className="input" inputMode="numeric" placeholder="Uang fisik (Rp)" aria-label={`Uang fisik ${fmtHariTanggal(tanggal)}`} value={teks} onChange={(e) => setTeks(e.target.value)} />
          <input className="input" maxLength={300} placeholder="Catatan (opsional), mis. selisih receh" aria-label={`Catatan kas ${fmtHariTanggal(tanggal)}`} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" onClick={kirim} disabled={proses}>{kas ? 'Perbarui' : 'Tutup kas'}</button>
            {kas && <button className="btn btn-outline btn-sm text-red-700" onClick={hapus} disabled={proses}>Hapus</button>}
          </div>
        </div>
      )}
      {galat && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{galat}</p>}
    </li>
  );
}

/**
 * Tutup kas per pertemuan: Dewan Ambalan memasukkan total uang fisik yang dihitung; aplikasi menandai selisihnya dengan jumlah
 * catatan iuran. Pembina dan Admin hanya melihat.
 */
export default function KasIuran() {
  const { absensi, dewanAmbalan, simpanKas } = useApp();
  const [per, setPer] = useState(periodeAwal);
  const { mulai, akhir } = rentangPeriode(per.ta, per.periode);
  const sesi = useMemo(() => [...sesiPeriode(absensi, per.ta, per.periode)].reverse(), [absensi, per.ta, per.periode]);
  const r = useIuranRentang(mulai, akhir, { baris: false, kas: true });
  const ring = useMemo(() => ringkasAgregat(r.agregat), [r.agregat]);

  const ditutup = sesi.filter((s) => r.kas[s.tanggal]);
  const selisihTotal = ditutup.reduce((n, s) => n + bandingkanKas(ring.perTanggal[s.tanggal]?.jumlah ?? 0, r.kas[s.tanggal]).selisih, 0);
  const tidakCocok = ditutup.filter((s) => bandingkanKas(ring.perTanggal[s.tanggal]?.jumlah ?? 0, r.kas[s.tanggal]).status !== 'cocok').length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-xl text-sm text-pramuka-600">
          Cocokkan uang fisik di bumbung dengan catatan iuran setiap Jumat. {dewanAmbalan ? 'Dewan Ambalan mengisi total uang yang dihitung.' : 'Hanya Dewan Ambalan yang dapat menutup kas; Anda melihat hasilnya.'}
        </p>
        <PilihPeriode nilai={per} ubah={setPer} />
      </div>

      {!r.siap && <div role="status" aria-live="polite"><Kosong judul="Memuat tutup kas..." teks="Mengambil data dari server." /></div>}
      {r.siap && r.galat && <div role="alert"><Kosong judul="Tutup kas belum dapat dimuat" teks={r.galat}><button className="btn btn-primary btn-sm" onClick={r.muatUlang}>Coba lagi</button></Kosong></div>}

      {r.siap && !r.galat && (
        <>
          <section className="panel mb-4 grid grid-cols-3 divide-x divide-pramuka-100">
            <div className="p-4"><p className="font-display text-2xl font-bold text-pramuka-800">{ditutup.length}/{sesi.length}</p><p className="text-sm text-pramuka-600">Pertemuan sudah ditutup kasnya</p></div>
            <div className="p-4"><p className={`font-display text-2xl font-bold ${tidakCocok ? 'text-red-700' : 'text-emerald-700'}`}>{tidakCocok}</p><p className="text-sm text-pramuka-600">Belum cocok</p></div>
            <div className="p-4"><p className={`font-display text-2xl font-bold ${selisihTotal === 0 ? 'text-pramuka-800' : 'text-red-700'}`}>{selisihTotal > 0 ? '+' : ''}{rupiah(selisihTotal)}</p><p className="text-sm text-pramuka-600">Selisih total</p></div>
          </section>

          {sesi.length === 0 ? (
            <Kosong judul="Belum ada pertemuan" teks={`Belum ada sesi latihan Jumat pada ${PERIODE[per.periode]} ${per.ta}.`} />
          ) : (
            <ul className="panel divide-y divide-pramuka-100">
              {sesi.map((s) => (
                <BarisKas
                  key={`${s.tanggal}-${r.kas[s.tanggal]?.totalFisik ?? 'x'}-${r.kas[s.tanggal]?.catatan ?? ''}`}
                  tanggal={s.tanggal}
                  catatanTotal={ring.perTanggal[s.tanggal]?.jumlah ?? 0}
                  kas={r.kas[s.tanggal]}
                  boleh={dewanAmbalan}
                  simpan={simpanKas}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
