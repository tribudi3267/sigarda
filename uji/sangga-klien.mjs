// Fase B (klien): logika tampilan Sangga/Bina Damping (murni), pemetaan api terhadap server sungguhan (PGlite), dan render halaman/menu tanpa peramban.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { KonteksApp } from '../src/context/AppContext.jsx';
import Sangga from '../src/pages/Sangga.jsx';
import { tahunAjaranKini } from '../src/lib/rombelLogic.js';
import {
  drafAwal, kelompokSangga, labelTingkat, menuSanggaTampil, namaSanggaAda, penugasanPerRombel, perubahanSangga, peringatanRombel, ringkasBinaDamping, ubahDraf,
} from '../src/lib/sanggaLogic.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const ta = tahunAjaranKini();

console.log('--- Logika tampilan (murni) ---');
const anggota = [
  { id: 'a', nama: 'Zaki', sangga: 'Sangga Merak', pinsa: false, tingkat: 'calon-bantara', layakPinsa: false },
  { id: 'b', nama: 'Budi', sangga: 'sangga elang', pinsa: false, tingkat: 'calon-laksana', layakPinsa: true },
  { id: 'c', nama: 'Citra', sangga: 'Sangga Elang', pinsa: true, tingkat: 'laksana', layakPinsa: true },
  { id: 'd', nama: 'Ani', sangga: 'Sangga Elang', pinsa: false, tingkat: 'calon-bantara', layakPinsa: false },
];
const peringatan = [{ sangga: null, teks: 'Bina Damping rombel ini baru 0 dari 2 orang.' }, { sangga: 'Sangga Merak', teks: 'Sangga Sangga Merak belum punya Pinsa.' }];
{
  const g = kelompokSangga(anggota, peringatan);
  ok(g.length === 2 && g[0].nama === 'sangga elang' && g[0].anggota.length === 3 && g[1].nama === 'Sangga Merak', 'sangga dikelompokkan tanpa membedakan huruf besar/kecil dan diurutkan nama');
  ok(g[0].pinsa?.id === 'c' && g[0].anggota[0].id === 'c' && g[0].anggota[1].nama === 'Ani', 'Pinsa di urutan pertama, lalu nama');
  ok(g[1].peringatan.length === 1 && g[0].peringatan.length === 0, 'peringatan sangga ditempelkan pada sangganya');
  ok(peringatanRombel(peringatan).length === 1 && /baru 0 dari 2/.test(peringatanRombel(peringatan)[0]), 'peringatan tingkat rombel dipisahkan');
  ok(namaSanggaAda(anggota).join('|') === 'sangga elang|Sangga Merak', 'saran nama sangga unik');
  ok(labelTingkat('laksana') === 'Sudah Laksana' && labelTingkat('calon-laksana') === 'Calon Laksana' && labelTingkat('x') === '', 'label tingkat');
}
{
  const draf0 = drafAwal(anggota);
  ok(perubahanSangga(anggota, draf0).length === 0, 'tanpa perubahan: selisih kosong');
  const d1 = ubahDraf(draf0, anggota, 'a', { sangga: '  Sangga   Elang ' });
  ok(JSON.stringify(perubahanSangga(anggota, d1)) === JSON.stringify([{ id: 'a', sangga: 'Sangga Elang' }]), 'pindah sangga: spasi dirapikan, hanya yang berubah dikirim');
  const d2 = ubahDraf(draf0, anggota, 'b', { sangga: 'SANGGA ELANG' });
  ok(perubahanSangga(anggota, d2).length === 0, 'perbedaan huruf besar/kecil saja bukan perubahan');
  const d3 = ubahDraf(draf0, anggota, 'c', { sangga: 'Sangga Merak' });
  ok(d3.c.pinsa === false && JSON.stringify(perubahanSangga(anggota, d3)) === JSON.stringify([{ id: 'c', sangga: 'Sangga Merak' }]), 'pindah sangga mencabut Pinsa di rancangan (sama dengan server)');
  const d4 = ubahDraf(d3, anggota, 'c', { pinsa: true });
  ok(JSON.stringify(perubahanSangga(anggota, d4)) === JSON.stringify([{ id: 'c', sangga: 'Sangga Merak', pinsa: true }]), 'pindah sangga dan tetap Pinsa: pinsa dikirim ulang');
  const d5 = ubahDraf(ubahDraf(draf0, anggota, 'c', { pinsa: false }), anggota, 'b', { pinsa: true });
  ok(JSON.stringify(perubahanSangga(anggota, d5)) === JSON.stringify([{ id: 'b', pinsa: true }, { id: 'c', pinsa: false }]), 'tukar Pinsa: dua perubahan');
}
{
  ok(menuSanggaTampil({ role: 'penguji' }, { binaDamping: [] }) && menuSanggaTampil({ role: 'admin' }, null), 'menu Sangga: Pembina/Dewan/Admin selalu');
  ok(!menuSanggaTampil({ role: 'peserta' }, { binaDamping: [] }) && !menuSanggaTampil({ role: 'peserta' }, undefined) && menuSanggaTampil({ role: 'peserta' }, { binaDamping: ['X-01'] }), 'menu Sangga untuk Penegak hanya bila Bina Damping');
  ok(!menuSanggaTampil(null, null), 'tanpa pengguna: tidak tampil');
  const per = penugasanPerRombel([{ rombel: 'X-01', nama: 'A' }, { rombel: 'X-02', nama: 'B' }, { rombel: 'X-01', nama: 'C' }]);
  ok(per['X-01'].length === 2 && ringkasBinaDamping(per['X-01']) === 'A, C' && ringkasBinaDamping(per['X-09']) === '(belum ada)', 'penugasan per rombel dan ringkasan nama');
}

