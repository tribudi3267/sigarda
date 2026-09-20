/**
 * LOGIKA NILAI RAPORT EKSTRAKURIKULER (murni, tanpa React)
 *
 * Skor 0-100 = rata-rata tertimbang tiga komponen (bobot bawaan 40 / 40 / 20):
 *   kehadiran  persen hadir pada latihan Jumat semester itu (H dibagi H+I+S+A; yang belum dicatat tidak dihitung)
 *   capaian    butir SKU tingkat itu yang lulus DALAM semester itu, dibagi target per semester (Bantara 12, Laksana 11), maks 100
 *   sikap      penilaian Pembina 1-5, dikali 20
 * Bila kehadiran atau sikap belum ada, bobotnya dialihkan ke komponen lain (skor tampil sementara). Predikat dari pita nilai
 * (bawaan A >= 90, B >= 75, C >= 60, D di bawahnya).
 *
 * Seluruh pembulatan memakai bilangan bulat (setengah ke atas) agar sama persis dengan fungsi hitung di server
 * (sigarda.raport_skor, sigarda.raport_predikat, sigarda.raport_hitung di supabase/sumber/inti.sql); dijaga oleh pengujian.
 * Server selalu menghitung ulang; angka di sini untuk tampilan dan untuk saran deskripsi.
 */
import { rentangPeriode } from './absensiLogic';
import { butirPeserta, getEntry } from './skuLogic';

export const KUNCI_PENGATURAN_RAPORT = 'raport.pengaturan';

export const PENGATURAN_RAPORT_BAWAAN = {
  pita: { sangatBaik: 90, baik: 75, cukup: 60 },
  bobot: { kehadiran: 40, capaian: 40, sikap: 20 },
  target: { Bantara: 12, Laksana: 11 },
};

export const PREDIKAT = {
  A: { huruf: 'A', label: 'Sangat Baik', kelas: 'bg-emerald-100 text-emerald-900 ring-emerald-300' },
  B: { huruf: 'B', label: 'Baik', kelas: 'bg-sky-100 text-sky-900 ring-sky-300' },
  C: { huruf: 'C', label: 'Cukup', kelas: 'bg-amber-100 text-amber-900 ring-amber-300' },
  D: { huruf: 'D', label: 'Kurang', kelas: 'bg-red-100 text-red-900 ring-red-300' },
};

export const SIKAP = {
  1: 'Kurang', 2: 'Cukup kurang', 3: 'Cukup', 4: 'Baik', 5: 'Sangat baik',
};

export const KARAKTER_SARAN = [
  'Mandiri', 'Disiplin', 'Kerja sama', 'Tanggung jawab', 'Jujur', 'Peduli',
  'Percaya diri', 'Kepemimpinan', 'Kreatif', 'Tangguh',
];
export const MAKS_KARAKTER = 6;
export const MAKS_DESKRIPSI = 1200;
export const MAKS_CATATAN = 300;

const bulat = (v) => (Number.isInteger(v) ? v : null);

/** Pembulatan a/b setengah ke atas, khusus bilangan bulat tak negatif dan b > 0. */
export const bagiBulat = (a, b) => Math.floor((2 * a + b) / (2 * b));

/** Pengaturan tersimpan (bisa kosong atau sebagian) digabung dengan bawaan, per isian. */
export function gabungPengaturan(tersimpan) {
  const t = tersimpan && typeof tersimpan === 'object' ? tersimpan : {};
  const ambil = (bagian, kunci) => bulat(t?.[bagian]?.[kunci]) ?? PENGATURAN_RAPORT_BAWAAN[bagian][kunci];
  return {
    pita: { sangatBaik: ambil('pita', 'sangatBaik'), baik: ambil('pita', 'baik'), cukup: ambil('pita', 'cukup') },
    bobot: { kehadiran: ambil('bobot', 'kehadiran'), capaian: ambil('bobot', 'capaian'), sikap: ambil('bobot', 'sikap') },
    target: { Bantara: ambil('target', 'Bantara'), Laksana: ambil('target', 'Laksana') },
  };
}

