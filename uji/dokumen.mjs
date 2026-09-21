// Fase 2a: dokumen terbit dan surat pengantar ke guru agama. Server (penerbitan, pencabutan, nomor, RLS, verifikasi QR dan kode, Pembina mencatat
// hasil butir agama lewat surat) dan logika klien murni yang mencerminkannya (suratAgamaAktif, pengujiSah dengan dokumen, format nomor surat).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { pengujiPeranOk, pengujiSah } from '../src/lib/rombelLogic.js';
import { antrianPengujian, bolehMenilaiPoin, cariPoin, daftarPoin } from '../src/lib/skuLogic.js';
import { perluSuratAgama, suratAgamaAktif, suratAktifPeserta, unitAgamaPeserta, unitBisaDisurati } from '../src/lib/dokumenLogic.js';
import { FORMAT_SURAT_BAWAAN, contohNomorSurat, nomorUrutBerikutnya, periksaFormatSurat } from '../src/lib/suratLogic.js';
import { alamatDasar, urlVerifikasi } from '../src/lib/verifikasiLogic.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const K = { admin: await masuk('admin', PIN_DEMO.admin), pembina: await masuk('pembina', PIN_DEMO.pembina), dewan: await masuk('dewan', PIN_DEMO.dewan), ahmad: await masuk('10231', PIN_DEMO.penegak) };
const cocok = (r, re) => !r.ok && re.test(r.pesan ?? '');
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const hariIni = (await q('select sigarda.hari_ini()::text d'))[0].d;
const tahun = hariIni.slice(0, 4);
const users = async () => (await K.admin.a.muatProfil()).data;
let U = await users();
const pid = (nis) => U.find((u) => u.username === nis).id;
const ahmad = pid('10231'), rina = pid('10119'), made = pid('10121'), maria = pid('10010');
const pembina = K.pembina.id, dewan = K.dewan.id, admin = K.admin.id;
const guruKatolik = (await q(`select id::int from public.guru_agama where agama = 'Katolik'`))[0].id;
const guruHindu = (await q(`select id::int from public.guru_agama where agama = 'Hindu'`))[0].id;
const riwayat = async (idp, sku) => (await q('select teks from public.sku_riwayat where peserta_id = $1 and sku_id = $2 order by id', [idp, sku])).map((x) => x.teks);
const bersih = (idp, sku) => q('delete from public.sku_progress where peserta_id = $1 and sku_id = $2', [idp, sku]);
const terbit = (K_, o = {}) => K_.a.terbitkanSuratAgama({
  pesertaId: rina, butir: ['BAN-01-KAT-1'], guruId: guruKatolik, guruNama: '', tanggal: hariIni, penerbit: 'Gugus Depan SMAN 1 Bukateja',
  penandaNama: 'Diana Udhi Hendriyanto, S.Pd.M.Pd', penandaJabatan: 'Pembina Gudep', nomorManual: '', catatan: '', ...o,
});

console.log('--- Data contoh ---');
ok(guruKatolik > 0 && guruHindu > 0, 'guru agama contoh: Katolik dan Hindu');
ok(U.filter((u) => u.role === 'penguji' && u.jabatan === 'Pembina').every((u) => u.agama === 'Islam'), 'satu-satunya Pembina contoh beragama Islam: Rina (Katolik) dan Made (Hindu) tidak punya Pembina seagama');
const unitKat = unitAgamaPeserta(U.find((u) => u.id === rina));
ok(unitKat.length > 0 && unitKat.every((p) => p.agama === 'Katolik') && unitKat[0].tingkat === 'Bantara', `unitAgamaPeserta(Rina): ${unitKat.length} unit agama Katolik, Bantara lebih dulu`);
ok(perluSuratAgama(U, U.find((u) => u.id === rina)) && !perluSuratAgama(U, U.find((u) => u.id === ahmad)), 'perluSuratAgama: Rina ya, Ahmad (ada Pembina Islam) tidak');
for (const s of ['BAN-01-KAT-1', 'BAN-01-KAT-2', 'BAN-01-HIN-1']) await bersih(rina, s);
await bersih(maria, 'BAN-01-KAT-1'); await bersih(made, 'BAN-01-HIN-2');
await bersih(made, 'BAN-01-HIN-1');

