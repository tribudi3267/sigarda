// Data contoh untuk gambar panduan (src/lokal/dataPanduan.js, ?data=panduan): semua kelompok terisi lewat fungsi sg_* pada data contoh dasar, tanpa galat,
// dan hasilnya tampak di halaman yang sebelumnya kosong. Juga menjaga parameter alamat (?data=panduan) dan bahwa data panduan tidak mengubah data contoh dasar.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh, isiStatusContoh } from '../src/lokal/seedLokal.js';
import { isiInstrumenContoh } from '../src/lokal/instrumenContoh.js';
import { KELOMPOK, isiDataPanduan } from '../src/lokal/dataPanduan.js';
import { alamatMasukCepat, bacaParameterUji } from '../src/lokal/parameterUji.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const bersih = (s) => s.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
const skema = readFileSync(`${P}/supabase/skema.sql`, 'utf8');
const hitung = async (db, sql) => Number((await db.query(sql)).rows[0].n);

console.log('--- Parameter alamat ---');
{
  ok(bacaParameterUji('?data=panduan&masuk=pembina').panduan === true && bacaParameterUji('?data=panduan').penuh === false, '?data=panduan dikenali (dan bukan ?data=penuh)');
  ok(bacaParameterUji('?data=penuh').panduan === false && bacaParameterUji('').panduan === false, 'tanpa ?data=panduan: nonaktif');
  ok(alamatMasukCepat('pembina', '?data=panduan') === '?data=panduan&masuk=pembina', 'tautan masuk cepat mempertahankan ?data=panduan');
}

console.log('\n--- Data dasar tidak berubah oleh berkas ini ---');
const dasar = new PGlite();
await siapkanPg(dasar, { sqlStub: stub, sqlSkema: bersih(skema) });
await isiDataContoh(dasar); await isiStatusContoh(dasar); await isiInstrumenContoh(dasar);
const sebelum = { agenda: await hitung(dasar, 'select count(*) n from public.agenda'), materi: await hitung(dasar, 'select count(*) n from public.materi'), tkk: await hitung(dasar, 'select count(*) n from public.tkk_capaian') };
ok(sebelum.agenda === 0 && sebelum.materi === 0 && sebelum.tkk === 0, 'data dasar: agenda, materi, dan TKK kosong (itulah alasan data panduan): ' + JSON.stringify(sebelum));

console.log('\n--- Mengisi data panduan ---');
const kemajuan = [];
const diisi = await isiDataPanduan(dasar, { kemajuan: (n) => kemajuan.push(n) });
ok(diisi.join() === KELOMPOK.map(([n]) => n).join() && kemajuan.join() === diisi.join(), 'semua kelompok terisi berurutan tanpa galat: ' + diisi.join(', '));
const n = (sql) => hitung(dasar, sql);
ok(await n('select count(*) n from public.agenda') === 5, 'agenda: 5 kegiatan');
ok(await n('select count(*) n from public.materi') === 3, 'materi: 3 bahan');
ok(await n('select count(*) n from public.tkk_capaian') === 8 && await n("select count(*) n from public.tkk_pengajuan where status = 'menunggu'") === 1, 'TKK: 8 capaian resmi dan 1 pengajuan menunggu');
ok(await n('select count(*) n from public.pelantikan') === 4 && await n('select count(*) n from public.saka_anggota') === 1, 'pelantikan (3 Bantara + 1 Laksana) dan 1 keanggotaan Saka');
ok(await n("select count(*) n from public.sesi_ujian where status = 'terjadwal'") === 1, 'sesi ujian terjadwal: 1');
ok(await n("select count(*) n from public.pengaturan where kunci = 'pra_uji.aktif' and nilai::text like '%true%'") === 1, 'pra-uji dihidupkan');
ok(await n('select count(*) n from public.bina_damping') === 1 && await n('select count(*) n from public.pinsa_tugas') === 1, 'Bina Damping 1 orang dan Pinsa tertugas 1 orang');
ok(await n("select count(*) n from public.sku_pra_uji where status = 'menunggu' and tahap = 'pinsa'") === 1, 'pengajuan Ahmad menunggu penilaian Pinsa (tahap pertama pra-uji)');

ok(await n('select count(*) n from public.iuran where jumlah = 1000') === 2 && await n("select count(*) n from public.absensi_hadir h join public.profiles p on p.id = h.peserta_id where p.nis = '10008' and h.status = 'H'") >= 1, 'absensi dan iuran: Nadia hadir, 2 Penegak sudah beriuran Rp 1.000 pada Jumat terakhir');

console.log('\n--- Tidak ada yang bocor ke pemakaian nyata ---');
{
  ok(await n("select count(*) n from public.notifikasi where dibuat < now() - interval '1 day'") === 0, 'tidak ada notifikasi berumur (data dibuat sekarang)');
  const pembina = (await dasar.query("select id from public.profiles where username = 'pembina'")).rows[0].id;
  const r = await sqlSebagai(dasar, pembina, 'select count(*)::int n from public.agenda');
  ok(r.rows[0].n === 5, 'Pembina melihat agenda contoh lewat RLS (data sah menurut aturan server)');
}

console.log(`\nRINGKASAN DATA PANDUAN: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
