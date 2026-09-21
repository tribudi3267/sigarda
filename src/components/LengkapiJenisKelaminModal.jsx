import { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { bacaExcelJk, unduhBerkasJk } from '../lib/jenisKelaminExcel';
import { JENIS_KELAMIN, MAKS_BARIS_JK, anggotaTanpaJk, labelPeranAnggota, periksaJkMassal, urutAnggotaJk } from '../lib/jenisKelaminLogic';
import { Icon, Modal } from './ui';

const MAKS_BYTE = 5 * 1024 * 1024;

/**
 * Melengkapi jenis kelamin anggota lama (semua peran) yang belum diisi: pilih satu per satu di daftar, atau isi sekaligus lewat Excel
 * (unduh berkas, isi kolom Jenis Kelamin, unggah). Tombol Simpan hanya menyimpan baris yang sudah dipilih.
 */
export default function LengkapiJenisKelaminModal({ onTutup }) {
  const { users, lengkapiJenisKelamin } = useApp();
  const inputFile = useRef(null);
  const daftar = useMemo(() => urutAnggotaJk(anggotaTanpaJk(users)), [users]);
  const [pilihan, setPilihan] = useState({}); // id anggota -> 'L' | 'P'
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');
  const [info, setInfo] = useState('');
  const [dilewati, setDilewati] = useState([]);

  const terpilih = daftar.filter((u) => pilihan[u.id]);

  const pilihFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setGalat('');
    setInfo('');
    setDilewati([]);
    if (!/\.xlsx$/i.test(file.name)) return setGalat('Gunakan file Excel berformat .xlsx. Unduh berkas dari tombol di atas agar formatnya sesuai.');
    if (file.size > MAKS_BYTE) return setGalat('Ukuran file terlalu besar (maksimal 5 MB).');
    setSibuk(true);
    try {
      const hasil = periksaJkMassal(await bacaExcelJk(await file.arrayBuffer()), users);
      // Hanya anggota yang memang belum berjenis kelamin yang diisi dari berkas ini (yang sudah terisi tidak disentuh).
      const kosong = new Set(daftar.map((u) => u.id));
      const layak = hasil.filter((h) => h.siap && kosong.has(h.userId));
      const sudahAda = hasil.filter((h) => h.siap && !kosong.has(h.userId));
      setPilihan((p) => ({ ...p, ...Object.fromEntries(layak.map((h) => [h.userId, h.jk])) }));
      setDilewati([
        ...hasil.filter((h) => !h.siap).map((h) => ({ no: h.no, pesan: `${h.id || '(tanpa nama pengguna)'}: ${h.galat.join('; ')}` })),
        ...sudahAda.map((h) => ({ no: h.no, pesan: `${h.nama} sudah berjenis kelamin; dilewati.` })),
      ]);
      setInfo(`${layak.length} anggota terisi dari berkas.`);
    } catch (err) {
      setGalat(err.message);
    } finally {
      setSibuk(false);
    }
    return undefined;
  };

  const simpan = async () => {
    if (sibuk || !terpilih.length) return;
    setSibuk(true);
    setGalat('');
    const kirim = terpilih.map((u) => ({ username: u.username, jk: pilihan[u.id] }));
    let selesai = 0;
    for (let i = 0; i < kirim.length; i += MAKS_BARIS_JK) {
      const r = await lengkapiJenisKelamin(kirim.slice(i, i + MAKS_BARIS_JK));
      if (!r.ok) {
        setGalat(`${selesai > 0 ? `${selesai} anggota sudah tersimpan. ` : ''}${r.pesan}`);
        setSibuk(false);
        return;
      }
      selesai += r.data;
    }
    setSibuk(false);
    onTutup();
  };

  return (
    <Modal
      buka
      tutup={onTutup}
      judul="Lengkapi jenis kelamin"
      lebar="max-w-3xl"
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup} disabled={sibuk}>Tutup</button>
          <button className="btn btn-primary" onClick={simpan} disabled={sibuk || terpilih.length === 0}>
            {sibuk ? 'Menyimpan...' : `Simpan ${terpilih.length} anggota`}
          </button>
        </>
      }
    >
      {daftar.length === 0 ? (
        <p className="text-sm font-semibold text-emerald-800">Semua anggota sudah diisi jenis kelaminnya. Tidak ada yang perlu dilengkapi.</p>
      ) : (
        <>
          <p className="text-sm text-pramuka-700">
            {daftar.length} anggota belum diisi jenis kelaminnya. Pilih satu per satu di daftar, atau isi sekaligus lewat Excel: unduh berkas, isi kolom Jenis Kelamin, lalu unggah.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-outline btn-sm" onClick={() => unduhBerkasJk(users)}>
              <Icon nama="unduh" className="h-4 w-4" /> Unduh berkas Excel
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => inputFile.current?.click()} disabled={sibuk}>
              <Icon nama="unggah" className="h-4 w-4" /> Unggah berkas terisi
            </button>
            <input ref={inputFile} type="file" accept=".xlsx" className="sr-only" aria-label="Pilih berkas Excel jenis kelamin" onChange={pilihFile} />
          </div>
          {info && <p role="status" className="mt-3 text-sm font-semibold text-emerald-800">{info}</p>}
          {dilewati.length > 0 && (
            <div role="alert" className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <p className="font-semibold">{dilewati.length} baris berkas dilewati:</p>
              <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
                {dilewati.map((d, i) => <li key={i}>Baris {d.no}: {d.pesan}</li>)}
              </ul>
            </div>
          )}

          <div className="mt-3 max-h-[45vh] overflow-auto rounded-lg border border-pramuka-200">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="sticky top-0 bg-pramuka-100 text-pramuka-800">
                <tr>
                  <th className="px-3 py-2 font-semibold">Nama</th>
                  <th className="px-3 py-2 font-semibold">Peran</th>
                  <th className="px-3 py-2 font-semibold">Jenis kelamin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pramuka-100">
                {daftar.map((u) => (
                  <tr key={u.id}>
                    <td className="px-3 py-1.5">
                      <span className="block font-semibold">{u.nama}</span>
                      <span className="block text-xs text-pramuka-500">{u.role === 'peserta' ? `NIS ${u.nis ?? u.username}` : `Pengguna ${u.username}`}</span>
                    </td>
                    <td className="px-3 py-1.5">{labelPeranAnggota(u)}{u.role === 'peserta' && u.kelas ? `, ${u.kelas}` : ''}</td>
                    <td className="px-3 py-1.5">
                      <select
                        className="input w-auto min-w-[8rem] py-1.5"
                        aria-label={`Jenis kelamin ${u.nama}`}
                        value={pilihan[u.id] ?? ''}
                        onChange={(e) => setPilihan((p) => ({ ...p, [u.id]: e.target.value }))}
                      >
                        <option value="">Pilih...</option>
                        {JENIS_KELAMIN.map((j) => <option key={j.kode} value={j.kode}>{j.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {galat && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}
