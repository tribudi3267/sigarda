import { waLink } from '../lib/eskalasiLogic';

/**
 * Tombol "Buka WhatsApp" berpesan siap-kirim. Dengan `nomor` langsung membuka percakapan dengan nomor itu; tanpa nomor
 * (anggota belum mengisinya) WhatsApp terbuka tanpa tujuan dan pengguna memilih kontak sendiri.
 */
export default function TombolWhatsapp({ nomor = '', nama, teks }) {
  return (
    <a
      href={waLink(nomor, teks)}
      target="_blank" rel="noreferrer"
      className="btn btn-outline btn-sm shrink-0"
      title={nomor ? `Kirim WhatsApp ke ${nama}` : 'Nomor WhatsApp belum diisi anggota ini: pilih kontak sendiri di WhatsApp'}
    >
      Buka WhatsApp{nomor ? '' : ' (pilih kontak)'}
    </a>
  );
}
