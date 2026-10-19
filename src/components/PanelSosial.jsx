import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { pembinaAtauAdmin } from '../lib/hakLogic';
import { LABEL_PLATFORM, PLATFORM_SOSIAL, periksaSosial, untukFormSosial } from '../lib/berandaKontenLogic';
import { Field, Kosong } from './ui';
import PratinjauSampul from './PratinjauSampul';
import { LABEL_PLATFORM_SOSIAL, analisisSosial, galatTautanSosial } from '../lib/sosialLogic';
import { bisaAmbilSampulSosial, kirimanTanpaGambar, perluAmbilSampulSosial } from '../lib/sosialSampulLogic';

const bantuanGambar = 'Untuk YouTube, Instagram, dan TikTok gambar diisi otomatis dari postingannya. Mengisi sendiri (atau menggantinya): unggah fotonya ke Google Drive, ketuk titik tiga (⋮) > Bagikan > ubah akses menjadi "Siapa saja yang memiliki link" > Salin link, lalu tempel di sini. Tautan halaman Google Photos (photos.google.com, photos.app.goo.gl) dan folder Drive tidak dapat dipakai sebagai gambar. Pratinjau di bawah kolom ini menunjukkan apakah fotonya benar-benar tampil.';

/** Hasil pengenalan tautan di bawah kolomnya: apa yang akan tampil di beranda, atau mengapa tautan ini belum dapat dipakai. */
function InfoTautan({ nilai, adaGambar }) {
  const a = analisisSosial(nilai);
  if (a.jenis === 'kosong' || a.jenis === 'tidak-sah') return null;
  const nama = LABEL_PLATFORM_SOSIAL[a.platform];
  if (a.jenis === 'bukan-postingan' || a.jenis === 'tidak-dikenal') {
    return <p role="alert" className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium leading-relaxed text-red-800">{a.pesan}</p>;
  }
  if (a.embedUrl) {
    return (
      <p role="status" className="mt-1 text-xs font-medium leading-relaxed text-emerald-800">
        Terdeteksi postingan {nama}. Di beranda tampil gambar pratinjau dengan tombol putar; pemutarnya baru dimuat saat pengunjung mengetuknya.
        {a.thumbUrl ? ' Gambar pratinjau diambil otomatis dari YouTube (boleh diganti di bawah).'
          : bisaAmbilSampulSosial(nilai) ? ' Gambar pratinjau diambil otomatis dari postingannya dan disalin ke SIGARDA (boleh diganti di bawah).'
          : adaGambar ? '' : ' Isi gambar pratinjau di bawah: ' + nama + ' tidak menyediakan gambar otomatis. Tanpa gambar, kartu di beranda hanya menampilkan latar polos bertuliskan ' + nama + '.'}
      </p>
    );
  }
  return (
    <p role="status" className="mt-1 text-xs font-medium leading-relaxed text-amber-800">
      Terdeteksi postingan {nama}, tetapi tautan ini tidak dapat diputar langsung di beranda (tautan pendek atau tautan Bagikan baru); kartu akan membuka postingannya di {nama}.
      Bila ada, tempel tautan penuh postingan agar dapat diputar.{bisaAmbilSampulSosial(nilai) ? ' Gambar pratinjau diambil otomatis dari postingannya.' : ' Isi juga gambar pratinjau di bawah.'}
    </p>
  );
}

/**
 * Tab Media Sosial pada Kelola Beranda: pengurus menempel tautan BAGIKAN sebuah postingan (milik akun mana pun, tidak harus akun gudep); platform dikenali dari tautan.
 * Di beranda kartunya gambar pratinjau + tombol putar, pemutar baru dimuat saat diketuk (lihat KartuSosial). Semua pengurus dapat menempel dan langsung tampil;
 * `tampil` menyembunyikan tanpa menghapus.
 */
