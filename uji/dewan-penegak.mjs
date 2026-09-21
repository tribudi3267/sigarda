// Fase 6b: Dewan Ambalan sebagai ATRIBUT akun Penegak, penugasan khusus per Penegak, aturan penguji berdasar penugasan, Excel Kepengurusan, pencabutan
// jabatan otomatis, dan arsip akun Dewan lama. Server (PGlite + Edge Function tiruan lewat api) dan logika klien murni.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { adalahPembina, bisaMenguji, ditugaskanUntuk, penegakDewan, pengujiPeranOk, pengujiSah, tahunAjaranKini } from '../src/lib/rombelLogic.js';
import { bolehResetPin } from '../src/lib/pinLogic.js';
import { bacaExcelKepengurusan, buatBerkasKepengurusan } from '../src/lib/kepengurusanExcel.js';
import { cariPoin } from '../src/lib/skuLogic.js';

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
const N = {}; for (const nis of ['10231', '10232', '10118', '10119', '10007', '10008', '10233', '10234']) N[nis] = await masuk(nis, PIN_DEMO.penegak);
const cocok = (r, re) => !r.ok && re.test(r.pesan ?? '');
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const hariIni = (await q('select sigarda.hari_ini()::text d'))[0].d;
const ta = tahunAjaranKini();
const pembinaId = K.pembina.id, dewanId = K.dewan.id;
const [ahmad, siti, dimas, rina, bagas, nadia, rizky, kevin] = ['10231', '10232', '10118', '10119', '10007', '10008', '10233', '10234'].map((n) => N[n].id);
const jabatan = async (nis) => (await q('select jabatan_dewan j from public.profiles where username = $1', [nis]))[0]?.j ?? null;
const progress = async (pid, sku) => (await q('select status, penguji_id from public.sku_progress where peserta_id = $1 and sku_id = $2', [pid, sku]))[0];
const bersih = (pid, sku) => q('delete from public.sku_progress where peserta_id = $1 and sku_id = $2', [pid, sku]);
const catat = (who, o) => who.a.catatHasil({ pin: PIN_DEMO.penegak, tanggalUji: hariIni, nilai: 'Baik', catatan: '', ...o });
const pengguna = async () => (await K.admin.a.muatProfil()).data;

console.log('--- Sebelum jabatan: Penegak biasa ---');
{
  const prog = (await N['10008'].a.muatProgress()).data;
  ok(Object.keys(prog).length === 1 && prog[nadia], 'Penegak tanpa jabatan hanya membaca progresnya sendiri (RLS)');
  ok(cocok(await catat(N['10008'], { pesertaId: ahmad, skuId: 'BAN-12', hasil: 'proses' }), /Hanya Pembina atau Dewan Ambalan/), 'Penegak tanpa jabatan tidak dapat mencatat hasil uji');
  ok(cocok(await N['10008'].a.aturPenugasan(ta, pembinaId, ['X-05'], true), /Hanya Pembina dan Admin/), 'Penegak tidak dapat mengatur penugasan');
}

