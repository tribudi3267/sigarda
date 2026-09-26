// Tahap 3 (H3/H4): rekap Calon Garuda untuk Kwarran (Excel banyak lembar) dan rantai melatih TKK. Logika murni, dengan berkas Excel yang dibaca kembali dan halaman yang dirender.
import ExcelJS from 'exceljs';
import { buatBufferXlsx } from '../src/lib/exportXlsx.js';
import { GERBANG_BAWAAN } from '../src/lib/gerbangLogic.js';
import { AMBANG_TKK_BAWAAN } from '../src/data/tkkData.js';
import { GUDEP_BAWAAN } from '../src/config.js';
import { KOLOM_KESIAPAN, barisKesiapan, lembarKalender, lembarKemajuanTkk, lembarRekapKwarran, lembarRincianSpg, lembarTimPenilai } from '../src/lib/rekapKwarranLogic.js';
import { BATAS_BUKTI_SAMA, rantaiMelatih, ringkasMelatih, teksRingkasMelatih } from '../src/lib/melatihLogic.js';

let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

const cap = (id, pesertaId, tkkId, tingkat, tanggal, melatih) => ({ id, pesertaId, tkkId, tingkat, tanggal, penguji1: 'A', penguji2: 'B', melatih, buktiUrl: '', catatan: '' });

console.log('--- Rantai melatih ---');
const capaian = [
  cap(1, 'p1', 'berkemah', 'purwa', '2026-01-10', 'Andi, Siaga Gugus Depan 02'),
  cap(2, 'p1', 'berkemah', 'madya', '2026-03-10', ' andi,  siaga gugus depan 02 '),
  cap(3, 'p1', 'gerak-jalan', 'purwa', '2026-02-01', 'Andi, Siaga Gugus Depan 02'),
  cap(4, 'p1', 'pppk', 'purwa', '2026-02-15', 'Andi, Siaga Gugus Depan 02'),
  cap(5, 'p1', 'juru-masak', 'purwa', '2026-04-01', 'Sari, Penggalang'),
  cap(6, 'p2', 'berkemah', 'purwa', '2026-01-10', 'Budi, Siaga'),
  cap(7, 'p3', 'berkemah', 'purwa', '2026-01-10', 'Cici'),
];
const r1 = rantaiMelatih(capaian, 'p1');
ok(r1.length === 2 && r1[0].siapa === 'Andi, Siaga Gugus Depan 02' && r1[0].jumlahTkk === 3 && r1[0].berulang, 'bukti yang sama (huruf besar/kecil dan spasi diabaikan) dikelompokkan; 3 TKK berbeda = ditandai');
ok(r1[0].tkk.length === 4 && r1[0].tkk[0].tanggal === '2026-01-10' && r1[0].tkk[0].nama === 'Berkemah', 'tiap capaian tercantum berurut tanggal (tingkat berbeda satu TKK dihitung satu TKK)');
ok(r1[1].siapa === 'Sari, Penggalang' && r1[1].jumlahTkk === 1 && !r1[1].berulang, 'bukti tunggal tidak ditandai');
ok(rantaiMelatih(capaian, 'p2').length === 1 && rantaiMelatih(capaian, 'tidak-ada').length === 0, 'hanya milik Penegak itu');
ok(rantaiMelatih([cap(9, 'p9', 'berkemah', 'purwa', '2026-01-01', '   ')], 'p9').length === 0, 'bukti kosong dilewati');
ok(BATAS_BUKTI_SAMA === 3, 'batas bukti yang sama = 3 TKK berbeda');
const users = [{ id: 'p1', role: 'peserta', nama: 'Bagas', kelas: 'XI-01' }, { id: 'p2', role: 'peserta', nama: 'Ani', kelas: 'XI-02' }, { id: 'p3', role: 'peserta', nama: 'Citra', kelas: 'XI-03' }, { id: 'p4', role: 'peserta', nama: 'Tanpa capaian', kelas: 'X-01' }, { id: 'a', role: 'admin', nama: 'Admin' }];
const rs = ringkasMelatih(capaian, users);
ok(rs.length === 3 && rs[0].nama === 'Bagas' && rs[0].jumlahBerulang === 1 && rs[1].nama === 'Ani' && rs[2].nama === 'Citra', 'ringkasan: hanya Penegak yang punya capaian; yang ditandai dulu, lalu nama');
ok(teksRingkasMelatih(rs[0]) === '5 capaian, 2 bukti berbeda, 1 bukti dipakai untuk 3 TKK atau lebih' && teksRingkasMelatih(rs[1]) === '1 capaian, 1 bukti berbeda', 'teks ringkasan');

