/**
 * SYARAT PRAMUKA GARUDA / SPG (Tahap 2, G3; murni tanpa React). Server hanya menyimpan PENETAPAN Pembina (sg_spg_catat, sg_spg_hapus); hasil hitung otomatis butir 2, 4, 6, 11
 * dan saran butir berbasis dokumen dihitung di sini dari data yang sudah ada (SKU, pelantikan, TKK, Saka, cek list portofolio), tanpa padanan SQL. Yang dicerminkan dan
 * DIBANDINGKAN LANGSUNG dengan SQL pada kisi masukan (uji/spg-klien.mjs) hanyalah `periksaSpg`. Tanggal memakai WIB (`hariIni`), sama dengan sigarda.hari_ini().
 *
 * Status akhir tiap butir: penetapan Pembina (bila ada) menang, nilai 100 = terpenuhi. Tanpa penetapan: butir otomatis mengikuti hasil hitung; butir dokumen berstatus
 * 'menunggu' (dokumen lengkap, belum ditetapkan Pembina) atau 'belum'.
 */
import { hariIni, fmtTanggal } from './format';
import { BUTIR_SPG } from '../data/spgData';
import { layakGaruda, tingkatSelesai } from './skuLogic';
import { getItem } from './portofolioLogic';
import { capaianPeserta, hitungKemajuan, teksKemajuan } from './tkkLogic';
import { pelantikanPeserta, sakaPeserta } from './pelantikanLogic';

const rapikan = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const TANDA_TERLARANG = /[\u0000-\u001f\u007f<>]/;
const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