console.log('\n--- Jabatan memberi hak Dewan pada akun Penegak ---');
let r = await K.pembina.a.aturJabatanDewan([{ username: '10008', jabatan: 'Sekretaris' }]);
ok(r.ok && (await jabatan('10008')) === 'Sekretaris', 'Pembina memberi jabatan Sekretaris kepada Nadia (Penegak)');
{
  const prog = (await N['10008'].a.muatProgress()).data;
  ok(Object.keys(prog).length > 5, 'Penegak berjabatan membaca progres banyak Penegak (hak pengurus): ' + Object.keys(prog).length);
  const dariAhmad = (await N['10231'].a.muatProfil()).data;
  ok(dariAhmad.some((u) => u.id === nadia && u.jabatanDewan === 'Sekretaris') && !dariAhmad.some((u) => u.id === bagas), 'Penegak lain melihat profil Nadia (nama sebagai penguji) tetapi bukan Penegak lain');
  ok(cocok(await N['10008'].a.aturPenugasan(ta, pembinaId, ['X-05'], true), /Hanya Pembina dan Admin/), 'Penegak berjabatan Dewan tetap tidak dapat mengatur penugasan');
}
r = await catat(N['10008'], { pesertaId: ahmad, skuId: 'BAN-12', hasil: 'proses' });
ok(r.ok && (await progress(ahmad, 'BAN-12')).penguji_id === nadia, 'Nadia (Dewan) mencatat hasil butir Bantara Ahmad dengan PIN akunnya sendiri');
r = await catat(N['10008'], { pesertaId: nadia, skuId: 'BAN-12', hasil: 'proses' });
ok(cocok(r, /tidak dapat menilai diri sendiri/), 'Penegak berjabatan tidak dapat menilai dirinya sendiri');
r = await catat(N['10008'], { pesertaId: ahmad, skuId: 'BAN-01-ISL-1', hasil: 'proses' });
ok(cocok(r, /Butir agama hanya dapat dinilai oleh Pembina/), 'butir agama tetap hanya Pembina: ' + r.pesan);
await bersih(ahmad, 'BAN-12');
r = await sebagai(nadia, `select public.sg_pf_catat_penguji($1, 'PF-01', 'Catatan Nadia')`, [ahmad]);
ok(r.ok, 'Penegak berjabatan memberi catatan penguji pada portofolio Penegak lain');
r = await sebagai(nadia, `select public.sg_pf_catat_penguji($1, 'PF-01', 'Catatan diri')`, [nadia]);
ok(!r.ok && /portofolio sendiri/.test(r.pesan), 'tidak dapat memberi catatan penguji pada portofolio sendiri');

