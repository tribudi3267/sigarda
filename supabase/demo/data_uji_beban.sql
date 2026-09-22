-- ============================================================================
-- DATA UJI BEBAN (tahap L2-B): menambah Penegak FIKTIF berskala sekolah penuh (bawaan 700 aktif + 150 alumni, sama
-- dengan mode lokal ?data=penuh) beserta progres SKU dan riwayatnya, untuk mengukur kinerja Supabase sungguhan
-- (ukuran database, kecepatan kueri, beban serentak) mendekati skala pemakaian nyata.
--
-- **AMBIL CADANGAN DATA TERBARU DULU** (klik dua kali Cadangkan-SIGARDA.bat) SEBELUM MENJALANKAN INI.
-- Skrip ini MENULIS ke database sungguhan (bukan hanya membaca). Semua akun dan data yang dibuat bertanda jelas:
-- NIS 88xxxx dan nama berawalan "Uji ", sehingga mudah dibedakan dari anggota asli dan mudah dibersihkan lewat
-- supabase/demo/hapus_data_uji_beban.sql. Aman dijalankan berulang: NIS yang sudah ada dilewati (tidak digandakan,
-- tidak diduplikasi progres/riwayatnya); baris "Ringkasan" di paling akhir hanya menghitung yang BARU dibuat pada
-- eksekusi ini (0 pada eksekusi kedua dan seterusnya = wajar, berarti semua sudah ada).
--
-- SENGAJA TIDAK menyentuh kehadiran (absensi_hadir), iuran, atau iuran_kas: data itu bertanggal Jumat yang mungkin
-- SAMA dengan Jumat yang sedang dipakai anggota sungguhan, dan mencampur angka fiktif ke rekap iuran/kehadiran
-- sungguhan (dilihat Dewan Ambalan dan Bendahara) selama data uji ini ada. Progres SKU dan riwayat (dua tabel
-- TERBESAR menurut ukur_muatan.sql) sudah cukup mewakili beban baca/tulis dan ukuran database.
--
-- HANYA 30 akun (kelas XII, aktif) diberi PIN SUNGGUHAN untuk uji login serentak (lihat hasil kueri PALING AKHIR
-- setelah skrip ini selesai): PIN ACAK, ditampilkan HANYA SEKALI, TIDAK disimpan di mana pun oleh skrip ini.
-- SALIN SEKARANG ke luar repository (mis. berkas teks lokal di komputer Anda) dan JANGAN diunggah ke GitHub.
-- Akun uji lainnya (~800) mendapat kata sandi acak yang tidak diketahui siapa pun: mereka HANYA menambah volume
-- data, TIDAK BISA login, dan tidak perlu bisa login untuk uji baca/ukuran database.
--
-- Mengubah skala: ganti dua angka pada baris "create temp table param" di bawah (bawaan 700 dan 150).
-- HAPUS sesudah selesai uji (sebelum uji coba pengguna sungguhan): supabase/demo/hapus_data_uji_beban.sql.
-- ============================================================================
begin;

do $$
begin
  if to_regprocedure('crypt(text,text)') is null then
    raise exception 'Fungsi crypt() tidak ditemukan. Jalankan dulu: create extension if not exists pgcrypto with schema extensions;';
  end if;
end $$;

-- Catatan: tabel sementara di bawah SENGAJA tanpa "on commit drop" (agar tetap ada sesudah "commit;" untuk laporan
-- akhir dan tampilan PIN); dibuang sendiri di baris paling akhir berkas ini.
create temp table param as select 700 as penegak, 150 as alumni, 30 as login_nyata;

create temp table uji_konfig as
  select coalesce(
           (select split_part(u.email, '@', 2) from auth.users u join public.profiles p on p.id = u.id where p.role = 'admin' order by u.created_at limit 1),
           'sigarda.invalid') as domain,
         (select id from public.profiles where role = 'penguji' and jabatan = 'Pembina' order by dibuat, id limit 1) as pembina;

