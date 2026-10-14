// Sesi absensi yang disiapkan lebih awal (sampai 60 hari ke depan, tetap hanya Jumat): server (PGlite + data contoh), cermin klien yang DIBANDINGKAN LANGSUNG
// dengan SQL, dan bukti bahwa perhitungan (iuran semester, tangga Tindak Lanjut, rekap) tidak berubah oleh sesi yang belum tiba.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';
import { BATAS_SESI_MENDATANG_HARI, batasSesiMendatang, bolehBuatSesi, rekapAbsensi, ringkasAbsensi, sesiPeriode, tahunAjaranDari, periodeDari } from '../src/lib/absensiLogic.js';
import { sesiRentang } from '../src/lib/laporanLogic.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const masuk = async (nama, pin) => { const k = buatKlienFake(pg); const a = buatApi(k); const r = await a.masuk(nama, pin); return { k, a, id: r.id }; };
const K = { dewan: await masuk('dewan', PIN_DEMO.dewan), pembina: await masuk('pembina', PIN_DEMO.pembina), admin: await masuk('admin', PIN_DEMO.admin), ahmad: await masuk('10231', PIN_DEMO.penegak) };
const rpc = async (k, nama, args) => { const { data, error } = await k.rpc(nama, args); return { data, err: error?.message ?? null }; };
const ahmad = K.ahmad.id;

const hariIni = (await q('select sigarda.hari_ini()::text d'))[0].d;
const tambah = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const jumatSesudah = (iso, n = 1) => { let d = iso; for (let i = 0; i < n; ) { d = tambah(d, 1); if (dow(d) === 5) i += 1; } return d; };
const F1 = jumatSesudah(hariIni, 1), F2 = jumatSesudah(hariIni, 2), F3 = jumatSesudah(hariIni, 3);
const buat = (k, t) => rpc(k.k, 'sg_absen_buat_sesi', { p_tanggal: t });
const adaSesi = async (t) => (await q('select 1 from public.absensi_sesi where tanggal = $1', [t])).length === 1;

console.log('--- Cermin klien: batas 60 hari dibandingkan langsung dengan SQL ---');
{
  ok(BATAS_SESI_MENDATANG_HARI === 60, 'batas klien = 60 hari');
  ok(batasSesiMendatang('2026-10-14') === '2026-12-13', 'batasSesiMendatang: 14 Okt 2026 + 60 hari = 13 Des 2026');
  const ditolakBatas = (e) => /60 hari ke depan/.test(e ?? '');
  let cocok = 0, selisih = [];
  for (let n = -10; n <= 75; n += 1) {
    const t = tambah(hariIni, n);
    if (dow(t) !== 5) { // bukan Jumat: ditolak server dengan alasan lain, klien false
      const r = await buat(K.pembina, t);
      if (r.err && !ditolakBatas(r.err) && bolehBuatSesi(t, hariIni) === false) cocok += 1; else selisih.push(`${t} (bukan Jumat)`);
      continue;
    }
    const r = await buat(K.pembina, t);
    const serverBoleh = !r.err;
    if (!serverBoleh && !ditolakBatas(r.err)) { selisih.push(`${t}: ${r.err}`); continue; }
    if (serverBoleh === bolehBuatSesi(t, hariIni)) cocok += 1; else selisih.push(`${t}: server ${serverBoleh}, klien ${bolehBuatSesi(t, hariIni)}`);
  }
  ok(selisih.length === 0, `klien dan SQL sepakat pada 86 tanggal (-10..+75 hari dari hari ini)${selisih.length ? ': ' + selisih.join('; ') : ''}`);
  await q('delete from public.absensi_sesi where tanggal > $1', [hariIni]); // bersihkan sesi mendatang buatan kisi di atas
}

console.log('\n--- Server: siapa yang boleh menyiapkan sesi mendatang ---');
{
  ok(!(await buat(K.pembina, F1)).err && await adaSesi(F1), `Pembina menyiapkan sesi ${F1}`);
  ok(!(await buat(K.pembina, F1)).err, 'menyiapkan sesi yang sama dua kali tidak galat');
  ok(!(await buat(K.dewan, F2)).err && await adaSesi(F2), `Dewan menyiapkan sesi ${F2}`);
  ok(!(await buat(K.admin, F3)).err && await adaSesi(F3), `Admin menyiapkan sesi ${F3}`);
  ok(/Hanya Dewan Ambalan, Pembina, atau admin/.test((await buat(K.ahmad, jumatSesudah(hariIni, 4))).err ?? ''), 'Penegak biasa tetap tidak boleh');
  const rabuDepan = tambah(F1, -2);
  ok(/hanya dicatat pada hari Jumat/.test((await buat(K.pembina, rabuDepan)).err ?? ''), 'tanggal mendatang yang bukan Jumat tetap ditolak');
  const jauh = jumatSesudah(tambah(hariIni, 60), 1);
  ok(/60 hari ke depan/.test((await buat(K.pembina, jauh)).err ?? '') && !(await adaSesi(jauh)), 'lebih dari 60 hari ke depan ditolak: ' + jauh);
}

