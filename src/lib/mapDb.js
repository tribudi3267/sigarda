/**
 * PEMETAAN DATA SERVER -> BENTUK DATA APLIKASI (murni, tanpa React)
 *
 * Server menyimpan data dalam tabel (snake_case). Seluruh halaman aplikasi memakai bentuk data
 * bersarang berikut, sehingga lapisan ini menjembataninya:
 *
 *   users[]                        { id, username, role, nama, nis, kelas, sangga, agama, jabatan, calonGaruda, nta,
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

/** Baris raport satu semester -> { [pesertaId]: baris } */
export const susunRaport = (baris = []) => Object.fromEntries(baris.map((r) => [r.peserta_id, petaRaport(r)]));
