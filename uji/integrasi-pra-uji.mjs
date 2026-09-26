// Fase E: integrasi pra-uji dengan eskalasi, Pemeriksaan Data, dan pengingat (server PGlite lewat api yang sama dengan aplikasi) dan tampilan yang menyertainya
// (kategori Periksa Data, Beranda Penegak). Migrasi: uji/migrasi-integrasi-pra-uji.mjs.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { tahunAjaranKini } from '../src/lib/rombelLogic.js';
import { KATEGORI_PEMERIKSAAN, gabungHasilPemeriksaan, jumlahKategori, kategoriTampil, tabPerbaikan, totalMasalah } from '../src/lib/pemeriksaanLogic.js';
import { tujuanNotifikasi } from '../src/lib/notifikasiLogic.js';
import { KonteksApp } from '../src/context/AppContext.jsx';
import PemeriksaanData from '../src/pages/PemeriksaanData.jsx';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

console.log('--- Logika murni: kategori pra-uji di Periksa Data ---');
{
  const baru = ['rombelTanpaBinaDamping', 'sanggaTanpaPinsa', 'praUjiMacet'];
  ok(baru.every((k) => KATEGORI_PEMERIKSAAN.find((x) => x.kunci === k)?.praUji === true) && KATEGORI_PEMERIKSAAN.length === 12, '3 kategori pra-uji terdaftar dan bertanda praUji (12 kategori seluruhnya)');
  const hasil = { praUjiAktif: false, kelasLama: [{ id: 1 }], rombelTanpaBinaDamping: [{ rombel: 'X-01' }], praUjiMacet: [{ id: 5 }, { id: 6 }] };
  ok(!kategoriTampil(hasil).some((k) => k.praUji) && totalMasalah(hasil) === 1, 'pra-uji mati: kategori pra-uji tidak ditampilkan dan tidak dihitung');
  ok(kategoriTampil({ ...hasil, praUjiAktif: true }).filter((k) => k.praUji).length === 3 && totalMasalah({ ...hasil, praUjiAktif: true }) === 4, 'pra-uji hidup: kategori pra-uji ditampilkan dan dihitung');
  const [pembina, admin, dewan, dewanLama, penegak] = [{ role: 'penguji', jabatan: 'Pembina' }, { role: 'admin' }, { role: 'penguji', jabatan: 'Dewan Ambalan' }, { role: 'penguji', jabatan: 'Dewan Ambalan' }, { role: 'peserta' }];
  const bd = KATEGORI_PEMERIKSAAN.find((k) => k.kunci === 'rombelTanpaBinaDamping'), macet = KATEGORI_PEMERIKSAAN.find((k) => k.kunci === 'praUjiMacet');
  ok(tabPerbaikan(bd, pembina) === 'sangga' && tabPerbaikan(bd, admin) === 'sangga' && tabPerbaikan(bd, dewan) === 'sangga' && tabPerbaikan(bd, dewanLama) === 'sangga' && tabPerbaikan(bd, penegak) === null, 'Bina Damping: Pembina, Admin, dan Dewan diarahkan ke menu Sangga');
  ok(tabPerbaikan(macet, pembina) === 'pra-uji' && tabPerbaikan(macet, admin) === 'pra-uji' && tabPerbaikan(macet, dewan) === null, 'pra-uji macet: hanya Pembina dan Admin diarahkan ke menu Pra-uji');
  const kelasLama = KATEGORI_PEMERIKSAAN.find((k) => k.kunci === 'kelasLama');
  ok(tabPerbaikan(kelasLama, dewan) === null, 'kategori lama tetap tanpa tautan bagi Dewan');
  ok(tujuanNotifikasi({ jenis: 'pra_uji', tautan: { tab: 'pra-uji' } }, ['pra-uji']) === 'pra-uji', 'tautan notifikasi pra-uji tanpa penilai (sesudah migrasi) langsung ke menu Pra-uji');
}

