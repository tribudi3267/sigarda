// ============================================================================
// SIGARDA: Edge Function tunggal `sigarda`
//
// Menangani semua aksi yang butuh hak "admin" atas akun login, yang TIDAK boleh dilakukan dari browser:
//   masuk          login dengan nama pengguna + PIN, dibatasi 5 kali salah = kunci 5 menit (di server)
//   ganti-pin      pengguna mengganti PIN sendiri (PIN lama diperiksa, aturan PIN baru diterapkan di server)
//   reset-pin      pengurus mereset PIN (PIN acak 6 angka; hak reset sesuai matriks peran)
//   buat-akun      Admin membuat akun (satu atau banyak, dipakai import Excel)
//   hapus-akun     Admin menghapus akun
//   ubah-username  Admin mengubah nama pengguna (NIS untuk Penegak)
//   catat-hasil    penguji mencatat hasil uji SKU; PIN penguji diverifikasi di server. Bila body memuat `rincian`
//                  (nilai tiap kriteria), penilaian memakai instrumen dan skornya dihitung ulang di server.
//
// Deploy: lihat README bagian "Menghubungkan ke Supabase". Matikan "Verify JWT" pada fungsi ini
// (pemeriksaan sesi dilakukan di kode ini), karena kunci API baru Supabase bukan JWT.
//
// Berkas ini SENGAJA satu berkas agar bisa ditempel di editor dashboard Supabase.
// Logika murni (tangani) tidak bergantung pada Deno; sambungan ke Supabase ada di bagian paling bawah.
// ============================================================================

// deno-lint-ignore-file no-explicit-any
// Harus berupa import tetap (bukan import() dinamis): runtime Supabase hanya mengemas pustaka yang terlihat saat deploy.
// Pada mode lokal dan pengujian, alamat ini dialihkan ke paket @supabase/supabase-js yang terpasang (lihat vite.config.js).
import { createClient } from 'npm:@supabase/supabase-js@2';

declare const Deno: any;

// Domain email tiruan untuk akun login. `.invalid` = domain cadangan (RFC 2606) yang tidak pernah dapat menerima email,
// sehingga tidak ada pihak luar yang bisa mengambil alih akun lewat "lupa kata sandi". Bila Supabase menolaknya,
// atur secret SIGARDA_EMAIL_DOMAIN (dan buat ulang akun admin dengan domain yang sama).
export const EMAIL_DOMAIN: string =
  (typeof Deno !== 'undefined' && Deno.env?.get?.('SIGARDA_EMAIL_DOMAIN')) || 'sigarda.invalid';
const POLA_USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const POLA_PIN = /^\d{6}$/;
const AGAMA = ['Islam', 'Katolik', 'Protestan', 'Hindu', 'Buddha', 'Khonghucu'];
const MAKS_BARIS = 50;

export const emailDari = (username: string) => `${username}@${EMAIL_DOMAIN}`;
const normUser = (u: any) => String(u ?? '').trim().toLowerCase();
const rapikan = (t: any) => String(t ?? '').trim().replace(/\s+/g, ' ');

/* ------------------------------- Aturan PIN ------------------------------- */

export function pinLemah(pin: string) {
  if (!/^\d+$/.test(pin ?? '')) return false;
  const d = [...pin].map(Number);
  if (d.every((x) => x === d[0])) return true;
  const s = d.slice(1).map((x, i) => x - d[i]);
  return s.every((x) => x === 1) || s.every((x) => x === -1);
}

export function validasiPinBaru(pinBaru: any, pinLama: any, ulangi: any) {
  if (!POLA_PIN.test(String(pinBaru ?? ''))) return 'PIN baru harus 6 angka.';
  if (pinLemah(pinBaru)) return 'PIN terlalu mudah ditebak (angka sama semua atau berurutan). Pilih kombinasi lain.';
  if (pinBaru === pinLama) return 'PIN baru tidak boleh sama dengan PIN lama.';
  if (ulangi !== undefined && pinBaru !== ulangi) return 'Konfirmasi PIN baru tidak sama.';
  return null;
}

