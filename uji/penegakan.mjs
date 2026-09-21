// Fase 1b: penegakan penugasan penguji. Server (aturan pilih penguji, antrian bersama, alihkan, "menggantikan", Dewan hanya Bantara,
// agama seagama) dan logika klien murni yang mencerminkannya (pengujiSah, antrianPengujian, bolehMenilaiPoin).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { pengujiPeranOk, pengujiSah, tahunAjaranKini } from '../src/lib/rombelLogic.js';
import { antrianPengujian, bolehMenilaiPoin, cariPoin, daftarPoin, pesanTidakBolehMenilai } from '../src/lib/skuLogic.js';

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
const ta = tahunAjaranKini();
const users = async () => (await K.admin.a.muatProfil()).data;
const penugasanKini = async () => (await q(`select rombel, penguji_id as "pengujiId" from public.penugasan_rombel where tahun_ajaran = $1`, [ta])).map((x) => ({ ...x }));
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const riwayatAkhir = async (pid, sku) => (await q('select teks from public.sku_riwayat where peserta_id = $1 and sku_id = $2 order by id desc limit 1', [pid, sku]))[0]?.teks;
const progress = async (pid, sku) => (await q('select status, penguji_id from public.sku_progress where peserta_id = $1 and sku_id = $2', [pid, sku]))[0];
const bersih = (pid, sku) => q('delete from public.sku_progress where peserta_id = $1 and sku_id = $2', [pid, sku]);
const hariIni = (await q('select sigarda.hari_ini()::text d'))[0].d;

let U = await users();
const pid = (nis) => U.find((u) => u.username === nis).id;
const ahmad = pid('10231'), rina = pid('10119'), maria = pid('10010'), made = pid('10121'), rizky = pid('10233'), kevin = pid('10234');
const pembina = K.pembina.id, dewan = K.dewan.id;

console.log('--- Data contoh ---');
{
  const prog = (await K.admin.a.muatProgress()).data;
  const bersama = Object.entries(prog).flatMap(([pidx, m]) => Object.entries(m).filter(([, e]) => e.status === 'diajukan' && !e.pengujiId).map(([sku]) => `${pidx}|${sku}`));
  ok(bersama.length === 1 && bersama[0].startsWith(rina), 'data contoh memuat satu pengajuan antrian bersama (Rina, butir Laksana)');
  const lakDewan = Object.entries(prog).flatMap(([, m]) => Object.entries(m).filter(([sku, e]) => sku.startsWith('LAK-') && e.pengujiId === dewan && ['diajukan', 'proses'].includes(e.status)));
  ok(lakDewan.length === 0, 'data contoh tidak mengarahkan butir Laksana kepada Dewan Ambalan');
}

console.log('\n--- Tahun ajaran klien sama dengan server ---');
ok((await q('select sigarda.tahun_ajaran_kini() t'))[0].t === ta, `tahunAjaranKini() = ${ta}`);
ok(tahunAjaranKini('2026-07-01') === '2026/2027' && tahunAjaranKini('2026-06-30') === '2025/2026' && tahunAjaranKini('2027-01-15') === '2026/2027', 'batas Juli dan Juni');

