// Fase 3: "rombel saya" (filter awal Pembina/Dewan pada Peserta, Portofolio, Raport, Sesi ujian, Antrian) dan dashboard progres per rombel.
// Murni klien (tanpa server): logika rombelLogic/progresRombel, FilterBar, dan pemasangan hook di halaman.
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import FilterBar, { FILTER_AWAL, terapkanFilter } from '../src/components/FilterBar.jsx';
import { filterEfektif, ringkasDaftarRombel, rombelSaya } from '../src/lib/rombelLogic.js';
import { progresPerRombel, rombelBerPenegak } from '../src/lib/progresRombel.js';
import { daftarPoin, hitungProgres, pesertaDenganPeran } from '../src/lib/skuLogic.js';

let lulus = 0; let gagal = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const P = process.cwd().replace(/\\/g, '/');
const sumber = (f) => readFileSync(`${P}/${f}`, 'utf8');

const users = [
  { id: 'pb', role: 'penguji', jabatan: 'Pembina', nama: 'Pembina Satu', agama: 'Islam' },
  { id: 'dw', role: 'penguji', jabatan: 'Dewan Ambalan', nama: 'Dewan Satu' },
  { id: 'ad', role: 'admin', nama: 'Admin' },
  { id: 'a', role: 'peserta', nama: 'Ahmad', kelas: 'XI-03', sangga: 'Elang', agama: 'Islam' },
  { id: 'b', role: 'peserta', nama: 'Budi', kelas: 'XI-03', sangga: 'Garuda', agama: 'Islam' },
  { id: 'c', role: 'peserta', nama: 'Citra', kelas: 'X-01', sangga: 'Elang', agama: 'Islam' },
  { id: 'd', role: 'peserta', nama: 'Dewi', kelas: 'XII-02', sangga: 'Garuda', agama: 'Islam' },
  { id: 'e', role: 'peserta', nama: 'Eko', kelas: 'X', sangga: 'Elang', agama: 'Islam' }, // kelas format lama
  { id: 'f', role: 'peserta', nama: 'Fajar', kelas: '', sangga: 'Elang', agama: 'Islam' },
];
const penugasan = [
  { rombel: 'XI-03', pengujiId: 'pb' }, { rombel: 'X-01', pengujiId: 'pb' }, { rombel: 'XI-03', pengujiId: 'dw' },
  { rombel: 'XI-10', pengujiId: 'pb' }, { rombel: 'XII-02', pengujiId: 'lain' },
];

console.log('--- rombelSaya ---');
{
  ok(JSON.stringify(rombelSaya(penugasan, 'pb')) === '["X-01","XI-03","XI-10"]', 'rombel tugas terurut alami (X sebelum XI), tanpa rombel penguji lain');
  ok(JSON.stringify(rombelSaya(penugasan, 'dw')) === '["XI-03"]', 'Dewan: hanya rombelnya');
  ok(rombelSaya(penugasan, 'ad').length === 0 && rombelSaya(penugasan, 'tak-ada').length === 0, 'Admin atau penguji tanpa penugasan: kosong');
  ok(rombelSaya(null, 'pb').length === 0 && rombelSaya(undefined, 'pb').length === 0, 'penugasan belum termuat (null): kosong, bukan galat');
  ok(rombelSaya([{ rombel: 'XI-03', pengujiId: 'pb' }, { rombel: 'XI-03', pengujiId: 'pb' }], 'pb').length === 1, 'baris ganda tidak menggandakan rombel');
  ok(ringkasDaftarRombel(['X-01', 'XI-03']) === 'X-01, XI-03' && ringkasDaftarRombel(['X-01', 'XI-01', 'XI-02', 'XII-01']) === 'X-01, XI-01, XI-02 (+1)', 'ringkasan lencana: penuh bila <= 3, selebihnya (+N)');
}

