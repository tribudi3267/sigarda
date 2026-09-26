// Tahap 4: daftar hadir latihan 3 bulan (12 kali) sesudah pelantikan Laksana (syarat Garuda butir 2), keterangan Saka pada butir 6, dan halamannya pada Portofolio format Kwarcab
// (termasuk salinan beku). Logika murni + render dokumen; TANPA server (data kehadiran sudah ada di absensi).
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PortofolioKwarcabDokumen } from '../src/components/PortofolioKwarcab.jsx';
import { AMBANG_TKK_BAWAAN } from '../src/data/tkkData.js';
import { GUDEP_BAWAAN } from '../src/config.js';
import { BUTIR_SPG } from '../src/data/spgData.js';
import { hitungSpg } from '../src/lib/spgLogic.js';
import { JUMLAH_LATIHAN, daftarLatihanLaksana, rentangLatihan, teksLatihan } from '../src/lib/latihanLaksanaLogic.js';
import { buatIsiSnapshot, dariSnapshot } from '../src/lib/snapshotLogic.js';

let lulus = 0; let gagal = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

// Jumat mingguan mulai 2026-01-09 (30 sesi)
const jumat = (n) => { const d = new Date(Date.UTC(2026, 0, 9 + 7 * n)); return d.toISOString().slice(0, 10); };
const sesi = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [jumat(i), { tanggal: jumat(i) }]));
const hadir = (pola) => Object.fromEntries(Object.entries(pola).map(([t, st]) => [t, { p1: { status: st } }]));

console.log('--- Daftar latihan ---');
{
  ok(rentangLatihan(null) === null && rentangLatihan('') === null, 'tanpa pelantikan Laksana: tidak ada rentang');
  const r = rentangLatihan('2026-01-31');
  ok(r.mulai === '2026-01-31' && r.akhir === '2026-04-30', 'rentang = pelantikan sampai tiga bulan sesudahnya (akhir bulan dipangkas)');
  ok(daftarLatihanLaksana({ sesi, hadir: {}, pesertaId: 'p1', tanggalLaksana: null, hari: '2026-12-31' }) === null, 'belum dilantik Laksana: null');

  // pelantikan 2026-02-01 (Minggu): sesi Jumat 02-06 ... sampai 2026-05-01 (13 Jumat, dibatasi 12)
  const d = daftarLatihanLaksana({ sesi, hadir: hadir({ [jumat(4)]: 'H', [jumat(5)]: 'H', [jumat(6)]: 'I', [jumat(7)]: 'S', [jumat(8)]: 'A' }), pesertaId: 'p1', tanggalLaksana: '2026-02-01', hari: '2026-12-31' });
  ok(d.latihan.length === JUMLAH_LATIHAN && d.total === 12 && d.lengkap, 'paling banyak 12 latihan dan ditandai lengkap');
  ok(d.latihan[0].tanggal === jumat(4) && d.latihan.every((l, i, a) => i === 0 || a[i - 1].tanggal < l.tanggal), 'latihan urut tanggal, mulai dari sesi pertama SESUDAH pelantikan');
  ok(d.hadir === 2 && d.izin === 1 && d.sakit === 1 && d.alpa === 1 && d.belumTercatat === 7, 'hitungan hadir, izin, sakit, alpa, dan belum tercatat');
  ok(d.latihan.every((l) => l.tanggal <= d.akhir), 'tidak melewati tiga bulan');

  const sama = daftarLatihanLaksana({ sesi, hadir: {}, pesertaId: 'p1', tanggalLaksana: jumat(4), hari: '2026-12-31' });
  ok(!sama.latihan.some((l) => l.tanggal === jumat(4)), 'sesi pada hari pelantikan sendiri tidak dihitung');

  const sebagian = daftarLatihanLaksana({ sesi, hadir: {}, pesertaId: 'p1', tanggalLaksana: '2026-02-01', hari: jumat(9) });
  ok(sebagian.total === 6 && !sebagian.lengkap, 'sesi sesudah hari ini tidak dihitung (baru 6 latihan)');
  ok(/baru 6 dari 12/.test(teksLatihan(sebagian)) && /Hadir 0 dari 6/.test(teksLatihan(sebagian)), 'teksLatihan menyebut yang baru tercatat');
  ok(teksLatihan(null) === '' && !/baru/.test(teksLatihan(d)), 'teksLatihan: kosong tanpa data, tanpa "baru" bila lengkap');
  const daftarTanggal = daftarLatihanLaksana({ sesi: Object.keys(sesi), hadir: {}, pesertaId: 'p1', tanggalLaksana: '2026-02-01', hari: '2026-12-31' });
  ok(daftarTanggal.total === 12, 'sesi boleh berupa daftar tanggal');
  const lain = daftarLatihanLaksana({ sesi, hadir: hadir({ [jumat(4)]: 'H' }), pesertaId: 'p2', tanggalLaksana: '2026-02-01', hari: '2026-12-31' });
  ok(lain.hadir === 0 && lain.belumTercatat === 12, 'kehadiran Penegak lain tidak ikut terhitung');
}

