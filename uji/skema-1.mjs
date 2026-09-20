import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { siapkanPg } from '../src/lokal/klienFake.js';

const P = process.cwd().replace(/\\/g, '/');
const pg = new PGlite();
const t = performance.now();
try {
  await siapkanPg(pg, {
    sqlStub: readFileSync(`${P}/supabase/lokal/stub.sql`, 'utf8'),
    sqlSkema: readFileSync(`${P}/supabase/skema.sql`, 'utf8'),
  });
  console.log('skema termuat tanpa galat dalam', Math.round(performance.now() - t), 'ms');
} catch (e) {
  console.log('GALAT SKEMA:', e.message, '\nposisi:', e.position, '\ndetail:', e.detail, '\nhint:', e.hint);
  process.exit(1);
}
const r = await pg.query(`select
  (select count(*) from public.sku_butir) butir, (select count(*) from public.sku_unit) unit, (select count(*) from public.pf_item) pf,
  (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname like 'sg\\_%') fungsi,
  (select count(*) from pg_policies where schemaname='public') kebijakan`);
console.log(r.rows[0]);
