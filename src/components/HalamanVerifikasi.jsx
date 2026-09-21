import { useEffect, useState } from 'react';
import { ambilKlien, GALAT_KONFIGURASI } from '../lib/supabaseClient';
import { buatApi } from '../lib/api';
import { alamatDasar, JUDUL_DOKUMEN, labelUnit, POLA_KODE, POLA_TOKEN, teksUnit } from '../lib/verifikasiLogic';
import { fmtTanggal } from '../lib/format';
import { APP, GUDEP } from '../config';
import { FooterRingkas } from './Footer';
import LogoMark from './LogoMark';
import { Icon } from './ui';

/**
 * Halaman verifikasi keaslian dokumen. DAPAT DIBUKA TANPA LOGIN (alamat dari QR: /?v=<token>).
 * Berdiri sendiri: tidak memuat data aplikasi dan tidak memakai sesi login. Hanya memanggil fungsi verifikasi publik.
 * Token QR menampilkan nama lengkap pemegang; kode pendek VRF- hanya menjawab sah atau tidak (tanpa nama).
 */

const jenisInput = (teks) => (POLA_TOKEN.test(teks) ? 'token' : POLA_KODE.test(teks) ? 'kode' : null);

function Baris({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-pramuka-100 py-2.5 last:border-b-0 sm:flex-row sm:gap-4">
      <dt className="shrink-0 text-xs font-semibold uppercase tracking-wider text-pramuka-500 sm:w-36 sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-medium text-pramuka-900">{children}</dd>
    </div>
  );
}

function Sah({ judul, children }) {
  return (
    <div className="animasi-naik overflow-hidden rounded-xl border border-emerald-300 bg-white shadow-sm" role="status">
      <div className="flex items-center gap-3 bg-emerald-50 px-4 py-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Icon nama="cek" className="h-5 w-5" /></span>
        <div className="leading-tight">
          <p className="text-base font-bold text-emerald-900">Dokumen sah</p>
          <p className="text-xs text-emerald-800">{judul}</p>
        </div>
      </div>
      <dl className="px-4 py-1.5">{children}</dl>
    </div>
  );
}

function TidakSah() {
  return (
    <div className="animasi-naik overflow-hidden rounded-xl border border-red-300 bg-white shadow-sm" role="alert">
      <div className="flex items-center gap-3 bg-red-50 px-4 py-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-700 text-white"><Icon nama="tutup" className="h-5 w-5" /></span>
        <div className="leading-tight">
          <p className="text-base font-bold text-red-900">Tidak ditemukan</p>
          <p className="text-xs text-red-800">Kode tidak terdaftar atau sudah tidak berlaku</p>
        </div>
      </div>
      <p className="px-4 py-3 text-sm leading-relaxed text-pramuka-700">
        Periksa kembali kode atau pindai ulang QR pada dokumen. Dokumen dapat tidak berlaku bila hasil ujiannya sudah dibatalkan atau diubah.
        Jika dokumen tampak asli, hubungi Pembina Gudep.
      </p>
    </div>
  );
}

/** Dokumen yang dicabut tetap dijawab (agar pemegang tahu), tetapi tidak dinyatakan sah dan tanpa data Penegak. */
function Dicabut({ d }) {
  return (
    <div className="animasi-naik overflow-hidden rounded-xl border border-red-300 bg-white shadow-sm" role="alert">
      <div className="flex items-center gap-3 bg-red-50 px-4 py-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-700 text-white"><Icon nama="tutup" className="h-5 w-5" /></span>
        <div className="leading-tight">
          <p className="text-base font-bold text-red-900">Dokumen dicabut</p>
          <p className="text-xs text-red-800">{JUDUL_DOKUMEN[d.jenis_dokumen] ?? 'Dokumen'} nomor {d.nomor}</p>
        </div>
      </div>
      <p className="px-4 py-3 text-sm leading-relaxed text-pramuka-700">
        Dokumen ini pernah diterbitkan tetapi sudah dicabut dan tidak berlaku lagi{d.dicabut_pada ? ` (${fmtTanggal(d.dicabut_pada)})` : ''}. Hubungi Pembina Gudep bila perlu penjelasan.
      </p>
    </div>
  );
}

