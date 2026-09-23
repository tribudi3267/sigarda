// Tahap L3: pemeriksaanLogic.js (murni), sg_pemeriksaan_data (server, lewat PGlite dengan data contoh), dan render halaman.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh, isiStatusContoh } from '../src/lokal/seedLokal.js';
import { masukCepat } from '../src/lokal/masukCepat.js';
import { buatApi } from '../src/lib/api.js';
import { KATEGORI_PEMERIKSAAN, gabungHasilPemeriksaan, jumlahKategori, tabPerbaikan, totalMasalah } from '../src/lib/pemeriksaanLogic.js';
import { KonteksApp } from '../src/context/AppContext.jsx';
import PemeriksaanData from '../src/pages/PemeriksaanData.jsx';

let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const P = process.cwd().replace(/\\/g, '/');

console.log('--- pemeriksaanLogic.js (murni) ---');
{
  ok(KATEGORI_PEMERIKSAAN.length === 7, `7 kategori terdaftar (${KATEGORI_PEMERIKSAAN.length})`);
  ok(new Set(KATEGORI_PEMERIKSAAN.map((k) => k.kunci)).size === 7, 'kunci kategori unik');
  const admin = { role: 'admin' };
  const pembina = { role: 'penguji', jabatan: 'Pembina' };
  const dewan = { role: 'penguji', jabatan: 'Dewan Ambalan' };
  const kelasLama = KATEGORI_PEMERIKSAAN.find((k) => k.kunci === 'kelasLama');
  const rombelTP = KATEGORI_PEMERIKSAAN.find((k) => k.kunci === 'rombelTanpaPenguji');
  const tanpaPerangkat = KATEGORI_PEMERIKSAAN.find((k) => k.kunci === 'tanpaPerangkat');
  ok(tabPerbaikan(kelasLama, admin) === 'anggota', 'Admin dapat memperbaiki kelas lama (tab anggota)');
  ok(tabPerbaikan(kelasLama, pembina) === null, 'Pembina TIDAK dapat memperbaiki kelas lama (hanya Admin)');
  ok(tabPerbaikan(rombelTP, pembina) === 'penugasan', 'Pembina dapat memperbaiki rombel tanpa penguji (tab penugasan)');
  ok(tabPerbaikan(rombelTP, admin) === null, 'Admin tidak diberi tautan (menu Penugasan tidak ada di nav Admin)');
  ok(tabPerbaikan(tanpaPerangkat, admin) === null && tabPerbaikan(tanpaPerangkat, pembina) === null, 'tanpa perangkat: tidak ada tautan perbaiki untuk peran mana pun');
  ok(tabPerbaikan(kelasLama, dewan) === null, 'akun Dewan lama (bukan Pembina) tidak diberi tautan');

  const hasil = { kelasLama: [{ id: 1 }, { id: 2 }], tanpaNta: [{ id: 3 }], tanpaJk: [] };
  ok(jumlahKategori(hasil, 'kelasLama') === 2 && jumlahKategori(hasil, 'tanpaJk') === 0 && jumlahKategori(hasil, 'tidakAda') === 0, 'jumlahKategori: menghitung, aman untuk kategori tidak dikenal');
  ok(totalMasalah(hasil) === 3, `totalMasalah menjumlah semua kategori terdaftar (${totalMasalah(hasil)})`);
  const gabung = gabungHasilPemeriksaan({ kelasLama: [{ id: 1 }] }, { tanpa: [{ id: 9 }] });
  ok(gabung.kelasLama.length === 1 && gabung.tanpaPerangkat.length === 1, 'gabungHasilPemeriksaan menambahkan tanpaPerangkat dari ringkasanPush');
  const gabungKosong = gabungHasilPemeriksaan({ kelasLama: [] }, null);
  ok(Array.isArray(gabungKosong.tanpaPerangkat) && gabungKosong.tanpaPerangkat.length === 0, 'ringkasanPush null (gagal dimuat) -> tanpaPerangkat kosong, bukan galat');
}

