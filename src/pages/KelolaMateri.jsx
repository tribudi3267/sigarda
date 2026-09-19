import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { DAFTAR_TINGKAT } from '../data/skuData';
import { buatId, fmtTanggal } from '../lib/format';
import {
  KATALOG_BUTIR, MAKS_BAGIAN, MAKS_DESKRIPSI, MAKS_JUDUL, ambilTautanDrive, bacaBagianTeks, butirTanpaMateri,
  ringkasButir, urlBuka,
} from '../lib/materiLogic';
import ChipButir from '../components/ChipButir';
import PratinjauDrive from '../components/PratinjauDrive';
import { Field, Icon, Kosong, Modal } from '../components/ui';

const BARU = { judul: '', deskripsi: '', tautan: '', butir: [], bagian: [] };

/** Pilihan butir SKU terkait: kotak nomor per tingkat, dengan "Pilih semua" dan "Kosongkan". */
function PilihButir({ nilai, onUbah }) {
  const terpilih = new Set(nilai);
  const alih = (id) => onUbah(terpilih.has(id) ? nilai.filter((x) => x !== id) : [...nilai, id]);
  const atur = (tingkat, semua) => {
    const idTingkat = KATALOG_BUTIR.filter((b) => b.tingkat === tingkat).map((b) => b.id);
    onUbah(semua ? [...new Set([...nilai, ...idTingkat])] : nilai.filter((id) => !idTingkat.includes(id)));
  };

  return (
    <div className="space-y-3">
      {DAFTAR_TINGKAT.map((tingkat) => {
        const butir = KATALOG_BUTIR.filter((b) => b.tingkat === tingkat);
        const jumlah = butir.filter((b) => terpilih.has(b.id)).length;
        return (
          <fieldset key={tingkat} className="rounded-lg border border-pramuka-200 p-3">
            <legend className="px-1 text-sm font-semibold text-pramuka-800">SKU {tingkat} ({jumlah} dari {butir.length} dipilih)</legend>
            <div className="mb-2 flex gap-3 text-xs font-semibold">
              <button type="button" className="text-pramuka-700 underline underline-offset-2" onClick={() => atur(tingkat, true)}>Pilih semua</button>
              <button type="button" className="text-pramuka-700 underline underline-offset-2" onClick={() => atur(tingkat, false)}>Kosongkan</button>
            </div>
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 md:grid-cols-12">
              {butir.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  aria-pressed={terpilih.has(b.id)}
                  title={`Butir ${b.no}: ${b.teks}`}
                  onClick={() => alih(b.id)}
                  className={`rounded-md py-1.5 text-sm font-semibold ring-1 ring-inset transition-colors ${
                    terpilih.has(b.id) ? 'bg-pramuka-800 text-pramuka-50 ring-pramuka-800' : 'bg-white text-pramuka-700 ring-pramuka-300 hover:bg-pramuka-100'
                  }`}
                >
                  {b.no}
                </button>
              ))}
            </div>
          </fieldset>
        );
      })}
      {nilai.length > 0 && (
        <ul className="max-h-36 space-y-1 overflow-y-auto rounded-md bg-pramuka-50 px-3 py-2 text-xs text-pramuka-700">
          {KATALOG_BUTIR.filter((b) => terpilih.has(b.id)).map((b) => (
            <li key={b.id} className="truncate"><span className="font-semibold">{b.tingkat} {b.no}:</span> {b.teks}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Daftar isi materi: baris judul + halaman, dengan tempel banyak baris sekaligus. */
function EditorBagian({ nilai, onUbah }) {
  const [tempel, setTempel] = useState('');
  const [bukaTempel, setBukaTempel] = useState(false);
  const [galatTempel, setGalatTempel] = useState([]);

  const ubah = (id, kunci) => (e) => onUbah(nilai.map((b) => (b.id === id ? { ...b, [kunci]: e.target.value } : b)));
  const geser = (i, arah) => {
    const j = i + arah;
    if (j < 0 || j >= nilai.length) return;
    const baru = [...nilai];
    [baru[i], baru[j]] = [baru[j], baru[i]];
    onUbah(baru);
  };
  const terapkan = () => {
    const { bagian, galat } = bacaBagianTeks(tempel);
    setGalatTempel(galat);
    if (galat.length) return;
    onUbah([...nilai.filter((b) => b.judul.trim() || b.halaman.trim()), ...bagian]);
    setTempel('');
    setBukaTempel(false);
  };

  return (
    <div>
      {nilai.length === 0 && <p className="mb-2 text-xs text-pramuka-500">Belum ada bagian. Daftar isi bersifat opsional, tetapi memudahkan pembaca menemukan bahasan.</p>}
      <ol className="space-y-2">
        {nilai.map((b, i) => (
          // Ponsel: judul satu baris penuh, halaman dan tombol di baris kedua. Layar lebar: satu baris.
          <li key={b.id} className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 rounded-lg bg-pramuka-50/60 p-2 sm:flex-nowrap sm:bg-transparent sm:p-0">
            <span className="w-6 shrink-0 text-right text-xs text-pramuka-400">{i + 1}.</span>
            <input className="input min-w-0 flex-1 basis-[calc(100%-2rem)] sm:basis-0" aria-label={`Judul bagian ${i + 1}`} placeholder="Judul bagian" maxLength={MAKS_JUDUL} value={b.judul} onChange={ubah(b.id, 'judul')} />
            <div className="ml-7 flex items-center gap-1.5 sm:ml-0">
              <input className="input w-24 shrink-0 text-center" aria-label={`Halaman bagian ${i + 1}`} placeholder="Hlm." inputMode="numeric" value={b.halaman} onChange={ubah(b.id, 'halaman')} />
              <button type="button" className="rounded p-1.5 text-pramuka-600 hover:bg-pramuka-100 disabled:opacity-30" aria-label={`Naikkan bagian ${i + 1}`} disabled={i === 0} onClick={() => geser(i, -1)}>
                <Icon nama="panahAtas" className="h-4 w-4" />
              </button>
              <button type="button" className="rounded p-1.5 text-pramuka-600 hover:bg-pramuka-100 disabled:opacity-30" aria-label={`Turunkan bagian ${i + 1}`} disabled={i === nilai.length - 1} onClick={() => geser(i, 1)}>
                <Icon nama="panahBawah" className="h-4 w-4" />
              </button>
              <button type="button" className="rounded p-1.5 text-red-700 hover:bg-red-50" aria-label={`Hapus bagian ${i + 1}`} onClick={() => onUbah(nilai.filter((x) => x.id !== b.id))}>
                <Icon nama="hapus" className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-outline btn-sm" disabled={nilai.length >= MAKS_BAGIAN} onClick={() => onUbah([...nilai, { id: buatId('b'), judul: '', halaman: '' }])}>
          <Icon nama="tambah" className="h-3.5 w-3.5" /> Tambah bagian
        </button>
        <button type="button" className="btn btn-outline btn-sm" aria-expanded={bukaTempel} onClick={() => setBukaTempel((b) => !b)}>
          <Icon nama="salin" className="h-3.5 w-3.5" /> Tempel banyak sekaligus
        </button>
      </div>

      {bukaTempel && (
        <div className="animasi-naik mt-3 rounded-lg bg-pramuka-50 p-3">
          <label htmlFor="tempel-bagian" className="label">Satu baris satu bagian, format: Judul | halaman</label>
          <textarea
            id="tempel-bagian"
            className="input min-h-[7rem] font-mono text-sm"
            placeholder={'Pengertian Pramuka | 3\nSejarah Gerakan Pramuka | 5-9\nTri Satya dan Dasa Darma'}
            value={tempel}
            onChange={(e) => setTempel(e.target.value)}
          />
          {galatTempel.length > 0 && (
            <ul role="alert" className="mt-2 list-disc space-y-0.5 pl-5 text-xs font-medium text-red-700">
              {galatTempel.map((g) => <li key={g}>{g}</li>)}
            </ul>
          )}
          <button type="button" className="btn btn-primary btn-sm mt-2" onClick={terapkan} disabled={!tempel.trim()}>Tambahkan ke daftar isi</button>
        </div>
      )}
    </div>
  );
}

function FormMateri({ awal, onTutup }) {
  const { simpanMateri } = useApp();
  const [f, setF] = useState(() => ({ ...BARU, ...awal, bagian: (awal.bagian ?? []).map((b) => ({ ...b })) }));
  const [galat, setGalat] = useState('');
  const [tes, setTes] = useState(false);
  const baru = !f.id;
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); if (k === 'tautan') setTes(false); };

  const tautan = f.tautan.trim() ? ambilTautanDrive(f.tautan) : null;

  const [sibuk, setSibuk] = useState(false);
  const kirim = async () => {
    if (sibuk) return;
    setSibuk(true);
    setGalat('');
    const r = await simpanMateri(f);
    setSibuk(false);
    if (r.ok) onTutup();
    else setGalat(r.pesan);
  };

  return (
    <Modal
      buka
      tutup={onTutup}
      judul={baru ? 'Tambah materi' : 'Ubah materi'}
      lebar="max-w-3xl"
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup}>Batal</button>
          <button className="btn btn-primary" onClick={kirim} disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan materi'}</button>
        </>
      }
    >
      <Field label="Judul materi" htmlFor="m-judul" bantuan="Judul ini tampil pada daftar isi halaman Materi.">
        <input id="m-judul" className="input" maxLength={MAKS_JUDUL} value={f.judul} onChange={set('judul')} placeholder="Contoh: Sejarah dan Struktur Gerakan Pramuka" />
      </Field>

      <Field
        label="Tautan file PDF di Google Drive"
        htmlFor="m-tautan"
        bantuan={'Di Google Drive: klik kanan file PDF, pilih Bagikan, ubah akses umum menjadi "Siapa saja yang memiliki link" (Pelihat), lalu salin link.'}
      >
        <input id="m-tautan" className="input" inputMode="url" value={f.tautan} onChange={set('tautan')} placeholder="https://drive.google.com/file/d/.../view?usp=sharing" />
        {tautan && (
          <p className={`mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold ${tautan.ok ? 'text-emerald-800' : 'text-red-700'}`} role={tautan.ok ? undefined : 'alert'}>
            {tautan.ok ? (
              <>
                <span className="inline-flex items-center gap-1"><Icon nama="cek" className="h-3.5 w-3.5" /> Tautan terbaca</span>
                <button type="button" className="text-pramuka-800 underline underline-offset-2" onClick={() => setTes((t) => !t)}>
                  {tes ? 'Tutup tes pratinjau' : 'Tes pratinjau'}
                </button>
                <a className="text-pramuka-800 underline underline-offset-2" href={urlBuka({ fileId: tautan.id, resourceKey: tautan.resourceKey })} target="_blank" rel="noopener noreferrer">Buka di Drive</a>
              </>
            ) : tautan.pesan}
          </p>
        )}
        {tautan?.ok && tes && (
          <div className="animasi-naik mt-3">
            <PratinjauDrive materi={{ judul: f.judul || 'materi', fileId: tautan.id, resourceKey: tautan.resourceKey }} tinggi="h-64" />
          </div>
        )}
      </Field>

      <Field label="Deskripsi singkat (opsional)" htmlFor="m-deskripsi" bantuan={`Maksimal ${MAKS_DESKRIPSI} karakter.`}>
        <textarea id="m-deskripsi" className="input min-h-[4.5rem]" maxLength={MAKS_DESKRIPSI} value={f.deskripsi} onChange={set('deskripsi')} />
      </Field>

      <Field label="Terkait butir SKU" htmlFor="m-butir" bantuan="Materi akan muncul lewat tombol Materi pada butir-butir yang dipilih. Kosongkan bila materi bersifat umum.">
        <div id="m-butir"><PilihButir nilai={f.butir} onUbah={(butir) => setF({ ...f, butir })} /></div>
      </Field>

      <Field label="Daftar isi materi (opsional)" htmlFor="m-bagian">
        <div id="m-bagian"><EditorBagian nilai={f.bagian} onUbah={(bagian) => setF({ ...f, bagian })} /></div>
      </Field>

      {galat && <p role="alert" className="text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}

/** Menu Kelola Materi (Pembina dan Admin Gudep): tambah, ubah, urutkan, dan hapus materi. */
export default function KelolaMateri({ bukaId = null }) {
  const { materi, bolehKelolaMateri, hapusMateri, geserUrutanMateri } = useApp();
  // bukaId: id materi yang langsung dibuka untuk diubah, atau 'baru' untuk formulir tambah materi
  const [form, setForm] = useState(() => (bukaId === 'baru' ? { ...BARU } : bukaId ? materi.find((m) => m.id === bukaId) ?? null : null));
  const [lihatKosong, setLihatKosong] = useState(false);

  if (!bolehKelolaMateri) {
    return <Kosong judul="Tidak diizinkan" teks="Hanya Pembina dan Admin Gudep yang dapat mengelola materi." />;
  }

  const hapus = (m) => {
    if (window.confirm(`Hapus materi "${m.judul}"? File di Google Drive tidak ikut terhapus.`)) hapusMateri(m.id);
  };
  const tanpaMateri = butirTanpaMateri(materi);

  return (
    <div className="animasi-naik">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Kelola materi</h1>
          <p className="text-sm text-pramuka-600">
            Lampirkan file PDF dari Google Drive, beri judul dan daftar isi, lalu hubungkan dengan butir SKU. Hasilnya tampil di menu Materi semua pengguna.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setForm({ ...BARU })}>
          <Icon nama="tambah" className="h-4 w-4" /> Tambah materi
        </button>
      </div>

      {materi.length > 0 && (
        <div className="panel mb-4 p-3 text-sm text-pramuka-700">
          <p>
            <span className="font-semibold text-pramuka-900">{materi.length} materi</span> terhubung ke{' '}
            <span className="font-semibold text-pramuka-900">{KATALOG_BUTIR.length - tanpaMateri.length} dari {KATALOG_BUTIR.length} butir</span> SKU.
            {tanpaMateri.length > 0 && (
              <>
                {' '}
                <button className="font-semibold text-pramuka-800 underline underline-offset-2" aria-expanded={lihatKosong} onClick={() => setLihatKosong((b) => !b)}>
                  {lihatKosong ? 'Sembunyikan' : 'Lihat'} butir yang belum punya materi
                </button>
              </>
            )}
          </p>
          {lihatKosong && (
            <div className="animasi-naik mt-2 flex flex-wrap gap-1.5">
              {tanpaMateri.map((b) => <ChipButir key={b.id} id={b.id} />)}
            </div>
          )}
        </div>
      )}

      {materi.length === 0 ? (
        <Kosong judul="Belum ada materi" teks="Klik Tambah materi, lalu tempel tautan berbagi file PDF dari Google Drive." />
      ) : (
        <ol className="space-y-3">
          {materi.map((m, i) => {
            const ringkas = ringkasButir(m.butir);
            return (
              <li key={m.id} className="panel flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pramuka-100 text-sm font-bold text-pramuka-700">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug text-pramuka-900">{m.judul}</p>
                  {m.deskripsi && <p className="mt-0.5 line-clamp-2 text-sm text-pramuka-600">{m.deskripsi}</p>}
                  <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-pramuka-600">
                    {m.butir.length === 0 && <span>Materi umum</span>}
                    {Object.entries(ringkas).map(([tingkat, nomor]) => (
                      <span key={tingkat} className="inline-flex items-center gap-1">
                        <span className="font-semibold">{tingkat}:</span> butir {nomor}
                      </span>
                    ))}
                    <span className="text-pramuka-400">·</span>
                    <span>{m.bagian.length} bagian daftar isi</span>
                    <span className="text-pramuka-400">·</span>
                    <span>Ditambahkan {fmtTanggal(m.dibuat)}</span>
                  </p>
                  <a className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-pramuka-700 underline underline-offset-2" href={urlBuka(m)} target="_blank" rel="noopener noreferrer">
                    <Icon nama="keluarTab" className="h-3 w-3" /> Buka file di Google Drive
                  </a>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button className="rounded-md p-2 text-pramuka-600 hover:bg-pramuka-100 disabled:opacity-30" aria-label={`Naikkan ${m.judul}`} disabled={i === 0} onClick={() => geserUrutanMateri(m.id, -1)}>
                    <Icon nama="panahAtas" className="h-4 w-4" />
                  </button>
                  <button className="rounded-md p-2 text-pramuka-600 hover:bg-pramuka-100 disabled:opacity-30" aria-label={`Turunkan ${m.judul}`} disabled={i === materi.length - 1} onClick={() => geserUrutanMateri(m.id, 1)}>
                    <Icon nama="panahBawah" className="h-4 w-4" />
                  </button>
                  <button className="rounded-md p-2 text-pramuka-600 hover:bg-pramuka-100" aria-label={`Ubah ${m.judul}`} onClick={() => setForm(m)}>
                    <Icon nama="ubah" className="h-4 w-4" />
                  </button>
                  <button className="rounded-md p-2 text-red-700 hover:bg-red-50" aria-label={`Hapus ${m.judul}`} onClick={() => hapus(m)}>
                    <Icon nama="hapus" className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {form && <FormMateri key={form.id ?? 'baru'} awal={form} onTutup={() => setForm(null)} />}
    </div>
  );
}
