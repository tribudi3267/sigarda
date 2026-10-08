import { useLayoutEffect, useRef, useState } from 'react';
import { BATAS_ISI, terapkanAksi, terapkanTautan } from '../lib/teksKayaLogic';
import { tautanSah } from '../lib/berandaLogic';
import TeksKaya from './TeksKaya';

/** Tombol bilah alat: label tampak (huruf/tanda) dan nama lengkap untuk pembaca layar dan petunjuk. */
const TOMBOL = [
  { aksi: 'tebal', tampak: <b>B</b>, nama: 'Tebal', pintasan: 'Ctrl+B' },
  { aksi: 'miring', tampak: <i>I</i>, nama: 'Miring', pintasan: 'Ctrl+I' },
  { aksi: 'judul', tampak: 'H2', nama: 'Judul bagian' },
  { aksi: 'subjudul', tampak: 'H3', nama: 'Sub judul' },
  { aksi: 'daftar', tampak: '• —', nama: 'Daftar poin' },
  { aksi: 'nomor', tampak: '1.', nama: 'Daftar bernomor' },
  { aksi: 'kutipan', tampak: '❝', nama: 'Kutipan' },
  { aksi: 'tautan', tampak: '🔗', nama: 'Tautan' },
  { aksi: 'pemisah', tampak: '―', nama: 'Garis pemisah' },
];

const kelasTombol = 'inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-md border border-pramuka-200 bg-white px-2 text-sm font-semibold text-pramuka-800 transition hover:bg-pramuka-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emas';

/**
 * Editor isi berita: bilah alat pemformatan di atas kolom teks + tab Pratinjau (tampilan persis seperti di beranda). Nilai tetap TEKS BIASA berpenanda
 * ringan (lihat src/lib/teksKayaLogic.js): aman, dapat disalin, dan teks lama tanpa penanda tetap sah. Teks dipilih lalu tombol ditekan; tekan lagi untuk melepas.
 */
export default function EditorTeksKaya({ id, value, onChange, galat, baris = 10, placeholder }) {
  const area = useRef(null);
  const pilihan = useRef(null); // pilihan yang dipulihkan sesudah nilai berubah
  const [tab, setTab] = useState('tulis');
  const [tautan, setTautan] = useState(null); // null = tertutup; { awal, akhir, alamat, salah } = baris isian tautan
  const nilai = String(value ?? '');
  const panjang = [...nilai].length;

  useLayoutEffect(() => {
    if (pilihan.current && area.current) {
      area.current.focus();
      area.current.setSelectionRange(pilihan.current.awal, pilihan.current.akhir);
      pilihan.current = null;
    }
  });

  const terapkan = (hasil) => { pilihan.current = { awal: hasil.awal, akhir: hasil.akhir }; onChange(hasil.nilai); };
  const jalankan = (aksi) => {
    const el = area.current;
    if (!el) return;
    if (aksi === 'tautan') {
      const awal = el.selectionStart, akhir = el.selectionEnd;
      setTautan({ awal, akhir, alamat: 'https://', salah: false });
      return;
    }
    terapkan(terapkanAksi(nilai, el.selectionStart, el.selectionEnd, aksi));
  };
  const pasangTautan = () => {
    const hasil = terapkanTautan(nilai, tautan.awal, tautan.akhir, tautan.alamat);
    if (!hasil) { setTautan({ ...tautan, salah: true }); return; }
    setTautan(null);
    terapkan(hasil);
  };
  const tekanKunci = (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const aksi = e.key === 'b' || e.key === 'B' ? 'tebal' : e.key === 'i' || e.key === 'I' ? 'miring' : '';
    if (aksi) { e.preventDefault(); jalankan(aksi); }
  };

  return (
    <div className={`overflow-hidden rounded-lg border bg-white ${galat ? 'border-red-500' : 'border-pramuka-300'}`}>
      <div className="flex flex-wrap items-center gap-1 border-b border-pramuka-200 bg-pramuka-50 p-2">
        <div role="tablist" aria-label="Mode editor" className="mr-1 inline-flex overflow-hidden rounded-md border border-pramuka-200">
          {[['tulis', 'Tulis'], ['pratinjau', 'Pratinjau']].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`h-9 px-3 text-sm font-semibold ${tab === k ? 'bg-pramuka-800 text-pramuka-50' : 'bg-white text-pramuka-800 hover:bg-pramuka-50'}`}>{l}</button>
          ))}
        </div>
        {tab === 'tulis' && TOMBOL.map((t) => (
          <button key={t.aksi} type="button" onClick={() => jalankan(t.aksi)} className={kelasTombol}
            title={t.pintasan ? `${t.nama} (${t.pintasan})` : t.nama} aria-label={t.nama}>{t.tampak}</button>
        ))}
      </div>
      {tab === 'tulis' && tautan && (
        <div className="flex flex-wrap items-center gap-2 border-b border-pramuka-200 bg-amber-50 p-2">
          <label htmlFor={`${id}-tautan`} className="text-sm font-semibold text-pramuka-800">Alamat tautan</label>
          <input id={`${id}-tautan`} type="url" value={tautan.alamat} autoFocus aria-invalid={tautan.salah ? 'true' : undefined}
            onChange={(e) => setTautan({ ...tautan, alamat: e.target.value, salah: false })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pasangTautan(); } if (e.key === 'Escape') setTautan(null); }}
            className={`input min-w-0 flex-1 ${tautan.salah ? 'border-red-500' : ''}`} placeholder="https://..." />
          <button type="button" onClick={pasangTautan} className="btn btn-gold !py-1.5">Pasang</button>
          <button type="button" onClick={() => setTautan(null)} className="btn btn-outline !py-1.5">Batal</button>
          {tautan.salah && <p role="alert" className="w-full text-xs font-medium text-red-700">Tautan harus diawali https:// dan tanpa spasi.</p>}
          {!tautan.salah && !tautanSah(tautan.alamat) && <p className="w-full text-xs text-pramuka-600">Blok dulu tulisan yang ingin dijadikan tautan, lalu tekan tombol tautan.</p>}
        </div>
      )}
      {tab === 'tulis' ? (
        <textarea ref={area} id={id} rows={baris} value={nilai} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onKeyDown={tekanKunci}
          aria-invalid={galat ? 'true' : undefined} className="block w-full resize-y border-0 bg-white p-3 text-[15px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emas" />
      ) : (
        <div className="min-h-[10rem] p-4" style={{ minHeight: `${baris * 1.6}rem` }}>
          {nilai.trim()
            ? <TeksKaya isi={nilai} kelas="space-y-3 text-[15px] leading-relaxed text-pramuka-700" />
            : <p className="text-sm text-pramuka-500">Belum ada isi untuk dipratinjau.</p>}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-pramuka-200 bg-pramuka-50 px-3 py-1.5 text-xs text-pramuka-600">
        <span>Pilih tulisan lalu tekan tombol di atas. Baris kosong = paragraf baru.</span>
        <span className={panjang > BATAS_ISI ? 'font-bold text-red-700' : ''}>{panjang}/{BATAS_ISI} karakter</span>
      </div>
    </div>
  );
}