console.log('\n--- Kesetaraan server dan klien: penguji_sah untuk semua Penegak x semua butir, pada beberapa keadaan ---');
const bandingkan = async (nama) => {
  U = await users();
  const baris = await penugasanKini();
  let sama = true, n = 0;
  for (const p of U.filter((u) => u.role === 'peserta')) {
    for (const tingkat of ['Bantara', 'Laksana']) {
      for (const poin of daftarPoin(tingkat, p.agama)) {
        const s = (await q('select o_penguji::text id, o_rombel from sigarda.penguji_sah($1, $2)', [p.id, poin.id]));
        const c = pengujiSah({ users: U, penugasan: baris, peserta: p, poin });
        const idS = s.map((x) => x.id).sort().join(), idC = c.penguji.map((x) => x.id).sort().join();
        const rS = s.length > 0 && s[0].o_rombel;
        n++;
        if (idS !== idC || (s.length > 0 && rS !== c.dariRombel)) { sama = false; console.log('   beda:', p.nama, poin.id, idS, idC, rS, c.dariRombel); }
        for (const u of U.filter((x) => x.role === 'penguji')) {
          const sv = (await q('select sigarda.penguji_peran_ok($1, $2, $3) v', [p.id, u.id, poin.id]))[0].v;
          if (sv !== pengujiPeranOk(U, p, u, poin)) { sama = false; console.log('   beda peran_ok:', p.nama, poin.id, u.nama); }
        }
      }
    }
  }
  ok(sama, `${nama}: ${n} kombinasi Penegak x butir sama di server dan klien`);
};
await bandingkan('data contoh (Pembina Islam, penugasan contoh)');
await q(`update public.profiles set agama = null where role = 'penguji'`);
await bandingkan('masa peralihan (tak satu pun Pembina beragama)');
await q(`update public.profiles set agama = 'Katolik' where id = $1`, [pembina]);
await bandingkan('Pembina beragama Katolik');
await q(`update public.profiles set agama = 'Islam' where id = $1`, [pembina]);
await q(`delete from public.penugasan_rombel where tahun_ajaran = $1 and rombel = 'X-01' and penguji_id = $2`, [ta, pembina]);
await q(`insert into public.penugasan_rombel (tahun_ajaran, rombel, penguji_id) values ($1, 'XII-02', $2), ($1, 'X-05', $3)`, [ta, dewan, dewan]);
await bandingkan('penugasan diubah (X-01 hanya Dewan, XII-02 dan X-05 hanya Dewan)');
// kembalikan keadaan contoh
await q(`delete from public.penugasan_rombel where tahun_ajaran = $1 and rombel in ('XII-02', 'X-05')`, [ta]);
await q(`insert into public.penugasan_rombel (tahun_ajaran, rombel, penguji_id) values ($1, 'X-01', $2) on conflict do nothing`, [ta, pembina]);
U = await users();

console.log('\n--- Aturan peran (klien murni) ---');
{
  const bantara = cariPoin('BAN-05'), laksana = cariPoin('LAK-02'), agamaIsl = cariPoin('BAN-01-ISL-1');
  const P_ = { role: 'penguji', jabatan: 'Pembina' }, D_ = { role: 'penguji', jabatan: 'Dewan Ambalan' };
  ok(bolehMenilaiPoin(P_, bantara) && bolehMenilaiPoin(D_, bantara), 'butir Bantara biasa: Pembina dan Dewan boleh');
  ok(bolehMenilaiPoin(P_, laksana) && !bolehMenilaiPoin(D_, laksana), 'butir Laksana: hanya Pembina');
  ok(bolehMenilaiPoin(P_, agamaIsl) && !bolehMenilaiPoin(D_, agamaIsl), 'butir agama: hanya Pembina');
  ok(/Laksana.*Pembina/.test(pesanTidakBolehMenilai(laksana)) && /agama.*Pembina/.test(pesanTidakBolehMenilai(agamaIsl)), 'pesan sesuai butir');
  const pembinaDb = U.find((u) => u.id === pembina), ahmadDb = U.find((u) => u.id === ahmad), rinaDb = U.find((u) => u.id === rina);
  ok(bolehMenilaiPoin(pembinaDb, agamaIsl, { users: U, peserta: ahmadDb }), 'Pembina Islam boleh menilai butir agama Islam Ahmad');
  ok(!bolehMenilaiPoin(pembinaDb, cariPoin('BAN-01-KAT-1'), { users: U, peserta: rinaDb }), 'Pembina Islam tidak boleh menilai butir agama Katolik (Pembina beragama sudah ada)');
  ok(bolehMenilaiPoin(pembinaDb, cariPoin('BAN-01-KAT-1'), { users: U.map((u) => ({ ...u, agama: u.role === 'penguji' ? null : u.agama })), peserta: rinaDb }), 'masa peralihan: Pembina tanpa agama boleh (aturan lama)');
}