-- ---------------------------------------------------------------------------
-- 1. Baris Penegak fiktif (nama, kelas, sangga, agama, jenis kelamin, status) — pseudo-acak deterministik lewat
--    hashtext (bukan random(), agar dapat dijalankan ulang dengan aman tanpa mengubah baris yang sudah ada).
--    NIS 880000..880849 (bawaan): tidak akan bentrok dengan NIS sekolah biasa (umumnya lebih pendek).
-- ---------------------------------------------------------------------------
create temp table uji_penegak as
select
  n as urut,
  (880000 + n)::text as nis,
  'Uji ' ||
    (array['Ahmad','Siti','Budi','Dewi','Rizky','Putri','Agus','Rina','Fajar','Nadia','Bagas','Anisa','Wahyu','Maya','Dimas','Laras','Eko','Intan','Hendra','Ayu',
           'Rafi','Salsa','Yoga','Citra','Andi','Bunga','Farhan','Nabila','Galih','Tiara','Ilham','Mega','Joko','Vina','Reza','Dinda','Arif','Wulan','Krisna','Sekar'])
      [1 + abs(hashtext('d' || n)) % 40] || ' ' ||
    (array['Saputra','Wulandari','Pratama','Lestari','Hidayat','Kusuma','Nugroho','Ramadhan','Fitriani','Setiawan','Permata','Santoso','Anggraini','Wijaya','Purnama',
           'Maulana','Rahmawati','Prasetyo','Handayani','Firmansyah','Utami','Kurniawan','Safitri','Mahendra','Puspita'])
      [1 + abs(hashtext('b' || n)) % 25] as nama,
  (case when n >= p.penegak then 'XII' when n % 100 < 34 then 'X' when n % 100 < 68 then 'XI' else 'XII' end)
    || '-' || lpad(((n % 10) + 1)::text, 2, '0') as kelas,
  (array['Sangga Elang','Sangga Merak','Sangga Rajawali','Sangga Kasuari','Sangga Garuda','Sangga Cendrawasih','Sangga Kenari','Sangga Jalak','Sangga Bangau','Sangga Gagak','Sangga Alap','Sangga Pipit'])
    [1 + n % 12] as sangga,
  (case when abs(hashtext('a' || n)) % 100 < 80 then 'Islam' when abs(hashtext('a' || n)) % 100 < 88 then 'Protestan' when abs(hashtext('a' || n)) % 100 < 94 then 'Katolik'
        when abs(hashtext('a' || n)) % 100 < 97 then 'Hindu' when abs(hashtext('a' || n)) % 100 < 99 then 'Buddha' else 'Khonghucu' end) as agama,
  (case when n % 2 = 0 then 'L' else 'P' end) as jk,
  (case when n >= p.penegak then 'alumni' when n % 25 = 3 then 'nonaktif' else 'aktif' end) as status,
  (case when n >= p.penegak then '2025/2026' else null end) as lulus_ta,
  -- Bantara (kb) dan Laksana (kl) butir lulus sampai nomor ini: sama pola dengan mode lokal ?data=penuh.
  (case when n >= p.penegak or (case when n % 100 < 34 then 'X' when n % 100 < 68 then 'XI' else 'XII' end) = 'XII' then 23
        when (case when n % 100 < 34 then 'X' when n % 100 < 68 then 'XI' else 'XII' end) = 'XI' then 8 + abs(hashtext('kb' || n)) % 16
        else abs(hashtext('kb' || n)) % 13 end) as kb,
  (case when n >= p.penegak then 22
        when (case when n % 100 < 34 then 'X' when n % 100 < 68 then 'XI' else 'XII' end) = 'XII' and abs(hashtext('g' || n)) % 9 = 0 then 22
        when (case when n % 100 < 34 then 'X' when n % 100 < 68 then 'XI' else 'XII' end) = 'XII' then 4 + abs(hashtext('l' || n)) % 17
        when (case when n % 100 < 34 then 'X' when n % 100 < 68 then 'XI' else 'XII' end) = 'XI' then abs(hashtext('l' || n)) % 6
        else 0 end) as kl
from generate_series(0, (select penegak + alumni - 1 from param)) n, param p;

create temp table uji_login as
  select up.nis, lpad((900000 + abs(hashtext(gen_random_uuid()::text)) % 100000)::text, 6, '0') as pin
  from uji_penegak up where up.status = 'aktif' and up.kelas like 'XII-%'
  order by up.urut limit (select login_nyata from param);

-- ---------------------------------------------------------------------------
-- 2. Akun (Supabase Auth) dan profil. NIS yang sudah ada dilewati. `uji_baru` = HANYA baris yang benar-benar
--    dibuat pada eksekusi INI (dipakai di bagian 3 dan pada hasil PIN di paling akhir, agar rerun tidak menduplikasi).
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       up.nis || '@' || k.domain,
       crypt(coalesce(ul.pin, gen_random_uuid()::text), gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
       '', '', '', ''
from uji_penegak up cross join uji_konfig k left join uji_login ul on ul.nis = up.nis
where not exists (select 1 from auth.users u where u.email = up.nis || '@' || k.domain);

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       'email', u.id::text, now(), now(), now()
from uji_penegak up cross join uji_konfig k
join auth.users u on u.email = up.nis || '@' || k.domain
where not exists (select 1 from auth.identities i where i.user_id = u.id);

create temp table uji_baru as
  select u.id, up.nis, up.agama, up.kelas, up.status, up.kb, up.kl
  from uji_penegak up cross join uji_konfig k
  join auth.users u on u.email = up.nis || '@' || k.domain
  where not exists (select 1 from public.profiles pr where pr.id = u.id);

-- Semua akun BARU dibuat berstatus 'aktif' dulu (status akhir yang sebenarnya ada di up.status): pemicu
-- sigarda.tolak_peserta_tak_aktif menolak SEMUA penulisan sku_progress/sku_riwayat untuk Penegak nonaktif/alumni,
-- jadi progres dan riwayat (bagian 3) harus dibuat SELAGI aktif, baru status diturunkan sesudahnya (bagian 4).
insert into public.profiles (id, username, role, nama, nis, kelas, sangga, agama, jenis_kelamin, status, wajib_ganti_pin, dibuat)
select b.id, up.nis, 'peserta', up.nama, up.nis, up.kelas, up.sangga, up.agama, up.jk, 'aktif', false, sigarda.hari_ini()
from uji_baru b join uji_penegak up on up.nis = b.nis;

-- ---------------------------------------------------------------------------
-- 3. Progres SKU dan riwayat (dua tabel terbesar): hanya untuk baris yang BARU (uji_baru).
-- ---------------------------------------------------------------------------
insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji, nilai, verifikasi_token, diubah)
select b.id, u.id, 'lulus', k.pembina, sigarda.hari_ini() - (abs(hashtext(b.id::text || u.id)) % 300), 'Baik', sigarda.token_acak(), now()
from uji_baru b cross join uji_konfig k
join public.sku_unit u on (u.agama is null or u.agama = b.agama)
where (u.tingkat = 'Bantara' and u.butir_no <= b.kb) or (u.tingkat = 'Laksana' and u.butir_no <= b.kl)
on conflict do nothing;

