import PenugasanRombel from '../components/PenugasanRombel';

/** Penugasan penguji per rombel, hanya lihat (Pembina). Admin Gudep mengaturnya di Anggota > Penugasan. */
export default function Penugasan() {
  return (
    <div className="animasi-naik">
      <h1 className="mb-4 text-2xl font-bold">Penugasan penguji</h1>
      <PenugasanRombel />
    </div>
  );
}
