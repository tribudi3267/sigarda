-- ============================================================================
-- DATA DEMO: 8 Penegak dengan berbagai kemajuan SKU Bantara dan Laksana, untuk mempercepat pengujian.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Aman dijalankan berulang kali: akun yang sudah ada tidak dibuat lagi, dan data SKU demo direset ke keadaan awal.
-- TIDAK menyentuh anggota asli. Semua akun demo memakai NIS 990001 sampai 990008 dan nama berawalan "Demo ".
--
-- MASUK sebagai akun demo:   nama pengguna = NIS (mis. 990002)     PIN = 352817
-- (akun demo langsung bisa dipakai, tanpa layar wajib ganti PIN)
--
-- HAPUS setelah selesai menguji: jalankan supabase/demo/hapus_data_demo.sql.
-- Selama akun demo ada, PIN di atas diketahui siapa pun yang membaca berkas ini, dan akun demo ikut tampil pada
-- daftar, rekap, antrian, dan sidang. Jangan dibiarkan pada sistem yang sudah dipakai anggota sungguhan.
--
-- Bila pembuatan akun (langkah 1) gagal di proyek Anda: buat 8 akun itu lewat menu Anggota > Import Excel (NIS 990001-990008,
-- PIN awal bebas), lalu jalankan berkas ini lagi. Akun yang sudah ada dilewati; langkah 2 sampai 5 tetap mengisi datanya.
--
--   NIS     Nama                  Kondisi
--   990001  Demo Aditya Pratama   Bantara 23/23 lulus, Laksana belum mulai      -> siap sidang Bantara
--   990002  Demo Bintang Kusuma   Bantara 23/23 dan Laksana 22/22 lulus         -> siap sidang kedua tingkat, layak Garuda (belum mendaftar)
--   990003  Demo Citra Lestari    Bantara 23/23 lulus, Laksana 11/22 lulus      -> Calon Laksana, sebagian
--   990004  Demo Dimas Saputra    Bantara 14/23 lulus + butir 15 menunggu uji, 16 sedang diuji, 17 perlu diulang
--   990005  Demo Eka Wulandari    Bantara 22/23: butir agama (Hindu) kurang satu sub-butir -> uji blokir "Layak"
--   990006  Demo Fajar Nugroho    Bantara dan Laksana lulus semua, sudah mendaftar Calon Garuda, portofolio terisi sebagian
--   990007  Demo Gita Permata     Bantara 23/23 lulus (Khonghucu: butir agama pengganti)
--   990008  Demo Hendra Wijaya    Baru mulai: 3 butir Bantara lulus, butir 4 menunggu uji
-- ============================================================================
begin;

-- Pemeriksaan: pgcrypto dibutuhkan untuk membuat hash PIN.
do $$
begin
  if to_regprocedure('crypt(text,text)') is null then
    raise exception 'Fungsi crypt() tidak ditemukan. Jalankan dulu: create extension if not exists pgcrypto with schema extensions;';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Skenario
-- ---------------------------------------------------------------------------
create temp table demo_penegak (
  nis text primary key, nama text not null, kelas text not null, sangga text not null, agama text not null,
  ban int not null,            -- butir Bantara 1..ban lulus
  lak int not null,            -- butir Laksana 1..lak lulus
  kecuali text,                -- satu unit yang sengaja TIDAK lulus (untuk menguji butir agama yang lulus sebagian)
  garuda boolean not null default false
) on commit drop;

insert into demo_penegak (nis, nama, kelas, sangga, agama, ban, lak, kecuali, garuda) values
  ('990001', 'Demo Aditya Pratama', 'X',   'Sangga Elang',    'Islam',     23, 0,  null,           false),
  ('990002', 'Demo Bintang Kusuma', 'XI',  'Sangga Merak',    'Islam',     23, 22, null,           false),
  ('990003', 'Demo Citra Lestari',  'XI',  'Sangga Kasuari',  'Katolik',   23, 11, null,           false),
  ('990004', 'Demo Dimas Saputra',  'X',   'Sangga Rajawali', 'Protestan', 14, 0,  null,           false),
  ('990005', 'Demo Eka Wulandari',  'XII', 'Sangga Merak',    'Hindu',     23, 0,  'BAN-01-HIN-7', false),
  ('990006', 'Demo Fajar Nugroho',  'XII', 'Sangga Elang',    'Buddha',    23, 22, null,           true),
  ('990007', 'Demo Gita Permata',   'X',   'Sangga Rajawali', 'Khonghucu', 23, 0,  null,           false),
  ('990008', 'Demo Hendra Wijaya',  'X',   'Sangga Kasuari',  'Islam',     3,  0,  null,           false);

-- Domain email tiruan mengikuti akun yang sudah ada (bawaan: sigarda.invalid); PIN demo.
create temp table demo_konfig on commit drop as
  select coalesce(
           (select split_part(u.email, '@', 2) from auth.users u join public.profiles p on p.id = u.id where p.role = 'admin' order by u.created_at limit 1),
           'sigarda.invalid') as domain,
         '352817'::text as pin;

