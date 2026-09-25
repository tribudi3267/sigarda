import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import {
  PENGATURAN_IURAN_BAWAAN, gabungPengaturanIuran, periksaPengaturanIuran, saranNilaiIuran, rekomendasiSusulan, BUTIR_IURAN,
} from '../src/lib/iuranLogic.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^\uFEFF/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const K = { dewan: await masuk('dewan', PIN_DEMO.dewan), pembina: await masuk('pembina', PIN_DEMO.pembina), admin: await masuk('admin', PIN_DEMO.admin), ahmad: await masuk('10231', PIN_DEMO.penegak) };
const anon = buatKlienFake(pg);
const rpc = async (k, nama, args) => { const { data, error } = await k.rpc(nama, args); return { data, err: error?.message ?? null }; };
const ahmad = (await q(`select id from public.profiles where username = '10231'`))[0].id;
const calon = (await q(`select id, username from public.profiles where role = 'peserta' and sigarda.tingkat_selesai(id, 'Bantara') and not sigarda.tingkat_selesai(id, 'Laksana') order by username`))[0];
// Sepuluh Jumat tetap (17 Juli s.d. 18 September 2026): data contoh membuat sesi relatif terhadap HARI INI, sehingga jumlah dan tanggalnya bergeser tiap hari (uji ini gagal pada hari Sabtu 26 September 2026).
await q(`delete from public.absensi_sesi where tanggal between '2026-07-01' and '2026-09-20'`);
await q(`insert into public.absensi_sesi (tanggal) select d::date from generate_series('2026-07-17'::date, '2026-09-18'::date, '7 days') d`);
const sesiSem = (await q(`select tanggal::text t from public.absensi_sesi where tanggal between '2026-07-01' and '2026-09-20' order by tanggal`)).map((x) => x.t);
const UJI = '2026-09-20'; // sesiSem hanya sampai tanggal uji: data contoh memuat semua Jumat sampai HARI INI, jadi pada hari Jumat ada sesi tambahan sesudah tanggal uji
console.log(`   (${sesiSem.length} pertemuan Semester Ganjil 2026/2027 sampai tanggal uji: ${sesiSem[0]} s.d. ${sesiSem.at(-1)})`);
await q(`delete from public.iuran`); await q(`delete from public.iuran_log`);
const isiKali = async (peserta, n, jenis = 'rutin') => { await q(`delete from public.iuran where peserta_id = $1`, [peserta]); for (const t of sesiSem.slice(0, n)) await q(`insert into public.iuran (tanggal, peserta_id, jumlah, jenis, oleh) values ($1, $2, 1000, $3, $4)`, [t, peserta, jenis, K.dewan.id]); };
const ringkas = async (kk, peserta, tgl = UJI) => rpc(kk.k, 'sg_iuran_ringkas', { p_peserta_id: peserta, p_tanggal: tgl });

