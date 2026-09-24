// P3 (skalabilitas klien): (1) ambilSemua membaca halaman serempak per gelombang tanpa kehilangan/menggandakan baris di batas halaman;
// (2) muatProgress(null, { riwayat: false }) tidak menyentuh sku_riwayat; (3) halaman selain beranda dimuat malas dan dibungkus BatasHalaman.
import { readFileSync } from 'node:fs';
import { buatApi, HALAMAN_SEREMPAK, UKURAN_HALAMAN } from '../src/lib/api.js';

let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

/** Klien palsu: tabel berisi `jumlah` baris {id}; mencatat setiap permintaan (tabel, rentang) dan yang berjalan bersamaan. */
function klienPalsu(jumlahPerTabel) {
  const catatan = []; let aktif = 0, puncak = 0;
  return {
    catatan, puncak: () => puncak,
    from(tabel) {
      const q = { tabel };
      const b = { select: () => b, eq: () => b, gte: () => b, lte: () => b, order: () => b, range: (a, z) => { q.a = a; q.z = z; return b; },
        then: (res, rej) => (async () => {
          catatan.push({ tabel, a: q.a, z: q.z });
          aktif++; puncak = Math.max(puncak, aktif);
          await new Promise((r) => setTimeout(r, 2));
          aktif--;
          const n = jumlahPerTabel[tabel] ?? 0;
          const data = []; for (let i = q.a; i <= Math.min(q.z, n - 1); i++) data.push({ id: i, peserta_id: 'p', sku_id: `s${i}` });
          return { data, error: null };
        })().then(res, rej) };
      return b;
    },
  };
}

console.log('--- ambilSemua: halaman serempak ---');
for (const n of [0, 5, UKURAN_HALAMAN - 1, UKURAN_HALAMAN, UKURAN_HALAMAN + 1, 2500, 5 * UKURAN_HALAMAN, 5 * UKURAN_HALAMAN + 1, 9 * UKURAN_HALAMAN + 7]) {
  const k = klienPalsu({ materi: n });
  const r = await buatApi(k).muatMateri(); // materi memakai ambilSemua; susunMateri mengubah bentuk baris, jadi hitung dari permintaan
  const baris = k.catatan.length;
  ok(r.ok, `${n} baris: berhasil (${baris} permintaan)`);
  if (n < UKURAN_HALAMAN) ok(baris === 1, `${n} baris: tabel kecil tetap SATU permintaan`);
  ok(k.puncak() <= HALAMAN_SEREMPAK, `${n} baris: permintaan bersamaan paling banyak ${HALAMAN_SEREMPAK} (puncak ${k.puncak()})`);
}
{
  // Isi persis: pakai tabel sesi (susunSesi memakai tanggal) sulit; uji langsung lewat progres yang bentuk barisnya kita kendalikan.
  const n = 3 * UKURAN_HALAMAN + 123;
  const k = klienPalsu({ sku_progress: n });
  const r = await buatApi(k).muatProgress(null, { riwayat: false });
  const jumlah = Object.values(r.data).reduce((a, p) => a + Object.keys(p).length, 0);
  ok(r.ok && jumlah === n, `progres ${n} baris: semua baris ada tepat sekali (${jumlah})`);
  const ke = k.catatan.map((c) => c.a / UKURAN_HALAMAN).sort((a, b) => a - b);
  ok(ke.join() === '0,1,2,3,4,5,6' || ke.join() === '0,1,2,3,4', `progres ${n} baris: halaman yang diminta berurutan tanpa lompat (${ke.join()})`);
}

console.log('--- muatProgress tanpa riwayat ---');
{
  const k = klienPalsu({ sku_progress: 10, sku_riwayat: 10 });
  await buatApi(k).muatProgress(null, { riwayat: false });
  ok(k.catatan.every((c) => c.tabel === 'sku_progress'), 'riwayat:false hanya membaca sku_progress');
  const k2 = klienPalsu({ sku_progress: 10, sku_riwayat: 10 });
  await buatApi(k2).muatProgress('p');
  ok(k2.catatan.some((c) => c.tabel === 'sku_riwayat'), 'bawaan (satu Penegak) tetap memuat sku_riwayat');
}

console.log('--- halaman dimuat malas ---');
{
  const app = readFileSync(`${process.cwd()}/src/App.jsx`, 'utf8');
  const impor = [...app.matchAll(/^import (\w+) from '\.\/pages\/(\w+)';$/gm)].map((m) => m[1]);
  ok(impor.every((n) => /Beranda|Dashboard|GantiPinWajib/.test(n)), `hanya beranda, dashboard, dan GantiPinWajib yang diimpor langsung dari pages: ${impor.join(', ')}`);
  ok((app.match(/= lazy\(/g) ?? []).length >= 20, 'halaman lain dimuat dengan React.lazy');
  ok(/<BatasHalaman>\{isi\}<\/BatasHalaman>/.test(app), 'isi halaman dibungkus BatasHalaman (penanda memuat + pesan galat unduhan)');
}

console.log(`\nRINGKASAN SKALA-KLIEN: ${lulus} lulus, ${gagal} GAGAL.`);
if (gagal) process.exit(1);
