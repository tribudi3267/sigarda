import { useMemo, useState } from 'react';
import { BATAS_PINSA_TUGAS, KELAS_TINGKAT, cariCalonPinsa, jumlahPinsaTugas, labelCalonPinsa, labelTingkat } from '../lib/sanggaLogic';

const CHIP = 'inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset';

/**
 * Pinsa dari rombel lain (persiapan uji coba 2 Okt 2026): Penegak Calon Laksana yang ditugaskan menjadi Pinsa sebuah sangga di rombel ini (mis. kakak kelas untuk
 * sangga Calon Bantara). Hanya untuk yang boleh mengatur sangga (Bina Damping rombel itu, Pembina, Admin); hak ditegakkan server.
 * Props: `tugas` = [{ id, nama, sangga, kelas, tingkat }] (Pinsa tertugas rombel ini), `sangga` = nama sangga yang ada, `muatCalon()` -> { ok, data: { calon } | pesan },
 * `onTugaskan(sangga, pesertaId)` dan `onCabut(pesertaId)` -> { ok, pesan }. Daftar calon dimuat saat panel dibuka (bukan saat halaman dibuka).
 */
export default function PanelPinsaTugas({ rombel, tugas = [], sangga = [], muatCalon, onTugaskan, onCabut }) {
  const [buka, setBuka] = useState(false);
  const [calon, setCalon] = useState(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState('');
  const [sanggaPilih, setSanggaPilih] = useState('');
  const [cari, setCari] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const terpilih = useMemo(() => cariCalonPinsa(calon ?? [], cari), [calon, cari]);

  const bukaPanel = async () => {
    setBuka(true);
    setGalat('');
    if (calon) return;
    setMemuat(true);
    const r = await muatCalon();
    setMemuat(false);
    if (r.ok) setCalon(r.data.calon); else setGalat(r.pesan ?? 'Daftar calon belum dapat dimuat.');
  };
  const tutup = () => { setBuka(false); setCari(''); setGalat(''); };

  const tugaskan = async () => {
    if (sibuk) return;
    if (!sanggaPilih) return setGalat('Pilih sangga lebih dulu.');
    if (!terpilih) return setGalat('Pilih Penegak dari daftar yang muncul saat Anda mengetik nama.');
    setSibuk(true);
    setGalat('');
    const r = await onTugaskan(sanggaPilih, terpilih.id);
    setSibuk(false);
    if (!r.ok) return setGalat(r.pesan);
    setCalon((c) => (c ?? []).filter((x) => x.id !== terpilih.id));
    setCari('');
    return undefined;
  };

  const cabut = async (t) => {
    if (sibuk) return;
    setSibuk(true);
    setGalat('');
    const r = await onCabut(t.id);
    setSibuk(false);
    if (!r.ok) setGalat(r.pesan);
    else setCalon(null); // yang dicabut kembali menjadi calon: muat ulang saat panel dibuka lagi
  };

  return (
    <section className="panel mt-5 p-4" aria-label="Pinsa dari rombel lain">
      <h3 className="font-display text-base font-semibold text-pramuka-900">Pinsa dari rombel lain</h3>
      <p className="mt-1 text-xs leading-relaxed text-pramuka-700">
        Penegak Calon Laksana dari rombel lain dapat ditugaskan menjadi Pinsa sebuah sangga di rombel {rombel}. Pada tahap Pinsa ia menilai anggota sangga itu untuk butir Bantara yang sudah ia
        lulus sendiri. Satu orang untuk satu sangga, paling banyak {BATAS_PINSA_TUGAS} Pinsa tertugas per sangga.
      </p>
      {tugas.length === 0 ? (
        <p className="mt-2 text-sm text-pramuka-600">Belum ada Pinsa yang ditugaskan dari rombel lain.</p>
      ) : (
        <ul className="mt-2 divide-y divide-pramuka-100 text-sm">
          {tugas.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-medium">{t.nama}</span>
                <span className="text-xs text-pramuka-600">dari {t.kelas || 'rombel lain'}</span>
                {t.tingkat && <span className={`${CHIP} ${KELAS_TINGKAT[t.tingkat] ?? ''}`}>{labelTingkat(t.tingkat)}</span>}
                <span className="text-xs text-pramuka-700">Pinsa {t.sangga}</span>
              </span>
              <button className="btn btn-outline btn-sm" disabled={sibuk} onClick={() => cabut(t)} aria-label={`Cabut penugasan ${t.nama}`}>Cabut</button>
            </li>
          ))}
        </ul>
      )}

      {!buka ? (
        <button className="btn btn-outline btn-sm mt-3" onClick={bukaPanel} disabled={!sangga.length}>Tugaskan Pinsa</button>
      ) : (
        <div className="mt-3 rounded-lg bg-pramuka-50 p-3">
          {memuat ? (
            <p className="text-sm text-pramuka-600" role="status">Memuat daftar calon...</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="pt-sangga" className="label">Sangga</label>
                <select id="pt-sangga" className="input" value={sanggaPilih} onChange={(e) => setSanggaPilih(e.target.value)}>
                  <option value="">Pilih sangga</option>
                  {sangga.map((s) => {
                    const penuh = jumlahPinsaTugas(tugas, s) >= BATAS_PINSA_TUGAS;
                    return <option key={s} value={s} disabled={penuh}>{s}{penuh ? ' (penuh)' : ''}</option>;
                  })}
                </select>
              </div>
              <div>
                <label htmlFor="pt-calon" className="label">Penegak Calon Laksana</label>
                <input id="pt-calon" className="input" list="pt-daftar-calon" value={cari} placeholder="Ketik nama, lalu pilih" onChange={(e) => setCari(e.target.value)} autoComplete="off" />
                <datalist id="pt-daftar-calon">{(calon ?? []).map((c) => <option key={c.id} value={labelCalonPinsa(c)} />)}</datalist>
                <p className="mt-1 text-xs text-pramuka-600">{calon ? `${calon.length} calon tersedia.` : ''}</p>
              </div>
            </div>
          )}
          {galat && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{galat}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-primary btn-sm" onClick={tugaskan} disabled={sibuk || memuat}>{sibuk ? 'Menyimpan...' : 'Tugaskan'}</button>
            <button className="btn btn-outline btn-sm" onClick={tutup} disabled={sibuk}>Tutup</button>
          </div>
        </div>
      )}
      {!buka && galat && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{galat}</p>}
    </section>
  );
}