/** Pesan galat (bahasa Indonesia) atau '' bila pengaturan sah. Aturan sama dengan sg_raport_pengaturan_simpan. */
export function periksaPengaturan(p) {
  const semua = [
    ['Batas Sangat Baik', p.pita.sangatBaik], ['Batas Baik', p.pita.baik], ['Batas Cukup', p.pita.cukup],
    ['Bobot kehadiran', p.bobot.kehadiran], ['Bobot capaian SKU', p.bobot.capaian], ['Bobot sikap', p.bobot.sikap],
    ['Target Bantara', p.target.Bantara], ['Target Laksana', p.target.Laksana],
  ];
  for (const [nama, v] of semua) if (!Number.isInteger(v) || v < 0 || v > 999) return `${nama} harus berupa bilangan bulat.`;
  const { sangatBaik, baik, cukup } = p.pita;
  if (!(sangatBaik <= 100 && sangatBaik > baik && baik > cukup && cukup >= 1)) {
    return 'Batas nilai harus berurutan: Sangat Baik (maks. 100) lebih besar dari Baik, Baik lebih besar dari Cukup, Cukup minimal 1.';
  }
  const jumlah = p.bobot.kehadiran + p.bobot.capaian + p.bobot.sikap;
  if (jumlah !== 100) return `Jumlah bobot harus 100 (sekarang ${jumlah}).`;
  if (p.bobot.capaian < 1) return 'Bobot capaian SKU minimal 1.';
  if (p.target.Bantara < 1 || p.target.Bantara > 60 || p.target.Laksana < 1 || p.target.Laksana > 60) {
    return 'Target butir per semester harus antara 1 dan 60.';
  }
  return '';
}

/** Skor 0-100 (bilangan bulat) atau null. `kehadiran` dan `sikap` boleh null. */
export function hitungSkor({ kehadiran, lulus, target, sikap }, pengaturan) {
  const { bobot } = pengaturan;
  const capaian = Math.min(100, bagiBulat(lulus * 100, target));
  let w = bobot.capaian;
  let jumlah = bobot.capaian * capaian;
  if (kehadiran != null) { w += bobot.kehadiran; jumlah += bobot.kehadiran * kehadiran; }
  if (sikap != null) { w += bobot.sikap; jumlah += bobot.sikap * sikap * 20; }
  return w === 0 ? null : bagiBulat(jumlah, w);
}

export const persenCapaian = (lulus, target) => Math.min(100, bagiBulat(lulus * 100, target));
export const persenKehadiran = (hadir, dicatat) => (dicatat > 0 ? bagiBulat(hadir * 100, dicatat) : null);

export function predikatDariSkor(skor, pengaturan) {
  if (skor == null) return null;
  const { sangatBaik, baik, cukup } = pengaturan.pita;
  if (skor >= sangatBaik) return 'A';
  if (skor >= baik) return 'B';
  if (skor >= cukup) return 'C';
  return 'D';
}

/* ---------------------- Bahan hitung dari data aplikasi ---------------------- */

/**
 * Kehadiran dan capaian SKU satu peserta pada satu semester. `absensi` harus sudah memuat semester itu.
 * Butir dihitung lulus pada semester ini bila SELURUH unitnya lulus dan tanggal uji terakhirnya jatuh dalam semester.
 * `butirTerakhir` = nomor butir tertinggi yang sudah lulus sampai akhir semester (untuk kalimat deskripsi).
 */
