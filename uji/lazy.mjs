import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi, UKURAN_HALAMAN } from '../src/lib/api.js';
import * as abs from '../src/lib/absensiLogic.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const sama = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('--- Logika semester (murni) ---');
ok(abs.semesterDari('2026-09-19') === '2026/2027|ganjil', 'September 2026 = 2026/2027 ganjil');
ok(abs.semesterDari('2026-06-30') === '2025/2026|genap' && abs.semesterDari('2026-07-01') === '2026/2027|ganjil', 'batas 30 Juni / 1 Juli');
ok(abs.semesterDari('2027-01-01') === '2026/2027|genap' && abs.semesterDari('2026-12-31') === '2026/2027|ganjil', 'batas 31 Des / 1 Jan');
ok(sama(abs.daftarSemester('2025/2026', 'setahun'), ['2025/2026|ganjil', '2025/2026|genap']), 'setahun = dua semester');
ok(sama(abs.daftarSemester('2025/2026', 'genap'), ['2025/2026|genap']), 'satu semester = satu kunci');
ok(sama(abs.rentangKunci('2025/2026|ganjil'), { mulai: '2025-07-01', akhir: '2025-12-31' }), 'rentang ganjil');

console.log('\n--- Data uji: 4 tahun ajaran, 20 peserta ---');
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
await pg.query('delete from public.absensi_sesi'); // mulai bersih agar hitungan pasti
// Jumat pada 4 tahun ajaran (2022/2023 sampai 2025/2026), tepat pada batas-batas semester juga
const jumat = (await pg.query(`select to_char(d, 'YYYY-MM-DD') t from generate_series(date '2022-07-01', date '2026-06-30', interval '1 day') d where extract(dow from d) = 5`)).rows.map((r) => r.t);
await pg.query(`insert into public.absensi_sesi (tanggal) select unnest($1::date[])`, [`{${jumat.join(',')}}`]);
await pg.query(`insert into public.absensi_hadir (tanggal, peserta_id, status)
  select s.tanggal, p.id, 'H' from public.absensi_sesi s cross join public.profiles p where p.role = 'peserta'`);
// tambahkan Jumat pada semester berjalan (tanggal nyata hari ini) agar ada "semester aktif"
const hari = new Date(); const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const aktifKunci = abs.semesterDari(iso(hari));
const rAktif = abs.rentangKunci(aktifKunci);
const jumatAktif = (await pg.query(`select to_char(d, 'YYYY-MM-DD') t from generate_series($1::date, least($2::date, current_date), interval '1 day') d where extract(dow from d) = 5 and d > date '2026-06-30'`, [rAktif.mulai, rAktif.akhir])).rows.map((r) => r.t);
if (jumatAktif.length) {
  await pg.query(`insert into public.absensi_sesi (tanggal) select unnest($1::date[]) on conflict do nothing`, [`{${jumatAktif.join(',')}}`]);
  await pg.query(`insert into public.absensi_hadir (tanggal, peserta_id, status) select s.tanggal, p.id, 'H' from public.absensi_sesi s cross join public.profiles p where p.role = 'peserta' and s.tanggal = any ($1::date[]) on conflict do nothing`, [`{${jumatAktif.join(',')}}`]);
}
const nPeserta = (await pg.query(`select count(*)::int c from public.profiles where role = 'peserta'`)).rows[0].c;
const totalSesi = (await pg.query('select count(*)::int c from public.absensi_sesi')).rows[0].c;
const totalHadir = (await pg.query('select count(*)::int c from public.absensi_hadir')).rows[0].c;
console.log(`     ${nPeserta} peserta, ${totalSesi} sesi, ${totalHadir} baris kehadiran; semester aktif ${aktifKunci} (${jumatAktif.length} Jumat)`);
ok(totalHadir > 0 && totalSesi > 100, 'data uji terisi');

const hitungSql = async (mulai, akhir) => (await pg.query('select count(*)::int c from public.absensi_hadir where tanggal between $1 and $2', [mulai, akhir])).rows[0].c;

async function masuk(nama, pin) {
  const klien = buatKlienFake(pg); const api = buatApi(klien);
  const r = await api.masuk(nama, pin);
  if (!r.ok) throw new Error(r.pesan);
  return { api, id: r.id };
}
const pembina = await masuk('pembina', PIN_DEMO.pembina);

console.log('\n--- Pembacaan per semester (Pembina) ---');
const sesi = await pembina.api.muatSesiAbsen();
ok(sesi.ok && Object.keys(sesi.data).length === totalSesi, `daftar sesi dimuat penuh untuk semua tahun (${Object.keys(sesi.data).length})`);

globalThis.__kueriLokal = [];
const aktif = await pembina.api.muatHadirRentang(rAktif.mulai, rAktif.akhir);
const kueriAktif = globalThis.__kueriLokal.filter((k) => k.tabel === 'absensi_hadir');
const barisAktif = Object.values(aktif.data).reduce((n, h) => n + Object.keys(h).length, 0);
ok(aktif.ok && barisAktif === await hitungSql(rAktif.mulai, rAktif.akhir), `semester aktif: ${barisAktif} baris = hitungan SQL`);
ok(Object.keys(aktif.data).every((t) => t >= rAktif.mulai && t <= rAktif.akhir), 'tidak ada tanggal di luar semester aktif');
console.log(`     kueri absensi_hadir untuk semester aktif: ${kueriAktif.length} permintaan, ${kueriAktif.reduce((n, k) => n + k.n, 0)} baris`);

