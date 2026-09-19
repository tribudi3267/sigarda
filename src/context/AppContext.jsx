import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { storage } from '../lib/storage';
import { buatSeed } from '../data/seed';
import {
  ajukanPengujian, batalkanPengajuan, catatHasilUji, layakGaruda, pesertaDenganPeran,
} from '../lib/skuLogic';
import { adalahJumat, tanggalValid, KODE_STATUS } from '../lib/absensiLogic';
import { catatPengujiPortofolio, ubahItemPortofolio } from '../lib/portofolioLogic';
import {
  bolehResetPin, buatPinAcak, catatGagal, formatPinSah, statusKunci, validasiPinBaru, MAKS_GAGAL,
} from '../lib/pinLogic';
import { KELOMPOK_IMPOR, kelompokDari, periksaBaris } from '../lib/importAnggota';
import { bolehKelolaMateri, geserMateri, validasiMateri } from '../lib/materiLogic';
import { buatId, hariIni } from '../lib/format';

const Ctx = createContext(null);

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp harus dipakai di dalam <AppProvider>');
  return ctx;
}

// Data lama tanpa absensi/portofolio dianggap tidak valid, mulai dari data contoh.
// Akun yang dibuat sebelum fitur PIN dianggap masih memakai PIN awal dari admin, sehingga
// wajib menggantinya saat login berikutnya (wajibGantiPin bernilai true bila belum tercatat).
const muatDb = () => {
  const d = storage.load();
  if (!(d?.users && d?.progress && d?.absensi && d?.portofolio)) return buatSeed();
  return {
    ...d,
    users: d.users.map((u) => ({ ...u, wajibGantiPin: u.wajibGantiPin ?? true })),
    materi: Array.isArray(d.materi) ? d.materi : [], // data lama belum punya materi
  };
};

const ditolak = (notify, pesan) => {
  notify(pesan, 'err');
  return { ok: false, pesan };
};

/** Samakan penulisan dengan data yang sudah ada (abaikan huruf besar/kecil dan spasi ganda). */
const kanon = (nilai, daftar) => {
  const bersih = (nilai ?? '').trim().replace(/\s+/g, ' ');
  return daftar.find((x) => x.toLowerCase() === bersih.toLowerCase()) ?? bersih;
};

