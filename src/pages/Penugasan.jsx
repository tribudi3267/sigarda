import { useApp } from '../context/AppContext';
import PenugasanRombel from '../components/PenugasanRombel';

/** Penugasan penguji per rombel dan per Penegak. Pembina dan Admin Gudep mengaturnya (Admin juga lewat Anggota > Penugasan); Dewan hanya melihat. */
export default function Penugasan() {
  const { bolehAturPenugasan } = useApp();
  return (
    <div className="animasi-naik">
      <h1 className="mb-4 text-2xl font-bold">Penugasan penguji</h1>
      <PenugasanRombel bolehUbah={bolehAturPenugasan} />
    </div>
  );
}
