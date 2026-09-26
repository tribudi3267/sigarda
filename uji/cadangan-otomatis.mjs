// P1: cadangan mingguan otomatis. (1) enkripsi (gzip + AES-256-GCM), (2) cadangan -> pulihkan ke database KOSONG -> isi sama persis,
// (3) unggahan berpotongan ke penerima Apps Script (Kode.gs dijalankan sungguhan di vm dengan Drive tiruan), (4) alur utama dan kegagalannya.
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { siapkanPg } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { bacaSemua, cadanganWajar, susunSql } from '../scripts/cadangan/dump.mjs';
import { bukaBungkus, bungkus } from '../scripts/cadangan/enkripsi.mjs';
import { unggah } from '../scripts/cadangan/unggah.mjs';
import { jalankanCadangan, namaBerkas } from '../scripts/cadangan/otomatis.mjs';

const P = process.cwd().split(String.fromCharCode(92)).join('/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const FRASA = 'frasa-uji-yang-cukup-panjang';

console.log('--- Enkripsi ---');
{
  const isi = 'insert into public.profiles values (1); -- data rahasia Ahmad Fauzi\n'.repeat(200);
  const b = bungkus(isi, FRASA);
  ok(bukaBungkus(b, FRASA) === isi, 'bungkus lalu buka = isi asli');
  ok(!b.includes(Buffer.from('Ahmad')) && !b.includes(Buffer.from('insert into')), 'isi tidak terbaca pada berkas terenkripsi');
  ok(b.length < Buffer.byteLength(isi) / 5, 'terkompres sebelum dienkripsi (' + b.length + ' B dari ' + Buffer.byteLength(isi) + ' B)');
  ok(bungkus(isi, FRASA).equals(b) === false, 'garam dan iv acak: dua bungkus berbeda');
  let g = '';
  try { bukaBungkus(b, 'frasa-salah-salah-salah'); } catch (e) { g = e.message; }
  ok(/Frasa sandi salah/.test(g), 'frasa salah ditolak: ' + g);
  const rusak = Buffer.from(b); rusak[rusak.length - 40] ^= 1;
  g = ''; try { bukaBungkus(rusak, FRASA); } catch (e) { g = e.message; }
  ok(/rusak\/diubah/.test(g), 'satu bit diubah pada isi terdeteksi');
  g = ''; try { bukaBungkus(Buffer.from('bukan cadangan sama sekali, hanya teks biasa'), FRASA); } catch (e) { g = e.message; }
  ok(/Bukan berkas cadangan/.test(g), 'berkas asing ditolak');
  g = ''; try { bungkus('x', 'pendek'); } catch (e) { g = e.message; }
  ok(/minimal 16/.test(g), 'frasa pendek ditolak');
}

console.log('--- Cadangan lalu pemulihan ke database kosong ---');
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
const skema = readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '');
// Stub lokal tidak punya auth.identities (ada di Supabase): dibuat mirip aslinya, termasuk kolom turunan (generated) yang tidak boleh ikut disisipkan.
const IDENTITIES = `create table if not exists auth.identities (
  provider_id text not null, user_id uuid not null references auth.users(id) on delete cascade, identity_data jsonb not null, provider text not null,
  id uuid primary key default gen_random_uuid(), email text generated always as (lower(identity_data ->> 'email')) stored, created_at timestamptz default now())`;
