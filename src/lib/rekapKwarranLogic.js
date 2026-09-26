/**
 * REKAP CALON GARUDA UNTUK KWARRAN (Tahap 3, H3/H4; murni tanpa React). Format Excel resmi dari Kwarran/Kwarcab belum ada, jadi berkas ini dirancang dari data yang ada di
 * aplikasi menurut tahap seleksi Kwarcab (penyerahan portofolio ke Kwarran, penilaian Kwarran, pengiriman ke Kwarcab): satu buku kerja berisi lembar Pendataan (kuota dan usia),
 * Kesiapan Berkas, Kemajuan TKK, Rincian SPG, Tim Penilai, dan Kalender. Bila format resmi tiba, cukup menyesuaikan lembar-lembar ini (kolom dan judul) tanpa mengubah datanya.
 * Kolom keputusan (Verifikasi Pembina) sengaja kosong: aplikasi hanya memberi saran.
 */
import { fmtTanggal, hariIni } from './format';
import { BIDANG_TKK, capaianPeserta, hitungKemajuan } from './tkkLogic';
import { hitungSpg, ringkasSpg } from './spgLogic';
import { tingkatSelesai } from './skuLogic';
import { hitungPortofolio } from './portofolioLogic';
import { pelantikanPeserta } from './pelantikanLogic';
import { labelJenisKelamin } from './jenisKelaminLogic';
import { labelTahap } from './kalenderGarudaLogic';
import { labelUnsur, labelUntuk } from './timLogic';
import { barisPendataan, lembarPendataan } from './pendataanGarudaLogic';

const tgl = (iso) => (iso ? fmtTanggal(iso) : '');
const nomor = (u) => u.nta || u.nis || '';
const IDS_BIDANG = [1, 2, 3, 4, 5];

/**
 * Lembar "Kesiapan Berkas": satu baris per calon, ringkasan syarat yang menentukan boleh atau belumnya berkas diserahkan ke Kwarran. `konteks` = { progress, pelantikan, saka,
 * capaianTkk, ambang, portofolio, penetapan }. Kesiapan = SKU Bantara dan Laksana selesai, TKK memenuhi ambang, 13 butir SPG terpenuhi, dan 26 dokumen portofolio siap.
 */
export function barisKesiapan(calon, konteks) {
  return calon.map((u, i) => {
    const bantara = tingkatSelesai(konteks.progress, u, 'Bantara');
    const laksana = tingkatSelesai(konteks.progress, u, 'Laksana');
    const k = hitungKemajuan(capaianPeserta(konteks.capaianTkk, u.id), konteks.ambang);
    const spg = ringkasSpg(hitungSpg({ ...konteks, peserta: u }));
    const dok = hitungPortofolio(konteks.portofolio, u.id);
    const p = pelantikanPeserta(konteks.pelantikan, u.id);
    const kurang = [!bantara && 'SKU Bantara', !laksana && 'SKU Laksana', !k.penuh && 'TKK', !spg.penuh && 'SPG', dok.siap < dok.total && 'dokumen portofolio'].filter(Boolean);
    return {
      no: i + 1, nama: u.nama, jk: labelJenisKelamin(u.jenisKelamin), kelas: u.kelas ?? '', nomor: nomor(u),
      bantara: bantara ? 'Selesai' : 'Belum', laksana: laksana ? 'Selesai' : 'Belum', lantikBantara: tgl(p.bantara?.tanggal), lantikLaksana: tgl(p.laksana?.tanggal),
      tkk: `${k.total} dari ${konteks.ambang.total}`, wajib: `${konteks.ambang.utamaWajib.length - k.kurang.wajib} dari ${konteks.ambang.utamaWajib.length}`,
      spg: `${spg.terpenuhi} dari ${spg.total}`, dokumen: `${dok.siap} dari ${dok.total}`,
      kesiapan: kurang.length ? `Belum lengkap: ${kurang.join(', ')}` : 'Siap diserahkan', verifikasi: '',
    };
  });
}

export const KOLOM_KESIAPAN = [
  { header: 'No', key: 'no', lebar: 5, rata: 'center' },
  { header: 'Nama Lengkap', key: 'nama', lebar: 30 },
  { header: 'L/P', key: 'jk', lebar: 12 },
  { header: 'Kelas', key: 'kelas', lebar: 9, rata: 'center' },
  { header: 'NTA / NIS', key: 'nomor', lebar: 20 },
  { header: 'SKU Bantara', key: 'bantara', lebar: 12 },
  { header: 'SKU Laksana', key: 'laksana', lebar: 12 },
  { header: 'Tanggal Lantik Bantara', key: 'lantikBantara', lebar: 20 },
  { header: 'Tanggal Lantik Laksana', key: 'lantikLaksana', lebar: 20 },
  { header: 'TKK (dari ambang)', key: 'tkk', lebar: 16 },
  { header: 'TKK Wajib Utama', key: 'wajib', lebar: 16 },
  { header: 'SPG Terpenuhi', key: 'spg', lebar: 14 },
  { header: 'Dokumen Portofolio Siap', key: 'dokumen', lebar: 20 },
  { header: 'Kesiapan Berkas', key: 'kesiapan', lebar: 46 },
  { header: 'Verifikasi Pembina', key: 'verifikasi', lebar: 20 },
];

