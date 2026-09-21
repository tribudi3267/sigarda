/**
 * DATA "SEKOLAH PENUH" untuk mode lokal (`?data=penuh`) dan uji kinerja: ratusan Penegak dengan progres, kehadiran, iuran, portofolio, dan penugasan
 * berskala sekolah sungguhan, dibuat dengan SQL massal (cepat) di atas data contoh. Semua fiktif dan deterministik (tanpa acak sungguhan, termasuk id): dua kali dibuat
 * hasilnya sama. Tidak dipakai di Supabase sungguhan dan tidak ikut build produksi (hanya dimuat bootLokal).
 *
 * Skala bawaan: 700 Penegak aktif (X, XI, XII masing-masing sekitar sepertiga; 30 rombel) + 150 alumni, 3 Pembina tambahan, 12 Penegak berjabatan Dewan,
 * dua semester kehadiran dan iuran mingguan, progres SKU menurut kelas, pengajuan yang sedang berjalan, dan penugasan untuk semua rombel.
 * Pemicu dan pemeriksaan kunci asing dimatikan selama pemuatan (session_replication_role = replica) lalu dinyalakan lagi: data dibangun konsisten dari awal.
 */
import { hashPin } from './klienFake';
import { PIN_DEMO } from './pinDemo';
import { emailDari } from '../../supabase/functions/sigarda/index.ts';

const DEPAN = ['Ahmad', 'Siti', 'Budi', 'Dewi', 'Rizky', 'Putri', 'Agus', 'Rina', 'Fajar', 'Nadia', 'Bagas', 'Anisa', 'Wahyu', 'Maya', 'Dimas', 'Laras', 'Eko', 'Intan', 'Hendra', 'Ayu',
  'Rafi', 'Salsa', 'Yoga', 'Citra', 'Andi', 'Bunga', 'Farhan', 'Nabila', 'Galih', 'Tiara', 'Ilham', 'Mega', 'Joko', 'Vina', 'Reza', 'Dinda', 'Arif', 'Wulan', 'Krisna', 'Sekar'];
const BELAKANG = ['Saputra', 'Wulandari', 'Pratama', 'Lestari', 'Hidayat', 'Kusuma', 'Nugroho', 'Ramadhan', 'Fitriani', 'Setiawan', 'Permata', 'Santoso', 'Anggraini', 'Wijaya', 'Purnama',
  'Maulana', 'Rahmawati', 'Prasetyo', 'Handayani', 'Firmansyah', 'Utami', 'Kurniawan', 'Safitri', 'Mahendra', 'Puspita'];
const SANGGA = ['Sangga Elang', 'Sangga Merak', 'Sangga Rajawali', 'Sangga Kasuari', 'Sangga Garuda', 'Sangga Cendrawasih', 'Sangga Kenari', 'Sangga Jalak', 'Sangga Bangau', 'Sangga Gagak', 'Sangga Alap', 'Sangga Pipit'];
const AGAMA = [['Islam', 80], ['Protestan', 8], ['Katolik', 6], ['Hindu', 3], ['Buddha', 2], ['Khonghucu', 1]];
const JABATAN_DEWAN = ['Wakil Pradana', 'Wakil Pradani', 'Sekretaris', 'Bendahara', 'Ketua Bidang Kegiatan', 'Ketua Bidang Kegiatan', 'Ketua Bidang Kaderisasi', 'Ketua Bidang Kaderisasi',
  'Anggota Dewan', 'Anggota Dewan', 'Anggota Dewan', 'Anggota Dewan'];