console.log('\n--- Api terhadap server sungguhan ---');
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const pembina = await masuk('pembina', PIN_DEMO.pembina);
const N = {}; for (const nis of ['10231', '10232', '10007', '10233']) N[nis] = await masuk(nis, PIN_DEMO.penegak);
const [ahmad, siti, bagas, rizky] = ['10231', '10232', '10007', '10233'].map((n) => N[n].id);
const selesaikan = (pid, tingkat) => q(
  `insert into public.sku_progress (peserta_id, sku_id, status) select p.id, u.id, 'lulus' from public.profiles p join public.sku_unit u on u.tingkat = $2 and (u.agama is null or u.agama = p.agama)
   where p.id = $1 on conflict (peserta_id, sku_id) do update set status = 'lulus'`, [pid, tingkat]);
await pembina.a.aturJabatanDewan([{ username: '10007', jabatan: 'Bendahara' }]);
await selesaikan(bagas, 'Bantara'); await selesaikan(bagas, 'Laksana'); await selesaikan(siti, 'Bantara'); await selesaikan(ahmad, 'Bantara');
{
  let r = await N['10007'].a.muatPendampinganSaya();
  ok(r.ok && r.data.binaDamping.length === 0 && r.data.pinsa === false, 'sebelum ditunjuk: peran pendampingan kosong');
  r = await pembina.a.muatBinaDamping();
  ok(r.ok && r.data.tahunAjaran === ta && r.data.bisaAtur === true && r.data.penugasan.length === 0 && r.data.calon.length === 1 && r.data.calon[0].id === bagas && r.data.calon[0].jabatanDewan === 'Bendahara' && r.data.calon[0].tingkat === 'laksana' && r.data.calon[0].rombel === null, 'muatBinaDamping: calon dipetakan (id, jabatanDewan, tingkat, rombel)');
  r = await N['10233'].a.muatBinaDamping();
  ok(!r.ok && /Hanya pengurus/.test(r.pesan), 'Penegak biasa ditolak melihat daftar penunjukan');
  r = await pembina.a.aturBinaDamping(ta, 'X-01', [bagas]);
  ok(r.ok && r.data === 1, 'aturBinaDamping mengembalikan jumlah perubahan');
  r = await pembina.a.muatBinaDamping();
  ok(r.data.penugasan.length === 1 && r.data.penugasan[0].rombel === 'X-01' && r.data.penugasan[0].id === bagas && r.data.penugasan[0].nama.startsWith('Bagas') && r.data.calon[0].rombel === 'X-01', 'penunjukan terbaca ulang dengan rombel calon terisi');
  r = await N['10007'].a.muatPendampinganSaya();
  ok(r.ok && r.data.binaDamping.join() === 'X-01', 'Bagas mengetahui dirinya Bina Damping X-01');
  r = await N['10233'].a.aturBinaDamping(ta, 'X-01', []);
  ok(!r.ok && /Hanya Dewan Ambalan, Pembina, dan Admin/.test(r.pesan), 'Penegak biasa ditolak menunjuk');
}
let x01;
{
  let r = await N['10007'].a.muatSanggaRombel('X-01');
  x01 = r.data;
  ok(r.ok && x01.bisaAtur && x01.tahunAjaran === ta && x01.binaDamping.length === 1 && x01.anggota.length === 2 && x01.anggota.every((a) => typeof a.layakPinsa === 'boolean' && a.tingkat), 'muatSanggaRombel: Bina Damping melihat dan boleh mengatur, layakPinsa terisi');
  ok(x01.anggota.every((a) => a.layakPinsa === (a.tingkat !== 'calon-bantara')), 'layakPinsa dari server = tingkat bukan Calon Bantara');
  ok(x01.peringatan.some((p) => p.sangga === null && /baru 1 dari 2/.test(p.teks)), 'peringatan berbentuk { sangga, teks }');
  r = await N['10233'].a.muatSanggaRombel('X-01');
  ok(!r.ok && /hanya dapat dilihat/.test(r.pesan), 'Penegak rombel lain ditolak');
  r = await N['10233'].a.muatSanggaRombel('X-02');
  ok(r.ok && !r.data.bisaAtur && r.data.anggota.every((a) => a.tingkat === null && a.layakPinsa === false), 'anggota rombel: hanya baca, tanpa tingkat SKU teman');
}
{
  // Rancangan klien -> server: Siti Pinsa; Ahmad pindah ke Sangga Merak
  let draf = drafAwal(x01.anggota);
  draf = ubahDraf(draf, x01.anggota, siti, { pinsa: true });
  let r = await N['10007'].a.aturSangga('X-01', perubahanSangga(x01.anggota, draf));
  ok(r.ok && r.data.diubah === 1 && Array.isArray(r.data.peringatan), 'aturSangga: rancangan klien diterima server');
  r = await N['10007'].a.muatSanggaRombel('X-01');
  x01 = r.data;
  ok(x01.anggota.find((a) => a.id === siti).pinsa === true, 'Pinsa tersimpan dan terbaca');
  // pindah sangga sambil tetap Pinsa: klien mengirim ulang pinsa
  let d2 = ubahDraf(drafAwal(x01.anggota), x01.anggota, siti, { sangga: 'Sangga Baru' });
  d2 = ubahDraf(d2, x01.anggota, siti, { pinsa: true });
  r = await N['10007'].a.aturSangga('X-01', perubahanSangga(x01.anggota, d2));
  const s = (await q('select sangga, pinsa from public.profiles where id = $1', [siti]))[0];
  ok(r.ok && s.sangga === 'Sangga Baru' && s.pinsa === true, 'pindah sangga sambil tetap Pinsa berakhir sebagai Pinsa di sangga baru');
  const cur = (await N['10007'].a.muatSanggaRombel('X-01')).data.anggota;
  const d3 = ubahDraf(drafAwal(cur), cur, siti, { sangga: 'Sangga Merak' });
  r = await N['10007'].a.aturSangga('X-01', perubahanSangga(cur, d3));
  ok(r.ok && (await q('select pinsa from public.profiles where id = $1', [siti]))[0].pinsa === false, 'pindah sangga tanpa mencentang ulang: Pinsa terlepas (sesuai rancangan klien)');
  r = await N['10007'].a.aturSangga('X-01', [{ id: ahmad, pinsa: true }, { id: rizky, pinsa: true }]);
  ok(!r.ok && /tidak ditemukan di rombel X-01/.test(r.pesan), 'galat server diteruskan apa adanya');
  r = await N['10007'].a.muatPendampinganSaya();
  const profil = (await pembina.a.muatProfil()).data;
  ok(profil.every((u) => u.pinsa === undefined || u.pinsa === true), 'muatProfil: pinsa hanya muncul bila true');
  await q('update public.profiles set pinsa = true where id = $1', [siti]);
  ok((await pembina.a.muatProfil()).data.find((u) => u.id === siti).pinsa === true, 'muatProfil memetakan pinsa Penegak');
  r = await N['10232'].a.muatPendampinganSaya();
  ok(r.ok && r.data.pinsa === true && r.data.binaDamping.length === 0, 'Pinsa mengetahui statusnya');
}

