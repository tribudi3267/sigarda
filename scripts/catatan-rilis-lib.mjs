/**
 * Catatan rilis otomatis (P5): dari daftar berkas yang berubah pada sebuah pull request, susun apa yang HARUS dikerjakan pemilik SEBELUM
 * menggabungkannya (situs terbit otomatis saat merge ke main, jadi migrasi harus lebih dulu). Murni tanpa akses git/jaringan agar mudah diuji;
 * pengambil datanya ada di scripts/catatan-rilis.mjs. Migrasi dijalankan pemilik di SQL Editor dan Edge Function di-deploy pemilik
 * (aturan proyek); alat ini hanya mengingatkan, tidak menjalankan apa pun.
 */

const POLA_MIGRASI = /^supabase\/migrasi\/([^/]+)\.sql$/;
const POLA_FUNGSI = /^supabase\/functions\/([^/]+)\//;
export const PENANDA = '<!-- catatan-rilis-otomatis -->';

/** Urutan migrasi menurut README (butir daftar "Memperbarui database yang sudah berjalan"): [nama tanpa .sql, ...]. */
export function urutanMigrasiReadme(readme) {
  return [...String(readme).matchAll(/^- \[`([^`]+)\.sql`\]\(supabase\/migrasi\/[^)]+\.sql\)/gm)].map((m) => m[1]);
}

/**
 * @param {{ berkas: {status: string, path: string}[], skemaBerubah: boolean, urutanReadme: string[], adaSemuaMigrasi?: string[] }} masukan
 *   berkas = hasil `git diff --name-status` (A/M/D/R); skemaBerubah = supabase/skema.sql berbeda dari basis;
 *   urutanReadme = urutanMigrasiReadme(README di kepala PR).
 * @returns {{ markdown: string, perluTindakan: boolean, migrasiBaru: string[], fungsiBerubah: string[], peringatan: string[] }}
 */
export function susunCatatanRilis({ berkas, skemaBerubah, urutanReadme }) {
  const baru = []; const diubah = []; const dihapus = []; const fungsi = new Set();
  for (const { status, path } of berkas) {
    const m = POLA_MIGRASI.exec(path);
    if (m) { (status.startsWith('A') ? baru : status.startsWith('D') ? dihapus : diubah).push(m[1]); continue; }
    const f = POLA_FUNGSI.exec(path);
    if (f && !status.startsWith('D')) fungsi.add(f[1]);
  }
  const urutan = (a, b) => {
    const ia = urutanReadme.indexOf(a), ib = urutanReadme.indexOf(b);
    return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib) || a.localeCompare(b);
  };
  baru.sort(urutan);
  const fungsiBerubah = [...fungsi].sort();
  const periksaBerubah = berkas.some((b) => b.path === 'supabase/demo/periksa_pemasangan.sql' && !b.status.startsWith('D'));

  const peringatan = [];
  const tanpaReadme = baru.filter((n) => !urutanReadme.includes(n));
  if (tanpaReadme.length) peringatan.push(`Migrasi baru belum tercantum di README (bagian "Memperbarui database yang sudah berjalan"): ${tanpaReadme.map((n) => `\`${n}.sql\``).join(', ')}.`);
  if (diubah.length) peringatan.push(`Migrasi LAMA diubah: ${diubah.map((n) => `\`${n}.sql\``).join(', ')}. Database yang sudah menjalankannya tidak ikut berubah; bila perubahannya perlu sampai ke sana, buat migrasi baru.`);
  if (dihapus.length) peringatan.push(`Migrasi dihapus: ${dihapus.map((n) => `\`${n}.sql\``).join(', ')}. Pastikan memang disengaja.`);
  if (skemaBerubah && !baru.length) peringatan.push('`supabase/skema.sql` berubah tetapi tidak ada migrasi baru. Database yang sudah berjalan TIDAK ikut berubah. Abaikan bila perubahannya hanya susunan/komentar; bila menambah atau mengubah tabel, fungsi, kebijakan, atau hak, tambahkan migrasi.');
  if (!skemaBerubah && baru.length) peringatan.push('Ada migrasi baru tetapi `supabase/skema.sql` tidak berubah. Jalankan `npm run skema` bila sumber skema ikut diubah.');

  const perluTindakan = baru.length > 0 || fungsiBerubah.length > 0;
  const baris = [PENANDA, '## Catatan rilis (otomatis)', ''];
  if (!perluTindakan) {
    baris.push('Tidak ada migrasi SQL baru dan tidak ada Edge Function yang berubah: **menggabungkan PR ini tidak memerlukan langkah tambahan** dari pemilik. Situs terbit otomatis setelah digabung.');
  } else {
    baris.push('Situs terbit otomatis begitu PR ini digabung ke `main`, jadi kerjakan **sebelum menggabungkan**:', '');
    let no = 1;
    if (baru.length) {
      baris.push(`${no++}. Jalankan di Supabase SQL Editor, **berurutan** dan sekali saja (aman untuk data yang ada):`);
      for (const n of baru) baris.push(`   - \`supabase/migrasi/${n}.sql\``);
    }
    if (fungsiBerubah.length) {
      baris.push(`${no++}. Deploy ulang (timpa) Edge Function berikut di Dashboard > Edge Functions:`);
      for (const n of fungsiBerubah) baris.push(`   - \`${n}\` (\`supabase/functions/${n}/index.ts\`)`);
    }
    if (baru.length || fungsiBerubah.length) {
      baris.push(`${no++}. Jalankan \`supabase/demo/periksa_pemasangan.sql\`${periksaBerubah ? ' (berkas ini ikut diperbarui oleh PR ini)' : ''} dan pastikan tidak ada baris \`KURANG\`/\`BEDA\`.`);
    }
    baris.push(`${no}. Sesudah itu gabungkan PR; situs baru terbit otomatis.`);
  }
  if (peringatan.length) baris.push('', '**Perhatian**', ...peringatan.map((p) => `- ${p}`));
  baris.push('', '_Dibuat otomatis oleh `.github/workflows/catatan-rilis.yml` (`scripts/catatan-rilis.mjs`); diperbarui setiap PR berubah. Hanya pengingat: tidak menjalankan apa pun._');
  return { markdown: baris.join('\n') + '\n', perluTindakan, migrasiBaru: baru, fungsiBerubah, peringatan };
}
