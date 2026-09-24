// Fase B: model Pinsa dan Bina Damping (data dan hak; belum pra-uji). Server (PGlite): tabel bina_damping, kolom profiles.pinsa, sg_bina_damping_*,
// sg_sangga_*, sg_pendampingan_saya, pemicu pembersihan, dan hak akses.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { tahunAjaranKini } from '../src/lib/rombelLogic.js';

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
const N = {}; for (const nis of ['10231', '10232', '10118', '10007', '10008', '10233', '10234']) N[nis] = await masuk(nis, PIN_DEMO.penegak);
const [ahmad, siti, dimas, bagas, nadia, rizky, kevin] = ['10231', '10232', '10118', '10007', '10008', '10233', '10234'].map((n) => N[n].id);
const ta = tahunAjaranKini();
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const cocok = (r, re) => !r.ok && re.test(r.pesan ?? '');
const atur = (id, rombel, ids, tahun = ta) => sebagai(id, 'select public.sg_bina_damping_atur($1, $2, $3::uuid[]) as n', [tahun, rombel, ids]);
const sangga = (id, rombel, data) => sebagai(id, 'select public.sg_sangga_atur($1, $2::jsonb) as h', [rombel, JSON.stringify(data)]);
const lihat = (id, rombel) => sebagai(id, 'select public.sg_sangga_rombel($1) as h', [rombel]);
const bd = async () => q('select rombel, penegak_id from public.bina_damping where tahun_ajaran = $1 order by rombel', [ta]);
const profil = async (id) => (await q('select kelas, sangga, pinsa, status, jabatan_dewan from public.profiles where id = $1', [id]))[0];
// Meluluskan semua butir suatu tingkat yang berlaku bagi Penegak itu (sesuai agamanya)
const selesaikan = (pid, tingkat) => q(
  `insert into public.sku_progress (peserta_id, sku_id, status) select p.id, u.id, 'lulus' from public.profiles p join public.sku_unit u on u.tingkat = $2 and (u.agama is null or u.agama = p.agama)
   where p.id = $1 on conflict (peserta_id, sku_id) do update set status = 'lulus'`, [pid, tingkat]);
const tingkat = async (pid) => (await q('select sigarda.tingkat_penegak($1) t', [pid]))[0].t;

console.log('--- Persiapan: jabatan Dewan dan tingkat ---');
let r = await K.pembina.a.aturJabatanDewan([
  { username: '10007', jabatan: 'Bendahara' }, { username: '10008', jabatan: 'Sekretaris' }, { username: '10118', jabatan: 'Wakil Pradani' }, { username: '10231', jabatan: 'Humas' },
]);
ok(r.ok, 'Pembina memberi jabatan Dewan kepada 4 Penegak');
await selesaikan(bagas, 'Bantara'); await selesaikan(bagas, 'Laksana');
await selesaikan(nadia, 'Bantara'); await selesaikan(dimas, 'Bantara');
await q(`delete from public.sku_progress where peserta_id = $1 and sku_id like 'LAK-%'`, [nadia]);
await q(`delete from public.sku_progress where peserta_id = $1 and sku_id like 'LAK-%'`, [dimas]);
ok((await tingkat(bagas)) === 'laksana', 'Bagas sudah Laksana');
ok((await tingkat(nadia)) === 'calon-laksana' && (await tingkat(dimas)) === 'calon-laksana', 'Nadia dan Dimas Calon Laksana');
ok((await tingkat(ahmad)) === 'calon-bantara', 'Ahmad masih Calon Bantara');

console.log('\n--- Hak menunjuk Bina Damping ---');
r = await atur(rizky, 'X-01', [bagas]);
ok(cocok(r, /Hanya Dewan Ambalan, Pembina, dan Admin/), 'Penegak biasa tidak dapat menunjuk Bina Damping');
r = await atur(kevin, 'X-01', []);
ok(cocok(r, /Hanya Dewan Ambalan, Pembina, dan Admin/), 'Penegak biasa lain juga ditolak');
r = await atur(K.pembina.id, 'X', [bagas]);
ok(cocok(r, /Rombel tidak sah/), 'rombel tidak baku ditolak');
r = await atur(K.pembina.id, 'X-01', [bagas], '2026-2027');
ok(cocok(r, /Tahun ajaran tidak sah/), 'tahun ajaran tidak sah ditolak');

