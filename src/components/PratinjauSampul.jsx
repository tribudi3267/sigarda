import { useEffect, useState } from 'react';
import { RUJUK_LANGKAH_DRIVE, diagnosaGambar, kandidatGambar } from '../lib/berandaLogic';

// Kelas ditulis utuh (bukan dirangkai) agar terbaca pemindai Tailwind; rasio sama dengan kartu di halaman muka (src/landing/bagian.jsx).
const RASIO = { berita: 'aspect-[16/10]', galeri: 'aspect-[4/3]', sosial: 'aspect-square' };
const BATAS_MS = 12000;

/**
 * Pratinjau gambar sampul pada formulir Kelola Beranda: memuat alamat yang SAMA dengan yang dicoba halaman muka (kandidat pertama, lihat kandidatGambar) dan
 * memberi tahu apakah gambarnya benar-benar tampil. Berkas Drive diuji dengan crossorigin="anonymous" (permintaan tanpa cookie Google): lolos hanya bila berkas itu
 * benar-benar publik, bukan sekadar terlihat oleh pengurus yang kebetulan sedang masuk ke akun Google pemiliknya. Tautan halaman (Google Photos, folder Drive)
 * tidak diuji, langsung dijelaskan mengapa tidak dapat tampil dan apa yang harus dilakukan.
 */
export default function PratinjauSampul({ nilai, rasio = 'berita' }) {
  const diag = diagnosaGambar(nilai);
  const src = kandidatGambar(nilai)[0] ?? '';
  const [hasil, setHasil] = useState({ src: '', status: '' });
  const [ulang, setUlang] = useState(0);
  const jenis = diag.jenis;

  useEffect(() => {
    if (!src) return undefined;
    let batal = false;
    const selesai = (status) => { if (!batal) setHasil({ src, status }); };
    const tunda = setTimeout(() => {
      const gambar = new Image();
      if (jenis === 'drive') gambar.crossOrigin = 'anonymous';
      gambar.referrerPolicy = 'no-referrer';
      gambar.onload = () => selesai('ok');
      gambar.onerror = () => selesai('gagal');
      gambar.src = src;
    }, 500);
    const habis = setTimeout(() => selesai('gagal'), BATAS_MS);
    return () => { batal = true; clearTimeout(tunda); clearTimeout(habis); };
  }, [src, jenis, ulang]);

  if (jenis === 'kosong' || jenis === 'tidak-sah') return null;
  if (!src) {
    return <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium leading-relaxed text-red-800">{diag.pesan}</p>;
  }
  const status = hasil.src === src ? hasil.status : 'menguji';
  const kelasKotak = `${RASIO[rasio] ?? RASIO.berita} w-full max-w-xs rounded-lg`;
  return (
    <div className="mt-2" data-pratinjau={status}>
      {status === 'ok' ? (
        <img src={src} alt="Pratinjau gambar sampul" referrerPolicy="no-referrer" className={`${kelasKotak} border border-pramuka-200 object-cover`} />
      ) : (
        <div aria-hidden="true" className={`${kelasKotak} flex items-center justify-center border border-dashed border-pramuka-300 bg-pramuka-50 text-xs text-pramuka-500`}>
          {status === 'menguji' ? 'Memuat pratinjau...' : 'Gambar tidak tampil'}
        </div>
      )}
      {status === 'menguji' && <p role="status" className="mt-1 text-xs text-pramuka-600">Menguji apakah foto dapat dimuat...</p>}
      {status === 'ok' && (
        <p role="status" className="mt-1 text-xs font-medium leading-relaxed text-emerald-800">
          {jenis === 'drive'
            ? 'Foto berhasil dimuat tanpa login Google, jadi pengunjung juga dapat melihatnya. Beginilah rupa sampul di kartu beranda.'
            : 'Foto berhasil dimuat. Beginilah rupa sampul di kartu beranda.'}
        </p>
      )}
      {status === 'gagal' && (
        <div role="alert" className="mt-1 text-xs font-medium leading-relaxed text-red-800">
          {jenis === 'drive'
            ? <p>Foto belum dapat dimuat tanpa login Google. Pastikan akses berkasnya <b>"Siapa saja yang memiliki link"</b> (bukan "Dibatasi") dan tautannya milik SATU file foto. Sampai berhasil, beranda menampilkan gambar pengganti (pintu tenda).</p>
            : <p>Alamat ini tidak menampilkan gambar (mungkin halaman web biasa, atau gambarnya dilindungi). Beranda akan menampilkan gambar pengganti (pintu tenda). {RUJUK_LANGKAH_DRIVE}</p>}
          <button type="button" className="mt-1 font-bold text-emas-dark underline" onClick={() => { setHasil({ src: '', status: '' }); setUlang((n) => n + 1); }}>Uji lagi</button>
        </div>
      )}
    </div>
  );
}
