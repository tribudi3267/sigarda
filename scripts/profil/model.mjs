/**
 * PROFIL MUAT (L2-A): menghitung permintaan dan byte yang DIKIRIM aplikasi saat masuk dan menyegarkan, per peran, pada data sekolah penuh
 * (Postgres lokal PGlite + RLS sungguhan + lapisan API asli), lalu memperkirakan lama memuatnya di berbagai jaringan dan HP.
 * Jangan dijalankan langsung: pakai `npm run profil` (membundel berkas ini dengan esbuild). Tidak menyentuh Supabase produksi.
 *
 *   npm run profil                          semua peran, data 700 Penegak + 150 alumni
 *   npm run profil -- --cpu=6 --server=60   HP lama (CPU 6x lebih lambat), waktu database 60 md per permintaan
 *   npm run profil -- --dist=dist           pakai hasil build yang sudah ada (bawaan: membangun ke .uji/dist-ukur)
 *   npm run profil -- --json=hasil.json     simpan angka mentah
 * Model, bukan pengukuran: lihat catatan di keluaran dan panduan uji kinerja di README.
 */
import { PGlite } from '@electric-sql/pglite';
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { siapkanPg, buatKlienFake } from '../../src/lokal/klienFake.js';
import { isiDataContoh, isiStatusContoh } from '../../src/lokal/seedLokal.js';
import { isiSekolahPenuh } from '../../src/lokal/sekolahPenuh.js';
import { masukCepat } from '../../src/lokal/masukCepat.js';
import { buatApi, HALAMAN_SEREMPAK, UKURAN_HALAMAN } from '../../src/lib/api.js';
import { semesterDari, rentangKunci } from '../../src/lib/absensiLogic.js';
import { hariIni } from '../../src/lib/format.js';
import { PROFIL_JARINGAN, RTT_SERVER_MS, ringkasRantai, perkirakanSiap, simulasi } from './jaringan.mjs';

const P = process.cwd().replace(/\\/g, '/');
const arg = (nama, bawaan) => { const a = process.argv.find((x) => x.startsWith(`--${nama}=`)); return a ? a.slice(nama.length + 3) : bawaan; };
const JUMLAH = { penegak: Number(arg('penegak', 700)), alumni: Number(arg('alumni', 150)) };
const CPU = Number(arg('cpu', 6));
const SERVER_MS = Number(arg('server', 40));

/** Anggaran kinerja yang disetujui pengguna (22 Sep 2026), dalam detik. */
const ANGGARAN = {
  penegak: { fast3g: 5, slow3g: 10 },
  pengurus: { fast3g: 8, slow3g: 15 },
  transferAwalPenegakKB: 500,
  jsAwalGzipKB: 150,
};

/** Urutan pemuatan saat masuk = AppContext.muatSemua (dijaga pengujian `profil-muat`: daftar ini harus sama dengan sumbernya). */
export const BOOT = ['muatProfil', 'muatProgress', 'muatSesiAbsen', 'muatPortofolio', 'muatMateri', 'muatAsisten', 'muatPengaturanIuran', 'muatGudep', 'muatNotifikasi'];

/**
 * Halaman ke-2 dst. diminta serempak per gelombang (lihat ambilSemua di api.js): tiap "slot" gelombang menjadi satu rantai berurutan sendiri.
 * Halaman pertama ikut slot 0. Pendekatan: gelombang lain dianggap mulai bersamaan dengan halaman pertama (sedikit terlalu optimistis).
 */
const slotHalaman = (a = 0) => { const ke = Math.floor(a / UKURAN_HALAMAN); return ke === 0 ? 0 : (ke - 1) % HALAMAN_SEREMPAK; };

/** Membungkus klien agar setiap permintaan tercatat: rantai (tabel + filter) -> daftar { raw, gz } menurut urutan. */
function pantau(klien, catatan) {
  const simpan = (kunci, data) => {
    const teks = JSON.stringify(data ?? null);
    (catatan.get(kunci) ?? catatan.set(kunci, []).get(kunci)).push({ byte: gzipSync(teks).length, raw: Buffer.byteLength(teks) });
  };
  return {
    ...klien,
    from(tabel) {
      const b = klien.from(tabel);
      const proxy = new Proxy(b, {
        get(t, k) {
          if (k === 'then') return (ok, tolak) => t.then((r) => { simpan(`${tabel}|${(t.p ?? []).join(',')}|s${slotHalaman(t.a)}`, r.data); return r; }).then(ok, tolak);
          const v = t[k];
          return typeof v === 'function' ? (...a) => { const h = v.apply(t, a); return h === t ? proxy : h; } : v;
        },
      });
      return proxy;
    },
    async rpc(nama, args) {
      const r = await klien.rpc(nama, args);
      simpan(`rpc:${nama}|${JSON.stringify(args ?? {})}`, r.data);
      return r;
    },
  };
}

