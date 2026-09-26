// Inti cadangan mingguan otomatis (pustaka yang dapat diuji; pintu masuknya jalankan-mingguan.mjs, dipanggil GitHub Actions tiap Sabtu; lihat .github/workflows/cadangan-mingguan.yml dan docs/cadangan-otomatis.md).
// Alur: sambung ke database dengan peran BACA-SAJA -> baca semua tabel dalam satu transaksi -> periksa kewajaran -> gzip + enkripsi AES-256-GCM
// -> unggah ke Google Drive lewat penerima Apps Script -> periksa ukuran dan SHA-256 di sisi Drive.
// Log workflow publik: yang dicetak HANYA nama tabel, jumlah baris, dan ukuran; tidak pernah isi data, alamat sambungan, sandi, atau frasa.
//
// Variabel lingkungan (semua dari GitHub Secrets):
//   SIGARDA_DB_URL          alamat Session pooler lengkap dengan password peran baca-saja (postgresql://cadangan_sigarda.<ref>:<sandi>@...:5432/postgres)
//   SIGARDA_KUNCI_ENKRIPSI  frasa sandi enkripsi (minimal 16 karakter; simpan salinannya di tempat aman, tanpa itu cadangan tidak dapat dibuka)
//   SIGARDA_UNGGAH_URL      alamat Web App Apps Script
//   SIGARDA_UNGGAH_TOKEN    token yang sama dengan Properti Skrip TOKEN
import { bacaSemua, cadanganWajar, susunSql } from './dump.mjs';
import { bungkus } from './enkripsi.mjs';
import { unggah } from './unggah.mjs';

const WIB = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });
/** Nama berkas: sigarda-cadangan-YYYY-MM-DD.sql.gz.enc (tanggal menurut WIB). */
export function namaBerkas(waktu = new Date()) {
  const b = Object.fromEntries(WIB.formatToParts(waktu).map((p) => [p.type, p.value]));
  return `sigarda-cadangan-${b.year}-${b.month}-${b.day}.sql.gz.enc`;
}

/** Inti yang dapat diuji: `db` = objek dengan query(); `unggahFn` dapat diganti. Mengembalikan ringkasan; melempar galat bila gagal. */
export async function jalankanCadangan({ db, kunci, url, token, waktu = new Date(), fetchFn = fetch, log = console.log, jeda = 1500 }) {
  if (!kunci || kunci.length < 16) throw new Error('SIGARDA_KUNCI_ENKRIPSI belum diisi atau kurang dari 16 karakter.');
  if (!url || !token) throw new Error('SIGARDA_UNGGAH_URL atau SIGARDA_UNGGAH_TOKEN belum diisi.');
  log('Membaca data (transaksi baca-saja)...');
  const blok = await bacaSemua(db, { log: (nama, n) => log(`  ${nama.padEnd(28)} ${String(n).padStart(7)} baris`) });
  if (!cadanganWajar(blok)) throw new Error('Tabel profiles kosong atau tidak ditemukan: sambungan salah proyek/alamat. Cadangan TIDAK diunggah agar tidak menggantikan yang baik.');
  const sql = susunSql(blok, waktu);
  const terenkripsi = bungkus(sql, kunci);
  const nama = namaBerkas(waktu);
  log(`Data ${(Buffer.byteLength(sql) / 1024).toFixed(0)} KB -> terkompres dan terenkripsi ${(terenkripsi.length / 1024).toFixed(0)} KB. Mengunggah ${nama}...`);
  const hasil = await unggah({ url, token, nama, data: terenkripsi, fetchFn, jeda, log });
  log(`Selesai: ${hasil.potongan} potongan, ${hasil.ukuran} byte, SHA-256 ${hasil.sha256.slice(0, 12)}... cocok di Drive.`);
  return { nama, tabel: blok.length, baris: blok.reduce((a, b) => a + b.n, 0), ...hasil };
}
