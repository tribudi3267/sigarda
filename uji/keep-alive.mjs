// Keep-alive Supabase: pustaka (scripts/keep-alive-lib.mjs) dengan fetch palsu, dan berkas alur kerja GitHub Actions (.github/workflows/keep-alive.yml).
import { readFileSync, existsSync } from 'node:fs';
import { jalankan, pingSupabase, rapikanUrl } from '../scripts/keep-alive-lib.mjs';

const P = process.cwd().replace(/\\/g, '/');
let gagal = 0, lulus = 0;
const ok = (c, m) => { if (c) { lulus++; console.log('ok   :', m); } else { gagal++; console.log('GAGAL:', m); } };

const URL_UJI = 'https://abcdefghijklmnop.supabase.co';
const KUNCI = 'kunci-anon-uji-rahasia';
const tanpaTunggu = () => Promise.resolve();
/** fetch palsu: `jawaban` = daftar respons berurutan (objek { status, isi } atau Error yang dilempar); mencatat panggilan. */
const palsu = (jawaban) => {
  const panggilan = [];
  const fetchFn = async (alamat, opsi) => {
    panggilan.push({ alamat, opsi });
    const j = jawaban[Math.min(panggilan.length - 1, jawaban.length - 1)];
    if (j instanceof Error) throw j;
    return { ok: j.status >= 200 && j.status < 300, status: j.status, json: async () => { if (j.isi === undefined) throw new Error('bukan JSON'); return j.isi; } };
  };
  return { fetchFn, panggilan };
};

console.log('--- rapikanUrl ---');
ok(rapikanUrl(`${URL_UJI}/`) === URL_UJI && rapikanUrl(` ${URL_UJI}// `) === URL_UJI, 'garis miring di akhir dan spasi dibuang');
ok(rapikanUrl('http://abcdefghijklmnop.supabase.co') === '' && rapikanUrl('') === '' && rapikanUrl(undefined) === '' && rapikanUrl('bukan url') === '' && rapikanUrl('https://') === '', 'bukan https atau tidak sah -> kosong');

console.log('\n--- pingSupabase ---');
{
  const { fetchFn, panggilan } = palsu([{ status: 200, isi: { nama: 'Gudep' } }]);
  const r = await pingSupabase({ url: `${URL_UJI}/`, kunci: KUNCI, fetchFn, tunggu: tanpaTunggu });
  ok(r.ok && r.status === 200 && r.percobaan === 1 && panggilan.length === 1, 'berhasil pada percobaan pertama, satu panggilan');
  const p = panggilan[0];
  ok(p.alamat === `${URL_UJI}/rest/v1/rpc/sg_gudep_publik` && p.opsi.method === 'POST' && p.opsi.body === '{}', 'memanggil fungsi publik sg_gudep_publik lewat REST (POST, badan kosong)');
  ok(p.opsi.headers.apikey === KUNCI && p.opsi.headers.Authorization === `Bearer ${KUNCI}` && p.opsi.headers['Content-Type'] === 'application/json', 'kunci dikirim lewat header apikey dan Authorization');
  ok(!JSON.stringify(r).includes(KUNCI), 'hasil tidak memuat kunci');
}
{
  const { fetchFn, panggilan } = palsu([{ status: 503, isi: undefined }, { status: 200, isi: [] }]);
  const r = await pingSupabase({ url: URL_UJI, kunci: KUNCI, fetchFn, tunggu: tanpaTunggu });
  ok(r.ok && r.percobaan === 2 && panggilan.length === 2, '503 (proyek belum siap) dicoba ulang lalu berhasil');
}
{
  const { fetchFn, panggilan } = palsu([new Error('ECONNRESET'), new Error('ECONNRESET'), { status: 200, isi: {} }]);
  const r = await pingSupabase({ url: URL_UJI, kunci: KUNCI, fetchFn, tunggu: tanpaTunggu });
  ok(r.ok && r.percobaan === 3 && panggilan.length === 3, 'galat jaringan dicoba ulang sampai tiga kali');
}
{
  const { fetchFn, panggilan } = palsu([{ status: 503, isi: undefined }]);
  const r = await pingSupabase({ url: URL_UJI, kunci: KUNCI, fetchFn, tunggu: tanpaTunggu });
  ok(!r.ok && r.status === 503 && panggilan.length === 3 && /terjeda|paused/i.test(r.pesan) && /Restore/.test(r.pesan), 'gagal terus: tiga kali dicoba, pesan menyebut kemungkinan terjeda dan cara memulihkan');
}
for (const [status, kata] of [[401, /kunci anon/], [403, /kunci anon/], [404, /sg_gudep_publik/]]) {
  const { fetchFn, panggilan } = palsu([{ status, isi: {} }]);
  const r = await pingSupabase({ url: URL_UJI, kunci: KUNCI, fetchFn, tunggu: tanpaTunggu });
  ok(!r.ok && r.status === status && panggilan.length === 1 && kata.test(r.pesan), `HTTP ${status}: pengaturan salah, TIDAK dicoba ulang, pesan menuntun`);
}
{
  const { fetchFn } = palsu([{ status: 200, isi: undefined }]);
  const r = await pingSupabase({ url: URL_UJI, kunci: KUNCI, fetchFn, tunggu: tanpaTunggu, percobaan: 1 });
  ok(!r.ok && /bukan JSON/.test(r.pesan), '200 tetapi isi bukan JSON (bukan proyek Supabase yang benar): dianggap gagal');
}
{
  const galatBatas = Object.assign(new Error('aborted'), { name: 'AbortError' });
  const { fetchFn } = palsu([galatBatas]);
  const r = await pingSupabase({ url: URL_UJI, kunci: KUNCI, fetchFn, tunggu: tanpaTunggu, percobaan: 1 });
  ok(!r.ok && /Tidak menjawab dalam 15 detik/.test(r.pesan), 'waktu habis dilaporkan sebagai tidak menjawab');
}
{
  let dipanggil = 0;
  const fetchFn = async () => { dipanggil++; return { ok: true, status: 200, json: async () => ({}) }; };
  const a = await pingSupabase({ url: 'http://x.supabase.co', kunci: KUNCI, fetchFn });
  const b = await pingSupabase({ url: URL_UJI, kunci: '  ', fetchFn });
  ok(!a.ok && !b.ok && dipanggil === 0 && /https/.test(a.pesan) && /Kunci/.test(b.pesan), 'alamat non-https atau kunci kosong: gagal tanpa memanggil jaringan');
}

