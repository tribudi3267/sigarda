import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import UjiModal from '../components/UjiModal';
import { Icon, Kosong, Modal, ProgressBar } from '../components/ui';
import {
  STATUS_SESI, STATUS_TUGAS, daftarButirKatalog, dariPengajuan, periksaSesi, ringkasButirSesi, ringkasSesi, tugasSesi,
} from '../lib/sesiLogic';
import { fmtHariTanggal, hariIni } from '../lib/format';

const CHIP = 'inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset';
const JEDA_PAPAN_MS = 15000;
const BUTIR = daftarButirKatalog();

const LencanaStatus = ({ status }) => <span className={`${CHIP} ${STATUS_SESI[status]?.kelas ?? ''}`}>{STATUS_SESI[status]?.label ?? status}</span>;

/* ================================ Editor sesi ================================ */

function EditorSesi({ awal, onTutup }) {
  const { users, progress, simpanSesiUjian } = useApp();
  const semuaPeserta = useMemo(
    () => users.filter((u) => u.role === 'peserta').sort((a, b) => (a.kelas ?? '').localeCompare(b.kelas ?? '', 'id', { numeric: true }) || a.nama.localeCompare(b.nama, 'id')),
    [users]
  );
  const [nama, setNama] = useState(awal?.nama ?? '');
  const [tanggal, setTanggal] = useState(awal?.tanggal ?? hariIni());
  const [tempat, setTempat] = useState(awal?.tempat ?? '');
  const [catatan, setCatatan] = useState(awal?.catatan ?? '');
  const [butir, setButir] = useState(() => new Set(awal?.butir ?? []));
  const [peserta, setPeserta] = useState(() => new Set(awal?.peserta ?? []));
  const [cari, setCari] = useState('');
  const [proses, setProses] = useState(false);
  const [galat, setGalat] = useState('');

  const tampil = semuaPeserta.filter((u) => !cari.trim() || `${u.nama} ${u.kelas ?? ''} ${u.sangga ?? ''} ${u.nis ?? ''}`.toLowerCase().includes(cari.trim().toLowerCase()));
  const ganti = (himpunan, set, id) => {
    const s = new Set(himpunan);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    set(s);
  };
  const ambilPengajuan = () => {
    const d = dariPengajuan(progress, users);
    if (!d.peserta.length) {
      setGalat('Belum ada pengajuan yang menunggu untuk diambil.');
      return;
    }
    setGalat('');
    setPeserta(new Set([...peserta, ...d.peserta]));
    setButir(new Set([...butir, ...d.butir]));
  };

  const kirim = async () => {
    const data = { id: awal?.id ?? null, nama: nama.trim(), tanggal, tempat: tempat.trim(), catatan, status: awal?.status ?? 'terjadwal', butir: [...butir], peserta: [...peserta] };
    const pesan = periksaSesi(data);
    setGalat(pesan);
    if (pesan) return;
    setProses(true);
    const r = await simpanSesiUjian(data);
    setProses(false);
    if (r.ok) onTutup(r.data ?? null);
    else setGalat(r.pesan ?? 'Sesi belum dapat disimpan.');
  };

  return (
    <Modal
      buka
      tutup={() => onTutup(null)}
      judul={awal ? 'Ubah sesi ujian' : 'Sesi ujian baru'}
      lebar="max-w-3xl"
      aksi={
        <>
          <button className="btn btn-outline" onClick={() => onTutup(null)} disabled={proses}>Batal</button>
          <button className="btn btn-primary" onClick={kirim} disabled={proses}>{proses ? 'Menyimpan...' : 'Simpan sesi'}</button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
        <div>
          <label htmlFor="ses-nama" className="label">Nama sesi</label>
          <input id="ses-nama" className="input" maxLength={120} value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Mis. Ujian SKU Bantara Semester Ganjil" />
        </div>
        <div>
          <label htmlFor="ses-tgl" className="label">Tanggal</label>
          <input id="ses-tgl" type="date" className="input" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="ses-tempat" className="label">Tempat <span className="font-normal text-pramuka-500">(opsional)</span></label>
          <input id="ses-tempat" className="input" maxLength={120} value={tempat} onChange={(e) => setTempat(e.target.value)} placeholder="Mis. Aula sekolah" />
        </div>
        <div>
          <label htmlFor="ses-cat" className="label">Catatan <span className="font-normal text-pramuka-500">(opsional)</span></label>
          <input id="ses-cat" className="input" maxLength={500} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-bold">Butir yang diuji ({butir.size})</h3>
        <span className="flex gap-3 text-xs font-semibold text-pramuka-700">
          <button type="button" className="underline" onClick={() => setButir(new Set(BUTIR.filter((b) => b.tingkat === 'Bantara').map((b) => b.id)))}>Semua Bantara</button>
          <button type="button" className="underline" onClick={() => setButir(new Set(BUTIR.filter((b) => b.tingkat === 'Laksana').map((b) => b.id)))}>Semua Laksana</button>
          <button type="button" className="underline" onClick={() => setButir(new Set())}>Kosongkan</button>
        </span>
      </div>
      <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-pramuka-200">
        {['Bantara', 'Laksana'].map((t) => (
          <div key={t}>
            <p className="sticky top-0 bg-pramuka-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-pramuka-700">{t}</p>
            {BUTIR.filter((b) => b.tingkat === t).map((b) => (
              <label key={b.id} className="flex cursor-pointer items-start gap-2 border-t border-pramuka-100 px-3 py-1.5 text-sm hover:bg-pramuka-50">
                <input type="checkbox" className="mt-1" checked={butir.has(b.id)} onChange={() => ganti(butir, setButir, b.id)} />
                <span><span className="font-semibold">Butir {b.no}.</span> <span className="text-pramuka-700">{b.teks}</span></span>
              </label>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-bold">Peserta ({peserta.size})</h3>
        <span className="flex gap-3 text-xs font-semibold text-pramuka-700">
          <button type="button" className="underline" onClick={ambilPengajuan}>Ambil dari pengajuan</button>
          <button type="button" className="underline" onClick={() => setPeserta(new Set([...peserta, ...tampil.map((u) => u.id)]))}>Pilih yang tampil</button>
          <button type="button" className="underline" onClick={() => setPeserta(new Set())}>Kosongkan</button>
        </span>
      </div>
      <input className="input mt-2" type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama, kelas, atau sangga" aria-label="Cari peserta" />
      <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-pramuka-200">
        {tampil.length === 0 && <p className="px-3 py-4 text-center text-sm text-pramuka-600">Tidak ada peserta yang cocok.</p>}
        {tampil.map((u) => (
          <label key={u.id} className="flex cursor-pointer items-center gap-2 border-b border-pramuka-100 px-3 py-1.5 text-sm last:border-b-0 hover:bg-pramuka-50">
            <input type="checkbox" checked={peserta.has(u.id)} onChange={() => ganti(peserta, setPeserta, u.id)} />
            <span className="min-w-0 flex-1 truncate font-medium">{u.nama}</span>
            <span className="shrink-0 text-xs text-pramuka-500">{[u.kelas, u.sangga].filter(Boolean).join(' - ')}</span>
          </label>
        ))}
      </div>

      {galat && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}

/* ================================ Papan sesi ================================ */

function KartuAngka({ label, nilai, kelas }) {
  return (
    <div className={`rounded-lg px-3 py-2 ring-1 ring-inset ${kelas}`}>
      <p className="text-2xl font-bold leading-none">{nilai}</p>
      <p className="mt-1 text-xs font-semibold">{label}</p>
    </div>
  );
}

function PapanSesi({ sesi, onKembali, onUbah }) {
  const { user, users, progress, ubahStatusSesiUjian, hapusSesiUjian, bolehHapusSesi, pastikanSesiUjian, muatUlangProgress } = useApp();
  const [cari, setCari] = useState('');
  const [belumSaja, setBelumSaja] = useState(false);
  const [uji, setUji] = useState(null); // { pesertaId, poin }
  const [proses, setProses] = useState(false);
  const [terakhir, setTerakhir] = useState(() => new Date());

  const daftar = useMemo(() => tugasSesi(sesi, users, progress), [sesi, users, progress]);
  const ringkas = useMemo(() => ringkasSesi(daftar), [daftar]);
  const penguji = user?.role === 'penguji';
  const bisaNilai = penguji && sesi.status === 'berlangsung';
  const hilang = sesi.peserta.length - daftar.length;

  // Papan diperbarui berkala selama sesi belum selesai (penguji lain mencatat hasil dari perangkatnya sendiri).
  useEffect(() => {
    if (sesi.status === 'selesai' || uji) return undefined;
    const t = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      await Promise.all([muatUlangProgress(), pastikanSesiUjian(true)]);
      setTerakhir(new Date());
    }, JEDA_PAPAN_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesi.status, sesi.id, uji]);

  const segarkanSekarang = async () => {
    setProses(true);
    await Promise.all([muatUlangProgress(), pastikanSesiUjian(true)]);
    setTerakhir(new Date());
    setProses(false);
  };
  const ubahStatus = async (status) => {
    setProses(true);
    await ubahStatusSesiUjian(sesi.id, status);
    setProses(false);
  };
  const hapus = async () => {
    if (!window.confirm(`Hapus sesi "${sesi.nama}"? Hasil penilaian yang sudah tercatat tidak ikut terhapus.`)) return;
    setProses(true);
    const r = await hapusSesiUjian(sesi.id);
    setProses(false);
    if (r.ok) onKembali();
  };

  const kata = cari.trim().toLowerCase();
  const tampil = daftar.filter((p) => {
    if (kata && !`${p.peserta.nama} ${p.peserta.kelas ?? ''} ${p.peserta.sangga ?? ''}`.toLowerCase().includes(kata)) return false;
    if (belumSaja && !p.tugas.some((t) => t.status === 'menunggu' || t.status === 'proses')) return false;
    return true;
  });

  return (
    <div className="animasi-naik">
      <button className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-pramuka-700 hover:underline" onClick={onKembali}>
        <Icon nama="kembali" className="h-4 w-4" />Semua sesi
      </button>

      <div className="panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{sesi.nama}</h1>
              <LencanaStatus status={sesi.status} />
            </div>
            <p className="mt-1 text-sm text-pramuka-700">{fmtHariTanggal(sesi.tanggal)}{sesi.tempat ? `, ${sesi.tempat}` : ''}</p>
            <p className="mt-1 text-sm text-pramuka-600">Butir yang diuji: {ringkasButirSesi(sesi.butir)}</p>
            {sesi.catatan && <p className="mt-1 text-sm text-pramuka-600">{sesi.catatan}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {sesi.status === 'terjadwal' && <button className="btn btn-gold" onClick={() => ubahStatus('berlangsung')} disabled={proses}>Mulai sesi</button>}
            {sesi.status === 'berlangsung' && <button className="btn btn-primary" onClick={() => ubahStatus('selesai')} disabled={proses}>Selesaikan sesi</button>}
            {sesi.status === 'selesai' && <button className="btn btn-outline" onClick={() => ubahStatus('berlangsung')} disabled={proses}>Buka kembali</button>}
            <button className="btn btn-outline" onClick={() => onUbah(sesi)} disabled={proses}><Icon nama="ubah" className="h-4 w-4" />Ubah</button>
            {bolehHapusSesi && <button className="btn btn-outline text-red-700" onClick={hapus} disabled={proses}><Icon nama="hapus" className="h-4 w-4" />Hapus</button>}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <KartuAngka label="Menunggu" nilai={ringkas.menunggu} kelas="bg-white text-pramuka-800 ring-pramuka-300" />
          <KartuAngka label="Sedang diuji" nilai={ringkas.proses} kelas="bg-amber-50 text-amber-900 ring-amber-300" />
          <KartuAngka label="Lulus" nilai={ringkas.lulus} kelas="bg-emerald-50 text-emerald-900 ring-emerald-300" />
          <KartuAngka label="Perlu diulang" nilai={ringkas.ulang} kelas="bg-red-50 text-red-900 ring-red-300" />
        </div>
        <div className="mt-3">
          <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs text-pramuka-600">
            <span>{ringkas.selesai} dari {ringkas.total} tugas sudah dinilai ({ringkas.persen}%), {ringkas.pesertaSelesai} dari {ringkas.peserta} peserta selesai</span>
            <span>
              Diperbarui {terakhir.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              {' '}
              <button className="font-semibold underline" onClick={segarkanSekarang} disabled={proses}>Segarkan</button>
            </span>
          </div>
          <ProgressBar persen={ringkas.persen} label="Progres sesi" />
        </div>
      </div>

      {!bisaNilai && (
        <p className="mt-3 rounded-lg bg-pramuka-50 px-4 py-2.5 text-sm text-pramuka-700 ring-1 ring-pramuka-200">
          {user?.role === 'admin'
            ? 'Admin Gudep memantau papan ini. Penilaian dilakukan oleh Pembina atau Dewan Ambalan.'
            : sesi.status === 'terjadwal'
              ? 'Tekan "Mulai sesi" agar penguji dapat menilai dari papan ini.'
              : sesi.status === 'selesai'
                ? 'Sesi sudah selesai. Tekan "Buka kembali" bila masih ada peserta yang perlu dinilai.'
                : 'Hanya Pembina dan Dewan Ambalan yang dapat menilai.'}
        </p>
      )}
      {hilang > 0 && <p className="mt-3 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-900 ring-1 ring-amber-300">{hilang} peserta pada sesi ini tidak lagi ada di daftar anggota dan dilewati.</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input className="input w-full sm:w-72" type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama, kelas, atau sangga" aria-label="Cari peserta" />
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={belumSaja} onChange={(e) => setBelumSaja(e.target.checked)} />Hanya yang belum selesai
        </label>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-pramuka-600" aria-label="Keterangan warna">
        {Object.entries(STATUS_TUGAS).map(([k, v]) => <li key={k}><span className={`${CHIP} ${v.kelas}`}>{v.label}</span></li>)}
      </ul>

      <ul className="mt-3 space-y-2">
        {tampil.length === 0 && <li><Kosong judul="Tidak ada peserta" teks="Ubah pencarian atau saringan di atas." /></li>}
        {tampil.map(({ peserta, tugas }) => {
          const hitung = tugas.filter((t) => t.status !== 'terkunci' && t.status !== 'sudahLulus');
          const selesai = hitung.filter((t) => t.status === 'lulus' || t.status === 'ulang').length;
          return (
            <li key={peserta.id} className="panel p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{peserta.nama} <span className="text-xs font-normal text-pramuka-500">{[peserta.kelas, peserta.sangga].filter(Boolean).join(' - ')}</span></p>
                <p className="text-xs text-pramuka-600">{selesai}/{hitung.length} tugas</p>
              </div>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {tugas.map((t) => {
                  const kelas = `${CHIP} ${STATUS_TUGAS[t.status].kelas}`;
                  const isi = (
                    <>
                      {t.status === 'lulus' && <Icon nama="cek" className="mr-1 h-3 w-3" />}
                      {t.label}
                      <span className="sr-only">: {STATUS_TUGAS[t.status].label}</span>
                    </>
                  );
                  const dapatDibuka = bisaNilai && ['menunggu', 'proses', 'lulus', 'ulang'].includes(t.status);
                  return (
                    <li key={t.poin.id}>
                      {dapatDibuka
                        ? <button className={`${kelas} hover:brightness-95`} title={`${t.poin.teks} - ${STATUS_TUGAS[t.status].label}. Klik untuk menilai.`} onClick={() => setUji({ pesertaId: peserta.id, poin: t.poin })}>{isi}</button>
                        : <span className={kelas} title={`${t.poin.teks} - ${STATUS_TUGAS[t.status].label}`}>{isi}</span>}
                    </li>
                  );
                })}
                {tugas.length === 0 && <li className="text-xs text-pramuka-500">Tidak ada butir yang berlaku untuk peserta ini.</li>}
              </ul>
            </li>
          );
        })}
      </ul>

      {uji && <UjiModal pesertaId={uji.pesertaId} poin={uji.poin} tanggalAwal={sesi.tanggal} onTutup={() => setUji(null)} />}
    </div>
  );
}

/* ================================ Daftar sesi ================================ */

const urutSesi = (a, b) => {
  const rank = (s) => (s.status === 'berlangsung' ? 0 : s.status === 'terjadwal' ? 1 : 2);
  return rank(a) - rank(b) || (a.status === 'selesai' ? b.tanggal.localeCompare(a.tanggal) : a.tanggal.localeCompare(b.tanggal));
};

export default function SesiUjian() {
  const { users, progress, sesiUjian, sesiUjianGalat, sesiUjianSiap, pastikanSesiUjian } = useApp();
  const [bukaId, setBukaId] = useState(null);
  const [editor, setEditor] = useState(null); // null | 'baru' | sesi
  const [galatMuat, setGalatMuat] = useState('');

  useEffect(() => {
    pastikanSesiUjian().then((r) => setGalatMuat(r?.ok === false ? r.pesan : ''));
  }, [pastikanSesiUjian]);

  const sesi = sesiUjian.find((s) => s.id === bukaId) ?? null;
  const daftar = useMemo(() => [...sesiUjian].sort(urutSesi), [sesiUjian]);

  const tutupEditor = (idBaru) => {
    setEditor(null);
    if (idBaru) setBukaId(idBaru);
  };

  if (!sesiUjianSiap) {
    return galatMuat
      ? <Kosong judul="Sesi ujian belum dapat dimuat" teks={galatMuat}><button className="btn btn-primary btn-sm" onClick={() => pastikanSesiUjian(true).then((r) => setGalatMuat(r?.ok === false ? r.pesan : ''))}>Coba lagi</button></Kosong>
      : <div role="status" aria-live="polite"><Kosong judul="Memuat sesi ujian..." teks="Mengambil jadwal dan daftar peserta dari server." /></div>;
  }

  return (
    <div className="animasi-naik">
      {sesi
        ? <PapanSesi sesi={sesi} onKembali={() => setBukaId(null)} onUbah={setEditor} />
        : (
          <>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">Sesi ujian</h1>
                <p className="mt-1 max-w-2xl text-sm text-pramuka-600">
                  Jadwalkan ujian bersama: pilih butir dan pesertanya, lalu pantau hasilnya dari satu papan. Penilaian tetap memakai lembar instrumen dan PIN penguji seperti biasa.
                </p>
              </div>
              <button className="btn btn-gold" onClick={() => setEditor('baru')} disabled={!!sesiUjianGalat}><Icon nama="tambah" className="h-4 w-4" />Sesi baru</button>
            </div>

            {sesiUjianGalat && <p role="alert" className="mb-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-300">Fitur sesi ujian belum aktif. {sesiUjianGalat}</p>}

            {daftar.length === 0 && !sesiUjianGalat && <Kosong judul="Belum ada sesi ujian" teks="Buat sesi pertama untuk menjadwalkan ujian bersama." />}

            <ul className="space-y-2">
              {daftar.map((s) => {
                const r = ringkasSesi(tugasSesi(s, users, progress));
                return (
                  <li key={s.id}>
                    <button className="panel block w-full p-4 text-left transition hover:bg-pramuka-50" onClick={() => setBukaId(s.id)}>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold">{s.nama}</span>
                        <LencanaStatus status={s.status} />
                      </span>
                      <span className="mt-0.5 block text-sm text-pramuka-700">{fmtHariTanggal(s.tanggal)}{s.tempat ? `, ${s.tempat}` : ''}</span>
                      <span className="mt-2 block text-xs text-pramuka-600">{s.peserta.length} peserta, {ringkasButirSesi(s.butir)}, {r.persen}% selesai</span>
                      <span className="mt-1.5 block"><ProgressBar persen={r.persen} label={`Progres ${s.nama}`} /></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      {editor && <EditorSesi awal={editor === 'baru' ? null : editor} onTutup={tutupEditor} />}
    </div>
  );
}