export function hitungBahan(progress, absensi, peserta, tingkat, tahunAjaran, semester) {
  const { mulai, akhir } = rentangPeriode(tahunAjaran, semester);
  let hadir = 0;
  let dicatat = 0;
  for (const [tanggal, catatan] of Object.entries(absensi?.hadir ?? {})) {
    if (tanggal < mulai || tanggal > akhir) continue;
    const st = catatan?.[peserta.id]?.status;
    if (st === 'H') { hadir += 1; dicatat += 1; } else if (st === 'I' || st === 'S' || st === 'A') dicatat += 1;
  }
  let lulus = 0;
  let butirTerakhir = 0;
  let lulusSampaiAkhir = 0;
  const butir = butirPeserta(tingkat, peserta.agama);
  for (const b of butir) {
    const entri = b.unit.map((u) => getEntry(progress, peserta.id, u.id));
    if (!entri.every((e) => e.status === 'lulus')) continue;
    const tgl = entri.map((e) => e.tanggalUji).filter(Boolean).sort().pop();
    if (!tgl) continue;
    if (tgl >= mulai && tgl <= akhir) lulus += 1;
    if (tgl <= akhir) { lulusSampaiAkhir += 1; butirTerakhir = Math.max(butirTerakhir, b.no); }
  }
  return {
    hadir, dicatat, kehadiran: persenKehadiran(hadir, dicatat),
    lulus, butirTotal: butir.length, butirTerakhir, seluruhLulus: butir.length > 0 && lulusSampaiAkhir === butir.length,
  };
}

/** Bantara sampai seluruh butirnya lulus SEBELUM semester ini dimulai; sesudahnya Laksana. Pembina dapat mengubahnya. */
export function tingkatBawaan(progress, peserta, tahunAjaran, semester) {
  const { mulai } = rentangPeriode(tahunAjaran, semester);
  const butir = butirPeserta('Bantara', peserta.agama);
  const selesaiSebelum = butir.length > 0 && butir.every((b) => {
    const entri = b.unit.map((u) => getEntry(progress, peserta.id, u.id));
    if (!entri.every((e) => e.status === 'lulus')) return false;
    const tgl = entri.map((e) => e.tanggalUji).filter(Boolean).sort().pop();
    return Boolean(tgl) && tgl < mulai;
  });
  return selesaiSebelum ? 'Laksana' : 'Bantara';
}

/* ---------------------- Deskripsi capaian (saran) ---------------------- */

const daftarKarakter = (daftar) => {
  const k = daftar.map((s) => s.toLowerCase());
  if (k.length <= 1) return k.join('');
  if (k.length === 2) return `${k[0]} dan ${k[1]}`;
  return `${k.slice(0, -1).join(', ')}, dan ${k[k.length - 1]}`;
};

const KONSISTEN = { 5: 'sangat konsisten', 4: 'konsisten', 3: 'cukup konsisten', 2: 'masih perlu dikembangkan', 1: 'masih perlu dikembangkan' };

/**
 * Saran deskripsi capaian dari templat Pembina. Hanya SARAN: Pembina menyunting lalu menandainya final.
 *   "Peserta didik menunjukkan [Sangat Baik/Baik/Cukup] dalam keaktifan latihan mingguan. Telah menyelesaikan pengujian SKU
 *    Penegak [tingkat] hingga butir ke-[N], serta menunjukkan perkembangan sikap [karakter] yang sangat konsisten dalam aktivitas Ambalan."
 */
export function saranDeskripsi({ tingkat, kehadiran, butirTerakhir, seluruhLulus, sikap, karakter }, pengaturan) {
  let a;
  if (kehadiran == null) a = 'Kehadiran latihan mingguan pada semester ini belum tercatat.';
  else {
    const { sangatBaik, baik, cukup } = pengaturan.pita;
    if (kehadiran >= sangatBaik) a = 'Peserta didik menunjukkan Sangat Baik dalam keaktifan latihan mingguan.';
    else if (kehadiran >= baik) a = 'Peserta didik menunjukkan Baik dalam keaktifan latihan mingguan.';
    else if (kehadiran >= cukup) a = 'Peserta didik menunjukkan Cukup dalam keaktifan latihan mingguan.';
    else a = 'Peserta didik perlu meningkatkan keaktifan dalam latihan mingguan.';
  }
  let b;
  if (seluruhLulus) b = `Telah menyelesaikan seluruh butir pengujian SKU Penegak ${tingkat}`;
  else if (butirTerakhir > 0) b = `Telah menyelesaikan pengujian SKU Penegak ${tingkat} hingga butir ke-${butirTerakhir}`;
  else b = `Sedang menjalani proses pengujian SKU Penegak ${tingkat}`;
  let c = '.';
  if (sikap != null) {
    const kar = karakter?.length ? ` ${daftarKarakter(karakter)}` : '';
    c = `, serta menunjukkan perkembangan sikap${kar} yang ${KONSISTEN[sikap]} dalam aktivitas Ambalan.`;
  }
  return `${a} ${b}${c}`;
}