console.log('\n--- Butir Laksana: hanya bila ditugaskan ---');
await q(`delete from public.sku_progress where peserta_id = $1 and sku_id = 'LAK-06'`, [dimas]);
r = await catat(N['10008'], { pesertaId: dimas, skuId: 'LAK-06', hasil: 'proses' });
ok(cocok(r, /Butir Laksana hanya dapat dinilai oleh Pembina atau penguji yang ditugaskan/), 'Nadia belum ditugaskan untuk rombel Dimas (XI-01): butir Laksana ditolak');
r = await K.pembina.a.aturPenugasan(ta, nadia, ['XI-01'], true);
ok(r.ok && r.data === 1, 'Pembina menugaskan Nadia (Penegak berjabatan) pada rombel XI-01');
r = await catat(N['10008'], { pesertaId: dimas, skuId: 'LAK-06', hasil: 'proses' });
ok(r.ok && (await progress(dimas, 'LAK-06')).penguji_id === nadia, 'sesudah ditugaskan, Nadia menguji butir Laksana Dimas');
await bersih(dimas, 'LAK-06');
// penugasan khusus Penegak menggantikan penugasan rombel
r = await K.pembina.a.aturPenugasanPeserta(ta, dimas, [pembinaId], '');
ok(cocok(r, /Isi alasan/), 'penugasan khusus wajib beralasan');
r = await K.pembina.a.aturPenugasanPeserta(ta, dimas, [pembinaId], 'Konflik kepentingan');
ok(r.ok && r.data === 1, 'Pembina menetapkan penugasan khusus Dimas: hanya Pembina');
r = await catat(N['10008'], { pesertaId: dimas, skuId: 'LAK-06', hasil: 'proses' });
ok(cocok(r, /Butir Laksana/), 'penugasan khusus menggantikan penugasan rombel: Nadia tidak lagi sah untuk Dimas');
r = await sebagai(dimas, `select public.sg_penguji_pilihan('LAK-06') d`);
ok(r.ok && r.rows[0].d.sumber === 'rombel' && r.rows[0].d.penguji.length === 1 && r.rows[0].d.penguji[0].id === pembinaId, 'daftar penguji Dimas = penugasan khusus (hanya Pembina)');
r = await sebagai(dimas, `select public.sg_penguji_pilihan('BAN-12') d`);
ok(r.ok && r.rows[0].d.penguji.length === 1 && r.rows[0].d.penguji[0].id === pembinaId, 'butir Bantara juga mengikuti penugasan khusus');
{
  const lg = (await K.pembina.a.muatLogPenugasan(ta)).data.filter((x) => x.pesertaId === dimas);
  ok(lg.length === 1 && lg[0].tindakan === 'tambah' && lg[0].pesertaNama === 'Dimas Prasetyo' && lg[0].catatan === 'Konflik kepentingan' && lg[0].rombel === 'XI-01', 'riwayat penugasan memuat Penegak, penguji, alasan, dan rombel');
  const kh = (await K.pembina.a.muatPenugasanPeserta(ta)).data;
  ok(kh.length === 1 && kh[0].pesertaId === dimas && kh[0].pengujiId === pembinaId, 'penugasan khusus terbaca pengurus');
  ok(cocok(await N['10231'].a.muatPenugasanPeserta(ta), /.*/) || (await N['10231'].a.muatPenugasanPeserta(ta)).data.length === 0, 'Penegak biasa tidak membaca penugasan khusus (RLS)');
}
r = await K.pembina.a.aturPenugasanPeserta(ta, dimas, [dimas], 'x');
ok(cocok(r, /pengujinya sendiri/), 'Penegak tidak dapat menjadi pengujinya sendiri');
r = await K.pembina.a.aturPenugasanPeserta(ta, dimas, [ahmad], 'x');
ok(cocok(r, /tidak ditemukan atau tidak aktif/), 'penguji khusus harus Pembina atau Penegak berjabatan');
r = await K.pembina.a.aturPenugasanPeserta(ta, dimas, Array.from({ length: 11 }, (_, i) => `00000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`), 'x');
ok(cocok(r, /Maksimal 10/), 'maksimal 10 penguji per Penegak');
r = await K.dewan.a.aturPenugasanPeserta(ta, dimas, [pembinaId], 'x');
ok(cocok(r, /Hanya Pembina dan Admin/), 'Dewan (akun lama) tidak dapat mengatur penugasan khusus');
r = await K.admin.a.aturPenugasanPeserta(ta, dimas, [pembinaId, nadia], 'Ditambah Nadia');
ok(r.ok && r.data === 1, 'Admin menambah Nadia pada penugasan khusus (satu perubahan)');
r = await K.pembina.a.aturPenugasanPeserta(ta, dimas, [], 'Tidak diperlukan lagi');
ok(r.ok && r.data === 2 && (await q('select count(*)::int n from public.penugasan_peserta')).at(0).n === 0, 'daftar kosong menghapus pengecualian (kembali ke penugasan rombel)');
r = await K.pembina.a.aturPenugasanPeserta(ta, dimas, [], 'lagi');
ok(r.ok && r.data === 0, 'menghapus yang sudah tidak ada: 0 perubahan (tanpa alasan pun tidak apa-apa)');
// butir agama: penugasan khusus yang tidak sah untuk butir itu jatuh ke aturan berikutnya
await K.pembina.a.aturPenugasanPeserta(ta, rina, [nadia], 'Uji khusus');
r = await sebagai(rina, `select public.sg_penguji_pilihan('BAN-01-KAT-1') d`);
ok(r.ok && r.rows[0].d.sumber === 'semua' && !r.rows[0].d.penguji.some((p) => p.id === nadia), 'butir agama: Penegak berjabatan tidak sah walau ditugaskan khusus (hanya Pembina seagama)');
r = await sebagai(rina, `select public.sg_penguji_pilihan('BAN-05') d`);
ok(r.ok && r.rows[0].d.sumber === 'rombel' && r.rows[0].d.penguji.length === 1 && r.rows[0].d.penguji[0].id === nadia
  && r.rows[0].d.penguji[0].jabatan === 'Dewan Ambalan' && r.rows[0].d.penguji[0].jabatan_dewan === 'Sekretaris', 'daftar penguji memuat Penegak berjabatan sebagai "Dewan Ambalan" beserta jabatannya');
await K.pembina.a.aturPenugasanPeserta(ta, rina, [], 'selesai');

console.log('\n--- Antrian dan notifikasi memuat Penegak berjabatan ---');
await K.pembina.a.aturPenugasan(ta, nadia, ['X-01'], true);
await bersih(ahmad, 'BAN-05');
await q('delete from public.notifikasi');
r = await N['10231'].a.ajukan({ skuId: 'BAN-05', jadwal: hariIni, pengujiId: null, catatan: '' });
ok(r.ok, 'Ahmad mengajukan ke antrian rombel X-01');
ok((await q(`select count(*)::int n from public.notifikasi where penerima_id = $1 and jenis = 'ajukan'`, [nadia]))[0].n === 1, 'Nadia (bertugas di X-01) diberi tahu tentang pengajuan');
r = await N['10231'].a.pengujiPilihan('BAN-05');
ok(r.ok && r.data.penguji.some((p) => p.id === nadia), 'Ahmad melihat Nadia pada daftar penguji X-01');
await bersih(ahmad, 'BAN-05');
r = await N['10008'].a.ajukan({ skuId: 'LAK-10', jadwal: hariIni, pengujiId: nadia, catatan: '' });
ok(!r.ok, 'Nadia tidak dapat memilih dirinya sendiri sebagai penguji');