function HasilDokumen({ d }) {
  if (d.dicabut) return <Dicabut d={d} />;
  const butir = Array.isArray(d.butir) ? d.butir : [];
  return (
    <Sah judul={JUDUL_DOKUMEN[d.jenis_dokumen] ?? 'Dokumen terbit'}>
      <Baris label="Nomor">{d.nomor}</Baris>
      <Baris label="Tanggal surat">{fmtTanggal(d.tanggal)}</Baris>
      <Baris label="Diterbitkan oleh">{d.penerbit}</Baris>
      <Baris label="Dibuat oleh">{d.dibuat_oleh}{d.jabatan_pembuat ? `, ${d.jabatan_pembuat}` : ''}</Baris>
      <Baris label="Penanda tangan">{d.penanda_tangan}, {d.jabatan_penanda_tangan}</Baris>
      <Baris label="Penegak">{d.nama}{d.nis ? `, NIS ${d.nis}` : ''}{d.kelas ? `, kelas ${d.kelas}` : ''}{d.agama ? `, agama ${d.agama}` : ''}</Baris>
      {d.guru && <Baris label="Ditujukan kepada">Guru agama {d.guru}</Baris>}
      {butir.length > 0 && <Baris label="Butir">{butir.map((id) => `${labelUnit(id)} (${id.startsWith('LAK') ? 'Laksana' : 'Bantara'})`).join(', ')}</Baris>}
      {d.kode && <Baris label="Kode verifikasi"><span className="font-mono">{d.kode}</span></Baris>}
      <p className="py-2.5 text-xs leading-relaxed text-pramuka-600">
        QR ini membuktikan surat diterbitkan oleh aplikasi. Surat dinyatakan sah bila bertanda tangan dan berstempel {GUDEP.nama}.
      </p>
    </Sah>
  );
}

function HasilToken({ d }) {
  if (d.jenis === 'dokumen') return <HasilDokumen d={d} />;
  if (d.jenis === 'tingkat') {
    return (
      <Sah judul={`Surat Tanda Lulus SKU Penegak ${d.tingkat}`}>
        <Baris label="Nama">{d.nama}</Baris>
        <Baris label="Tingkat">SKU Penegak {d.tingkat} ({d.jumlah_butir} butir seluruhnya lulus)</Baris>
        <Baris label="Butir terakhir lulus">{fmtTanggal(d.tanggal)}</Baris>
        <Baris label="Penguji">{d.penguji ? `${d.penguji}${d.jabatan_penguji ? `, ${d.jabatan_penguji}` : ''}` : '-'}</Baris>
        <Baris label="Surat diterbitkan">{fmtTanggal(d.diterbitkan)}</Baris>
      </Sah>
    );
  }
  const teks = teksUnit(d.sku_id);
  return (
    <Sah judul={`Butir SKU Penegak ${d.tingkat} dinyatakan lulus`}>
      <Baris label="Nama">{d.nama}</Baris>
      <Baris label="Butir">{labelUnit(d.sku_id)}, SKU Penegak {d.tingkat}</Baris>
      {teks && <Baris label="Isi butir">{teks}</Baris>}
      <Baris label="Tanggal uji">{fmtTanggal(d.tanggal)}</Baris>
      <Baris label="Penguji">{d.penguji ? `${d.penguji}${d.jabatan_penguji ? `, ${d.jabatan_penguji}` : ''}` : '-'}</Baris>
      {d.kode && <Baris label="Kode verifikasi"><span className="font-mono">{d.kode}</span></Baris>}
    </Sah>
  );
}

function HasilKode({ d }) {
  if (d.jenis === 'dokumen') {
    if (d.dicabut) return <Dicabut d={d} />;
    return (
      <Sah judul="Kode verifikasi terdaftar">
        <Baris label="Dokumen">{JUDUL_DOKUMEN[d.jenis_dokumen] ?? 'Dokumen terbit'}</Baris>
        <Baris label="Nomor">{d.nomor}</Baris>
        <Baris label="Tanggal surat">{fmtTanggal(d.tanggal)}</Baris>
        <p className="py-2.5 text-xs leading-relaxed text-pramuka-600">
          Kode pendek hanya menjawab sah atau tidak, tanpa nama. Untuk melihat data lengkap, pindai QR pada dokumen.
        </p>
      </Sah>
    );
  }
  return (
    <Sah judul="Kode verifikasi terdaftar">
      <Baris label="Tingkat">SKU Penegak {d.tingkat}</Baris>
      <Baris label="Butir">Butir {d.butir_no}</Baris>
      <Baris label="Tanggal uji">{fmtTanggal(d.tanggal)}</Baris>
      <p className="py-2.5 text-xs leading-relaxed text-pramuka-600">
        Kode pendek hanya menjawab sah atau tidak, tanpa nama. Untuk melihat nama pemegang, pindai QR pada dokumen.
      </p>
    </Sah>
  );
}

