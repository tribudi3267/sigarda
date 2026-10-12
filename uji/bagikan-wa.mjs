import { susunBlokRekap, susunPesanRekap, bagiPesan, tautanWa } from '../src/lib/bagikanWaLogic.js';

let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

const u = (id, nama, kelas) => ({ id, nama, kelas });
const peserta = [
  u('1', 'Budi Santoso', 'X-02'), u('2', 'Ahmad Fauzi Rahman', 'X-01'), u('3', 'Citra Dewi Lestari', 'X-01'),
  u('4', 'Dimas Pratama Putra', 'X-01'), u('5', 'Eka Putri', 'XI-01'), u('6', 'Fajar Nugroho', 'XI-01'), u('7', 'Gita', 'X'),
];
const catatan = {
  1: { status: 'H' }, 2: { status: 'A' }, 3: { status: 'S' }, 4: { status: 'I' }, 5: { status: 'H' }, 6: { status: 'H' },
};
const iuran = { 1: { jumlah: 1000 }, 5: { jumlah: 2500 }, 3: { jumlah: 1500 } };
const teks = susunBlokRekap({ gudepNama: 'Gudep SMAN 1 Bukateja', tanggal: '2026-10-09', peserta, catatan, iuran }).join('\n\n');

ok(teks.includes('📅 Jumat, 9 Oktober 2026'), 'tanggal Indonesia lengkap dengan hari');
ok(teks.includes('Hadir 3 dari 7 Penegak') && teks.includes('Izin 1 · Sakit 1 · Alpa 1'), 'ringkasan absensi');
ok(teks.includes('Belum dicatat: 1 Penegak'), 'yang belum dicatat disebut, tidak dianggap alpa');
const a = teks.indexOf('• Ahmad Fauzi Rahman – Alpa'), s = teks.indexOf('• Citra Dewi Lestari – Sakit'), i = teks.indexOf('• Dimas Pratama Putra – Izin');
ok(a > 0 && a < s && s < i, 'urutan dalam kelas: Alpa, Sakit, Izin, nama lengkap');
ok(teks.includes('*X-01* (3)') && teks.includes('*XI-01*\nSemua hadir ✅'), 'kelas tanpa yang tidak hadir = Semua hadir');
ok(teks.indexOf('*X-01* (3)') < teks.indexOf('*X-02*') && teks.indexOf('*X-02*') < teks.indexOf('*XI-01*') && teks.indexOf('*XI-01*') < teks.indexOf('*X*'), 'urutan kelas baku, format lama di akhir');
ok(teks.includes('Terkumpul: Rp 5.000') && teks.includes('Sudah iuran 3 dari 7 Penegak') && teks.includes('Belum iuran 4'), 'ringkasan iuran dari semua Penegak aktif');
const bi = teks.slice(teks.indexOf('*Yang belum iuran*'));
ok(bi.includes('• Ahmad Fauzi Rahman') && bi.includes('• Dimas Pratama Putra') && !bi.includes('Citra Dewi') && !bi.includes('Eka Putri'), 'belum iuran: nama lengkap, termasuk yang tidak hadir; yang sudah tidak muncul');
ok(bi.includes('*XI-01* (1)\n• Fajar Nugroho'), 'belum iuran per kelas');
ok(!/persen|%/.test(teks), 'tanpa persentase');

const hanyaAbsen = susunBlokRekap({ tanggal: '2026-10-09', peserta, catatan, iuran, sertakan: { absensi: true, iuran: false } }).join('\n');
ok(!hanyaAbsen.includes('IURAN') && hanyaAbsen.includes('ABSENSI'), 'bagian iuran dapat dimatikan');
const tanpaIuran = susunBlokRekap({ tanggal: '2026-10-09', peserta, catatan, iuran: null }).join('\n');
ok(!tanpaIuran.includes('IURAN'), 'iuran null (belum dimigrasi) = tanpa bagian iuran');

const semuaIuran = susunBlokRekap({ tanggal: '2026-10-09', peserta: [u('1', 'A', 'X-01')], catatan: { 1: { status: 'H' } }, iuran: { 1: { jumlah: 500 } } }).join('\n');
ok(semuaIuran.includes('Semua sudah iuran ✅'), 'kelas yang semuanya sudah iuran');

// Pesan panjang: 700 Penegak, kebanyakan tidak hadir dan belum iuran
const banyak = Array.from({ length: 700 }, (_, k) => u(String(k), `Penegak Nomor ${String(k).padStart(3, '0')} Nama Panjang`, `${['X', 'XI', 'XII'][k % 3]}-${String((k % 10) + 1).padStart(2, '0')}`));
const cat = Object.fromEntries(banyak.map((p, k) => [p.id, { status: k % 2 ? 'A' : 'H' }]));
const bag = susunPesanRekap({ tanggal: '2026-10-09', peserta: banyak, catatan: cat, iuran: {} }, 'penutup');
ok(bag.length > 1 && bag.every((b) => b.length <= 2200), `pesan panjang dipecah (${bag.length} bagian, semua <= 2200 karakter)`);
ok(bag[0].startsWith(`_Bagian 1/${bag.length}_`) && bag[bag.length - 1].endsWith('penutup') && !bag[0].endsWith('penutup'), 'penanda bagian dan penutup hanya di akhir');
const gabung = bag.join('\n');
ok(banyak.every((p) => gabung.includes(`• ${p.nama}`)), 'tidak ada nama yang hilang saat dipecah');
const pendek = susunPesanRekap({ tanggal: '2026-10-09', peserta, catatan, iuran }, 'penutup');
ok(pendek.length === 1 && !pendek[0].includes('Bagian'), 'pesan pendek = satu bagian tanpa penanda');

ok(bagiPesan(['x'.repeat(5000)], '', 2000).every((b) => b.length <= 2100), 'blok tunggal terlalu panjang tetap dipecah');
ok(tautanWa('a b\nc') === 'https://wa.me/?text=a%20b%0Ac', 'tautan wa.me tanpa nomor');

console.log(`RINGKASAN: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
