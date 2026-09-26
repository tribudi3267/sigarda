import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import useGerbang from '../hooks/useGerbang';
import useSpg from '../hooks/useSpg';
import usePelantikanSaka from '../hooks/usePelantikanSaka';
import useTkk from '../hooks/useTkk';
import useTimKalender from '../hooks/useTimKalender';
import { fmtTanggal, hariIni } from '../lib/format';
import { pembinaAtauAdmin } from '../lib/hakLogic';
import { STATUS_GERBANG, hitungGerbang, kuotaCalon, periksaGerbang, periksaTanggalLahir, tanggalLahirPeserta } from '../lib/gerbangLogic';
import { hitungSpg, ringkasSpg } from '../lib/spgLogic';
import { layakGaruda } from '../lib/skuLogic';
import { unduhXlsx } from '../lib/exportXlsx';
import { ambilGudep } from '../lib/gudepStore';
import { barisPendataan, lembarPendataan } from '../lib/pendataanGarudaLogic';
import { tahunAjaranKini } from '../lib/rombelLogic';
import { labelUntuk, timUntukCalon } from '../lib/timLogic';
import TimPenilaiPanel from '../components/TimPenilaiPanel';
import KalenderGarudaPanel from '../components/KalenderGarudaPanel';
import LengkapiTanggalLahirModal from '../components/LengkapiTanggalLahirModal';
import SumberPeraturan from '../components/SumberPeraturan';
import { Avatar, Field, Kosong, Modal } from '../components/ui';

