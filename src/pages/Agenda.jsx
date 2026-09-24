import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { JENIS_AGENDA, batasMusyawarah, hariMenuju, judulBawaanJenis, labelJenisAgenda, periksaAgenda } from '../lib/agendaLogic';
import { JENIS_USULAN, bolehIngatkan, labelJenisUsulan, periksaTinjauan, periksaUsulan, usulanMenunggu, usulanTerakhir } from '../lib/kegiatanLogic';
import { adalahPembina, tahunAjaranKini } from '../lib/rombelLogic';
import { pembinaAtauAdmin, pembinaSaja, pradanaAtauPradani } from '../lib/hakLogic';
import { fmtHariTanggal, fmtWaktu, hariIni } from '../lib/format';
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
  const pembina = pembinaSaja(user); // hanya Pembina (bukan Admin) yang boleh melewati batas Musyawarah: sigarda.pembina_saja

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

/** Formulir pengajuan (Pradana/Pradani) untuk satu usulan kegiatan (jenis sudah ditentukan lewat tombol baris yang diklik). */
function FormUsulan({ jenis, tahunAjaran, onTutup, onUsulkan }) {
  const [u, setU] = useState({ jenis, tahunAjaran, tanggalUsul: '', dokumenUrl: '', catatan: '' });
  const [dicoba, setDicoba] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galatKirim, setGalatKirim] = useState('');
  const galat = periksaUsulan(u);
  const adaGalat = Object.keys(galat).length > 0;

  const kirim = async (e) => {
    e.preventDefault();
    setDicoba(true);
    if (adaGalat || sibuk) return;
    setSibuk(true);
    setGalatKirim('');
    const r = await onUsulkan(u);
    setSibuk(false);
    if (r.ok) onTutup(); else setGalatKirim(r.pesan);
  };

  return (
    <Modal buka judul={`Usulkan ${labelJenisUsulan(jenis)}`} tutup={onTutup} aksi={
      <>
        <button type="button" className="btn btn-outline" onClick={onTutup} disabled={sibuk}>Batal</button>
        <button type="submit" form="form-usulan" className="btn btn-primary" disabled={sibuk}>{sibuk ? 'Mengajukan...' : 'Ajukan'}</button>
      </>
    }>
      <form id="form-usulan" onSubmit={kirim} noValidate className="space-y-1">
        <Field label="Tanggal usulan pelaksanaan" htmlFor="us-tanggal">
          <input id="us-tanggal" type="date" className={`input ${dicoba && galat.tanggalUsul ? 'border-red-500' : ''}`} value={u.tanggalUsul} onChange={(e) => setU((x) => ({ ...x, tanggalUsul: e.target.value }))} />
          {dicoba && galat.tanggalUsul && <p className="mt-1 text-xs font-medium text-red-700">{galat.tanggalUsul}</p>}
        </Field>
        <Field label="Tautan dokumen proposal (Google Drive)" htmlFor="us-url" bantuan={`Tautan berbagi Drive ke berkas proposal ${labelJenisUsulan(jenis)}.`}>
          <input id="us-url" type="url" className={`input ${dicoba && galat.dokumenUrl ? 'border-red-500' : ''}`} placeholder="https://drive.google.com/..." value={u.dokumenUrl} onChange={(e) => setU((x) => ({ ...x, dokumenUrl: e.target.value }))} />
          {dicoba && galat.dokumenUrl && <p className="mt-1 text-xs font-medium text-red-700">{galat.dokumenUrl}</p>}
        </Field>
        <Field label="Catatan tambahan (opsional)" htmlFor="us-catatan">
          <textarea id="us-catatan" className="input" rows={2} maxLength={500} value={u.catatan} onChange={(e) => setU((x) => ({ ...x, catatan: e.target.value }))} />
        </Field>
        {galatKirim && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{galatKirim}</p>}
      </form>
    </Modal>
  );
}

