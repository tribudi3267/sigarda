// Tahap L2-A: skrip supabase/demo/ukur_muatan.sql (hanya membaca) berjalan tanpa galat di atas skema terbaru dan data sekolah penuh.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg } from '../src/lokal/klienFake.js';
import { isiDataContoh, isiStatusContoh } from '../src/lokal/seedLokal.js';
import { isiSekolahPenuh } from '../src/lokal/sekolahPenuh.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
const skema = readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '');
const berkas = readFileSync(`${P}/supabase/demo/ukur_muatan.sql`, 'utf8');

console.log('--- Berkas ukur_muatan.sql ---');
ok(/HANYA MEMBACA/.test(berkas), 'berkas menyatakan dirinya hanya membaca');
ok(!/\b(insert|update|delete|drop|alter|truncate|create)\b\s+(into|table|function|from|policy|index|extension)/i.test(berkas.replace(/^--.*$/gm, '')), 'tanpa perintah penulisan (di luar komentar)');

console.log('\n--- Berjalan tanpa galat di atas data sekolah penuh ---');
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: stub, sqlSkema: skema });
await isiDataContoh(pg);
await isiStatusContoh(pg);
await isiSekolahPenuh(pg, { penegak: 30, alumni: 5 });
let hasil = null, galat = null;
try { hasil = await pg.exec(berkas); } catch (e) { galat = e; }
ok(!galat, 'seluruh pernyataan berjalan tanpa galat' + (galat ? `: ${galat.message}` : ''));
ok(Array.isArray(hasil) && hasil.length === 5, `4 blok EXPLAIN + 1 ringkasan gabungan (${hasil?.length ?? 0} pernyataan)`);
ok((hasil?.[4]?.rows ?? []).length > 5, 'pernyataan TERAKHIR (yang tampil otomatis di SQL Editor) berisi ringkasan gabungan, bukan EXPLAIN');
const bagian = hasil?.flatMap((h) => h.rows ?? []).filter((r) => r.bagian) ?? [];
ok(bagian.some((r) => r.bagian === 'Ukuran tabel'), 'bagian "Ukuran tabel" muncul');
ok(bagian.some((r) => r.bagian === 'Ukuran database'), 'bagian "Ukuran database" muncul');
ok(bagian.filter((r) => /^Byte JSON/.test(r.bagian)).length >= 4, 'bagian "Byte JSON" muncul untuk beberapa tabel');
ok(bagian.some((r) => r.bagian === 'Jumlah anggota'), 'bagian "Jumlah anggota" ikut dalam ringkasan gabungan');
await pg.close();

console.log(`\nRINGKASAN: ${lulus} lulus, ${gagal} GAGAL.`);
if (gagal) process.exit(1);
