import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Layout from './components/Layout';
import Login from './components/Login';
import PesertaBeranda from './pages/PesertaBeranda';
import PesertaSku from './pages/PesertaSku';
import GarudaDashboard from './pages/GarudaDashboard';
import PengujiDashboard from './pages/PengujiDashboard';
import PesertaDetail from './pages/PesertaDetail';
import AdminDashboard from './pages/AdminDashboard';
import AdminAnggota from './pages/AdminAnggota';
import { AbsensiPeserta, AbsensiPengurus } from './pages/Absensi';
import PortofolioPengurus from './pages/Portofolio';
import CetakDokumen from './pages/CetakDokumen';
import Akun from './pages/Akun';
import ResetPin from './pages/ResetPin';
import GantiPinWajib from './pages/GantiPinWajib';
import Materi from './pages/Materi';
import KelolaMateri from './pages/KelolaMateri';
import Sidang from './pages/Sidang';
import Raport from './pages/Raport';
import KelolaInstrumen from './pages/KelolaInstrumen';
import Penugasan from './pages/Penugasan';
import DataGudep from './pages/DataGudep';
import SesiUjian from './pages/SesiUjian';
import Iuran from './pages/Iuran';
import HalamanVerifikasi from './components/HalamanVerifikasi';
import { parameterVerifikasi } from './lib/verifikasiLogic';
import { bolehKelolaMateri } from './lib/materiLogic';
import LogoMark from './components/LogoMark';

/**
 * Menu per peran, dikelompokkan menurut fungsinya (tampil sebagai kelompok di menu samping, dan berurutan di menu bawah ponsel).
 *  Utama            : Dashboard (Penegak: Beranda atau Garuda)
 *  Pengujian SKU    : Penegak: Poin SKU, Cetak. Dewan/Pembina: Antrian, Peserta, Sesi, Instrumen dan Penugasan (Pembina), Sidang, Cetak. Admin: Sesi, Instrumen, Sidang, Cetak
 *  Kegiatan Ambalan : Absensi, Iuran (semua peran), Portofolio (pengurus), Raport (Pembina dan Admin)
 *  Materi           : Materi, Kelola Materi (Pembina dan Admin)
 *  Pengelolaan      : Anggota (Admin)
 * Akun saya dan Reset PIN anggota (pengurus) tidak ada di daftar ini: keduanya di menu akun (nama pengguna di menu samping atau header).
 */
function buatNav(user, peran) {
  const materi = { id: 'materi', label: 'Materi', ikon: 'buku' };
  const kelola = { id: 'kelolamateri', label: 'Kelola Materi', ikon: 'pustaka' };
  const raport = { id: 'raport', label: 'Raport', ikon: 'raport' };
  const instrumen = { id: 'instrumen', label: 'Instrumen', ikon: 'instrumen' };
  const absensi = { id: 'absensi', label: 'Absensi', ikon: 'absensi' };
  const iuran = { id: 'iuran', label: 'Iuran', ikon: 'iuran' };
  const portofolio = { id: 'portofolio', label: 'Portofolio', ikon: 'portofolio' };
  const sidang = { id: 'sidang', label: 'Sidang', ikon: 'sidang' };
  const sesi = { id: 'sesi', label: 'Sesi ujian', ikon: 'sesi' };
  const cetak = { id: 'cetak', label: 'Cetak', ikon: 'cetak' };
  const penugasan = { id: 'penugasan', label: 'Penugasan', ikon: 'penugasan' };
  const kelolaBoleh = bolehKelolaMateri(user);

  if (user.role === 'peserta') {
    return [
      { judul: 'Utama', item: [peran === 'calon-garuda' ? { id: 'beranda', label: 'Garuda', ikon: 'bintang' } : { id: 'beranda', label: 'Beranda', ikon: 'beranda' }] },
      { judul: 'Pengujian SKU', item: [{ id: 'sku', label: 'Poin SKU', ikon: 'daftar' }, cetak] },
      { judul: 'Kegiatan Ambalan', item: [absensi, iuran] },
      { judul: 'Materi', item: [materi] },
    ];
  }
  if (user.role === 'penguji') {
    return [
      { judul: 'Utama', item: [{ id: 'dashboard', label: 'Dashboard', ikon: 'dashboard' }] },
      { judul: 'Pengujian SKU', item: [{ id: 'antrian', label: 'Antrian', ikon: 'jam' }, { id: 'peserta', label: 'Peserta', ikon: 'anggota' }, sesi, ...(kelolaBoleh ? [instrumen, penugasan] : []), sidang, cetak] },
      { judul: 'Kegiatan Ambalan', item: [absensi, iuran, portofolio, ...(kelolaBoleh ? [raport] : [])] },
      { judul: 'Materi', item: [materi, ...(kelolaBoleh ? [kelola] : [])] },
    ];
  }
  return [
    { judul: 'Utama', item: [{ id: 'rekap', label: 'Dashboard', ikon: 'dashboard' }] },
    { judul: 'Pengujian SKU', item: [sesi, instrumen, sidang, cetak] },
    { judul: 'Kegiatan Ambalan', item: [absensi, iuran, portofolio, raport] },
    { judul: 'Materi', item: [materi, kelola] },
    { judul: 'Pengelolaan', item: [{ id: 'anggota', label: 'Anggota', ikon: 'anggota' }, { id: 'gudep', label: 'Data Gudep', ikon: 'perisai' }] },
  ];
}
function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      role="status"
      className={`no-print animasi-naik fixed inset-x-4 bottom-20 z-[60] mx-auto max-w-sm rounded-lg px-4 py-3 text-sm font-semibold shadow-lg md:bottom-6 ${
        toast.tipe === 'err' ? 'bg-red-700 text-white' : 'bg-pramuka-900 text-pramuka-50'
      }`}
    >
      {toast.pesan}
    </div>
  );
}

