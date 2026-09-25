import { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { bacaExcelLahir, unduhBerkasLahir } from '../lib/lahirExcel';
import { MAKS_BARIS_LAHIR, pesertaTanpaLahir, periksaLahirMassal } from '../lib/lahirLogic';
import { fmtTanggal } from '../lib/format';
import { Icon, Modal } from './ui';

const MAKS_BYTE = 5 * 1024 * 1024;

/**
 * Melengkapi tanggal lahir Penegak yang belum diisi lewat Excel (unduh berkas, isi kolom Tanggal Lahir, unggah, pratinjau, simpan). Penegak yang sudah punya tanggal lahir
 * tidak disentuh; koreksi satu per satu dilakukan di halaman Kelayakan. Pembina dan Admin.
 */
export default function LengkapiTanggalLahirModal({ lahir, onTutup, onSelesai }) {
  const { daftarPeserta, api, notify } = useApp();
  const inputFile = useRef(null);
  const [hasil, setHasil] = useState([]);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');
  const kosong = pesertaTanpaLahir(daftarPeserta, lahir);
  const siap = hasil.filter((h) => h.siap);
  const bermasalah = hasil.filter((h) => !h.siap && !h.dilewati);
  const dilewati = hasil.filter((h) => h.dilewati);

  const pilihFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setGalat('');
    setHasil([]);
    if (!/\.xlsx$/i.test(file.name)) return setGalat('Gunakan file Excel berformat .xlsx. Unduh berkas dari tombol di atas agar formatnya sesuai.');
    if (file.size > MAKS_BYTE) return setGalat('Ukuran file terlalu besar (maksimal 5 MB).');
    setSibuk(true);
    try {
      setHasil(periksaLahirMassal(await bacaExcelLahir(await file.arrayBuffer()), daftarPeserta, lahir));
    } catch (err) {
      setGalat(err.message);
    } finally {
      setSibuk(false);
    }
    return undefined;
  };

  const simpan = async () => {
    if (sibuk || !siap.length) return;
    setSibuk(true);
    setGalat('');
    const kirim = siap.map((h) => ({ username: h.username, tanggal: h.tanggal }));
    let selesai = 0;
    for (let i = 0; i < kirim.length; i += MAKS_BARIS_LAHIR) {
      const r = await api().imporTanggalLahir(kirim.slice(i, i + MAKS_BARIS_LAHIR));
      if (!r.ok) {
        setGalat(`${selesai > 0 ? `${selesai} Penegak sudah tersimpan. ` : ''}${r.pesan}`);
        setSibuk(false);
        if (selesai > 0) onSelesai();
        return;
      }
      selesai += r.data;
    }
    setSibuk(false);
    notify(`Tanggal lahir ${selesai} Penegak disimpan.`);
    onSelesai();
  };

  return (
    <Modal
      buka
      tutup={onTutup}
      judul="Lengkapi tanggal lahir"
      lebar="max-w-3xl"
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup} disabled={sibuk}>Tutup</button>
          <button className="btn btn-primary" onClick={simpan} disabled={sibuk || siap.length === 0}>{sibuk ? 'Menyimpan...' : `Simpan ${siap.length} Penegak`}</button>
        </>
      }
    >
      {kosong.length === 0 && hasil.length === 0 ? (
        <p className="text-sm font-semibold text-emerald-800">Semua Penegak aktif sudah diisi tanggal lahirnya. Tidak ada yang perlu dilengkapi.</p>
      ) : (
        <>
          <p className="text-sm text-pramuka-700">
            {kosong.length} Penegak aktif belum diisi tanggal lahirnya. Unduh berkas Excel, isi kolom Tanggal Lahir (tanggal/bulan/tahun, mis. 15/03/2008), lalu unggah. Yang sudah punya tanggal lahir tidak diubah dari sini.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-outline btn-sm" onClick={() => unduhBerkasLahir(daftarPeserta, lahir)}>
              <Icon nama="unduh" className="h-4 w-4" /> Unduh berkas Excel
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => inputFile.current?.click()} disabled={sibuk}>
              <Icon nama="unggah" className="h-4 w-4" /> Unggah berkas terisi
            </button>
            <input ref={inputFile} type="file" accept=".xlsx" className="sr-only" aria-label="Pilih berkas Excel tanggal lahir" onChange={pilihFile} />
          </div>
          {hasil.length > 0 && (
            <div className="mt-3 text-sm" role="status">
              <p className="font-semibold text-emerald-800">{siap.length} baris siap disimpan.</p>
              {dilewati.length > 0 && <p className="text-pramuka-700">{dilewati.length} baris dilewati karena Penegaknya sudah punya tanggal lahir.</p>}
              {bermasalah.length > 0 && (
                <div role="alert" className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-amber-950">
                  <p className="font-semibold">{bermasalah.length} baris tidak dapat diproses:</p>
                  <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
                    {bermasalah.map((h) => <li key={h.no}>Baris {h.no}{h.id ? ` (${h.id})` : ''}: {h.galat.join('; ')}</li>)}
                  </ul>
                </div>
              )}
              {siap.length > 0 && (
                <div className="mt-3 max-h-[35vh] overflow-auto rounded-lg border border-pramuka-200">
                  <table className="w-full min-w-[360px] text-left text-sm">
                    <thead className="sticky top-0 bg-pramuka-100 text-pramuka-800"><tr><th className="px-3 py-2 font-semibold">Nama</th><th className="px-3 py-2 font-semibold">Tanggal lahir</th></tr></thead>
                    <tbody className="divide-y divide-pramuka-100">
                      {siap.slice(0, 200).map((h) => <tr key={h.no}><td className="px-3 py-1.5">{h.nama}</td><td className="px-3 py-1.5">{fmtTanggal(h.tanggal)}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {galat && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}
