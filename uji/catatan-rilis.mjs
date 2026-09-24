// P5: catatan rilis otomatis (scripts/catatan-rilis-lib.mjs) dan kesesuaian README <-> folder migrasi (sumber urutan menjalankan migrasi).
import { readdirSync, readFileSync } from 'node:fs';
import { PENANDA, susunCatatanRilis, urutanMigrasiReadme } from '../scripts/catatan-rilis-lib.mjs';

let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const P = process.cwd().split(String.fromCharCode(92)).join('/');
const ub = (status, path) => ({ status, path });
const URUTAN = ['2026-09-a', '2026-09-b', '2026-09-c'];

console.log('--- susunCatatanRilis ---');
{
  const r = susunCatatanRilis({ berkas: [ub('M', 'src/App.jsx'), ub('A', 'docs/x.md')], skemaBerubah: false, urutanReadme: URUTAN });
  ok(!r.perluTindakan && r.migrasiBaru.length === 0 && /tidak memerlukan langkah tambahan/.test(r.markdown) && r.markdown.startsWith(PENANDA), 'tanpa migrasi/Edge Function: tidak ada langkah, penanda ada');
  ok(r.peringatan.length === 0, 'tanpa migrasi dan skema tak berubah: tanpa peringatan');
}
{
  const r = susunCatatanRilis({ berkas: [ub('A', 'supabase/migrasi/2026-09-c.sql'), ub('A', 'supabase/migrasi/2026-09-b.sql'), ub('M', 'supabase/skema.sql'), ub('M', 'supabase/demo/periksa_pemasangan.sql')], skemaBerubah: true, urutanReadme: URUTAN });
  ok(r.perluTindakan && r.migrasiBaru.join() === '2026-09-b,2026-09-c', 'migrasi baru diurutkan menurut README, bukan urutan git: ' + r.migrasiBaru.join());
  ok(r.markdown.indexOf('2026-09-b.sql') < r.markdown.indexOf('2026-09-c.sql') && /periksa_pemasangan\.sql/.test(r.markdown) && /sebelum menggabungkan/.test(r.markdown), 'catatan memuat urutan, periksa pemasangan, dan "sebelum menggabungkan"');
  ok(r.peringatan.length === 0, 'migrasi baru + skema berubah + terdaftar di README: tanpa peringatan');
}
{
  const r = susunCatatanRilis({ berkas: [ub('A', 'supabase/migrasi/2026-09-baru.sql'), ub('M', 'supabase/functions/sigarda/index.ts'), ub('M', 'supabase/functions/notif-push/index.ts'), ub('M', 'supabase/functions/sigarda/lain.ts')], skemaBerubah: false, urutanReadme: URUTAN });
  ok(r.fungsiBerubah.join() === 'notif-push,sigarda', 'Edge Function berubah didaftar sekali per fungsi: ' + r.fungsiBerubah.join());
  ok(r.peringatan.some((p) => /belum tercantum di README/.test(p)) && r.peringatan.some((p) => /skema\.sql. tidak berubah/.test(p)), 'peringatan: migrasi belum di README dan skema tidak berubah');
}
{
  const r = susunCatatanRilis({ berkas: [ub('M', 'supabase/migrasi/2026-09-a.sql'), ub('D', 'supabase/migrasi/2026-09-b.sql'), ub('D', 'supabase/functions/sigarda/index.ts')], skemaBerubah: false, urutanReadme: URUTAN });
  ok(!r.perluTindakan && r.peringatan.some((p) => /LAMA diubah/.test(p)) && r.peringatan.some((p) => /dihapus/.test(p)), 'migrasi lama diubah/dihapus: peringatan, fungsi yang dihapus tidak perlu deploy');
}
{
  const r = susunCatatanRilis({ berkas: [ub('M', 'supabase/skema.sql')], skemaBerubah: true, urutanReadme: URUTAN });
  ok(!r.perluTindakan && r.peringatan.some((p) => /tidak ada migrasi baru/.test(p)), 'skema berubah tanpa migrasi baru: peringatan (database berjalan tidak ikut berubah)');
}

console.log('--- README = folder migrasi ---');
{
  const readme = readFileSync(`${P}/README.md`, 'utf8');
  const urutan = urutanMigrasiReadme(readme);
  const ada = readdirSync(`${P}/supabase/migrasi`).filter((n) => n.endsWith('.sql')).map((n) => n.replace(/\.sql$/, ''));
  ok(urutan.length > 20, `README mendaftar ${urutan.length} migrasi`);
  ok(ada.filter((n) => !urutan.includes(n)).length === 0, 'setiap berkas supabase/migrasi tercantum di README: ' + ada.filter((n) => !urutan.includes(n)).join(', '));
  ok(urutan.filter((n) => !ada.includes(n)).length === 0, 'setiap migrasi di README ada berkasnya: ' + urutan.filter((n) => !ada.includes(n)).join(', '));
  ok(new Set(urutan).size === urutan.length, 'tidak ada migrasi ganda di daftar README');
}

console.log('--- workflow ---');
{
  const yml = readFileSync(`${P}/.github/workflows/catatan-rilis.yml`, 'utf8');
  ok(yml.includes(PENANDA), 'workflow mencari komentar lama lewat penanda yang sama dengan pustaka');
  ok(/pull-requests: write/.test(yml) && !/secrets\./.test(yml), 'workflow hanya butuh izin komentar dan tidak memakai rahasia');
}

console.log(`\nRINGKASAN CATATAN-RILIS: ${lulus} lulus, ${gagal} GAGAL.`);
if (gagal) process.exit(1);
