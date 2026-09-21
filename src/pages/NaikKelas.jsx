import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { SEMUA_ROMBEL, tahunAjaranKini, geserTahunAjaran, KELAS_ROMBEL } from '../lib/rombelLogic';
import {
  AKSI, LABEL_AKSI, LABEL_AKSI_CATAT, LABEL_STATUS, bangunBaris, gabungkanBerkas, hitungStatus, ringkasanTeks, rombelLanjutanSama,
  susunPermintaan, tahunAjaranBaruBawaan, tahunLulus, tingkatRombel,
} from '../lib/naikKelasLogic';
import { bacaExcelNaikKelas, unduhBerkasNaikKelas } from '../lib/naikKelasExcel';
import { BadgeStatus, Icon, Kosong, Modal } from '../components/ui';

const MAKS_BYTE = 5 * 1024 * 1024;
const KELAS_SEKARANG = ['', ...KELAS_ROMBEL];

const tanggalPendek = (iso) => {
  try { return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return String(iso).slice(0, 10); }
};

/** Hasil pemeriksaan server: ringkasan, baris bermasalah (galat), dan peringatan. */
function Pratinjau({ hasil }) {
  const { ringkasan: s, baris } = hasil;
  const galat = baris.filter((b) => b.hasil === 'galat');
  const peringatan = baris.filter((b) => b.hasil === 'ubah' && b.pesan.length > 0);
  return (
    <div role="status" className="mt-4 rounded-lg border border-pramuka-200 bg-white p-4">
      <h3 className="text-sm font-bold">Hasil pemeriksaan</h3>
      {galat.length === 0 ? (
        <p className="mt-1 text-sm font-semibold text-emerald-800">
          Berkas benar. Akan diterapkan: {ringkasanTeks(s).join(', ') || 'tidak ada perubahan'}.
        </p>
      ) : (
        <p role="alert" className="mt-1 text-sm font-semibold text-red-700">{galat.length} baris bermasalah. Perbaiki dulu; belum ada yang diubah.</p>
      )}
      {s.pengajuan_batal > 0 && galat.length === 0 && (
        <p className="mt-1 text-xs text-amber-900">{s.pengajuan_batal} pengajuan uji yang masih berjalan akan dibatalkan (milik Penegak yang menjadi nonaktif atau alumni).</p>
      )}
      {galat.length > 0 && (
        <ul className="mt-2 max-h-56 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-red-800">
          {galat.map((b) => <li key={b.no}>{b.nama || b.username || 'Baris ' + b.no}: {b.pesan.join(' ')}</li>)}
        </ul>
      )}
      {peringatan.length > 0 && (
        <details className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <summary className="cursor-pointer font-semibold">{peringatan.length} peringatan (periksa, tidak menghalangi)</summary>
          <ul className="mt-1 max-h-56 list-disc space-y-0.5 overflow-y-auto pl-5">
            {peringatan.map((b) => <li key={b.no}>{b.nama}: {b.pesan.join(' ')}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Riwayat kenaikan kelas: batch (dengan tombol Batalkan pada yang terakhir) dan perubahan status satu per satu. */
function Riwayat({ ulang }) {
  const { muatNaikKelas, batalkanNaikKelas } = useApp();
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState('');

  const muatRef = useRef(muatNaikKelas); // fungsi konteks berganti tiap render; ref mencegah muat ulang tak perlu
  muatRef.current = muatNaikKelas;
  const muat = useCallback(async () => {
    const r = await muatRef.current();
    if (r.ok) { setData(r.data); setGalat(''); } else setGalat(r.pesan);
  }, []);
  useEffect(() => { muat(); }, [muat, ulang]);

  const terakhir = data?.batch.find((b) => !b.dibatalkanPada);
  const batalkan = async (b) => {
    if (!window.confirm(`Batalkan kenaikan kelas tahun ajaran ${b.tahunAjaran}? Kelas, status, dan tahun kelulusan Penegak dikembalikan seperti sebelum kenaikan. Pengajuan uji yang sudah dibatalkan tidak dikembalikan.`)) return;
    setSibuk(true); setPesan('');
    const r = await batalkanNaikKelas(b.id);
    setSibuk(false);
    if (!r.ok) setPesan(r.pesan);
    else muat();
  };

  if (galat) return <p role="alert" className="text-sm text-red-700">Riwayat belum dapat dimuat: {galat}</p>;
  if (!data) return <p className="text-sm text-pramuka-600">Memuat riwayat...</p>;
  const tunggal = data.log.filter((l) => l.batchId == null).slice(0, 15);
  return (
    <div>
      {pesan && <p role="alert" className="mb-2 text-sm font-medium text-red-700">{pesan}</p>}
      {data.batch.length === 0 ? (
        <p className="text-sm text-pramuka-600">Belum ada kenaikan kelas.</p>
      ) : (
        <ul className="space-y-2">
          {data.batch.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-pramuka-200 bg-white px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-semibold">Tahun ajaran {b.tahunAjaran} <span className="font-normal text-pramuka-600">· {tanggalPendek(b.waktu)}{b.olehNama ? `, oleh ${b.olehNama}` : ''}</span></p>
                <p className="text-xs text-pramuka-700">{ringkasanTeks(b.ringkasan).join(', ')}{b.ringkasan?.pengajuan_batal ? `; ${b.ringkasan.pengajuan_batal} pengajuan uji dibatalkan` : ''}</p>
              </div>
              {b.dibatalkanPada ? (
                <span className="rounded-full bg-pramuka-100 px-2 py-0.5 text-xs font-semibold text-pramuka-700">Dibatalkan {tanggalPendek(b.dibatalkanPada)}</span>
              ) : terakhir?.id === b.id ? (
                <button className="btn btn-outline btn-sm" disabled={sibuk} onClick={() => batalkan(b)}>{sibuk ? 'Membatalkan...' : 'Batalkan kenaikan ini'}</button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {tunggal.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-bold">Perubahan status satu per satu (terbaru)</h3>
          <ul className="mt-1 space-y-1 text-xs text-pramuka-800">
            {tunggal.map((l) => (
              <li key={l.id}>
                {tanggalPendek(l.waktu)}: <span className="font-semibold">{l.pesertaNama}</span> {(LABEL_AKSI_CATAT[l.aksi] ?? l.aksi).toLowerCase()}
                {l.keKelas && l.keKelas !== l.dariKelas ? ` (${l.dariKelas ?? '-'} ke ${l.keKelas})` : ''}{l.olehNama ? `, oleh ${l.olehNama}` : ''}{l.catatan ? ` (${l.catatan})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Naik kelas (Admin Gudep). Satu tabel untuk seluruh Penegak yang belum alumni, sudah terisi bawaan: kelas X = Tidak lanjut (tandai yang
 * melanjutkan), kelas XI aktif = Lanjut ke XII dengan nomor rombel yang sama, kelas XII = Lulus. Isi dapat diubah di layar atau lewat Excel;
 * "Periksa" menampilkan hasil dari server tanpa mengubah apa pun; "Terapkan" menerapkan semuanya (atau tidak sama sekali) dan dapat dibatalkan.
 */
export default function NaikKelas() {
  const { users, naikKelas } = useApp();
  const inputFile = useRef(null);
  const taKini = tahunAjaranKini();
  const [ta, setTa] = useState(() => tahunAjaranBaruBawaan());
  const [baris, setBaris] = useState(() => bangunBaris(users));
  const [kelas, setKelas] = useState('');
  const [cari, setCari] = useState('');
  const [hasil, setHasil] = useState(null); // { data } hasil pemeriksaan server; dikosongkan bila isian berubah
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');
  const [info, setInfo] = useState('');
  const [dilewati, setDilewati] = useState([]);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [riwayatKe, setRiwayatKe] = useState(0);

  const jumlah = useMemo(() => hitungStatus(users), [users]);
  const opsiTa = [geserTahunAjaran(taKini, -1), taKini, geserTahunAjaran(taKini, 1)];
  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return baris.filter((b) => (!kelas || String(b.rombelSekarang).startsWith(`${kelas}-`)) && (!q || `${b.nama} ${b.nis}`.toLowerCase().includes(q)));
  }, [baris, kelas, cari]);
  const permintaan = useMemo(() => susunPermintaan(baris), [baris]);
  const hitungAksi = useMemo(() => {
    const h = { lanjut: 0, tidak_lanjut: 0, lulus: 0, kosong: 0 };
    for (const b of baris) h[b.aksi || 'kosong'] += 1;
    return h;
  }, [baris]);

  const ubahIsi = (fn) => { setBaris(fn); setHasil(null); setGalat(''); setInfo(''); };
  const ubahBaris = (id, potongan) => ubahIsi((b) => b.map((x) => (x.id === id ? { ...x, ...potongan } : x)));
  const pilihAksi = (b, aksi) => ubahBaris(b.id, { aksi, ...(aksi === 'lanjut' && !b.rombelBaru ? { rombelBaru: rombelLanjutanSama(b.rombelSekarang) } : {}) });
  const aturSemuaTampil = (aksi) => {
    const ids = new Set(tersaring.map((b) => b.id));
    ubahIsi((semua) => semua.map((x) => (ids.has(x.id) ? { ...x, aksi, ...(aksi === 'lanjut' && !x.rombelBaru ? { rombelBaru: rombelLanjutanSama(x.rombelSekarang) } : {}) } : x)));
  };
  const kembalikanBawaan = () => { ubahIsi(() => bangunBaris(users)); setDilewati([]); };

  const pilihFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setGalat(''); setInfo(''); setDilewati([]);
    if (!/\.xlsx$/i.test(file.name)) return setGalat('Gunakan file Excel berformat .xlsx. Unduh berkas dari tombol di atas agar formatnya sesuai.');
    if (file.size > MAKS_BYTE) return setGalat('Ukuran file terlalu besar (maksimal 5 MB).');
    setSibuk(true);
    try {
      const g = gabungkanBerkas(baris, await bacaExcelNaikKelas(await file.arrayBuffer()));
      setBaris(g.baris); setHasil(null); setDilewati(g.dilewati);
      setInfo(`${g.terisi} baris diisi dari berkas. Periksa hasilnya di tabel lalu tekan "Periksa".`);
    } catch (err) {
      setGalat(err.message);
    } finally {
      setSibuk(false);
    }
    return undefined;
  };

  const periksa = async () => {
    setSibuk(true); setGalat(''); setInfo('');
    const r = await naikKelas(ta, permintaan, false);
    setSibuk(false);
    if (!r.ok) { setHasil(null); setGalat(r.pesan); return; }
    setHasil({ data: r.data });
  };
  const terapkan = async () => {
    setKonfirmasi(false); setSibuk(true); setGalat('');
    const r = await naikKelas(ta, permintaan, true);
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); return; }
    setHasil(null); setDilewati([]);
    setRiwayatKe((n) => n + 1);
    setInfo('Kenaikan kelas diterapkan. Jangan lupa mengatur penugasan penguji untuk tahun ajaran baru di menu Anggota > Penugasan.');
  };

  // Sesudah data anggota disegarkan (mis. sesudah menerapkan atau membatalkan), isi tabel dibangun ulang dari data terbaru.
  const petaUsers = useRef(users);
  useEffect(() => {
    if (petaUsers.current !== users) { petaUsers.current = users; setBaris(bangunBaris(users)); setHasil(null); }
  }, [users]);

  const bisaTerapkan = hasil && hasil.data.galat === 0 && (hasil.data.ringkasan.lanjut + hasil.data.ringkasan.tidak_lanjut + hasil.data.ringkasan.lulus) > 0;

  return (
    <div className="animasi-naik">
      <h1 className="mb-1 text-2xl font-bold">Naik kelas</h1>
      <p className="mb-4 text-sm text-pramuka-700">
        Dilakukan setahun sekali di awal tahun ajaran. Rombel kelas XI berbeda dari kelas X karena peminatan, jadi rombel baru diisi per Penegak;
        dari XI ke XII komposisi rombel tetap. Yang tidak melanjutkan Pramuka menjadi <b>nonaktif</b> (masih siswa, hanya dapat dilihat), dan menjadi <b>alumni</b> saat lulus kelas XII.
      </p>

      <div className="mb-4 grid grid-cols-3 gap-2 sm:max-w-md">
        {['aktif', 'nonaktif', 'alumni'].map((s) => (
          <div key={s} className="rounded-lg border border-pramuka-200 bg-white px-3 py-2 text-center">
            <p className="font-display text-2xl font-bold text-pramuka-800">{jumlah[s]}</p>
            <p className="text-xs font-semibold text-pramuka-600">{LABEL_STATUS[s]}</p>
          </div>
        ))}
      </div>

      <section className="rounded-lg border border-pramuka-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="nk-ta" className="label">Tahun ajaran yang baru dimulai</label>
            <select id="nk-ta" className="input w-auto" value={ta} onChange={(e) => { setTa(e.target.value); setHasil(null); }}>
              {opsiTa.map((t) => <option key={t} value={t}>{t}{t === taKini ? ' (berjalan)' : ''}</option>)}
            </select>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => unduhBerkasNaikKelas(baris, ta)}>
            <Icon nama="unduh" className="h-4 w-4" /> Unduh berkas Excel
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => inputFile.current?.click()} disabled={sibuk}>
            <Icon nama="unggah" className="h-4 w-4" /> Unggah berkas terisi
          </button>
          <input ref={inputFile} type="file" accept=".xlsx" className="sr-only" aria-label="Pilih berkas Excel naik kelas" onChange={pilihFile} />
          <button className="btn btn-outline btn-sm" onClick={kembalikanBawaan} disabled={sibuk}>Isian bawaan</button>
        </div>
        <p className="mt-2 text-xs text-pramuka-600">
          Yang lulus pada kenaikan ini tercatat lulus tahun ajaran {tahunLulus(ta)}. Isian bawaan: kelas X = Tidak lanjut (tandai yang melanjutkan), kelas XI aktif = Lanjut ke XII (nomor rombel sama), kelas XII = Lulus.
        </p>
        {info && <p role="status" className="mt-3 text-sm font-semibold text-emerald-800">{info}</p>}
        {dilewati.length > 0 && (
          <div role="alert" className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <p className="font-semibold">{dilewati.length} baris berkas dilewati:</p>
            <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
              {dilewati.map((d, i) => <li key={i}>Baris {d.no}: {d.pesan}</li>)}
            </ul>
          </div>
        )}
      </section>

      <section className="mt-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input className="input min-w-[180px] flex-1" placeholder="Cari nama atau NIS" aria-label="Cari nama atau NIS" value={cari} onChange={(e) => setCari(e.target.value)} />
          <select className="input w-full sm:w-40" aria-label="Filter kelas sekarang" value={kelas} onChange={(e) => setKelas(e.target.value)}>
            {KELAS_SEKARANG.map((k) => <option key={k} value={k}>{k ? `Kelas ${k}` : 'Semua kelas'}</option>)}
          </select>
          <select className="input w-full sm:w-52" aria-label="Atur Aksi semua yang tampil" value="" onChange={(e) => e.target.value && aturSemuaTampil(e.target.value === '-' ? '' : e.target.value)}>
            <option value="">Atur Aksi untuk {tersaring.length} yang tampil...</option>
            {AKSI.map((a) => <option key={a} value={a}>{LABEL_AKSI[a]}</option>)}
            <option value="-">Kosongkan (dilewati)</option>
          </select>
        </div>
        <p className="mb-2 text-xs text-pramuka-600">
          {baris.length} Penegak: {hitungAksi.lanjut} lanjut, {hitungAksi.tidak_lanjut} tidak lanjut, {hitungAksi.lulus} lulus, {hitungAksi.kosong} dilewati.
        </p>
        {baris.length === 0 ? (
          <Kosong judul="Tidak ada Penegak" teks="Semua Penegak sudah alumni, atau belum ada Penegak." />
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-lg border border-pramuka-200 bg-white">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-pramuka-100 text-pramuka-800">
                <tr>
                  <th className="px-3 py-2 font-semibold">Penegak</th>
                  <th className="px-3 py-2 font-semibold">Sekarang</th>
                  <th className="px-3 py-2 font-semibold">Rombel baru</th>
                  <th className="px-3 py-2 font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pramuka-100">
                {tersaring.slice(0, 400).map((b) => {
                  const tk = tingkatRombel(b.rombelSekarang);
                  return (
                    <tr key={b.id}>
                      <td className="px-3 py-1.5">
                        <span className="block font-semibold">{b.nama}</span>
                        <span className="block text-xs text-pramuka-500">NIS {b.nis}</span>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="block">{b.rombelSekarang || '-'}{tk == null && b.rombelSekarang ? ' (lama)' : ''}</span>
                        <BadgeStatus status={b.statusSekarang} />
                      </td>
                      <td className="px-3 py-1.5">
                        <select className="input w-auto min-w-[6.5rem] py-1.5" aria-label={`Rombel baru ${b.nama}`} value={b.rombelBaru}
                          onChange={(e) => ubahBaris(b.id, { rombelBaru: e.target.value })}>
                          <option value="">{b.aksi === 'tidak_lanjut' ? 'Tetap' : b.aksi === 'lulus' ? '-' : 'Pilih...'}</option>
                          {[...new Set([...SEMUA_ROMBEL, ...(b.rombelBaru && !SEMUA_ROMBEL.includes(b.rombelBaru) ? [b.rombelBaru] : [])])].map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <select className="input w-auto min-w-[8rem] py-1.5" aria-label={`Aksi ${b.nama}`} value={b.aksi} onChange={(e) => pilihAksi(b, e.target.value)}>
                          <option value="">Dilewati</option>
                          {AKSI.map((a) => <option key={a} value={a}>{LABEL_AKSI[a]}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {tersaring.length > 400 && (
              <p className="px-3 py-2 text-xs text-pramuka-600">Menampilkan 400 dari {tersaring.length}. Gunakan filter kelas atau pencarian untuk melihat yang lain (semua baris tetap ikut diperiksa dan diterapkan).</p>
            )}
          </div>
        )}
      </section>

      {galat && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{galat}</p>}
      {hasil && <Pratinjau hasil={hasil.data} />}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" onClick={periksa} disabled={sibuk || permintaan.length === 0}>{sibuk ? 'Memeriksa...' : 'Periksa'}</button>
        <button className="btn btn-gold" onClick={() => setKonfirmasi(true)} disabled={sibuk || !bisaTerapkan}>Terapkan kenaikan</button>
        <span className="text-xs text-pramuka-600">{permintaan.length} baris akan dikirim. {bisaTerapkan ? '' : 'Tekan Periksa dulu; Terapkan menyala bila berkas benar.'}</span>
      </div>

      <section className="mt-8">
        <h2 className="mb-2 text-lg font-bold">Riwayat</h2>
        <Riwayat ulang={riwayatKe} />
      </section>

      <Modal
        buka={konfirmasi}
        tutup={() => setKonfirmasi(false)}
        judul="Terapkan kenaikan kelas?"
        aksi={
          <>
            <button className="btn btn-outline" onClick={() => setKonfirmasi(false)}>Batal</button>
            <button className="btn btn-primary" onClick={terapkan}>Ya, terapkan</button>
          </>
        }
      >
        {hasil && (
          <div className="space-y-2 text-sm">
            <p>Tahun ajaran <b>{ta}</b>: {ringkasanTeks(hasil.data.ringkasan).join(', ')}.</p>
            {hasil.data.ringkasan.pengajuan_batal > 0 && <p className="text-amber-900">{hasil.data.ringkasan.pengajuan_batal} pengajuan uji yang masih berjalan akan dibatalkan.</p>}
            <p className="text-pramuka-700">Semuanya diterapkan sekaligus. Kenaikan terakhir dapat dibatalkan selama Penegak yang bersangkutan belum diubah lagi.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
