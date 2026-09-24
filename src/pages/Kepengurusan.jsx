import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { JABATAN_DEWAN, PESAN_JABATAN, akunDewanLama, daftarPengurusDewan, jabatanDewanSah, normalisasiJabatanDewan, periksaPengukuhan, rencanaJabatanDewan } from '../lib/dewanLogic';
import { tahunAjaranKini } from '../lib/rombelLogic';
import { bacaExcelKepengurusan, unduhBerkasKepengurusan } from '../lib/kepengurusanExcel';
import { normalisasiNama } from '../lib/cariNama';
import { fmtTanggal, fmtWaktu, hariIni } from '../lib/format';
import { BadgeStatus, Field, Icon, Kosong, Modal } from '../components/ui';
import SumberPeraturan from '../components/SumberPeraturan';

const MAKS_BYTE = 5 * 1024 * 1024;
const LABEL_HASIL = { beri: 'Diberi', ganti: 'Diganti', sama: 'Tetap', cabut: 'Dicabut', galat: 'Galat' };
const WARNA_HASIL = {
  beri: 'bg-emerald-50 text-emerald-800 ring-emerald-300', ganti: 'bg-sky-50 text-sky-800 ring-sky-300', sama: 'bg-stone-100 text-stone-600 ring-stone-300',
  cabut: 'bg-amber-50 text-amber-900 ring-amber-300', galat: 'bg-red-50 text-red-800 ring-red-300',
};
const LABEL_TINDAKAN = { beri: 'diberi jabatan', ganti: 'jabatan diganti', cabut: 'jabatan dicabut' };