console.log('--- Pengaturan iuran ---');
let r = await rpc(K.ahmad.k, 'sg_iuran_pengaturan', {});
ok(!r.err && Object.keys(PENGATURAN_IURAN_BAWAAN).every((k) => r.data[k] === PENGATURAN_IURAN_BAWAAN[k]) && Object.keys(r.data).length === 5, 'bawaan (terbaca semua peran, termasuk Penegak): ' + JSON.stringify(r.data));
ok(JSON.stringify(gabungPengaturanIuran(null)) === JSON.stringify(PENGATURAN_IURAN_BAWAAN) && gabungPengaturanIuran({ ambang: 80 }).ambang === 80 && gabungPengaturanIuran({ ambang: 80 }).lima === 90 && gabungPengaturanIuran({ ambang: 'x' }).ambang === 75, 'gabungPengaturanIuran: bawaan, sebagian, dan nilai tidak sah diabaikan');
r = await rpc(anon, 'sg_iuran_pengaturan', {}); ok(!!r.err, 'tanpa login ditolak');
const baik = { standar: 1500, ambang: 80, lima: 95, tiga: 70, dua: 40 };
const salah = [
  ['bukan objek', 'x', /tidak sah/], ['tanpa isian', { standar: 1000 }, /bilangan bulat/], ['standar bukan kelipatan 500', { ...baik, standar: 1200 }, /kelipatan Rp 500/],
  ['standar 0', { ...baik, standar: 0 }, /kelipatan Rp 500/], ['standar terlalu besar', { ...baik, standar: 50500 }, /kelipatan Rp 500/],
  ['tidak berurutan', { ...baik, tiga: 85 }, /berurutan/], ['lima di atas 100', { ...baik, lima: 101 }, /berurutan/], ['dua nol', { ...baik, dua: 0 }, /berurutan/], ['desimal', { ...baik, ambang: 80.5 }, /bilangan bulat/],
];
for (const [nama, nilai, re] of salah) {
  r = await rpc(K.pembina.k, 'sg_iuran_pengaturan_simpan', { p_nilai: nilai }); ok(re.test(r.err ?? ''), `pengaturan ditolak (${nama}): ${(r.err ?? 'DITERIMA').slice(0, 60)}`);
  if (typeof nilai === 'object') ok(periksaPengaturanIuran(nilai) !== '', '  klien juga menolak: ' + nama);
}
ok(periksaPengaturanIuran(baik) === '' && periksaPengaturanIuran(PENGATURAN_IURAN_BAWAAN) === '', 'klien menerima pengaturan yang sah');
for (const [nama, kk] of [['Dewan', K.dewan], ['Penegak', K.ahmad]]) { r = await rpc(kk.k, 'sg_iuran_pengaturan_simpan', { p_nilai: baik }); ok(/Pembina dan Admin/.test(r.err ?? ''), `${nama} tidak dapat mengubah pengaturan`); }
ok((await q(`select count(*)::int n from public.pengaturan where kunci = 'iuran.pengaturan'`))[0].n === 0, 'tidak ada yang tersimpan dari yang ditolak');
r = await rpc(K.pembina.k, 'sg_pengaturan_simpan', { p_kunci: 'iuran.pengaturan', p_nilai: baik }); ok(!!r.err, 'pengaturan iuran tidak dapat ditulis lewat sg_pengaturan_simpan umum');