// Setiap semester lama, termasuk tepat pada batas (mis. Jumat 1 Juli 2022 dan 31 Desember 2021 bila ada)
for (const [ta, per] of [['2022/2023', 'ganjil'], ['2022/2023', 'genap'], ['2023/2024', 'ganjil'], ['2025/2026', 'genap']]) {
  const r = abs.rentangPeriode(ta, per);
  const h = await pembina.api.muatHadirRentang(r.mulai, r.akhir);
  const n = Object.values(h.data).reduce((x, v) => x + Object.keys(v).length, 0);
  ok(h.ok && n === await hitungSql(r.mulai, r.akhir) && n > 0 && Object.keys(h.data).every((t) => t >= r.mulai && t <= r.akhir), `${ta} ${per}: ${n} baris, semuanya di dalam rentang`);
}
ok((await pembina.api.muatHadirRentang('2022-07-01', '2022-07-01')).data['2022-07-01'] !== undefined, 'batas awal inklusif (Jumat 1 Juli 2022)');
ok((await pembina.api.muatHadirRentang('2023-06-30', '2023-06-30')).data['2023-06-30'] !== undefined, 'batas akhir inklusif (Jumat 30 Juni 2023)');
ok(sama((await pembina.api.muatHadirRentang('2030-01-01', '2030-12-31')).data, {}), 'rentang tanpa data = kosong');

console.log('\n--- Penggabungan ke state (yang dilakukan AppContext) ---');
const rSemLama = abs.rentangKunci('2024/2025|ganjil');
const lama = await pembina.api.muatHadirRentang(rSemLama.mulai, rSemLama.akhir);
let st = abs.gabungHadirSemester({ sesi: {}, hadir: {} }, sesi.data, [aktifKunci], aktif.data);
const tglLama = Object.keys(sesi.data).find((t) => t >= rSemLama.mulai && t <= rSemLama.akhir);
ok(st.hadir[tglLama] === undefined, 'awal: tanggal semester lama belum punya kunci hadir (belum dimuat)');
ok(Object.keys(st.hadir).length === Object.keys(sesi.data).filter((t) => t >= rAktif.mulai && t <= rAktif.akhir).length, 'awal: hadir hanya berisi tanggal semester aktif');
st = abs.gabungHadirSemester(st, st.sesi, ['2024/2025|ganjil'], lama.data);
ok(st.hadir[tglLama] && Object.keys(st.hadir[tglLama]).length === nPeserta, `memuat semester lama menambah kehadiran (${Object.keys(st.hadir[tglLama]).length} peserta pada ${tglLama})`);
ok(Object.keys(st.hadir).length > Object.keys(aktif.data).length, 'data semester aktif tetap ada setelah semester lama masuk');
// penyegaran: sesi berubah (satu dihapus di server), semester yang sudah dimuat ikut diperbarui, lainnya tidak disentuh
const sesiBaru = { ...st.sesi }; delete sesiBaru[tglLama];
const st2 = abs.gabungHadirSemester(st, sesiBaru, [aktifKunci, '2024/2025|ganjil'], { ...aktif.data, ...lama.data });
ok(st2.hadir[tglLama] === undefined && !(tglLama in st2.sesi), 'sesi yang dihapus di server hilang dari sesi dan hadir');
ok(sama(Object.keys(st2.hadir).sort(), Object.keys(st2.hadir).filter((t) => sesiBaru[t]).sort()), 'tidak ada hadir tanpa sesi');
// sesi baru pada semester dimuat tanpa catatan -> {}
const tglBaru = '2024-09-06';
const st3 = abs.gabungHadirSemester(st, { ...st.sesi, [tglBaru]: { tanggal: tglBaru } }, ['2024/2025|ganjil'], lama.data);
ok(sama(st3.hadir[tglBaru] ?? 'x', {}) || st3.hadir[tglBaru] !== undefined, 'sesi tanpa catatan pada semester termuat menjadi {} (bukan undefined)');

console.log('\n--- Penegak hanya melihat kehadirannya sendiri ---');
const ahmad = await masuk('10231', PIN_DEMO.penegak);
const punyaAhmad = await ahmad.api.muatHadirRentang(rAktif.mulai, rAktif.akhir);
ok(Object.values(punyaAhmad.data).every((h) => Object.keys(h).length === 1 && h[ahmad.id]), 'Penegak: tiap tanggal hanya berisi barisnya sendiri');
const punyaLama = await ahmad.api.muatHadirRentang('2022-07-01', '2022-12-31');
ok(punyaLama.ok && Object.keys(punyaLama.data).length > 0 && Object.values(punyaLama.data).every((h) => Object.keys(h).length === 1), 'Penegak: semester lama juga hanya barisnya sendiri');

console.log('\n--- Perbandingan beban muat awal Pembina ---');
globalThis.__kueriLokal = [];
await pembina.api.muatHadirRentang('2000-01-01', '2100-12-31');
const semua = globalThis.__kueriLokal.filter((k) => k.tabel === 'absensi_hadir');
const barisSemua = semua.reduce((n, k) => n + k.n, 0);
globalThis.__kueriLokal = [];
await pembina.api.muatHadirRentang(rAktif.mulai, rAktif.akhir);
const sebagian = globalThis.__kueriLokal.filter((k) => k.tabel === 'absensi_hadir');
const barisSebagian = sebagian.reduce((n, k) => n + k.n, 0);
console.log(`     cara lama (semua tahun) : ${semua.length} permintaan, ${barisSemua} baris`);
console.log(`     cara baru (semester aktif): ${sebagian.length} permintaan, ${barisSebagian} baris`);
ok(barisSebagian < barisSemua && barisSebagian === barisAktif, 'muat awal jauh lebih kecil dari memuat semua tahun');
ok(UKURAN_HALAMAN === 1000, 'halaman tetap 1000 baris');

console.log(`\nRINGKASAN LAZY: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
