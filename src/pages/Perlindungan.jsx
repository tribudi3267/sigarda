import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import useSfh from '../hooks/useSfh';
import { fmtTanggal, hariIni } from '../lib/format';
import { GUDEP_SFH_KOSONG, JENIS_SFH, anggotaSfh, gudepSfhTerisi, periksaCatatSfh, periksaGudepSfh, peranSfh, statusSfh } from '../lib/perlindunganLogic';
import SumberPeraturan from '../components/SumberPeraturan';
import { Field, Kosong, Modal } from '../components/ui';

/** Catat atau koreksi satu catatan Safe From Harm (Pembina dan Admin). */
function ModalCatat({ anggota, jenis, awal, onTutup, onSelesai }) {
  const { api, notify } = useApp();
  const [tanggal, setTanggal] = useState(awal?.tanggal ?? '');
  const [buktiUrl, setBuktiUrl] = useState(awal?.buktiUrl ?? '');
  const [catatan, setCatatan] = useState(awal?.catatan ?? '');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const j = JENIS_SFH.find((x) => x.id === jenis);

  const simpan = async () => {
    const p = periksaCatatSfh({ anggota, jenis, tanggal, buktiUrl, catatan });
    if (p) { setGalat(p); return; }
    setSibuk(true);
    const r = await api().simpanSfh({ anggotaId: anggota.id, jenis, tanggal, buktiUrl: buktiUrl.trim(), catatan: catatan.trim() });
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); return; }
    notify('Catatan tersimpan.');
    onSelesai();
  };

  return (
    <Modal
      buka tutup={() => !sibuk && onTutup()} judul={`${j.label}: ${anggota.nama}`}
      aksi={(<><button className="btn btn-outline" disabled={sibuk} onClick={onTutup}>Batal</button><button className="btn btn-primary" disabled={sibuk} onClick={simpan}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button></>)}
    >
      <p className="mb-3 text-xs text-pramuka-600">{j.pasal} Jukran Kwarnas 004/2021: {j.bantuan}</p>
      <Field label="Tanggal" htmlFor="sfh-tgl" bantuan="Tanggal pelatihan diikuti, pakta ditandatangani, atau pemeriksaan dilakukan.">
        <input id="sfh-tgl" className="input" type="date" max={hariIni()} value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
      </Field>
      <Field label="Tautan bukti (opsional)" htmlFor="sfh-url" bantuan="Mis. tautan sertifikat atau pindaian di Google Drive. Berkasnya tidak disimpan di aplikasi.">
        <input id="sfh-url" className="input" inputMode="url" maxLength={500} placeholder="https://" value={buktiUrl} onChange={(e) => setBuktiUrl(e.target.value)} />
      </Field>
      <Field label="Catatan (opsional)" htmlFor="sfh-cat">
        <input id="sfh-cat" className="input" maxLength={200} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
      </Field>
      {galat && <p role="alert" className="text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}

/** Penerima laporan gugus depan (Pasal 10 ayat 3): dilihat semua pengguna, diubah Pembina dan Admin. */
function PanelPenerima({ data }) {
  const { api, notify } = useApp();
  const [f, setF] = useState({ ...GUDEP_SFH_KOSONG, ...data.gudep });
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const ubah = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const simpan = async () => {
    const p = periksaGudepSfh(f);
    if (p) { setGalat(p); return; }
    setSibuk(true);
    const r = await api().simpanGudepSfh(f);
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); return; }
    setGalat('');
    notify('Penerima laporan tersimpan.');
    await data.muat();
  };
  return (
    <section className="panel mb-5 p-4" aria-label="Penerima laporan">
      <h2 className="text-lg font-bold">Penerima laporan gugus depan</h2>
      <p className="mb-3 mt-1 text-sm text-pramuka-600">
        Setiap gugus depan wajib memiliki prosedur penerimaan laporan kejadian yang membahayakan (Pasal 10 ayat 3). Laporan disampaikan kepada Komite Perlindungan dan ditangani Dewan
        Kehormatan; <strong>aplikasi ini tidak menyimpan laporan</strong> karena bersifat rahasia (Pasal 8 ayat 4 huruf g). Isian di bawah hanya memberi tahu Penegak kepada siapa harus melapor
        (tampil di menu Akun saya untuk semua pengguna).
      </p>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Penerima laporan" htmlFor="sfh-penerima" bantuan="Nama dan jabatan, mis. Komite Perlindungan: Ka. Mabigus dan Pembina."><input id="sfh-penerima" className="input" maxLength={120} value={f.penerima} onChange={ubah('penerima')} /></Field>
        <Field label="Kontak" htmlFor="sfh-kontak" bantuan="Nomor telepon/WhatsApp atau surel yang boleh dihubungi."><input id="sfh-kontak" className="input" maxLength={80} value={f.kontak} onChange={ubah('kontak')} /></Field>
      </div>
      <Field label="Tautan prosedur tertulis (opsional)" htmlFor="sfh-prosedur"><input id="sfh-prosedur" className="input" inputMode="url" maxLength={500} placeholder="https://" value={f.prosedurUrl} onChange={ubah('prosedurUrl')} /></Field>
      <Field label="Keterangan (opsional)" htmlFor="sfh-ket" bantuan="Mis. jam menerima laporan. Peraturan meminta tindak lanjut paling lambat 12 jam sejak laporan diterima (Pasal 11 ayat 2 huruf f)."><input id="sfh-ket" className="input" maxLength={300} value={f.catatan} onChange={ubah('catatan')} /></Field>
      {galat && <p role="alert" className="mb-2 text-sm font-medium text-red-700">{galat}</p>}
      <button className="btn btn-primary btn-sm" disabled={sibuk} onClick={simpan}>{sibuk ? 'Menyimpan...' : 'Simpan penerima laporan'}</button>
    </section>
  );
}