export const STATUS_SPG = {
  terpenuhi: { label: 'Terpenuhi', kelas: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
  menunggu: { label: 'Menunggu ditetapkan', kelas: 'bg-amber-50 text-amber-900 ring-amber-300' },
  belum: { label: 'Belum', kelas: 'bg-stone-100 text-stone-700 ring-stone-300' },
};

/** Penetapan Penegak ini: { [butir]: baris }. */
export const penetapanPeserta = (penetapan = [], pesertaId) => Object.fromEntries(penetapan.filter((p) => p.pesertaId === pesertaId).map((p) => [p.butir, p]));

/** Tanggal ISO (YYYY-MM-DD) ditambah n bulan; hari dipangkas ke akhir bulan tujuan (31 Mei + 1 bulan = 30 Juni). */
export function tambahBulan(tanggal, n) {
  const [y, m, d] = tanggal.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const akhir = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}-${String(Math.min(d, akhir)).padStart(2, '0')}`;
}

function saranOtomatis(butir, { peserta, progress, pelantikan, saka, krida, capaianTkk, ambang, portofolio, hari, latihan }) {
  if (butir.aturan === 'sku-laksana') {
    if (!tingkatSelesai(progress, peserta, 'Laksana')) return { terpenuhi: false, teks: 'SKU Laksana belum selesai.' };
    const pl = pelantikanPeserta(pelantikan, peserta.id).laksana;
    if (!pl) return { terpenuhi: false, teks: 'SKU Laksana selesai; pelantikan Laksana belum dicatat (menu Pelantikan).' };
    const genap = tambahBulan(pl.tanggal, 3);
    return hari >= genap
      ? { terpenuhi: true, teks: `Dilantik Laksana ${fmtTanggal(pl.tanggal)}; sudah berlatih 3 bulan sejak ${fmtTanggal(genap)}.${latihan ? ` Hadir ${latihan.hadir} dari ${latihan.total} latihan sejak dilantik.` : ''}` }
      : { terpenuhi: false, teks: `Dilantik Laksana ${fmtTanggal(pl.tanggal)}; genap 3 bulan pada ${fmtTanggal(genap)}.` };
  }
  if (butir.aturan === 'tkk') {
    const k = hitungKemajuan(capaianPeserta(capaianTkk, peserta.id), ambang);
    return { terpenuhi: k.penuh, teks: teksKemajuan(k, ambang) };
  }
  if (butir.aturan === 'saka') {
    const daftar = sakaPeserta(saka, peserta.id);
    return daftar.length
      ? { terpenuhi: true, teks: `Saka: ${daftar.map((s) => `${s.saka} (${s.status}${s.suratUrl ? ', surat keterangan ditautkan' : ', surat keterangan belum ditautkan'})`).join(', ')}.${Array.isArray(krida) ? ` Krida tercatat: ${krida.filter((k) => k.pesertaId === peserta.id).length}.` : ''}` }
      : { terpenuhi: false, teks: 'Belum tercatat di Saka mana pun (menu Pelantikan, tab Saka).' };
  }
  if (butir.aturan === 'penabung') {
    const punya = capaianPeserta(capaianTkk, peserta.id).some((c) => c.tkkId === 'penabung');
    const buku = getItem(portofolio, peserta.id, 'PF-16').status === 'siap';
    return { terpenuhi: punya && buku, teks: `TKK Penabung ${punya ? 'tercatat' : 'belum tercatat'}; buku tabungan ${buku ? 'siap' : 'belum siap'} di portofolio.` };
  }
  return { terpenuhi: false, teks: '' };
}

function saranDokumen(butir, { peserta, portofolio }) {
  const dok = butir.dokumen.map((id) => ({ id, siap: getItem(portofolio, peserta.id, id).status === 'siap' }));
  const siap = dok.filter((d) => d.siap).length;
  return { terpenuhi: siap === dok.length, teks: `${siap} dari ${dok.length} dokumen portofolio siap.` };
}

/**
 * Keadaan 13 butir SPG satu Penegak: [{ no, judul, uraian, jenis, saran: { terpenuhi, teks }, dokumen: [id] , penetapan, status, nilai, timpa }].
 * `data` = { peserta, progress, pelantikan, saka, capaianTkk, ambang, portofolio, penetapan (semua), hari }.
 */
export function hitungSpg(data) {
  const { peserta, penetapan = [], hari = hariIni() } = data;
  const ada = penetapanPeserta(penetapan, peserta.id);
  return BUTIR_SPG.map((b) => {
    const saran = b.jenis === 'otomatis' ? saranOtomatis(b, { ...data, hari }) : saranDokumen(b, data);
    const p = ada[b.no] ?? null;
    const status = p ? (p.nilai === 100 ? 'terpenuhi' : 'belum') : b.jenis === 'otomatis' ? (saran.terpenuhi ? 'terpenuhi' : 'belum') : (saran.terpenuhi ? 'menunggu' : 'belum');
    return { no: b.no, judul: b.judul, uraian: b.uraian, jenis: b.jenis, dokumen: b.dokumen ?? [], saran, penetapan: p, status, nilai: p ? p.nilai : null, timpa: !!p?.timpa };
  });
}

/** Ringkasan 13 butir: { terpenuhi, menunggu, belum, total, penuh }. */
export function ringkasSpg(baris) {
  const terpenuhi = baris.filter((r) => r.status === 'terpenuhi').length;
  const menunggu = baris.filter((r) => r.status === 'menunggu').length;
  return { terpenuhi, menunggu, belum: baris.length - terpenuhi - menunggu, total: baris.length, penuh: terpenuhi === baris.length };
}

/** Penegak yang dinilai SPG-nya: aktif dan telah menyelesaikan seluruh SKU Bantara dan Laksana (cermin sigarda.layak_garuda), urut kelas lalu nama. */
export const pesertaSpg = (users = [], progress = {}) =>
  users.filter((u) => u.role === 'peserta' && (u.status ?? 'aktif') === 'aktif' && layakGaruda(progress, u))
    .sort((a, b) => String(a.kelas).localeCompare(String(b.kelas), 'id') || a.nama.localeCompare(b.nama, 'id'));

/** Apakah nilai 100/0 yang akan ditetapkan berbeda dari saran aplikasi (perlu alasan di catatan). */
export const menimpaSaran = (nilai, saran) => (Number(nilai) === 100) !== !!saran?.terpenuhi;

/** Cermin validasi sg_spg_catat sesudah memeriksa Penegaknya (dibandingkan langsung dengan SQL). Mengembalikan pesan galat atau ''. */
export function periksaSpg({ butir, nilai, tanggal, catatan = '', timpa = false, hari = hariIni() }) {
  if (!Number.isInteger(butir) || butir < 1 || butir > 13) return 'Butir SPG harus 1 sampai 13.';
  if (nilai !== 0 && nilai !== 100) return 'Nilai harus 100 (lengkap dan memenuhi) atau 0 (belum).';
  if (!tanggal) return 'Tanggal pengujian wajib diisi.';
  if (!TANGGAL.test(tanggal) || tanggal < '2000-01-01' || tanggal > hari) return 'Tanggal pengujian tidak boleh sebelum tahun 2000 atau di masa depan.';
  const c = rapikan(catatan);
  if (c.length > 200 || TANDA_TERLARANG.test(c)) return 'Catatan maksimal 200 karakter, tanpa tanda < atau >.';
  if (timpa && c.length < 5) return 'Penetapan berbeda dari hasil aplikasi: tulis alasannya di catatan (sedikitnya 5 karakter).';
  return '';
}
