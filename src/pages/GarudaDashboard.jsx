import { useApp } from '../context/AppContext';
import { PERAN } from '../lib/skuLogic';
import { hitungPortofolio } from '../lib/portofolioLogic';
import { fmtTanggal } from '../lib/format';
import PortofolioChecklist from '../components/PortofolioChecklist';
import RekapKesiapan, { JurnalTerbaru } from '../components/RekapKesiapan';
import { Icon, Lencana } from '../components/ui';

/** Dashboard Penegak Calon Garuda: jurnal kesiapan dan cek list 26 dokumen portofolio. */
export default function GarudaDashboard({ setTab }) {
  const { user, portofolio, peranUser } = useApp();
  const h = hitungPortofolio(portofolio, user.id);

  return (
    <div className="space-y-5 animasi-naik">
      <section className="flex items-center gap-5 rounded-lg border-2 border-emas bg-pramuka-800 p-5 text-pramuka-50">
        <Lencana persen={h.persen} />
        <div className="min-w-0">
          <p className="text-sm text-pramuka-300">Dashboard Calon Penegak Garuda</p>
          <h1 className="text-2xl font-bold leading-tight">{user.nama}</h1>
          <p className="mt-1 text-sm text-pramuka-200">Kelas {user.kelas}, {user.sangga}</p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-emas px-2.5 py-1 text-sm font-bold text-pramuka-900">
            <Icon nama="bintang" className="h-4 w-4" />
            {PERAN[peranUser]?.label}
          </p>
          <p className="mt-2 text-xs text-pramuka-300">
            Terdaftar sejak {fmtTanggal(user.calonGaruda)}. Lencana menunjukkan kesiapan portofolio: {h.siap} dari {h.total} dokumen siap.
          </p>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <RekapKesiapan pesertaId={user.id} />
        <JurnalTerbaru pesertaId={user.id} />
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">Cek list dokumen portofolio</h2>
            <p className="text-sm text-pramuka-600">
              Daftar 26 lampiran sesuai tabel cek list portofolio Garuda. Ubah status setiap dokumen, tambahkan catatan atau tautan berkas.
            </p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => setTab('absensi')}>
            <Icon nama="absensi" className="h-4 w-4" /> Lihat daftar hadir (dokumen no. 4)
          </button>
        </div>
        <PortofolioChecklist pesertaId={user.id} mode="peserta" />
      </section>
    </div>
  );
}
