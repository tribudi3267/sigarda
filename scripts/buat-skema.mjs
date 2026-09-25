/**
 * Membuat supabase/skema.sql = supabase/sumber/*.sql (dirakit scripts/sumber.mjs) + katalog butir SKU dan dokumen portofolio.
 * Katalog diambil langsung dari src/data (skuData.js, portofolioData.js) agar tidak ada salah ketik dan
 * selalu sama dengan yang dipakai aplikasi.
 *
 * Jalankan: npm run skema
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { bacaInti } from './sumber.mjs';
import { INDEKS_POIN, TINGKAT } from '../src/data/skuData.js';
import { ITEM_PORTOFOLIO } from '../src/data/portofolioData.js';
import { KATALOG_TKK } from '../src/data/tkkData.js';

const akar = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const q = (teks) => `'${String(teks).replace(/'/g, "''")}'`;

const butir = Object.values(TINGKAT).flatMap((t) =>
  t.butir.map((b) => ({ id: b.id, tingkat: t.kode === 'BAN' ? 'Bantara' : 'Laksana', no: b.no, teks: b.teks ?? 'Sesuai agama yang dianut (ketakwaan)' }))
);

// Unit per agama. Varian tanpa agama (kode LAIN) hanya dipakai internal aplikasi dan tidak dimasukkan.
const unit = Object.entries(INDEKS_POIN)
  .filter(([id]) => !id.includes('-LAIN-'))
  .map(([id, p]) => ({ id, butirId: id.split('-').slice(0, 2).join('-'), tingkat: p.tingkat, butirNo: p.butirNo, agama: p.agama, sub: p.sub }))
  .sort((a, b) => a.id.localeCompare(b.id));

const baris = [];
baris.push('-- (dibuat otomatis oleh scripts/buat-skema.mjs; jangan diubah manual)');
baris.push('insert into public.sku_butir (id, tingkat, no, teks) values');
baris.push(butir.map((b) => `  (${q(b.id)}, ${q(b.tingkat)}, ${b.no}, ${q(b.teks)})`).join(',\n') + ';');
baris.push('');
baris.push('insert into public.sku_unit (id, butir_id, tingkat, butir_no, agama, sub) values');
baris.push(
  unit.map((u) => `  (${q(u.id)}, ${q(u.butirId)}, ${q(u.tingkat)}, ${u.butirNo}, ${u.agama ? q(u.agama) : 'null'}, ${u.sub ?? 'null'})`).join(',\n') + ';'
);
baris.push('');
baris.push('insert into public.pf_item (id) values');
baris.push(ITEM_PORTOFOLIO.map((i) => `  (${q(i.id)})`).join(',\n') + ';');
baris.push('');
baris.push('insert into public.tkk_katalog (id, nama, bidang, golongan, agama, sumber, urut) values');
baris.push(KATALOG_TKK.map((t) => `  (${q(t.id)}, ${q(t.nama)}, ${t.bidang}, ${q(t.golongan)}, ${t.agama ? q(t.agama) : 'null'}, ${q(t.sumber)}, ${t.urut})`).join(',\n') + ';');
baris.push('');
baris.push("notify pgrst, 'reload schema';");
baris.push('');

const inti = bacaInti(akar);
writeFileSync(resolve(akar, 'supabase/skema.sql'), inti.trimEnd() + '\n' + baris.join('\n'), 'utf8');
console.log(`skema.sql dibuat: ${butir.length} butir, ${unit.length} unit, ${ITEM_PORTOFOLIO.length} dokumen portofolio, ${KATALOG_TKK.length} TKK.`);
