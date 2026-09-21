/**
 * DOKUMEN TERBIT (murni, tanpa React)
 *
 * Dokumen resmi yang diterbitkan aplikasi dan dapat diperiksa keasliannya lewat QR (tabel dokumen_terbit, fungsi sg_dokumen_*).
 * Saat ini satu jenis: surat pengantar ke guru agama, untuk butir agama Penegak yang tidak punya Pembina seagama. Surat dicetak untuk
 * tanda tangan dan stempel BASAH; QR hanya membuktikan surat itu benar diterbitkan aplikasi.
 *
 * Bentuk dokumen di klien (lihat mapDb.susunDokumen): { id, token, kode, jenis, nomor, tanggal, pesertaId, pesertaNama, penerbit,
 *   dibuatOlehNama, dibuatOlehJabatan, penandaTanganNama, penandaTanganJabatan, agama, nis, kelas, sangga, guru: { id, nama, keterangan },
 *   butir: [id unit], catatan, dibuatPada, dicabutPada, dicabutAlasan }
 *
 * Berkas ini TIDAK boleh mengimpor rombelLogic, skuLogic, atau sidangLogic (rombelLogic memakainya).
 */
import { INDEKS_POIN } from '../data/skuData';

export const JENIS_SURAT_AGAMA = 'surat_pengantar_agama';
export const JENIS_DOKUMEN = { [JENIS_SURAT_AGAMA]: { label: 'Surat pengantar ke guru agama' } };

/**
 * Ada surat pengantar agama yang belum dicabut untuk Penegak ini dan memuat butir (unit) itu? Cermin sigarda.surat_agama_aktif:
 * selama surat berlaku, Pembina yang tidak seagama boleh mencatat hasil butir itu (dinilai guru agama luar).
 */
export const suratAgamaAktif = (dokumen, pesertaId, skuId) =>
  (dokumen ?? []).some((d) => d.jenis === JENIS_SURAT_AGAMA && d.pesertaId === pesertaId && !d.dicabutPada && (d.butir ?? []).includes(skuId));

/** Semua unit butir agama milik agama Penegak ini (Bantara dan Laksana), urut tingkat lalu butir. */
export const unitAgamaPeserta = (peserta) =>
  Object.values(INDEKS_POIN)
    .filter((p) => p.agama && p.agama === peserta?.agama)
    .sort((a, b) => (a.tingkat === b.tingkat ? 0 : a.tingkat === 'Bantara' ? -1 : 1) || a.butirNo - b.butirNo || (a.sub ?? 0) - (b.sub ?? 0));

/** Tidak ada Pembina yang agamanya sama dengan Penegak: butir agamanya perlu surat pengantar ke guru agama. */
export const perluSuratAgama = (users, peserta) =>
  !!peserta?.agama && !users.some((u) => u.role === 'penguji' && u.jabatan === 'Pembina' && u.agama === peserta.agama);

/** Surat yang masih berlaku (belum dicabut) untuk satu Penegak, terbaru lebih dulu. */
export const suratAktifPeserta = (dokumen, pesertaId) =>
  (dokumen ?? []).filter((d) => d.jenis === JENIS_SURAT_AGAMA && d.pesertaId === pesertaId && !d.dicabutPada).sort((a, b) => b.id - a.id);

/**
 * Unit butir agama yang dapat dicantumkan pada surat baru: belum lulus dan belum tercantum pada surat yang berlaku.
 * `progress` = peta progres aplikasi (progress[pesertaId][unitId].status).
 */
export const unitBisaDisurati = (progress, dokumen, peserta) =>
  unitAgamaPeserta(peserta).filter(
    (p) => progress?.[peserta.id]?.[p.id]?.status !== 'lulus' && !suratAgamaAktif(dokumen, peserta.id, p.id)
  );