console.log('--- filterEfektif dan terapkanFilter ---');
{
  const pes = pesertaDenganPeran({}, users);
  const saya = rombelSaya(penugasan, 'pb');
  const awal = { ...FILTER_AWAL, saya: true };
  ok(FILTER_AWAL.saya === false, '"Bersihkan filter" (FILTER_AWAL) = semua, tidak menyaring rombel');
  ok(terapkanFilter(pes, filterEfektif(awal, saya)).map((u) => u.nama).join() === 'Ahmad,Budi,Citra', 'rombel saya menyala: hanya Penegak XI-03 dan X-01 (rombel XI-10 kosong tak masalah)');
  ok(terapkanFilter(pes, filterEfektif({ ...FILTER_AWAL, saya: false }, saya)).length === pes.length, 'rombel saya mati: semua Penegak, termasuk kelas lama dan tanpa kelas');
  ok(terapkanFilter(pes, filterEfektif(awal, [])).length === pes.length, 'menyala tetapi penguji belum punya rombel (atau Admin, atau belum termuat): tidak menyaring');
  ok(terapkanFilter(pes, filterEfektif({ ...awal, sangga: 'Garuda' }, saya)).map((u) => u.nama).join() === 'Budi', 'digabung dengan filter sangga');
  ok(terapkanFilter(pes, filterEfektif({ ...awal, q: 'cit' }, saya)).map((u) => u.nama).join() === 'Citra', 'digabung dengan pencarian nama');
  ok(terapkanFilter(pes, { ...FILTER_AWAL }).length === pes.length && terapkanFilter(pes, { q: '', kelas: 'X' }).map((u) => u.nama).join() === 'Eko', 'filter tanpa kunci rombel/saya (pemanggil lama) tetap bekerja');
  const ef = filterEfektif(awal, saya);
  ok(ef.saya === true && awal.rombel === undefined, 'filterEfektif membuat salinan, tidak mengubah filter asal');
}

console.log('--- FilterBar ---');
{
  const pes = pesertaDenganPeran({}, users);
  const render = (props) => renderToStaticMarkup(h(FilterBar, { data: pes, setFilter: () => {}, ...props }));
  const a = render({ filter: { ...FILTER_AWAL, saya: true }, rombelSaya: ['X-01', 'XI-03'] });
  ok(a.includes('Hanya rombel saya (X-01, XI-03)') && a.includes('checked=""') && a.includes('Bersihkan filter'), 'rombel saya menyala: kotak tercentang, ada "Bersihkan filter"');
  const b = render({ filter: { ...FILTER_AWAL }, rombelSaya: ['X-01'] });
  ok(b.includes('Hanya rombel saya (X-01)') && !b.includes('checked=""') && !b.includes('Bersihkan filter'), 'rombel saya mati: kotak kosong, tanpa "Bersihkan filter"');
  const c = render({ filter: { ...FILTER_AWAL, saya: true } });
  ok(!c.includes('Hanya rombel saya') && !c.includes('Bersihkan filter'), 'tanpa rombel tugas (Admin dan lainnya): tombol tidak ada dan "Bersihkan filter" tidak muncul karenanya');
  const d = render({ filter: { ...FILTER_AWAL }, rombelSaya: [] });
  ok(!d.includes('Hanya rombel saya'), 'rombelSaya kosong: tombol tidak ada');
}

