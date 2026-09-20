import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { rentangPeriode, sesiPeriode, PERIODE } from '../lib/absensiLogic';
import { bandingkanKas, rekapPeserta, ringkasAgregat, rupiah } from '../lib/iuranLogic';
import { unduhIuranXlsx } from '../lib/exportLaporan';
import { fmtHariTanggal, fmtTanggal } from '../lib/format';
import { useIuranRentang } from '../hooks/useIuran';
import FilterBar, { FILTER_AWAL, terapkanFilter } from './FilterBar';
import PilihPeriode, { periodeAwal } from './PilihPeriode';
import { Icon, Kosong, ProgressBar } from './ui';

function Angka({ nilai, label, ket }) {
  return (
    <div className="p-4">
      <p className="font-display text-2xl font-bold text-pramuka-800 sm:text-3xl">{nilai}</p>
      <p className="text-sm text-pramuka-600">{label}</p>
      {ket && <p className="text-xs text-pramuka-500">{ket}</p>}
    </div>
  );
}

/** Tabel total per kelompok (sangga atau kelas) dengan batang perbandingan. */
function TabelKelompok({ judul, kolom, daftar }) {
  const terbesar = Math.max(1, ...daftar.map((d) => d.jumlah));
  return (
    <section className="panel overflow-hidden">
      <h3 className="border-b border-pramuka-100 px-4 py-3 text-base font-bold">{judul}</h3>
      {daftar.length === 0 ? (
        <p className="px-4 py-4 text-sm text-pramuka-500">Belum ada iuran pada periode ini.</p>
      ) : (
        <ul className="divide-y divide-pramuka-100">
          {daftar.map((d) => (
            <li key={d.kunci} className="px-4 py-2.5">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{kolom} {d.kunci || '(tanpa data)'}</span>
                <span className="font-semibold tabular-nums text-pramuka-900">{rupiah(d.jumlah)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-pramuka-100" aria-hidden="true">
                <div className="h-full rounded-full bg-emas" style={{ width: `${Math.round((d.jumlah / terbesar) * 100)}%` }} />
              </div>
              <p className="mt-0.5 text-[11px] text-pramuka-500">{d.kali} catatan iuran{d.susulan > 0 ? `, susulan ${rupiah(d.susulan)}` : ''}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Rekap iuran bumbung untuk SEMUA peran: total gudep, per pertemuan, per sangga, dan per kelas (tanpa nama perorangan).
 * Pengurus juga melihat rekap per Penegak, tutup kas, dan dapat mengunduh Excel; Penegak melihat rincian iuran miliknya sendiri.
 */
export default function RekapIuran() {
  const { user, absensi, daftarPeserta, pengaturanIuran } = useApp();
  const ambang = pengaturanIuran.ambang;
  const [per, setPer] = useState(periodeAwal);
  const [filter, setFilter] = useState(FILTER_AWAL);
  const pengurus = user.role !== 'peserta';
  const { mulai, akhir } = rentangPeriode(per.ta, per.periode);
  const sesi = useMemo(() => sesiPeriode(absensi, per.ta, per.periode), [absensi, per.ta, per.periode]);
  const r = useIuranRentang(mulai, akhir, { baris: true, kas: pengurus });
  const ring = useMemo(() => ringkasAgregat(r.agregat), [r.agregat]);

  const rekap = useMemo(() => (pengurus ? rekapPeserta(r.baris, daftarPeserta, sesi) : []), [pengurus, r.baris, daftarPeserta, sesi]);
  const tersaring = useMemo(() => {
    const boleh = new Set(terapkanFilter(daftarPeserta, filter).map((u) => u.id));
    return rekap.filter((x) => boleh.has(x.peserta.id)).sort((a, b) => b.total - a.total || a.peserta.nama.localeCompare(b.peserta.nama, 'id'));
  }, [rekap, daftarPeserta, filter]);
  const saya = useMemo(() => (pengurus ? null : rekapPeserta(r.baris, [user], sesi)[0]), [pengurus, r.baris, user, sesi]);

  const rataPertemuan = sesi.length ? Math.round(ring.total / sesi.length) : 0;
  const unduh = () => unduhIuranXlsx({ tahunAjaran: per.ta, periode: per.periode, rekap: tersaring, sesi, ring, kas: r.kas, filter, ambang });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-xl text-sm text-pramuka-600">
          Rekap iuran bumbung kepramukaan {PERIODE[per.periode]} {per.ta}. Angka per sangga, kelas, dan gudep terlihat oleh semua; rincian per Penegak hanya untuk pengurus dan yang bersangkutan.
        </p>
        <PilihPeriode nilai={per} ubah={setPer} />
      </div>

      {!r.siap && <div role="status" aria-live="polite"><Kosong judul="Memuat rekap iuran..." teks="Mengambil data dari server." /></div>}
      {r.siap && r.galat && (
        <div role="alert"><Kosong judul="Rekap iuran belum dapat dimuat" teks={r.galat}><button className="btn btn-primary btn-sm" onClick={r.muatUlang}>Coba lagi</button></Kosong></div>
      )}

      {r.siap && !r.galat && (
        <div className="space-y-5">
          <section className="panel grid grid-cols-2 divide-pramuka-100 md:grid-cols-4 md:divide-x">
            <Angka nilai={rupiah(ring.total)} label="Total gudep" ket={PERIODE[per.periode]} />
            <Angka nilai={sesi.length} label="Pertemuan terlaksana" />
            <Angka nilai={rupiah(rataPertemuan)} label="Rata-rata per pertemuan" />
            <Angka nilai={rupiah(ring.totalSusulan)} label="Di antaranya susulan" ket="ditebus belakangan" />
          </section>

          {saya && (
            <section className="panel p-4">
              <h3 className="text-base font-bold">Iuran saya</h3>
              {saya.persen === null ? (
                <p className="mt-1 text-sm text-pramuka-600">Belum ada pertemuan tercatat pada periode ini.</p>
              ) : (
                <>
                  <p className="mt-1 text-sm text-pramuka-700">
                    Beriuran pada <b>{saya.kali}</b> dari {sesi.length} pertemuan (<b>{saya.persen}%</b>), total <b>{rupiah(saya.total)}</b>.
                    {saya.susulan > 0 && <> Di antaranya {saya.susulan} pertemuan susulan ({rupiah(saya.totalSusulan)}).</>}
                  </p>
                  <div className="mt-2"><ProgressBar persen={Math.min(100, saya.persen)} tinggi="h-3" label="Iuran rutin saya" /></div>
                  <p className={`mt-2 text-sm ${saya.persen < ambang ? 'font-semibold text-red-700' : 'text-pramuka-600'}`}>
                    {saya.persen < ambang
                      ? `Iuran rutinmu di bawah ${ambang}% pertemuan. Berusahalah beriuran setiap Jumat agar tetap rutin; ini menjadi dasar penilaian SKU tentang iuran.`
                      : `Iuran rutinmu memenuhi batas ${ambang}% pertemuan. Pertahankan.`}
                  </p>
                  {saya.rutin < saya.kali && (
                    <p className="mt-1 text-xs text-pramuka-500">Iuran susulan dihitung setara, tetapi beriuran setiap Jumat tetap lebih baik dan itulah arti "rutin".</p>
                  )}
                </>
              )}
              <ul className="mt-3 divide-y divide-pramuka-100 rounded-lg border border-pramuka-100">
                {[...sesi].reverse().map((s) => {
                  const b = r.baris[s.tanggal]?.[user.id];
                  return (
                    <li key={s.tanggal} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span>{fmtHariTanggal(s.tanggal)}</span>
                      {b ? <span className="font-semibold text-emerald-800">{rupiah(b.jumlah)}{b.jenis === 'susulan' ? ' (susulan)' : ''}</span> : <span className="text-pramuka-400">-</span>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="panel overflow-hidden">
            <h3 className="border-b border-pramuka-100 px-4 py-3 text-base font-bold">Per pertemuan</h3>
            {sesi.length === 0 ? (
              <p className="px-4 py-4 text-sm text-pramuka-500">Belum ada pertemuan tercatat pada periode ini.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead className="bg-pramuka-50 text-pramuka-700">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Jumat</th>
                      <th className="px-3 py-2 text-right font-semibold">Penegak beriuran</th>
                      <th className="px-3 py-2 text-right font-semibold">Total</th>
                      {pengurus && <th className="px-3 py-2 text-right font-semibold">Kas fisik</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pramuka-100">
                    {[...sesi].reverse().map((s) => {
                      const a = ring.perTanggal[s.tanggal] ?? { jumlah: 0, susulan: 0, orang: 0 };
                      const kas = r.kas[s.tanggal];
                      const banding = bandingkanKas(a.jumlah, kas);
                      return (
                        <tr key={s.tanggal}>
                          <td className="px-4 py-2 font-medium">{fmtTanggal(s.tanggal)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{a.orang}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{rupiah(a.jumlah)}</td>
                          {pengurus && (
                            <td className="px-3 py-2 text-right tabular-nums">
                              {kas ? (
                                <span className={banding.status === 'cocok' ? 'text-emerald-800' : 'font-semibold text-red-700'}>
                                  {rupiah(kas.totalFisik)}{banding.status !== 'cocok' && ` (${banding.selisih > 0 ? '+' : ''}${rupiah(banding.selisih).replace('Rp ', '')})`}
                                </span>
                              ) : <span className="text-pramuka-400">belum ditutup</span>}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="grid gap-5 md:grid-cols-2">
            <TabelKelompok judul="Per sangga" kolom="" daftar={ring.sangga} />
            <TabelKelompok judul="Per kelas" kolom="Kelas" daftar={ring.kelas} />
          </div>

          {pengurus && (
            <section>
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <h3 className="text-lg font-bold">Per Penegak ({tersaring.length})</h3>
                <button className="btn btn-gold btn-sm" onClick={unduh} disabled={tersaring.length === 0}>
                  <Icon nama="unduh" className="h-4 w-4" /> Unduh Excel
                </button>
              </div>
              <div className="mb-3"><FilterBar data={daftarPeserta} filter={filter} setFilter={setFilter} tampil={['sangga', 'kelas']} /></div>
              {tersaring.length === 0 ? (
                <Kosong judul="Tidak ada Penegak" teks="Ubah kata kunci, sangga, atau kelas pada filter." />
              ) : (
                <div className="panel overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="bg-pramuka-50 text-pramuka-700">
                      <tr>
                        <th className="px-4 py-2 font-semibold">Nama</th>
                        <th className="px-3 py-2 font-semibold">Kelas, sangga</th>
                        <th className="px-3 py-2 text-right font-semibold">Beriuran</th>
                        <th className="px-3 py-2 text-right font-semibold">Rutin</th>
                        <th className="px-3 py-2 text-right font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-pramuka-100">
                      {tersaring.map((x) => (
                        <tr key={x.peserta.id}>
                          <td className="px-4 py-2 font-medium">{x.peserta.nama}</td>
                          <td className="px-3 py-2 text-xs text-pramuka-600">{x.peserta.kelas}, {x.peserta.sangga}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{x.kali}/{sesi.length}{x.susulan > 0 ? ` (+${x.susulan} susulan)` : ''}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${x.persen !== null && x.persen < ambang ? 'font-semibold text-red-700' : 'text-pramuka-700'}`}>{x.persen === null ? '-' : `${x.persen}%`}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{rupiah(x.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 text-xs text-pramuka-500">Merah = di bawah ambang rutin {ambang}% pertemuan terlaksana. Persen dihitung dari pertemuan beriuran (rutin ditambah susulan).</p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
