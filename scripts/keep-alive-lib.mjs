/**
 * Pustaka keep-alive Supabase (fungsi murni yang dapat diuji; lihat scripts/keep-alive.mjs untuk penjelasan dan cara pakai).
 * Dijaga uji/keep-alive.mjs.
 */
const FUNGSI = 'sg_gudep_publik';
const BATAS_WAKTU_MS = 15000;
const JEDA_ANTAR_PERCOBAAN_MS = 5000;

const tidur = (ms) => new Promise((selesai) => setTimeout(selesai, ms));

/** Alamat proyek yang sah: https, tanpa garis miring di akhir. Mengembalikan '' bila tidak sah. */
export function rapikanUrl(url) {
  const v = String(url ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(:\d+)?$/i.test(v) ? v : '';
}

/**
 * Satu putaran keep-alive: sampai `percobaan` kali panggilan. Galat jaringan dan 5xx dicoba ulang (proyek kadang lambat); 4xx TIDAK dicoba ulang
 * karena berarti pengaturan salah (kunci/alamat/fungsi), bukan gangguan sesaat. Mengembalikan { ok, status, percobaan, pesan }; tidak pernah melempar galat.
 */
export async function pingSupabase({ url, kunci, fetchFn = fetch, percobaan = 3, jeda = JEDA_ANTAR_PERCOBAAN_MS, tunggu = tidur } = {}) {
  const dasar = rapikanUrl(url);
  if (!dasar) return { ok: false, status: 0, percobaan: 0, pesan: 'Alamat proyek (VITE_SUPABASE_URL) kosong atau bukan alamat https yang sah.' };
  if (!String(kunci ?? '').trim()) return { ok: false, status: 0, percobaan: 0, pesan: 'Kunci anon/publishable (VITE_SUPABASE_ANON_KEY) kosong.' };

  const alamat = `${dasar}/rest/v1/rpc/${FUNGSI}`;
  let terakhir = { status: 0, pesan: '' };
  for (let ke = 1; ke <= percobaan; ke++) {
    const pembatal = new AbortController();
    const timer = setTimeout(() => pembatal.abort(), BATAS_WAKTU_MS);
    try {
      const res = await fetchFn(alamat, {
        method: 'POST',
        headers: { apikey: kunci, Authorization: `Bearer ${kunci}`, 'Content-Type': 'application/json' },
        body: '{}',
        signal: pembatal.signal,
      });
      if (res.ok) {
        let isi = null;
        try { isi = await res.json(); } catch { /* tetap dianggap gagal di bawah */ }
        if (isi && typeof isi === 'object') return { ok: true, status: res.status, percobaan: ke, pesan: `Database menjawab (HTTP ${res.status}).` };
        terakhir = { status: res.status, pesan: `HTTP ${res.status} tetapi isinya bukan JSON yang diharapkan (mungkin bukan proyek Supabase yang benar).` };
      } else if (res.status >= 400 && res.status < 500) {
        const petunjuk = res.status === 401 || res.status === 403 ? 'kunci anon salah atau dicabut'
          : res.status === 404 ? `fungsi ${FUNGSI} tidak ditemukan (skema belum terpasang atau alamat proyek salah)` : 'permintaan ditolak';
        return { ok: false, status: res.status, percobaan: ke, pesan: `HTTP ${res.status}: ${petunjuk}. Periksa variabel Supabase di GitHub; tidak dicoba ulang.` };
      } else {
        terakhir = { status: res.status, pesan: `HTTP ${res.status}: proyek belum siap atau terjeda (paused).` };
      }
    } catch (e) {
      terakhir = { status: 0, pesan: e?.name === 'AbortError' ? `Tidak menjawab dalam ${BATAS_WAKTU_MS / 1000} detik.` : `Galat jaringan: ${e?.message ?? e}` };
    } finally {
      clearTimeout(timer);
    }
    if (ke < percobaan) await tunggu(jeda);
  }
  return { ok: false, status: terakhir.status, percobaan, pesan: `${terakhir.pesan} (sudah ${percobaan} kali dicoba). Bila proyek terjeda, pulihkan lewat Dashboard Supabase (Restore project).` };
}

/** Membaca pengaturan dari lingkungan, memanggil pingSupabase, dan mencetak hasil. Mengembalikan kode keluar (0 = berhasil). */
export async function jalankan(env = process.env, { fetchFn = fetch, cetak = console.log, cetakGalat = console.error, ...opsi } = {}) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const kunci = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  const r = await pingSupabase({ url, kunci, fetchFn, ...opsi });
  if (r.ok) { cetak(`Keep-alive Supabase berhasil: ${r.pesan} (percobaan ke-${r.percobaan}).`); return 0; }
  cetakGalat(`Keep-alive Supabase GAGAL: ${r.pesan}`);
  return 1;
}
