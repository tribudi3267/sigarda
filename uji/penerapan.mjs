// Penerapan otomatis (tahap A dan B): pelacak migrasi, urutan README, penolakan yang aman, penandaan awal, kegagalan yang dibatalkan, log yang tidak membocorkan
// isi SQL, pemeriksaan pemasangan, dan pagar alur GitHub (kunci tulis hanya di lingkungan "produksi", tidak pernah untuk pull request).
import { PGlite } from '@electric-sql/pglite';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { skemaLama } from '../scripts/skema-lama.mjs';
import { siapkanPg } from '../src/lokal/klienFake.js';
import { urutanMigrasiReadme } from '../scripts/catatan-rilis-lib.mjs';
import { bacaMigrasi, jalankanPeriksa, pastikanPelacak, ringkasGalat, tandaiSemua, terapkanTertunda, timbangRencana } from '../scripts/penerapan/penerapan.mjs';

const P = process.cwd().replace(/\\/g, '/');
let g = 0, l = 0;
const ok = (c, m) => { if (c) { l++; console.log('ok   :', m); } else { g++; console.log('GAGAL:', m); } };
const bersih = (s) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
const sqlPeriksa = bersih(readFileSync(`${P}/supabase/demo/periksa_pemasangan.sql`, 'utf8'));
const adapter = (db) => ({ exec: async (sql) => { await db.exec(sql); }, rows: async (sql, params) => (await db.query(sql, params)).rows });
const baru = async (skema) => { const db = new PGlite(); await siapkanPg(db, { sqlStub: stub, sqlSkema: bersih(skema) }); return db; };
const tangkap = () => { const baris = []; return { log: (s) => baris.push(String(s)), baris }; };
const galat = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };

console.log('--- Urutan migrasi dari README ---');
const migrasi = bacaMigrasi(P);
const urutanReadme = urutanMigrasiReadme(readFileSync(`${P}/README.md`, 'utf8'));
ok(migrasi.map((m) => m.nama).join() === urutanReadme.join(), `urutan yang dijalankan = urutan README (${migrasi.length} migrasi)`);
ok(migrasi.length === readdirSync(`${P}/supabase/migrasi`).filter((f) => f.endsWith('.sql')).length, 'setiap berkas migrasi terdaftar di README (tanpa yang tertinggal)');
ok(migrasi.every((m) => m.sql.length > 100 && !m.sql.startsWith('﻿')), 'isi tiap migrasi terbaca dan tanpa BOM');
ok(migrasi.at(-1).nama === '2026-10-penulis-berita', 'migrasi terbaru ada di ujung daftar: ' + migrasi.at(-1).nama);
{
  const tmp = `${P}/.uji/tmp/penerapan-readme`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(`${tmp}/supabase/migrasi`, { recursive: true });
  const butir = (n) => `- [\`${n}.sql\`](supabase/migrasi/${n}.sql): x\n`;
  writeFileSync(`${tmp}/supabase/migrasi/a.sql`, 'select 1;');
  writeFileSync(`${tmp}/README.md`, butir('a') + butir('b'));
  ok(/berkasnya tidak ada: b/.test(await galat(() => bacaMigrasi(tmp)) ?? ''), 'README menyebut migrasi tanpa berkas: ditolak dengan nama');
  writeFileSync(`${tmp}/supabase/migrasi/b.sql`, 'select 1;'); writeFileSync(`${tmp}/supabase/migrasi/c.sql`, 'select 1;');
  ok(/belum didaftarkan di README.*c/.test(await galat(() => bacaMigrasi(tmp)) ?? ''), 'berkas migrasi tanpa daftar README: ditolak (urutan tak diketahui)');
  writeFileSync(`${tmp}/README.md`, butir('a') + butir('b') + butir('c') + butir('a'));
  ok(/ganda: a/.test(await galat(() => bacaMigrasi(tmp)) ?? ''), 'migrasi ganda di README: ditolak');
  rmSync(tmp, { recursive: true, force: true });
}

console.log('\n--- Menimbang rencana (murni) ---');
{
  const u = ['m1', 'm2', 'm3', 'm4'];
  ok(timbangRencana(u, []).galat && /Pelacak masih kosong/.test(timbangRencana(u, []).galat), 'pelacak kosong: menolak (tidak menjalankan seluruh riwayat migrasi)');
  const a = timbangRencana(u, ['m1', 'm2']);
  ok(a.galat === null && a.tertunda.join() === 'm3,m4', 'sebagian tercatat: yang tertunda = sisanya, berurutan');
  ok(timbangRencana(u, u).tertunda.length === 0, 'semua tercatat: tidak ada yang tertunda');
  ok(/tidak konsisten.*m2/.test(timbangRencana(u, ['m1', 'm3']).galat ?? ''), 'ada yang terlewat sebelum yang tercatat: menolak, menyebut namanya');
  ok(timbangRencana(u, ['m1', 'zz']).asing.join() === 'zz', 'tercatat tetapi tidak ada di README: dilaporkan sebagai asing');
  ok(!/select|create|postgres/i.test(ringkasGalat({ code: '22012', message: 'division by zero\nDETAIL: Key (x)=(rahasia)' })) && ringkasGalat({ code: '22012', message: 'a\nDETAIL: b' }) === '[22012] a', 'ringkasan galat: kode + baris pertama, tanpa DETAIL');
}