async function jalankanBoot(api) {
  const s = semesterDari(hariIni());
  const r = rentangKunci(s);
  const hasil = await Promise.all([...BOOT.map((n) => (n === 'muatProgress' ? api[n](null, { riwayat: false }) : api[n]())), api.muatHadirRentang(r.mulai, r.akhir)]);
  const gagal = hasil.find((x) => !x.ok);
  if (gagal) throw new Error(`pemuatan gagal: ${gagal.pesan}`);
}

const rantaiDari = (catatan) => [...catatan.values()].map((r) => r.map(({ byte }) => ({ byte })));
const totalRaw = (catatan) => [...catatan.values()].flat().reduce((a, x) => a + x.raw, 0);
const kB = (n) => (n / 1024).toFixed(n < 10240 ? 1 : 0);
const detik = (ms) => (ms / 1000).toFixed(ms < 10000 ? 1 : 0);

function bangunAplikasi() {
  let dir = arg('dist', null);
  if (!dir) {
    dir = '.uji/dist-ukur';
    console.log('Membangun aplikasi (npx vite build) untuk mengukur ukuran berkas awal...');
    const b = spawnSync(`npx vite build --outDir ${dir} --emptyOutDir`, { cwd: P, shell: true, encoding: 'utf8', timeout: 300000 });
    if (b.status !== 0) throw new Error('build gagal: ' + (b.stdout + b.stderr).slice(-400));
  }
  const gz = (f) => gzipSync(readFileSync(`${P}/${dir}/${f}`)).length;
  const berkas = readdirSync(`${P}/${dir}/assets`);
  const cari = (re) => berkas.filter((f) => re.test(f));
  const js = cari(/^index-.*\.js$/), css = cari(/^index-.*\.css$/), lain = cari(/\.js$/).filter((f) => !js.includes(f));
  return {
    html: gz('index.html'),
    js: js.reduce((a, f) => a + gz(`assets/${f}`), 0),
    css: css.reduce((a, f) => a + gz(`assets/${f}`), 0),
    jsRaw: js.reduce((a, f) => a + readFileSync(`${P}/${dir}/assets/${f}`).length, 0),
    malas: lain.map((f) => ({ berkas: f, gz: gz(`assets/${f}`) })),
  };
}

const t0 = Date.now();
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
const skema = readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '');
const penyimpan = () => { let v = null; return { ambil: () => v, simpan: (x) => { v = x; } }; };

console.log(`Membuat data sekolah (${JUMLAH.penegak} Penegak, ${JUMLAH.alumni} alumni) pada Postgres lokal...`);
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: stub, sqlSkema: skema });
await isiDataContoh(pg);
await isiStatusContoh(pg);
const ringkasData = await isiSekolahPenuh(pg, { penegak: JUMLAH.penegak, alumni: JUMLAH.alumni });
console.log(`   siap dalam ${((Date.now() - t0) / 1000).toFixed(1)} detik: ${JSON.stringify(ringkasData)}`);
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;

const massal = async (kelas) => (await q("select username from public.profiles where kelas like $1 and status = 'aktif' and jabatan_dewan is null and username ~ '^3[0-9]{4}$' order by username limit 1", [kelas]))[0]?.username;
const PERAN = [
  { kunci: 'penegak-xii', label: 'Penegak kelas XII', akun: await massal('XII-%'), jenis: 'penegak' },
  { kunci: 'penegak-x', label: 'Penegak kelas X', akun: await massal('X-%'), jenis: 'penegak' },
  { kunci: 'dewan-penegak', label: 'Penegak berjabatan Dewan', akun: '10008', jenis: 'pengurus' },
  { kunci: 'dewan-lama', label: 'Dewan (akun lama)', akun: 'dewan', jenis: 'pengurus' },
  { kunci: 'pembina', label: 'Pembina', akun: 'pembina', jenis: 'pengurus' },
  { kunci: 'admin', label: 'Admin Gudep', akun: 'admin', jenis: 'pengurus' },
];

const hasil = {};
for (const p of PERAN) {
  const k = buatKlienFake(pg, penyimpan());
  const m = await masukCepat(pg, k, p.akun);
  if (!m.ok) throw new Error(`masuk ${p.akun}: ${m.pesan}`);
  const catatan = new Map();
  const api = buatApi(pantau(k, catatan));
  await jalankanBoot(api);
  const notif = new Map();
  await buatApi(pantau(k, notif)).muatNotifikasi();
  const rs = ringkasRantai(rantaiDari(catatan));
  hasil[p.kunci] = { ...p, catatan, rantai: rantaiDari(catatan), rawByte: totalRaw(catatan), notif: rantaiDari(notif), ...rs };
}
await pg.close();

