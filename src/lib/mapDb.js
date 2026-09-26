/**
 * PEMETAAN DATA SERVER -> BENTUK DATA APLIKASI (murni, tanpa React)
 *
 * Server menyimpan data dalam tabel (snake_case). Seluruh halaman aplikasi memakai bentuk data
 * bersarang berikut, sehingga lapisan ini menjembataninya:
 *
 *   users[]                        { id, username, role, nama, nis, kelas, sangga, agama, jabatan, jabatanDewan, pinsa, calonGaruda, nta,
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
    pinsa: r.pinsa ? true : undefined,
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

/** Baris kegiatan_usulan -> [{ id, jenis, tahunAjaran, tanggalUsul, dokumenUrl, catatan, status, diajukanOleh, diajukanOlehNama, diajukanPada,
 *  ditinjauOleh, ditinjauOlehNama, ditinjauPada, catatanTinjauan, dipingPada, agendaId }] (terbaru lebih dulu) */
export const susunUsulanKegiatan = (baris = []) =>
  baris.map((r) => ({
    id: Number(r.id), jenis: r.jenis, tahunAjaran: r.tahun_ajaran, tanggalUsul: tgl(r.tanggal_usul), dokumenUrl: r.dokumen_url, catatan: r.catatan ?? '',
    status: r.status, diajukanOleh: r.diajukan_oleh ?? null, diajukanOlehNama: r.diajukan_oleh_nama ?? '', diajukanPada: r.diajukan_pada,
    ditinjauOleh: r.ditinjau_oleh ?? null, ditinjauOlehNama: r.ditinjau_oleh_nama ?? '', ditinjauPada: r.ditinjau_pada ?? null,
    catatanTinjauan: r.catatan_tinjauan ?? '', dipingPada: r.diping_pada ?? null, agendaId: r.agenda_id ?? null,
  })).sort((a, b) => b.id - a.id);

/**
 * Hasil sg_garuda_berkas_baca / sg_garuda_token_baca (tahap L7) -> { peserta, progress, portofolio, users, token }.
 * `progress` dan `portofolio` memakai bentuk bersarang yang SAMA dengan halaman biasa (susunProgress/susunPortofolio di atas),
 * jadi komponen cetak (KartuSku, dst.) dapat dipakai ulang apa adanya baik untuk Pembina/Admin yang sudah masuk maupun
 * pengunjung tautan berbagi tanpa login (lihat src/components/BerkasGaruda.jsx).
 */
export function susunBerkasGaruda(raw) {
  const p = raw.peserta ?? {};
  return {
    peserta: {
      id: p.id, nama: p.nama, nis: p.nis ?? '', kelas: p.kelas ?? '', sangga: p.sangga ?? '', agama: p.agama ?? '',
      nta: p.nta ?? '', jenisKelamin: p.jenis_kelamin ?? null, calonGaruda: p.calon_garuda ? tgl(p.calon_garuda) : null,
      peran: 'calon-garuda',
    },
    progress: susunProgress(raw.sku_progress, raw.sku_riwayat),
    portofolio: susunPortofolio(raw.portofolio, raw.portofolio_jurnal),
    users: (raw.users ?? []).map((u) => ({ id: u.id, nama: u.nama, jabatan: u.jabatan ?? null })),
    token: raw.token ?? null,
  };
}

/** Baris agenda -> [{ id, tahunAjaran, jenis, judul, tanggal, keterangan, pesertaTerkait, lewatiBatas, dibuatOleh, dibuatPada }] (tanggal lebih dekat dulu) */
export const susunAgenda = (baris = []) =>
  baris.map((r) => ({
    id: Number(r.id), tahunAjaran: r.tahun_ajaran, jenis: r.jenis, judul: r.judul, tanggal: tgl(r.tanggal), keterangan: r.keterangan ?? '',
    pesertaTerkait: r.peserta_terkait ?? [], lewatiBatas: !!r.lewati_batas, dibuatOleh: r.dibuat_oleh ?? null, dibuatPada: r.dibuat_pada,
  })).sort((a, b) => a.tanggal.localeCompare(b.tanggal));

