import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import useSpg from '../hooks/useSpg';
import usePelantikanSaka from '../hooks/usePelantikanSaka';
import useTkk from '../hooks/useTkk';
import { fmtTanggal, hariIni } from '../lib/format';
import { pembinaAtauAdmin } from '../lib/hakLogic';
import { STATUS_SPG, hitungSpg, menimpaSaran, periksaSpg, pesertaSpg, ringkasSpg } from '../lib/spgLogic';
import SumberPeraturan from '../components/SumberPeraturan';
import { Avatar, Field, Kosong, Modal, ProgressBar } from '../components/ui';

const Chip = ({ status }) => (
  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${STATUS_SPG[status].kelas}`}>{STATUS_SPG[status].label}</span>
);

/** Tetapkan satu butir SPG (Pembina dan Admin): nilai 100 (lengkap dan memenuhi) atau 0, tanggal pengujian, catatan (alasan wajib bila berbeda dari hasil aplikasi). */
function ModalTetapkan({ peserta, baris, onTutup, onSelesai }) {
  const { api, notify } = useApp();
  const [nilai, setNilai] = useState(baris.nilai ?? (baris.saran.terpenuhi ? 100 : 0));
  const [tanggal, setTanggal] = useState(baris.penetapan?.tanggal ?? hariIni());
  const [catatan, setCatatan] = useState(baris.penetapan?.catatan ?? '');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const timpa = menimpaSaran(nilai, baris.saran);

  const simpan = async () => {
    const pesan = periksaSpg({ butir: baris.no, nilai, tanggal, catatan, timpa });
    if (pesan) { setGalat(pesan); return; }
    setSibuk(true);
    setGalat('');
    const r = await api().catatSpg({ pesertaId: peserta.id, butir: baris.no, nilai, tanggal, catatan, timpa });
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); return; }
    notify(`SPG butir ${baris.no} ditetapkan.`);
    onSelesai();
  };

  return (
    <Modal
      buka
      tutup={onTutup}
      judul={`Tetapkan SPG butir ${baris.no}`}
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup} disabled={sibuk}>Batal</button>
          <button className="btn btn-primary" onClick={simpan} disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
        </>
      }
    >
      <p className="mb-1 text-sm font-semibold">{peserta.nama} <span className="font-normal text-pramuka-500">{peserta.kelas}</span></p>
      <p className="mb-2 text-sm">{baris.uraian}</p>
      <p className="mb-4 rounded-md bg-pramuka-50 px-3 py-2 text-xs text-pramuka-700">Hasil aplikasi: {baris.saran.teks}</p>
      <fieldset className="mb-4">
        <legend className="mb-1 text-sm font-semibold">Hasil pengujian</legend>
        <label className="mr-5 inline-flex items-center gap-2 text-sm"><input type="radio" name="spg-nilai" checked={nilai === 100} onChange={() => setNilai(100)} /> Lengkap dan memenuhi (100)</label>
        <label className="inline-flex items-center gap-2 text-sm"><input type="radio" name="spg-nilai" checked={nilai === 0} onChange={() => setNilai(0)} /> Belum (0)</label>
      </fieldset>
      <Field label="Tanggal pengujian" htmlFor="spg-tanggal"><input id="spg-tanggal" type="date" className="input" max={hariIni()} value={tanggal} onChange={(e) => setTanggal(e.target.value)} /></Field>
      <Field label={timpa ? 'Alasan berbeda dari hasil aplikasi (wajib)' : 'Catatan (opsional)'} htmlFor="spg-catatan" bantuan={timpa ? 'Penetapanmu berbeda dari hasil aplikasi; alasan tercatat sebagai jejak.' : undefined}>
        <input id="spg-catatan" className="input" maxLength={200} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
      </Field>
      {galat && <p role="alert" className="text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}

/** 13 butir SPG satu Penegak. */
function PanelSpg({ peserta, baris, boleh, data }) {
  const { api, notify } = useApp();
  const [modal, setModal] = useState(null);
  const r = ringkasSpg(baris);
  const hapus = async (b) => {
    const h = await api().hapusSpg(peserta.id, b.no);
    if (!h.ok) { notify(h.pesan, 'err'); return; }
    notify(`Penetapan butir ${b.no} dihapus.`);
    data.muat();
  };
  return (
    <section aria-label={`SPG ${peserta.nama}`}>
      <div className="panel mb-4 p-4">
        <p className="mb-1 text-sm text-pramuka-600">Syarat Pramuka Garuda</p>
        <p className="font-display text-3xl font-bold text-pramuka-800">{r.terpenuhi}<span className="text-lg font-normal text-pramuka-500"> dari {r.total} butir terpenuhi</span></p>
        <div className="mt-2 max-w-sm"><ProgressBar persen={Math.round((r.terpenuhi / r.total) * 100)} label={`SPG ${peserta.nama}`} /></div>
        {r.menunggu > 0 && <p className="mt-2 text-xs text-amber-900">{r.menunggu} butir dokumennya sudah lengkap dan menunggu ditetapkan Pembina.</p>}
        {r.penuh && <p className="mt-2 text-sm font-semibold text-emerald-800">Seluruh butir SPG terpenuhi.</p>}
      </div>
      <ol className="panel divide-y divide-pramuka-100">
        {baris.map((b) => (
          <li key={b.no} className="px-4 py-3">
            <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
              <span className="w-6 shrink-0 font-bold text-pramuka-700">{b.no}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{b.judul}</p>
                <p className="text-xs text-pramuka-600">{b.uraian}</p>
                <p className="mt-1 text-xs text-pramuka-700">{b.jenis === 'otomatis' ? 'Dihitung aplikasi: ' : 'Dokumen: '}{b.saran.teks}</p>
                {b.penetapan && (
                  <p className="mt-1 text-xs text-pramuka-700">
                    Ditetapkan Pembina {fmtTanggal(b.penetapan.tanggal)}: {b.penetapan.nilai === 100 ? 'lengkap (100)' : 'belum (0)'}
                    {b.timpa ? ', berbeda dari hasil aplikasi' : ''}{b.penetapan.catatan ? `. Catatan: ${b.penetapan.catatan}` : ''}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1"><Chip status={b.status} />
                {boleh && (
                  <span className="flex gap-2">
                    <button className="text-xs font-semibold text-pramuka-700 underline underline-offset-2" onClick={() => setModal(b)}>{b.penetapan ? 'Ubah' : 'Tetapkan'}</button>
                    {b.penetapan && <button className="text-xs font-semibold text-red-700 underline underline-offset-2" onClick={() => hapus(b)}>Hapus</button>}
                  </span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {modal && <ModalTetapkan peserta={peserta} baris={modal} onTutup={() => setModal(null)} onSelesai={() => { setModal(null); data.muat(); }} />}
    </section>
  );
}

/**
 * Syarat Pramuka Garuda (Tahap 2, G3). Penegak melihat kemajuan 13 butir miliknya; Pembina dan Admin menetapkan butir (server: sg_spg_catat); Dewan hanya melihat.
 * Butir 2, 4, 6, 11 dihitung dari SKU, pelantikan, TKK, dan Saka; butir lain dari kelengkapan dokumen pada cek list portofolio (lengkap = 100, belum = 0).
 */
export default function Spg() {
  const { user, daftarPesertaSemua, progress, portofolio } = useApp();
  const spg = useSpg();
  const pel = usePelantikanSaka();
  const tkk = useTkk();
  const kelola = pembinaAtauAdmin(user);
  const pengurus = user.role !== 'peserta';
  const [pilih, setPilih] = useState(null);
  const [cari, setCari] = useState('');
  const memuat = spg.memuat || pel.memuat || tkk.memuat;
  const galat = spg.galat || pel.galat || tkk.galat;

  const hitung = (p) => hitungSpg({ peserta: p, progress, pelantikan: pel.pelantikan, saka: pel.saka, krida: tkk.krida, capaianTkk: tkk.capaian, ambang: tkk.ambang, portofolio, penetapan: spg.penetapan });
  const layak = useMemo(() => pesertaSpg(daftarPesertaSemua, progress), [daftarPesertaSemua, progress]);
  const daftar = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return layak.filter((u) => !k || `${u.nama} ${u.kelas ?? ''}`.toLowerCase().includes(k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layak, cari]);
  const peserta = pengurus ? layak.find((u) => u.id === pilih) : layak.find((u) => u.id === user.id);

  return (
    <div className="animasi-naik">
      <h1 className="mb-1 text-2xl font-bold">Syarat Pramuka Garuda (SPG)</h1>
      <p className="mb-2 text-sm text-pramuka-600">Kemajuan 13 butir syarat Penegak Garuda. Butir yang datanya sudah ada di aplikasi dihitung otomatis; butir lain dinilai dari kelengkapan dokumen portofolio dan ditetapkan Pembina.</p>
      <SumberPeraturan className="mb-4" rujukan={[{ id: 'garuda-038-2017', bagian: 'Bab II butir 1c (13 syarat Penegak Garuda)' }]} />
      {galat && <p role="alert" className="mb-4 text-sm font-medium text-red-700">{galat}</p>}
      {memuat && <p className="mb-4 text-sm text-pramuka-600" role="status">Memuat...</p>}

      {!pengurus && !peserta && (
        <Kosong judul="SPG belum dapat dinilai" teks="Butir SPG dinilai sesudah seluruh SKU Bantara dan Laksana selesai." />
      )}
      {!pengurus && peserta && <PanelSpg peserta={peserta} baris={hitung(peserta)} boleh={false} data={spg} />}

      {pengurus && !peserta && (
        <section aria-label="Daftar Penegak">
          <input className="input mb-3" aria-label="Cari Penegak" placeholder="Cari nama atau kelas Penegak" value={cari} onChange={(e) => setCari(e.target.value)} />
          {daftar.length === 0 ? (
            <Kosong judul={cari ? 'Tidak ada yang cocok' : 'Belum ada Penegak yang layak dinilai'} teks={cari ? 'Ubah kata pencarian.' : 'Penegak yang seluruh SKU Bantara dan Laksana-nya selesai muncul di sini.'} />
          ) : (
            <ul className="panel divide-y divide-pramuka-100">
              {daftar.map((u) => {
                const r = ringkasSpg(hitung(u));
                return (
                  <li key={u.id}>
                    <button className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-pramuka-50" onClick={() => setPilih(u.id)}>
                      <Avatar nama={u.nama} ukuran="h-8 w-8" />
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{u.nama}</span><span className="block text-xs text-pramuka-500">{u.kelas || '-'}</span></span>
                      <span className="shrink-0 text-right text-xs text-pramuka-700">{r.terpenuhi} dari {r.total}{r.penuh && <b className="ml-1 text-emerald-700">lengkap</b>}{r.menunggu > 0 && <span className="block text-amber-900">{r.menunggu} menunggu</span>}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
      {pengurus && peserta && (
        <>
          <button className="mb-3 text-sm font-semibold text-pramuka-700 underline underline-offset-2" onClick={() => setPilih(null)}>Kembali ke daftar Penegak</button>
          <p className="mb-3 text-lg font-bold">{peserta.nama} <span className="text-sm font-normal text-pramuka-500">{peserta.kelas}</span></p>
          <PanelSpg peserta={peserta} baris={hitung(peserta)} boleh={kelola} data={spg} />
        </>
      )}
    </div>
  );
}
