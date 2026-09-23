import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { whatsappSah } from '../lib/eskalasiLogic';
import { Field } from './ui';

/**
 * Formulir nomor WhatsApp milik sendiri (semua peran). Dipakai di menu Akun (permanen) dan ajakan sesudah masuk bila belum diisi
 * (tahap L5, dapat dilewati). Hanya FORMAT yang diperiksa; server tidak dapat memastikan nomor benar-benar aktif di WhatsApp.
 */
export default function FormWhatsapp({ onSelesai, onLewati }) {
  const { user, simpanWhatsapp } = useApp();
  const [nomor, setNomor] = useState(user.whatsapp ?? '');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);

  const kirim = async (e) => {
    e.preventDefault();
    if (sibuk) return;
    const v = nomor.trim();
    if (v && !whatsappSah(v)) {
      setGalat('Nomor hanya boleh berisi angka, spasi, dan tanda + ( ) . / - (8-20 karakter).');
      return;
    }
    setSibuk(true);
    setGalat('');
    const r = await simpanWhatsapp(v);
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); return; }
    onSelesai?.();
  };

  return (
    <form onSubmit={kirim} noValidate>
      <Field
        label="Nomor WhatsApp"
        htmlFor="whatsapp"
        bantuan="Supaya Pembina atau Dewan Ambalan dapat menghubungi Anda bila diperlukan, mis. SKU lama tidak bergerak. Contoh: 08123456789."
      >
        <input id="whatsapp" className="input" type="tel" inputMode="tel" placeholder="08123456789" maxLength={20} value={nomor} onChange={(e) => setNomor(e.target.value)} />
      </Field>
      {galat && <p role="alert" className="mb-3 text-sm font-medium text-red-700">{galat}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan nomor WhatsApp'}</button>
        {onLewati && <button type="button" className="btn btn-outline" disabled={sibuk} onClick={onLewati}>Isi nanti</button>}
      </div>
    </form>
  );
}