/** Baris pelantikan -> [{ id, pesertaId, tingkat ('bantara'|'laksana'), tanggal, tempat, agendaId, catatan, dicatatOleh, dicatatPada }], tanggal terbaru dulu. */
export const susunPelantikan = (baris = []) =>
  baris.map((r) => ({
    id: Number(r.id), pesertaId: r.peserta_id, tingkat: r.tingkat, tanggal: tgl(r.tanggal), tempat: r.tempat, agendaId: r.agenda_id == null ? null : Number(r.agenda_id),
    catatan: r.catatan ?? '', dicatatOleh: r.dicatat_oleh ?? null, dicatatPada: r.dicatat_pada,
  })).sort((a, b) => b.tanggal.localeCompare(a.tanggal) || a.id - b.id);

/** Baris saka_anggota -> [{ id, pesertaId, saka, tanggalMasuk, status ('aktif'|'selesai'), tanggalSelesai, suratUrl, catatan, dicatatPada }], nama Saka lalu tanggal masuk. */
export const susunSaka = (baris = []) =>
  baris.map((r) => ({
    id: Number(r.id), pesertaId: r.peserta_id, saka: r.saka, tanggalMasuk: tgl(r.tanggal_masuk), status: r.status, tanggalSelesai: r.tanggal_selesai ? tgl(r.tanggal_selesai) : null,
    suratUrl: r.surat_url ?? '', catatan: r.catatan ?? '', dicatatPada: r.dicatat_pada,
  })).sort((a, b) => a.saka.localeCompare(b.saka, 'id') || a.tanggalMasuk.localeCompare(b.tanggalMasuk));

/**
 * Baris tim_penilai dan tim_penilai_anggota -> [{ id, tahunAjaran, untuk ('putra'|'putri'), nomorSk, tanggalSk, skUrl, catatan, dicatatPada,
 * anggota: [{ id, urut, nama, unsur, jabatan, keterangan }] }], tahun ajaran terbaru lalu putra dahulu.
 */
export const susunTimPenilai = (tim = [], anggota = []) =>
  tim.map((t) => ({
    id: Number(t.id), tahunAjaran: t.tahun_ajaran, untuk: t.untuk, nomorSk: t.nomor_sk ?? '', tanggalSk: t.tanggal_sk ? tgl(t.tanggal_sk) : null, skUrl: t.sk_url ?? '', catatan: t.catatan ?? '',
    dicatatPada: t.dicatat_pada,
    anggota: anggota.filter((a) => Number(a.tim_id) === Number(t.id)).map((a) => ({ id: Number(a.id), urut: Number(a.urut), nama: a.nama, unsur: a.unsur, jabatan: a.jabatan, keterangan: a.keterangan ?? '' })).sort((a, b) => a.urut - b.urut),
  })).sort((a, b) => b.tahunAjaran.localeCompare(a.tahunAjaran) || (a.untuk === b.untuk ? 0 : a.untuk === 'putra' ? -1 : 1));

/** Baris garuda_tahap -> [{ id, tahunAjaran, tahap, mulai, akhir (atau null), catatan, dicatatPada }]. */
export const susunGarudaTahap = (baris = []) =>
  baris.map((r) => ({ id: Number(r.id), tahunAjaran: r.tahun_ajaran, tahap: r.tahap, mulai: tgl(r.mulai), akhir: r.akhir ? tgl(r.akhir) : null, catatan: r.catatan ?? '', dicatatPada: r.dicatat_pada }));

/** Baris tanggal_lahir -> [{ pesertaId, tanggal (YYYY-MM-DD), dicatatPada }]. */
export const susunTanggalLahir = (baris = []) => baris.map((r) => ({ pesertaId: r.peserta_id, tanggal: tgl(r.tanggal), dicatatPada: r.dicatat_pada }));

