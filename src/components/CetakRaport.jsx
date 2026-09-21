import { useGudep } from '../lib/gudepStore';
import { namaAmbalan } from '../lib/gudepLogic';
import { PERIODE } from '../lib/absensiLogic';
import { fmtTanggal, hariIni } from '../lib/format';
import { PREDIKAT } from '../lib/raportLogic';
import { KopSurat } from './DokumenSku';

// "Ambalan Gajah Mada/..." dipakai apa adanya; bila nama tidak diawali kata Ambalan, kata itu ditambahkan.

/**
 * Satu lembar nilai ekstrakurikuler (A4 portrait) untuk satu Penegak. Baris yang belum final diberi tanda DRAF yang jelas
 * karena hanya saran; hanya yang berstatus final yang boleh diserahkan ke sekolah.
 */
export function LembarRaport({ baris, tahunAjaran, semester, tanggal }) {
  const G = useGudep();
  const NAMA_AMBALAN = namaAmbalan(G);
  const { peserta } = baris;
  const final = baris.status === 'final';
  const p = baris.predikat && baris.sikap != null ? PREDIKAT[baris.predikat] : null;

  return (
    <article className="print-area raport-halaman relative mx-auto min-w-[660px] max-w-[794px] border border-pramuka-300 bg-white p-8 text-pramuka-900">
      <KopSurat />
      <h2 className="mt-4 text-center font-display text-base font-bold">NILAI EKSTRAKURIKULER PRAMUKA</h2>
      <p className="mt-1 text-center text-sm">Tahun Ajaran {tahunAjaran}, {PERIODE[semester]}</p>

      {!final && (
        <p className="mt-3 border-2 border-red-700 px-3 py-1.5 text-center text-sm font-bold uppercase tracking-wide text-red-700">
          Draf, belum final. Bukan dokumen resmi.
        </p>
      )}

      <dl className="mt-5 grid grid-cols-[170px_1fr] gap-x-2 gap-y-2 text-sm">
        <dt>Nama</dt><dd>: <b>{peserta.nama}</b></dd>
        <dt>NIS</dt><dd>: {peserta.nis || '-'}</dd>
        <dt>Kelas</dt><dd>: {peserta.kelas || '-'}</dd>
        <dt>Ekstrakurikuler</dt><dd>: Pramuka Penegak ({NAMA_AMBALAN})</dd>
        <dt>Predikat</dt>
        <dd>: {p ? <b>{p.label} ({p.huruf})</b> : <span className="text-red-700">belum ditetapkan</span>}</dd>
      </dl>

      <div className="mt-4 border border-pramuka-400 text-sm">
        <p className="border-b border-pramuka-400 bg-pramuka-100 px-3 py-1.5 font-bold">Deskripsi Capaian</p>
        <p className="min-h-[7rem] whitespace-pre-wrap px-3 py-2 leading-relaxed">
          {baris.deskripsi || <span className="text-red-700">Deskripsi belum diisi.</span>}
        </p>
      </div>

      <p className="mt-8 text-right text-sm">{G.kota}, {fmtTanggal(tanggal ?? hariIni())}</p>
      <div className="mt-1 text-center text-sm">
        <div className="ml-auto w-64">
          <p>{G.pembina.jabatan}</p>
          <div className="h-16" />
          <p className="font-bold underline">{G.pembina.nama}</p>
          {G.pembina.nta && <p className="text-xs">NTA {G.pembina.nta}</p>}
        </div>
      </div>
    </article>
  );
}

/** Semua lembar, satu per halaman cetak. */
export default function CetakRaport({ daftar, tahunAjaran, semester }) {
  return (
    <div className="space-y-6">
      {daftar.map((b) => (
        <div key={b.peserta.id} className="raport-lembar overflow-x-auto pb-1">
          <LembarRaport baris={b} tahunAjaran={tahunAjaran} semester={semester} />
        </div>
      ))}
    </div>
  );
}