console.log('\n--- Syarat calon dan prioritas ---');
r = await atur(K.pembina.id, 'X-01', [ahmad]);
ok(cocok(r, /belum menyelesaikan SKU Bantara/), 'Penegak berjabatan yang masih Calon Bantara ditolak');
r = await atur(K.pembina.id, 'X-01', [rizky]);
ok(cocok(r, /bukan pengurus Dewan Ambalan/), 'Penegak tanpa jabatan Dewan ditolak');
r = await atur(K.pembina.id, 'X-01', [nadia]);
ok(cocok(r, /Dahulukan Penegak berjabatan Dewan yang sudah Laksana/), 'Calon Laksana ditolak selama masih ada Dewan yang sudah Laksana dan belum bertugas: ' + r.pesan);
r = await atur(K.pembina.id, 'X-01', [bagas, nadia, dimas]);
ok(cocok(r, /maksimal 2 orang/), 'lebih dari 2 orang ditolak');
r = await atur(nadia, 'X-01', [bagas]);
ok(r.ok && r.rows[0].n === 1, 'Penegak berjabatan Dewan (Nadia) menunjuk Bagas (sudah Laksana) sebagai Bina Damping X-01');
r = await atur(K.dewan.id, 'X-01', [bagas, nadia]);
ok(r.ok && r.rows[0].n === 1, 'akun Dewan lama menambahkan Nadia; Bagas dan Nadia sekaligus 2 orang (Bagas ikut dalam daftar sehingga tidak dianggap bebas)');
r = await atur(K.pembina.id, 'X-02', [bagas]);
ok(cocok(r, /sudah menjadi Bina Damping rombel lain/), 'satu orang hanya satu rombel per tahun ajaran');
r = await atur(K.pembina.id, 'X-01', [bagas, nadia]);
ok(r.ok && r.rows[0].n === 0, 'menyimpan daftar yang sama tidak mengubah apa pun');
r = await atur(K.admin.id, 'X-02', [dimas]);
ok(r.ok, 'stok Penegak Dewan yang sudah Laksana habis (Bagas bertugas): Dimas (Calon Laksana) boleh menjadi Bina Damping X-02');
r = await atur(K.pembina.id, 'X-01', [nadia]);
ok(cocok(r, /Dahulukan Penegak berjabatan Dewan yang sudah Laksana/) && (await bd()).filter((x) => x.rombel === 'X-01').length === 2, 'mengganti Bagas (Laksana) dengan Calon Laksana ditolak selama Bagas bebas; daftar lama tidak berubah');

console.log('\n--- Daftar penunjukan dan calon ---');
r = await sebagai(rizky, 'select public.sg_bina_damping_daftar() as d');
ok(cocok(r, /Hanya pengurus/), 'Penegak biasa tidak dapat melihat daftar penunjukan');
r = await sebagai(nadia, 'select public.sg_bina_damping_daftar() as d');
const dft = r.rows?.[0]?.d;
ok(r.ok && dft.tahun_ajaran === ta && dft.penugasan.length === 3, 'Penegak berjabatan melihat 3 penunjukan pada tahun ajaran berjalan');
ok(dft.calon.length === 3 && dft.calon[0].tingkat === 'laksana' && dft.calon.every((c) => c.tingkat !== 'calon-bantara'), 'calon = Penegak berjabatan Dewan minimal Calon Laksana, yang sudah Laksana di urutan pertama');
ok(dft.calon.find((c) => c.id === dimas).rombel === 'X-02' && dft.calon.find((c) => c.id === bagas).rombel === 'X-01', 'setiap calon memuat rombel tempatnya bertugas');
r = await sebagai(K.pembina.id, 'select public.sg_bina_damping_daftar($1) as d', ['2030/2031']);
ok(r.ok && r.rows[0].d.penugasan.length === 0, 'tahun ajaran lain belum punya penunjukan');

console.log('\n--- Peran pendampingan diri sendiri ---');
r = await sebagai(bagas, 'select public.sg_pendampingan_saya() as d');
ok(r.ok && r.rows[0].d.bina_damping.join() === 'X-01' && r.rows[0].d.pinsa === false, 'Bagas: Bina Damping X-01, bukan Pinsa');
r = await sebagai(rizky, 'select public.sg_pendampingan_saya() as d');
ok(r.ok && r.rows[0].d.bina_damping.length === 0 && r.rows[0].d.pinsa === false, 'Penegak biasa: tanpa peran pendampingan');