/**
 * Perlindungan Anggota / Safe From Harm (Tahap 4; Pembina dan Admin). Mencatat kewajiban anggota dewasa gugus depan menurut Jukran Kwarnas 004/2021: Pembina (pelatihan, pakta integritas,
 * pemeriksaan rekam jejak) dan Admin Gudep (pelatihan), serta penerima laporan gugus depan. Aplikasi hanya mencatat: laporan kejadian tidak disimpan di sini.
 */
export default function Perlindungan() {
  const { users, api, notify } = useApp();
  const data = useSfh();
  const [modal, setModal] = useState(null); // { anggota, jenis, awal }
  const anggota = useMemo(() => anggotaSfh(users), [users]);

  const hapus = async (c) => {
    if (!window.confirm('Hapus catatan ini?')) return;
    const r = await api().hapusSfh(c.id);
    if (!r.ok) { notify(r.pesan, 'err'); return; }
    notify('Catatan dihapus.');
    await data.muat();
  };

  return (
    <div className="animasi-naik">
      <h1 className="mb-1 text-2xl font-bold">Perlindungan Anggota (Safe From Harm)</h1>
      <p className="mb-2 text-sm text-pramuka-600">
        Gerakan Pramuka wajib menjaga lingkungan berlatih yang aman, nyaman, sehat, dan selamat. Di sini dicatat kewajiban anggota dewasa gugus depan; kejadian atau laporan ditangani di
        luar aplikasi oleh Komite Perlindungan dan Dewan Kehormatan.
      </p>
      <SumberPeraturan className="mb-4" rujukan={[{ id: 'perlindungan-004-2021', bagian: 'Pasal 7 (anggota dewasa), Pasal 9 (kegiatan), Pasal 10-11 (pelaporan dan penanganan)' }, 'perlindungan-004-2021-teks']} />
      {data.galat && <p role="alert" className="mb-4 text-sm font-medium text-red-700">{data.galat}</p>}
      {data.memuat && <p className="mb-4 text-sm text-pramuka-600" role="status">Memuat...</p>}

      <PanelPenerima key={JSON.stringify(data.gudep)} data={data} />

      <h2 className="mb-2 text-lg font-bold">Catatan anggota dewasa</h2>
      {anggota.length === 0 ? (
        <Kosong judul="Belum ada anggota dewasa aktif" teks="Pembina dan Admin Gudep aktif tampil di sini." />
      ) : (
        <ul className="panel divide-y divide-pramuka-100">
          {anggota.map((u) => {
            const st = statusSfh(data.catatan, u);
            return (
              <li key={u.id} className="px-4 py-3">
                <p className="font-medium">{u.nama} <span className="text-xs font-normal text-pramuka-500">{peranSfh(u)}</span></p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {st.map((s) => (
                    <li key={s.jenis} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className={s.catatan ? 'font-semibold text-emerald-800' : 'font-semibold text-amber-900'}>{s.catatan ? 'Tercatat' : 'Belum'}</span> {s.label}
                        {s.catatan && <span className="text-xs text-pramuka-600">, {fmtTanggal(s.catatan.tanggal)}{s.catatan.catatan ? `, ${s.catatan.catatan}` : ''}{s.catatan.buktiUrl && <> (<a className="underline" href={s.catatan.buktiUrl} target="_blank" rel="noreferrer">bukti</a>)</>}</span>}
                      </span>
                      <span className="flex shrink-0 gap-2">
                        <button className="btn btn-outline btn-sm" onClick={() => setModal({ anggota: u, jenis: s.jenis, awal: s.catatan })}>{s.catatan ? 'Ubah' : 'Catat'}</button>
                        {s.catatan && <button className="btn btn-outline btn-sm text-red-700" onClick={() => hapus(s.catatan)}>Hapus</button>}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
      {gudepSfhTerisi(data.gudep) ? null : <p className="mt-3 text-xs text-amber-900">Penerima laporan gugus depan belum diisi: Penegak belum tahu kepada siapa harus melapor.</p>}
      {modal && <ModalCatat anggota={modal.anggota} jenis={modal.jenis} awal={modal.awal} onTutup={() => setModal(null)} onSelesai={() => { setModal(null); data.muat(); }} />}
    </div>
  );
}