const sumber = new PGlite();
await siapkanPg(sumber, { sqlStub: stub, sqlSkema: skema });
await sumber.exec(IDENTITIES);
await isiDataContoh(sumber);
await sumber.exec("insert into auth.identities (provider_id, user_id, identity_data, provider) select id::text, id, jsonb_build_object('email', 'Guru@Contoh.Test', 'sub', id::text), 'email' from auth.users limit 3");
// Penegak ALUMNI yang punya progres dan riwayat: pemicu tolak_peserta_tak_aktif menolak penulisan apa pun, jadi pemulihan tanpa mematikan pemicu gagal.
await sumber.exec("update public.profiles set status = 'alumni', status_pada = current_date, lulus_ta = '2025/2026' where id = (select peserta_id from public.sku_progress group by peserta_id order by count(*) desc limit 1)");
const adaAlumni = (await sumber.query("select count(*)::int as n from public.sku_progress s join public.profiles p on p.id = s.peserta_id where p.status = 'alumni'")).rows[0].n;
ok(adaAlumni > 0, 'data uji memuat progres milik Penegak alumni (' + adaAlumni + ' baris)');
const blok = await bacaSemua(sumber);
ok(cadanganWajar(blok) && blok.length > 30, `cadangan memuat ${blok.length} tabel, profiles berisi`);
ok(blok.some((b) => b.nama === 'auth.users' && b.n > 0) && !blok.some((b) => b.nama === 'public.login_gagal'), 'akun login ikut, tabel sementara login_gagal tidak');
const sql = susunSql(blok, new Date('2026-09-26T05:00:00Z'));
ok(sql.startsWith('-- Cadangan data SIGARDA, dibuat 2026-09-26T05:00:00.000Z') && sql.trimEnd().endsWith('commit;'), 'berkas SQL berkepala dan berakhir commit');

const sidik = async (db) => {
  const hasil = {};
  for (const b of blok) {
    const [s, t] = b.nama.split('.');
    // Urut menurut isi JSON agar tidak bergantung urutan penyimpanan.
    hasil[b.nama] = (await db.query(`select count(*)::int as n, md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by to_jsonb(x)::text), '')) as h from "${s}"."${t}" x`)).rows[0];
  }
  return hasil;
};
const pulih = new PGlite();
await siapkanPg(pulih, { sqlStub: stub, sqlSkema: skema });
await pulih.exec(IDENTITIES);
let galatPulih = '';
try { await pulih.exec(sql); } catch (e) { galatPulih = String(e.message).slice(0, 200); }
ok(galatPulih === '', 'berkas cadangan berjalan penuh pada database kosong (skema baru)' + (galatPulih ? ': ' + galatPulih : ''));
if (!galatPulih) {
  const a = await sidik(sumber), b = await sidik(pulih);
  const beda = Object.keys(a).filter((k) => a[k].n !== b[k].n || a[k].h !== b[k].h);
  ok(beda.length === 0, 'semua tabel hasil pulih sama persis (jumlah baris dan isi)' + (beda.length ? ': ' + beda.join(', ') : ''));
  const pemicu = (await pulih.query("select count(*)::int as n, count(*) filter (where tgenabled = 'D')::int as mati from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and not t.tgisinternal")).rows[0];
  ok(pemicu.n > 5 && pemicu.mati === 0, 'semua pemicu menyala kembali sesudah pemulihan (' + pemicu.n + ' pemicu, ' + pemicu.mati + ' mati)');
  ok(/disable trigger user/.test(sql) && /enable trigger user/.test(sql) && sql.indexOf('disable trigger user') < sql.indexOf('insert into') && sql.lastIndexOf('enable trigger user') > sql.lastIndexOf('insert into'), 'pemicu dimatikan sebelum data masuk dan dinyalakan sesudahnya');
  // Pulih dua kali tidak menggandakan data (on conflict do nothing).
  let ulang = '';
  try { await pulih.exec(sql); } catch (e) { ulang = String(e.message).slice(0, 120); }
  const c = await sidik(pulih);
  ok(ulang === '' && Object.keys(a).every((k) => c[k].n === a[k].n), 'pulih ulang aman: tidak menggandakan baris' + (ulang ? ': ' + ulang : ''));
}
{
  const kosong = new PGlite();
  await siapkanPg(kosong, { sqlStub: stub, sqlSkema: skema });
  await kosong.exec(IDENTITIES);
  const bl = await bacaSemua(kosong);
  ok(!cadanganWajar(bl), 'database tanpa profil (salah proyek) dinyatakan tidak wajar: cadangan tidak diunggah');
}

