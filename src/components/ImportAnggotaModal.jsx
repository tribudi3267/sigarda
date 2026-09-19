import { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { bacaExcelAnggota, kelompokDari, periksaBaris, unduhTemplateAnggota, MAKS_BARIS } from '../lib/importAnggota';
import { unduhXlsx } from '../lib/exportXlsx';
import { fmtTanggal, hariIni } from '../lib/format';
import { Icon, Modal } from './ui';

const MAKS_BYTE = 5 * 1024 * 1024;

/**
 * Import anggota dari Excel dalam tiga tahap: pilih file, periksa (pratinjau), hasil.
 * `kelompok`: 'peserta' (Penegak), 'dewan' (Dewan Ambalan), atau 'pembina'.
 * Daftar PIN awal hanya ditampilkan pada tahap hasil dan dapat diunduh.
 */
export default function ImportAnggotaModal({ kelompok = 'peserta', onTutup }) {
  const { users, imporAnggota } = useApp();
  const penegak = kelompok === 'peserta';
  const label = kelompokDari(kelompok)?.label ?? 'Anggota';
  const inputFile = useRef(null);
  const [tahap, setTahap] = useState('pilih');
  const [sibuk, setSibuk] = useState(false);
  const [namaFile, setNamaFile] = useState('');
  const [baris, setBaris] = useState([]);
  const [galat, setGalat] = useState('');
  const [hasil, setHasil] = useState([]);
  const [ditolakServer, setDitolakServer] = useState([]);
  const [kemajuan, setKemajuan] = useState(null);

  const periksa = periksaBaris(baris, users, kelompok);
  const siap = periksa.filter((r) => r.siap);

  const pilihFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setGalat('');
    if (!/\.xlsx$/i.test(file.name)) return setGalat('Gunakan file Excel berformat .xlsx. Unduh template agar formatnya sesuai.');
    if (file.size > MAKS_BYTE) return setGalat('Ukuran file terlalu besar (maksimal 5 MB).');
    setSibuk(true);
    try {
      setBaris(await bacaExcelAnggota(await file.arrayBuffer(), kelompok));
      setNamaFile(file.name);
      setTahap('periksa');
    } catch (err) {
      setGalat(err.message);
    } finally {
      setSibuk(false);
    }
    return undefined;
  };

  const impor = async () => {
    if (sibuk) return;
    setSibuk(true);
    setKemajuan({ selesai: 0, total: siap.length });
    const r = await imporAnggota(baris, kelompok, (selesai, total) => setKemajuan({ selesai, total }));
    setSibuk(false);
    setKemajuan(null);
    if (r.ok) {
      setHasil(r.daftar);
      setDitolakServer([...r.ditolakServer, ...(r.galatBerhenti ? [{ no: '-', pesan: r.galatBerhenti }] : [])]);
      setTahap('hasil');
    }
  };

  const unduhPin = () =>
    unduhXlsx({
      namaFile: `akun-baru-${kelompok}-${hariIni()}.xlsx`,
      sheets: [{
        nama: 'Akun Baru',
        judul: [
          `Daftar nama pengguna dan PIN awal ${label} baru (RAHASIA)`,
          `Dibuat ${fmtTanggal(hariIni())}. Bagikan langsung ke masing-masing orang. PIN wajib diganti saat login pertama.`,
        ],
        kolom: [
          { header: 'No', key: 'no', lebar: 6, rata: 'center' },
          { header: 'Nama', key: 'nama', lebar: 30 },
          { header: 'Nama Pengguna', key: 'username', lebar: 22 },
          ...(penegak ? [
            { header: 'Kelas', key: 'kelas', lebar: 9, rata: 'center' },
            { header: 'Sangga', key: 'sangga', lebar: 20 },
          ] : []),
          { header: 'PIN Awal', key: 'pin', lebar: 12, rata: 'center' },
        ],
        baris: hasil.map((h, i) => ({ no: i + 1, ...h })),
      }],
    });

  const aksi = {
    pilih: <button className="btn btn-outline" onClick={onTutup}>Batal</button>,
    periksa: (
      <>
        <button className="btn btn-outline" onClick={() => { setTahap('pilih'); setBaris([]); }} disabled={sibuk}>Pilih file lain</button>
        <button className="btn btn-primary" onClick={impor} disabled={siap.length === 0 || sibuk}>
          {sibuk && kemajuan ? `Mengimpor ${kemajuan.selesai} dari ${kemajuan.total}...` : `Impor ${siap.length} anggota`}
        </button>
      </>
    ),
    hasil: <button className="btn btn-primary" onClick={onTutup}>Selesai</button>,
  }[tahap];

  return (
    <Modal buka tutup={onTutup} judul={`Import ${label} dari Excel`} aksi={aksi} lebar="max-w-3xl">
      {tahap === 'pilih' && (
        <div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-pramuka-700">
            <li>Unduh template Excel {label}, lalu isi datanya (satu baris satu orang).</li>
            <li>{penegak
              ? 'Kolom wajib: Nama Lengkap, NIS, Kelas, Sangga, Agama. NIS menjadi nama pengguna untuk masuk. PIN Awal boleh dikosongkan.'
              : 'Kolom wajib: Nama Lengkap. Nama Pengguna dan PIN Awal boleh dikosongkan (dibuat otomatis).'}</li>
            <li>Unggah file di bawah, periksa pratinjaunya, lalu impor. Maksimal {MAKS_BARIS} baris.</li>
          </ol>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn btn-outline btn-sm" onClick={() => unduhTemplateAnggota(kelompok)}>
              <Icon nama="unduh" className="h-4 w-4" /> Unduh template Excel
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => inputFile.current?.click()} disabled={sibuk}>
              <Icon nama="unggah" className="h-4 w-4" /> {sibuk ? 'Membaca file...' : 'Pilih file .xlsx'}
            </button>
            <input ref={inputFile} type="file" accept=".xlsx" className="sr-only" aria-label={`Pilih file Excel ${label}`} onChange={pilihFile} />
          </div>

          {galat && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{galat}</p>}
          <p className="mt-4 rounded-md bg-pramuka-50 px-3 py-2 text-xs leading-relaxed text-pramuka-700">
            PIN awal (6 angka) boleh diisi pada kolom PIN Awal. Jika dikosongkan, server membuat PIN acak untuk tiap anggota.
            Semua yang diimpor wajib mengganti PIN saat login pertama.
          </p>
        </div>
      )}

      {tahap === 'periksa' && (
        <div>
          <p className="text-sm text-pramuka-700">
            File <span className="font-semibold">{namaFile}</span>: {baris.length} baris terbaca.{' '}
            <span className="font-semibold text-emerald-800">{siap.length} siap diimpor</span>
            {periksa.length - siap.length > 0 && (
              <>, <span className="font-semibold text-red-700">{periksa.length - siap.length} dilewati</span></>
            )}.
          </p>
          <div className="mt-3 max-h-[45vh] overflow-auto rounded-lg border border-pramuka-200">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="sticky top-0 bg-pramuka-100 text-pramuka-800">
                <tr>
                  <th className="px-3 py-2 font-semibold">Baris</th>
                  <th className="px-3 py-2 font-semibold">Nama</th>
                  {penegak && (
                    <>
                      <th className="px-3 py-2 font-semibold">Kelas</th>
                      <th className="px-3 py-2 font-semibold">Sangga</th>
                      <th className="px-3 py-2 font-semibold">Agama</th>
                    </>
                  )}
                  <th className="px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pramuka-100">
                {periksa.map((r) => (
                  <tr key={r.no} className={r.siap ? '' : 'bg-red-50/70'}>
                    <td className="px-3 py-2 text-pramuka-500">{r.no}</td>
                    <td className="px-3 py-2 font-semibold">{r.data.nama || '-'}</td>
                    {penegak && (
                      <>
                        <td className="px-3 py-2">{r.data.kelas || '-'}</td>
                        <td className="px-3 py-2">{r.data.sangga || '-'}</td>
                        <td className="px-3 py-2">{r.data.agama || r.data.agamaAsli || '-'}</td>
                      </>
                    )}
                    <td className="px-3 py-2">
                      {r.siap ? <span className="font-semibold text-emerald-800">Siap</span> : <span className="text-red-700">{r.galat.join('; ')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tahap === 'hasil' && (
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <Icon nama="cek" className="h-4 w-4" /> {hasil.length} {label} berhasil diimpor.
          </p>
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Catat atau unduh daftar nama pengguna dan PIN awal sekarang. PIN ini hanya tampil sekali. Bagikan langsung ke
            masing-masing anggota; mereka wajib menggantinya saat login pertama.
          </p>
          <button className="btn btn-gold btn-sm mt-3" onClick={unduhPin}>
            <Icon nama="unduh" className="h-4 w-4" /> Unduh daftar akun baru (.xlsx)
          </button>
          <div className="mt-3 max-h-[35vh] overflow-auto rounded-lg border border-pramuka-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-pramuka-100 text-pramuka-800">
                <tr>
                  <th className="px-3 py-2 font-semibold">Nama</th>
                  <th className="px-3 py-2 font-semibold">Nama pengguna</th>
                  {penegak && <th className="px-3 py-2 font-semibold">Kelas</th>}
                  <th className="px-3 py-2 font-semibold">PIN awal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pramuka-100">
                {hasil.map((h, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-semibold">{h.nama}</td>
                    <td className="px-3 py-2 font-mono">{h.username}</td>
                    {penegak && <td className="px-3 py-2">{h.kelas}, {h.sangga}</td>}
                    <td className="px-3 py-2 font-mono font-bold tracking-widest">{h.pin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ditolakServer.length > 0 && (
            <div role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              <p className="font-semibold">{ditolakServer.length} baris ditolak server:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                {ditolakServer.map((d, i) => <li key={i}>Baris {d.no}: {d.pesan}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