console.log('\n--- Server: siapa boleh menerbitkan dan syaratnya ---');
let r = await terbit(K.dewan);
ok(cocok(r, /Hanya Pembina atau Admin/), 'Dewan Ambalan tidak dapat menerbitkan surat');
r = await terbit(K.ahmad);
ok(cocok(r, /Hanya Pembina atau Admin/), 'Penegak tidak dapat menerbitkan surat');
r = await terbit(K.pembina, { pesertaId: ahmad, butir: ['BAN-01-ISL-1'], guruId: null, guruNama: 'Bu Guru' });
ok(cocok(r, /Ada Pembina yang seagama \(Islam\)/), 'Penegak yang punya Pembina seagama tidak memerlukan surat: ' + r.pesan);
r = await terbit(K.pembina, { butir: [] });
ok(cocok(r, /sedikitnya satu butir/), 'butir wajib dipilih');
r = await terbit(K.pembina, { butir: ['BAN-01-HIN-1'] });
ok(cocok(r, /bukan butir agama Katolik/), 'butir agama lain ditolak');
r = await terbit(K.pembina, { butir: ['BAN-05'] });
ok(cocok(r, /bukan butir agama Katolik/), 'butir biasa (bukan agama) ditolak');
r = await terbit(K.pembina, { guruId: guruHindu });
ok(cocok(r, /tidak terdaftar untuk agama Katolik/), 'guru agama lain ditolak');
r = await terbit(K.pembina, { guruId: null, guruNama: '   ' });
ok(cocok(r, /Pilih guru agama atau tulis namanya/), 'guru wajib');
r = await terbit(K.pembina, { tanggal: '1999-01-01' });
ok(cocok(r, /Tanggal surat tidak valid/), 'tanggal tidak sah ditolak');
r = await terbit(K.pembina, { penandaNama: '' });
ok(cocok(r, /Nama penanda tangan wajib/), 'penanda tangan wajib');
r = await terbit(K.pembina, { penandaJabatan: 'x'.repeat(81) });
ok(cocok(r, /Jabatan penanda tangan wajib/), 'jabatan maksimal 80 karakter');
r = await terbit(K.pembina, { catatan: 'x'.repeat(301) });
ok(cocok(r, /Catatan maksimal 300/), 'catatan maksimal 300');
r = await terbit(K.pembina, { pesertaId: pembina });
ok(cocok(r, /Peserta tidak ditemukan/), 'sasaran bukan Penegak ditolak');
ok((await q('select count(*)::int n from public.dokumen_terbit'))[0].n === 0 && (await q('select count(*)::int n from public.dokumen_urut'))[0].n === 0, 'permintaan yang ditolak tidak menyimpan apa pun (termasuk penghitung nomor)');
await q(`insert into public.sku_progress (peserta_id, sku_id, status, tanggal_uji, nilai) values ($1, 'BAN-01-KAT-2', 'lulus', current_date, 'Baik')`, [rina]);
r = await terbit(K.pembina, { butir: ['BAN-01-KAT-2'] });
ok(cocok(r, /sudah lulus/), 'butir yang sudah lulus tidak perlu surat');
await bersih(rina, 'BAN-01-KAT-2');

console.log('\n--- Server: sebelum ada surat, Pembina Islam tidak dapat menilai butir agama Katolik ---');
const catat = (o = {}) => K.pembina.a.catatHasil({ pin: PIN_DEMO.pembina, pesertaId: rina, skuId: 'BAN-01-KAT-1', hasil: 'proses', tanggalUji: hariIni, catatan: '', ...o });
ok(cocok(await catat(), /seagama/), 'ditolak tanpa surat');
r = await K.ahmad.a.pengujiPilihan('BAN-01-ISL-1');
ok(r.ok && r.data.penguji.length === 1, 'prasyarat: Penegak Islam masih dilayani Pembina Islam');
r = await sebagai(rina, `select public.sg_penguji_pilihan('BAN-01-KAT-1') d`);
ok(r.ok && r.rows[0].d.penguji.length === 0, 'daftar penguji butir agama Katolik kosong');