console.log('\n--- Menerapkan migrasi terbaru pada basis data lama ---');
{
  const db = await baru(skemaLama('a0f5941', P)); // keadaan TEPAT sebelum migrasi bersih-riwayat-cron
  const a = adapter(db);
  ok(/BEDA/.test(JSON.stringify((await jalankanPeriksa({ db: a, sql: sqlPeriksa, log: () => {} })).masalah)), 'sebelum: pemeriksaan pemasangan melihat notif_pengingat bukan versi terbaru (BEDA)');
  const { log, baris } = tangkap();
  ok(/masalah/.test(await galat(() => tandaiSemua({ db: a, migrasi, sqlPeriksa, log: () => {} })) ?? ''), 'penandaan awal ditolak selama pemeriksaan pemasangan belum bersih');
  await pastikanPelacak(db);
  ok((await db.query(`select count(*)::int n from sigarda.migrasi_terapan`)).rows[0].n === 0, 'penolakan penandaan tidak meninggalkan catatan');
  const hakPelacak = (await db.query(`select grantee from information_schema.role_table_grants where table_schema = 'sigarda' and table_name = 'migrasi_terapan' and grantee in ('anon', 'authenticated', 'public')`)).rows;
  ok(hakPelacak.length === 0, 'pelacak tanpa hak untuk anon/authenticated (bukan bagian API aplikasi)');
  ok(/Pelacak masih kosong/.test(await galat(() => terapkanTertunda({ db: a, migrasi, log })) ?? ''), 'pelacak kosong: penerapan menolak (tidak menjalankan seluruh riwayat migrasi)');
  for (const m of migrasi.slice(0, -5)) await db.query(`insert into sigarda.migrasi_terapan (nama, cara) values ($1, 'ditandai')`, [m.nama]); // seolah sudah dijalankan tangan
  const lama = (await db.query(`select md5(prosrc) m from pg_proc where proname = 'notif_pengingat'`)).rows[0].m;
  const hasil = await terapkanTertunda({ db: a, migrasi, log });
  ok(hasil.diterapkan.join() === '2026-09-bersih-riwayat-cron,2026-10-update-where,2026-10-muat-awal,2026-10-pinsa-bebas,2026-10-penulis-berita', 'hanya migrasi tertunda yang dijalankan: ' + hasil.diterapkan.join());
  ok((await db.query(`select md5(prosrc) m from pg_proc where proname = 'notif_pengingat'`)).rows[0].m !== lama, 'isi fungsi benar-benar berubah');
  ok((await db.query(`select cara from sigarda.migrasi_terapan where nama = '2026-10-penulis-berita'`)).rows[0].cara === 'dijalankan', 'tercatat sebagai "dijalankan"');
  const sesudah = await jalankanPeriksa({ db: a, sql: sqlPeriksa, log: () => {} });
  ok(sesudah.masalah.length === 0, 'sesudah: pemeriksaan pemasangan bersih');
  const ulang = await terapkanTertunda({ db: a, migrasi, log });
  ok(ulang.diterapkan.length === 0 && baris.some((s) => /Tidak ada migrasi tertunda/.test(s)), 'dijalankan lagi: tidak ada yang tertunda (tidak mengulang migrasi)');
  const log2 = baris.join('\n');
  ok(!/create or replace|postgres(ql)?:\/\/|password/i.test(log2), 'log hanya memuat nama migrasi, bukan isi SQL atau alamat sambungan');
}

console.log('\n--- Penandaan awal pada basis data yang mutakhir ---');
{
  const db = await baru(readFileSync(`${P}/supabase/skema.sql`, 'utf8'));
  const a = adapter(db);
  const r = await tandaiSemua({ db: a, migrasi, sqlPeriksa, log: () => {} });
  const cara = (await db.query(`select cara, count(*)::int n from sigarda.migrasi_terapan group by 1`)).rows;
  ok(r.ditandai === migrasi.length && cara.length === 1 && cara[0].cara === 'ditandai' && cara[0].n === migrasi.length, `semua ${migrasi.length} migrasi ditandai (bukan dijalankan)`);
  ok(/sudah berisi/.test(await galat(() => tandaiSemua({ db: a, migrasi, sqlPeriksa, log: () => {} })) ?? ''), 'penandaan kedua ditolak (hanya untuk pelacak kosong)');
  const t = await terapkanTertunda({ db: a, migrasi, log: () => {} });
  ok(t.diterapkan.length === 0, 'sesudah penandaan: tidak ada yang tertunda');
}