-- ---------------------------------------------------------------------------
-- 1. Akun (Supabase Auth) dan profil. Yang sudah ada dilewati.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       d.nis || '@' || k.domain, crypt(k.pin, gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
       '', '', '', ''
from demo_penegak d cross join demo_konfig k
where not exists (select 1 from auth.users u where u.email = d.nis || '@' || k.domain);

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       'email', u.id::text, now(), now(), now()
from demo_penegak d
cross join demo_konfig k
join auth.users u on u.email = d.nis || '@' || k.domain
where not exists (select 1 from auth.identities i where i.user_id = u.id);

insert into public.profiles (id, username, role, nama, nis, kelas, sangga, agama, wajib_ganti_pin)
select u.id, d.nis, 'peserta', d.nama, d.nis, d.kelas, d.sangga, d.agama, false
from demo_penegak d
cross join demo_konfig k
join auth.users u on u.email = d.nis || '@' || k.domain
where not exists (select 1 from public.profiles p where p.id = u.id or p.username = d.nis or p.nis = d.nis);

-- Akun demo yang dibuat lewat Import Excel juga langsung bisa dipakai (tanpa wajib ganti PIN)
update public.profiles p
   set wajib_ganti_pin = false, nama = d.nama, kelas = d.kelas, sangga = d.sangga, agama = d.agama
  from demo_penegak d
 where p.username = d.nis and p.role = 'peserta';

create temp table demo_id on commit drop as
  select p.id, d.*
  from demo_penegak d join public.profiles p on p.username = d.nis and p.role = 'peserta';

-- ---------------------------------------------------------------------------
-- 2. Reset data SKU dan portofolio milik akun demo (agar skrip ini bisa diulang)
-- ---------------------------------------------------------------------------
delete from public.sku_riwayat where peserta_id in (select id from demo_id);
delete from public.sku_progress where peserta_id in (select id from demo_id);
delete from public.portofolio_jurnal where peserta_id in (select id from demo_id);
delete from public.portofolio where peserta_id in (select id from demo_id);
update public.profiles set calon_garuda = null where id in (select id from demo_id);

-- Penguji: Pembina dan Dewan Ambalan yang sudah ada (bergantian). Bila hanya ada salah satu, dipakai untuk semuanya.
create temp table demo_penguji on commit drop as
  select (select id from public.profiles where role = 'penguji' and jabatan = 'Pembina' order by dibuat, id limit 1) as pembina,
         (select id from public.profiles where role = 'penguji' and jabatan = 'Dewan Ambalan' order by dibuat, id limit 1) as dewan;

-- ---------------------------------------------------------------------------
-- 3. Butir yang LULUS (Bantara sepanjang Jan-Mei 2026, Laksana Jun-Agu 2026; nilai bergantian)
-- ---------------------------------------------------------------------------
insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji, nilai, catatan, verifikasi, diverifikasi_pada, diubah, verifikasi_token)
select d.id, u.id, 'lulus', x.penguji, x.tgl, x.nilai, 'Data demo',
       sigarda.kode_verifikasi(array[d.id::text, u.id, x.penguji::text, x.tgl::text]),
       x.tgl::timestamptz + interval '3 hours', x.tgl::timestamptz + interval '3 hours', sigarda.token_acak()
from demo_id d
join public.sku_unit u on (u.agama is null or u.agama = d.agama)
cross join demo_penguji pj
cross join lateral (
  select case when u.agama is not null or u.butir_no % 2 = 0 then coalesce(pj.pembina, pj.dewan) else coalesce(pj.dewan, pj.pembina) end as penguji,
         case u.tingkat when 'Bantara' then date '2026-01-05' + u.butir_no * 6 else date '2026-06-01' + u.butir_no * 4 end as tgl,
         (array['Sangat baik', 'Baik', 'Cukup'])[1 + (u.butir_no + coalesce(u.sub, 0)) % 3] as nilai
) x
where ((u.tingkat = 'Bantara' and u.butir_no <= d.ban) or (u.tingkat = 'Laksana' and u.butir_no <= d.lak))
  and u.id is distinct from d.kecuali;

-- ---------------------------------------------------------------------------
-- 4. Butir yang sedang berjalan (menunggu uji, sedang diuji, perlu diulang)
-- ---------------------------------------------------------------------------
insert into public.sku_progress (peserta_id, sku_id, status, jadwal, penguji_id, tanggal_uji, catatan, catatan_peserta)
select d.id, s.sku, s.status,
       case when s.status = 'diajukan' then sigarda.hari_ini() + s.hari end,
       case when s.penguji = 'dewan' then coalesce(pj.dewan, pj.pembina) else coalesce(pj.pembina, pj.dewan) end,
       case when s.status in ('proses', 'ulang') then sigarda.hari_ini() + s.hari end,
       case when s.status = 'ulang' then 'Penjelasan belum lengkap. Pelajari materinya, lalu ajukan kembali.' else null end,
       case when s.status = 'diajukan' then 'Siap diuji (data demo).' else null end
