/**
 * SALINAN BEKU PORTOFOLIO (Tahap 3, H3; murni tanpa React). Saat Portofolio format Kwarcab dicetak atau dikirim ke Kwarcab, Pembina/Admin dapat membekukannya: seluruh data
 * pembentuk dokumen disimpan apa adanya di tabel portofolio_snapshot (sg_portofolio_snapshot_simpan), sehingga dokumen yang sama dapat dibuka lagi walau data aplikasi berubah
 * (TKK bertambah, isian diubah, pejabat gudep diganti). `buatIsiSnapshot` menyusun isi dari data yang dipakai dokumen; `dariSnapshot` mengembalikannya menjadi props
 * PortofolioKwarcabDokumen. `periksaCatatanSnapshot` mencerminkan validasi catatan di sg_portofolio_snapshot_simpan (dibandingkan langsung di uji/snapshot-portofolio.mjs).
 */
import { SURAT_GURU } from '../data/suratGuruData';
import { templatBerlaku } from './suratGuruLogic';

export const VERSI_TATA_LETAK = 'kwarcab-2026';
export const MAKS_SALINAN = 20;
export const MAKS_BYTE_ISI = 600000;

const rapikan = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const TERLARANG = /[\u0000-\u001f\u007f<>]/;

const PILIHAN_PESERTA = ['id', 'nama', 'nis', 'nta', 'kelas', 'sangga', 'agama', 'jenisKelamin', 'whatsapp', 'calonGaruda'];

/** Cermin validasi catatan pada sg_portofolio_snapshot_simpan: teks galat atau '' bila sah. */
export function periksaCatatanSnapshot(catatan) {
  const c = rapikan(catatan);
  if (c.length > 200 || TERLARANG.test(c)) return 'Catatan maksimal 200 karakter dan tanpa karakter khusus.';
  return '';
}

/**
 * Isi salinan beku dari data yang membentuk dokumen. `data` = { peserta, gudep, tanggalLahir, capaianTkk, krida, ambang, pelantikan, saka, hasilSpg, tim, portofolio, isian,
 * templat (daftar templat tersimpan), tahunAjaran, hari }. Hanya data Penegak ini yang disimpan (bukan seluruh gudep); templat surat dipilih per jenis menurut tahun ajaran.
 */
export function buatIsiSnapshot(data) {
  const { peserta } = data;
  const templat = SURAT_GURU.flatMap((s) => {
    const b = templatBerlaku(data.templat ?? [], data.tahunAjaran, s.id);
    return b ? [{ jenis: s.id, tahunAjaran: data.tahunAjaran, isi: b.templat.isi }] : [];
  });
  return {
    versi: VERSI_TATA_LETAK,
    hari: data.hari,
    tahunAjaran: data.tahunAjaran,
    gudep: data.gudep,
    peserta: Object.fromEntries(PILIHAN_PESERTA.filter((k) => peserta[k] !== undefined).map((k) => [k, peserta[k]])),
    tanggalLahir: data.tanggalLahir ?? null,
    capaianTkk: (data.capaianTkk ?? []).filter((c) => c.pesertaId === peserta.id),
    krida: (data.krida ?? []).filter((k) => k.pesertaId === peserta.id),
    ambang: data.ambang,
    pelantikan: (data.pelantikan ?? []).filter((p) => p.pesertaId === peserta.id),
    saka: (data.saka ?? []).filter((s) => s.pesertaId === peserta.id),
    hasilSpg: data.hasilSpg ?? [],
    tim: data.tim ?? null,
    portofolio: { [peserta.id]: data.portofolio?.[peserta.id] ?? {} },
    isian: data.isian ?? {},
    templat,
  };
}

/** Props PortofolioKwarcabDokumen dari isi salinan beku (sertakanSurat ikut pilihan saat dibuka). */
export function dariSnapshot(isi, { sertakanSurat = true } = {}) {
  return {
    peserta: isi.peserta, tanggalLahir: isi.tanggalLahir ?? null, capaianTkk: isi.capaianTkk ?? [], krida: isi.krida ?? [], ambang: isi.ambang,
    pelantikan: isi.pelantikan ?? [], saka: isi.saka ?? [], hasilSpg: isi.hasilSpg ?? [], tim: isi.tim ?? null, portofolio: isi.portofolio ?? {},
    isian: isi.isian ?? {}, templat: isi.templat ?? [], tahunAjaran: isi.tahunAjaran, sertakanSurat, hari: isi.hari,
  };
}

/** Ukuran isi dalam byte (perkiraan sama dengan octet_length(isi::text) di server, bagi peringatan sebelum mengirim). */
export const ukuranIsi = (isi) => new TextEncoder().encode(JSON.stringify(isi)).length;

/** Ringkasan satu salinan untuk daftar: judul singkat. */
export const labelSnapshot = (s) => `${s.tahunAjaran}${s.catatan ? `: ${s.catatan}` : ''}`;