/** Layar penuh untuk keadaan sebelum aplikasi siap: memuat, konfigurasi belum diisi, atau galat sambungan. */
function LayarStatus({ status, galat }) {
  const isi = {
    memuat: { judul: 'Memuat SIGARDA...', teks: 'Menyiapkan aplikasi dan menghubungkan ke server.' },
    konfigurasi: {
      judul: 'Sambungan ke Supabase belum diatur',
      teks: 'Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY pada berkas .env.local (untuk komputer sendiri) atau pada Variables repositori GitHub (untuk situs terbit), lalu bangun ulang. Panduannya ada di README, bagian "Menghubungkan ke Supabase". Untuk mencoba tanpa Supabase, jalankan npm run dev:lokal.',
    },
    galat: { judul: 'Aplikasi belum dapat dimulai', teks: `Terjadi galat saat menghubungkan ke server. ${galat ?? ''}` },
  }[status];
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-pramuka-800 px-6 text-center text-pramuka-50">
      <LogoMark size={64} />
      <h1 className="mt-5 font-display text-2xl font-bold tracking-wide">{isi.judul}</h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-pramuka-200" role={status === 'memuat' ? 'status' : 'alert'}>{isi.teks}</p>
      {status !== 'memuat' && (
        <button className="btn btn-gold mt-5" onClick={() => window.location.reload()}>Muat ulang</button>
      )}
    </div>
  );
}

