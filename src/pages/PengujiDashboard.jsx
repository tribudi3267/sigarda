import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { antrianPengujian, bolehMenilaiPoin, hitungProgres, pesanTidakBolehMenilai } from '../lib/skuLogic';
import { ringkasDaftarRombel, rombelSaya as rombelDariPenugasan, tahunAjaranKini } from '../lib/rombelLogic';
import { useFilterRombel } from '../hooks/useRombelSaya';
import ProgresRombel from '../components/ProgresRombel';
import { fmtTanggal } from '../lib/format';
import FilterBar, { FILTER_AWAL, terapkanFilter } from '../components/FilterBar';
import AlihkanModal from '../components/AlihkanModal';
import RingkasanGudep from '../components/RingkasanGudep';
import UjiModal from '../components/UjiModal';
import { Avatar, Badge, BadgePeran, Icon, Kosong, ProgressBar, TeksPoin } from '../components/ui';

/** Baris penugasan tahun ajaran berjalan (rombel dan khusus Penegak) untuk menyaring antrian bersama rombel; dimuat sekali. penugasan null selama belum termuat (aturan lama). */
function usePenugasanKini() {
  const { penugasan, penugasanPeserta, muatPenugasan, muatDokumen } = useApp();
  const ta = tahunAjaranKini();
  useEffect(() => { muatPenugasan(ta); muatDokumen(); }, [ta, muatPenugasan, muatDokumen]); // dokumen: surat pengantar agama ikut menentukan penguji yang sah
  return { penugasan: penugasan[ta] ?? null, penugasanPeserta: (penugasanPeserta ?? {})[ta] ?? [] };
}

function Dashboard({ onNav }) {
  const { user, users, progress, dokumen } = useApp();
  const penugasan = usePenugasanKini();
  const antrian = antrianPengujian(progress, users, user.id, penugasan, dokumen ?? []);
  const menunggu = antrian.filter((a) => a.entry.status === 'diajukan').length;

  return (
    <div className="animasi-naik">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Dashboard {user.jabatan}</h1>
        <p className="text-sm text-pramuka-600">Ringkasan SKU, absensi latihan Jumat, dan jurnal portofolio Garuda.</p>
      </div>

      <section className="jahitan mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-4">
        <div>
          <p className="font-semibold text-pramuka-900">Antrian pengujian SKU</p>
          <p className="text-sm text-pramuka-600">
            {menunggu} menunggu, {antrian.length - menunggu} sedang diuji (ditujukan kepada Anda atau antrian rombel Anda)
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => onNav('antrian')}>Buka antrian</button>
      </section>

      <ProgresRombel penugasan={penugasan} onNav={onNav} />

      <RingkasanGudep onNav={onNav} />
    </div>
  );
}