console.log('\n--- Server: daftar penguji yang sah (sg_penguji_pilihan) ---');
let r = await K.ahmad.a.pengujiPilihan('BAN-05');
ok(r.ok && r.data.sumber === 'rombel' && r.data.rombel === 'X-01' && !r.data.agamaButir && r.data.penguji.length === 2, 'Ahmad (X-01), butir Bantara biasa: Pembina dan Dewan yang bertugas di X-01');
ok(r.ok && r.data.penguji.every((u) => typeof u.beban === 'number' && u.id && u.nama), 'tiap penguji membawa nama dan beban antrian');
r = await K.ahmad.a.pengujiPilihan('LAK-02');
ok(r.ok && r.data.penguji.length === 1 && r.data.penguji[0].id === pembina, 'butir Laksana: hanya Pembina');
r = await K.ahmad.a.pengujiPilihan('BAN-01-ISL-1');
ok(r.ok && r.data.agamaButir && r.data.penguji.length === 1 && r.data.penguji[0].id === pembina, 'butir agama Islam: hanya Pembina yang beragama Islam');
r = await K.ahmad.a.pengujiPilihan('BAN-01-KAT-1');
ok(cocok(r, /tidak ditemukan/), 'sub-butir agama lain tidak ditemukan untuk Penegak Islam');
r = await sebagai(made, `select public.sg_penguji_pilihan('BAN-01-HIN-1') d`);
ok(r.ok && r.rows[0].d.agama_butir === true && r.rows[0].d.penguji.length === 0, 'Made (Hindu): belum ada Pembina Hindu, daftar kosong');
r = await sebagai(made, `select public.sg_penguji_pilihan('BAN-12') d`);
ok(r.ok && r.rows[0].d.sumber === 'rombel' && r.rows[0].d.rombel === 'XI-02' && r.rows[0].d.penguji.length === 1 && r.rows[0].d.penguji[0].id === dewan, 'Made (XI-02, hanya Dewan bertugas): butir Bantara biasa hanya Dewan');
r = await sebagai(rina, `select public.sg_penguji_pilihan('LAK-03') d`);
ok(r.ok && r.rows[0].d.sumber === 'semua' && r.rows[0].d.penguji.length === 1 && r.rows[0].d.penguji[0].id === pembina, 'Rina, butir Laksana: Dewan yang bertugas tak boleh, jadi semua Pembina (sumber "semua")');
r = await sebagai(maria, `select public.sg_penguji_pilihan('BAN-05') d`);
ok(r.ok && r.rows[0].d.sumber === 'semua' && r.rows[0].d.penguji.length === 2, 'Maria (XII-02, tanpa penguji bertugas): aturan lama, semua penguji');
r = await K.pembina.a.pengujiPilihan('BAN-05', made);
ok(r.ok && r.data.penguji.length === 1 && r.data.penguji[0].id === dewan, 'Pembina dapat menanyakan daftar untuk Penegak tertentu');
ok(cocok(await K.pembina.a.pengujiPilihan('BAN-05'), /Peserta tidak ditemukan/), 'Pembina tanpa menyebut Penegak: ditolak');
ok(cocok(await K.dewan.a.pengujiPilihan('BAN-05', made), /hanya untuk Penegak, Pembina, dan Admin/), 'Dewan Ambalan tidak dapat memakai daftar untuk Penegak lain');
r = await K.admin.a.pengujiPilihan('BAN-05', made);
ok(r.ok && r.data.penguji.length === 1, 'Admin Gudep dapat menanyakan daftar untuk Penegak tertentu');
// beban antrian
await q(`insert into public.sku_progress (peserta_id, sku_id, status, jadwal, penguji_id) values ($1, 'BAN-11', 'diajukan', current_date, $2), ($3, 'BAN-11', 'proses', current_date, $2)`, [rizky, pembina, kevin]);
r = await K.ahmad.a.pengujiPilihan('BAN-05');
ok(r.ok && r.data.penguji[0].id === dewan && r.data.penguji[0].beban === 1 && r.data.penguji[1].id === pembina && r.data.penguji[1].beban >= 3, 'beban dihitung (menunggu dan sedang diuji) dan diurut dari yang teringan: ' + JSON.stringify(r.data.penguji.map((u) => u.beban)));
await q(`delete from public.sku_progress where sku_id = 'BAN-11' and peserta_id in ($1, $2)`, [rizky, kevin]);

