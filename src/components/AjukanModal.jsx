import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { hariIni } from '../lib/format';
import { Field, Modal, TeksPoin } from './ui';

/** Peserta mengagendakan setoran/pengujian satu poin SKU. */
export default function AjukanModal({ poin, onTutup }) {
  const { users, ajukan } = useApp();
  const daftarPenguji = users.filter((u) => u.role === 'penguji');

  const [jadwal, setJadwal] = useState(hariIni());
  const [pengujiId, setPengujiId] = useState(daftarPenguji[0]?.id ?? '');
  const [catatan, setCatatan] = useState('');
  const [galat, setGalat] = useState('');

  const kirim = () => {
    const hasil = ajukan({ skuId: poin.id, jadwal, pengujiId, catatan });
    if (hasil.ok) onTutup();
    else setGalat(hasil.pesan);
  };

  return (
    <Modal
      buka
      tutup={onTutup}
      judul="Ajukan pengujian"
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup}>Batal</button>
          <button className="btn btn-primary" onClick={kirim}>Kirim pengajuan</button>
        </>
      }
    >
      <div className="mb-4 rounded-md bg-pramuka-50 px-3 py-2 text-pramuka-800">
        <TeksPoin poin={poin} />
      </div>

      <Field label="Tanggal pengujian" htmlFor="jadwal">
        <input id="jadwal" type="date" className="input" min={hariIni()} value={jadwal} onChange={(e) => setJadwal(e.target.value)} />
      </Field>

      <Field label="Penguji (Pembina atau Dewan Ambalan)" htmlFor="penguji">
        <select id="penguji" className="input" value={pengujiId} onChange={(e) => setPengujiId(e.target.value)}>
          {daftarPenguji.map((u) => (
            <option key={u.id} value={u.id}>{u.nama}{u.jabatan ? `, ${u.jabatan}` : ''}</option>
          ))}
        </select>
      </Field>

      <Field label="Catatan untuk penguji (opsional)" htmlFor="catatan">
        <textarea id="catatan" rows={3} className="input" value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Contoh: siap praktik di lapangan upacara" />
      </Field>

      {galat && <p role="alert" className="text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}
