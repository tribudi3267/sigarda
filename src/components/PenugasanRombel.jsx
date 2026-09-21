import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { tahunAjaranDari } from '../lib/absensiLogic';
import { fmtWaktu, hariIni } from '../lib/format';
import {
  KELAS_ROMBEL, cakupanAgama, daftarPengujiUrut, daftarRombelKelas, geserTahunAjaran, kunciPenugasan, pembinaTanpaAgama,
  pesertaRombelLama, ringkasRombel,
} from '../lib/rombelLogic';
import { Field, Icon, Kosong, Modal } from './ui';

/** Formulir tambah atau ubah satu guru agama (Admin). */
function FormGuruAgama({ awal, onTutup }) {
  const { simpanGuruAgama } = useApp();
  const [f, setF] = useState(awal);
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const kirim = async () => {
    if (sibuk) return;
    setSibuk(true);
    setGalat('');
    const r = await simpanGuruAgama(f);
    setSibuk(false);
    if (!r.ok) return setGalat(r.pesan);
    return onTutup();
  };
  return (
    <Modal
      buka
      tutup={onTutup}
      judul={f.id ? `Ubah guru agama ${f.agama}` : `Tambah guru agama ${f.agama}`}
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup}>Batal</button>
          <button className="btn btn-primary" onClick={kirim} disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
        </>
      }
    >
      <Field label="Nama guru agama" htmlFor="ga-nama" bantuan="Tulis lengkap dengan gelar bila perlu; nama ini dipakai pada surat pengantar.">
        <input id="ga-nama" className="input" maxLength={120} value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} />
      </Field>
      <Field label="Keterangan (opsional)" htmlFor="ga-ket" bantuan="Mis. NIP, mata pelajaran, atau catatan lain (maksimal 200 karakter).">
        <input id="ga-ket" className="input" maxLength={200} value={f.keterangan} onChange={(e) => setF({ ...f, keterangan: e.target.value })} />
      </Field>
      {galat && <p role="alert" className="text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}

/** Riwayat perubahan penugasan satu tahun ajaran (dimuat saat dibuka). */
function RiwayatPenugasan({ ta }) {
  const { muatLogPenugasan } = useApp();
  const [buka, setBuka] = useState(false);
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState('');

  useEffect(() => {
    setData(null);
    setGalat('');
  }, [ta]);
  useEffect(() => {
    if (!buka || data) return undefined;
    let batal = false;
    muatLogPenugasan(ta).then((r) => {
      if (batal) return;
      if (r.ok) setData(r.data.slice().reverse());
      else setGalat(r.pesan);
    });
    return () => { batal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buka, data, ta]);

  return (
    <div className="mt-6">
      <button className="btn btn-outline btn-sm" aria-expanded={buka} onClick={() => setBuka((b) => !b)}>
        <Icon nama={buka ? 'panahAtas' : 'panahBawah'} className="h-4 w-4" /> Riwayat perubahan
      </button>
      {buka && (
        <div className="panel mt-3">
          {galat && <p role="alert" className="p-4 text-sm font-medium text-red-700">{galat}</p>}
          {!galat && !data && <p className="p-4 text-sm text-pramuka-600">Memuat riwayat...</p>}
          {data && data.length === 0 && <p className="p-4 text-sm text-pramuka-600">Belum ada perubahan penugasan pada tahun ajaran {ta}.</p>}
          {data && data.length > 0 && (
            <ul className="max-h-80 divide-y divide-pramuka-100 overflow-y-auto text-sm">
              {data.map((h) => (
                <li key={h.id} className="px-4 py-2.5">
                  <p>
                    <span className="font-semibold">{h.olehNama || 'Admin'}</span>{' '}
                    {h.tindakan === 'tambah' ? 'menugaskan' : 'mencabut'} <span className="font-semibold">{h.pengujiNama}</span>{' '}
                    {h.tindakan === 'tambah' ? 'pada' : 'dari'} rombel <span className="font-mono font-semibold">{h.rombel}</span>
                    {h.catatan ? ` (${h.catatan})` : ''}
                  </p>
                  <p className="text-xs text-pramuka-500">{fmtWaktu(h.waktu)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Penugasan penguji per rombel: matriks penguji x rombel (per kelas), salin dari tahun ajaran lalu, peringatan rombel tanpa penguji,
 * cakupan agama Pembina, dan guru agama. `bolehUbah` (Admin) menampilkan tombol pengatur; selain itu hanya melihat.
 * Fase 1a hanya menyimpan penugasan; belum ada aturan yang berubah bagi Penegak dan penguji.
 */
export default function PenugasanRombel({ bolehUbah = false, onPerbaruiRombel }) {
  const {
    users, penugasan, guruAgama, muatPenugasan, aturPenugasan, salinPenugasan, hapusGuruAgama,
  } = useApp();
  const taKini = useMemo(() => tahunAjaranDari(hariIni()), []);
  const [ta, setTa] = useState(taKini);
  const [kelas, setKelas] = useState(KELAS_ROMBEL[0]);
  const [status, setStatus] = useState('memuat'); // memuat | siap | galat
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState({}); // kunci sel/baris yang sedang disimpan
  const [salin, setSalin] = useState(false);
  const [formGuru, setFormGuru] = useState(null);
  const [ulang, setUlang] = useState(0); // naik saat pengguna menekan "Coba lagi"

  const pilihanTa = useMemo(() => [geserTahunAjaran(taKini, -1), taKini, geserTahunAjaran(taKini, 1)], [taKini]);
  const baris = penugasan[ta];

  useEffect(() => {
    let batal = false;
    setStatus('memuat');
    muatPenugasan(ta).then((r) => {
      if (batal) return;
      if (r.ok) setStatus('siap');
      else { setStatus('galat'); setGalat(r.pesan); }
    });
    return () => { batal = true; };
  }, [ta, ulang, muatPenugasan]);

  const pengujiUrut = useMemo(() => daftarPengujiUrut(users), [users]);
  const kunci = useMemo(() => kunciPenugasan(baris), [baris]);
  const ringkas = useMemo(() => ringkasRombel(baris ?? [], users), [baris, users]);
  const kolom = daftarRombelKelas(kelas);
  const tanpaPenguji = ringkas.filter((r) => r.tanpaPenguji);
  const lama = useMemo(() => pesertaRombelLama(users), [users]);
  const tanpaAgama = useMemo(() => pembinaTanpaAgama(users), [users]);
  const agama = useMemo(() => cakupanAgama(users, guruAgama), [users, guruAgama]);
  const adaPenugasan = (baris ?? []).length > 0;

  const jalankan = async (kunciSibuk, janji) => {
    setSibuk((s) => ({ ...s, [kunciSibuk]: true }));
    await janji;
    setSibuk((s) => { const { [kunciSibuk]: _x, ...sisa } = s; return sisa; });
  };
  const ganti = (p, rombel) => jalankan(`${p.id}|${rombel}`, aturPenugasan(ta, p.id, [rombel], !kunci.has(`${p.id}|${rombel}`)));
  const barisSemua = (p, ada) => jalankan(`${p.id}|*`, aturPenugasan(ta, p.id, kolom, ada));
  const lakukanSalin = async () => {
    const dari = geserTahunAjaran(ta, -1);
    if (!window.confirm(`Salin penugasan ${dari} ke ${ta}? Penugasan yang sudah ada di ${ta} tidak diubah dan tidak ada yang dicabut.`)) return;
    setSalin(true);
    await salinPenugasan(dari, ta);
    setSalin(false);
  };
  const hapusGuru = (g) => {
    if (window.confirm(`Hapus guru agama ${g.nama} (${g.agama})?`)) hapusGuruAgama(g.id);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="pn-ta" className="label">Tahun ajaran</label>
          <select id="pn-ta" className="input w-auto" value={ta} onChange={(e) => setTa(e.target.value)}>
            {pilihanTa.map((t) => <option key={t} value={t}>{t}{t === taKini ? ' (berjalan)' : ''}</option>)}
          </select>
        </div>
        {bolehUbah && (
          <button className="btn btn-outline btn-sm" onClick={lakukanSalin} disabled={salin || status !== 'siap'}>
            <Icon nama="salin" className="h-4 w-4" /> {salin ? 'Menyalin...' : `Salin dari ${geserTahunAjaran(ta, -1)}`}
          </button>
        )}
      </div>

      <p className="mb-4 rounded-md bg-pramuka-50 px-3 py-2 text-xs leading-relaxed text-pramuka-700">
        Penugasan menentukan Pembina dan Dewan Ambalan yang menguji tiap rombel pada tahun ajaran ini.
        {bolehUbah ? ' Ketuk sel untuk menugaskan atau mencabut.' : ' Hanya Admin Gudep yang dapat mengubahnya.'}{' '}
        Untuk sementara belum ada aturan yang berubah: rombel tanpa penugasan tetap memakai aturan lama (semua penguji boleh menguji).
      </p>

      {lama.length > 0 && (
        <div role="status" className="mb-4 rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
          <p>
            <span className="font-semibold">{lama.length} Penegak</span> masih memakai kelas lama (bukan rombel X-01 sampai XII-10), sehingga belum terhitung pada matriks.
          </p>
          {bolehUbah && onPerbaruiRombel && (
            <button className="btn btn-gold btn-sm mt-2" onClick={onPerbaruiRombel}>Perbarui rombel Penegak</button>
          )}
        </div>
      )}

      {status === 'memuat' && <Kosong judul="Memuat penugasan..." teks="Mengambil data dari server." />}
      {status === 'galat' && (
        <Kosong judul="Penugasan belum dapat dimuat" teks={galat}>
          <button className="btn btn-primary btn-sm" onClick={() => setUlang((n) => n + 1)}>Coba lagi</button>
        </Kosong>
      )}

      {status === 'siap' && (
        <>
          {!adaPenugasan && (
            <p className="mb-3 rounded-md bg-pramuka-50 px-3 py-2 text-sm text-pramuka-700">
              Belum ada penugasan untuk {ta}.{bolehUbah ? ` Ketuk sel di bawah untuk mengatur, atau salin dari ${geserTahunAjaran(ta, -1)}.` : ''}
            </p>
          )}
          {tanpaPenguji.length > 0 && (
            <div role="status" className="mb-3 rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
              <p className="font-semibold">{tanpaPenguji.length} rombel berisi Penegak tetapi belum punya penguji:</p>
              <p className="mt-1 font-mono text-xs">{tanpaPenguji.map((r) => r.rombel).join(', ')}</p>
              <p className="mt-1 text-xs">Rombel ini tetap memakai aturan lama sampai ditugaskan.</p>
            </div>
          )}

          <div role="tablist" aria-label="Kelas" className="mb-3 inline-flex rounded-lg bg-pramuka-100 p-1">
            {KELAS_ROMBEL.map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={kelas === k}
                onClick={() => setKelas(k)}
                className={`rounded-md px-4 py-2 text-sm font-semibold ${kelas === k ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-700 hover:bg-pramuka-200'}`}
              >
                Kelas {k}
              </button>
            ))}
          </div>

          {pengujiUrut.length === 0 ? (
            <Kosong judul="Belum ada Pembina atau Dewan Ambalan" teks="Tambahkan dulu lewat menu Anggota." />
          ) : (
            <div className="panel overflow-x-auto">
              <table className="w-full min-w-max border-collapse text-center text-sm">
                <thead>
                  <tr className="bg-pramuka-100 text-pramuka-800">
                    <th scope="col" className="sticky left-0 z-10 w-40 min-w-[9rem] bg-pramuka-100 px-3 py-2 text-left font-semibold">Penguji</th>
                    {kolom.map((r) => <th key={r} scope="col" className="w-11 min-w-[2.75rem] px-1 py-2 font-mono text-xs font-semibold" title={r}>{r.split('-')[1]}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-pramuka-100">
                  {pengujiUrut.map((p) => (
                    <tr key={p.id}>
                      <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left font-normal">
                        <span className="block max-w-[9rem] truncate font-semibold" title={p.nama}>{p.nama}</span>
                        <span className="block text-xs text-pramuka-500">{p.jabatan}</span>
                        {bolehUbah && (
                          <span className="mt-0.5 flex gap-2 text-xs">
                            <button className="font-semibold text-pramuka-700 underline disabled:opacity-40" disabled={!!sibuk[`${p.id}|*`]} onClick={() => barisSemua(p, true)}>Semua</button>
                            <button className="font-semibold text-pramuka-700 underline disabled:opacity-40" disabled={!!sibuk[`${p.id}|*`]} onClick={() => barisSemua(p, false)}>Kosongkan</button>
                          </span>
                        )}
                      </th>
                      {kolom.map((r) => {
                        const ada = kunci.has(`${p.id}|${r}`);
                        const menyimpan = !!sibuk[`${p.id}|${r}`] || !!sibuk[`${p.id}|*`];
                        return (
                          <td key={r} className="p-0.5">
                            {bolehUbah ? (
                              <button
                                role="checkbox"
                                aria-checked={ada}
                                aria-label={`${p.nama}, rombel ${r}`}
                                disabled={menyimpan}
                                onClick={() => ganti(p, r)}
                                className={`mx-auto flex h-9 w-9 items-center justify-center rounded-md border text-xs transition-colors disabled:opacity-50 ${ada ? 'border-pramuka-800 bg-pramuka-800 text-pramuka-50' : 'border-pramuka-200 bg-white text-transparent hover:bg-pramuka-100'}`}
                              >
                                <Icon nama="cek" className="h-4 w-4" />
                              </button>
                            ) : (
                              <span className={`mx-auto flex h-9 w-9 items-center justify-center rounded-md ${ada ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-300'}`} aria-label={ada ? 'bertugas' : 'tidak bertugas'}>
                                {ada ? <Icon nama="cek" className="h-4 w-4" /> : '-'}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-pramuka-200 text-xs">
                  <tr>
                    <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left font-semibold text-pramuka-700">Jumlah Penegak</th>
                    {kolom.map((r) => <td key={r} className="px-1 py-1.5 text-pramuka-700">{ringkas.find((x) => x.rombel === r).peserta}</td>)}
                  </tr>
                  <tr>
                    <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left font-semibold text-pramuka-700">Jumlah penguji</th>
                    {kolom.map((r) => {
                      const x = ringkas.find((y) => y.rombel === r);
                      return <td key={r} className={`px-1 py-1.5 font-semibold ${x.tanpaPenguji ? 'bg-amber-100 text-amber-900' : 'text-pramuka-700'}`}>{x.penguji}</td>;
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-pramuka-500">Kolom berisi nomor rombel pada kelas {kelas} (01 = {kelas}-01). Sel amber pada baris "Jumlah penguji" berarti rombel berisi Penegak tanpa penguji.</p>

          <RiwayatPenugasan ta={ta} />

          <h2 className="mb-1 mt-8 text-lg font-bold">Agama dan guru agama</h2>
          <p className="mb-3 text-sm text-pramuka-600">
            Butir agama nanti hanya boleh diuji Pembina yang seagama dengan Penegak. Bila tidak ada Pembina seagama, Penegak diarahkan ke guru agama yang sesuai lewat surat pengantar.
          </p>
          {tanpaAgama.length > 0 && (
            <p role="status" className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Agama {tanpaAgama.length} Pembina belum diisi ({tanpaAgama.map((p) => p.nama).join(', ')}).
              {bolehUbah ? ' Isi lewat Anggota, tab Pembina, tombol Ubah.' : ' Minta Admin Gudep mengisinya.'}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {agama.map((a) => (
              <section key={a.agama} className={`panel p-4 ${a.perluSurat ? 'border-amber-300' : ''}`} aria-label={`Agama ${a.agama}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{a.agama}</h3>
                  <span className="text-xs text-pramuka-500">{a.penegak} Penegak</span>
                </div>
                <p className="mt-1 text-sm">
                  {a.pembina.length > 0
                    ? <>Pembina seagama: <span className="font-semibold">{a.pembina.map((p) => p.nama).join(', ')}</span></>
                    : <span className={a.penegak > 0 ? 'font-semibold text-amber-900' : 'text-pramuka-500'}>{a.penegak > 0 ? 'Belum ada Pembina seagama; butir agama perlu surat pengantar.' : 'Belum ada Pembina seagama.'}</span>}
                </p>
                <div className="mt-2 border-t border-pramuka-100 pt-2">
                  <p className="text-xs font-semibold text-pramuka-600">Guru agama</p>
                  {a.guru.length === 0 && <p className="text-sm text-pramuka-500">Belum ada.</p>}
                  <ul className="divide-y divide-pramuka-100">
                    {a.guru.map((g) => (
                      <li key={g.id} className="flex items-center gap-2 py-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold" title={g.nama}>{g.nama}</p>
                          {g.keterangan && <p className="truncate text-xs text-pramuka-500" title={g.keterangan}>{g.keterangan}</p>}
                        </div>
                        {bolehUbah && (
                          <>
                            <button className="rounded-md p-1.5 text-pramuka-600 hover:bg-pramuka-100" aria-label={`Ubah ${g.nama}`} onClick={() => setFormGuru({ ...g })}>
                              <Icon nama="ubah" className="h-4 w-4" />
                            </button>
                            <button className="rounded-md p-1.5 text-red-700 hover:bg-red-50" aria-label={`Hapus ${g.nama}`} onClick={() => hapusGuru(g)}>
                              <Icon nama="hapus" className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  {bolehUbah && (
                    <button className="btn btn-outline btn-sm mt-1" onClick={() => setFormGuru({ id: null, agama: a.agama, nama: '', keterangan: '' })}>
                      <Icon nama="tambah" className="h-4 w-4" /> Tambah guru agama
                    </button>
                  )}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {formGuru && <FormGuruAgama awal={formGuru} onTutup={() => setFormGuru(null)} />}
    </div>
  );
}