console.log('--- Peran baca-saja (supabase/demo/peran_cadangan.sql) ---');
{
  const skrip = readFileSync(`${P}/supabase/demo/peran_cadangan.sql`, 'utf8');
  const isiSandi = (sandi) => skrip.replace("sandi text := 'GANTI_SANDI_DI_SINI'", "sandi text := '" + sandi + "'");
  ok((skrip.match(/GANTI_SANDI_DI_SINI/g) ?? []).length === 1, 'kata penanda sandi hanya muncul sekali (tidak ambigu saat diganti)');
  const db = new PGlite();
  await siapkanPg(db, { sqlStub: stub, sqlSkema: skema });
  await db.exec(IDENTITIES);
  await isiDataContoh(db);
  let g = ''; try { await db.exec(skrip); } catch (e) { g = e.message; }
  ok(/Ganti isi sandi/.test(g), 'dijalankan apa adanya (sandi belum diganti): ditolak, peran tidak dibuat');
  ok((await db.query("select count(*)::int as n from pg_roles where rolname = 'cadangan_sigarda'")).rows[0].n === 0, 'peran tidak terbentuk dari skrip yang belum diisi');
  g = ''; try { await db.exec(isiSandi('pendek')); } catch (e) { g = e.message; }
  ok(/minimal 24/.test(g), 'sandi pendek ditolak');
  await db.exec(isiSandi('sandi-uji-yang-panjang-1234567890'));
  await db.exec(isiSandi('sandi-uji-yang-panjang-1234567890')); // aman diulang
  const cek = (await db.query("select r.rolcanlogin as l, pg_has_role(r.oid, 'pg_read_all_data', 'member') as m, r.rolbypassrls as b from pg_roles r where r.rolname = 'cadangan_sigarda'")).rows[0];
  ok(cek?.l === true && cek?.m === true && cek?.b === true, 'peran dibuat, dapat login, anggota pg_read_all_data, melewati RLS; aman dijalankan ulang');
  await db.exec('begin; set local role cadangan_sigarda;');
  const dibaca = (await db.query('select (select count(*)::int from auth.users) as u, (select count(*)::int from public.profiles) as p')).rows[0];
  ok(dibaca.u > 0 && dibaca.p > 0, 'peran membaca akun login dan seluruh tabel aplikasi');
  g = ''; try { await db.exec("update public.profiles set nama = 'x'"); } catch (e) { g = e.message; }
  ok(/permission denied|read-only/i.test(g), 'peran TIDAK dapat mengubah data: ' + g.slice(0, 60));
  await db.exec('rollback;');
}

