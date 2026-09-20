/**
 * LOGIKA IURAN BUMBUNG KEPRAMUKAAN (murni, tanpa React)
 *
 * Iuran dicatat per Penegak per Jumat oleh Dewan Ambalan atau asisten bendahara (Penegak Calon Laksana yang ditunjuk).
 * Satu baris per Penegak per Jumat yang berisi iuran; tidak ada baris = tidak iuran. Yang izin atau sakit boleh menitip.
 *   iuran[tanggal][pesertaId] = { jumlah, jenis: 'rutin' | 'susulan', oleh, waktu }
 * Rekap untuk semua peran memakai jawaban sg_iuran_agregat (total per Jumat untuk gudep, sangga, dan kelas, tanpa nama).
 */

/** Tombol nominal cepat: kelipatan Rp 500 dari Rp 500 sampai Rp 5.000. */
export const NOMINAL_TOMBOL = Array.from({ length: 10 }, (_, i) => (i + 1) * 500);
/** Iuran standar per pertemuan (dasar rekomendasi iuran susulan). */
export const IURAN_STANDAR = 1000;
/** Ambang "rutin": persen pertemuan terlaksana yang harus berisi iuran (sama dengan ambang kehadiran). */
export const AMBANG_RUTIN = 75;
export const MAKS_IURAN = 1000000;

export const rupiah = (n) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;

/**
 * Membaca isian jumlah manual. Kosong atau 0 = tidak iuran (nilai null). Titik dan spasi pemisah ribuan diabaikan.
 * Hasil: { ok: true, nilai: number | null } atau { ok: false, pesan }.
 */
export function bacaJumlah(teks) {
  const t = String(teks ?? '').replace(/[.\s]/g, '').replace(/^rp/i, '');
  if (t === '') return { ok: true, nilai: null };
  if (!/^\d+$/.test(t)) return { ok: false, pesan: 'Isi angka saja, mis. 2500.' };
  const n = Number(t);
  if (n === 0) return { ok: true, nilai: null };
  if (n > MAKS_IURAN) return { ok: false, pesan: `Jumlah maksimal ${rupiah(MAKS_IURAN)}.` };
  return { ok: true, nilai: n };
}

/** Apakah jumlah ini salah satu tombol nominal (untuk menandai tombol yang aktif). */
export const adalahNominalTombol = (n) => NOMINAL_TOMBOL.includes(n);

/**
 * Rekap per Penegak dari `iuran` (lihat di atas) untuk pertemuan `sesiList` ([{ tanggal }]).
 * Hasil: [{ peserta, kali, rutin, susulan, total, totalSusulan, persen }] dengan persen = kali / jumlah pertemuan (bilangan bulat, null bila
 * belum ada pertemuan). Hanya Jumat yang termasuk `sesiList` yang dihitung.
 */
export function rekapPeserta(iuran, daftarPeserta, sesiList) {
  const tanggal = sesiList.map((s) => s.tanggal);
  return daftarPeserta.map((peserta) => {
    let rutin = 0, susulan = 0, total = 0, totalSusulan = 0;
    for (const t of tanggal) {
      const b = iuran?.[t]?.[peserta.id];
      if (!b) continue;
      total += b.jumlah;
      if (b.jenis === 'susulan') { susulan += 1; totalSusulan += b.jumlah; } else rutin += 1;
    }
    const kali = rutin + susulan;
    return { peserta, kali, rutin, susulan, total, totalSusulan, persen: tanggal.length ? Math.floor((kali * 100) / tanggal.length + 0.5) : null };
  });
}

/**
 * Meringkas jawaban sg_iuran_agregat ([{ tanggal, tipe, kunci, jumlah, susulan, orang }]) untuk rentang yang dimuat.
 * Hasil: { total, totalSusulan, kali, perTanggal: { [tanggal]: { jumlah, susulan, orang } }, sangga: [{ kunci, jumlah, susulan, kali }], kelas: [...] }
 * `kali` = jumlah catatan iuran (Penegak x Jumat), bukan jumlah orang unik.
 */