console.log('\n--- Server: mengajukan (ketat saat memilih penguji) ---');
await bersih(rina, 'LAK-03'); // pengajuan bersama contoh Rina dibersihkan agar dapat diajukan lagi di bawah
await bersih(ahmad, 'BAN-05'); // pengajuan contoh Ahmad (BAN-05 ke Pembina) dibersihkan agar skenario di bawah dapat mengajukannya lagi
const ajukan = (idPeserta, sku, penguji) => sebagai(idPeserta, `select public.sg_sku_ajukan($1, current_date, $2::uuid, '')`, [sku, penguji]);
await bersih(made, 'BAN-12'); await bersih(made, 'BAN-01-HIN-1');
r = await ajukan(made, 'BAN-12', pembina);
ok(!r.ok && /tidak bertugas pada rombel/.test(r.pesan), 'Made memilih Pembina yang tidak bertugas di XI-02: ditolak - ' + r.pesan);
r = await ajukan(made, 'BAN-12', dewan);
ok(r.ok && (await progress(made, 'BAN-12')).penguji_id === dewan, 'Made memilih Dewan yang bertugas: diterima');
await bersih(made, 'BAN-12');
r = await ajukan(rina, 'LAK-03', dewan);
ok(!r.ok && /Butir Laksana hanya dapat diuji oleh Pembina/.test(r.pesan), 'butir Laksana kepada Dewan: ditolak - ' + r.pesan);
r = await ajukan(rina, 'LAK-03', pembina);
ok(r.ok, 'butir Laksana kepada Pembina: diterima walau Pembina tidak bertugas di XI-02 (tak ada Pembina bertugas, aturan lama)');
await bersih(rina, 'LAK-03');
r = await ajukan(made, 'BAN-01-HIN-1', pembina);
ok(!r.ok && /seagama/.test(r.pesan), 'butir agama Hindu kepada Pembina Islam: ditolak - ' + r.pesan);
r = await ajukan(made, 'BAN-01-HIN-1', null);
ok(!r.ok && /Belum ada penguji/.test(r.pesan), 'butir agama Hindu ke antrian rombel tanpa Pembina Hindu: ditolak - ' + r.pesan);
r = await ajukan(made, 'BAN-12', ahmad);
ok(!r.ok && /Pilih penguji/.test(r.pesan), 'memilih akun yang bukan penguji: ditolak');
r = await K.ahmad.a.ajukan({ skuId: 'BAN-05', jadwal: hariIni, pengujiId: dewan, catatan: '' });
ok(r.ok && (await progress(ahmad, 'BAN-05')).penguji_id === dewan, 'Ahmad mengajukan ke Dewan (bertugas di X-01)');
await bersih(ahmad, 'BAN-05');

