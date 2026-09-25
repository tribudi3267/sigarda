import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { fmtTanggal, hariIni } from '../lib/format';
import { MAKS_ANGGOTA_TIM, UNSUR_TIM, UNTUK_TIM, labelUnsur, labelUntuk, peringatanTim, periksaTim } from '../lib/timLogic';
import { Field, Modal } from './ui';

const BARIS_BAWAAN = [
  { nama: '', unsur: 'ketua_gudep', jabatan: 'ketua', keterangan: '' },
  { nama: '', unsur: 'pembina', jabatan: 'anggota', keterangan: '' },
  { nama: '', unsur: 'andalan_ranting', jabatan: 'anggota', keterangan: '' },
  { nama: '', unsur: 'tokoh_masyarakat', jabatan: 'anggota', keterangan: '' },
  { nama: '', unsur: 'orang_tua', jabatan: 'anggota', keterangan: '' },
];

/** Catat atau ubah satu tim penilai beserta anggotanya (Pembina dan Admin). Baris anggota yang namanya kosong diabaikan saat menyimpan. */
function ModalTim({ awal, untuk, tahunAjaran, onTutup, onSelesai }) {
  const { api, notify } = useApp();
  const [nomorSk, setNomorSk] = useState(awal?.nomorSk ?? '');
  const [tanggalSk, setTanggalSk] = useState(awal?.tanggalSk ?? '');
  const [skUrl, setSkUrl] = useState(awal?.skUrl ?? '');
  const [catatan, setCatatan] = useState(awal?.catatan ?? '');
  const [anggota, setAnggota] = useState(awal ? awal.anggota.map(({ nama, unsur, jabatan, keterangan }) => ({ nama, unsur, jabatan, keterangan })) : BARIS_BAWAAN);
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const ubah = (i, kunci, nilai) => setAnggota((a) => a.map((x, k) => (k === i ? { ...x, [kunci]: nilai } : x)));
  const jadikanKetua = (i) => setAnggota((a) => a.map((x, k) => ({ ...x, jabatan: k === i ? 'ketua' : 'anggota' })));

  const simpan = async () => {
    const isi = anggota.filter((x) => x.nama.trim());
    const nilai = { tahunAjaran, untuk, nomorSk, tanggalSk: tanggalSk || null, skUrl, catatan, anggota: isi };
    const pesan = periksaTim(nilai);
    if (pesan) { setGalat(pesan); return; }
    setSibuk(true);
    setGalat('');
    const r = await api().simpanTimPenilai({ ...nilai, id: awal?.id ?? null });
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); return; }
    notify(`Tim penilai ${labelUntuk(untuk).toLowerCase()} disimpan.`);
    onSelesai();
  };

  return (
    <Modal
      buka
      tutup={onTutup}
      judul={`${awal ? 'Ubah' : 'Catat'} tim penilai ${labelUntuk(untuk).toLowerCase()}`}
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup} disabled={sibuk}>Batal</button>
          <button className="btn btn-primary" onClick={simpan} disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
        </>
      }
    >
      <p className="mb-3 text-xs text-pramuka-600">Tahun ajaran {tahunAjaran}. Tim putra menilai Calon putra dan tim putri menilai Calon putri. Isi nomor dan tanggal SK Kwarcab bila sudah terbit (keduanya berpasangan).</p>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Nomor SK Kwarcab" htmlFor="tm-nomor"><input id="tm-nomor" className="input" maxLength={80} value={nomorSk} onChange={(e) => setNomorSk(e.target.value)} /></Field>
        <Field label="Tanggal SK" htmlFor="tm-tgl"><input id="tm-tgl" type="date" className="input" max={hariIni()} value={tanggalSk} onChange={(e) => setTanggalSk(e.target.value)} /></Field>
      </div>
      <Field label="Tautan SK (opsional)" htmlFor="tm-url" bantuan="Alamat berkas SK berawalan https://. Dokumen tidak disimpan di aplikasi."><input id="tm-url" className="input" maxLength={500} value={skUrl} onChange={(e) => setSkUrl(e.target.value)} placeholder="https://" /></Field>
      <fieldset className="mb-3">
        <legend className="mb-1 text-sm font-semibold">Anggota tim ({anggota.filter((x) => x.nama.trim()).length} terisi)</legend>
        <ul className="space-y-2">
          {anggota.map((a, i) => (
            <li key={i} className="rounded-md border border-pramuka-200 p-2">
              <div className="grid gap-2 sm:grid-cols-[1.4fr_1.2fr]">
                <input className="input" aria-label={`Nama anggota ${i + 1}`} placeholder="Nama (dengan gelar bila ada)" maxLength={80} value={a.nama} onChange={(e) => ubah(i, 'nama', e.target.value)} />
                <select className="input" aria-label={`Unsur anggota ${i + 1}`} value={a.unsur} onChange={(e) => ubah(i, 'unsur', e.target.value)}>
                  {UNSUR_TIM.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                </select>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <input className="input min-w-0 flex-1" aria-label={`Keterangan anggota ${i + 1}`} placeholder="Keterangan (opsional), mis. ayah dari Calon" maxLength={120} value={a.keterangan} onChange={(e) => ubah(i, 'keterangan', e.target.value)} />
                <label className="inline-flex items-center gap-1 text-xs"><input type="radio" name="tm-ketua" checked={a.jabatan === 'ketua'} onChange={() => jadikanKetua(i)} /> Ketua tim</label>
                <button type="button" className="text-xs font-semibold text-red-700 underline underline-offset-2" onClick={() => setAnggota((x) => x.filter((_, k) => k !== i))}>Hapus baris</button>
              </div>
            </li>
          ))}
        </ul>
        {anggota.length < MAKS_ANGGOTA_TIM && (
          <button type="button" className="btn btn-outline btn-sm mt-2" onClick={() => setAnggota((a) => [...a, { nama: '', unsur: 'lainnya', jabatan: 'anggota', keterangan: '' }])}>Tambah anggota</button>
        )}
      </fieldset>
      <Field label="Catatan (opsional)" htmlFor="tm-cat"><input id="tm-cat" className="input" maxLength={300} value={catatan} onChange={(e) => setCatatan(e.target.value)} /></Field>
      {galat && <p role="alert" className="text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}

/** Tim penilai putra dan putri pada satu tahun ajaran. */
export default function TimPenilaiPanel({ data, tahunAjaran, boleh }) {
  const { api, notify } = useApp();
  const [modal, setModal] = useState(null);
  const hapus = async (t) => {
    const r = await api().hapusTimPenilai(t.id);
    if (!r.ok) { notify(r.pesan, 'err'); return; }
    notify(`Tim penilai ${labelUntuk(t.untuk).toLowerCase()} dihapus.`);
    data.muat();
  };
  return (
    <section aria-label="Tim penilai" className="space-y-4">
      <p className="text-sm text-pramuka-600">Tim penilai dibentuk dengan SK Kwarcab dan dipisah untuk putra dan putri (pedoman Kwarcab Purbalingga 2026). Komposisi yang belum lengkap hanya diperingatkan.</p>
      {UNTUK_TIM.map(({ id: untuk }) => {
        const t = data.tim.find((x) => x.tahunAjaran === tahunAjaran && x.untuk === untuk) ?? null;
        const w = t ? peringatanTim(t) : [];
        return (
          <div key={untuk} className="panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-bold">Tim penilai {labelUntuk(untuk).toLowerCase()}</h2>
              {boleh && (
                <span className="flex gap-2">
                  <button className="btn btn-outline btn-sm" onClick={() => setModal({ untuk, awal: t })}>{t ? 'Ubah' : 'Catat tim'}</button>
                  {t && <button className="btn btn-outline btn-sm text-red-700" onClick={() => hapus(t)}>Hapus</button>}
                </span>
              )}
            </div>
            {!t ? (
              <p className="mt-2 text-sm text-pramuka-600">Belum ada tim penilai {labelUntuk(untuk).toLowerCase()} untuk tahun ajaran {tahunAjaran}.</p>
            ) : (
              <>
                <p className="mt-1 text-sm text-pramuka-700">
                  {t.nomorSk ? `SK ${t.nomorSk}, ${fmtTanggal(t.tanggalSk)}` : 'Nomor SK belum dicatat'}
                  {t.skUrl && <> · <a className="font-semibold underline underline-offset-2" href={t.skUrl} target="_blank" rel="noreferrer noopener">Buka SK</a></>}
                </p>
                <ol className="mt-3 divide-y divide-pramuka-100 text-sm">
                  {t.anggota.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
                      <span className="w-5 text-pramuka-500">{a.urut}</span>
                      <span className="min-w-0 flex-1 font-medium">{a.nama}{a.jabatan === 'ketua' && <span className="ml-2 rounded bg-pramuka-800 px-1.5 py-0.5 text-xs font-semibold text-pramuka-50">Ketua tim</span>}</span>
                      <span className="text-xs text-pramuka-600">{labelUnsur(a.unsur)}{a.keterangan ? `, ${a.keterangan}` : ''}</span>
                    </li>
                  ))}
                </ol>
                {t.catatan && <p className="mt-2 text-xs text-pramuka-600">Catatan: {t.catatan}</p>}
                {w.length > 0 && (
                  <ul className="mt-3 list-disc rounded-md bg-amber-50 py-2 pl-7 pr-3 text-xs text-amber-950">
                    {w.map((x) => <li key={x}>{x}</li>)}
                  </ul>
                )}
              </>
            )}
          </div>
        );
      })}
      {modal && <ModalTim awal={modal.awal} untuk={modal.untuk} tahunAjaran={tahunAjaran} onTutup={() => setModal(null)} onSelesai={() => { setModal(null); data.muat(); }} />}
    </section>
  );
}
