// Coba ulang pemuatan yang gagal sementara: pengenalan galat, jeda acak, dan pengulangan hanya untuk galat sementara;
// galat sementara ikut tampil sebagai pesan berkode; sesi tersimpan tidak dikeluarkan saat server sibuk (dijaga lewat pembacaan sumber).
import { readFileSync } from 'node:fs';
import { galatSementara, kodeGalat, jedaUlang, denganUlang, JEDA_ULANG_MS } from '../src/lib/ulangLogic.js';
import { pesanGalat, buatApi } from '../src/lib/api.js';

let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

console.log('--- pengenalan galat ---');
for (const m of ['Failed to fetch', 'Too Many Requests', 'rate limit exceeded', '503 Service Unavailable', 'upstream request timeout', 'remaining connection slots are reserved', 'canceling statement due to statement timeout', 'Bad Gateway', 'HTTP 429', 'NetworkError when attempting to fetch resource.']) {
  ok(galatSementara(m), `sementara: ${m}`);
}
for (const m of ['permission denied for table x', 'JWT expired', 'invalid token', 'Fungsi server tidak ditemukan', 'could not find the function', 'PIN salah', '', 'duplicate key value violates unique constraint "profiles_nis_key"']) {
  ok(!galatSementara(m), `bukan sementara: ${m || '(kosong)'}`);
}
ok(galatSementara(new Error('Failed to fetch')) && !galatSementara(null) && !galatSementara(undefined), 'menerima objek galat, null, dan undefined');
ok(kodeGalat('HTTP 503 Service Unavailable') === '503' && kodeGalat('429') === '429' && kodeGalat('permission denied') === '' && kodeGalat('rows 4290') === '', 'kodeGalat membaca 429 dan 5xx saja');

console.log('--- pesan untuk pengguna ---');
ok(/429/.test(pesanGalat(new Error('Too Many Requests'))), 'pesan 429 menyebut kode');
ok(/503/.test(pesanGalat(new Error('503 Service Unavailable'))) && /sibuk/.test(pesanGalat(new Error('503 Service Unavailable'))), 'pesan 503 menyebut kode dan "sibuk"');
ok(/Rincian: remaining connection slots/.test(pesanGalat(new Error('remaining connection slots are reserved for roles'))), 'pesan sibuk memuat rincian teknis untuk tangkapan layar');
ok(/Sesi berakhir/.test(pesanGalat(new Error('JWT expired'))), 'galat sesi tetap berbunyi sesi berakhir');
ok(/koneksi internet/.test(pesanGalat(new Error('Failed to fetch'))), 'pesan jaringan lama tidak berubah');

console.log('--- jeda acak ---');
for (const ke of [0, 1, 2, 5]) {
  const dasar = JEDA_ULANG_MS[Math.min(ke, JEDA_ULANG_MS.length - 1)];
  ok(jedaUlang(ke, () => 0) === Math.round(dasar * 0.5) && jedaUlang(ke, () => 0.999999) <= Math.round(dasar * 1.5), `jeda ke-${ke} berada pada 0,5x sampai 1,5x ${dasar} md`);
}
ok(new Set(Array.from({ length: 30 }, () => jedaUlang(0))).size > 5, 'jeda benar-benar diacak (perangkat tidak serempak)');

console.log('--- denganUlang ---');
const tidurPalsu = () => { const t = []; return { t, tidur: async (ms) => { t.push(ms); } }; };
{
  let n = 0; const { t, tidur } = tidurPalsu();
  const r = await denganUlang(async () => (++n < 3 ? { ok: false, sementara: true } : { ok: true, data: 1 }), { tidur });
  ok(r.ok && n === 3 && t.length === 2, `gagal sementara dua kali lalu berhasil: 3 percobaan, 2 jeda (${n}, ${t.length})`);
}
{
  let n = 0; const { t, tidur } = tidurPalsu();
  const r = await denganUlang(async () => { n++; return { ok: false, sementara: true, pesan: 'x' }; }, { tidur });
  ok(!r.ok && n === 3 && t.length === 2 && r.pesan === 'x', 'terus gagal sementara: berhenti di 3 percobaan dan mengembalikan hasil terakhir');
}
{
  let n = 0; const { t, tidur } = tidurPalsu();
  const r = await denganUlang(async () => { n++; return { ok: false, pesan: 'PIN salah' }; }, { tidur });
  ok(!r.ok && n === 1 && t.length === 0, 'galat bukan sementara (PIN salah, izin): TIDAK diulang');
}
{
  let n = 0;
  const r = await denganUlang(async () => { n++; return { ok: true }; });
  ok(r.ok && n === 1, 'berhasil sejak awal: satu percobaan, tanpa jeda');
}

console.log('--- api menandai galat sementara ---');
{
  const klien = { from: () => { const b = { select: () => b, eq: () => b, order: () => b, range: () => Promise.reject(new Error('Failed to fetch')) }; return b; } };
  const r = await buatApi(klien).muatMateri();
  ok(!r.ok && r.sementara === true, 'muat() menandai jaringan putus sebagai sementara');
  const klien2 = { from: () => { const b = { select: () => b, eq: () => b, order: () => b, range: () => Promise.resolve({ data: null, error: { message: 'permission denied for table materi' } }) }; return b; } };
  const r2 = await buatApi(klien2).muatMateri();
  ok(!r2.ok && !r2.sementara, 'muat() tidak menandai galat izin sebagai sementara');
  const klien3 = { functions: { invoke: async () => ({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { status: 503 } } }) } };
  const r3 = await buatApi(klien3).masuk('a', '1');
  ok(!r3.ok && r3.sementara === true && /503/.test(r3.pesan), 'masuk: HTTP 503 dari fungsi server = sementara, pesan berkode');
  const klien4 = { functions: { invoke: async () => ({ data: { ok: false, pesan: 'PIN salah.' }, error: null }) } };
  const r4 = await buatApi(klien4).masuk('a', '1');
  ok(!r4.ok && !r4.sementara, 'masuk: PIN salah bukan galat sementara');
}

console.log('--- sesi tersimpan tidak dikeluarkan ---');
{
  const src = readFileSync(`${process.cwd()}/src/context/AppContext.jsx`, 'utf8');
  ok(/mulaiSesi = useCallback\(async \(id, \{ pulihkan = false \} = \{\}\)/.test(src), 'mulaiSesi punya mode pulihkan');
  ok(/if \(!pulihkan \|\| r\.sesiBerakhir\) await api\(\)\.keluar\(\)/.test(src), 'keluar() hanya bila bukan pemulihan atau sesi memang berakhir');
  ok(/mulaiSesi\(id, \{ pulihkan: true \}\)/.test(src), 'sesi tersimpan dibuka dengan mode pulihkan');
  ok(/denganUlang\(\(\) => muatSemua\(\)\)/.test(src) && /denganUlang\(\(\) => api\(\)\.masuk/.test(src), 'muat awal dan masuk memakai denganUlang');
}

console.log(`\nRINGKASAN ULANG-MUAT: ${lulus} lulus, ${gagal} GAGAL.`);
process.exit(gagal ? 1 : 0);
