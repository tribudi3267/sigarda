/* SIGARDA service worker.
 * Tugasnya HANYA dua: menampilkan notifikasi push dan membuka aplikasi saat notifikasi diketuk. Sengaja TIDAK ada fetch handler dan TIDAK menyimpan
 * (cache) apa pun: data (Supabase) tidak pernah tersimpan di perangkat, dan halaman selalu versi terbaru dari server.
 * Isi push dari Edge Function notif-push: { id, judul, isi } (singkat, tanpa hasil penilaian). */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    d = { judul: 'SIGARDA', isi: event.data ? event.data.text() : '' };
  }
  const ikon = new URL('ikon-192.png', self.registration.scope).href;
  event.waitUntil((async () => {
    await self.registration.showNotification(d.judul || 'SIGARDA', {
      body: d.isi || '',
      icon: ikon,
      tag: d.id ? 'sigarda-' + d.id : undefined,
      data: { id: d.id || null },
    });
    // Aplikasi yang sedang terbuka memuat kembali Kotak Notifikasi-nya.
    const jendela = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    jendela.forEach((c) => c.postMessage({ type: 'notifikasi-baru' }));
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const jendela = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of jendela) {
      if ('focus' in c) {
        await c.focus();
        c.postMessage({ type: 'buka-notifikasi' });
        return;
      }
    }
    await self.clients.openWindow(new URL('./?buka=notifikasi', self.registration.scope).href);
  })());
});
