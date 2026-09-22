/**
 * UKUR DI HP/PERAMBAN SUNGGUHAN (tahap L2-B): tempel seluruh isi berkas ini di konsol DevTools (F12 > Console) pada
 * halaman SIGARDA (produksi atau lokal), lalu ikuti langkah di komentar bawah. Mengukur permintaan NYATA ke Supabase:
 * jumlah, waktu, byte yang lewat kabel (transferSize, SUDAH terkompresi) dan byte asli (decodedBodySize) — jadi laju
 * kompresi gzip Supabase yang SEBENARNYA (bukan model) langsung terlihat. Tidak mengubah apa pun; hanya membaca
 * Performance API peramban.
 *
 * CARA PAKAI
 *  1. Buka halaman masuk SIGARDA. Tekan F12 (atau, di HP: sambungkan lewat USB dan buka chrome://inspect di Chrome
 *     laptop, atau gunakan DevTools desktop dengan Network throttling + CPU throttling untuk meniru HP lama).
 *  2. Tab Console: tempel seluruh isi berkas ini, Enter. Akan tercetak "Perekam siap. Panggil ukurMulai() lalu masuk."
 *  3. Panggil `ukurMulai('nama-percobaan')` di console.
 *  4. Lakukan aksi yang mau diukur (mis. ketik akun dan PIN, tekan Masuk; atau pindah tab lalu kembali).
 *  5. Diam 2 detik setelah layar terasa "siap". Ringkasan tercetak OTOMATIS begitu tidak ada permintaan Supabase baru
 *     selama 1,5 detik (anggap boot selesai). Atau panggil `ukurSelesai()` kapan saja untuk mengakhiri manual.
 *  6. Ulangi (`ukurMulai(...)` lagi) untuk aksi lain: masuk dingin, masuk hangat, kembali ke tab, dst.
 *  7. `ukurRingkasan()` menampilkan semua percobaan yang sudah direkam pada sesi ini; `ukurCsv()` mencetak CSV siap
 *     ditempel ke Excel/Sheets untuk dikirim balik.
 */
(() => {
  const SUPA = /supabase\.co\//;
  const percobaan = (window.__ukurSigarda ??= { daftar: [], aktif: null });

  function mulai(nama = `percobaan-${percobaan.daftar.length + 1}`) {
    if (percobaan.aktif) selesai();
    const rec = { nama, mulai: performance.now(), waktuJam: new Date().toISOString(), req: [], timer: null };
    percobaan.aktif = rec;
    const amati = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!SUPA.test(e.name)) continue;
        rec.req.push({
          url: e.name.replace(/^https?:\/\/[^/]+/, '').slice(0, 80),
          durasiMs: Math.round(e.duration),
          transferB: Math.round(e.transferSize || 0), // byte yang lewat kabel (terkompresi + tajuk)
          asliB: Math.round(e.decodedBodySize || 0), // byte badan jawaban setelah diuraikan (tanpa kompresi)
        });
        clearTimeout(rec.timer);
        rec.timer = setTimeout(selesai, 1500); // 1,5 detik tanpa permintaan baru = anggap boot selesai
      }
    });
    amati.observe({ type: 'resource', buffered: true });
    rec._amati = amati;
    console.log(`[ukur] "${nama}" mulai merekam. Lakukan aksi yang diukur sekarang.`);
    return rec;
  }

  function ringkasSatu(rec) {
    const n = rec.req.length;
    const transfer = rec.req.reduce((a, x) => a + x.transferB, 0);
    const asli = rec.req.reduce((a, x) => a + x.asliB, 0);
    const lamaMs = Math.round((rec.selesai ?? performance.now()) - rec.mulai);
    const kompresi = asli > 0 ? (1 - transfer / asli) * 100 : 0;
    return { nama: rec.nama, waktuJam: rec.waktuJam, lamaMs, permintaan: n, transferKB: +(transfer / 1024).toFixed(1), asliKB: +(asli / 1024).toFixed(1), kompresiPersen: +kompresi.toFixed(0) };
  }

  function selesai() {
    const rec = percobaan.aktif;
    if (!rec) return console.log('[ukur] tidak ada percobaan yang sedang berjalan.');
    clearTimeout(rec.timer);
    rec._amati.disconnect();
    rec.selesai = performance.now();
    percobaan.aktif = null;
    percobaan.daftar.push(rec);
    const r = ringkasSatu(rec);
    console.log(`[ukur] "${r.nama}" SELESAI: ${(r.lamaMs / 1000).toFixed(1)} dtk sejak mulai | ${r.permintaan} permintaan Supabase | ${r.transferKB} kB lewat kabel (${r.asliKB} kB asli, kompresi ${r.kompresiPersen}%)`);
    if (r.permintaan === 0) console.log('[ukur] PERHATIAN: tidak ada permintaan Supabase tercatat. Panggil ukurMulai() SEBELUM aksinya, dan pastikan halaman ini memang SIGARDA yang sudah tersambung.');
    return r;
  }

  function ringkasan() {
    const semua = percobaan.daftar.map(ringkasSatu);
    console.table(semua);
    return semua;
  }

  function csv() {
    const semua = percobaan.daftar.map(ringkasSatu);
    const baris = ['nama,waktuJam,lamaMs,permintaan,transferKB,asliKB,kompresiPersen', ...semua.map((r) => [r.nama, r.waktuJam, r.lamaMs, r.permintaan, r.transferKB, r.asliKB, r.kompresiPersen].join(','))];
    const teks = baris.join('\n');
    console.log(teks);
    return teks;
  }

  window.ukurMulai = mulai;
  window.ukurSelesai = selesai;
  window.ukurRingkasan = ringkasan;
  window.ukurCsv = csv;
  console.log('[ukur] Perekam siap. Panggil ukurMulai() lalu lakukan aksinya. ukurRingkasan() dan ukurCsv() melihat semua percobaan pada sesi ini.');
})();
