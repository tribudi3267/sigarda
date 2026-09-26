// Tahap 3 (H1, lanjutan): Pemeriksaan Data memuat "Penegak belum melengkapi data diri" (dataDiriBelum). Server (PGlite): hak, hanya Penegak aktif, hanya kode isian (bukan nilai),
// dan kecocokan LANGSUNG dengan cermin klien isianLogic.pokokKurang pada seluruh 128 kombinasi isian pokok.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { POKOK, labelPokok, pokokKurang } from '../src/lib/isianLogic.js';
import { KATEGORI_PEMERIKSAAN, jumlahKategori, kategoriTampil, tabPerbaikan } from '../src/lib/pemeriksaanLogic.js';
import { teksWaLengkapiDataDiri, bolehDihubungi } from '../src/lib/eskalasiLogic.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const K = { admin: await masuk('admin', PIN_DEMO.admin), pembina: await masuk('pembina', PIN_DEMO.pembina), dewan: await masuk('dewan', PIN_DEMO.dewan) };
const N1 = await masuk('10231', PIN_DEMO.penegak);
const ahmad = N1.id;
const siti = (await masuk('10232', PIN_DEMO.penegak)).id;
const periksa = async (k = K.pembina) => (await k.a.muatPemeriksaanData()).data;
const barisDari = (h, id) => (h.dataDiriBelum ?? []).find((x) => x.id === id);
const statusSiti = async (status, kelas) => {
  if (status === 'nonaktif') await sqlSebagai(pg, K.pembina.id, `select public.sg_anggota_status_atur($1, 'nonaktif', null, 'uji')`, [siti]);
  else await sqlSebagai(pg, K.pembina.id, `select public.sg_anggota_status_atur($1, 'aktif', $2, '')`, [siti, kelas]);
};

console.log('--- Kategori dan hak ---');
const kat = KATEGORI_PEMERIKSAAN.find((k) => k.kunci === 'dataDiriBelum');
ok(!!kat && !kat.praUji && kategoriTampil({ praUjiAktif: false }).some((k) => k.kunci === 'dataDiriBelum'), 'kategori dataDiriBelum terdaftar dan tampil tanpa syarat pra-uji');
ok(tabPerbaikan(kat, { role: 'admin' }) === null && tabPerbaikan(kat, { role: 'penguji', jabatan: 'Pembina' }) === null, 'tanpa tombol Perbaiki (diisi Penegak sendiri)');
let h = await periksa();
ok(Array.isArray(h.dataDiriBelum) && h.dataDiriBelum.length > 0 && jumlahKategori(h, 'dataDiriBelum') === h.dataDiriBelum.length, 'server mengembalikan daftar dataDiriBelum');
ok(barisDari(h, ahmad)?.kurang.length >= 4, 'Penegak yang belum mengisi isian pokok tercantum beserta kodenya: ' + JSON.stringify(barisDari(h, ahmad)?.kurang));
h = await periksa(K.dewan);
ok(Array.isArray(h.dataDiriBelum), 'akun Dewan (pengurus) juga dapat melihat daftar');
const rp = await N1.a.muatPemeriksaanData();
ok(!rp.ok && /Hanya pengurus/.test(rp.pesan ?? ''), 'Penegak biasa tidak dapat melihat pemeriksaan data');

console.log('\n--- Hanya Penegak aktif, hanya kode isian ---');
await q(`insert into public.penegak_isian (peserta_id, kunci, nilai) values ($1, 'alamat', 'Jl. RAHASIA Melati 5 Bukateja') on conflict do nothing`, [ahmad]);
h = await periksa();
ok(!JSON.stringify(h).includes('RAHASIA'), 'nilai isian (alamat) tidak pernah ikut terkirim, hanya kode isian yang kurang');
ok(!barisDari(h, ahmad).kurang.includes('alamat'), 'alamat yang sudah diisi tidak lagi kurang');
const kelasSiti = (await q('select kelas from public.profiles where id = $1', [siti]))[0].kelas;
await statusSiti('nonaktif');
ok(!barisDari(await periksa(), siti), 'Penegak nonaktif tidak masuk daftar');
await statusSiti('aktif', kelasSiti);
ok(!!barisDari(await periksa(), siti), 'aktif kembali: masuk daftar lagi');
h = await periksa();
ok(!(h.dataDiriBelum ?? []).some((x) => x.id === K.pembina.id || x.id === K.admin.id), 'hanya Penegak (bukan Pembina atau Admin)');

