// Pintu masuk cadangan mingguan (dipanggil .github/workflows/cadangan-mingguan.yml): membaca rahasia dari lingkungan, menyambung ke database,
// lalu menjalankan jalankanCadangan (otomatis.mjs). Variabel lingkungan dan alurnya dijelaskan di otomatis.mjs dan docs/cadangan-otomatis.md.
import { jalankanCadangan } from './otomatis.mjs';

async function utama() {
  const { SIGARDA_DB_URL: dbUrl, SIGARDA_KUNCI_ENKRIPSI: kunci, SIGARDA_UNGGAH_URL: url, SIGARDA_UNGGAH_TOKEN: token } = process.env;
  const kurang = ['SIGARDA_DB_URL', 'SIGARDA_KUNCI_ENKRIPSI', 'SIGARDA_UNGGAH_URL', 'SIGARDA_UNGGAH_TOKEN'].filter((k) => !process.env[k]);
  if (kurang.length) throw new Error(`Rahasia belum diisi di GitHub: ${kurang.join(', ')} (Settings > Secrets and variables > Actions).`);
  const modulPg = 'pg'; // impor dinamis tak terbaca pembundel: pg hanya terpasang di scripts/cadangan (npm ci), tidak di akar
  const pg = (await import(modulPg)).default;
  const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000, statement_timeout: 300000 });
  try {
    await db.connect();
  } catch (e) {
    // Pesan galat pg dapat memuat alamat server; log publik hanya mendapat penyebab umum.
    const p = String(e.message || e);
    if (/password authentication|authentication failed/i.test(p)) throw new Error('Sandi atau nama peran database salah (periksa SIGARDA_DB_URL).');
    if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN/i.test(p)) throw new Error('Tidak dapat menjangkau database; pastikan memakai alamat Session pooler.');
    throw new Error('Gagal menyambung ke database.');
  }
  try {
    await jalankanCadangan({ db, kunci, url, token });
  } finally {
    await db.end().catch(() => {});
  }
}

utama()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(`GAGAL: ${e && e.message ? e.message : e}`);
    process.exit(1);
  });
