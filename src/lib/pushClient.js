/**
 * WEB PUSH DI PERANGKAT INI (peramban). Semua akses ke API peramban ada di sini agar mudah diuji (`env` dapat diganti) dan tidak pernah melempar galat
 * ke halaman: hasilnya { ok, pesan }. Dijaga oleh uji/notifikasi-klien.mjs.
 *
 * Perilaku Keluar (keputusan pemilik): menekan Keluar MENGHAPUS langganan perangkat ini di server dan di peramban, sehingga notifikasi berhenti di HP
 * bersama. Siswa yang hanya menutup tab tetap menerima. Saat masuk lagi di perangkat yang sama, langganan diaktifkan kembali otomatis (izin sudah
 * ada) dan endpoint dialihkan ke akun yang masuk terakhir.
 */

/** Kunci VAPID (base64url) -> Uint8Array untuk pushManager.subscribe. */
export function urlBase64KeBytes(b64) {
  const isi = String(b64 ?? '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(isi + '='.repeat((4 - (isi.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const iosPerangkat = (nav) => /iPhone|iPad|iPod/.test(nav?.userAgent ?? '') || (nav?.platform === 'MacIntel' && (nav?.maxTouchPoints ?? 0) > 1);

/**
 * Keadaan perangkat ini terhadap notifikasi:
 *  dukung        peramban punya Service Worker, Push, dan Notification
 *  perluPasang   iPhone/iPad: push hanya jalan bila aplikasi sudah "Tambah ke Layar Utama" dan dibuka dari sana (iOS 16.4+)
 *  terpasang     berjalan sebagai aplikasi terpasang (standalone)
 *  izin          'default' | 'granted' | 'denied' | 'tidak-ada'
 */
export function keadaanPush(env = globalThis) {
  const nav = env.navigator ?? {};
  const terpasang = !!(env.matchMedia?.('(display-mode: standalone)')?.matches || nav.standalone);
  const ios = iosPerangkat(nav);
  const punyaApi = 'serviceWorker' in nav && 'PushManager' in env && 'Notification' in env;
  return {
    dukung: punyaApi && !(ios && !terpasang),
    perluPasang: ios && !terpasang,
    ios,
    terpasang,
    izin: 'Notification' in env ? env.Notification.permission : 'tidak-ada',
    punyaApi,
  };
}

/** Mendaftarkan service worker (sekali; aman dipanggil berulang). base = import.meta.env.BASE_URL. */
export async function daftarkanSW(base = '/', env = globalThis) {
  if (!('serviceWorker' in (env.navigator ?? {}))) return null;
  try {
    return await env.navigator.serviceWorker.register(`${base}sw.js`, { scope: base });
  } catch {
    return null;
  }
}

const bentukLangganan = (sub, env) => {
  const j = sub.toJSON();
  return { endpoint: j.endpoint, p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '', agen: String(env.navigator?.userAgent ?? '').slice(0, 200) };
};

/** Service worker yang terdaftar (menunggu aktif) dan langganan push-nya; keduanya null bila service worker belum didaftarkan (mis. mode lokal). */
async function langgananSaatIni(env) {
  const terdaftar = await env.navigator.serviceWorker.getRegistration();
  if (!terdaftar) return { reg: null, sub: null };
  const reg = await env.navigator.serviceWorker.ready;
  return { reg, sub: await reg.pushManager.getSubscription() };
}

/**
 * Meminta izin lalu mendaftarkan perangkat ini. `api` = objek dari buatApi (kunciPush, simpanPush). Dipanggil dari ketukan tombol
 * (iOS mewajibkan izin diminta dari gerakan pengguna).
 */
export async function aktifkanPush(api, env = globalThis) {
  const k = keadaanPush(env);
  if (k.perluPasang) return { ok: false, pesan: 'Di iPhone atau iPad, pasang dulu aplikasinya: ketuk tombol Bagikan di Safari, pilih "Tambah ke Layar Utama", lalu buka SIGARDA dari layar utama.' };
  if (!k.dukung) return { ok: false, pesan: 'Peramban ini belum mendukung notifikasi. Coba Chrome atau Edge terbaru.' };
  if (k.izin === 'denied') return { ok: false, pesan: 'Notifikasi diblokir untuk situs ini. Buka pengaturan situs di peramban, izinkan Notifikasi, lalu coba lagi.' };
  const kunci = await api.kunciPush();
  if (!kunci.ok) return { ok: false, pesan: kunci.pesan };
  if (!kunci.data) return { ok: false, pesan: 'Notifikasi push belum diaktifkan di server oleh Admin. Notifikasi tetap tampil di dalam aplikasi.' };
  try {
    const izin = await env.Notification.requestPermission();
    if (izin !== 'granted') return { ok: false, pesan: 'Izin notifikasi tidak diberikan.' };
    const { reg, sub } = await langgananSaatIni(env);
    if (!reg) return { ok: false, pesan: 'Aplikasi belum siap menerima notifikasi di perangkat ini. Muat ulang halaman lalu coba lagi.' };
    const baru = sub ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64KeBytes(kunci.data) });
    const simpan = await api.simpanPush(bentukLangganan(baru, env));
    return simpan.ok ? { ok: true } : { ok: false, pesan: simpan.pesan };
  } catch (e) {
    return { ok: false, pesan: `Gagal mengaktifkan notifikasi: ${e?.message ?? e}` };
  }
}