console.log('\n--- Server: sesi mendatang belum bisa diisi kehadiran, iuran, dan kas ---');
{
  const isi = /hari latihan atau sesudahnya/;
  ok(isi.test((await rpc(K.pembina.k, 'sg_absen_set', { p_tanggal: F1, p_peserta_id: ahmad, p_status: 'H' })).err ?? ''), 'sg_absen_set ditolak pada sesi mendatang');
  ok(isi.test((await rpc(K.dewan.k, 'sg_absen_set_banyak', { p_tanggal: F1, p_peserta_ids: [ahmad], p_status: 'H', p_hanya_kosong: true })).err ?? ''), 'sg_absen_set_banyak ditolak pada sesi mendatang');
  ok(isi.test((await rpc(K.dewan.k, 'sg_iuran_set', { p_tanggal: F1, p_peserta_id: ahmad, p_jumlah: 1000 })).err ?? ''), 'sg_iuran_set ditolak pada sesi mendatang');
  ok(isi.test((await rpc(K.dewan.k, 'sg_iuran_set_banyak', { p_tanggal: F1, p_peserta_ids: [ahmad], p_jumlah: 1000, p_hanya_kosong: true })).err ?? ''), 'sg_iuran_set_banyak ditolak pada sesi mendatang');
  ok(isi.test((await rpc(K.dewan.k, 'sg_iuran_kas_simpan', { p_tanggal: F1, p_total: 5000, p_catatan: '' })).err ?? ''), 'sg_iuran_kas_simpan ditolak pada sesi mendatang');
  const n = (await q('select (select count(*) from public.absensi_hadir where tanggal > $1)::int h, (select count(*) from public.iuran where tanggal > $1)::int i, (select count(*) from public.iuran_kas where tanggal > $1)::int k', [hariIni]))[0];
  ok(n.h === 0 && n.i === 0 && n.k === 0, 'tidak ada catatan kehadiran/iuran/kas yang masuk pada tanggal mendatang');
  const tLalu = (await q(`select tanggal::text t from public.absensi_sesi where tanggal <= $1 order by tanggal desc limit 1`, [hariIni]))[0].t;
  ok(!(await rpc(K.pembina.k, 'sg_absen_set', { p_tanggal: tLalu, p_peserta_id: ahmad, p_status: 'H' })).err, `pencatatan pada sesi yang sudah tiba (${tLalu}) tetap berjalan`);
}

