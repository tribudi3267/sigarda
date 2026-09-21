import { useEffect } from 'react';
import { PERAN, STATUS } from '../lib/skuLogic';
import { STATUS_ABSEN } from '../lib/absensiLogic';
import { STATUS_PF } from '../data/portofolioData';
import { labelPoin } from '../data/skuData';
import { inisial } from '../lib/format';
import { teksLencana } from '../lib/notifikasiLogic';

const IKON = {
  beranda: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  cek: '<polyline points="20 6 9 17 4 12"/>',
  daftar: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  jam: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  anggota: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  grafik: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  cetak: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  kunci: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  cari: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  keluar: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  tambah: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  unduh: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  tutup: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  ubah: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  hapus: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  kalender: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  kembali: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  lencana: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
  panah: '<polyline points="9 18 15 12 9 6"/>',
  absensi: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 16 11 18 15 14"/>',
  portofolio: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
  bintang: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  tautan: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  tabel: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>',
  akun: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  salin: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  unggah: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  reset: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  perisai: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  panahKanan: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  buku: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  pustaka: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="9" y1="10" x2="15" y2="10"/>',
  panahAtas: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
  panahBawah: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
  raport: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
  instrumen: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><polyline points="9 14 11 16 15 12"/>',
  keluarTab: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  sidang: '<line x1="12" y1="3" x2="12" y2="21"/><line x1="5" y1="7" x2="19" y2="7"/><path d="M5 7l-3 7a3 3 0 0 0 6 0z"/><path d="M19 7l-3 7a3 3 0 0 0 6 0z"/><line x1="8" y1="21" x2="16" y2="21"/>',
  iuran: '<circle cx="12" cy="12" r="9"/><path d="M14.7 9.2a2.7 2.2 0 0 0-2.7-1.4c-1.5 0-2.7.8-2.7 2s1.2 1.7 2.7 2 2.7.8 2.7 2-1.2 2-2.7 2a2.7 2.2 0 0 1-2.7-1.4"/><line x1="12" y1="6" x2="12" y2="7.8"/><line x1="12" y1="16.2" x2="12" y2="18"/>',
  penugasan: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><polyline points="15 17.5 17 19.5 21 15.5"/>',
  lonceng: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  sesi: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><polyline points="7 14 9 16 13 12"/><line x1="15" y1="15" x2="18" y2="15"/>',
};

/**
 * Lencana angka pada menu (mis. notifikasi belum dibaca). `posisi` selalu mengandung "relative" atau "absolute": teks sr-only di dalamnya
 * memerlukan induk berposisi agar tidak lolos dari pembungkus dan melebarkan halaman.
 */
export function LencanaMenu({ jumlah, posisi = 'relative' }) {
  if (!(jumlah > 0)) return null;
  return (
    <span className={`${posisi} inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-emas px-1 text-[10px] font-bold leading-[1.1rem] text-pramuka-900 ring-2 ring-pramuka-800`}>
      <span aria-hidden="true">{teksLencana(jumlah)}</span>
      <span className="sr-only">, {jumlah} belum dibaca</span>
    </span>
  );
}

export function Icon({ nama, className = 'h-5 w-5' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: IKON[nama] ?? '' }}
    />
  );
}

