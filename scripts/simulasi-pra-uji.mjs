/**
 * SIMULASI OTOMATIS PRA-UJI BERJENJANG di atas data "sekolah penuh" (700 Penegak, 30 rombel; PGlite lokal). Bukan pengujian (tidak ikut `npm run uji`): hasilnya laporan.
 * Jalankan: npm run simulasi:pra-uji [-- --skenario=lengkap]
 *
 * Skenario `apa-adanya`: Bina Damping dan Pinsa hanya dari Penegak berjabatan Dewan dan Penegak yang memang memenuhi syarat pada data sekolah penuh (jumlah Dewan yang sedikit
 * menggambarkan kekurangan Bina Damping). Skenario `lengkap`: tiap rombel dipenuhi 2 Bina Damping (Penegak Calon Laksana ke atas dijadikan Dewan) sebagai pembanding.
 *
 * Alur: sakelar dihidupkan; 450 Penegak mengajukan 1-2 butir (gelombang 1: 300, gelombang 2: 150); penilai (Pinsa dan Bina Damping) memutuskan lewat antrian masing-masing
 * (85% lulus, 15% belum dengan catatan); Pembina menguji resmi (90% lulus, 10% ulang); yang belum atau ulang mengajukan kembali (60% per putaran); sampai tenang atau 8 putaran.
 * Diperiksa: invarian data, hak akses, notifikasi, beban Pembina, tahap yang macet, dan waktu fungsi utama.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { siapkanPg, sqlSebagai } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { isiSekolahPenuh } from '../src/lokal/sekolahPenuh.js';
import { tahunAjaranKini } from '../src/lib/rombelLogic.js';

const P = process.cwd().replace(/\\/g, '/');
const skenario = (process.argv.find((a) => a.startsWith('--skenario=')) ?? '--skenario=apa-adanya').split('=')[1];
if (!['apa-adanya', 'lengkap'].includes(skenario)) { console.error('Skenario: apa-adanya | lengkap'); process.exit(2); }
const log = (...a) => console.log(...a);

function pembangkit(benih) {
  let a = benih >>> 0;
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const acak = pembangkit(20261002);
const pilih = (arr) => arr[Math.floor(acak() * arr.length)];
const kocok = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(acak() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const persen = (xs, p) => { if (!xs.length) return 0; const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const stat = (xs) => ({ n: xs.length, rata: xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : 0, p95: +persen(xs, 95).toFixed(1), maks: +Math.max(0, ...xs).toFixed(1) });

const T0 = performance.now();
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8').replace(/^﻿/, '') });
await isiDataContoh(pg);
log('Membuat data sekolah penuh (700 Penegak)...');
const ringkasData = await isiSekolahPenuh(pg, { penegak: 700, alumni: 150, pembina: 3 });
log('Data siap:', JSON.stringify(ringkasData), `(${((performance.now() - T0) / 1000).toFixed(0)} dtk)`);

const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const sebagai = async (id, sql, args = []) => { try { return { ok: true, rows: (await sqlSebagai(pg, id, sql, args)).rows }; } catch (e) { return { ok: false, pesan: e.message }; } };
const waktu = async (fn) => { const t = performance.now(); const r = await fn(); return [r, performance.now() - t]; };
const ta = tahunAjaranKini();
const hari = (await q('select sigarda.hari_ini()::text d'))[0].d;
const jadwal = (await q(`select (sigarda.hari_ini() + 14)::text d`))[0].d;

const pembinaSemua = await q(`select id, nama, username from public.profiles where role = 'penguji' and jabatan = 'Pembina' and status = 'aktif' order by username`);
const adminId = (await q(`select id from public.profiles where role = 'admin' limit 1`))[0].id;
const pembinaId = pembinaSemua[0].id;
const laporan = { skenario, tahunAjaran: ta, data: ringkasData, temuan: [], waktuMs: {}, pengajuan: {}, konfigurasi: {}, jalur: {}, beban: {}, invarian: {}, hak: {}, notifikasi: {}, pemeriksaanData: {} };
const temuan = (t) => { laporan.temuan.push(t); log('  TEMUAN:', t); };

// ------------------------------------------------------------ Konfigurasi
log(`\n== Konfigurasi (${skenario}) ==`);
const rombelDaftar = (await q(`select distinct kelas from public.profiles where role = 'peserta' and status = 'aktif' and kelas ~ '^(X|XI|XII)-[0-9]{2}$' order by kelas`)).map((r) => r.kelas);
laporan.konfigurasi.rombel = rombelDaftar.length;
const tingkatMap = new Map((await q(`select id, sigarda.tingkat_penegak(id) as t from public.profiles where role = 'peserta' and status = 'aktif'`)).map((r) => [r.id, r.t]));
const sebaranTingkat = { 'calon-bantara': 0, 'calon-laksana': 0, laksana: 0 };
for (const t of tingkatMap.values()) sebaranTingkat[t] += 1;
laporan.konfigurasi.sebaranTingkat = sebaranTingkat;
log('Sebaran tingkat Penegak aktif:', JSON.stringify(sebaranTingkat));

if (skenario === 'lengkap') {
  const dewanAda = new Set((await q(`select id from public.profiles where role = 'peserta' and jabatan_dewan is not null`)).map((r) => r.id));
  const kandidat = [...tingkatMap.entries()].filter(([id, t]) => t !== 'calon-bantara' && !dewanAda.has(id)).sort((a, b) => (a[1] === 'laksana' ? 0 : 1) - (b[1] === 'laksana' ? 0 : 1));
  const butuh = rombelDaftar.length * 2 - dewanAda.size;
  const dipromosi = kandidat.slice(0, Math.max(0, butuh)).map(([id]) => id);
  if (dipromosi.length) await q(`update public.profiles set jabatan_dewan = 'Anggota Dewan' where id = any($1::uuid[])`, [dipromosi]);
  laporan.konfigurasi.dewanTambahan = dipromosi.length;
  if (dipromosi.length < butuh) temuan(`Skenario lengkap butuh ${butuh} Penegak Dewan tambahan tetapi hanya ${dipromosi.length} Penegak Calon Laksana ke atas yang ada.`);
}
const dewanEligible = await q(`select id, kelas from public.profiles where role = 'peserta' and status = 'aktif' and jabatan_dewan is not null`);
const dewanTingkat = dewanEligible.filter((d) => tingkatMap.get(d.id) !== 'calon-bantara');
laporan.konfigurasi.dewanTotal = dewanEligible.length;
laporan.konfigurasi.dewanMemenuhiBinaDamping = dewanTingkat.length;
// Bina Damping: 2 per rombel (satu orang satu rombel per tahun ajaran), Penegak Laksana didahulukan; lewat fungsi resmi sg_bina_damping_atur (Pembina)
const antre = dewanTingkat.sort((a, b) => (tingkatMap.get(a.id) === 'laksana' ? 0 : 1) - (tingkatMap.get(b.id) === 'laksana' ? 0 : 1)).map((d) => d.id);
let bd = 0;
const galatBd = [];
const urutRombel = skenario === 'lengkap' ? rombelDaftar : kocok(rombelDaftar);
const pasangBd = async (rombel, ids) => { const r = await sebagai(pembinaId, 'select public.sg_bina_damping_atur($1, $2, $3::uuid[])', [ta, rombel, ids]); if (!r.ok) galatBd.push(`${rombel}: ${r.pesan}`); else bd += ids.length; };
if (skenario === 'lengkap') { for (const r of urutRombel) { const ids = antre.splice(0, 2); if (ids.length) await pasangBd(r, ids); } }
else { // apa adanya: Dewan yang ada disebar satu per rombel (semerata mungkin), bukan ditumpuk
  let i = 0; while (antre.length && i < urutRombel.length * 2) { const ids = [antre.shift()]; await pasangBd(urutRombel[i % urutRombel.length], ids); i += 1; }
}
laporan.konfigurasi.binaDampingDitunjuk = bd;
laporan.konfigurasi.rombelTanpaBinaDamping = (await q(`select count(*)::int n from unnest($1::text[]) r where (select count(*) from public.bina_damping b where b.rombel = r and b.tahun_ajaran = $2) = 0`, [rombelDaftar, ta]))[0].n;
laporan.konfigurasi.rombelBinaDampingKurangDari2 = (await q(`select count(*)::int n from unnest($1::text[]) r where (select count(*) from public.bina_damping b where b.rombel = r and b.tahun_ajaran = $2) < 2`, [rombelDaftar, ta]))[0].n;
if (galatBd.length) temuan(`sg_bina_damping_atur menolak ${galatBd.length} penunjukan, mis.: ${galatBd.slice(0, 2).join(' | ')}`);
// Pinsa: satu per (rombel, sangga) dari Penegak minimal Calon Laksana di sangga itu
const grup = new Map();
for (const p of await q(`select id, kelas, sangga from public.profiles where role = 'peserta' and status = 'aktif'`)) {
  const k = `${p.kelas}|${String(p.sangga).toLowerCase()}`;
  if (!grup.has(k)) grup.set(k, []);
  grup.get(k).push(p);
}
let pinsa = 0;
for (const [, anggota] of grup) {
  const layak = anggota.find((p) => tingkatMap.get(p.id) !== 'calon-bantara');
  if (layak) { await q(`update public.profiles set pinsa = true where id = $1`, [layak.id]); pinsa += 1; }
}
laporan.konfigurasi.sangga = grup.size;
laporan.konfigurasi.pinsa = pinsa;
laporan.konfigurasi.sanggaTanpaPinsa = grup.size - pinsa;
log('Konfigurasi:', JSON.stringify(laporan.konfigurasi));
const hidup = await sebagai(pembinaId, 'select public.sg_pra_uji_sakelar(true) as h');
log('Sakelar pra-uji hidup:', JSON.stringify(hidup.rows?.[0]?.h ?? hidup.pesan));

// ------------------------------------------------------------ Simulasi
const penilaiIds = () => q(`select id from public.profiles where status = 'aktif' and (pinsa = true or id in (select penegak_id from public.bina_damping where tahun_ajaran = $1))`, [ta]).then((r) => r.map((x) => x.id));
const butirLuang = async (id, tingkat) => (await q(
  `select u.id from public.sku_unit u join public.profiles p on p.id = $1 where u.tingkat = $2 and (u.agama is null or u.agama = p.agama)
   and not exists (select 1 from public.sku_progress s where s.peserta_id = p.id and s.sku_id = u.id and s.status in ('lulus', 'diajukan', 'proses'))
   and not exists (select 1 from public.sku_pra_uji r where r.peserta_id = p.id and r.sku_id = u.id and r.status = 'menunggu') order by random() limit 3`, [id, tingkat === 'calon-bantara' ? 'Bantara' : 'Laksana'])).map((r) => r.id);

const wAjukan = [], wAntrian = [], wCatat = [], wPembina = [];
const galatAjukan = {};
const dicoba = new Set();
const ajukanBanyak = async (ids, maksButir = 2) => {
  let n = 0;
  for (const id of ids) {
    const t = tingkatMap.get(id);
    if (t === 'laksana') continue; // sudah tuntas Bantara dan Laksana
    const butir = await butirLuang(id, t);
    for (const sku of kocok(butir).slice(0, 1 + Math.floor(acak() * maksButir))) {
      const [r, ms] = await waktu(() => sebagai(id, 'select public.sg_sku_ajukan($1, $2::date, null, $3)', [sku, jadwal, 'siap diuji']));
      wAjukan.push(ms);
      laporan.pengajuan.dicoba = (laporan.pengajuan.dicoba ?? 0) + 1;
      if (r.ok) { n += 1; dicoba.add(`${id}|${sku}`); } else { const k = String(r.pesan).slice(0, 90); galatAjukan[k] = (galatAjukan[k] ?? 0) + 1; }
    }
  }
  return n;
};
const semuaAktif = kocok([...tingkatMap.keys()].filter((id) => tingkatMap.get(id) !== 'laksana'));
log(`\n== Simulasi ==\nGelombang 1: 300 Penegak mengajukan...`);
const g1 = await ajukanBanyak(semuaAktif.slice(0, 300));
log(`  pengajuan berhasil: ${g1}`);

const posisiAwal = async () => {
  const menunggu = await q(`select tahap, count(*)::int n from public.sku_pra_uji where status = 'menunggu' group by tahap`);
  const langsung = (await q(`select count(*)::int n from public.sku_progress where status = 'diajukan'`))[0].n;
  return { menunggu: Object.fromEntries(menunggu.map((r) => [r.tahap, r.n])), langsungKePembina: langsung };
};
laporan.pengajuan.posisiSetelahGelombang1 = await posisiAwal();
log('  posisi:', JSON.stringify(laporan.pengajuan.posisiSetelahGelombang1));

// pengingat: mundurkan sebagian pra-uji yang menunggu (5 hari) lalu jalankan pengingat harian
const mundur = await q(`update public.sku_pra_uji set dibuat = now() - interval '5 days' where id in (select id from public.sku_pra_uji where status = 'menunggu' order by id limit 20) returning id`);
const notifSebelum = (await q(`select count(*)::int n from public.notifikasi where jenis = 'pengingat' and judul ilike '%pra-uji%'`))[0].n;
const [, msPengingat] = await waktu(() => q('select sigarda.notif_pengingat()'));
laporan.waktuMs.notifPengingat = +msPengingat.toFixed(0);
laporan.notifikasi.pengingatPraUji = (await q(`select count(*)::int n from public.notifikasi where jenis in ('pengingat','pra_uji') and (judul ilike '%pra-uji%' or isi ilike '%pra-uji%')`))[0].n - notifSebelum;
log(`  ${mundur.length} pra-uji dimundurkan 5 hari; pengingat harian menghasilkan ${laporan.notifikasi.pengingatPraUji} notifikasi terkait pra-uji (${msPengingat.toFixed(0)} ms)`);

const proses = { lulusPraUji: 0, belumPraUji: 0, ujiLulus: 0, ujiUlang: 0, ajukanUlang: 0, putaran: 0 };
const puncakPembina = [];
let gelombang2 = false;
for (let putaran = 1; putaran <= 8; putaran += 1) {
  proses.putaran = putaran;
  if (putaran === 2 && !gelombang2) { gelombang2 = true; const g = await ajukanBanyak(semuaAktif.slice(300, 450)); log(`Gelombang 2: 150 Penegak mengajukan: ${g} pengajuan`); }
  // penilai memutuskan (beberapa lintasan supaya hasil tahap pertama langsung masuk antrian tahap berikut)
  for (let lintasan = 0; lintasan < 3; lintasan += 1) {
    let kerja = 0;
    for (const id of await penilaiIds()) {
      const [a, ms] = await waktu(() => sebagai(id, 'select public.sg_pra_uji_antrian() as a'));
      wAntrian.push(ms);
      if (!a.ok) { temuan(`antrian penilai gagal: ${a.pesan}`); continue; }
      for (const it of a.rows[0].a.menunggu) {
        const lulus = acak() < 0.85;
        const [r, ms2] = await waktu(() => sebagai(id, 'select public.sg_pra_uji_catat($1, $2, $3) as h', [it.id, lulus ? 'lulus' : 'belum', lulus ? '' : 'Perlu latihan lagi pada butir ini.']));
        wCatat.push(ms2);
        if (r.ok) { kerja += 1; if (lulus) proses.lulusPraUji += 1; else proses.belumPraUji += 1; } else { const k = `catat: ${String(r.pesan).slice(0, 80)}`; galatAjukan[k] = (galatAjukan[k] ?? 0) + 1; }
      }
    }
    if (!kerja) break;
  }
  // Pembina menguji resmi
  const antrianPembina = await q(`select peserta_id, sku_id from public.sku_progress where status = 'diajukan' order by diubah`);
  puncakPembina.push(antrianPembina.length);
  for (const it of antrianPembina) {
    const pb = pembinaSemua[proses.ujiLulus % pembinaSemua.length].id;
    const [, ms] = await waktu(async () => {
      await sebagai('service', `select public.sg_sku_catat_internal($1::uuid, $2::uuid, $3, 'proses', $4::date, null, '')`, [pb, it.peserta_id, it.sku_id, hari]);
      const lulus = acak() < 0.9;
      const r = await sebagai('service', `select public.sg_sku_catat_internal($1::uuid, $2::uuid, $3, $4, $5::date, null, $6)`, [pb, it.peserta_id, it.sku_id, lulus ? 'lulus' : 'ulang', hari, lulus ? '' : 'Diulang']);
      if (!r.ok) temuan(`uji resmi gagal dicatat: ${r.pesan}`);
      else if (lulus) proses.ujiLulus += 1; else proses.ujiUlang += 1;
    });
    wPembina.push(ms);
  }
  // pengajuan ulang: yang 'belum' pra-uji atau 'ulang' resmi
  const ulang = await q(`select p.id peserta_id, s.sku_id from public.sku_progress s join public.profiles p on p.id = s.peserta_id where s.status = 'ulang'
    union select r.peserta_id, r.sku_id from public.sku_pra_uji r where r.status = 'belum' and not exists (select 1 from public.sku_pra_uji r2 where r2.peserta_id = r.peserta_id and r2.sku_id = r.sku_id and r2.id > r.id)
      and not exists (select 1 from public.sku_progress s where s.peserta_id = r.peserta_id and s.sku_id = r.sku_id and s.status in ('lulus','diajukan','proses'))`);
  let ul = 0;
  for (const it of ulang) {
    if (acak() > 0.6) continue;
    const r = await sebagai(it.peserta_id, 'select public.sg_sku_ajukan($1, $2::date, null, $3)', [it.sku_id, jadwal, 'ajukan ulang']);
    if (r.ok) { ul += 1; proses.ajukanUlang += 1; } else { const k = `ulang: ${String(r.pesan).slice(0, 80)}`; galatAjukan[k] = (galatAjukan[k] ?? 0) + 1; }
  }
  const sisa = await posisiAwal();
  log(`Putaran ${putaran}: antrian Pembina ${antrianPembina.length}, diajukan ulang ${ul}, menunggu pra-uji ${JSON.stringify(sisa.menunggu)}`);
  if (!Object.values(sisa.menunggu).reduce((a, b) => a + b, 0) && !sisa.langsungKePembina && !ulang.length) break;
}
laporan.pengajuan.galat = galatAjukan;
laporan.pengajuan.proses = proses;
laporan.beban.antrianPembinaPerPutaran = puncakPembina;
laporan.waktuMs.sgSkuAjukan = stat(wAjukan);
laporan.waktuMs.sgPraUjiAntrian = stat(wAntrian);
laporan.waktuMs.sgPraUjiCatat = stat(wCatat);
laporan.waktuMs.ujiResmiPerButir = stat(wPembina);

// ------------------------------------------------------------ Jalur yang ditempuh
const jalurRows = await q(`select peserta_id, sku_id, string_agg(tahap || ':' || status, '>' order by id) j from public.sku_pra_uji group by peserta_id, sku_id`);
const hitungJalur = {};
for (const r of jalurRows) { const k = r.j.replace(/:(lulus|belum|menunggu|dibatalkan|dilewati)/g, '').split('>').filter((x, i, a) => a.indexOf(x) === i).join('>') || '(tanpa pra-uji)'; hitungJalur[k] = (hitungJalur[k] ?? 0) + 1; }
laporan.jalur.pasanganPenegakButirDenganPraUji = jalurRows.length;
laporan.jalur.urutanTahapDitempuh = hitungJalur;
const totalPengajuan = (await q(`select count(distinct (peserta_id::text || sku_id)) n from public.sku_riwayat where teks ilike '%diajukan%'`))[0].n;
laporan.jalur.pengajuanBerbedaTercatat = Number(totalPengajuan);
const langsung = (await q(`select count(*)::int n from (select distinct s.peserta_id, s.sku_id from public.sku_progress s where s.status in ('lulus','diajukan','proses','ulang')
  and exists (select 1 from public.sku_riwayat h where h.peserta_id = s.peserta_id and h.sku_id = s.sku_id and h.tanggal >= now() - interval '1 hour')
  and not exists (select 1 from public.sku_pra_uji r where r.peserta_id = s.peserta_id and r.sku_id = s.sku_id)) x`))[0].n;
laporan.jalur.pengajuanTanpaPraUjiSama = langsung;

// ------------------------------------------------------------ Invarian
log('\n== Invarian ==');
const inv = async (nama, sql, args = []) => { const n = (await q(sql, args))[0].n; laporan.invarian[nama] = Number(n); log(`  ${Number(n) === 0 ? 'ok  ' : 'GAGAL'}: ${nama} = ${n}`); if (Number(n) !== 0) temuan(`invarian ${nama} = ${n}`); };
await inv('menunggu_padahal_sudah_lulus', `select count(*)::int n from public.sku_pra_uji r where r.status = 'menunggu' and exists (select 1 from public.sku_progress s where s.peserta_id = r.peserta_id and s.sku_id = r.sku_id and s.status = 'lulus')`);
await inv('menunggu_ganda', `select count(*)::int n from (select peserta_id, sku_id from public.sku_pra_uji where status = 'menunggu' group by 1, 2 having count(*) > 1) x`);
await inv('pra_uji_menunggu_tanpa_penilai_sah', `select count(*)::int n from public.sku_pra_uji r where r.status = 'menunggu' and not exists (select 1 from public.profiles p where p.status = 'aktif' and sigarda.pra_uji_penilai_ok(r.peserta_id, r.sku_id, r.tahap, p.id))`);
await inv('lulus_resmi_dicatat_bukan_pembina', `select count(*)::int n from public.sku_riwayat h join public.profiles p on p.id = h.oleh where h.teks ilike 'Lulus%' and h.tanggal >= now() - interval '2 hours' and not (p.role = 'penguji' and p.jabatan = 'Pembina') and p.role <> 'admin'`);
await inv('keputusan_pra_uji_tanpa_penilai', `select count(*)::int n from public.sku_pra_uji where status in ('lulus','belum') and penilai_id is null`);
await inv('belum_tanpa_catatan', `select count(*)::int n from public.sku_pra_uji where status = 'belum' and btrim(catatan) = ''`);
await inv('notif_hasil_resmi_membocorkan_hasil', `select count(*)::int n from public.notifikasi where jenis = 'hasil' and (judul || ' ' || isi) ~* '(lulus|ulang|tidak lulus)'`);
await inv('notif_pra_uji_tanpa_kata_kunci', `select count(*)::int n from public.notifikasi where jenis = 'pra_uji' and judul ~* 'diteruskan' and (judul || ' ' || isi) !~* '(diteruskan ke pra-uji selanjutnya|diteruskan ke pengujian resmi ke pembina)'`);
laporan.notifikasi.perJenis = Object.fromEntries((await q(`select jenis, count(*)::int n from public.notifikasi group by jenis order by jenis`)).map((r) => [r.jenis, r.n]));

// ------------------------------------------------------------ Hak akses
log('\n== Hak akses ==');
const dewanId = (await q(`select id from public.profiles where role = 'peserta' and jabatan_dewan is not null and status = 'aktif' limit 1`))[0].id;
const contohPeserta = (await q(`select peserta_id, sku_id from public.sku_progress where status = 'diajukan' limit 1`))[0];
const hak = async (nama, r, harapGagal, polaPesan) => {
  const lolos = harapGagal ? !r.ok && (!polaPesan || polaPesan.test(r.pesan ?? '')) : r.ok;
  laporan.hak[nama] = lolos ? 'sesuai' : `MENYIMPANG: ${r.ok ? 'berhasil' : r.pesan}`;
  log(`  ${lolos ? 'ok  ' : 'GAGAL'}: ${nama}`);
  if (!lolos) temuan(`hak "${nama}" menyimpang: ${r.ok ? 'berhasil dijalankan' : r.pesan}`);
};
if (contohPeserta) {
  await hak('Dewan (Penegak berjabatan) tidak boleh mencatat hasil resmi', await sebagai('service', `select public.sg_sku_catat_internal($1::uuid, $2::uuid, $3, 'lulus', $4::date, null, '')`, [dewanId, contohPeserta.peserta_id, contohPeserta.sku_id, hari]), true);
}
const rowMenunggu = (await q(`select id, peserta_id from public.sku_pra_uji where status = 'menunggu' limit 1`))[0];
const penegakBiasa = (await q(`select id from public.profiles where role = 'peserta' and status = 'aktif' and pinsa = false and jabatan_dewan is null and id not in (select penegak_id from public.bina_damping) limit 1`))[0].id;
if (rowMenunggu) await hak('Penegak biasa tidak boleh memutuskan pra-uji', await sebagai(penegakBiasa, 'select public.sg_pra_uji_catat($1, $2, $3)', [rowMenunggu.id, 'lulus', '']), true);
await hak('Penegak tidak boleh mengubah sakelar', await sebagai(penegakBiasa, 'select public.sg_pra_uji_sakelar(false)'), true);
await hak('Penegak biasa tidak membaca pra-uji Penegak lain (RLS)', { ok: (await sebagai(penegakBiasa, `select 1 from public.sku_pra_uji where peserta_id <> $1`, [penegakBiasa])).rows.length === 0, pesan: 'terbaca' }, false);

// ------------------------------------------------------------ Pemeriksaan Data, waktu fungsi
log('\n== Pemeriksaan Data dan waktu ==');
const [pd, msPd] = await waktu(() => sebagai(pembinaId, 'select public.sg_pemeriksaan_data() as d'));
laporan.waktuMs.sgPemeriksaanData = +msPd.toFixed(0);
if (pd.ok) {
  const d = pd.rows[0].d;
  laporan.pemeriksaanData = { praUjiAktif: d.praUjiAktif, rombelTanpaBinaDamping: d.rombelTanpaBinaDamping?.length ?? d.rombelTanpaBinaDamping, sanggaTanpaPinsa: d.sanggaTanpaPinsa?.length ?? d.sanggaTanpaPinsa, praUjiMacet: d.praUjiMacet?.length ?? d.praUjiMacet };
} else temuan(`sg_pemeriksaan_data gagal: ${pd.pesan}`);
const [, msEsk] = await waktu(() => sebagai(pembinaId, 'select public.sg_eskalasi_daftar() as d'));
laporan.waktuMs.sgEskalasiDaftar = +msEsk.toFixed(0);
const [, msSangga] = await waktu(() => sebagai(pembinaId, `select public.sg_sangga_rombel('${rombelDaftar[0]}') as d`));
laporan.waktuMs.sgSanggaRombel = +msSangga.toFixed(0);
const [, msMenunggu] = await waktu(() => sebagai(pembinaId, 'select * from public.sku_pra_uji where status = $1', ['menunggu']));
laporan.waktuMs.bacaPraUjiMenunggu = +msMenunggu.toFixed(0);
log('  ', JSON.stringify(laporan.waktuMs));

laporan.durasiTotalDtk = +((performance.now() - T0) / 1000).toFixed(0);
mkdirSync(`${P}/.uji`, { recursive: true });
const berkas = `${P}/.uji/simulasi-pra-uji-${skenario}.json`;
writeFileSync(berkas, JSON.stringify(laporan, null, 2));
log(`\n== RINGKASAN (${skenario}) ==`);
log(JSON.stringify({ konfigurasi: laporan.konfigurasi, pengajuan: { dicoba: laporan.pengajuan.dicoba, posisi1: laporan.pengajuan.posisiSetelahGelombang1, proses: laporan.pengajuan.proses, galat: laporan.pengajuan.galat }, jalur: laporan.jalur, beban: laporan.beban, waktuMs: laporan.waktuMs, invarian: laporan.invarian, hak: laporan.hak, pemeriksaanData: laporan.pemeriksaanData, temuan: laporan.temuan }, null, 1));
log(`Laporan lengkap: ${berkas}`);
process.exit(0);