console.log('\n--- Server: antrian bersama rombel (penguji kosong) ---');
r = await K.ahmad.a.ajukan({ skuId: 'BAN-05', jadwal: hariIni, pengujiId: null, catatan: 'bersama' });
ok(r.ok, 'pengajuan tanpa penguji tujuan diterima');
{
  const pr = await progress(ahmad, 'BAN-05');
  ok(pr.status === 'diajukan' && pr.penguji_id === null, 'tersimpan: diajukan, penguji kosong');
  ok(/\(antrian rombel\)$/.test(await riwayatAkhir(ahmad, 'BAN-05')), 'riwayat menyebut antrian rombel: ' + (await riwayatAkhir(ahmad, 'BAN-05')));
  U = await users();
  const prog = (await K.admin.a.muatProgress()).data;
  const aPembina = antrianPengujian(prog, U, pembina, await penugasanKini());
  const aDewan = antrianPengujian(prog, U, dewan, await penugasanKini());
  ok(aPembina.some((x) => x.peserta.id === ahmad && x.poin.id === 'BAN-05' && x.bersama) && aDewan.some((x) => x.peserta.id === ahmad && x.poin.id === 'BAN-05' && x.bersama), 'antrian: Pembina dan Dewan (keduanya bertugas di X-01) melihat pengajuan bersama Ahmad');
  const aTanpa = antrianPengujian(prog, U, dewan, null);
  ok(aTanpa.some((x) => x.peserta.id === ahmad), 'tanpa data penugasan (belum termuat): aturan lama, semua antrian bersama tampil');
}
// Antrian bersama lintas rombel: XI-02 (hanya Dewan bertugas): Made Bantara, Rina Laksana
await bersih(made, 'BAN-12');
r = await sebagai(made, `select public.sg_sku_ajukan('BAN-12', current_date, null, '')`);
ok(r.ok, 'Made mengajukan BAN-12 ke antrian rombel');
r = await sebagai(rina, `select public.sg_sku_ajukan('LAK-03', current_date, null, '')`);
ok(r.ok, 'Rina mengajukan LAK-03 ke antrian rombel (Pembina mana pun, aturan lama karena tak ada Pembina bertugas)');
{
  U = await users();
  const prog = (await K.admin.a.muatProgress()).data;
  const baris = await penugasanKini();
  const idAntrian = (arr) => arr.filter((x) => x.peserta.id === rina || x.peserta.id === made).map((x) => `${x.peserta.id === rina ? 'R' : 'M'}:${x.poin.id}`).sort().join();
  ok(idAntrian(antrianPengujian(prog, U, dewan, baris)) === 'M:BAN-12', 'Dewan melihat BAN-12 Made (bertugas di XI-02), tidak melihat butir Laksana Rina');
  ok(idAntrian(antrianPengujian(prog, U, pembina, baris)) === 'R:LAK-03', 'Pembina melihat LAK-03 Rina, tidak melihat BAN-12 Made (XI-02 diurus Dewan)');
  ok(idAntrian(antrianPengujian(prog, U, null, baris)) === 'M:BAN-12,R:LAK-03', 'tampilkan semua penguji: keduanya tampil');
}

