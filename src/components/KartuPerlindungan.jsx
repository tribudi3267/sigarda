import { useApp } from '../context/AppContext';
import useSfh from '../hooks/useSfh';
import { fmtTanggal } from '../lib/format';
import { gudepSfhTerisi, statusSfh } from '../lib/perlindunganLogic';
import SumberPeraturan from './SumberPeraturan';

/**
 * Kartu "Perlindungan anggota (Safe From Harm)" pada Akun saya (semua peran; Tahap 4): kepada siapa melapor bila ada kejadian yang membahayakan (penerima laporan gugus depan) dan, bagi
 * Pembina dan Admin Gudep, status catatan kewajiban miliknya. Laporan kejadian tidak disimpan di aplikasi.
 */
export default function KartuPerlindungan() {
  const { akun } = useApp();
  const data = useSfh();
  if (data.memuat || data.galat) return null; // basis data belum dimigrasi atau belum dimuat: kartu tidak tampil
  const st = statusSfh(data.catatan, akun ?? {});
  const g = data.gudep;

  return (
    <section className="panel p-5 lg:col-span-2" aria-label="Perlindungan anggota">
      <h2 className="text-lg font-bold">Perlindungan anggota (Safe From Harm)</h2>
      <p className="mb-3 mt-1 text-sm text-pramuka-600">
        Setiap anggota berhak berlatih di lingkungan yang aman, nyaman, sehat, dan selamat: bebas dari perundungan, pelecehan, kekerasan, dan penelantaran, juga di dunia maya. Bila kamu
        mengalami atau mengetahui kejadian yang membahayakan, sampaikan kepada penerima laporan di bawah. Laporan bersifat rahasia dan tidak dicatat di aplikasi ini.
      </p>
      {gudepSfhTerisi(g) ? (
        <dl className="divide-y divide-pramuka-100 text-sm">
          <div className="flex justify-between gap-4 py-2"><dt className="text-pramuka-600">Penerima laporan</dt><dd className="text-right font-semibold">{g.penerima}</dd></div>
          {g.kontak && <div className="flex justify-between gap-4 py-2"><dt className="text-pramuka-600">Kontak</dt><dd className="text-right font-semibold">{g.kontak}</dd></div>}
          {g.catatan && <div className="flex justify-between gap-4 py-2"><dt className="text-pramuka-600">Keterangan</dt><dd className="text-right">{g.catatan}</dd></div>}
          {g.prosedurUrl && <div className="flex justify-between gap-4 py-2"><dt className="text-pramuka-600">Prosedur tertulis</dt><dd className="text-right"><a className="underline" href={g.prosedurUrl} target="_blank" rel="noreferrer">Buka</a></dd></div>}
        </dl>
      ) : (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950">Penerima laporan gugus depan belum ditetapkan. Sementara itu sampaikan kepada Pembina atau Ka. Mabigus.</p>
      )}
      {st.length > 0 && (
        <div className="mt-3 rounded-lg bg-pramuka-50 p-3 text-sm">
          <p className="mb-1 font-semibold text-pramuka-800">Catatan kewajibanmu sebagai anggota dewasa</p>
          <ul className="space-y-0.5">
            {st.map((s) => (
              <li key={s.jenis}><span className={s.catatan ? 'font-semibold text-emerald-800' : 'font-semibold text-amber-900'}>{s.catatan ? 'Tercatat' : 'Belum'}</span> {s.label}{s.catatan ? `, ${fmtTanggal(s.catatan.tanggal)}` : ''}</li>
            ))}
          </ul>
        </div>
      )}
      <SumberPeraturan className="mt-3" rujukan={[{ id: 'perlindungan-004-2021', bagian: 'jenis bahaya (Pasal 3-4), pelaporan dan penanganan (Pasal 10-11), larangan (Pasal 12-13)' }]} />
    </section>
  );
}