export default function PanelSosial() {
  const { api, notify, user } = useApp();
  const bolehSiapaPun = pembinaAtauAdmin(user);
  const [daftar, setDaftar] = useState(null);
  const [galatMuat, setGalatMuat] = useState('');
  const [id, setId] = useState(null);
  const [form, setForm] = useState(() => untukFormSosial(null));
  const [dicoba, setDicoba] = useState(false);
  const [sibuk, setSibuk] = useState('');
  const [sampulStatus, setSampulStatus] = useState({ jenis: '', teks: '' }); // gambar otomatis Instagram/TikTok untuk formulir
  const [lengkapi, setLengkapi] = useState({ jalan: false, teks: '' }); // melengkapi gambar kiriman yang sudah tersimpan
  const sudahDicoba = useRef(''); // tautan terakhir yang sudah diminta ke fungsi sosial-sampul
  const apiTerbaru = useRef(api); // api() dibuat ulang tiap render konteks; ref menjaga ambilSampul (dan penundaan di efek) tetap stabil
  apiTerbaru.current = api;

  const muat = useCallback(async () => {
    const r = await api().muatSosial();
    if (r.ok) { setDaftar(r.data); setGalatMuat(''); } else setGalatMuat(r.pesan ?? 'Kiriman media sosial tidak dapat dimuat.');
  }, [api]);
  useEffect(() => { muat(); }, [muat]);

  const bukaBaru = () => { setId(null); setForm(untukFormSosial(null)); setDicoba(false); sudahDicoba.current = ''; setSampulStatus({ jenis: '', teks: '' }); };
  const bukaUbah = (s) => { setId(s.id); setForm(untukFormSosial(s)); setDicoba(false); sudahDicoba.current = ''; setSampulStatus({ jenis: '', teks: '' }); };

  // Gambar otomatis Instagram/TikTok: fungsi server mengambil gambar pratinjau postingan dan menyalinnya ke Storage SIGARDA. Hanya mengisi kolom formulir
  // (belum disimpan); hasil untuk tautan yang sudah diganti sementara itu dibuang. Gagal = pesan, gambar tetap dapat diisi manual.
  const ambilSampul = useCallback(async (tautan) => {
    const t = String(tautan).trim();
    sudahDicoba.current = t;
    setSampulStatus({ jenis: 'tunggu', teks: 'Mengambil gambar dari postingan...' });
    const r = await apiTerbaru.current().ambilSampulSosial(t);
    if (!r.ok) { setSampulStatus({ jenis: 'galat', teks: r.pesan }); return; }
    setForm((f) => (String(f.tautan).trim() !== t ? f : { ...f, gambarUrl: r.gambar }));
    setSampulStatus({ jenis: 'ok', teks: 'Gambar diambil dari postingan. Periksa pratinjau di bawah.' });
  }, []);
  useEffect(() => {
    if (!perluAmbilSampulSosial(form, sudahDicoba.current)) return undefined;
    const tunda = setTimeout(() => ambilSampul(form.tautan), 800);
    return () => clearTimeout(tunda);
  }, [form, ambilSampul]);

  const bolehUbahKiriman = (s) => bolehSiapaPun || s.dibuatOleh === user.id;
  const tanpaGambar = kirimanTanpaGambar(daftar, bolehUbahKiriman);
  // Kiriman yang sudah tersimpan (juga yang sudah tampil di beranda) tanpa gambar: diambil satu per satu, lalu disimpan lewat sg_sosial_simpan seperti biasa.
  const lengkapiGambar = async () => {
    if (sibuk || lengkapi.jalan) return;
    const sasaran = tanpaGambar;
    let berhasil = 0;
    const gagal = [];
    for (const [i, s] of sasaran.entries()) {
      setLengkapi({ jalan: true, teks: `Mengambil gambar ${i + 1} dari ${sasaran.length}...` });
      const r = await api().ambilSampulSosial(s.tautan);
      if (!r.ok) { gagal.push(r.pesan); if (r.sesiBerakhir || /belum dipasang|mode lokal/.test(r.pesan)) break; continue; }
      const t = await api().simpanSosial({ ...s, id: s.id, gambarUrl: r.gambar });
      if (t.ok) berhasil += 1; else gagal.push(t.pesan);
    }
    const sisa = sasaran.length - berhasil;
    setLengkapi({ jalan: false, teks: sisa === 0 ? '' : `${berhasil} dari ${sasaran.length} kiriman berhasil diberi gambar. ${gagal[0] ?? ''} Kiriman yang tersisa dapat diberi gambar manual lewat Ubah.` });
    if (berhasil) notify(`${berhasil} kiriman kini bergambar.`);
    await muat();
  };
  const ubah = (kunci, nilai) => setForm((f) => ({ ...f, [kunci]: nilai }));
  // Platform dikenali dari tautan (pilihan diubah otomatis); aturan server (https) ditambah syarat klien: harus tautan postingan.
  const gantiTautan = (nilai) => setForm((f) => { const a = analisisSosial(nilai); return { ...f, tautan: nilai, platform: a.platform || f.platform }; });
  const galatKiriman = (f) => { const g = periksaSosial(f); const p = galatTautanSosial(f.tautan); return p && !g.tautan ? { ...g, tautan: p } : g; };

  const simpan = async () => {
    setDicoba(true);
    const galat = galatKiriman(form);
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

  const galat = dicoba ? galatKiriman(form) : {};

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-pramuka-900">Kiriman media sosial</h3>
          {id !== null && <button type="button" className="btn btn-outline btn-sm" onClick={bukaBaru}>+ Kiriman baru</button>}
        </div>
        {galatMuat && <p role="alert" className="panel border-red-300 bg-red-50 p-3 text-sm font-medium text-red-800">{galatMuat}</p>}
        {daftar === null && !galatMuat && <p className="text-sm text-pramuka-600">Memuat...</p>}
        {(tanpaGambar.length > 0 || lengkapi.teks) && (
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {tanpaGambar.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0">{tanpaGambar.length} kiriman Instagram/TikTok belum punya gambar pratinjau (di beranda tampil latar polos).</p>
                <button type="button" className="btn btn-gold btn-sm" disabled={lengkapi.jalan || !!sibuk} onClick={lengkapiGambar}>{lengkapi.jalan ? 'Melengkapi...' : 'Lengkapi gambar otomatis'}</button>
              </div>
            )}
            {lengkapi.teks && <p role="status" className="mt-1 text-xs font-medium [overflow-wrap:anywhere]">{lengkapi.teks}</p>}
          </div>
        )}
        {daftar !== null && daftar.length === 0 && <Kosong judul="Belum ada kiriman" teks="Isi formulir di sebelah untuk menempel tautan Instagram, YouTube, Facebook, atau TikTok." />}
        {daftar !== null && daftar.length > 0 && (
          <div className="divide-y divide-pramuka-200 rounded-lg border border-pramuka-200 bg-white">
            {daftar.map((s) => {
              const boleh = bolehUbahKiriman(s);
              return (
                <div key={s.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-pramuka-900 [overflow-wrap:anywhere]">{LABEL_PLATFORM[s.platform]}{s.keterangan ? ` · ${s.keterangan}` : ''}</p>
                    <p className="truncate text-xs text-pramuka-600">{s.tautan}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <button type="button" className="btn btn-outline btn-sm" disabled={!boleh || sibuk === `tampil-${s.id}`} onClick={() => ubahTampil(s)}>{s.tampil ? 'Tampil' : 'Disembunyikan'}</button>
                    {boleh && <button type="button" className="btn btn-outline btn-sm" onClick={() => bukaUbah(s)}>Ubah</button>}
                    {boleh && <button type="button" className="btn btn-outline btn-sm text-red-700" disabled={sibuk === `hapus-${s.id}`} onClick={() => hapus(s)}>Hapus</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-pramuka-600">Beranda menampilkan 6 kiriman terbaru yang tampil; kiriman lebih lama dimuat lewat tombol "Muat kiriman lebih lama".</p>
      </div>

      <form className="order-first min-w-0 space-y-4 lg:order-none" onSubmit={(e) => e.preventDefault()} noValidate>
        <h3 className="text-base font-bold text-pramuka-900">{id !== null ? 'Ubah kiriman' : 'Tambah kiriman'}</h3>
        <Field label="Platform" htmlFor="sosial-platform">
          <select id="sosial-platform" className="input" value={form.platform} onChange={(e) => ubah('platform', e.target.value)}>
            {PLATFORM_SOSIAL.map((p) => <option key={p} value={p}>{LABEL_PLATFORM[p]}</option>)}
          </select>
        </Field>
        <Field label="Tautan postingan (tautan Bagikan, dari akun mana pun)" htmlFor="sosial-tautan" bantuan="Buka postingan yang ingin ditampilkan (boleh milik akun lain), ketuk Bagikan, lalu Salin tautan. Instagram (post, reel), YouTube, Facebook (video, reel, postingan), dan TikTok (video). Bukan tautan profil.">
          <input id="sosial-tautan" className={`input ${galat.tautan ? 'border-red-500' : ''}`} value={form.tautan} placeholder="https://www.youtube.com/watch?v=..." onChange={(e) => gantiTautan(e.target.value)} />
          <InfoTautan nilai={form.tautan} adaGambar={!!form.gambarUrl.trim()} />
          {galat.tautan && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{galat.tautan}</p>}
        </Field>
        <Field label="Keterangan singkat" htmlFor="sosial-ket">
          <input id="sosial-ket" className={`input ${galat.keterangan ? 'border-red-500' : ''}`} value={form.keterangan} placeholder="Satu kalimat untuk kartu di beranda" onChange={(e) => ubah('keterangan', e.target.value)} />
          {galat.keterangan && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{galat.keterangan}</p>}
        </Field>
        <Field label="Gambar pratinjau (otomatis untuk YouTube, Instagram, dan TikTok; atau tautan foto di Google Drive)" htmlFor="sosial-gambar" bantuan={bantuanGambar}>
          <input id="sosial-gambar" className={`input ${galat.gambarUrl ? 'border-red-500' : ''}`} value={form.gambarUrl} placeholder="https://..." onChange={(e) => ubah('gambarUrl', e.target.value)} />
          {galat.gambarUrl && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{galat.gambarUrl}</p>}
          {bisaAmbilSampulSosial(form.tautan) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-outline btn-sm" disabled={sampulStatus.jenis === 'tunggu'} onClick={() => ambilSampul(form.tautan)}>Ambil ulang gambar dari postingan</button>
              {sampulStatus.teks && <span role="status" className={`text-xs font-medium [overflow-wrap:anywhere] ${sampulStatus.jenis === 'galat' ? 'text-red-700' : 'text-pramuka-600'}`}>{sampulStatus.teks}</span>}
            </div>
          )}
          <PratinjauSampul nilai={form.gambarUrl} rasio="sosial" />
        </Field>
        <button type="button" className="btn btn-gold" disabled={!!sibuk} onClick={simpan}>{sibuk === 'simpan' ? 'Menyimpan...' : 'Simpan kiriman'}</button>
        {dicoba && Object.keys(galat).length > 0 && <p role="alert" className="text-sm font-medium text-red-700">Perbaiki isian yang bertanda merah.</p>}
      </form>
    </div>
  );
}