console.log('\n--- Perhitungan iuran untuk SKU (server = klien) ---');
const persenDari = (kali, n) => Math.floor((kali * 100) / n + 0.5);
for (const kali of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  await isiKali(ahmad, kali);
  const h = (await ringkas(K.pembina, ahmad)).data;
  const persen = persenDari(kali, sesiSem.length);
  ok(h.pertemuan === sesiSem.length && h.kali === kali && h.persen === persen && h.saran === saranNilaiIuran(persen), `${kali} dari ${h.pertemuan}: ${h.persen}% -> saran ${h.saran} (klien ${saranNilaiIuran(persen)})`);
}
await isiKali(ahmad, 7); let h = (await ringkas(K.pembina, ahmad)).data;
ok(h.target === 8 && h.kurang === 1 && h.rutin === 7 && h.susulan === 0 && h.kosong.length === 3 && h.kosong[0] === sesiSem[7], `7 dari 10: target 8, kurang 1, Jumat kosong terlama dulu (${h.kosong.join(', ')})`);
ok(h.mulai === '2026-07-01' && h.akhir === '2026-12-31' && h.pengaturan.standar === 1000 && Array.isArray(h.kosong), 'semester dari tanggal uji (Jul-Des = ganjil) dan pengaturan ikut');
const rek = rekomendasiSusulan(h); ok(rek.pertemuan === 1 && rek.nominal === 1000 && rek.total === 1000, 'rekomendasi: 1 pertemuan x Rp 1.000');
await isiKali(ahmad, 2); h = (await ringkas(K.pembina, ahmad)).data; const rek2 = rekomendasiSusulan(h);
ok(h.kurang === 6 && rek2.pertemuan === 6 && rek2.total === 6000, `2 dari 10: kurang 6, rekomendasi Rp ${rek2.total} (6 x Rp 1.000)`);
await isiKali(ahmad, 10); h = (await ringkas(K.pembina, ahmad)).data; ok(h.kurang === 0 && rekomendasiSusulan(h).pertemuan === 0 && h.saran === 5, '10 dari 10: tidak kurang, saran 5, rekomendasi 0');
// tanggal uji lebih awal: hanya pertemuan sampai tanggal itu
await isiKali(ahmad, 0); h = (await ringkas(K.pembina, ahmad, sesiSem[3])).data;
ok(h.pertemuan === 4 && h.kali === 0 && h.kosong.length === 4 && h.target === 3, `tanggal uji ${sesiSem[3]}: hanya 4 pertemuan yang dihitung (target 3)`);
// semester tanpa pertemuan: saran kosong
h = (await ringkas(K.pembina, ahmad, '2031-03-20')).data; ok(h.pertemuan === 0 && h.persen === null && h.saran === null && h.kurang === 0 && h.kosong.length === 0, 'semester tanpa pertemuan: persen dan saran kosong (bukan pembagian nol)');
h = (await ringkas(K.pembina, ahmad, '2026-03-20')).data; ok(h.mulai === '2026-01-01' && h.akhir === '2026-06-30', 'Maret = semester genap (Jan-Jun)');
// pengaturan mengubah hasil
await rpc(K.pembina.k, 'sg_iuran_pengaturan_simpan', { p_nilai: baik });
await isiKali(ahmad, 8); h = (await ringkas(K.pembina, ahmad)).data;
ok(h.persen === 80 && h.saran === saranNilaiIuran(80, baik) && h.saran === 4 && h.pengaturan.standar === 1500 && h.pengaturan.ambang === 80, 'pengaturan baru dipakai (ambang 80: 80% = nilai 4, iuran standar Rp 1.500)');
await isiKali(ahmad, 7); h = (await ringkas(K.pembina, ahmad)).data; ok(h.persen === 70 && h.saran === 3 && h.kurang === 1 && h.target === 8, 'ambang 80%: 70% = nilai 3 (batas tiga 70), kurang 1');
for (const kali of [0, 3, 4, 5, 6, 7, 8, 9, 10]) { await isiKali(ahmad, kali); const x = (await ringkas(K.pembina, ahmad)).data; ok(x.saran === saranNilaiIuran(persenDari(kali, 10), baik), `pengaturan baru: ${kali}/10 -> saran ${x.saran}`); }
await rpc(K.pembina.k, 'sg_iuran_pengaturan_simpan', { p_nilai: PENGATURAN_IURAN_BAWAAN });

console.log('\n--- Hak akses ringkasan ---');
for (const [nama, kk] of [['Penegak', K.ahmad]]) { r = await ringkas(kk, ahmad); ok(/pengurus/.test(r.err ?? ''), `${nama} tidak dapat memanggil sg_iuran_ringkas: ${r.err}`); }
for (const [nama, kk] of [['Dewan', K.dewan], ['Pembina', K.pembina], ['Admin', K.admin]]) { r = await ringkas(kk, ahmad); ok(!r.err, `${nama} dapat melihat ringkasan`); }
r = await rpc(anon, 'sg_iuran_ringkas', { p_peserta_id: ahmad, p_tanggal: UJI }); ok(!!r.err, 'tanpa login ditolak');
r = await ringkas(K.pembina, K.pembina.id); ok(/Peserta tidak ditemukan/.test(r.err ?? ''), 'hanya untuk Penegak');
r = await rpc(K.pembina.k, 'sg_iuran_ringkas', { p_peserta_id: ahmad, p_tanggal: null }); ok(/Tanggal uji wajib/.test(r.err ?? ''), 'tanggal wajib');

