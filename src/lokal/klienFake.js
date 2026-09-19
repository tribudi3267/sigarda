/**
 * BACKEND LOKAL: klien bergaya supabase-js di atas Postgres sungguhan (PGlite).
 *
 * Dipakai untuk (1) pengujian otomatis dan (2) menjalankan aplikasi tanpa akun Supabase
 * (`npm run dev:lokal`). Skema SQL, aturan akses (RLS), fungsi sg_*, dan logika Edge Function
 * `sigarda` yang dijalankan di sini SAMA dengan yang dipakai Supabase sungguhan.
 *
 * Yang ditiru dari Supabase: peran anon/authenticated/service_role, auth.uid(), hasil JSON gaya PostgREST
 * (tanggal sebagai teks ISO), batas 1000 baris per permintaan, serta Auth (token dan kata sandi).
 * Yang TIDAK ditiru: PostgREST itu sendiri, GoTrue, dan runtime Deno.
 *
 * Hanya bagian minimal API supabase-js yang dipakai aplikasi: from().select().eq().in().order().range(),
 * from().update().eq(), rpc(), functions.invoke(), auth.setSession/getSession/signOut.
 */
import { tangani } from '../../supabase/functions/sigarda/index.ts';

const IDENT = /^[a-z_][a-z0-9_]*$/;
const PERAN = new Set(['anon', 'authenticated', 'service_role']);
export const MAKS_BARIS_POSTGREST = 1000;

const heks = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function hashPin(pin) {
  return heks(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`sigarda-lokal|${pin}`)));
}

/** Nilai parameter -> teks yang dipahami Postgres (array jadi literal {..}, objek jadi JSON). */
function parameter(v) {
  if (Array.isArray(v)) return `{${v.map((x) => `"${String(x).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
  if (v && typeof v === 'object') return JSON.stringify(v);
  return v;
}
const dariJson = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

async function jalankan(pg, konteks, sql, params = []) {
  if (!PERAN.has(konteks.role)) throw new Error(`peran tidak sah: ${konteks.role}`);
  return pg.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(konteks.sub ? { sub: konteks.sub, role: konteks.role } : { role: konteks.role }),
    ]);
    await tx.query(`set local role ${konteks.role}`);
    return tx.query(sql, params);
  });
}

const galat = (e) => ({ message: String(e?.message ?? e).replace(/^error:\s*/i, ''), code: e?.code });

class Bangun {
  constructor(pg, konteks, tabel) {
    if (!IDENT.test(tabel)) throw new Error('nama tabel tidak sah');
    Object.assign(this, { pg, konteks, tabel, op: 'select', kolom: '*', w: [], p: [], urut: [], a: null, b: null, satu: null });
  }
  select(kolom = '*') {
    if (kolom !== '*' && !/^[a-z_,\s]+$/.test(kolom)) throw new Error('kolom tidak sah');
    this.kolom = kolom;
    return this;
  }
  update(nilai) { this.op = 'update'; this.nilai = nilai; return this; }
  eq(k, v) { this.p.push(v); this.w.push(`${this.#id(k)} = $${this.p.length}`); return this; }
  in(k, arr) { this.p.push(parameter(arr)); this.w.push(`${this.#id(k)}::text = any($${this.p.length}::text[])`); return this; }
  order(k, { ascending = true } = {}) { this.urut.push(`${this.#id(k)} ${ascending ? 'asc' : 'desc'}`); return this; }
  range(a, b) { this.a = a; this.b = b; return this; }
  maybeSingle() { this.satu = 'maybe'; return this; }
  single() { this.satu = 'single'; return this; }
  #id(k) { if (!IDENT.test(k)) throw new Error('kolom tidak sah'); return k; }

