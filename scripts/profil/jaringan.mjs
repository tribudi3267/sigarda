/**
 * MODEL JARINGAN untuk `npm run profil` (L2-A): memperkirakan lama memuat data dari daftar permintaan yang SUNGGUH dikirim aplikasi.
 * Ini model, bukan pengukuran: gunanya membandingkan peran, jaringan, dan hasil perbaikan dengan cepat sebelum diukur di HP asli.
 *
 * Bentuk masukan: `rantai` = daftar rantai yang berjalan BERSAMAAN; tiap rantai = daftar permintaan yang berjalan BERURUTAN
 * (halaman 1000 baris berikutnya baru diminta setelah yang sebelumnya selesai). Tiap permintaan = { byte } (ukuran badan jawaban,
 * setelah kompresi bila diinginkan). Pita lebar dibagi rata antara semua permintaan yang sedang mengunduh (satu sambungan HTTP/2).
 */

/**
 * Profil jaringan. `kbps` = kecepatan unduh; `rttTambahan` = latensi di atas jarak nyata ke server (DevTools "Fast 3G" menambah 150 ms,
 * "Slow 3G" 400 ms). Jarak nyata ke database ditambahkan terpisah (lihat RTT_SERVER_MS).
 */
export const PROFIL_JARINGAN = [
  { kunci: 'wifi', nama: 'Wi-Fi sekolah', kbps: 20000, rttTambahan: 0 },
  { kunci: '4g', nama: '4G', kbps: 8000, rttTambahan: 50 },
  { kunci: 'fast3g', nama: 'Fast 3G', kbps: 1600, rttTambahan: 150 },
  { kunci: 'slow3g', nama: 'Slow 3G', kbps: 400, rttTambahan: 400 },
];

/** Jarak nyata Bukateja ke database (Supabase ap-northeast-1 = Tokyo) dan ke GitHub Pages, dalam md (perkiraan; ukur ulang dengan ukur_muatan). */
export const RTT_SERVER_MS = 110;

/** Byte tambahan per permintaan (tajuk permintaan dan jawaban, CORS). */
export const OVERHEAD_BYTE = 700;

const EPS = 1e-9;

/**
 * Menjalankan simulasi. Mengembalikan lama (md) sampai semua rantai selesai.
 * opsi: { kbps, rttMs, serverMs = 0 (waktu database per permintaan), preflight = 0 (jumlah RTT tambahan per permintaan, mis. 1 untuk CORS OPTIONS),
 *         mulaiMs = 0 (rantai baru dimulai setelah ini) }.
 */
export function simulasi(rantai, { kbps, rttMs, serverMs = 0, preflight = 0, mulaiMs = 0 }) {
  const byteMs = kbps / 8; // kbps -> byte per md (kbps * 1000 / 8 / 1000)
  const tunggu = rttMs * (1 + preflight) + serverMs;
  const rantaiAktif = rantai.filter((r) => r.length).map((r) => ({ r, i: 0, fase: 'tunggu', sisa: tunggu }));
  let t = mulaiMs;
  let awas = 0;
  while (rantaiAktif.some((c) => c.fase !== 'selesai')) {
    if (++awas > 5_000_000) throw new Error('simulasi tidak berakhir');
    const mengunduh = rantaiAktif.filter((c) => c.fase === 'unduh').length;
    const laju = mengunduh ? byteMs / mengunduh : 0;
    let dt = Infinity;
    for (const c of rantaiAktif) {
      if (c.fase === 'tunggu') dt = Math.min(dt, c.sisa);
      else if (c.fase === 'unduh') dt = Math.min(dt, c.sisa / laju);
    }
    t += dt;
    for (const c of rantaiAktif) {
      if (c.fase === 'tunggu') c.sisa -= dt;
      else if (c.fase === 'unduh') c.sisa -= dt * laju;
      if (c.fase === 'tunggu' && c.sisa <= EPS) { c.fase = 'unduh'; c.sisa = c.r[c.i].byte + OVERHEAD_BYTE; }
      if (c.fase === 'unduh' && c.sisa <= EPS) {
        c.i += 1;
        if (c.i >= c.r.length) c.fase = 'selesai';
        else { c.fase = 'tunggu'; c.sisa = tunggu; }
      }
    }
  }
  return t - mulaiMs;
}

/** Jumlah permintaan dan byte seluruh rantai. */
export function ringkasRantai(rantai) {
  let n = 0, byte = 0, terpanjang = 0;
  for (const r of rantai) { n += r.length; byte += r.reduce((a, x) => a + x.byte, 0); terpanjang = Math.max(terpanjang, r.length); }
  return { permintaan: n, byte, rantaiTerpanjang: terpanjang };
}

/**
 * Perkiraan waktu "siap" untuk satu peran dan satu jaringan.
 *  - `aplikasi` = { html, js, css } byte terkompresi (kunjungan dingin) atau null (aplikasi sudah tersimpan di peramban: hanya periksa ulang berkas awal);
 *  - `cpu` = faktor perlambatan CPU (1 = laptop; 4-6 = HP lama); `jsMs` = waktu mengurai dan menjalankan JS awal di laptop; `prosesMsPerMB` = mengurai dan
 *    memetakan JSON di laptop.
 * Mengembalikan komponen waktu (md) agar terlihat bagian mana yang dominan.
 */
export function perkirakanSiap({ rantai, aplikasi, jaringan, serverMs = 40, cpu = 1, jsMs = 250, prosesMsPerMB = 25, rawByte = 0 }) {
  const rttServer = RTT_SERVER_MS + jaringan.rttTambahan;
  const dingin = !!aplikasi;
  const opsi = { kbps: jaringan.kbps, rttMs: rttServer };
  let appMs = 0;
  if (dingin) {
    // DNS + TCP + TLS (3 RTT), lalu html; js dan css diminta bersamaan sesudah html terbaca
    appMs += 3 * rttServer;
    appMs += simulasi([[{ byte: aplikasi.html }]], { ...opsi, serverMs: 0 });
    appMs += simulasi([[{ byte: aplikasi.js }], [{ byte: aplikasi.css }]], { ...opsi, serverMs: 0 });
  } else {
    appMs += simulasi([[{ byte: 1200 }]], { ...opsi, serverMs: 0 }); // index.html diperiksa ulang (304)
  }
  const jsEks = jsMs * cpu;
  const sambungApi = dingin ? 3 * rttServer : 0; // sambungan baru ke database (DNS + TCP + TLS)
  const dataMs = simulasi(rantai, { ...opsi, serverMs, preflight: dingin ? 1 : 0 });
  const proses = (rawByte / 1048576) * prosesMsPerMB * cpu;
  return { appMs, jsMs: jsEks, sambungMs: sambungApi, dataMs, prosesMs: proses, totalMs: appMs + jsEks + sambungApi + dataMs + proses };
}