console.log('\n--- Reset PIN oleh Penegak berjabatan ---');
r = await N['10008'].a.resetPin(ahmad);
ok(r.ok && /^\d{6}$/.test(r.pin ?? r.data?.pin ?? ''), 'Penegak berjabatan Dewan dapat mereset PIN Penegak lain');
ok(cocok(await N['10008'].a.resetPin(pembinaId), /tidak berwenang/), 'tetapi tidak Pembina');
ok(cocok(await N['10232'].a.resetPin(ahmad), /tidak berwenang/), 'Penegak tanpa jabatan tidak dapat mereset PIN');
await q('update public.profiles set wajib_ganti_pin = false');
{
  const pengguna1 = await pengguna();
  const nadiaDb = pengguna1.find((u) => u.id === nadia), pembinaDb = pengguna1.find((u) => u.id === pembinaId), ahmadDb = pengguna1.find((u) => u.id === ahmad);
  ok(bolehResetPin({ ...nadiaDb, role: 'peserta' }, ahmadDb) && !bolehResetPin(nadiaDb, pembinaDb) && !bolehResetPin(ahmadDb, ahmadDb), 'pinLogic klien sama dengan Edge Function');
}

console.log('\n--- Jabatan dicabut otomatis (nonaktif) dan penugasannya ikut hilang ---');
await K.pembina.a.aturPenugasanPeserta(ta, ahmad, [nadia, pembinaId], 'Uji khusus Ahmad');
await q(`insert into public.sku_progress (peserta_id, sku_id, status, jadwal, penguji_id) values ($1, 'BAN-14', 'diajukan', current_date, $2), ($1, 'BAN-15', 'proses', current_date, $2)`, [rizky, nadia]);
r = await K.admin.a.aturStatusAnggota(nadia, 'nonaktif', null, 'Tidak melanjutkan');
ok(r.ok && (await jabatan('10008')) === null, 'Penegak berjabatan dinonaktifkan: jabatan dicabut otomatis');
ok((await q('select count(*)::int n from public.penugasan_rombel where penguji_id = $1', [nadia]))[0].n === 0 && (await q('select count(*)::int n from public.penugasan_peserta where penguji_id = $1', [nadia]))[0].n === 0, 'penugasan rombel dan penugasan khusus Nadia ikut dihapus');
ok((await progress(rizky, 'BAN-14')).penguji_id === null && (await progress(rizky, 'BAN-14')).status === 'diajukan', 'pengajuan yang menunggu Nadia kembali ke antrian rombel');
ok((await progress(rizky, 'BAN-15')).penguji_id === nadia, 'pengujian yang sedang berjalan dibiarkan (Pembina dapat mengalihkan)');
{
  const kl = await q(`select tindakan, jabatan_lama, alasan from public.kepengurusan_log where peserta_id = $1 order by id desc limit 1`, [nadia]);
  ok(kl[0].tindakan === 'cabut' && kl[0].jabatan_lama === 'Sekretaris' && /tidak melanjutkan/.test(kl[0].alasan), 'kepengurusan_log mencatat pencabutan dengan alasan');
  const pl = await q(`select tindakan, catatan from public.penugasan_log where penguji_id = $1 order by id desc limit 1`, [nadia]);
  ok(pl[0].tindakan === 'hapus' && pl[0].catatan === 'Jabatan Dewan berakhir', 'penugasan_log mencatat penghapusan penugasan');
}
ok(cocok(await catat(N['10008'], { pesertaId: siti, skuId: 'BAN-12', hasil: 'proses' }), /(Hanya Pembina atau Dewan Ambalan|berstatus nonaktif)/), 'Penegak nonaktif tidak lagi dapat menguji');
r = await K.admin.a.aturStatusAnggota(nadia, 'aktif', 'XII-01', 'Aktif kembali');
ok(r.ok && (await jabatan('10008')) === null, 'diaktifkan kembali: jabatan tidak otomatis kembali');
await q(`delete from public.sku_progress where peserta_id = $1 and sku_id in ('BAN-14', 'BAN-15')`, [rizky]);