console.log('--- Penerima Apps Script (Kode.gs pada vm dengan Drive tiruan) ---');
/** Drive tiruan: perilaku bertanda tangan bytes (Apps Script memberi byte bertanda -128..127). */
function buatDrive(sekarang = () => Date.now()) {
  const berkas = []; let no = 0;
  const mk = (nama, bytes) => {
    const f = { id: 'f' + ++no, nama, bytes: Array.from(bytes), sampah: false, dibuat: sekarang() };
    return { _f: f, getName: () => f.nama, getId: () => f.id, setTrashed: (v) => { f.sampah = v; return f; }, getDateCreated: () => new Date(f.dibuat), getBlob: () => ({ getBytes: () => f.bytes.slice() }) };
  };
  const hidup = () => berkas.filter((b) => !b._f.sampah);
  const iter = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const folder = {
    createFile: (blob) => { const b = mk(blob.nama, blob.bytes); berkas.push(b); return b; },
    getFilesByName: (n) => iter(hidup().filter((b) => b.getName() === n)),
    getFiles: () => iter(hidup()),
  };
  return { folder, berkas, hidup };
}
function buatPenerima({ token = 'token-uji-yang-cukup-panjang-123', simpan, sekarang } = {}) {
  const drive = buatDrive(sekarang);
  const props = { TOKEN: token, FOLDER_ID: 'folder-uji', ...(simpan ? { SIMPAN: String(simpan) } : {}) };
  const surel = [];
  const ctx = {
    console, JSON, Math, parseInt, Date, String, Array, Object, RegExp,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null }) },
    DriveApp: { getFolderById: (id) => { if (id !== 'folder-uji') throw new Error('tidak ada'); return drive.folder; } },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64')).map((b) => (b > 127 ? b - 256 : b)), // bertanda, seperti Apps Script
      newBlob: (bytes, tipe, nama) => ({ bytes, tipe, nama }),
      computeDigest: (algo, bytes) => Array.from(createHash('sha256').update(Buffer.from(bytes.map((b) => (b + 256) % 256))).digest()).map((b) => (b > 127 ? b - 256 : b)),
    },
    MailApp: { sendEmail: (...a) => surel.push(a) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'guru@sekolah.test' }) },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create() {} }) }) }) }) },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(`${P}/scripts/cadangan/apps-script/Kode.gs`, 'utf8'), ctx);
  // fetch tiruan: mengirim ke doPost seperti Web App (jawaban langsung JSON; pengalihan 302 tidak perlu ditiru).
  const fetchFn = async (url, opsi) => {
    fetchFn.dipanggil += 1;
    if (fetchFn.gagalKe && fetchFn.dipanggil === fetchFn.gagalKe) throw new Error('jaringan putus');
    const j = vm.runInContext('doPost', ctx)({ postData: { contents: opsi.body } });
    return { status: 200, text: async () => j.t };
  };
  fetchFn.dipanggil = 0;
  return { drive, props, surel, ctx, fetchFn };
}

