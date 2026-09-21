import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { hariIni } from '../lib/format';
import { Field, Modal, TeksPoin } from './ui';

/** Peserta mengagendakan setoran/pengujian satu poin SKU. Daftar penguji dihitung server (penugasan rombel, agama, butir Laksana). */
export default function AjukanModal({ poin, onTutup }) {
  const { ajukan, pengujiPilihan } = useApp();

  const [pilihan, setPilihan] = useState(null); // null = memuat
  const [galatMuat, setGalatMuat] = useState('');
  const [jadwal, setJadwal] = useState(hariIni());
  const [pengujiId, setPengujiId] = useState(''); // kosong = antrian rombel
  const [catatan, setCatatan] = useState('');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    let batal = false;
    pengujiPilihan(poin.id).then((r) => {
      if (batal) return;
      if (r.ok) setPilihan(r.data);
      else setGalatMuat(r.pesan ?? 'Daftar penguji tidak dapat dimuat.');
    });
    return () => { batal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poin.id]);

  const daftar = pilihan?.penguji ?? [];
  const kosong = pilihan && daftar.length === 0;

  const kirim = async () => {
    if (sibuk) return;
    setSibuk(true);
    setGalat('');
    const hasil = await ajukan({ skuId: poin.id, jadwal, pengujiId: pengujiId || null, catatan });
    setSibuk(false);
    if (hasil.ok) onTutup();
    else setGalat(hasil.pesan);
  };

  const label = poin.agama ? 'Penguji (Pembina seagama)' : poin.tingkat === 'Laksana' ? 'Penguji (Pembina)' : 'Penguji (Pembina atau Dewan Ambalan)';
  const bantuan = poin.agama
    ? 'Butir agama hanya diuji oleh Pembina yang seagama dengan Anda.'
    : poin.tingkat === 'Laksana'
      ? 'Butir Laksana hanya diuji oleh Pembina.'
      : undefined;

  return (
    <Modal
      buka
      tutup={onTutup}
      judul="Ajukan pengujian"
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup}>Batal</button>
          <button className="btn btn-primary" onClick={kirim} disabled={sibuk || !pilihan || kosong}>{sibuk ? 'Mengirim...' : 'Kirim pengajuan'}</button>
        </>
      }
    >
      <div className="mb-4 rounded-md bg-pramuka-50 px-3 py-2 text-pramuka-800">
        <TeksPoin poin={poin} />
      </div>

      <Field label="Tanggal pengujian" htmlFor="jadwal">
        <input id="jadwal" type="date" className="input" min={hariIni()} value={jadwal} onChange={(e) => setJadwal(e.target.value)} />
      </Field>

      <Field label={label} htmlFor="penguji" bantuan={bantuan}>
        <select id="penguji" className="input" value={pengujiId} onChange={(e) => setPengujiId(e.target.value)} disabled={!pilihan || kosong}>
          {!pilihan && <option value="">{galatMuat ? 'Daftar penguji tidak tersedia' : 'Memuat daftar penguji...'}</option>}
          {pilihan && !kosong && <option value="">Antrian rombel: penguji yang bertugas mana pun</option>}
          {kosong && <option value="">Belum ada penguji yang sesuai</option>}
          {daftar.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nama}{u.jabatan ? `, ${u.jabatan}` : ''} ({u.beban} antrian)
            </option>
          ))}
        </select>
      </Field>
      {pilihan && !kosong && (
        <p className="-mt-2 mb-4 text-xs text-pramuka-600">
          {pilihan.sumber === 'rombel'
            ? `Yang tampil adalah penguji yang bertugas di rombel ${pilihan.rombel}. Pilih "Antrian rombel" agar penguji mana pun yang tersedia dapat mengambilnya.`
            : 'Rombel Anda belum diatur penguji khusus, jadi semua penguji yang sesuai dapat dipilih.'}
        </p>
      )}
      {kosong && (
        <p role="alert" className="-mt-2 mb-4 text-sm font-medium text-red-700">
          {pilihan.agamaButir
            ? 'Belum ada Pembina yang seagama dengan Anda. Hubungi Pembina: surat pengantar ke guru agama dapat diterbitkan agar butir ini bisa dinilai.'
            : 'Belum ada penguji yang dapat menguji butir ini untuk rombel Anda. Hubungi Admin Gudep.'}
        </p>
      )}
      {galatMuat && <p role="alert" className="-mt-2 mb-4 text-sm font-medium text-red-700">{galatMuat}</p>}

      <Field label="Catatan untuk penguji (opsional)" htmlFor="catatan">
        <textarea id="catatan" rows={3} className="input" value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Contoh: siap praktik di lapangan upacara" />
      </Field>

      {galat && <p role="alert" className="text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}
