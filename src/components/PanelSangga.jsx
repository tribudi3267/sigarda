import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { KELAS_ROMBEL, daftarRombelKelas } from '../lib/rombelLogic';
import {
  KELAS_TINGKAT, drafAwal, kelompokSangga, labelTingkat, namaSanggaAda, perubahanSangga, peringatanRombel, ubahDraf,
} from '../lib/sanggaLogic';
import { Kosong } from './ui';
import PanelPinsaTugas from './PanelPinsaTugas';

const CHIP = 'inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset';

function LencanaTingkat({ tingkat }) {
  if (!tingkat) return null;
  return <span className={`${CHIP} ${KELAS_TINGKAT[tingkat] ?? ''}`}>{labelTingkat(tingkat)}</span>;
}

/** Lencana Pinsa (Pimpinan Sangga). */
export function LencanaPinsa() {
  return <span className={`${CHIP} bg-violet-100 text-violet-900 ring-violet-300`}>Pinsa</span>;
}

/** Peringatan susunan sangga (tidak memblokir): daftar teks dari server. */
function DaftarPeringatan({ teks }) {
  if (!teks.length) return null;
  return (
    <div role="status" className="mb-4 rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
      <p className="font-semibold">Perlu diperhatikan (tidak menghalangi penyimpanan):</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">{teks.map((t) => <li key={t}>{t}</li>)}</ul>
    </div>
  );
}

