import { fmtHariTanggal, fmtTanggal } from '../lib/format';
import { namaAmbalan } from '../lib/gudepLogic';
import { useGudep } from '../lib/gudepStore';
import { HASIL_MAGANG, HASIL_TUGAS, labelButirBelum } from '../lib/sidangLogic';
import { alamatDasar, urlVerifikasi } from '../lib/verifikasiLogic';
import SumberPeraturan from './SumberPeraturan';
import BlokTtd from './BlokTtd';
import KodeQr from './KodeQr';
import { KopSurat } from './DokumenSku';

// Kotak centang digambar dengan garis tepi (bukan teks "[ X ]") agar tidak pernah terpotong ke baris berikutnya di layar maupun cetakan.
const Kotak = ({ isi }) => (
  <span
    className="mr-2 mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center border-2 border-pramuka-900 text-[12px] font-bold leading-none"
    role="img"
    aria-label={isi ? 'Dipilih' : 'Tidak dipilih'}
  >
    {isi ? 'X' : ''}
  </span>
);

/**
 * Berita Acara Sidang Dewan Kehormatan Ambalan (A4 portrait). Isi mengikuti format dari Pembina.
 * Nama ketua dan sebutan jabatannya diambil dari catatan sidang (dicatat saat sidang), bukan dari pengaturan saat ini.
 * `token` dan `kode` = QR dan kode verifikasi (sg_sidang_token); tanpa token berita acara tetap tercetak tanpa QR.
 * QR hanya membuktikan berita acara benar tercatat di aplikasi; dokumen sah bila bertanda tangan dan berstempel.
 */
export default function BeritaAcaraSidang({ sidang, peserta, token = null, kode = null }) {
  const G = useGudep();
  const NAMA_AMBALAN = namaAmbalan(G); // "Ambalan Gajah Mada/..." dipakai apa adanya; bila belum diawali kata Ambalan, kata itu ditambahkan
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
      <p className="mt-3 text-right text-sm">{G.kota}, {fmtTanggal(sidang.tanggal)}</p>
      <p className="mt-1 text-center text-sm font-semibold">Membuat Keputusan,</p>
      <div className="mt-2 grid grid-cols-2 gap-8">
        <BlokTtd orang={{ jabatan: sidang.ketuaSebutan, nama: sidang.ketuaNama }} />
        <BlokTtd orang={{ jabatan: 'Pembina Pramuka Penegak', nama: G.pembina.nama, nta: G.pembina.nta }} />
      </div>

      <SumberPeraturan
        cetak
        className="mt-4 text-[10px] leading-snug"
        rujukan={[
          { id: 'gudep-05-2026', bagian: 'Pasal 24 ayat (15)' },
          { id: 'sku-penegak-2011', bagian: 'Bab V' },
        ]}
      />

      {token && (
        <div className="mt-5 flex items-start gap-3 border-t border-pramuka-200 pt-3 text-[10px] leading-snug text-pramuka-600 break-inside-avoid">
          <KodeQr teks={urlVerifikasi(token)} ukuran={84} label={`QR verifikasi berita acara nomor ${sidang.nomorBa}`} className="border border-pramuka-200" />
          <div>
            <p className="font-semibold text-pramuka-800">Periksa keaslian berita acara</p>
            <p>Pindai QR atau buka {alamatDasar().replace(/^https?:\/\//, '').replace(/\/$/, '')} lalu ketik kode:</p>
            {kode && <p className="font-mono text-xs font-bold text-pramuka-900">{kode}</p>}
            <p className="mt-1">QR hanya membuktikan berita acara ini tercatat di aplikasi; dokumen sah bila bertanda tangan dan berstempel.</p>
          </div>
        </div>
      )}
    </article>
  );
}
