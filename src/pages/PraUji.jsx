import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { cariPoin } from '../lib/skuLogic';
import { fmtTanggal, fmtWaktu } from '../lib/format';
import { pembinaAtauAdmin } from '../lib/hakLogic';
import { hariMenunggu, namaTahap, penilaiPraUji } from '../lib/praUjiLogic';
import SumberPeraturan from '../components/SumberPeraturan';
import { Avatar, Field, Kosong, Modal, TeksPoin } from '../components/ui';

const RUJUKAN = [
  { id: 'adart-2023', bagian: 'Pasal 33 ayat (6) dan Pasal 35 ayat (3) (uji resmi SKU oleh Pembina)' },
  { id: 'polmekbin-176-2013', bagian: 'butir 6 b (pendamping Penegak: kanan moral, kiri keterampilan)' },
  { id: 'sku-penegak-2011', bagian: 'Bab V (cara menyelesaikan dan menguji SKU)' },
];

/** Satu pengajuan menunggu: siapa, butir mana, tahap apa, jadwal, dan catatan Penegak. `aksi` = tombol di sisi kanan. */
function BarisPengajuan({ r, nama, kelas, sangga, aksi }) {
  const poin = cariPoin(r.skuId);
  const hari = hariMenunggu(r.dibuat);
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 gap-3">
        <Avatar nama={nama} />
        <div className="min-w-0">
          <p className="font-semibold">{nama}</p>
          <p className="text-xs text-pramuka-500">Kelas {kelas || '-'}{sangga ? `, ${sangga}` : ''}, SKU {poin?.tingkat ?? '-'}</p>
          <div className="mt-1">{poin ? <TeksPoin poin={poin} /> : <span className="text-sm">{r.skuId}</span>}</div>
          <p className="mt-1 text-xs text-pramuka-600">
            Pra-uji <b>{namaTahap(r.tahap)}</b>, jadwal uji resmi {fmtTanggal(r.jadwal)}, menunggu {hari === 0 ? 'sejak hari ini' : `${hari} hari`}
          </p>
          {r.catatanPeserta && <p className="mt-1 rounded-md bg-pramuka-50 px-2 py-1 text-xs text-pramuka-800"><b>Catatan Penegak:</b> {r.catatanPeserta}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">{aksi}</div>
    </li>
  );
}

