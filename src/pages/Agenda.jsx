import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { JENIS_AGENDA, batasMusyawarah, hariMenuju, judulBawaanJenis, labelJenisAgenda, periksaAgenda } from '../lib/agendaLogic';
import { tahunAjaranKini } from '../lib/rombelLogic';
import { fmtHariTanggal, hariIni } from '../lib/format';
import { Field, Icon, Kosong, Modal } from '../components/ui';

const BARU = { tahunAjaran: tahunAjaranKini(), jenis: 'musyawarah', judul: judulBawaanJenis('musyawarah'), tanggal: '', keterangan: '', pesertaTerkait: [], lewatiBatas: false };

/** Pencarian + daftar centang Penegak aktif, untuk "peserta terkait" (opsional: calon sidang/pelantikan yang ikut diberi tahu). */
function PilihPesertaTerkait({ nilai, onUbah }) {
  const { users } = useApp();
  const [cari, setCari] = useState('');
  const [buka, setBuka] = useState(nilai.length > 0);
  const semua = useMemo(
    () => users.filter((u) => u.role === 'peserta' && (u.status ?? 'aktif') === 'aktif').sort((a, b) => (a.kelas ?? '').localeCompare(b.kelas ?? '', 'id', { numeric: true }) || a.nama.localeCompare(b.nama, 'id')),
    [users]
  );
  const kata = cari.trim().toLowerCase();
  const tampil = kata ? semua.filter((u) => `${u.nama} ${u.kelas ?? ''} ${u.sangga ?? ''}`.toLowerCase().includes(kata)) : semua;
  const alih = (id) => onUbah(nilai.includes(id) ? nilai.filter((x) => x !== id) : [...nilai, id]);

  if (!buka) {
    return (
      <button type="button" className="text-sm font-semibold text-pramuka-700 underline underline-offset-2" onClick={() => setBuka(true)}>
        + Tandai Penegak terkait (opsional, {nilai.length > 0 ? `${nilai.length} dipilih` : 'mis. calon sidang/pelantikan'})
      </button>
    );
  }
  return (
    <Field label={`Penegak terkait (opsional, ${nilai.length} dipilih)`} bantuan="Ikut diberi tahu pengingat H-30/H-7/H-1, selain semua pengurus.">
      <input className="input mb-2" type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama, kelas, atau sangga" aria-label="Cari Penegak" />
      <ul className="max-h-48 divide-y divide-pramuka-100 overflow-y-auto rounded-lg border border-pramuka-200">
        {tampil.length === 0 && <li className="px-3 py-3 text-center text-sm text-pramuka-500">Tidak ada yang cocok.</li>}
        {tampil.map((u) => (
          <li key={u.id}>
            <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-pramuka-50">
              <input type="checkbox" className="h-4 w-4 accent-pramuka-800" checked={nilai.includes(u.id)} onChange={() => alih(u.id)} />
              {u.nama} <span className="text-xs text-pramuka-500">{[u.kelas, u.sangga].filter(Boolean).join(', ')}</span>
            </label>
          </li>
        ))}
      </ul>
    </Field>
  );
}

function EditorAgenda({ awal, onTutup, onSimpan }) {
  const { user } = useApp();
  const [a, setA] = useState(awal ?? BARU);
  const [dicoba, setDicoba] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galatKirim, setGalatKirim] = useState('');
  const pembina = user.role === 'penguji' && user.jabatan === 'Pembina';

  const ubah = (k, v) => setA((x) => ({ ...x, [k]: v }));
  const galat = periksaAgenda(a, pembina);
  const adaGalat = Object.keys(galat).length > 0;
  const batas = batasMusyawarah(a.tahunAjaran);

  const kirim = async (e) => {
    e.preventDefault();
    setDicoba(true);
    if (adaGalat || sibuk) return;
    setSibuk(true);
    setGalatKirim('');
    const r = await onSimpan(a);
    setSibuk(false);
    if (r.ok) onTutup(); else setGalatKirim(r.pesan);
  };

  return (
    <Modal buka judul={awal ? 'Ubah kegiatan agenda' : 'Tambah kegiatan agenda'} tutup={onTutup} aksi={
      <>
        <button type="button" className="btn btn-outline" onClick={onTutup} disabled={sibuk}>Batal</button>
        <button type="submit" form="form-agenda" className="btn btn-primary" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
      </>
    }>
      <form id="form-agenda" onSubmit={kirim} noValidate className="space-y-1">
        <Field label="Tahun ajaran" htmlFor="ag-ta" bantuan="Contoh: 2026/2027.">
          <input id="ag-ta" className={`input ${dicoba && galat.tahunAjaran ? 'border-red-500' : ''}`} value={a.tahunAjaran} onChange={(e) => ubah('tahunAjaran', e.target.value)} />
          {dicoba && galat.tahunAjaran && <p className="mt-1 text-xs font-medium text-red-700">{galat.tahunAjaran}</p>}
        </Field>
        <Field label="Jenis kegiatan" htmlFor="ag-jenis">
          <select id="ag-jenis" className="input" value={a.jenis} onChange={(e) => { ubah('jenis', e.target.value); if (!a.judul || JENIS_AGENDA.some((j) => j.judulBawaan === a.judul)) ubah('judul', judulBawaanJenis(e.target.value)); }}>
            {JENIS_AGENDA.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
          </select>
        </Field>
        <Field label="Judul" htmlFor="ag-judul">
          <input id="ag-judul" className={`input ${dicoba && galat.judul ? 'border-red-500' : ''}`} maxLength={120} value={a.judul} onChange={(e) => ubah('judul', e.target.value)} />
          {dicoba && galat.judul && <p className="mt-1 text-xs font-medium text-red-700">{galat.judul}</p>}
        </Field>
        <Field label="Tanggal" htmlFor="ag-tanggal" bantuan={a.jenis === 'musyawarah' && batas ? `Harus sebelum 1 Juli ${batas.slice(0, 4)}.` : undefined}>
          <input id="ag-tanggal" type="date" className={`input ${dicoba && galat.tanggal ? 'border-red-500' : ''}`} value={a.tanggal ?? ''} onChange={(e) => ubah('tanggal', e.target.value)} />
          {dicoba && galat.tanggal && <p className="mt-1 text-xs font-medium text-red-700">{galat.tanggal}</p>}
        </Field>
        {a.jenis === 'musyawarah' && pembina && (
          <label className="mb-3 flex cursor-pointer items-start gap-2 text-sm text-pramuka-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-pramuka-800" checked={a.lewatiBatas} onChange={(e) => ubah('lewatiBatas', e.target.checked)} />
            Lewati batas 1 Juli (Dewan Ambalan sudah mengusulkan ini kepada saya)
          </label>
        )}
        <Field label="Keterangan (opsional)" htmlFor="ag-ket">
          <textarea id="ag-ket" className="input" rows={2} maxLength={500} value={a.keterangan} onChange={(e) => ubah('keterangan', e.target.value)} />
        </Field>
        <PilihPesertaTerkait nilai={a.pesertaTerkait} onUbah={(v) => ubah('pesertaTerkait', v)} />
        {galatKirim && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{galatKirim}</p>}
      </form>
    </Modal>
  );
}

