/**
 * Data contoh (fiktif) agar prototipe langsung terisi.
 * Semua PIN di sini hanya untuk demo. Jangan dipakai di produksi.
 * Tanggal dibuat relatif terhadap hari ini, jadi absensi selalu tampak segar.
 */
import { daftarPoin } from '../lib/skuLogic';
import { jumatDalamRentang } from '../lib/absensiLogic';
import { ITEM_PORTOFOLIO } from './portofolioData';
import { kodeVerifikasi, tanggalLalu, hariIni } from '../lib/format';

const PEMBINA = 'u-penguji-1';
const DEWAN = 'u-penguji-2';
const BERGABUNG = '2025-07-01';

// Semua akun contoh memakai PIN awal dan wajib menggantinya saat login pertama (wajibGantiPin)
const peserta = (id, nama, nis, kelas, sangga, agama) => ({
  id, role: 'peserta', nama, nis, kelas, sangga, agama, pin: '1111', dibuat: BERGABUNG, wajibGantiPin: true,
});

const USERS = [
  { id: 'u-admin', role: 'admin', nama: 'Admin Gudep', pin: '1234', jabatan: 'Admin Gudep', wajibGantiPin: true },
  { id: PEMBINA, role: 'penguji', nama: 'Pembina Gudep (contoh)', pin: '2222', jabatan: 'Pembina', wajibGantiPin: true },
  { id: DEWAN, role: 'penguji', nama: 'Dewan Ambalan (contoh)', pin: '3333', jabatan: 'Dewan Ambalan', wajibGantiPin: true },
  peserta('u-p1', 'Ahmad Fauzi', '10231', 'X-01', 'Sangga Elang', 'Islam'),
  peserta('u-p2', 'Siti Nurhaliza', '10232', 'X-01', 'Sangga Merak', 'Islam'),
  peserta('u-p3', 'Dimas Prasetyo', '10118', 'XI-01', 'Sangga Elang', 'Protestan'),
  peserta('u-p4', 'Rina Wulandari', '10119', 'XI-02', 'Sangga Merak', 'Katolik'),
  { ...peserta('u-p5', 'Bagas Saputra', '10007', 'XII-01', 'Sangga Rajawali', 'Islam'), calonGaruda: tanggalLalu(45) },
  peserta('u-p6', 'Nadia Putri', '10008', 'XII-01', 'Sangga Kasuari', 'Islam'),
  peserta('u-p7', 'Rizky Ramadhan', '10233', 'X-02', 'Sangga Rajawali', 'Islam'),
  peserta('u-p8', 'Anisa Fitriani', '10120', 'XI-01', 'Sangga Kasuari', 'Islam'),
  { ...peserta('u-p9', 'Wahyu Hidayat', '10009', 'XII-02', 'Sangga Elang', 'Islam'), calonGaruda: tanggalLalu(60) },
  peserta('u-p10', 'Made Ayu Saraswati', '10121', 'XI-02', 'Sangga Merak', 'Hindu'),
  peserta('u-p11', 'Kevin Wijaya', '10234', 'X-02', 'Sangga Kasuari', 'Buddha'),
  peserta('u-p12', 'Maria Goretti', '10010', 'XII-02', 'Sangga Rajawali', 'Katolik'),
];

// Jumlah butir (dari butir 1 dan seterusnya) yang sudah lulus per peserta
const CAPAIAN = {
  'u-p1': { Bantara: 4, Laksana: 0 },
  'u-p2': { Bantara: 9, Laksana: 0 },
  'u-p3': { Bantara: 23, Laksana: 5 },
  'u-p4': { Bantara: 23, Laksana: 0 },
  'u-p5': { Bantara: 23, Laksana: 22 },
  'u-p6': { Bantara: 23, Laksana: 15 },
  'u-p7': { Bantara: 0, Laksana: 0 },
  'u-p8': { Bantara: 6, Laksana: 0 },
  'u-p9': { Bantara: 23, Laksana: 22 },
  'u-p10': { Bantara: 11, Laksana: 0 },
  'u-p11': { Bantara: 2, Laksana: 0 },
  'u-p12': { Bantara: 23, Laksana: 22 },
};

