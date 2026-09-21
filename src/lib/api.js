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
import { petaPengaturan, petaProfil, petaSidang, susunGuruAgama, susunHadir, susunAsisten, susunInstrumen, susunIuran, susunKas, susunLembarIuran, susunLogPenugasan, susunMateri, susunPenilaian, susunPenugasan, susunSesiUjian, susunPortofolio, susunProgress, susunRaport, susunSesi } from './mapDb';

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
  if (/could not find the (function|table)|schema cache|function [\w.]+\(.*\) does not exist|relation "[\w."]+" does not exist/i.test(m)) {
    return 'Basis data belum diperbarui (tabel atau fungsi tidak ditemukan). Jalankan migrasi terbaru dari folder supabase/migrasi di SQL Editor Supabase. Jangan menjalankan skema.sql pada database yang sudah berisi data.';
  }
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
    /**
     * Penghitung nomor berita acara: { [tahun]: nomor terakhir yang dipakai } (hanya pengurus).
     * Pada database yang belum menjalankan migrasi 2026-09-sidang-format-nomor.sql tabel ini belum dapat dibaca; halaman Sidang
     * tetap harus berfungsi, jadi kegagalan selain sesi berakhir dianggap "belum ada penghitung".
     */
    muatSidangUrut: async () => {
      const r = await muat(async () => Object.fromEntries((await ambilSemua('sidang_urut', { urut: ['tahun'] })).map((b) => [String(b.tahun), b.terakhir])));
      return r.ok || r.sesiBerakhir ? r : { ok: true, data: {} };
    },

    /** Nilai raport satu semester (hanya Pembina dan Admin yang menerima baris): { [pesertaId]: baris }. Dimuat saat halaman Raport dibuka. */
    muatRaport: (tahunAjaran, semester) =>
      muat(async () => susunRaport(await ambilSemua('raport', {
        filter: [['tahun_ajaran', tahunAjaran], ['semester', semester]],
        urut: ['peserta_id'],
      }))),

    /**
     * Seluruh instrumen penilaian (kecil: sekitar 90 butir). Penegak hanya menerima yang ditetapkan dan tanpa panduan; pengurus menerima semua.
     * Pada database yang belum menjalankan migrasi 2026-09-instrumen.sql, aplikasi tetap harus berfungsi dengan alur penilaian lama, jadi
     * kegagalan selain sesi berakhir dianggap "belum ada instrumen" dan pesannya dibawa di `galat` untuk halaman kelola.
     */
    muatInstrumen: async () => {
      const r = await muat(async () => {
        const [a, b, c, d] = await Promise.all([
          ambilSemua('instrumen', { urut: ['sku_id'] }),
          ambilSemua('instrumen_kriteria', { urut: ['sku_id', 'urutan'] }),
          ambilSemua('instrumen_penguji', { urut: ['sku_id'] }),
          ambilSemua('instrumen_panduan', { urut: ['kriteria_id'] }),
        ]);
        return susunInstrumen(a, b, c, d);
      });
      return r.ok || r.sesiBerakhir ? r : { ok: true, data: {}, galat: r.pesan };
    },

    /* ------------------------- Iuran bumbung kepramukaan ------------------------- */
    /** Iuran pada rentang tanggal (pengurus: semua; Penegak: hanya miliknya, dijaga RLS). Hasil { [tanggal]: { [pesertaId]: { jumlah, jenis } } }. */
    muatIuran: (mulai, akhir) =>
      muat(async () => susunIuran(await ambilSemua('iuran', { filter: [['tanggal', 'gte', mulai], ['tanggal', 'lte', akhir]], urut: ['tanggal', 'peserta_id'] }))),
    /** Tutup kas pada rentang tanggal (hanya pengurus). */
    muatKas: (mulai, akhir) =>
      muat(async () => susunKas(await ambilSemua('iuran_kas', { filter: [['tanggal', 'gte', mulai], ['tanggal', 'lte', akhir]], urut: ['tanggal'] }))),
    /** Asisten bendahara yang sedang ditunjuk (pengurus: semua; Penegak: hanya dirinya bila ditunjuk). */
    muatAsisten: () => muat(async () => susunAsisten(await ambilSemua('asisten_iuran', { urut: ['peserta_id'] }))),
    /** Riwayat perubahan iuran satu Jumat (hanya pengurus), lama ke baru. */
    muatLogIuran: (tanggal) => muat(async () => ambilSemua('iuran_log', { filter: [['tanggal', tanggal]], urut: ['id'] })),
    /** Lembar catat satu Jumat untuk Dewan Ambalan dan asisten: [{ id, nama, kelas, sangga, status, jumlah, jenis }]. */
    muatLembarIuran: async (tanggal) => {
      const r = await rpc('sg_iuran_lembar', { p_tanggal: tanggal });
      return r.ok ? { ok: true, data: susunLembarIuran(r.data ?? []) } : r;
    },
    /** Rekap agregat untuk semua peran: [{ tanggal, tipe: 'gudep' | 'sangga' | 'kelas', kunci, jumlah, susulan, orang }]. */
    muatIuranAgregat: async (mulai, akhir) => {
      const r = await rpc('sg_iuran_agregat', { p_mulai: mulai, p_akhir: akhir });
      return r.ok ? { ok: true, data: r.data ?? [] } : r;
    },
    aturIuran: (tanggal, pesertaId, jumlah) => rpc('sg_iuran_set', { p_tanggal: tanggal, p_peserta_id: pesertaId, p_jumlah: jumlah ?? null }),
    aturIuranBanyak: (tanggal, pesertaIds, jumlah, hanyaKosong = true) =>
      rpc('sg_iuran_set_banyak', { p_tanggal: tanggal, p_peserta_ids: pesertaIds, p_jumlah: jumlah, p_hanya_kosong: hanyaKosong }),
    simpanKas: (tanggal, total, catatan = '') => rpc('sg_iuran_kas_simpan', { p_tanggal: tanggal, p_total: total ?? null, p_catatan: catatan }),
    aturAsisten: (pesertaId, aktif) => rpc('sg_asisten_iuran_atur', { p_peserta_id: pesertaId, p_aktif: aktif }),
    /** Pengaturan iuran (standar, ambang, batas nilai) untuk semua peran; hasil { standar, ambang, lima, tiga, dua }. */
    muatPengaturanIuran: () => rpc('sg_iuran_pengaturan'),
    simpanPengaturanIuran: (nilai) => rpc('sg_iuran_pengaturan_simpan', { p_nilai: nilai }),
    /** Ringkasan iuran satu Penegak untuk lembar penilaian butir iuran (pengurus): semester dari tanggal uji. */
    muatIuranRingkas: (pesertaId, tanggal) => rpc('sg_iuran_ringkas', { p_peserta_id: pesertaId, p_tanggal: tanggal }),
    /** Iuran susulan (Dewan): menebus Jumat kosong terlama dulu. Mengembalikan jumlah Jumat yang terisi. */
    catatIuranSusulan: (pesertaId, tanggal, jumlah, pertemuan) =>
      rpc('sg_iuran_susulan', { p_peserta_id: pesertaId, p_tanggal: tanggal, p_jumlah: jumlah, p_pertemuan: pertemuan }),
    /**
     * Riwayat penilaian dengan instrumen untuk satu butir milik satu Penegak (lama ke baru). Penegak hanya dapat membaca miliknya sendiri (RLS).
     * Dibaca saat rincian dibuka, bukan saat masuk, agar data awal tetap ringan.
     */
    muatPenilaian: (pesertaId, skuId) =>
      muat(async () => susunPenilaian(await ambilSemua('sku_penilaian', { filter: [['peserta_id', pesertaId], ['sku_id', skuId]], urut: ['id'] }))),

    /**
     * Sesi ujian (pengurus: semua; Penegak: hanya yang mencantumkan dirinya). Bila database belum dimigrasi, dianggap kosong dengan galat.
     */
    muatSesiUjian: async () => {
      const r = await muat(async () => {
        const [a, b, c] = await Promise.all([
          ambilSemua('sesi_ujian', { urut: ['tanggal', 'id'] }),
          ambilSemua('sesi_ujian_butir', { urut: ['sesi_id', 'butir_id'] }),
          ambilSemua('sesi_ujian_peserta', { urut: ['sesi_id', 'peserta_id'] }),
        ]);
        return susunSesiUjian(a, b, c);
      });
      return r.ok || r.sesiBerakhir ? r : { ok: true, data: [], galat: r.pesan };
    },

    /**
     * Verifikasi keaslian dokumen. DAPAT DIPANGGIL TANPA LOGIN (peran anon). Mengembalikan { ok, data: { ditemukan, ... } }.
     */
    verifikasiToken: (token) => rpc('sg_verifikasi_token', { p_token: token }),
    verifikasiKode: (kode) => rpc('sg_verifikasi_kode', { p_kode: kode }),

    /* ----------------------------- SKU ----------------------------- */
    ajukan: ({ skuId, jadwal, pengujiId, catatan }) =>
      rpc('sg_sku_ajukan', { p_sku_id: skuId, p_jadwal: jadwal || null, p_penguji_id: pengujiId || null, p_catatan: catatan ?? '' }),
    batalkanAjuan: (skuId) => rpc('sg_sku_batal', { p_sku_id: skuId }),
    /**
     * Penguji yang sah untuk satu butir beserta beban antrian masing-masing (aturan dihitung di server). Penegak: untuk dirinya;
     * Pembina dan Admin dapat menyebut pesertaId (dipakai saat mengalihkan). Hasil: { sumber: 'rombel'|'semua', rombel, agamaButir,
     * penguji: [{ id, nama, jabatan, agama, beban }] }.
     */
    pengujiPilihan: async (skuId, pesertaId = null) => {
      const r = await rpc('sg_penguji_pilihan', { p_sku_id: skuId, p_peserta_id: pesertaId });
      if (!r.ok) return r;
      const d = r.data ?? {};
      return { ok: true, data: { sumber: d.sumber, rombel: d.rombel ?? null, agamaButir: !!d.agama_butir, penguji: d.penguji ?? [] } };
    },
    /** Pembina atau Admin mengalihkan pengajuan ke penguji lain (pengujiId kosong = antrian bersama rombel); alasan wajib. */
    alihkanPengajuan: ({ pesertaId, skuId, pengujiId, alasan }) =>
      rpc('sg_sku_alihkan', { p_peserta_id: pesertaId, p_sku_id: skuId, p_penguji_id: pengujiId || null, p_alasan: alasan ?? '' }),
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

    /** NTA anggota (Admin). `daftar` = [{ username, nta }]; nta kosong menghapus. Mengembalikan jumlah anggota yang diperbarui. */
    aturNta: (daftar) => rpc('sg_anggota_nta_atur', { p_data: daftar }),
    /** Agama Pembina (Admin). `daftar` = [{ username, agama }]; agama kosong menghapus. Hanya berlaku untuk Pembina. Mengembalikan jumlah yang diperbarui. */
    aturAgamaPembina: (daftar) => rpc('sg_anggota_agama_atur', { p_data: daftar }),
    /** Rombel banyak Penegak sekaligus (Admin). `daftar` = [{ username (NIS), rombel }]. Semua atau tidak sama sekali. Mengembalikan jumlah baris. */
    perbaruiRombel: (daftar) => rpc('sg_rombel_perbarui', { p_data: daftar }),

    /* ------------------- Penugasan penguji per rombel dan guru agama ------------------- */
    /** Penugasan satu tahun ajaran (pengurus): [{ rombel, pengujiId, ditetapkanPada }]. */
    muatPenugasan: (tahunAjaran) =>
      muat(async () => susunPenugasan(await ambilSemua('penugasan_rombel', { filter: [['tahun_ajaran', tahunAjaran]], urut: ['rombel', 'penguji_id'] }))),
    /** Riwayat penugasan satu tahun ajaran (pengurus), lama ke baru. */
    muatLogPenugasan: (tahunAjaran) =>
      muat(async () => susunLogPenugasan(await ambilSemua('penugasan_log', { filter: [['tahun_ajaran', tahunAjaran]], urut: ['id'] }))),
    muatGuruAgama: () => muat(async () => susunGuruAgama(await ambilSemua('guru_agama', { urut: ['agama', 'nama'] }))),
    /** Menambah (ada = true) atau mencabut (false) penugasan satu penguji pada beberapa rombel (Admin). Mengembalikan jumlah perubahan nyata. */
    aturPenugasan: (tahunAjaran, pengujiId, rombel, ada) =>
      rpc('sg_penugasan_atur', { p_tahun_ajaran: tahunAjaran, p_penguji_id: pengujiId, p_rombel: rombel, p_ada: ada }),
    /** Menyalin penugasan tahun ajaran `dari` ke `ke` (Admin). Mengembalikan jumlah penugasan baru. */
    salinPenugasan: (dari, ke) => rpc('sg_penugasan_salin', { p_dari: dari, p_ke: ke }),
    simpanGuruAgama: (g) => rpc('sg_guru_agama_simpan', { p_id: g.id ?? null, p_agama: g.agama, p_nama: g.nama, p_keterangan: g.keterangan ?? '' }),
    hapusGuruAgama: (id) => rpc('sg_guru_agama_hapus', { p_id: id }),

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
    aturUrutSidang: (tahun, berikutnya) => rpc('sg_sidang_urut_atur', { p_tahun: tahun, p_berikutnya: berikutnya }),
    simpanPengaturan: (kunci, nilai) => rpc('sg_pengaturan_simpan', { p_kunci: kunci, p_nilai: nilai }),

    /* ------------------------- Nilai raport ekstrakurikuler ------------------------- */
    simpanRaport: (d) =>
      rpc('sg_raport_simpan', {
        p_peserta_id: d.pesertaId, p_tahun_ajaran: d.tahunAjaran, p_semester: d.semester, p_tingkat: d.tingkat,
        p_sikap: d.sikap ?? null, p_karakter: d.karakter ?? [], p_skk: d.skk ?? null,
        p_predikat_akhir: d.predikatAkhir || null, p_catatan: d.catatanPredikat ?? '', p_deskripsi: d.deskripsi ?? '', p_final: !!d.final,
      }),
    hapusRaport: (pesertaId, tahunAjaran, semester) =>
      rpc('sg_raport_hapus', { p_peserta_id: pesertaId, p_tahun_ajaran: tahunAjaran, p_semester: semester }),
    simpanPengaturanRaport: (nilai) => rpc('sg_raport_pengaturan_simpan', { p_nilai: nilai }),

    /* ------------------------ Instrumen penilaian (Pembina dan Admin) ------------------------ */
    simpanInstrumen: (d) =>
      rpc('sg_instrumen_simpan', {
        p_sku_id: d.skuId, p_cara_uji: d.caraUji ?? '', p_instruksi: d.instruksi ?? '', p_status: d.status,
        p_kriteria: d.kriteria.map((k) => ({ id: k.id ?? null, jenis: k.jenis, teks: k.teks, bobot: k.bobot, wajib: !!k.wajib, panduan: k.panduan ?? '', sumber: k.sumber ?? 'manual' })),
      }),
    /* ------------------- QR Surat Tanda Lulus dan sesi ujian ------------------- */
    sertifikatTingkat: (pesertaId, tingkat) => rpc('sg_sertifikat_tingkat', { p_peserta_id: pesertaId, p_tingkat: tingkat }),
    simpanSesi: (d) =>
      rpc('sg_sesi_simpan', {
        p_id: d.id ?? null, p_nama: d.nama, p_tanggal: d.tanggal, p_tempat: d.tempat ?? '', p_catatan: d.catatan ?? '', p_status: d.status ?? 'terjadwal',
        p_butir: d.butir, p_peserta: d.peserta,
      }),
    statusSesi: (id, status) => rpc('sg_sesi_status', { p_id: id, p_status: status }),
    hapusSesi: (id) => rpc('sg_sesi_hapus', { p_id: id }),

    statusInstrumen: (skuIds, status) => rpc('sg_instrumen_status', { p_sku_ids: skuIds, p_status: status }),
    simpanPengaturanInstrumen: (nilai) => rpc('sg_instrumen_pengaturan_simpan', { p_nilai: nilai }),
  };
}
