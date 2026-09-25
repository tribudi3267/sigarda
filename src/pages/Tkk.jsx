import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import useTkk from '../hooks/useTkk';
import { fmtTanggal, hariIni } from '../lib/format';
import { pembinaAtauAdmin } from '../lib/hakLogic';
import {
  AMBANG_TKK_BAWAAN, BIDANG_TKK, KATALOG_TKK, TINGKAT_TKK, capaianPeserta, hitungKemajuan, labelTingkatTkk, periksaAmbang, periksaCapaian, periksaKrida, pilihanTkk, teksKemajuan,
  tingkatBerikut, tingkatTertinggi,
} from '../lib/tkkLogic';
import SumberPeraturan from '../components/SumberPeraturan';
import { Avatar, Field, Kosong, Modal, ProgressBar } from '../components/ui';

const NAMA_TKK = Object.fromEntries(KATALOG_TKK.map((t) => [t.id, t.nama]));
const WARNA_TINGKAT = { purwa: 'bg-pramuka-100 text-pramuka-800', madya: 'bg-sky-100 text-sky-900', utama: 'bg-emerald-100 text-emerald-900' };

/** Satu lencana tingkat TKK. */
const LencanaTingkat = ({ tingkat }) => <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${WARNA_TINGKAT[tingkat]}`}>{labelTingkatTkk(tingkat)}</span>;

/** Catat atau koreksi satu capaian TKK (Pembina dan Admin). `awal` = { tkkId, tingkat, ...baris } untuk koreksi, atau { tkkId?, tingkat? } untuk baru. */
function ModalCapaian({ peserta, awal, capaianSaya, onTutup, onSelesai }) {
  const { api, notify } = useApp();
  const baru = !awal?.id;
  const [tkkId, setTkkId] = useState(awal?.tkkId ?? '');
  const [tingkat, setTingkat] = useState(awal?.tingkat ?? 'purwa');
  const [tanggal, setTanggal] = useState(awal?.tanggal ?? hariIni());
  const [penguji1, setPenguji1] = useState(awal?.penguji1 ?? '');
  const [penguji2, setPenguji2] = useState(awal?.penguji2 ?? '');
  const [melatih, setMelatih] = useState(awal?.melatih ?? '');
  const [buktiUrl, setBuktiUrl] = useState(awal?.buktiUrl ?? '');
  const [catatan, setCatatan] = useState(awal?.catatan ?? '');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const pilihan = useMemo(() => pilihanTkk(peserta.agama), [peserta.agama]);

  const pilihTkk = (id) => { setTkkId(id); if (baru && id) setTingkat(tingkatBerikut(capaianSaya, id) ?? 'utama'); };

  const simpan = async () => {
    if (sibuk) return;
    if (!tkkId) { setGalat('Pilih TKK.'); return; }
    const pesan = periksaCapaian({ tkkId, tingkat, tanggal, penguji1, penguji2, melatih, buktiUrl, catatan, agama: peserta.agama });
    if (pesan) { setGalat(pesan); return; }
    setSibuk(true);
    setGalat('');
    const r = await api().catatTkk({ pesertaId: peserta.id, tkkId, tingkat, tanggal, penguji1, penguji2, melatih, buktiUrl, catatan });
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); return; }
    notify(`TKK ${NAMA_TKK[tkkId]} ${labelTingkatTkk(tingkat)} dicatat.`);
    onSelesai();
  };

  return (
    <Modal
      buka
      tutup={onTutup}
      judul={baru ? 'Catat TKK' : 'Ubah catatan TKK'}
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup} disabled={sibuk}>Batal</button>
          <button className="btn btn-primary" onClick={simpan} disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
        </>
      }
    >
      <p className="mb-4 text-sm font-semibold">{peserta.nama} <span className="font-normal text-pramuka-500">{peserta.kelas}</span></p>
      <Field label="TKK" htmlFor="tk-tkk" bantuan="Yang tampil hanya TKK untuk Penegak; yang khusus satu agama hanya untuk agama itu.">
        <select id="tk-tkk" className="input" value={tkkId} onChange={(e) => pilihTkk(e.target.value)} disabled={!baru}>
          <option value="">Pilih TKK</option>
          {pilihan.map((b) => (
            <optgroup key={b.bidang} label={`Bidang ${b.bidang}: ${b.singkat}`}>
              {b.daftar.map((t) => <option key={t.id} value={t.id}>{t.nama}</option>)}
            </optgroup>
          ))}
        </select>
      </Field>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Tingkat" htmlFor="tk-tingkat" bantuan="Madya butuh Purwa, Utama butuh Madya (jenis TKK yang sama).">
          <select id="tk-tingkat" className="input" value={tingkat} onChange={(e) => setTingkat(e.target.value)} disabled={!baru}>
            {TINGKAT_TKK.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Tanggal lulus" htmlFor="tk-tanggal">
          <input id="tk-tanggal" type="date" className="input" max={hariIni()} value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
        </Field>
        <Field label="Penguji 1" htmlFor="tk-p1" bantuan="Tim penguji 2 orang: Pembina, pembantu Pembina, atau ahli (cukup nama).">
          <input id="tk-p1" className="input" maxLength={80} value={penguji1} onChange={(e) => setPenguji1(e.target.value)} />
        </Field>
        <Field label="Penguji 2" htmlFor="tk-p2">
          <input id="tk-p2" className="input" maxLength={80} value={penguji2} onChange={(e) => setPenguji2(e.target.value)} />
        </Field>
      </div>
      <Field label="Bukti melatih" htmlFor="tk-melatih" bantuan="Penegak wajib telah melatih sedikitnya seorang Pramuka sampai TKK tingkat di bawahnya. Tulis siapa dan di mana.">
        <input id="tk-melatih" className="input" maxLength={200} value={melatih} onChange={(e) => setMelatih(e.target.value)} placeholder="Contoh: Andi, Siaga Gugus Depan 02" />
      </Field>
      <Field label="Tautan surat keterangan atau piagam (opsional)" htmlFor="tk-url" bantuan="Alamat berkas (mis. Google Drive) berawalan https://. Dokumen tidak disimpan di aplikasi.">
        <input id="tk-url" className="input" maxLength={500} value={buktiUrl} onChange={(e) => setBuktiUrl(e.target.value)} placeholder="https://" />
      </Field>
      <Field label="Catatan (opsional)" htmlFor="tk-catatan">
        <input id="tk-catatan" className="input" maxLength={200} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
      </Field>
      {galat && <p role="alert" className="text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}

/** Tambah atau ubah TKK Krida. */
function ModalKrida({ peserta, awal, onTutup, onSelesai }) {
  const { api, notify } = useApp();
  const [nama, setNama] = useState(awal?.nama ?? '');
  const [saka, setSaka] = useState(awal?.saka ?? '');
  const [tanggal, setTanggal] = useState(awal?.tanggal ?? hariIni());
  const [buktiUrl, setBuktiUrl] = useState(awal?.buktiUrl ?? '');
  const [catatan, setCatatan] = useState(awal?.catatan ?? '');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);

  const simpan = async () => {
    if (sibuk) return;
    const pesan = periksaKrida({ nama, saka, tanggal, buktiUrl, catatan });
    if (pesan) { setGalat(pesan); return; }
    setSibuk(true);
    setGalat('');
    const r = await api().simpanKrida({ id: awal?.id ?? null, pesertaId: peserta.id, nama, saka, tanggal, buktiUrl, catatan });
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); return; }
    notify(awal ? 'Catatan TKK Krida diperbarui.' : 'TKK Krida dicatat.');
    onSelesai();
  };

  return (
    <Modal
      buka
      tutup={onTutup}
      judul={awal ? 'Ubah TKK Krida' : 'Catat TKK Krida'}
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup} disabled={sibuk}>Batal</button>
          <button className="btn btn-primary" onClick={simpan} disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
        </>
      }
    >
      <p className="mb-4 text-sm font-semibold">{peserta.nama} <span className="font-normal text-pramuka-500">{peserta.kelas}</span></p>
      <Field label="Nama TKK Krida" htmlFor="kr-nama"><input id="kr-nama" className="input" maxLength={80} value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Contoh: Krida Lalu Lintas" /></Field>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Saka (opsional)" htmlFor="kr-saka"><input id="kr-saka" className="input" maxLength={60} value={saka} onChange={(e) => setSaka(e.target.value)} placeholder="Contoh: Saka Bhayangkara" /></Field>
        <Field label="Tanggal lulus" htmlFor="kr-tanggal"><input id="kr-tanggal" type="date" className="input" max={hariIni()} value={tanggal} onChange={(e) => setTanggal(e.target.value)} /></Field>
      </div>
      <Field label="Tautan piagam (opsional)" htmlFor="kr-url" bantuan="Alamat berkas berawalan https://. Dokumen tidak disimpan di aplikasi."><input id="kr-url" className="input" maxLength={500} value={buktiUrl} onChange={(e) => setBuktiUrl(e.target.value)} placeholder="https://" /></Field>
      <Field label="Catatan (opsional)" htmlFor="kr-catatan"><input id="kr-catatan" className="input" maxLength={200} value={catatan} onChange={(e) => setCatatan(e.target.value)} /></Field>
      {galat && <p role="alert" className="text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}

/** Kemajuan menuju ambang Garuda: tiga bilah, daftar TKK wajib Utama, dan jumlah per bidang. */
function KartuKemajuan({ k, ambang }) {
  const persen = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 100);
  const perluMadya = ambang.utamaWajib.length + ambang.madya;
  return (
    <section className="panel mb-4 p-4" aria-label="Kemajuan menuju syarat Garuda">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Kemajuan menuju syarat Garuda</h2>
        <span className={`rounded px-2 py-0.5 text-xs font-bold ${k.penuh ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>{k.penuh ? 'Ambang terpenuhi' : 'Belum terpenuhi'}</span>
      </div>
      <div className="space-y-3 text-sm">
        {[
          ['Total TKK', k.total, ambang.total, k.syarat.total],
          [`TKK Madya ke atas (termasuk ${ambang.utamaWajib.length} Utama wajib)`, k.madyaKeAtas, perluMadya, k.syarat.madya],
          ['TKK wajib bertingkat Utama', ambang.utamaWajib.length - k.kurang.wajib, ambang.utamaWajib.length, k.syarat.wajib],
        ].map(([label, a, b, oke]) => (
          <div key={label}>
            <div className="mb-1 flex items-baseline justify-between gap-2"><span className="font-semibold">{label}</span><span className={oke ? 'font-bold text-emerald-700' : 'text-pramuka-700'}>{a} dari {b}</span></div>
            <ProgressBar persen={persen(a, b)} tinggi="h-2.5" label={label} />
          </div>
        ))}
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-pramuka-700">TKK wajib Utama ({ambang.utamaWajib.length - k.kurang.wajib} dari {ambang.utamaWajib.length})</summary>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {k.wajib.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-2 rounded bg-pramuka-50 px-3 py-1.5">
              <span className="min-w-0 truncate font-medium">{w.nama}</span>
              {w.tingkat ? <LencanaTingkat tingkat={w.tingkat} /> : <span className="text-xs text-pramuka-500">belum</span>}
            </li>
          ))}
        </ul>
      </details>
      <p className="mt-3 text-xs text-pramuka-600">
        Sebaran per bidang: {Object.entries(BIDANG_TKK).map(([no, b]) => `${b.singkat} ${k.perBidang[no]}`).join(', ')}. Standar ini minimal dan boleh dilampaui; TKK bertingkat lebih tinggi ikut dihitung untuk tingkat di bawahnya.
      </p>
    </section>
  );
}