const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const K = { admin: await masuk('admin', PIN_DEMO.admin), pembina: await masuk('pembina', PIN_DEMO.pembina) };
const NIS = ['10231', '10232', '10118', '10007', '10008', '10233'];
const N = {}; for (const nis of NIS) N[nis] = await masuk(nis, PIN_DEMO.penegak);
const [ahmad, siti, dimas, bagas, nadia, rizky] = NIS.map((n) => N[n].id);
const ta = tahunAjaranKini();
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const tulisSku = (pid, tingkat) => q(
  `insert into public.sku_progress (peserta_id, sku_id, status) select p.id, u.id, 'lulus' from public.profiles p join public.sku_unit u on u.tingkat = $2 and (u.agama is null or u.agama = p.agama)
   where p.id = $1 on conflict (peserta_id, sku_id) do update set status = 'lulus'`, [pid, tingkat]);
const B = (await q(`select id from public.sku_unit where tingkat = 'Bantara' and agama is null order by butir_no, id limit 4`)).map((x) => x.id);
const [B1, B2, B3] = B;
await q('delete from public.penugasan_rombel'); await q('delete from public.penugasan_peserta');
await q('delete from public.sku_progress where peserta_id = any($1::uuid[])', [[ahmad, siti, dimas, bagas, nadia, rizky]]);
await q(`update public.profiles set kelas = 'X-01', sangga = 'Sangga Merak' where id = any($1::uuid[])`, [[ahmad, siti]]);
await q(`update public.profiles set kelas = 'X-01', sangga = 'Sangga Elang' where id = any($1::uuid[])`, [[bagas, nadia]]);
await q(`update public.profiles set kelas = 'X-02', sangga = 'Sangga Rajawali' where id = any($1::uuid[])`, [[dimas, rizky]]);
for (const id of [siti, bagas, nadia, dimas, rizky]) await tulisSku(id, 'Bantara');
await tulisSku(bagas, 'Laksana');
await q('delete from public.sku_progress where peserta_id = $1 and sku_id = any($2::text[])', [rizky, [B1, B2]]);
await K.pembina.a.aturJabatanDewan([{ username: '10007', jabatan: 'Bendahara' }, { username: '10008', jabatan: 'Sekretaris' }, { username: '10118', jabatan: 'Humas' }]);
await q(`update public.profiles set pinsa = true where id = $1`, [siti]);
await q(`insert into public.bina_damping (tahun_ajaran, rombel, penegak_id) values ($1, 'X-01', $2), ($1, 'X-01', $3), ($1, 'X-02', $4)`, [ta, bagas, nadia, dimas]);
// hanya kelas contoh tertentu yang dihitung: sisanya (Penegak lain data contoh) dipindah keluar dari rombel agar hasil pemeriksaan mudah diikuti
await q(`update public.profiles set kelas = 'XI-05' where role = 'peserta' and status = 'aktif' and id <> all($1::uuid[])`, [[ahmad, siti, dimas, bagas, nadia, rizky]]);
await q(`update public.profiles set sangga = '' where role = 'peserta' and id <> all($1::uuid[])`, [[ahmad, siti, dimas, bagas, nadia, rizky]]);

const periksa = async (api = K.pembina.a) => (await api.muatPemeriksaanData()).data;
const mulaiSku = async (pid) => (await q('select sigarda.eskalasi_mulai_sku($1)::text d', [pid]))[0].d;