console.log('\n--- Migrasi gagal: dibatalkan, tidak dicatat, yang sesudahnya tidak jalan ---');
{
  const db = await baru(readFileSync(`${P}/supabase/skema.sql`, 'utf8'));
  const a = adapter(db);
  await pastikanPelacak(db);
  await db.query(`insert into sigarda.migrasi_terapan (nama, cara) values ('awal', 'ditandai')`);
  const palsu = [
    { nama: 'awal', sql: 'select 1;' },
    { nama: 'a', sql: 'begin; create table public.zz_a(x int); commit;' },
    { nama: 'b', sql: 'begin; create table public.zz_b(x int); select 1/0; commit;' },
    { nama: 'c', sql: 'begin; create table public.zz_c(x int); commit;' },
  ];
  const { log, baris } = tangkap();
  const pesan = await galat(() => terapkanTertunda({ db: a, migrasi: palsu, log }));
  ok(/Migrasi b GAGAL/.test(pesan ?? '') && /22012/.test(pesan ?? '') && /Sudah berhasil sebelumnya: a/.test(pesan ?? ''), 'pesan menyebut migrasi yang gagal, kode galat, dan yang sudah berhasil: ' + (pesan ?? '').slice(0, 120));
  ok(!/create table|zz_/.test(pesan ?? ''), 'pesan galat tidak memuat isi SQL');
  const ada = async (t) => (await db.query(`select to_regclass('public.${t}') as r`)).rows[0].r !== null;
  ok((await ada('zz_a')) && !(await ada('zz_b')) && !(await ada('zz_c')), 'a diterapkan, b dibatalkan seluruhnya, c tidak dijalankan');
  const tercatat = (await db.query('select nama from sigarda.migrasi_terapan order by 1')).rows.map((r) => r.nama).join();
  ok(tercatat === 'a,awal', 'hanya yang berhasil tercatat: ' + tercatat);
  ok(baris.every((s) => !/create table/.test(s)), 'log tidak memuat isi SQL');
}

