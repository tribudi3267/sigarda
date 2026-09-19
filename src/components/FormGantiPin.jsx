import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatPinSah, pinLemah, PIN_PANJANG } from '../lib/pinLogic';
import { Field } from './ui';

const angka = (setter) => (e) => setter(e.target.value.replace(/\D/g, ''));

/**
 * Formulir ganti PIN: PIN lama, PIN baru, ulangi PIN baru.
 * Dipakai pada layar wajib ganti PIN (login pertama atau setelah reset) dan pada menu Akun.
 * Aturan PIN diperiksa ulang di server.
 */
export default function FormGantiPin({ labelLama = 'PIN lama', onSelesai }) {
  const { gantiPin } = useApp();
  const [lama, setLama] = useState('');
  const [baru, setBaru] = useState('');
  const [ulangi, setUlangi] = useState('');
  const [lihat, setLihat] = useState(false);
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);

  const jenis = lihat ? 'text' : 'password';
  const syarat = [
    { ok: formatPinSah(baru), teks: `Tepat ${PIN_PANJANG} angka` },
    { ok: formatPinSah(baru) && !pinLemah(baru), teks: 'Bukan angka sama semua atau berurutan (mis. 111111, 123456)' },
    { ok: baru.length > 0 && baru !== lama, teks: 'Berbeda dari PIN lama' },
    { ok: baru.length > 0 && baru === ulangi, teks: 'Sama dengan ulangi PIN baru' },
  ];

  const kirim = async (e) => {
    e.preventDefault();
    if (sibuk) return;
    setSibuk(true);
    setGalat('');
    const r = await gantiPin({ pinLama: lama, pinBaru: baru, ulangi });
    setSibuk(false);
    if (!r.ok) {
      setGalat(r.pesan);
      return;
    }
    setLama('');
    setBaru('');
    setUlangi('');
    onSelesai?.();
  };

  return (
    <form onSubmit={kirim} noValidate>
      <Field label={labelLama} htmlFor="pin-lama">
        <input id="pin-lama" className="input" type={jenis} inputMode="numeric" autoComplete="current-password" maxLength={PIN_PANJANG} value={lama} onChange={angka(setLama)} />
      </Field>
      <Field label="PIN baru" htmlFor="pin-baru">
        <input id="pin-baru" className="input" type={jenis} inputMode="numeric" autoComplete="new-password" maxLength={PIN_PANJANG} value={baru} onChange={angka(setBaru)} />
      </Field>
      <Field label="Ulangi PIN baru" htmlFor="pin-ulang">
        <input id="pin-ulang" className="input" type={jenis} inputMode="numeric" autoComplete="new-password" maxLength={PIN_PANJANG} value={ulangi} onChange={angka(setUlangi)} />
      </Field>

      <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-pramuka-700">
        <input type="checkbox" className="h-4 w-4 accent-pramuka-800" checked={lihat} onChange={(e) => setLihat(e.target.checked)} />
        Tampilkan PIN
      </label>

      <ul className="mb-4 space-y-1 text-xs" aria-label="Syarat PIN baru">
        {syarat.map((s) => (
          <li key={s.teks} className={s.ok ? 'text-emerald-700' : 'text-pramuka-500'}>
            <span aria-hidden="true">{s.ok ? '✓' : '•'}</span> {s.teks}
          </li>
        ))}
      </ul>

      {galat && <p role="alert" className="mb-3 text-sm font-medium text-red-700">{galat}</p>}

      <button type="submit" className="btn btn-primary w-full" disabled={!lama || !baru || !ulangi || sibuk}>
        {sibuk ? 'Menyimpan...' : 'Simpan PIN baru'}
      </button>
    </form>
  );
}