console.log('\n--- Perhitungan TIDAK berubah oleh sesi yang belum tiba ---');
{
  await q('delete from public.absensi_sesi where tanggal > $1', [hariIni]);
  const [T, T2] = (await q(`select tanggal::text t from public.absensi_sesi where tanggal <= $1 order by tanggal desc limit 2`, [hariIni])).map((r) => r.t);
  await q('delete from public.iuran'); await q('delete from public.iuran_log'); await q('delete from public.iuran_kas');
  await q(`delete from public.absensi_hadir where peserta_id = $1 and tanggal in ($2, $3)`, [ahmad, T, T2]);
  await q(`insert into public.absensi_hadir (tanggal, peserta_id, status) values ($1,$2,'A'), ($3,$2,'A')`, [T, ahmad, T2]);
  // Seorang Penegak lain dengan satu iuran, supaya rekap iuran tidak kosong
  const lain = (await q(`select id from public.profiles where role = 'peserta' and status = 'aktif' and id <> $1 order by username limit 1`, [ahmad]))[0].id;
  await q(`insert into public.iuran (tanggal, peserta_id, jumlah) values ($1,$2,1000)`, [T, lain]);

  const potret = async () => {
    const hitung = async (tgl) => JSON.stringify((await q('select * from sigarda.iuran_hitung($1, $2)', [ahmad, tgl]))[0]);
    return {
      hitungHariIni: await hitung(hariIni),
      hitungDepan: await hitung(F3),                       // tanggal uji di masa depan: tetap hanya menghitung sesi yang sudah tiba
      ringkas: JSON.stringify((await rpc(K.pembina.k, 'sg_iuran_ringkas', { p_peserta_id: ahmad, p_tanggal: F3 })).data),
      eskAbsensi: (await q('select sigarda.eskalasi_mulai_absensi($1)::text m', [ahmad]))[0].m,
      eskIuran: (await q('select sigarda.eskalasi_mulai_iuran($1)::text m', [ahmad]))[0].m,
      eskIuranLain: (await q('select sigarda.eskalasi_mulai_iuran($1)::text m', [lain]))[0].m,
    };
  };
  const sebelum = await potret();
  ok(sebelum.eskAbsensi === T2 || sebelum.eskAbsensi === T, `prasyarat: 2 Alpa berturut-turut pada sesi terbaru memberi kejadian absensi (${sebelum.eskAbsensi})`);
  ok(sebelum.eskIuran !== null, `prasyarat: tanpa iuran pada dua sesi terbaru memberi kejadian iuran (${sebelum.eskIuran})`);

  for (const t of [F1, F2, F3]) await buat(K.pembina, t);
  ok((await q('select count(*)::int c from public.absensi_sesi where tanggal > $1', [hariIni]))[0].c === 3, 'tiga sesi mendatang sudah disiapkan');
  const sesudah = await potret();
  for (const k of Object.keys(sebelum)) ok(sebelum[k] === sesudah[k], `hasil tidak berubah (${k}): ${String(sesudah[k]).slice(0, 80)}`);

  console.log('   - cermin klien: rekap, ringkasan, dan sesi laporan mengabaikan sesi mendatang');
  const ambilSesi = async () => Object.fromEntries((await q('select tanggal::text t, dibuat_oleh from public.absensi_sesi order by tanggal')).map((r) => [r.t, { tanggal: r.t }]));
  const sesiMap = await ambilSesi();
  const hadir = {};
  for (const r of await q('select tanggal::text t, peserta_id, status from public.absensi_hadir')) (hadir[r.t] ??= {})[r.peserta_id] = { status: r.status };
  const absensi = { sesi: sesiMap, hadir };
  const ta = tahunAjaranDari(hariIni), per = periodeDari(hariIni);
  const biasa = sesiPeriode(absensi, ta, per, { sekarang: hariIni });
  const semua = sesiPeriode(absensi, ta, per, { mendatang: true, sekarang: hariIni });
  ok(biasa.every((s) => s.tanggal <= hariIni) && semua.length >= biasa.length, 'sesiPeriode bawaan hanya yang sudah tiba');
  ok([F1, F2, F3].filter((t) => t >= (ta && sesiPeriodeMulai(ta, per)) && t <= sesiPeriodeAkhir(ta, per)).every((t) => semua.some((s) => s.tanggal === t) && !biasa.some((s) => s.tanggal === t)),
    'sesi mendatang di semester ini hanya muncul dengan { mendatang: true }');
  const pesertaUji = { id: ahmad };
  const rekap = rekapAbsensi(absensi, [pesertaUji], biasa);
  ok(ringkasAbsensi(rekap, biasa, 75).pertemuan === biasa.length && biasa.length === sebelumJumlah(absensi, hariIni, ta, per), 'jumlah pertemuan pada ringkasan tidak bertambah oleh sesi mendatang');
  ok(sesiRentang(absensi, '2000-01-01', '2100-12-31', hariIni).every((s) => s.tanggal <= hariIni), 'sesiRentang (laporan tahunan) mengabaikan sesi mendatang');
}

console.log('\n--- Menghapus sesi mendatang ---');
{
  ok(!(await rpc(K.pembina.k, 'sg_absen_hapus_sesi', { p_tanggal: F1 })).err && !(await adaSesi(F1)), 'sesi mendatang dapat dihapus');
  ok(/Tidak diizinkan/.test((await rpc(K.ahmad.k, 'sg_absen_hapus_sesi', { p_tanggal: F2 })).err ?? ''), 'Penegak tidak bisa menghapus sesi');
}

function sesiPeriodeMulai(ta, per) { const [y1, y2] = ta.split('/').map(Number); return per === 'ganjil' ? `${y1}-07-01` : `${y2}-01-01`; }
function sesiPeriodeAkhir(ta, per) { const [y1, y2] = ta.split('/').map(Number); return per === 'ganjil' ? `${y1}-12-31` : `${y2}-06-30`; }
function sebelumJumlah(absensi, sekarang, ta, per) {
  return Object.keys(absensi.sesi).filter((t) => t >= sesiPeriodeMulai(ta, per) && t <= sesiPeriodeAkhir(ta, per) && t <= sekarang).length;
}

console.log(`\nRINGKASAN SESI MENDATANG: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