  async #eksekusi() {
    const where = this.w.length ? ` where ${this.w.join(' and ')}` : '';
    if (this.op === 'update') {
      const kunci = Object.keys(this.nilai);
      const set = kunci.map((k, i) => `${this.#id(k)} = $${this.p.length + i + 1}`).join(', ');
      const sql = `with u as (update public.${this.tabel} set ${set}${where} returning *) select coalesce(json_agg(u), '[]'::json) as data from u`;
      const res = await jalankan(this.pg, this.konteks, sql, [...this.p, ...kunci.map((k) => parameter(this.nilai[k]))]);
      return dariJson(res.rows[0].data);
    }
    const urut = this.urut.length ? ` order by ${this.urut.join(', ')}` : '';
    const diminta = this.a === null ? MAKS_BARIS_POSTGREST : this.b - this.a + 1;
    const batas = ` limit ${Math.min(diminta, MAKS_BARIS_POSTGREST)} offset ${this.a ?? 0}`;
    const sql = `select coalesce(json_agg(t), '[]'::json) as data from (select ${this.kolom} from public.${this.tabel}${where}${urut}${batas}) t`;
    const res = await jalankan(this.pg, this.konteks, sql, this.p);
    return dariJson(res.rows[0].data);
  }

  then(selesai, tolak) {
    return this.#eksekusi()
      .then((baris) => {
        if (this.satu) {
          if (baris.length > 1 && this.satu === 'single') return { data: null, error: { message: 'Lebih dari satu baris' } };
          if (!baris.length && this.satu === 'single') return { data: null, error: { message: 'Tidak ada baris' } };
          return { data: baris[0] ?? null, error: null };
        }
        return { data: baris, error: null };
      })
      .catch((e) => ({ data: null, error: galat(e) }))
      .then(selesai, tolak);
  }
}

// Tipe argumen tiap fungsi (seperti PostgREST yang membaca tanda tangan fungsi): argumen jsonb dikirim sebagai JSON,
// bukan sebagai array Postgres.
const cacheTipe = new WeakMap();
async function tipeArgumen(pg, nama) {
  const peta = cacheTipe.get(pg) ?? new Map();
  cacheTipe.set(pg, peta);
  if (!peta.has(nama)) {
    const res = await pg.query(
      `select a.n as nama, t.tipe::regtype::text as tipe
       from pg_proc p,
         unnest(p.proargnames) with ordinality as a(n, i),
         unnest(string_to_array(p.proargtypes::text, ' ')::oid[]) with ordinality as t(tipe, j)
       where p.pronamespace = 'public'::regnamespace and p.proname = $1 and a.i = t.j`,
      [nama]
    );
    peta.set(nama, Object.fromEntries(res.rows.map((r) => [r.nama, r.tipe])));
  }
  return peta.get(nama);
}

const parameterRpc = (v, tipe) => (tipe === 'jsonb' || tipe === 'json' ? JSON.stringify(v) : parameter(v));

async function rpc(pg, konteks, nama, args = {}) {
  if (!IDENT.test(nama)) return { data: null, error: { message: 'nama fungsi tidak sah' } };
  const kunci = Object.keys(args);
  try {
    const tipe = await tipeArgumen(pg, nama);
    const sql = `select public.${nama}(${kunci.map((k, i) => `${IDENT.test(k) ? k : (() => { throw new Error('argumen tidak sah'); })()} => $${i + 1}`).join(', ')}) as hasil`;
    const res = await jalankan(pg, konteks, sql, kunci.map((k) => parameterRpc(args[k], tipe[k])));
    const nilai = res.rows[0]?.hasil;
    return { data: nilai === '' || nilai === undefined ? null : nilai, error: null };
  } catch (e) {
    return { data: null, error: galat(e) };
  }
}

const klienTabel = (pg, konteks) => ({
  from: (tabel) => new Bangun(pg, konteks, tabel),
  rpc: (nama, args) => rpc(pg, konteks, nama, args),
});

