import { useGudep } from '../lib/gudepStore';
import { KopSurat } from './DokumenSku';
import BlokTtd from './BlokTtd';
import { labelJenisAgenda } from '../lib/agendaLogic';
import { fmtTanggal, hariIni } from '../lib/format';

const SEL = 'border border-pramuka-400 px-2 py-1 align-top';
const Th = ({ children }) => <th className="border border-pramuka-400 bg-pramuka-100 px-2 py-1 text-left font-semibold">{children}</th>;

/** Cetak PDF (window.print()) satu Laporan Tahunan lengkap. Data dari src/lib/laporanLogic.js, sama dengan lembar Excel (susunLaporanTahunanXlsx). */
export default function CetakLaporanTahunan({ rentang, keanggotaan, pengurus, kegiatan, sku, kehadiran, iuran }) {
  const G = useGudep();

  return (
    <article className="print-area mx-auto max-w-[900px] border border-pramuka-300 bg-white p-6 text-pramuka-900">
      <KopSurat />
      <h2 className="mt-4 text-center font-display text-lg font-bold">LAPORAN TAHUNAN GUGUS DEPAN</h2>
      <p className="text-center text-sm text-pramuka-600">
        {rentang.label} ({fmtTanggal(rentang.mulai)} s.d. {fmtTanggal(rentang.akhir)}) &middot; Dicetak {fmtTanggal(hariIni())}
      </p>

      <h3 className="mt-6 font-display text-base font-bold">Rekap Keanggotaan Penegak</h3>
      <p className="text-xs text-pramuka-600">Snapshot pada tanggal laporan dibuat, bukan rata-rata sepanjang periode.</p>
      <table className="mt-2 w-full border-collapse text-xs">
        <thead><tr><Th>Tingkat</Th><Th>Laki-laki</Th><Th>Perempuan</Th><Th>Calon Bantara</Th><Th>Calon Laksana</Th><Th>Calon Garuda</Th><Th>Total</Th></tr></thead>
        <tbody>
          {keanggotaan.map((r) => (
            <tr key={r.tingkat} className={r.tingkat === 'Total' ? 'font-bold' : ''}>
              <td className={SEL}>{r.tingkat}</td><td className={`${SEL} text-center`}>{r.lakiLaki}</td><td className={`${SEL} text-center`}>{r.perempuan}</td>
              <td className={`${SEL} text-center`}>{r.calonBantara}</td><td className={`${SEL} text-center`}>{r.calonLaksana}</td>
              <td className={`${SEL} text-center`}>{r.calonGaruda}</td><td className={`${SEL} text-center`}>{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="mt-6 font-display text-base font-bold">Kepengurusan Dewan Ambalan</h3>
      <table className="mt-2 w-full border-collapse text-xs">
        <thead><tr><Th>No</Th><Th>Nama</Th><Th>NTA</Th><Th>Jabatan</Th></tr></thead>
        <tbody>
          {pengurus.length === 0 && <tr><td className={SEL} colSpan={4}>Belum ada pengurus Dewan Ambalan yang menjabat.</td></tr>}
          {pengurus.map((u, i) => (
            <tr key={u.id}><td className={`${SEL} text-center`}>{i + 1}</td><td className={SEL}>{u.nama}</td><td className={SEL}>{u.nta || '-'}</td><td className={SEL}>{u.jabatanDewan}</td></tr>
          ))}
        </tbody>
      </table>

      <h3 className="mt-6 font-display text-base font-bold">Rekap Kegiatan Ambalan</h3>
      <table className="mt-2 w-full border-collapse text-xs">
        <thead><tr><Th>No</Th><Th>Tanggal</Th><Th>Jenis</Th><Th>Judul</Th></tr></thead>
        <tbody>
          {kegiatan.length === 0 && <tr><td className={SEL} colSpan={4}>Belum ada kegiatan tercatat pada periode ini.</td></tr>}
          {kegiatan.map((a, i) => (
            <tr key={a.id}><td className={`${SEL} text-center`}>{i + 1}</td><td className={SEL}>{fmtTanggal(a.tanggal)}</td><td className={SEL}>{labelJenisAgenda(a.jenis)}</td><td className={SEL}>{a.judul}</td></tr>
          ))}
        </tbody>
      </table>

      <h3 className="mt-6 font-display text-base font-bold">Rekap Pencapaian SKU</h3>
      <table className="mt-2 w-full border-collapse text-xs">
        <tbody>
          <tr><td className={SEL}>Penegak yang menyelesaikan seluruh SKU Bantara</td><td className={`${SEL} text-center`}>{sku.bantaraLulus}</td></tr>
          <tr><td className={SEL}>Penegak yang menyelesaikan seluruh SKU Laksana</td><td className={`${SEL} text-center`}>{sku.laksanaLulus}</td></tr>
          <tr><td className={SEL}>Penegak yang mendaftar sebagai Calon Garuda</td><td className={`${SEL} text-center`}>{sku.garudaBaru}</td></tr>
        </tbody>
      </table>

      <h3 className="mt-6 font-display text-base font-bold">Rekap Kehadiran Latihan Rutin Jumat</h3>
      <table className="mt-2 w-full border-collapse text-xs">
        <tbody>
          <tr><td className={SEL}>Jumlah pertemuan terlaksana</td><td className={`${SEL} text-center`}>{kehadiran.pertemuan}</td></tr>
          <tr><td className={SEL}>Rata-rata kehadiran gudep</td><td className={`${SEL} text-center`}>{kehadiran.rata ?? '-'}%</td></tr>
          <tr><td className={SEL}>Penegak dengan kehadiran baik</td><td className={`${SEL} text-center`}>{kehadiran.baik}</td></tr>
          <tr><td className={SEL}>Penegak dengan kehadiran rendah</td><td className={`${SEL} text-center`}>{kehadiran.rendah}</td></tr>
        </tbody>
      </table>

      <h3 className="mt-6 font-display text-base font-bold">Rekap Keuangan Iuran Bumbung</h3>
      <table className="mt-2 w-full border-collapse text-xs">
        <tbody>
          <tr><td className={SEL}>Total iuran terkumpul</td><td className={`${SEL} text-center`}>Rp {iuran.total.toLocaleString('id-ID')}</td></tr>
          <tr><td className={SEL}>Total iuran susulan</td><td className={`${SEL} text-center`}>Rp {iuran.totalSusulan.toLocaleString('id-ID')}</td></tr>
          <tr><td className={SEL}>Jumlah catatan iuran (Penegak x pertemuan)</td><td className={`${SEL} text-center`}>{iuran.kali}</td></tr>
        </tbody>
      </table>

      <div className="mt-8 flex justify-end break-inside-avoid">
        <BlokTtd orang={G.pembina} tanggal={hariIni()} />
      </div>
    </article>
  );
}
