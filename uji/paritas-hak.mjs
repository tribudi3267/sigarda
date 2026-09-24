// P4: predikat hak klien (src/lib/hakLogic.js, rombelLogic.js) HARUS sama dengan fungsi SQL bernama sama di skema `sigarda`.
// Dibandingkan pada banyak kombinasi peran x jabatan Dewan x status memakai Postgres sungguhan (PGlite), dan diulang dengan
// wajib_ganti_pin (server menolak semuanya). Juga: tampilan Dewan tidak pernah memberi hak lebih dari akunnya.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { petaProfil, susunProgress } from '../src/lib/mapDb.js';
import { layakGaruda, tingkatSelesai } from '../src/lib/skuLogic.js';
import { dewan, pembinaAtauAdmin, pembinaSaja, pengurus, pradanaAtauPradani } from '../src/lib/hakLogic.js';
import { bisaMenguji, penegakDewan, rombelSah, tahunAjaranSah } from '../src/lib/rombelLogic.js';
import { tingkatRombel } from '../src/lib/naikKelasLogic.js';
import { JENIS_USULAN } from '../src/lib/kegiatanLogic.js';
import { fmtTanggal, hariIni, tanggalLalu } from '../src/lib/format.js';
import { JENIS_AGENDA, agendaMendatang, batasMusyawarah, hariMenuju } from '../src/lib/agendaLogic.js';
import { waktuRelatif } from '../src/lib/notifikasiLogic.js';

