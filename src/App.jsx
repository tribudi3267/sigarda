import { lazy, useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Layout from './components/Layout';
import Login from './components/Login';
import PesertaBeranda from './pages/PesertaBeranda';
import GarudaDashboard from './pages/GarudaDashboard';
import PengujiDashboard from './pages/PengujiDashboard';
import AdminDashboard from './pages/AdminDashboard';
import GantiPinWajib from './pages/GantiPinWajib';
import BannerVersi from './components/BannerVersi';
import BatasHalaman from './components/BatasHalaman';
import HalamanVerifikasi from './components/HalamanVerifikasi';
import HalamanBerkasGaruda from './components/HalamanBerkasGaruda';
import FormWhatsapp from './components/FormWhatsapp';
import { Modal } from './components/ui';
import { parameterVerifikasi } from './lib/verifikasiLogic';
import { parameterBerkasGaruda } from './lib/garudaLogic';
import { pembinaAtauAdmin } from './lib/hakLogic';
import { menuSanggaTampil } from './lib/sanggaLogic';
import { menuPraUjiTampil, ujiResmiTampil } from './lib/praUjiLogic';
import { bolehKelolaMateri } from './lib/materiLogic';
import LogoMark from './components/LogoMark';

// Halaman selain beranda dimuat malas (berkasnya diunduh saat pertama dibuka); lihat BatasHalaman.
const PesertaSku = lazy(() => import('./pages/PesertaSku'));
const PraUji = lazy(() => import('./pages/PraUji'));
const Pelantikan = lazy(() => import('./pages/Pelantikan'));
const PesertaDetail = lazy(() => import('./pages/PesertaDetail'));
const AdminAnggota = lazy(() => import('./pages/AdminAnggota'));
const AbsensiPeserta = lazy(() => import('./pages/Absensi').then((m) => ({ default: m.AbsensiPeserta })));
const AbsensiPengurus = lazy(() => import('./pages/Absensi').then((m) => ({ default: m.AbsensiPengurus })));
const PortofolioPengurus = lazy(() => import('./pages/Portofolio'));
const CetakDokumen = lazy(() => import('./pages/CetakDokumen'));
const Akun = lazy(() => import('./pages/Akun'));
const ResetPin = lazy(() => import('./pages/ResetPin'));
const Materi = lazy(() => import('./pages/Materi'));
const KelolaMateri = lazy(() => import('./pages/KelolaMateri'));
const Sidang = lazy(() => import('./pages/Sidang'));
const Raport = lazy(() => import('./pages/Raport'));
const KelolaInstrumen = lazy(() => import('./pages/KelolaInstrumen'));
const Penugasan = lazy(() => import('./pages/Penugasan'));
const DataGudep = lazy(() => import('./pages/DataGudep'));
const NaikKelas = lazy(() => import('./pages/NaikKelas'));
const Kepengurusan = lazy(() => import('./pages/Kepengurusan'));
const SesiUjian = lazy(() => import('./pages/SesiUjian'));
const Iuran = lazy(() => import('./pages/Iuran'));
const Notifikasi = lazy(() => import('./pages/Notifikasi'));
const PemeriksaanData = lazy(() => import('./pages/PemeriksaanData'));
const TindakLanjut = lazy(() => import('./pages/TindakLanjut'));
const Agenda = lazy(() => import('./pages/Agenda'));
const Sangga = lazy(() => import('./pages/Sangga'));
const Laporan = lazy(() => import('./pages/Laporan'));
const Bantuan = lazy(() => import('./pages/Bantuan'));

/**
 * Menu per peran, dikelompokkan menurut fungsinya (tampil sebagai kelompok di menu samping, dan berurutan di menu bawah ponsel).
 *  Utama            : Dashboard (Penegak: Beranda atau Garuda), Notifikasi (semua peran; lencana = belum dibaca), Bantuan (tahap L10, semua peran)
 *  Pengujian SKU    : Penegak: Poin SKU, Cetak. Dewan/Pembina: Antrian, Peserta, Sesi, Instrumen, Penugasan, Pengurus (Pembina), Periksa Data (Dewan dan Pembina), Sidang, Cetak. Admin: Sesi, Instrumen, Sidang, Cetak
 *  Kegiatan Ambalan : Absensi, Iuran, Agenda (tahap L6, semua peran), Sangga (fase B; pengurus, dan Penegak yang menjadi Bina Damping), Portofolio, Tindak Lanjut (tahap L5, pengurus), Raport dan Laporan (tahap L8, Pembina dan Admin)
 *  Materi           : Materi, Kelola Materi (Pembina dan Admin)
 *  Pengelolaan      : Anggota, Pengurus, Naik Kelas, Data Gudep, Periksa Data (Admin). Menu Pengurus (Kepengurusan Dewan Ambalan) juga untuk Pembina (di Pengujian SKU).
 * Periksa Data (tahap L3; Pembina, Dewan Ambalan, dan Admin): ringkasan masalah kualitas data umum (lihat src/lib/pemeriksaanLogic.js).
 * Dewan Ambalan = jabatan pada akun Penegak: pemegangnya memilih tampilan Penegak atau Dewan (user.role berubah menjadi 'penguji' pada tampilan Dewan).
 * Akun saya dan Reset PIN anggota (pengurus) tidak ada di daftar ini: keduanya di menu akun (nama pengguna di menu samping atau header).
 */
function buatNav(user, peran, belumDibaca = 0, pendampingan = null, praUjiAktif = false) {
  const materi = { id: 'materi', label: 'Materi', ikon: 'buku' };
  const kelola = { id: 'kelolamateri', label: 'Kelola Materi', ikon: 'pustaka' };
  const raport = { id: 'raport', label: 'Raport', ikon: 'raport' };
  const laporan = { id: 'laporan', label: 'Laporan', ikon: 'grafik' };
  const instrumen = { id: 'instrumen', label: 'Instrumen', ikon: 'instrumen' };
  const absensi = { id: 'absensi', label: 'Absensi', ikon: 'absensi' };
  const iuran = { id: 'iuran', label: 'Iuran', ikon: 'iuran' };
  const portofolio = { id: 'portofolio', label: 'Portofolio', ikon: 'portofolio' };
  const sidang = { id: 'sidang', label: 'Sidang', ikon: 'sidang' };
  const sesi = { id: 'sesi', label: 'Sesi ujian', ikon: 'sesi' };
  const cetak = { id: 'cetak', label: 'Cetak', ikon: 'cetak' };
  const penugasan = { id: 'penugasan', label: 'Penugasan', ikon: 'penugasan' };
  const kepengurusan = { id: 'kepengurusan', label: 'Pengurus', ikon: 'perisai' };
  const pemeriksaan = { id: 'pemeriksaan', label: 'Periksa Data', ikon: 'cari' };
  const tindakLanjut = { id: 'tindaklanjut', label: 'Tindak Lanjut', ikon: 'lonceng' };
  const agenda = { id: 'agenda', label: 'Agenda', ikon: 'kalender' };
  const sangga = { id: 'sangga', label: 'Sangga', ikon: 'anggota' };
  const adaSangga = menuSanggaTampil(user, pendampingan);
  const praUji = { id: 'pra-uji', label: 'Pra-uji', ikon: 'cek' };
  const pelantikan = { id: 'pelantikan', label: 'Pelantikan', ikon: 'lencana' };
  const adaPraUji = menuPraUjiTampil(user, pendampingan, praUjiAktif);
  const ujiResmi = ujiResmiTampil(user, praUjiAktif); // pra-uji hidup: uji resmi hanya Pembina, jadi Antrian dan Sesi ujian tidak untuk Dewan Ambalan
  const kelolaBoleh = bolehKelolaMateri(user);
  const notifikasi = { id: 'notifikasi', label: 'Notifikasi', ikon: 'lonceng', lencana: belumDibaca };
  const bantuan = { id: 'bantuan', label: 'Bantuan', ikon: 'tanya' };

  if (user.role === 'peserta') {
    return [
      { judul: 'Utama', item: [peran === 'calon-garuda' ? { id: 'beranda', label: 'Garuda', ikon: 'bintang' } : { id: 'beranda', label: 'Beranda', ikon: 'beranda' }, notifikasi, bantuan] },
      { judul: 'Pengujian SKU', item: [{ id: 'sku', label: 'Poin SKU', ikon: 'daftar' }, ...(adaPraUji ? [praUji] : []), cetak] },
      { judul: 'Kegiatan Ambalan', item: [absensi, iuran, agenda, ...(adaSangga ? [sangga] : [])] },
      { judul: 'Materi', item: [materi] },
    ];
  }
  if (user.role === 'penguji') {
    return [
      { judul: 'Utama', item: [{ id: 'dashboard', label: 'Dashboard', ikon: 'dashboard' }, notifikasi, bantuan] },
      { judul: 'Pengujian SKU', item: [...(ujiResmi ? [{ id: 'antrian', label: 'Antrian', ikon: 'jam' }] : []), ...(adaPraUji ? [praUji] : []), { id: 'peserta', label: 'Peserta', ikon: 'anggota' }, ...(ujiResmi ? [sesi] : []), ...(kelolaBoleh ? [instrumen, penugasan, kepengurusan, pelantikan] : []), pemeriksaan, sidang, cetak] },
      { judul: 'Kegiatan Ambalan', item: [absensi, iuran, portofolio, tindakLanjut, agenda, sangga, ...(kelolaBoleh ? [raport, laporan] : [])] },
      { judul: 'Materi', item: [materi, ...(kelolaBoleh ? [kelola] : [])] },
    ];
  }
  return [
    { judul: 'Utama', item: [{ id: 'rekap', label: 'Dashboard', ikon: 'dashboard' }, notifikasi, bantuan] },
    { judul: 'Pengujian SKU', item: [praUji, sesi, instrumen, pelantikan, sidang, cetak] },
    { judul: 'Kegiatan Ambalan', item: [absensi, iuran, portofolio, tindakLanjut, agenda, sangga, raport, laporan] },
    { judul: 'Materi', item: [materi, kelola] },
    { judul: 'Pengelolaan', item: [{ id: 'anggota', label: 'Anggota', ikon: 'anggota' }, kepengurusan, { id: 'naikkelas', label: 'Naik Kelas', ikon: 'naikkelas' }, { id: 'gudep', label: 'Data Gudep', ikon: 'perisai' }, pemeriksaan] },
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

/** Akun Dewan Ambalan lama yang diarsipkan tidak dapat dipakai lagi. */
function LayarArsip() {
  const { logout } = useApp();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-pramuka-800 px-6 text-center text-pramuka-50">
      <LogoMark size={64} />
      <h1 className="mt-5 font-display text-2xl font-bold tracking-wide">Akun ini sudah diarsipkan</h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-pramuka-200" role="alert">
        Dewan Ambalan kini berupa jabatan pada akun Penegak. Keluar, lalu masuk memakai akun Penegak Anda (NIS). Bila jabatan Dewan Anda sudah ditetapkan,
        tombol tampilan Dewan muncul di sana. Hubungi Pembina atau Admin Gudep bila belum.
      </p>
      <button className="btn btn-gold mt-5" onClick={logout}>Keluar</button>
    </div>
  );
}

function Shell() {
  const { user, peranUser, status, galatMuat, belumDibaca, segarkanNotifikasi, pendampingan, praUjiAktif } = useApp();
  const [tab, setTab] = useState(null);
  const [fokusId, setFokusId] = useState(null); // peserta yang sedang dibuka penguji/admin
  const [jenisCetak, setJenisCetak] = useState('kartu'); // tab awal halaman Cetak (kartu | stl | surat)
  const [tingkat, setTingkat] = useState('Bantara');
  const [materiButir, setMateriButir] = useState(null); // butir SKU yang dituju tombol "Materi"
  const [kelolaId, setKelolaId] = useState(null); // materi yang langsung dibuka di Kelola Materi ('baru' = tambah)
  const [waTutup, setWaTutup] = useState(false); // ajakan isi nomor WhatsApp ditutup/dilewati untuk sesi masuk ini (tahap L5)

  useEffect(() => {
    setTab(null);
    setFokusId(null);
    setMateriButir(null);
    setKelolaId(null);
    setWaTutup(false); // setiap masuk baru (termasuk akun yang sama masuk lagi) ajakan tampil lagi bila nomor belum diisi
  }, [user?.id, user?.role]);

  // Klik notifikasi push membuka aplikasi di Kotak Notifikasi: lewat alamat ?buka=notifikasi (aplikasi tertutup) atau pesan service worker (sudah terbuka).
  useEffect(() => {
    if (!user) return undefined;
    const params = new URLSearchParams(window.location.search);
    if (params.get('buka') === 'notifikasi') {
      setTab('notifikasi');
      window.history.replaceState(null, '', window.location.pathname);
    }
    const layanan = navigator.serviceWorker;
    const saatPesan = (e) => {
      if (e.data?.type === 'notifikasi-baru') segarkanNotifikasi(); // push tiba saat aplikasi terbuka
      if (e.data?.type !== 'buka-notifikasi') return;
      setTab('notifikasi');
      setFokusId(null);
      segarkanNotifikasi();
    };
    layanan?.addEventListener('message', saatPesan);
    return () => layanan?.removeEventListener('message', saatPesan);
  }, [user?.id, segarkanNotifikasi]);

  // Jumlah belum dibaca juga pada judul tab dan ikon aplikasi terpasang
  useEffect(() => {
    const dasar = 'SIGARDA - Sistem Informasi Garuda dan SKU Penegak';
    document.title = user && belumDibaca > 0 ? `(${belumDibaca}) ${dasar}` : dasar;
    try {
      if (user && belumDibaca > 0) navigator.setAppBadge?.(belumDibaca);
      else navigator.clearAppBadge?.();
    } catch { /* tidak didukung */ }
  }, [user, belumDibaca]);

  if (status !== 'siap') return <LayarStatus status={status} galat={galatMuat} />;
  if (!user) return <Login />;
  // PIN awal dari admin atau PIN hasil reset wajib diganti sebelum aplikasi dapat dipakai
  if (user.wajibGantiPin) return <GantiPinWajib />;
  // Akun Dewan Ambalan LAMA yang sudah diarsipkan: Dewan kini jabatan pada akun Penegak, jadi masuk memakai akun Penegak sendiri
  if (user.role === 'penguji' && (user.status ?? 'aktif') !== 'aktif') return <LayarArsip />;

  const grup = buatNav(user, peranUser, belumDibaca, pendampingan, praUjiAktif);
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
  } else if (tabAktif === 'notifikasi') {
    isi = <Notifikasi idMenu={nav.map((n) => n.id)} onNav={pindah} />;
  } else if (tabAktif === 'bantuan') {
    isi = <Bantuan />;
  } else if (tabAktif === 'sidang' && user.role !== 'peserta') {
    isi = <Sidang />;
  } else if (tabAktif === 'iuran') {
    isi = <Iuran />;
  } else if (tabAktif === 'sesi' && user.role !== 'peserta') {
    isi = <SesiUjian />;
  } else if (tabAktif === 'raport' && bolehKelolaMateri(user)) {
    isi = <Raport />;
  } else if (tabAktif === 'laporan' && bolehKelolaMateri(user)) {
    isi = <Laporan />;
  } else if (tabAktif === 'instrumen' && bolehKelolaMateri(user)) {
    isi = <KelolaInstrumen />;
  } else if (tabAktif === 'gudep' && user.role === 'admin') {
    isi = <DataGudep />;
  } else if (tabAktif === 'naikkelas' && user.role === 'admin') {
    isi = <NaikKelas />;
  } else if (tabAktif === 'penugasan' && user.role === 'penguji' && user.jabatan === 'Pembina') {
    isi = <Penugasan />;
  } else if (tabAktif === 'kepengurusan' && pembinaAtauAdmin(user)) {
    isi = <Kepengurusan />;
  } else if (tabAktif === 'pemeriksaan' && user.role !== 'peserta') {
    isi = <PemeriksaanData onNav={pindah} />;
  } else if (tabAktif === 'tindaklanjut' && user.role !== 'peserta') {
    isi = <TindakLanjut onNav={(id) => pindah(user.role === 'penguji' ? 'peserta' : 'rekap', id)} />;
  } else if (tabAktif === 'agenda') {
    isi = <Agenda />;
  } else if (tabAktif === 'sangga') {
    isi = <Sangga />;
  } else if (tabAktif === 'pelantikan' && bolehKelolaMateri(user)) {
    isi = <Pelantikan />;
  } else if (tabAktif === 'pra-uji' && menuPraUjiTampil(user, pendampingan, praUjiAktif)) {
    isi = <PraUji />;
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
    <>
      <Layout nav={nav} grup={grup} tab={tabAktif} setTab={pilihTab}>
        <BatasHalaman>{isi}</BatasHalaman>
      </Layout>
      {/* Ajakan isi nomor WhatsApp (tahap L5): satu kali per masuk, dapat dilewati, tampil lagi pada masuk berikutnya bila masih kosong. */}
      <Modal buka={!user.whatsapp && !waTutup} tutup={() => setWaTutup(true)} judul="Isi nomor WhatsApp">
        <p className="mb-4 text-sm text-pramuka-600">
          Supaya Pembina atau Dewan Ambalan dapat menghubungi Anda bila diperlukan (mis. SKU sudah lama tidak bergerak). Boleh dilewati; akan
          ditanyakan lagi lain kali sampai diisi.
        </p>
        <FormWhatsapp onSelesai={() => setWaTutup(true)} onLewati={() => setWaTutup(true)} />
      </Modal>
    </>
  );
}

export default function App() {
  // Alamat dari QR dokumen (/?v=...) membuka halaman verifikasi publik: tanpa login dan tanpa memuat data aplikasi.
  const verifikasi = parameterVerifikasi(window.location.search);
  if (verifikasi !== null) return <HalamanVerifikasi awal={verifikasi} />;
  // Tautan berbagi Berkas Calon Garuda (/?berkas=...): tanpa login, baca-saja (tahap L7).
  const berkas = parameterBerkasGaruda(window.location.search);
  if (berkas !== null) return <HalamanBerkasGaruda token={berkas} />;
  return (
    <AppProvider>
      <Shell />
      <Toast />
      <BannerVersi />
    </AppProvider>
  );
}