console.log('\n--- Rekap Kwarran ---');
const pes = (id, nama, kelas, extra = {}) => ({ id, nama, nis: `n${id}`, nta: extra.nta ?? '', role: 'peserta', status: 'aktif', kelas, sangga: 'E', agama: 'Islam', jenisKelamin: extra.jk ?? 'L', calonGaruda: extra.calon ?? null });
const calon = [pes('p3', 'Citra', 'XI-03', { jk: 'P' }), pes('p1', 'Bagas', 'XI-01', { calon: '2026-08-01', nta: '11.03.001' }), pes('p2', 'Ani', 'XI-02', { calon: '2026-08-02', jk: 'P' })];
const konteks = {
  progress: {}, pelantikan: [{ id: 1, pesertaId: 'p1', tingkat: 'laksana', tanggal: '2026-05-01', tempat: 'B' }], saka: [], capaianTkk: capaian, ambang: AMBANG_TKK_BAWAAN, portofolio: {}, penetapan: [{ pesertaId: 'p1', butir: 1, nilai: 100, tanggal: '2026-09-01', catatan: '', timpa: false }],
};
const kes = barisKesiapan(calon, konteks);
ok(kes.length === 3 && kes[0].nama === 'Citra' && kes[0].no === 1 && KOLOM_KESIAPAN.every((k) => k.key in kes[0]), 'kesiapan: satu baris per calon dengan semua kolom');
ok(kes[1].nama === 'Bagas' && kes[1].jk === 'Laki-laki' && kes[1].nomor === '11.03.001' && kes[1].lantikLaksana === '1 Mei 2026' && kes[1].bantara === 'Belum', 'kesiapan: identitas, NTA, tanggal lantik, dan status SKU');
ok(kes[1].tkk.startsWith('4 dari 45') && kes[1].spg.startsWith('1 dari 13') && kes[1].dokumen === '0 dari 26' && /^Belum lengkap: SKU Bantara, SKU Laksana, TKK, SPG, dokumen portofolio$/.test(kes[1].kesiapan) && kes[1].verifikasi === '', 'kesiapan: TKK, SPG, dokumen, alasan belum lengkap, dan verifikasi Pembina dikosongkan');
const tkk = lembarKemajuanTkk(calon.slice(1, 2), konteks);
ok(tkk.nama === 'Kemajuan TKK' && tkk.kolom.length === 3 + 5 + 4 + 1 && tkk.baris[0].total === 4 && /^Kurang: 41 TKK/.test(tkk.baris[0].status), 'kemajuan TKK: kolom bidang 1-5, total, dan status kekurangan');
const spg = lembarRincianSpg(calon.slice(1, 2), konteks);
ok(spg.kolom.length === 3 + 13 + 1 && spg.baris[0].s1 === 'Ya' && spg.baris[0].jumlah.startsWith('1 dari 13'), 'rincian SPG: 13 kolom butir (Ya/Menunggu/Belum)');
const tim = [{ id: 1, tahunAjaran: '2026/2027', untuk: 'putri', nomorSk: '045/SK/2026', tanggalSk: '2026-09-10', skUrl: '', catatan: '', anggota: [{ id: 1, urut: 1, nama: 'Bu Ketua', unsur: 'ketua_gudep', jabatan: 'ketua', keterangan: '' }, { id: 2, urut: 2, nama: 'Bu Pembina', unsur: 'pembina', jabatan: 'anggota', keterangan: 'K' }] }, { id: 2, tahunAjaran: '2025/2026', untuk: 'putra', nomorSk: '', tanggalSk: null, skUrl: '', catatan: '', anggota: [{ id: 3, urut: 1, nama: 'Lama', unsur: 'lainnya', jabatan: 'anggota', keterangan: '' }] }];
const lt = lembarTimPenilai(tim, '2026/2027');
ok(lt.baris.length === 2 && lt.baris[0].untuk === 'Putri' && lt.baris[0].sk === '045/SK/2026, 10 September 2026' && lt.baris[0].jabatan === 'Ketua tim' && lt.baris[0].unsur === 'Ketua Gugus Depan' && !lt.baris.some((b) => b.nama === 'Lama'), 'tim penilai: hanya tahun ajaran itu; nomor dan tanggal SK, ketua tim, unsur');
const kal = lembarKalender([{ id: 1, tahunAjaran: '2026/2027', tahap: 'nilai_kwarran', mulai: '2026-10-20', akhir: null, catatan: '' }, { id: 2, tahunAjaran: '2026/2027', tahap: 'serah_kwarran', mulai: '2026-10-05', akhir: '2026-10-09', catatan: 'X' }, { id: 3, tahunAjaran: '2025/2026', tahap: 'iuran', mulai: '2026-01-01', akhir: null, catatan: '' }], '2026/2027');
ok(kal.baris.length === 2 && kal.baris[0].tahap === 'Penyerahan portofolio ke Kwarran' && kal.baris[0].akhir === '9 Oktober 2026' && kal.baris[1].akhir === '', 'kalender: tahun ajaran itu, urut tanggal mulai');

