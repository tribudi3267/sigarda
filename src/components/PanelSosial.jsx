import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { pembinaAtauAdmin } from '../lib/hakLogic';
import { LABEL_PLATFORM, PLATFORM_SOSIAL, periksaSosial, untukFormSosial } from '../lib/berandaKontenLogic';
import { Field, Kosong } from './ui';
import PratinjauSampul from './PratinjauSampul';

const bantuanGambar = 'Cara termudah (juga dari ponsel): unggah fotonya ke Google Drive, ketuk titik tiga (⋮) > Bagikan > ubah akses menjadi "Siapa saja yang memiliki link" > Salin link, lalu tempel di sini. Tautan halaman Google Photos (photos.google.com, photos.app.goo.gl) dan folder Drive tidak dapat dipakai sebagai gambar. Pratinjau di bawah kolom ini menunjukkan apakah fotonya benar-benar tampil.';

/** Tab Media Sosial pada Kelola Beranda: kartu tautan (bukan sematan resmi). Semua pengurus dapat menempel dan langsung tampil; `tampil` menyembunyikan tanpa menghapus. */
export default function PanelSosial() {
  const { api, notify, user } = useApp();
  const bolehSiapaPun = pembinaAtauAdmin(user);
  const [daftar, setDaftar] = useState(null);
  const [galatMuat, setGalatMuat] = useState('');
  const [id, setId] = useState(null);
  const [form, setForm] = useState(() => untukFormSosial(null));
  const [dicoba, setDicoba] = useState(false);
  const [sibuk, setSibuk] = useState('');

  const muat = useCallback(async () => {
    const r = await api().muatSosial();
    if (r.ok) { setDaftar(r.data); setGalatMuat(''); } else setGalatMuat(r.pesan ?? 'Kiriman media sosial tidak dapat dimuat.');
  }, [api]);
  useEffect(() => { muat(); }, [muat]);

  const bukaBaru = () => { setId(null); setForm(untukFormSosial(null)); setDicoba(false); };
  const ubah = (kunci, nilai) => setForm((f) => ({ ...f, [kunci]: nilai }));

  const simpan = async () => {
    setDicoba(true);
    const galat = periksaSosial(form);
    if (Object.keys(galat).length || sibuk) return;
    setSibuk('simpan');
    const r = await api().simpanSosial({ ...form, id });
    setSibuk('');
    if (!r.ok) { notify(r.pesan, 'err'); return; }
    notify('Kiriman tersimpan.');
    bukaBaru();
    await muat();
  };

  const ubahTampil = async (item) => {
    setSibuk(`tampil-${item.id}`);
    const r = await api().simpanSosial({ ...item, id: item.id, tampil: !item.tampil });
    setSibuk('');
    if (!r.ok) notify(r.pesan, 'err');
    await muat();
  };

  const hapus = async (item) => {
    if (!window.confirm('Hapus kiriman ini?')) return;
    setSibuk(`hapus-${item.id}`);
    const r = await api().hapusSosial(item.id);
    setSibuk('');
    if (!r.ok) { notify(r.pesan, 'err'); return; }
    notify('Dihapus.');
    if (id === item.id) bukaBaru();
    await muat();
  };

  const galat = dicoba ? periksaSosial(form) : {};

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-pramuka-900">Kiriman media sosial</h3>
          {id !== null && <button type="button" className="btn btn-outline btn-sm" onClick={bukaBaru}>+ Kiriman baru</button>}
        </div>
        {galatMuat && <p role="alert" className="panel border-red-300 bg-red-50 p-3 text-sm font-medium text-red-800">{galatMuat}</p>}
        {daftar === null && !galatMuat && <p className="text-sm text-pramuka-600">Memuat...</p>}
        {daftar !== null && daftar.length === 0 && <Kosong judul="Belum ada kiriman" teks="Isi formulir di sebelah untuk menempel tautan Instagram, YouTube, Facebook, atau TikTok." />}
        {daftar !== null && daftar.length > 0 && (
          <div className="divide-y divide-pramuka-200 rounded-lg border border-pramuka-200 bg-white">
            {daftar.map((s) => {
              const boleh = bolehSiapaPun || s.dibuatOleh === user.id;
              return (
                <div key={s.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-pramuka-900">{LABEL_PLATFORM[s.platform]}{s.keterangan ? ` · ${s.keterangan}` : ''}</p>
                    <p className="truncate text-xs text-pramuka-600">{s.tautan}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <button type="button" className="btn btn-outline btn-sm" disabled={!boleh || sibuk === `tampil-${s.id}`} onClick={() => ubahTampil(s)}>{s.tampil ? 'Tampil' : 'Disembunyikan'}</button>
                    {boleh && <button type="button" className="btn btn-outline btn-sm" onClick={() => { setId(s.id); setForm(untukFormSosial(s)); setDicoba(false); }}>Ubah</button>}
                    {boleh && <button type="button" className="btn btn-outline btn-sm text-red-700" disabled={sibuk === `hapus-${s.id}`} onClick={() => hapus(s)}>Hapus</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-pramuka-600">Beranda menampilkan paling banyak 6 kiriman terbaru yang tampil.</p>
      </div>

      <form className="space-y-4" onSubmit={(e) => e.preventDefault()} noValidate>
        <h3 className="text-base font-bold text-pramuka-900">{id !== null ? 'Ubah kiriman' : 'Tambah kiriman'}</h3>
        <Field label="Platform" htmlFor="sosial-platform">
          <select id="sosial-platform" className="input" value={form.platform} onChange={(e) => ubah('platform', e.target.value)}>
            {PLATFORM_SOSIAL.map((p) => <option key={p} value={p}>{LABEL_PLATFORM[p]}</option>)}
          </select>
        </Field>
        <Field label="Tautan kiriman" htmlFor="sosial-tautan">
          <input id="sosial-tautan" className={`input ${galat.tautan ? 'border-red-500' : ''}`} value={form.tautan} placeholder="https://instagram.com/p/..." onChange={(e) => ubah('tautan', e.target.value)} />
          {galat.tautan && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{galat.tautan}</p>}
        </Field>
        <Field label="Keterangan singkat" htmlFor="sosial-ket">
          <input id="sosial-ket" className={`input ${galat.keterangan ? 'border-red-500' : ''}`} value={form.keterangan} placeholder="Satu kalimat untuk kartu di beranda" onChange={(e) => ubah('keterangan', e.target.value)} />
          {galat.keterangan && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{galat.keterangan}</p>}
        </Field>
        <Field label="Gambar pratinjau (tautan file foto di Google Drive, opsional)" htmlFor="sosial-gambar" bantuan={bantuanGambar}>
          <input id="sosial-gambar" className={`input ${galat.gambarUrl ? 'border-red-500' : ''}`} value={form.gambarUrl} placeholder="https://..." onChange={(e) => ubah('gambarUrl', e.target.value)} />
          {galat.gambarUrl && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{galat.gambarUrl}</p>}
          <PratinjauSampul nilai={form.gambarUrl} rasio="sosial" />
        </Field>
        <button type="button" className="btn btn-gold" disabled={!!sibuk} onClick={simpan}>{sibuk === 'simpan' ? 'Menyimpan...' : 'Simpan kiriman'}</button>
        {dicoba && Object.keys(galat).length > 0 && <p role="alert" className="text-sm font-medium text-red-700">Perbaiki isian yang bertanda merah.</p>}
      </form>
    </div>
  );
}
