import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { fmtTanggal } from '../lib/format';
import { STATUS_TAHAP, kalenderGaruda, periksaTahap, tahapBerikut } from '../lib/kalenderGarudaLogic';
import { Field, Modal } from './ui';

/** Isi atau ubah tanggal satu tahap kalender Garuda (Pembina dan Admin). */
function ModalTahap({ tahap, tahunAjaran, onTutup, onSelesai }) {
  const { api, notify } = useApp();
  const [mulai, setMulai] = useState(tahap.baris?.mulai ?? '');
  const [akhir, setAkhir] = useState(tahap.baris?.akhir ?? '');
  const [catatan, setCatatan] = useState(tahap.baris?.catatan ?? '');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const simpan = async () => {
    const nilai = { tahunAjaran, tahap: tahap.id, mulai, akhir: akhir || null, catatan };
    const pesan = periksaTahap(nilai);
    if (pesan) { setGalat(pesan); return; }
    setSibuk(true);
    setGalat('');
    const r = await api().simpanTahapGaruda(nilai);
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); return; }
    notify(`Tahap "${tahap.label}" disimpan.`);
    onSelesai();
  };
  return (
    <Modal
      buka
      tutup={onTutup}
      judul={tahap.label}
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup} disabled={sibuk}>Batal</button>
          <button className="btn btn-primary" onClick={simpan} disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
        </>
      }
    >
      <p className="mb-3 text-xs text-pramuka-600">{tahap.keterangan} Tahun ajaran {tahunAjaran}. Isi sesuai jadwal dari Kwarcab.</p>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Mulai" htmlFor="kl-mulai"><input id="kl-mulai" type="date" className="input" value={mulai} onChange={(e) => setMulai(e.target.value)} /></Field>
        <Field label="Sampai (opsional)" htmlFor="kl-akhir" bantuan="Kosongkan untuk tahap satu hari."><input id="kl-akhir" type="date" className="input" min={mulai || undefined} value={akhir} onChange={(e) => setAkhir(e.target.value)} /></Field>
      </div>
      <Field label="Catatan (opsional)" htmlFor="kl-cat"><input id="kl-cat" className="input" maxLength={200} value={catatan} onChange={(e) => setCatatan(e.target.value)} /></Field>
      {galat && <p role="alert" className="text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}

const teksTanggal = (b) => (b.akhir && b.akhir !== b.mulai ? `${fmtTanggal(b.mulai)} s.d. ${fmtTanggal(b.akhir)}` : fmtTanggal(b.mulai));

/** Kalender tahap Garuda dari Kwarcab pada satu tahun ajaran. Hanya tampilan (tanpa pengingat otomatis). */
export default function KalenderGarudaPanel({ data, tahunAjaran, boleh }) {
  const { api, notify } = useApp();
  const [modal, setModal] = useState(null);
  const kalender = kalenderGaruda(data.tahap, tahunAjaran);
  const berikut = tahapBerikut(kalender);
  const hapus = async (t) => {
    const r = await api().hapusTahapGaruda(t.baris.id);
    if (!r.ok) { notify(r.pesan, 'err'); return; }
    notify(`Tanggal tahap "${t.label}" dihapus.`);
    data.muat();
  };
  return (
    <section aria-label="Kalender Garuda">
      <p className="mb-3 text-sm text-pramuka-600">Tahap seleksi Garuda dari Kwarcab. Isi tanggalnya dari jadwal Kwarcab tahun ini; aplikasi hanya menampilkan status dan sisa hari (belum mengirim pengingat).</p>
      {berikut && (
        <p className="jahitan mb-3 rounded-lg bg-white px-4 py-3 text-sm text-pramuka-800">
          <span className="font-semibold">{berikut.status === 'berjalan' ? 'Sedang berjalan' : 'Berikutnya'}:</span> {berikut.label}, {teksTanggal(berikut.baris)}{berikut.sisaHari != null ? ` (${berikut.sisaHari} hari lagi)` : ''}.
        </p>
      )}
      <ol className="panel divide-y divide-pramuka-100">
        {kalender.map((t, i) => (
          <li key={t.id} className="px-4 py-3">
            <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
              <span className="w-6 shrink-0 font-bold text-pramuka-700">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{t.label}</p>
                <p className="text-xs text-pramuka-600">{t.keterangan}</p>
                {t.baris && <p className="mt-1 text-xs text-pramuka-700">{teksTanggal(t.baris)}{t.sisaHari != null ? ` (${t.sisaHari} hari lagi)` : ''}{t.baris.catatan ? `. ${t.baris.catatan}` : ''}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${STATUS_TAHAP[t.status].kelas}`}>{STATUS_TAHAP[t.status].label}</span>
                {boleh && (
                  <span className="flex gap-2">
                    <button className="text-xs font-semibold text-pramuka-700 underline underline-offset-2" onClick={() => setModal(t)}>{t.baris ? 'Ubah' : 'Isi tanggal'}</button>
                    {t.baris && <button className="text-xs font-semibold text-red-700 underline underline-offset-2" onClick={() => hapus(t)}>Hapus</button>}
                  </span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {modal && <ModalTahap tahap={modal} tahunAjaran={tahunAjaran} onTutup={() => setModal(null)} onSelesai={() => { setModal(null); data.muat(); }} />}
    </section>
  );
}