const aplikasi = bangunAplikasi();

/* ------------------------------ laporan ------------------------------ */
const garis = (n = 96) => '-'.repeat(n);
console.log(`\n${'='.repeat(96)}\nPROFIL MUAT (model) | data ${JSON.stringify(ringkasData)} | database Tokyo ~${RTT_SERVER_MS} md | HP ${CPU}x lebih lambat | server ${SERVER_MS} md/permintaan\n${'='.repeat(96)}`);

console.log('\n1. Apa yang dikirim aplikasi saat masuk (muatSemua) per peran');
console.log(`${'Peran'.padEnd(28)}${'Permintaan'.padStart(11)}${'Rantai terpanjang'.padStart(19)}${'Mentah (kB)'.padStart(13)}${'Gzip (kB)'.padStart(11)}`);
console.log(garis(82));
for (const h of Object.values(hasil)) {
  console.log(`${h.label.padEnd(28)}${String(h.permintaan).padStart(11)}${String(h.rantaiTerpanjang).padStart(19)}${kB(h.rawByte).padStart(13)}${kB(h.byte).padStart(11)}`);
}
console.log('   "Rantai terpanjang" = jumlah permintaan yang HARUS berurutan (halaman 1000 baris); tiap langkah membayar satu bolak-balik ke Tokyo.');
console.log('   Kompresi gzip dihitung dari isi JSON sebenarnya; laju kompresi nyata di Supabase HARUS diukur (panduan uji: kolom Transferred vs Size).');

console.log('\n2. Rincian per tabel (Pembina)');
const pb = hasil.pembina;
const perTabel = new Map();
for (const [kunci, reqs] of pb.catatan) {
  const t = kunci.split('|')[0];
  const a = perTabel.get(t) ?? { n: 0, raw: 0, gz: 0 };
  a.n += reqs.length; a.raw += reqs.reduce((s, x) => s + x.raw, 0); a.gz += reqs.reduce((s, x) => s + x.byte, 0);
  perTabel.set(t, a);
}
console.log(`${'Tabel'.padEnd(28)}${'Permintaan'.padStart(11)}${'Mentah (kB)'.padStart(13)}${'Gzip (kB)'.padStart(11)}`);
for (const [t, a] of [...perTabel].sort((x, y) => y[1].raw - x[1].raw)) console.log(`${t.padEnd(28)}${String(a.n).padStart(11)}${kB(a.raw).padStart(13)}${kB(a.gz).padStart(11)}`);

console.log('\n3. Berkas aplikasi (gzip, seperti dikirim GitHub Pages)');
console.log(`   index.html ${kB(aplikasi.html)} kB | JS awal ${kB(aplikasi.js)} kB (mentah ${kB(aplikasi.jsRaw)} kB) | CSS ${kB(aplikasi.css)} kB | dimuat malas: ${aplikasi.malas.map((m) => `${m.berkas.replace(/-[A-Za-z0-9_]+\.js$/, '')} ${kB(m.gz)} kB`).join(', ') || '-'}`);

const tampilTabel = (judul, dingin) => {
  console.log(`\n${judul}`);
  console.log(`${'Peran'.padEnd(28)}${PROFIL_JARINGAN.map((j) => j.nama.padStart(13)).join('')}`);
  console.log(garis(28 + 13 * PROFIL_JARINGAN.length));
  for (const h of Object.values(hasil)) {
    const baris = PROFIL_JARINGAN.map((j) => {
      const r = perkirakanSiap({ rantai: h.rantai, aplikasi: dingin ? aplikasi : null, jaringan: j, serverMs: SERVER_MS, cpu: CPU, rawByte: h.rawByte });
      const batas = ANGGARAN[h.jenis][j.kunci];
      const tanda = batas === undefined ? ' ' : r.totalMs / 1000 <= batas ? '✓' : '✗';
      return `${detik(r.totalMs)} dtk ${tanda}`.padStart(13);
    });
    console.log(`${h.label.padEnd(28)}${baris.join('')}`);
  }
};
tampilTabel('4. Perkiraan "beranda siap": KUNJUNGAN PERTAMA (berkas aplikasi belum ada di peramban)  [✓/✗ = anggaran Fast 3G dan Slow 3G]', true);
tampilTabel('5. Perkiraan "beranda siap": KUNJUNGAN ULANG (berkas aplikasi tersimpan; CORS sudah di-cache)', false);
console.log('   Anggaran: Penegak <= 5 dtk Fast 3G / <= 10 dtk Slow 3G; Pembina, Dewan, dan Admin <= 8 / <= 15. Wi-Fi dan 4G tanpa anggaran (hanya pembanding).');