export function AppProvider({ children }) {
  const [db, setDb] = useState(muatDb);
  const [sesiId, setSesiId] = useState(() => storage.loadSession());
  const [toast, setToast] = useState(null);
  const [kunci, setKunci] = useState(() => storage.loadKunci() ?? {}); // percobaan login salah per akun

  useEffect(() => {
    storage.save(db);
  }, [db]);
  useEffect(() => {
    storage.saveKunci(kunci);
  }, [kunci]);
  useEffect(() => {
    storage.saveSession(sesiId);
  }, [sesiId]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3400);
    return () => clearTimeout(t);
  }, [toast]);

  const user = useMemo(() => db.users.find((u) => u.id === sesiId) ?? null, [db.users, sesiId]);
  const notify = useCallback((pesan, tipe = 'ok') => setToast({ pesan, tipe, id: Date.now() }), []);

  // Semua peserta beserta peran turunannya (calon-bantara, calon-laksana, calon-garuda)
  const daftarPeserta = useMemo(() => pesertaDenganPeran(db.progress, db.users), [db.progress, db.users]);
  const peranUser = useMemo(
    () => (user?.role === 'peserta' ? daftarPeserta.find((p) => p.id === user.id)?.peran ?? null : null),
    [daftarPeserta, user]
  );

  /* ---------- Autentikasi (prototipe: PIN teks biasa) ---------- */
  const lepasKunci = (userId) =>
    setKunci((k) => {
      const { [userId]: _hapus, ...sisa } = k;
      return sisa;
    });

  const login = (userId, pin) => {
    const u = db.users.find((x) => x.id === userId);
    if (!u) return { ok: false, pesan: 'Pilih nama Anda terlebih dulu.' };
    const k = statusKunci(kunci[userId]);
    if (k.terkunci) {
      return { ok: false, pesan: `Terlalu banyak percobaan salah. Coba lagi ${k.sisaMenit} menit lagi, atau minta reset PIN.` };
    }
    if (u.pin !== pin) {
      const baru = catatGagal(kunci[userId]);
      setKunci((s) => ({ ...s, [userId]: { n: baru.n, sampai: baru.sampai } }));
      return {
        ok: false,
        pesan: baru.sisa > 0
          ? `PIN tidak sesuai. Sisa ${baru.sisa} percobaan sebelum akun dikunci sementara.`
          : `PIN salah ${MAKS_GAGAL} kali. Akun dikunci sementara, coba lagi beberapa menit lagi atau minta reset PIN.`,
      };
    }
    lepasKunci(userId);
    setSesiId(u.id);
    return { ok: true };
  };
  const logout = () => setSesiId(null);
  const cekPin = (userId, pin) => db.users.find((u) => u.id === userId)?.pin === pin;

  /* ---------- Kelola PIN ---------- */
  /**
   * Ganti PIN milik pengguna yang sedang masuk (dipakai untuk penggantian wajib dan sukarela).
   * Galat dikembalikan untuk ditampilkan pada formulir, bukan sebagai toast.
   */
  const gantiPin = ({ pinLama, pinBaru, ulangi }) => {
    if (!user) return { ok: false, pesan: 'Sesi berakhir. Masuk kembali.' };
    if (user.pin !== pinLama) return { ok: false, pesan: 'PIN lama tidak sesuai.' };
    const galat = validasiPinBaru(pinBaru, pinLama, ulangi);
    if (galat) return { ok: false, pesan: galat };
    setDb((d) => ({
      ...d,
      users: d.users.map((u) =>
        u.id === user.id ? { ...u, pin: pinBaru, wajibGantiPin: false, pinDiubah: new Date().toISOString() } : u
      ),
    }));
    notify('PIN berhasil diganti. Gunakan PIN baru pada login berikutnya.');
    return { ok: true };
  };

  /**
   * Reset PIN oleh pengurus. Menghasilkan PIN acak baru (angka saja) yang dikembalikan sekali
   * kepada pengreset untuk disampaikan; pemilik akun wajib menggantinya saat login pertama.
   */
  const resetPin = (targetId) => {
    const target = db.users.find((u) => u.id === targetId);
    if (!target) return ditolak(notify, 'Anggota tidak ditemukan.');
    if (!bolehResetPin(user, target)) return ditolak(notify, 'Anda tidak berwenang mereset PIN anggota ini.');
    const pinBaru = buatPinAcak();
    setDb((d) => ({
      ...d,
      users: d.users.map((u) =>
        u.id === targetId ? { ...u, pin: pinBaru, wajibGantiPin: true, pinDireset: { oleh: user.id, waktu: new Date().toISOString() } } : u
      ),
    }));
    lepasKunci(targetId);
    return { ok: true, pin: pinBaru, nama: target.nama };
  };

  /* ---------- Aksi progres SKU ---------- */
  const ubahProgress = (fn, pesanSukses) => {
    try {
      setDb({ ...db, progress: fn(db.progress) });
      if (pesanSukses) notify(pesanSukses);
      return { ok: true };
    } catch (e) {
      notify(e.message, 'err');
      return { ok: false, pesan: e.message };
    }
  };

  const ajukan = (data) =>
    ubahProgress((p) => ajukanPengujian(p, { ...data, peserta: user }), 'Pengajuan terkirim ke penguji.');

  const batalkanAjuan = (skuId) =>
    ubahProgress((p) => batalkanPengajuan(p, { pesertaId: user.id, skuId }), 'Pengajuan dibatalkan.');

  /** Hanya penguji (Pembina atau Dewan Ambalan). Wajib memasukkan PIN sebagai verifikasi digital. */
  const catatHasil = ({ pin, pesertaId, ...data }) => {
    if (user?.role !== 'penguji') return ditolak(notify, 'Hanya Pembina atau Dewan Ambalan yang dapat mencatat hasil.');
    if (!cekPin(user.id, pin)) return ditolak(notify, 'PIN verifikasi salah. Hasil belum disimpan.');
    const peserta = db.users.find((u) => u.id === pesertaId);
    if (!peserta) return ditolak(notify, 'Peserta tidak ditemukan.');
    const pesanBerhasil = {
      lulus: 'Poin dinyatakan lulus dan terverifikasi.',
      ulang: 'Poin ditandai perlu diulang.',
      proses: 'Pengujian ditandai sedang berjalan.',
      reset: 'Status poin dikembalikan.',
    }[data.hasil];
    return ubahProgress((p) => catatHasilUji(p, { ...data, peserta, pengujiId: user.id }), pesanBerhasil);
  };

  /* ---------- Pencalonan Penegak Garuda ---------- */
  const daftarCalonGaruda = () => {
    if (user?.role !== 'peserta') return ditolak(notify, 'Hanya peserta yang dapat mencalonkan diri.');
    if (!layakGaruda(db.progress, user))
      return ditolak(notify, 'Seluruh butir SKU Bantara dan Laksana harus lulus lebih dulu.');
    setDb({ ...db, users: db.users.map((u) => (u.id === user.id ? { ...u, calonGaruda: hariIni() } : u)) });
    notify('Anda terdaftar sebagai Penegak Calon Garuda. Mulai siapkan portofolio.');
    return { ok: true };
  };

  /* ---------- Jurnal portofolio Garuda ---------- */
  const ubahPortofolio = (itemId, patch) => {
    if (peranUser !== 'calon-garuda') return ditolak(notify, 'Jurnal portofolio khusus Penegak Calon Garuda.');
    const ubah = (portofolio) => ubahItemPortofolio(portofolio, { pesertaId: user.id, itemId, patch, oleh: user.id });
    try {
      ubah(db.portofolio); // uji dulu: kesalahan dilaporkan di sini, bukan saat pembaruan state
    } catch (e) {
      return ditolak(notify, e.message);
    }
    setDb((d) => ({ ...d, portofolio: ubah(d.portofolio) }));
    return { ok: true };
  };

  const catatPortofolioPenguji = (pesertaId, itemId, catatan) => {
    if (user?.role !== 'penguji') return ditolak(notify, 'Hanya Pembina atau Dewan Ambalan yang dapat memberi catatan.');
    setDb((d) => ({
      ...d,
      portofolio: catatPengujiPortofolio(d.portofolio, { pesertaId, itemId, catatan, oleh: user.id }),
    }));
    notify('Catatan tersimpan.');
    return { ok: true };
  };

  /* ---------- Absensi latihan Jumat ---------- */
  const bolehKelolaAbsen = user?.role === 'penguji' || user?.role === 'admin';

  const ubahAbsensi = (fn) => setDb((d) => ({ ...d, absensi: fn(d.absensi) }));

  const buatSesiAbsen = (tanggal) => {
    if (!bolehKelolaAbsen) return ditolak(notify, 'Hanya Dewan Ambalan, Pembina, atau admin yang dapat mencatat absensi.');
    if (!tanggalValid(tanggal)) return ditolak(notify, 'Tanggal tidak valid.');
    if (!adalahJumat(tanggal)) return ditolak(notify, 'Latihan rutin hanya dicatat pada hari Jumat.');
    if (tanggal > hariIni()) return ditolak(notify, 'Sesi belum bisa dibuat untuk tanggal yang belum tiba.');
    if (db.absensi.sesi[tanggal]) return { ok: true };
    ubahAbsensi((a) => ({
      ...a,
      sesi: { ...a.sesi, [tanggal]: { tanggal, dibuatOleh: user.id, dibuatPada: new Date().toISOString() } },
      hadir: { ...a.hadir, [tanggal]: a.hadir[tanggal] ?? {} },
    }));
    notify('Sesi absensi dibuat.');
    return { ok: true };
  };
  const setStatusAbsen = (tanggal, pesertaId, status) => {
    if (!bolehKelolaAbsen) return ditolak(notify, 'Tidak diizinkan.');
    if (status && !KODE_STATUS.includes(status)) return ditolak(notify, 'Status absensi tidak dikenal.');
    ubahAbsensi((a) => {
      const hariItu = { ...(a.hadir[tanggal] ?? {}) };
      if (status) hariItu[pesertaId] = { status, waktu: new Date().toISOString(), oleh: user.id };
      else delete hariItu[pesertaId];
      return { ...a, hadir: { ...a.hadir, [tanggal]: hariItu } };
    });
    return { ok: true };
  };

  /** Tandai banyak peserta sekaligus. `hanyaKosong` = jangan timpa yang sudah tercatat. */
  const tandaiBanyakAbsen = (tanggal, pesertaIds, status, hanyaKosong = true) => {
    if (!bolehKelolaAbsen) return ditolak(notify, 'Tidak diizinkan.');
    ubahAbsensi((a) => {
      const hariItu = { ...(a.hadir[tanggal] ?? {}) };
      for (const id of pesertaIds) {
        if (hanyaKosong && hariItu[id]) continue;
        hariItu[id] = { status, waktu: new Date().toISOString(), oleh: user.id };
      }
      return { ...a, hadir: { ...a.hadir, [tanggal]: hariItu } };
    });
    return { ok: true };
  };

  const hapusSesiAbsen = (tanggal) => {
    if (!bolehKelolaAbsen) return ditolak(notify, 'Tidak diizinkan.');
    ubahAbsensi((a) => {
      const { [tanggal]: _s, ...sisaSesi } = a.sesi;
      const { [tanggal]: _h, ...sisaHadir } = a.hadir;
      return { sesi: sisaSesi, hadir: sisaHadir };
    });
    notify('Sesi absensi dihapus.');
    return { ok: true };
  };

  /* ---------- Manajemen anggota (admin) ---------- */
  const simpanAnggota = ({ peran: _turunan, ...data }) => {
    // `peran` dihitung dari progres, tidak pernah disimpan pada data pengguna
    const nama = data.nama?.trim();
    if (!nama) return { ok: false, pesan: 'Nama wajib diisi.' };
    // PIN hanya diisi saat anggota baru dibuat (PIN awal). Untuk anggota yang sudah ada,
    // PIN diubah lewat "Reset PIN" atau "Ganti PIN" di menu Akun.
    if (!data.id && !formatPinSah(data.pin)) return { ok: false, pesan: 'PIN awal harus 4 sampai 6 angka.' };

    const bersih = { ...data, nama };
    if (data.role === 'peserta') {
      const peserta = db.users.filter((u) => u.role === 'peserta');
      bersih.kelas = kanon(data.kelas, peserta.map((u) => u.kelas).filter(Boolean));
      bersih.sangga = kanon(data.sangga, peserta.map((u) => u.sangga).filter(Boolean));
      if (!bersih.kelas || !bersih.sangga) return { ok: false, pesan: 'Kelas dan sangga peserta wajib diisi.' };
      if (!data.agama) return { ok: false, pesan: 'Agama wajib diisi. Butir 1 SKU menyesuaikan agama peserta.' };
      if (data.calonGaruda) {
        const lama = db.users.find((u) => u.id === data.id);
        if (lama?.calonGaruda) bersih.calonGaruda = lama.calonGaruda; // sudah terdaftar, jangan diubah
        else if (lama && layakGaruda(db.progress, { ...lama, agama: bersih.agama })) bersih.calonGaruda = hariIni();
        else return { ok: false, pesan: 'Status Calon Garuda hanya untuk peserta yang seluruh SKU Bantara dan Laksana-nya lulus.' };
      } else {
        delete bersih.calonGaruda;
      }
    }

    if (data.id) {
      // PIN dan statusnya selalu dipertahankan dari data tersimpan, bukan dari isian formulir.
      // calonGaruda ditulis eksplisit agar pencalonan yang dicabut benar-benar hilang.
      setDb((d) => ({
        ...d,
        users: d.users.map((u) =>
          u.id === data.id
            ? { ...u, ...bersih, pin: u.pin, wajibGantiPin: u.wajibGantiPin, calonGaruda: bersih.calonGaruda }
            : u
        ),
      }));
      notify('Data anggota diperbarui.');
    } else {
      setDb((d) => ({ ...d, users: [...d.users, { ...bersih, id: buatId('u'), dibuat: hariIni(), wajibGantiPin: true }] }));
      notify('Anggota baru ditambahkan. PIN awal wajib diganti saat login pertama.');
    }
    return { ok: true };
  };

  /**
   * Impor banyak anggota sekaligus (dari Excel). `baris` = hasil bacaExcelAnggota, `kelompok` =
   * 'peserta' (Penegak), 'dewan' (Dewan Ambalan), atau 'pembina'. Admin Gudep tidak diimpor.
   * Baris yang tidak lolos pemeriksaan dilewati. PIN awal yang kosong dibuat acak.
   * Mengembalikan daftar anggota baru beserta PIN awalnya (hanya tersedia saat ini).
   */
  const imporAnggota = (baris, kelompok = 'peserta') => {
    if (user?.role !== 'admin') return ditolak(notify, 'Hanya Admin Gudep yang dapat mengimpor anggota.');
    const k = kelompokDari(kelompok);
    if (!k || !KELOMPOK_IMPOR.includes(kelompok)) return ditolak(notify, 'Kelompok anggota ini tidak dapat diimpor.');
    const siap = periksaBaris(baris, db.users, kelompok).filter((r) => r.siap);
    if (!siap.length) return ditolak(notify, 'Tidak ada baris yang dapat diimpor.');

    if (kelompok !== 'peserta') {
      const baru = siap.map(({ data }) => ({
        id: buatId('u'), role: k.role, jabatan: k.jabatan, nama: data.nama,
        pin: formatPinSah(data.pin) ? data.pin : buatPinAcak(), dibuat: hariIni(), wajibGantiPin: true,
      }));
      setDb((d) => ({ ...d, users: [...d.users, ...baru] }));
      notify(`${baru.length} ${k.label} berhasil diimpor.`);
      return { ok: true, daftar: baru.map(({ nama, pin }) => ({ nama, pin })) };
    }

    const peserta = db.users.filter((u) => u.role === 'peserta');
    const kelasAda = peserta.map((u) => u.kelas).filter(Boolean);
    const sanggaAda = peserta.map((u) => u.sangga).filter(Boolean);
    const baru = siap.map(({ data }) => {
      const kelas = kanon(data.kelas, kelasAda);
      const sangga = kanon(data.sangga, sanggaAda);
      kelasAda.push(kelas); // baris berikutnya memakai penulisan yang sama
      sanggaAda.push(sangga);
      return {
        id: buatId('u'), role: 'peserta', nama: data.nama, nis: data.nis, kelas, sangga, agama: data.agama,
        pin: formatPinSah(data.pin) ? data.pin : buatPinAcak(), dibuat: hariIni(), wajibGantiPin: true,
      };
    });
    setDb((d) => ({ ...d, users: [...d.users, ...baru] }));
    notify(`${baru.length} anggota berhasil diimpor.`);
    return { ok: true, daftar: baru.map(({ nama, nis, kelas, sangga, agama, pin }) => ({ nama, nis, kelas, sangga, agama, pin })) };
  };

  const hapusAnggota = (id) => {
    if (id === user?.id) {
      notify('Anda tidak bisa menghapus akun yang sedang dipakai.', 'err');
      return;
    }
    const { [id]: _p, ...sisaProgress } = db.progress;
    const { [id]: _f, ...sisaPortofolio } = db.portofolio;
    const hadir = Object.fromEntries(
      Object.entries(db.absensi.hadir).map(([tgl, peta]) => {
        const { [id]: _a, ...sisa } = peta;
        return [tgl, sisa];
      })
    );
    setDb({
      ...db, // koleksi lain (mis. materi) tetap terbawa
      users: db.users.filter((u) => u.id !== id),
      progress: sisaProgress,
      portofolio: sisaPortofolio,
      absensi: { ...db.absensi, hadir },
    });
    notify('Anggota dihapus beserta seluruh datanya.');
  };

  /* ---------- Materi SKU (Pembina dan Admin Gudep) ---------- */
  const izinMateri = bolehKelolaMateri(user);
  const MSG_MATERI = 'Hanya Pembina dan Admin Gudep yang dapat mengelola materi.';

  /** Tambah (tanpa id) atau ubah (dengan id) satu materi. Galat validasi dikembalikan untuk ditampilkan di formulir. */
  const simpanMateri = (data) => {
    if (!izinMateri) return ditolak(notify, MSG_MATERI);
    const daftar = db.materi ?? [];
    if (data.id && !daftar.some((m) => m.id === data.id)) return { ok: false, pesan: 'Materi tidak ditemukan. Mungkin sudah dihapus.' };
    const r = validasiMateri(data, daftar);
    if (!r.ok) return { ok: false, pesan: r.pesan };

    if (data.id) {
      setDb((d) => ({ ...d, materi: d.materi.map((m) => (m.id === data.id ? { ...m, ...r.materi, diubah: hariIni() } : m)) }));
      notify('Materi diperbarui.');
      return { ok: true, id: data.id };
    }
    const id = buatId('m');
    setDb((d) => ({ ...d, materi: [...(d.materi ?? []), { ...r.materi, id, dibuat: hariIni(), dibuatOleh: user.id }] }));
    notify('Materi ditambahkan. Materi langsung tampil di menu Materi semua pengguna.');
    return { ok: true, id };
  };

  const hapusMateri = (id) => {
    if (!izinMateri) return ditolak(notify, MSG_MATERI);
    setDb((d) => ({ ...d, materi: (d.materi ?? []).filter((m) => m.id !== id) }));
    notify('Materi dihapus (file di Google Drive tidak terpengaruh).');
    return { ok: true };
  };

  const geserUrutanMateri = (id, arah) => {
    if (!izinMateri) return ditolak(notify, MSG_MATERI);
    setDb((d) => ({ ...d, materi: geserMateri(d.materi ?? [], id, arah) }));
    return { ok: true };
  };

  const resetDemo = () => {
    setDb(buatSeed());
    setSesiId(null);
  };

  const value = {
    db, user, users: db.users, progress: db.progress, absensi: db.absensi, portofolio: db.portofolio,
    materi: db.materi ?? [], bolehKelolaMateri: izinMateri, simpanMateri, hapusMateri, geserUrutanMateri,
    daftarPeserta, peranUser, bolehKelolaAbsen,
    login, logout, cekPin,
    ajukan, batalkanAjuan, catatHasil,
    daftarCalonGaruda, ubahPortofolio, catatPortofolioPenguji,
    buatSesiAbsen, setStatusAbsen, tandaiBanyakAbsen, hapusSesiAbsen,
    gantiPin, resetPin,
    simpanAnggota, imporAnggota, hapusAnggota, resetDemo,
    notify, toast,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