/** Baris penegak_isian dan tanggal_lahir (satu Penegak) -> { isian: { kunci: nilai }, lahir: 'YYYY-MM-DD' atau null }. */
export const susunIsian = (baris = [], lahir = []) => ({
  isian: Object.fromEntries(baris.map((r) => [r.kunci, r.nilai])),
  lahir: lahir[0]?.tanggal ? tgl(lahir[0].tanggal) : null,
});

/** Baris portofolio_snapshot -> [{ id, pesertaId, tahunAjaran, catatan, isi, dibuatOlehNama, dibuatPada }], terbaru dulu. */
export const susunSnapshot = (baris = []) =>
  baris.map((r) => ({ id: Number(r.id), pesertaId: r.peserta_id, tahunAjaran: r.tahun_ajaran, catatan: r.catatan ?? '', isi: r.isi ?? {}, dibuatOlehNama: r.dibuat_oleh_nama ?? '', dibuatPada: r.dibuat_pada }))
    .sort((a, b) => String(b.dibuatPada).localeCompare(String(a.dibuatPada)) || b.id - a.id);

/** Baris dokumen_templat -> [{ id, tahunAjaran, jenis, isi: { uji, baris, pita } }], tahun ajaran terbaru dulu. */
export const susunTemplatDokumen = (baris = []) =>
  baris.map((r) => ({
    id: Number(r.id), tahunAjaran: r.tahun_ajaran, jenis: r.jenis,
    isi: { uji: r.isi?.uji ?? '', baris: Array.isArray(r.isi?.baris) ? r.isi.baris : [], pita: Array.isArray(r.isi?.pita) ? r.isi.pita : null },
  })).sort((a, b) => b.tahunAjaran.localeCompare(a.tahunAjaran) || a.jenis.localeCompare(b.jenis));

/** Nilai pengaturan 'garuda.gerbang' -> { kelasMin, lahirDari, lahirSampai, kuotaPersen } yang aman (bentuk rusak atau belum ada = `bawaan`). */
export const susunGerbang = (nilai, bawaan) =>
  nilai && ['X', 'XI', 'XII'].includes(nilai.kelasMin) && /^\d{4}-\d{2}-\d{2}$/.test(nilai.lahirDari ?? '') && /^\d{4}-\d{2}-\d{2}$/.test(nilai.lahirSampai ?? '') && Number.isInteger(nilai.kuotaPersen)
    ? { kelasMin: nilai.kelasMin, lahirDari: nilai.lahirDari, lahirSampai: nilai.lahirSampai, kuotaPersen: nilai.kuotaPersen }
    : bawaan;

/** Baris spg_penetapan -> [{ pesertaId, butir, nilai (100|0), tanggal, catatan, timpa, dicatatPada }], urut Penegak lalu butir. */
export const susunSpg = (baris = []) =>
  baris.map((r) => ({
    pesertaId: r.peserta_id, butir: Number(r.butir), nilai: Number(r.nilai), tanggal: tgl(r.tanggal), catatan: r.catatan ?? '', timpa: !!r.timpa, dicatatPada: r.dicatat_pada,
  })).sort((a, b) => a.pesertaId.localeCompare(b.pesertaId) || a.butir - b.butir);

/** Baris tkk_capaian -> [{ id, pesertaId, tkkId, tingkat ('purwa'|'madya'|'utama'), tanggal, penguji1, penguji2, melatih, buktiUrl, catatan, dicatatPada }], tanggal terbaru dulu. */
export const susunTkkCapaian = (baris = []) =>
  baris.map((r) => ({
    id: Number(r.id), pesertaId: r.peserta_id, tkkId: r.tkk_id, tingkat: r.tingkat, tanggal: tgl(r.tanggal), penguji1: r.penguji1, penguji2: r.penguji2, melatih: r.melatih,
    buktiUrl: r.bukti_url ?? '', catatan: r.catatan ?? '', dicatatPada: r.dicatat_pada,
  })).sort((a, b) => b.tanggal.localeCompare(a.tanggal) || a.id - b.id);

