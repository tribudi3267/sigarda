import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { GUDEP } from '../config';
import { hariIni } from '../lib/format';
import { unitBisaDisurati } from '../lib/dokumenLogic';
import { tahunAjaranKini } from '../lib/rombelLogic';
import { labelUnit } from '../lib/verifikasiLogic';
import { Field, Modal } from './ui';

const GURU_LAIN = 'lain';

/**
 * Pembina atau Admin menerbitkan surat pengantar ke guru agama untuk butir agama Penegak yang tidak punya Pembina seagama.
 * Surat dicetak untuk tanda tangan dan stempel basah; nomor dibuat otomatis (atau diisi manual).
 */
export default function BuatSuratModal({ peserta, onTutup, onTerbit }) {
  const { progress, dokumen, guruAgama, muatPenugasan, terbitkanSuratAgama } = useApp();
  useEffect(() => { muatPenugasan(tahunAjaranKini()); }, [muatPenugasan]); // daftar guru agama

  const unit = useMemo(() => unitBisaDisurati(progress, dokumen, peserta), [progress, dokumen, peserta]);
  const guruDaftar = useMemo(() => guruAgama.filter((g) => g.agama === peserta.agama), [guruAgama, peserta.agama]);

  const [pilih, setPilih] = useState(() => new Set(unit.map((p) => p.id))); // semua butir yang dapat disurati dicentang; Pembina mencabut centang yang tidak perlu
  const [guru, setGuru] = useState('');           // id guru terdaftar atau GURU_LAIN
  const [guruNama, setGuruNama] = useState('');
  const [tanggal, setTanggal] = useState(hariIni());
  const [penandaNama, setPenandaNama] = useState(GUDEP.pembina.nama);
  const [penandaJabatan, setPenandaJabatan] = useState(GUDEP.pembina.jabatan);
  const [nomorManual, setNomorManual] = useState('');
  const [catatan, setCatatan] = useState('');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);

  const guruTerpilih = guru || (guruDaftar[0] ? String(guruDaftar[0].id) : GURU_LAIN);
  const pakaiGuruLain = guruTerpilih === GURU_LAIN;

  const alih = (id) => setPilih((s) => { const b = new Set(s); if (b.has(id)) b.delete(id); else b.add(id); return b; });
  const bisaKirim = !sibuk && pilih.size > 0 && (!pakaiGuruLain || guruNama.trim()) && penandaNama.trim() && penandaJabatan.trim();

  const kirim = async () => {
    if (!bisaKirim) return;
    setSibuk(true);
    setGalat('');
    const r = await terbitkanSuratAgama({
      pesertaId: peserta.id, butir: unit.filter((p) => pilih.has(p.id)).map((p) => p.id),
      guruId: pakaiGuruLain ? null : Number(guruTerpilih), guruNama: pakaiGuruLain ? guruNama : '',
      tanggal, penerbit: GUDEP.nama, penandaNama, penandaJabatan, nomorManual, catatan,
    });
    setSibuk(false);
    if (r.ok) onTerbit?.(r.data);
    else setGalat(r.pesan);
  };

  const perTingkat = (tingkat) => unit.filter((p) => p.tingkat === tingkat);

  return (
    <Modal
      buka
      tutup={onTutup}
      judul="Buat surat pengantar ke guru agama"
      lebar="max-w-xl"
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup}>Batal</button>
          <button className="btn btn-primary" onClick={kirim} disabled={!bisaKirim}>{sibuk ? 'Menerbitkan...' : 'Terbitkan surat'}</button>
        </>
      }
    >
      <p className="mb-3 rounded-md bg-pramuka-50 px-3 py-2 text-sm text-pramuka-800">
        <b>{peserta.nama}</b> ({peserta.kelas}) beragama {peserta.agama}, dan belum ada Pembina yang seagama. Surat ini dicetak untuk
        <b> tanda tangan dan stempel basah</b>. Selama surat berlaku, Pembina dapat mencatat hasil butir yang dinilai guru agama.
      </p>

      <fieldset className="mb-4">
        <legend className="label">Butir agama yang dimohonkan</legend>
        {unit.length === 0 && <p className="text-sm text-pramuka-600">Semua butir agama sudah lulus atau sudah tercantum pada surat yang berlaku.</p>}
        {['Bantara', 'Laksana'].map((t) => perTingkat(t).length > 0 && (
          <div key={t} className="mb-2">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-pramuka-500">SKU {t}</p>
            <ul className="space-y-1">
              {perTingkat(t).map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1 h-4 w-4 accent-pramuka-800" checked={pilih.has(p.id)} onChange={() => alih(p.id)} />
                    <span><b>{labelUnit(p.id)}</b> {p.teks}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </fieldset>

      <Field label="Ditujukan kepada guru agama" htmlFor="surat-guru">
        <select id="surat-guru" className="input" value={guruTerpilih} onChange={(e) => setGuru(e.target.value)}>
          {guruDaftar.map((g) => <option key={g.id} value={g.id}>{g.nama}{g.keterangan ? `, ${g.keterangan}` : ''}</option>)}
          <option value={GURU_LAIN}>Guru lain (tulis namanya)</option>
        </select>
      </Field>
      {pakaiGuruLain && (
        <Field label="Nama guru agama" htmlFor="surat-guru-nama" bantuan={guruDaftar.length === 0 ? `Belum ada guru agama ${peserta.agama} terdaftar. Admin dapat mendaftarkannya di Anggota > Penugasan.` : undefined}>
          <input id="surat-guru-nama" className="input" maxLength={120} value={guruNama} onChange={(e) => setGuruNama(e.target.value)} />
        </Field>
      )}

      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Tanggal surat" htmlFor="surat-tanggal">
          <input id="surat-tanggal" type="date" className="input" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
        </Field>
        <Field label="Nomor surat (kosongkan = otomatis)" htmlFor="surat-nomor">
          <input id="surat-nomor" className="input" maxLength={80} value={nomorManual} onChange={(e) => setNomorManual(e.target.value)} placeholder="Otomatis" />
        </Field>
        <Field label="Penanda tangan" htmlFor="surat-ttd-nama">
          <input id="surat-ttd-nama" className="input" maxLength={120} value={penandaNama} onChange={(e) => setPenandaNama(e.target.value)} />
        </Field>
        <Field label="Jabatan penanda tangan" htmlFor="surat-ttd-jabatan">
          <input id="surat-ttd-jabatan" className="input" maxLength={80} value={penandaJabatan} onChange={(e) => setPenandaJabatan(e.target.value)} />
        </Field>
      </div>

      <Field label="Catatan pada surat (opsional)" htmlFor="surat-catatan">
        <textarea id="surat-catatan" rows={2} maxLength={300} className="input" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
      </Field>

      {galat && <p role="alert" className="text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}