console.log('\n--- Pemeriksaan data: kategori pra-uji (server) ---');
let d = await periksa();
ok(d.praUjiAktif === false, 'sakelar mati: praUjiAktif = false');
ok(Array.isArray(d.rombelTanpaBinaDamping) && Array.isArray(d.sanggaTanpaPinsa) && Array.isArray(d.praUjiMacet), 'ketiga daftar pra-uji selalu ada (klien yang menyaring menurut sakelar)');
const rb = (x) => Object.fromEntries(x.map((r) => [r.rombel, r]));
ok(rb(d.rombelTanpaBinaDamping)['X-01'] === undefined && rb(d.rombelTanpaBinaDamping)['X-02']?.binaDamping === 1 && rb(d.rombelTanpaBinaDamping)['X-02'].jumlah === 2, 'rombel: X-01 sudah 2 Bina Damping (tidak tampil), X-02 baru 1 dari 2');
ok(rb(d.rombelTanpaBinaDamping)['XI-05']?.binaDamping === 0, 'rombel yang berPenegak tanpa Bina Damping tampil dengan jumlah 0');
const sg = Object.fromEntries(d.sanggaTanpaPinsa.map((s) => [`${s.rombel}|${s.sangga}`, s]));
ok(sg['X-01|Sangga Merak'] === undefined && sg['X-01|Sangga Elang']?.jumlah === 2 && sg['X-02|Sangga Rajawali']?.jumlah === 2, 'sangga: Merak punya Pinsa (Siti), Elang dan Rajawali belum');
ok(d.praUjiMacet.length === 0, 'tanpa pra-uji menunggu: praUjiMacet kosong');
let r = await K.pembina.a.aturSakelarPraUji(true);
ok(r.ok, 'Pembina menghidupkan sakelar');
d = await periksa();
ok(d.praUjiAktif === true, 'sakelar hidup: praUjiAktif = true');
const admin = await periksa(K.admin.a);
ok(admin.praUjiAktif === true && admin.rombelTanpaBinaDamping.length === d.rombelTanpaBinaDamping.length, 'Admin melihat hasil yang sama');
r = await N['10231'].a.muatPemeriksaanData();
ok(!r.ok, 'Penegak biasa tetap ditolak');

console.log('\n--- Pra-uji macet dan eskalasi SKU ---');
r = await N['10231'].a.ajukan({ skuId: B3, jadwal: '2030-01-10', pengujiId: null, catatan: '' });
ok(r.ok, 'Ahmad mengajukan: menunggu Pinsa (Siti)');
d = await periksa();
ok(d.praUjiMacet.length === 0, 'baru diajukan dan ada penilai: belum macet');
// SKU Ahmad dibuat "lama tidak bergerak" (semua jejak 10 hari lalu)
await q(`update public.sku_progress set diubah = now() - interval '20 days' where peserta_id = $1`, [ahmad]);
await q(`update public.sku_riwayat set waktu = now() - interval '20 days' where peserta_id = $1`, [ahmad]);
await q(`update public.profiles set dibuat = now() - interval '30 days' where id = $1`, [ahmad]);
await q(`update public.sku_pra_uji set dibuat = now() - interval '20 days' where peserta_id = $1`, [ahmad]);
ok(await mulaiSku(ahmad) === null, 'eskalasi SKU: TIDAK dihitung selama ada pra-uji yang menunggu (penghambatnya penilai)');
d = await periksa();
ok(d.praUjiMacet.length === 1 && d.praUjiMacet[0].nama.length > 0 && d.praUjiMacet[0].tahap === 'pinsa' && d.praUjiMacet[0].hari >= 20 && d.praUjiMacet[0].tanpaPenilai === false && /butir/i.test(d.praUjiMacet[0].butir),
  'pra-uji menunggu lebih dari 3 hari tampil di praUjiMacet (dengan butir, tahap, hari) walau penilai ada');
await q('select sigarda.notif_pengingat()');
const notif = await q(`select tautan, isi from public.notifikasi where penerima_id = $1 and jenis = 'pra_uji' and judul = 'Pra-uji menunggu lebih dari 3 hari'`, [siti]);
ok(notif.length === 1, 'pengingat harian tetap sampai ke penilai (Siti)');
const eskAhmad = await q(`select 1 from public.notifikasi where penerima_id = $1 and jenis = 'eskalasi' and kunci like 'eskalasi:sku:%'`, [ahmad]);
ok(eskAhmad.length === 0, 'Ahmad tidak menerima pengingat "SKU tidak bergerak" selagi menunggu pra-uji');
r = await sebagai(K.pembina.id, 'select public.sg_eskalasi_daftar() as d');
ok(r.ok && Array.isArray(r.rows[0].d) && !r.rows[0].d.some((x) => x.pesertaId === ahmad && x.jenis === 'sku'), 'daftar Tindak Lanjut tidak memuat Ahmad untuk jenis SKU selagi menunggu pra-uji');
// pra-uji selesai (dibatalkan): eskalasi SKU berlaku lagi
r = await N['10231'].a.batalkanAjuan(B3);
ok(r.ok, 'Ahmad membatalkan pengajuan');
await q(`update public.sku_progress set diubah = now() - interval '20 days' where peserta_id = $1`, [ahmad]);
await q(`update public.sku_riwayat set waktu = now() - interval '20 days' where peserta_id = $1`, [ahmad]);
ok(await mulaiSku(ahmad) !== null, 'tanpa pra-uji yang menunggu, eskalasi SKU berlaku lagi seperti semula');

