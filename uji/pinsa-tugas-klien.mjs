// Pinsa tertugas lintas rombel di klien: logika murni (sanggaLogic), pemetaan (mapDb), dan tampilan PanelPinsaTugas. Server: uji/pinsa-tugas.mjs.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PanelPinsaTugas from '../src/components/PanelPinsaTugas.jsx';
import { BATAS_PINSA_TUGAS, cariCalonPinsa, jumlahPinsaTugas, kelompokSangga, labelCalonPinsa } from '../src/lib/sanggaLogic.js';
import { susunCalonPinsa, susunPendampingan, susunSanggaRombel } from '../src/lib/mapDb.js';

let lulus = 0; let gagal = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

console.log('--- Logika murni ---');
{
  const anggota = [
    { id: 'a', nama: 'Ahmad', sangga: 'Sangga Rajawali', pinsa: false }, { id: 'r', nama: 'Rizky', sangga: 'sangga rajawali', pinsa: false },
    { id: 'm', nama: 'Mira', sangga: 'Sangga Elang', pinsa: true },
  ];
  const tugas = [{ id: 'k', nama: 'Kevin', sangga: 'Sangga Rajawali', kelas: 'XI-02', tingkat: 'calon-laksana' }];
  const g = kelompokSangga(anggota, [], tugas);
  const raja = g.find((x) => x.kunci === 'sangga rajawali');
  ok(raja.tugas.length === 1 && raja.tugas[0].id === 'k' && g.find((x) => x.kunci === 'sangga elang').tugas.length === 0, 'kelompokSangga menempelkan Pinsa tertugas pada sangganya (tanpa membedakan huruf besar/kecil)');
  ok(kelompokSangga(anggota, []).every((x) => Array.isArray(x.tugas) && x.tugas.length === 0), 'tanpa data tugas: kelompok tetap sah');
  ok(kelompokSangga(anggota, [], [{ id: 'z', nama: 'Zed', sangga: 'Sangga Hilang' }]).length === 2, 'tugas untuk sangga yang sudah tidak ada tidak membuat kelompok baru');
  ok(jumlahPinsaTugas(tugas, 'SANGGA RAJAWALI') === 1 && jumlahPinsaTugas(tugas, 'Sangga Elang') === 0 && BATAS_PINSA_TUGAS === 2, 'jumlahPinsaTugas dan batas dua per sangga');
  const calon = [{ id: 'k', nama: 'Kevin', kelas: 'XI-02', tingkat: 'calon-laksana' }, { id: 'b', nama: 'Bagas', kelas: 'XII-01', tingkat: 'laksana' }];
  ok(labelCalonPinsa(calon[0]) === 'Kevin (XI-02, Calon Laksana)' && labelCalonPinsa(calon[1]) === 'Bagas (XII-01, Sudah Laksana)', 'labelCalonPinsa memuat nama, rombel asal, dan tingkat');
  ok(cariCalonPinsa(calon, 'kevin (xi-02, calon laksana)')?.id === 'k' && cariCalonPinsa(calon, 'Kevin') === null && cariCalonPinsa(calon, '') === null && cariCalonPinsa([], 'x') === null, 'cariCalonPinsa: hanya yang sama persis dengan tulisan pilihan');
}

console.log('\n--- Pemetaan ---');
{
  const d = susunSanggaRombel({ rombel: 'X-02', tahun_ajaran: '2026/2027', bisa_atur: true, bina_damping: [], anggota: [], peringatan: [],
    pinsa_tugas: [{ id: 'k', nama: 'Kevin', sangga: 'Sangga Rajawali', kelas: 'XI-02', tingkat: 'calon-laksana' }] });
  ok(d.pinsaTugas.length === 1 && d.pinsaTugas[0].kelas === 'XI-02' && d.pinsaTugas[0].tingkat === 'calon-laksana', 'susunSanggaRombel memetakan pinsa_tugas');
  ok(susunSanggaRombel({ rombel: 'X-02' }).pinsaTugas.length === 0, 'basis data lama (tanpa pinsa_tugas): daftar kosong');
  const p = susunPendampingan({ bina_damping: ['X-01'], pinsa: true, pinsa_tugas: [{ rombel: 'X-02', sangga: 'Sangga Rajawali' }] });
  ok(p.pinsa === true && p.pinsaTugas[0].rombel === 'X-02' && p.pinsaTugas[0].sangga === 'Sangga Rajawali' && p.binaDamping[0] === 'X-01', 'susunPendampingan memetakan pinsa_tugas');
  ok(susunPendampingan(null).pinsaTugas.length === 0 && susunPendampingan({ pinsa: false }).pinsaTugas.length === 0, 'pendampingan kosong atau lama aman');
  const c = susunCalonPinsa({ tahun_ajaran: '2026/2027', calon: [{ id: 'k', nama: 'Kevin', kelas: 'XI-02', tingkat: 'calon-laksana' }, { id: 'x', nama: 'X' }] });
  ok(c.tahunAjaran === '2026/2027' && c.calon.length === 2 && c.calon[1].kelas === '' && c.calon[1].tingkat === null && susunCalonPinsa(null).calon.length === 0, 'susunCalonPinsa memetakan calon dan aman untuk data kosong');
}

console.log('\n--- Tampilan PanelPinsaTugas ---');
{
  const noop = async () => ({ ok: true });
  const html = (props) => renderToStaticMarkup(h(PanelPinsaTugas, { rombel: 'X-02', tugas: [], sangga: ['Sangga Elang', 'Sangga Rajawali'], muatCalon: noop, onTugaskan: noop, onCabut: noop, ...props }));
  const kosong = html();
  ok(kosong.includes('Pinsa dari rombel lain') && kosong.includes('Belum ada Pinsa yang ditugaskan dari rombel lain.') && kosong.includes('Tugaskan Pinsa'), 'panel kosong: penjelasan, pesan belum ada, dan tombol Tugaskan Pinsa');
  ok(kosong.includes('rombel X-02') && kosong.includes('paling banyak 2 Pinsa tertugas'), 'menyebut rombel dan batas per sangga');
  const isi = html({ tugas: [{ id: 'k', nama: 'Kevin', sangga: 'Sangga Rajawali', kelas: 'XI-02', tingkat: 'calon-laksana' }] });
  ok(isi.includes('Kevin') && isi.includes('dari XI-02') && isi.includes('Pinsa Sangga Rajawali') && isi.includes('Calon Laksana') && isi.includes('Cabut penugasan Kevin'), 'Pinsa tertugas tampil dengan rombel asal, tingkat, sangga, dan tombol Cabut');
  ok(!isi.includes('Belum ada Pinsa yang ditugaskan'), 'pesan "belum ada" hilang bila ada penugasan');
  const tanpaSangga = html({ sangga: [] });
  ok(/<button[^>]*disabled[^>]*>Tugaskan Pinsa/.test(tanpaSangga) || tanpaSangga.includes('disabled=""'), 'tanpa sangga di rombel: tombol Tugaskan Pinsa nonaktif');
  ok(!kosong.includes('undefined') && !kosong.includes('NaN') && !isi.includes('undefined'), 'tidak ada undefined atau NaN');
}

console.log(`\nRINGKASAN PINSA-TUGAS-KLIEN: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
