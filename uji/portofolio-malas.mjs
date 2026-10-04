// Hemat log (Fase 3): portofolio dan jurnal (dua permintaan) dimuat malas bagi Penegak. Penjaga struktur: setiap komponen yang membaca `portofolio` dari useApp
// WAJIB memanggil usePastikanPortofolio (kalau tidak, komponen itu tampil kosong bagi Penegak), dan AppContext memuatnya langsung hanya untuk perangkat pengurus.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let lulus = 0; let gagal = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };
const P = process.cwd().replace(/\\/g, '/');
const baca = (f) => readFileSync(`${P}/${f}`, 'utf8').replace(/\r\n/g, '\n');
const semuaJsx = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? semuaJsx(p) : /\.jsx$/.test(n) ? [p] : [];
});

console.log('--- Setiap pembaca portofolio memastikan pemuatannya ---');
{
  const pembaca = semuaJsx(`${P}/src`).map((p) => p.replace(/\\/g, '/')).filter((p) => /const \{[^}\n]*\bportofolio\b[^}\n]*\} = useApp\(\)/.test(readFileSync(p, 'utf8')));
  ok(pembaca.length >= 8, `komponen pembaca portofolio ditemukan: ${pembaca.length}`);
  for (const p of pembaca) {
    const t = readFileSync(p, 'utf8');
    const baris = t.match(/^ *const \{[^}\n]*\bportofolio\b[^}\n]*\} = useApp\(\);\r?\n *usePastikanPortofolio\(\);/gm) ?? [];
    const jumlah = (t.match(/const \{[^}\n]*\bportofolio\b[^}\n]*\} = useApp\(\)/g) ?? []).length;
    ok(baris.length === jumlah && /usePastikanPortofolio[^;]*from '..\/context\/AppContext'|import \{[^}]*usePastikanPortofolio[^}]*\} from '..\/context\/AppContext'/.test(t), `${p.replace(`${P}/`, '')}: memanggil usePastikanPortofolio tepat sesudah useApp (${jumlah}x)`);
  }
}

console.log('\n--- AppContext ---');
{
  const ctx = baca('src/context/AppContext.jsx');
  ok(/export function usePastikanPortofolio\(\)/.test(ctx) && /pastikanPortofolio\?\.\(\)/.test(ctx), 'hook ada dan aman dipakai pada konteks uji tanpa fungsinya');
  ok(/const segeraPortofolio = portofolioDimuat\.current \|\| bacaPetunjuk\(true\) !== ''/.test(ctx), 'pemuatan penuh memuat portofolio langsung hanya bila sudah pernah dimuat atau perangkat pengurus (petunjuk)');
  ok(/segeraPortofolio \? a\.muatPortofolio\(\) : dilewati/.test(ctx) && /portofolio: pf\.dilewati \? d\.portofolio : pf\.data/.test(ctx), 'bila dilewati, portofolio lama dipertahankan (tidak dikosongkan)');
  ok(/if \(!pf\.dilewati\) \{ portofolioDimuat\.current = true; setPortofolioSiap\(true\); \}/.test(ctx), 'pemuatan penuh yang berhasil menandai portofolio siap');
  const iKosong = ctx.indexOf('const kosongkan = useCallback');
  const kosong = ctx.slice(iKosong, iKosong + 900);
  ok(/portofolioDimuat\.current = false/.test(kosong) && /portofolioMemuat\.current = null/.test(kosong) && /setPortofolioSiap\(false\)/.test(kosong), 'keluar/sesi berakhir mereset status portofolio (akun berikutnya memuat sendiri)');
  const iPastikan = ctx.indexOf('const pastikanPortofolio = useCallback');
  const pastikan = ctx.slice(iPastikan, iPastikan + 1100);
  ok(/if \(portofolioDimuat\.current\) return Promise\.resolve\(\)/.test(pastikan) && /if \(!portofolioMemuat\.current\)/.test(pastikan), 'pastikanPortofolio idempoten dan berbagi permintaan yang sedang berjalan');
  ok(/if \(g !== generasi\.current\) return;/.test(pastikan), 'hasil pemuatan lama diabaikan bila pengguna sudah keluar');
  ok(/finally\(\(\) => \{ portofolioMemuat\.current = null; \}\)/.test(pastikan), 'pemuatan yang gagal dapat diulang pada pemanggilan berikutnya');
  ok(/portofolioSiap, pastikanPortofolio/.test(ctx), 'portofolioSiap dan pastikanPortofolio disediakan lewat konteks');
}

console.log('\n--- Dasbor Calon Garuda ---');
{
  const g = baca('src/pages/GarudaDashboard.jsx');
  ok(/portofolioSiap === false\) return/.test(g) && g.indexOf("useState('semua')") < g.indexOf('portofolioSiap === false'), 'selama belum dimuat tampil "Memuat portofolio" (bukan 0%), sesudah semua hook');
}

console.log(`\nRINGKASAN PORTOFOLIO-MALAS: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
