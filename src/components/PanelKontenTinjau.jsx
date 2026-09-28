import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { pembinaAtauAdmin } from '../lib/hakLogic';
import { bolehUbah, LABEL_STATUS } from '../lib/berandaKontenLogic';
import { waktuRelatif } from '../lib/notifikasiLogic';
import { Field, Kosong } from './ui';
import PratinjauSampul from './PratinjauSampul';

const KELAS_STATUS = { draf: 'bg-pramuka-100 text-pramuka-700', menunggu: 'bg-amber-100 text-amber-800', terbit: 'bg-emerald-100 text-emerald-800', ditolak: 'bg-red-100 text-red-800' };

function Pil({ status }) {
  return <span className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${KELAS_STATUS[status] ?? KELAS_STATUS.draf}`}>{LABEL_STATUS[status] ?? status}</span>;
}

/** Satu isian formulir menurut deklarasi skema.fields (lihat src/lib/berandaKontenSkema.js). */
function Isian({ f, nilai, ubah, galat }) {
  const id = `konten-${f.kunci}`;
  const umum = {
    id, value: nilai, placeholder: f.placeholder,
    onChange: (e) => ubah(f.kunci, f.jenis === 'number' ? e.target.valueAsNumber || '' : e.target.value),
    'aria-invalid': galat ? 'true' : undefined,
    className: `input ${galat ? 'border-red-500' : ''}`,
  };
  return (
    <Field label={f.label} htmlFor={id} bantuan={f.bantuan}>
      {f.jenis === 'textarea' ? <textarea rows={f.baris ?? 4} {...umum} />
        : f.jenis === 'select' ? <select {...umum}>{f.opsi.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        : <input type={f.jenis === 'number' ? 'number' : 'text'} {...umum} />}
      {galat && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{galat}</p>}
      {f.pratinjau && <PratinjauSampul nilai={nilai} rasio={f.pratinjau} />}
    </Field>
  );
}

/**
 * Tab Berita, Prestasi, atau Galeri pada Kelola Beranda (konfigurasi lewat `skema`, lihat src/lib/berandaKontenSkema.js). Ketiganya berbagi alur:
 * Dewan Ambalan menulis draf atau mengajukan ('menunggu'); Pembina dan Admin Gudep menerbitkan langsung atau meninjau pengajuan Dewan.
 * Hak ditegakkan server (586-aksi-beranda-konten.sql); tampilan ini hanya menyembunyikan tombol yang akan ditolak.
 */
export default function PanelKontenTinjau({ skema }) {
  const { api, notify, user } = useApp();
  const bolehTerbit = pembinaAtauAdmin(user);
  const [daftar, setDaftar] = useState(null);
  const [galatMuat, setGalatMuat] = useState('');
  const [id, setId] = useState(null); // null = formulir tambah baru
  const [form, setForm] = useState(() => skema.untukForm(null));
  const [dicoba, setDicoba] = useState(false);
  const [sibuk, setSibuk] = useState('');

  const muat = useCallback(async () => {
    const r = await api()[skema.fnMuat]();
    if (r.ok) { setDaftar(r.data); setGalatMuat(''); } else setGalatMuat(r.pesan ?? `${skema.labelJamak} tidak dapat dimuat.`);
  }, [api, skema]);
  useEffect(() => { muat(); }, [muat]);

  const bukaBaru = () => { setId(null); setForm(skema.untukForm(null)); setDicoba(false); };
  const bukaUbah = (item) => { setId(item.id); setForm(skema.untukForm(item)); setDicoba(false); window.scrollTo({ top: document.getElementById(`konten-${skema.fields[0].kunci}`)?.offsetTop ?? 0, behavior: 'smooth' }); };
  const ubahIsian = (kunci, nilai) => setForm((f) => ({ ...f, [kunci]: nilai }));

  const simpan = async (status, terbitPada = null) => {
    setDicoba(true);
    const galat = skema.periksa(form, status, bolehTerbit);
    if (Object.keys(galat).length || sibuk) return;
    setSibuk('simpan');
    const r = await api()[skema.fnSimpan]({ ...form, id }, status, terbitPada);
    setSibuk('');
    if (!r.ok) { notify(r.pesan, 'err'); return; }
    notify(status === 'terbit' ? `${skema.labelSatuan[0].toUpperCase()}${skema.labelSatuan.slice(1)} diterbitkan.` : status === 'menunggu' ? 'Diajukan ke Pembina.' : 'Draf tersimpan.');
    bukaBaru();
    await muat();
  };

  const hapus = async (item) => {
    if (!window.confirm(`Hapus ${skema.labelSatuan} "${item.judul}"?`)) return;
    setSibuk(`hapus-${item.id}`);
    const r = await api()[skema.fnHapus](item.id);
    setSibuk('');
    if (!r.ok) { notify(r.pesan, 'err'); return; }
    notify('Dihapus.');
    if (id === item.id) bukaBaru();
    await muat();
  };

  const tinjau = async (item, keputusan) => {
    let catatan = '';
    if (keputusan === 'ditolak') {
      catatan = window.prompt('Alasan penolakan (wajib, minimal 5 karakter):', '') ?? '';
      if (!catatan.trim()) return;
    }
    setSibuk(`tinjau-${item.id}`);
    const r = await api()[skema.fnTinjau](item.id, keputusan, catatan);
    setSibuk('');
    if (!r.ok) { notify(r.pesan, 'err'); return; }
    notify(keputusan === 'terbit' ? 'Diterbitkan.' : 'Ditolak, Dewan Ambalan diberi catatan.');
    await muat();
  };

  const galat = dicoba ? skema.periksa(form, bolehTerbit ? 'terbit' : 'menunggu', bolehTerbit) : {};
  const sedangUbah = id !== null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-pramuka-900">{skema.labelJamak}</h3>
          {sedangUbah && <button type="button" className="btn btn-outline btn-sm" onClick={bukaBaru}>+ {skema.labelSatuan} baru</button>}
        </div>
        {galatMuat && <p role="alert" className="panel border-red-300 bg-red-50 p-3 text-sm font-medium text-red-800">{galatMuat}</p>}
        {daftar === null && !galatMuat && <p className="text-sm text-pramuka-600">Memuat...</p>}
        {daftar !== null && daftar.length === 0 && <Kosong judul={`Belum ada ${skema.labelSatuan}`} teks="Isi formulir di sebelah untuk menambah." />}
        {daftar !== null && daftar.length > 0 && (
          <div className="divide-y divide-pramuka-200 rounded-lg border border-pramuka-200 bg-white">
            {daftar.map((item) => {
              const r = skema.ringkas(item);
              const boleh = bolehUbah(bolehTerbit, item.dibuatOleh, item.status, user.id);
              return (
                <div key={item.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pil status={item.status} />
                      <span className="truncate font-semibold text-pramuka-900">{r.judul}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-pramuka-600">{r.meta} · {item.dibuatOlehNama || 'tanpa nama'} · {waktuRelatif(item.dibuatPada)}</p>
                    {item.status === 'ditolak' && item.catatanTinjauan && <p className="mt-1 text-xs font-medium text-red-700">Catatan: {item.catatanTinjauan}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {item.status === 'menunggu' && bolehTerbit && (
                      <>
                        <button type="button" className="btn btn-gold btn-sm" disabled={!!sibuk} onClick={() => tinjau(item, 'terbit')}>Setujui</button>
                        <button type="button" className="btn btn-outline btn-sm text-red-700" disabled={!!sibuk} onClick={() => tinjau(item, 'ditolak')}>Tolak</button>
                      </>
                    )}
                    {boleh && <button type="button" className="btn btn-outline btn-sm" onClick={() => bukaUbah(item)}>Ubah</button>}
                    {boleh && <button type="button" className="btn btn-outline btn-sm text-red-700" disabled={sibuk === `hapus-${item.id}`} onClick={() => hapus(item)}>Hapus</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <form className="space-y-4" onSubmit={(e) => e.preventDefault()} noValidate>
        <h3 className="text-base font-bold text-pramuka-900">{sedangUbah ? `Ubah ${skema.labelSatuan}` : `Tambah ${skema.labelSatuan}`}</h3>
        {skema.fields.map((f) => <Isian key={f.kunci} f={f} nilai={form[f.kunci]} ubah={ubahIsian} galat={galat[f.kunci]} />)}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-outline" disabled={!!sibuk} onClick={() => simpan('draf')}>Simpan draf</button>
          {bolehTerbit
            ? <button type="button" className="btn btn-gold" disabled={!!sibuk} onClick={() => simpan('terbit')}>{sibuk === 'simpan' ? 'Menyimpan...' : 'Terbitkan sekarang'}</button>
            : <button type="button" className="btn btn-gold" disabled={!!sibuk} onClick={() => simpan('menunggu')}>{sibuk === 'simpan' ? 'Mengirim...' : 'Ajukan ke Pembina'}</button>}
        </div>
        {!bolehTerbit && <p className="text-xs text-pramuka-600">Sebagai Dewan Ambalan, {skema.labelSatuan} Anda diajukan ke Pembina lebih dulu sebelum tampil di beranda.</p>}
        {dicoba && Object.keys(galat).length > 0 && <p role="alert" className="text-sm font-medium text-red-700">Perbaiki isian yang bertanda merah.</p>}
      </form>
    </div>
  );
}