/** Baris tkk_krida -> [{ id, pesertaId, nama, saka, tanggal, buktiUrl, catatan, dicatatPada }], tanggal terbaru dulu. */
export const susunTkkKrida = (baris = []) =>
  baris.map((r) => ({
    id: Number(r.id), pesertaId: r.peserta_id, nama: r.nama, saka: r.saka ?? '', tanggal: tgl(r.tanggal), buktiUrl: r.bukti_url ?? '', catatan: r.catatan ?? '', dicatatPada: r.dicatat_pada,
  })).sort((a, b) => b.tanggal.localeCompare(a.tanggal) || a.id - b.id);

/**
 * Baris tkk_pengajuan -> [{ id, pesertaId, tkkId, tingkat, tanggal, penguji1, penguji2, melatih, buktiUrl, catatan, status ('menunggu'|'disetujui'|'ditolak'|'dibatalkan'),
 * diajukanPada, ditinjauNama, ditinjauPada, catatanTinjauan, capaianId }], yang menunggu dan terbaru lebih dulu.
 */
export const susunTkkPengajuan = (baris = []) =>
  baris.map((r) => ({
    id: Number(r.id), pesertaId: r.peserta_id, tkkId: r.tkk_id, tingkat: r.tingkat, tanggal: tgl(r.tanggal), penguji1: r.penguji1, penguji1Id: r.penguji1_id ?? null, penguji2: r.penguji2, pengujiAwal: r.penguji_awal ?? '', melatih: r.melatih,
    buktiUrl: r.bukti_url ?? '', catatan: r.catatan ?? '', status: r.status, diajukanPada: r.diajukan_pada, ditinjauNama: r.ditinjau_nama ?? null, ditinjauPada: r.ditinjau_pada ?? null,
    catatanTinjauan: r.catatan_tinjauan ?? '', capaianId: r.capaian_id == null ? null : Number(r.capaian_id),
  })).sort((a, b) => Number(b.status === 'menunggu') - Number(a.status === 'menunggu') || b.id - a.id);

/** Nilai pengaturan 'tkk.ambang' -> { total, madya, utamaWajib } yang aman (bentuk rusak atau belum ada = `bawaan`). */
export const susunAmbangTkk = (nilai, bawaan) =>
  nilai && Number.isInteger(nilai.total) && Number.isInteger(nilai.madya) && Array.isArray(nilai.utamaWajib) && nilai.utamaWajib.every((x) => typeof x === 'string')
    ? { total: nilai.total, madya: nilai.madya, utamaWajib: nilai.utamaWajib }
    : bawaan;

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

/** Baris pengukuhan_dewan -> [{ tahunAjaran, nomorSk, tanggalSk, rekomNomor, rekomTanggal, catatan, diubahPada }] (tahun ajaran terbaru lebih dulu) */
export const susunPengukuhanDewan = (baris = []) =>
  baris.map((r) => ({
    tahunAjaran: r.tahun_ajaran, nomorSk: r.nomor_sk, tanggalSk: String(r.tanggal_sk).slice(0, 10), rekomNomor: r.rekomendasi_nomor ?? '',
    rekomTanggal: r.rekomendasi_tanggal ? String(r.rekomendasi_tanggal).slice(0, 10) : '', catatan: r.catatan ?? '', diubahPada: r.diubah_pada ?? null,
  })).sort((a, b) => b.tahunAjaran.localeCompare(a.tahunAjaran));

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

/* ---------------- Pinsa dan Bina Damping (fase B) ---------------- */

/** sg_pendampingan_saya -> { binaDamping: [rombel], pinsa } (rombel yang saya dampingi pada tahun ajaran berjalan, dan apakah saya Pinsa). */
export const susunPendampingan = (d) => ({ binaDamping: Array.isArray(d?.bina_damping) ? d.bina_damping : [], pinsa: !!d?.pinsa });