/** Ketergantungan untuk logika Edge Function, versi lokal (Auth tiruan di tabel auth.users). */
export function buatDepsEdge(pg) {
  const layanan = { role: 'service_role' };
  const cari = async (email) => (await pg.query('select id, encrypted_password from auth.users where email = $1', [email])).rows[0];
  return {
    sekarang: () => Date.now(),
    db: klienTabel(pg, layanan),
    async verifikasiToken(token) {
      const m = /^lokal\.([0-9a-f-]{36})\./.exec(token ?? '');
      if (!m) return null;
      const r = await pg.query('select id from auth.users where id = $1', [m[1]]);
      return r.rows[0] ? { id: r.rows[0].id } : null;
    },
    async masukDenganPassword(email, pin) {
      const u = await cari(email);
      if (!u || u.encrypted_password !== (await hashPin(pin))) return null;
      return { access_token: `lokal.${u.id}.${Date.now()}`, refresh_token: `lokal-r.${u.id}` };
    },
    admin: {
      async buatAkun(email, pin) {
        try {
          const r = await pg.query('insert into auth.users (email, encrypted_password) values ($1, $2) returning id', [email, await hashPin(pin)]);
          return { id: r.rows[0].id };
        } catch (e) {
          return { galat: /unique|duplicate/i.test(e.message) ? 'User already registered' : e.message };
        }
      },
      async ubahPassword(id, pin) {
        await pg.query('update auth.users set encrypted_password = $2 where id = $1', [id, await hashPin(pin)]);
        return null;
      },
      async ubahEmail(id, email) {
        try { await pg.query('update auth.users set email = $2 where id = $1', [id, email]); return null; } catch (e) { return e.message; }
      },
      async hapusAkun(id) {
        await pg.query('delete from auth.users where id = $1', [id]);
        return null;
      },
    },
  };
}

/**
 * Membuat klien. `penyimpan` (opsional) = { ambil(), simpan(nilai) } untuk mengingat sesi antar muat ulang halaman.
 */
export function buatKlienFake(pg, penyimpan = null) {
  const deps = buatDepsEdge(pg);
  let sesi = penyimpan?.ambil?.() ?? null;
  const simpan = () => penyimpan?.simpan?.(sesi);
  const subDari = (token) => /^lokal\.([0-9a-f-]{36})\./.exec(token ?? '')?.[1] ?? null;
  const konteks = () => (sesi?.access_token && subDari(sesi.access_token)
    ? { role: 'authenticated', sub: subDari(sesi.access_token) }
    : { role: 'anon' });

  return {
    auth: {
      async setSession({ access_token: token, refresh_token: segar }) {
        const u = await deps.verifikasiToken(token);
        if (!u) return { data: { session: null }, error: { message: 'Token tidak sah' } };
        sesi = { access_token: token, refresh_token: segar, user: { id: u.id } };
        simpan();
        return { data: { session: sesi }, error: null };
      },
      async getSession() {
        if (sesi && !(await deps.verifikasiToken(sesi.access_token))) { sesi = null; simpan(); }
        return { data: { session: sesi }, error: null };
      },
      async signOut() { sesi = null; simpan(); return { error: null }; },
    },
    from: (tabel) => new Bangun(pg, konteks(), tabel),
    rpc: (nama, args) => rpc(pg, konteks(), nama, args),
    functions: {
      async invoke(nama, { body } = {}) {
        if (nama !== 'sigarda') return { data: null, error: { message: 'Fungsi tidak ditemukan' } };
        const hasil = await tangani(JSON.parse(JSON.stringify(body ?? {})), sesi?.access_token ? `Bearer ${sesi.access_token}` : 'Bearer anon', deps);
        return { data: JSON.parse(JSON.stringify(hasil)), error: null };
      },
    },
  };
}

/** Menjalankan stub Supabase lalu skema SIGARDA pada database PGlite yang masih kosong. */
export async function siapkanPg(pg, { sqlStub, sqlSkema }) {
  await pg.exec(sqlStub);
  await pg.exec(sqlSkema);
  return pg;
}

/** Klien layanan (service_role) untuk penyiapan data awal dan pengujian; melewati RLS. */
export const klienLayanan = (pg) => klienTabel(pg, { role: 'service_role' });

/** Klien dengan identitas tertentu tanpa lewat proses masuk (untuk menguji RLS/RPC secara langsung). */
export const klienSebagai = (pg, sub) => klienTabel(pg, sub ? { role: 'authenticated', sub } : { role: 'anon' });

/** SQL mentah dengan peran tertentu (untuk pengujian: membuktikan penulisan langsung ditolak). */
export const sqlSebagai = (pg, sub, sql, params = []) =>
  jalankan(pg, sub === 'service' ? { role: 'service_role' } : sub ? { role: 'authenticated', sub } : { role: 'anon' }, sql, params);