console.log('\n--- sg_pemeriksaan_data (server, PGlite + data contoh) ---');
{
  const stub = readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8');
  const skema = readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '');
  const pg = new PGlite();
  await siapkanPg(pg, { sqlStub: stub, sqlSkema: skema });
  await isiDataContoh(pg);
  await isiStatusContoh(pg);
  const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
  const idDari = async (username) => (await q('select id from public.profiles where username = $1', [username]))[0].id;

  // Fixture tambahan (baseline data contoh sudah menyediakan sebagian: lihat catatan di seedLokal.js).
  const p10231 = await idDari('10231'); // kelas 'X-01' (rombel baku) -> dijadikan format lama untuk uji kelasLama
  await q("update public.profiles set kelas = 'X' where id = $1", [p10231]);
  const p10118 = await idDari('10118'); // diberi NTA agar TIDAK muncul di tanpaNta (semua contoh lain sengaja kosong)
  await q("update public.profiles set nta = 'NTA-001' where id = $1", [p10118]);

  const penyimpan = () => { let v = null; return { ambil: () => v, simpan: (x) => { v = x; } }; };
  const sesi = async (username) => { const k = buatKlienFake(pg, penyimpan()); const r = await masukCepat(pg, k, username); if (!r.ok) throw new Error(r.pesan); return buatApi(k); };
  const admin = await sesi('admin');
  const pembina = await sesi('pembina');
  const peserta = await sesi('10231'); // Penegak biasa: tidak boleh memanggil
  const dewanLama = await sesi('dewan'); // akun Dewan lama
  const dewanPenegak = await sesi('10008'); // Penegak berjabatan (Sekretaris)

  const rAdmin = await admin.muatPemeriksaanData();
  ok(rAdmin.ok, `Admin dapat memuat pemeriksaan data (${rAdmin.ok ? 'ok' : rAdmin.pesan})`);
  const rPembina = await pembina.muatPemeriksaanData();
  ok(rPembina.ok, 'Pembina dapat memuat pemeriksaan data');
  ok((await dewanLama.muatPemeriksaanData()).ok && (await dewanPenegak.muatPemeriksaanData()).ok, 'Dewan Ambalan (akun lama dan Penegak berjabatan) dapat memuat pemeriksaan data');
  ok((await dewanLama.ringkasanPush()).ok && (await dewanPenegak.ringkasanPush()).ok, 'Dewan Ambalan dapat memuat ringkasan perangkat notifikasi');
  const rPeserta = await peserta.muatPemeriksaanData();
  ok(!rPeserta.ok && /Hanya pengurus/.test(rPeserta.pesan), 'Penegak biasa DITOLAK memanggil sg_pemeriksaan_data');

  const d = rAdmin.data;
  ok(Object.keys(d).sort().join(',') === ['belumPernahMasuk', 'kelasLama', 'pembinaTanpaAgama', 'rombelTanpaPenguji', 'tanpaJk', 'tanpaNta'].sort().join(','), 'hasil memuat 6 kategori (tanpaPerangkat terpisah lewat sg_push_ringkasan)');

  ok(d.kelasLama.some((x) => x.id === p10231 && x.kelas === 'X'), `kelasLama memuat akun berkelas format lama: ${JSON.stringify(d.kelasLama.find((x) => x.id === p10231))}`);
  ok(!d.kelasLama.some((x) => x.kelas && /^(X|XI|XII)-(0[1-9]|10)$/.test(x.kelas)), 'kelasLama TIDAK memuat akun berkelas rombel baku');

  ok(d.tanpaNta.length >= 5 && !d.tanpaNta.some((x) => x.id === p10118), `tanpaNta memuat banyak akun (data contoh belum ada NTA) tapi TIDAK memuat yang sudah diisi (${d.tanpaNta.length} baris)`);

  ok(d.tanpaJk.length >= 2, `tanpaJk memuat sekurangnya 2 (disengaja kosong di data contoh, lihat seedLokal.js; satu di antaranya jadi nonaktif oleh isiStatusContoh dan tidak dihitung): dapat ${d.tanpaJk.length}`);
  ok(d.tanpaJk.every((x) => x.peran), 'setiap baris tanpaJk punya label peran');

  ok(d.rombelTanpaPenguji.some((x) => x.rombel === 'XII-02' && x.jumlah >= 1), `rombelTanpaPenguji memuat XII-02 (sengaja tanpa penguji di data contoh; hanya 1 dari 2 Penegaknya aktif, satu jadi alumni oleh isiStatusContoh): ${JSON.stringify(d.rombelTanpaPenguji.find((x) => x.rombel === 'XII-02'))}`);
  ok(!d.rombelTanpaPenguji.some((x) => x.rombel === 'X-01'), 'rombelTanpaPenguji TIDAK memuat X-01 (sudah ditugaskan di data contoh)');

  const pembinaId = await idDari('pembina');
  ok(!d.pembinaTanpaAgama.some((x) => x.id === pembinaId), 'Pembina yang sudah diisi agama TIDAK muncul di pembinaTanpaAgama');
  await q('update public.profiles set agama = null where id = $1', [pembinaId]);
  const rAdmin2 = await admin.muatPemeriksaanData();
  ok(rAdmin2.data.pembinaTanpaAgama.some((x) => x.id === pembinaId), 'sesudah agama dikosongkan, Pembina itu MUNCUL di pembinaTanpaAgama');

  ok(d.belumPernahMasuk.some((x) => x.id === pembinaId) === false, 'akun "pembina" sudah masuk (sesi dibuat di atas) -> TIDAK muncul di belumPernahMasuk');
  const adminId = await idDari('admin');
  ok(d.belumPernahMasuk.some((x) => x.id === adminId) === false, 'akun "admin" sudah masuk juga -> TIDAK muncul');
  ok(d.belumPernahMasuk.some((x) => x.id === p10118), 'akun yang belum pernah dipakai masuk (mis. 10118) MUNCUL di belumPernahMasuk');

  await pg.close();
}

console.log('\n--- Halaman PemeriksaanData (render sisi server, konteks palsu) ---');
{
  const tampil = (nilai) => renderToStaticMarkup(h(KonteksApp.Provider, { value: nilai }, h(PemeriksaanData, { onNav: () => {} })));
  const admin = { role: 'admin' };
  const html = tampil({ user: admin, api: () => ({ muatPemeriksaanData: async () => ({ ok: false, pesan: 'x' }), ringkasanPush: async () => ({ ok: false }) }) });
  ok(html.includes('Periksa Data') && html.includes('Memuat'), 'render awal (efek belum berjalan di sisi server): judul dan status memuat tampil, tanpa galat');
}

console.log(`\nRINGKASAN: ${lulus} lulus, ${gagal} GAGAL.`);
if (gagal) process.exit(1);