console.log('\n6. Rincian satu contoh: Pembina, kunjungan ulang');
for (const j of PROFIL_JARINGAN) {
  const r = perkirakanSiap({ rantai: pb.rantai, aplikasi: null, jaringan: j, serverMs: SERVER_MS, cpu: CPU, rawByte: pb.rawByte });
  console.log(`   ${j.nama.padEnd(14)} periksa berkas ${detik(r.appMs)} + jalankan JS ${detik(r.jsMs)} + data ${detik(r.dataMs)} + olah JSON ${detik(r.prosesMs)} = ${detik(r.totalMs)} dtk`);
}

console.log('\n7. Anggaran lain');
const peg = hasil['penegak-xii'];
const awalPenegakKB = (aplikasi.html + aplikasi.js + aplikasi.css + peg.byte) / 1024;
const cek = (ok, teks) => console.log(`   ${ok ? '✓' : '✗'} ${teks}`);
cek(awalPenegakKB <= ANGGARAN.transferAwalPenegakKB, `transfer awal Penegak (aplikasi + data, gzip): ${awalPenegakKB.toFixed(0)} kB (anggaran ${ANGGARAN.transferAwalPenegakKB} kB)`);
cek(aplikasi.js / 1024 <= ANGGARAN.jsAwalGzipKB, `JS awal (gzip): ${kB(aplikasi.js)} kB (anggaran ${ANGGARAN.jsAwalGzipKB} kB)`);

/* Proyeksi transfer keluar (egress) per bulan: paket gratis 5 GB. */
const PENGURUS = Number(arg('pengurus', 17)), HARI = Number(arg('hari', 20)), MUAT_PENGURUS_HARI = Number(arg('muat-pengurus', 3));
const SESI_PENEGAK = Number(arg('sesi-penegak', 12)), MUAT_PENEGAK = Number(arg('muat-penegak', 3));
const pengurusRata = (['pembina', 'dewan-penegak'].reduce((a, k) => ({ raw: a.raw + hasil[k].rawByte, gz: a.gz + hasil[k].byte }), { raw: 0, gz: 0 }));
const GB = 1024 ** 3;
const egress = {
  pengurusRaw: PENGURUS * HARI * MUAT_PENGURUS_HARI * (pengurusRata.raw / 2), pengurusGz: PENGURUS * HARI * MUAT_PENGURUS_HARI * (pengurusRata.gz / 2),
  penegakRaw: JUMLAH.penegak * SESI_PENEGAK * MUAT_PENEGAK * peg.rawByte, penegakGz: JUMLAH.penegak * SESI_PENEGAK * MUAT_PENEGAK * peg.byte,
};
console.log(`\n8. Proyeksi transfer keluar per bulan (batas paket gratis 5 GB) — ${PENGURUS} pengurus x ${HARI} hari x ${MUAT_PENGURUS_HARI} muat/hari; ${JUMLAH.penegak} Penegak x ${SESI_PENEGAK} kunjungan x ${MUAT_PENEGAK} muat`);
console.log(`   Pengurus : ${(egress.pengurusRaw / GB).toFixed(1)} GB mentah, ${(egress.pengurusGz / GB).toFixed(1)} GB bila gzip`);
console.log(`   Penegak  : ${(egress.penegakRaw / GB).toFixed(2)} GB mentah, ${(egress.penegakGz / GB).toFixed(2)} GB bila gzip`);
console.log(`   JUMLAH   : ${((egress.pengurusRaw + egress.penegakRaw) / GB).toFixed(1)} GB mentah, ${((egress.pengurusGz + egress.penegakGz) / GB).toFixed(1)} GB bila gzip  (batas 5 GB; ubah asumsi dengan --pengurus= --hari= --muat-pengurus= --sesi-penegak= --muat-penegak=)`);

console.log('\nCatatan: ini MODEL. Tidak termasuk: antrean di jalan raya HTTP/2 yang sebenarnya, kehilangan paket seluler, pemasangan ulang sesi, dan render. Waktu database per permintaan diambil dari --server;');
console.log('ukur yang sebenarnya dengan supabase/demo/ukur_muatan.sql dan DevTools di HP (lihat panduan uji kinerja di README). Pengukuran nyata menggantikan angka model ini.');

const luar = arg('json', null);
if (luar) {
  writeFileSync(luar, JSON.stringify({ data: ringkasData, cpu: CPU, serverMs: SERVER_MS, aplikasi, peran: Object.fromEntries(Object.entries(hasil).map(([k, h]) => [k, { permintaan: h.permintaan, rantaiTerpanjang: h.rantaiTerpanjang, raw: h.rawByte, gz: h.byte }])), egress }, null, 2));
  console.log(`\nAngka mentah disimpan ke ${luar}`);
}
console.log(`\nSelesai dalam ${((Date.now() - t0) / 1000).toFixed(0)} detik.`);
