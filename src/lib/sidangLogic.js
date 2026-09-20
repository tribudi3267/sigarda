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
  ['{no}', 'nomor urut tanpa nol (2)'],
  ['{no2}', 'nomor urut 2 angka (02)'],
  ['{no3}', 'nomor urut 3 angka (002)'],
  ['{no4}', 'nomor urut 4 angka (0002)'],
  ['{no5}', 'nomor urut 5 angka (00002)'],
  ['{no6}', 'nomor urut 6 angka (000002)'],
  ['{tahun}', 'tahun sidang (2026)'],
  ['{bulan}', 'bulan sidang 2 angka (08)'],
  ['{romawi}', 'bulan sidang angka Romawi (VIII)'],
  ['{tingkat}', 'Bantara atau Laksana'],
];
const KODE_SAH = KODE_FORMAT.map(([k]) => k);
const ROMAWI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** Nomor dengan nol di depan sampai selebar `lebar`; angka yang lebih panjang tidak dipotong (sama dengan sigarda.pad_nomor). */
export const padNomor = (no, lebar) => String(no).padStart(lebar, '0');

export const KEPUTUSAN = {
  layak: { label: 'Layak dan Lulus', kelas: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
  tunda: { label: 'Ditunda / Remedi', kelas: 'bg-amber-50 text-amber-900 ring-amber-300' },
};
export const HASIL_MAGANG = { memenuhi: 'Memenuhi syarat', tidak: 'Tidak memenuhi syarat' };
export const HASIL_TUGAS = { lulus: 'Lulus', tidak: 'Belum lulus' };

/** Spasi ganda dan tepi dirapikan, sama dengan sigarda.rapikan di SQL. */
export const rapikan = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Nomor berita acara dari format. Ganti kode {no} {no2}..{no6} {tahun} {bulan} {romawi} {tingkat}. */
export function formatNomor(format, { no, tanggal, tingkat }) {
  const [tahun, bulan] = String(tanggal).split('-');
  const sub = (teks, kode, nilai) => teks.split(kode).join(nilai);
  let h = String(format);
  for (const lebar of [6, 5, 4, 3, 2]) h = sub(h, `{no${lebar}}`, padNomor(no, lebar));
  h = sub(h, '{no}', String(no));
  h = sub(h, '{tahun}', String(Number(tahun)));
  h = sub(h, '{bulan}', String(Number(bulan)).padStart(2, '0'));
  h = sub(h, '{romawi}', ROMAWI[Number(bulan) - 1]);
  h = sub(h, '{tingkat}', tingkat);
  return h;
}

const KODE_NOMOR = /\{no[2-6]?\}/;

/**
 * Pesan galat untuk format nomor, atau '' bila sah. Aturan sah/tidak sah sama dengan sg_pengaturan_simpan di SQL;
 * pesannya di sini lebih menuntun karena dibaca langsung oleh pengguna.
 */
export function periksaFormatNomor(format) {
  const v = rapikan(format);
  if (!v) return 'Format nomor wajib diisi. Contoh: {no4}/DA/{romawi}/{tahun}';
  if (v.length > 80) return 'Format nomor maksimal 80 karakter.';
  if (/[[\]<>]/.test(v)) return 'Kode ditulis dengan kurung kurawal { }, bukan [ ] atau < >. Contoh: {no4}/DA/{romawi}/{tahun}';
  const terlarang = [...new Set(v.match(/[^A-Za-z0-9 /._(){}-]/g) ?? [])];
  if (terlarang.length) return `Karakter ${terlarang.map((c) => `"${c}"`).join(' ')} tidak boleh dipakai. Yang boleh: huruf, angka, spasi, dan tanda / . - _ ( )`;
  for (const k of v.match(/\{[^}]*\}/g) ?? []) {
    if (KODE_SAH.includes(k)) continue;
    if (KODE_SAH.includes(k.toLowerCase())) return `Kode ${k} harus ditulis dengan huruf kecil: ${k.toLowerCase()}`;
    return `Kode ${k} tidak dikenal. Kode yang tersedia: ${KODE_SAH.join(' ')}`;
  }
  if (/[{}]/.test(v.replace(/\{(no|no[2-6]|tahun|bulan|romawi|tingkat)\}/g, ''))) return 'Ada tanda kurung kurawal yang belum lengkap. Setiap kode harus diawali { dan diakhiri }.';
  if (!KODE_NOMOR.test(v)) return 'Format belum memuat kode nomor urut. Tambahkan {no4} (hasilnya 0002) atau {no} (hasilnya 2).';
  if (!v.includes('{tahun}')) return 'Format belum memuat {tahun}. Tahun diperlukan agar nomor tidak sama antar tahun.';
  return '';
}

/* ---------- Pembuat format berbasis pilihan (agar pengguna tidak perlu menulis kode sendiri) ---------- */

export const PEMISAH = [['/', 'Garis miring ( / )'], ['-', 'Strip ( - )'], ['.', 'Titik ( . )']];
export const OPSI_BULAN = [['tidak', 'Tidak dicantumkan'], ['romawi', 'Angka Romawi (mis. VIII)'], ['angka', 'Angka biasa (mis. 08)']];
export const OPSI_DIGIT = [1, 2, 3, 4, 5, 6].map((d) => [d, d === 1 ? '1 angka (1, 2, 3)' : `${d} angka (${padNomor(2, d)}, ${padNomor(3, d)})`]);

/** Susunan nomor: nomor urut, kode surat (opsional), tingkat (opsional), bulan (opsional), tahun; dipisah `pemisah`. */
export function bangunFormat({ digit = 3, kode = '', tingkat = false, bulan = 'tidak', pemisah = '/' } = {}) {
  const bagian = [digit === 1 ? '{no}' : `{no${digit}}`];
  const k = rapikan(String(kode).replace(/[{}]/g, ''));
  if (k) bagian.push(k);
  if (tingkat) bagian.push('{tingkat}');
  if (bulan === 'romawi') bagian.push('{romawi}');
  else if (bulan === 'angka') bagian.push('{bulan}');
  bagian.push('{tahun}');
  return bagian.join(pemisah);
}

/** Kebalikan bangunFormat: mengembalikan pilihan bila format berbentuk baku, atau null bila harus dibuka sebagai teks. */
export function uraiFormat(format) {
  const f = rapikan(format);
  for (const pemisah of ['/', '-', '.']) {
    const e = pemisah.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`^\\{(no|no[2-6])\\}(?:${e}(.*?))??(?:${e}\\{tingkat\\})?(?:${e}\\{(bulan|romawi)\\})?${e}\\{tahun\\}$`).exec(f);
    if (!m) continue;
    const kode = m[2] ?? '';
    const pilihan = {
      digit: m[1] === 'no' ? 1 : Number(m[1].slice(2)),
      kode,
      tingkat: f.includes('{tingkat}'),
      bulan: m[3] === 'romawi' ? 'romawi' : m[3] === 'bulan' ? 'angka' : 'tidak',
      pemisah,
    };
    if (!/[{}]/.test(kode) && bangunFormat(pilihan) === f) return pilihan;
  }
  return null;
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

/**
 * Nomor urut yang akan dipakai berikutnya pada tahun itu. `urut` = { [tahun]: nomor terakhir yang dipakai }, dibaca dari
 * penghitung di server (tabel sidang_urut), jadi sama dengan yang akan dipakai server saat menyimpan.
 */
export function nomorUrutBerikutnya(urut = {}, tahun) {
  return (Number(urut[String(tahun)]) || 0) + 1;
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
