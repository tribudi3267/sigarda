// Membuka cadangan mingguan (.enc) dari Google Drive menjadi berkas SQL untuk dipulihkan.
//   node scripts/cadangan/dekripsi.mjs <berkas.enc> [keluaran.sql]
// Frasa sandi ditanyakan (tidak tampil). Bisa juga lewat variabel SIGARDA_KUNCI_ENKRIPSI. Tanpa pustaka tambahan (tidak perlu npm install).
import fs from 'node:fs';
import path from 'node:path';
import { bukaBungkus } from './enkripsi.mjs';

const [masuk, keluar] = process.argv.slice(2);
const gagal = (pesan) => { console.error('\nGAGAL: ' + pesan + '\n'); process.exit(1); };
if (!masuk) gagal('Pemakaian: node scripts/cadangan/dekripsi.mjs <berkas.enc> [keluaran.sql]');
if (!fs.existsSync(masuk)) gagal('Berkas tidak ditemukan: ' + masuk);

function tanyaSembunyi(pertanyaan) {
  return new Promise((resolve) => {
    process.stdout.write(pertanyaan);
    if (!process.stdin.isTTY) { process.stdin.setEncoding('utf8'); process.stdin.once('data', (d) => resolve(String(d).replace(/[\r\n]+$/, ''))); return; }
    let isi = '';
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
    const saat = (potongan) => {
      for (const c of potongan) {
        if (c === '\r' || c === '\n') { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.removeListener('data', saat); process.stdout.write('\n'); resolve(isi); return; }
        if (c === '\u0003') { process.stdout.write('\n'); process.exit(130); }
        if (c === '\u007f' || c === '\b') isi = isi.slice(0, -1); else isi += c;
      }
    };
    process.stdin.on('data', saat);
  });
}

const frasa = process.env.SIGARDA_KUNCI_ENKRIPSI ?? (await tanyaSembunyi('Frasa sandi cadangan (tidak tampil saat diketik): '));
let sql;
try { sql = bukaBungkus(fs.readFileSync(masuk), frasa); } catch (e) { gagal(e.message); }
const tujuan = keluar ?? path.join(path.dirname(masuk), path.basename(masuk).replace(/\.enc$/, '').replace(/\.gz$/, '').replace(/\.sql$/, '') + '.sql');
fs.writeFileSync(tujuan, sql, 'utf8');
console.log(`Berhasil dibuka: ${tujuan} (${(Buffer.byteLength(sql) / 1024).toFixed(1)} KB)`);
console.log('Pemulihan: buka Supabase > SQL Editor, tempel isinya, Run (proyek baru: jalankan supabase/skema.sql lebih dulu). Berkas SQL ini RAHASIA; hapus setelah dipakai.');