export function buatPinAcak(panjang = 6) {
  for (let percobaan = 0; percobaan < 50; percobaan++) {
    let pin = '';
    while (pin.length < panjang) {
      for (const b of crypto.getRandomValues(new Uint8Array(panjang * 2))) {
        if (b < 250 && pin.length < panjang) pin += String(b % 10); // buang byte >= 250 agar tiap angka berpeluang sama
      }
    }
    if (!pinLemah(pin)) return pin;
  }
  return '739158';
}

/** Penegak aktif berjabatan Dewan Ambalan (Dewan = atribut akun Penegak). */
export const penegakDewan = (u: any) => !!u && u.role === 'peserta' && !!u.jabatan_dewan && (u.status ?? 'aktif') === 'aktif';

/**
 * Admin -> semua selain admin. Pembina -> Penegak dan Dewan Ambalan. Dewan Ambalan (akun lama atau Penegak berjabatan Dewan) -> Penegak.
 * Tidak ada yang mereset dirinya sendiri.
 */
export function bolehResetPin(aktor: any, target: any) {
  if (!aktor || !target || aktor.id === target.id) return false;
  if (aktor.role === 'admin') return target.role !== 'admin';
  if (aktor.role === 'penguji' && aktor.jabatan === 'Pembina') {
    return target.role === 'peserta' || (target.role === 'penguji' && target.jabatan === 'Dewan Ambalan');
  }
  if (aktor.role === 'penguji' && aktor.jabatan === 'Dewan Ambalan') return target.role === 'peserta';
  if (penegakDewan(aktor)) return target.role === 'peserta';
  return false;
}

/* ---------------------------- Nama pengguna ---------------------------- */

