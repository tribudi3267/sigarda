/**
 * SIMULASI BEBAN FITUR TAHAP 3 DAN 4 di atas data "sekolah penuh" (700 Penegak aktif, 150 alumni, 30 rombel; PGlite lokal). Bukan pengujian (tidak ikut `npm run uji`): hasilnya laporan.
 * Jalankan: npm run simulasi:beban
 *
 * Yang disimulasikan:
 *  1. Data diri mandiri: 700 Penegak mengisi data dirinya lewat sg_isian_saya_simpan (60% lengkap, 25% hanya isian pokok, 15% tidak mengisi) dan nomor WhatsApp.
 *  2. Pemeriksaan Data (sg_pemeriksaan_data) dengan kategori dataDiriBelum dan sfhBelum pada 700 Penegak (perhatikan batas 300 baris per kategori).
 *  3. Calon Garuda (yang layak): pelantikan, Saka, Krida, 68 capaian TKK per calon (45 TKK berbeda), penetapan SPG, tanggal lahir massal.
 *  4. Pemuatan sisi klien yang dilakukan Pembina (api().muat*: isian seluruh Penegak, TKK, SPG, pelantikan, gerbang, tim/kalender) dengan ukuran mentah dan gzip.
 *  5. Dokumen: Portofolio format Kwarcab per calon (render), salinan beku (ukuran isi), tabel pendataan Excel (buatBufferXlsx).
 *  6. Cadangan data (sg_cadangan_admin), ukuran tabel baru, dan proyeksi terhadap batas 500 MB paket gratis Supabase.
 * Waktu database di sini = PGlite (satu proses, tanpa jaringan): bandingkan antar-fungsi, jangan dibaca sebagai waktu Supabase.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { isiSekolahPenuh } from '../src/lokal/sekolahPenuh.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { AMBANG_TKK_BAWAAN, KATALOG_TKK, tkkUntukPenegak } from '../src/data/tkkData.js';
import { GERBANG_BAWAAN, tanggalLahirPeserta } from '../src/lib/gerbangLogic.js';
import { hitungSpg } from '../src/lib/spgLogic.js';
import { BUTIR_SPG } from '../src/data/spgData.js';
import { daftarLatihanLaksana } from '../src/lib/latihanLaksanaLogic.js';
import { buatIsiSnapshot, ukuranIsi, MAKS_BYTE_ISI } from '../src/lib/snapshotLogic.js';
import { barisPendataan, lembarPendataan } from '../src/lib/pendataanGarudaLogic.js';
import { buatBufferXlsx } from '../src/lib/exportXlsx.js';
import { PortofolioKwarcabDokumen } from '../src/components/PortofolioKwarcab.jsx';
import { pelantikanPeserta } from '../src/lib/pelantikanLogic.js';
import { tahunAjaranKini } from '../src/lib/rombelLogic.js';
import { pokokKurang } from '../src/lib/isianLogic.js';

const P = process.cwd().replace(/\\/g, '/');
const log = (...a) => console.log(...a);
const T0 = performance.now();

function pembangkit(benih) {
  let a = benih >>> 0;
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const acak = pembangkit(20260926);
const pilih = (arr) => arr[Math.floor(acak() * arr.length)];
const persen = (xs, p) => { if (!xs.length) return 0; const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const stat = (xs) => ({ n: xs.length, rata: xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : 0, p95: +persen(xs, 95).toFixed(2), maks: +Math.max(0, ...xs).toFixed(2) });
const kB = (n) => +(n / 1024).toFixed(1);
const waktu = async (fn) => { const t = performance.now(); const r = await fn(); return [r, performance.now() - t]; };
const ukur = (obj) => { const s = JSON.stringify(obj); return { mentahKB: kB(s.length), gzipKB: kB(gzipSync(s).length) }; };

const laporan = { data: {}, temuan: [], waktuMs: {}, ukuran: {}, dokumen: {}, tabel: {}, proyeksi: {} };
const temuan = (t) => { laporan.temuan.push(t); log('  TEMUAN:', t); };

const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
log('Membuat data sekolah penuh (700 Penegak)...');
laporan.data = await isiSekolahPenuh(pg, { penegak: 700, alumni: 150, pembina: 3 });
log('Data siap:', JSON.stringify(laporan.data), `(${((performance.now() - T0) / 1000).toFixed(0)} dtk)`);

const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { a, id: r.id }; };
const pembina = await masuk('pembina', PIN_DEMO.pembina);
const admin = await masuk('admin', PIN_DEMO.admin);
const hari = (await q('select sigarda.hari_ini()::text d'))[0].d;
const geser = async (n) => (await q('select (sigarda.hari_ini() + $1::int)::text d', [n]))[0].d;
const ta = tahunAjaranKini(hari);
const muat = async (nama, fn) => { const [r, ms] = await waktu(fn); laporan.waktuMs[nama] = +ms.toFixed(1); if (!r.ok) { temuan(`${nama} gagal: ${r.pesan}`); return null; } laporan.ukuran[nama] = ukur(r.data); return r.data; };

// ------------------------------------------------------------ 1. Data diri mandiri
log('\n== 0. Hari peluncuran: belum ada yang mengisi ==');
const penegakAktifN = (await q(`select count(*)::int n from public.profiles where role = 'peserta' and status = 'aktif'`))[0].n;
{
  const [r0, ms0] = await waktu(() => sebagai(pembina.id, 'select public.sg_pemeriksaan_data() as d'));
  const d0 = r0.rows[0].d;
  laporan.hariPeluncuran = { dataDiriBelumDikembalikan: d0.dataDiriBelum.length, ms: +ms0.toFixed(1), ukuran: ukur(d0) };
  log('Peluncuran:', JSON.stringify(laporan.hariPeluncuran));
  if (d0.dataDiriBelum.length >= 300) temuan(`Hari peluncuran: kategori "data diri belum lengkap" dipotong di ${d0.dataDiriBelum.length} baris padahal ${penegakAktifN} Penegak aktif belum mengisi; layar hanya menampilkan 300 (jumlah sebenarnya tidak terlihat).`);
}
log('\n== 1. Data diri mandiri: 700 Penegak mengisi ==');
const penegak = await q(`select id, nama, kelas, agama, jenis_kelamin jk from public.profiles where role = 'peserta' and status = 'aktif' order by username`);
const kota = ['Purbalingga', 'Bukateja', 'Banyumas', 'Kutasari', 'Kemangkon'];
const pokok = (i) => ({
  tempat_lahir: pilih(kota), alamat: `Jl. Melati No. ${1 + (i % 90)} RT 0${1 + (i % 6)}/0${1 + (i % 4)}, Bukateja`, ayah_nama: `Bapak ${pilih(['Slamet', 'Wahyu', 'Darto', 'Sugeng', 'Priyo'])}`,
  ibu_nama: `Ibu ${pilih(['Sri', 'Tuti', 'Wati', 'Yanti', 'Ratmi'])}`, lahir: `${2008 + (i % 2)}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`,
});
const lengkap = (i) => ({
  ...pokok(i), panggilan: `Pram${i % 90}`, gol_darah: pilih(['A', 'B', 'AB', 'O']), no_hp: `0812-${String(1000 + i).padStart(4, '0')}-${String(2000 + (i * 7) % 8000).padStart(4, '0')}`, tinggi: String(150 + (i % 30)), berat: String(42 + (i % 25)),
  penyakit: 'Tidak ada', ayah_hp: `0813-${String(1000 + i).padStart(4, '0')}-1111`, ayah_kerja: 'Wiraswasta', ayah_alamat: 'Bukateja', ibu_hp: `0857-${String(1000 + i).padStart(4, '0')}-2222`, ibu_kerja: 'Ibu rumah tangga', ibu_alamat: 'Bukateja',
  anak_ke: String(1 + (i % 3)), dari_saudara: '3', sdr1_nama: 'Kakak Satu', sdr1_sebagai: 'Kakak', sdr2_nama: 'Adik Dua', sdr2_sebagai: 'Adik',
  pend_tk_nama: 'TK Pertiwi', pend_tk_lulus: '2015', pend_sd_nama: 'SDN 1 Bukateja', pend_sd_lulus: '2021', pend_smp_nama: 'SMPN 1 Bukateja', pend_smp_lulus: '2024',
  akd_smp: 'Juara 2 lomba pidato tingkat kecamatan', non_sd: 'Juara 1 lomba gerak jalan', keg1_nama: 'Jambore Ranting', keg1_tingkat: 'kwarran', keg2_nama: 'Persami Kwarcab', keg2_tingkat: 'kwarcab', keg3_nama: 'Raimuna', keg3_tingkat: 'kwarda',
  bid1_nama: 'Seni Budaya', bid1_jenis: 'Menari', bid2_nama: 'Olahraga', bid2_jenis: 'Voli', it1_nama: 'Microsoft Word', it1_level: 'bisa', it2_nama: 'Canva', it2_level: 'cukup',
});
const wIsian = [], ukuranSimpan = [];
const galatIsian = {};
let lengkapN = 0, sebagianN = 0, kosongN = 0;
for (let i = 0; i < penegak.length; i += 1) {
  const p = penegak[i];
  const u = acak();
  let data = null;
  if (u < 0.6) { data = lengkap(i); lengkapN += 1; } else if (u < 0.85) { data = pokok(i); sebagianN += 1; } else { kosongN += 1; }
  if (!data) continue;
  const [r, ms] = await waktu(() => sebagai(p.id, 'select public.sg_isian_saya_simpan($1::jsonb) as n', [JSON.stringify(data)]));
  wIsian.push(ms); ukuranSimpan.push(JSON.stringify(data).length);
  if (!r.ok) galatIsian[r.pesan] = (galatIsian[r.pesan] ?? 0) + 1;
  const wa = await sebagai(p.id, 'select public.sg_profil_whatsapp_atur($1)', [`0812${String(30000000 + i * 13).slice(0, 8)}`]);
  if (!wa.ok) galatIsian[wa.pesan] = (galatIsian[wa.pesan] ?? 0) + 1;
}
laporan.waktuMs.simpanIsian = stat(wIsian);
laporan.data.isian = { lengkap: lengkapN, hanyaPokok: sebagianN, tidakMengisi: kosongN, byteRataPerSimpan: Math.round(ukuranSimpan.reduce((a, b) => a + b, 0) / Math.max(1, ukuranSimpan.length)), galat: galatIsian };
if (Object.keys(galatIsian).length) temuan(`Penyimpanan isian gagal: ${JSON.stringify(galatIsian)}`);
log('Simpan isian:', JSON.stringify(laporan.waktuMs.simpanIsian), 'baris tersimpan:', (await q('select count(*)::int n from public.penegak_isian'))[0].n);

// ------------------------------------------------------------ 2. Pemeriksaan Data
log('\n== 2. Pemeriksaan Data (700 Penegak) ==');
{
  const [r, ms] = await waktu(() => sebagai(pembina.id, 'select public.sg_pemeriksaan_data() as d'));
  laporan.waktuMs.pemeriksaanData = +ms.toFixed(1);
  const d = r.rows[0].d;
  laporan.ukuran.pemeriksaanData = ukur(d);
  const nyata = (await q(`select count(*)::int n from public.profiles p where p.role = 'peserta' and p.status = 'aktif' and (
    p.jenis_kelamin is null or p.agama is null or p.whatsapp is null or not exists (select 1 from public.tanggal_lahir t where t.peserta_id = p.id)
    or not exists (select 1 from public.penegak_isian i where i.peserta_id = p.id and i.kunci = 'tempat_lahir') or not exists (select 1 from public.penegak_isian i where i.peserta_id = p.id and i.kunci = 'alamat')
    or not exists (select 1 from public.penegak_isian i where i.peserta_id = p.id and i.kunci in ('ayah_nama', 'ibu_nama', 'wali_nama')))`))[0].n;
  laporan.pemeriksaanData = { dataDiriBelumDikembalikan: d.dataDiriBelum.length, dataDiriBelumSebenarnya: nyata, sfhBelum: d.sfhBelum.length, tanpaNta: d.tanpaNta.length, tanpaJk: d.tanpaJk.length, kelasLama: d.kelasLama.length };
  log('Pemeriksaan Data:', JSON.stringify(laporan.pemeriksaanData), `${ms.toFixed(0)} ms`, JSON.stringify(laporan.ukuran.pemeriksaanData));
  if (d.dataDiriBelum.length < nyata) temuan(`Kategori "data diri belum lengkap" dipotong di ${d.dataDiriBelum.length} baris padahal sebenarnya ${nyata} Penegak belum lengkap (batas 300 pada sg_pemeriksaan_data): angka di layar terkesan lebih kecil dari kenyataan.`);
  if (d.tanpaNta.length >= 300) temuan(`Kategori "belum ada NTA" mencapai batas 300 baris (${d.tanpaNta.length}).`);
}

// ------------------------------------------------------------ 3. Calon Garuda
log('\n== 3. Calon Garuda: pelantikan, Saka, Krida, TKK, SPG ==');
const layak = (await q(`select p.id, p.nama, p.kelas, p.agama from public.profiles p where p.role = 'peserta' and p.status = 'aktif' and sigarda.layak_garuda(p.id) order by p.username`));
laporan.data.layakGaruda = layak.length;
log('Penegak yang menyelesaikan seluruh SKU Bantara dan Laksana:', layak.length);
const calon = layak.slice(0, 40);
const galat = {};
const catat = (nama, r) => { if (!r.ok) galat[`${nama}: ${r.pesan}`] = (galat[`${nama}: ${r.pesan}`] ?? 0) + 1; return r; };
const wTkk = [];
if (calon.length) {
  const ids = calon.map((c) => c.id);
  catat('pelantikan bantara', await pembina.a.catatPelantikan({ tingkat: 'bantara', tanggal: await geser(-220), tempat: 'Lapangan SMAN 1 Bukateja', pesertaIds: ids }));
  catat('pelantikan laksana', await pembina.a.catatPelantikan({ tingkat: 'laksana', tanggal: await geser(-130), tempat: 'Bumi Perkemahan Bukateja', pesertaIds: ids }));
  for (const [ci, c] of calon.entries()) {
    catat('saka', await pembina.a.simpanSaka({ pesertaId: c.id, saka: pilih(['Saka Bhayangkara', 'Saka Bahari', 'Saka Wanabakti']), tanggalMasuk: await geser(-300), suratUrl: ci % 2 ? 'https://drive.google.com/x' : '' }));
    for (let k = 0; k < 3; k += 1) catat('krida', await pembina.a.simpanKrida({ pesertaId: c.id, nama: `Krida ${k + 1}`, tanggal: await geser(-100 + k * 10) }));
    const boleh = tkkUntukPenegak(c.agama).filter((t) => !AMBANG_TKK_BAWAAN.utamaWajib.includes(t.id));
    const rencana = [];
    for (const id of AMBANG_TKK_BAWAAN.utamaWajib) rencana.push([id, 'purwa', -180], [id, 'madya', -150], [id, 'utama', -120]);
    boleh.slice(0, 3).forEach((t) => rencana.push([t.id, 'purwa', -170], [t.id, 'madya', -140]));
    boleh.slice(3, 35).forEach((t) => rencana.push([t.id, 'purwa', -160]));
    for (const [tkkId, tingkat, off] of rencana) {
      const [r, ms] = await waktu(async () => catat(`tkk ${tingkat}`, await pembina.a.catatTkk({ pesertaId: c.id, tkkId, tingkat, tanggal: await geser(off), penguji1: 'Pembina Uji', penguji2: 'Guru Pendamping', melatih: 'Melatih adik kelas di ambalan' })));
      wTkk.push(ms);
    }
    for (const b of BUTIR_SPG.filter((x) => x.no % 2 === 1)) catat('spg', await pembina.a.catatSpg({ pesertaId: c.id, butir: b.no, nilai: 100, tanggal: await geser(-20), catatan: '' }));
  }
  laporan.waktuMs.catatTkk = stat(wTkk);
  laporan.data.calon = calon.length;
  laporan.data.tkkCapaian = (await q('select count(*)::int n from public.tkk_capaian'))[0].n;
  if (Object.keys(galat).length) temuan(`Pengisian data calon menghasilkan galat: ${JSON.stringify(Object.fromEntries(Object.entries(galat).slice(0, 5)))}`);
  // tanggal lahir massal untuk yang belum punya
  const tanpaLahir = penegak.filter((p, i) => true).map((p) => p.id);
  const daftar = (await q(`select p.username, (sigarda.hari_ini() - (365 * 17 + (row_number() over (order by p.username))::int))::text as tgl from public.profiles p where p.role = 'peserta' and p.status = 'aktif' and not exists (select 1 from public.tanggal_lahir t where t.peserta_id = p.id)`));
  const [r, ms] = await waktu(() => pembina.a.imporTanggalLahir(daftar.map((d) => ({ username: d.username, tanggal: String(d.tgl).slice(0, 10) }))));
  laporan.waktuMs.imporTanggalLahir = +ms.toFixed(1);
  laporan.data.imporTanggalLahir = { baris: daftar.length, hasil: r.ok ? 'ok' : r.pesan };
  if (!r.ok) temuan(`sg_tanggal_lahir_impor untuk ${daftar.length} baris gagal: ${r.pesan}`);
  void tanpaLahir;
} else temuan('Tidak ada Penegak yang menyelesaikan seluruh SKU pada data sekolah penuh: bagian Calon Garuda dilewati.');

// ------------------------------------------------------------ 4. Pemuatan sisi klien (Pembina)
log('\n== 4. Pemuatan sisi klien oleh Pembina ==');
const profil = await muat('muatProfil', () => pembina.a.muatProfil());
const progress = await muat('muatProgress(tanpa riwayat)', () => pembina.a.muatProgress(null, { riwayat: false }));
const isianSemua = null; // muatIsian(null) menggabung semua baris menjadi satu objek (hanya untuk satu Penegak): tidak dipakai untuk seluruh Penegak
const tkk = await muat('muatTkk', () => pembina.a.muatTkk(AMBANG_TKK_BAWAAN));
const spg = await muat('muatSpg', () => pembina.a.muatSpg());
const pel = await muat('muatPelantikanSaka', () => pembina.a.muatPelantikanSaka());
const ger = await muat('muatGerbang', () => pembina.a.muatGerbang(GERBANG_BAWAAN));
await muat('muatTimKalender', () => pembina.a.muatTimKalender());
await muat('muatSfh', () => pembina.a.muatSfh());
await muat('muatPortofolio', () => pembina.a.muatPortofolio());
const sesi = await muat('muatSesiAbsen', () => pembina.a.muatSesiAbsen());
void isianSemua;
if (calon.length) {
  await muat('muatIsian(satu Penegak)', () => pembina.a.muatIsian(calon[0].id));
  await muat('muatSnapshot(satu Penegak)', () => pembina.a.muatSnapshot(calon[0].id));
}

// ------------------------------------------------------------ 5. Dokumen
log('\n== 5. Dokumen: portofolio Kwarcab, salinan beku, pendataan Excel ==');
if (calon.length && profil && progress && tkk && pel && ger) {
  const users = profil;
  const aktif = users.filter((u) => u.role === 'peserta' && (u.status ?? 'aktif') === 'aktif');
  const wRender = [], wHitung = [], ukHtml = [], ukIsi = [], ukLatihan = [];
  const hadirLatihan = {};
  const tanggalTerawal = await geser(-130);
  const hadirRes = await pembina.a.muatHadirRentang(tanggalTerawal, hari);
  const hadirAll = hadirRes.ok ? hadirRes.data : {};
  let simpanGagal = 0, simpanOk = 0;
  for (const c of calon) {
    const peserta = users.find((u) => u.id === c.id);
    const isian = (await pembina.a.muatIsian(c.id)).data?.isian ?? {};
    const [hasilSpg, msHitung] = await waktu(async () => {
      const laks = pelantikanPeserta(pel.pelantikan, c.id).laksana?.tanggal ?? null;
      const latihan = daftarLatihanLaksana({ sesi: sesi ?? {}, hadir: hadirAll, pesertaId: c.id, tanggalLaksana: laks, hari });
      ukLatihan.push(latihan?.total ?? 0);
      Object.assign(hadirLatihan, {});
      return { spg: hitungSpg({ peserta, progress, pelantikan: pel.pelantikan, saka: pel.saka, krida: tkk.krida, capaianTkk: tkk.capaian, ambang: tkk.ambang, portofolio: {}, penetapan: spg, hari, latihan }), latihan };
    });
    wHitung.push(msHitung);
    const props = { peserta, tanggalLahir: tanggalLahirPeserta(ger.lahir, c.id), capaianTkk: tkk.capaian, krida: tkk.krida, ambang: tkk.ambang, pelantikan: pel.pelantikan, saka: pel.saka, hasilSpg: hasilSpg.spg, tim: null, portofolio: {}, isian, templat: [], tahunAjaran: ta, sertakanSurat: false, hari, latihan: hasilSpg.latihan };
    const [html, msRender] = await waktu(async () => renderToStaticMarkup(h(PortofolioKwarcabDokumen, props)));
    wRender.push(msRender); ukHtml.push(html.length);
    const isi = buatIsiSnapshot({ ...props, gudep: { nama: 'Gudep' }, hasilSpg: hasilSpg.spg });
    ukIsi.push(ukuranIsi(isi));
    if (ukIsi.at(-1) > MAKS_BYTE_ISI) temuan(`Salinan beku ${c.nama} ${ukIsi.at(-1)} byte melebihi batas ${MAKS_BYTE_ISI}.`);
    if (simpanOk + simpanGagal < 10) { const r = await pembina.a.simpanSnapshot(c.id, 'Simulasi beban', isi); if (r.ok) simpanOk += 1; else { simpanGagal += 1; if (simpanGagal === 1) temuan(`Menyimpan salinan beku gagal: ${r.pesan}`); } }
  }
  laporan.dokumen = { calon: calon.length, hitungSpgMs: stat(wHitung), renderPortofolioMs: stat(wRender), htmlKB: stat(ukHtml.map(kB)), isiSalinanKB: stat(ukIsi.map(kB)), latihanTercatatRata: +(ukLatihan.reduce((a, b) => a + b, 0) / ukLatihan.length).toFixed(1), salinanTersimpan: simpanOk };
  const kalon = users.filter((u) => calon.some((c) => c.id === u.id));
  const [buf, msXlsx] = await waktu(async () => {
    const baris = barisPendataan({ calon: kalon, aktif, progress, pelantikan: pel.pelantikan, lahir: ger.lahir, aturan: ger.aturan, hari });
    return buatBufferXlsx([lembarPendataan({ baris, aturan: ger.aturan, gudep: { nama: 'SMAN 1 Bukateja' }, hari })]);
  });
  laporan.dokumen.pendataanXlsx = { ms: +msXlsx.toFixed(1), KB: kB(buf.byteLength ?? buf.length ?? 0), baris: kalon.length };
  log('Dokumen:', JSON.stringify(laporan.dokumen));
}

// ------------------------------------------------------------ 6. Cadangan, ukuran tabel, proyeksi
log('\n== 6. Cadangan data dan ukuran tabel ==');
{
  const [r, ms] = await waktu(() => sebagai(admin.id, 'select public.sg_cadangan_admin() as d'));
  laporan.waktuMs.cadanganAdmin = +ms.toFixed(1);
  if (!r.ok) temuan(`sg_cadangan_admin gagal: ${r.pesan}`);
  else { const s = JSON.stringify(r.rows[0].d); laporan.ukuran.cadangan = { mentahKB: kB(s.length), gzipKB: kB(gzipSync(s).length) }; log('Cadangan:', JSON.stringify(laporan.ukuran.cadangan), `${ms.toFixed(0)} ms`); }
  const t = await q(`select c.relname tabel, c.reltuples::bigint baris_perkiraan, pg_total_relation_size(c.oid) byte from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' order by 3 desc`);
  const hitung = await Promise.all(t.map(async (x) => [x.tabel, Number((await q(`select count(*)::bigint n from public.${x.tabel}`))[0].n), Number(x.byte)]));
  laporan.tabel = Object.fromEntries(hitung.map(([n, baris, byte]) => [n, { baris, MB: +(byte / 1048576).toFixed(2) }]));
  const total = hitung.reduce((a, [, , b]) => a + b, 0);
  const baru = ['penegak_isian', 'tanggal_lahir', 'tkk_capaian', 'tkk_krida', 'tkk_pengajuan', 'spg_penetapan', 'pelantikan', 'saka_anggota', 'portofolio_snapshot', 'sfh_catatan', 'dokumen_templat', 'tim_penilai', 'tim_penilai_anggota'];
  const byteBaru = hitung.filter(([n]) => baru.includes(n)).reduce((a, [, , b]) => a + b, 0);
  const isiPenuh = hitung.find(([n]) => n === 'penegak_isian');
  const perPenegakLengkap = isiPenuh ? isiPenuh[2] / Math.max(1, lengkapN + sebagianN) : 0;
  laporan.proyeksi = {
    totalDataAplikasiMB: +(total / 1048576).toFixed(1), tabelTahap3dan4MB: +(byteBaru / 1048576).toFixed(2), bagianDariBatas500MB: `${((total / 1048576 / 500) * 100).toFixed(1)}%`,
    isianPerPenegakKB: +(perPenegakLengkap / 1024).toFixed(1), catatan: 'Ukuran PGlite (tanpa auth.users, WAL, dan indeks Supabase); patokan urutan besaran, bukan angka pasti. Salinan beku maksimal 20 per Penegak dan 600 kB per salinan.',
  };
  log('Proyeksi:', JSON.stringify(laporan.proyeksi));
}

laporan.lamaDetik = +((performance.now() - T0) / 1000).toFixed(0);
mkdirSync(`${P}/.uji`, { recursive: true });
writeFileSync(`${P}/.uji/simulasi-beban-tahap3-4.json`, JSON.stringify(laporan, null, 2));
log('\n== RINGKASAN ==');
log(JSON.stringify({ waktuMs: laporan.waktuMs, ukuran: laporan.ukuran, dokumen: laporan.dokumen, proyeksi: laporan.proyeksi, temuan: laporan.temuan }, null, 2));
log(`\nSelesai dalam ${laporan.lamaDetik} detik. Laporan mentah: .uji/simulasi-beban-tahap3-4.json`);
