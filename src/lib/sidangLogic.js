/**
 * LOGIKA SIDANG DEWAN KEHORMATAN AMBALAN (murni, tanpa React)
 *
 * Sidang bersifat mutlak: Layak dan Lulus untuk dilantik, atau Ditunda/Remedi. Aturan yang ditegakkan di server
 * (supabase/sumber/inti.sql, sg_sidang_simpan) dan dicerminkan di sini untuk tampilan:
 *   - "Layak" hanya bila seluruh butir tingkat itu lulus (sama dengan tingkatSelesai di skuLogic).
 *   - Satu peserta hanya dapat dinyatakan Layak satu kali per tingkat.
 *   - Nomor berita acara dibuat dari format pada pengaturan; formatNomor() harus sama dengan sigarda.format_nomor() di SQL.
 */
import { cariPoin, butirPeserta, getEntry, hitungProgres, tanggalLulusTingkat, tingkatSelesai } from './skuLogic';
import { labelPoin, hurufSub } from '../data/skuData';

export const FORMAT_NOMOR_BAWAAN = '{no3}/DK/{tahun}';
export const SEBUTAN_KETUA_BAWAAN = 'Ketua Dewan Penegak / Pemangku Adat';

export const KUNCI_PENGATURAN = {
  format: 'sidang.format_nomor',
  namaKetua: 'sidang.nama_ketua',
  sebutanKetua: 'sidang.sebutan_ketua',
};

export const KODE_FORMAT = [
  ['{no}', 'nomor urut (1, 2, 3)'],
  ['{no3}', 'nomor urut tiga angka (001, 002)'],
  ['{tahun}', 'tahun sidang'],
  ['{bulan}', 'bulan sidang dua angka (09)'],
  ['{romawi}', 'bulan sidang angka Romawi (IX)'],
  ['{tingkat}', 'Bantara atau Laksana'],
];
const KODE_SAH = KODE_FORMAT.map(([k]) => k);
const ROMAWI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export const KEPUTUSAN = {
  layak: { label: 'Layak dan Lulus', kelas: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
  tunda: { label: 'Ditunda / Remedi', kelas: 'bg-amber-50 text-amber-900 ring-amber-300' },
};
export const HASIL_MAGANG = { memenuhi: 'Memenuhi syarat', tidak: 'Tidak memenuhi syarat' };
export const HASIL_TUGAS = { lulus: 'Lulus', tidak: 'Belum lulus' };

/** Spasi ganda dan tepi dirapikan, sama dengan sigarda.rapikan di SQL. */
export const rapikan = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Nomor berita acara dari format. Ganti kode {no} {no3} {tahun} {bulan} {romawi} {tingkat}. */
export function formatNomor(format, { no, tanggal, tingkat }) {
  const [tahun, bulan] = String(tanggal).split('-');
  const sub = (teks, kode, nilai) => teks.split(kode).join(nilai);
  let h = String(format);
  h = sub(h, '{no3}', String(no).padStart(3, '0'));
  h = sub(h, '{no}', String(no));
  h = sub(h, '{tahun}', String(Number(tahun)));
  h = sub(h, '{bulan}', String(Number(bulan)).padStart(2, '0'));
  h = sub(h, '{romawi}', ROMAWI[Number(bulan) - 1]);
  h = sub(h, '{tingkat}', tingkat);
  return h;
}

/** Pesan galat untuk format nomor, atau '' bila sah. Aturan sama dengan sg_pengaturan_simpan di SQL. */
export function periksaFormatNomor(format) {
  const v = rapikan(format);
  if (!v) return 'Format nomor wajib diisi.';
  if (v.length > 80) return 'Format nomor maksimal 80 karakter.';
  if (!/^[A-Za-z0-9 /._(){}-]+$/.test(v)) return 'Format nomor hanya boleh berisi huruf, angka, spasi, dan tanda / . - _ ( ) serta kode dalam kurung kurawal.';
  for (const k of v.match(/\{[^}]*\}/g) ?? []) {
    if (!KODE_SAH.includes(k)) return `Kode ${k} tidak dikenal. Kode yang tersedia: ${KODE_SAH.join(' ')}.`;
  }
  if (/[{}]/.test(v.replace(/\{(no|no3|tahun|bulan|romawi|tingkat)\}/g, ''))) return 'Tanda kurung kurawal pada format nomor tidak lengkap.';
  if (!v.includes('{no}') && !v.includes('{no3}')) return 'Format nomor harus memuat {no} atau {no3} (nomor urut).';
  if (!v.includes('{tahun}')) return 'Format nomor harus memuat {tahun} agar nomor tidak sama antar tahun.';
  return '';
}