console.log('\n--- Butir SPG: latihan dan Saka ---');
{
  const peserta = { id: 'p1', nama: 'Siti', kelas: 'XII-01', role: 'peserta', status: 'aktif', agama: 'Islam' };
  const dasar = { peserta, progress: {}, pelantikan: [], saka: [], capaianTkk: [], ambang: AMBANG_TKK_BAWAAN, portofolio: {}, penetapan: [], hari: '2026-12-31' };
  const butir = (data, no) => hitungSpg(data).find((b) => b.no === no);
  const tanpa = butir({ ...dasar, saka: [] }, 6);
  ok(!tanpa.saran.terpenuhi && /Belum tercatat di Saka/.test(tanpa.saran.teks), 'butir 6 tanpa Saka: belum');
  const punya = { id: 1, pesertaId: 'p1', saka: 'Saka Bhayangkara', status: 'aktif', tanggalMasuk: '2026-01-01', suratUrl: '' };
  let b6 = butir({ ...dasar, saka: [punya] }, 6);
  ok(b6.saran.terpenuhi && /surat keterangan belum ditautkan/.test(b6.saran.teks) && !/Krida tercatat/.test(b6.saran.teks), 'butir 6: terpenuhi; surat belum ditautkan; Krida tidak disebut bila data Krida tidak diberikan');
  b6 = butir({ ...dasar, saka: [{ ...punya, suratUrl: 'https://x.id/s' }], krida: [{ pesertaId: 'p1' }, { pesertaId: 'p1' }, { pesertaId: 'p9' }] }, 6);
  ok(b6.saran.terpenuhi && /surat keterangan ditautkan/.test(b6.saran.teks) && /Krida tercatat: 2/.test(b6.saran.teks), 'butir 6: surat ditautkan dan jumlah Krida Penegak ini (bukan Penegak lain)');
  ok(b6.saran.terpenuhi === true && BUTIR_SPG.find((x) => x.no === 6).aturan === 'saka', 'Saka tetap syarat lunak (tidak menambah syarat baru)');

  const laksana = { pesertaId: 'p1', tingkat: 'laksana', tanggal: '2026-02-01', tempat: 'X', id: 1 };
  const layak = { ...dasar, pelantikan: [laksana] };
  // SKU Laksana belum selesai: teks butir 2 tidak memuat latihan
  ok(!/Hadir/.test(butir({ ...layak, latihan: { hadir: 9, total: 12 } }, 2).saran.teks), 'butir 2 tanpa SKU Laksana selesai: teks latihan tidak muncul');
}

console.log('\n--- Dokumen Portofolio Kwarcab ---');
{
  const peserta = { id: 'p1', nama: 'Siti Aminah', kelas: 'XII-01', role: 'peserta', status: 'aktif', jenisKelamin: 'P', nis: '1', agama: 'Islam' };
  const latihan = daftarLatihanLaksana({ sesi, hadir: hadir({ [jumat(4)]: 'H', [jumat(5)]: 'I' }), pesertaId: 'p1', tanggalLaksana: '2026-02-01', hari: '2026-12-31' });
  const html = (props = {}) => renderToStaticMarkup(h(PortofolioKwarcabDokumen, { peserta, ambang: AMBANG_TKK_BAWAAN, hasilSpg: [], tahunAjaran: '2026/2027', hari: '2026-12-31', ...props }));
  const a = html({ latihan });
  ok(a.includes('DAFTAR HADIR LATIHAN') && a.includes('Daftar Hadir Latihan 3 Bulan setelah Dilantik Penegak Laksana'), 'halaman dan daftar isi memuat daftar hadir latihan');
  ok(a.includes('Hadir 1, izin 1, sakit 0, alpa 0 dari 12 latihan'), 'ringkasan kehadiran tercetak');
  ok(a.includes('6 Februari 2026') && a.includes('>Hadir<') && a.includes('>Izin<'), 'tanggal dan status kehadiran tercetak');
  const kosong = html({ latihan: null });
  ok(kosong.includes('DAFTAR HADIR LATIHAN') && kosong.includes('diisi tangan') && !kosong.includes('undefined') && !kosong.includes('NaN'), 'tanpa data: halaman tetap ada dan kosong untuk tulisan tangan');
  ok((kosong.match(/<tr class="break-inside-avoid">\s*<td class="[^"]*w-8 text-center">\d+<\/td><td class="[^"]*h-10">/g) ?? []).length === JUMLAH_LATIHAN, 'selalu dua belas baris');
  ok(GUDEP_BAWAAN.nama && !kosong.includes('NaN'), 'dokumen aman dirender tanpa data lain');
}

console.log('\n--- Salinan beku ---');
{
  const peserta = { id: 'p1', nama: 'Siti', kelas: 'XII-01', role: 'peserta', status: 'aktif', jenisKelamin: 'P' };
  const latihan = daftarLatihanLaksana({ sesi, hadir: {}, pesertaId: 'p1', tanggalLaksana: '2026-02-01', hari: '2026-12-31' });
  const isi = buatIsiSnapshot({ peserta, gudep: GUDEP_BAWAAN, ambang: AMBANG_TKK_BAWAAN, tahunAjaran: '2026/2027', hari: '2026-12-31', latihan });
  const balik = dariSnapshot(JSON.parse(JSON.stringify(isi)));
  ok(balik.latihan && balik.latihan.total === 12 && balik.latihan.mulai === '2026-02-01', 'latihan ikut tersimpan dan kembali dari salinan beku');
  ok(dariSnapshot({ ...isi, latihan: undefined }).latihan === null, 'salinan lama (tanpa latihan) tetap terbuka: latihan = null');
}

console.log(`\nRINGKASAN LATIHAN-LAKSANA: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
