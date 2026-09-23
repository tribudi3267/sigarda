/**
 * PEMETAAN DATA SERVER -> BENTUK DATA APLIKASI (murni, tanpa React)
 *
 * Server menyimpan data dalam tabel (snake_case). Seluruh halaman aplikasi memakai bentuk data
 * bersarang berikut, sehingga lapisan ini menjembataninya:
 *
 *   users[]                        { id, username, role, nama, nis, kelas, sangga, agama, jabatan, jabatanDewan, calonGaruda, nta,
 *                                    wajibGantiPin, pinDireset:{oleh,waktu}, pinDiubah, dibuat }
 *   progress[pesertaId][skuId]     { status, jadwal, pengujiId, tanggalUji, nilai, catatan, catatanPeserta,
 *                                    verifikasi, diverifikasiPada, riwayat:[{waktu,teks,oleh}] }
 *   absensi                        { sesi:{[tgl]:{tanggal,dibuatOleh,dibuatPada}}, hadir:{[tgl]:{[id]:{status,waktu,oleh}}} }
 *                                  sesi = semua tanggal; hadir[tgl] hanya ada untuk semester yang sudah dimuat (lihat AppContext)
 *   portofolio[pesertaId][itemId]  { status, catatan, tautan, catatanPenguji, catatanPengujiOleh, diperbarui, riwayat }
 *   materi[]                       { id, urutan, judul, deskripsi, tautan, fileId, resourceKey, butir, bagian, dibuat, dibuatOleh }
 */

const atau = (v) => (v === null ? undefined : v);
const tgl = (v) => (v ? String(v).slice(0, 10) : v ?? null);

export function petaProfil(r) {
  return {
    id: r.id,
    username: r.username,
    role: r.role,
    nama: r.nama,
    nis: atau(r.nis),
    kelas: atau(r.kelas),
    sangga: atau(r.sangga),
    agama: atau(r.agama),
    jabatan: atau(r.jabatan),
    jabatanDewan: atau(r.jabatan_dewan),
    jenisKelamin: atau(r.jenis_kelamin),
    whatsapp: atau(r.whatsapp),
    status: r.status ?? 'aktif',
    statusPada: tgl(r.status_pada) ?? undefined,
    lulusTa: atau(r.lulus_ta),
    calonGaruda: r.calon_garuda ? tgl(r.calon_garuda) : undefined,
    nta: atau(r.nta),
    wajibGantiPin: r.wajib_ganti_pin !== false,
    pinDireset: r.pin_direset_pada ? { oleh: r.pin_direset_oleh ?? null, waktu: r.pin_direset_pada } : undefined,
    pinDiubah: atau(r.pin_diubah),
    dibuat: tgl(r.dibuat),
  };
}

const urutWaktu = (a, b) => String(a.waktu).localeCompare(String(b.waktu)) || (a.urut ?? 0) - (b.urut ?? 0);

/** baris sku_progress + sku_riwayat -> progress bersarang. */
export function susunProgress(baris = [], riwayat = []) {
  const hasil = {};
  for (const r of baris) {
    (hasil[r.peserta_id] ??= {})[r.sku_id] = {
      status: r.status,
      jadwal: tgl(r.jadwal),
      pengujiId: r.penguji_id ?? null,
      tanggalUji: tgl(r.tanggal_uji),
      nilai: r.nilai ?? null,
      catatan: r.catatan ?? '',
      catatanPeserta: r.catatan_peserta ?? '',
      verifikasi: r.verifikasi ?? null,
      diverifikasiPada: r.diverifikasi_pada ?? null,
      token: r.verifikasi_token ?? null,
      riwayat: [],
    };
  }
  for (const w of [...riwayat].sort((a, b) => urutWaktu({ ...a, urut: a.id }, { ...b, urut: b.id }))) {
    const e = hasil[w.peserta_id]?.[w.sku_id];
    if (e) e.riwayat.push({ waktu: w.waktu, teks: w.teks, oleh: w.oleh ?? null });
  }
  return hasil;
}