console.log('\n--- Membaca susunan sangga ---');
r = await lihat(rizky, 'X-01');
ok(cocok(r, /hanya dapat dilihat pengurus, Bina Damping, dan anggota rombel/), 'Penegak rombel lain tidak dapat melihat susunan sangga X-01');
r = await lihat(rizky, 'X-02');
ok(r.ok && r.rows[0].h.bisa_atur === false && r.rows[0].h.anggota.length >= 2 && r.rows[0].h.anggota.every((a) => a.tingkat === null), 'anggota rombel melihat susunan rombelnya sendiri tanpa tingkat SKU teman, tanpa hak mengatur');
r = await lihat(bagas, 'X-01');
const x01 = r.rows?.[0]?.h;
ok(r.ok && x01.bisa_atur === true && x01.bina_damping.length === 2 && x01.anggota.length === 2 && x01.anggota.every((a) => a.tingkat), 'Bina Damping melihat X-01 lengkap dengan tingkat dan hak mengatur');
r = await lihat(K.pembina.id, 'XI-05');
ok(r.ok && r.rows[0].h.anggota.length === 0 && r.rows[0].h.peringatan.some((p) => /baru 0 dari 2/.test(p.teks)), 'Pembina melihat rombel tanpa anggota; peringatan Bina Damping 0 dari 2');
r = await lihat(K.pembina.id, 'X');
ok(cocok(r, /Rombel tidak sah/), 'rombel tidak baku ditolak');

