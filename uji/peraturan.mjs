// Fase A: registri peraturan kepramukaan (src/data/peraturanData.js), rujukannya (peraturanLogic.js), dan penjaga agar halaman selalu memakai registri
// (judul dan tautan berkas asli di satu tempat). Tautan yang masih hidup diperiksa terpisah: npm run periksa-peraturan (butuh internet).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { PERATURAN, DAFTAR_ID_PERATURAN, HALAMAN_PERATURAN } from '../src/data/peraturanData.js';
import { daftarRujukan, labelRujukan, selesaikanRujukan, tautanSah } from '../src/lib/peraturanLogic.js';
import { PANDUAN, PERAN_PANDUAN } from '../src/data/panduanData.js';

let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const akar = process.cwd();

console.log('--- Registri ---');
{
  ok(DAFTAR_ID_PERATURAN.length >= 10, `${DAFTAR_ID_PERATURAN.length} peraturan terdaftar`);
  ok(HALAMAN_PERATURAN === 'https://pramuka.or.id/peraturan', 'halaman rujukan resmi = pramuka.or.id/peraturan');
  ok(DAFTAR_ID_PERATURAN.every((i) => PERATURAN[i].url.startsWith('https://')), 'semua tautan https');
  for (const id of DAFTAR_ID_PERATURAN) {
    const p = PERATURAN[id];
    ok(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id), `${id}: id huruf kecil dan tanda hubung`);
    ok(p.nama?.length >= 4 && p.judul?.length >= 20, `${id}: punya nama dan judul lengkap`);
    ok(tautanSah(p.url), `${id}: tautan https yang sah (${p.url})`);
    ok(!/\s/.test(p.url), `${id}: alamat tanpa spasi (gunakan %20)`);
  }
  // Nomor unik pada judul: tidak ada dua id yang menunjuk berkas sama.
  const url = DAFTAR_ID_PERATURAN.map((i) => PERATURAN[i].url);
  ok(new Set(url).size === url.length, 'setiap peraturan punya tautan berbeda');
}

console.log('--- Logika rujukan ---');
{
  ok(selesaikanRujukan('garuda-038-2017')?.nama === 'SK Kwarnas 038/2017', 'id string diselesaikan');
  ok(selesaikanRujukan({ id: 'gudep-05-2026', bagian: 'Pasal 24' })?.bagian === 'Pasal 24', 'id dengan bagian diselesaikan');
  ok(selesaikanRujukan('tidak-ada-2000') === null, 'id tak dikenal = null');
  ok(daftarRujukan(['uu-12-2010', 'tidak-ada-2000', 'uu-12-2010']).length === 1, 'id tak dikenal dibuang dan duplikat tidak dimuat dua kali');
  ok(daftarRujukan(undefined).length === 0 && daftarRujukan('uu-12-2010').length === 1, 'rujukan kosong atau tunggal aman');
  ok(daftarRujukan([{ id: 'gudep-05-2026', bagian: 'a' }, { id: 'gudep-05-2026', bagian: 'b' }]).length === 2, 'peraturan sama dengan bagian berbeda tetap dua rujukan');
  ok(labelRujukan(selesaikanRujukan({ id: 'gudep-05-2026', bagian: 'Pasal 24' })) === 'Jukran Kwarnas 05/2026, Pasal 24', 'label rujukan');
  ok(tautanSah('https://contoh.com/x.pdf') && tautanSah('https://drive.google.com/uc?export=download&id=abc'), 'tautan https dari mana pun diterima (asal bebas)');
  ok(!tautanSah('http://pramuka.or.id/x.pdf') && !tautanSah('https://contoh.com/a b.pdf') && !tautanSah('') && !tautanSah(null), 'tautan tanpa https, berspasi, atau kosong ditolak');
}

console.log('--- Panduan memakai registri ---');
{
  for (const kode of PERAN_PANDUAN) {
    const r = PANDUAN[kode].rujukan;
    ok(Array.isArray(r) && r.length > 0, `panduan ${kode}: punya rujukan peraturan`);
    ok(daftarRujukan(r).length === r.length, `panduan ${kode}: semua id rujukan dikenal dan tidak berulang`);
  }
}