export function Badge({ status }) {
  const s = STATUS[status] ?? STATUS.belum;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${s.kelas}`}>
      {s.label}
    </span>
  );
}

const CHIP = 'inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset';

/** Lencana peran: Penegak Calon Bantara, Calon Laksana, atau Calon Garuda. */
export function BadgePeran({ peran, singkat = false }) {
  const p = PERAN[peran];
  if (!p) return null;
  return <span className={`${CHIP} ${p.kelas}`}>{singkat ? p.singkat : p.label}</span>;
}

export function BadgeAbsen({ status }) {
  if (status === 'B') return <span className={`${CHIP} bg-stone-100 text-stone-600 ring-stone-300`}>Belum dicatat</span>;
  const s = STATUS_ABSEN[status];
  if (!s) return <span className="text-pramuka-400">-</span>;
  return <span className={`${CHIP} ${s.kelas}`}>{s.label}</span>;
}

export function BadgePortofolio({ status }) {
  const s = STATUS_PF[status] ?? STATUS_PF.belum;
  return <span className={`${CHIP} ${s.kelas}`}>{s.label}</span>;
}

/** Label butir SKU dan isinya, mis. "Butir 1a (Islam)" diikuti teks. Dipakai di semua daftar poin. */
export function TeksPoin({ poin, className = 'text-sm' }) {
  return (
    <p className={`leading-relaxed ${className}`}>
      <span className="mr-1.5 inline-block rounded bg-pramuka-100 px-1.5 py-0.5 align-baseline text-xs font-bold text-pramuka-800">
        {labelPoin(poin)}
        {poin.agama ? ` · ${poin.agama}` : ''}
      </span>
      {poin.teks}
    </p>
  );
}

export function ProgressBar({ persen, tinggi = 'h-2', label = 'Progres' }) {
  const penuh = persen >= 100;
  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-pramuka-100 ${tinggi}`}
      role="progressbar"
      aria-valuenow={persen}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ${penuh ? 'bg-emerald-600' : 'bg-emas'}`}
        style={{ width: `${persen}%` }}
      />
    </div>
  );
}

/** Lencana progres: cincin emas di atas dasar cokelat tua, gaya badge kecakapan. */
export function Lencana({ persen, ukuran = 104 }) {
  const r = 40;
  const keliling = 2 * Math.PI * r;
  return (
    <svg width={ukuran} height={ukuran} viewBox="0 0 100 100" role="img" aria-label={`Progres ${persen} persen`}>
      <circle cx="50" cy="50" r="48" fill="#2e1b10" stroke="#c99a1d" strokeWidth="1.5" strokeDasharray="3 3" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="#5c3d22" strokeWidth="8" />
      <circle
        cx="50" cy="50" r={r} fill="none" stroke="#e2b84a" strokeWidth="8" strokeLinecap="round"
        strokeDasharray={keliling}
        strokeDashoffset={keliling * (1 - persen / 100)}
        transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dashoffset .6s ease' }}
      />
      <text x="50" y="56" textAnchor="middle" fontSize="22" fontWeight="700" fill="#f8f2e4" fontFamily="Bitter, Georgia, serif">
        {persen}%
      </text>
    </svg>
  );
}

export function Modal({ buka, tutup, judul, children, aksi, lebar = 'max-w-lg' }) {
  useEffect(() => {
    if (!buka) return undefined;
    const saatTombol = (e) => e.key === 'Escape' && tutup();
    document.addEventListener('keydown', saatTombol);
    return () => document.removeEventListener('keydown', saatTombol);
  }, [buka, tutup]);

  if (!buka) return null;
  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-end justify-center bg-pramuka-900/60 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && tutup()}
      role="dialog"
      aria-modal="true"
      aria-label={judul}
    >
      <div className={`animasi-naik flex max-h-[92vh] w-full ${lebar} flex-col rounded-t-xl bg-white sm:rounded-xl`}>
        <div className="flex items-start justify-between gap-3 border-b border-pramuka-200 px-5 py-4">
          <h2 className="text-lg font-bold text-pramuka-900">{judul}</h2>
          <button onClick={tutup} aria-label="Tutup" className="rounded-md p-1 text-pramuka-600 hover:bg-pramuka-100">
            <Icon nama="tutup" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {aksi && (
          <div className="flex flex-col-reverse gap-2 border-t border-pramuka-200 px-5 py-4 sm:flex-row sm:justify-end">
            {aksi}
          </div>
        )}
      </div>
    </div>
  );
}

export function Field({ label, htmlFor, bantuan, children }) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="label">{label}</label>
      {children}
      {bantuan && <p className="mt-1 text-xs text-pramuka-500">{bantuan}</p>}
    </div>
  );
}

export function Kosong({ judul, teks, children }) {
  return (
    <div className="jahitan rounded-lg bg-white px-5 py-8 text-center">
      <p className="font-display text-base font-semibold text-pramuka-800">{judul}</p>
      {teks && <p className="mx-auto mt-1 max-w-sm text-sm text-pramuka-600">{teks}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/** Pengganti isi halaman selagi kehadiran satu periode dimuat dari server (lihat useAbsensiPeriode), atau bila gagal dimuat. */
export function MuatAbsensi({ galat, coba }) {
  if (galat) {
    return (
      <Kosong judul="Data absensi belum dapat dimuat" teks={galat}>
        <button className="btn btn-primary btn-sm" onClick={coba}>Coba lagi</button>
      </Kosong>
    );
  }
  return (
    <div role="status" aria-live="polite">
      <Kosong judul="Memuat data absensi..." teks="Mengambil kehadiran periode yang dipilih dari server." />
    </div>
  );
}

export function Avatar({ nama, ukuran = 'h-10 w-10' }) {
  return (
    <span className={`inline-flex ${ukuran} shrink-0 items-center justify-center rounded-full bg-pramuka-700 text-sm font-bold text-emas-light`}>
      {inisial(nama)}
    </span>
  );
}
