// Tahap L8: laporanLogic.js (murni). Rekap berjenjang tahunan -- periode, keanggotaan, pencapaian SKU, kegiatan, sesi absensi.
import { daftarPoin } from '../src/lib/skuLogic.js';
import {
  daftarTahunKalender, JENIS_PERIODE, namaFileLaporan, rekapKeanggotaan, rekapKegiatan, rekapPencapaianSku, rentangLaporan, sesiRentang,
} from '../src/lib/laporanLogic.js';

let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

/** Menandai seluruh unit satu tingkat sebagai lulus pada tanggal tertentu (meniru hasil pengujian sungguhan). */
function luluskan(progress, pesertaId, tingkat, agama, tanggal) {
  const p = { ...progress, [pesertaId]: { ...(progress[pesertaId] ?? {}) } };
  for (const unit of daftarPoin(tingkat, agama)) p[pesertaId][unit.id] = { status: 'lulus', tanggalUji: tanggal, riwayat: [] };
  return p;
}

console.log('--- Periode ---');
{
  ok(JENIS_PERIODE.length === 2 && JENIS_PERIODE.some((j) => j.id === 'ajaran') && JENIS_PERIODE.some((j) => j.id === 'kalender'), 'JENIS_PERIODE: dua pilihan, ajaran dan kalender');
  const ajaran = rentangLaporan('ajaran', '2026/2027');
  ok(ajaran.mulai === '2026-07-01' && ajaran.akhir === '2027-06-30', `rentangLaporan ajaran: Juli-Juni: ${JSON.stringify(ajaran)}`);
  const kalender = rentangLaporan('kalender', '2026');
  ok(kalender.mulai === '2026-01-01' && kalender.akhir === '2026-12-31', `rentangLaporan kalender: Januari-Desember: ${JSON.stringify(kalender)}`);
  ok(/2026\/2027/.test(ajaran.label) && /2026/.test(kalender.label), 'label periode menyebut tahun yang dipilih');
  const tahun = daftarTahunKalender(new Date('2026-09-23'));
  ok(tahun.length === 4 && tahun[0] === '2026' && tahun[3] === '2023', `daftarTahunKalender: 4 tahun terbaru dulu: ${tahun.join(',')}`);
  ok(namaFileLaporan(ajaran) === 'Laporan-Tahunan-Tahun-Ajaran-2026/2027', 'namaFileLaporan: dari label periode: ' + namaFileLaporan(ajaran));
}

console.log('\n--- Rekap keanggotaan (snapshot) ---');
{
  const users = [
    { id: 'a', role: 'peserta', status: 'aktif', kelas: 'X-01', jenisKelamin: 'L', agama: 'Islam', calonGaruda: null },
    { id: 'b', role: 'peserta', status: 'aktif', kelas: 'X-02', jenisKelamin: 'P', agama: 'Islam', calonGaruda: null },
    { id: 'c', role: 'peserta', status: 'aktif', kelas: 'XII-01', jenisKelamin: 'L', agama: 'Islam', calonGaruda: '2026-08-01' },
    { id: 'd', role: 'peserta', status: 'nonaktif', kelas: 'XI-01', jenisKelamin: 'P', agama: 'Islam', calonGaruda: null }, // TIDAK dihitung (bukan aktif)
    { id: 'e', role: 'penguji', jabatan: 'Pembina', status: 'aktif' }, // TIDAK dihitung (bukan peserta)
  ];
  let progress = {};
  progress = luluskan(progress, 'c', 'Bantara', 'Islam', '2025-01-01');
  progress = luluskan(progress, 'c', 'Laksana', 'Islam', '2026-01-01');
  const rekap = rekapKeanggotaan(users, progress);
  ok(rekap.length === 4, `rekapKeanggotaan: 3 tingkat + 1 baris Total: ${rekap.length}`);
  const X = rekap.find((r) => r.tingkat === 'X');
  ok(X.lakiLaki === 1 && X.perempuan === 1 && X.total === 2 && X.calonBantara === 2, 'tingkat X: 1 laki-laki + 1 perempuan, keduanya Calon Bantara: ' + JSON.stringify(X));
  const XI = rekap.find((r) => r.tingkat === 'XI');
  ok(XI.total === 0, 'tingkat XI: peserta d TIDAK dihitung karena berstatus nonaktif: ' + JSON.stringify(XI));
  const XII = rekap.find((r) => r.tingkat === 'XII');
  ok(XII.total === 1 && XII.calonGaruda === 1, 'tingkat XII: peserta c terhitung Calon Garuda (Bantara+Laksana lulus, sudah mendaftar): ' + JSON.stringify(XII));
  const total = rekap.find((r) => r.tingkat === 'Total');
  ok(total.total === 3 && total.lakiLaki === 2 && total.perempuan === 1, 'baris Total: jumlah seluruh tingkat (tanpa akun penguji, tanpa yang nonaktif): ' + JSON.stringify(total));
}

