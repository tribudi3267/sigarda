import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import useInstrumen from '../hooks/useInstrumen';
import { NILAI } from '../config';
import { hitungSkorInstrumen } from '../lib/instrumenLogic';
import { getEntry } from '../lib/skuLogic';
import { hariIni } from '../lib/format';
import InstrumenNilai from './InstrumenNilai';
import { Badge, Field, Modal, TeksPoin } from './ui';

const PILIHAN = [
  { id: 'lulus', label: 'Lulus', bantuan: 'Poin terpenuhi. Kode verifikasi digital dibuat otomatis.' },
  { id: 'ulang', label: 'Perlu diulang', bantuan: 'Wajib memberi catatan perbaikan untuk peserta.' },
  { id: 'proses', label: 'Mulai uji', bantuan: 'Tandai sedang diuji, hasil dicatat menyusul.' },
  { id: 'reset', label: 'Kembalikan ke belum diuji', bantuan: 'Membatalkan status sebelumnya. Wajib memberi alasan.' },
];
const PILIHAN_INSTRUMEN = [
  { id: 'nilai', label: 'Nilai dengan instrumen', bantuan: 'Beri nilai 1-5 pada tiap kriteria. Skor dan saran hasil dihitung otomatis.' },
  PILIHAN[2],
  PILIHAN[3],
];

function IsiUji({ pesertaId, poin, instr, pengaturan, onTutup }) {
  const { users, progress, catatHasil } = useApp();
  const peserta = users.find((u) => u.id === pesertaId);
  const entry = getEntry(progress, pesertaId, poin.id);

  const [hasil, setHasil] = useState(entry.status === 'lulus' ? 'reset' : instr ? 'nilai' : 'lulus');
  const [tanggalUji, setTanggalUji] = useState(entry.tanggalUji ?? hariIni());
  const [nilai, setNilai] = useState(entry.nilai ?? NILAI[1]);
  const [nilaiKriteria, setNilaiKriteria] = useState({});
  const [hasilPilih, setHasilPilih] = useState(null); // null = ikuti saran
  const [catatan, setCatatan] = useState('');
  const [pin, setPin] = useState('');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);

  const hit = useMemo(() => (instr ? hitungSkorInstrumen(instr.kriteria, nilaiKriteria, pengaturan) : null), [instr, nilaiKriteria, pengaturan]);
  const mode = hasil === 'nilai';
  const hasilAkhir = mode ? (hasilPilih ?? hit?.saran ?? null) : hasil;
  const beda = mode && hit?.lengkap && hasilAkhir !== hit.saran;

  const pilihan = (instr ? PILIHAN_INSTRUMEN : PILIHAN).filter((p) => p.id !== 'reset' || entry.status !== 'belum');
  const perluCatatan = hasilAkhir === 'ulang' || hasilAkhir === 'reset' || beda;
  const bisaSimpan = pin.length === 6 && !sibuk && (!mode || hit?.lengkap);

  const simpan = async () => {
    if (sibuk) return;
    if (mode && beda && !catatan.trim()) {
      setGalat(`Hasil yang dipilih berbeda dari saran (skor ${hit.skor}, saran: ${hit.saran === 'lulus' ? 'lulus' : 'perlu diulang'}). Isi catatan alasannya.`);
      return;
    }
    if (mode && hasilAkhir === 'ulang' && !catatan.trim()) {
      setGalat('Isi catatan agar peserta tahu bagian yang perlu diperbaiki.');
      return;
    }
    setSibuk(true);
    setGalat('');
    const dasar = { pesertaId, skuId: poin.id, catatan, pin };
    const r = await catatHasil(mode
      ? { ...dasar, hasil: hasilAkhir, tanggalUji, nilai: null, rincian: instr.kriteria.map((k) => ({ kriteria_id: k.id, nilai: nilaiKriteria[k.id] })) }
      : { ...dasar, hasil, tanggalUji: hasil === 'reset' ? null : tanggalUji, nilai: hasil === 'lulus' ? nilai : null });
    setSibuk(false);
    if (r.ok) onTutup();
    else {
      setGalat(r.pesan);
      setPin('');
    }
  };

  return (
    <Modal
      buka
      tutup={onTutup}
      judul="Penilaian poin SKU"
      lebar={instr ? 'max-w-2xl' : 'max-w-lg'}
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup}>Batal</button>
          <button className="btn btn-primary" onClick={simpan} disabled={!bisaSimpan}>
            {sibuk ? 'Memverifikasi...' : 'Simpan dan verifikasi'}
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
        <legend className="label">{instr ? 'Cara mencatat' : 'Hasil pengujian'}</legend>
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

      {mode && (
        <>
          <InstrumenNilai instr={instr} pengaturan={pengaturan} nilai={nilaiKriteria} ubahNilai={setNilaiKriteria} hit={hit} />
          {hit.lengkap && (
            <fieldset className="mb-4">
              <legend className="label">Hasil yang dicatat</legend>
              <div className="flex flex-wrap gap-2">
                {[['lulus', 'Lulus'], ['ulang', 'Perlu diulang']].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={hasilAkhir === id}
                    onClick={() => setHasilPilih(id === hit.saran ? null : id)}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-inset ${
                      hasilAkhir === id ? 'bg-pramuka-800 text-pramuka-50 ring-pramuka-800' : 'bg-white text-pramuka-700 ring-pramuka-300 hover:bg-pramuka-100'
                    }`}
                  >
                    {label}{id === hit.saran ? ' (saran)' : ''}
                  </button>
                ))}
              </div>
              {beda && <p className="mt-1.5 text-xs font-semibold text-amber-800">Berbeda dari saran. Catatan alasan wajib diisi dan tercatat di riwayat.</p>}
            </fieldset>
          )}
        </>
      )}

      {hasil === 'lulus' && (
        <Field label="Predikat" htmlFor="nilai">
          <select id="nilai" className="input" value={nilai} onChange={(e) => setNilai(e.target.value)}>
            {NILAI.map((n) => <option key={n}>{n}</option>)}
          </select>
        </Field>
      )}

      <Field
        label={hasil === 'reset' ? 'Alasan pembatalan' : beda ? 'Catatan alasan (wajib)' : perluCatatan ? 'Catatan perbaikan' : 'Catatan penguji (opsional)'}
        htmlFor="catatan-uji"
      >
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

/** Penguji menilai satu poin. PIN penguji berfungsi sebagai verifikasi digital. Butir berinstrumen ditetapkan dinilai lewat instrumen. */
export default function UjiModal({ pesertaId, poin, onTutup }) {
  const { instrumen, siap, pengaturan } = useInstrumen();
  if (!siap) {
    return (
      <Modal buka tutup={onTutup} judul="Penilaian poin SKU" aksi={<button className="btn btn-outline" onClick={onTutup}>Batal</button>}>
        <div role="status" aria-live="polite" className="py-6 text-center text-sm text-pramuka-600">Menyiapkan lembar penilaian...</div>
      </Modal>
    );
  }
  const instr = instrumen[poin.id]?.status === 'ditetapkan' && instrumen[poin.id].kriteria.length ? instrumen[poin.id] : null;
  return <IsiUji pesertaId={pesertaId} poin={poin} instr={instr} pengaturan={pengaturan} onTutup={onTutup} />;
}
