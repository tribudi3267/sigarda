import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { fmtTanggal, hariIni } from '../lib/format';
import { perluSuratAgama, unitBisaDisurati } from '../lib/dokumenLogic';
import { FORMAT_SURAT_BAWAAN, KUNCI_FORMAT_SURAT, contohNomorSurat, nomorUrutBerikutnya, periksaFormatSurat } from '../lib/suratLogic';
import { labelUnit } from '../lib/verifikasiLogic';
import BuatSuratModal from './BuatSuratModal';
import { Field } from './ui';

/** Format nomor surat (Pembina dan Admin): mesin nomor yang sama dengan berita acara sidang, tanpa kode {tingkat}. */
function FormatNomorSurat() {
  const { pengaturan, dokumen, simpanPengaturan } = useApp();
  const tersimpan = typeof pengaturan?.[KUNCI_FORMAT_SURAT] === 'string' ? pengaturan[KUNCI_FORMAT_SURAT] : FORMAT_SURAT_BAWAAN;
  const [format, setFormat] = useState(tersimpan);
  const [sibuk, setSibuk] = useState(false);
  useEffect(() => { setFormat(tersimpan); }, [tersimpan]);
  const galat = periksaFormatSurat(format);
  const tanggal = hariIni();
  const contoh = galat ? '' : contohNomorSurat(format, nomorUrutBerikutnya(dokumen, tanggal.slice(0, 4)), tanggal);

  const simpan = async () => {
    if (galat || sibuk) return;
    setSibuk(true);
    await simpanPengaturan(KUNCI_FORMAT_SURAT, format.trim());
    setSibuk(false);
  };

  return (
    <details className="jahitan mt-3 rounded-lg bg-white px-4 py-3 text-sm">
      <summary className="cursor-pointer font-semibold text-pramuka-800">Format nomor surat</summary>
      <div className="mt-3 max-w-md">
        <Field label="Format" htmlFor="format-surat" bantuan="Kode: {no3} nomor urut 3 angka, {tahun}, {bulan}, {romawi}. Contoh: {no3}/SP/{tahun}">
          <input id="format-surat" className="input font-mono" maxLength={80} value={format} onChange={(e) => setFormat(e.target.value)} />
        </Field>
        {galat ? <p role="alert" className="mb-2 text-xs font-medium text-red-700">{galat}</p> : <p className="mb-2 text-xs text-pramuka-600">Contoh nomor berikutnya: <b>{contoh}</b></p>}
        <button className="btn btn-outline btn-sm" disabled={!!galat || sibuk || format.trim() === tersimpan} onClick={simpan}>{sibuk ? 'Menyimpan...' : 'Simpan format'}</button>
      </div>
    </details>
  );
}

/**
 * Kendali surat pengantar ke guru agama untuk satu Penegak (tidak ikut tercetak): daftar surat, buat surat, cabut, dan format nomor.
 * Surat yang dipilih (`terpilihId`) dicetak oleh halaman induk.
 */
