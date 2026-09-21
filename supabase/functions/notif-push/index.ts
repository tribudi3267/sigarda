// ============================================================================
// SIGARDA: Edge Function `notif-push` (pengirim Web Push)
//
// Dipanggil basis data (pg_net, lewat pemicu sigarda.push_antre) setiap ada notifikasi baru untuk penerima yang punya perangkat terdaftar:
//   POST { "ids": [id notifikasi, ...] }   dengan header  x-sigarda-rahasia: <rahasia bersama>
// Fungsi ini membaca notifikasi dan perangkat penerimanya (sg_push_ambil_internal), mengirim Web Push berenkripsi ke tiap perangkat, lalu mencatat
// hasilnya (sg_push_hasil_internal): status dikirim atau gagal, dan perangkat yang sudah tidak berlaku (404 atau 410) dihapus.
// Isi push singkat: { id, judul, isi }. Tidak pernah memuat hasil penilaian.
//
// Secret yang diperlukan (Edge Functions > Secrets):
//   NOTIF_RAHASIA   rahasia bersama, sama dengan yang diberikan ke sigarda.push_atur (minimal 16 karakter)
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   pasangan kunci VAPID (dibuat dengan: npx web-push generate-vapid-keys)
//   VAPID_SUBJECT   alamat kontak, mis. mailto:admin@sekolah.sch.id
// Deploy: lihat README bagian "Notifikasi dan PWA". Matikan "Verify JWT" (pemanggilnya basis data, bukan pengguna; pemeriksaan memakai rahasia bersama).
// Berkas ini SENGAJA satu berkas agar bisa ditempel di editor dashboard Supabase. Logika (tangani) tidak bergantung pada Deno dan diuji.
// ============================================================================

// deno-lint-ignore-file no-explicit-any
// Harus import tetap (bukan import() dinamis): runtime Supabase hanya mengemas pustaka yang terlihat saat deploy.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

declare const Deno: any;

const MAKS_IDS = 200;
const TTL_DETIK = 60 * 60 * 24; // push yang tidak sempat sampai dalam sehari dibuang (pengingat lama tidak berguna)

/** Perbandingan waktu-tetap agar rahasia tidak dapat ditebak lewat lama pemeriksaan. */
export function samaAman(a: string, b: string) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let selisih = 0;
  for (let i = 0; i < a.length; i++) selisih |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return selisih === 0;
}

/** Isi push yang dikirim ke perangkat (JSON). Dibaca public/sw.js. */
export const susunPayload = (n: any) => JSON.stringify({ id: n.id, judul: String(n.judul ?? 'SIGARDA').slice(0, 120), isi: String(n.isi ?? '').slice(0, 300) });

export type Deps = {
  rahasia: string;
  ambil: (ids: number[]) => Promise<any[]>;                        // sg_push_ambil_internal
  kirim: (langganan: any, payload: string) => Promise<void>;      // melempar galat dengan statusCode bila ditolak layanan push
  catat: (hasil: { status: any[]; hapus: number[] }) => Promise<void>; // sg_push_hasil_internal
};

/** Tanggap: { status: kode HTTP, isi: objek JSON }. */
export async function tangani(metode: string, rahasiaKiriman: string | null, body: any, d: Deps) {
  if (metode !== 'POST') return { status: 405, isi: { ok: false, pesan: 'Gunakan POST.' } };
  if (!d.rahasia || d.rahasia.length < 16 || !samaAman(String(rahasiaKiriman ?? ''), d.rahasia)) return { status: 401, isi: { ok: false, pesan: 'Tidak diizinkan.' } };
  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.map(Number))].filter((x: number) => Number.isInteger(x) && x > 0) : [];
  if (!ids.length || ids.length > MAKS_IDS) return { status: 400, isi: { ok: false, pesan: `ids harus berisi 1 sampai ${MAKS_IDS} nomor notifikasi.` } };

  const daftar = await d.ambil(ids);
  const status: any[] = [];
  const hapus = new Set<number>();
  let terkirim = 0;
  for (const n of daftar) {
    const payload = susunPayload(n);
    const hasil = await Promise.allSettled((n.langganan ?? []).map((l: any) => d.kirim(l, payload)));
    let sukses = 0;
    hasil.forEach((h, i) => {
      if (h.status === 'fulfilled') { sukses += 1; return; }
      const kode = (h.reason as any)?.statusCode;
      if (kode === 404 || kode === 410) hapus.add(n.langganan[i].id); // perangkat sudah mencabut langganan (Keluar, hapus data situs, uninstall)
    });
    terkirim += sukses;
    status.push({ id: n.id, status: sukses > 0 ? 'dikirim' : 'gagal' });
  }
  await d.catat({ status, hapus: [...hapus] });
  return { status: 200, isi: { ok: true, notifikasi: daftar.length, terkirim, dihapus: hapus.size } };
}

/* ============================================================================
 * Sambungan ke Supabase dan layanan push (hanya berjalan di Deno / Supabase Edge Functions)
 * ========================================================================== */

let depsDeno: Deps | null = null;
function ambilDepsDeno(): Deps {
  if (depsDeno) return depsDeno;
  const url = Deno.env.get('SUPABASE_URL');
  const layanan = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const rahasia = Deno.env.get('NOTIF_RAHASIA');
  const pub = Deno.env.get('VAPID_PUBLIC_KEY');
  const priv = Deno.env.get('VAPID_PRIVATE_KEY');
  const subjek = Deno.env.get('VAPID_SUBJECT');
  // Periksa lebih dulu agar penyebabnya jelas di log, bukan "500 Internal Server Error".
  for (const [nama, nilai] of [['SUPABASE_URL', url], ['SUPABASE_SERVICE_ROLE_KEY', layanan], ['NOTIF_RAHASIA', rahasia], ['VAPID_PUBLIC_KEY', pub], ['VAPID_PRIVATE_KEY', priv], ['VAPID_SUBJECT', subjek]]) {
    if (!nilai) throw new Error(`${nama} belum diatur pada fungsi (Edge Functions > Secrets).`);
  }
  webpush.setVapidDetails(subjek, pub, priv);
  const db = createClient(url, layanan, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const panggil = async (fn: string, args: any) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  };
  depsDeno = {
    rahasia,
    ambil: (ids) => panggil('sg_push_ambil_internal', { p_ids: ids }),
    kirim: async (l, payload) => {
      await webpush.sendNotification({ endpoint: l.endpoint, keys: { p256dh: l.p256dh, auth: l.auth } }, payload, { TTL: TTL_DETIK, urgency: 'normal' });
    },
    catat: (hasil) => panggil('sg_push_hasil_internal', { p_hasil: hasil }),
  };
  return depsDeno;
}

if (typeof Deno !== 'undefined' && Deno.serve) {
  Deno.serve(async (req: Request) => {
    let body: any = {};
    try { body = await req.json(); } catch { /* badan kosong */ }
    let hasil: { status: number; isi: any };
    try {
      hasil = await tangani(req.method, req.headers.get('x-sigarda-rahasia'), body, ambilDepsDeno());
    } catch (e: any) {
      hasil = { status: 500, isi: { ok: false, pesan: `Fungsi notif-push belum siap: ${e?.message ?? e}` } };
    }
    return new Response(JSON.stringify(hasil.isi), { status: hasil.status, headers: { 'Content-Type': 'application/json' } });
  });
}
