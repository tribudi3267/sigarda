import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { NILAI } from '../config';
import { getEntry } from '../lib/skuLogic';
import { hariIni } from '../lib/format';
import { Badge, Field, Modal, TeksPoin } from './ui';

const PILIHAN = [
  { id: 'lulus', label: 'Lulus', bantuan: 'Poin terpenuhi. Kode verifikasi digital dibuat otomatis.' },
  { id: 'ulang', label: 'Perlu diulang', bantuan: 'Wajib memberi catatan perbaikan untuk peserta.' },
  { id: 'proses', label: 'Mulai uji', bantuan: 'Tandai sedang diuji, hasil dicatat menyusul.' },
  { id: 'reset', label: 'Kembalikan ke belum diuji', bantuan: 'Membatalkan status sebelumnya. Wajib memberi alasan.' },
];

/** Penguji menilai satu poin. PIN penguji berfungsi sebagai verifikasi digital. */
export default function UjiModal({ pesertaId, poin, onTutup }) {
  const { users, progress, catatHasil } = useApp();
  const peserta = users.find((u) => u.id === pesertaId);
  const entry = getEntry(progress, pesertaId, poin.id);

  const [hasil, setHasil] = useState(entry.status === 'lulus' ? 'reset' : 'lulus');
  const [tanggalUji, setTanggalUji] = useState(entry.tanggalUji ?? hariIni());
  const [nilai, setNilai] = useState(entry.nilai ?? NILAI[1]);
  const [catatan, setCatatan] = useState('');
  const [pin, setPin] = useState('');
  const [galat, setGalat] = useState('');

  const pilihan = PILIHAN.filter((p) => p.id !== 'reset' || entry.status !== 'belum');
  const perluCatatan = hasil === 'ulang' || hasil === 'reset';

  const simpan = () => {
    const r = catatHasil({ pesertaId, skuId: poin.id, hasil, tanggalUji, nilai, catatan, pin });
    if (r.ok) onTutup();
    else setGalat(r.pesan);
  };

  return (
    <Modal
      buka
      tutup={onTutup}
      judul="Penilaian poin SKU"
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup}>Batal</button>
          <button className="btn btn-primary" onClick={simpan} disabled={pin.length < 4}>
            Simpan dan verifikasi
          </button>
        </>
      }
    >
      <div className="mb-4 rounded-md bg-pramuka-50 px-3 py-2.5">
        <p className="text-sm font-semibold text-pramuka-900">{peserta?.nama}</p>
        <div className="mt-1 text-pramuka-800"><TeksPoin poin={poin} /></div>
        <div className="mt-2 flex items-center gap-2 text-xs text-pramuka-600">
          Status saat ini <Badge status={entry.status} />
        </div>
        {entry.catatanPeserta && (
          <p className="mt-2 text-xs text-pramuka-600">Catatan peserta: {entry.catatanPeserta}</p>
        )}
      </div>

      <fieldset className="mb-4">
        <legend className="label">Hasil pengujian</legend>
        <div className="space-y-2">
          {pilihan.map((p) => (
            <label
              key={p.id}
              className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 ${
                hasil === p.id ? 'border-emas bg-amber-50' : 'border-pramuka-200 hover:bg-pramuka-50'
              }`}
            >
              <input
                type="radio"
                name="hasil"
                className="mt-1 accent-pramuka-800"
                checked={hasil === p.id}
                onChange={() => setHasil(p.id)}
              />
              <span>
                <span className="block text-sm font-semibold text-pramuka-900">{p.label}</span>
                <span className="block text-xs text-pramuka-600">{p.bantuan}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {hasil !== 'reset' && (
        <Field label="Tanggal uji" htmlFor="tgl-uji">
          <input id="tgl-uji" type="date" className="input" value={tanggalUji} onChange={(e) => setTanggalUji(e.target.value)} />
        </Field>
      )}

      {hasil === 'lulus' && (
        <Field label="Predikat" htmlFor="nilai">
          <select id="nilai" className="input" value={nilai} onChange={(e) => setNilai(e.target.value)}>
            {NILAI.map((n) => <option key={n}>{n}</option>)}
          </select>
        </Field>
      )}

      <Field label={hasil === 'reset' ? 'Alasan pembatalan' : perluCatatan ? 'Catatan perbaikan' : 'Catatan penguji (opsional)'} htmlFor="catatan-uji">
        <textarea id="catatan-uji" rows={3} className="input" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
      </Field>

      <Field label="PIN Anda sebagai verifikasi digital" htmlFor="pin-uji" bantuan="Hasil hanya tersimpan bila PIN penguji benar.">
        <input
          id="pin-uji"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          className="input"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        />
      </Field>

      {galat && <p role="alert" className="text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}