console.log('\n--- Iuran susulan ---');
const susulan = (kk, peserta, jumlah, n, tgl = UJI) => rpc(kk.k, 'sg_iuran_susulan', { p_peserta_id: peserta, p_tanggal: tgl, p_jumlah: jumlah, p_pertemuan: n });
await isiKali(ahmad, 0); await q(`delete from public.iuran_log`);
// Jumat 2, 4, 6 sudah rutin (bolong di antaranya)
for (const i of [1, 3, 5]) await q(`insert into public.iuran (tanggal, peserta_id, jumlah, jenis, oleh) values ($1, $2, 1000, 'rutin', $3)`, [sesiSem[i], ahmad, K.dewan.id]);
h = (await ringkas(K.dewan, ahmad)).data; ok(h.kali === 3 && h.kurang === 5 && h.kosong.length === 7, 'awal: 3 dari 10 beriuran, kurang 5 (target 8), 7 Jumat kosong');
r = await susulan(K.dewan, ahmad, 1000, 5); ok(!r.err && r.data === 5, 'Dewan mencatat susulan 5 pertemuan x Rp 1.000: ' + (r.err ?? r.data));
const baris = await q(`select tanggal::text t, jumlah, jenis, oleh from public.iuran where peserta_id = $1 order by tanggal`, [ahmad]);
const susulanTgl = baris.filter((x) => x.jenis === 'susulan').map((x) => x.t);
ok(susulanTgl.join() === [sesiSem[0], sesiSem[2], sesiSem[4], sesiSem[6], sesiSem[7]].join(), 'yang ditebus adalah Jumat kosong TERLAMA dulu: ' + susulanTgl.join(', '));
ok(baris.filter((x) => x.jenis === 'rutin').length === 3 && baris.every((x) => x.jumlah === 1000) && baris.filter((x) => x.jenis === 'susulan').every((x) => x.oleh === K.dewan.id), 'yang rutin tidak tersentuh; susulan tercatat atas nama Dewan');
h = (await ringkas(K.dewan, ahmad)).data; ok(h.kali === 8 && h.susulan === 5 && h.rutin === 3 && h.persen === 80 && h.saran === 4 && h.kurang === 0, 'sesudah susulan: 8 dari 10 (3 rutin + 5 susulan), 80%, saran 4, tidak kurang');
ok((await q(`select count(*)::int n from public.iuran_log where peserta_id = $1 and jenis = 'susulan' and jumlah_lama is null`, [ahmad]))[0].n === 5, 'riwayat mencatat 5 iuran susulan');
const agr = (await rpc(K.ahmad.k, 'sg_iuran_agregat', { p_mulai: sesiSem[0], p_akhir: sesiSem.at(-1) })).data.filter((x) => x.tipe === 'gudep');
ok(agr.reduce((s, x) => s + x.susulan, 0) === 5000, 'agregat memisahkan bagian susulan (Rp 5.000)');
r = await susulan(K.dewan, ahmad, 2000, 60); ok(!r.err && r.data === 2, 'meminta lebih banyak dari yang kosong: hanya 2 Jumat tersisa yang terisi (' + r.data + ')');
r = await susulan(K.dewan, ahmad, 1000, 3); ok(/Tidak ada pertemuan tanpa iuran/.test(r.err ?? ''), 'semua Jumat sudah terisi: ditolak dengan pesan jelas');
// batas tanggal uji
await isiKali(ahmad, 0); r = await susulan(K.dewan, ahmad, 500, 60, sesiSem[3]);
ok(!r.err && r.data === 4 && (await q(`select max(tanggal)::text m from public.iuran where peserta_id = $1`, [ahmad]))[0].m === sesiSem[3], `tanggal uji ${sesiSem[3]}: hanya 4 Jumat sampai tanggal itu yang ditebus`);
r = await susulan(K.dewan, ahmad, 500, 60, '2031-03-20'); ok(/Tidak ada pertemuan tanpa iuran/.test(r.err ?? ''), 'semester tanpa pertemuan: tidak ada yang ditebus');
// validasi dan hak
r = await susulan(K.dewan, ahmad, 0, 1); ok(/antara Rp 1/.test(r.err ?? ''), 'jumlah 0 ditolak');
r = await susulan(K.dewan, ahmad, 1000001, 1); ok(/antara Rp 1/.test(r.err ?? ''), 'jumlah di atas Rp 1.000.000 ditolak');
r = await susulan(K.dewan, ahmad, 1000, 0); ok(/antara 1 dan 60/.test(r.err ?? ''), 'pertemuan 0 ditolak');
r = await susulan(K.dewan, ahmad, 1000, 61); ok(/antara 1 dan 60/.test(r.err ?? ''), 'pertemuan 61 ditolak');
r = await rpc(K.dewan.k, 'sg_iuran_susulan', { p_peserta_id: ahmad, p_tanggal: null, p_jumlah: 1000, p_pertemuan: 1 }); ok(/Tanggal uji wajib/.test(r.err ?? ''), 'tanggal wajib');
r = await susulan(K.dewan, K.pembina.id, 1000, 1); ok(/Peserta tidak ditemukan/.test(r.err ?? ''), 'hanya untuk Penegak');
await isiKali(ahmad, 0);
for (const [nama, kk] of [['Pembina', K.pembina], ['Admin', K.admin], ['Penegak', K.ahmad]]) { r = await susulan(kk, ahmad, 1000, 1); ok(/Hanya Dewan Ambalan/.test(r.err ?? ''), `${nama} tidak dapat mencatat susulan: ${r.err}`); }
r = await rpc(anon, 'sg_iuran_susulan', { p_peserta_id: ahmad, p_tanggal: UJI, p_jumlah: 1000, p_pertemuan: 1 }); ok(!!r.err, 'tanpa login ditolak');
ok((await q(`select count(*)::int n from public.iuran where peserta_id = $1`, [ahmad]))[0].n === 0, 'tidak ada baris dari percobaan yang ditolak');
// asisten tidak dapat mencatat susulan
await rpc(K.dewan.k, 'sg_asisten_iuran_atur', { p_peserta_id: calon.id, p_aktif: true }); const A = await masuk(calon.username, PIN_DEMO.penegak);
r = await susulan(A, ahmad, 1000, 1); ok(/Hanya Dewan Ambalan/.test(r.err ?? ''), 'asisten bendahara tidak dapat mencatat susulan (hanya Dewan)');