/** baris absensi_sesi -> { [tanggal]: { tanggal, dibuatOleh, dibuatPada } } */
export function susunSesi(sesi = []) {
  const hasil = {};
  for (const s of sesi) {
    const t = tgl(s.tanggal);
    hasil[t] = { tanggal: t, dibuatOleh: s.dibuat_oleh ?? null, dibuatPada: s.dibuat_pada };
  }
  return hasil;
}

/** baris absensi_hadir -> { [tanggal]: { [pesertaId]: { status, waktu, oleh } } } (hanya tanggal yang punya baris) */
export function susunHadir(hadir = []) {
  const hasil = {};
  for (const h of hadir) {
    (hasil[tgl(h.tanggal)] ??= {})[h.peserta_id] = { status: h.status, waktu: h.waktu, oleh: h.oleh ?? null };
  }
  return hasil;
}

/** Sesi dan seluruh kehadirannya sekaligus (dipakai pengujian dan data awal). */
export function susunAbsensi(sesi = [], hadir = []) {
  const s = susunSesi(sesi);
  const h = susunHadir(hadir);
  return { sesi: s, hadir: Object.fromEntries(Object.keys(s).map((t) => [t, h[t] ?? {}])) };
}

export function susunPortofolio(baris = [], jurnal = []) {
  const hasil = {};
  for (const r of baris) {
    (hasil[r.peserta_id] ??= {})[r.item_id] = {
      status: r.status,
      catatan: r.catatan ?? '',
      tautan: r.tautan ?? '',
      catatanPenguji: r.catatan_penguji ?? '',
      catatanPengujiOleh: r.catatan_penguji_oleh ?? undefined,
      diperbarui: r.diperbarui,
      riwayat: [],
    };
  }
  for (const w of [...jurnal].sort((a, b) => urutWaktu({ ...a, urut: a.id }, { ...b, urut: b.id }))) {
    const e = hasil[w.peserta_id]?.[w.item_id];
    if (e) e.riwayat.push({ waktu: w.waktu, teks: w.teks, oleh: w.oleh ?? null });
  }
  return hasil;
}

export function petaMateri(r) {
  const bagian = Array.isArray(r.bagian) ? r.bagian : [];
  return {
    id: r.id,
    urutan: r.urutan,
    judul: r.judul,
    deskripsi: r.deskripsi ?? '',
    tautan: r.tautan,
    fileId: r.file_id,
    resourceKey: r.resource_key ?? '',
    butir: r.butir ?? [],
    bagian: bagian.map((b, i) => ({ id: b.id ?? `b${i}`, judul: b.judul ?? '', halaman: b.halaman ?? '' })),
    dibuat: tgl(r.dibuat),
    dibuatOleh: r.dibuat_oleh ?? null,
  };
}

export const susunMateri = (baris = []) => baris.map(petaMateri).sort((a, b) => a.urutan - b.urutan);

export function petaSidang(r) {
  return {
    id: r.id,
    pesertaId: r.peserta_id,
    tingkat: r.tingkat,
    tanggal: tgl(r.tanggal),
    keputusan: r.keputusan,
    magang: r.magang,
    tugasAdat: r.tugas_adat,
    tugasAdatKet: r.tugas_adat_ket ?? '',
    catatan: r.catatan ?? '',
    nomorBa: r.nomor_ba,
    nomorUrut: r.nomor_urut ?? null,
    capaianLulus: r.capaian_lulus,
    capaianTotal: r.capaian_total,
    butirBelum: Array.isArray(r.butir_belum) ? r.butir_belum : [],
    nta: r.nta ?? '',
    ketuaNama: r.ketua_nama ?? '',
    ketuaSebutan: r.ketua_sebutan ?? '',
    dibuatOleh: r.dibuat_oleh ?? null,
    dibuatPada: r.dibuat_pada,
  };
}

/** Baris tabel pengaturan -> { [kunci]: nilai }. Nilai teks tetap teks; objek (mis. pengaturan raport) dipertahankan. */
export const petaPengaturan = (baris = []) =>
  Object.fromEntries(baris.map((r) => [r.kunci, typeof r.nilai === 'string' || (r.nilai && typeof r.nilai === 'object') ? r.nilai : String(r.nilai ?? '')]));