function entriLulus(pesertaId, skuId, pengujiId, hariLalu) {
  const tanggal = tanggalLalu(hariLalu);
  const kode = kodeVerifikasi([pesertaId, skuId, pengujiId, tanggal]);
  return {
    status: 'lulus',
    pengujiId,
    tanggalUji: tanggal,
    nilai: hariLalu % 3 === 0 ? 'Sangat baik' : 'Baik',
    catatan: '',
    verifikasi: kode,
    diverifikasiPada: `${tanggal}T09:00:00.000Z`,
    riwayat: [{ waktu: `${tanggal}T09:00:00.000Z`, teks: `Dinyatakan lulus, kode ${kode}`, oleh: pengujiId }],
  };
}

const unitButir = (u, tingkat, no) => daftarPoin(tingkat, u.agama).filter((p) => p.butirNo === no);

/* ---------------------------------- SKU ---------------------------------- */
function buatProgress() {
  const progress = {};
  const peta = Object.fromEntries(USERS.filter((u) => u.role === 'peserta').map((u) => [u.id, u]));

  for (const [pesertaId, capaian] of Object.entries(CAPAIAN)) {
    const u = peta[pesertaId];
    progress[pesertaId] = {};
    for (const tingkat of ['Bantara', 'Laksana']) {
      const jarakAwal = tingkat === 'Laksana' ? 120 : 260;
      let urut = 0;
      for (let no = 1; no <= capaian[tingkat]; no += 1) {
        for (const p of unitButir(u, tingkat, no)) {
          const jarak = Math.max(jarakAwal - urut * 3 - Number(pesertaId.replace(/\D/g, '')), 5);
          progress[pesertaId][p.id] = entriLulus(pesertaId, p.id, urut % 2 ? DEWAN : PEMBINA, jarak);
          urut += 1;
        }
      }
    }
  }

  // Butir 1 (agama) baru sebagian: 3 sub-butir pertama lulus
  unitButir(peta['u-p7'], 'Bantara', 1).slice(0, 3).forEach((p, i) => {
    progress['u-p7'][p.id] = entriLulus('u-p7', p.id, PEMBINA, 20 - i);
  });

  // Contoh antrian: diajukan, sedang diuji, perlu diulang
  const iso = (d) => d.toISOString().slice(0, 10);
  const besok = new Date();
  besok.setDate(besok.getDate() + 3);

  progress['u-p1'][unitButir(peta['u-p1'], 'Bantara', 5)[0].id] = {
    status: 'diajukan', jadwal: iso(besok), pengujiId: PEMBINA,
    catatanPeserta: 'Siap menjelaskan jadwal pertemuan Ambalan.',
    riwayat: [{ waktu: new Date().toISOString(), teks: `Mengajukan pengujian untuk ${iso(besok)}`, oleh: 'u-p1' }],
  };
  progress['u-p2'][unitButir(peta['u-p2'], 'Bantara', 10)[0].id] = {
    status: 'proses', jadwal: hariIni(), tanggalUji: hariIni(), pengujiId: DEWAN,
    riwayat: [{ waktu: new Date().toISOString(), teks: 'Pengujian dimulai', oleh: DEWAN }],
  };
  progress['u-p8'][unitButir(peta['u-p8'], 'Bantara', 7)[0].id] = {
    status: 'ulang', pengujiId: PEMBINA, tanggalUji: tanggalLalu(5),
    catatan: 'Contoh berbahasa Indonesia belum baku. Ulangi dengan memperhatikan kaidah EYD.',
    riwayat: [{ waktu: `${tanggalLalu(5)}T10:00:00.000Z`, teks: 'Perlu diulang', oleh: PEMBINA }],
  };
  progress['u-p3'][unitButir(peta['u-p3'], 'Laksana', 6)[0].id] = {
    status: 'diajukan', jadwal: iso(besok), pengujiId: DEWAN, catatanPeserta: '',
    riwayat: [{ waktu: new Date().toISOString(), teks: `Mengajukan pengujian untuk ${iso(besok)}`, oleh: 'u-p3' }],
  };
  return progress;
}