const Chip = ({ syarat }) => (
  <span title={syarat.teks} className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${STATUS_GERBANG[syarat.status].kelas}`}>{syarat.label}: {STATUS_GERBANG[syarat.status].label}</span>
);

/** Isi atau ubah tanggal kelahiran satu Penegak (Pembina dan Admin). Tanggal dikosongkan = catatan dihapus. */
function ModalLahir({ peserta, awal, onTutup, onSelesai }) {
  const { api, notify } = useApp();
  const [tanggal, setTanggal] = useState(awal ?? '');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const simpan = async () => {
    const pesan = periksaTanggalLahir({ tanggal });
    if (pesan) { setGalat(pesan); return; }
    setSibuk(true);
    setGalat('');
    const r = await api().aturTanggalLahir(peserta.id, tanggal);
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); return; }
    notify(tanggal ? `Tanggal lahir ${peserta.nama} disimpan.` : `Tanggal lahir ${peserta.nama} dihapus.`);
    onSelesai();
  };
  return (
    <Modal
      buka
      tutup={onTutup}
      judul="Tanggal lahir Penegak"
      aksi={
        <>
          <button className="btn btn-outline" onClick={onTutup} disabled={sibuk}>Batal</button>
          <button className="btn btn-primary" onClick={simpan} disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
        </>
      }
    >
      <p className="mb-3 text-sm font-semibold">{peserta.nama} <span className="font-normal text-pramuka-500">{peserta.kelas}</span></p>
      <Field label="Tanggal lahir" htmlFor="lh-tanggal" bantuan="Dipakai hanya untuk memeriksa syarat usia Calon Garuda; hanya Pembina, Dewan, Admin, dan Penegak itu sendiri yang dapat membacanya. Kosongkan untuk menghapus.">
        <input id="lh-tanggal" type="date" className="input" min="1990-01-01" max={hariIni()} value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
      </Field>
      {galat && <p role="alert" className="text-sm font-medium text-red-700">{galat}</p>}
    </Modal>
  );
}

/** Aturan gerbang calon Garuda: kelas minimal, rentang tanggal lahir, kuota. Hanya Pembina dan Admin yang mengubah. */
function PanelAturan({ data, boleh }) {
  const { api, notify } = useApp();
  const [kelasMin, setKelasMin] = useState(data.aturan.kelasMin);
  const [dari, setDari] = useState(data.aturan.lahirDari);
  const [sampai, setSampai] = useState(data.aturan.lahirSampai);
  const [kuota, setKuota] = useState(String(data.aturan.kuotaPersen));
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const simpan = async () => {
    const nilai = { kelasMin, lahirDari: dari, lahirSampai: sampai, kuotaPersen: kuota === '' ? Number.NaN : Number(kuota) };
    const pesan = periksaGerbang(nilai);
    if (pesan) { setGalat(pesan); return; }
    setSibuk(true);
    setGalat('');
    const r = await api().simpanGerbang(nilai);
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); return; }
    notify('Aturan gerbang calon disimpan.');
    data.muat();
  };
  return (
    <details className="panel mb-4 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-pramuka-800">Aturan gerbang calon (diperbarui tiap tahun)</summary>
      <p className="mb-3 mt-2 text-xs text-pramuka-600">Bawaan mengikuti pedoman Kwarcab Purbalingga 2026. Gerbang hanya peringatan: keputusan akhir tetap pada Pembina dan Kwarcab.</p>
      <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Kelas minimal" htmlFor="gb-kelas">
          <select id="gb-kelas" className="input" value={kelasMin} onChange={(e) => setKelasMin(e.target.value)} disabled={!boleh}>
            <option value="X">X</option><option value="XI">XI</option><option value="XII">XII</option>
          </select>
        </Field>
        <Field label="Lahir paling awal" htmlFor="gb-dari"><input id="gb-dari" type="date" className="input" value={dari} onChange={(e) => setDari(e.target.value)} disabled={!boleh} /></Field>
        <Field label="Lahir paling akhir" htmlFor="gb-sampai"><input id="gb-sampai" type="date" className="input" value={sampai} onChange={(e) => setSampai(e.target.value)} disabled={!boleh} /></Field>
        <Field label="Kuota calon (% Penegak aktif)" htmlFor="gb-kuota"><input id="gb-kuota" type="number" min="0" max="100" className="input" value={kuota} onChange={(e) => setKuota(e.target.value)} disabled={!boleh} /></Field>
      </div>
      {galat && <p role="alert" className="mb-2 text-sm font-medium text-red-700">{galat}</p>}
      {boleh && <button className="btn btn-primary btn-sm" onClick={simpan} disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan aturan'}</button>}
    </details>
  );
}

/** Daftar Calon Garuda dengan syarat gerbang, kuota, dan aturan. `tim` = tim penilai pada tahun ajaran terpilih (untuk menampilkan tim yang menilai tiap calon). */
function PanelCalon({ tim, tahunAjaran }) {
  const { user, daftarPeserta, progress, portofolio } = useApp();
  const gerbang = useGerbang();
  const spg = useSpg();
  const pel = usePelantikanSaka();
  const tkk = useTkk();
  const kelola = pembinaAtauAdmin(user);
  const [cari, setCari] = useState('');
  const [semua, setSemua] = useState(false);
  const [modal, setModal] = useState(null);
  const [lengkapi, setLengkapi] = useState(false);
  const galat = gerbang.galat || spg.galat || pel.galat || tkk.galat;
  const memuat = gerbang.memuat || spg.memuat || pel.memuat || tkk.memuat;

  const kuota = useMemo(() => kuotaCalon(daftarPeserta, gerbang.aturan), [daftarPeserta, gerbang.aturan]);
  // Tabel Pendataan dan Verifikasi Syarat Awal Calon Garuda (Excel): seluruh Calon dan Penegak yang SKU-nya selesai, bukan hanya 100 baris yang tampil.
  const unduhPendataan = async () => {
    const calon = daftarPeserta.filter((u) => u.calonGaruda || layakGaruda(progress, u));
    const baris = barisPendataan({ calon, aktif: daftarPeserta, progress, pelantikan: pel.pelantikan, lahir: gerbang.lahir, aturan: gerbang.aturan });
    await unduhXlsx({ namaFile: `pendataan-calon-garuda-${hariIni()}`, sheets: [lembarPendataan({ baris, aturan: gerbang.aturan, gudep: ambilGudep() })] });
  };
  const baris = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return daftarPeserta
      .filter((u) => (semua || u.calonGaruda || layakGaruda(progress, u)) && (!k || `${u.nama} ${u.kelas ?? ''}`.toLowerCase().includes(k)))
      .map((u) => ({
        u,
        g: hitungGerbang({ peserta: u, tanggalLahir: tanggalLahirPeserta(gerbang.lahir, u.id), progress, aturan: gerbang.aturan }),
        s: ringkasSpg(hitungSpg({ peserta: u, progress, pelantikan: pel.pelantikan, saka: pel.saka, capaianTkk: tkk.capaian, ambang: tkk.ambang, portofolio, penetapan: spg.penetapan })),
      }))
      .sort((a, b) => Number(!!b.u.calonGaruda) - Number(!!a.u.calonGaruda) || a.u.nama.localeCompare(b.u.nama, 'id'))
      .slice(0, 100);
  }, [daftarPeserta, progress, gerbang.lahir, gerbang.aturan, pel.pelantikan, pel.saka, tkk.capaian, tkk.ambang, portofolio, spg.penetapan, cari, semua]);

  return (
    <div>
      {galat && <p role="alert" className="mb-4 text-sm font-medium text-red-700">{galat}</p>}
      {memuat && <p className="mb-4 text-sm text-pramuka-600" role="status">Memuat...</p>}

      <section className={`panel mb-4 p-4 ${kuota.sisa < 0 ? 'ring-1 ring-red-300' : ''}`} aria-label="Kuota calon">
        <p className="text-sm text-pramuka-600">Kuota Calon Garuda ({gerbang.aturan.kuotaPersen}% dari {kuota.aktif} Penegak aktif)</p>
        <p className="font-display text-3xl font-bold text-pramuka-800">{kuota.terdaftar}<span className="text-lg font-normal text-pramuka-500"> terdaftar dari maksimal {kuota.maks}</span></p>
        <p className={`mt-1 text-xs ${kuota.sisa < 0 ? 'font-semibold text-red-700' : 'text-pramuka-600'}`}>{kuota.sisa < 0 ? `Melebihi kuota ${-kuota.sisa} calon.` : `Sisa kuota ${kuota.sisa} calon.`}</p>
      </section>

      <PanelAturan key={JSON.stringify(gerbang.aturan)} data={gerbang} boleh={kelola} />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input className="input max-w-xs flex-1" aria-label="Cari Penegak" placeholder="Cari nama atau kelas Penegak" value={cari} onChange={(e) => setCari(e.target.value)} />
        {kelola && <button className="btn btn-outline btn-sm" onClick={() => setLengkapi(true)}>Lengkapi tanggal lahir (Excel)</button>}
        <button className="btn btn-outline btn-sm" disabled={memuat} onClick={unduhPendataan}>Unduh tabel pendataan (Excel)</button>
        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={semua} onChange={(e) => setSemua(e.target.checked)} /> Tampilkan semua Penegak aktif</label>
      </div>

      {baris.length === 0 ? (
        <Kosong judul={cari ? 'Tidak ada yang cocok' : 'Belum ada Penegak yang SKU-nya selesai'} teks={cari ? 'Ubah kata pencarian.' : 'Penegak yang seluruh SKU Bantara dan Laksana-nya selesai atau sudah terdaftar sebagai Calon Garuda muncul di sini. Centang "Tampilkan semua" untuk melihat yang lain.'} />
      ) : (
        <ul className="panel divide-y divide-pramuka-100">
          {baris.map(({ u, g, s }) => {
            const lahir = tanggalLahirPeserta(gerbang.lahir, u.id);
            const t = timUntukCalon(tim, tahunAjaran, u.jenisKelamin);
            return (
              <li key={u.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start gap-3">
                  <Avatar nama={u.nama} ukuran="h-8 w-8" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{u.nama} <span className="text-xs font-normal text-pramuka-500">{u.kelas || '-'}</span>{u.calonGaruda && <span className="ml-2 rounded bg-pramuka-800 px-1.5 py-0.5 text-xs font-semibold text-pramuka-50">Calon Garuda</span>}</p>
                    <p className="mt-1 flex flex-wrap gap-1">{g.syarat.map((x) => <Chip key={x.id} syarat={x} />)}</p>
                    <p className="mt-1 text-xs text-pramuka-600">SPG {s.terpenuhi} dari {s.total} butir{s.menunggu > 0 ? `, ${s.menunggu} menunggu ditetapkan` : ''}. {lahir ? `Lahir ${fmtTanggal(lahir)}.` : ''}</p>
                    <p className="text-xs text-pramuka-600">{!u.jenisKelamin ? 'Tim penilai: jenis kelamin belum diisi.' : t ? `Tim penilai ${labelUntuk(t.untuk).toLowerCase()}: ${t.anggota.length} anggota${t.nomorSk ? `, SK ${t.nomorSk}` : ', SK belum dicatat'}.` : 'Tim penilai: belum dicatat.'}</p>
                  </div>
                  {kelola && <button className="btn btn-outline btn-sm shrink-0" onClick={() => setModal({ u, lahir })}>{lahir ? 'Ubah tanggal lahir' : 'Isi tanggal lahir'}</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {lengkapi && <LengkapiTanggalLahirModal lahir={gerbang.lahir} onTutup={() => setLengkapi(false)} onSelesai={() => { setLengkapi(false); gerbang.muat(); }} />}
      {modal && <ModalLahir peserta={modal.u} awal={modal.lahir} onTutup={() => setModal(null)} onSelesai={() => { setModal(null); gerbang.muat(); }} />}
    </div>
  );
}

const TAB = [{ id: 'calon', label: 'Calon' }, { id: 'tim', label: 'Tim penilai' }, { id: 'kalender', label: 'Kalender' }];
const geserTa = (ta, n) => { const y = Number(ta.slice(0, 4)) + n; return `${y}/${y + 1}`; };

/**
 * Kelayakan Calon Garuda (Tahap 2, G4). Gerbang hanya PERINGATAN: kelas minimal, usia (dari tanggal lahir), SKU selesai, dan kuota calon dihitung dan ditampilkan; tidak ada
 * yang diblokir. Tab Tim penilai (G4b) mencatat SK dan anggota tim putra dan putri; tab Kalender (G4c) mencatat tahap seleksi dari Kwarcab. Pembina dan Admin mengisi dan mengubah;
 * Dewan hanya melihat.
 */
export default function Kelayakan() {
  const { user } = useApp();
  const tk = useTimKalender();
  const kelola = pembinaAtauAdmin(user);
  const [tab, setTab] = useState('calon');
  const kini = tahunAjaranKini();
  const [ta, setTa] = useState(kini);
  return (
    <div className="animasi-naik">
      <h1 className="mb-1 text-2xl font-bold">Kelayakan Calon Garuda</h1>
      <p className="mb-2 text-sm text-pramuka-600">Syarat gerbang calon (kelas, usia, SKU), kuota calon, kemajuan SPG, tim penilai, dan kalender seleksi Kwarcab. Semua berupa peringatan atau pencatatan; keputusan akhir tetap pada Pembina dan Kwarcab.</p>
      <SumberPeraturan className="mb-4" rujukan={[{ id: 'garuda-038-2017', bagian: 'Bab II butir 1c (syarat Penegak Garuda), Bab IV (tim penilai)' }]} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Kelayakan" className="inline-flex flex-wrap rounded-lg bg-pramuka-100 p-1">
          {TAB.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === t.id ? 'bg-pramuka-800 text-pramuka-50' : 'text-pramuka-700 hover:bg-pramuka-200'}`}>{t.label}</button>
          ))}
        </div>
        {tab !== 'calon' && (
          <label className="inline-flex items-center gap-2 text-sm">Tahun ajaran
            <select className="input w-auto" value={ta} onChange={(e) => setTa(e.target.value)}>
              {[-1, 0, 1].map((n) => { const v = geserTa(kini, n); return <option key={v} value={v}>{v}</option>; })}
            </select>
          </label>
        )}
      </div>
      {tk.galat && <p role="alert" className="mb-4 text-sm font-medium text-red-700">{tk.galat}</p>}
      {tab === 'calon' && <PanelCalon tim={tk.tim} tahunAjaran={kini} />}
      {tab === 'tim' && <TimPenilaiPanel data={tk} tahunAjaran={ta} boleh={kelola} />}
      {tab === 'kalender' && <KalenderGarudaPanel data={tk} tahunAjaran={ta} boleh={kelola} />}
    </div>
  );
}
