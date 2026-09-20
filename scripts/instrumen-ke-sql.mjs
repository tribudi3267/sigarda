/**
 * Mengubah berkas Excel instrumen penilaian (format draf tinjauan) menjadi SQL untuk dijalankan di SQL Editor Supabase.
 *
 * ISI INSTRUMEN (terutama panduan penguji) SENGAJA TIDAK DISIMPAN DI REPOSITORI: repositori ini publik dan Penegak tidak boleh
 * dapat membaca panduan jawaban. Simpan berkas Excel dan SQL hasilnya di luar folder repositori.
 *
 * Pemakaian:
 *   node scripts/instrumen-ke-sql.mjs <keluaran.sql> <berkas.xlsx | folder> [...] [--mode=baru|perbarui-draf|timpa-semua]
 *
 * Mode:
 *   baru (bawaan)   hanya menambah instrumen untuk butir yang BELUM punya instrumen; yang sudah ada tidak disentuh.
 *   perbarui-draf   mengganti isi instrumen yang masih berstatus draf; yang sudah DITETAPKAN tidak disentuh.
 *   timpa-semua     mengganti isi semua instrumen, termasuk yang ditetapkan (status tidak berubah). Hati-hati: suntingan
 *                   Pembina di aplikasi ikut tertimpa.
 * Instrumen baru selalu berstatus draf (tidak dipakai menilai) sampai Pembina menetapkannya di aplikasi.
 *
 * Format Excel: sheet yang namanya diawali "Instrumen", baris kepala berisi "Kode unit", "Cara uji", "Instruksi untuk penguji",
 * "Jenis skala", "Kriteria / pertanyaan", "Bobot", "Wajib?", dan "Panduan penguji...". Kolom "Cara uji" dan "Instruksi" hanya
 * diisi pada baris pertama tiap butir. Kolom tanggapan peninjau diabaikan.
 */
import { createRequire } from 'node:module';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { INDEKS_POIN } from '../src/data/skuData.js';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');

const JENIS = ['Lisan', 'Praktik', 'Bukti kegiatan', 'Pengamatan'];
const args = process.argv.slice(2);
const opsi = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '').split('=')));
const posisi = args.filter((a) => !a.startsWith('--'));
const MODE = opsi.mode ?? 'baru';
if (!['baru', 'perbarui-draf', 'timpa-semua'].includes(MODE)) { console.error(`Mode tidak dikenal: ${MODE}`); process.exit(1); }
if (posisi.length < 2) { console.error('Pemakaian: node scripts/instrumen-ke-sql.mjs <keluaran.sql> <berkas.xlsx | folder> [...] [--mode=baru|perbarui-draf|timpa-semua]'); process.exit(1); }

const [keluar, ...masukan] = posisi;
const berkas = [...new Set(
  masukan.flatMap((p) => (statSync(p).isDirectory() ? readdirSync(p).filter((f) => /\.xlsx$/i.test(f) && !f.startsWith('~$')).map((f) => join(p, f)) : [p])).map((p) => resolve(p)),
)];
if (!berkas.length) { console.error('Tidak ada berkas .xlsx.'); process.exit(1); }

const teks = (c) => {
  const v = c?.value;
  if (v == null) return '';
  if (typeof v === 'object') return String(v.richText ? v.richText.map((r) => r.text).join('') : v.result ?? v.text ?? '').trim();
  return String(v).trim();
};

