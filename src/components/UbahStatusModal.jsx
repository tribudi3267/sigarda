import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { SEMUA_ROMBEL, rombelSah } from '../lib/rombelLogic';
import { KETERANGAN_STATUS, LABEL_STATUS, statusAnggota } from '../lib/naikKelasLogic';
import { BadgeStatus, Field, Modal } from './ui';

/**
 * Mengubah status SATU Penegak: nonaktifkan (tidak melanjutkan Pramuka), aktifkan kembali (rombel wajib), atau jadikan alumni (hanya Admin).
 * Pembina dan Admin Gudep; server menegakkan hak ini. Kenaikan kelas massal ada di menu Naik Kelas (Admin).
 */
export default function UbahStatusModal({ peserta, onTutup }) {
  const { user, aturStatusAnggota } = useApp();
  const sekarang = statusAnggota(peserta);
  const admin = user?.role === 'admin';
  const pilihan = [
    ...(sekarang === 'aktif' ? [['nonaktif', 'Nonaktifkan: tidak melanjutkan Pramuka']] : []),
    ...(sekarang !== 'aktif' ? [['aktif', 'Aktifkan kembali: ikut Pramuka lagi']] : []),
    ...(admin && sekarang !== 'alumni' ? [['alumni', 'Jadikan alumni: sudah lulus']] : []),
  ];
  const [status, setStatus] = useState(pilihan[0]?.[0] ?? '');
  const [rombel, setRombel] = useState(rombelSah(peserta.kelas) ? peserta.kelas : '');
  const [catatan, setCatatan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');

  const simpan = async () => {
    if (sibuk || !status) return;
    setGalat('');
    if (status === 'aktif' && !rombelSah(rombel)) { setGalat('Pilih rombel untuk mengaktifkan kembali.'); return; }
    setSibuk(true);
    const r = await aturStatusAnggota(peserta.id, status, status === 'aktif' ? rombel : null, catatan.trim());
    setSibuk(false);
    if (r.ok) onTutup(); else setGalat(r.pesan ?? 'Gagal mengubah status.');
  };

  return (
    <Modal
      buka
      tutup={onTutup}
      judul={`Status ${peserta.nama}`}
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup} disabled={sibuk}>Batal</button>
          <button className="btn btn-primary" onClick={simpan} disabled={sibuk || !status}>{sibuk ? 'Menyimpan...' : 'Simpan status'}</button>
        </>
      }
    >
      <p className="flex flex-wrap items-center gap-2 text-sm">Status sekarang: <BadgeStatus status={sekarang} /></p>
      <p className="mt-1 text-xs text-pramuka-600">{KETERANGAN_STATUS[sekarang]}</p>
      {pilihan.length === 0 ? (
        <p className="mt-3 text-sm text-pramuka-700">Tidak ada perubahan yang dapat Anda lakukan pada status ini.</p>
      ) : (
        <div className="mt-4 space-y-3">
          <fieldset>
            <legend className="label">Ubah menjadi</legend>
            <div className="space-y-1.5">
              {pilihan.map(([k, teks]) => (
                <label key={k} className="flex cursor-pointer items-start gap-2 text-sm">
                  <input type="radio" name="status-baru" className="mt-1 h-4 w-4 accent-emas" checked={status === k} onChange={() => setStatus(k)} />
                  <span>{teks}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {status === 'aktif' && (
            <Field label="Rombel sekarang (wajib)" htmlFor="ubah-status-rombel" bantuan="Rombel terakhir mungkin sudah lama; pilih rombel yang berlaku tahun ini.">
              <select id="ubah-status-rombel" className="input w-auto min-w-[8rem]" value={rombel} onChange={(e) => setRombel(e.target.value)}>
                <option value="">Pilih...</option>
                {SEMUA_ROMBEL.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          )}
          {(status === 'nonaktif' || status === 'alumni') && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Pengajuan uji {peserta.nama} yang masih berjalan dibatalkan. Sesudah ini {LABEL_STATUS[status].toLowerCase()} hanya dapat dilihat dan dicetak.
            </p>
          )}
          <Field label="Catatan (boleh kosong)" htmlFor="ubah-status-catatan">
            <input id="ubah-status-catatan" className="input" maxLength={200} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="mis. tidak mengikuti ekstrakurikuler di kelas XI" />
          </Field>
        </div>
      )}
      {galat && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}