export function ringkasAgregat(agregat = []) {
  const hasil = { total: 0, totalSusulan: 0, kali: 0, perTanggal: {}, sangga: [], kelas: [] };
  const kelompok = { sangga: new Map(), kelas: new Map() };
  for (const a of agregat) {
    if (a.tipe === 'gudep') {
      hasil.perTanggal[a.tanggal] = { jumlah: a.jumlah, susulan: a.susulan, orang: a.orang };
      hasil.total += a.jumlah;
      hasil.totalSusulan += a.susulan;
      hasil.kali += a.orang;
    } else if (kelompok[a.tipe]) {
      const m = kelompok[a.tipe];
      const sekarang = m.get(a.kunci) ?? { kunci: a.kunci, jumlah: 0, susulan: 0, kali: 0 };
      sekarang.jumlah += a.jumlah;
      sekarang.susulan += a.susulan;
      sekarang.kali += a.orang;
      m.set(a.kunci, sekarang);
    }
  }
  const urut = (m) => [...m.values()].sort((x, y) => y.jumlah - x.jumlah || x.kunci.localeCompare(y.kunci, 'id', { numeric: true }));
  hasil.sangga = urut(kelompok.sangga);
  hasil.kelas = urut(kelompok.kelas);
  return hasil;
}

/* ------------------- Kaitan dengan SKU (butir iuran: Bantara 6 dan Laksana 6) ------------------- */

/** Pengaturan bawaan (sama dengan sigarda.iuran_angka di server). ambang = nilai 4; lima, tiga, dua = batas persen untuk nilai 5, 3, 2. */
export const PENGATURAN_IURAN_BAWAAN = { standar: IURAN_STANDAR, ambang: AMBANG_RUTIN, lima: 90, tiga: 65, dua: 50 };
export const BUTIR_IURAN = ['BAN-06', 'LAK-06'];

/** Pengaturan tersimpan (bisa kosong atau sebagian) digabung dengan bawaan, per isian. */
export function gabungPengaturanIuran(tersimpan) {
  const t = tersimpan && typeof tersimpan === 'object' ? tersimpan : {};
  const hasil = { ...PENGATURAN_IURAN_BAWAAN };
  for (const k of Object.keys(hasil)) if (Number.isInteger(t[k])) hasil[k] = t[k];
  return hasil;
}

/** Pesan galat atau '' (aturan sama dengan sg_iuran_pengaturan_simpan). */
export function periksaPengaturanIuran(p) {
  const wajib = ['standar', 'ambang', 'lima', 'tiga', 'dua'];
  if (!p || typeof p !== 'object' || wajib.some((k) => !Number.isInteger(p[k]) || p[k] < 0)) return 'Semua isian harus bilangan bulat.';
  if (p.standar < 500 || p.standar > 50000 || p.standar % 500 !== 0) return 'Iuran standar harus kelipatan Rp 500 antara Rp 500 dan Rp 50.000.';
  if (!(p.lima <= 100 && p.lima > p.ambang && p.ambang > p.tiga && p.tiga > p.dua && p.dua >= 1)) {
    return 'Batas persen harus berurutan: nilai 5 (maks. 100) > ambang rutin > nilai 3 > nilai 2 (minimal 1).';
  }
  return '';
}

/** Saran nilai kriteria (1-5) dari persen pertemuan beriuran; null bila belum ada pertemuan. Sama dengan sigarda.iuran_hitung. */
export function saranNilaiIuran(persen, p = PENGATURAN_IURAN_BAWAAN) {
  if (persen === null || persen === undefined) return null;
  if (persen >= p.lima) return 5;
  if (persen >= p.ambang) return 4;
  if (persen >= p.tiga) return 3;
  if (persen >= p.dua) return 2;
  return 1;
}

/**
 * Rekomendasi iuran susulan dari ringkasan (sg_iuran_ringkas): tebus sebanyak kekurangan pertemuan (paling banyak Jumat yang kosong),
 * masing-masing sebesar iuran standar. Hasil: { pertemuan, nominal, total }.
 */
export function rekomendasiSusulan(ringkas) {
  const standar = ringkas?.pengaturan?.standar ?? IURAN_STANDAR;
  const pertemuan = Math.min(ringkas?.kurang ?? 0, (ringkas?.kosong ?? []).length);
  return { pertemuan, nominal: standar, total: pertemuan * standar };
}

/** Tutup kas: bandingkan uang fisik dengan jumlah catatan. status: 'cocok' | 'lebih' | 'kurang' | null (belum ditutup). */
export function bandingkanKas(jumlahCatatan, kas) {
  if (!kas) return { status: null, selisih: 0 };
  const selisih = kas.totalFisik - jumlahCatatan;
  return { status: selisih === 0 ? 'cocok' : selisih > 0 ? 'lebih' : 'kurang', selisih };
}