/** Lembar "Kemajuan TKK": jumlah TKK per bidang (tingkat tertinggi tiap TKK), total, Madya ke atas, Utama, dan wajib Utama. */
export function lembarKemajuanTkk(calon, konteks) {
  const baris = calon.map((u, i) => {
    const k = hitungKemajuan(capaianPeserta(konteks.capaianTkk, u.id), konteks.ambang);
    return {
      no: i + 1, nama: u.nama, kelas: u.kelas ?? '',
      ...Object.fromEntries(IDS_BIDANG.map((b) => [`b${b}`, k.perBidang[b]])),
      total: k.total, madya: k.madyaKeAtas, utama: k.utama, wajib: `${konteks.ambang.utamaWajib.length - k.kurang.wajib} dari ${konteks.ambang.utamaWajib.length}`,
      status: k.penuh ? 'Memenuhi ambang' : `Kurang: ${[k.kurang.total > 0 && `${k.kurang.total} TKK`, k.kurang.madya > 0 && `${k.kurang.madya} Madya ke atas`, k.kurang.wajib > 0 && `${k.kurang.wajib} wajib Utama`].filter(Boolean).join(', ')}`,
    };
  });
  return {
    nama: 'Kemajuan TKK',
    judul: [
      'Kemajuan Tanda Kecakapan Khusus (TKK) Calon Garuda',
      `Ambang: ${konteks.ambang.total} TKK berbeda, ${konteks.ambang.utamaWajib.length} TKK wajib tingkat Utama, dan ${konteks.ambang.madya} TKK Madya tambahan. Jumlah per bidang dihitung dari tingkat tertinggi tiap TKK.`,
    ],
    kolom: [
      { header: 'No', key: 'no', lebar: 5, rata: 'center' }, { header: 'Nama Lengkap', key: 'nama', lebar: 30 }, { header: 'Kelas', key: 'kelas', lebar: 9, rata: 'center' },
      ...IDS_BIDANG.map((b) => ({ header: `Bidang ${b}: ${BIDANG_TKK[b].singkat}`, key: `b${b}`, lebar: 16, rata: 'center' })),
      { header: 'Total TKK', key: 'total', lebar: 10, rata: 'center' }, { header: 'Madya ke atas', key: 'madya', lebar: 12, rata: 'center' },
      { header: 'Utama', key: 'utama', lebar: 8, rata: 'center' }, { header: 'Wajib Utama', key: 'wajib', lebar: 12, rata: 'center' }, { header: 'Status', key: 'status', lebar: 44 },
    ],
    baris,
  };
}

/** Lembar "Rincian SPG": status tiap dari 13 butir SPG per calon (Ya = terpenuhi, Menunggu = dokumen lengkap belum ditetapkan Pembina, Belum). */
export function lembarRincianSpg(calon, konteks) {
  const NAMA = { terpenuhi: 'Ya', menunggu: 'Menunggu', belum: 'Belum' };
  const hasil = calon.map((u) => ({ u, butir: hitungSpg({ ...konteks, peserta: u }) }));
  const nomorButir = hasil[0]?.butir.map((b) => b.no) ?? Array.from({ length: 13 }, (_, i) => i + 1);
  return {
    nama: 'Rincian SPG',
    judul: ['Syarat Pramuka Garuda (SPG) Golongan Penegak: 13 butir', 'Ya = terpenuhi (ditetapkan Pembina atau dihitung aplikasi); Menunggu = dokumen lengkap tetapi belum ditetapkan Pembina; Belum = belum terpenuhi.'],
    kolom: [
      { header: 'No', key: 'no', lebar: 5, rata: 'center' }, { header: 'Nama Lengkap', key: 'nama', lebar: 30 }, { header: 'Kelas', key: 'kelas', lebar: 9, rata: 'center' },
      ...nomorButir.map((n) => ({ header: `Butir ${n}`, key: `s${n}`, lebar: 11, rata: 'center' })),
      { header: 'Terpenuhi', key: 'jumlah', lebar: 12, rata: 'center' },
    ],
    baris: hasil.map(({ u, butir }, i) => ({
      no: i + 1, nama: u.nama, kelas: u.kelas ?? '',
      ...Object.fromEntries(butir.map((b) => [`s${b.no}`, NAMA[b.status] ?? b.status])),
      jumlah: `${butir.filter((b) => b.status === 'terpenuhi').length} dari ${butir.length}`,
    })),
  };
}