/* -------------------------------- ABSENSI -------------------------------- */
const hash = (s) => {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
};

// Peluang hadir per peserta (persen), supaya rekap contoh bervariasi
const KERAJINAN = {
  'u-p1': 90, 'u-p2': 82, 'u-p3': 95, 'u-p4': 78, 'u-p5': 97, 'u-p6': 70,
  'u-p7': 55, 'u-p8': 65, 'u-p9': 92, 'u-p10': 85, 'u-p11': 60, 'u-p12': 88,
};

function buatAbsensi() {
  const absensi = { sesi: {}, hadir: {} };
  const jumat = jumatDalamRentang(tanggalLalu(280), hariIni());

  jumat.forEach((tanggal, i) => {
    if (i % 7 === 4) return; // beberapa Jumat libur, tidak ada latihan
    absensi.sesi[tanggal] = { tanggal, dibuatOleh: i % 2 ? DEWAN : PEMBINA, dibuatPada: `${tanggal}T15:00:00.000Z` };
    absensi.hadir[tanggal] = {};
    for (const u of USERS.filter((x) => x.role === 'peserta')) {
      const acak = hash(`${u.id}|${tanggal}`) % 100;
      let status = 'H';
      if (acak >= KERAJINAN[u.id]) {
        const jenis = hash(`${tanggal}|${u.id}`) % 3;
        status = jenis === 0 ? 'I' : jenis === 1 ? 'S' : 'A';
      }
      absensi.hadir[tanggal][u.id] = {
        status, waktu: `${tanggal}T15:30:00.000Z`, oleh: i % 2 ? DEWAN : PEMBINA,
      };
    }
  });
  return absensi;
}

/* ------------------------------- PORTOFOLIO ------------------------------- */
const catatanContoh = {
  'PF-06': 'Tinggal tanda tangan Wali Kelas dan guru BK.',
  'PF-15': 'Video proyek sudah diunggah, menunggu screenshot rangkaian Arduino.',
  'PF-20': 'Foto progres 70% sudah ada, menunggu foto 100%.',
};

function buatPortofolio() {
  const pf = {};
  const isi = (pesertaId, jumlahSiap, jumlahProses) => {
    pf[pesertaId] = {};
    ITEM_PORTOFOLIO.forEach((it, i) => {
      const status = i < jumlahSiap ? 'siap' : i < jumlahSiap + jumlahProses ? 'proses' : 'belum';
      if (status === 'belum') return;
      const hari = Math.max(50 - i * 2, 1);
      const waktu = `${tanggalLalu(hari)}T08:00:00.000Z`;
      pf[pesertaId][it.id] = {
        status,
        catatan: catatanContoh[it.id] ?? '',
        tautan: status === 'siap' && i % 4 === 0 ? 'https://drive.google.com/' : '',
        catatanPenguji: '',
        diperbarui: waktu,
        riwayat: [{
          waktu,
          teks: status === 'siap' ? 'Status: Belum siap menjadi Siap (Ada)' : 'Status: Belum siap menjadi Sedang disiapkan',
          oleh: pesertaId,
        }],
      };
    });
  };
  isi('u-p5', 14, 3);
  isi('u-p9', 22, 2);
  pf['u-p5']['PF-06'].catatanPenguji = 'Mohon lengkapi 7 pihak sebelum akhir bulan.';
  return pf;
}

export function buatSeed() {
  // materi: kosong pada data contoh; Pembina/Admin melampirkan tautan PDF Google Drive sendiri
  return { users: USERS, progress: buatProgress(), absensi: buatAbsensi(), portofolio: buatPortofolio(), materi: [] };
}