const isi = bungkus('insert into x values (1);\n'.repeat(5000), FRASA);
{
  const r = buatPenerima();
  const hasil = await unggah({ url: 'https://x', token: 'token-uji-yang-cukup-panjang-123', nama: 'sigarda-cadangan-2026-09-26.sql.gz.enc', data: isi, ukuranPotongan: 200, fetchFn: r.fetchFn, jeda: 1 });
  const final = r.drive.hidup().filter((b) => b.getName().startsWith('sigarda-cadangan-'));
  ok(hasil.potongan >= 3 && hasil.ukuran === isi.length, `unggahan ${hasil.potongan} potongan diterima (${hasil.ukuran} B)`);
  ok(final.length === 1 && Buffer.from(final[0].getBlob().getBytes().map((b) => (b + 256) % 256)).equals(isi), 'berkas akhir di Drive sama byte-per-byte dengan yang dikirim');
  ok(r.drive.hidup().every((b) => !b.getName().startsWith('.bagian-')), 'bagian sementara dibersihkan sesudah selesai');
  ok(bukaBungkus(Buffer.from(final[0].getBlob().getBytes().map((b) => (b + 256) % 256)), FRASA).length > 1000, 'berkas dari Drive dapat dibuka dengan frasa sandi');
}
{
  const r = buatPenerima();
  let g = ''; try { await unggah({ url: 'https://x', token: 'token-salah-salah-salah-1', nama: 'sigarda-cadangan-2026-09-26.sql.gz.enc', data: isi, fetchFn: r.fetchFn, jeda: 1 }); } catch (e) { g = e.message; }
  ok(/Tidak sah/.test(g) && r.drive.hidup().length === 0 && r.fetchFn.dipanggil === 1, 'token salah: ditolak pada langkah pertama, tanpa berkas, tanpa diulang: ' + g);
  const p = r.ctx; // token kosong/pendek pada properti = penerima menolak semua permintaan
  r.props.TOKEN = 'pendek';
  g = ''; try { await unggah({ url: 'https://x', token: 'pendek', nama: 'sigarda-cadangan-2026-09-26.sql.gz.enc', data: isi, fetchFn: r.fetchFn, jeda: 1 }); } catch (e) { g = e.message; }
  ok(/Tidak sah/.test(g), 'token pendek (<16) pada properti tidak diterima walau cocok');
}
{
  const r = buatPenerima();
  r.fetchFn.gagalKe = 3; // permintaan ke-3 putus sekali, dicoba ulang otomatis
  const h = await unggah({ url: 'https://x', token: 'token-uji-yang-cukup-panjang-123', nama: 'sigarda-cadangan-2026-09-26.sql.gz.enc', data: isi, ukuranPotongan: 300, fetchFn: r.fetchFn, jeda: 1 });
  ok(h.ukuran === isi.length, 'gangguan jaringan sesaat: dicoba ulang dan tetap selesai');
}
{
  const r = buatPenerima();
  const nama = 'sigarda-cadangan-2026-09-26.sql.gz.enc';
  // Bagian hilang: kirim 'selesai' tanpa semua potongan
  const kirim = (o) => vm.runInContext('doPost', r.ctx)({ postData: { contents: JSON.stringify({ token: 'token-uji-yang-cukup-panjang-123', ...o }) } }).t;
  kirim({ aksi: 'potongan', nama, indeks: 0, jumlah: 2, data: Buffer.from('abc').toString('base64') });
  const sha = createHash('sha256').update('abcdef').digest('hex');
  ok(/belum diterima/.test(kirim({ aksi: 'selesai', nama, jumlah: 2, ukuran: 6, sha256: sha })), 'potongan kurang: penyelesaian ditolak');
  kirim({ aksi: 'potongan', nama, indeks: 0, jumlah: 1, data: Buffer.from('abc').toString('base64') });
  ok(/tidak cocok/.test(kirim({ aksi: 'selesai', nama, jumlah: 1, ukuran: 3, sha256: sha })), 'sidik jari salah: unggahan dibatalkan');
  ok(r.drive.hidup().length === 0, 'unggahan yang dibatalkan tidak meninggalkan berkas');
  ok(/Nama berkas tidak sah/.test(kirim({ aksi: 'potongan', nama: '../../rahasia.txt', indeks: 0, jumlah: 1, data: 'QQ==' })), 'nama berkas di luar pola ditolak');
  ok(/Aksi tidak dikenal/.test(kirim({ aksi: 'hapus', nama })), 'aksi asing ditolak');
}
{
  // Retensi: hanya SIMPAN cadangan terbaru yang tersisa; unggah ulang pada hari yang sama menggantikan.
  const r = buatPenerima({ simpan: 3 });
  for (const t of ['2026-08-29', '2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26', '2026-09-26']) {
    await unggah({ url: 'https://x', token: 'token-uji-yang-cukup-panjang-123', nama: `sigarda-cadangan-${t}.sql.gz.enc`, data: bungkus('data ' + t, FRASA), fetchFn: r.fetchFn, jeda: 1 });
  }
  const nama = r.drive.hidup().map((b) => b.getName()).sort();
  ok(nama.join() === 'sigarda-cadangan-2026-09-12.sql.gz.enc,sigarda-cadangan-2026-09-19.sql.gz.enc,sigarda-cadangan-2026-09-26.sql.gz.enc', 'retensi 3 terbaru; unggah ulang hari yang sama menggantikan: ' + nama.join());
}
{
  // Pemeriksaan kesegaran: email hanya bila cadangan terbaru lebih dari 9 hari.
  const nama = 'sigarda-cadangan-2026-09-19.sql.gz.enc';
  const r = buatPenerima();
  await unggah({ url: 'https://x', token: 'token-uji-yang-cukup-panjang-123', nama, data: bungkus('x', FRASA), fetchFn: r.fetchFn, jeda: 1 });
  const jam = (iso) => { class D extends Date { constructor(...a) { super(...(a.length ? a : [iso])); } static now() { return new Date(iso).getTime(); } } return D; };
  r.ctx.Date = jam('2026-09-27T01:00:00Z'); // 8 hari sesudah cadangan
  vm.runInContext('periksaKesegaran', r.ctx)();
  ok(r.surel.length === 0, 'cadangan 8 hari: tidak ada email');
  r.ctx.Date = jam('2026-09-30T01:00:00Z'); // 11 hari
  vm.runInContext('periksaKesegaran', r.ctx)();
  ok(r.surel.length === 1 && r.surel[0][0] === 'guru@sekolah.test' && /2026-09-19/.test(r.surel[0][2]), 'cadangan 11 hari: email peringatan ke pemilik skrip');
  const kosong = buatPenerima();
  vm.runInContext('periksaKesegaran', kosong.ctx)();
  ok(kosong.surel.length === 1 && /Belum ada cadangan/.test(kosong.surel[0][2]), 'folder kosong: email peringatan');
}