console.log('--- Halaman memakai registri (tidak menulis nomor SK dan alamat sendiri) ---');
{
  const berkas = (dir) => readdirSync(dir).flatMap((n) => {
    const j = `${dir}/${n}`;
    return statSync(j).isDirectory() ? berkas(j) : /\.(jsx?|mjs)$/.test(n) ? [j] : [];
  });
  const sumber = berkas(`${akar}/src`).filter((j) => !/[\\/]src[\\/](data[\\/]peraturanData\.js|lokal[\\/])/.test(j));
  const bukanKomentar = (teks) => teks.split('\n').filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b)).join('\n');

  // Id rujukan (berakhir tahun) pada berkas yang memakai SumberPeraturan/daftarRujukan harus ada di registri.
  const polaId = /['"]([a-z0-9]+(?:-[a-z0-9]+)*-(?:19|20)\d\d)['"]/g;
  let tersebar = 0;
  const tak = [];
  for (const j of sumber) {
    const t = readFileSync(j, 'utf8');
    if (!/SumberPeraturan|daftarRujukan|rujukan:/.test(t)) continue;
    for (const m of bukanKomentar(t).matchAll(polaId)) {
      tersebar++;
      if (!PERATURAN[m[1]]) tak.push(`${j.replace(akar, '')}: ${m[1]}`);
    }
  }
  ok(tersebar >= 20, `${tersebar} id rujukan ditemukan di halaman dan komponen`);
  ok(tak.length === 0, tak.length ? `id rujukan tidak ada di registri: ${tak.join('; ')}` : 'semua id rujukan di halaman ada di registri');

  // Halaman tidak menulis alamat berkas peraturan sendiri, dan tidak menulis judul "Keputusan Kwarnas Nomor ..." sendiri.
  const liar = [];
  for (const j of sumber) {
    const t = bukanKomentar(readFileSync(j, 'utf8'));
    if (/pramuka\.or\.id\/files\//.test(t)) liar.push(`${j.replace(akar, '')}: alamat berkas ditulis langsung`);
    if (/(SK|Keputusan|Jukran|Juklak)\s+(Kwarnas|Kwartir Nasional)[^\n'"`]{0,25}(Nomor|No\.?)\s*\d+/i.test(t)) liar.push(`${j.replace(akar, '')}: nomor SK ditulis langsung`);
  }
  ok(liar.length === 0, liar.length ? `pakai registri (peraturanData.js) + SumberPeraturan: ${liar.join('; ')}` : 'tidak ada nomor SK atau alamat berkas yang ditulis langsung di halaman');

  // Komponen dipasang di halaman utama yang bersandar pada peraturan.
  const wajib = {
    'src/pages/Kepengurusan.jsx': 'gudep-05-2026',
    'src/pages/Sidang.jsx': 'gudep-05-2026',
    'src/pages/Iuran.jsx': 'iuran-049-1987',
    'src/pages/DataGudep.jsx': 'gudep-05-2026',
    'src/pages/Portofolio.jsx': 'garuda-038-2017',
    'src/pages/PesertaSku.jsx': 'sku-penegak-2011',
    'src/pages/Absensi.jsx': 'admin-satuan-041-1995',
    'src/pages/Sangga.jsx': 'polmekbin-176-2013',
    'src/components/BeritaAcaraSidang.jsx': 'gudep-05-2026',
    'src/components/Footer.jsx': 'sku-penegak-2011',
    'src/components/PanelSuratAgama.jsx': 'agama-182-1979',
  };
  for (const [j, id] of Object.entries(wajib)) {
    const t = readFileSync(`${akar}/${j}`, 'utf8');
    ok(t.includes('<SumberPeraturan') && (t.includes(`'${id}'`) || t.includes(`"${id}"`)), `${j}: menampilkan rujukan ${id}`);
  }
  const bantuan = readFileSync(`${akar}/src/pages/Bantuan.jsx`, 'utf8');
  ok(bantuan.includes('daftarRujukan') && bantuan.includes('Rujukan peraturan'), 'Bantuan.jsx menampilkan bagian "Rujukan peraturan"');
}

console.log(`\nRINGKASAN PERATURAN: ${lulus} lulus, ${gagal} GAGAL.`);
if (gagal) process.exit(1);