function Shell() {
  const { user, peranUser, status, galatMuat } = useApp();
  const [tab, setTab] = useState(null);
  const [fokusId, setFokusId] = useState(null); // peserta yang sedang dibuka penguji/admin
  const [jenisCetak, setJenisCetak] = useState('kartu'); // tab awal halaman Cetak (kartu | stl | surat)
  const [tingkat, setTingkat] = useState('Bantara');
  const [materiButir, setMateriButir] = useState(null); // butir SKU yang dituju tombol "Materi"
  const [kelolaId, setKelolaId] = useState(null); // materi yang langsung dibuka di Kelola Materi ('baru' = tambah)

  useEffect(() => {
    setTab(null);
    setFokusId(null);
    setMateriButir(null);
    setKelolaId(null);
  }, [user?.id]);

  if (status !== 'siap') return <LayarStatus status={status} galat={galatMuat} />;
  if (!user) return <Login />;
  // PIN awal dari admin atau PIN hasil reset wajib diganti sebelum aplikasi dapat dipakai
  if (user.wajibGantiPin) return <GantiPinWajib />;

  const grup = buatNav(user, peranUser);
  const nav = grup.flatMap((g) => g.item);
  // Bila menu yang dipilih tidak ada lagi (mis. peran berubah), kembali ke menu pertama. Akun saya dan Reset PIN dibuka dari menu akun.
  const halamanAkun = tab === 'akun' || (tab === 'resetpin' && user.role !== 'peserta');
  const tabAktif = halamanAkun || nav.some((n) => n.id === tab) ? tab : nav[0].id;

  const pilihTab = (t) => {
    setTab(t);
    setFokusId(null);
    setJenisCetak('kartu');
    setMateriButir(null);
    setKelolaId(null);
  };
  /** Tombol "Materi" pada butir SKU: buka halaman Materi yang tersaring pada butir tersebut. */
  const bukaMateri = (butirId) => {
    setMateriButir(butirId);
    setFokusId(null);
    setTab('materi');
  };
  /** Dari halaman Materi ke Kelola Materi (ubah materi tertentu, atau 'baru'). */
  const bukaKelola = (id = null) => {
    setKelolaId(id);
    setFokusId(null);
    setTab('kelolamateri');
  };
  /** Pindah menu sambil membuka peserta tertentu (dari ringkasan dashboard). */
  const pindah = (t, id = null) => {
    setTab(t);
    setFokusId(id);
  };
  const bukaCetak = (id, jenis = 'kartu') => { setJenisCetak(jenis); pindah('cetak', id); };

  let isi;
  if (tabAktif === 'akun') {
    isi = <Akun />;
  } else if (tabAktif === 'resetpin' && user.role !== 'peserta') {
    isi = <ResetPin />;
  } else if (tabAktif === 'sidang' && user.role !== 'peserta') {
    isi = <Sidang />;
  } else if (tabAktif === 'iuran') {
    isi = <Iuran />;
  } else if (tabAktif === 'sesi' && user.role !== 'peserta') {
    isi = <SesiUjian />;
  } else if (tabAktif === 'raport' && bolehKelolaMateri(user)) {
    isi = <Raport />;
  } else if (tabAktif === 'instrumen' && bolehKelolaMateri(user)) {
    isi = <KelolaInstrumen />;
  } else if (tabAktif === 'gudep' && user.role === 'admin') {
    isi = <DataGudep />;
  } else if (tabAktif === 'penugasan' && user.role === 'penguji' && user.jabatan === 'Pembina') {
    isi = <Penugasan />;
  } else if (tabAktif === 'materi') {
    isi = <Materi key={materiButir ?? 'semua'} butirAwal={materiButir} onKelola={bukaKelola} />;
  } else if (tabAktif === 'kelolamateri') {
    isi = <KelolaMateri key={kelolaId ?? 'daftar'} bukaId={kelolaId} />;
  } else if (tabAktif === 'cetak') {
    isi = (
      <CetakDokumen
        key={`${fokusId ?? user.id}|${jenisCetak}`}
        pesertaId={user.role === 'peserta' ? user.id : fokusId ?? undefined}
        bolehPilih={user.role !== 'peserta'}
        jenisAwal={jenisCetak}
      />
    );
  } else if (user.role === 'peserta') {
    if (tabAktif === 'sku') isi = <PesertaSku tingkat={tingkat} setTingkat={setTingkat} onBukaMateri={bukaMateri} />;
    else if (tabAktif === 'absensi') isi = <AbsensiPeserta />;
    else if (peranUser === 'calon-garuda') isi = <GarudaDashboard setTab={pilihTab} />;
    else isi = <PesertaBeranda setTab={pilihTab} setTingkat={setTingkat} />;
  } else if (tabAktif === 'absensi') {
    isi = <AbsensiPengurus />;
  } else if (tabAktif === 'portofolio') {
    isi = (
      <PortofolioPengurus
        fokusId={fokusId}
        onBuka={setFokusId}
        onKembali={() => setFokusId(null)}
        onBukaSku={(id) => pindah(user.role === 'penguji' ? 'peserta' : 'rekap', id)}
      />
    );
  } else if (fokusId) {
    isi = (
      <PesertaDetail
        pesertaId={fokusId}
        onKembali={() => setFokusId(null)}
        onCetak={bukaCetak}
        onBukaPortofolio={(id) => pindah('portofolio', id)}
        onBukaMateri={bukaMateri}
      />
    );
  } else if (user.role === 'penguji') {
    isi = <PengujiDashboard mode={tabAktif} onBuka={setFokusId} onNav={pindah} />;
  } else {
    isi = tabAktif === 'anggota' ? <AdminAnggota /> : <AdminDashboard onBuka={setFokusId} onNav={pindah} />;
  }

  return (
    <Layout nav={nav} grup={grup} tab={tabAktif} setTab={pilihTab}>
      {isi}
    </Layout>
  );
}

export default function App() {
  // Alamat dari QR dokumen (/?v=...) membuka halaman verifikasi publik: tanpa login dan tanpa memuat data aplikasi.
  const verifikasi = parameterVerifikasi(window.location.search);
  if (verifikasi !== null) return <HalamanVerifikasi awal={verifikasi} />;
  return (
    <AppProvider>
      <Shell />
      <Toast />
    </AppProvider>
  );
}