export function petaRaport(r) {
  return {
    pesertaId: r.peserta_id,
    tahunAjaran: r.tahun_ajaran,
    semester: r.semester,
    tingkat: r.tingkat,
    sikap: r.sikap ?? null,
    karakter: Array.isArray(r.karakter) ? r.karakter : [],
    skk: r.skk ?? null,
    kehadiranPersen: r.kehadiran_persen ?? null,
    hadir: r.hadir ?? null,
    pertemuan: r.pertemuan ?? null,
    capaianLulus: r.capaian_lulus,
    capaianTarget: r.capaian_target,
    skor: r.skor,
    predikatHitung: r.predikat_hitung,
    predikatAkhir: r.predikat_akhir ?? null,
    catatanPredikat: r.catatan_predikat ?? '',
    deskripsi: r.deskripsi ?? '',
    status: r.status,
    diubahPada: r.diubah_pada,
  };
}

/**
 * Instrumen penilaian: { [skuId]: { skuId, caraUji, status, instruksi, kriteria: [{ id, urutan, jenis, teks, bobot, wajib, panduan }] } }.
 * `instruksi` dan `panduan` hanya terisi untuk pengurus (tabelnya tidak terbaca Penegak).
 */
export function susunInstrumen(instrumen = [], kriteria = [], penguji = [], panduan = []) {
  const petaInstruksi = new Map(penguji.map((r) => [r.sku_id, r.instruksi ?? '']));
  const petaPanduan = new Map(panduan.map((r) => [Number(r.kriteria_id), r.panduan ?? '']));
  const hasil = {};
  for (const r of instrumen) {
    hasil[r.sku_id] = { skuId: r.sku_id, caraUji: r.cara_uji ?? '', status: r.status, instruksi: petaInstruksi.get(r.sku_id) ?? '', diubahPada: r.diubah_pada, kriteria: [] };
  }
  for (const k of [...kriteria].sort((a, b) => a.urutan - b.urutan)) {
    hasil[k.sku_id]?.kriteria.push({
      id: Number(k.id), urutan: k.urutan, jenis: k.jenis, teks: k.teks, bobot: k.bobot, wajib: !!k.wajib, sumber: k.sumber ?? 'manual', panduan: petaPanduan.get(Number(k.id)) ?? '',
    });
  }
  return hasil;
}

/**
 * Catatan penilaian dengan instrumen (tabel sku_penilaian), lama ke baru:
 * [{ id, waktu, pengujiId, tanggalUji, skor, wajibOk, saran, hasil, diganti, catatan, rincian: [{ kriteriaId, urutan, jenis, teks, bobot, wajib, nilai }] }]
 * `rincian` adalah salinan kriteria saat penilaian dibuat, jadi tetap terbaca walau instrumen diubah kemudian.
 */
export const susunPenilaian = (baris = []) =>
  [...baris]
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((r) => ({
      id: Number(r.id), waktu: r.waktu, pengujiId: r.penguji_id ?? null, tanggalUji: tgl(r.tanggal_uji), skor: r.skor, wajibOk: !!r.wajib_ok,
      saran: r.saran, hasil: r.hasil, diganti: !!r.diganti, catatan: r.catatan ?? '',
      rincian: (Array.isArray(r.rincian) ? r.rincian : []).map((k) => ({
        kriteriaId: Number(k.kriteria_id), urutan: k.urutan, jenis: k.jenis, teks: k.teks, bobot: k.bobot, wajib: !!k.wajib, nilai: k.nilai,
        sumber: k.sumber ?? 'manual', saran: k.saran ?? null,
      })),
    }));

/** Sesi ujian: [{ id, nama, tanggal, tempat, catatan, status, dibuatOleh, butir: [butirId], peserta: [pesertaId] }], tanggal terbaru dulu. */
export function susunSesiUjian(sesi = [], butir = [], peserta = []) {
  const b = new Map();
  const p = new Map();
  for (const r of butir) (b.get(r.sesi_id) ?? b.set(r.sesi_id, []).get(r.sesi_id)).push(r.butir_id);
  for (const r of peserta) (p.get(r.sesi_id) ?? p.set(r.sesi_id, []).get(r.sesi_id)).push(r.peserta_id);
  return sesi
    .map((s) => ({
      id: s.id, nama: s.nama, tanggal: tgl(s.tanggal), tempat: s.tempat ?? '', catatan: s.catatan ?? '', status: s.status,
      dibuatOleh: s.dibuat_oleh ?? null, butir: b.get(s.id) ?? [], peserta: p.get(s.id) ?? [],
    }))
    .sort((x, y) => y.tanggal.localeCompare(x.tanggal) || y.id - x.id);
}