console.log('\n--- Server: menerbitkan surat ---');
r = await terbit(K.pembina, { catatan: 'Mohon dinilai pekan ini.' });
ok(r.ok && r.data.nomor === `001/SP/${tahun}` && /^[0-9a-f]{32}$/.test(r.data.token) && r.data.id > 0, 'Pembina menerbitkan surat: nomor otomatis ' + (r.data?.nomor ?? r.pesan));
const s1 = r.data;
{
  const d = (await q('select * from public.dokumen_terbit where id = $1', [s1.id]))[0];
  ok(d.jenis === 'surat_pengantar_agama' && d.nomor_urut === 1 && d.peserta_nama === 'Rina Wulandari' && d.penerbit === 'Gugus Depan SMAN 1 Bukateja' && d.penanda_tangan_jabatan === 'Pembina Gudep', 'data tersimpan (nomor urut, penerbit, penanda tangan)');
  ok(d.dibuat_oleh === pembina && d.dibuat_oleh_jabatan === 'Pembina' && /^VRF-[0-9A-F]{7}$/.test(d.kode), 'pembuat dicatat dari akun (bukan dari isian) dan kode VRF dibuat');
  ok(d.payload.agama === 'Katolik' && d.payload.kelas === 'XI-02' && d.payload.guru.nama === 'Yohanes Wibowo, S.Ag.' && d.payload.butir.join() === 'BAN-01-KAT-1' && d.payload.catatan === 'Mohon dinilai pekan ini.', 'payload memuat agama, kelas, guru, butir, catatan');
  ok((await riwayat(rina, 'BAN-01-KAT-1')).some((t) => t.includes(`Surat pengantar nomor 001/SP/${tahun} diterbitkan untuk guru agama Yohanes Wibowo`)), 'riwayat butir mencatat penerbitan surat');
}
r = await terbit(K.pembina);
ok(cocok(r, /sudah tercantum pada surat pengantar yang masih berlaku/), 'butir yang sudah ada pada surat berlaku tidak dapat disurati ulang');
r = await terbit(K.admin, { pesertaId: maria, butir: ['BAN-01-KAT-1'], guruId: null, guruNama: 'Ibu  Maria   Sri', nomorManual: 'SP-MANUAL/07' });
ok(r.ok && r.data.nomor === 'SP-MANUAL/07', 'Admin dapat menerbitkan dengan nomor manual, dan nama guru dirapikan');
const s2 = r.data;
ok((await q('select payload->\'guru\'->>\'nama\' n from public.dokumen_terbit where id = $1', [s2.id]))[0].n === 'Ibu Maria Sri' && (await q('select nomor_urut from public.dokumen_terbit where id = $1', [s2.id]))[0].nomor_urut === null, 'nama guru dirapikan; nomor manual tidak memakai penghitung');
r = await terbit(K.pembina, { butir: ['BAN-01-KAT-2'], nomorManual: 'SP-MANUAL/07' });
ok(cocok(r, /Nomor surat SP-MANUAL\/07 sudah dipakai/), 'nomor ganda ditolak');
r = await K.pembina.a.terbitkanSuratAgama({ pesertaId: made, butir: ['BAN-01-HIN-1'], guruId: guruHindu, tanggal: hariIni, penerbit: 'Gugus Depan SMAN 1 Bukateja', penandaNama: 'Diana', penandaJabatan: 'Pembina Gudep' });
ok(r.ok && r.data.nomor === `002/SP/${tahun}`, 'surat berikutnya memakai nomor urut 002: ' + (r.data?.nomor ?? r.pesan));
const s3 = r.data;

