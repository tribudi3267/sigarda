import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/**
 * Kode QR sebagai SVG (tajam pada cetakan berapa pun ukurannya). Hitam di atas putih dengan ruang tepi.
 * `teks` = isi QR; `ukuran` dalam piksel CSS (sisi kotak); `label` = keterangan untuk pembaca layar.
 * `koreksi` = tingkat koreksi kesalahan: 'M' (bawaan, lebih tahan rusak) atau 'L' (modul lebih sedikit, jadi lebih besar pada ukuran kecil,
 * dipakai pada Kartu SKU yang mencetak banyak QR di atas kertas bersih).
 */
export default function KodeQr({ teks, ukuran = 96, label = 'Kode QR verifikasi', className = '', koreksi = 'M' }) {
  const svg = useMemo(() => {
    try {
      const q = qrcode(0, koreksi);
      q.addData(teks);
      q.make();
      return q.createSvgTag({ cellSize: 1, margin: 0, scalable: true });
    } catch {
      return '';
    }
  }, [teks, koreksi]);
  if (!svg) return null;
  return (
    <span
      role="img"
      aria-label={label}
      className={`inline-block shrink-0 bg-white p-[3px] leading-none ${className}`}
      style={{ width: ukuran, height: ukuran }}
    >
      <span className="block h-full w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
    </span>
  );
}
