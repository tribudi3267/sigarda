import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import usePelantikanSaka from '../hooks/usePelantikanSaka';
import { fmtTanggal, hariIni } from '../lib/format';
import {
  TINGKAT_PELANTIKAN, calonPelantikan, kelompokPelantikan, labelTingkatPelantikan, periksaPelantikan, periksaSaka, ringkasPelantikan, SARAN_SAKA,
} from '../lib/pelantikanLogic';
import SumberPeraturan from '../components/SumberPeraturan';
import { Avatar, Field, Icon, Kosong, Modal } from '../components/ui';

const TAB = [{ id: 'pelantikan', label: 'Pelantikan' }, { id: 'saka', label: 'Saka' }];

/** Catat pelantikan satu upacara untuk banyak Penegak sekaligus (semua atau tidak sama sekali di server). */
function FormPelantikan({ data, onSelesai }) {
  const { api, users, progress, notify } = useApp();
  const [tingkat, setTingkat] = useState('bantara');
  const [tanggal, setTanggal] = useState(hariIni());
  const [tempat, setTempat] = useState('');
  const [catatan, setCatatan] = useState('');
  const [agendaId, setAgendaId] = useState('');
  const [agenda, setAgenda] = useState([]);
  const [termasukSudah, setTermasukSudah] = useState(false);
  const [cari, setCari] = useState('');
  const [pilih, setPilih] = useState(() => new Set());
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => { api().muatAgenda().then((r) => { if (r.ok) setAgenda(r.data); }); }, [api]);
  useEffect(() => { setPilih(new Set()); setAgendaId(''); }, [tingkat, termasukSudah]);

  const calon = useMemo(() => calonPelantikan({ users, progress, pelantikan: data.pelantikan, tingkat, termasukSudah }), [users, progress, data.pelantikan, tingkat, termasukSudah]);
  const tampil = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return k ? calon.filter((u) => `${u.nama} ${u.kelas ?? ''} ${u.sangga ?? ''}`.toLowerCase().includes(k)) : calon;
  }, [calon, cari]);
  const agendaTingkat = agenda.filter((a) => a.jenis === `pelantikan_${tingkat}`);
  const sudahTercatat = (id) => data.pelantikan.some((p) => p.pesertaId === id && p.tingkat === tingkat);

  const ubahPilih = (id) => setPilih((s) => { const b = new Set(s); if (b.has(id)) b.delete(id); else b.add(id); return b; });
  const pilihSemuaTampil = () => setPilih((s) => { const b = new Set(s); tampil.forEach((u) => b.add(u.id)); return b; });

  const kirim = async () => {
    if (sibuk) return;
    const pesan = periksaPelantikan({ tingkat, tanggal, tempat, catatan, jumlah: pilih.size });
    if (pesan) { setGalat(pesan); return; }
    setSibuk(true);
    setGalat('');
    const r = await api().catatPelantikan({ tingkat, tanggal, tempat, pesertaIds: [...pilih], agendaId: agendaId ? Number(agendaId) : null, catatan });
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); return; }
    notify(`Pelantikan ${labelTingkatPelantikan(tingkat)} dicatat untuk ${r.data} Penegak.`);
    setPilih(new Set());
    onSelesai();
  };

  return (
    <section className="panel mb-5 p-4" aria-label="Catat pelantikan">
      <h2 className="mb-1 text-lg font-bold">Catat pelantikan</h2>
      <p className="mb-3 text-sm text-pramuka-600">
        Catat sesudah upacara terlaksana. Yang tampil hanya Penegak aktif yang sudah menyelesaikan seluruh butir SKU tingkat itu. Satu upacara dicatat sekaligus; bila ada yang tidak layak, seluruh pencatatan dibatalkan.
      </p>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Tingkat" htmlFor="pl-tingkat">
          <select id="pl-tingkat" className="input" value={tingkat} onChange={(e) => setTingkat(e.target.value)}>
            {TINGKAT_PELANTIKAN.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Tanggal pelantikan" htmlFor="pl-tanggal">
          <input id="pl-tanggal" type="date" className="input" max={hariIni()} value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
        </Field>
        <Field label="Tempat" htmlFor="pl-tempat">
          <input id="pl-tempat" className="input" maxLength={120} value={tempat} onChange={(e) => setTempat(e.target.value)} placeholder="Contoh: Lapangan Upacara SMAN 1 Bukateja" />
        </Field>
        <Field label="Kegiatan di Agenda (opsional)" htmlFor="pl-agenda" bantuan={agendaTingkat.length ? undefined : `Belum ada kegiatan Agenda berjenis pelantikan ${labelTingkatPelantikan(tingkat)}.`}>
          <select id="pl-agenda" className="input" value={agendaId} onChange={(e) => setAgendaId(e.target.value)} disabled={!agendaTingkat.length}>
            <option value="">Tanpa tautan</option>
            {agendaTingkat.map((a) => <option key={a.id} value={a.id}>{a.judul}, {fmtTanggal(a.tanggal)}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Catatan (opsional)" htmlFor="pl-catatan">
        <input id="pl-catatan" className="input" maxLength={200} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
      </Field>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Penegak ({calon.length} layak, {pilih.size} dipilih)</p>
        <label className="flex items-center gap-2 text-xs font-medium text-pramuka-700">
          <input type="checkbox" className="h-4 w-4 accent-pramuka-800" checked={termasukSudah} onChange={(e) => setTermasukSudah(e.target.checked)} />
          Termasuk yang sudah tercatat (untuk koreksi)
        </label>
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        <input className="input min-w-0 flex-1" aria-label="Cari Penegak" placeholder="Cari nama, kelas, atau sangga" value={cari} onChange={(e) => setCari(e.target.value)} />
        <button type="button" className="btn btn-outline btn-sm" onClick={pilihSemuaTampil} disabled={!tampil.length}>Pilih semua yang tampil</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setPilih(new Set())} disabled={!pilih.size}>Kosongkan</button>
      </div>
      {calon.length === 0 ? (
        <Kosong judul="Belum ada Penegak yang layak" teks={`Belum ada Penegak aktif yang menyelesaikan seluruh butir SKU ${labelTingkatPelantikan(tingkat)}${termasukSudah ? '' : ' dan belum dilantik'}.`} />
      ) : (
        <ul className="max-h-72 divide-y divide-pramuka-100 overflow-y-auto rounded-lg border border-pramuka-100 text-sm">
          {tampil.map((u) => (
            <li key={u.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-pramuka-50">
                <input type="checkbox" className="h-4 w-4 shrink-0 accent-pramuka-800" checked={pilih.has(u.id)} onChange={() => ubahPilih(u.id)} />
                <span className="min-w-0 flex-1 truncate font-medium">{u.nama}</span>
                <span className="shrink-0 text-xs text-pramuka-500">{u.kelas || '-'}{sudahTercatat(u.id) ? ', sudah tercatat' : ''}</span>
              </label>
            </li>
          ))}
          {tampil.length === 0 && <li className="px-3 py-3 text-pramuka-500">Tidak ada yang cocok dengan pencarian.</li>}
        </ul>
      )}
      {galat && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{galat}</p>}
      <div className="mt-4">
        <button className="btn btn-primary" onClick={kirim} disabled={sibuk || !pilih.size}>{sibuk ? 'Menyimpan...' : `Catat pelantikan (${pilih.size} Penegak)`}</button>
      </div>
    </section>
  );
}

/** Riwayat pelantikan per upacara, dengan hapus per Penegak (bila salah catat). */
function RiwayatPelantikan({ data, onSelesai }) {
  const { api, users, notify } = useApp();
  const kelompok = useMemo(() => kelompokPelantikan(data.pelantikan, users), [data.pelantikan, users]);
  const [buka, setBuka] = useState(null);
  const [hapus, setHapus] = useState(null); // { id, nama, tingkat }
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');

  const konfirmasi = async () => {
    setSibuk(true);
    const r = await api().hapusPelantikan(hapus.id);
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); return; }
    notify('Catatan pelantikan dihapus.');
    setHapus(null);
    setGalat('');
    onSelesai();
  };

  return (
    <section aria-label="Riwayat pelantikan">
      <h2 className="mb-2 text-lg font-bold">Riwayat pelantikan ({kelompok.length} upacara)</h2>
      {kelompok.length === 0 ? (
        <Kosong judul="Belum ada pelantikan tercatat" teks="Catat pelantikan pertama lewat formulir di atas." />
      ) : (
        <ul className="panel divide-y divide-pramuka-100">
          {kelompok.map((g) => (
            <li key={g.kunci} className="p-4">
              <button className="flex w-full flex-wrap items-baseline justify-between gap-2 text-left" aria-expanded={buka === g.kunci} onClick={() => setBuka(buka === g.kunci ? null : g.kunci)}>
                <span className="font-semibold">Pelantikan {labelTingkatPelantikan(g.tingkat)}, {fmtTanggal(g.tanggal)}</span>
                <span className="text-xs text-pramuka-600">{g.tempat}, {g.anggota.length} Penegak</span>
              </button>
              {buka === g.kunci && (
                <ul className="animasi-naik mt-2 divide-y divide-pramuka-100 rounded-lg border border-pramuka-100 text-sm">
                  {g.anggota.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                      <span className="min-w-0 truncate font-medium">{a.nama} <span className="text-xs font-normal text-pramuka-500">{a.kelas}</span></span>
                      <button className="shrink-0 text-xs font-semibold text-red-700 underline underline-offset-2" onClick={() => { setGalat(''); setHapus({ id: a.id, nama: a.nama, tingkat: g.tingkat }); }}>Hapus</button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      <Modal
        buka={!!hapus}
        tutup={() => setHapus(null)}
        judul="Hapus catatan pelantikan?"
        aksi={
          <>
            <button className="btn btn-outline" onClick={() => setHapus(null)} disabled={sibuk}>Batal</button>
            <button className="btn btn-primary" onClick={konfirmasi} disabled={sibuk}>{sibuk ? 'Menghapus...' : 'Hapus'}</button>
          </>
        }
      >
        <p className="text-sm text-pramuka-800">Catatan pelantikan {hapus ? labelTingkatPelantikan(hapus.tingkat) : ''} untuk <b>{hapus?.nama}</b> dihapus. Gunakan ini bila salah mencatat; untuk koreksi tanggal atau tempat cukup catat ulang.</p>
        {galat && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{galat}</p>}
      </Modal>
    </section>
  );
}

/** Tambah atau ubah keanggotaan Saka. `awal` = catatan yang diubah (peserta tetap), atau null untuk menambah. */
function ModalSaka({ awal, onTutup, onSelesai }) {
  const { api, daftarPeserta, notify } = useApp();
  const [pesertaId, setPesertaId] = useState(awal?.pesertaId ?? '');
  const [cari, setCari] = useState('');
  const [saka, setSaka] = useState(awal?.saka ?? '');
  const [tanggalMasuk, setTanggalMasuk] = useState(awal?.tanggalMasuk ?? '');
  const [status, setStatus] = useState(awal?.status ?? 'aktif');
  const [tanggalSelesai, setTanggalSelesai] = useState(awal?.tanggalSelesai ?? '');
  const [suratUrl, setSuratUrl] = useState(awal?.suratUrl ?? '');
  const [catatan, setCatatan] = useState(awal?.catatan ?? '');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);

  const terpilih = daftarPeserta.find((u) => u.id === pesertaId);
  const hasilCari = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return k.length < 2 ? [] : daftarPeserta.filter((u) => `${u.nama} ${u.kelas ?? ''}`.toLowerCase().includes(k)).slice(0, 6);
  }, [cari, daftarPeserta]);

  const simpan = async () => {
    if (sibuk) return;
    if (!pesertaId) { setGalat('Pilih Penegak.'); return; }
    const pesan = periksaSaka({ saka, tanggalMasuk, status, tanggalSelesai: status === 'selesai' ? tanggalSelesai : null, suratUrl, catatan });
    if (pesan) { setGalat(pesan); return; }
    setSibuk(true);
    setGalat('');
    const r = await api().simpanSaka({ id: awal?.id ?? null, pesertaId, saka, tanggalMasuk, status, tanggalSelesai: status === 'selesai' ? tanggalSelesai : null, suratUrl, catatan });
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); return; }
    notify(awal ? 'Catatan Saka diperbarui.' : 'Keanggotaan Saka dicatat.');
    onSelesai();
  };

  return (
    <Modal
      buka
      tutup={onTutup}
      judul={awal ? 'Ubah keanggotaan Saka' : 'Tambah keanggotaan Saka'}
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup} disabled={sibuk}>Batal</button>
          <button className="btn btn-primary" onClick={simpan} disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
        </>
      }
    >
      {awal ? (
        <p className="mb-4 text-sm font-semibold">{terpilih?.nama ?? 'Penegak'} <span className="font-normal text-pramuka-500">{terpilih?.kelas}</span></p>
      ) : (
        <Field label="Penegak" htmlFor="sk-cari" bantuan={terpilih ? undefined : 'Ketik sedikitnya 2 huruf nama atau kelas.'}>
          {terpilih ? (
            <p className="flex items-center justify-between gap-2 rounded-md bg-pramuka-50 px-3 py-2 text-sm">
              <span className="font-semibold">{terpilih.nama} <span className="font-normal text-pramuka-500">{terpilih.kelas}</span></span>
              <button type="button" className="text-xs font-semibold text-pramuka-700 underline" onClick={() => setPesertaId('')}>Ganti</button>
            </p>
          ) : (
            <>
              <input id="sk-cari" className="input" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari Penegak" autoComplete="off" />
              {hasilCari.length > 0 && (
                <ul className="mt-1 divide-y divide-pramuka-100 rounded-lg border border-pramuka-100 text-sm">
                  {hasilCari.map((u) => (
                    <li key={u.id}><button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-pramuka-50" onClick={() => setPesertaId(u.id)}><Avatar nama={u.nama} ukuran="h-6 w-6" /><span className="min-w-0 truncate font-medium">{u.nama}</span><span className="ml-auto shrink-0 text-xs text-pramuka-500">{u.kelas}</span></button></li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Field>
      )}
      <Field label="Nama Saka" htmlFor="sk-saka">
        <input id="sk-saka" className="input" list="sk-saran" maxLength={60} value={saka} onChange={(e) => setSaka(e.target.value)} placeholder="Contoh: Saka Bhayangkara" />
        <datalist id="sk-saran">{SARAN_SAKA.map((s) => <option key={s} value={s} />)}</datalist>
      </Field>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Tanggal masuk" htmlFor="sk-masuk">
          <input id="sk-masuk" type="date" className="input" max={hariIni()} value={tanggalMasuk} onChange={(e) => setTanggalMasuk(e.target.value)} />
        </Field>
        <Field label="Status" htmlFor="sk-status">
          <select id="sk-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="aktif">Masih aktif</option>
            <option value="selesai">Sudah selesai</option>
          </select>
        </Field>
      </div>
      {status === 'selesai' && (
        <Field label="Tanggal selesai" htmlFor="sk-selesai">
          <input id="sk-selesai" type="date" className="input" max={hariIni()} value={tanggalSelesai} onChange={(e) => setTanggalSelesai(e.target.value)} />
        </Field>
      )}
      <Field label="Tautan surat keterangan aktif Saka (opsional)" htmlFor="sk-url" bantuan="Alamat berkas (mis. Google Drive) berawalan https://. Dokumen tidak disimpan di aplikasi.">
        <input id="sk-url" className="input" maxLength={500} value={suratUrl} onChange={(e) => setSuratUrl(e.target.value)} placeholder="https://" />
      </Field>
      <Field label="Catatan (opsional)" htmlFor="sk-catatan">
        <input id="sk-catatan" className="input" maxLength={200} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
      </Field>
      {galat && <p role="alert" className="text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}

/** Daftar keanggotaan Saka seluruh Penegak dengan tambah, ubah, dan hapus. */
function PanelSaka({ data, onSelesai }) {
  const { api, users, notify } = useApp();
  const [cari, setCari] = useState('');
  const [modal, setModal] = useState(null); // null | { awal }
  const [hapus, setHapus] = useState(null);
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const nama = (id) => users.find((u) => u.id === id);
  const baris = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return data.saka.filter((s) => !k || `${nama(s.pesertaId)?.nama ?? ''} ${s.saka}`.toLowerCase().includes(k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.saka, users, cari]);

  const konfirmasi = async () => {
    setSibuk(true);
    const r = await api().hapusSaka(hapus.id);
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); return; }
    notify('Catatan Saka dihapus.');
    setHapus(null);
    setGalat('');
    onSelesai();
  };

  return (
    <section aria-label="Keanggotaan Saka">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input min-w-0 flex-1" aria-label="Cari Penegak atau Saka" placeholder="Cari nama Penegak atau Saka" value={cari} onChange={(e) => setCari(e.target.value)} />
        <button className="btn btn-primary btn-sm" onClick={() => setModal({ awal: null })}><Icon nama="tambah" className="h-4 w-4" /> Tambah</button>
      </div>
      {baris.length === 0 ? (
        <Kosong judul={data.saka.length ? 'Tidak ada yang cocok' : 'Belum ada keanggotaan Saka tercatat'} teks={data.saka.length ? 'Ubah kata pencarian.' : 'Catat Penegak yang menjadi anggota Saka (mis. untuk surat keterangan aktif Saka pada portofolio Garuda).'} />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-pramuka-50 text-xs uppercase tracking-wide text-pramuka-600">
              <tr><th className="px-3 py-2">Penegak</th><th className="px-3 py-2">Saka</th><th className="px-3 py-2">Masuk</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Surat</th><th className="px-3 py-2"><span className="sr-only">Aksi</span></th></tr>
            </thead>
            <tbody className="divide-y divide-pramuka-100">
              {baris.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2 font-medium">{nama(s.pesertaId)?.nama ?? '(anggota dihapus)'} <span className="text-xs font-normal text-pramuka-500">{nama(s.pesertaId)?.kelas}</span></td>
                  <td className="px-3 py-2">{s.saka}</td>
                  <td className="whitespace-nowrap px-3 py-2">{fmtTanggal(s.tanggalMasuk)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{s.status === 'aktif' ? 'Aktif' : `Selesai ${fmtTanggal(s.tanggalSelesai)}`}</td>
                  <td className="px-3 py-2">{s.suratUrl ? <a href={s.suratUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-pramuka-700 underline underline-offset-2">Buka</a> : <span className="text-pramuka-400">-</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button className="text-xs font-semibold text-pramuka-700 underline underline-offset-2" onClick={() => setModal({ awal: s })}>Ubah</button>
                    <button className="ml-3 text-xs font-semibold text-red-700 underline underline-offset-2" onClick={() => { setGalat(''); setHapus(s); }}>Hapus</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && <ModalSaka awal={modal.awal} onTutup={() => setModal(null)} onSelesai={() => { setModal(null); onSelesai(); }} />}
      <Modal
        buka={!!hapus}
        tutup={() => setHapus(null)}
        judul="Hapus catatan Saka?"
        aksi={
          <>
            <button className="btn btn-outline" onClick={() => setHapus(null)} disabled={sibuk}>Batal</button>
            <button className="btn btn-primary" onClick={konfirmasi} disabled={sibuk}>{sibuk ? 'Menghapus...' : 'Hapus'}</button>
          </>
        }
      >
        <p className="text-sm text-pramuka-800">Catatan <b>{hapus?.saka}</b> untuk <b>{hapus ? nama(hapus.pesertaId)?.nama : ''}</b> dihapus.</p>
        {galat && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{galat}</p>}
      </Modal>
    </section>
  );
}

/**
 * Pelantikan dan Saka (Tahap 2, G1; Pembina dan Admin): mencatat pelantikan Bantara dan Laksana per upacara, dan keanggotaan Saka. Hak ditegakkan server
 * (sg_pelantikan_*, sg_saka_*); Penegak melihat miliknya di Beranda.
 */
export default function Pelantikan() {
  const data = usePelantikanSaka();
  const [tab, setTab] = useState('pelantikan');
  const r = ringkasPelantikan(data.pelantikan, data.saka);

  return (
    <div className="animasi-naik">
      <h1 className="mb-1 text-2xl font-bold">Pelantikan dan Saka</h1>
      <p className="mb-2 text-sm text-pramuka-600">
        Catatan pelantikan Bantara dan Laksana (tempat dan tanggal, untuk daftar isian Kwarcab dan syarat Garuda) serta keanggotaan Saka.
      </p>
      <SumberPeraturan className="mb-4" rujukan={['sku-penegak-2011', 'adart-2023']} />

      {data.galat && <p role="alert" className="mb-4 text-sm font-medium text-red-700">{data.galat}</p>}
      <p className="mb-4 text-sm text-pramuka-700" aria-live="polite">
        {data.memuat ? 'Memuat...' : `${r.bantara} Penegak dilantik Bantara, ${r.laksana} dilantik Laksana, ${r.sakaAktif} Penegak aktif di Saka.`}
      </p>

      <div role="tablist" aria-label="Pelantikan dan Saka" className="mb-4 inline-flex flex-wrap rounded-lg bg-pramuka-100 p-1">
        {TAB.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === t.id ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-700 hover:bg-pramuka-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pelantikan' && (
        <>
          <FormPelantikan data={data} onSelesai={data.muat} />
          <RiwayatPelantikan data={data} onSelesai={data.muat} />
        </>
      )}
      {tab === 'saka' && <PanelSaka data={data} onSelesai={data.muat} />}
    </div>
  );
}