/** Modal tinjauan Pembina: setuju (catatan opsional) atau tolak (catatan wajib). */
function FormTinjauan({ usulan, onTutup, onTinjau }) {
  const [keputusan, setKeputusan] = useState(null); // 'disetujui' | 'ditolak'
  const [catatan, setCatatan] = useState('');
  const [dicoba, setDicoba] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galatKirim, setGalatKirim] = useState('');
  const galat = keputusan ? periksaTinjauan(keputusan, catatan) : {};

  const kirim = async () => {
    setDicoba(true);
    if (!keputusan || Object.keys(galat).length > 0 || sibuk) return;
    setSibuk(true);
    setGalatKirim('');
    const r = await onTinjau(usulan.id, keputusan, catatan);
    setSibuk(false);
    if (r.ok) onTutup(); else setGalatKirim(r.pesan);
  };

  return (
    <Modal buka judul={`Tinjau usulan ${labelJenisUsulan(usulan.jenis)}`} tutup={onTutup} aksi={
      <>
        <button type="button" className="btn btn-outline" onClick={onTutup} disabled={sibuk}>Batal</button>
        <button type="button" className="btn btn-primary" disabled={sibuk || !keputusan} onClick={kirim}>{sibuk ? 'Menyimpan...' : 'Kirim keputusan'}</button>
      </>
    }>
      <dl className="mb-4 space-y-1 text-sm">
        <div><dt className="inline font-semibold text-pramuka-900">Tanggal usulan: </dt><dd className="inline">{fmtHariTanggal(usulan.tanggalUsul)}</dd></div>
        <div><dt className="inline font-semibold text-pramuka-900">Diajukan oleh: </dt><dd className="inline">{usulan.diajukanOlehNama} ({fmtWaktu(usulan.diajukanPada)})</dd></div>
        <div><dt className="inline font-semibold text-pramuka-900">Dokumen: </dt><dd className="inline"><a href={usulan.dokumenUrl} target="_blank" rel="noreferrer" className="text-pramuka-700 underline">Buka proposal</a></dd></div>
        {usulan.catatan && <div><dt className="inline font-semibold text-pramuka-900">Catatan Dewan: </dt><dd className="inline">{usulan.catatan}</dd></div>}
      </dl>
      <div className="mb-3 flex gap-2">
        <button type="button" className={`btn flex-1 ${keputusan === 'disetujui' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setKeputusan('disetujui')}>Setujui</button>
        <button type="button" className={`btn flex-1 ${keputusan === 'ditolak' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setKeputusan('ditolak')}>Tolak</button>
      </div>
      {keputusan && (
        <Field label={keputusan === 'ditolak' ? 'Alasan penolakan (wajib)' : 'Catatan (opsional)'} htmlFor="us-catatan-tinjau">
          <textarea id="us-catatan-tinjau" className={`input ${dicoba && galat.catatan ? 'border-red-500' : ''}`} rows={2} maxLength={500} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
          {dicoba && galat.catatan && <p className="mt-1 text-xs font-medium text-red-700">{galat.catatan}</p>}
        </Field>
      )}
      {galatKirim && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{galatKirim}</p>}
    </Modal>
  );
}

/**
 * Usulan kegiatan (tahap L6b): alur resmi untuk Musyawarah Ambalan dan 10 kegiatan lain (JENIS_USULAN). Hanya Pradana/Pradani mengajukan,
 * hanya Pembina meninjau. Tampil hanya bagi pengurus (RLS membatasi baca ke pengurus juga, jadi Penegak biasa mendapat daftar kosong).
 * Satu baris per jenis: Pradana/Pradani melihat semua 11 (agar tahu jenis mana yang belum diajukan), Pembina hanya yang perlu perhatian
 * (menunggu ditinjau, atau riwayat penolakan).
 */