console.log('\n--- Peran asisten tercermin pada ringkasan (bahan penilaian Laksana 6) ---');
h = (await ringkas(K.pembina, calon.id)).data; ok(h.membantu === 0, 'asisten baru: belum membantu');
const t3 = sesiSem.slice(0, 3);
for (const t of t3) await rpc(A.k, 'sg_iuran_set', { p_tanggal: t, p_peserta_id: ahmad, p_jumlah: 500 });
await rpc(A.k, 'sg_iuran_set', { p_tanggal: t3[0], p_peserta_id: ahmad, p_jumlah: 1000 }); // perubahan pada Jumat yang sama tidak dihitung dua kali
h = (await ringkas(K.pembina, calon.id)).data; ok(h.membantu === 3, `asisten mencatat pada 3 Jumat berbeda: membantu = ${h.membantu}`);
h = (await ringkas(K.pembina, ahmad)).data; ok(h.membantu === 0, 'Penegak yang bukan asisten: membantu 0');

console.log('\n--- Kriteria bersumber iuran pada instrumen ---');
const kriteria = (sumberB) => [
  { jenis: 'Bukti kegiatan', teks: 'Ketaatan iuran rutin (dari catatan iuran)', bobot: 3, wajib: false, panduan: 'Lihat rekap', sumber: sumberB },
  { jenis: 'Lisan', teks: 'Iuran berasal dari usaha sendiri', bobot: 2, wajib: true, panduan: 'Tanyakan sumber uang' },
];
r = await K.pembina.a.simpanInstrumen({ skuId: 'BAN-06', caraUji: 'Lisan dan catatan iuran', instruksi: 'x', status: 'draf', kriteria: kriteria('iuran') }); ok(r.ok, 'instrumen BAN-06 dengan satu kriteria bersumber iuran disimpan: ' + (r.pesan ?? ''));
const ins = (await K.pembina.a.muatInstrumen()).data['BAN-06'];
ok(ins.kriteria[0].sumber === 'iuran' && ins.kriteria[1].sumber === 'manual', 'sumber terbaca kembali (iuran, manual)');
r = await K.pembina.a.simpanInstrumen({ skuId: 'BAN-05', caraUji: '', instruksi: '', status: 'draf', kriteria: kriteria('iuran') }); ok(!r.ok && /hanya untuk butir iuran/.test(r.pesan), 'sumber iuran ditolak pada butir lain: ' + r.pesan);
r = await K.pembina.a.simpanInstrumen({ skuId: 'BAN-06', caraUji: '', instruksi: '', status: 'draf', kriteria: [...kriteria('iuran'), { jenis: 'Lisan', teks: 'kedua', bobot: 1, wajib: false, panduan: '', sumber: 'iuran' }] }); ok(!r.ok && /satu kriteria/.test(r.pesan), 'dua kriteria bersumber iuran ditolak: ' + r.pesan);
r = await K.pembina.a.simpanInstrumen({ skuId: 'BAN-06', caraUji: '', instruksi: '', status: 'draf', kriteria: kriteria('lainnya') }); ok(!r.ok && /sumber nilai tidak dikenal/.test(r.pesan), 'sumber tidak dikenal ditolak');
r = await K.pembina.a.simpanInstrumen({ skuId: 'LAK-06', caraUji: '', instruksi: '', status: 'draf', kriteria: kriteria('iuran') }); ok(r.ok, 'Laksana 6 juga boleh');
ok(BUTIR_IURAN.join() === 'BAN-06,LAK-06', 'BUTIR_IURAN sama dengan aturan server');
r = await K.pembina.a.statusInstrumen(['BAN-06'], 'ditetapkan'); ok(r.ok, 'instrumen BAN-06 ditetapkan');
const kr = (await q(`select id, sumber from public.instrumen_kriteria where sku_id = 'BAN-06' order by urutan`));
const kIuran = kr.find((x) => x.sumber === 'iuran'), kLain = kr.find((x) => x.sumber === 'manual');