/** Baris sku_pra_uji -> { id, pesertaId, skuId, tahap, status, jadwal, catatanPeserta, penilaiId, penilaiNama, catatan, dibuat, diputuskanPada } (id = nomor urut). */
export const petaPraUji = (r) => ({
  id: Number(r.id),
  pesertaId: r.peserta_id,
  skuId: r.sku_id,
  tahap: r.tahap,
  status: r.status,
  jadwal: r.jadwal ?? null,
  catatanPeserta: r.catatan_peserta ?? '',
  penilaiId: r.penilai_id ?? null,
  penilaiNama: r.penilai_nama ?? null,
  catatan: r.catatan ?? '',
  dibuat: r.dibuat,
  diputuskanPada: r.diputuskan_pada ?? null,
});

/**
 * sg_pra_uji_antrian -> { aktif, menunggu: [{ id, pesertaId, pesertaNama, kelas, sangga, skuId, tahap, jadwal, catatanPeserta, dibuat }],
 * selesai: [{ id, pesertaId, pesertaNama, kelas, sangga, skuId, tahap, status, catatan, diputuskanPada }] }.
 */
export const susunAntrianPraUji = (d) => ({
  aktif: !!d?.aktif,
  menunggu: (d?.menunggu ?? []).map((r) => ({
    id: Number(r.id), pesertaId: r.peserta_id, pesertaNama: r.peserta_nama, kelas: r.kelas ?? '', sangga: r.sangga ?? '', skuId: r.sku_id,
    tahap: r.tahap, jadwal: r.jadwal ?? null, catatanPeserta: r.catatan_peserta ?? '', dibuat: r.dibuat,
  })),
  selesai: (d?.selesai ?? []).map((r) => ({
    id: Number(r.id), pesertaId: r.peserta_id, pesertaNama: r.peserta_nama, kelas: r.kelas ?? '', sangga: r.sangga ?? '', skuId: r.sku_id,
    tahap: r.tahap, status: r.status, catatan: r.catatan ?? '', diputuskanPada: r.diputuskan_pada ?? null,
  })),
});

/**
 * sg_sangga_rombel -> { rombel, tahunAjaran, bisaAtur, binaDamping: [{ id, nama, tingkat }], anggota: [{ id, nama, sangga, pinsa, tingkat, layakPinsa }],
 * peringatan: [{ sangga, teks }] }. tingkat = 'calon-bantara' | 'calon-laksana' | 'laksana' atau null (tidak boleh dilihat).
 */
export const susunSanggaRombel = (d) => ({
  rombel: d.rombel,
  tahunAjaran: d.tahun_ajaran,
  bisaAtur: !!d.bisa_atur,
  binaDamping: (d.bina_damping ?? []).map((b) => ({ id: b.id, nama: b.nama, tingkat: b.tingkat ?? null })),
  anggota: (d.anggota ?? []).map((a) => ({ id: a.id, nama: a.nama, sangga: a.sangga, pinsa: !!a.pinsa, tingkat: a.tingkat ?? null, layakPinsa: !!a.layak_pinsa })),
  peringatan: (d.peringatan ?? []).map((p) => ({ sangga: p.sangga ?? null, teks: p.teks })),
});

/**
 * sg_bina_damping_daftar -> { tahunAjaran, bisaAtur, penugasan: [{ rombel, id, nama, kelas, jabatanDewan, tingkat }],
 * calon: [{ id, nama, kelas, jabatanDewan, tingkat, rombel }] } (calon = Penegak berjabatan Dewan minimal Calon Laksana, yang sudah Laksana lebih dulu).
 */
export const susunBinaDamping = (d) => ({
  tahunAjaran: d.tahun_ajaran,
  bisaAtur: !!d.bisa_atur,
  penugasan: (d.penugasan ?? []).map((p) => ({ rombel: p.rombel, id: p.penegak_id, nama: p.nama, kelas: p.kelas ?? null, jabatanDewan: p.jabatan_dewan ?? null, tingkat: p.tingkat })),
  calon: (d.calon ?? []).map((c) => ({ id: c.id, nama: c.nama, kelas: c.kelas ?? null, jabatanDewan: c.jabatan_dewan ?? null, tingkat: c.tingkat, rombel: c.rombel ?? null })),
});
