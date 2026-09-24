/**
 * Rujukan peraturan kepramukaan: judul peraturan (tautan ke berkas ASLI di situs Kwarnas) dan bagian yang menjadi dasar.
 * `rujukan` = id (string) atau { id, bagian } atau larik keduanya; id harus ada di src/data/peraturanData.js (dijaga uji/peraturan.mjs).
 * Dipakai di setiap tempat yang bersandar pada peraturan; jangan menulis nomor SK atau alamat berkas langsung di halaman.
 * `cetak`: pada hasil cetak alamat berkas ikut dituliskan (kertas tidak dapat diklik). `ringkas`: sebutan pendek (judul lengkap tetap di tooltip).
 */
import { daftarRujukan } from '../lib/peraturanLogic';

export default function SumberPeraturan({ rujukan, judul = 'Dasar aturan', ringkas = false, cetak = false, gelap = false, className = '' }) {
  const daftar = daftarRujukan(rujukan);
  if (!daftar.length) return null;
  const kelasTaut = gelap ? 'text-emas-light hover:text-white' : 'text-pramuka-700 hover:text-pramuka-900';
  return (
    <p className={`min-w-0 break-words text-xs leading-relaxed ${gelap ? 'text-pramuka-300' : 'text-pramuka-600'} ${className}`} data-sumber-peraturan>
      <span className={`font-semibold ${gelap ? 'text-pramuka-100' : 'text-pramuka-800'}`}>{judul}: </span>
      {daftar.map((x, i) => (
        <span key={`${x.id}|${x.bagian}`}>
          {i > 0 && '; '}
          <a
            href={x.url}
            target="_blank"
            rel="noopener noreferrer"
            title={x.judul}
            className={`font-medium underline decoration-dotted underline-offset-2 ${kelasTaut}`}
          >
            {ringkas ? x.nama : x.judul}
          </a>
          {x.bagian && <span>, {x.bagian}</span>}
          {cetak && <span className="hidden print:inline"> ({x.url})</span>}
        </span>
      ))}
    </p>
  );
}