console.log('\n--- Kepengurusan lewat berkas (sg_kepengurusan_terapkan) ---');
const bantaraSelesai = (await q(`select sigarda.tingkat_selesai($1, 'Bantara') v`, [ahmad]))[0].v;
ok(bantaraSelesai === false, 'prasyarat: Ahmad belum menyelesaikan Bantara');
const berkas = [{ username: '10008', jabatan: 'Pradana' }, { username: '10119', jabatan: 'pradani' }, { username: '10007', jabatan: 'Sekretaris' }, { username: '10231', jabatan: 'Bendahara' }];
r = await K.pembina.a.terapkanKepengurusan(berkas, true, false);
{
  const d = r.data;
  ok(r.ok && d.galat === 0 && d.ringkasan.beri === 4 && d.ringkasan.cabut === 1 && d.baris.length === 5, 'pratinjau: 4 diberi jabatan, 1 dicabut (akun Dewan lama yang menjabat Pradana): ' + JSON.stringify(d.ringkasan));
  ok(d.baris.find((b) => b.username === 'dewan')?.hasil === 'cabut' && d.baris.find((b) => b.username === 'dewan').pesan.includes('Akun Dewan lama.'), 'baris cabut menandai akun Dewan lama');
  ok(d.baris.find((b) => b.username === '10231').pesan.some((p) => /Belum menyelesaikan seluruh butir Bantara/.test(p)) && d.baris.find((b) => b.username === '10231').hasil === 'beri', 'peringatan (bukan galat) untuk Penegak yang belum Bantara');
  ok(d.baris.find((b) => b.username === '10119').jabatan === 'Pradani', 'jabatan Pradana/Pradani dibakukan');
  ok((await jabatan('dewan')) === 'Pradana' && (await jabatan('10008')) === null, 'pratinjau tidak mengubah apa pun');
}
for (const [nama, kk] of [['Dewan Ambalan (akun lama)', K.dewan], ['Penegak', N['10232']]]) {
  ok(cocok(await kk.a.terapkanKepengurusan(berkas, true, true), /Hanya Pembina dan Admin/), `${nama} tidak dapat mengatur kepengurusan`);
}
const salah = [{ username: 'tidak.ada', jabatan: 'Ketua' }, { username: '10008', jabatan: 'Pradana' }, { username: '10008', jabatan: 'Sekretaris' }, { username: '10119', jabatan: 'Pradana' }, { username: '10007', jabatan: '' }, { username: '10232', jabatan: 'A' }];
await q(`update public.profiles set status = 'nonaktif' where username = '10234'`);
r = await K.pembina.a.terapkanKepengurusan([...salah, { username: '10234', jabatan: 'Bendahara' }], true, false);
{
  const galat = r.data.baris.filter((b) => b.hasil === 'galat').map((b) => b.pesan.join(' '));
  ok(r.ok && r.data.galat === 6 && galat.some((g) => /tidak ditemukan/.test(g)) && galat.some((g) => /lebih dari sekali/.test(g)) && galat.some((g) => /hanya boleh satu orang/.test(g)) && galat.some((g) => /kosong/.test(g)) && galat.some((g) => /2 sampai 60/.test(g)) && galat.some((g) => /berstatus nonaktif/.test(g)),
    'pratinjau menandai galat: tidak ditemukan, ganda, Pradana ganda, jabatan kosong, terlalu pendek, nonaktif: ' + r.data.galat);
}
await q(`update public.profiles set status = 'aktif' where username = '10234'`);
r = await K.pembina.a.terapkanKepengurusan(salah, true, true);
ok(cocok(r, /baris bermasalah, jadi tidak ada yang diubah/) && (await jabatan('dewan')) === 'Pradana' && (await jabatan('10008')) === null, 'menerapkan berkas bermasalah: semua atau tidak sama sekali');
r = await K.pembina.a.terapkanKepengurusan(berkas, true, true);
ok(r.ok && (await jabatan('10008')) === 'Pradana' && (await jabatan('10119')) === 'Pradani' && (await jabatan('10007')) === 'Sekretaris' && (await jabatan('10231')) === 'Bendahara' && (await jabatan('dewan')) === null,
  'berkas diterapkan: jabatan diberikan dan jabatan akun Dewan lama dicabut');
{
  const kl = await q(`select tindakan, alasan from public.kepengurusan_log where alasan like 'Musyawarah%' or alasan = 'Kepengurusan diganti' order by id`);
  ok(kl.filter((x) => x.tindakan === 'beri').length === 4 && kl.filter((x) => x.tindakan === 'cabut').length === 1, 'riwayat: 4 pemberian dan 1 pencabutan');
}
r = await K.pembina.a.terapkanKepengurusan(berkas, true, true);
ok(cocok(r, /Tidak ada perubahan/), 'berkas yang sama diterapkan lagi: tidak ada perubahan');
// pertukaran Pradana dan Pradani (indeks unik tidak boleh bentrok)
r = await K.admin.a.terapkanKepengurusan([{ username: '10008', jabatan: 'Pradani' }, { username: '10119', jabatan: 'Pradana' }, { username: '10007', jabatan: 'Sekretaris' }, { username: '10231', jabatan: 'Bendahara' }], true, true);
ok(r.ok && (await jabatan('10008')) === 'Pradani' && (await jabatan('10119')) === 'Pradana', 'Admin menukar Pradana dan Pradani dalam satu berkas');
// tanpa "ganti seluruhnya"
r = await K.pembina.a.terapkanKepengurusan([{ username: '10232', jabatan: 'Wakil Pradana' }], false, true);
ok(r.ok && (await jabatan('10232')) === 'Wakil Pradana' && (await jabatan('10008')) === 'Pradani' && (await jabatan('10007')) === 'Sekretaris', 'tanpa "ganti seluruh kepengurusan": yang tidak ada di berkas tidak dicabut');
r = await K.pembina.a.terapkanKepengurusan([{ username: '10007', jabatan: 'Pradana' }], false, true);
ok(r.ok && (await jabatan('10007')) === 'Pradana' && (await jabatan('10119')) === null && (await jabatan('10008')) === 'Pradani', 'Pradana berpindah tangan: pemegang lama dicabut walau bukan "ganti seluruhnya"');
r = await K.pembina.a.terapkanKepengurusan([{ username: '10007', jabatan: 'Pradana' }, { username: '10008', jabatan: 'Pradani' }], true, true);
ok(r.ok && (await jabatan('10232')) === null && (await jabatan('10231')) === null && (await jabatan('10007')) === 'Pradana', '"ganti seluruh kepengurusan": yang tidak ada di berkas dicabut (Wakil Pradana dan Bendahara)');
ok(cocok(await K.pembina.a.terapkanKepengurusan('bukan larik', true, false), /tidak valid/) && cocok(await K.pembina.a.terapkanKepengurusan(Array.from({ length: 201 }, () => ({ username: '10007', jabatan: 'x' })), true, false), /Maksimal 200/), 'data tidak valid dan batas 200 baris');
r = await K.pembina.a.muatLogKepengurusan();
ok(r.ok && r.data.length >= 10 && r.data[0].id > r.data.at(-1).id && r.data.every((x) => x.pesertaNama && x.tindakan), 'riwayat kepengurusan terbaca (terbaru lebih dulu)');
ok((await N['10232'].a.muatLogKepengurusan()).data?.length === 0, 'Penegak biasa tidak membaca riwayat kepengurusan (RLS)');

