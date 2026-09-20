/**
 * LAPISAN API SUPABASE
 *
 * Satu-satunya tempat yang berbicara dengan Supabase. Semua aksi mengembalikan { ok, pesan, ... }
 * (bentuk yang sama dipakai UI), tidak pernah melempar galat ke halaman.
 *
 *  - Membaca : tabel (dibatasi RLS sesuai peran), dibaca per 1000 baris (batas PostgREST).
 *  - Menulis : hanya lewat fungsi server sg_* dan Edge Function `sigarda`. Tidak ada penulisan langsung ke tabel.
 *
 * `klien` = klien supabase-js (atau klien lokal yang bentuknya sama, lihat src/lokal).
 */
import { petaPengaturan, petaProfil, petaSidang, susunHadir, susunMateri, susunPortofolio, susunProgress, susunSesi } from './mapDb';

export const UKURAN_HALAMAN = 1000;

// Nama (slug) Edge Function di Supabase. Biasanya "sigarda". Bila dashboard membuat nama lain saat deploy lewat editor,
// isi VITE_NAMA_FUNGSI dengan nama yang tertera pada alamat fungsi (bagian akhir dari .../functions/v1/NAMA).
const NAMA_FUNGSI = import.meta.env?.VITE_NAMA_FUNGSI || 'sigarda';

/** Mengubah galat teknis menjadi pesan yang dapat dibaca pengguna. */
export function pesanGalat(error) {
  const m = String(error?.message ?? error ?? '');
  if (/failed to send a request to the edge function/i.test(m)) {
    return `Fungsi server "${NAMA_FUNGSI}" di Supabase tidak dapat dihubungi. Kemungkinan belum di-deploy, namanya (slug) berbeda dari yang dipakai aplikasi (atur VITE_NAMA_FUNGSI), atau "Verify JWT" belum dimatikan. Lihat langkah 4 di README.`;
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(m)) {
    return 'Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.';
  }
  if (/jwt|not authenticated|invalid token|session/i.test(m)) return 'Sesi berakhir. Masuk kembali.';
  if (/permission denied|row-level security/i.test(m)) return 'Anda tidak memiliki izin untuk tindakan ini.';
  if (/could not find the function|schema cache/i.test(m)) return 'Basis data belum disiapkan (fungsi tidak ditemukan). Jalankan skema SQL di Supabase.';
  return m || 'Terjadi galat yang tidak dikenal.';
}
const sesiBerakhir = (error) => /jwt|not authenticated|invalid token/i.test(String(error?.message ?? ''));

