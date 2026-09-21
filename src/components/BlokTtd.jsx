import { useGudep } from '../lib/gudepStore';
import { fmtTanggal } from '../lib/format';

/**
 * Blok tanda tangan dan stempel BASAH untuk semua dokumen cetak (Kartu SKU, Surat Tanda Lulus, Berita Acara, Nilai Raport, Surat Pengantar).
 * Ruang tanda tangan dikosongkan; lingkaran putus-putus "stempel" hanya tampak di layar (kelas `no-print`) sebagai penanda tempat, tidak tercetak.
 * `orang` = { jabatan, nama, nta }; nama kosong dicetak garis. `tanggal` menambah baris "Kota, tanggal" di atas jabatan; bila beberapa blok
 * berdampingan dan hanya satu yang bertanggal, blok lain memakai `sisakanTanggal` agar baris jabatan tetap sejajar.
 */
export default function BlokTtd({ orang, tanggal = null, sisakanTanggal = false, className = '' }) {
  const G = useGudep();
  return (
    <div className={`break-inside-avoid text-center text-sm ${className}`}>
      {tanggal ? <p className="whitespace-nowrap">{G.kota}, {fmtTanggal(tanggal)}</p> : sisakanTanggal && <p aria-hidden="true">&nbsp;</p>}
      <p>{orang.jabatan}</p>
      <div className="relative h-20" aria-hidden="true">
        <span className="no-print absolute left-2 top-1 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border border-dashed border-pramuka-300 text-[9px] uppercase tracking-wide text-pramuka-300">
          stempel
        </span>
      </div>
      {orang.nama ? <p className="font-bold underline">{orang.nama}</p> : <p>( ______________________________ )</p>}
      {orang.nta && <p className="text-xs">NTA {orang.nta}</p>}
    </div>
  );
}