function UsulanKegiatan({ onDisetujui }) {
  const { user, api, notify } = useApp();
  const [daftar, setDaftar] = useState(null);
  const [jenisForm, setJenisForm] = useState(null);
  const [tinjau, setTinjau] = useState(null);
  const taKini = tahunAjaranKini();
  const pradanaPradani = pradanaAtauPradani(user);
  const pembina = adalahPembina(user);

  const muat = useCallback(async () => {
    const r = await api().muatUsulanKegiatan();
    if (r.ok) setDaftar(r.data);
  }, [api]);
  useEffect(() => { muat(); }, [muat]);

  if (!daftar || (!pradanaPradani && !pembina)) return null;
  const baris = JENIS_USULAN.map((j) => ({
    jenis: j, menunggu: usulanMenunggu(daftar, taKini, j.id), terakhir: usulanTerakhir(daftar, taKini, j.id),
  })).filter((b) => b.menunggu || pradanaPradani || b.terakhir?.status === 'ditolak');
  if (baris.length === 0) return null;

  const usulkan = async (u) => {
    const r = await api().usulkanKegiatan(u);
    if (r.ok) { notify(`Usulan ${labelJenisUsulan(u.jenis)} diajukan.`); await muat(); }
    return r;
  };
  const tinjauKirim = async (id, keputusan, catatan) => {
    const r = await api().tinjauKegiatan(id, keputusan, catatan);
    if (r.ok) { notify(keputusan === 'disetujui' ? 'Usulan disetujui.' : 'Usulan ditolak.'); await muat(); if (keputusan === 'disetujui') onDisetujui?.(); }
    return r;
  };
  const ingatkan = async (id) => {
    const r = await api().ingatkanKegiatan(id);
    if (r.ok) notify('Pembina diingatkan.'); else notify(r.pesan);
  };

  return (
    <section className="panel mb-4 space-y-3 p-4" aria-labelledby="usulan-kegiatan">
      <h2 id="usulan-kegiatan" className="text-base font-bold text-pramuka-900">Usulan kegiatan {taKini}</h2>
      <ul className="space-y-2">
        {baris.map(({ jenis, menunggu, terakhir }) => (
          <li key={jenis.id} className="rounded-lg border border-pramuka-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-pramuka-900">{jenis.label}</p>
              {pradanaPradani && !menunggu && <button className="btn btn-outline btn-sm" onClick={() => setJenisForm(jenis.id)}>+ Ajukan</button>}
            </div>
            {menunggu ? (
              <div className="mt-2 rounded-lg bg-amber-50 p-3 text-sm ring-1 ring-amber-300">
                <p>
                  <span className="font-semibold">Menunggu ditinjau:</span> tanggal {fmtHariTanggal(menunggu.tanggalUsul)}, diajukan {menunggu.diajukanOlehNama} ({fmtWaktu(menunggu.diajukanPada)}).
                  {' '}<a href={menunggu.dokumenUrl} target="_blank" rel="noreferrer" className="font-semibold text-pramuka-700 underline">Lihat dokumen</a>
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {pembina && <button className="btn btn-primary btn-sm" onClick={() => setTinjau(menunggu)}>Tinjau</button>}
                  {pradanaPradani && (
                    <button className="btn btn-outline btn-sm" disabled={!bolehIngatkan(menunggu.dipingPada)} onClick={() => ingatkan(menunggu.id)}>
                      Ingatkan Pembina
                    </button>
                  )}
                </div>
              </div>
            ) : (
              terakhir?.status === 'ditolak' && (
                <p className="mt-1 text-sm text-pramuka-700">
                  Usulan terakhir ({fmtHariTanggal(terakhir.tanggalUsul)}) <span className="font-semibold text-red-700">ditolak</span> oleh {terakhir.ditinjauOlehNama}: {terakhir.catatanTinjauan}
                </p>
              )
            )}
          </li>
        ))}
      </ul>
      {jenisForm && <FormUsulan jenis={jenisForm} tahunAjaran={taKini} onTutup={() => setJenisForm(null)} onUsulkan={usulkan} />}
      {tinjau && <FormTinjauan usulan={tinjau} onTutup={() => setTinjau(null)} onTinjau={tinjauKirim} />}
    </section>
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
  const bolehKelola = pembinaAtauAdmin(user);

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
      <UsulanKegiatan onDisetujui={muat} />
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