console.log('\n--- Server: mencatat hasil (lunak; "menggantikan"; Dewan hanya Bantara) ---');
const catat = (K_, pin, o) => K_.a.catatHasil({ pin, pesertaId: made, skuId: 'BAN-12', tanggalUji: hariIni, nilai: 'Baik', catatan: '', ...o });
r = await catat(K.dewan, PIN_DEMO.dewan, { hasil: 'proses' });
ok(r.ok && (await progress(made, 'BAN-12')).penguji_id === dewan && (await riwayatAkhir(made, 'BAN-12')) === 'Pengujian dimulai', 'Dewan mengambil antrian bersama lewat "Mulai uji": tanpa kata "menggantikan"');
r = await catat(K.dewan, PIN_DEMO.dewan, { hasil: 'proses', pesertaId: rina, skuId: 'LAK-03' });
ok(!r.ok && /Butir Laksana hanya dapat dinilai oleh Pembina/.test(r.pesan), 'Dewan tidak dapat menguji butir Laksana (mulai uji): ' + r.pesan);
r = await catat(K.dewan, PIN_DEMO.dewan, { hasil: 'ulang', pesertaId: rina, skuId: 'LAK-03', catatan: 'x' });
ok(!r.ok && /Butir Laksana/.test(r.pesan), 'Dewan tidak dapat menguji butir Laksana (hasil)');
r = await catat(K.pembina, PIN_DEMO.pembina, { hasil: 'ulang', catatan: 'Perbaiki bagian pertama.' });
ok(r.ok && (await progress(made, 'BAN-12')).penguji_id === pembina && (await riwayatAkhir(made, 'BAN-12')).startsWith('Perlu diulang (menggantikan '), 'Pembina mencatat hasil pengujian yang dipegang Dewan: riwayat "menggantikan": ' + (await riwayatAkhir(made, 'BAN-12')));
{
  const nama = (await q('select nama from public.profiles where id = $1', [dewan]))[0].nama;
  ok((await riwayatAkhir(made, 'BAN-12')) === `Perlu diulang (menggantikan ${nama})`, 'nama penguji yang digantikan tercatat');
}
r = await catat(K.pembina, PIN_DEMO.pembina, { hasil: 'proses', pesertaId: rina, skuId: 'LAK-03' });
ok(r.ok && (await progress(rina, 'LAK-03')).penguji_id === pembina && (await riwayatAkhir(rina, 'LAK-03')) === 'Pengujian dimulai', 'Pembina mengambil LAK-03 dari antrian bersama tanpa "menggantikan"');
r = await catat(K.dewan, PIN_DEMO.dewan, { hasil: 'reset', pesertaId: rina, skuId: 'LAK-03', catatan: 'coba' });
ok(!r.ok && /Butir Laksana/.test(r.pesan), 'Dewan tidak dapat mengembalikan status butir Laksana');
// agama seagama saat mencatat
r = await K.pembina.a.catatHasil({ pin: PIN_DEMO.pembina, pesertaId: made, skuId: 'BAN-01-HIN-1', hasil: 'proses', tanggalUji: hariIni, catatan: '' });
ok(!r.ok && /seagama/.test(r.pesan), 'Pembina Islam tidak dapat menilai butir agama Hindu: ' + r.pesan);
r = await K.pembina.a.catatHasil({ pin: PIN_DEMO.pembina, pesertaId: ahmad, skuId: 'BAN-01-ISL-1', hasil: 'proses', tanggalUji: hariIni, catatan: '' });
ok(r.ok, 'Pembina Islam menilai butir agama Islam Ahmad');
await bersih(ahmad, 'BAN-01-ISL-1');
await q(`update public.profiles set agama = null where role = 'penguji'`);
r = await K.pembina.a.catatHasil({ pin: PIN_DEMO.pembina, pesertaId: made, skuId: 'BAN-01-HIN-1', hasil: 'proses', tanggalUji: hariIni, catatan: '' });
ok(r.ok, 'masa peralihan (tak ada Pembina beragama): Pembina mana pun boleh menilai butir agama (aturan lama)');
await bersih(made, 'BAN-01-HIN-2');
r = await sebagai(made, `select public.sg_sku_ajukan('BAN-01-HIN-2', current_date, $1::uuid, '')`, [pembina]);
ok(r.ok, 'masa peralihan: butir agama dapat diajukan kepada Pembina mana pun');
await q(`update public.profiles set agama = 'Islam' where id = $1`, [pembina]);
await bersih(made, 'BAN-01-HIN-1'); await bersih(made, 'BAN-01-HIN-2'); await bersih(rina, 'LAK-03'); await bersih(made, 'BAN-12');