update public.sku_progress set verifikasi = sigarda.kode_verifikasi(array[peserta_id::text, sku_id, coalesce(penguji_id::text, ''), coalesce(tanggal_uji::text, '')])
where status = 'lulus' and verifikasi is null and peserta_id in (select id from uji_baru);

insert into public.sku_riwayat (peserta_id, sku_id, waktu, teks, oleh)
select peserta_id, sku_id, tanggal_uji::timestamptz - interval '3 days', 'Mengajukan pengujian untuk ' || tanggal_uji::text, peserta_id
from public.sku_progress where status = 'lulus' and peserta_id in (select id from uji_baru)
union all
select peserta_id, sku_id, tanggal_uji::timestamptz, 'Lulus (Baik)', penguji_id
from public.sku_progress where status = 'lulus' and peserta_id in (select id from uji_baru);

-- pengajuan yang sedang berjalan (sebagian antrian rombel — penguji NULL, sebagian ditujukan ke Pembina)
insert into public.sku_progress (peserta_id, sku_id, status, jadwal, penguji_id, diubah)
select b.id, 'BAN-' || lpad((b.kb + 1)::text, 2, '0'),
       case when abs(hashtext(b.id::text)) % 3 = 0 then 'proses' else 'diajukan' end,
       sigarda.hari_ini() + (abs(hashtext(b.id::text)) % 5),
       case when abs(hashtext(b.id::text)) % 2 = 0 then null else k.pembina end, now()
from uji_baru b cross join uji_konfig k
where b.status = 'aktif' and b.kb between 1 and 22 and abs(hashtext(b.id::text)) % 14 = 0
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. Menurunkan status ke nilai akhir (alumni/nonaktif) SESUDAH progres dan riwayat dibuat (lihat catatan bagian 2).
-- ---------------------------------------------------------------------------
update public.profiles p set status = up.status, status_pada = sigarda.hari_ini() - 20, lulus_ta = up.lulus_ta
from uji_baru b join uji_penegak up on up.nis = b.nis
where p.id = b.id and up.status <> 'aktif';

commit;

-- ---------------------------------------------------------------------------
-- Ringkasan (baca setelah selesai). "Baru dibuat" = 0 pada eksekusi kedua dan seterusnya berarti semua sudah ada.
-- ---------------------------------------------------------------------------
select 'Data uji beban' as bagian,
       (select count(*) from public.profiles where nis ~ '^88[0-9]{4}$' and nama like 'Uji %') || ' akun Penegak uji total (target ' ||
       (select penegak + alumni from param) || ') | ' || (select count(*) from uji_baru) || ' baru dibuat pada eksekusi ini' as keterangan
union all
select 'Data uji beban', 'Progres SKU: ' || (select count(*) from public.sku_progress where peserta_id in (select id from public.profiles where nis ~ '^88[0-9]{4}$'))
  || ' baris | Riwayat: ' || (select count(*) from public.sku_riwayat where peserta_id in (select id from public.profiles where nis ~ '^88[0-9]{4}$')) || ' baris (total, semua akun uji)';

-- *** SALIN SEKARANG: PIN akun uji login (hanya akun BARU dibuat pada eksekusi ini; TIDAK ditampilkan lagi sesudahnya) ***
select up.nis as "NIS (nama pengguna)", ul.pin as "PIN (login sungguhan, uji beban serentak)"
from uji_login ul join uji_penegak up on up.nis = ul.nis
where up.nis in (select nis from uji_baru)
order by up.nis;

drop table if exists param, uji_konfig, uji_penegak, uji_login, uji_baru;