console.log('\n--- Pagar alur GitHub ---');
{
  const alur = Object.fromEntries(readdirSync(`${P}/.github/workflows`).filter((f) => f.endsWith('.yml')).map((f) => [f, readFileSync(`${P}/.github/workflows/${f}`, 'utf8')]));
  const pakaiTulis = Object.entries(alur).filter(([, s]) => s.includes('SIGARDA_DB_URL_TULIS'));
  ok(pakaiTulis.map(([f]) => f).sort().join() === 'deploy.yml,migrasi-manual.yml', 'kunci sambungan tulis hanya dipakai deploy.yml dan migrasi-manual.yml: ' + pakaiTulis.map(([f]) => f).join());
  ok(pakaiTulis.every(([, s]) => !/pull_request/.test(s.replace(/^\s*#.*$/gm, ''))), 'alur berkunci tulis tidak pernah dipicu pull request');
  const deploy = alur['deploy.yml'];
  const bagianMigrasi = deploy.slice(deploy.indexOf('  migrasi:'), deploy.indexOf('  build:'));
  ok(/environment: produksi/.test(bagianMigrasi) && /SIGARDA_DB_URL_TULIS/.test(bagianMigrasi), 'deploy.yml: kunci tulis hanya di job migrasi yang memakai lingkungan "produksi" (persetujuan)');
  const bagianBuild = deploy.slice(deploy.indexOf('  build:'), deploy.indexOf('  deploy:'));
  ok(!/SIGARDA_DB_URL_TULIS/.test(bagianBuild) && /needs: \[cek, migrasi\]/.test(bagianBuild) && /needs\.migrasi\.result != 'failure'/.test(bagianBuild), 'situs (build) menunggu migrasi dan tidak terbit bila migrasi gagal, tanpa memegang kunci tulis');
  ok(/github\.repository == 'tribudi3267\/sigarda'/.test(bagianMigrasi), 'job migrasi hanya berjalan di repositori pemilik (bukan fork)');
  const bagianDeploy = deploy.slice(deploy.indexOf('  deploy:'));
  ok(/\n    if: \$\{\{ !cancelled\(\) && needs\.build\.result == 'success' \}\}/.test(bagianDeploy), 'job deploy punya `if` eksplisit: tanpa itu GitHub melewati penerbitan situs bila job migrasi di hulu dilewati (push tanpa migrasi)');
  ok(/needs: build/.test(bagianDeploy) && !/SIGARDA_DB_URL_TULIS/.test(bagianDeploy), 'job deploy menunggu build dan tidak memegang kunci tulis');
  ok(!/^\s*schedule:/m.test(deploy.replace(/^\s*#.*$/gm, '')), 'deploy.yml tetap tanpa jadwal harian (keputusan pemilik)');
  ok(/supabase\/migrasi/.test(deploy) && /--lewati-bila-kosong/.test(deploy), 'migrasi otomatis hanya bila berkas migrasi berubah dan dilewati bila rahasia belum diisi');
  ok(!/SIGARDA_DB_URL_TULIS/.test(alur['periksa-pemasangan.yml']) && /SIGARDA_DB_URL:/.test(alur['periksa-pemasangan.yml']), 'pemeriksaan harian hanya memakai sambungan baca-saja');
  ok(/schedule:/.test(alur['periksa-pemasangan.yml']) && /workflow_dispatch/.test(alur['periksa-pemasangan.yml']), 'pemeriksaan harian terjadwal dan dapat dijalankan tangan');
  ok(/issues: write/.test(alur['periksa-pemasangan.yml']) && !/contents: write/.test(alur['periksa-pemasangan.yml']), 'pemeriksaan harian hanya boleh membuka issue, tidak menulis kode');
  ok(/aksi:[\s\S]*options: \[tandai, terapkan\]/.test(alur['migrasi-manual.yml']) && /environment: produksi/.test(alur['migrasi-manual.yml']), 'migrasi manual: aksi terbatas pada tandai/terapkan dan memakai lingkungan "produksi"');
  ok(/AKSI: \$\{\{ inputs\.aksi \}\}/.test(alur['migrasi-manual.yml']) && /"\$AKSI"/.test(alur['migrasi-manual.yml']), 'masukan aksi dipakai lewat variabel lingkungan (bukan disisipkan ke perintah)');
}

console.log('\n--- Pintu masuk (CLI) ---');
{
  const jalan = (args, env = {}) => spawnSync(process.execPath, [`${P}/scripts/penerapan/jalankan.mjs`, ...args], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  const a = jalan(['periksa', '--lewati-bila-kosong']);
  ok(a.status === 0 && /::notice::/.test(a.stdout) && /SIGARDA_DB_URL/.test(a.stdout), 'tanpa rahasia + --lewati-bila-kosong: keluar bersih dengan catatan');
  const b = jalan(['terapkan']);
  ok(b.status === 1 && /SIGARDA_DB_URL_TULIS belum diisi/.test(b.stderr), 'tanpa rahasia dan tanpa bendera: gagal dengan pesan yang menuntun');
  const c = jalan(['hapus-semua']);
  ok(c.status === 1 && /Aksi tidak dikenal/.test(c.stderr), 'aksi tak dikenal ditolak');
  const d = jalan(['terapkan', '--lewati-bila-kosong'], { SIGARDA_DB_URL_TULIS: 'postgresql://x:kata-sandi-rahasia@tidak-ada.invalid:5432/postgres' });
  ok(d.status === 1 && !/kata-sandi-rahasia|tidak-ada\.invalid/.test(d.stdout + d.stderr), 'sambungan gagal: pesan umum, tanpa membocorkan alamat atau sandi');
  // Paket pg hanya ada di scripts/cadangan; kesalahan lama (mencarinya dari scripts/penerapan) lolos karena pesan "tidak bocor" tetap benar. Uji ini memastikan pg DITEMUKAN.
  const kunciPg = readFileSync(`${P}/scripts/penerapan/jalankan.mjs`, 'utf8');
  ok(/createRequire\(path\.join\(akar, 'scripts\/cadangan\/package\.json'\)\)\('pg'\)/.test(kunciPg) && !/import\(modulPg\)/.test(kunciPg), 'jalankan.mjs mencari pg dari scripts/cadangan (tempat npm ci memasangnya), bukan dari folder sendiri');
  if (existsSync(`${P}/scripts/cadangan/node_modules/pg`)) {
    ok(d.status === 1 && /Tidak dapat menjangkau database|Gagal menyambung|Sandi atau nama peran/.test(d.stderr) && !/Cannot find package|Paket pg belum terpasang/.test(d.stderr), 'pg ditemukan: sambungan palsu gagal di tahap koneksi (bukan karena paket tak ada): ' + d.stderr.trim().slice(0, 80));
  } else {
    ok(/Paket pg belum terpasang.*npm ci --prefix scripts\/cadangan/.test(d.stderr), 'pg belum terpasang di mesin ini: pesannya menuntun ke npm ci --prefix scripts/cadangan');
  }
}

console.log(`\nRINGKASAN PENERAPAN: ${l} lulus, ${g} GAGAL`);
process.exit(g ? 1 : 0);
