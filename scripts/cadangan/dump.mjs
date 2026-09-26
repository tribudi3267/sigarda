// Inti pembuatan cadangan: membaca semua tabel lewat objek `db` yang punya query(sql, params) -> { rows } (pg.Client atau PGlite) dan menyusun
// satu berkas SQL yang dapat dijalankan ulang untuk memulihkan. Dipakai cadangkan.mjs (interaktif, klik dua kali) dan otomatis.mjs (mingguan lewat
// GitHub Actions); tidak mengimpor pg agar dapat diuji dengan PGlite (uji/cadangan-otomatis.mjs memulihkan hasilnya ke database kosong).

export const TABEL_DILEWATI = new Set(['public.login_gagal']); // penghitung kunci sementara; tidak perlu dipulihkan
export const TABEL_AKUN = ['auth.users', 'auth.identities'];


const kutipId = (s) => '"' + String(s).replace(/"/g, '""') + '"';
const kutipTeks = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const namaLengkap = (skema, tabel) => `${kutipId(skema)}.${kutipId(tabel)}`;

async function daftarTabel(db) {
  const { rows } = await db.query(
    `select table_schema as skema, table_name as tabel
       from information_schema.tables
      where table_type = 'BASE TABLE' and table_schema = 'public'
      order by table_name`,
  );
  const publik = rows.map((r) => `${r.skema}.${r.tabel}`).filter((n) => !TABEL_DILEWATI.has(n));
  return [...TABEL_AKUN, ...publik];
}

/** Urutkan tabel supaya tabel induk (yang dirujuk foreign key) ditulis lebih dulu. */
async function urutkan(db, tabel) {
  const { rows } = await db.query(
    `select cn.nspname || '.' || cl.relname as anak, pn.nspname || '.' || pl.relname as induk
       from pg_constraint c
       join pg_class cl on cl.oid = c.conrelid   join pg_namespace cn on cn.oid = cl.relnamespace
       join pg_class pl on pl.oid = c.confrelid  join pg_namespace pn on pn.oid = pl.relnamespace
      where c.contype = 'f'`,
  );
  const ada = new Set(tabel);
  const induk = new Map(tabel.map((t) => [t, new Set()]));
  for (const { anak, induk: i } of rows) if (anak !== i && ada.has(anak) && ada.has(i)) induk.get(anak).add(i);
  const hasil = [];
  const sisa = new Set(tabel);
  while (sisa.size) {
    const siap = [...sisa].filter((t) => [...induk.get(t)].every((i) => !sisa.has(i)));
    const giliran = siap.length ? siap : [[...sisa][0]]; // siklus: lanjutkan saja, hindari macet
    for (const t of giliran) { hasil.push(t); sisa.delete(t); }
  }
  return hasil;
}

async function kolomDapatDisisipkan(db, skema, tabel) {
  const { rows } = await db.query(
    `select column_name as nama, (is_identity = 'YES' and identity_generation = 'ALWAYS') as identitas_selalu
       from information_schema.columns
      where table_schema = $1 and table_name = $2 and is_generated = 'NEVER'
      order by ordinal_position`,
    [skema, tabel],
  );
  return rows;
}

// Tabel yang sudah berisi baris bawaan dari skema (mis. pengaturan garuda.gerbang dan tkk.ambang): pada pemulihan isi CADANGAN harus menang atas bawaan skema, jadi
// bentrokan kunci menimpa (upsert) alih-alih dilewati. Tabel lain memakai "on conflict do nothing" (kosong pada database baru, atau katalog yang identik).
// Bila skema kelak membawa baris bawaan pada tabel lain, uji/cadangan-otomatis.mjs (perbandingan isi seluruh tabel sesudah pulih) yang menangkapnya.
export const TABEL_TIMPA = { 'public.pengaturan': { kunci: ['kunci'] } };

/** Akhiran pernyataan insert: upsert bagi tabel di TABEL_TIMPA, selain itu "on conflict do nothing". */
function akhirInsert(nama, kolom) {
  const timpa = TABEL_TIMPA[nama];
  if (!timpa) return 'on conflict do nothing';
  const lain = kolom.map((k) => k.nama).filter((k) => !timpa.kunci.includes(k));
  return `on conflict (${timpa.kunci.map(kutipId).join(', ')}) do update set ${lain.map((k) => `${kutipId(k)} = excluded.${kutipId(k)}`).join(', ')}`;
}

async function buatBlok(db, nama) {
  const [skema, tabel] = nama.split('.');
  const kolom = await kolomDapatDisisipkan(db, skema, tabel);
  const { rows } = await db.query(`select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)::text as isi, count(*)::int as n from ${namaLengkap(skema, tabel)} t`);
  const n = rows[0].n;
  if (n === 0) return { nama, n, sql: `-- ${nama}: kosong\n` };
  const daftar = kolom.map((k) => kutipId(k.nama)).join(', ');
  const override = kolom.some((k) => k.identitas_selalu) ? ' overriding system value' : '';
  const sql =
    `-- ${nama}: ${n} baris\n` +
    `insert into ${namaLengkap(skema, tabel)} (${daftar})${override}\n` +
    `select ${daftar} from jsonb_populate_recordset(null::${namaLengkap(skema, tabel)}, ${kutipTeks(rows[0].isi)}::jsonb)\n` +
    `${akhirInsert(nama, kolom)};\n`;
  return { nama, n, sql };
}

/** Membaca semua tabel dalam SATU transaksi baca-saja (gambaran konsisten). Mengembalikan [{ nama, n, sql }]; `log` dipanggil per tabel (hanya nama dan jumlah). */
export async function bacaSemua(db, { log = () => {} } = {}) {
  await db.query('begin isolation level repeatable read read only');
  try {
    const tabel = await urutkan(db, await daftarTabel(db));
    const blok = [];
    for (const nama of tabel) {
      const b = await buatBlok(db, nama);
      log(nama, b.n);
      blok.push(b);
    }
    await db.query('commit');
    return blok;
  } catch (e) {
    await db.query('rollback').catch(() => {});
    throw e;
  }
}

/** Cadangan yang tidak wajar tidak boleh menimpa yang baik: profiles kosong berarti sambungan salah alamat atau salah proyek. */
export const cadanganWajar = (blok) => {
  const profil = blok.find((b) => b.nama === 'public.profiles');
  return !!profil && profil.n > 0;
};

/**
 * Seluruh isi berkas SQL cadangan. Pemicu (trigger) tabel aplikasi dimatikan selama pemulihan, di dalam transaksi yang sama, lalu dinyalakan kembali:
 * tanpa itu pemulihan (a) membuat notifikasi dan antrean push palsu dari baris yang dipulihkan, dan (b) DITOLAK untuk Penegak alumni/nonaktif
 * (pemicu tolak_peserta_tak_aktif menolak penulisan apa pun). Bila pemulihan gagal di tengah, seluruh transaksi dibatalkan sehingga pemicu tetap menyala.
 */
export function susunSql(blok, waktu = new Date()) {
  const LF = String.fromCharCode(10);
  const tabelAplikasi = blok.map((b) => b.nama).filter((n) => n.startsWith('public.'));
  const ubahPemicu = (aksi) => tabelAplikasi.map((n) => `alter table ${namaLengkap(...n.split('.'))} ${aksi} trigger user;`);
  const kepala = [
    `-- Cadangan data SIGARDA, dibuat ${waktu.toISOString()}`,
    '-- Isi: akun login (termasuk hash PIN) dan seluruh data aplikasi. RAHASIA: jangan diunggah ke GitHub atau dibagikan.',
    '-- Pemulihan: lihat BACA-SAYA.txt di folder ini.',
    '',
    'set standard_conforming_strings = on;',
    'begin;',
    '',
    '-- Pemicu dimatikan selama pemulihan (dinyalakan kembali di akhir, dalam transaksi yang sama).',
    ...ubahPemicu('disable'),
    '',
    '',
  ].join(LF);
  const akhir = ['', '-- Pemicu dinyalakan kembali.', ...ubahPemicu('enable'), 'commit;', ''].join(LF);
  return kepala + blok.map((b) => b.sql).join(LF) + LF + akhir;
}
