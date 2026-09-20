import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');

// 500 Penegak tambahan, tiap Penegak punya 40 baris progres + 1 riwayat, dan kehadiran 40 Jumat
const N = 500;
await pg.exec(`
  insert into auth.users (id, email, encrypted_password) select gen_random_uuid(), 'p' || i || '@sigarda.invalid', 'h' from generate_series(1, ${N}) i;
  insert into public.profiles (id, username, role, nama, nis, kelas, sangga, agama)
    select id, 'pg' || row_number() over (order by email), 'peserta', 'Penegak ' || row_number() over (order by email), 'nis' || row_number() over (order by email), 'X', 'Elang', 'Islam'
    from auth.users where email ~ '^p[0-9]+@sigarda.invalid$';
  insert into public.sku_progress (peserta_id, sku_id, status)
    select p.id, u.id, 'proses' from public.profiles p cross join lateral (select id from public.sku_unit order by id limit 40) u where p.username ~ '^pg[0-9]+$';
  insert into public.sku_riwayat (peserta_id, sku_id, teks) select peserta_id, sku_id, 'Pengujian dimulai' from public.sku_progress;
  insert into public.absensi_sesi (tanggal) select d::date from generate_series(date '2025-07-04', date '2026-04-03', interval '7 day') d on conflict do nothing;
  insert into public.absensi_hadir (tanggal, peserta_id, status) select s.tanggal, p.id, 'H' from public.absensi_sesi s cross join public.profiles p where p.role = 'peserta' on conflict do nothing;
`);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const n = async (t) => (await pg.query(`select count(*)::int c from public.${t}`)).rows[0].c;
console.log(`Data: ${await n('profiles')} profil, ${await n('sku_progress')} progres, ${await n('sku_riwayat')} riwayat, ${await n('absensi_hadir')} kehadiran`);

const pembina = (await pg.query(`select id from public.profiles where username = 'pembina'`)).rows[0].id;
const peserta = (await pg.query(`select id from public.profiles where username = 'pg7'`)).rows[0].id;

async function ukur(sub, tabel, ulang = 5) {
  const waktu = []; let baris = 0;
  for (let i = 0; i < ulang; i++) {
    const t0 = performance.now();
    baris = await pg.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub, role: 'authenticated' })]);
      await tx.query('set local role authenticated');
      return (await tx.query(`select count(*)::int c from (select * from public.${tabel}) t`)).rows[0].c;
    });
    waktu.push(performance.now() - t0);
  }
  waktu.sort((a, b) => a - b);
  return { ms: waktu[Math.floor(ulang / 2)], baris };
}

const TABEL = ['sku_progress', 'sku_riwayat', 'absensi_hadir'];
const KEBIJAKAN_LAMA = {
  baca_progres: ['sku_progress'], baca_riwayat: ['sku_riwayat'], baca_absensi: ['absensi_hadir'],
};
const pasangLama = async () => {
  for (const [k, [t]] of Object.entries(KEBIJAKAN_LAMA)) {
    await pg.exec(`drop policy ${k} on public.${t};
      create policy ${k} on public.${t} for select to authenticated using (sigarda.aktif() and (peserta_id = auth.uid() or sigarda.pengurus()));`);
  }
};
const pasangBaru = async () => {
  for (const [k, [t]] of Object.entries(KEBIJAKAN_LAMA)) {
    await pg.exec(`drop policy ${k} on public.${t};
      create policy ${k} on public.${t} for select to authenticated using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));`);
  }
};

const hasil = {};
for (const [nama, pasang] of [['lama (per baris)', pasangLama], ['baru (sekali per kueri)', pasangBaru]]) {
  await pasang();
  hasil[nama] = {};
  for (const t of TABEL) hasil[nama][t] = { pembina: await ukur(pembina, t), peserta: await ukur(peserta, t) };
}
console.log('\nWaktu tengah dari 5 kali (ms), Pembina membaca semua baris / Penegak membaca barisnya:');
for (const t of TABEL) {
  const l = hasil['lama (per baris)'][t], b = hasil['baru (sekali per kueri)'][t];
  console.log(`  ${t.padEnd(14)} pembina lama ${l.pembina.ms.toFixed(0).padStart(6)} -> baru ${b.pembina.ms.toFixed(0).padStart(6)}  (${l.pembina.baris} baris)   | penegak lama ${l.peserta.ms.toFixed(1).padStart(6)} -> baru ${b.peserta.ms.toFixed(1).padStart(6)}  (${l.peserta.baris} baris)`);
}
for (const t of TABEL) {
  const l = hasil['lama (per baris)'][t], b = hasil['baru (sekali per kueri)'][t];
  ok(l.pembina.baris === b.pembina.baris && l.peserta.baris === b.peserta.baris, `${t}: jumlah baris terlihat identik lama vs baru (${b.pembina.baris} / ${b.peserta.baris})`);
}
ok(hasil['baru (sekali per kueri)'].sku_progress.pembina.ms < hasil['lama (per baris)'].sku_progress.pembina.ms, 'pembacaan pengurus lebih cepat dengan kebijakan baru');
console.log(`\nRINGKASAN PERF: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
