import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg, buatKlienFake } from '../src/lokal/klienFake.js';
import { isiDataContoh } from '../src/lokal/seedLokal.js';
import { PIN_DEMO } from '../src/lokal/pinDemo.js';
import { buatApi } from '../src/lib/api.js';

const P = process.cwd().replace(/\\/g, '/');
const pg = new PGlite();
await siapkanPg(pg, { sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'), sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8') });
await isiDataContoh(pg);
await pg.query('update public.profiles set wajib_ganti_pin = false');
const api = buatApi(buatKlienFake(pg));
const r = await api.masuk('admin', PIN_DEMO.admin); // admin lokal
console.log('masuk', r.ok, r.pesan ?? '');
const profil = await api.muatProfil();
const peserta = profil.data.filter((u) => u.role === 'peserta').sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
console.log('peserta urut nama:', peserta.slice(0, 3).map((p) => p.nama));
console.log('buat sesi', await api.buatSesiAbsen('2024-09-06'));
for (const p of peserta.slice(0, 3)) {
  const x = await api.setStatusAbsen('2024-09-06', p.id, 'H');
  console.log('set', p.nama, JSON.stringify(x));
}
const h = await api.muatHadirRentang('2024-07-01', '2024-12-31');
console.log('tersimpan:', JSON.stringify(Object.fromEntries(Object.entries(h.data).map(([t, v]) => [t, Object.keys(v).length]))));
const langsung = await pg.query("select p.nama, h.status from public.absensi_hadir h join public.profiles p on p.id = h.peserta_id where h.tanggal = '2024-09-06' order by p.nama");
console.log('di database:', langsung.rows);