export default function PanelSuratAgama({ peserta, terpilihId, setTerpilihId }) {
  const { users, progress, dokumen, bolehSurat, cabutDokumen } = useApp();
  const [buat, setBuat] = useState(false);
  const [cabut, setCabut] = useState(null); // { alasan, sibuk, galat }

  const daftar = useMemo(
    () => (dokumen ?? []).filter((d) => d.pesertaId === peserta.id).sort((a, b) => b.id - a.id),
    [dokumen, peserta.id]
  );
  const perlu = perluSuratAgama(users, peserta);
  const sisa = unitBisaDisurati(progress, dokumen, peserta).length;
  const terpilih = daftar.find((d) => d.id === terpilihId);

  const konfirmasiCabut = async () => {
    if (!cabut || cabut.sibuk) return;
    setCabut({ ...cabut, sibuk: true, galat: '' });
    const r = await cabutDokumen(terpilih.id, cabut.alasan);
    if (r.ok) setCabut(null);
    else setCabut({ ...cabut, sibuk: false, galat: r.pesan });
  };

  return (
    <div className="mt-3">
      {dokumen === null && <p className="text-sm text-pramuka-600" role="status">Memuat surat...</p>}

      {dokumen !== null && daftar.length === 0 && (
        <p className="jahitan rounded-lg bg-white px-4 py-3 text-sm text-pramuka-700">
          {perlu
            ? `Belum ada surat pengantar untuk ${peserta.nama}. Butir agama ${peserta.agama} dinilai Pembina yang seagama; karena belum ada, surat pengantar ke guru agama dapat dibuat oleh Pembina atau Admin Gudep.`
            : `Ada Pembina yang beragama ${peserta.agama}, sehingga butir agama dinilai Pembina tersebut dan surat pengantar tidak diperlukan.`}
        </p>
      )}

      {daftar.length > 0 && (
        <ul className="divide-y divide-pramuka-100 rounded-lg bg-white ring-1 ring-pramuka-200" aria-label="Surat pengantar">
          {daftar.map((d) => (
            <li key={d.id}>
              <button
                onClick={() => { setTerpilihId(d.id); setCabut(null); }}
                aria-pressed={d.id === terpilihId}
                className={`flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left text-sm sm:flex-row sm:items-center sm:gap-3 ${d.id === terpilihId ? 'bg-amber-50' : 'hover:bg-pramuka-50'}`}
              >
                <span className="font-semibold text-pramuka-900">{d.nomor}</span>
                <span className="text-xs text-pramuka-600">{fmtTanggal(d.tanggal)}, kepada {d.guru.nama}</span>
                <span className="min-w-0 text-xs text-pramuka-600 sm:ml-auto">{d.butir.map((id) => labelUnit(id)).join(', ')}</span>
                {d.dicabutPada && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-800 ring-1 ring-inset ring-red-300">Dicabut</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {bolehSurat && perlu && (
          <button className="btn btn-primary btn-sm" disabled={sisa === 0} title={sisa === 0 ? 'Semua butir agama sudah lulus atau sudah tercantum pada surat yang berlaku' : undefined} onClick={() => setBuat(true)}>
            Buat surat pengantar
          </button>
        )}
        {bolehSurat && terpilih && !terpilih.dicabutPada && !cabut && (
          <button className="btn btn-outline btn-sm" onClick={() => setCabut({ alasan: '', sibuk: false, galat: '' })}>Cabut surat terpilih</button>
        )}
      </div>

      {cabut && terpilih && (
        <div className="jahitan mt-3 max-w-md rounded-lg bg-white p-3">
          <Field label={`Alasan mencabut surat ${terpilih.nomor}`} htmlFor="cabut-alasan" bantuan="Tercatat di riwayat butir. Setelah dicabut, hasil butir tidak lagi dapat dicatat lewat surat ini.">
            <textarea id="cabut-alasan" rows={2} maxLength={200} className="input" value={cabut.alasan} onChange={(e) => setCabut({ ...cabut, alasan: e.target.value })} />
          </Field>
          {cabut.galat && <p role="alert" className="mb-2 text-sm font-medium text-red-700">{cabut.galat}</p>}
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" disabled={!cabut.alasan.trim() || cabut.sibuk} onClick={konfirmasiCabut}>{cabut.sibuk ? 'Mencabut...' : 'Cabut surat'}</button>
            <button className="btn btn-outline btn-sm" onClick={() => setCabut(null)}>Batal</button>
          </div>
        </div>
      )}

      {bolehSurat && <FormatNomorSurat />}

      {buat && (
        <BuatSuratModal
          peserta={peserta}
          onTutup={() => setBuat(false)}
          onTerbit={(hasil) => { setBuat(false); setTerpilihId(hasil.id); }}
        />
      )}
    </div>
  );
}