export function slugUsername(nama: string) {
  let s = String(nama ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')
    .slice(0, 24).replace(/\.+$/, '');
  if (s.length < 3) s = (s + '.anggota').slice(0, 24);
  return s;
}
const kandidat = (dasar: string) => [dasar, ...Array.from({ length: 30 }, (_, i) => `${dasar}${i + 2}`)];

/* --------------------------------- Tanggap -------------------------------- */

const gagal = (pesan: string, tambahan: any = {}) => ({ ok: false, pesan, ...tambahan });
const pesanKunci = (menit: number) => `Terlalu banyak percobaan salah. Coba lagi ${menit} menit lagi, atau minta reset PIN.`;
const GENERIK = 'Nama pengguna atau PIN tidak sesuai.';
// Semua percobaan masuk berasal dari satu alamat (Edge Function), sehingga batas per-IP Supabase Auth dapat tercapai
// bila banyak orang masuk bersamaan. Lihat README, bagian "Batas percobaan masuk".
const PESAN_BATAS = 'Server sedang menerima terlalu banyak percobaan masuk. Tunggu beberapa menit lalu coba lagi.';

async function panggil(d: any, fn: string, args: any) {
  const { data, error } = await d.db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

async function gagalMasuk(d: any, username: string, awalan: string) {
  const r = await panggil(d, 'sg_kunci_gagal_internal', { p_username: username });
  if (r?.terkunci) return gagal(`PIN salah 5 kali. Akun dikunci sementara ${r.menit} menit. Coba lagi nanti atau minta reset PIN.`, { terkunci: true });
  return gagal(`${awalan} Sisa ${r?.sisa} percobaan sebelum akun dikunci sementara.`);
}

async function profilDari(d: any, token: string | null) {
  if (!token) return null;
  const u = await d.verifikasiToken(token);
  if (!u?.id) return null;
  const { data } = await d.db.from('profiles').select('*').eq('id', u.id).maybeSingle();
  return data ?? null;
}

/* --------------------------------- Aksi --------------------------------- */

async function aksiMasuk(b: any, d: any) {
  const username = normUser(b.username);
  const pin = String(b.pin ?? '');
  if (!POLA_USERNAME.test(username)) return gagal(GENERIK);

  const menit = await panggil(d, 'sg_kunci_cek_internal', { p_username: username });
  if (menit > 0) return gagal(pesanKunci(menit), { terkunci: true });

  const sesi = POLA_PIN.test(pin) ? await d.masukDenganPassword(emailDari(username), pin) : null;
  if (sesi?.terbatas) return gagal(PESAN_BATAS);   // batas Supabase Auth, bukan PIN salah: jangan dihitung
  if (!sesi) return gagalMasuk(d, username, GENERIK);
  await panggil(d, 'sg_kunci_lepas_internal', { p_username: username });
  return { ok: true, session: { access_token: sesi.access_token, refresh_token: sesi.refresh_token } };
}

async function aksiGantiPin(b: any, me: any, d: any) {
  const galat = validasiPinBaru(b.pinBaru, b.pinLama, b.ulangi);
  if (galat) return gagal(galat);
  const menit = await panggil(d, 'sg_kunci_cek_internal', { p_username: me.username });
  if (menit > 0) return gagal(pesanKunci(menit), { terkunci: true });

  const benar = POLA_PIN.test(String(b.pinLama ?? '')) ? await d.masukDenganPassword(emailDari(me.username), String(b.pinLama)) : null;
  if (benar?.terbatas) return gagal(PESAN_BATAS);
  if (!benar) return gagalMasuk(d, me.username, 'PIN lama tidak sesuai.');

  const err = await d.admin.ubahPassword(me.id, b.pinBaru);
  if (err) return gagal('PIN baru belum dapat disimpan. Coba lagi.');
  await d.db.from('profiles').update({ wajib_ganti_pin: false, pin_diubah: new Date(d.sekarang()).toISOString() }).eq('id', me.id);
  await panggil(d, 'sg_kunci_lepas_internal', { p_username: me.username });
  return { ok: true };
}

async function aksiResetPin(b: any, me: any, d: any) {
  const { data: target } = await d.db.from('profiles').select('*').eq('id', b.targetId).maybeSingle();
  if (!target) return gagal('Anggota tidak ditemukan.');
  if (!bolehResetPin(me, target)) return gagal('Anda tidak berwenang mereset PIN anggota ini.');
  const pin = buatPinAcak();
  const err = await d.admin.ubahPassword(target.id, pin);
  if (err) return gagal('PIN belum dapat direset. Coba lagi.');
  await d.db.from('profiles').update({
    wajib_ganti_pin: true, pin_direset_oleh: me.id, pin_direset_pada: new Date(d.sekarang()).toISOString(),
  }).eq('id', target.id);
  await panggil(d, 'sg_kunci_lepas_internal', { p_username: target.username });
  return { ok: true, pin, nama: target.nama };
}

const KELOMPOK: any = {
  peserta: { role: 'peserta', jabatan: null, label: 'Penegak' },
  dewan: { role: 'penguji', jabatan: 'Dewan Ambalan', label: 'Dewan Ambalan' },
  pembina: { role: 'penguji', jabatan: 'Pembina', label: 'Pembina' },
  admin: { role: 'admin', jabatan: 'Admin Gudep', label: 'Admin Gudep' },
};

async function aksiBuatAkun(b: any, me: any, d: any) {
  if (me.role !== 'admin') return gagal('Hanya Admin Gudep yang dapat membuat akun.');
  const k = KELOMPOK[b.kelompok];
  if (!k) return gagal('Kelompok anggota tidak dikenal.');
  const baris: any[] = Array.isArray(b.baris) ? b.baris : [];
  if (!baris.length) return gagal('Tidak ada data untuk dibuat.');
  if (baris.length > MAKS_BARIS) return gagal(`Maksimal ${MAKS_BARIS} akun per permintaan.`);

  // Nama pengguna yang dipakai: Penegak = NIS; lainnya = isian sendiri atau dibuat dari nama.
  const rencana = baris.map((r) => {
    if (k.role === 'peserta') return { dasar: normUser(r.nis), tetap: true };
    const sendiri = normUser(r.username);
    return sendiri ? { dasar: sendiri, tetap: true } : { dasar: slugUsername(rapikan(r.nama)), tetap: false };
  });
  const semuaKandidat = [...new Set(rencana.flatMap((p) => (p.tetap ? [p.dasar] : kandidat(p.dasar))))].filter(Boolean);
  const { data: ada } = await d.db.from('profiles').select('username').in('username', semuaKandidat);
  const terpakai = new Set<string>((ada ?? []).map((x: any) => x.username));

  const hasil: any[] = [];
  for (let i = 0; i < baris.length; i++) {
    const r = baris[i];
    const no = r.no ?? i + 1;
    const tolak = (pesan: string) => hasil.push({ no, ok: false, pesan });

    const nama = rapikan(r.nama);
    if (!nama) { tolak('Nama kosong'); continue; }
    if (nama.length > 120) { tolak('Nama maksimal 120 karakter'); continue; }

    let username = rencana[i].dasar;
    if (k.role === 'peserta') {
      if (!username) { tolak('NIS wajib diisi (NIS menjadi nama pengguna untuk masuk)'); continue; }
      if (!POLA_USERNAME.test(username)) { tolak('NIS harus 3 sampai 32 karakter huruf/angka'); continue; }
      if (!rapikan(r.kelas)) { tolak('Kelas kosong'); continue; }
      // Hanya NIS dan rombel yang wajib. Sangga dan agama boleh kosong (Tahap 3, H1): sangga dibagi Pembina/Bina Damping, agama diisi Penegak sendiri; bila agama diisi harus dikenal.
      if (rapikan(r.agama) && !AGAMA.includes(r.agama)) { tolak('Agama tidak dikenal'); continue; }
      if (terpakai.has(username)) { tolak('NIS sudah terdaftar'); continue; }
    } else if (rencana[i].tetap) {
      if (!POLA_USERNAME.test(username)) { tolak('Nama pengguna harus 3 sampai 32 karakter: huruf kecil, angka, titik, garis bawah, atau strip'); continue; }
      if (terpakai.has(username)) { tolak('Nama pengguna sudah dipakai'); continue; }
    } else {
      const bebas = kandidat(username).find((c) => !terpakai.has(c));
      if (!bebas) { tolak('Tidak dapat membuat nama pengguna otomatis dari nama ini. Isi nama pengguna sendiri.'); continue; }
      username = bebas;
    }

    const pinAwal = String(r.pin ?? '').trim();
    if (pinAwal && (!POLA_PIN.test(pinAwal) || pinLemah(pinAwal))) { tolak('PIN awal harus 6 angka dan tidak boleh sama semua atau berurutan'); continue; }
    const pin = pinAwal || buatPinAcak();

    const akun = await d.admin.buatAkun(emailDari(username), pin);
    if (akun.galat || !akun.id) { tolak(/already|registered|exists/i.test(akun.galat ?? '') ? 'Nama pengguna sudah dipakai' : `Akun belum dapat dibuat: ${akun.galat ?? 'galat tidak dikenal'}`); continue; }

    const { error } = await d.db.rpc('sg_profil_buat_internal', {
      p_id: akun.id, p_username: username, p_role: k.role, p_nama: nama,
      p_nis: k.role === 'peserta' ? username : '', p_kelas: rapikan(r.kelas), p_sangga: rapikan(r.sangga),
      p_agama: k.role === 'peserta' ? rapikan(r.agama) : '', p_jabatan: k.jabatan ?? '',
    });
    if (error) {
      await d.admin.hapusAkun(akun.id); // batalkan agar tidak ada akun tanpa profil
      tolak(/duplicate|unique/i.test(error.message) ? 'Data ganda (NIS atau nama pengguna sudah terdaftar)' : `Profil belum dapat dibuat: ${error.message}`);
      continue;
    }
    terpakai.add(username);
    hasil.push({ no, ok: true, id: akun.id, nama, username, pin, kelas: rapikan(r.kelas), sangga: rapikan(r.sangga), agama: rapikan(r.agama) });
  }
  return { ok: true, hasil };
}

async function aksiHapusAkun(b: any, me: any, d: any) {
  if (me.role !== 'admin') return gagal('Hanya Admin Gudep yang dapat menghapus akun.');
  if (b.targetId === me.id) return gagal('Anda tidak bisa menghapus akun yang sedang dipakai.');
  const { data: target } = await d.db.from('profiles').select('id').eq('id', b.targetId).maybeSingle();
  if (!target) return gagal('Anggota tidak ditemukan.');
  const err = await d.admin.hapusAkun(target.id);
  if (err) return gagal('Akun belum dapat dihapus. Coba lagi.');
  return { ok: true };
}

async function aksiUbahUsername(b: any, me: any, d: any) {
  if (me.role !== 'admin') return gagal('Hanya Admin Gudep yang dapat mengubah nama pengguna.');
  const baru = normUser(b.username);
  if (!POLA_USERNAME.test(baru)) return gagal('Nama pengguna harus 3 sampai 32 karakter: huruf kecil, angka, titik, garis bawah, atau strip.');
  const { data: target } = await d.db.from('profiles').select('*').eq('id', b.targetId).maybeSingle();
  if (!target) return gagal('Anggota tidak ditemukan.');
  if (target.username === baru) return { ok: true };
  const { data: bentrok } = await d.db.from('profiles').select('id').eq('username', baru).maybeSingle();
  if (bentrok) return gagal('Nama pengguna itu sudah dipakai.');

  const err = await d.admin.ubahEmail(target.id, emailDari(baru));
  if (err) return gagal('Nama pengguna belum dapat diubah. Coba lagi.');
  const patch: any = { username: baru };
  if (target.role === 'peserta') patch.nis = baru; // NIS = nama pengguna Penegak
  const { error } = await d.db.from('profiles').update(patch).eq('id', target.id);
  if (error) {
    await d.admin.ubahEmail(target.id, emailDari(target.username)); // kembalikan
    return gagal('Nama pengguna belum dapat diubah. Coba lagi.');
  }
  return { ok: true };
}

async function aksiCatatHasil(b: any, me: any, d: any) {
  if (me.role !== 'penguji' && !penegakDewan(me)) return gagal('Hanya Pembina atau Dewan Ambalan yang dapat mencatat hasil.');
  const menit = await panggil(d, 'sg_kunci_cek_internal', { p_username: me.username });
  if (menit > 0) return gagal(pesanKunci(menit), { terkunci: true });
  const benar = POLA_PIN.test(String(b.pin ?? '')) ? await d.masukDenganPassword(emailDari(me.username), String(b.pin)) : null;
  if (benar?.terbatas) return gagal(PESAN_BATAS);
  if (!benar) {
    const r: any = await gagalMasuk(d, me.username, 'PIN verifikasi salah. Hasil belum disimpan.');
    return r;
  }
  await panggil(d, 'sg_kunci_lepas_internal', { p_username: me.username });

  // Penilaian dengan instrumen: nilai tiap kriteria dikirim, skor dan saran dihitung ulang di server.
  if (b.rincian !== undefined && b.rincian !== null && !Array.isArray(b.rincian)) return gagal('Nilai kriteria tidak sah.');
  if (Array.isArray(b.rincian)) {
    const { data, error: galatRubrik } = await d.db.rpc('sg_sku_catat_rubrik_internal', {
      p_oleh: me.id, p_peserta_id: b.pesertaId, p_sku_id: b.skuId, p_tanggal_uji: b.tanggalUji || null,
      p_rincian: b.rincian, p_hasil: b.hasil, p_catatan: b.catatan ?? '',
    });
    if (galatRubrik) return gagal(galatRubrik.message);
    return { ok: true, rubrik: true, hasil: data };
  }

  const { error } = await d.db.rpc('sg_sku_catat_internal', {
    p_oleh: me.id, p_peserta_id: b.pesertaId, p_sku_id: b.skuId, p_hasil: b.hasil,
    p_tanggal_uji: b.tanggalUji || null, p_nilai: b.nilai || null, p_catatan: b.catatan ?? '',
  });
  if (error) return gagal(error.message);
  return { ok: true };
}

/**
 * Titik masuk logika. `authHeader` = nilai header Authorization. `d` = ketergantungan (lihat bagian bawah
 * untuk Supabase, dan src/lokal untuk pengujian lokal).
 */
export async function tangani(body: any, authHeader: string | null, d: any) {
  try {
    const aksi = String(body?.aksi ?? '');
    if (aksi === 'masuk') return await aksiMasuk(body, d);

    const token = authHeader?.replace(/^Bearer\s+/i, '') ?? null;
    const me = await profilDari(d, token);
    if (!me) return gagal('Sesi berakhir. Masuk kembali.', { sesiBerakhir: true });
    // PIN awal / hasil reset wajib diganti dulu; selama itu hanya ganti-pin yang dilayani.
    if (me.wajib_ganti_pin && aksi !== 'ganti-pin') return gagal('Ganti PIN awal Anda lebih dulu sebelum memakai aplikasi.', { wajibGantiPin: true });

    switch (aksi) {
      case 'ganti-pin': return await aksiGantiPin(body, me, d);
      case 'reset-pin': return await aksiResetPin(body, me, d);
      case 'buat-akun': return await aksiBuatAkun(body, me, d);
      case 'hapus-akun': return await aksiHapusAkun(body, me, d);
      case 'ubah-username': return await aksiUbahUsername(body, me, d);
      case 'catat-hasil': return await aksiCatatHasil(body, me, d);
      default: return gagal('Aksi tidak dikenal.');
    }
  } catch (e: any) {
    return gagal(`Terjadi galat pada server: ${e?.message ?? e}`);
  }
}

/* ============================================================================
 * Sambungan ke Supabase (hanya berjalan di Deno / Supabase Edge Functions)
 * ========================================================================== */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

let depsDeno: any = null;
async function ambilDepsDeno() {
  if (depsDeno) return depsDeno;
  const url = Deno.env.get('SUPABASE_URL');
  // Biasanya sudah tersedia otomatis. Bila proyek Anda hanya memakai kunci API baru, isi secret SIGARDA_ANON_KEY
  // dengan kunci "publishable"/anon yang sama dengan VITE_SUPABASE_ANON_KEY.
  const anon = Deno.env.get('SIGARDA_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
  const layanan = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  // Periksa lebih dulu agar penyebabnya jelas di layar, bukan "500 Internal Server Error".
  if (!url) throw new Error('SUPABASE_URL tidak tersedia pada fungsi.');
  if (!layanan) throw new Error('SUPABASE_SERVICE_ROLE_KEY tidak tersedia pada fungsi.');
  if (!anon) throw new Error('Kunci anon tidak tersedia pada fungsi. Buat secret SIGARDA_ANON_KEY (Edge Functions > Secrets) berisi kunci publishable Anda.');
  const opsi = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const admin = createClient(url, layanan, opsi);

  depsDeno = {
    sekarang: () => Date.now(),
    db: admin,
    async verifikasiToken(token: string) {
      const { data, error } = await admin.auth.getUser(token);
      return error ? null : { id: data.user?.id };
    },
    async masukDenganPassword(email: string, pin: string) {
      const klien = createClient(url, anon, opsi);
      const { data, error } = await klien.auth.signInWithPassword({ email, password: pin });
      if (error && (error.status === 429 || /rate limit/i.test(error.message ?? '') || error.code === 'over_request_rate_limit')) {
        return { terbatas: true };
      }
      return error || !data.session ? null : { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
    },
    admin: {
      async buatAkun(email: string, pin: string) {
        const { data, error } = await admin.auth.admin.createUser({ email, password: pin, email_confirm: true });
        return error ? { galat: error.message } : { id: data.user.id };
      },
      async ubahPassword(id: string, pin: string) {
        const { error } = await admin.auth.admin.updateUserById(id, { password: pin });
        return error?.message ?? null;
      },
      async ubahEmail(id: string, email: string) {
        const { error } = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });
        return error?.message ?? null;
      },
      async hapusAkun(id: string) {
        const { error } = await admin.auth.admin.deleteUser(id);
        return error?.message ?? null;
      },
    },
  };
  return depsDeno;
}

if (typeof Deno !== 'undefined' && Deno.serve) {
  Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    let body: any = {};
    try { body = await req.json(); } catch { /* badan kosong */ }
    let hasil: any;
    try {
      hasil = await tangani(body, req.headers.get('Authorization'), await ambilDepsDeno());
    } catch (e: any) {
      // Galat konfigurasi fungsi (bukan salah pengguna): tampilkan sebabnya, jangan 500 kosong.
      hasil = { ok: false, pesan: `Fungsi server belum siap: ${e?.message ?? e}` };
    }
    return new Response(JSON.stringify(hasil), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  });
}