const sheets = lembarRekapKwarran({ calon, aktif: [...calon, ...Array.from({ length: 17 }, (_, i) => pes(`a${i}`, `Aktif ${i}`, 'X-01'))], konteks, lahir: [{ pesertaId: 'p1', tanggal: '2008-03-01' }], aturan: GERBANG_BAWAAN, tim, tahap: [], tahunAjaran: '2026/2027', gudep: GUDEP_BAWAAN, hari: '2026-09-26' });
ok(sheets.map((s) => s.nama).join('|') === 'Pendataan Calon Garuda|Kesiapan Berkas|Kemajuan TKK|Rincian SPG|Tim Penilai|Kalender', 'enam lembar berurutan: Pendataan, Kesiapan Berkas, Kemajuan TKK, Rincian SPG, Tim Penilai, Kalender');
ok(sheets[0].baris.map((b) => b.nama).join() === 'Ani,Bagas,Citra' && sheets[1].baris.map((b) => b.nama).join() === 'Ani,Bagas,Citra', 'calon diurut sama di semua lembar (Calon terdaftar dulu, lalu nama)');
const buf = await buatBufferXlsx(sheets);
const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
ok(wb.worksheets.length === 6 && wb.worksheets.map((w) => w.name).join('|') === sheets.map((s) => s.nama).join('|'), 'berkas Excel memuat enam lembar dengan nama yang sama');
const wsKes = wb.getWorksheet('Kesiapan Berkas');
const kep = []; wsKes.getRow(4).eachCell((c) => kep.push(c.value));
ok(kep.join('|') === KOLOM_KESIAPAN.map((k) => k.header).join('|') && wsKes.rowCount === 4 + 3, 'lembar Kesiapan Berkas terbaca kembali: judul kolom dan tiga baris calon');
ok(wb.getWorksheet('Kalender').rowCount === 4, 'lembar tanpa data tetap berjudul kolom (kalender kosong)');

console.log(`RINGKASAN REKAP-KWARRAN-MELATIH: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