/** Baris iuran -> { [tanggal]: { [pesertaId]: { jumlah, jenis, oleh, waktu } } } */
export function susunIuran(baris = []) {
  const hasil = {};
  for (const r of baris) (hasil[tgl(r.tanggal)] ??= {})[r.peserta_id] = { jumlah: r.jumlah, jenis: r.jenis, oleh: r.oleh ?? null, waktu: r.waktu };
  return hasil;
}

/** Baris iuran_kas -> { [tanggal]: { totalFisik, catatan, oleh, waktu } } */
export const susunKas = (baris = []) =>
  Object.fromEntries(baris.map((r) => [tgl(r.tanggal), { totalFisik: r.total_fisik, catatan: r.catatan ?? '', oleh: r.oleh ?? null, waktu: r.waktu }]));

/** Baris asisten_iuran -> [{ pesertaId, ditunjukOleh, ditunjukPada }] */
export const susunAsisten = (baris = []) =>
  baris.map((r) => ({ pesertaId: r.peserta_id, ditunjukOleh: r.ditunjuk_oleh ?? null, ditunjukPada: r.ditunjuk_pada }));

/** Daftar dari sg_iuran_lembar -> [{ id, nama, kelas, sangga, status, jumlah, jenis }] (bidang kosong dinormalkan) */
export const susunLembarIuran = (baris = []) =>
  baris.map((r) => ({ id: r.id, nama: r.nama, kelas: r.kelas ?? '', sangga: r.sangga ?? '', status: r.status ?? null, jumlah: r.jumlah ?? null, jenis: r.jenis ?? null }));

/** Baris raport satu semester -> { [pesertaId]: baris } */
export const susunRaport = (baris = []) => Object.fromEntries(baris.map((r) => [r.peserta_id, petaRaport(r)]));

/** Baris penugasan_rombel -> [{ rombel, pengujiId, ditetapkanPada }] */
export const susunPenugasan = (baris = []) =>
  baris.map((r) => ({ rombel: r.rombel, pengujiId: r.penguji_id, ditetapkanPada: r.ditetapkan_pada }));

/** Baris penugasan_peserta (penugasan khusus satu Penegak) -> [{ pesertaId, pengujiId, ditetapkanPada }] */
export const susunPenugasanPeserta = (baris = []) =>
  baris.map((r) => ({ pesertaId: r.peserta_id, pengujiId: r.penguji_id, ditetapkanPada: r.ditetapkan_pada }));

/** Baris penugasan_log -> [{ id, waktu, tahunAjaran, rombel, pengujiId, pengujiNama, tindakan, catatan, olehNama, pesertaId, pesertaNama }] (lama ke baru); pesertaId terisi bila penugasan khusus satu Penegak */
export const susunLogPenugasan = (baris = []) =>
  baris.map((r) => ({
    id: Number(r.id), waktu: r.waktu, tahunAjaran: r.tahun_ajaran, rombel: r.rombel, pengujiId: r.penguji_id ?? null,
    pengujiNama: r.penguji_nama, tindakan: r.tindakan, catatan: r.catatan ?? '', olehNama: r.oleh_nama ?? '',
    pesertaId: r.peserta_id ?? null, pesertaNama: r.peserta_nama ?? '',
  }));

/** Baris kepengurusan_log -> [{ id, waktu, pesertaId, pesertaNama, nis, tindakan, jabatanLama, jabatanBaru, alasan, olehNama }] (terbaru lebih dulu) */
export const susunLogKepengurusan = (baris = []) =>
  baris.map((r) => ({
    id: Number(r.id), waktu: r.waktu, pesertaId: r.peserta_id ?? null, pesertaNama: r.peserta_nama, nis: r.nis ?? '', tindakan: r.tindakan,
    jabatanLama: r.jabatan_lama ?? null, jabatanBaru: r.jabatan_baru ?? null, alasan: r.alasan ?? '', olehNama: r.oleh_nama ?? '',
  })).sort((a, b) => b.id - a.id);

