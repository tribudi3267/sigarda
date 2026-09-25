import { useGudep } from '../lib/gudepStore';
import { fmtTanggal } from '../lib/format';
import { barisSurat, pitaSurat } from '../lib/suratGuruLogic';
import { INDEKS_SURAT } from '../data/suratGuruData';
import BlokTtd from './BlokTtd';
import { KopSurat } from './DokumenSku';

const SEL = 'border border-pramuka-500 px-2 py-1 align-top';

/**
 * Satu surat keterangan guru (atau Ketua Gugus Depan) untuk lampiran portofolio Garuda, mengikuti "02. Portofolio Penegak Garuda 2026" Kwarcab Purbalingga. `isi` = templat berlaku
 * ({ uji, baris, pita }) atau null (belum diisi: baris kosong untuk ditulis tangan). Nomor surat, hari dan tanggal uji, nama guru, tanda tangan, dan stempel dikosongkan (basah).
 * Murni props (tanpa memuat data sendiri).
 */
export default function SuratKeteranganGuru({ jenis, peserta, isi, tahun, hari, className = '' }) {
  const G = useGudep();
  const s = INDEKS_SURAT[jenis];
  const gudep = s.kop === 'gudep';
  const baris = barisSurat(isi);
  const pita = pitaSurat(isi);
  const uji = isi?.uji || s.ujiBawaan;
  const namaPenerbit = gudep ? G.pembina.nama : '';
  const namaTtd2 = G.kamabigus.nama;

  return (
    <section className={`${className} border border-pramuka-300 p-6 text-[13px] leading-snug text-pramuka-900 print:border-0`}>
      {gudep ? <KopSurat /> : (
        <header className="border-b-4 border-double border-pramuka-800 pb-2 text-center leading-snug">
          <p className="font-display text-base font-bold">{(G.sekolah || G.nama).toUpperCase()}</p>
          <p className="text-xs">{G.alamat}</p>
        </header>
      )}
      <h3 className="mt-4 text-center font-display text-base font-bold underline">SURAT KETERANGAN</h3>
      <p className="text-center">No : &hellip;&hellip;&hellip;&hellip;&hellip;&hellip;&hellip;&hellip;&hellip;</p>
      <p className="mt-3">
        Kami yang bertanda tangan di bawah ini {s.penerbit}{gudep ? ` ${G.nomorGudep}` : ` ${G.sekolah || ''}`}, menerangkan bahwa:
      </p>
      <dl className="mt-2 grid grid-cols-[110px_10px_1fr] gap-y-0.5 pl-4">
        <dt>Nama Lengkap</dt><dd>:</dd><dd className="font-semibold">{peserta.nama}</dd>
        <dt>Kelas</dt><dd>:</dd><dd>{peserta.kelas}</dd>
        {gudep && <><dt>Sangga</dt><dd>:</dd><dd>{peserta.sangga || ' '}</dd><dt>Ambalan</dt><dd>:</dd><dd>{G.singkat}</dd></>}
      </dl>
      <p className="mt-3 text-justify">
        Telah selesai menempuh uji {uji} yang dilaksanakan pada hari &hellip;&hellip;&hellip;&hellip;&hellip; tanggal &hellip;&hellip;&hellip;&hellip;&hellip;&hellip;&hellip;&hellip;&hellip; tahun {tahun} dengan hasil sebagai berikut:
      </p>
      <table className="mt-2 w-full border-collapse text-xs">
        <thead>
          <tr className="bg-pramuka-100">
            <th className={`${SEL} w-8`} rowSpan={2}>No</th>
            <th className={SEL} rowSpan={2}>Uraian</th>
            <th className={SEL} colSpan={3}>Nilai</th>
          </tr>
          <tr className="bg-pramuka-100">{pita.map((p, i) => <th key={i} className={`${SEL} w-20`}>{p}</th>)}</tr>
        </thead>
        <tbody>
          {baris.map((b, i) => (
            b.jenis === 'judul' ? (
              <tr key={i} className="break-inside-avoid bg-pramuka-50 font-semibold">
                <td className={`${SEL} text-center`}>{b.no}</td><td className={SEL} colSpan={4}>{b.teks}</td>
              </tr>
            ) : (
              <tr key={i} className="h-7 break-inside-avoid">
                <td className={`${SEL} text-center`}>{b.no}</td><td className={SEL}>{b.teks}</td>
                <td className={SEL} /><td className={SEL} /><td className={SEL} />
              </tr>
            )
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-justify">
        Demikian surat keterangan ini kami terbitkan dengan penuh tanggung jawab atas kepentingan bangsa dan negara serta untuk dapat dipergunakan sebagaimana mestinya.
      </p>
      <p className="mt-2 text-right">{G.kota}, &hellip;&hellip;&hellip;&hellip;&hellip;&hellip;&hellip;&hellip;&hellip;&hellip; {tahun}</p>
      <div className="mt-1 grid grid-cols-2 gap-4">
        <BlokTtd orang={{ jabatan: s.penerbit, nama: namaPenerbit }} sisakanTanggal />
        <BlokTtd orang={{ jabatan: s.penandaTangan2, nama: namaTtd2 }} sisakanTanggal />
      </div>
      {!isi && <p className="no-print mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-950">Rubrik surat ini belum diisi (tanggal cetak {fmtTanggal(hari)}). Isi di panel Templat surat keterangan guru di atas; baris kosong dapat ditulis tangan.</p>}
    </section>
  );
}
