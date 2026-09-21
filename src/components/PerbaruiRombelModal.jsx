import { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { MAKS_BARIS_PERMINTAAN, bacaExcelRombel, daftarRombelLama, periksaRombelMassal, unduhBerkasRombel } from '../lib/rombelExcel';
import { KELAS_ROMBEL, SEMUA_ROMBEL, daftarRombelKelas } from '../lib/rombelLogic';
import { Icon, Modal } from './ui';

const MAKS_BYTE = 5 * 1024 * 1024;

/**
 * Perbarui rombel Penegak lama (kelas "X", "XI", "XII") menjadi rombel baku (X-01 sampai XII-10), satu per satu lewat daftar
 * atau massal lewat Excel. Hanya Penegak yang masih berkelas lama yang tampil. Tombol Simpan hanya menyimpan baris yang sudah dipilih.
 */
export default function PerbaruiRombelModal({ onTutup }) {
  const { users, perbaruiRombel } = useApp();
  const inputFile = useRef(null);
  const daftar = useMemo(() => daftarRombelLama(users), [users]);
  const [pilihan, setPilihan] = useState({}); // id -> rombel
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');
  const [info, setInfo] = useState('');
  const [dilewati, setDilewati] = useState([]);

  const terpilih = daftar.filter((u) => pilihan[u.id]);

  const opsi = (u) => {
    const dasar = KELAS_ROMBEL.includes(String(u.kelas).toUpperCase()) ? daftarRombelKelas(String(u.kelas).toUpperCase()) : SEMUA_ROMBEL;
    const ekstra = pilihan[u.id] && !dasar.includes(pilihan[u.id]) ? [pilihan[u.id]] : [];
    return [...dasar, ...ekstra];
  };

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
      const hasil = periksaRombelMassal(await bacaExcelRombel(await file.arrayBuffer()), users);
      // Hanya Penegak yang memang masih berkelas lama yang diisi dari berkas ini (yang sudah baku tidak disentuh).
      const lama = new Set(daftar.map((u) => u.id));
      const layak = hasil.filter((h) => h.siap && lama.has(h.id));
      const sudahBaku = hasil.filter((h) => h.siap && !lama.has(h.id));
      setPilihan((p) => ({ ...p, ...Object.fromEntries(layak.map((h) => [h.id, h.rombel])) }));
      setDilewati([
        ...hasil.filter((h) => !h.siap).map((h) => ({ no: h.no, pesan: `${h.nis || '(tanpa NIS)'}: ${h.galat.join('; ')}` })),
        ...sudahBaku.map((h) => ({ no: h.no, pesan: `${h.nama} (${h.nis}) sudah berrombel ${h.kelasLama}; dilewati.` })),
      ]);
      setInfo(`${layak.length} Penegak terisi dari berkas.`);
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
    const kirim = terpilih.map((u) => ({ username: u.username, rombel: pilihan[u.id] }));
    let selesai = 0;
    for (let i = 0; i < kirim.length; i += MAKS_BARIS_PERMINTAAN) {
      const r = await perbaruiRombel(kirim.slice(i, i + MAKS_BARIS_PERMINTAAN));
      if (!r.ok) {
        setGalat(`${selesai > 0 ? `${selesai} Penegak sudah tersimpan. ` : ''}${r.pesan}`);
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
      judul="Perbarui rombel Penegak"
      lebar="max-w-3xl"
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup} disabled={sibuk}>Tutup</button>
          <button className="btn btn-primary" onClick={simpan} disabled={sibuk || terpilih.length === 0}>
            {sibuk ? 'Menyimpan...' : `Simpan ${terpilih.length} rombel`}
          </button>
        </>
      }
    >
      {daftar.length === 0 ? (
        <p className="text-sm font-semibold text-emerald-800">Semua Penegak sudah memakai rombel baku. Tidak ada yang perlu diperbarui.</p>
      ) : (
        <>
          <p className="text-sm text-pramuka-700">
            {daftar.length} Penegak masih memakai kelas lama. Pilih rombel masing-masing di daftar, atau isi sekaligus lewat Excel: unduh berkas, isi kolom Rombel, lalu unggah.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-outline btn-sm" onClick={() => unduhBerkasRombel(users)}>
              <Icon nama="unduh" className="h-4 w-4" /> Unduh berkas Excel
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => inputFile.current?.click()} disabled={sibuk}>
              <Icon nama="unggah" className="h-4 w-4" /> Unggah berkas terisi
            </button>
            <input ref={inputFile} type="file" accept=".xlsx" className="sr-only" aria-label="Pilih berkas Excel rombel" onChange={pilihFile} />
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
                  <th className="px-3 py-2 font-semibold">Kelas kini</th>
                  <th className="px-3 py-2 font-semibold">Rombel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pramuka-100">
                {daftar.map((u) => (
                  <tr key={u.id}>
                    <td className="px-3 py-1.5">
                      <span className="block font-semibold">{u.nama}</span>
                      <span className="block text-xs text-pramuka-500">NIS {u.nis ?? u.username}</span>
                    </td>
                    <td className="px-3 py-1.5">{u.kelas}</td>
                    <td className="px-3 py-1.5">
                      <select
                        className="input w-auto min-w-[7rem] py-1.5"
                        aria-label={`Rombel ${u.nama}`}
                        value={pilihan[u.id] ?? ''}
                        onChange={(e) => setPilihan((p) => ({ ...p, [u.id]: e.target.value }))}
                      >
                        <option value="">Pilih...</option>
                        {opsi(u).map((r) => <option key={r} value={r}>{r}</option>)}
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
