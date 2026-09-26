import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { tahunAjaranDari } from '../lib/absensiLogic';
import { hariIni } from '../lib/format';
import { KELAS_ROMBEL, daftarRombelKelas, geserTahunAjaran } from '../lib/rombelLogic';
import { KELAS_TINGKAT, labelTingkat, penugasanPerRombel } from '../lib/sanggaLogic';
import { Kosong, Modal } from './ui';

const CHIP = 'inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset';
const Tingkat = ({ t }) => (t ? <span className={`${CHIP} ${KELAS_TINGKAT[t] ?? ''}`}>{labelTingkat(t)}</span> : null);

/** Pilih sampai 2 Bina Damping untuk satu rombel dari Penegak berjabatan Dewan (yang sudah Laksana lebih dulu). Aturan lengkap ditegakkan server. */
function FormBinaDamping({ rombel, ta, data, awal, onTutup, onSimpan }) {
  const { aturBinaDamping } = useApp();
  const [pilih, setPilih] = useState(awal);
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const ganti = (id) => setPilih((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 2 ? [...s, id] : s));
  const kirim = async () => {
    if (sibuk) return;
    setSibuk(true);
    setGalat('');
    const r = await aturBinaDamping(ta, rombel, pilih);
    setSibuk(false);
    if (!r.ok) return setGalat(r.pesan);
    return onSimpan();
  };
  return (
    <Modal
      buka
      tutup={onTutup}
      judul={`Bina Damping rombel ${rombel}`}
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup}>Batal</button>
          <button className="btn btn-primary" onClick={kirim} disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
        </>
      }
    >
      <p className="mb-3 text-sm text-pramuka-700">
        Pilih sampai <span className="font-semibold">2 orang</span> dari Penegak berjabatan Dewan Ambalan yang minimal Calon Laksana. Utamakan yang sudah Laksana:
        Calon Laksana baru dapat dipilih bila tidak ada lagi Penegak Dewan yang sudah Laksana dan belum bertugas. Satu orang hanya untuk satu rombel per tahun ajaran.
      </p>
      {data.calon.length === 0 && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950">Belum ada Penegak berjabatan Dewan Ambalan yang sudah menyelesaikan SKU Bantara.</p>}
      <ul className="space-y-2">
        {data.calon.map((c) => {
          const dipakai = c.rombel && c.rombel !== rombel;
          const centang = pilih.includes(c.id);
          const penuh = !centang && pilih.length >= 2;
          return (
            <li key={c.id}>
              <label className={`flex items-start gap-3 rounded-md px-2 py-1.5 ${dipakai ? 'opacity-60' : 'hover:bg-pramuka-50'}`}>
                <input type="checkbox" className="mt-1 h-5 w-5 accent-pramuka-700" checked={centang} disabled={!!dipakai || penuh} onChange={() => ganti(c.id)} />
                <span className="text-sm">
                  <span className="font-medium">{c.nama}</span>{' '}
                  <Tingkat t={c.tingkat} />
                  <span className="block text-xs text-pramuka-600">
                    {c.jabatanDewan}{c.kelas ? ` · ${c.kelas}` : ''}{dipakai ? ` · sudah bertugas di ${c.rombel}` : ''}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {galat && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}

/** Penunjukan Bina Damping per rombel dan tahun ajaran. Dewan, Pembina, dan Admin menunjuk (server memeriksa); pengurus lain hanya melihat. */
export default function PanelBinaDamping() {
  const { muatBinaDamping } = useApp();
  const taKini = useMemo(() => tahunAjaranDari(hariIni()), []);
  const [ta, setTa] = useState(taKini);
  const [kelas, setKelas] = useState(KELAS_ROMBEL[0]);
  const [status, setStatus] = useState('memuat');
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState('');
  const [ulang, setUlang] = useState(0);
  const [form, setForm] = useState(null); // rombel yang sedang diatur

  const pilihanTa = useMemo(() => [geserTahunAjaran(taKini, -1), taKini, geserTahunAjaran(taKini, 1)], [taKini]);
  useEffect(() => {
    let batal = false;
    setStatus('memuat');
    muatBinaDamping(ta).then((r) => {
      if (batal) return;
      if (r.ok) { setData(r.data); setStatus('siap'); } else { setGalat(r.pesan); setStatus('galat'); }
    });
    return () => { batal = true; };
  }, [ta, ulang, muatBinaDamping]);

  const perRombel = useMemo(() => penugasanPerRombel(data?.penugasan), [data]);
  const kosong = useMemo(() => (data ? daftarRombelKelas(kelas).filter((r) => (perRombel[r] ?? []).length < 2) : []), [data, kelas, perRombel]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="bd-ta" className="label">Tahun ajaran</label>
          <select id="bd-ta" className="input w-auto" value={ta} onChange={(e) => setTa(e.target.value)}>
            {pilihanTa.map((t) => <option key={t} value={t}>{t}{t === taKini ? ' (berjalan)' : ''}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="bd-kelas" className="label">Kelas</label>
          <select id="bd-kelas" className="input w-auto" value={kelas} onChange={(e) => setKelas(e.target.value)}>
            {KELAS_ROMBEL.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      </div>
      <p className="mb-4 rounded-md bg-pramuka-50 px-3 py-2 text-xs leading-relaxed text-pramuka-700">
        Bina Damping adalah 2 pendamping tiap rombel (kanan moral, kiri keterampilan; SK Kwarnas 176/2013), dipilih dari Penegak berjabatan Dewan Ambalan.
        Bina Damping juga membagi sangga dan menentukan Pinsa di rombelnya (tab Sangga). Penunjukan berlaku per tahun ajaran dan berakhir sendiri bila
        Penegaknya nonaktif atau tidak lagi berjabatan Dewan.
      </p>

      {status === 'memuat' && <Kosong judul="Memuat penunjukan..." teks="Mengambil data dari server." />}
      {status === 'galat' && (
        <Kosong judul="Penunjukan belum dapat dimuat" teks={galat}>
          <button className="btn btn-primary btn-sm" onClick={() => setUlang((n) => n + 1)}>Coba lagi</button>
        </Kosong>
      )}
      {status === 'siap' && (
        <>
          {kosong.length > 0 && <p role="status" className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950">Rombel {kosong.join(', ')} belum punya 2 Bina Damping.</p>}
          {!data.bisaAtur && <p className="mb-3 text-sm text-pramuka-600">Hanya Dewan Ambalan, Pembina, dan Admin Gudep yang dapat menunjuk Bina Damping.</p>}
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[26rem] text-left text-sm">
              <thead className="bg-pramuka-50 text-xs uppercase tracking-wide text-pramuka-600">
                <tr><th className="px-3 py-2">Rombel</th><th className="px-3 py-2">Bina Damping</th>{data.bisaAtur && <th className="px-3 py-2"><span className="sr-only">Aksi</span></th>}</tr>
              </thead>
              <tbody className="divide-y divide-pramuka-100">
                {daftarRombelKelas(kelas).map((r) => {
                  const daftar = perRombel[r] ?? [];
                  return (
                    <tr key={r}>
                      <td className="px-3 py-2 font-mono font-semibold">{r}</td>
                      <td className="px-3 py-2">
                        {daftar.length === 0
                          ? <span className="text-pramuka-500">(belum ada)</span>
                          : (
                            <ul className="space-y-1">
                              {daftar.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-2"><span>{p.nama}</span><Tingkat t={p.tingkat} /></li>)}
                            </ul>
                          )}
                      </td>
                      {data.bisaAtur && (
                        <td className="px-3 py-2 text-right">
                          <button className="btn btn-outline btn-sm" onClick={() => setForm(r)}>{daftar.length ? 'Ubah' : 'Tunjuk'}</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {form && (
        <FormBinaDamping
          rombel={form}
          ta={ta}
          data={data}
          awal={(perRombel[form] ?? []).map((p) => p.id)}
          onTutup={() => setForm(null)}
          onSimpan={() => { setForm(null); setUlang((n) => n + 1); }}
        />
      )}
    </div>
  );
}
