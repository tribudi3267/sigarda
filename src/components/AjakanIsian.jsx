import { useApp } from '../context/AppContext';
import useIsianSaya from '../hooks/useIsianSaya';
import { pokokKurang } from '../lib/isianLogic';
import FormWhatsapp from './FormWhatsapp';
import FormDataDiri from './FormDataDiri';
import { Modal } from './ui';

/**
 * Ajakan sesudah masuk bagi Penegak aktif (Tahap 3, H1; menggantikan ajakan nomor WhatsApp saja): melengkapi data diri untuk portofolio Garuda. Perilaku sama dengan ajakan
 * WhatsApp: satu kali per masuk, dapat dilewati ("Isi nanti"), dan tampil lagi pada masuk berikutnya selama isian pokok (WhatsApp, jenis kelamin, agama, tanggal lahir,
 * tempat lahir, alamat, nama orang tua/wali) belum lengkap. Bila data diri belum dapat dimuat (basis data belum dimigrasi), kembali ke ajakan nomor WhatsApp saja.
 */
export default function AjakanIsian({ tutup, onTutup }) {
  const { akun } = useApp();
  const data = useIsianSaya(true);
  if (!data.siap || tutup) return null;

  if (data.galat) {
    return (
      <Modal buka={!akun.whatsapp} tutup={onTutup} judul="Isi nomor WhatsApp">
        <p className="mb-4 text-sm text-pramuka-600">
          Supaya Pembina atau Dewan Ambalan dapat menghubungi Anda bila diperlukan (mis. SKU sudah lama tidak bergerak). Boleh dilewati; akan
          ditanyakan lagi lain kali sampai diisi.
        </p>
        <FormWhatsapp onSelesai={onTutup} onLewati={onTutup} />
      </Modal>
    );
  }

  const kurang = pokokKurang({ akun, isian: data.isian, lahir: data.lahir });
  return (
    <Modal buka={kurang.length > 0} tutup={onTutup} judul="Lengkapi data dirimu" lebar="max-w-2xl">
      <p className="mb-3 text-sm text-pramuka-700">
        Yang masih perlu dilengkapi: <strong>{kurang.join(', ')}</strong>. Boleh dilewati; akan ditanyakan lagi lain kali sampai lengkap.
      </p>
      <FormDataDiri data={data} onSelesai={onTutup} onLewati={onTutup} />
    </Modal>
  );
}