const unit = new Map();
const galat = [];
for (const f of berkas) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(f);
  const ws = wb.worksheets.find((w) => w.name.startsWith('Instrumen'));
  if (!ws) { galat.push(`${f}: tidak ada sheet "Instrumen ..."`); continue; }
  let baris = 0;
  ws.eachRow((r, n) => { if (!baris && teks(r.getCell(1)) === 'Kode unit') baris = n; });
  if (!baris) { galat.push(`${f}: baris kepala "Kode unit" tidak ditemukan`); continue; }
  const kolom = {};
  ws.getRow(baris).eachCell((c, i) => { kolom[teks(c)] = i; });
  const cari = (awal) => Object.entries(kolom).find(([k]) => k.startsWith(awal))?.[1];
  const K = { kode: cari('Kode unit'), cara: cari('Cara uji'), ins: cari('Instruksi'), jenis: cari('Jenis skala'), krit: cari('Kriteria'), bobot: cari('Bobot'), wajib: cari('Wajib'), pandu: cari('Panduan') };
  const kolomSumber = cari('Sumber nilai'); // opsional: 'iuran' = nilai disarankan dari catatan iuran (hanya butir Bantara 6 dan Laksana 6)
  const hilang = Object.entries(K).filter(([, v]) => !v).map(([k]) => k);
  if (hilang.length) { galat.push(`${f}: kolom tidak ditemukan: ${hilang.join(', ')}`); continue; }

  ws.eachRow((r, n) => {
    if (n <= baris) return;
    const kode = teks(r.getCell(K.kode));
    if (!kode) return;
    const ada = INDEKS_POIN[kode];
    if (!ada || kode.includes('-LAIN-')) { galat.push(`${f} baris ${n}: kode unit "${kode}" tidak ada di katalog`); return; }
    if (!unit.has(kode)) unit.set(kode, { kode, cara: '', instruksi: '', kriteria: [], berkas: f });
    const u = unit.get(kode);
    if (u.berkas !== f) { galat.push(`${f} baris ${n}: unit ${kode} juga ada di ${u.berkas}`); return; }
    if (!u.cara) u.cara = teks(r.getCell(K.cara));
    if (!u.instruksi) u.instruksi = teks(r.getCell(K.ins));
    const kriteria = teks(r.getCell(K.krit));
    if (!kriteria) return;
    const jenis = teks(r.getCell(K.jenis));
    const bobot = Number(teks(r.getCell(K.bobot)));
    if (!JENIS.includes(jenis)) galat.push(`${f} baris ${n} (${kode}): jenis skala "${jenis}" tidak sah`);
    if (!Number.isInteger(bobot) || bobot < 1 || bobot > 5) galat.push(`${f} baris ${n} (${kode}): bobot harus 1-5`);
    const sumber = kolomSumber && /^iuran$/i.test(teks(r.getCell(kolomSumber))) ? 'iuran' : 'manual';
    if (sumber === 'iuran' && !['BAN-06', 'LAK-06'].includes(kode)) galat.push(` baris ${n} (${kode}): sumber nilai iuran hanya untuk butir Bantara 6 dan Laksana 6`);
    u.kriteria.push({ jenis, teks: kriteria, bobot, wajib: /^wajib$/i.test(teks(r.getCell(K.wajib))), sumber, panduan: teks(r.getCell(K.pandu)) });
  });
}
for (const u of unit.values()) {
  if (!u.kriteria.length) galat.push(`${u.kode}: tidak ada kriteria`);
  if (u.kriteria.length > 15) galat.push(`${u.kode}: lebih dari 15 kriteria`);
  if (u.cara.length > 300) galat.push(`${u.kode}: cara uji lebih dari 300 karakter`);
  if (u.instruksi.length > 1500) galat.push(`${u.kode}: instruksi lebih dari 1500 karakter`);
  for (const k of u.kriteria) {
    if (k.teks.length > 400) galat.push(`${u.kode}: teks kriteria lebih dari 400 karakter`);
    if (k.panduan.length > 1500) galat.push(`${u.kode}: panduan lebih dari 1500 karakter`);
  }
}
if (galat.length) { console.error('GALAT:\n' + galat.map((g) => '  ' + g).join('\n')); process.exit(1); }

