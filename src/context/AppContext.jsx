import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ambilKlien, GALAT_KONFIGURASI, LOKAL } from '../lib/supabaseClient';
import { buatApi } from '../lib/api';
import { pesertaDenganPeran } from '../lib/skuLogic';
import { adalahJumat, tanggalValid, KODE_STATUS } from '../lib/absensiLogic';
import { bolehResetPin, validasiPinBaru } from '../lib/pinLogic';
import { periksaBaris } from '../lib/importAnggota';
import { bolehKelolaMateri, validasiMateri } from '../lib/materiLogic';
import { hariIni } from '../lib/format';

/**
 * STATE APLIKASI
 *
 * Sumber kebenaran ada di server (Supabase). Di sini hanya salinan (cache) sesuai izin pengguna yang masuk,
 * dalam bentuk data yang sama dengan yang dipakai seluruh halaman:
 *   db = { users, progress, absensi, portofolio, materi }   (lihat src/lib/mapDb.js)
 * Setiap aksi memanggil server lebih dulu, lalu menyegarkan bagian data yang terpengaruh.
 * Aksi mengembalikan { ok, pesan, ... } dan tidak pernah melempar galat ke halaman.
 */
const Ctx = createContext(null);

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp harus dipakai di dalam <AppProvider>');
  return ctx;
}

const DB_KOSONG = { users: [], progress: {}, absensi: { sesi: {}, hadir: {} }, portofolio: {}, materi: [] };
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
  const [toast, setToast] = useState(null);
  const apiRef = useRef(null);
  const lokalRef = useRef(null);
  const terakhirMuat = useRef(0);

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

  const sesiBerakhir = useCallback(async () => {
    await api()?.keluar();
    setSesiId(null);
    setDb(DB_KOSONG);
    notify('Sesi berakhir. Masuk kembali.', 'err');
  }, [notify]);

  /** Memuat seluruh data yang boleh dibaca pengguna ini. */
  const muatSemua = useCallback(async () => {
    const a = api();
    const [u, p, ab, pf, m] = await Promise.all([a.muatProfil(), a.muatProgress(), a.muatAbsensi(), a.muatPortofolio(), a.muatMateri()]);
    const gagal = [u, p, ab, pf, m].find((r) => !r.ok);
    if (gagal) return gagal;
    setDb({ users: u.data, progress: p.data, absensi: ab.data, portofolio: pf.data, materi: m.data });
    terakhirMuat.current = Date.now();
    return { ok: true };
  }, []);

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
    setDb(DB_KOSONG);
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

  /** Hanya penguji. PIN penguji diverifikasi di server (verifikasi digital). */
  const catatHasil = ({ pin, pesertaId, ...data }) => {
    if (user?.role !== 'penguji') return Promise.resolve(ditolak(notify, 'Hanya Pembina atau Dewan Ambalan yang dapat mencatat hasil.'));
    const pesanBerhasil = {
      lulus: 'Poin dinyatakan lulus dan terverifikasi.',
      ulang: 'Poin ditandai perlu diulang.',
      proses: 'Pengujian ditandai sedang berjalan.',
      reset: 'Status poin dikembalikan.',
    }[data.hasil];
    return aksi(api().catatHasil({ pin, pesertaId, ...data }), { sukses: pesanBerhasil, sesudah: () => segarkan.progress(pesertaId) });
  };

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

  /* ------------------------- Manajemen anggota (admin) ------------------------- */
  /**
   * Tambah (tanpa id) atau ubah (dengan id) satu anggota. Anggota baru mengembalikan `akun` = { username, pin, nama }
   * yang harus ditampilkan sekali kepada admin. Kelas/sangga disamakan penulisannya oleh server.
   */
  const simpanAnggota = async ({ peran: _turunan, ...data }) => {
    if (user?.role !== 'admin') return { ok: false, pesan: 'Hanya Admin Gudep yang dapat mengelola anggota.' };
    const nama = data.nama?.trim();
    if (!nama) return { ok: false, pesan: 'Nama wajib diisi.' };

    if (!data.id) {
      const r = await api().buatAkun(KELOMPOK_DARI_DATA(data), [{
        no: 1, nama, nis: data.nis, kelas: data.kelas, sangga: data.sangga, agama: data.agama, username: data.username, pin: data.pin,
      }]);
      if (!r.ok) return { ok: false, pesan: r.pesan };
      const baris = r.hasil?.[0];
      if (!baris?.ok) return { ok: false, pesan: baris?.pesan ?? 'Akun belum dapat dibuat.' };
      await segarkan.users();
      notify('Anggota baru ditambahkan. PIN awal wajib diganti saat login pertama.');
      return { ok: true, akun: { nama: baris.nama, username: baris.username, pin: baris.pin } };
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
    if (daftar.length) await segarkan.users();
    if (!daftar.length) return ditolak(notify, galatBerhenti ?? ditolakServer[0]?.pesan ?? 'Tidak ada akun yang berhasil dibuat.');
    notify(`${daftar.length} anggota berhasil diimpor.`);
    return { ok: true, daftar, ditolakServer, galatBerhenti };
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
          return { ...d, users: d.users.filter((u) => u.id !== id), progress, portofolio, absensi: { ...d.absensi, hadir } };
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
    daftarPeserta, peranUser, bolehKelolaAbsen,
    login, logout,
    ajukan, batalkanAjuan, catatHasil,
    daftarCalonGaruda, ubahPortofolio, catatPortofolioPenguji,
    buatSesiAbsen, setStatusAbsen, tandaiBanyakAbsen, hapusSesiAbsen,
    gantiPin, resetPin,
    simpanAnggota, imporAnggota, hapusAnggota,
    muatUlang: muatSemua,
    notify, toast,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