console.log('--- Alur utama (jalankanCadangan) ---');
{
  const r = buatPenerima();
  const log = [];
  const h = await jalankanCadangan({ db: sumber, kunci: FRASA, url: 'https://x', token: 'token-uji-yang-cukup-panjang-123', waktu: new Date('2026-09-25T22:30:00Z'), fetchFn: r.fetchFn, log: (t) => log.push(t), jeda: 1 });
  const berkas = r.drive.hidup()[0];
  ok(h.nama === 'sigarda-cadangan-2026-09-26.sql.gz.enc' && berkas.getName() === h.nama, 'nama berkas memakai tanggal WIB (22.30 UTC Jumat = Sabtu WIB): ' + h.nama);
  const sqlDrive = bukaBungkus(Buffer.from(berkas.getBlob().getBytes().map((b) => (b + 256) % 256)), FRASA);
  ok(/insert into "public"."profiles"/.test(sqlDrive) && sqlDrive.trimEnd().endsWith('commit;'), 'berkas di Drive, setelah dibuka, adalah cadangan SQL utuh');
  const teksLog = log.join('\n');
  ok(!teksLog.includes(FRASA) && !teksLog.includes('token-uji') && !/Ahmad|nama_lengkap|insert into/.test(teksLog), 'log tidak memuat frasa, token, maupun isi data');
  ok(/public\.profiles\s+\d+ baris/.test(teksLog), 'log memuat nama tabel dan jumlah baris');
  ok(namaBerkas(new Date('2026-09-26T16:59:00Z')) === 'sigarda-cadangan-2026-09-26.sql.gz.enc' && namaBerkas(new Date('2026-09-26T17:01:00Z')) === 'sigarda-cadangan-2026-09-27.sql.gz.enc', 'pergantian tanggal mengikuti tengah malam WIB');
}
{
  const kosong = new PGlite();
  await siapkanPg(kosong, { sqlStub: stub, sqlSkema: skema });
  await kosong.exec(IDENTITIES);
  const r = buatPenerima();
  let g = ''; try { await jalankanCadangan({ db: kosong, kunci: FRASA, url: 'https://x', token: 'token-uji-yang-cukup-panjang-123', fetchFn: r.fetchFn, log: () => {}, jeda: 1 }); } catch (e) { g = e.message; }
  ok(/profiles kosong/.test(g) && r.fetchFn.dipanggil === 0 && r.drive.hidup().length === 0, 'database salah proyek: gagal SEBELUM mengunggah, tidak menimpa cadangan baik: ' + g);
  g = ''; try { await jalankanCadangan({ db: sumber, kunci: 'pendek', url: 'https://x', token: 't', fetchFn: r.fetchFn, log: () => {} }); } catch (e) { g = e.message; }
  ok(/16 karakter/.test(g) && r.fetchFn.dipanggil === 0, 'frasa kurang dari 16 karakter: gagal sebelum membaca/unggah');
  g = ''; try { await jalankanCadangan({ db: sumber, kunci: FRASA, url: '', token: '', fetchFn: r.fetchFn, log: () => {} }); } catch (e) { g = e.message; }
  ok(/belum diisi/.test(g), 'alamat/token penerima kosong: gagal dengan pesan jelas');
}

console.log(`\nRINGKASAN CADANGAN-OTOMATIS: ${lulus} lulus, ${gagal} GAGAL.`);
if (gagal) process.exit(1);