/** Keputusan satu pra-uji: lulus (diteruskan otomatis) atau belum lulus (catatan perbaikan wajib). */
function PutusModal({ r, onTutup, onSelesai }) {
  const { catatPraUji } = useApp();
  const poin = cariPoin(r.skuId);
  const [catatan, setCatatan] = useState('');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const kirim = async (hasil) => {
    if (sibuk) return;
    if (hasil === 'belum' && !catatan.trim()) { setGalat('Isi catatan agar Penegak tahu bagian yang perlu diperbaiki.'); return; }
    setSibuk(true);
    setGalat('');
    const h = await catatPraUji(r.id, hasil, catatan.trim());
    setSibuk(false);
    if (h.ok) onSelesai();
    else setGalat(h.pesan);
  };
  return (
    <Modal
      buka
      tutup={onTutup}
      judul={`Pra-uji ${namaTahap(r.tahap)}`}
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup} disabled={sibuk}>Batal</button>
          <button className="btn btn-outline" onClick={() => kirim('belum')} disabled={sibuk}>Belum lulus</button>
          <button className="btn btn-primary" onClick={() => kirim('lulus')} disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Lulus, teruskan'}</button>
        </>
      }
    >
      <p className="mb-2 text-sm font-semibold">{r.pesertaNama}</p>
      <div className="mb-4 rounded-md bg-pramuka-50 px-3 py-2 text-pramuka-800">{poin ? <TeksPoin poin={poin} /> : r.skuId}</div>
      <p className="mb-4 text-xs leading-relaxed text-pramuka-600">
        Pra-uji hanya rekomendasi, bukan hasil resmi. Lulus: pengajuan diteruskan otomatis ke tahap berikutnya atau ke Pembina. Belum lulus: kembali ke Penegak dengan
        catatanmu, dan ia boleh mengajukan lagi. Kamu hanya menilai butir yang sudah kamu lulus sendiri.
      </p>
      <Field label="Catatan (wajib bila belum lulus)" htmlFor="catatan-pra-uji">
        <textarea id="catatan-pra-uji" rows={3} className="input" maxLength={1000} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Contoh: hafalkan lagi urutan Dasa Darma" />
      </Field>
      {galat && <p role="alert" className="text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}

/** Pembina/Admin melewati tahap yang macet (alasan wajib). */
function LewatiModal({ r, nama, onTutup, onSelesai }) {
  const { lewatiPraUji } = useApp();
  const [alasan, setAlasan] = useState('');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const kirim = async () => {
    if (sibuk) return;
    if (!alasan.trim()) { setGalat('Isi alasan melewati tahap ini.'); return; }
    setSibuk(true);
    setGalat('');
    const h = await lewatiPraUji(r.id, alasan.trim());
    setSibuk(false);
    if (h.ok) onSelesai();
    else setGalat(h.pesan);
  };
  return (
    <Modal
      buka
      tutup={onTutup}
      judul={`Lewati pra-uji ${namaTahap(r.tahap)}`}
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup} disabled={sibuk}>Batal</button>
          <button className="btn btn-primary" onClick={kirim} disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Lewati dan teruskan'}</button>
        </>
      }
    >
      <p className="mb-3 text-sm text-pramuka-800">
        Pengajuan <b>{nama}</b> diteruskan ke tahap berikutnya (atau ke uji resmi Pembina) tanpa menunggu {namaTahap(r.tahap)}. Alasan tercatat di riwayat butir itu.
      </p>
      <Field label="Alasan" htmlFor="alasan-lewati" bantuan="Maksimal 200 karakter.">
        <input id="alasan-lewati" className="input" maxLength={200} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Contoh: Pinsa berhalangan pekan ini" />
      </Field>
      {galat && <p role="alert" className="text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}

/** Sakelar pra-uji (Pembina dan Admin): hidup atau mati beserta akibatnya. */
function PanelSakelar() {
  const { praUjiAktif, aturSakelarPraUji } = useApp();
  const [tanya, setTanya] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const ubah = async () => {
    setSibuk(true);
    const h = await aturSakelarPraUji(!praUjiAktif);
    setSibuk(false);
    if (h.ok) setTanya(false);
  };
  return (
    <section className="panel mb-5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold">Pra-uji: {praUjiAktif ? 'hidup' : 'mati'}</h2>
          <p className="mt-1 text-sm text-pramuka-600">
            {praUjiAktif
              ? 'Pengajuan Penegak lebih dulu melewati Pinsa dan Bina Damping, lalu diuji resmi oleh Pembina. Dewan Ambalan tidak menguji secara resmi.'
              : 'Cara lama berlaku: Penegak memilih penguji (Pembina atau Dewan Ambalan) dan tidak ada pra-uji.'}
          </p>
        </div>
        <button className={`btn btn-sm ${praUjiAktif ? 'btn-outline' : 'btn-primary'}`} onClick={() => setTanya(true)}>{praUjiAktif ? 'Matikan pra-uji' : 'Hidupkan pra-uji'}</button>
      </div>
      <Modal
        buka={tanya}
        tutup={() => setTanya(false)}
        judul={praUjiAktif ? 'Matikan pra-uji?' : 'Hidupkan pra-uji?'}
        aksi={
          <>
            <button className="btn btn-outline" onClick={() => setTanya(false)} disabled={sibuk}>Batal</button>
            <button className="btn btn-primary" onClick={ubah} disabled={sibuk}>{sibuk ? 'Memproses...' : praUjiAktif ? 'Matikan' : 'Hidupkan'}</button>
          </>
        }
      >
        {praUjiAktif ? (
          <p className="text-sm text-pramuka-800">
            Pra-uji yang masih menunggu diteruskan langsung ke uji resmi (antrian rombel), dan Dewan Ambalan boleh menguji lagi seperti sebelum pra-uji. Riwayat pra-uji tetap tersimpan.
          </p>
        ) : (
          <p className="text-sm text-pramuka-800">
            Uji resmi hanya dilakukan Pembina; Dewan Ambalan tidak lagi menguji. Pengajuan yang menunggu dan ditujukan kepada penguji non-Pembina dikembalikan ke antrian rombel.
            Sebelum menghidupkan, pastikan Bina Damping tiap rombel sudah ditunjuk dan sangga sudah dibagi (menu Sangga), supaya tahap pra-uji punya penilai.
          </p>
        )}
      </Modal>
    </section>
  );
}

/** Antrian penilai (Pinsa atau Bina Damping) dan keputusan yang sudah ia buat. */
function PanelPenilai() {
  const { muatAntrianPraUji, praUjiAktif } = useApp();
  const [data, setData] = useState(null); // null = memuat
  const [galat, setGalat] = useState('');
  const [putus, setPutus] = useState(null);
  const muat = useCallback(async () => {
    const r = await muatAntrianPraUji();
    if (r.ok) { setData(r.data); setGalat(''); } else setGalat(r.pesan ?? 'Antrian pra-uji tidak dapat dimuat.');
  }, [muatAntrianPraUji]);
  useEffect(() => { muat(); }, [muat, praUjiAktif]);

  if (galat) return <p role="alert" className="mb-5 text-sm font-medium text-red-700">{galat}</p>;
  if (!data) return <p role="status" className="mb-5 text-sm text-pramuka-600">Memuat antrian pra-uji...</p>;
  return (
    <section className="mb-6" aria-label="Antrian pra-uji saya">
      <h2 className="mb-2 text-lg font-bold">Antrian pra-uji saya</h2>
      {!data.aktif ? (
        <Kosong judul="Pra-uji belum dihidupkan" teks="Pembina menghidupkan pra-uji lebih dulu. Sementara itu Penegak masih diuji dengan cara lama." />
      ) : data.menunggu.length === 0 ? (
        <Kosong judul="Antrian kosong" teks="Belum ada pengajuan yang menunggu penilaianmu. Kamu diberi tahu lewat notifikasi bila ada." />
      ) : (
        <ul className="panel divide-y divide-pramuka-100">
          {data.menunggu.map((r) => (
            <BarisPengajuan
              key={r.id}
              r={r}
              nama={r.pesertaNama}
              kelas={r.kelas}
              sangga={r.sangga}
              aksi={<button className="btn btn-primary btn-sm" onClick={() => setPutus(r)}>Nilai</button>}
            />
          ))}
        </ul>
      )}
      {data.selesai.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-pramuka-700">Sudah saya putuskan ({data.selesai.length})</summary>
          <ul className="panel mt-2 divide-y divide-pramuka-100 text-sm">
            {data.selesai.map((s) => (
              <li key={s.id} className="px-4 py-3">
                <p className="font-semibold">{s.pesertaNama} <span className="font-normal text-pramuka-500">({s.kelas || '-'})</span></p>
                <p className="text-xs text-pramuka-600">
                  {cariPoin(s.skuId)?.teks ?? s.skuId}
                </p>
                <p className="mt-0.5 text-xs text-pramuka-600">
                  {namaTahap(s.tahap)}: {s.status === 'lulus' ? 'lulus, diteruskan' : 'belum lulus'}, {fmtWaktu(s.diputuskanPada)}{s.catatan ? `. Catatan: ${s.catatan}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
      {putus && <PutusModal r={putus} onTutup={() => setPutus(null)} onSelesai={() => { setPutus(null); muat(); }} />}
    </section>
  );
}

/** Semua pengajuan yang menunggu penilai (Pembina dan Admin), dengan tombol melewati tahap yang macet. */
function PanelPengelola() {
  const { muatPraUjiMenunggu, users, praUjiAktif } = useApp();
  const [baris, setBaris] = useState(null);
  const [galat, setGalat] = useState('');
  const [lewati, setLewati] = useState(null);
  const muat = useCallback(async () => {
    const r = await muatPraUjiMenunggu();
    if (r.ok) { setBaris(r.data); setGalat(''); } else setGalat(r.pesan ?? 'Daftar pra-uji tidak dapat dimuat.');
  }, [muatPraUjiMenunggu]);
  useEffect(() => { muat(); }, [muat, praUjiAktif]);

  const orang = (id) => users.find((u) => u.id === id);
  if (galat) return <p role="alert" className="mb-5 text-sm font-medium text-red-700">{galat}</p>;
  if (!baris) return <p role="status" className="mb-5 text-sm text-pramuka-600">Memuat pengajuan pra-uji...</p>;
  return (
    <section className="mb-6" aria-label="Pengajuan menunggu pra-uji">
      <h2 className="mb-2 text-lg font-bold">Menunggu pra-uji ({baris.length})</h2>
      {baris.length === 0 ? (
        <Kosong judul="Tidak ada yang menunggu" teks="Semua pengajuan sudah diputuskan penilai atau berada di uji resmi Pembina (menu Antrian)." />
      ) : (
        <>
          <p className="mb-2 text-xs text-pramuka-600">Bila penilai berhalangan, lewati tahap itu: pengajuan diteruskan ke tahap berikutnya atau langsung ke uji resmi Pembina. Pengajuan yang lebih dari 3 hari tercantum paling atas.</p>
          <ul className="panel divide-y divide-pramuka-100">
            {[...baris].sort((a, b) => Date.parse(a.dibuat) - Date.parse(b.dibuat)).map((r) => {
              const p = orang(r.pesertaId);
              return (
                <BarisPengajuan
                  key={r.id}
                  r={r}
                  nama={p?.nama ?? 'Penegak'}
                  kelas={p?.kelas}
                  sangga={p?.sangga}
                  aksi={<button className="btn btn-outline btn-sm" onClick={() => setLewati({ r, nama: p?.nama ?? 'Penegak' })}>Lewati tahap</button>}
                />
              );
            })}
          </ul>
        </>
      )}
      {lewati && <LewatiModal r={lewati.r} nama={lewati.nama} onTutup={() => setLewati(null)} onSelesai={() => { setLewati(null); muat(); }} />}
    </section>
  );
}

/**
 * Pra-uji berjenjang (fase D). Penilai (Pinsa atau Bina Damping) menilai pengajuan yang masuk; Pembina dan Admin mengatur sakelar dan melewati tahap yang macet.
 * Hak ditegakkan server (sg_pra_uji_*); halaman hanya menampilkan bagian yang relevan menurut peran.
 */
export default function PraUji() {
  const { user, pendampingan, praUjiAktif } = useApp();
  const kelola = pembinaAtauAdmin(user);
  const penilai = penilaiPraUji(pendampingan) && (praUjiAktif || !kelola);
  return (
    <div className="animasi-naik">
      <h1 className="mb-1 text-2xl font-bold">Pra-uji SKU</h1>
      <p className="mb-2 text-sm text-pramuka-600">
        Sebelum uji resmi Pembina, pengajuan Penegak disaring dulu: butir Bantara oleh Pinsa lalu Bina Damping, butir Laksana oleh Bina Damping yang sudah Laksana.
        Pra-uji hanya rekomendasi; hasil resmi tetap dari Pembina.
      </p>
      <SumberPeraturan className="mb-4" rujukan={RUJUKAN} />
      {kelola && <PanelSakelar />}
      {penilai && <PanelPenilai />}
      {kelola && praUjiAktif && <PanelPengelola />}
      {!kelola && !penilai && <Kosong judul="Belum ada tugas pra-uji" teks="Menu ini muncul bila kamu Pinsa atau Bina Damping dan pra-uji sedang hidup." />}
    </div>
  );
}