console.log('\n--- Penilaian: alasan wajib bila nilai iuran berbeda dari saran ---');
await q(`delete from public.sku_progress where peserta_id = $1`, [ahmad]); await q(`delete from public.iuran where peserta_id = $1`, [ahmad]); await q(`delete from public.sku_penilaian where peserta_id = $1`, [ahmad]);
await isiKali(ahmad, 7); // 70% -> saran 3
const nilai = (nIuran, nLain = 5) => [{ kriteria_id: Number(kIuran.id), nilai: nIuran }, { kriteria_id: Number(kLain.id), nilai: nLain }];
const catat = (kk, rincian, o = {}) => kk.a.catatHasil({ pin: kk === K.dewan ? PIN_DEMO.dewan : PIN_DEMO.pembina, pesertaId: ahmad, skuId: 'BAN-06', hasil: 'lulus', tanggalUji: UJI, catatan: '', rincian, ...o });
h = (await ringkas(K.pembina, ahmad)).data; ok(h.saran === 3, 'awal: 70% -> saran nilai 3');
r = await catat(K.pembina, nilai(5)); ok(!r.ok && /berbeda dari saran hitungan iuran \(saran: 3\)/.test(r.pesan), 'nilai iuran 5 (saran 3) tanpa catatan ditolak: ' + r.pesan);
ok((await q(`select count(*)::int n from public.sku_penilaian where peserta_id = $1`, [ahmad]))[0].n === 0 && (await q(`select count(*)::int n from public.sku_progress where peserta_id = $1`, [ahmad]))[0].n === 0, '...dan tidak ada yang tersimpan');
r = await catat(K.pembina, nilai(3)); ok(r.ok && r.rubrik, 'nilai iuran = saran (3): diterima tanpa catatan: skor ' + r.hasil?.skor);
let pen = (await q(`select rincian, catatan from public.sku_penilaian where peserta_id = $1 order by id desc limit 1`, [ahmad]))[0];
const rInt = pen.rincian.find((x) => x.sumber === 'iuran');
ok(rInt && rInt.saran === 3 && rInt.nilai === 3 && pen.rincian.find((x) => x.sumber === 'manual').saran === null, 'salinan rincian menyimpan sumber dan saran iuran (untuk kriteria iuran saja)');
r = await K.pembina.a.muatPenilaian(ahmad, 'BAN-06'); ok(r.ok && r.data[0].rincian.find((x) => x.sumber === 'iuran').saran === 3, 'muatPenilaian membawa sumber dan saran');
await q(`delete from public.sku_progress where peserta_id = $1`, [ahmad]);
r = await catat(K.pembina, nilai(5), { catatan: 'Rajin membantu Ambalan di luar iuran rutin' }); ok(r.ok, 'nilai iuran 5 dengan catatan alasan: diterima');
ok((await q(`select teks from public.sku_riwayat where peserta_id = $1 and sku_id = 'BAN-06' order by id desc limit 1`, [ahmad]))[0].teks.includes('Nilai kriteria iuran berbeda dari saran iuran (3)'), 'riwayat mencatat perbedaan dengan saran iuran dan alasannya');
await q(`delete from public.sku_progress where peserta_id = $1`, [ahmad]);
r = await catat(K.pembina, nilai(1), { hasil: 'ulang', catatan: '' }); ok(!r.ok && /saran hitungan iuran/.test(r.pesan), 'nilai di bawah saran (1) juga wajib beralasan: ' + r.pesan);
r = await catat(K.pembina, nilai(3, 2), { hasil: 'ulang', catatan: 'kriteria lain kurang' }); ok(r.ok, 'perbedaan pada kriteria manual tidak terkena aturan iuran');
await q(`delete from public.sku_progress where peserta_id = $1`, [ahmad]);
// ganti hasil dan iuran keduanya berbeda: cukup satu catatan
r = await catat(K.pembina, nilai(1), { hasil: 'lulus', catatan: 'satu catatan menjelaskan keduanya' }); ok(r.ok, 'satu catatan cukup untuk semua perbedaan');
await q(`delete from public.sku_progress where peserta_id = $1`, [ahmad]);
// Dewan boleh menilai butir iuran (bukan butir agama)
r = await catat(K.dewan, nilai(3)); ok(r.ok, 'Dewan Ambalan dapat menilai butir iuran');
await q(`delete from public.sku_progress where peserta_id = $1`, [ahmad]);
// tanpa pertemuan pada semester tanggal uji: tidak ada saran, tidak ada aturan
r = await catat(K.pembina, nilai(5), { tanggalUji: '2031-03-20' }); ok(r.ok, 'semester tanpa pertemuan (tanpa saran iuran): nilai bebas tanpa catatan');
pen = (await q(`select rincian from public.sku_penilaian where peserta_id = $1 order by id desc limit 1`, [ahmad]))[0]; ok(pen.rincian.find((x) => x.sumber === 'iuran').saran === null, '...dan saran tersimpan null');
await q(`delete from public.sku_progress where peserta_id = $1`, [ahmad]);
// susulan mengubah saran, lalu nilai mengikuti
await isiKali(ahmad, 5); h = (await ringkas(K.pembina, ahmad)).data; ok(h.saran === 2 && h.kurang === 3, 'awal susulan: 5/10 = saran 2, kurang 3');
r = await susulan(K.dewan, ahmad, 1000, 3); ok(!r.err && r.data === 3, 'Dewan menerima susulan 3 pertemuan saat ujian');
h = (await ringkas(K.pembina, ahmad)).data; ok(h.saran === 4 && h.kurang === 0 && h.susulan === 3, 'sesudah susulan: 8/10 = saran 4');
r = await catat(K.pembina, nilai(4)); ok(r.ok, 'nilai mengikuti saran baru (4): diterima tanpa catatan');
// butir lain tetap seperti biasa
r = await K.pembina.a.catatHasil({ pin: PIN_DEMO.pembina, pesertaId: ahmad, skuId: 'BAN-02', hasil: 'lulus', tanggalUji: UJI, nilai: 'Baik', catatan: '' }); ok(r.ok, 'butir lain (gaya lama) tidak terpengaruh');

console.log(`\nRINGKASAN IURAN-SKU: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
