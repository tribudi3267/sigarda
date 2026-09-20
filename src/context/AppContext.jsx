import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ambilKlien, GALAT_KONFIGURASI, LOKAL } from '../lib/supabaseClient';
import { buatApi } from '../lib/api';
import { pesertaDenganPeran } from '../lib/skuLogic';
import {
  adalahJumat, daftarSemester, gabungHadirSemester, KODE_STATUS, kunciSemester, rentangKunci, semesterDari, tanggalValid,
} from '../lib/absensiLogic';
import { bolehResetPin, validasiPinBaru } from '../lib/pinLogic';
import { periksaBaris, POLA_NTA } from '../lib/importAnggota';
import { bolehKelolaMateri, validasiMateri } from '../lib/materiLogic';
import { hariIni } from '../lib/format';
import { PENGATURAN_IURAN_BAWAAN, gabungPengaturanIuran } from '../lib/iuranLogic';

/**
 * STATE APLIKASI
 *
 * Sumber kebenaran ada di server (Supabase). Di sini hanya salinan (cache) sesuai izin pengguna yang masuk,
 * dalam bentuk data yang sama dengan yang dipakai seluruh halaman:
 *   db = { users, progress, absensi, portofolio, materi }   (lihat src/lib/mapDb.js)
 * Setiap aksi memanggil server lebih dulu, lalu menyegarkan bagian data yang terpengaruh.
 * Aksi mengembalikan { ok, pesan, ... } dan tidak pernah melempar galat ke halaman.
 *
 * KEHADIRAN DIMUAT BERTAHAP. Saat masuk hanya daftar sesi (kecil) dan kehadiran SEMESTER AKTIF yang dimuat. Semester lain
 * (tahun ajaran sebelumnya, atau semester yang tidak sedang berjalan) dimuat ketika halaman memintanya lewat
 * pastikanAbsensi(tahunAjaran, periode), biasanya dari hook useAbsensiPeriode. `semesterSiap` mencatat semester yang sudah
 * dimuat; halaman tidak boleh menghitung rekap untuk semester yang belum siap (hasilnya menyesatkan: semua "belum dicatat").
 */
const Ctx = createContext(null);

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp harus dipakai di dalam <AppProvider>');
  return ctx;
}

const DB_KOSONG = { users: [], progress: {}, absensi: { sesi: {}, hadir: {} }, portofolio: {}, materi: [], sidang: [], sidangUrut: {}, pengaturan: {}, raport: {}, instrumen: {}, instrumenGalat: '', sesiUjian: [], sesiUjianGalat: '', asisten: [], pengaturanIuran: PENGATURAN_IURAN_BAWAAN };
const UKURAN_ROMBONGAN = 25; // jumlah akun per permintaan buat-akun (dibatasi waktu Edge Function)
const JEDA_SEGARKAN_MS = 30000;

const ditolak = (notify, pesan) => {
  notify(pesan, 'err');
  return { ok: false, pesan };
};

const KELOMPOK_DARI_DATA = (d) => (d.role === 'peserta' ? 'peserta' : d.role === 'admin' ? 'admin' : d.jabatan === 'Pembina' ? 'pembina' : 'dewan');