/** Lembar "Tim Penilai": susunan tim putra dan putri pada tahun ajaran itu (SK Kwarcab), satu baris per anggota. */
export function lembarTimPenilai(tim = [], tahunAjaran) {
  const baris = [];
  for (const t of tim.filter((x) => x.tahunAjaran === tahunAjaran)) {
    for (const a of t.anggota) {
      baris.push({ untuk: labelUntuk(t.untuk), sk: t.nomorSk ? `${t.nomorSk}${t.tanggalSk ? `, ${fmtTanggal(t.tanggalSk)}` : ''}` : '', no: a.urut, nama: a.nama, unsur: labelUnsur(a.unsur), jabatan: a.jabatan === 'ketua' ? 'Ketua tim' : 'Anggota', keterangan: a.keterangan ?? '' });
    }
  }
  return {
    nama: 'Tim Penilai',
    judul: [`Tim Penilai Calon Garuda tahun ajaran ${tahunAjaran}`, 'Menurut SK Kwarcab (nomor dan tanggal SK tertera bila sudah dicatat). Lembar penilaian meminta lima penandatangan.'],
    kolom: [
      { header: 'Untuk', key: 'untuk', lebar: 10 }, { header: 'Nomor dan Tanggal SK', key: 'sk', lebar: 34 }, { header: 'No', key: 'no', lebar: 5, rata: 'center' },
      { header: 'Nama', key: 'nama', lebar: 34 }, { header: 'Unsur', key: 'unsur', lebar: 32 }, { header: 'Jabatan dalam Tim', key: 'jabatan', lebar: 18 }, { header: 'Keterangan', key: 'keterangan', lebar: 30 },
    ],
    baris,
  };
}

/** Lembar "Kalender": tahap seleksi Kwarcab pada tahun ajaran itu (tanggal mulai dan akhir). */
export function lembarKalender(tahap = [], tahunAjaran) {
  const baris = tahap.filter((t) => t.tahunAjaran === tahunAjaran).sort((a, b) => a.mulai.localeCompare(b.mulai))
    .map((t) => ({ tahap: labelTahap(t.tahap), mulai: tgl(t.mulai), akhir: tgl(t.akhir), catatan: t.catatan ?? '' }));
  return {
    nama: 'Kalender',
    judul: [`Kalender Tahap Seleksi Pramuka Garuda tahun ajaran ${tahunAjaran}`, 'Tanggal dari Kwarcab (dicatat di menu Kelayakan, tab Kalender).'],
    kolom: [{ header: 'Tahap', key: 'tahap', lebar: 40 }, { header: 'Mulai', key: 'mulai', lebar: 20 }, { header: 'Akhir', key: 'akhir', lebar: 20 }, { header: 'Catatan', key: 'catatan', lebar: 40 }],
    baris,
  };
}

/**
 * Seluruh lembar rekap untuk Kwarran, urut: Pendataan, Kesiapan Berkas, Kemajuan TKK, Rincian SPG, Tim Penilai, Kalender. `data` = { calon, aktif, konteks (lihat barisKesiapan),
 * lahir, aturan, tim, tahap, tahunAjaran, gudep, hari }. Mengembalikan daftar lembar untuk buatBufferXlsx/unduhXlsx.
 */
export function lembarRekapKwarran(data) {
  const { calon, aktif, konteks, lahir, aturan, tim, tahap, tahunAjaran, gudep, hari = hariIni() } = data;
  const urut = calon.slice().sort((a, b) => Number(!!b.calonGaruda) - Number(!!a.calonGaruda) || a.nama.localeCompare(b.nama, 'id'));
  const pendataan = lembarPendataan({ baris: barisPendataan({ calon: urut, aktif, progress: konteks.progress, pelantikan: konteks.pelantikan, lahir, aturan, hari }), aturan, hari, gudep });
  const kesiapan = {
    nama: 'Kesiapan Berkas',
    judul: [`Kesiapan Berkas Calon Garuda - ${gudep?.nama ?? ''}`.trim(), `Per ${fmtTanggal(hari)}. Berkas siap diserahkan ke Kwarran bila SKU Bantara dan Laksana selesai, TKK memenuhi ambang, 13 butir SPG terpenuhi, dan 26 dokumen portofolio siap. Kolom verifikasi diisi Pembina.`],
    kolom: KOLOM_KESIAPAN,
    baris: barisKesiapan(urut, konteks),
  };
  return [pendataan, kesiapan, lembarKemajuanTkk(urut, konteks), lembarRincianSpg(urut, konteks), lembarTimPenilai(tim, tahunAjaran), lembarKalender(tahap, tahunAjaran)];
}