console.log('\n--- Arsip akun Dewan lama ---');
await q(`insert into public.sku_progress (peserta_id, sku_id, status, jadwal, penguji_id) values ($1, 'BAN-11', 'diajukan', current_date, $2)`, [rizky, dewanId]);
ok(cocok(await K.pembina.a.arsipkanDewanLama([dewanId]), /Hanya Admin Gudep/), 'Pembina tidak dapat mengarsipkan akun Dewan lama');
ok(cocok(await K.admin.a.arsipkanDewanLama([ahmad]), /Akun Dewan Ambalan lama tidak ditemukan/), 'hanya akun Dewan lama yang dapat diarsipkan');
r = await K.admin.a.arsipkanDewanLama([dewanId]);
ok(r.ok && r.data === 1 && (await q('select status from public.profiles where id = $1', [dewanId]))[0].status === 'nonaktif', 'Admin mengarsipkan akun Dewan lama (status nonaktif)');
ok((await q('select count(*)::int n from public.penugasan_rombel where penguji_id = $1', [dewanId]))[0].n === 0 && (await progress(rizky, 'BAN-11')).penguji_id === null, 'penugasan akun lama dihapus dan pengajuan yang menunggunya kembali ke antrian');
ok(cocok(await catat(K.dewan, { pin: PIN_DEMO.dewan, pesertaId: siti, skuId: 'BAN-12', hasil: 'proses' }), /Hanya Pembina atau Dewan Ambalan/), 'akun Dewan lama yang diarsipkan tidak lagi dapat mencatat hasil');
ok(Object.keys((await K.dewan.a.muatProgress()).data).length === 0, 'akun Dewan lama yang diarsipkan tidak lagi membaca data Penegak (bukan pengurus)');
ok(cocok(await K.admin.a.aturPenugasan(ta, dewanId, ['X-05'], true), /Penguji tidak ditemukan/), 'akun yang diarsipkan tidak dapat ditugaskan');
r = await sebagai(siti, `select public.sg_penguji_pilihan('BAN-05') d`);
ok(r.ok && !r.rows[0].d.penguji.some((p) => p.id === dewanId), 'akun yang diarsipkan tidak muncul sebagai penguji');
r = await K.admin.a.arsipkanDewanLama([dewanId], true);
ok(r.ok && r.data === 1 && (await q('select status from public.profiles where id = $1', [dewanId]))[0].status === 'aktif', 'arsip dapat dibatalkan (aktifkan kembali)');
r = await K.admin.a.arsipkanDewanLama([dewanId], true);
ok(r.ok && r.data === 0, 'mengaktifkan yang sudah aktif: tidak ada perubahan');
await q(`delete from public.sku_progress where peserta_id = $1 and sku_id = 'BAN-11'`, [rizky]);