console.log('\n--- Membagi sangga dan menentukan Pinsa ---');
await selesaikan(siti, 'Bantara');
r = await sangga(rizky, 'X-01', [{ id: ahmad, pinsa: true }]);
ok(cocok(r, /Hanya Bina Damping rombel ini, Pembina, dan Admin/), 'Penegak biasa tidak dapat mengatur sangga');
r = await sangga(dimas, 'X-01', [{ id: siti, pinsa: true }]);
ok(cocok(r, /Hanya Bina Damping rombel ini/), 'Bina Damping rombel LAIN (Dimas, X-02) tidak dapat mengatur X-01');
r = await sangga(bagas, 'X-02', [{ id: rizky, pinsa: true }]);
ok(cocok(r, /Hanya Bina Damping rombel ini/), 'Bagas (Bina Damping X-01) tidak dapat mengatur X-02');
r = await sangga(bagas, 'X-01', [{ id: ahmad, pinsa: true }]);
ok(cocok(r, /belum menyelesaikan SKU Bantara/), 'Pinsa harus minimal Calon Laksana: Ahmad ditolak');
r = await sangga(bagas, 'X-01', [{ id: rizky, sangga: 'Sangga Elang' }]);
ok(cocok(r, /tidak ditemukan di rombel X-01/), 'Penegak dari rombel lain tidak dapat dimasukkan');
r = await sangga(bagas, 'X-01', [{ id: siti, sangga: '' }]);
ok(cocok(r, /Nama sangga wajib diisi/), 'nama sangga kosong ditolak');
r = await sangga(bagas, 'X-01', [{ id: siti, pinsa: true }]);
ok(r.ok && r.rows[0].h.diubah === 1 && (await profil(siti)).pinsa === true, 'Bina Damping menetapkan Siti sebagai Pinsa Sangga Merak');
r = await sangga(bagas, 'X-01', [{ id: ahmad, sangga: 'sangga merak' }]);
ok(r.ok && (await profil(ahmad)).sangga === 'Sangga Merak', 'pindah sangga: penulisan disamakan dengan nama sangga yang sudah ada');
await selesaikan(ahmad, 'Bantara');
r = await sangga(bagas, 'X-01', [{ id: ahmad, pinsa: true }]);
ok(cocok(r, /Sangga Merak sudah punya Pinsa \(Siti/), 'satu Pinsa per sangga: penetapan kedua ditolak');
r = await sangga(bagas, 'X-01', [{ id: ahmad, pinsa: true }, { id: siti, pinsa: false }]);
ok(r.ok && (await profil(ahmad)).pinsa === true && (await profil(siti)).pinsa === false, 'tukar Pinsa dalam satu simpanan berhasil (yang dicabut diproses lebih dulu)');
r = await sangga(bagas, 'X-01', [{ id: ahmad, sangga: 'Sangga Elang' }]);
ok(r.ok && (await profil(ahmad)).pinsa === false && (await profil(ahmad)).sangga === 'Sangga Elang', 'pindah sangga otomatis melepas status Pinsa');
r = await sangga(bagas, 'X-01', [{ id: ahmad, pinsa: true }, { id: siti, sangga: 'Sangga Elang' }, { id: rizky, pinsa: true }]);
ok(!r.ok && (await profil(ahmad)).pinsa === false && (await profil(siti)).sangga === 'Sangga Merak', 'satu galat membatalkan seluruh simpanan (semua atau tidak sama sekali)');
r = await sangga(K.pembina.id, 'X-01', [{ id: siti, pinsa: true }, { id: ahmad, pinsa: true }]);
ok(r.ok && r.rows[0].h.peringatan.length > 0, 'Pembina juga dapat mengatur sangga; peringatan tidak memblokir');
ok(r.rows[0].h.peringatan.some((p) => p.sangga === 'Sangga Elang' && /4 sampai 8/.test(p.teks)) && r.rows[0].h.peringatan.some((p) => p.sangga === null && /4 sampai 5/.test(p.teks)), 'peringatan: jumlah anggota sangga dan jumlah sangga rombel di luar batas');
ok(!r.rows[0].h.peringatan.some((p) => /belum punya Pinsa/.test(p.teks)), 'kedua sangga sudah punya Pinsa: tidak ada peringatan Pinsa');
r = await sebagai(siti, 'select public.sg_pendampingan_saya() as d');
ok(r.ok && r.rows[0].d.pinsa === true, 'Siti mengetahui dirinya Pinsa');

console.log('\n--- Pinsa hilang sendiri ---');
await q('update public.profiles set kelas = $2 where id = $1', [siti, 'X-03']);
ok((await profil(siti)).pinsa === false, 'pindah rombel melepas Pinsa (jalur apa pun, termasuk naik kelas)');
await q('update public.profiles set kelas = $2 where id = $1', [siti, 'X-01']);
await q('update public.profiles set pinsa = true where id = $1', [siti]);
await q("update public.profiles set status = 'nonaktif', status_pada = current_date where id = $1", [siti]);
ok((await profil(siti)).pinsa === false, 'Penegak nonaktif tidak lagi Pinsa');
await q("update public.profiles set status = 'aktif' where id = $1", [siti]);
await q('update public.profiles set sangga = $2 where id = $1', [ahmad, 'Sangga Merak']);
await q('update public.profiles set pinsa = true where id = $1', [siti]);
let galat = null; try { await q('update public.profiles set pinsa = true where id = $1', [ahmad]); } catch (e) { galat = e.message; }
ok(galat && /unique|unik|profil_pinsa_unik/i.test(galat), 'indeks unik: dua Pinsa dalam satu sangga satu rombel ditolak database');
await q('update public.profiles set pinsa = false');

console.log('\n--- Bina Damping berakhir sendiri ---');
await q('update public.profiles set jabatan_dewan = null where id = $1', [nadia]);
ok((await bd()).every((x) => x.penegak_id !== nadia), 'jabatan Dewan dicabut: Nadia tidak lagi Bina Damping');
await q("update public.profiles set status = 'nonaktif', status_pada = current_date where id = $1", [bagas]);
ok((await bd()).every((x) => x.penegak_id !== bagas), 'Penegak nonaktif tidak lagi Bina Damping');
ok((await bd()).length === 1 && (await bd())[0].penegak_id === dimas, 'Bina Damping lain (Dimas) tidak terganggu');
r = await sebagai(bagas, 'select public.sg_pendampingan_saya() as d');
ok(r.ok && r.rows[0].d.bina_damping.length === 0, 'Bagas nonaktif: peran pendampingannya kosong');
await q("update public.profiles set status = 'aktif' where id = $1", [bagas]);
await q('update public.profiles set jabatan_dewan = $2 where id = $1', [nadia, 'Sekretaris']);

console.log('\n--- Hak akses tabel dan cadangan ---');
r = await sebagai(K.pembina.id, 'select * from public.bina_damping');
ok(!r.ok && /permission denied/i.test(r.pesan), 'tabel bina_damping tidak dapat dibaca langsung (hanya lewat fungsi)');
r = await sebagai(K.admin.id, `insert into public.bina_damping (tahun_ajaran, rombel, penegak_id) values ('${ta}', 'X-05', '${nadia}')`);
ok(!r.ok && /permission denied/i.test(r.pesan), 'tabel bina_damping tidak dapat ditulis langsung');
r = await sebagai(rizky, `update public.profiles set pinsa = true where id = '${rizky}'`);
ok(!r.ok, 'Penegak tidak dapat menjadikan dirinya Pinsa lewat tulis langsung');
r = await K.admin.a.muatProfil();
ok(r.ok, 'profil tetap terbaca lewat api');
r = await sebagai(K.admin.id, 'select public.sg_cadangan_admin() as c');
ok(r.ok && Array.isArray(r.rows[0].c.tabel.bina_damping) && r.rows[0].c.tabel.bina_damping.length === 1, 'cadangan data memuat tabel bina_damping');
r = await sebagai(K.admin.id, "select count(*)::int n from pg_policies where tablename = 'bina_damping'");
ok(r.rows[0].n === 0, 'bina_damping tanpa kebijakan RLS (hanya fungsi)');

console.log(`\nRINGKASAN pinsa-bina-damping: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);