console.log('\n--- Server: dengan surat berlaku, Pembina mencatat hasil butir agama (dinilai guru agama) ---');
r = await K.ahmad.a.pengujiPilihan('BAN-01-ISL-1');
ok(r.ok, 'Penegak Islam tidak terpengaruh');
r = await sebagai(rina, `select public.sg_penguji_pilihan('BAN-01-KAT-1') d`);
ok(r.ok && r.rows[0].d.penguji.length === 1 && r.rows[0].d.penguji[0].id === pembina, 'butir yang tercantum: Pembina masuk daftar penguji yang sah');
r = await sebagai(rina, `select public.sg_penguji_pilihan('BAN-01-KAT-2') d`);
ok(r.ok && r.rows[0].d.penguji.length === 0, 'butir yang tidak tercantum pada surat tetap tanpa penguji');
r = await K.dewan.a.catatHasil({ pin: PIN_DEMO.dewan, pesertaId: rina, skuId: 'BAN-01-KAT-1', hasil: 'proses', tanggalUji: hariIni, catatan: '' });
ok(cocok(r, /Butir agama hanya dapat dinilai oleh Pembina/), 'Dewan Ambalan tetap tidak boleh menilai butir agama');
r = await catat({ skuId: 'BAN-01-KAT-2' });
ok(cocok(r, /seagama/), 'butir yang tidak tercantum pada surat ditolak');
r = await catat();
ok(r.ok, 'Pembina mencatat "mulai uji" butir yang tercantum pada surat');
ok((await riwayat(rina, 'BAN-01-KAT-1')).at(-1) === `Pengujian dimulai (dinilai guru agama Yohanes Wibowo, S.Ag., surat nomor 001/SP/${tahun})`, 'riwayat menyebut guru agama dan nomor surat: ' + (await riwayat(rina, 'BAN-01-KAT-1')).at(-1));
r = await catat({ hasil: 'ulang', catatan: 'Perlu memperdalam materi.' });
ok(r.ok && (await riwayat(rina, 'BAN-01-KAT-1')).at(-1).startsWith('Perlu diulang (dinilai guru agama'), 'hasil "ulang" juga memuat keterangan guru agama');
r = await K.ahmad.a.catatHasil({ pin: PIN_DEMO.penegak, pesertaId: ahmad, skuId: 'BAN-01-ISL-1', hasil: 'proses', tanggalUji: hariIni, catatan: '' });
ok(cocok(r, /Hanya Pembina atau Dewan/), 'Penegak tetap tidak dapat mencatat hasil');
// Pembina seagama (Ahmad Islam): tanpa keterangan guru agama
r = await K.pembina.a.catatHasil({ pin: PIN_DEMO.pembina, pesertaId: ahmad, skuId: 'BAN-01-ISL-1', hasil: 'proses', tanggalUji: hariIni, catatan: '' });
ok(r.ok && !(await riwayat(ahmad, 'BAN-01-ISL-1')).at(-1).includes('guru agama'), 'Pembina seagama: riwayat tanpa keterangan guru agama');
await bersih(ahmad, 'BAN-01-ISL-1');

console.log('\n--- Server: mencabut surat ---');
ok(cocok(await K.dewan.a.cabutDokumen(s1.id, 'salah'), /Hanya Pembina atau Admin/), 'Dewan Ambalan tidak dapat mencabut');
ok(cocok(await K.pembina.a.cabutDokumen(s1.id, '   '), /alasan/i), 'alasan wajib');
ok(cocok(await K.pembina.a.cabutDokumen(s1.id, 'x'.repeat(201)), /maksimal 200/), 'alasan maksimal 200');
ok(cocok(await K.pembina.a.cabutDokumen(999999, 'x'), /tidak ditemukan/), 'dokumen tidak ada ditolak');
r = await K.pembina.a.cabutDokumen(s1.id, 'Guru agama berganti');
ok(r.ok, 'Pembina mencabut surat');
ok(cocok(await K.pembina.a.cabutDokumen(s1.id, 'lagi'), /sudah dicabut/), 'mencabut dua kali ditolak');
ok((await riwayat(rina, 'BAN-01-KAT-1')).at(-1) === `Surat pengantar nomor 001/SP/${tahun} dicabut. Alasan: Guru agama berganti`, 'riwayat mencatat pencabutan');
ok(cocok(await catat(), /seagama/), 'setelah dicabut Pembina tidak lagi dapat mencatat butir itu');
r = await sebagai(rina, `select public.sg_penguji_pilihan('BAN-01-KAT-1') d`);
ok(r.ok && r.rows[0].d.penguji.length === 0, 'setelah dicabut daftar penguji butir itu kosong lagi');
r = await terbit(K.pembina, { butir: ['BAN-01-KAT-1'], guruId: null, guruNama: 'Guru Pengganti' });
ok(r.ok && r.data.nomor === `003/SP/${tahun}`, 'setelah dicabut butir dapat disurati ulang; nomor tidak dipakai ulang (003)');
const s4 = r.data;