from (values
  ('990004', 'BAN-15', 'diajukan', 'dewan',   2),
  ('990004', 'BAN-16', 'proses',   'pembina', 0),
  ('990004', 'BAN-17', 'ulang',    'pembina', -3),
  ('990008', 'BAN-04', 'diajukan', 'pembina', 1)
) as s (nis, sku, status, penguji, hari)
join demo_id d on d.nis = s.nis
cross join demo_penguji pj;

-- ---------------------------------------------------------------------------
-- 5. Riwayat, calon Garuda, dan portofolio
-- ---------------------------------------------------------------------------
insert into public.sku_riwayat (peserta_id, sku_id, waktu, teks, oleh)
select g.peserta_id, g.sku_id, (g.tanggal_uji - 3)::timestamptz + interval '2 hours',
       'Mengajukan pengujian untuk ' || to_char(g.tanggal_uji, 'YYYY-MM-DD'), g.peserta_id
from public.sku_progress g where g.peserta_id in (select id from demo_id) and g.status = 'lulus'
union all
select g.peserta_id, g.sku_id, g.diverifikasi_pada,
       'Dinyatakan lulus (' || g.nilai || '), kode ' || g.verifikasi, g.penguji_id
from public.sku_progress g where g.peserta_id in (select id from demo_id) and g.status = 'lulus'
union all
select g.peserta_id, g.sku_id, sigarda.hari_ini()::timestamptz + interval '2 hours',
       'Mengajukan pengujian untuk ' || to_char(g.jadwal, 'YYYY-MM-DD'), g.peserta_id
from public.sku_progress g where g.peserta_id in (select id from demo_id) and g.status = 'diajukan'
union all
select g.peserta_id, g.sku_id, sigarda.hari_ini()::timestamptz + interval '3 hours', 'Pengujian dimulai', g.penguji_id
from public.sku_progress g where g.peserta_id in (select id from demo_id) and g.status = 'proses'
union all
select g.peserta_id, g.sku_id, g.tanggal_uji::timestamptz + interval '3 hours', 'Perlu diulang', g.penguji_id
from public.sku_progress g where g.peserta_id in (select id from demo_id) and g.status = 'ulang';

-- Penegak yang sudah lulus semua dan mendaftar sebagai Calon Garuda: 12 dokumen siap, 6 sedang disiapkan
update public.profiles set calon_garuda = date '2026-09-10' where id in (select id from demo_id where garuda);

insert into public.portofolio (peserta_id, item_id, status, catatan, tautan, diperbarui)
select d.id, i.id,
       case when substr(i.id, 4)::int <= 12 then 'siap' else 'proses' end,
       'Data demo',
       case when substr(i.id, 4)::int <= 12 then 'https://drive.google.com/drive/folders/demo-' || lower(i.id) else '' end,
       now()
from demo_id d join public.pf_item i on substr(i.id, 4)::int <= 18
where d.garuda;

insert into public.portofolio_jurnal (peserta_id, item_id, waktu, teks, oleh)
select p.peserta_id, p.item_id, p.diperbarui,
       case p.status when 'siap' then 'Status: Belum siap menjadi Siap (Ada). Catatan diperbarui. Tautan berkas diperbarui'
                     else 'Status: Belum siap menjadi Sedang disiapkan. Catatan diperbarui' end,
       p.peserta_id
from public.portofolio p where p.peserta_id in (select id from demo_id);

commit;

-- ---------------------------------------------------------------------------
-- Hasil: ringkasan per akun demo (butir lulus dari total butir; butir agama lulus bila semua sub-butirnya lulus)
-- ---------------------------------------------------------------------------
with butir as (
  select p.nis, u.tingkat, u.butir_id,
         bool_and(coalesce(g.status, 'belum') = 'lulus') as lulus
  from public.profiles p
  join public.sku_unit u on (u.agama is null or u.agama = p.agama)
  left join public.sku_progress g on g.sku_id = u.id and g.peserta_id = p.id
  where p.role = 'peserta' and p.nis ~ '^9900[0-9]{2}$'
  group by p.nis, u.tingkat, u.butir_id
)
select p.nis as "NIS (nama pengguna)", p.nama, p.agama,
       count(*) filter (where b.tingkat = 'Bantara' and b.lulus) || ' / ' || count(*) filter (where b.tingkat = 'Bantara') as "Bantara lulus",
       count(*) filter (where b.tingkat = 'Laksana' and b.lulus) || ' / ' || count(*) filter (where b.tingkat = 'Laksana') as "Laksana lulus",
       coalesce((select string_agg(g.sku_id || ' ' || g.status, ', ' order by g.sku_id) from public.sku_progress g
                 where g.peserta_id = p.id and g.status in ('diajukan', 'proses', 'ulang')), '-') as "Sedang berjalan",
       case when p.calon_garuda is not null then 'ya' else '-' end as "Calon Garuda"
from public.profiles p join butir b on b.nis = p.nis
where p.role = 'peserta' and p.nis ~ '^9900[0-9]{2}$'
group by p.nis, p.nama, p.agama, p.id, p.calon_garuda
order by p.nis;