function Antrian({ onBuka }) {
  const { user, users, progress, dokumen } = useApp();
  const [semua, setSemua] = useState(false);
  const [uji, setUji] = useState(null);
  const [alih, setAlih] = useState(null);
  const { penugasan, penugasanPeserta } = usePenugasanKini();
  const namaOrang = (id) => users.find((u) => u.id === id)?.nama ?? 'penguji';

  // Antrian saya (ditujukan kepada saya + antrian rombel saya) sudah sesuai rombel tugas. Rombel saya baru menyaring saat melihat antrian semua penguji.
  const rombel = useMemo(() => rombelDariPenugasan(penugasan, user.id), [penugasan, user.id]);
  const [hanyaSaya, setHanyaSaya] = useState(true);
  const batasRombel = semua && hanyaSaya && rombel.length > 0;
  const antrian = antrianPengujian(progress, users, semua ? null : user.id, penugasan, dokumen ?? [], penugasanPeserta)
    .filter((a) => !batasRombel || rombel.includes(a.peserta.kelas));
  const menunggu = antrian.filter((a) => a.entry.status === 'diajukan').length;

  return (
    <div className="animasi-naik">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Antrian pengujian</h1>
          <p className="text-sm text-pramuka-600">
            {menunggu} menunggu, {antrian.length - menunggu} sedang diuji
          </p>
        </div>
        <div className="flex flex-col gap-1.5 sm:items-end">
          <label className="flex items-center gap-2 text-sm font-medium text-pramuka-700">
            <input type="checkbox" className="h-4 w-4 accent-pramuka-800" checked={semua} onChange={(e) => setSemua(e.target.checked)} />
            Tampilkan semua penguji
          </label>
          {semua && rombel.length > 0 && (
            <label className="flex items-center gap-2 text-sm font-medium text-pramuka-700">
              <input type="checkbox" className="h-4 w-4 accent-pramuka-800" checked={hanyaSaya} onChange={(e) => setHanyaSaya(e.target.checked)} />
              Hanya rombel saya ({ringkasDaftarRombel(rombel)})
            </label>
          )}
        </div>
      </div>

      {antrian.length === 0 ? (
        <Kosong judul="Antrian kosong" teks="Belum ada peserta yang mengajukan pengujian kepada Anda atau ke antrian rombel Anda." />
      ) : (
        <ul className="panel divide-y divide-pramuka-100">
          {antrian.map(({ peserta, poin, entry, bersama }) => {
            const boleh = bolehMenilaiPoin(user, poin, { users, peserta, dokumen, penugasan: penugasan ?? [], penugasanPeserta });
            return (
            <li key={`${peserta.id}-${poin.id}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 gap-3">
                <Avatar nama={peserta.nama} />
                <div className="min-w-0">
                  <p className="font-semibold">{peserta.nama}</p>
                  <p className="text-xs text-pramuka-500">Kelas {peserta.kelas}, {peserta.sangga}, SKU {poin.tingkat}</p>
                  <div className="mt-1"><TeksPoin poin={poin} /></div>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-pramuka-600">
                    <Badge status={entry.status} />
                    <Icon nama="kalender" className="h-3.5 w-3.5" />
                    {fmtTanggal(entry.jadwal ?? entry.tanggalUji)}
                    {bersama && <span className="rounded bg-sky-50 px-1.5 py-0.5 font-semibold text-sky-800 ring-1 ring-inset ring-sky-300">Antrian rombel</span>}
                    {!bersama && entry.pengujiId !== user.id && <span>Penguji: {namaOrang(entry.pengujiId)}</span>}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!boleh}
                  title={boleh ? undefined : pesanTidakBolehMenilai(poin)}
                  onClick={() => setUji({ pesertaId: peserta.id, poin })}
                >
                  Nilai
                </button>
                {user.jabatan === 'Pembina' && (
                  <button className="btn btn-outline btn-sm" onClick={() => setAlih({ peserta, poin, entry })}>Alihkan</button>
                )}
                <button className="btn btn-outline btn-sm" onClick={() => onBuka(peserta.id)}>Lihat peserta</button>
              </div>
            </li>
            );
          })}
        </ul>
      )}

      {uji && <UjiModal pesertaId={uji.pesertaId} poin={uji.poin} onTutup={() => setUji(null)} />}
      {alih && <AlihkanModal peserta={alih.peserta} poin={alih.poin} entry={alih.entry} onTutup={() => setAlih(null)} />}
    </div>
  );
}

function DaftarPeserta({ onBuka }) {
  const { daftarPesertaSemua, progress } = useApp();
  const { filter, setFilter, efektif, rombelSaya } = useFilterRombel();

  const daftar = useMemo(
    () => terapkanFilter(daftarPesertaSemua, efektif).sort((a, b) => a.nama.localeCompare(b.nama, 'id')),
    [daftarPesertaSemua, efektif]
  );

  return (
    <div className="animasi-naik">
      <h1 className="mb-1 text-2xl font-bold">Peserta</h1>
      <p className="mb-4 text-sm text-pramuka-600">{daftar.length} peserta ditemukan</p>
      <div className="mb-4"><FilterBar data={daftarPesertaSemua} filter={filter} setFilter={setFilter} tampil={['status', 'sangga', 'kelas', 'peran', 'agama', 'jk']} rombelSaya={rombelSaya} /></div>

      {daftar.length === 0 ? (
        <Kosong judul="Tidak ada peserta" teks="Ubah kata kunci, sangga, kelas, peran, atau agama pada filter, atau matikan &quot;Hanya rombel saya&quot;." />
      ) : (
        <ul className="panel divide-y divide-pramuka-100">
          {daftar.map((u) => {
            const b = hitungProgres(progress, u, 'Bantara');
            const l = hitungProgres(progress, u, 'Laksana');
            return (
              <li key={u.id}>
                <button onClick={() => onBuka(u.id)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-pramuka-50">
                  <Avatar nama={u.nama} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{u.nama}</p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-pramuka-500">
                      Kelas {u.kelas}, {u.sangga}, {u.agama} <BadgePeran peran={u.peran} singkat />
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <div>
                        <p className="mb-1 text-xs text-pramuka-600">Bantara {b.lulus}/{b.total} ({b.persen}%)</p>
                        <ProgressBar persen={b.persen} label={`Bantara ${u.nama}`} />
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-pramuka-600">Laksana {l.lulus}/{l.total} ({l.persen}%)</p>
                        <ProgressBar persen={l.persen} label={`Laksana ${u.nama}`} />
                      </div>
                    </div>
                  </div>
                  <Icon nama="panah" className="h-5 w-5 shrink-0 text-pramuka-400" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function PengujiDashboard({ mode, onBuka, onNav }) {
  if (mode === 'dashboard') return <Dashboard onNav={onNav} />;
  return mode === 'antrian' ? <Antrian onBuka={onBuka} /> : <DaftarPeserta onBuka={onBuka} />;
}