console.log('\n--- Server: verifikasi keaslian (tanpa login) ---');
r = await sebagai(null, `select public.sg_verifikasi_token($1) d`, [s4.token]);
{
  const d = r.rows?.[0]?.d ?? {};
  ok(r.ok && d.ditemukan && d.jenis === 'dokumen' && d.jenis_dokumen === 'surat_pengantar_agama' && !d.dicabut, 'QR surat berlaku: sah');
  ok(d.nomor === `003/SP/${tahun}` && d.penerbit === 'Gugus Depan SMAN 1 Bukateja' && d.dibuat_oleh === (await q('select nama from public.profiles where id = $1', [pembina]))[0].nama && d.penanda_tangan === 'Diana Udhi Hendriyanto, S.Pd.M.Pd' && d.jabatan_penanda_tangan === 'Pembina Gudep', 'menjawab nomor, penerbit, pembuat, penanda tangan');
  ok(d.nama === 'Rina Wulandari' && d.kelas === 'XI-02' && d.agama === 'Katolik' && d.guru === 'Guru Pengganti' && d.butir.join() === 'BAN-01-KAT-1', 'menjawab data Penegak, guru, dan butir');
  ok(!('id' in d) && !('token' in d) && !('peserta_id' in d), 'tidak membocorkan id dalam jawaban');
}
r = await sebagai(null, `select public.sg_verifikasi_token($1) d`, [s1.token]);
ok(r.ok && r.rows[0].d.ditemukan && r.rows[0].d.dicabut === true && r.rows[0].d.nomor === `001/SP/${tahun}` && !('nama' in r.rows[0].d), 'QR surat dicabut: dijawab "dicabut", tanpa nama Penegak');
const kode4 = (await q('select kode from public.dokumen_terbit where id = $1', [s4.id]))[0].kode;
r = await sebagai(null, `select public.sg_verifikasi_kode($1) d`, [kode4]);
ok(r.ok && r.rows[0].d.ditemukan && r.rows[0].d.jenis === 'dokumen' && r.rows[0].d.nomor === `003/SP/${tahun}` && !('nama' in r.rows[0].d), 'kode VRF surat: sah, hanya nomor dan tanggal (tanpa nama)');
r = await sebagai(null, `select public.sg_verifikasi_kode('VRF-0000000') d`);
ok(r.ok && r.rows[0].d.ditemukan === false, 'kode tidak dikenal: tidak ditemukan');
r = await sebagai(null, `select public.sg_verifikasi_token('${'0'.repeat(32)}') d`);
ok(r.ok && r.rows[0].d.ditemukan === false, 'token acak: tidak ditemukan');
{
  // verifikasi butir/sertifikat yang sudah ada tidak berubah
  const tokenButir = (await q(`select verifikasi_token t from public.sku_progress where status = 'lulus' and verifikasi_token is not null limit 1`))[0]?.t;
  r = tokenButir ? await sebagai(null, `select public.sg_verifikasi_token($1) d`, [tokenButir]) : { ok: true, rows: [{ d: { jenis: 'butir' } }] };
  ok(r.ok && r.rows[0].d.jenis === 'butir', 'verifikasi butir SKU tetap berfungsi');
}
{
  const anon = await sebagai(null, `select count(*)::int n from public.dokumen_terbit`);
  ok(!anon.ok || anon.rows[0].n === 0, 'tanpa login tabel dokumen tidak terbaca');
}

console.log('\n--- Server: akses baca dan tulis (RLS) ---');
r = await K.pembina.a.muatDokumen();
ok(r.ok && r.data.length === 4 && r.data[0].nomor === `001/SP/${tahun}` && r.data[0].dicabutPada && r.data[3].butir.join() === 'BAN-01-KAT-1', 'Pembina membaca semua dokumen (bentuk susunDokumen)');
r = await K.dewan.a.muatDokumen();
ok(r.ok && r.data.length === 4, 'Dewan Ambalan membaca semua dokumen (hanya melihat)');
r = await K.ahmad.a.muatDokumen();
ok(r.ok && r.data.length === 0, 'Penegak tidak melihat dokumen Penegak lain');
r = await sebagai(rina, `select count(*)::int n from public.dokumen_terbit`);
ok(r.ok && r.rows[0].n === 2, 'Penegak (Rina) melihat dokumen tentang dirinya sendiri (2 surat)');
r = await sebagai(rina, `select count(*)::int n from public.dokumen_urut`);
ok(r.ok && r.rows[0].n === 0, 'Penegak tidak membaca penghitung nomor');
r = await sebagai(pembina, `insert into public.dokumen_terbit (token, kode, jenis, nomor, tanggal, peserta_nama, penerbit, dibuat_oleh_nama, penanda_tangan_nama, penanda_tangan_jabatan) values ('${'a'.repeat(32)}', 'VRF-1234567', 'surat_pengantar_agama', 'X', current_date, 'x', 'x', 'x', 'x', 'x')`);
ok(!r.ok, 'tulis langsung ke dokumen_terbit ditolak (hanya lewat fungsi)');
r = await sebagai(pembina, `update public.dokumen_terbit set dicabut_pada = null`);
ok(!r.ok || (await q('select count(*)::int n from public.dokumen_terbit where dicabut_pada is not null'))[0].n === 1, 'ubah langsung dokumen_terbit tidak berpengaruh');