/** Mematikan notifikasi di perangkat ini: hapus di server, lalu berhenti berlangganan di peramban. */
export async function nonaktifkanPush(api, env = globalThis) {
  try {
    const { sub } = await langgananSaatIni(env);
    if (!sub) return { ok: true };
    const hapus = await api.hapusPush(sub.endpoint);
    await sub.unsubscribe();
    return hapus.ok ? { ok: true } : { ok: false, pesan: hapus.pesan };
  } catch (e) {
    return { ok: false, pesan: `Gagal mematikan notifikasi: ${e?.message ?? e}` };
  }
}

/** Apakah perangkat ini sedang berlangganan? (untuk saklar di layar) */
export async function sudahBerlangganan(env = globalThis) {
  try {
    if (!keadaanPush(env).punyaApi) return false;
    const { sub } = await langgananSaatIni(env);
    return !!sub;
  } catch {
    return false;
  }
}

/**
 * Saat masuk: bila izin sudah diberikan sebelumnya (dan server siap), aktifkan kembali langganan perangkat ini untuk akun yang masuk.
 * Tanpa izin atau tanpa dukungan: tidak melakukan apa-apa (tidak pernah memunculkan permintaan izin sendiri).
 */
export async function pulihkanPush(api, env = globalThis) {
  try {
    const k = keadaanPush(env);
    if (!k.dukung || k.izin !== 'granted') return { ok: true, diaktifkan: false };
    const kunci = await api.kunciPush();
    if (!kunci.ok || !kunci.data) return { ok: true, diaktifkan: false };
    const { reg, sub } = await langgananSaatIni(env);
    if (!reg) return { ok: true, diaktifkan: false };
    const baru = sub ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64KeBytes(kunci.data) });
    const simpan = await api.simpanPush(bentukLangganan(baru, env));
    return { ok: simpan.ok, diaktifkan: simpan.ok };
  } catch {
    return { ok: false, diaktifkan: false };
  }
}

/**
 * Saat Keluar: hentikan notifikasi di perangkat ini. Dibatasi waktu (`batasMs`) agar Keluar tidak tertahan koneksi yang buruk; bila gagal,
 * langganan dialihkan ke akun berikutnya yang masuk di perangkat ini (endpoint unik).
 */
export async function berhentiPushPerangkat(api, env = globalThis, batasMs = 4000) {
  if (!keadaanPush(env).punyaApi) return { ok: true };
  let pewaktu;
  const batas = new Promise((selesai) => { pewaktu = setTimeout(() => selesai({ ok: false, pesan: 'waktu habis' }), batasMs); });
  try {
    return await Promise.race([nonaktifkanPush(api, env), batas]);
  } finally {
    clearTimeout(pewaktu);
  }
}