console.log('\n--- Server dan klien sepakat pada seluruh kombinasi isian pokok ---');
const IDS = POKOK.map((p) => p.id);
const punya = (mask, i) => (mask >> IDS.indexOf(i)) & 1;
const set = async (id, mask) => {
  await q('update public.profiles set whatsapp = $2, jenis_kelamin = $3, agama = $4 where id = $1', [id, punya(mask, 'whatsapp') ? '081234567890' : null, punya(mask, 'jk') ? 'L' : null, punya(mask, 'agama') ? 'Islam' : null]);
  await q('delete from public.tanggal_lahir where peserta_id = $1', [id]);
  if (punya(mask, 'lahir')) await q(`insert into public.tanggal_lahir (peserta_id, tanggal) values ($1, '2009-03-15')`, [id]);
  await q('delete from public.penegak_isian where peserta_id = $1', [id]);
  if (punya(mask, 'tempat_lahir')) await q(`insert into public.penegak_isian (peserta_id, kunci, nilai) values ($1, 'tempat_lahir', 'Purbalingga')`, [id]);
  if (punya(mask, 'alamat')) await q(`insert into public.penegak_isian (peserta_id, kunci, nilai) values ($1, 'alamat', 'Jl. A')`, [id]);
  if (punya(mask, 'ortu')) await q(`insert into public.penegak_isian (peserta_id, kunci, nilai) values ($1, $2, 'Slamet')`, [id, ['ayah_nama', 'ibu_nama', 'wali_nama'][mask % 3]]);
};
let beda = 0;
for (let mask = 0; mask < 128; mask++) {
  await set(ahmad, mask);
  const klien = pokokKurang({
    akun: { whatsapp: punya(mask, 'whatsapp') ? 'x' : '', jenisKelamin: punya(mask, 'jk') ? 'L' : '', agama: punya(mask, 'agama') ? 'Islam' : '' },
    isian: { ...(punya(mask, 'tempat_lahir') ? { tempat_lahir: 'x' } : {}), ...(punya(mask, 'alamat') ? { alamat: 'x' } : {}), ...(punya(mask, 'ortu') ? { ayah_nama: 'x' } : {}) },
    lahir: punya(mask, 'lahir') ? '2009-03-15' : null,
  });
  const server = (barisDari(await periksa(), ahmad)?.kurang ?? []).map(labelPokok).sort().join('|');
  if (server !== klien.slice().sort().join('|')) { beda += 1; if (beda <= 5) console.log('  BEDA mask', mask, 'server:', server, 'klien:', klien.join('|')); }
}
ok(beda === 0, 'pokokKurang (klien) = dataDiriBelum (server) pada 128 kombinasi (kode dipetakan lewat labelPokok)');
await set(ahmad, 127);
ok(!barisDari(await periksa(), ahmad), 'Penegak yang melengkapi ketujuh isian keluar dari daftar');
ok(IDS.join() === 'whatsapp,jk,agama,lahir,tempat_lahir,alamat,ortu' && labelPokok('ortu') === 'Nama ayah, ibu, atau wali' && labelPokok('asing') === 'asing', 'kode isian pokok dan label');

console.log('\n--- Teks WhatsApp dan hak menghubungi ---');
const t = teksWaLengkapiDataDiri('Siti', ['Agama', 'Alamat'], 'https://sigarda.example/');
ok(t.includes('Halo Siti') && t.includes('Agama, Alamat') && t.includes('Akun saya > Data diri') && t.includes('https://sigarda.example/'), 'teks ajakan memuat nama, isian yang kurang, dan tempat mengisi');
ok(teksWaLengkapiDataDiri('Siti', ['Agama']).includes('buka SIGARDA'), 'tanpa alamat: memakai kata SIGARDA');
ok(bolehDihubungi({ id: 'a', role: 'penguji', jabatan: 'Pembina' }, { id: 'p', peran: 'Penegak' }) && bolehDihubungi({ id: 'd', role: 'penguji', jabatan: 'Dewan Ambalan' }, { id: 'p', peran: 'Penegak' }), 'Pembina dan Dewan boleh menghubungi Penegak');

console.log(`RINGKASAN PERIKSA-DATA-DIRI: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