/**
 * Agenda tahunan (tahap L6): kegiatan Ambalan per tahun ajaran (Musyawarah Ambalan, Naik Kelas, Sidang, tiga pelantikan, atau bebas),
 * dengan pengingat otomatis H-30/H-7/H-1 (sigarda.agenda_proses). Semua yang sudah masuk dapat melihat; hanya Pembina dan Admin
 * dapat menambah/mengubah/menghapus (tombol disembunyikan bagi peran lain, hak ditegakkan server).
 */
export default function Agenda() {
  const { user, api, notify } = useApp();
  const [daftar, setDaftar] = useState(null);
  const [galat, setGalat] = useState('');
  const [editor, setEditor] = useState(null); // null = tertutup, {} = baru, objek = ubah
  const bolehKelola = user.role === 'admin' || (user.role === 'penguji' && user.jabatan === 'Pembina');

  const muat = useCallback(async () => {
    const r = await api().muatAgenda();
    if (r.ok) { setDaftar(r.data); setGalat(''); } else setGalat(r.pesan);
  }, [api]);
  useEffect(() => { muat(); }, [muat]);

  const simpan = async (a) => {
    const r = await api().simpanAgenda(a);
    if (r.ok) { notify('Agenda tersimpan.'); await muat(); }
    return r;
  };
  const hapus = async (id) => {
    if (!window.confirm('Hapus kegiatan agenda ini?')) return;
    const r = await api().hapusAgenda(id);
    if (r.ok) { notify('Agenda dihapus.'); await muat(); } else notify(r.pesan);
  };

  const hari = hariIni();

  return (
    <div className="animasi-naik">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Agenda</h1>
          <p className="text-sm text-pramuka-600">Kegiatan tahunan Ambalan, dengan pengingat otomatis H-30, H-7, dan H-1.</p>
        </div>
        {bolehKelola && <button className="btn btn-primary" onClick={() => setEditor({})}>+ Tambah kegiatan</button>}
      </div>
      {galat && <p className="mb-4 text-sm text-red-700" role="alert">{galat}</p>}
      {daftar === null && !galat && <Kosong judul="Memuat agenda..." teks="Mengambil daftar kegiatan dari server." />}
      {daftar && daftar.length === 0 && <Kosong judul="Belum ada kegiatan agenda" teks={bolehKelola ? 'Tambahkan kegiatan tahunan lewat tombol di atas.' : 'Pembina atau Admin belum menambahkan kegiatan.'} />}
      {daftar && daftar.length > 0 && (
        <ul className="space-y-2">
          {daftar.map((a) => {
            const lewat = a.tanggal < hari;
            return (
              <li key={a.id} className={`panel flex flex-wrap items-center justify-between gap-2 p-3.5 ${lewat ? 'opacity-60' : ''}`}>
                <div className="min-w-0">
                  <p className="font-semibold text-pramuka-900">{a.judul}</p>
                  <p className="text-xs text-pramuka-500">
                    {labelJenisAgenda(a.jenis)} &middot; {fmtHariTanggal(a.tanggal)} &middot; {a.tahunAjaran}
                    {a.pesertaTerkait.length > 0 && ` · ${a.pesertaTerkait.length} Penegak terkait`}
                  </p>
                  {a.keterangan && <p className="mt-1 text-sm text-pramuka-700">{a.keterangan}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${lewat ? 'bg-pramuka-100 text-pramuka-600' : 'bg-emas/30 text-pramuka-900'}`}>{hariMenuju(a.tanggal, hari)}</span>
                  {bolehKelola && (
                    <>
                      <button className="rounded-md p-1.5 text-pramuka-600 hover:bg-pramuka-100" title="Ubah" onClick={() => setEditor(a)}><Icon nama="ubah" className="h-4 w-4" /></button>
                      <button className="rounded-md p-1.5 text-red-700 hover:bg-red-50" title="Hapus" onClick={() => hapus(a.id)}><Icon nama="hapus" className="h-4 w-4" /></button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {editor && <EditorAgenda awal={editor.id ? editor : null} onTutup={() => setEditor(null)} onSimpan={simpan} />}
    </div>
  );
}