// Teks dimasukkan dengan kutip dolar bertanda, jadi tidak perlu melolos tanda kutip. Pastikan penandanya tidak muncul di isi.
const q = (s) => {
  if (/\$q\$/.test(s)) throw new Error('Isi memuat "$q$", tidak dapat dimasukkan.');
  return `$q$${s}$q$`;
};
const kodeSql = (s) => `'${String(s).replace(/'/g, "''")}'`;
const daftar = [...unit.values()].sort((a, b) => a.kode.localeCompare(b.kode));

const baris = [];
baris.push('-- ============================================================================');
baris.push(`-- ISI INSTRUMEN PENILAIAN (dibuat oleh scripts/instrumen-ke-sql.mjs, mode: ${MODE}). ${daftar.length} butir.`);
baris.push('-- BERKAS INI BERISI PANDUAN PENGUJI: JANGAN dimasukkan ke repositori (publik) dan jangan dibagikan kepada Penegak.');
baris.push('-- Jalankan SETELAH migrasi 2026-09-instrumen.sql. Instrumen baru berstatus draf sampai Pembina menetapkannya di aplikasi.');
baris.push('-- ============================================================================');
baris.push('begin;');
for (const u of daftar) {
  const penjaga = MODE === 'baru'
    ? `not exists (select 1 from public.instrumen where sku_id = ${kodeSql(u.kode)})`
    : MODE === 'perbarui-draf'
      ? `not exists (select 1 from public.instrumen where sku_id = ${kodeSql(u.kode)} and status = 'ditetapkan')`
      : 'true';
  baris.push('');
  baris.push(`-- ${u.kode}`);
  baris.push('do $blok$');
  baris.push('declare v_id bigint;');
  baris.push('begin');
  baris.push(`  if ${penjaga} then`);
  baris.push(`    insert into public.instrumen (sku_id, cara_uji, status) values (${kodeSql(u.kode)}, ${q(u.cara)}, 'draf')`);
  baris.push('      on conflict (sku_id) do update set cara_uji = excluded.cara_uji, diubah_pada = now();');
  baris.push(`    insert into public.instrumen_penguji (sku_id, instruksi) values (${kodeSql(u.kode)}, ${q(u.instruksi)})`);
  baris.push('      on conflict (sku_id) do update set instruksi = excluded.instruksi;');
  baris.push(`    delete from public.instrumen_kriteria where sku_id = ${kodeSql(u.kode)};`);
  u.kriteria.forEach((k, i) => {
    // Kolom sumber hanya disebut bila dipakai, agar berkas tetap dapat dijalankan pada basis data yang belum dimigrasi iuran
    const punyaSumber = k.sumber === 'iuran';
    baris.push(`    insert into public.instrumen_kriteria (sku_id, urutan, jenis, teks, bobot, wajib${punyaSumber ? ', sumber' : ''}) values (${kodeSql(u.kode)}, ${i + 1}, ${kodeSql(k.jenis)}, ${q(k.teks)}, ${k.bobot}, ${k.wajib}${punyaSumber ? ", 'iuran'" : ''}) returning id into v_id;`);
    baris.push(`    insert into public.instrumen_panduan (kriteria_id, panduan) values (v_id, ${q(k.panduan)});`);
  });
  baris.push('  end if;');
  baris.push('end $blok$;');
}
baris.push('');
baris.push('commit;');
baris.push('');

writeFileSync(resolve(keluar), baris.join('\n'), 'utf8');
const jumlahKriteria = daftar.reduce((s, u) => s + u.kriteria.length, 0);
console.log(`Ditulis ${keluar}: ${daftar.length} butir, ${jumlahKriteria} kriteria, mode ${MODE}.`);
const belum = Object.keys(INDEKS_POIN).filter((id) => !id.includes('-LAIN-') && !unit.has(id));
if (belum.length) console.log(`Perhatian: ${belum.length} unit katalog belum punya instrumen pada berkas masukan (${belum.slice(0, 5).join(', ')}${belum.length > 5 ? ', ...' : ''}).`);