/** Pembangkit bilangan semu deterministik (mulberry32). */
function pembangkit(benih) {
  let a = benih >>> 0;
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** UUID versi 4 dari pembangkit deterministik (agar seluruh data, termasuk id, sama tiap dibuat). */
const uuidSemu = (r) => {
  const h = Array.from({ length: 32 }, () => Math.floor(r() * 16).toString(16));
  h[12] = '4'; h[16] = '89ab'[Math.floor(r() * 4)];
  return `${h.slice(0, 8).join('')}-${h.slice(8, 12).join('')}-${h.slice(12, 16).join('')}-${h.slice(16, 20).join('')}-${h.slice(20).join('')}`;
};
const pilihAgama = (r) => { let x = r() * 100; for (const [a, b] of AGAMA) { x -= b; if (x < 0) return a; } return 'Islam'; };

/** Membuat baris Penegak: [{ id, nis, nama, kelas, sangga, agama, jk, status, lulusTa }]. */
export function buatPenegak({ penegak = 700, alumni = 150, awalNis = 30000 } = {}) {
  const r = pembangkit(20260922);
  const hasil = [];
  const nama = (i) => `${DEPAN[Math.floor(r() * DEPAN.length)]} ${BELAKANG[Math.floor(r() * BELAKANG.length)]}${i % 7 === 0 ? ` ${BELAKANG[Math.floor(r() * BELAKANG.length)]}` : ''}`;
  for (let i = 0; i < penegak + alumni; i += 1) {
    const jenjang = i >= penegak ? 'XII' : i % 100 < 34 ? 'X' : i % 100 < 68 ? 'XI' : 'XII';
    const rombel = `${jenjang}-${String((i % 10) + 1).padStart(2, '0')}`;
    hasil.push({
      id: uuidSemu(r), nis: String(awalNis + i), nama: nama(i), kelas: rombel, sangga: SANGGA[i % SANGGA.length], agama: pilihAgama(r), jk: i % 2 === 0 ? 'L' : 'P',
      status: i >= penegak ? 'alumni' : i % 25 === 3 ? 'nonaktif' : 'aktif', lulusTa: i >= penegak ? '2025/2026' : null,
    });
  }
  return hasil;
}

const SQL_PROGRES = `
create temp table t_kap as
select p.id, p.agama, p.kelas, p.status,
  case when p.status = 'alumni' or p.kelas like 'XII-%' then 23
       when p.kelas like 'XI-%' then 8 + abs(hashtext(p.id::text)) % 16
       else abs(hashtext(p.id::text)) % 13 end as kb,
  case when p.status = 'alumni' then 22
       when p.kelas like 'XII-%' and abs(hashtext(p.id::text || 'g')) % 9 = 0 then 22
       when p.kelas like 'XII-%' then 4 + abs(hashtext(p.id::text || 'l')) % 17
       when p.kelas like 'XI-%' then abs(hashtext(p.id::text || 'l')) % 6
       else 0 end as kl
from public.profiles p where p.role = 'peserta' and p.username ~ '^3[0-9]{4}$';

insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji, nilai, verifikasi_token, diubah)
select k.id, u.id, 'lulus', (select id from public.profiles where username = 'pembina'), sigarda.hari_ini() - (abs(hashtext(k.id::text || u.id)) % 300), 'Baik', sigarda.token_acak(), now()
from t_kap k join public.sku_unit u on (u.agama is null or u.agama = k.agama)
where (u.tingkat = 'Bantara' and u.butir_no <= k.kb) or (u.tingkat = 'Laksana' and u.butir_no <= k.kl)
on conflict do nothing;

update public.sku_progress set verifikasi = sigarda.kode_verifikasi(array[peserta_id::text, sku_id, coalesce(penguji_id::text, ''), coalesce(tanggal_uji::text, '')])
where status = 'lulus' and verifikasi is null;

insert into public.sku_riwayat (peserta_id, sku_id, waktu, teks, oleh)
select peserta_id, sku_id, tanggal_uji::timestamptz - interval '3 days', 'Mengajukan pengujian untuk ' || tanggal_uji::text, peserta_id
from public.sku_progress where status = 'lulus' and peserta_id in (select id from t_kap)
union all
select peserta_id, sku_id, tanggal_uji::timestamptz, 'Lulus (Baik)', penguji_id
from public.sku_progress where status = 'lulus' and peserta_id in (select id from t_kap);

-- pengajuan yang sedang berjalan (sebagian antrian rombel, sebagian ditujukan ke Pembina)
insert into public.sku_progress (peserta_id, sku_id, status, jadwal, penguji_id, diubah)
select k.id, 'BAN-' || lpad((k.kb + 1)::text, 2, '0'),
       case when abs(hashtext(k.id::text)) % 3 = 0 then 'proses' else 'diajukan' end,
       sigarda.hari_ini() + (abs(hashtext(k.id::text)) % 5),
       case when abs(hashtext(k.id::text)) % 2 = 0 then null else (select id from public.profiles where username = 'pembina') end, now()
from t_kap k where k.status = 'aktif' and k.kb between 1 and 22 and abs(hashtext(k.id::text)) % 14 = 0
on conflict do nothing;
`;

const SQL_KEGIATAN = `
-- kehadiran dan iuran: dua semester (26 Jumat terakhir)
insert into public.absensi_sesi (tanggal, dibuat_oleh, dibuat_pada)
select d::date, (select id from public.profiles where username = 'pembina'), now()
from generate_series(sigarda.hari_ini() - 26 * 7, sigarda.hari_ini(), interval '1 day') d where extract(dow from d) = 5
on conflict do nothing;

insert into public.absensi_hadir (tanggal, peserta_id, status, oleh, waktu)
select s.tanggal, k.id, case when x.h < 8 then 'H' when x.h = 8 then 'I' when x.h = 9 then 'S' else 'A' end, (select id from public.profiles where username = 'dewan'), now()
from public.absensi_sesi s join t_kap k on k.status = 'aktif'
cross join lateral (select abs(hashtext(k.id::text || s.tanggal::text)) % 10 as h) x
on conflict do nothing;

insert into public.iuran (tanggal, peserta_id, jumlah, jenis, oleh, waktu)
select h.tanggal, h.peserta_id, 1000, 'rutin', (select id from public.profiles where username = 'dewan'), now()
from public.absensi_hadir h join t_kap k on k.id = h.peserta_id
where h.status = 'H' and abs(hashtext(h.peserta_id::text || h.tanggal::text || 'i')) % 10 < 7
on conflict do nothing;

insert into public.iuran_kas (tanggal, total_fisik, catatan, oleh, waktu)
select s.tanggal, coalesce(sum(i.jumlah), 0), '', (select id from public.profiles where username = 'dewan'), now()
from public.absensi_sesi s left join public.iuran i on i.tanggal = s.tanggal group by s.tanggal
on conflict do nothing;

-- Calon Garuda (Laksana penuh) beserta portofolio
update public.profiles set calon_garuda = sigarda.hari_ini() - 30
where id in (select k.id from t_kap k where k.status = 'aktif' and k.kelas like 'XII-%' and k.kl = 22 order by k.id limit 12);
insert into public.portofolio (peserta_id, item_id, status, catatan, diperbarui)
select p.id, f.id, case when abs(hashtext(p.id::text || f.id)) % 3 = 0 then 'siap' when abs(hashtext(p.id::text || f.id)) % 3 = 1 then 'proses' else 'belum' end, '', now()
from public.profiles p cross join public.pf_item f where p.calon_garuda is not null and p.username ~ '^3[0-9]{4}$'
on conflict do nothing;

-- Penegak berjabatan Dewan (jabatan tunggal Pradana dan Pradani dibiarkan untuk akun contoh)
with calon as (select p.id, row_number() over (order by p.username) as n from public.profiles p where p.role = 'peserta' and p.status = 'aktif' and p.username ~ '^3[0-9]{4}$' and (p.kelas like 'XII-%' or p.kelas like 'XI-%'))
update public.profiles p set jabatan_dewan = (array[__JABATAN__])[1 + (c.n::int - 1) % __JUMLAH_JABATAN__] from calon c where c.id = p.id and c.n <= __DEWAN__;

-- penugasan penguji untuk 30 rombel pada tahun ajaran berjalan: satu Pembina dan satu Penegak berjabatan tiap rombel
with pb as (select array_agg(id order by username) as a from public.profiles where role = 'penguji' and jabatan = 'Pembina'),
     dw as (select array_agg(id order by username) as a from public.profiles where role = 'peserta' and jabatan_dewan is not null and status = 'aktif' and username ~ '^3[0-9]{4}$'),
     rb as (select k || '-' || lpad(n::text, 2, '0') as rombel, (row_number() over (order by k, n))::int as i from (values ('X'), ('XI'), ('XII')) t(k), generate_series(1, 10) n)
insert into public.penugasan_rombel (tahun_ajaran, rombel, penguji_id, ditetapkan_oleh)
select sigarda.tahun_ajaran_kini(), rb.rombel, pb.a[1 + (rb.i - 1) % cardinality(pb.a)], (select id from public.profiles where username = 'admin') from rb, pb
union all
select sigarda.tahun_ajaran_kini(), rb.rombel, dw.a[1 + (rb.i - 1) % cardinality(dw.a)], (select id from public.profiles where username = 'admin') from rb, dw where cardinality(dw.a) > 0
on conflict do nothing;
`;

/**
 * Menambahkan data sekolah penuh ke database lokal yang SUDAH berisi data contoh (isiDataContoh). Mengembalikan jumlah baris utama.
 * `kemajuan(teks)` (opsional) dipanggil per langkah agar layar memuat dapat menampilkan kemajuan.
 */
export async function isiSekolahPenuh(pg, { penegak = 700, alumni = 150, pembina = 3, kemajuan = () => {} } = {}) {
  const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
  const sandi = await hashPin(PIN_DEMO.penegak);
  const baris = buatPenegak({ penegak, alumni });
  const rp = pembangkit(20260923);
  const tambahanPembina = Array.from({ length: pembina }, (_, i) => ({
    id: uuidSemu(rp), username: `pembina.${i + 2}`, nama: `Pembina Tambahan ${i + 2}`, agama: ['Islam', 'Protestan', 'Katolik'][i % 3],
  }));
  await pg.exec('set session_replication_role = replica');
  try {
    kemajuan('Membuat akun...');
    await q(`insert into auth.users (id, email, encrypted_password) select (r->>'id')::uuid, r->>'email', $2 from jsonb_array_elements($1::jsonb) r`,
      [JSON.stringify([...baris.map((b) => ({ id: b.id, email: emailDari(b.nis) })), ...tambahanPembina.map((b) => ({ id: b.id, email: emailDari(b.username) }))]), sandi]);
    await q(`insert into public.profiles (id, username, role, nama, nis, kelas, sangga, agama, jenis_kelamin, status, status_pada, lulus_ta, wajib_ganti_pin, dibuat)
      select (r->>'id')::uuid, r->>'nis', 'peserta', r->>'nama', r->>'nis', r->>'kelas', r->>'sangga', r->>'agama', r->>'jk', r->>'status',
             case when r->>'status' = 'aktif' then null else sigarda.hari_ini() - 20 end, nullif(r->>'lulusTa', ''), false, sigarda.hari_ini() - 400
      from jsonb_array_elements($1::jsonb) r`, [JSON.stringify(baris.map((b) => ({ ...b, lulusTa: b.lulusTa ?? '' })))]);
    await q(`insert into public.profiles (id, username, role, nama, jabatan, agama, jenis_kelamin, wajib_ganti_pin, dibuat)
      select (r->>'id')::uuid, r->>'username', 'penguji', r->>'nama', 'Pembina', r->>'agama', 'L', false, sigarda.hari_ini() - 400 from jsonb_array_elements($1::jsonb) r`, [JSON.stringify(tambahanPembina)]);
    kemajuan('Membuat progres SKU dan riwayat...');
    await pg.exec(SQL_PROGRES);
    kemajuan('Membuat kehadiran, iuran, portofolio, dan penugasan...');
    await pg.exec(SQL_KEGIATAN.replace('__JABATAN__', JABATAN_DEWAN.map((j) => `'${j}'`).join(', ')).replace('__JUMLAH_JABATAN__', String(JABATAN_DEWAN.length)).replace('__DEWAN__', String(JABATAN_DEWAN.length)));
    await pg.exec('drop table if exists t_kap');
    await q('update public.profiles set wajib_ganti_pin = false');
  } finally {
    await pg.exec('set session_replication_role = origin');
  }
  await q('delete from public.notifikasi');
  const n = async (t) => Number((await q(`select count(*)::int n from public.${t}`))[0].n);
  const [profil, progres, riwayat, hadir, iuran] = await Promise.all([n('profiles'), n('sku_progress'), n('sku_riwayat'), n('absensi_hadir'), n('iuran')]);
  return { profil, progres, riwayat, hadir, iuran };
}