export function buatApi(klien) {
  /**
   * Membaca seluruh baris sebuah tabel, per halaman 1000.
   * `filter` = [[kolom, nilai], ...] (sama dengan) atau [kolom, 'gte' | 'lte', nilai] (rentang).
   */
  async function ambilSemua(tabel, { urut = [], filter = [] } = {}) {
    const semua = [];
    for (let dari = 0; ; dari += UKURAN_HALAMAN) {
      let q = klien.from(tabel).select('*');
      for (const f of filter) q = f.length === 3 ? q[f[1] === 'lte' ? 'lte' : 'gte'](f[0], f[2]) : q.eq(f[0], f[1]);
      for (const k of urut) q = q.order(k);
      const { data, error } = await q.range(dari, dari + UKURAN_HALAMAN - 1);
      if (error) throw error;
      semua.push(...(data ?? []));
      if ((data ?? []).length < UKURAN_HALAMAN) break;
    }
    return semua;
  }

  async function rpc(nama, args = {}) {
    try {
      const { data, error } = await klien.rpc(nama, args);
      if (error) return { ok: false, pesan: pesanGalat(error), sesiBerakhir: sesiBerakhir(error) };
      return { ok: true, data };
    } catch (e) {
      return { ok: false, pesan: pesanGalat(e) };
    }
  }

  async function edge(aksi, body = {}) {
    try {
      const { data, error } = await klien.functions.invoke(NAMA_FUNGSI, { body: { aksi, ...body } });
      if (error) {
        if (error?.context?.status === 404) return { ok: false, pesan: `Fungsi server "${NAMA_FUNGSI}" tidak ditemukan di Supabase. Periksa nama fungsi (lihat README, langkah 4).` };
        return { ok: false, pesan: pesanGalat(error) };
      }
      return data ?? { ok: false, pesan: 'Server tidak memberi jawaban.' };
    } catch (e) {
      return { ok: false, pesan: pesanGalat(e) };
    }
  }

  const muat = async (fn) => {
    try {
      return { ok: true, data: await fn() };
    } catch (e) {
      return { ok: false, pesan: pesanGalat(e), sesiBerakhir: sesiBerakhir(e) };
    }
  };

  const sesiSaatIni = async () => {
    const { data } = await klien.auth.getSession();
    return data?.session?.user?.id ?? null;
  };

  return {
    /* ---------------------------- Sesi ---------------------------- */
    sesiSaatIni,

    async masuk(username, pin) {
      const r = await edge('masuk', { username, pin });
      if (!r.ok) return r;
      const { data, error } = await klien.auth.setSession(r.session);
      if (error || !data?.session) return { ok: false, pesan: 'Sesi belum dapat dibuat. Coba masuk lagi.' };
      return { ok: true, id: data.session.user?.id ?? (await sesiSaatIni()) };
    },

    async keluar() {
      await klien.auth.signOut();
    },

    /* ------------------------- Membaca data ------------------------- */
    muatProfil: () => muat(async () => (await ambilSemua('profiles', { urut: ['id'] })).map(petaProfil)),

    muatProgress: (pesertaId = null) =>
      muat(async () => {
        const filter = pesertaId ? [['peserta_id', pesertaId]] : [];
        const [baris, riwayat] = await Promise.all([
          ambilSemua('sku_progress', { filter, urut: ['peserta_id', 'sku_id'] }),
          ambilSemua('sku_riwayat', { filter, urut: ['id'] }),
        ]);
        return susunProgress(baris, riwayat);
      }),

    /** Daftar sesi (satu baris per Jumat, kecil): dimuat seluruhnya agar daftar tahun ajaran diketahui. */
    muatSesiAbsen: () => muat(async () => susunSesi(await ambilSemua('absensi_sesi', { urut: ['tanggal'] }))),

    /**
     * Kehadiran pada rentang tanggal [mulai, akhir] (ISO). Inilah bagian absensi yang besar, jadi dimuat per semester
     * dan hanya bila diperlukan. Hasil: { [tanggal]: { [pesertaId]: {...} } }, hanya tanggal yang punya catatan.
     */
    muatHadirRentang: (mulai, akhir) =>
      muat(async () => susunHadir(await ambilSemua('absensi_hadir', {
        filter: [['tanggal', 'gte', mulai], ['tanggal', 'lte', akhir]],
        urut: ['tanggal', 'peserta_id'],
      }))),

    /** Kehadiran satu tanggal saja (pembaruan cepat setelah mencatat). */
    muatHadirTanggal: (tanggal) =>
      muat(async () => {
        const hadir = await ambilSemua('absensi_hadir', { filter: [['tanggal', tanggal]], urut: ['peserta_id'] });
        return susunHadir(hadir)[tanggal] ?? {};
      }),

    muatPortofolio: (pesertaId = null) =>
      muat(async () => {
        const filter = pesertaId ? [['peserta_id', pesertaId]] : [];
        const [baris, jurnal] = await Promise.all([
          ambilSemua('portofolio', { filter, urut: ['peserta_id', 'item_id'] }),
          ambilSemua('portofolio_jurnal', { filter, urut: ['id'] }),
        ]);
        return susunPortofolio(baris, jurnal);
      }),

    muatMateri: () => muat(async () => susunMateri(await ambilSemua('materi', { urut: ['urutan'] }))),

    /** Catatan sidang (hanya pengurus yang menerima baris) dan pengaturan aplikasi. Dimuat saat halaman Sidang dibuka. */
    muatSidang: () => muat(async () => (await ambilSemua('sidang_dk', { urut: ['id'] })).map(petaSidang)),
    muatPengaturan: () => muat(async () => petaPengaturan(await ambilSemua('pengaturan', { urut: ['kunci'] }))),

    /* ----------------------------- SKU ----------------------------- */
    ajukan: ({ skuId, jadwal, pengujiId, catatan }) =>
      rpc('sg_sku_ajukan', { p_sku_id: skuId, p_jadwal: jadwal || null, p_penguji_id: pengujiId || null, p_catatan: catatan ?? '' }),
    batalkanAjuan: (skuId) => rpc('sg_sku_batal', { p_sku_id: skuId }),
    catatHasil: (d) => edge('catat-hasil', d),
    daftarCalonGaruda: () => rpc('sg_calon_garuda_daftar'),

    /* ---------------------------- Portofolio ---------------------------- */
    ubahPortofolio: (itemId, patch) => {
      const args = { p_item_id: itemId };
      if (patch.status !== undefined) args.p_status = patch.status;
      if (patch.catatan !== undefined) args.p_catatan = patch.catatan;
      if (patch.tautan !== undefined) args.p_tautan = patch.tautan;
      return rpc('sg_pf_ubah', args);
    },
    catatPortofolioPenguji: (pesertaId, itemId, catatan) =>
      rpc('sg_pf_catat_penguji', { p_peserta_id: pesertaId, p_item_id: itemId, p_catatan: catatan ?? '' }),

    /* ------------------------------ Absensi ------------------------------ */
    buatSesiAbsen: (tanggal) => rpc('sg_absen_buat_sesi', { p_tanggal: tanggal }),
    setStatusAbsen: (tanggal, pesertaId, status) =>
      rpc('sg_absen_set', { p_tanggal: tanggal, p_peserta_id: pesertaId, p_status: status ?? null }),
    tandaiBanyakAbsen: (tanggal, pesertaIds, status, hanyaKosong = true) =>
      rpc('sg_absen_set_banyak', { p_tanggal: tanggal, p_peserta_ids: pesertaIds, p_status: status, p_hanya_kosong: hanyaKosong }),
    hapusSesiAbsen: (tanggal) => rpc('sg_absen_hapus_sesi', { p_tanggal: tanggal }),

    /* ------------------------------ Akun & PIN ------------------------------ */
    gantiPin: ({ pinLama, pinBaru, ulangi }) => edge('ganti-pin', { pinLama, pinBaru, ulangi }),
    resetPin: (targetId) => edge('reset-pin', { targetId }),
    buatAkun: (kelompok, baris) => edge('buat-akun', { kelompok, baris }),
    hapusAkun: (targetId) => edge('hapus-akun', { targetId }),
    ubahUsername: (targetId, username) => edge('ubah-username', { targetId, username }),
    ubahAnggota: (u) =>
      rpc('sg_anggota_ubah', {
        p_id: u.id, p_nama: u.nama, p_kelas: u.kelas ?? null, p_sangga: u.sangga ?? null,
        p_agama: u.agama ?? null, p_calon_garuda: u.calonGaruda === undefined ? null : !!u.calonGaruda,
      }),

    /* ------------------------------- Materi ------------------------------- */
    simpanMateri: (m) =>
      rpc('sg_materi_simpan', {
        p_id: m.id ?? null, p_judul: m.judul, p_deskripsi: m.deskripsi ?? '', p_tautan: m.tautan, p_file_id: m.fileId,
        p_resource_key: m.resourceKey ?? '', p_butir: m.butir ?? [],
        p_bagian: (m.bagian ?? []).map((b) => ({ id: b.id, judul: b.judul, halaman: b.halaman ?? '' })),
      }),
    hapusMateri: (id) => rpc('sg_materi_hapus', { p_id: id }),
    geserMateri: (id, arah) => rpc('sg_materi_geser', { p_id: id, p_arah: arah }),

    /* ------------------------ Sidang Dewan Kehormatan ------------------------ */
    simpanSidang: (d) =>
      rpc('sg_sidang_simpan', {
        p_peserta_id: d.pesertaId, p_tingkat: d.tingkat, p_tanggal: d.tanggal, p_keputusan: d.keputusan,
        p_magang: d.magang, p_tugas_adat: d.tugasAdat, p_tugas_adat_ket: d.tugasAdatKet ?? '', p_catatan: d.catatan ?? '',
        p_nomor_manual: d.nomorManual || null, p_nta: d.nta || null,
      }),
    hapusSidang: (id) => rpc('sg_sidang_hapus', { p_id: id }),
    simpanPengaturan: (kunci, nilai) => rpc('sg_pengaturan_simpan', { p_kunci: kunci, p_nilai: nilai }),
  };
}