export default function HalamanVerifikasi({ awal = '' }) {
  const [api, setApi] = useState(null);
  const [siap, setSiap] = useState('memuat'); // memuat | siap | konfigurasi | galat
  const [galatSambung, setGalatSambung] = useState('');
  const [teks, setTeks] = useState(awal);
  const [sibuk, setSibuk] = useState(false);
  const [hasil, setHasil] = useState(null); // { jenis: 'token' | 'kode', data } | { galat } | { tidakSah: true }
  const [peringatan, setPeringatan] = useState('');

  useEffect(() => {
    const lama = document.title;
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    document.title = `Verifikasi dokumen | ${APP.nama}`;
    return () => { document.title = lama; meta.remove(); };
  }, []);

  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const { klien } = await ambilKlien();
        if (batal) return;
        setApi(buatApi(klien));
        setSiap('siap');
      } catch (e) {
        if (batal) return;
        setGalatSambung(e?.message ?? String(e));
        setSiap(e?.message === GALAT_KONFIGURASI ? 'konfigurasi' : 'galat');
      }
    })();
    return () => { batal = true; };
  }, []);

  const periksa = async (masukan) => {
    const bersih = String(masukan ?? '').trim();
    const jenis = jenisInput(bersih);
    setPeringatan('');
    if (!bersih) {
      setHasil(null);
      return setPeringatan('Isi kode verifikasi (VRF-...) atau pindai QR pada dokumen.');
    }
    if (!jenis) {
      setHasil({ tidakSah: true });
      return undefined;
    }
    setSibuk(true);
    const r = jenis === 'token' ? await api.verifikasiToken(bersih.toLowerCase()) : await api.verifikasiKode(bersih.toUpperCase());
    setSibuk(false);
    if (!r.ok) setHasil({ galat: r.pesan });
    else if (!r.data?.ditemukan) setHasil({ tidakSah: true });
    else setHasil({ jenis, data: r.data });
    return undefined;
  };

  // Alamat dari QR (?v=token): diperiksa otomatis begitu sambungan siap.
  useEffect(() => {
    if (siap === 'siap' && awal) periksa(awal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siap]);

  const kirim = (e) => {
    e.preventDefault();
    if (!sibuk && siap === 'siap') periksa(teks);
  };

  return (
    <div className="flex min-h-screen flex-col bg-pramuka-50">
      <header className="border-b-4 border-emas bg-pramuka-800 px-4 py-5 text-pramuka-50">
        <div className="mx-auto flex max-w-xl items-center gap-3.5">
          <LogoMark size={48} />
          <div className="leading-tight">
            <p className="font-display text-xl font-bold tracking-[0.14em]">{APP.nama}</p>
            <p className="text-xs text-emas-light">Verifikasi keaslian dokumen SKU</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
        <h1 className="text-xl font-bold text-pramuka-900">Periksa keaslian dokumen</h1>
        <p className="mt-1 text-sm leading-relaxed text-pramuka-700">
          Kartu SKU dan Surat Tanda Lulus dari {GUDEP.nama} memuat kode QR dan kode verifikasi. Pindai QR untuk melihat isinya,
          atau ketik kode verifikasi (VRF-...) di bawah.
        </p>

        {siap === 'memuat' && <p className="mt-6 text-sm text-pramuka-600" role="status">Menghubungkan ke server...</p>}
        {siap === 'konfigurasi' && (
          <p className="mt-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-300" role="alert">
            Sambungan ke server belum diatur pada aplikasi ini, sehingga dokumen belum dapat diperiksa.
          </p>
        )}
        {siap === 'galat' && (
          <p className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-300" role="alert">
            Tidak dapat terhubung ke server. {galatSambung}
          </p>
        )}

        {siap === 'siap' && (
          <form onSubmit={kirim} className="panel mt-5 p-4" noValidate>
            <label htmlFor="kodeVerifikasi" className="label">Kode verifikasi</label>
            <div className="flex gap-2">
              <input
                id="kodeVerifikasi"
                className="input font-mono uppercase"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={40}
                value={teks}
                onChange={(e) => setTeks(e.target.value)}
                placeholder="VRF-XXXXXXX"
              />
              <button type="submit" className="btn btn-gold shrink-0" disabled={sibuk}>
                <Icon nama="cari" className="h-4 w-4" />{sibuk ? 'Memeriksa...' : 'Periksa'}
              </button>
            </div>
            {peringatan && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{peringatan}</p>}
          </form>
        )}

        <div className="mt-5" aria-live="polite">
          {hasil?.galat && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-300" role="alert">{hasil.galat}</p>}
          {hasil?.tidakSah && <TidakSah />}
          {hasil?.data && (hasil.jenis === 'token' ? <HasilToken d={hasil.data} /> : <HasilKode d={hasil.data} />)}
        </div>

        <p className="mt-6 flex gap-2 text-xs leading-relaxed text-pramuka-600">
          <Icon nama="perisai" className="mt-0.5 h-4 w-4 shrink-0 text-pramuka-500" />
          <span>
            Halaman ini hanya menampilkan data yang tercetak pada dokumen. Nama lengkap hanya muncul bila QR dipindai; kode pendek
            hanya menjawab sah atau tidak.
          </span>
        </p>
        <a href={alamatDasar()} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-pramuka-800 underline">
          <Icon nama="kembali" className="h-4 w-4" />Ke halaman masuk SIGARDA
        </a>
      </main>
      <FooterRingkas />
    </div>
  );
}
