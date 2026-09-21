// Pengganti npm:web-push@3.6.7 untuk pengujian Edge Function notif-push: perilakunya dikendalikan uji lewat globalThis.__webpush.
export default {
  setVapidDetails(...args) { (globalThis.__webpush ??= {}).vapid = args; },
  async sendNotification(langganan, payload, opsi) {
    const w = (globalThis.__webpush ??= {});
    (w.terkirim ??= []).push({ langganan, payload, opsi });
    if (w.tolak) { const e = w.tolak(langganan); if (e) throw e; }
    return { statusCode: 201 };
  },
};