/** Nilai pengaturan sidang dengan bawaan bila belum diatur. */
export function pengaturanSidang(pengaturan = {}) {
  const teks = (k) => (typeof pengaturan[k] === 'string' ? pengaturan[k] : null);
  return {
    format: teks(KUNCI_PENGATURAN.format) || FORMAT_NOMOR_BAWAAN,
    namaKetua: teks(KUNCI_PENGATURAN.namaKetua) ?? '',
    sebutanKetua: teks(KUNCI_PENGATURAN.sebutanKetua) || SEBUTAN_KETUA_BAWAAN,
  };
}

/** Perkiraan nomor urut berikutnya pada tahun itu (server yang memastikan angka finalnya). */
export function nomorUrutBerikutnya(sidang, tahun) {
  const semua = sidang.filter((s) => s.nomorUrut != null && String(s.tanggal).startsWith(String(tahun))).map((s) => s.nomorUrut);
  return (semua.length ? Math.max(...semua) : 0) + 1;
}

/** "Butir 5, Butir 1c" dari daftar id unit SKU. */
export function labelButirBelum(idUnit = []) {
  const label = [];
  for (const id of idUnit) {
    const p = cariPoin(id);
    const l = p ? labelPoin(p) : id;
    if (!label.includes(l)) label.push(l);
  }
  return label.join(', ');
}

/**
 * Lembar kesiapan seorang peserta untuk sidang pada satu tingkat: capaian, butir (agama diuraikan per sub-butir),
 * daftar unit yang belum lulus, dan tanggal lulus terakhir.
 */
export function lembarKesiapan(progress, users, peserta, tingkat) {
  const h = hitungProgres(progress, peserta, tingkat);
  const namaPenguji = (id) => users.find((u) => u.id === id)?.nama ?? '-';
  const belum = [];
  const butir = butirPeserta(tingkat, peserta.agama).map((b) => {
    const unit = b.unit.map((u) => {
      const e = getEntry(progress, peserta.id, u.id);
      const lulus = e.status === 'lulus';
      if (!lulus) belum.push(u.id);
      return {
        id: u.id,
        label: b.agama ? `${b.no}${hurufSub(u.sub)}` : String(b.no),
        teks: u.teks,
        status: e.status,
        lulus,
        tanggal: e.tanggalUji ?? null,
        penguji: lulus ? namaPenguji(e.pengujiId) : null,
      };
    });
    return { no: b.no, agama: b.agama ? b.unit[0]?.agama ?? peserta.agama : null, teks: b.teks, unit, lulus: unit.every((u) => u.lulus) };
  });
  return {
    total: h.total,
    lulus: h.lulus,
    persen: h.persen,
    totalUnit: h.totalUnit,
    lulusUnit: h.lulusUnit,
    selesai: tingkatSelesai(progress, peserta, tingkat),
    tanggalLulus: tanggalLulusTingkat(progress, peserta, tingkat),
    butir,
    belum,
  };
}

export const sudahLayak = (sidang, pesertaId, tingkat) => sidang.some((s) => s.pesertaId === pesertaId && s.tingkat === tingkat && s.keputusan === 'layak');

/**
 * Antrian sidang: peserta yang seluruh butir tingkatnya sudah lulus tetapi belum dinyatakan Layak.
 * Yang pernah ditunda tetap ada di antrian dengan keterangan keputusan terakhirnya. Yang lulus lebih dulu berada di atas.
 */
export function antrianSidang(progress, daftarPeserta, sidang) {
  const hasil = [];
  for (const p of daftarPeserta) {
    for (const tingkat of ['Bantara', 'Laksana']) {
      if (!tingkatSelesai(progress, p, tingkat) || sudahLayak(sidang, p.id, tingkat)) continue;
      const pernah = sidang
        .filter((s) => s.pesertaId === p.id && s.tingkat === tingkat)
        .sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)) || b.id - a.id);
      hasil.push({ peserta: p, tingkat, tanggalLulus: tanggalLulusTingkat(progress, p, tingkat), ditunda: pernah[0] ?? null });
    }
  }
  return hasil.sort((a, b) => String(a.tanggalLulus).localeCompare(String(b.tanggalLulus)) || a.peserta.nama.localeCompare(b.peserta.nama, 'id'));
}