/** Tampilan baca: sangga dalam kartu, Pinsa di urutan pertama. */
function SanggaBaca({ data }) {
  const kelompok = useMemo(() => kelompokSangga(data.anggota, data.peringatan, data.pinsaTugas), [data]);
  if (!kelompok.length) return <Kosong judul="Rombel ini belum punya anggota aktif" teks="Anggota muncul di sini setelah akun Penegak dibuat pada rombel ini." />;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {kelompok.map((g) => (
        <section key={g.kunci} className="panel p-4" aria-label={`Sangga ${g.nama}`}>
          <h3 className="font-display text-base font-semibold text-pramuka-900">{g.nama} <span className="text-xs font-normal text-pramuka-500">({g.anggota.length} Penegak)</span></h3>
          {g.peringatan.length > 0 && <p className="mt-1 text-xs text-amber-800">{g.peringatan.join(' ')}</p>}
          <ul className="mt-2 space-y-1.5 text-sm">
            {g.anggota.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2">
                <span>{a.nama}</span>
                {a.pinsa && <LencanaPinsa />}
                <LencanaTingkat tingkat={a.tingkat} />
              </li>
            ))}
            {g.tugas.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2">
                <span>{t.nama}</span>
                <LencanaPinsa />
                <span className="text-xs text-pramuka-600">dari {t.kelas || 'rombel lain'}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Tampilan atur: satu baris per Penegak (nama sangga + Pinsa); disimpan sekaligus, semua atau tidak sama sekali. */
function SanggaAtur({ data, rombel, onSimpan }) {
  const { aturSangga, calonPinsa, tugaskanPinsa, cabutPinsa } = useApp();
  const [draf, setDraf] = useState(() => drafAwal(data.anggota));
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  useEffect(() => { setDraf(drafAwal(data.anggota)); setGalat(''); }, [data]);
  const saran = useMemo(() => namaSanggaAda(data.anggota), [data]);
  const selisih = useMemo(() => perubahanSangga(data.anggota, draf), [data, draf]);
  const urut = useMemo(() => data.anggota.slice().sort((x, y) => String(x.sangga).localeCompare(String(y.sangga), 'id', { sensitivity: 'base' }) || x.nama.localeCompare(y.nama, 'id')), [data]);

  const simpan = async () => {
    if (sibuk || !selisih.length) return;
    setSibuk(true);
    setGalat('');
    const r = await aturSangga(rombel, selisih);
    setSibuk(false);
    if (!r.ok) return setGalat(r.pesan);
    return onSimpan(r.data);
  };

  return (
    <div>
      <p className="mb-3 rounded-md bg-pramuka-50 px-3 py-2 text-xs leading-relaxed text-pramuka-700">
        Ubah nama sangga di kolom Sangga (pilih dari saran atau ketik nama baru), dan centang Pinsa (Pimpinan Sangga) untuk satu Penegak per sangga.
        Pinsa dipilih dari Penegak yang sudah menyelesaikan SKU Bantara (Calon Laksana ke atas). Pindah sangga otomatis melepas Pinsa lamanya.
      </p>
      <datalist id="saran-sangga">{saran.map((n) => <option key={n} value={n} />)}</datalist>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[30rem] text-left text-sm">
          <thead className="bg-pramuka-50 text-xs uppercase tracking-wide text-pramuka-600">
            <tr><th className="px-3 py-2">Penegak</th><th className="px-3 py-2">Sangga</th><th className="px-3 py-2 text-center">Pinsa</th></tr>
          </thead>
          <tbody className="divide-y divide-pramuka-100">
            {urut.map((a) => {
              const d = draf[a.id] ?? { sangga: a.sangga, pinsa: a.pinsa };
              return (
                <tr key={a.id}>
                  <td className="px-3 py-2">
                    <span className="font-medium">{a.nama}</span>{' '}
                    <LencanaTingkat tingkat={a.tingkat} />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="input w-40 max-w-full"
                      list="saran-sangga"
                      maxLength={40}
                      aria-label={`Sangga ${a.nama}`}
                      value={d.sangga}
                      onChange={(e) => setDraf((s) => ubahDraf(s, data.anggota, a.id, { sangga: e.target.value }))}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-pramuka-700"
                      aria-label={`Pinsa ${a.nama}`}
                      checked={!!d.pinsa}
                      disabled={!a.layakPinsa}
                      title={a.layakPinsa ? '' : 'Belum menyelesaikan SKU Bantara'}
                      onChange={(e) => setDraf((s) => ubahDraf(s, data.anggota, a.id, { pinsa: e.target.checked }))}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {galat && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{galat}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" onClick={simpan} disabled={sibuk || !selisih.length}>{sibuk ? 'Menyimpan...' : 'Simpan susunan sangga'}</button>
        {selisih.length > 0 && <button className="btn btn-outline" onClick={() => { setDraf(drafAwal(data.anggota)); setGalat(''); }}>Batalkan perubahan</button>}
        <span className="text-xs text-pramuka-600">{selisih.length ? `${selisih.length} Penegak berubah` : 'Belum ada perubahan'}</span>
      </div>
      <PanelPinsaTugas
        rombel={rombel}
        tugas={data.pinsaTugas}
        sangga={saran}
        muatCalon={() => calonPinsa(rombel)}
        onTugaskan={async (s, id) => { const r = await tugaskanPinsa(rombel, s, id); if (r.ok) await onSimpan(); return r; }}
        onCabut={async (id) => { const r = await cabutPinsa(rombel, id); if (r.ok) await onSimpan(); return r; }}
      />
    </div>
  );
}

/** Susunan sangga satu rombel beserta Bina Damping dan peringatannya; bisa diatur bila server mengizinkan. */
export default function PanelSangga({ rombel }) {
  const { muatSanggaRombel } = useApp();
  const [status, setStatus] = useState('memuat'); // memuat | siap | galat
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState('');
  const [ulang, setUlang] = useState(0);

  const muat = useCallback(async () => {
    const r = await muatSanggaRombel(rombel);
    if (r.ok) { setData(r.data); setStatus('siap'); } else { setGalat(r.pesan); setStatus('galat'); }
  }, [muatSanggaRombel, rombel]);
  useEffect(() => {
    let batal = false;
    setStatus('memuat');
    setData(null);
    muatSanggaRombel(rombel).then((r) => {
      if (batal) return;
      if (r.ok) { setData(r.data); setStatus('siap'); } else { setGalat(r.pesan); setStatus('galat'); }
    });
    return () => { batal = true; };
  }, [rombel, ulang, muatSanggaRombel]);

  if (status === 'memuat') return <Kosong judul="Memuat susunan sangga..." teks="Mengambil data dari server." />;
  if (status === 'galat') {
    return (
      <Kosong judul="Susunan sangga belum dapat dimuat" teks={galat}>
        <button className="btn btn-primary btn-sm" onClick={() => setUlang((n) => n + 1)}>Coba lagi</button>
      </Kosong>
    );
  }
  return (
    <div>
      <div className="mb-4 rounded-lg bg-white p-4 ring-1 ring-pramuka-200">
        <p className="text-sm font-semibold text-pramuka-800">Bina Damping rombel {rombel} <span className="font-normal text-pramuka-500">(tahun ajaran {data.tahunAjaran})</span></p>
        {data.binaDamping.length === 0
          ? <p className="mt-1 text-sm text-pramuka-600">Belum ada Bina Damping. Dewan Ambalan, Pembina, atau Admin menunjuknya di tab Bina Damping.</p>
          : (
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {data.binaDamping.map((b) => <li key={b.id} className="flex items-center gap-2"><span>{b.nama}</span><LencanaTingkat tingkat={b.tingkat} /></li>)}
            </ul>
          )}
      </div>
      <DaftarPeringatan teks={peringatanRombel(data.peringatan)} />
      {data.bisaAtur
        ? <SanggaAtur data={data} rombel={rombel} onSimpan={muat} />
        : <SanggaBaca data={data} />}
    </div>
  );
}

/** Pilihan kelas dan rombel (pengurus: semua rombel baku; Bina Damping: rombel yang didampingi). */
export function PilihRombel({ daftar, nilai, onUbah, semua }) {
  const kelasAwal = nilai ? nilai.split('-')[0] : KELAS_ROMBEL[0];
  const [kelas, setKelas] = useState(kelasAwal);
  const pilihan = semua ? daftarRombelKelas(kelas) : daftar;
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      {semua && (
        <div>
          <label htmlFor="sg-kelas" className="label">Kelas</label>
          <select id="sg-kelas" className="input w-auto" value={kelas} onChange={(e) => { setKelas(e.target.value); onUbah(daftarRombelKelas(e.target.value)[0]); }}>
            {KELAS_ROMBEL.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="sg-rombel" className="label">Rombel</label>
        <select id="sg-rombel" className="input w-auto" value={nilai} onChange={(e) => onUbah(e.target.value)}>
          {pilihan.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
    </div>
  );
}