console.log('\n--- Server: format nomor surat (pengaturan) ---');
ok(cocok(await K.dewan.a.simpanPengaturan('surat.format_nomor', '{no4}/SP/{tahun}'), /Hanya Pembina atau Admin/), 'Dewan Ambalan tidak dapat mengubah format nomor surat');
ok(cocok(await K.pembina.a.simpanPengaturan('surat.format_nomor', '{no3}/{tingkat}/{tahun}'), /Kode \{tingkat\} tidak dikenal/), '{tingkat} tidak dikenal untuk surat');
ok(cocok(await K.pembina.a.simpanPengaturan('surat.format_nomor', 'SP/{tahun}'), /nomor urut/), 'format tanpa nomor urut ditolak');
ok(cocok(await K.pembina.a.simpanPengaturan('surat.format_nomor', '{no}/SP'), /\{tahun\}/), 'format tanpa tahun ditolak');
ok((await K.pembina.a.simpanPengaturan('surat.format_nomor', '{no4}/SP-AGAMA/{romawi}/{tahun}')).ok, 'Pembina menyimpan format nomor surat');
ok((await K.pembina.a.simpanPengaturan('sidang.format_nomor', '{no3}/DK/{tingkat}/{tahun}')).ok, 'format nomor sidang masih menerima {tingkat}');
r = await K.pembina.a.terbitkanSuratAgama({ pesertaId: made, butir: ['BAN-01-HIN-2'], guruId: guruHindu, tanggal: hariIni, penerbit: 'Gugus Depan SMAN 1 Bukateja', penandaNama: 'Diana', penandaJabatan: 'Pembina Gudep' });
const romawi = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][Number(hariIni.slice(5, 7)) - 1];
ok(r.ok && r.data.nomor === `0004/SP-AGAMA/${romawi}/${tahun}`, 'surat berikutnya memakai format baru: ' + (r.data?.nomor ?? r.pesan));

console.log('\n--- Klien: logika murni ---');
U = await users();
const dokumen = (await K.pembina.a.muatDokumen()).data;
const rinaU = U.find((u) => u.id === rina), madeU = U.find((u) => u.id === made);
ok(suratAgamaAktif(dokumen, rina, 'BAN-01-KAT-1') && !suratAgamaAktif(dokumen, rina, 'BAN-01-KAT-2') && suratAgamaAktif(dokumen, made, 'BAN-01-HIN-1') && !suratAgamaAktif(dokumen, ahmad, 'BAN-01-KAT-1'), 'suratAgamaAktif: hanya untuk Penegak dan butir pada surat yang belum dicabut');
ok(!suratAgamaAktif(dokumen.map((d) => (d.nomor.startsWith('001') ? d : { ...d, dicabutPada: '2026-01-01' })), rina, 'BAN-01-KAT-1'), 'suratAgamaAktif: surat yang dicabut tidak dihitung');
ok(suratAktifPeserta(dokumen, rina).length === 1 && suratAktifPeserta(dokumen, rina)[0].nomor === `003/SP/${tahun}`, 'suratAktifPeserta: terbaru lebih dulu, tanpa yang dicabut');
{
  const progress = (await K.admin.a.muatProgress()).data;
  const bisa = unitBisaDisurati(progress, dokumen, rinaU).map((p) => p.id);
  ok(!bisa.includes('BAN-01-KAT-1') && bisa.includes('BAN-01-KAT-2'), 'unitBisaDisurati: butir yang sudah disurati tidak muncul lagi: ' + bisa.join());
}
ok(periksaFormatSurat(FORMAT_SURAT_BAWAAN) === '' && periksaFormatSurat('{no3}/{tingkat}/{tahun}') !== '' && periksaFormatSurat('SP/{tahun}') !== '', 'periksaFormatSurat');
ok(contohNomorSurat('{no4}/SP-AGAMA/{romawi}/{tahun}', 7, '2026-08-15') === '0007/SP-AGAMA/VIII/2026', 'contohNomorSurat');
ok(nomorUrutBerikutnya(dokumen, tahun) === 5 && nomorUrutBerikutnya([], 2030) === 1, 'nomorUrutBerikutnya dari surat yang sudah terbit');
ok(urlVerifikasi(s4.token, 'https://x.id/').endsWith(`/?v=${s4.token}`) && alamatDasar(), 'alamat QR memakai token');