console.log('\n--- Render halaman (tanpa peramban) ---');
{
  const tampil = (nilai) => renderToStaticMarkup(h(KonteksApp.Provider, { value: { muatSanggaRombel: async () => ({ ok: true, data: x01 }), muatBinaDamping: async () => ({ ok: true }), aturSangga: async () => ({ ok: true }), notify: () => {}, ...nilai } }, h(Sangga)));
  const pengurus = tampil({ user: { role: 'penguji', jabatan: 'Pembina' }, pendampingan: { binaDamping: [], pinsa: false } });
  ok(pengurus.includes('Sangga dan Bina Damping') && pengurus.includes('role="tablist"') && pengurus.includes('Bina Damping</button>') && pengurus.includes('id="sg-kelas"') && pengurus.includes('X-01') && pengurus.includes('XII-10') === false, 'pengurus: tab Sangga/Bina Damping dan pilihan kelas/rombel');
  const penegak = tampil({ user: { role: 'peserta' }, pendampingan: { binaDamping: ['XI-03', 'XI-04'], pinsa: false } });
  ok(!penegak.includes('role="tablist"') && !penegak.includes('id="sg-kelas"') && penegak.includes('XI-03') && penegak.includes('XI-04') && !penegak.includes('X-01'), 'Penegak Bina Damping: tanpa tab, hanya rombel yang didampingi');
  ok(penegak.includes('Memuat susunan sangga'), 'panel memuat data selagi menunggu server');
}

console.log(`\nRINGKASAN sangga-klien: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