/** Semua TKK, TKK Krida, dan kemajuan satu Penegak. `boleh` = Pembina atau Admin (dapat mencatat, mengubah, menghapus). */
function PanelPenegak({ peserta, data, boleh }) {
  const { api, notify } = useApp();
  const milik = useMemo(() => capaianPeserta(data.capaian, peserta.id), [data.capaian, peserta.id]);
  const kemajuan = useMemo(() => hitungKemajuan(milik, data.ambang), [milik, data.ambang]);
  const tertinggi = useMemo(() => tingkatTertinggi(milik), [milik]);
  const krida = data.krida.filter((x) => x.pesertaId === peserta.id);
  const perTkk = useMemo(() => {
    const p = new Map();
    for (const c of milik) p.set(c.tkkId, [...(p.get(c.tkkId) ?? []), c]);
    return [...p.entries()].sort((a, b) => (KATALOG_TKK.find((t) => t.id === a[0])?.urut ?? 0) - (KATALOG_TKK.find((t) => t.id === b[0])?.urut ?? 0));
  }, [milik]);
  const [modal, setModal] = useState(null); // { jenis: 'capaian' | 'krida', awal }
  const [hapus, setHapus] = useState(null); // { jenis, id, teks }
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');

  const selesai = () => { setModal(null); data.muat(); };
  const konfirmasiHapus = async () => {
    setSibuk(true);
    const r = hapus.jenis === 'krida' ? await api().hapusKrida(hapus.id) : await api().hapusTkk(hapus.id);
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); return; }
    notify('Catatan dihapus.');
    setHapus(null);
    setGalat('');
    data.muat();
  };

  return (
    <div>
      <KartuKemajuan k={kemajuan} ambang={data.ambang} />

      <section className="mb-4" aria-label="Capaian TKK">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">TKK ({perTkk.length})</h2>
          {boleh && <button className="btn btn-primary btn-sm" onClick={() => setModal({ jenis: 'capaian', awal: null })}>Catat TKK</button>}
        </div>
        {perTkk.length === 0 ? (
          <Kosong judul="Belum ada TKK tercatat" teks={boleh ? 'Catat TKK pertama lewat tombol di atas. TKK dapat dikenakan sesudah Penegak Bantara.' : 'Pembina mencatat TKK yang sudah kamu lulus.'} />
        ) : (
          <ul className="panel divide-y divide-pramuka-100">
            {perTkk.map(([id, baris]) => {
              const berikut = tingkatBerikut(milik, id);
              const bidang = KATALOG_TKK.find((t) => t.id === id)?.bidang;
              return (
                <li key={id} className="p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">{NAMA_TKK[id] ?? id} <LencanaTingkat tingkat={tertinggi[id]} /></p>
                    <span className="text-xs text-pramuka-500">Bidang {bidang}: {BIDANG_TKK[bidang]?.singkat}</span>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-pramuka-700">
                    {baris.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="min-w-0">
                          <LencanaTingkat tingkat={c.tingkat} /> {fmtTanggal(c.tanggal)}, penguji {c.penguji1} dan {c.penguji2}. Melatih: {c.melatih}.
                          {c.buktiUrl && <> <a href={c.buktiUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-pramuka-700 underline underline-offset-2">bukti</a></>}
                          {c.catatan && <span className="text-pramuka-500"> ({c.catatan})</span>}
                        </span>
                        {boleh && (
                          <span className="shrink-0 whitespace-nowrap text-xs">
                            <button className="font-semibold text-pramuka-700 underline underline-offset-2" onClick={() => setModal({ jenis: 'capaian', awal: c })}>Ubah</button>
                            <button className="ml-3 font-semibold text-red-700 underline underline-offset-2" onClick={() => { setGalat(''); setHapus({ jenis: 'capaian', id: c.id, teks: `${NAMA_TKK[id]} ${labelTingkatTkk(c.tingkat)}` }); }}>Hapus</button>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {boleh && berikut && (
                    <button className="btn btn-outline btn-sm mt-2" onClick={() => setModal({ jenis: 'capaian', awal: { tkkId: id, tingkat: berikut } })}>Catat tingkat {labelTingkatTkk(berikut)}</button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mb-4" aria-label="TKK Krida">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">TKK Krida ({krida.length})</h2>
          {boleh && <button className="btn btn-outline btn-sm" onClick={() => setModal({ jenis: 'krida', awal: null })}>Catat Krida</button>}
        </div>
        {krida.length === 0 ? (
          <p className="text-sm text-pramuka-600">Belum ada. Portofolio Garuda Kwarcab meminta piagam TKK Krida (minimal 2).</p>
        ) : (
          <ul className="panel divide-y divide-pramuka-100 text-sm">
            {krida.map((x) => (
              <li key={x.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-2">
                <span className="min-w-0"><b>{x.nama}</b>{x.saka ? `, ${x.saka}` : ''}, {fmtTanggal(x.tanggal)}
                  {x.buktiUrl && <> <a href={x.buktiUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-pramuka-700 underline underline-offset-2">piagam</a></>}
                </span>
                {boleh && (
                  <span className="shrink-0 whitespace-nowrap text-xs">
                    <button className="font-semibold text-pramuka-700 underline underline-offset-2" onClick={() => setModal({ jenis: 'krida', awal: x })}>Ubah</button>
                    <button className="ml-3 font-semibold text-red-700 underline underline-offset-2" onClick={() => { setGalat(''); setHapus({ jenis: 'krida', id: x.id, teks: x.nama }); }}>Hapus</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {modal?.jenis === 'capaian' && <ModalCapaian peserta={peserta} awal={modal.awal} capaianSaya={milik} onTutup={() => setModal(null)} onSelesai={selesai} />}
      {modal?.jenis === 'krida' && <ModalKrida peserta={peserta} awal={modal.awal} onTutup={() => setModal(null)} onSelesai={selesai} />}
      <Modal
        buka={!!hapus}
        tutup={() => setHapus(null)}
        judul="Hapus catatan?"
        aksi={
          <>
            <button className="btn btn-outline" onClick={() => setHapus(null)} disabled={sibuk}>Batal</button>
            <button className="btn btn-primary" onClick={konfirmasiHapus} disabled={sibuk}>{sibuk ? 'Menghapus...' : 'Hapus'}</button>
          </>
        }
      >
        <p className="text-sm text-pramuka-800">Catatan <b>{hapus?.teks}</b> untuk <b>{peserta.nama}</b> dihapus. Gunakan ini bila salah mencatat; untuk koreksi cukup catat ulang. Tingkat yang masih ditopang tingkat di atasnya tidak dapat dihapus lebih dulu.</p>
        {galat && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{galat}</p>}
      </Modal>
    </div>
  );
}

/** Ambang kesiapan Garuda: dilihat semua, diubah Pembina dan Admin. */
function PanelAmbang({ data, boleh }) {
  const { api, notify } = useApp();
  const [total, setTotal] = useState(String(data.ambang.total));
  const [madya, setMadya] = useState(String(data.ambang.madya));
  const [wajib, setWajib] = useState(() => new Set(data.ambang.utamaWajib));
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const semua = KATALOG_TKK.filter((t) => t.golongan === 'penegak');

  const ubahWajib = (id) => setWajib((s) => { const b = new Set(s); if (b.has(id)) b.delete(id); else b.add(id); return b; });
  const nilai = () => ({ total: Number(total), madya: Number(madya), utamaWajib: semua.filter((t) => wajib.has(t.id)).map((t) => t.id) });
  const simpan = async () => {
    if (sibuk) return;
    const n = nilai();
    const pesan = periksaAmbang(n);
    if (pesan) { setGalat(pesan); return; }
    setSibuk(true);
    setGalat('');
    const r = await api().simpanAmbangTkk(n);
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); return; }
    notify('Ambang TKK tersimpan.');
    data.muat();
  };
  const bawaan = () => { setTotal(String(AMBANG_TKK_BAWAAN.total)); setMadya(String(AMBANG_TKK_BAWAAN.madya)); setWajib(new Set(AMBANG_TKK_BAWAAN.utamaWajib)); setGalat(''); };

  return (
    <section className="panel p-4" aria-label="Ambang kesiapan Garuda">
      <h2 className="mb-1 text-lg font-bold">Ambang kesiapan Garuda</h2>
      <p className="mb-3 text-sm text-pramuka-600">
        Standar minimal (dapat dilampaui): jumlah TKK berbeda, jumlah TKK Madya di luar yang Utama, dan daftar TKK wajib bertingkat Utama. Bawaannya mengikuti pedoman Kwarcab Purbalingga 2026 (45 TKK: 10 Utama, 3 Madya, sisanya Purwa).
        {!boleh && ' Hanya Pembina dan Admin Gudep yang dapat mengubahnya.'}
      </p>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Total TKK" htmlFor="am-total"><input id="am-total" type="number" min="1" max="200" className="input" value={total} onChange={(e) => setTotal(e.target.value)} disabled={!boleh} /></Field>
        <Field label="TKK Madya (di luar yang Utama)" htmlFor="am-madya"><input id="am-madya" type="number" min="0" max="100" className="input" value={madya} onChange={(e) => setMadya(e.target.value)} disabled={!boleh} /></Field>
      </div>
      <p className="mb-1 text-sm font-semibold">TKK wajib Utama ({wajib.size})</p>
      <ul className="mb-3 grid max-h-64 gap-x-4 overflow-y-auto rounded-lg border border-pramuka-100 p-2 text-sm sm:grid-cols-2">
        {semua.map((t) => (
          <li key={t.id}>
            <label className="flex cursor-pointer items-center gap-2 py-0.5">
              <input type="checkbox" className="h-4 w-4 shrink-0 accent-pramuka-800" checked={wajib.has(t.id)} onChange={() => ubahWajib(t.id)} disabled={!boleh} />
              <span className="min-w-0 truncate">{t.nama}</span>
            </label>
          </li>
        ))}
      </ul>
      {galat && <p role="alert" className="mb-2 text-sm font-medium text-red-700">{galat}</p>}
      {boleh && (
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={simpan} disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan ambang'}</button>
          <button className="btn btn-outline" onClick={bawaan} disabled={sibuk}>Kembalikan ke bawaan</button>
        </div>
      )}
    </section>
  );
}

/** Daftar Penegak dengan kemajuannya (pengurus): pilih satu untuk melihat dan mengelola TKK-nya. */
function DaftarPenegak({ data, onPilih }) {
  const { daftarPeserta } = useApp();
  const [cari, setCari] = useState('');
  const baris = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return daftarPeserta
      .map((u) => ({ u, k: hitungKemajuan(capaianPeserta(data.capaian, u.id), data.ambang) }))
      .filter((x) => !k ? x.k.total > 0 : `${x.u.nama} ${x.u.kelas ?? ''}`.toLowerCase().includes(k))
      .sort((a, b) => b.k.total - a.k.total || a.u.nama.localeCompare(b.u.nama, 'id'))
      .slice(0, 40);
  }, [daftarPeserta, data.capaian, data.ambang, cari]);
  return (
    <section aria-label="Daftar Penegak">
      <input className="input mb-3" aria-label="Cari Penegak" placeholder="Cari nama atau kelas Penegak untuk mencatat TKK" value={cari} onChange={(e) => setCari(e.target.value)} />
      {baris.length === 0 ? (
        <Kosong judul={cari ? 'Tidak ada yang cocok' : 'Belum ada TKK tercatat'} teks={cari ? 'Ubah kata pencarian.' : 'Cari Penegak di atas, lalu catat TKK pertamanya.'} />
      ) : (
        <ul className="panel divide-y divide-pramuka-100">
          {baris.map(({ u, k }) => (
            <li key={u.id}>
              <button className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-pramuka-50" onClick={() => onPilih(u.id)}>
                <Avatar nama={u.nama} ukuran="h-8 w-8" />
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{u.nama}</span><span className="block text-xs text-pramuka-500">{u.kelas || '-'}</span></span>
                <span className="shrink-0 text-right text-xs text-pramuka-700">{teksKemajuan(k, data.ambang)}{k.penuh && <b className="ml-1 text-emerald-700">terpenuhi</b>}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const TAB = [{ id: 'penegak', label: 'Penegak' }, { id: 'ambang', label: 'Ambang Garuda' }];

/**
 * Tanda Kecakapan Khusus (Tahap 2, G2). Penegak melihat kemajuan dan capaian miliknya; Pembina dan Admin mencatat capaian bertingkat (Purwa, Madya, Utama), TKK Krida, dan mengatur
 * ambang kesiapan Garuda. Hak ditegakkan server (sg_tkk_*). Syarat tiap SKK tidak disalin: lihat berkas peraturan (tautan di atas).
 */
export default function Tkk() {
  const { user, daftarPesertaSemua } = useApp();
  const data = useTkk();
  const kelola = pembinaAtauAdmin(user);
  const pengurus = user.role !== 'peserta';
  const [tab, setTab] = useState('penegak');
  const [pilih, setPilih] = useState(null);
  const peserta = pengurus ? daftarPesertaSemua.find((u) => u.id === pilih) : user;

  return (
    <div className="animasi-naik">
      <h1 className="mb-1 text-2xl font-bold">Tanda Kecakapan Khusus (TKK)</h1>
      <p className="mb-2 text-sm text-pramuka-600">
        Capaian TKK bertingkat Purwa, Madya, dan Utama, TKK Krida, dan kemajuan menuju syarat Garuda. TKK dapat dikenakan sesudah Penegak Bantara; diuji tim 2 orang dan diberikan oleh Pembina yang membina.
      </p>
      <SumberPeraturan
        className="mb-4"
        rujukan={[{ id: 'tkk-134-1976', bagian: 'petunjuk penyelenggaraan (tingkat, tim penguji, syarat melatih)' }, { id: 'skk-132-1979', bagian: 'daftar SKK dan gambar TKK' }, { id: 'penabung-01-2024', bagian: 'SKK Penabung dan Cakap Keuangan' }, { id: 'garuda-038-2017', bagian: 'syarat TKK Penegak Garuda' }]}
      />
      {data.galat && <p role="alert" className="mb-4 text-sm font-medium text-red-700">{data.galat}</p>}
      {data.memuat && <p className="mb-4 text-sm text-pramuka-600" role="status">Memuat...</p>}

      {pengurus && (
        <div role="tablist" aria-label="TKK" className="mb-4 inline-flex flex-wrap rounded-lg bg-pramuka-100 p-1">
          {TAB.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === t.id ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-700 hover:bg-pramuka-200'}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {pengurus && tab === 'ambang' && <PanelAmbang key={JSON.stringify(data.ambang)} data={data} boleh={kelola} />}
      {(!pengurus || tab === 'penegak') && (
        pengurus && !peserta ? (
          <DaftarPenegak data={data} onPilih={setPilih} />
        ) : (
          <>
            {pengurus && (
              <button className="mb-3 text-sm font-semibold text-pramuka-700 underline underline-offset-2" onClick={() => setPilih(null)}>Kembali ke daftar Penegak</button>
            )}
            {pengurus && peserta && <p className="mb-3 text-lg font-bold">{peserta.nama} <span className="text-sm font-normal text-pramuka-500">{peserta.kelas}</span></p>}
            <PanelPenegak peserta={peserta} data={data} boleh={kelola && (peserta.status ?? 'aktif') === 'aktif'} />
          </>
        )
      )}
    </div>
  );
}