console.log('\n--- Kesetaraan server dan klien: penguji_sah dengan dokumen, semua Penegak x semua butir ---');
{
  U = await users();
  const baris = (await q(`select rombel, penguji_id as "pengujiId" from public.penugasan_rombel where tahun_ajaran = sigarda.tahun_ajaran_kini()`)).map((x) => ({ ...x }));
  const dok = (await K.pembina.a.muatDokumen()).data;
  let sama = true, n = 0;
  for (const p of U.filter((u) => u.role === 'peserta')) {
    for (const tingkat of ['Bantara', 'Laksana']) {
      for (const poin of daftarPoin(tingkat, p.agama)) {
        const s = await q('select o_penguji::text id, o_rombel from sigarda.penguji_sah($1, $2)', [p.id, poin.id]);
        const c = pengujiSah({ users: U, penugasan: baris, peserta: p, poin, dokumen: dok });
        n++;
        if (s.map((x) => x.id).sort().join() !== c.penguji.map((x) => x.id).sort().join() || (s.length > 0 && s[0].o_rombel !== c.dariRombel)) { sama = false; console.log('   beda:', p.nama, poin.id); }
        for (const u of U.filter((x) => x.role === 'penguji')) {
          const sv = (await q('select sigarda.penguji_peran_ok($1, $2, $3) v', [p.id, u.id, poin.id]))[0].v;
          if (sv !== pengujiPeranOk(U, p, u, poin, dok)) { sama = false; console.log('   beda peran_ok:', p.nama, poin.id, u.nama); }
        }
      }
    }
  }
  ok(sama, `${n} kombinasi Penegak x butir sama di server dan klien (dengan surat berlaku dan dicabut)`);
  const pemb = U.find((u) => u.id === pembina);
  ok(bolehMenilaiPoin(pemb, cariPoin('BAN-01-KAT-1'), { users: U, peserta: rinaU, dokumen: dok }) && !bolehMenilaiPoin(pemb, cariPoin('BAN-01-KAT-2'), { users: U, peserta: rinaU, dokumen: dok }) && !bolehMenilaiPoin(pemb, cariPoin('BAN-01-KAT-1'), { users: U, peserta: rinaU, dokumen: [] }), 'bolehMenilaiPoin: butir pada surat boleh, butir lain dan tanpa dokumen tidak');
  // antrian: pengajuan Rina ke antrian rombel untuk butir pada surat tampil bagi Pembina hanya bila dokumen diberikan
  await q(`insert into public.sku_progress (peserta_id, sku_id, status, jadwal) values ($1, 'BAN-01-KAT-1', 'diajukan', current_date) on conflict (peserta_id, sku_id) do update set status = 'diajukan', penguji_id = null`, [rina]);
  const prog = (await K.admin.a.muatProgress()).data;
  const ada = (arr) => arr.some((x) => x.peserta.id === rina && x.poin.id === 'BAN-01-KAT-1');
  ok(ada(antrianPengujian(prog, U, pembina, baris, dok)) && !ada(antrianPengujian(prog, U, pembina, baris, [])) && !ada(antrianPengujian(prog, U, dewan, baris, dok)), 'antrian bersama butir agama: tampil bagi Pembina hanya bila ada surat berlaku; tidak bagi Dewan');
}

console.log(`\nRINGKASAN DOKUMEN: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