console.log('\n--- Pra-uji tanpa penilai dan pengingat ke Pembina ---');
await q(`delete from public.notifikasi where jenis = 'pra_uji'`);
r = await N['10233'].a.ajukan({ skuId: B1, jadwal: '2030-01-10', pengujiId: null, catatan: '' });
await q(`delete from public.bina_damping where rombel = 'X-02'`);
d = await periksa();
ok(d.praUjiMacet.some((x) => x.nama && x.tanpaPenilai === true) || d.praUjiMacet.length === 0, 'kolom tanpaPenilai tersedia');
// Rizky menunggu Bina Damping (Dimas): hapus penilainya lalu tandai; jalankan pengingat
const menunggu = await q(`select id, tahap from public.sku_pra_uji where peserta_id = $1 and status = 'menunggu'`, [rizky]);
ok(menunggu.length === 1 && menunggu[0].tahap === 'bina_damping', 'Rizky (X-02) menunggu Bina Damping');
d = await periksa();
const itemRizky = d.praUjiMacet.find((x) => x.tahap === 'bina_damping');
ok(itemRizky?.tanpaPenilai === true && itemRizky.hari === 0, 'tanpa penilai yang memenuhi syarat: langsung tampil macet sejak hari pertama (tanpaPenilai = true)');
await q(`update public.sku_pra_uji set dibuat = now() - interval '5 days' where id = $1`, [menunggu[0].id]);
await q('select sigarda.notif_pengingat()');
const macet = await q(`select tautan from public.notifikasi where penerima_id = $1 and jenis = 'pra_uji' and judul = 'Pra-uji tanpa penilai'`, [K.pembina.id]);
ok(macet.length === 1 && macet[0].tautan.tab === 'pra-uji', 'pengingat "tanpa penilai" ke Pembina bertautan ke menu Pra-uji');

console.log('\n--- Tampilan Periksa Data ---');
{
  const users = [{ id: 'pb', role: 'penguji', jabatan: 'Pembina', nama: 'Pak Pembina', status: 'aktif' }];
  const konteks = (hasil) => ({ api: () => ({ muatPemeriksaanData: async () => ({ ok: true, data: hasil }), ringkasanPush: async () => ({ ok: true, data: { tanpa: [] } }) }), user: users[0], users, notify: () => {} });
  const data = { praUjiAktif: true, kelasLama: [], tanpaNta: [], tanpaJk: [], rombelTanpaPenguji: [], pembinaTanpaAgama: [], belumPernahMasuk: [],
    rombelTanpaBinaDamping: [{ rombel: 'X-02', jumlah: 2, binaDamping: 1 }], sanggaTanpaPinsa: [{ rombel: 'X-01', sangga: 'Sangga Elang', jumlah: 2 }],
    praUjiMacet: [{ id: 1, nama: 'Ahmad', kelas: 'X-01', butir: 'Butir 3', tahap: 'pinsa', hari: 10, tanpaPenilai: false }] };
  const gabung = gabungHasilPemeriksaan(data, null);
  ok(jumlahKategori(gabung, 'praUjiMacet') === 1 && totalMasalah(gabung) === 3, 'gabungHasilPemeriksaan membawa kategori pra-uji; total = 3');
  // useEffect tidak berjalan pada render statis: periksa saja kerangka tanpa galat dan bahwa kategori pra-uji hanya ada di kategoriTampil
  const html = renderToStaticMarkup(h(KonteksApp.Provider, { value: konteks(data) }, h(PemeriksaanData, { onNav: () => {} })));
  ok(html.includes('Periksa Data'), 'halaman Periksa Data dirender tanpa galat');
  ok(kategoriTampil({ praUjiAktif: false }).length === 9 && kategoriTampil({ praUjiAktif: true }).length === 12, 'daftar kategori: 9 saat pra-uji mati, 12 saat hidup');
}

console.log(`\nRINGKASAN INTEGRASI PRA-UJI: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
