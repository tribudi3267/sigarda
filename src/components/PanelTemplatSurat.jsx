import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { INDEKS_SURAT, PITA_BAWAAN, SURAT_GURU } from '../data/suratGuruData';
import { formDariIsi, isiDariForm, periksaTemplat, templatBerlaku } from '../lib/suratGuruLogic';
import { Field, Modal } from './ui';

/**
 * Panel Templat surat keterangan guru (Pembina dan Admin): rubrik tiap surat disimpan per tahun ajaran di basis data (BUKAN di repositori) dan dipakai cetak Portofolio
 * format Kwarcab. Tahun ajaran tanpa templat memakai templat tahun ajaran sebelumnya; menyimpan membuat salinan untuk tahun ajaran ini. `daftar` = hasil useTemplatDokumen().
 */
export default function PanelTemplatSurat({ daftar, tahunAjaran }) {
  const { api, notify } = useApp();
  const [jenis, setJenis] = useState(null);
  const [f, setF] = useState({ uji: '', rubrik: '', pita: ['', '', ''] });
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);

  const buka = (id) => {
    const b = templatBerlaku(daftar.templat, tahunAjaran, id);
    setF(formDariIsi(b?.templat.isi));
    setGalat('');
    setJenis(id);
  };
  const tutup = () => { if (!sibuk) setJenis(null); };
  const simpan = async () => {
    const isi = isiDariForm(f);
    const p = periksaTemplat({ tahunAjaran, jenis, isi });
    if (p) { setGalat(p); return; }
    setSibuk(true);
    const r = await api().simpanTemplatDokumen({ tahunAjaran, jenis, isi });
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); return; }
    notify('Templat surat tersimpan.');
    setJenis(null);
    await daftar.muat();
  };
  const hapus = async () => {
    const ada = daftar.templat.find((t) => t.tahunAjaran === tahunAjaran && t.jenis === jenis);
    if (!ada) return;
    if (!window.confirm('Hapus templat tahun ajaran ini? Surat akan memakai templat tahun ajaran sebelumnya (bila ada).')) return;
    setSibuk(true);
    const r = await api().hapusTemplatDokumen(ada.id);
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); return; }
    notify('Templat dihapus.');
    setJenis(null);
    await daftar.muat();
  };

  const status = (id) => {
    const b = templatBerlaku(daftar.templat, tahunAjaran, id);
    if (!b) return { teks: 'Belum diisi (baris kosong untuk ditulis tangan)', kelas: 'text-amber-800' };
    return b.warisan
      ? { teks: `Memakai templat ${b.templat.tahunAjaran} (${b.templat.isi.baris.length} baris)`, kelas: 'text-pramuka-600' }
      : { teks: `Terisi untuk ${tahunAjaran} (${b.templat.isi.baris.length} baris)`, kelas: 'text-emerald-800' };
  };

  return (
    <details className="no-print panel mb-4 p-4">
      <summary className="cursor-pointer select-none text-sm font-bold text-pramuka-900">Templat surat keterangan guru ({tahunAjaran})</summary>
      <p className="mt-2 text-xs text-pramuka-600">
        Rubrik (uraian yang diuji dan pita nilai) diisi di sini dari lembar Kwarcab dan disimpan di basis data, tidak di kode. Berlaku per tahun ajaran; tahun ajaran baru otomatis
        memakai templat tahun sebelumnya sampai Anda menyimpan yang baru.
      </p>
      {daftar.galat && <p role="alert" className="mt-2 text-xs text-red-700">{daftar.galat}</p>}
      <ul className="mt-3 divide-y divide-pramuka-100 text-sm">
        {SURAT_GURU.map((s) => {
          const st = status(s.id);
          return (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="font-semibold">{s.judul} <span className="text-xs font-normal text-pramuka-500">(butir SPG {s.spg})</span></p>
                <p className={`text-xs ${st.kelas}`}>{st.teks}</p>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => buka(s.id)}>Isi / ubah</button>
            </li>
          );
        })}
      </ul>

      <Modal
        buka={!!jenis}
        tutup={tutup}
        judul={jenis ? `Templat: ${INDEKS_SURAT[jenis].judul}` : ''}
        lebar="max-w-2xl"
        aksi={(
          <>
            {jenis && daftar.templat.some((t) => t.tahunAjaran === tahunAjaran && t.jenis === jenis) && <button type="button" className="btn btn-outline text-red-700" disabled={sibuk} onClick={hapus}>Hapus templat {tahunAjaran}</button>}
            <button type="button" className="btn btn-outline" disabled={sibuk} onClick={tutup}>Batal</button>
            <button type="button" className="btn btn-primary" disabled={sibuk} onClick={simpan}>{sibuk ? 'Menyimpan...' : `Simpan untuk ${tahunAjaran}`}</button>
          </>
        )}
      >
        {jenis && (
          <>
            <Field label="Topik uji (opsional)" htmlFor="t-uji" bantuan={`Melanjutkan kalimat "Telah selesai menempuh uji ...". Kosong = "${INDEKS_SURAT[jenis].ujiBawaan}".`}>
              <input id="t-uji" className="input" maxLength={200} value={f.uji} onChange={(e) => setF({ ...f, uji: e.target.value })} />
            </Field>
            <Field label="Rubrik (satu uraian per baris)" htmlFor="t-rubrik" bantuan='Salin dari lembar Kwarcab. Baris berawalan "# " menjadi judul kelompok (mis. "# Ms Office Word"). Maksimal 40 baris, 300 karakter per baris.'>
              <textarea id="t-rubrik" className="input min-h-[12rem]" value={f.rubrik} onChange={(e) => setF({ ...f, rubrik: e.target.value })} />
            </Field>
            <Field label="Pita nilai (opsional)" htmlFor="t-pita-0" bantuan={`Tiga judul kolom nilai. Kosong = ${PITA_BAWAAN.join(' / ')}. Mis. "Cukup 60 - 70", "Baik 70 - 85", "Sangat Baik 85 - 100" (maksimal 20 karakter).`}>
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((i) => (
                  <input key={i} id={`t-pita-${i}`} className="input" maxLength={20} placeholder={PITA_BAWAAN[i]} value={f.pita[i]} onChange={(e) => setF({ ...f, pita: f.pita.map((x, j) => (j === i ? e.target.value : x)) })} />
                ))}
              </div>
            </Field>
            {galat && <p role="alert" className="text-sm font-medium text-red-700">{galat}</p>}
          </>
        )}
      </Modal>
    </details>
  );
}