/* ---------------------- Baris raport per peserta ---------------------- */

/**
 * Menyusun satu baris tabel raport untuk satu peserta pada satu semester.
 * Baris berstatus FINAL memakai angka yang tersimpan (tidak ikut berubah bila absensi atau pengaturan berubah); `berubah`
 * menandai bila hitungan terbaru berbeda dari yang tersimpan. Baris lain selalu memakai hitungan terbaru.
 * `tersimpan` = baris petaRaport() atau undefined.
 */
export function susunBaris({ peserta, progress, absensi, tahunAjaran, semester, tersimpan, pengaturan }) {
  const tingkat = tersimpan?.tingkat ?? tingkatBawaan(progress, peserta, tahunAjaran, semester);
  const bahan = hitungBahan(progress, absensi, peserta, tingkat, tahunAjaran, semester);
  const target = pengaturan.target[tingkat];
  const sikap = tersimpan?.sikap ?? null;
  const skorBaru = hitungSkor({ kehadiran: bahan.kehadiran, lulus: bahan.lulus, target, sikap }, pengaturan);
  const predikatBaru = predikatDariSkor(skorBaru, pengaturan);

  const final = tersimpan?.status === 'final';
  const tetap = final; // angka final dibekukan
  const skor = tetap ? tersimpan.skor : skorBaru;
  const predikatHitung = tetap ? tersimpan.predikatHitung : predikatBaru;
  const predikatAkhir = tersimpan?.predikatAkhir ?? null;
  const dipakai = { ...bahan, ...(tetap ? { kehadiran: tersimpan.kehadiranPersen, hadir: tersimpan.hadir, dicatat: tersimpan.pertemuan, lulus: tersimpan.capaianLulus } : {}) };
  const targetPakai = tetap ? tersimpan.capaianTarget : target;

  return {
    peserta,
    tersimpan: tersimpan ?? null,
    tingkat,
    hadir: dipakai.hadir,
    dicatat: dipakai.dicatat,
    kehadiran: dipakai.kehadiran,
    lulus: dipakai.lulus,
    target: targetPakai,
    capaian: persenCapaian(dipakai.lulus, targetPakai),
    butirTerakhir: bahan.butirTerakhir,
    butirTotal: bahan.butirTotal,
    seluruhLulus: bahan.seluruhLulus,
    sikap,
    karakter: tersimpan?.karakter ?? [],
    skk: tersimpan?.skk ?? null,
    skor,
    predikatHitung,
    predikatAkhir,
    predikat: predikatAkhir ?? predikatHitung,
    catatanPredikat: tersimpan?.catatanPredikat ?? '',
    deskripsi: tersimpan?.deskripsi ?? '',
    status: final ? 'final' : tersimpan ? 'draf' : 'belum',
    berubah: final && (skorBaru !== tersimpan.skor || predikatBaru !== tersimpan.predikatHitung),
    lengkap: sikap != null && dipakai.kehadiran != null,
    saran: saranDeskripsi(
      { tingkat, kehadiran: dipakai.kehadiran, butirTerakhir: bahan.butirTerakhir, seluruhLulus: bahan.seluruhLulus, sikap, karakter: tersimpan?.karakter ?? [] },
      pengaturan,
    ),
  };
}

export const LABEL_STATUS = { belum: 'Belum dinilai', draf: 'Draf (saran)', final: 'Final' };

/** Ringkasan jumlah per status untuk kepala halaman. */
export function ringkasBaris(baris) {
  const r = { total: baris.length, belum: 0, draf: 0, final: 0, A: 0, B: 0, C: 0, D: 0 };
  for (const b of baris) {
    r[b.status] += 1;
    if (b.status === 'final' && b.predikat) r[b.predikat] += 1;
  }
  return r;
}