export function AppProvider({ children }) {
  const [status, setStatus] = useState('memuat'); // memuat | siap | konfigurasi | galat
  const [galatMuat, setGalatMuat] = useState('');
  const [sesiId, setSesiId] = useState(null);
  const [db, setDb] = useState(DB_KOSONG);
  const [semesterSiap, setSemesterSiap] = useState({}); // { 'TA|periode': true } = kehadiran semester itu sudah dimuat
  const [instrumenSiap, setInstrumenSiap] = useState(false); // instrumen penilaian sudah dimuat (lazy, sekali per sesi)
  const instrumenMuat = useRef(null);                       // janji pemuatan yang sedang berjalan
  const instrumenSiapRef = useRef(false);                   // salinan instrumenSiap yang selalu mutakhir (untuk callback)
  instrumenSiapRef.current = instrumenSiap;
  const [versiIuran, setVersiIuran] = useState(0); // naik setiap iuran, kas, atau asisten berubah
  const [sesiUjianSiap, setSesiUjianSiap] = useState(false); // daftar sesi ujian sudah dimuat (lazy, sekali per sesi login)
  const sesiUjianMuat = useRef(null);
  const sesiUjianSiapRef = useRef(false);
  sesiUjianSiapRef.current = sesiUjianSiap;
  const [toast, setToast] = useState(null);
  const apiRef = useRef(null);
  const lokalRef = useRef(null);
  const terakhirMuat = useRef(0);
  const semesterRef = useRef(new Set());        // salinan semesterSiap yang selalu mutakhir (untuk dipakai di dalam callback)
  const semesterSedangMuat = useRef(new Map()); // kunci -> janji, agar permintaan yang sama tidak diulang bersamaan
  const generasi = useRef(0);                   // naik tiap keluar/sesi berakhir; hasil muat lama diabaikan
  const sesiRef = useRef({});                   // daftar sesi terkini (untuk dipakai di dalam callback)
  sesiRef.current = db.absensi.sesi;

  const notify = useCallback((pesan, tipe = 'ok') => setToast({ pesan, tipe, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3400);
    return () => clearTimeout(t);
  }, [toast]);

  const user = useMemo(() => db.users.find((u) => u.id === sesiId) ?? null, [db.users, sesiId]);
  const daftarPeserta = useMemo(() => pesertaDenganPeran(db.progress, db.users), [db.progress, db.users]);
  const peranUser = useMemo(
    () => (user?.role === 'peserta' ? daftarPeserta.find((p) => p.id === user.id)?.peran ?? null : null),
    [daftarPeserta, user]
  );

  /* ------------------------- Memuat dan menyegarkan ------------------------- */
  const api = () => apiRef.current;

  /** Mengosongkan seluruh salinan data (keluar atau sesi berakhir). */
  const kosongkan = useCallback(() => {
    generasi.current += 1;
    semesterRef.current = new Set();
    semesterSedangMuat.current = new Map();
    setSemesterSiap({});
    setInstrumenSiap(false);
    instrumenMuat.current = null;
    setSesiUjianSiap(false);
    sesiUjianMuat.current = null;
    setDb(DB_KOSONG);
  }, []);

  const sesiBerakhir = useCallback(async () => {
    await api()?.keluar();
    setSesiId(null);
    kosongkan();
    notify('Sesi berakhir. Masuk kembali.', 'err');
  }, [notify, kosongkan]);

  const tandaiSiap = (daftarKunci) => {
    for (const k of daftarKunci) semesterRef.current.add(k);
    setSemesterSiap(Object.fromEntries([...semesterRef.current].map((k) => [k, true])));
  };

  /**
   * Memuat data yang boleh dibaca pengguna ini. Kehadiran hanya untuk semester aktif ditambah semester yang sebelumnya
   * sudah dibuka (agar penyegaran tidak membuat data yang sedang dilihat kembali kosong).
   */
  const muatSemua = useCallback(async () => {
    const a = api();
    const mulaiGenerasi = generasi.current;
    const daftarKunci = [...new Set([semesterDari(hariIni()), ...semesterRef.current])];
    const [u, p, sesi, pf, m, asisten, pengIuran, ...hadir] = await Promise.all([
      a.muatProfil(), a.muatProgress(), a.muatSesiAbsen(), a.muatPortofolio(), a.muatMateri(),
      a.muatAsisten(), // penunjukan asisten bendahara: tidak wajib (basis data lama belum punya tabelnya), jadi tidak ikut pemeriksaan gagal
      a.muatPengaturanIuran(), // pengaturan iuran: bila fungsinya belum ada dipakai nilai bawaan
      ...daftarKunci.map((k) => { const r = rentangKunci(k); return a.muatHadirRentang(r.mulai, r.akhir); }),
    ]);
    const gagal = [u, p, sesi, pf, m, ...hadir].find((r) => !r.ok);
    if (gagal) return gagal;
    if (mulaiGenerasi !== generasi.current) return { ok: true }; // pengguna sudah keluar selagi memuat
    const hadirGabung = Object.assign({}, ...hadir.map((h) => h.data));
    setDb((d) => ({
      ...d, // sidang dan pengaturan dimuat terpisah (muatSidang) dan tidak boleh hilang saat penyegaran
      users: u.data, progress: p.data, portofolio: pf.data, materi: m.data, asisten: asisten.ok ? asisten.data : [], pengaturanIuran: pengIuran.ok ? gabungPengaturanIuran(pengIuran.data) : PENGATURAN_IURAN_BAWAAN,
      absensi: gabungHadirSemester(d.absensi, sesi.data, daftarKunci, hadirGabung),
    }));
    tandaiSiap(daftarKunci);
    terakhirMuat.current = Date.now();
    return { ok: true };
  }, []);

  /**
   * Memastikan kehadiran untuk tahun ajaran dan periode ini sudah dimuat (permintaan berikutnya sesudah pilihan filter).
   * Idempoten: semester yang sudah siap tidak diminta lagi, dan permintaan yang sedang berjalan dipakai bersama.
   */
  const pastikanAbsensi = useCallback(async (tahunAjaran, periode) => {
    const belum = daftarSemester(tahunAjaran, periode).filter((k) => !semesterRef.current.has(k));
    if (!belum.length) return { ok: true };
    // Semester tanpa satu pun sesi (mis. masa depan) tidak punya kehadiran: tidak perlu bertanya ke server.
    const adaSesi = (k) => { const r = rentangKunci(k); return Object.keys(sesiRef.current).some((t) => t >= r.mulai && t <= r.akhir); };
    const kosong = belum.filter((k) => !adaSesi(k));
    if (kosong.length) tandaiSiap(kosong);
    const perluMuat = belum.filter(adaSesi);
    if (!perluMuat.length) return { ok: true };
    const mulaiGenerasi = generasi.current;
    const hasil = await Promise.all(perluMuat.map((k) => {
      if (!semesterSedangMuat.current.has(k)) {
        const r = rentangKunci(k);
        const janji = api().muatHadirRentang(r.mulai, r.akhir).then((res) => {
          semesterSedangMuat.current.delete(k);
          if (res.ok && mulaiGenerasi === generasi.current) {
            setDb((d) => ({ ...d, absensi: gabungHadirSemester(d.absensi, d.absensi.sesi, [k], res.data) }));
            tandaiSiap([k]);
          }
          return res;
        });
        semesterSedangMuat.current.set(k, janji);
      }
      return semesterSedangMuat.current.get(k);
    }));
    const gagal = hasil.find((r) => !r.ok);
    if (gagal?.sesiBerakhir) await sesiBerakhir();
    return gagal ?? { ok: true };
  }, [sesiBerakhir]);

  const mulaiSesi = useCallback(async (id) => {
    const r = await muatSemua();
    if (!r.ok) {
      await api().keluar();
      return r;
    }
    setSesiId(id);
    return { ok: true };
  }, [muatSemua]);

  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const { klien, lokal } = await ambilKlien();
        apiRef.current = buatApi(klien);
        lokalRef.current = lokal;
        const id = await apiRef.current.sesiSaatIni();
        if (id) {
          const r = await mulaiSesi(id);
          if (!r.ok && !r.sesiBerakhir && !batal) notify(r.pesan, 'err');
        }
        if (!batal) setStatus('siap');
      } catch (e) {
        if (batal) return;
        setGalatMuat(e?.message ?? String(e));
        setStatus(e?.message === GALAT_KONFIGURASI ? 'konfigurasi' : 'galat');
      }
    })();
    return () => { batal = true; };
  }, [mulaiSesi, notify]);

  // Data pengguna lain berubah tanpa sepengetahuan kita: muat ulang saat kembali ke halaman ini.
  useEffect(() => {
    if (!sesiId) return undefined;
    const saatTampil = () => {
      if (document.visibilityState === 'visible' && Date.now() - terakhirMuat.current > JEDA_SEGARKAN_MS) muatSemua();
    };
    document.addEventListener('visibilitychange', saatTampil);
    window.addEventListener('focus', saatTampil);
    return () => {
      document.removeEventListener('visibilitychange', saatTampil);
      window.removeEventListener('focus', saatTampil);
    };
  }, [sesiId, muatSemua]);

  // Penyegaran sebagian. Bila gagal (mis. koneksi), data lama dipertahankan.
  const segarkan = useMemo(() => {
    const terapkan = async (janji, fn) => {
      const r = await janji;
      if (r.ok) setDb(fn(r.data));
      else if (r.sesiBerakhir) await sesiBerakhir();
      else notify(r.pesan, 'err');
    };
    return {
      users: () => terapkan(api().muatProfil(), (users) => (d) => ({ ...d, users })),
      progress: (pid) => terapkan(api().muatProgress(pid), (p) => (d) => ({ ...d, progress: pid ? { ...d.progress, [pid]: p[pid] ?? {} } : p })),
      portofolio: (pid) => terapkan(api().muatPortofolio(pid), (p) => (d) => ({ ...d, portofolio: pid ? { ...d.portofolio, [pid]: p[pid] ?? {} } : p })),
      hadir: (tanggal) => terapkan(api().muatHadirTanggal(tanggal), (h) => (d) => ({ ...d, absensi: { ...d.absensi, hadir: { ...d.absensi.hadir, [tanggal]: h } } })),
      materi: () => terapkan(api().muatMateri(), (materi) => (d) => ({ ...d, materi })),
      asisten: () => terapkan(api().muatAsisten(), (asisten) => (d) => ({ ...d, asisten })),
      pengaturanIuran: () => terapkan(api().muatPengaturanIuran(), (p) => (d) => ({ ...d, pengaturanIuran: gabungPengaturanIuran(p) })),
      sidang: async () => {
        const [s, u] = await Promise.all([api().muatSidang(), api().muatSidangUrut()]);
        const gagal = [s, u].find((r) => !r.ok);
        if (!gagal) setDb((d) => ({ ...d, sidang: s.data, sidangUrut: u.data }));
        else if (gagal.sesiBerakhir) await sesiBerakhir();
        else notify(gagal.pesan, 'err');
      },
      pengaturan: () => terapkan(api().muatPengaturan(), (pengaturan) => (d) => ({ ...d, pengaturan })),
      raport: (tahunAjaran, semester) =>
        terapkan(api().muatRaport(tahunAjaran, semester), (r) => (d) => ({ ...d, raport: { ...d.raport, [kunciSemester(tahunAjaran, semester)]: r } })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notify, sesiBerakhir]);

  /** Menjalankan aksi ke server; galat ditampilkan sebagai toast, keberhasilan menyegarkan data. */
  const aksi = async (janji, { sukses, sesudah } = {}) => {
    const r = await janji;
    if (!r.ok) {
      if (r.sesiBerakhir) {
        await sesiBerakhir();
        return { ok: false, pesan: r.pesan };
      }
      return ditolak(notify, r.pesan);
    }
    if (sesudah) await sesudah(r);
    if (sukses) notify(sukses);
    return r;
  };

  /* --------------------------------- Sesi --------------------------------- */
  const login = async (username, pin) => {
    const r = await api().masuk(username, pin);
    if (!r.ok) return r; // pesan ditampilkan di formulir masuk
    const m = await mulaiSesi(r.id);
    return m.ok ? { ok: true } : { ok: false, pesan: m.pesan };
  };

  const logout = async () => {
    await api()?.keluar();
    setSesiId(null);
    kosongkan();
  };

  /* ------------------------------ Kelola PIN ------------------------------ */
  /** Ganti PIN milik pengguna yang sedang masuk. Galat dikembalikan untuk formulir, bukan toast. */
  const gantiPin = async ({ pinLama, pinBaru, ulangi }) => {
    if (!user) return { ok: false, pesan: 'Sesi berakhir. Masuk kembali.' };
    const galat = validasiPinBaru(pinBaru, pinLama, ulangi);
    if (galat) return { ok: false, pesan: galat };
    const r = await api().gantiPin({ pinLama, pinBaru, ulangi });
    if (!r.ok) {
      if (r.sesiBerakhir) await sesiBerakhir();
      return { ok: false, pesan: r.pesan };
    }
    // Selama PIN belum diganti server hanya melayani profil sendiri, jadi seluruh data dimuat ulang sekarang.
    const m = await muatSemua();
    if (!m.ok && m.sesiBerakhir) await sesiBerakhir();
    notify('PIN berhasil diganti. Gunakan PIN baru pada login berikutnya.');
    return { ok: true };
  };

  /** Reset PIN oleh pengurus: PIN acak baru dikembalikan satu kali untuk disampaikan ke pemilik akun. */
  const resetPin = async (targetId) => {
    const target = db.users.find((u) => u.id === targetId);
    if (!target) return ditolak(notify, 'Anggota tidak ditemukan.');
    if (!bolehResetPin(user, target)) return ditolak(notify, 'Anda tidak berwenang mereset PIN anggota ini.');
    return aksi(api().resetPin(targetId), { sesudah: () => segarkan.users() });
  };

  /* ------------------------------ Progres SKU ------------------------------ */
  const ajukan = (data) =>
    aksi(api().ajukan(data), { sukses: 'Pengajuan terkirim ke penguji.', sesudah: () => segarkan.progress(user.id) });

  const batalkanAjuan = (skuId) =>
    aksi(api().batalkanAjuan(skuId), { sukses: 'Pengajuan dibatalkan.', sesudah: () => segarkan.progress(user.id) });

  /**
   * Hanya penguji. PIN penguji diverifikasi di server (verifikasi digital). Bila `data.rincian` (nilai tiap kriteria instrumen) ikut dikirim,
   * server menghitung ulang skor dan saran, dan jawabannya memuat `rubrik: true`. Jawaban tanpa penanda itu berarti Edge Function belum
   * diperbarui (fungsi lama mengabaikan rincian), sehingga hasilnya tidak boleh dianggap tercatat lewat instrumen.
   */
  const catatHasil = ({ pin, pesertaId, ...data }) => {
    if (user?.role !== 'penguji') return Promise.resolve(ditolak(notify, 'Hanya Pembina atau Dewan Ambalan yang dapat mencatat hasil.'));
    const pesanBerhasil = {
      lulus: 'Poin dinyatakan lulus dan terverifikasi.',
      ulang: 'Poin ditandai perlu diulang.',
      proses: 'Pengujian ditandai sedang berjalan.',
      reset: 'Status poin dikembalikan.',
    }[data.hasil];
    const janji = api().catatHasil({ pin, pesertaId, ...data }).then((r) => (
      r.ok && data.rincian && !r.rubrik
        ? { ok: false, pesan: 'Fungsi server (Edge Function) belum diperbarui sehingga nilai instrumen tidak tercatat. Pasang ulang fungsi terbaru (lihat README), lalu periksa status butir ini sebelum mengulang.' }
        : r
    ));
    return aksi(janji, { sukses: pesanBerhasil, sesudah: () => segarkan.progress(pesertaId) });
  };

  /* ------------------ Instrumen penilaian (dimuat sekali, sesuai kebutuhan) ------------------ */
  const bolehKelolaInstrumen = user?.role === 'admin' || (user?.role === 'penguji' && user?.jabatan === 'Pembina');
  const MSG_INSTRUMEN = 'Hanya Pembina dan Admin Gudep yang dapat mengelola instrumen penilaian.';

  /** Memuat instrumen dan pengaturannya bila belum, atau ulang bila `paksa`. Aman dipanggil berulang (permintaan yang sama dipakai bersama). */
  const pastikanInstrumen = useCallback(async (paksa = false) => {
    if (!paksa && instrumenSiapRef.current) return { ok: true };
    if (instrumenMuat.current) return instrumenMuat.current;
    const mulaiGenerasi = generasi.current;
    const janji = (async () => {
      const a = api();
      const [i, p] = await Promise.all([a.muatInstrumen(), a.muatPengaturan()]);
      instrumenMuat.current = null;
      if (mulaiGenerasi !== generasi.current) return { ok: true };
      if (!i.ok) {
        if (i.sesiBerakhir) await sesiBerakhir();
        return i;
      }
      setDb((d) => ({ ...d, instrumen: i.data, instrumenGalat: i.galat ?? '', ...(p.ok ? { pengaturan: p.data } : {}) }));
      instrumenSiapRef.current = true;
      setInstrumenSiap(true);
      return { ok: true };
    })();
    instrumenMuat.current = janji;
    return janji;
  }, [sesiBerakhir]);

  const simpanInstrumen = (data) =>
    bolehKelolaInstrumen
      ? aksi(api().simpanInstrumen(data), { sukses: 'Instrumen tersimpan.', sesudah: () => pastikanInstrumen(true) })
      : Promise.resolve(ditolak(notify, MSG_INSTRUMEN));

  const statusInstrumen = (skuIds, status) =>
    bolehKelolaInstrumen
      ? aksi(api().statusInstrumen(skuIds, status), {
        sukses: status === 'ditetapkan' ? `${skuIds.length} instrumen ditetapkan dan mulai dipakai menilai.` : `${skuIds.length} instrumen dikembalikan ke draf.`,
        sesudah: () => pastikanInstrumen(true),
      })
      : Promise.resolve(ditolak(notify, MSG_INSTRUMEN));

  const simpanPengaturanInstrumen = (nilai) =>
    bolehKelolaInstrumen
      ? aksi(api().simpanPengaturanInstrumen(nilai), { sukses: 'Pengaturan instrumen tersimpan.', sesudah: () => segarkan.pengaturan() })
      : Promise.resolve(ditolak(notify, MSG_INSTRUMEN));

  /* ------------------ Sesi ujian dan QR Surat Tanda Lulus ------------------ */
  const MSG_SESI = 'Hanya Dewan Ambalan, Pembina, dan Admin Gudep yang dapat mengelola sesi ujian.';
  const pengurus = user?.role === 'penguji' || user?.role === 'admin';
  const bolehHapusSesi = user?.role === 'admin' || (user?.role === 'penguji' && user?.jabatan === 'Pembina');

  /** Memuat daftar sesi ujian bila belum, atau ulang bila `paksa` (papan sesi memakainya untuk penyegaran berkala). */
  const pastikanSesiUjian = useCallback(async (paksa = false) => {
    if (!paksa && sesiUjianSiapRef.current) return { ok: true };
    if (sesiUjianMuat.current) return sesiUjianMuat.current;
    const mulaiGenerasi = generasi.current;
    const janji = (async () => {
      const r = await api().muatSesiUjian();
      sesiUjianMuat.current = null;
      if (mulaiGenerasi !== generasi.current) return { ok: true };
      if (!r.ok) {
        if (r.sesiBerakhir) await sesiBerakhir();
        return r;
      }
      setDb((d) => ({ ...d, sesiUjian: r.data, sesiUjianGalat: r.galat ?? '' }));
      sesiUjianSiapRef.current = true;
      setSesiUjianSiap(true);
      return { ok: true };
    })();
    sesiUjianMuat.current = janji;
    return janji;
  }, [sesiBerakhir]);

  /** Data sesi: { id?, nama, tanggal, tempat, catatan, status, butir: [id], peserta: [uuid] }. Mengembalikan { ok, data: id }. */
  const simpanSesiUjian = (data) =>
    pengurus
      ? aksi(api().simpanSesi(data), { sukses: data.id ? 'Sesi ujian diperbarui.' : 'Sesi ujian dibuat.', sesudah: () => pastikanSesiUjian(true) })
      : Promise.resolve(ditolak(notify, MSG_SESI));

  const ubahStatusSesiUjian = (id, status) =>
    pengurus
      ? aksi(api().statusSesi(id, status), {
        sukses: { berlangsung: 'Sesi dimulai. Penguji dapat menilai dari papan sesi.', selesai: 'Sesi diselesaikan.', terjadwal: 'Sesi dikembalikan ke terjadwal.' }[status],
        sesudah: () => pastikanSesiUjian(true),
      })
      : Promise.resolve(ditolak(notify, MSG_SESI));

  const hapusSesiUjian = (id) =>
    bolehHapusSesi
      ? aksi(api().hapusSesi(id), { sukses: 'Sesi ujian dihapus (hasil penilaian tidak terpengaruh).', sesudah: () => pastikanSesiUjian(true) })
      : Promise.resolve(ditolak(notify, 'Hanya Pembina dan Admin Gudep yang dapat menghapus sesi ujian.'));

  /** Menyegarkan progres seluruh peserta yang boleh dilihat (papan sesi). Galat hanya ditampilkan sebagai toast. */
  const muatUlangProgress = () => segarkan.progress();

  /** Token QR Surat Tanda Lulus satu tingkat (dibuat bila belum ada). Hasil: { ok, data: token } atau { ok: false, pesan }, tanpa toast. */
  const tokenSuratTingkat = async (pesertaId, tingkat) => {
    const r = await api().sertifikatTingkat(pesertaId, tingkat);
    if (!r.ok && r.sesiBerakhir) await sesiBerakhir();
    return r;
  };

  /** Riwayat penilaian instrumen satu butir (dibuka dari rincian nilai). Hasil { ok, data } atau { ok: false, pesan }, tanpa toast. */
  const muatPenilaian = async (pesertaId, skuId) => {
    const r = await api().muatPenilaian(pesertaId, skuId);
    if (!r.ok && r.sesiBerakhir) await sesiBerakhir();
    return r;
  };

  /* ------------- Iuran bumbung kepramukaan (dicatat Dewan Ambalan atau asisten bendahara) ------------- */
  const dewanAmbalan = user?.role === 'penguji' && user?.jabatan === 'Dewan Ambalan';
  const asistenSaya = user?.role === 'peserta' && db.asisten.some((a) => a.pesertaId === user.id);
  const pencatatIuran = dewanAmbalan || asistenSaya;
  const penunjukAsisten = dewanAmbalan || (user?.role === 'penguji' && user?.jabatan === 'Pembina');
  const MSG_IURAN = 'Hanya Dewan Ambalan atau asisten bendahara yang dapat mencatat iuran.';
  const naikkanIuran = () => setVersiIuran((v) => v + 1); // hook rekap dan lembar memuat ulang bila angka ini berubah

  /** Membaca data iuran (rekap, kas, lembar, riwayat) tanpa toast; sesi berakhir ditangani di sini. */
  const bacaIuran = async (nama, ...args) => {
    const r = await api()[nama](...args);
    if (!r.ok && r.sesiBerakhir) await sesiBerakhir();
    return r;
  };

  /** Jumlah kosong atau 0 = tidak iuran. Tidak menampilkan toast bila berhasil (dipakai berulang saat mencatat). */
  const aturIuran = (tanggal, pesertaId, jumlah) =>
    pencatatIuran ? aksi(api().aturIuran(tanggal, pesertaId, jumlah), { sesudah: naikkanIuran }) : Promise.resolve(ditolak(notify, MSG_IURAN));

  const aturIuranBanyak = async (tanggal, pesertaIds, jumlah, hanyaKosong = true) => {
    if (!pencatatIuran) return ditolak(notify, MSG_IURAN);
    const r = await aksi(api().aturIuranBanyak(tanggal, pesertaIds, jumlah, hanyaKosong), { sesudah: naikkanIuran });
    if (r.ok) notify(r.data > 0 ? `Iuran ${r.data} Penegak dicatat.` : 'Tidak ada iuran yang perlu diisi.');
    return r;
  };

  const simpanKas = (tanggal, total, catatan = '') =>
    dewanAmbalan
      ? aksi(api().simpanKas(tanggal, total, catatan), { sukses: total == null ? 'Tutup kas dihapus.' : 'Tutup kas tersimpan.', sesudah: naikkanIuran })
      : Promise.resolve(ditolak(notify, 'Hanya Dewan Ambalan yang dapat menutup kas.'));

  /** Iuran susulan saat ujian (Dewan): menebus Jumat kosong terlama dulu. Mengembalikan { ok, data: jumlah Jumat yang terisi }. */
  const catatIuranSusulan = async (pesertaId, tanggal, jumlah, pertemuan) => {
    if (!dewanAmbalan) return ditolak(notify, 'Hanya Dewan Ambalan yang dapat mencatat iuran susulan.');
    const r = await aksi(api().catatIuranSusulan(pesertaId, tanggal, jumlah, pertemuan), { sesudah: naikkanIuran });
    if (r.ok) notify(`Iuran susulan untuk ${r.data} pertemuan dicatat.`);
    return r;
  };

  const aturAsisten = (pesertaId, aktif) =>
    penunjukAsisten
      ? aksi(api().aturAsisten(pesertaId, aktif), { sukses: aktif ? 'Asisten bendahara ditunjuk.' : 'Penunjukan asisten dicabut.', sesudah: () => segarkan.asisten() })
      : Promise.resolve(ditolak(notify, 'Hanya Dewan Ambalan atau Pembina yang dapat menunjuk asisten bendahara.'));

  /** Pengaturan iuran (standar, ambang rutin, batas nilai): hanya Pembina dan Admin. */
  const simpanPengaturanIuran = (nilai) =>
    user?.role === 'admin' || (user?.role === 'penguji' && user?.jabatan === 'Pembina')
      ? aksi(api().simpanPengaturanIuran(nilai), { sukses: 'Pengaturan iuran tersimpan.', sesudah: () => Promise.all([segarkan.pengaturanIuran(), Promise.resolve(naikkanIuran())]) })
      : Promise.resolve(ditolak(notify, 'Hanya Pembina dan Admin Gudep yang dapat mengubah pengaturan iuran.'));

  /* ------------------------ Pencalonan Penegak Garuda ------------------------ */
  const daftarCalonGaruda = () =>
    aksi(api().daftarCalonGaruda(), {
      sukses: 'Anda terdaftar sebagai Penegak Calon Garuda. Mulai siapkan portofolio.',
      sesudah: () => segarkan.users(),
    });

  /* ------------------------- Jurnal portofolio Garuda ------------------------- */
  const ubahPortofolio = (itemId, patch) => aksi(api().ubahPortofolio(itemId, patch), { sesudah: () => segarkan.portofolio(user.id) });

  const catatPortofolioPenguji = (pesertaId, itemId, catatan) =>
    aksi(api().catatPortofolioPenguji(pesertaId, itemId, catatan), { sukses: 'Catatan tersimpan.', sesudah: () => segarkan.portofolio(pesertaId) });

  /* ------------------------------ Absensi Jumat ------------------------------ */
  const bolehKelolaAbsen = user?.role === 'penguji' || user?.role === 'admin';
  const ubahHadir = (tanggal, fn) =>
    setDb((d) => ({ ...d, absensi: { ...d.absensi, hadir: { ...d.absensi.hadir, [tanggal]: fn({ ...(d.absensi.hadir[tanggal] ?? {}) }) } } }));

  const buatSesiAbsen = async (tanggal) => {
    if (!bolehKelolaAbsen) return ditolak(notify, 'Hanya Dewan Ambalan, Pembina, atau admin yang dapat mencatat absensi.');
    if (!tanggalValid(tanggal)) return ditolak(notify, 'Tanggal tidak valid.');
    if (!adalahJumat(tanggal)) return ditolak(notify, 'Latihan rutin hanya dicatat pada hari Jumat.');
    if (tanggal > hariIni()) return ditolak(notify, 'Sesi belum bisa dibuat untuk tanggal yang belum tiba.');
    if (db.absensi.sesi[tanggal]) return { ok: true };
    return aksi(api().buatSesiAbsen(tanggal), {
      sukses: 'Sesi absensi dibuat.',
      sesudah: () =>
        setDb((d) => ({
          ...d,
          absensi: {
            sesi: { ...d.absensi.sesi, [tanggal]: { tanggal, dibuatOleh: user.id, dibuatPada: new Date().toISOString() } },
            hadir: { ...d.absensi.hadir, [tanggal]: d.absensi.hadir[tanggal] ?? {} },
          },
        })),
    });
  };

  const setStatusAbsen = (tanggal, pesertaId, status) => {
    if (!bolehKelolaAbsen) return Promise.resolve(ditolak(notify, 'Tidak diizinkan.'));
    if (status && !KODE_STATUS.includes(status)) return Promise.resolve(ditolak(notify, 'Status absensi tidak dikenal.'));
    return aksi(api().setStatusAbsen(tanggal, pesertaId, status), {
      sesudah: () =>
        ubahHadir(tanggal, (h) => {
          if (status) h[pesertaId] = { status, waktu: new Date().toISOString(), oleh: user.id };
          else delete h[pesertaId];
          return h;
        }),
    });
  };

  /** Tandai banyak peserta sekaligus. `hanyaKosong` = jangan timpa yang sudah tercatat. */
  const tandaiBanyakAbsen = (tanggal, pesertaIds, status, hanyaKosong = true) => {
    if (!bolehKelolaAbsen) return Promise.resolve(ditolak(notify, 'Tidak diizinkan.'));
    return aksi(api().tandaiBanyakAbsen(tanggal, pesertaIds, status, hanyaKosong), { sesudah: () => segarkan.hadir(tanggal) });
  };

  const hapusSesiAbsen = (tanggal) => {
    if (!bolehKelolaAbsen) return Promise.resolve(ditolak(notify, 'Tidak diizinkan.'));
    return aksi(api().hapusSesiAbsen(tanggal), {
      sukses: 'Sesi absensi dihapus.',
      sesudah: () =>
        setDb((d) => {
          const { [tanggal]: _s, ...sisaSesi } = d.absensi.sesi;
          const { [tanggal]: _h, ...sisaHadir } = d.absensi.hadir;
          return { ...d, absensi: { sesi: sisaSesi, hadir: sisaHadir } };
        }),
    });
  };

  /* --------------- Sidang Dewan Kehormatan dan pengaturannya --------------- */
  const bolehSidang = user?.role === 'penguji' || user?.role === 'admin';
  const bolehHapusSidang = user?.role === 'admin' || (user?.role === 'penguji' && user?.jabatan === 'Pembina');
  const MSG_SIDANG = 'Hanya Dewan Ambalan, Pembina, atau Admin Gudep yang dapat mengelola sidang.';

  /** Memuat catatan sidang dan pengaturan (dipanggil halaman Sidang saat dibuka). */
  const muatSidang = useCallback(async () => {
    const a = api();
    const [s, p, u] = await Promise.all([a.muatSidang(), a.muatPengaturan(), a.muatSidangUrut()]);
    const gagal = [s, p, u].find((r) => !r.ok);
    if (gagal) {
      if (gagal.sesiBerakhir) await sesiBerakhir();
      return gagal;
    }
    setDb((d) => ({ ...d, sidang: s.data, pengaturan: p.data, sidangUrut: u.data }));
    return { ok: true };
  }, [sesiBerakhir]);

  /** Catat keputusan sidang. Mengembalikan { ok, data: id catatan baru }. NTA yang diisi ikut tersimpan ke profil. */
  const simpanSidang = (data) => {
    if (!bolehSidang) return Promise.resolve(ditolak(notify, MSG_SIDANG));
    return aksi(api().simpanSidang(data), {
      sukses: 'Keputusan sidang tersimpan.',
      sesudah: () => Promise.all([segarkan.sidang(), segarkan.users()]),
    });
  };

  const hapusSidang = (id) =>
    bolehHapusSidang
      ? aksi(api().hapusSidang(id), { sukses: 'Catatan sidang dihapus.', sesudah: () => segarkan.sidang() })
      : Promise.resolve(ditolak(notify, 'Hanya Pembina dan Admin Gudep yang dapat menghapus catatan sidang.'));

  const simpanPengaturan = (kunci, nilai) => {
    if (!bolehSidang) return Promise.resolve(ditolak(notify, MSG_SIDANG));
    return aksi(api().simpanPengaturan(kunci, nilai), { sesudah: () => segarkan.pengaturan() });
  };

  /** Atur nomor urut berikutnya untuk satu tahun (melanjutkan nomor yang sudah berjalan). */
  const aturUrutSidang = (tahun, berikutnya) => {
    if (!bolehSidang) return Promise.resolve(ditolak(notify, MSG_SIDANG));
    return aksi(api().aturUrutSidang(tahun, berikutnya), { sukses: `Nomor urut berikutnya untuk tahun ${tahun} diatur menjadi ${berikutnya}.`, sesudah: () => segarkan.sidang() });
  };

  /* --------------- Nilai raport ekstrakurikuler (Pembina dan Admin) --------------- */
  const bolehRaport = bolehHapusSidang; // aturan sama: Pembina dan Admin Gudep
  const MSG_RAPORT = 'Hanya Pembina dan Admin Gudep yang dapat mengelola nilai raport.';

  /** Memuat nilai raport satu semester dan pengaturan (dipanggil halaman Raport saat dibuka atau saat semester diganti). */
  const muatRaport = useCallback(async (tahunAjaran, semester) => {
    const a = api();
    const [r, p] = await Promise.all([a.muatRaport(tahunAjaran, semester), a.muatPengaturan()]);
    const gagal = [r, p].find((x) => !x.ok);
    if (gagal) {
      if (gagal.sesiBerakhir) await sesiBerakhir();
      return gagal;
    }
    setDb((d) => ({ ...d, pengaturan: p.data, raport: { ...d.raport, [kunciSemester(tahunAjaran, semester)]: r.data } }));
    return { ok: true };
  }, [sesiBerakhir]);

  const simpanRaport = (data) => {
    if (!bolehRaport) return Promise.resolve(ditolak(notify, MSG_RAPORT));
    return aksi(api().simpanRaport(data), {
      sukses: data.final ? 'Nilai raport ditandai final.' : 'Nilai raport tersimpan sebagai draf.',
      sesudah: () => segarkan.raport(data.tahunAjaran, data.semester),
    });
  };

  const hapusRaport = (pesertaId, tahunAjaran, semester) =>
    bolehRaport
      ? aksi(api().hapusRaport(pesertaId, tahunAjaran, semester), { sukses: 'Nilai raport dihapus.', sesudah: () => segarkan.raport(tahunAjaran, semester) })
      : Promise.resolve(ditolak(notify, MSG_RAPORT));

  const simpanPengaturanRaport = (nilai) =>
    bolehRaport
      ? aksi(api().simpanPengaturanRaport(nilai), { sukses: 'Pengaturan raport tersimpan.', sesudah: () => segarkan.pengaturan() })
      : Promise.resolve(ditolak(notify, MSG_RAPORT));

  /* ------------------------- Manajemen anggota (admin) ------------------------- */
  /**
   * Tambah (tanpa id) atau ubah (dengan id) satu anggota. Anggota baru mengembalikan `akun` = { username, pin, nama }
   * yang harus ditampilkan sekali kepada admin. Kelas/sangga disamakan penulisannya oleh server.
   */
  const simpanAnggota = async ({ peran: _turunan, ...data }) => {
    if (user?.role !== 'admin') return { ok: false, pesan: 'Hanya Admin Gudep yang dapat mengelola anggota.' };
    const nama = data.nama?.trim();
    if (!nama) return { ok: false, pesan: 'Nama wajib diisi.' };
    // NTA diperiksa sebelum apa pun disimpan, agar data lain tidak tersimpan sebagian
    const ntaCek = String(data.nta ?? '').trim();
    if (data.role === 'peserta' && ntaCek && !POLA_NTA.test(ntaCek)) {
      return { ok: false, pesan: 'NTA tidak valid: maksimal 40 karakter (huruf, angka, titik, garis miring, strip, spasi).' };
    }

    if (!data.id) {
      const r = await api().buatAkun(KELOMPOK_DARI_DATA(data), [{
        no: 1, nama, nis: data.nis, kelas: data.kelas, sangga: data.sangga, agama: data.agama, username: data.username, pin: data.pin,
      }]);
      if (!r.ok) return { ok: false, pesan: r.pesan };
      const baris = r.hasil?.[0];
      if (!baris?.ok) return { ok: false, pesan: baris?.pesan ?? 'Akun belum dapat dibuat.' };
      // NTA diisi sesudah akun ada (fungsi terpisah, khusus Admin). Bila gagal, akun tetap dibuat dan Admin diberi tahu.
      const nta = data.role === 'peserta' ? String(data.nta ?? '').trim() : '';
      let peringatan = '';
      if (nta) {
        const n = await api().aturNta([{ username: baris.username, nta }]);
        if (!n.ok) peringatan = `NTA belum tersimpan: ${n.pesan}`;
      }
      await segarkan.users();
      notify(peringatan ? `Anggota baru ditambahkan, tetapi ${peringatan}` : 'Anggota baru ditambahkan. PIN awal wajib diganti saat login pertama.', peringatan ? 'err' : 'ok');
      return { ok: true, akun: { nama: baris.nama, username: baris.username, pin: baris.pin }, peringatan };
    }

    const lama = db.users.find((u) => u.id === data.id);
    const usernameBaru = String(data.username ?? '').trim().toLowerCase();
    if (lama && usernameBaru && usernameBaru !== lama.username) {
      const u = await api().ubahUsername(data.id, usernameBaru);
      if (!u.ok) return { ok: false, pesan: u.pesan };
    }
    const r = await api().ubahAnggota({ ...data, nama });
    if (!r.ok) {
      if (r.sesiBerakhir) await sesiBerakhir();
      return { ok: false, pesan: r.pesan };
    }
    // NTA hanya dikirim bila berubah (server lama tanpa migrasi NTA tetap dapat mengubah data lain)
    const ntaBaru = String(data.nta ?? '').trim();
    if (lama?.role === 'peserta' && data.nta !== undefined && ntaBaru !== (lama.nta ?? '')) {
      const n = await api().aturNta([{ username: usernameBaru || lama.username, nta: ntaBaru }]);
      if (!n.ok) {
        await segarkan.users();
        if (n.sesiBerakhir) await sesiBerakhir();
        return { ok: false, pesan: `Data anggota tersimpan, tetapi NTA belum: ${n.pesan}` };
      }
    }
    await segarkan.users();
    notify('Data anggota diperbarui.');
    return { ok: true };
  };

  /**
   * Impor banyak anggota dari Excel. `baris` = hasil bacaExcelAnggota, `kelompok` = 'peserta' | 'dewan' | 'pembina'.
   * Baris yang tidak lolos pemeriksaan dilewati. Dikirim per rombongan. Mengembalikan daftar akun baru beserta
   * PIN awalnya (hanya tersedia saat ini) dan daftar baris yang ditolak server.
   */
  const imporAnggota = async (baris, kelompok = 'peserta', kemajuan = null) => {
    if (user?.role !== 'admin') return ditolak(notify, 'Hanya Admin Gudep yang dapat mengimpor anggota.');
    const siap = periksaBaris(baris, db.users, kelompok).filter((r) => r.siap);
    if (!siap.length) return ditolak(notify, 'Tidak ada baris yang dapat diimpor.');

    const kirim = siap.map(({ no, data }) => ({
      no, nama: data.nama, nis: data.nis, kelas: data.kelas, sangga: data.sangga, agama: data.agama, username: data.username, pin: data.pin,
    }));
    const daftar = [];
    const ditolakServer = [];
    let galatBerhenti = null;
    for (let i = 0; i < kirim.length; i += UKURAN_ROMBONGAN) {
      const r = await api().buatAkun(kelompok, kirim.slice(i, i + UKURAN_ROMBONGAN));
      if (!r.ok) { galatBerhenti = r.pesan; break; }
      for (const h of r.hasil) (h.ok ? daftar : ditolakServer).push(h);
      kemajuan?.(Math.min(i + UKURAN_ROMBONGAN, kirim.length), kirim.length);
    }
    // NTA (opsional, hanya Penegak) diisi sesudah akun dibuat. Bila gagal, akun tetap ada dan Admin diberi tahu.
    let peringatanNta = '';
    if (kelompok === 'peserta' && daftar.length) {
      const ntaPerBaris = new Map(siap.map(({ no, data }) => [no, String(data.nta ?? '').trim()]));
      const daftarNta = daftar.map((h) => ({ username: h.username, nta: ntaPerBaris.get(h.no) ?? '' })).filter((x) => x.nta);
      if (daftarNta.length) {
        const n = await api().aturNta(daftarNta);
        if (!n.ok) peringatanNta = `NTA ${daftarNta.length} anggota belum tersimpan: ${n.pesan}`;
      }
    }
    if (daftar.length) await segarkan.users();
    if (!daftar.length) return ditolak(notify, galatBerhenti ?? ditolakServer[0]?.pesan ?? 'Tidak ada akun yang berhasil dibuat.');
    notify(`${daftar.length} anggota berhasil diimpor.`);
    return { ok: true, daftar, ditolakServer, galatBerhenti, peringatanNta };
  };

  const hapusAnggota = async (id) => {
    if (id === user?.id) return ditolak(notify, 'Anda tidak bisa menghapus akun yang sedang dipakai.');
    return aksi(api().hapusAkun(id), {
      sukses: 'Anggota dihapus beserta seluruh datanya.',
      sesudah: () =>
        setDb((d) => {
          const { [id]: _p, ...progress } = d.progress;
          const { [id]: _f, ...portofolio } = d.portofolio;
          const hadir = Object.fromEntries(Object.entries(d.absensi.hadir).map(([t, peta]) => {
            const { [id]: _a, ...sisa } = peta;
            return [t, sisa];
          }));
          return {
            ...d, users: d.users.filter((u) => u.id !== id), progress, portofolio, absensi: { ...d.absensi, hadir },
            sidang: d.sidang.filter((s) => s.pesertaId !== id),
          };
        }),
    });
  };

  /* ---------------------- Materi SKU (Pembina dan Admin Gudep) ---------------------- */
  const izinMateri = bolehKelolaMateri(user);
  const MSG_MATERI = 'Hanya Pembina dan Admin Gudep yang dapat mengelola materi.';

  /** Tambah (tanpa id) atau ubah (dengan id) satu materi. Galat validasi dikembalikan untuk formulir. */
  const simpanMateri = async (data) => {
    if (!izinMateri) return ditolak(notify, MSG_MATERI);
    if (data.id && !db.materi.some((m) => m.id === data.id)) return { ok: false, pesan: 'Materi tidak ditemukan. Mungkin sudah dihapus.' };
    const v = validasiMateri(data, db.materi);
    if (!v.ok) return { ok: false, pesan: v.pesan };
    const r = await api().simpanMateri({ id: data.id, ...v.materi });
    if (!r.ok) {
      if (r.sesiBerakhir) await sesiBerakhir();
      return { ok: false, pesan: r.pesan };
    }
    await segarkan.materi();
    notify(data.id ? 'Materi diperbarui.' : 'Materi ditambahkan. Materi langsung tampil di menu Materi semua pengguna.');
    return { ok: true, id: r.data };
  };

  const hapusMateri = (id) =>
    izinMateri
      ? aksi(api().hapusMateri(id), { sukses: 'Materi dihapus (file di Google Drive tidak terpengaruh).', sesudah: () => segarkan.materi() })
      : Promise.resolve(ditolak(notify, MSG_MATERI));

  const geserUrutanMateri = (id, arah) =>
    izinMateri ? aksi(api().geserMateri(id, arah), { sesudah: () => segarkan.materi() }) : Promise.resolve(ditolak(notify, MSG_MATERI));

  const value = {
    status, galatMuat, lokal: LOKAL ? { aktif: true, reset: () => lokalRef.current?.reset() } : { aktif: false },
    db, user, users: db.users, progress: db.progress, absensi: db.absensi, portofolio: db.portofolio,
    materi: db.materi, bolehKelolaMateri: izinMateri, simpanMateri, hapusMateri, geserUrutanMateri,
    sidang: db.sidang, sidangUrut: db.sidangUrut, pengaturan: db.pengaturan, bolehSidang, bolehHapusSidang, muatSidang, simpanSidang, hapusSidang,
    simpanPengaturan, aturUrutSidang,
    raport: db.raport, bolehRaport, muatRaport, simpanRaport, hapusRaport, simpanPengaturanRaport,
    instrumen: db.instrumen, instrumenGalat: db.instrumenGalat, instrumenSiap, bolehKelolaInstrumen, pastikanInstrumen, simpanInstrumen, statusInstrumen, simpanPengaturanInstrumen,
    sesiUjian: db.sesiUjian, sesiUjianGalat: db.sesiUjianGalat, sesiUjianSiap, pastikanSesiUjian, simpanSesiUjian, ubahStatusSesiUjian, hapusSesiUjian, bolehHapusSesi,
    muatUlangProgress, tokenSuratTingkat, muatPenilaian,
    asisten: db.asisten, pengaturanIuran: db.pengaturanIuran, simpanPengaturanIuran, dewanAmbalan, asistenSaya, pencatatIuran, penunjukAsisten, versiIuran, bacaIuran, catatIuranSusulan, aturIuran, aturIuranBanyak, simpanKas, aturAsisten,
    daftarPeserta, peranUser, bolehKelolaAbsen,
    login, logout,
    ajukan, batalkanAjuan, catatHasil,
    daftarCalonGaruda, ubahPortofolio, catatPortofolioPenguji,
    buatSesiAbsen, setStatusAbsen, tandaiBanyakAbsen, hapusSesiAbsen, semesterSiap, pastikanAbsensi,
    gantiPin, resetPin,
    simpanAnggota, imporAnggota, hapusAnggota,
    muatUlang: muatSemua,
    notify, toast,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
