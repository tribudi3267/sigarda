import { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { hurufSub, INDEKS_POIN } from '../data/skuData';
import useInstrumen from '../hooks/useInstrumen';
import {
  daftarUnitInstrumen, hitungSkorInstrumen, JENIS_KRITERIA, MAKS_KRITERIA, PENGATURAN_INSTRUMEN_BAWAAN, periksaInstrumen,
  periksaPengaturanInstrumen, STATUS_INSTRUMEN, statusUnit,
} from '../lib/instrumenLogic';
import { unduhInstrumenXlsx } from '../lib/exportLaporan';
import { Icon, Kosong, Modal } from '../components/ui';

const CHIP = 'inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset';
const KELAS_STATUS = {
  kosong: 'bg-stone-100 text-stone-700 ring-stone-300',
  draf: 'bg-amber-100 text-amber-900 ring-amber-300',
  ditetapkan: 'bg-emerald-100 text-emerald-900 ring-emerald-300',
};
const LABEL_STATUS = { kosong: 'Belum ada', ...STATUS_INSTRUMEN };
const UNIT = daftarUnitInstrumen(INDEKS_POIN, hurufSub);
const BATAS_DAFTAR = 40;

/* ============================== Editor satu instrumen ============================== */

function EditorInstrumen({ unit, awal, onTutup }) {
  const { simpanInstrumen } = useApp();
  const nomor = useRef(0);
  const baru = () => ({ kunci: `baru-${(nomor.current += 1)}`, id: null, jenis: 'Lisan', teks: '', bobot: 1, wajib: false, panduan: '' });
  const [caraUji, setCaraUji] = useState(awal?.caraUji ?? '');
  const [instruksi, setInstruksi] = useState(awal?.instruksi ?? '');
  const [status, setStatus] = useState(awal?.status ?? 'draf');
  const [kriteria, setKriteria] = useState(() => (awal?.kriteria ?? []).map((k) => ({ kunci: `id-${k.id}`, ...k })));
  const [proses, setProses] = useState(false);
  const [galat, setGalat] = useState('');

  const ubah = (kunci, patch) => setKriteria((d) => d.map((k) => (k.kunci === kunci ? { ...k, ...patch } : k)));
  const geser = (i, arah) => setKriteria((d) => {
    const j = i + arah;
    if (j < 0 || j >= d.length) return d;
    const salin = [...d];
    [salin[i], salin[j]] = [salin[j], salin[i]];
    return salin;
  });
  const totalBobot = kriteria.reduce((s, k) => s + (Number(k.bobot) || 0), 0);

  const kirim = async () => {
    const data = { skuId: unit.id, caraUji, instruksi, status, kriteria: kriteria.map((k) => ({ ...k, bobot: Number(k.bobot) })) };
    const pesan = periksaInstrumen(data);
    setGalat(pesan);
    if (pesan) return;
    setProses(true);
    const r = await simpanInstrumen(data);
    setProses(false);
    if (r.ok) onTutup();
    else setGalat(r.pesan ?? 'Instrumen belum dapat disimpan.');
  };

  return (
    <Modal
      buka
      tutup={onTutup}
      judul={`Instrumen ${unit.tingkat}, ${unit.label}`}
      lebar="max-w-3xl"
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup} disabled={proses}>Batal</button>
          <button className="btn btn-primary" onClick={kirim} disabled={proses}>{proses ? 'Menyimpan...' : 'Simpan'}</button>
        </>
      }
    >
      <p className="rounded-lg bg-pramuka-50 px-3 py-2 text-sm leading-relaxed">{unit.teks}</p>
      {awal?.status === 'ditetapkan' && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Instrumen ini sedang dipakai menilai. Perubahan berlaku untuk penilaian berikutnya; penilaian yang sudah tercatat tidak berubah.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_12rem]">
        <div>
          <label htmlFor="ins-cara" className="label">Cara uji</label>
          <input id="ins-cara" className="input" maxLength={300} value={caraUji} onChange={(e) => setCaraUji(e.target.value)} placeholder="Mis. Tanya jawab lisan (±10 menit)" />
        </div>
        <div>
          <label htmlFor="ins-status" className="label">Status</label>
          <select id="ins-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="draf">Draf (belum dipakai)</option>
            <option value="ditetapkan">Ditetapkan (dipakai menilai)</option>
          </select>
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor="ins-instruksi" className="label">Instruksi untuk penguji <span className="font-normal text-pramuka-500">(tidak terlihat Penegak)</span></label>
        <textarea id="ins-instruksi" className="input min-h-[5rem]" maxLength={1500} value={instruksi} onChange={(e) => setInstruksi(e.target.value)} />
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-2">
        <h3 className="text-base font-bold">Kriteria ({kriteria.length})</h3>
        <p className="text-xs text-pramuka-500">Jumlah bobot {totalBobot}</p>
      </div>
      {kriteria.length === 0 && <p className="mt-2 rounded-lg border border-dashed border-pramuka-300 px-3 py-4 text-center text-sm text-pramuka-600">Belum ada kriteria.</p>}
      <ol className="mt-2 space-y-3">
        {kriteria.map((k, i) => (
          <li key={k.kunci} className="rounded-lg border border-pramuka-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pramuka-100 text-xs font-bold text-pramuka-700">{i + 1}</span>
              <select className="input w-auto" aria-label={`Jenis kriteria ${i + 1}`} value={k.jenis} onChange={(e) => ubah(k.kunci, { jenis: e.target.value })}>
                {JENIS_KRITERIA.map((j) => <option key={j}>{j}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-sm">
                Bobot
                <select className="input w-auto" aria-label={`Bobot kriteria ${i + 1}`} value={k.bobot} onChange={(e) => ubah(k.kunci, { bobot: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5].map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-sm font-semibold">
                <input type="checkbox" checked={k.wajib} onChange={(e) => ubah(k.kunci, { wajib: e.target.checked })} /> Wajib
              </label>
              <span className="ml-auto flex gap-1">
                <button type="button" className="rounded-md p-1.5 text-pramuka-600 hover:bg-pramuka-100 disabled:opacity-30" onClick={() => geser(i, -1)} disabled={i === 0} aria-label={`Naikkan kriteria ${i + 1}`}><Icon nama="panahAtas" className="h-4 w-4" /></button>
                <button type="button" className="rounded-md p-1.5 text-pramuka-600 hover:bg-pramuka-100 disabled:opacity-30" onClick={() => geser(i, 1)} disabled={i === kriteria.length - 1} aria-label={`Turunkan kriteria ${i + 1}`}><Icon nama="panahBawah" className="h-4 w-4" /></button>
                <button type="button" className="rounded-md p-1.5 text-red-700 hover:bg-red-50" onClick={() => setKriteria((d) => d.filter((x) => x.kunci !== k.kunci))} aria-label={`Hapus kriteria ${i + 1}`}><Icon nama="hapus" className="h-4 w-4" /></button>
              </span>
            </div>
            <textarea className="input mt-2 min-h-[3.25rem]" aria-label={`Teks kriteria ${i + 1}`} placeholder="Kriteria atau pertanyaan (terlihat Penegak)" maxLength={400} value={k.teks} onChange={(e) => ubah(k.kunci, { teks: e.target.value })} />
            <textarea className="input mt-2 min-h-[3.25rem] bg-pramuka-50/60" aria-label={`Panduan kriteria ${i + 1}`} placeholder="Panduan penguji: jawaban atau bukti yang diharapkan (tidak terlihat Penegak)" maxLength={1500} value={k.panduan} onChange={(e) => ubah(k.kunci, { panduan: e.target.value })} />
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => setKriteria((d) => [...d, baru()])} disabled={kriteria.length >= MAKS_KRITERIA}>
        <Icon nama="tambah" className="h-4 w-4" /> Tambah kriteria
      </button>

      {galat && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{galat}</p>}
    </Modal>
  );
}

/* ============================== Tab daftar ============================== */

function DaftarInstrumen() {
  const { statusInstrumen } = useApp();
  const { instrumen } = useInstrumen();
  const [tingkat, setTingkat] = useState('');
  const [status, setStatus] = useState('');
  const [cari, setCari] = useState('');
  const [pilih, setPilih] = useState(() => new Set());
  const [mengunduh, setMengunduh] = useState(false);
  const [edit, setEdit] = useState(null);
  const [batas, setBatas] = useState(BATAS_DAFTAR);
  const [proses, setProses] = useState(false);

  const hitung = useMemo(() => {
    const h = { kosong: 0, draf: 0, ditetapkan: 0 };
    for (const u of UNIT) h[statusUnit(instrumen, u.id)] += 1;
    return h;
  }, [instrumen]);

  const tampil = useMemo(() => {
    const kata = cari.trim().toLowerCase();
    return UNIT.filter((u) => (!tingkat || u.tingkat === tingkat)
      && (!status || statusUnit(instrumen, u.id) === status)
      && (!kata || `${u.label} ${u.teks} ${u.id}`.toLowerCase().includes(kata)));
  }, [tingkat, status, cari, instrumen]);

  const bisaDipilih = tampil.filter((u) => statusUnit(instrumen, u.id) !== 'kosong');
  const semuaTerpilih = bisaDipilih.length > 0 && bisaDipilih.every((u) => pilih.has(u.id));
  const alihPilih = (id) => setPilih((d) => { const b = new Set(d); if (b.has(id)) b.delete(id); else b.add(id); return b; });
  const alihSemua = () => setPilih((d) => {
    const b = new Set(d);
    if (semuaTerpilih) bisaDipilih.forEach((u) => b.delete(u.id)); else bisaDipilih.forEach((u) => b.add(u.id));
    return b;
  });

  const unduh = async () => {
    setMengunduh(true);
    try {
      await unduhInstrumenXlsx({ unit: UNIT, instrumen });
    } finally {
      setMengunduh(false);
    }
  };

  const ubahStatus = async (nilai) => {
    const ids = [...pilih];
    if (!ids.length) return;
    if (nilai === 'ditetapkan' && !window.confirm(`Tetapkan ${ids.length} instrumen? Butir-butir itu akan dinilai dengan instrumen, dan penilaian gaya lama untuk butir tersebut ditutup. Pastikan isinya sudah ditinjau.`)) return;
    setProses(true);
    const r = await statusInstrumen(ids, nilai);
    setProses(false);
    if (r.ok) setPilih(new Set());
  };

  const angka = [
    { nilai: UNIT.length, label: 'Butir (unit SKU)' },
    { nilai: hitung.ditetapkan, label: 'Ditetapkan (dipakai)' },
    { nilai: hitung.draf, label: 'Draf' },
    { nilai: hitung.kosong, label: 'Belum ada instrumen' },
  ];

  return (
    <>
      <section className="panel mb-4 grid grid-cols-2 divide-pramuka-100 md:grid-cols-4 md:divide-x">
        {angka.map((a, i) => (
          <div key={a.label} className={`p-4 ${i > 1 ? 'border-t border-pramuka-100 md:border-t-0' : ''}`}>
            <p className="font-display text-3xl font-bold text-pramuka-800">{a.nilai}</p>
            <p className="text-sm text-pramuka-600">{a.label}</p>
          </div>
        ))}
      </section>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Icon nama="cari" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pramuka-400" />
          <input className="input pl-9" placeholder="Cari butir atau isi" aria-label="Cari butir" value={cari} onChange={(e) => { setCari(e.target.value); setBatas(BATAS_DAFTAR); }} />
        </div>
        <select className="input w-full sm:w-36" aria-label="Filter tingkat" value={tingkat} onChange={(e) => { setTingkat(e.target.value); setBatas(BATAS_DAFTAR); }}>
          <option value="">Semua tingkat</option>
          <option>Bantara</option>
          <option>Laksana</option>
        </select>
        <select className="input w-full sm:w-44" aria-label="Filter status" value={status} onChange={(e) => { setStatus(e.target.value); setBatas(BATAS_DAFTAR); }}>
          <option value="">Semua status</option>
          {Object.entries(LABEL_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={semuaTerpilih} onChange={alihSemua} disabled={bisaDipilih.length === 0} /> Pilih semua yang tampil ({bisaDipilih.length})
        </label>
        <button className="btn btn-primary btn-sm" onClick={() => ubahStatus('ditetapkan')} disabled={!pilih.size || proses}>Tetapkan ({pilih.size})</button>
        <button className="btn btn-outline btn-sm" onClick={() => ubahStatus('draf')} disabled={!pilih.size || proses}>Kembalikan ke draf ({pilih.size})</button>
        <button
          className="btn btn-outline btn-sm sm:ml-auto"
          onClick={unduh}
          disabled={hitung.draf + hitung.ditetapkan === 0 || mengunduh}
          title="Berkas memuat panduan penguji (rahasia). Formatnya dapat dimasukkan kembali dengan scripts/instrumen-ke-sql.mjs."
        >
          <Icon nama="unduh" className="h-4 w-4" />{mengunduh ? 'Menyiapkan...' : `Unduh Excel (${hitung.draf + hitung.ditetapkan})`}
        </button>
      </div>

      {tampil.length === 0 ? (
        <Kosong judul="Tidak ada butir yang cocok" teks="Ubah atau bersihkan filter." />
      ) : (
        <ul className="panel divide-y divide-pramuka-100">
          {tampil.slice(0, batas).map((u) => {
            const st = statusUnit(instrumen, u.id);
            const ins = instrumen[u.id];
            return (
              <li key={u.id} className="flex items-start gap-3 p-3">
                <input
                  type="checkbox"
                  className="mt-1.5"
                  aria-label={`Pilih ${u.tingkat} ${u.label}`}
                  checked={pilih.has(u.id)}
                  disabled={st === 'kosong'}
                  onChange={() => alihPilih(u.id)}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    <span className={`mr-1.5 ${CHIP} ${u.tingkat === 'Bantara' ? 'bg-sky-100 text-sky-900 ring-sky-300' : 'bg-amber-100 text-amber-900 ring-amber-300'}`}>{u.tingkat}</span>
                    {u.label}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-pramuka-600">{u.teks}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-pramuka-600">
                    <span className={`${CHIP} ${KELAS_STATUS[st]}`}>{LABEL_STATUS[st]}</span>
                    {ins && <span>{ins.kriteria.length} kriteria{ins.kriteria.some((k) => k.wajib) ? `, ${ins.kriteria.filter((k) => k.wajib).length} wajib` : ''}</span>}
                  </p>
                </div>
                <button className="btn btn-outline btn-sm shrink-0" onClick={() => setEdit(u)}>{st === 'kosong' ? 'Buat' : 'Ubah'}</button>
              </li>
            );
          })}
        </ul>
      )}
      {tampil.length > batas && (
        <div className="mt-3 text-center">
          <button className="btn btn-outline btn-sm" onClick={() => setBatas((b) => b + BATAS_DAFTAR)}>Tampilkan lebih banyak ({tampil.length - batas} lagi)</button>
        </div>
      )}

      {edit && <EditorInstrumen key={edit.id} unit={edit} awal={instrumen[edit.id]} onTutup={() => setEdit(null)} />}
    </>
  );
}

/* ============================== Tab pengaturan ============================== */

function PengaturanInstrumen() {
  const { simpanPengaturanInstrumen } = useApp();
  const { pengaturan } = useInstrumen();
  const awal = (p) => ({ ambang: String(p.ambang), sangatBaik: String(p.pita.sangatBaik), baik: String(p.pita.baik), cukup: String(p.pita.cukup), min: String(p.nilaiWajibMin), gerbang: p.gerbangWajib });
  const [f, setF] = useState(() => awal(pengaturan));
  const [proses, setProses] = useState(false);
  const [galat, setGalat] = useState('');

  const angka = (s) => (/^\d{1,3}$/.test(s) ? Number(s) : NaN);
  const p = {
    ambang: angka(f.ambang),
    pita: { sangatBaik: angka(f.sangatBaik), baik: angka(f.baik), cukup: angka(f.cukup) },
    gerbangWajib: f.gerbang,
    nilaiWajibMin: angka(f.min),
  };
  const pesan = periksaPengaturanInstrumen(p);
  const berubah = JSON.stringify(p) !== JSON.stringify(pengaturan);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value.replace(/\D/g, '').slice(0, 3) }); setGalat(''); };

  const contoh = pesan ? null : hitungSkorInstrumen(
    [{ id: 1, bobot: 1, wajib: false }, { id: 2, bobot: 2, wajib: false }, { id: 3, bobot: 1, wajib: false }, { id: 4, bobot: 1, wajib: false }],
    { 1: 5, 2: 4, 3: 4, 4: 3 }, p,
  );

  const simpan = async () => {
    if (pesan) { setGalat(pesan); return; }
    setProses(true);
    const r = await simpanPengaturanInstrumen(p);
    setProses(false);
    if (!r.ok) setGalat(r.pesan ?? 'Pengaturan belum dapat disimpan.');
  };

  const angkaInput = (k, label, bantuan) => (
    <div key={k}>
      <label htmlFor={`ins-set-${k}`} className="label">{label}</label>
      <input id={`ins-set-${k}`} className="input" inputMode="numeric" value={f[k]} onChange={set(k)} />
      {bantuan && <p className="mt-1 text-xs text-pramuka-500">{bantuan}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <h2 className="text-lg font-bold">Ambang lulus dan predikat</h2>
        <p className="mb-3 text-sm text-pramuka-600">Skor butir (0-100) dihitung dari nilai kriteria. Skor mencapai ambang lulus menghasilkan saran LULUS; di bawahnya perlu diulang. Penguji dapat memilih hasil berbeda dengan catatan alasan.</p>
        <div className="grid gap-3 sm:grid-cols-4">
          {angkaInput('ambang', 'Ambang lulus', 'Bawaan 75.')}
          {angkaInput('sangatBaik', 'Sangat baik, mulai dari')}
          {angkaInput('baik', 'Baik, mulai dari')}
          {angkaInput('cukup', 'Cukup, mulai dari', 'Di bawahnya Kurang.')}
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="text-lg font-bold">Kriteria wajib</h2>
        <p className="mb-3 text-sm text-pramuka-600">Kriteria bertanda Wajib adalah syarat minimal (mis. jumlah kegiatan atau bukti keikutsertaan).</p>
        <label className="flex items-start gap-2 text-sm font-semibold">
          <input type="checkbox" className="mt-1" checked={f.gerbang} onChange={(e) => { setF({ ...f, gerbang: e.target.checked }); setGalat(''); }} />
          <span>
            Kriteria wajib menjadi syarat lulus
            <span className="block text-xs font-normal text-pramuka-600">Bila menyala, saran hasil menjadi perlu diulang jika ada kriteria wajib yang nilainya di bawah batas, walaupun skor total mencapai ambang.</span>
          </span>
        </label>
        <div className="mt-3 sm:w-64">{angkaInput('min', 'Nilai minimal kriteria wajib', 'Antara 2 dan 5. Bawaan 3.')}</div>
      </section>

      <section className="jahitan rounded-lg bg-white px-4 py-3 text-sm text-pramuka-700">
        <p className="font-semibold">Contoh</p>
        {pesan ? (
          <p className="text-red-700">Perbaiki isian dulu: {pesan}</p>
        ) : (
          <p>
            Empat kriteria dengan bobot 1, 2, 1, 1 dan nilai 5, 4, 4, 3 menghasilkan skor <b>{contoh.skor}</b>: saran{' '}
            <b>{contoh.saran === 'lulus' ? `Lulus (predikat ${contoh.nilaiPredikat})` : 'Perlu diulang'}</b>.
          </p>
        )}
        <p className="mt-2 text-xs text-pramuka-500">Perubahan berlaku untuk penilaian berikutnya. Penilaian yang sudah tercatat tidak berubah.</p>
      </section>

      {galat && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{galat}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={simpan} disabled={proses || !!pesan || !berubah}>{proses ? 'Menyimpan...' : 'Simpan pengaturan'}</button>
        <button className="btn btn-outline" onClick={() => { setF(awal(PENGATURAN_INSTRUMEN_BAWAAN)); setGalat(''); }} disabled={proses}>Isi dengan nilai bawaan</button>
      </div>
    </div>
  );
}

/* =================================== Halaman =================================== */

const TAB = [['daftar', 'Instrumen'], ['pengaturan', 'Pengaturan']];

export default function KelolaInstrumen() {
  const { siap, galat } = useInstrumen();
  const [tab, setTab] = useState('daftar');

  return (
    <div className="animasi-naik">
      <h1 className="mb-1 text-2xl font-bold">Instrumen Penilaian SKU</h1>
      <p className="mb-4 text-sm text-pramuka-600">
        Kriteria, bobot, dan panduan penguji untuk tiap butir. Butir yang instrumennya <b>ditetapkan</b> dinilai dengan skor 1-5 per kriteria; butir lain tetap memakai penilaian lama.
        Instruksi dan panduan hanya terlihat penguji.
      </p>

      <div role="tablist" aria-label="Menu instrumen" className="mb-4 inline-flex rounded-lg bg-pramuka-100 p-1">
        {TAB.map(([k, v]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-700 hover:bg-pramuka-200'}`}
          >
            {v}
          </button>
        ))}
      </div>

      {!siap && <div role="status" aria-live="polite"><Kosong judul="Memuat instrumen..." teks="Mengambil instrumen dan pengaturan dari server." /></div>}
      {siap && galat && (
        <Kosong judul="Instrumen belum dapat dimuat" teks={galat}>
          <p className="text-xs text-pramuka-500">Bila pesan ini menyebut basis data belum diperbarui, jalankan migrasi 2026-09-instrumen.sql, lalu muat ulang halaman.</p>
        </Kosong>
      )}
      {siap && !galat && tab === 'daftar' && <DaftarInstrumen />}
      {siap && !galat && tab === 'pengaturan' && <PengaturanInstrumen />}
    </div>
  );
}