const P = process.cwd().split(String.fromCharCode(92)).join('/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; } else { gagal++; console.log('GAGAL:', m); } };

const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
await pg.query("update public.profiles set jabatan_dewan = null where jabatan_dewan in ('Pradana', 'Pradani')"); // Pradana/Pradani unik: kosongkan agar tiap kombinasi dapat dicoba
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const idDari = async (nama) => (await q('select id from public.profiles where username = $1', [nama]))[0].id;

/** Server: semua predikat untuk satu akun. */
const server = async (id) => (await sqlSebagai(pg, id, `select sigarda.pengurus() as pengurus, sigarda.dewan() as dewan, sigarda.pembina_atau_admin() as pembina_atau_admin,
  sigarda.kelola_materi() as kelola_materi, sigarda.pembina_saja() as pembina_saja, sigarda.pradana_atau_pradani() as pradana, sigarda.bisa_menguji($1) as bisa_menguji`, [id])).rows[0];
const klien = async (id) => {
  const u = petaProfil((await q('select * from public.profiles where id = $1', [id]))[0]);
  return { u, pengurus: pengurus(u), dewan: dewan(u), pembina_atau_admin: pembinaAtauAdmin(u), kelola_materi: pembinaAtauAdmin(u), pembina_saja: pembinaSaja(u), pradana: pradanaAtauPradani(u), bisa_menguji: bisaMenguji(u) };
};

const akun = { admin: await idDari('admin'), pembina: await idDari('pembina'), dewanLama: await idDari('dewan'), penegak: await idDari('10231'), penegak2: await idDari('10232') };
const KUNCI = ['pengurus', 'dewan', 'pembina_atau_admin', 'kelola_materi', 'pembina_saja', 'pradana', 'bisa_menguji'];
let kombinasi = 0;
const bandingkan = async (nama, id) => {
  const s = await server(id), c = await klien(id);
  kombinasi++;
  for (const k of KUNCI) ok(s[k] === c[k], `${nama}: ${k} server=${s[k]} klien=${c[k]}`);
  return { s, c };
};
const ubah = (id, kolom, nilai) => q(`update public.profiles set ${kolom} = $2 where id = $1`, [id, nilai]);

console.log('--- Penegak: status x jabatan Dewan ---');
for (const status of ['aktif', 'nonaktif', 'alumni']) {
  for (const jab of [null, 'Sekretaris', 'Pradana', 'Pradani']) {
    await ubah(akun.penegak, 'jabatan_dewan', null); await ubah(akun.penegak, 'status', 'aktif');
    await ubah(akun.penegak, 'jabatan_dewan', jab); await ubah(akun.penegak, 'status', status);
    await bandingkan(`Penegak status=${status} jabatan=${jab ?? '-'}`, akun.penegak);
  }
}
await ubah(akun.penegak, 'jabatan_dewan', null); await ubah(akun.penegak, 'status', 'aktif');

console.log('--- Akun Dewan lama, Pembina, Admin: status x jabatan Dewan ---');
for (const status of ['aktif', 'nonaktif']) {
  for (const jab of [null, 'Pradana', 'Pradani', 'Bendahara']) {
    await ubah(akun.dewanLama, 'jabatan_dewan', null); await ubah(akun.dewanLama, 'status', 'aktif');
    await ubah(akun.dewanLama, 'jabatan_dewan', jab); await ubah(akun.dewanLama, 'status', status);
    await bandingkan(`Dewan lama status=${status} jabatan=${jab ?? '-'}`, akun.dewanLama);
  }
}
await ubah(akun.dewanLama, 'jabatan_dewan', null); await ubah(akun.dewanLama, 'status', 'aktif');
// Pembina dan Admin: status bukan 'aktif' hanya teori (UI tidak dapat mengubahnya), tetapi kedua sisi harus tetap sama.
for (const [nama, id] of [['Pembina', akun.pembina], ['Admin', akun.admin]]) {
  for (const status of ['aktif', 'nonaktif']) { await ubah(id, 'status', status); await bandingkan(`${nama} status=${status}`, id); }
  await ubah(id, 'status', 'aktif');
}

console.log('--- wajib_ganti_pin: server menolak semua hak; klien tidak pernah lebih ketat ---');
{
  await ubah(akun.penegak2, 'jabatan_dewan', 'Sekretaris');
  for (const [nama, id] of [['Admin', akun.admin], ['Pembina', akun.pembina], ['Dewan lama', akun.dewanLama], ['Penegak berjabatan', akun.penegak2]]) {
    await ubah(id, 'wajib_ganti_pin', true);
    const s = await server(id), c = await klien(id);
    ok(['pengurus', 'dewan', 'pembina_atau_admin', 'kelola_materi', 'pembina_saja', 'pradana'].every((k) => s[k] === false), `${nama} wajib ganti PIN: server menolak semua predikat peran`);
    ok(KUNCI.every((k) => !s[k] || c[k]), `${nama} wajib ganti PIN: klien tidak lebih ketat dari server (aplikasi memaksa ganti PIN lebih dulu)`);
    await ubah(id, 'wajib_ganti_pin', false);
  }
  await ubah(akun.penegak2, 'jabatan_dewan', null);
}

console.log('--- Sakelar pra-uji hidup: uji resmi hanya Pembina (bisaMenguji(u, true) = sigarda.bisa_menguji) ---');
{
  const sakelar = async (nilai) => {
    await q("delete from public.pengaturan where kunci = 'pra_uji.aktif'");
    if (nilai !== null) await q("insert into public.pengaturan (kunci, nilai) values ('pra_uji.aktif', $1::jsonb)", [JSON.stringify({ aktif: nilai })]);
  };
  const banding = async (nama, id, hidup) => {
    const s = (await q('select sigarda.bisa_menguji($1) b', [id]))[0].b;
    const u = petaProfil((await q('select * from public.profiles where id = $1', [id]))[0]);
    ok(s === bisaMenguji(u, hidup), `${nama}, sakelar ${hidup ? 'hidup' : 'mati'}: server=${s} klien=${bisaMenguji(u, hidup)}`);
    return s;
  };
  await ubah(akun.penegak, 'jabatan_dewan', 'Sekretaris');
  for (const hidup of [false, true]) {
    await sakelar(hidup);
    const hasil = [];
    for (const [nama, id] of [['Admin', akun.admin], ['Pembina', akun.pembina], ['akun Dewan lama', akun.dewanLama], ['Penegak berjabatan', akun.penegak], ['Penegak biasa', akun.penegak2]]) hasil.push(await banding(nama, id, hidup));
    ok(hidup ? hasil.join() === 'false,true,false,false,false' : hasil.join() === 'false,true,true,true,false', `pola hak sakelar ${hidup ? 'hidup: hanya Pembina' : 'mati: Pembina, Dewan lama, Penegak berjabatan'}`);
  }
  await ubah(akun.pembina, 'status', 'nonaktif');
  await banding('Pembina nonaktif', akun.pembina, true);
  await ubah(akun.pembina, 'status', 'aktif');
  await sakelar(null);
  await ubah(akun.penegak, 'jabatan_dewan', null);
}

console.log('--- Tampilan Dewan tidak pernah memberi hak lebih dari akun ---');
{
  // Sama dengan AppContext: dalam tampilan Dewan, Penegak berjabatan menjadi { role: 'penguji', jabatan: 'Dewan Ambalan' }.
  const tampilanDewan = (u) => (penegakDewan(u) ? { ...u, role: 'penguji', jabatan: 'Dewan Ambalan', peranAsli: 'peserta' } : u);
  for (const jab of ['Sekretaris', 'Pradana', 'Pradani']) {
    await ubah(akun.penegak, 'jabatan_dewan', jab);
    const s = await server(akun.penegak), { u } = await klien(akun.penegak);
    const t = tampilanDewan(u);
    ok(penegakDewan(u), `tampilan Dewan tersedia untuk Penegak berjabatan ${jab}`);
    ok(dewan(t) === s.dewan && pengurus(t) === s.pengurus && pradanaAtauPradani(t) === s.pradana && bisaMenguji(t) === s.bisa_menguji,
      `tampilan Dewan (${jab}) sama dengan hak server untuk akun itu`);
    ok(!pembinaAtauAdmin(t) && !pembinaSaja(t) && !s.pembina_atau_admin && !s.pembina_saja, `tampilan Dewan (${jab}) tidak menjadi Pembina/Admin`);
  }
  await ubah(akun.penegak, 'jabatan_dewan', null);
}

console.log('--- Selesai tingkat SKU dan layak Garuda: skuLogic klien = sigarda.tingkat_selesai / layak_garuda ---');
{
  const semua = (await q("select * from public.profiles where role = 'peserta' order by username")).map(petaProfil);
  const banding = async (nama, pid) => {
    const baris = await q('select * from public.sku_progress where peserta_id = $1', [pid]);
    const progress = susunProgress(baris, []);
    const u = semua.find((x) => x.id === pid);
    const s = (await q("select sigarda.tingkat_selesai($1, 'Bantara') b, sigarda.tingkat_selesai($1, 'Laksana') l, sigarda.layak_garuda($1) g", [pid]))[0];
    ok(tingkatSelesai(progress, u, 'Bantara') === s.b, nama + ': tingkatSelesai Bantara klien=' + tingkatSelesai(progress, u, 'Bantara') + ' server=' + s.b);
    ok(tingkatSelesai(progress, u, 'Laksana') === s.l, nama + ': tingkatSelesai Laksana klien=' + tingkatSelesai(progress, u, 'Laksana') + ' server=' + s.l);
    ok(layakGaruda(progress, u) === s.g, nama + ': layakGaruda klien=' + layakGaruda(progress, u) + ' server=' + s.g);
    return s;
  };
  let selesaiBantara = 0;
  for (const u of semua) { const s = await banding('data contoh ' + u.username, u.id); selesaiBantara += Number(s.b); }
  ok(selesaiBantara > 0 && selesaiBantara < semua.length, 'data contoh memuat Penegak selesai DAN belum selesai Bantara (' + selesaiBantara + ' dari ' + semua.length + ')');
  // Kasus sintetis: satu Penegak per agama; semua butir berlaku lulus, lalu butir demi butir dicabut.
  const dilihat = new Set();
  for (const u of semua.filter((x) => x.status === 'aktif')) {
    if (dilihat.has(u.agama)) continue;
    dilihat.add(u.agama);
    await q('delete from public.sku_progress where peserta_id = $1', [u.id]);
    await banding('kosong ' + u.agama, u.id);
    const unit = await q('select id from public.sku_unit where agama is null or agama = $1 order by id', [u.agama]);
    await q("insert into public.sku_progress (peserta_id, sku_id, status) select $1, id, 'lulus' from public.sku_unit where agama is null or agama = $2", [u.id, u.agama]);
    const penuh = await banding('semua lulus ' + u.agama, u.id);
    ok(penuh.g === true, 'semua butir lulus = layak Garuda (' + u.agama + ')');
    for (const x of [unit[0], unit[Math.floor(unit.length / 2)], unit[unit.length - 1]]) {
      await q("update public.sku_progress set status = 'ulang' where peserta_id = $1 and sku_id = $2", [u.id, x.id]);
      const s = await banding('satu butir ' + x.id + ' ulang (' + u.agama + ')', u.id);
      ok(s.g === false, 'satu butir belum lulus = tidak layak Garuda: ' + x.id);
      await q("update public.sku_progress set status = 'lulus' where peserta_id = $1 and sku_id = $2", [u.id, x.id]);
    }
    // Butir agama LAIN yang lulus tidak boleh menggantikan butir agama sendiri.
    await q('delete from public.sku_progress where peserta_id = $1 and sku_id in (select id from public.sku_unit where agama = $2)', [u.id, u.agama]);
    for (const l of await q('select id from public.sku_unit where agama is not null and agama <> $1 limit 2', [u.agama])) {
      await q("insert into public.sku_progress (peserta_id, sku_id, status) values ($1, $2, 'lulus') on conflict do nothing", [u.id, l.id]);
    }
    const s2 = await banding('butir agama lain lulus, agama sendiri belum (' + u.agama + ')', u.id);
    ok(s2.g === false, 'butir agama lain tidak dihitung: ' + u.agama);
  }
}

console.log('--- Predikat Pembina/Admin tidak ditulis ulang di tempat lain ---');
{
  const { readdirSync, statSync } = await import('node:fs');
  const berkas = (d) => readdirSync(d).flatMap((n) => { const p = d + '/' + n; return statSync(p).isDirectory() ? berkas(p) : /[.](jsx?|mjs)$/.test(n) ? [p] : []; });
  const pola = /role\s*===\s*'admin'\s*\|\|\s*\(\s*\w+\??[.]role\s*===\s*'penguji'\s*&&\s*\w+\??[.]jabatan\s*===\s*'Pembina'\s*\)/;
  const liar = berkas(`${P}/src`).filter((f) => !f.endsWith('/lib/hakLogic.js') && !f.includes('/src/lokal/') && pola.test(readFileSync(f, 'utf8')));
  ok(liar.length === 0, 'gunakan pembinaAtauAdmin() dari src/lib/hakLogic.js, jangan menulis ulang predikatnya: ' + liar.join(', '));
}


console.log('--- Tanggal hari ini: klien (WIB) = sigarda.hari_ini(), apa pun zona waktu perangkat ---');
{
  const asal = process.env.TZ;
  const server = (await q('select sigarda.hari_ini()::text as d'))[0].d;
  for (const tz of ['Asia/Jakarta', 'UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
    process.env.TZ = tz;
    ok(hariIni() === server, 'hariIni() klien = server pada zona waktu perangkat ' + tz + ': ' + hariIni() + ' vs ' + server);
  }
  if (asal === undefined) delete process.env.TZ; else process.env.TZ = asal;
  // Batas tengah malam WIB: 23:30 WIB = 16:30 UTC masih tanggal yang sama; 00:30 WIB = 17:30 UTC hari sebelumnya sudah tanggal berikutnya.
  ok(hariIni(new Date('2026-09-23T16:30:00Z')) === '2026-09-23' && hariIni(new Date('2026-09-23T17:30:00Z')) === '2026-09-24', 'hariIni(): pergantian hari mengikuti tengah malam WIB');
  ok(tanggalLalu(0) === server && tanggalLalu(7) < server, 'tanggalLalu memakai hari ini WIB');
  ok(hariMenuju(server) === 'Hari ini' && agendaMendatang([{ tanggal: server }]).length === 1, 'agendaLogic: hari ini bawaan = hari ini WIB (bukan UTC)');
  ok(waktuRelatif('2026-09-01T17:30:00Z', Date.parse('2026-10-30T00:00:00Z')) === fmtTanggal('2026-09-02'), 'notifikasiLogic: tanggal notifikasi lama menurut WIB (17:30 UTC = hari berikutnya)');
}


console.log('--- Fungsi murni: klien = SQL (rombel, tahun ajaran, batas Musyawarah, judul dan jenis kegiatan) ---');
{
  const daftarRombel = ['X-01', 'X-10', 'XI-05', 'XII-01', 'XII-10', 'X-00', 'X-11', 'XIII-01', 'XI-1', 'x-01', ' X-01', 'X-01 ', 'X01', 'X', '', 'XI-100', 'XII-010'];
  for (const r of daftarRombel) {
    const s = (await q('select sigarda.rombel_sah($1) as s, sigarda.tingkat_rombel($1) as t', [r]))[0];
    ok(rombelSah(r) === s.s, 'rombelSah(' + JSON.stringify(r) + ') klien=' + rombelSah(r) + ' server=' + s.s);
    ok(tingkatRombel(r) === s.t, 'tingkatRombel(' + JSON.stringify(r) + ') klien=' + tingkatRombel(r) + ' server=' + s.t);
  }
  ok((await q('select sigarda.rombel_sah(null) as s'))[0].s === false && rombelSah(null) === false, 'rombelSah(null) = false di kedua sisi');
  for (const ta of ['2026/2027', '2026/2028', '2027/2026', '1999/2000', '2000/2001', '2100/2101', '2101/2102', '26/27', '2026-2027', '', 'abcd/efgh', '2026/2027 ']) {
    const s = (await q('select sigarda.tahun_ajaran_sah($1) as s', [ta]))[0].s;
    ok(tahunAjaranSah(ta) === s, 'tahunAjaranSah(' + JSON.stringify(ta) + ') klien=' + tahunAjaranSah(ta) + ' server=' + s);
  }
  for (const ta of ['2026/2027', '2030/2031', '2000/2001']) {
    const s = (await q('select sigarda.agenda_batas_musyawarah($1)::text as d', [ta]))[0].d;
    ok(batasMusyawarah(ta) === s, 'batasMusyawarah(' + ta + ') klien=' + batasMusyawarah(ta) + ' server=' + s);
  }
  for (const j of JENIS_USULAN) {
    const s = (await q('select sigarda.kegiatan_judul_bawaan($1) as j', [j.id]))[0].j;
    ok(s === j.label, 'judul usulan ' + j.id + ' klien="' + j.label + '" server="' + s + '"');
  }
  // Jenis agenda: daftar pada batasan tabel agenda = JENIS_AGENDA klien; jenis usulan pada kegiatan_usulan = JENIS_USULAN klien.
  const jenisDi = async (tabel) => {
    const def = (await q("select pg_get_constraintdef(c.oid) as d from pg_constraint c where c.conrelid = $1::regclass and c.contype = 'c' and c.conname = $2", ['public.' + tabel, tabel + '_jenis_check']))[0]?.d ?? '';
    return [...def.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]).sort();
  };
  ok(JSON.stringify(await jenisDi('agenda')) === JSON.stringify(JENIS_AGENDA.map((j) => j.id).sort()), 'jenis agenda: batasan tabel = JENIS_AGENDA klien');
  ok(JSON.stringify(await jenisDi('kegiatan_usulan')) === JSON.stringify(JENIS_USULAN.map((j) => j.id).sort()), 'jenis usulan: batasan tabel = JENIS_USULAN klien');
}


console.log(`\nRINGKASAN PARITAS-HAK: ${lulus} lulus, ${gagal} GAGAL (${kombinasi} kombinasi akun x predikat diperiksa).`);
if (gagal) process.exit(1);