console.log('--- progresPerRombel ---');
{
  const ban = daftarPoin('Bantara', 'Islam');
  const lak = daftarPoin('Laksana', 'Islam');
  const lulusSemua = (id, poin) => Object.fromEntries(poin.map((p) => [p.id, { status: 'lulus', riwayat: [] }]));
  const progress = {
    a: lulusSemua('a', ban), // Ahmad: Bantara selesai
    b: { [ban[0].id]: { status: 'lulus', riwayat: [] } }, // Budi: sebagian
    c: { [ban[1].id]: { status: 'diajukan', pengujiId: 'pb', riwayat: [] }, [ban[2].id]: { status: 'proses', riwayat: [] } }, // Citra: 1 menunggu, 1 diuji (antrian rombel)
  };
  const pes = pesertaDenganPeran(progress, users);
  const hasil = progresPerRombel({ progress, daftarPeserta: pes, users, penugasan, rombel: ['XI-03', 'X-01', 'XI-10'] });
  const [xi3, x1, xi10] = hasil;
  ok(hasil.map((k) => k.rombel).join() === 'XI-03,X-01,XI-10', 'urutan kartu mengikuti daftar rombel yang diminta');
  ok(xi3.jumlah === 2 && xi3.peserta.map((p) => p.nama).join() === 'Ahmad,Budi', 'XI-03: dua Penegak, terurut nama');
  ok(xi3.selesaiBantara === 1 && xi3.selesaiLaksana === 0, 'XI-03: satu selesai Bantara, belum ada Laksana');
  const rataB = Math.round((100 + hitungProgres(progress, pes.find((u) => u.id === 'b'), 'Bantara').persen) / 2);
  ok(xi3.rataBantara === rataB && xi3.rataLaksana === 0, `XI-03: rata-rata Bantara ${rataB}% (rata dari Ahmad 100% dan Budi sebagian), Laksana 0%`);
  ok(xi3.penguji.join() === 'Pembina Satu,Dewan Satu', 'XI-03: penguji bertugas, Pembina dahulu lalu Dewan');
  ok(xi3.perPeran['calon-laksana'] === 1 && xi3.perPeran['calon-bantara'] === 1, 'XI-03: komposisi peran (Ahmad Calon Laksana, Budi Calon Bantara)');
  ok(x1.jumlah === 1 && x1.menunggu === 1 && x1.diuji === 1, 'X-01: antrian dihitung per rombel (1 menunggu, 1 sedang diuji)');
  ok(xi3.menunggu === 0 && xi3.diuji === 0, 'XI-03: tanpa antrian');
  ok(xi10.jumlah === 0 && xi10.rataBantara === 0 && xi10.rataLaksana === 0 && xi10.peserta.length === 0, 'rombel tanpa Penegak: kartu kosong, tanpa NaN');
  ok(progresPerRombel({ progress, daftarPeserta: pes, users, penugasan: null, rombel: ['XI-03'] })[0].penguji.length === 0, 'penugasan belum termuat (null): tanpa nama penguji, tidak galat');

  const semua = rombelBerPenegak(pes);
  ok(semua.join('|') === 'X|X-01|XI-03|XII-02|', 'semua rombel ber-Penegak: kelas lama ikut, terurut alami, "tanpa kelas" di akhir: ' + semua.join('|'));
  const tanpa = progresPerRombel({ progress, daftarPeserta: pes, users, penugasan, rombel: semua }).find((k) => k.rombel === '');
  ok(tanpa && tanpa.jumlah === 1 && tanpa.peserta[0].nama === 'Fajar', 'Penegak tanpa kelas dikelompokkan sendiri (kunci kosong)');
}

console.log('--- Pemasangan di halaman ---');
{
  for (const [f, hook] of [['src/pages/PengujiDashboard.jsx', 'useFilterRombel'], ['src/pages/Portofolio.jsx', 'useFilterRombel'], ['src/pages/Raport.jsx', 'useFilterRombel']]) {
    const s = sumber(f);
    ok(s.includes(`{ ${hook} }`) && s.includes('efektif') && s.includes('rombelSaya={rombelSaya}'), `${f}: memakai ${hook}, memfilter dengan filter efektif, dan meneruskan rombel ke FilterBar`);
  }
  ok(!/useState\(FILTER_AWAL\)/.test(sumber('src/pages/Portofolio.jsx') + sumber('src/pages/Raport.jsx') + sumber('src/pages/PengujiDashboard.jsx')), 'tidak ada lagi filter Peserta/Portofolio/Raport yang bermula tanpa rombel saya');
  ok(/import useRombelSaya/.test(sumber('src/pages/SesiUjian.jsx')) && sumber('src/pages/SesiUjian.jsx').includes('Hanya rombel saya'), 'Sesi ujian: pemilih peserta dan papan memakai rombel saya');
  ok(/<ProgresRombel penugasan=\{penugasan\}/.test(sumber('src/pages/PengujiDashboard.jsx')), 'Dashboard Pembina/Dewan memuat kartu progres per rombel');
  const ex = sumber('src/lib/exportLaporan.js');
  ok(ex.includes('filter.rombel?.length'), 'ekspor Excel menyebut "rombel saya" pada keterangan filter');
  const ap = sumber('src/hooks/useRombelSaya.js');
  ok(ap.includes("user?.role === 'penguji'"), 'hook hanya berlaku untuk penguji (Admin tidak menyaring)');
}

console.log(`\nRINGKASAN ROMBEL-SAYA: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