/** Formulir memberi atau mengubah jabatan satu Penegak (pilih Penegak bila baru). */
function FormJabatan({ awal, onTutup }) {
  const { users, daftarPeserta, aturJabatanDewan } = useApp();
  const [nis, setNis] = useState(awal.nis ?? '');
  const [jabatan, setJabatan] = useState(awal.jabatan ?? '');
  const [cari, setCari] = useState('');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const baru = !awal.nis;

  const kandidat = useMemo(() => {
    const kata = normalisasiNama(cari);
    return daftarPeserta
      .filter((p) => !kata || normalisasiNama(p.nama).includes(kata) || String(p.nis ?? '').includes(cari.trim()))
      .slice().sort((a, b) => a.nama.localeCompare(b.nama, 'id')).slice(0, 200);
  }, [daftarPeserta, cari]);
  const peserta = daftarPeserta.find((p) => p.username === nis);
  const rencana = peserta && jabatan.trim() ? rencanaJabatanDewan(users, peserta, jabatan) : null;

  const kirim = async () => {
    if (sibuk) return;
    if (!peserta) return setGalat('Pilih Penegak lebih dulu.');
    if (!jabatan.trim()) return setGalat('Isi jabatan Dewan Ambalan.');
    if (!jabatanDewanSah(jabatan)) return setGalat(PESAN_JABATAN);
    setSibuk(true);
    setGalat('');
    const r = await aturJabatanDewan(rencana.daftar);
    setSibuk(false);
    if (!r.ok) return setGalat(r.pesan);
    return onTutup();
  };

  return (
    <Modal
      buka
      tutup={onTutup}
      judul={baru ? 'Tambah pengurus Dewan' : `Ubah jabatan ${peserta?.nama ?? ''}`}
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup}>Batal</button>
          <button className="btn btn-primary" onClick={kirim} disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
        </>
      }
    >
      {baru && (
        <Field label="Penegak" htmlFor="kp-cari" bantuan="Hanya Penegak yang aktif. Ketik nama atau NIS untuk mempersempit daftar.">
          <input id="kp-cari" type="search" className="input mb-2" placeholder="Cari Penegak" autoComplete="off" value={cari} onChange={(e) => setCari(e.target.value)} />
          <select aria-label="Penegak" className="input" value={nis} onChange={(e) => setNis(e.target.value)}>
            <option value="">Pilih Penegak...</option>
            {kandidat.map((p) => <option key={p.id} value={p.username}>{p.nama} ({p.kelas}){p.jabatanDewan ? `, kini ${p.jabatanDewan}` : ''}</option>)}
          </select>
        </Field>
      )}
      <Field label="Jabatan Dewan Ambalan" htmlFor="kp-jabatan" bantuan="Isian bebas; daftar hanya saran. Pradana, Pradani, dan Pemangku Adat masing-masing hanya satu orang. Pemangku Adat menjadi ketua sidang Dewan Kehormatan.">
        <input id="kp-jabatan" className="input" list="kp-saran" maxLength={60} autoComplete="off" value={jabatan} onChange={(e) => setJabatan(e.target.value)} onBlur={() => setJabatan(normalisasiJabatanDewan(jabatan))} />
        <datalist id="kp-saran">{JABATAN_DEWAN.map((j) => <option key={j} value={j} />)}</datalist>
      </Field>
      {rencana?.menggantikan && (
        <p role="status" className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {rencana.menggantikan.nama} saat ini menjabat {normalisasiJabatanDewan(jabatan)}. Bila disimpan, jabatan itu berpindah dan {rencana.menggantikan.nama} kembali menjadi Penegak biasa.
        </p>
      )}
      {galat && <p role="alert" className="text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}

/** Hasil pemeriksaan server atas berkas kepengurusan. */
function Pratinjau({ hasil }) {
  const { ringkasan: s, baris } = hasil;
  const galat = baris.filter((b) => b.hasil === 'galat');
  const peringatan = baris.filter((b) => b.hasil !== 'galat' && b.pesan.length > 0);
  return (
    <div role="status" className="mt-4 rounded-lg border border-pramuka-200 bg-white p-4">
      <h3 className="text-sm font-bold">Hasil pemeriksaan</h3>
      {galat.length === 0 ? (
        <p className="mt-1 text-sm font-semibold text-emerald-800">
          Berkas benar. Akan diterapkan: {s.beri} diberi jabatan, {s.ganti} jabatan diganti, {s.cabut} dicabut{s.sama ? `, ${s.sama} tetap` : ''}.
        </p>
      ) : (
        <p role="alert" className="mt-1 text-sm font-semibold text-red-700">{galat.length} baris bermasalah. Perbaiki dulu; belum ada yang diubah.</p>
      )}
      <div className="mt-3 max-h-72 overflow-auto rounded-md border border-pramuka-100">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="sticky top-0 bg-pramuka-100 text-pramuka-800">
            <tr>
              <th className="px-3 py-2 font-semibold">Penegak</th>
              <th className="px-3 py-2 font-semibold">Jabatan</th>
              <th className="px-3 py-2 font-semibold">Hasil</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pramuka-100">
            {baris.map((b, i) => (
              <tr key={`${b.username}-${i}`}>
                <td className="px-3 py-1.5">
                  <span className="block font-semibold">{b.nama || b.username || `Baris ${b.no}`}</span>
                  <span className="block text-xs text-pramuka-500">{b.username ? `NIS ${b.username}` : ''}{b.kelas ? `, ${b.kelas}` : ''}</span>
                </td>
                <td className="px-3 py-1.5">{b.dari_jabatan && b.dari_jabatan !== b.jabatan ? <span className="text-pramuka-500">{b.dari_jabatan} → </span> : null}{b.jabatan ?? (b.hasil === 'cabut' ? 'tanpa jabatan' : '-')}</td>
                <td className="px-3 py-1.5"><span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${WARNA_HASIL[b.hasil]}`}>{LABEL_HASIL[b.hasil]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {galat.length > 0 && (
        <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-red-800">
          {galat.map((b, i) => <li key={i}>{b.nama || b.username || `Baris ${b.no}`}: {b.pesan.join(' ')}</li>)}
        </ul>
      )}
      {peringatan.length > 0 && (
        <details className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <summary className="cursor-pointer font-semibold">{peringatan.length} catatan (periksa, tidak menghalangi)</summary>
          <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
            {peringatan.map((b, i) => <li key={i}>{b.nama}: {b.pesan.join(' ')}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Formulir pengukuhan Dewan Ambalan oleh Ketua Kwartir Ranting (satu catatan per tahun ajaran). */
function FormPengukuhan({ awal, onTutup, onSimpan }) {
  const { simpanPengukuhanDewan } = useApp();
  const [f, setF] = useState(awal);
  const [galat, setGalat] = useState({});
  const [pesan, setPesan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const kirim = async () => {
    const g = periksaPengukuhan(f, hariIni());
    setGalat(g);
    setPesan('');
    if (Object.keys(g).length) return;
    setSibuk(true);
    const r = await simpanPengukuhanDewan(f);
    setSibuk(false);
    if (!r.ok) return setPesan(r.pesan);
    return onSimpan();
  };
  const kolom = (k, label, opsi = {}) => (
    <Field label={label} htmlFor={`kp-sk-${k}`} bantuan={opsi.bantuan}>
      <input id={`kp-sk-${k}`} className="input" type={opsi.tipe ?? 'text'} maxLength={opsi.maks} autoComplete="off" value={f[k] ?? ''} onChange={set(k)} aria-invalid={!!galat[k]} disabled={opsi.mati} />
      {galat[k] && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{galat[k]}</p>}
    </Field>
  );
  return (
    <Modal
      buka
      tutup={onTutup}
      judul="Pengukuhan Dewan Ambalan"
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup}>Batal</button>
          <button className="btn btn-primary" onClick={kirim} disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
        </>
      }
    >
      {kolom('tahunAjaran', 'Tahun ajaran', { bantuan: 'Contoh: 2025/2026.', maks: 9, mati: !!awal.tetap })}
      {kolom('nomorSk', 'Nomor SK Ketua Kwartir Ranting', { maks: 80, bantuan: 'Surat keputusan yang mengukuhkan ketua dan wakil ketua Dewan Ambalan.' })}
      {kolom('tanggalSk', 'Tanggal SK', { tipe: 'date' })}
      {kolom('rekomNomor', 'Nomor rekomendasi Ketua Mabigus (opsional)', { maks: 80 })}
      {kolom('rekomTanggal', 'Tanggal rekomendasi (opsional)', { tipe: 'date', bantuan: 'Isi bersama nomor rekomendasi. Tidak boleh sesudah tanggal SK.' })}
      <Field label="Catatan (opsional)" htmlFor="kp-sk-catatan">
        <textarea id="kp-sk-catatan" className="input" rows={2} maxLength={200} value={f.catatan ?? ''} onChange={set('catatan')} />
        {galat.catatan && <p role="alert" className="mt-1 text-xs font-medium text-red-700">{galat.catatan}</p>}
      </Field>
      {pesan && <p role="alert" className="text-sm font-medium text-red-700">{pesan}</p>}
    </Modal>
  );
}

/**
 * Pengukuhan Dewan Ambalan oleh Ketua Kwartir Ranting (AD/ART Munas 2023, ART Pasal 51 ayat (2) huruf a): ketua dan wakil ketua Dewan Ambalan ditetapkan berdasarkan
 * rekomendasi Ketua Majelis Pembimbing Gugusdepan dan dikukuhkan dengan SK Ketua Kwartir Ranting. Aplikasi hanya MENCATAT nomor dan tanggal SK (satu per tahun ajaran).
 */
function PengukuhanDewan() {
  const { muatPengukuhanDewan, hapusPengukuhanDewan } = useApp();
  const ta = tahunAjaranKini();
  const [daftar, setDaftar] = useState(null);
  const [galat, setGalat] = useState('');
  const [form, setForm] = useState(null);
  const muatRef = useRef(muatPengukuhanDewan);
  muatRef.current = muatPengukuhanDewan;
  const muat = useCallback(async () => {
    const r = await muatRef.current();
    if (r.ok) { setDaftar(r.data); setGalat(''); } else setGalat(r.pesan);
  }, []);
  useEffect(() => { muat(); }, [muat]);

  const kini = daftar?.find((x) => x.tahunAjaran === ta);
  const lain = (daftar ?? []).filter((x) => x.tahunAjaran !== ta);
  const kosong = (tahunAjaran) => ({ tahunAjaran, nomorSk: '', tanggalSk: '', rekomNomor: '', rekomTanggal: '', catatan: '' });
  const hapus = async (x) => {
    if (!window.confirm(`Hapus catatan pengukuhan tahun ajaran ${x.tahunAjaran}?`)) return;
    const r = await hapusPengukuhanDewan(x.tahunAjaran);
    if (!r.ok) setGalat(r.pesan); else muat();
  };
  const baris = (x) => (
    <div className="min-w-0 text-sm">
      <p className="font-semibold text-pramuka-900">Tahun ajaran {x.tahunAjaran}: SK Nomor {x.nomorSk}, tanggal {fmtTanggal(x.tanggalSk)}</p>
      {x.rekomNomor && <p className="text-pramuka-700">Rekomendasi Ketua Mabigus: nomor {x.rekomNomor}, tanggal {fmtTanggal(x.rekomTanggal)}</p>}
      {x.catatan && <p className="text-pramuka-600">{x.catatan}</p>}
    </div>
  );

  return (
    <section aria-labelledby="kp-sk" className="mb-8">
      <h2 id="kp-sk" className="text-lg font-bold">Pengukuhan oleh Kwartir Ranting</h2>
      <p className="mb-2 text-sm text-pramuka-700">
        Ketua dan wakil ketua Dewan Ambalan dikukuhkan dengan SK Ketua Kwartir Ranting berdasarkan rekomendasi Ketua Majelis Pembimbing Gugusdepan. Catat nomor dan tanggal SK-nya di sini.
      </p>
      {galat && <p role="alert" className="mb-2 text-sm font-medium text-red-700">{galat}</p>}
      {daftar === null && !galat && <p className="text-sm text-pramuka-600">Memuat...</p>}
      {daftar !== null && (
        <div className="panel divide-y divide-pramuka-100">
          <div className="flex flex-wrap items-start justify-between gap-3 p-3">
            {kini ? baris(kini) : (
              <p className="min-w-0 text-sm font-medium text-amber-900">Belum ada catatan SK pengukuhan untuk tahun ajaran {ta}.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-outline btn-sm" onClick={() => setForm(kini ? { ...kini, tetap: true } : kosong(ta))}>{kini ? 'Ubah' : 'Catat SK pengukuhan'}</button>
              {kini && <button className="btn btn-outline btn-sm" onClick={() => hapus(kini)}>Hapus</button>}
            </div>
          </div>
          {lain.map((x) => (
            <div key={x.tahunAjaran} className="flex flex-wrap items-start justify-between gap-3 p-3">
              {baris(x)}
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-outline btn-sm" onClick={() => setForm({ ...x, tetap: true })}>Ubah</button>
                <button className="btn btn-outline btn-sm" onClick={() => hapus(x)}>Hapus</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {form && <FormPengukuhan awal={form} onTutup={() => setForm(null)} onSimpan={() => { setForm(null); muat(); }} />}
    </section>
  );
}

/** Riwayat kepengurusan (dimuat saat dibuka). */
function Riwayat({ ulang }) {
  const { muatLogKepengurusan } = useApp();
  const [buka, setBuka] = useState(false);
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState('');
  const muatRef = useRef(muatLogKepengurusan);
  muatRef.current = muatLogKepengurusan;
  const muat = useCallback(async () => {
    const r = await muatRef.current();
    if (r.ok) { setData(r.data); setGalat(''); } else setGalat(r.pesan);
  }, []);
  useEffect(() => { if (buka) muat(); }, [buka, muat, ulang]);
  return (
    <div>
      <button className="btn btn-outline btn-sm" aria-expanded={buka} onClick={() => setBuka((b) => !b)}>
        <Icon nama={buka ? 'panahAtas' : 'panahBawah'} className="h-4 w-4" /> Riwayat kepengurusan
      </button>
      {buka && (
        <div className="panel mt-3">
          {galat && <p role="alert" className="p-4 text-sm font-medium text-red-700">{galat}</p>}
          {!galat && !data && <p className="p-4 text-sm text-pramuka-600">Memuat riwayat...</p>}
          {data && data.length === 0 && <p className="p-4 text-sm text-pramuka-600">Belum ada perubahan kepengurusan.</p>}
          {data && data.length > 0 && (
            <ul className="max-h-80 divide-y divide-pramuka-100 overflow-y-auto text-sm">
              {data.slice(0, 200).map((h) => (
                <li key={h.id} className="px-4 py-2.5">
                  <p>
                    <span className="font-semibold">{h.pesertaNama}</span> {LABEL_TINDAKAN[h.tindakan] ?? h.tindakan}
                    {h.tindakan === 'cabut' ? ` (${h.jabatanLama})` : h.tindakan === 'ganti' ? ` (${h.jabatanLama} → ${h.jabatanBaru})` : ` (${h.jabatanBaru})`}
                    {h.alasan ? `. ${h.alasan}` : ''}
                  </p>
                  <p className="text-xs text-pramuka-500">{fmtWaktu(h.waktu)}{h.olehNama ? `, oleh ${h.olehNama}` : ''}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Kepengurusan Dewan Ambalan (Pembina dan Admin Gudep). Dewan Ambalan adalah JABATAN pada akun Penegak (bukan akun terpisah): pemegang jabatan dapat memakai
 * tampilan Dewan dan menguji sesuai penugasan. Kepengurusan diganti setahun sekali sesudah Musyawarah Ambalan lewat berkas Excel (bawaan: mengganti seluruhnya),
 * atau diubah satu per satu. Akun Dewan lama diarsipkan (Admin) sesudah kepengurusan baru ditetapkan.
 */
export default function Kepengurusan() {
  const { users, user, terapkanKepengurusan, aturJabatanDewan, arsipkanDewanLama } = useApp();
  const inputFile = useRef(null);
  const pengurus = useMemo(() => daftarPengurusDewan(users), [users]);
  const lama = useMemo(() => akunDewanLama(users).sort((a, b) => a.nama.localeCompare(b.nama, 'id')), [users]);
  const lamaAktif = lama.filter((u) => (u.status ?? 'aktif') === 'aktif');
  const admin = user.role === 'admin';

  const [form, setForm] = useState(null);
  const [daftar, setDaftar] = useState(null); // [{ username, jabatan }] dari berkas
  const [ganti, setGanti] = useState(true);
  const [hasil, setHasil] = useState(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');
  const [info, setInfo] = useState('');
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [riwayatKe, setRiwayatKe] = useState(0);

  const periksa = useCallback(async (d, g) => {
    setSibuk(true); setGalat(''); setInfo('');
    const r = await terapkanKepengurusan(d, g, false);
    setSibuk(false);
    if (!r.ok) { setHasil(null); setGalat(r.pesan); return; }
    setHasil(r.data);
  }, [terapkanKepengurusan]);

  const pilihFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setGalat(''); setInfo(''); setHasil(null);
    if (!/\.xlsx$/i.test(file.name)) return setGalat('Gunakan file Excel berformat .xlsx. Unduh berkas dari tombol di atas agar formatnya sesuai.');
    if (file.size > MAKS_BYTE) return setGalat('Ukuran file terlalu besar (maksimal 5 MB).');
    setSibuk(true);
    try {
      const baris = await bacaExcelKepengurusan(await file.arrayBuffer());
      const d = baris.map((b) => ({ username: String(b.nis).trim().toLowerCase(), jabatan: b.jabatan }));
      setDaftar(d);
      await periksa(d, ganti);
    } catch (err) {
      setGalat(err.message);
      setSibuk(false);
    }
    return undefined;
  };

  const ubahGanti = (nilai) => { setGanti(nilai); if (daftar) periksa(daftar, nilai); };
  const terapkan = async () => {
    setKonfirmasi(false); setSibuk(true); setGalat('');
    const r = await terapkanKepengurusan(daftar, ganti, true);
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); return; }
    setHasil(null); setDaftar(null); setRiwayatKe((n) => n + 1);
    setInfo('Kepengurusan diterapkan. Periksa penugasan penguji (menu Penugasan): penugasan pengurus yang lama ikut terhapus.');
  };
  const bisaTerapkan = hasil && hasil.galat === 0 && (hasil.ringkasan.beri + hasil.ringkasan.ganti + hasil.ringkasan.cabut) > 0;

  const cabut = async (u) => {
    if (!window.confirm(`Cabut jabatan ${u.jabatanDewan} dari ${u.nama}? Ia kembali menjadi Penegak biasa dan penugasannya sebagai penguji ikut dihapus.`)) return;
    setInfo(''); setGalat('');
    const r = await aturJabatanDewan([{ username: u.username, jabatan: '' }]);
    if (!r.ok) setGalat(r.pesan); else { setRiwayatKe((n) => n + 1); setInfo(`Jabatan ${u.nama} dicabut.`); }
  };
  const arsipkan = async () => {
    if (!window.confirm(`Arsipkan ${lamaAktif.length} akun Dewan lama? Akun arsip tidak dapat dipakai lagi (riwayat penilaian dan iuran atas namanya tetap). Pastikan kepengurusan baru sudah ditetapkan.`)) return;
    setInfo(''); setGalat('');
    const r = await arsipkanDewanLama(lamaAktif.map((u) => u.id), false);
    if (!r.ok) setGalat(r.pesan); else setRiwayatKe((n) => n + 1);
  };

  return (
    <div className="animasi-naik">
      <h1 className="mb-1 text-2xl font-bold">Kepengurusan Dewan Ambalan</h1>
      <p className="mb-4 text-sm text-pramuka-700">
        Dewan Ambalan adalah <b>jabatan pada akun Penegak</b>, bukan akun terpisah. Pemegang jabatan tetap Penegak (NIS, rombel, dan progres SKU sendiri) dan dapat berganti ke tampilan Dewan
        untuk menguji sesuai penugasan, mencatat iuran, dan mengelola kegiatan. Jabatan berlaku setahun; sesudah Musyawarah Ambalan, ganti kepengurusan lewat berkas. Jabatan dicabut otomatis
        bila Penegak menjadi nonaktif atau alumni.
      </p>
      <SumberPeraturan
        className="mb-4"
        rujukan={[
          { id: 'gudep-05-2026', bagian: 'Pasal 24 ayat (13)-(15) (Pradana, Dewan Ambalan Penegak, dan Dewan Kehormatan Penegak)' },
          { id: 'polmekbin-176-2013', bagian: 'butir 7 (Organisasi)' },
          { id: 'adart-2023', bagian: 'Anggaran Rumah Tangga Pasal 51 ayat (2) huruf a (pengukuhan)' },
        ]}
      />

      {info && <p role="status" className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">{info}</p>}
      {galat && <p role="alert" className="mb-3 text-sm font-medium text-red-700">{galat}</p>}

      <section aria-labelledby="kp-sekarang" className="mb-8">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <h2 id="kp-sekarang" className="text-lg font-bold">Kepengurusan saat ini <span className="text-sm font-normal text-pramuka-500">({pengurus.length})</span></h2>
          <button className="btn btn-outline btn-sm" onClick={() => setForm({})}><Icon nama="tambah" className="h-4 w-4" /> Tambah pengurus</button>
        </div>
        {pengurus.length === 0 ? (
          <Kosong judul="Belum ada pengurus Dewan" teks="Tambahkan satu per satu, atau unggah berkas kepengurusan di bawah." />
        ) : (
          <ul className="panel divide-y divide-pramuka-100">
            {pengurus.map((u) => (
              <li key={u.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{u.nama}</p>
                  <p className="text-xs text-pramuka-600">
                    <span className="font-semibold text-pramuka-800">{u.jabatanDewan}</span>
                    {u.role === 'peserta' ? `, ${u.kelas}, NIS ${u.nis || '-'}` : ', akun Dewan lama'}{u.nta ? `, NTA ${u.nta}` : ''}
                  </p>
                </div>
                {u.role === 'peserta' && (
                  <button className="rounded-md p-2 text-pramuka-600 hover:bg-pramuka-100" aria-label={`Ubah jabatan ${u.nama}`} onClick={() => setForm({ nis: u.username, jabatan: u.jabatanDewan })}>
                    <Icon nama="ubah" className="h-4 w-4" />
                  </button>
                )}
                <button className="rounded-md p-2 text-red-700 hover:bg-red-50" aria-label={`Cabut jabatan ${u.nama}`} onClick={() => cabut(u)}>
                  <Icon nama="hapus" className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="kp-berkas" className="mb-8 rounded-lg border border-pramuka-200 bg-white p-4">
        <h2 id="kp-berkas" className="text-lg font-bold">Ganti kepengurusan lewat berkas Excel</h2>
        <p className="mt-1 text-sm text-pramuka-700">Unduh berkas (sudah berisi kepengurusan saat ini), ubah sesuai hasil Musyawarah Ambalan, lalu unggah. Kolom yang dibaca: NIS dan Jabatan Dewan Ambalan.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn btn-outline btn-sm" onClick={() => unduhBerkasKepengurusan(pengurus.filter((u) => u.role === 'peserta').map((u) => ({ nis: u.nis || u.username, nama: u.nama, rombel: u.kelas, jabatan: u.jabatanDewan })))}>
            <Icon nama="unduh" className="h-4 w-4" /> Unduh berkas Excel
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => inputFile.current?.click()} disabled={sibuk}>
            <Icon nama="unggah" className="h-4 w-4" /> Unggah berkas terisi
          </button>
          <input ref={inputFile} type="file" accept=".xlsx" className="sr-only" aria-label="Pilih berkas Excel kepengurusan" onChange={pilihFile} />
        </div>
        <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-pramuka-800" checked={ganti} onChange={(e) => ubahGanti(e.target.checked)} />
          <span>
            <span className="font-semibold">Ganti seluruh kepengurusan</span>
            <span className="block text-xs text-pramuka-600">Pemegang jabatan yang tidak ada di berkas dicabut. Hilangkan centang bila berkas hanya menambah atau mengubah beberapa orang.</span>
          </span>
        </label>
        {hasil && <Pratinjau hasil={hasil} />}
        {daftar && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button className="btn btn-gold" onClick={() => setKonfirmasi(true)} disabled={sibuk || !bisaTerapkan}>Terapkan kepengurusan</button>
            <span className="text-xs text-pramuka-600">{daftar.length} baris berkas. {bisaTerapkan ? '' : 'Terapkan menyala bila berkas benar dan ada perubahan.'}</span>
          </div>
        )}
      </section>

      {admin && lama.length > 0 && (
        <section aria-labelledby="kp-lama" className="mb-8">
          <h2 id="kp-lama" className="text-lg font-bold">Akun Dewan lama</h2>
          <p className="mb-2 text-sm text-pramuka-700">
            Akun Dewan Ambalan yang dibuat sebelum Dewan menjadi jabatan pada akun Penegak. Arsipkan setelah kepengurusan baru ditetapkan: akun arsip tidak dapat dipakai lagi,
            tetapi riwayat penilaian dan iuran atas namanya tetap.
          </p>
          <ul className="panel divide-y divide-pramuka-100">
            {lama.map((u) => (
              <li key={u.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{u.nama} {(u.status ?? 'aktif') !== 'aktif' && <BadgeStatus status={u.status} />}</p>
                  <p className="text-xs text-pramuka-600">Pengguna <span className="font-mono">{u.username}</span>{u.jabatanDewan ? `, jabatan ${u.jabatanDewan}` : ''}</p>
                </div>
                {(u.status ?? 'aktif') !== 'aktif' && (
                  <button className="btn btn-outline btn-sm" onClick={() => arsipkanDewanLama([u.id], true)}>Aktifkan kembali</button>
                )}
              </li>
            ))}
          </ul>
          {lamaAktif.length > 0 && <button className="btn btn-outline btn-sm mt-3" onClick={arsipkan}>Arsipkan {lamaAktif.length} akun Dewan lama</button>}
        </section>
      )}

      <PengukuhanDewan />

      <section className="mt-8">
        <Riwayat ulang={riwayatKe} />
      </section>

      {form && <FormJabatan awal={form} onTutup={() => setForm(null)} />}
      <Modal
        buka={konfirmasi}
        tutup={() => setKonfirmasi(false)}
        judul="Terapkan kepengurusan?"
        aksi={
          <>
            <button className="btn btn-outline" onClick={() => setKonfirmasi(false)}>Batal</button>
            <button className="btn btn-primary" onClick={terapkan}>Ya, terapkan</button>
          </>
        }
      >
        {hasil && (
          <div className="space-y-2 text-sm">
            <p>{hasil.ringkasan.beri} diberi jabatan, {hasil.ringkasan.ganti} jabatan diganti, {hasil.ringkasan.cabut} dicabut.</p>
            {hasil.ringkasan.cabut > 0 && <p className="text-amber-900">Yang dicabut kembali menjadi Penegak biasa dan penugasan mereka sebagai penguji ikut dihapus.</p>}
            <p className="text-pramuka-700">Semuanya diterapkan sekaligus dan tercatat di riwayat.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
