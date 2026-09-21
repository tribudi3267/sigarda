import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Field, Modal, TeksPoin } from './ui';

/** Pembina mengalihkan satu pengajuan ke penguji lain (atau ke antrian rombel). Daftar tujuan dihitung server; alasan tercatat di riwayat. */
export default function AlihkanModal({ peserta, poin, entry, onTutup }) {
  const { pengujiPilihan, alihkanPengajuan } = useApp();
  const [pilihan, setPilihan] = useState(null);
  const [galatMuat, setGalatMuat] = useState('');
  const [tujuan, setTujuan] = useState('');
  const [alasan, setAlasan] = useState('');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    let batal = false;
    pengujiPilihan(poin.id, peserta.id).then((r) => {
      if (batal) return;
      if (r.ok) setPilihan(r.data);
      else setGalatMuat(r.pesan ?? 'Daftar penguji tidak dapat dimuat.');
    });
    return () => { batal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poin.id, peserta.id]);

  // Yang sedang memegang pengajuan tidak perlu ditawarkan; antrian rombel hanya untuk yang belum mulai diuji.
  const daftar = (pilihan?.penguji ?? []).filter((u) => u.id !== entry.pengujiId);
  const bolehAntrian = entry.status === 'diajukan' && !!entry.pengujiId;
  const tanpaTujuan = pilihan && daftar.length === 0 && !bolehAntrian;
  const tujuanAwal = tujuan || (bolehAntrian ? '' : daftar[0]?.id ?? '');
  const bisaKirim = !sibuk && !!pilihan && !tanpaTujuan && alasan.trim().length > 0 && (bolehAntrian || !!tujuanAwal);

  const kirim = async () => {
    if (!bisaKirim) return;
    setSibuk(true);
    setGalat('');
    const r = await alihkanPengajuan({ pesertaId: peserta.id, skuId: poin.id, pengujiId: tujuanAwal || null, alasan: alasan.trim() });
    setSibuk(false);
    if (r.ok) onTutup();
    else setGalat(r.pesan);
  };

  return (
    <Modal
      buka
      tutup={onTutup}
      judul="Alihkan pengajuan"
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup}>Batal</button>
          <button className="btn btn-primary" onClick={kirim} disabled={!bisaKirim}>{sibuk ? 'Mengalihkan...' : 'Alihkan'}</button>
        </>
      }
    >
      <div className="mb-4 rounded-md bg-pramuka-50 px-3 py-2 text-pramuka-800">
        <p className="text-sm font-semibold text-pramuka-900">{peserta.nama}{peserta.kelas ? `, ${peserta.kelas}` : ''}</p>
        <TeksPoin poin={poin} />
      </div>

      <Field label="Alihkan kepada" htmlFor="alihkan-tujuan">
        <select id="alihkan-tujuan" className="input" value={tujuanAwal} onChange={(e) => setTujuan(e.target.value)} disabled={!pilihan || tanpaTujuan}>
          {!pilihan && <option value="">{galatMuat ? 'Daftar penguji tidak tersedia' : 'Memuat daftar penguji...'}</option>}
          {pilihan && bolehAntrian && <option value="">Antrian rombel: penguji yang bertugas mana pun</option>}
          {tanpaTujuan && <option value="">Tidak ada penguji lain yang sesuai</option>}
          {daftar.map((u) => (
            <option key={u.id} value={u.id}>{u.nama}{u.jabatan_dewan ? `, ${u.jabatan_dewan} Dewan Ambalan` : u.jabatan ? `, ${u.jabatan}` : ''} ({u.beban} antrian)</option>
          ))}
        </select>
      </Field>

      <Field label="Alasan pengalihan (wajib)" htmlFor="alihkan-alasan" bantuan="Tercatat di riwayat butir ini, mis. penguji berhalangan atau sedang dinas.">
        <textarea id="alihkan-alasan" rows={2} maxLength={200} className="input" value={alasan} onChange={(e) => setAlasan(e.target.value)} />
      </Field>

      {galatMuat && <p role="alert" className="text-sm font-medium text-red-700">{galatMuat}</p>}
      {galat && <p role="alert" className="text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}
