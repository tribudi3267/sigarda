import { GUDEP } from '../config';
import { fmtHariTanggal, fmtTanggal } from '../lib/format';
import { HASIL_MAGANG, HASIL_TUGAS, labelButirBelum } from '../lib/sidangLogic';
import { KopSurat } from './DokumenSku';

// "Ambalan Gajah Mada/..." dipakai apa adanya; bila nama tidak diawali kata Ambalan, kata itu ditambahkan.
const NAMA_AMBALAN = /^ambalan\b/i.test(GUDEP.singkat) ? GUDEP.singkat : `Ambalan ${GUDEP.singkat}`;

const Kotak = ({ isi }) => <span className="mr-1.5 inline-block w-8 font-mono font-bold">{isi ? '[ X ]' : '[   ]'}</span>;

function Ttd({ jabatan, nama, nta }) {
  return (
    <div className="text-center text-sm">
      <p>{jabatan}</p>
      <div className="h-16" />
      {nama ? <p className="font-bold underline">{nama}</p> : <p>( ______________________________ )</p>}
      {nta && <p className="text-xs">NTA {nta}</p>}
    </div>
  );
}

/**
 * Berita Acara Sidang Dewan Kehormatan Ambalan (A4 portrait). Isi mengikuti format dari Pembina.
 * Nama ketua dan sebutan jabatannya diambil dari catatan sidang (dicatat saat sidang), bukan dari pengaturan saat ini.
 */
export default function BeritaAcaraSidang({ sidang, peserta }) {
  const layak = sidang.keputusan === 'layak';
  const penuh = sidang.capaianTotal > 0 && sidang.capaianLulus === sidang.capaianTotal;
  const belum = labelButirBelum(sidang.butirBelum);

  return (
    <article className="print-area mx-auto min-w-[660px] max-w-[794px] border border-pramuka-300 bg-white p-8 text-pramuka-900">
      <KopSurat />
      <h2 className="mt-4 text-center font-display text-base font-bold">BERITA ACARA SIDANG DEWAN KEHORMATAN AMBALAN</h2>
      <p className="mt-1 text-center text-sm">Nomor: {sidang.nomorBa}</p>

      <p className="mt-5 text-sm leading-relaxed">
        Pada hari ini, {fmtHariTanggal(sidang.tanggal)}, telah dilaksanakan Sidang Dewan Kehormatan {NAMA_AMBALAN} untuk
        menguji kelayakan pelantikan Penegak {sidang.tingkat} atas nama:
      </p>

      <dl className="mt-3 grid grid-cols-[140px_1fr] gap-x-2 gap-y-1 text-sm">
        <dt>Nama Calon</dt><dd>: <b>{peserta?.nama ?? '-'}</b></dd>
        <dt>NIS</dt><dd>: {peserta?.nis || '-'}</dd>
        <dt>Kelas, sangga</dt><dd>: {peserta ? `${peserta.kelas}, ${peserta.sangga}` : '-'}</dd>
        <dt>NTA Pramuka</dt><dd>: {sidang.nta || '______________________________'}</dd>
      </dl>

      <p className="mt-4 text-sm leading-relaxed">
        Berdasarkan pemeriksaan berkas administrasi dan uji kelayakan adat, Dewan Kehormatan menyatakan:
      </p>
      <div className="mt-2 space-y-1.5 text-sm">
        <p className="flex"><Kotak isi={layak} /><span><b>LAYAK DAN LULUS</b> untuk dilantik menjadi Penegak {sidang.tingkat}.</span></p>
        <p className="flex">
          <Kotak isi={!layak} />
          <span>
            <b>DITUNDA / REMEDI</b>{' '}
            {layak
              ? 'karena belum memenuhi syarat pada butir SKU: _________'
              : belum
                ? `karena belum memenuhi syarat pada butir SKU: ${belum}`
                : 'karena belum memenuhi syarat sebagaimana tercantum pada catatan di bawah.'}
          </span>
        </p>
      </div>

      <h3 className="mt-5 text-sm font-bold">Verifikasi Elemen Kompetensi</h3>
      <table className="mt-1 w-full border-collapse text-sm">
        <tbody>
          <tr>
            <td className="w-8 border border-pramuka-400 px-2 py-1 text-center align-top">1</td>
            <td className="w-64 border border-pramuka-400 px-2 py-1 align-top">Capaian SKU Buku Resmi Kwarnas</td>
            <td className="border border-pramuka-400 px-2 py-1 align-top">
              {penuh ? '100% terparaf' : 'Belum selesai'} ({sidang.capaianLulus} dari {sidang.capaianTotal} butir)
            </td>
          </tr>
          <tr>
            <td className="border border-pramuka-400 px-2 py-1 text-center align-top">2</td>
            <td className="border border-pramuka-400 px-2 py-1 align-top">Masa Magang / Masa Tamu Ambalan</td>
            <td className="border border-pramuka-400 px-2 py-1 align-top">{HASIL_MAGANG[sidang.magang]}</td>
          </tr>
          <tr>
            <td className="border border-pramuka-400 px-2 py-1 text-center align-top">3</td>
            <td className="border border-pramuka-400 px-2 py-1 align-top">Tugas Tambahan Adat Ambalan</td>
            <td className="border border-pramuka-400 px-2 py-1 align-top">
              {HASIL_TUGAS[sidang.tugasAdat]}
              {sidang.tugasAdatKet ? ` (${sidang.tugasAdatKet})` : ''}
            </td>
          </tr>
        </tbody>
      </table>

      {sidang.catatan && (
        <div className="mt-3 text-sm">
          <p className="font-bold">Catatan Dewan Kehormatan</p>
          <p className="whitespace-pre-wrap leading-relaxed">{sidang.catatan}</p>
        </div>
      )}

      <p className="mt-6 text-center text-sm">Demikian berita acara ini dibuat untuk dipergunakan sebagaimana mestinya.</p>
      <p className="mt-3 text-right text-sm">{GUDEP.kota}, {fmtTanggal(sidang.tanggal)}</p>
      <p className="mt-1 text-center text-sm font-semibold">Membuat Keputusan,</p>
      <div className="mt-2 grid grid-cols-2 gap-8">
        <Ttd jabatan={sidang.ketuaSebutan} nama={sidang.ketuaNama} />
        <Ttd jabatan="Pembina Pramuka Penegak" nama={GUDEP.pembina.nama} nta={GUDEP.pembina.nta} />
      </div>
    </article>
  );
}