console.log('\n--- Klien: aturan murni ---');
{
  const U = await pengguna();
  const dw = { id: 'd1', role: 'peserta', status: 'aktif', jabatanDewan: 'Sekretaris', nama: 'D', kelas: 'XII-01' };
  const pb = { id: 'p1', role: 'penguji', jabatan: 'Pembina', nama: 'P', agama: 'Islam' };
  const lama = { id: 'l1', role: 'penguji', jabatan: 'Dewan Ambalan', nama: 'L', status: 'aktif' };
  const biasa = { id: 'b1', role: 'peserta', status: 'aktif', nama: 'B', kelas: 'XI-01' };
  ok(penegakDewan(dw) && !penegakDewan(biasa) && !penegakDewan({ ...dw, status: 'nonaktif' }) && !penegakDewan(pb), 'penegakDewan: Penegak aktif berjabatan');
  ok(bisaMenguji(dw) && bisaMenguji(pb) && bisaMenguji(lama) && !bisaMenguji(biasa) && !bisaMenguji({ ...lama, status: 'nonaktif' }) && !bisaMenguji({ ...dw, status: 'alumni' }), 'bisaMenguji: Pembina, Dewan lama aktif, Penegak berjabatan aktif');
  ok(adalahPembina(pb) && !adalahPembina(dw), 'adalahPembina');
  const bantara = cariPoin('BAN-05'), laksana = cariPoin('LAK-06'), agama = cariPoin('BAN-01-ISL-1');
  const target = { id: 't1', role: 'peserta', kelas: 'XI-01', agama: 'Islam', status: 'aktif' };
  const users = [dw, pb, lama, biasa, target];
  ok(pengujiPeranOk(users, target, dw, bantara) && !pengujiPeranOk(users, target, dw, laksana) && !pengujiPeranOk(users, target, dw, agama), 'tanpa penugasan: Dewan hanya butir Bantara non-agama');
  const rombel = [{ rombel: 'XI-01', pengujiId: 'd1' }];
  ok(pengujiPeranOk(users, target, dw, laksana, [], { penugasan: rombel }) && !pengujiPeranOk(users, target, dw, agama, [], { penugasan: rombel }), 'ditugaskan pada rombel: Laksana boleh, butir agama tetap tidak');
  ok(!pengujiPeranOk(users, target, dw, laksana, [], { penugasan: rombel, penugasanPeserta: [{ pesertaId: 't1', pengujiId: 'p1' }] }), 'penugasan khusus Penegak menggantikan penugasan rombel');
  ok(pengujiPeranOk(users, target, dw, laksana, [], { penugasan: [], penugasanPeserta: [{ pesertaId: 't1', pengujiId: 'd1' }] }), 'penugasan khusus memberi hak Laksana');
  ok(!pengujiPeranOk(users, dw, dw, bantara), 'tidak menguji diri sendiri');
  ok(pengujiPeranOk(users, target, pb, laksana) && pengujiPeranOk(users, target, pb, agama), 'Pembina: Laksana dan agama seagama tanpa penugasan');
  ok(ditugaskanUntuk({ penugasan: rombel, peserta: target, pengujiId: 'd1' }) && !ditugaskanUntuk({ penugasan: rombel, peserta: target, pengujiId: 'p1' }) && !ditugaskanUntuk({ penugasan: rombel, peserta: { ...target, kelas: 'X' }, pengujiId: 'd1' }), 'ditugaskanUntuk');
  const sah = pengujiSah({ users, penugasan: rombel, peserta: target, poin: bantara });
  ok(sah.dariRombel && sah.penguji.map((u) => u.id).join() === 'd1', 'pengujiSah: penugasan rombel');
  const sahKhusus = pengujiSah({ users, penugasan: rombel, penugasanPeserta: [{ pesertaId: 't1', pengujiId: 'p1' }], peserta: target, poin: bantara });
  ok(sahKhusus.dariRombel && sahKhusus.penguji.map((u) => u.id).join() === 'p1', 'pengujiSah: penugasan khusus lebih dulu');
  const sahSemua = pengujiSah({ users, penugasan: [], peserta: target, poin: bantara });
  ok(!sahSemua.dariRombel && sahSemua.penguji.map((u) => u.id).sort().join() === 'd1,l1,p1', 'pengujiSah: tanpa penugasan, semua penguji (Penegak berjabatan ikut; Penegak biasa dan diri sendiri tidak)');
  ok(U.find((u) => u.id === rina) != null, 'data pengguna termuat');
}