console.log('\n--- jalankan (lingkungan dan kode keluar) ---');
{
  const log = [], galat = [];
  const { fetchFn } = palsu([{ status: 200, isi: {} }]);
  const kode = await jalankan({ VITE_SUPABASE_URL: URL_UJI, VITE_SUPABASE_ANON_KEY: KUNCI }, { fetchFn, cetak: (s) => log.push(s), cetakGalat: (s) => galat.push(s) });
  ok(kode === 0 && log.length === 1 && galat.length === 0 && !log.join().includes(KUNCI), 'berhasil: kode 0, satu baris hasil, kunci tidak dicetak');
  const kode2 = await jalankan({ SUPABASE_URL: URL_UJI, SUPABASE_ANON_KEY: KUNCI }, { fetchFn, cetak: () => {}, cetakGalat: () => {} });
  ok(kode2 === 0, 'nama SUPABASE_URL dan SUPABASE_ANON_KEY juga diterima');
  const g2 = [];
  const kode3 = await jalankan({}, { fetchFn, cetak: () => {}, cetakGalat: (s) => g2.push(s) });
  ok(kode3 === 1 && g2.length === 1 && /GAGAL/.test(g2[0]), 'lingkungan kosong: kode 1 dan pesan galat');
  const { fetchFn: f503 } = palsu([{ status: 503, isi: undefined }]);
  const kode4 = await jalankan({ VITE_SUPABASE_URL: URL_UJI, VITE_SUPABASE_ANON_KEY: KUNCI }, { fetchFn: f503, tunggu: tanpaTunggu, cetak: () => {}, cetakGalat: () => {} });
  ok(kode4 === 1, 'proyek terjeda (503 terus): kode keluar 1, sehingga GitHub Actions menandai gagal dan mengirim email');
}

console.log('\n--- .github/workflows/keep-alive.yml ---');
{
  const berkas = `${P}/.github/workflows/keep-alive.yml`;
  ok(existsSync(berkas), 'berkas alur kerja ada');
  const y = readFileSync(berkas, 'utf8').replace(/\r\n/g, '\n');
  const cron = (y.match(/-\s*cron:\s*'([^']+)'/) ?? [])[1] ?? '';
  const bagian = cron.split(/\s+/);
  ok(bagian.length === 5 && /^\d+$/.test(bagian[0]) && /^\d+$/.test(bagian[1]) && bagian[2] === '*' && bagian[3] === '*', `jadwal cron sah dan berjalan tiap hari: "${cron}"`);
  ok(Number(bagian[0]) !== 0 && Number(bagian[0]) < 60 && Number(bagian[1]) < 24, 'menit bukan 00 (menghindari antrean padat GitHub)');
  ok(bagian[4] === '*' || bagian[4].split(',').length >= 3, 'selang antar jadwal jauh di bawah 7 hari (batas penjedaan Free tier)');
  ok(/workflow_dispatch:/.test(y), 'dapat dijalankan tangan (workflow_dispatch) untuk uji pertama');
  ok(/permissions:\n\s+contents: read\n/.test(y) && !/write/.test(y.replace(/^#.*$/gm, '')), 'izin minimal: hanya membaca isi repositori');
  ok(y.includes('${{ vars.VITE_SUPABASE_URL }}') && y.includes('${{ vars.VITE_SUPABASE_ANON_KEY }}'), 'memakai variabel Actions yang sama dengan deploy (bukan nilai tertanam)');
  ok(!/eyJ[A-Za-z0-9_-]{20,}|sb_(publishable|secret)_|service_role\s*:/i.test(y), 'tidak ada kunci tertanam; tidak memakai service_role');
  ok(/timeout-minutes:\s*\d+/.test(y) && y.includes('node scripts/keep-alive.mjs') && existsSync(`${P}/scripts/keep-alive.mjs`), 'ada batas waktu proses dan memanggil skrip yang ada');
}

console.log(`\nRINGKASAN KEEP-ALIVE: ${lulus} lulus, ${gagal} GAGAL`);
process.exit(gagal ? 1 : 0);