/** Baris naik_kelas_batch -> [{ id, waktu, tahunAjaran, ringkasan, olehNama, dibatalkanPada }] (terbaru lebih dulu) */
export const susunBatchNaikKelas = (baris = []) =>
  baris.map((r) => ({
    id: Number(r.id), waktu: r.waktu, tahunAjaran: r.tahun_ajaran, ringkasan: r.ringkasan ?? {}, olehNama: r.oleh_nama ?? '', dibatalkanPada: r.dibatalkan_pada ?? null,
  })).sort((a, b) => b.id - a.id);

/** Baris naik_kelas_log -> [{ id, batchId, waktu, pesertaId, pesertaNama, nis, aksi, dariKelas, keKelas, dariStatus, keStatus, catatan, olehNama }] (terbaru lebih dulu) */
export const susunLogNaikKelas = (baris = []) =>
  baris.map((r) => ({
    id: Number(r.id), batchId: r.batch_id == null ? null : Number(r.batch_id), waktu: r.waktu, pesertaId: r.peserta_id ?? null, pesertaNama: r.peserta_nama, nis: r.nis ?? '',
    aksi: r.aksi, dariKelas: r.dari_kelas ?? null, keKelas: r.ke_kelas ?? null, dariStatus: r.dari_status, keStatus: r.ke_status, catatan: r.catatan ?? '', olehNama: r.oleh_nama ?? '',
  })).sort((a, b) => b.id - a.id);

/** Baris guru_agama -> [{ id, agama, nama, keterangan }] */
export const susunGuruAgama = (baris = []) =>
  baris.map((r) => ({ id: Number(r.id), agama: r.agama, nama: r.nama, keterangan: r.keterangan ?? '' }));

/**
 * Baris dokumen_terbit -> [{ id, token, kode, jenis, nomor, nomorUrut, tanggal, pesertaId, pesertaNama, penerbit, dibuatOlehNama, dibuatOlehJabatan,
 *   penandaTanganNama, penandaTanganJabatan, agama, nis, kelas, sangga, guru: { id, nama, keterangan }, butir: [id unit], catatan, dibuatPada,
 *   dicabutPada, dicabutAlasan }] (id kecil ke besar)
 */
export const susunDokumen = (baris = []) =>
  baris.map((r) => {
    const p = r.payload ?? {};
    return {
      id: Number(r.id), token: r.token, kode: r.kode, jenis: r.jenis, nomor: r.nomor, nomorUrut: r.nomor_urut ?? null, tanggal: tgl(r.tanggal),
      pesertaId: r.peserta_id ?? null, pesertaNama: r.peserta_nama, penerbit: r.penerbit,
      dibuatOlehNama: r.dibuat_oleh_nama, dibuatOlehJabatan: r.dibuat_oleh_jabatan ?? '',
      penandaTanganNama: r.penanda_tangan_nama, penandaTanganJabatan: r.penanda_tangan_jabatan,
      agama: p.agama ?? '', nis: p.nis ?? '', kelas: p.kelas ?? '', sangga: p.sangga ?? '',
      guru: { id: p.guru?.id ?? null, nama: p.guru?.nama ?? '', keterangan: p.guru?.keterangan ?? '' },
      butir: Array.isArray(p.butir) ? p.butir : [], catatan: p.catatan ?? '',
      dibuatPada: r.dibuat_pada, dicabutPada: r.dicabut_pada ?? null, dicabutAlasan: r.dicabut_alasan ?? '',
    };
  });

/** Baris notifikasi -> [{ id, jenis, judul, isi, tautan, dibuat, dibaca, dibacaPada }] (baru ke lama) */
export const susunNotifikasi = (baris = []) =>
  baris.map((r) => ({
    id: Number(r.id), jenis: r.jenis, judul: r.judul, isi: r.isi ?? '', tautan: r.tautan ?? {}, dibuat: r.dibuat,
    dibaca: !!r.dibaca_pada, dibacaPada: r.dibaca_pada ?? null, pushStatus: r.push_status ?? null,
  }));