console.log('\n--- Server: mengalihkan pengajuan (sg_sku_alihkan) ---');
const alih = (K_, o) => K_.a.alihkanPengajuan({ pesertaId: ahmad, skuId: 'BAN-05', alasan: 'Penguji berhalangan hadir', ...o });
// Ahmad: pengajuan bersama (dari bagian sebelumnya) masih ada
ok((await progress(ahmad, 'BAN-05')).penguji_id === null, 'prasyarat: pengajuan Ahmad masih di antrian bersama');
ok(cocok(await alih(K.dewan, { pengujiId: pembina }), /Hanya Pembina atau Admin/), 'Dewan Ambalan tidak dapat mengalihkan');
ok(cocok(await alih(K.ahmad, { pengujiId: pembina }), /Hanya Pembina atau Admin/), 'Penegak tidak dapat mengalihkan');
ok(cocok(await alih(K.pembina, { pengujiId: pembina, alasan: '   ' }), /alasan/i), 'alasan wajib');
ok(cocok(await alih(K.pembina, { pengujiId: pembina, alasan: 'x'.repeat(201) }), /maksimal 200/), 'alasan maksimal 200 karakter');
ok(cocok(await alih(K.pembina, { pengujiId: ahmad }), /tidak dapat menguji/), 'tujuan yang bukan penguji ditolak');
ok(cocok(await alih(K.pembina, { pengujiId: null }), /sama dengan penguji saat ini/), 'dari antrian bersama ke antrian bersama: ditolak (tidak berubah)');
ok(cocok(await K.pembina.a.alihkanPengajuan({ pesertaId: ahmad, skuId: 'BAN-06', pengujiId: dewan, alasan: 'x' }), /Hanya pengajuan yang menunggu/), 'butir yang tidak diajukan tidak dapat dialihkan');
r = await alih(K.pembina, { pengujiId: dewan });
ok(r.ok && (await progress(ahmad, 'BAN-05')).penguji_id === dewan, 'Pembina mengalihkan dari antrian bersama ke Dewan');
ok((await riwayatAkhir(ahmad, 'BAN-05')) === 'Dialihkan dari antrian rombel ke ' + (await q('select nama from public.profiles where id = $1', [dewan]))[0].nama + '. Alasan: Penguji berhalangan hadir', 'riwayat memuat asal, tujuan, dan alasan');
ok((await q('select oleh::text o from public.sku_riwayat where peserta_id = $1 and sku_id = $2 order by id desc limit 1', [ahmad, 'BAN-05']))[0].o === pembina, 'riwayat mencatat pelakunya (Pembina)');
r = await alih(K.admin, { pengujiId: pembina });
ok(r.ok && (await progress(ahmad, 'BAN-05')).penguji_id === pembina, 'Admin Gudep dapat mengalihkan (ke Pembina)');
r = await alih(K.pembina, { pengujiId: null });
ok(r.ok && (await progress(ahmad, 'BAN-05')).penguji_id === null && /ke antrian rombel\./.test((await riwayatAkhir(ahmad, 'BAN-05')).replace(/Alasan.*/, '')), 'dialihkan kembali ke antrian rombel');
// sedang diuji
await K.pembina.a.catatHasil({ pin: PIN_DEMO.pembina, pesertaId: ahmad, skuId: 'BAN-05', hasil: 'proses', tanggalUji: hariIni, catatan: '' });
ok((await progress(ahmad, 'BAN-05')).status === 'proses', 'prasyarat: pengujian Ahmad sedang berjalan pada Pembina');
ok(cocok(await alih(K.pembina, { pengujiId: null }), /harus dialihkan ke penguji tertentu/), 'pengujian yang sedang berjalan tidak dapat dikembalikan ke antrian bersama');
r = await alih(K.pembina, { pengujiId: dewan });
ok(r.ok && (await progress(ahmad, 'BAN-05')).status === 'proses' && (await progress(ahmad, 'BAN-05')).penguji_id === dewan, 'pengujian berjalan dialihkan ke Dewan; status tetap proses');
// Laksana tidak boleh dialihkan ke Dewan
await q(`insert into public.sku_progress (peserta_id, sku_id, status, jadwal) values ($1, 'LAK-03', 'diajukan', current_date)`, [rina]);
ok(cocok(await K.pembina.a.alihkanPengajuan({ pesertaId: rina, skuId: 'LAK-03', pengujiId: dewan, alasan: 'coba' }), /tidak dapat menguji/), 'butir Laksana tidak dapat dialihkan ke Dewan');
ok(cocok(await K.pembina.a.alihkanPengajuan({ pesertaId: maria, skuId: 'BAN-01-KAT-1', pengujiId: pembina, alasan: 'coba' }), /Hanya pengajuan yang menunggu/), 'pengajuan yang tidak ada ditolak');
await bersih(rina, 'LAK-03');
await bersih(ahmad, 'BAN-05');

console.log(`\nRINGKASAN PENEGAKAN: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