console.log('\n--- Rekap pencapaian SKU per periode ---');
{
  const users = [
    { id: 'a', role: 'peserta', agama: 'Islam', calonGaruda: null },
    { id: 'b', role: 'peserta', agama: 'Protestan', calonGaruda: '2026-08-15' }, // dalam rentang 2026/2027
    { id: 'c', role: 'peserta', agama: 'Islam', calonGaruda: '2025-05-01' }, // SEBELUM rentang 2026/2027 -- tidak dihitung
  ];
  let progress = {};
  progress = luluskan(progress, 'a', 'Bantara', 'Islam', '2026-08-01'); // dalam rentang
  progress = luluskan(progress, 'b', 'Bantara', 'Protestan', '2026-01-01'); // SEBELUM rentang (masih tahun ajaran sebelumnya)
  progress = luluskan(progress, 'b', 'Laksana', 'Protestan', '2027-03-01'); // dalam rentang
  const { mulai, akhir } = rentangLaporan('ajaran', '2026/2027');
  const r = rekapPencapaianSku(users, progress, mulai, akhir);
  ok(r.bantaraLulus === 1, `bantaraLulus: hanya peserta a (dalam rentang): ${r.bantaraLulus}`);
  ok(r.laksanaLulus === 1, `laksanaLulus: hanya peserta b (dalam rentang, Bantara-nya di luar rentang tetap terhitung Laksana): ${r.laksanaLulus}`);
  ok(r.garudaBaru === 1, `garudaBaru: hanya peserta b (mendaftar dalam rentang), peserta c di luar rentang: ${r.garudaBaru}`);
}

console.log('\n--- Rekap kegiatan (Agenda) ---');
{
  const agenda = [
    { id: 1, tanggal: '2026-05-01', judul: 'Sebelum rentang' },
    { id: 2, tanggal: '2026-08-01', judul: 'Musyawarah Ambalan' },
    { id: 3, tanggal: '2027-03-01', judul: 'Pelantikan' },
    { id: 4, tanggal: '2027-08-01', judul: 'Sesudah rentang' },
  ];
  const { mulai, akhir } = rentangLaporan('ajaran', '2026/2027');
  const r = rekapKegiatan(agenda, mulai, akhir);
  ok(r.length === 2 && r[0].judul === 'Musyawarah Ambalan' && r[1].judul === 'Pelantikan', 'rekapKegiatan: hanya yang dalam rentang, terurut tanggal: ' + r.map((x) => x.judul).join(', '));
}

console.log('\n--- Sesi absensi dalam rentang ---');
{
  const absensi = { sesi: {
    '2026-05-01': { tanggal: '2026-05-01' },
    '2026-08-07': { tanggal: '2026-08-07' },
    '2026-08-14': { tanggal: '2026-08-14' },
  } };
  const r = sesiRentang(absensi, '2026-07-01', '2027-06-30');
  ok(r.length === 2 && r[0].tanggal === '2026-08-07', 'sesiRentang: hanya sesi dalam rentang, terurut: ' + r.map((x) => x.tanggal).join(', '));
  ok(sesiRentang(undefined, '2026-07-01', '2027-06-30').length === 0, 'sesiRentang: absensi kosong/undefined tidak melempar galat');
}

console.log(`\nRINGKASAN LAPORAN: ${lulus} lulus, ${gagal} GAGAL.`);
if (gagal) process.exit(1);