console.log('\n--- Excel Kepengurusan ---');
{
  const buf = await buatBerkasKepengurusan([{ nis: '10008', nama: 'Nadia Putri', rombel: 'XII-01', jabatan: 'Pradani' }, { nis: '10007', nama: 'Bagas Saputra', rombel: 'XII-01', jabatan: 'Pradana' }]);
  const baris = await bacaExcelKepengurusan(buf);
  ok(baris.length === 2 && baris[0].nis === '10008' && baris[0].jabatan === 'Pradani' && baris[1].nis === '10007' && baris[1].jabatan === 'Pradana', 'berkas kepengurusan dapat ditulis dan dibaca kembali');
  const kosong = await bacaExcelKepengurusan(await (async () => { const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Kepengurusan'); ws.addRow(['NIS', 'Nama', 'Jabatan Dewan Ambalan']); ws.addRow(['10008', 'Nadia', 'Ketua Bidang Kegiatan']); ws.addRow(['', '', '']); return wb.xlsx.writeBuffer(); })());
  ok(kosong.length === 1 && kosong[0].jabatan === 'Ketua Bidang Kegiatan', 'jabatan bebas terbaca; baris kosong dilewati');
  let g = '';
  try { await bacaExcelKepengurusan(await (async () => { const wb = new ExcelJS.Workbook(); wb.addWorksheet('X').addRow(['a', 'b']); return wb.xlsx.writeBuffer(); })()); } catch (e) { g = e.message; }
  ok(/Baris judul tidak ditemukan/.test(g), 'berkas tanpa judul NIS dan Jabatan ditolak dengan pesan yang menuntun');
  let g2 = '';
  try { await bacaExcelKepengurusan(await buatBerkasKepengurusan([])); } catch (e) { g2 = e.message; }
  ok(/Tidak ada data/.test(g2), 'berkas kosong (template) ditolak');
}

console.log(`\nRINGKASAN DEWAN-PENEGAK: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
