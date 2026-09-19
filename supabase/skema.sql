-- ============================================================================
-- SIGARDA: skema database Supabase
--
-- Jalankan SELURUH berkas ini sekali di Supabase > SQL Editor (New query > tempel > Run).
--
-- PERINGATAN: berkas ini MENGHAPUS tabel SIGARDA yang sudah ada lalu membuatnya ulang.
-- Aman dipakai pada proyek yang masih kosong. Jangan dijalankan pada proyek yang sudah berisi
-- data sungguhan kecuali Anda memang ingin mengosongkannya.
--
-- Prinsip keamanan:
--   * Semua tabel memakai Row Level Security. Pengguna hanya BOLEH MEMBACA data sesuai perannya.
--   * TIDAK ADA pengguna yang boleh menulis langsung ke tabel. Semua perubahan lewat fungsi
--     sg_* (security definer) yang memeriksa peran dan menerapkan aturan SKU di server.
--   * Fungsi *_internal hanya bisa dipanggil oleh Edge Function (service_role).
-- ============================================================================

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 0. Bersihkan versi lama
-- ---------------------------------------------------------------------------
drop table if exists public.materi, public.portofolio_jurnal, public.portofolio,
  public.absensi_hadir, public.absensi_sesi, public.sku_riwayat, public.sku_progress,
  public.login_gagal, public.sku_unit, public.sku_butir, public.pf_item, public.profiles cascade;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f from pg_proc p
    where p.pronamespace = 'public'::regnamespace and (p.proname like 'sg\_%' or p.proname = 'peran')
  loop
    execute 'drop function if exists ' || r.f || ' cascade';
  end loop;
end $$;

drop schema if exists sigarda cascade;
create schema sigarda;
grant usage on schema sigarda to authenticated, service_role;

-- Tanggal hari ini menurut WIB (server Supabase memakai UTC; tanpa ini "hari ini" salah sebelum pukul 07.00 WIB)
create function sigarda.hari_ini() returns date language sql stable as
$$ select (now() at time zone 'Asia/Jakarta')::date $$;

-- ---------------------------------------------------------------------------
-- 1. Tabel
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),  -- NIS untuk Penegak
  role text not null check (role in ('peserta','penguji','admin')),
  nama text not null check (char_length(btrim(nama)) between 1 and 120),
  nis text unique, kelas text, sangga text,
  agama text check (agama in ('Islam','Katolik','Protestan','Hindu','Buddha','Khonghucu')),
  jabatan text check (jabatan in ('Dewan Ambalan','Pembina','Admin Gudep')),
  calon_garuda date,
  wajib_ganti_pin boolean not null default true,
  pin_direset_oleh uuid references public.profiles(id) on delete set null,
  pin_direset_pada timestamptz,
  pin_diubah timestamptz,
  dibuat date not null default sigarda.hari_ini(),
  constraint profil_peserta check (role <> 'peserta' or (nis is not null and kelas is not null and sangga is not null and agama is not null and jabatan is null)),
  constraint profil_penguji check (role <> 'penguji' or jabatan in ('Dewan Ambalan','Pembina')),
  constraint profil_admin check (role <> 'admin' or jabatan = 'Admin Gudep')
);

-- Katalog (diisi otomatis di bagian akhir berkas ini dari data aplikasi)
create table public.sku_butir (
  id text primary key,                     -- BAN-05
  tingkat text not null check (tingkat in ('Bantara','Laksana')),
  no int not null,
  teks text not null
);
create table public.sku_unit (
  id text primary key,                     -- BAN-05 atau BAN-01-ISL-1
  butir_id text not null references public.sku_butir(id),
  tingkat text not null,
  butir_no int not null,
  agama text,                              -- null = berlaku untuk semua agama
  sub int
);
create table public.pf_item (
  id text primary key                      -- PF-01 sampai PF-26
);

create table public.sku_progress (
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  sku_id text not null references public.sku_unit(id),
  status text not null default 'belum' check (status in ('belum','diajukan','proses','ulang','lulus')),
  jadwal date,
  penguji_id uuid references public.profiles(id) on delete set null,
  tanggal_uji date,
  nilai text check (nilai in ('Sangat baik','Baik','Cukup')),
  catatan text, catatan_peserta text,
  verifikasi text, diverifikasi_pada timestamptz,
  diubah timestamptz not null default now(),
  primary key (peserta_id, sku_id)
);
create table public.sku_riwayat (
  id bigint generated always as identity primary key,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  sku_id text not null,
  waktu timestamptz not null default now(),
  teks text not null,
  oleh uuid references public.profiles(id) on delete set null
);
create index on public.sku_riwayat (peserta_id);

create table public.absensi_sesi (
  tanggal date primary key check (extract(dow from tanggal) = 5),   -- hanya Jumat
  dibuat_oleh uuid references public.profiles(id) on delete set null,
  dibuat_pada timestamptz not null default now()
);
create table public.absensi_hadir (
  tanggal date not null references public.absensi_sesi(tanggal) on delete cascade,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('H','I','S','A')),
  oleh uuid references public.profiles(id) on delete set null,
  waktu timestamptz not null default now(),
  primary key (tanggal, peserta_id)
);
create index on public.absensi_hadir (peserta_id);

create table public.portofolio (
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null references public.pf_item(id),
  status text not null default 'belum' check (status in ('belum','proses','siap')),
  catatan text not null default '', tautan text not null default '',
  catatan_penguji text not null default '',
  catatan_penguji_oleh uuid references public.profiles(id) on delete set null,
  diperbarui timestamptz not null default now(),
  primary key (peserta_id, item_id)
);
create table public.portofolio_jurnal (
  id bigint generated always as identity primary key,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null,
  waktu timestamptz not null default now(),
  teks text not null,
  oleh uuid references public.profiles(id) on delete set null
);
create index on public.portofolio_jurnal (peserta_id);

-- Materi SKU: hanya tautan ke file PDF di Google Drive (file tidak disimpan di sini)
create table public.materi (
  id uuid primary key default gen_random_uuid(),
  urutan int not null,
  judul text not null check (char_length(judul) between 1 and 120),
  deskripsi text not null default '' check (char_length(deskripsi) <= 400),
  tautan text not null check (tautan ~ '^https?://' and char_length(tautan) <= 600),
  file_id text not null unique check (file_id ~ '^[A-Za-z0-9_-]{15,120}$'),
  resource_key text not null default '' check (resource_key ~ '^[A-Za-z0-9_-]{0,80}$'),
  butir text[] not null default '{}',
  bagian jsonb not null default '[]' check (jsonb_typeof(bagian) = 'array' and jsonb_array_length(bagian) <= 60),
  dibuat date not null default sigarda.hari_ini(),
  dibuat_oleh uuid references public.profiles(id) on delete set null
);

-- Pembatasan percobaan masuk per nama pengguna (hanya dipakai Edge Function)
create table public.login_gagal (
  username text primary key,
  jumlah int not null default 0,
  terkunci_sampai timestamptz,
  diperbarui timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Fungsi bantu (tidak diekspos lewat API)
-- ---------------------------------------------------------------------------
-- PIN awal (dari admin) dan PIN hasil reset WAJIB diganti dulu. Selama profil bertanda wajib_ganti_pin, server hanya
-- melayani pembacaan profil sendiri dan penggantian PIN; semua pembacaan dan aksi lain ditolak.
create function sigarda.aktif() returns boolean language plpgsql stable security definer set search_path = public as
$$ begin return coalesce((select not wajib_ganti_pin from public.profiles where id = auth.uid()), false); end $$;

create function sigarda.wajib_aktif() returns void language plpgsql stable security definer set search_path = public as
$$
begin
  if exists (select 1 from public.profiles where id = auth.uid() and wajib_ganti_pin) then
    raise exception 'Ganti PIN awal Anda lebih dulu sebelum memakai aplikasi.';
  end if;
end $$;

create function sigarda.peran() returns text language plpgsql stable security definer set search_path = public as
$$ begin return (select role from public.profiles where id = auth.uid()); end $$;

create function sigarda.pengurus() returns boolean language plpgsql stable security definer set search_path = public as
$$ begin return coalesce((select role in ('penguji','admin') and not wajib_ganti_pin from public.profiles where id = auth.uid()), false); end $$;

create function sigarda.kelola_materi() returns boolean language plpgsql stable security definer set search_path = public as
$$ begin
  return coalesce((select (role = 'admin' or (role = 'penguji' and jabatan = 'Pembina')) and not wajib_ganti_pin from public.profiles where id = auth.uid()), false);
end $$;

-- Seluruh unit SKU tingkat ini yang berlaku bagi peserta (sesuai agamanya) sudah lulus.
create function sigarda.tingkat_selesai(p_peserta uuid, p_tingkat text) returns boolean
language plpgsql stable security definer set search_path = public as
$$
begin
  return exists (select 1 from public.sku_unit where tingkat = p_tingkat)
    and not exists (
      select 1
      from public.sku_unit u
      join public.profiles p on p.id = p_peserta
      where u.tingkat = p_tingkat and (u.agama is null or u.agama = p.agama)
        and not exists (
          select 1 from public.sku_progress g
          where g.peserta_id = p_peserta and g.sku_id = u.id and g.status = 'lulus'
        )
    );
end $$;

create function sigarda.layak_garuda(p_peserta uuid) returns boolean
language plpgsql stable security definer set search_path = public as
$$ begin return sigarda.tingkat_selesai(p_peserta, 'Bantara') and sigarda.tingkat_selesai(p_peserta, 'Laksana'); end $$;

create function sigarda.kode_verifikasi(p_bagian text[]) returns text language sql immutable as
$$ select 'VRF-' || upper(lpad(substr(md5(array_to_string(p_bagian, '|')), 1, 7), 7, '0')) $$;

create function sigarda.rapikan(p_teks text) returns text language sql immutable as
$$ select regexp_replace(btrim(coalesce(p_teks, '')), '\s+', ' ', 'g') $$;

-- ---------------------------------------------------------------------------
-- 3. Row Level Security: baca sesuai peran, tanpa tulis langsung
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.sku_butir enable row level security;
alter table public.sku_unit enable row level security;
alter table public.pf_item enable row level security;
alter table public.sku_progress enable row level security;
alter table public.sku_riwayat enable row level security;
alter table public.absensi_sesi enable row level security;
alter table public.absensi_hadir enable row level security;
alter table public.portofolio enable row level security;
alter table public.portofolio_jurnal enable row level security;
alter table public.materi enable row level security;
alter table public.login_gagal enable row level security;   -- tanpa kebijakan: hanya service_role

-- Penegak melihat dirinya sendiri dan daftar penguji/admin; pengurus melihat semua.
-- Profil sendiri selalu terbaca (aplikasi perlu tahu apakah PIN wajib diganti); selebihnya hanya setelah PIN diganti.
--
-- PERFORMA: fungsi peran dibungkus (select ...) supaya Postgres menghitungnya SEKALI per kueri (InitPlan),
-- bukan sekali per baris. Tanpa pembungkus, pengurus yang membaca puluhan ribu baris memicu puluhan ribu
-- panggilan fungsi plpgsql (masing-masing satu pencarian profil). Hasilnya identik, hanya jauh lebih murah.
-- Perubahan ini ada juga sebagai migrasi mandiri di supabase/migrasi/2026-09-rls-ringan.sql (untuk database yang sudah berisi data).
create policy baca_profil on public.profiles for select to authenticated
  using (id = (select auth.uid()) or role in ('penguji','admin') or (select sigarda.pengurus()));

create policy baca_katalog_butir on public.sku_butir for select to authenticated using ((select sigarda.aktif()));
create policy baca_katalog_unit on public.sku_unit for select to authenticated using ((select sigarda.aktif()));
create policy baca_katalog_pf on public.pf_item for select to authenticated using ((select sigarda.aktif()));
create policy baca_materi on public.materi for select to authenticated using ((select sigarda.aktif()));
create policy baca_sesi on public.absensi_sesi for select to authenticated using ((select sigarda.aktif()));

create policy baca_progres on public.sku_progress for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
create policy baca_riwayat on public.sku_riwayat for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
create policy baca_absensi on public.absensi_hadir for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
create policy baca_portofolio on public.portofolio for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
create policy baca_jurnal on public.portofolio_jurnal for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));

-- ---------------------------------------------------------------------------
-- 4. Fungsi aksi (RPC). Semua memeriksa peran di server.
-- ---------------------------------------------------------------------------

-- ===== SKU: peserta mengajukan pengujian =====
create function public.sg_sku_ajukan(p_sku_id text, p_jadwal date, p_penguji_id uuid, p_catatan text default '')
returns void language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid(); v_p public.profiles; v_u public.sku_unit; v_status text;
begin
  perform sigarda.wajib_aktif();
  select * into v_p from public.profiles where id = v_uid;
  if not found or v_p.role <> 'peserta' then raise exception 'Hanya peserta yang dapat mengajukan pengujian.'; end if;
  select * into v_u from public.sku_unit where id = p_sku_id and (agama is null or agama = v_p.agama);
  if not found then raise exception 'Poin SKU tidak ditemukan.'; end if;

  select status into v_status from public.sku_progress where peserta_id = v_uid and sku_id = p_sku_id;
  if v_status = 'lulus' then raise exception 'Poin ini sudah lulus.'; end if;
  if v_status in ('diajukan','proses') then raise exception 'Poin ini sedang menunggu atau dalam pengujian.'; end if;
  if v_u.tingkat = 'Laksana' and not sigarda.tingkat_selesai(v_uid, 'Bantara') then
    raise exception 'Selesaikan seluruh butir Bantara lebih dulu.';
  end if;
  if p_jadwal is null then raise exception 'Tanggal pengujian wajib diisi.'; end if;
  if p_penguji_id is null or not exists (select 1 from public.profiles where id = p_penguji_id and role = 'penguji') then
    raise exception 'Pilih penguji terlebih dulu.';
  end if;
  if char_length(coalesce(p_catatan, '')) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;

  insert into public.sku_progress (peserta_id, sku_id, status, jadwal, penguji_id, catatan_peserta, diubah)
  values (v_uid, p_sku_id, 'diajukan', p_jadwal, p_penguji_id, btrim(coalesce(p_catatan, '')), now())
  on conflict (peserta_id, sku_id) do update
    set status = 'diajukan', jadwal = excluded.jadwal, penguji_id = excluded.penguji_id,
        catatan_peserta = excluded.catatan_peserta, diubah = now();
  insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
  values (v_uid, p_sku_id, 'Mengajukan pengujian untuk ' || to_char(p_jadwal, 'YYYY-MM-DD'), v_uid);
end $$;

create function public.sg_sku_batal(p_sku_id text) returns void
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_status text;
begin
  perform sigarda.wajib_aktif();
  if not exists (select 1 from public.profiles where id = v_uid and role = 'peserta') then
    raise exception 'Hanya peserta yang dapat membatalkan pengajuan.';
  end if;
  select status into v_status from public.sku_progress where peserta_id = v_uid and sku_id = p_sku_id;
  if v_status is distinct from 'diajukan' then
    raise exception 'Hanya pengajuan yang belum mulai diuji yang bisa dibatalkan.';
  end if;
  update public.sku_progress
    set status = 'belum', jadwal = null, penguji_id = null, catatan_peserta = '', diubah = now()
    where peserta_id = v_uid and sku_id = p_sku_id;
  insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (v_uid, p_sku_id, 'Pengajuan dibatalkan peserta', v_uid);
end $$;

-- ===== SKU: penguji mencatat hasil. HANYA dipanggil Edge Function setelah PIN penguji diverifikasi. =====
create function public.sg_sku_catat_internal(
  p_oleh uuid, p_peserta_id uuid, p_sku_id text, p_hasil text,
  p_tanggal_uji date default null, p_nilai text default null, p_catatan text default ''
) returns void language plpgsql security definer set search_path = public as
$$
declare v_p public.profiles; v_kode text; v_cat text := btrim(coalesce(p_catatan, ''));
begin
  if not exists (select 1 from public.profiles where id = p_oleh and role = 'penguji') then
    raise exception 'Hanya Pembina atau Dewan Ambalan yang dapat mencatat hasil.';
  end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Peserta tidak ditemukan.'; end if;
  if not exists (select 1 from public.sku_unit where id = p_sku_id and (agama is null or agama = v_p.agama)) then
    raise exception 'Poin SKU tidak ditemukan.';
  end if;
  if p_hasil not in ('proses','lulus','ulang','reset') then raise exception 'Hasil pengujian tidak dikenal.'; end if;
  if p_hasil <> 'reset' and p_tanggal_uji is null then raise exception 'Tanggal uji wajib diisi.'; end if;
  if p_hasil <> 'reset' and p_sku_id like 'LAK-%' and not sigarda.tingkat_selesai(p_peserta_id, 'Bantara') then
    raise exception 'Peserta belum menyelesaikan seluruh butir Bantara.';
  end if;
  if char_length(v_cat) > 1000 then raise exception 'Catatan maksimal 1000 karakter.'; end if;

  if p_hasil = 'proses' then
    insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji)
    values (p_peserta_id, p_sku_id, 'proses', p_oleh, p_tanggal_uji)
    on conflict (peserta_id, sku_id) do update
      set status = 'proses', penguji_id = p_oleh, tanggal_uji = p_tanggal_uji, verifikasi = null, diverifikasi_pada = null, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (p_peserta_id, p_sku_id, 'Pengujian dimulai', p_oleh);

  elsif p_hasil = 'lulus' then
    if p_nilai is null then raise exception 'Pilih predikat penilaian.'; end if;
    if p_nilai not in ('Sangat baik','Baik','Cukup') then raise exception 'Predikat tidak dikenal.'; end if;
    v_kode := sigarda.kode_verifikasi(array[p_peserta_id::text, p_sku_id, p_oleh::text, p_tanggal_uji::text]);
    insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji, nilai, catatan, verifikasi, diverifikasi_pada)
    values (p_peserta_id, p_sku_id, 'lulus', p_oleh, p_tanggal_uji, p_nilai, v_cat, v_kode, now())
    on conflict (peserta_id, sku_id) do update
      set status = 'lulus', penguji_id = p_oleh, tanggal_uji = p_tanggal_uji, nilai = p_nilai, catatan = v_cat,
          verifikasi = v_kode, diverifikasi_pada = now(), diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (p_peserta_id, p_sku_id, 'Dinyatakan lulus (' || p_nilai || '), kode ' || v_kode, p_oleh);

  elsif p_hasil = 'ulang' then
    if v_cat = '' then raise exception 'Isi catatan agar peserta tahu bagian yang perlu diperbaiki.'; end if;
    insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji, nilai, catatan)
    values (p_peserta_id, p_sku_id, 'ulang', p_oleh, p_tanggal_uji, null, v_cat)
    on conflict (peserta_id, sku_id) do update
      set status = 'ulang', penguji_id = p_oleh, tanggal_uji = p_tanggal_uji, nilai = null, catatan = v_cat,
          verifikasi = null, diverifikasi_pada = null, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (p_peserta_id, p_sku_id, 'Perlu diulang', p_oleh);

  else -- reset
    if v_cat = '' then raise exception 'Isi alasan pembatalan status.'; end if;
    insert into public.sku_progress (peserta_id, sku_id, status)
    values (p_peserta_id, p_sku_id, 'belum')
    on conflict (peserta_id, sku_id) do update
      set status = 'belum', penguji_id = null, tanggal_uji = null, jadwal = null, nilai = null, catatan = '',
          catatan_peserta = '', verifikasi = null, diverifikasi_pada = null, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (p_peserta_id, p_sku_id, 'Status dikembalikan ke belum diuji. Alasan: ' || v_cat, p_oleh);
  end if;
end $$;

-- ===== Pencalonan Penegak Garuda =====
create function public.sg_calon_garuda_daftar() returns void
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_p public.profiles;
begin
  perform sigarda.wajib_aktif();
  select * into v_p from public.profiles where id = v_uid;
  if not found or v_p.role <> 'peserta' then raise exception 'Hanya peserta yang dapat mencalonkan diri.'; end if;
  if not sigarda.layak_garuda(v_uid) then raise exception 'Seluruh butir SKU Bantara dan Laksana harus lulus lebih dulu.'; end if;
  if v_p.calon_garuda is null then
    update public.profiles set calon_garuda = sigarda.hari_ini() where id = v_uid;
  end if;
end $$;

-- ===== Jurnal portofolio Garuda =====
create function public.sg_pf_ubah(p_item_id text, p_status text default null, p_catatan text default null, p_tautan text default null)
returns void language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid(); v_p public.profiles;
  v_status text := 'belum'; v_catatan text := ''; v_tautan text := '';
  n_status text; n_catatan text; n_tautan text; v_ubah text[] := '{}';
  v_label jsonb := '{"belum":"Belum siap","proses":"Sedang disiapkan","siap":"Siap (Ada)"}';
begin
  perform sigarda.wajib_aktif();
  select * into v_p from public.profiles where id = v_uid;
  if not found or v_p.role <> 'peserta' or v_p.calon_garuda is null or not sigarda.layak_garuda(v_uid) then
    raise exception 'Jurnal portofolio khusus Penegak Calon Garuda.';
  end if;
  if not exists (select 1 from public.pf_item where id = p_item_id) then raise exception 'Dokumen portofolio tidak dikenal.'; end if;
  if p_status is not null and p_status not in ('belum','proses','siap') then raise exception 'Status tidak dikenal.'; end if;
  if char_length(coalesce(p_catatan, '')) > 2000 then raise exception 'Catatan maksimal 2000 karakter.'; end if;
  if char_length(coalesce(p_tautan, '')) > 500 then raise exception 'Tautan maksimal 500 karakter.'; end if;
  if btrim(coalesce(p_tautan, '')) <> '' and btrim(p_tautan) !~* '^https?://' then
    raise exception 'Tautan harus diawali http:// atau https://';
  end if;

  select status, catatan, tautan into v_status, v_catatan, v_tautan
    from public.portofolio where peserta_id = v_uid and item_id = p_item_id;
  if not found then   -- SELECT INTO mengisi NULL bila tidak ada baris; kembalikan ke nilai awal
    v_status := 'belum'; v_catatan := ''; v_tautan := '';
  end if;
  n_status := coalesce(p_status, v_status);
  n_catatan := case when p_catatan is null then v_catatan else btrim(p_catatan) end;
  n_tautan := case when p_tautan is null then v_tautan else btrim(p_tautan) end;

  if n_status <> v_status then v_ubah := v_ubah || ('Status: ' || (v_label->>v_status) || ' menjadi ' || (v_label->>n_status)); end if;
  if n_catatan <> btrim(v_catatan) then v_ubah := v_ubah || 'Catatan diperbarui'::text; end if;
  if n_tautan <> btrim(v_tautan) then v_ubah := v_ubah || 'Tautan berkas diperbarui'::text; end if;
  if cardinality(v_ubah) = 0 then return; end if;

  insert into public.portofolio (peserta_id, item_id, status, catatan, tautan, diperbarui)
  values (v_uid, p_item_id, n_status, n_catatan, n_tautan, now())
  on conflict (peserta_id, item_id) do update
    set status = n_status, catatan = n_catatan, tautan = n_tautan, diperbarui = now();
  insert into public.portofolio_jurnal (peserta_id, item_id, teks, oleh)
  values (v_uid, p_item_id, array_to_string(v_ubah, '. '), v_uid);
end $$;

create function public.sg_pf_catat_penguji(p_peserta_id uuid, p_item_id text, p_catatan text) returns void
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_lama text := ''; v_baru text := btrim(coalesce(p_catatan, ''));
begin
  perform sigarda.wajib_aktif();
  if not exists (select 1 from public.profiles where id = v_uid and role = 'penguji') then
    raise exception 'Hanya Pembina atau Dewan Ambalan yang dapat memberi catatan.';
  end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  if not exists (select 1 from public.pf_item where id = p_item_id) then raise exception 'Dokumen portofolio tidak dikenal.'; end if;
  if char_length(v_baru) > 2000 then raise exception 'Catatan maksimal 2000 karakter.'; end if;

  select catatan_penguji into v_lama from public.portofolio where peserta_id = p_peserta_id and item_id = p_item_id;
  if v_baru = btrim(coalesce(v_lama, '')) then return; end if;

  insert into public.portofolio (peserta_id, item_id, catatan_penguji, catatan_penguji_oleh, diperbarui)
  values (p_peserta_id, p_item_id, v_baru, v_uid, now())
  on conflict (peserta_id, item_id) do update set catatan_penguji = v_baru, catatan_penguji_oleh = v_uid;
  insert into public.portofolio_jurnal (peserta_id, item_id, teks, oleh)
  values (p_peserta_id, p_item_id, case when v_baru = '' then 'Catatan penguji dihapus' else 'Catatan penguji ditambahkan' end, v_uid);
end $$;

-- ===== Absensi latihan Jumat (dicatat pengurus) =====
create function public.sg_absen_buat_sesi(p_tanggal date) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau admin yang dapat mencatat absensi.'; end if;
  if p_tanggal is null or p_tanggal < date '2000-01-01' or p_tanggal > date '2100-12-31' then raise exception 'Tanggal tidak valid.'; end if;
  if extract(dow from p_tanggal) <> 5 then raise exception 'Latihan rutin hanya dicatat pada hari Jumat.'; end if;
  if p_tanggal > sigarda.hari_ini() then raise exception 'Sesi belum bisa dibuat untuk tanggal yang belum tiba.'; end if;
  insert into public.absensi_sesi (tanggal, dibuat_oleh) values (p_tanggal, auth.uid()) on conflict (tanggal) do nothing;
end $$;

create function public.sg_absen_set(p_tanggal date, p_peserta_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Tidak diizinkan.'; end if;
  if p_status is not null and p_status not in ('H','I','S','A') then raise exception 'Status absensi tidak dikenal.'; end if;
  if not exists (select 1 from public.absensi_sesi where tanggal = p_tanggal) then raise exception 'Sesi absensi belum dibuat.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  if p_status is null then
    delete from public.absensi_hadir where tanggal = p_tanggal and peserta_id = p_peserta_id;
  else
    insert into public.absensi_hadir (tanggal, peserta_id, status, oleh) values (p_tanggal, p_peserta_id, p_status, auth.uid())
    on conflict (tanggal, peserta_id) do update set status = excluded.status, oleh = excluded.oleh, waktu = now();
  end if;
end $$;

create function public.sg_absen_set_banyak(p_tanggal date, p_peserta_ids uuid[], p_status text, p_hanya_kosong boolean default true)
returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Tidak diizinkan.'; end if;
  if p_status is null or p_status not in ('H','I','S','A') then raise exception 'Status absensi tidak dikenal.'; end if;
  if not exists (select 1 from public.absensi_sesi where tanggal = p_tanggal) then raise exception 'Sesi absensi belum dibuat.'; end if;
  insert into public.absensi_hadir (tanggal, peserta_id, status, oleh)
  select p_tanggal, u.id, p_status, auth.uid()
  from public.profiles u where u.role = 'peserta' and u.id = any (p_peserta_ids)
  on conflict (tanggal, peserta_id) do update
    set status = excluded.status, oleh = excluded.oleh, waktu = now()
    where not p_hanya_kosong;
end $$;

create function public.sg_absen_hapus_sesi(p_tanggal date) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Tidak diizinkan.'; end if;
  delete from public.absensi_sesi where tanggal = p_tanggal;   -- catatan kehadiran ikut terhapus (cascade)
end $$;

-- ===== Data anggota (Admin Gudep). Pembuatan dan penghapusan akun lewat Edge Function. =====
create function public.sg_anggota_ubah(
  p_id uuid, p_nama text, p_kelas text default null, p_sangga text default null,
  p_agama text default null, p_calon_garuda boolean default null
) returns void language plpgsql security definer set search_path = public as
$$
declare v_t public.profiles; v_nama text := sigarda.rapikan(p_nama); v_kelas text; v_sangga text;
begin
  perform sigarda.wajib_aktif();
  if coalesce((select role from public.profiles where id = auth.uid()), '') <> 'admin' then
    raise exception 'Hanya Admin Gudep yang dapat mengubah data anggota.';
  end if;
  select * into v_t from public.profiles where id = p_id;
  if not found then raise exception 'Anggota tidak ditemukan.'; end if;
  if v_nama = '' then raise exception 'Nama wajib diisi.'; end if;
  if char_length(v_nama) > 120 then raise exception 'Nama maksimal 120 karakter.'; end if;

  if v_t.role <> 'peserta' then
    update public.profiles set nama = v_nama where id = p_id;
    return;
  end if;

  v_kelas := sigarda.rapikan(p_kelas);
  v_sangga := sigarda.rapikan(p_sangga);
  if v_kelas = '' or v_sangga = '' then raise exception 'Kelas dan sangga peserta wajib diisi.'; end if;
  if p_agama is null or p_agama = '' then raise exception 'Agama wajib diisi. Butir 1 SKU menyesuaikan agama peserta.'; end if;
  if p_agama not in ('Islam','Katolik','Protestan','Hindu','Buddha','Khonghucu') then raise exception 'Agama tidak dikenal.'; end if;
  -- samakan penulisan dengan data yang sudah ada (abaikan huruf besar/kecil)
  v_kelas := coalesce((select kelas from public.profiles where role = 'peserta' and lower(kelas) = lower(v_kelas) limit 1), v_kelas);
  v_sangga := coalesce((select sangga from public.profiles where role = 'peserta' and lower(sangga) = lower(v_sangga) limit 1), v_sangga);

  update public.profiles set nama = v_nama, kelas = v_kelas, sangga = v_sangga, agama = p_agama where id = p_id;

  if p_calon_garuda is true then
    if v_t.calon_garuda is null then
      if sigarda.layak_garuda(p_id) then
        update public.profiles set calon_garuda = sigarda.hari_ini() where id = p_id;
      else
        raise exception 'Status Calon Garuda hanya untuk peserta yang seluruh SKU Bantara dan Laksana-nya lulus.';
      end if;
    end if;
  elsif p_calon_garuda is false then
    update public.profiles set calon_garuda = null where id = p_id;
  end if;
end $$;

-- ===== Materi SKU (Pembina dan Admin Gudep) =====
create function public.sg_materi_simpan(
  p_id uuid, p_judul text, p_deskripsi text, p_tautan text, p_file_id text, p_resource_key text,
  p_butir text[], p_bagian jsonb
) returns uuid language plpgsql security definer set search_path = public as
$$
declare v_id uuid; v_judul text := sigarda.rapikan(p_judul); v_b jsonb; v_butir text[];
begin
  perform sigarda.wajib_aktif();
  if not sigarda.kelola_materi() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengelola materi.'; end if;
  if v_judul = '' then raise exception 'Judul materi wajib diisi.'; end if;
  if char_length(v_judul) > 120 then raise exception 'Judul materi maksimal 120 karakter.'; end if;
  if char_length(coalesce(p_deskripsi, '')) > 400 then raise exception 'Deskripsi maksimal 400 karakter.'; end if;
  if coalesce(p_file_id, '') !~ '^[A-Za-z0-9_-]{15,120}$' then raise exception 'ID file Google Drive tidak sah.'; end if;
  if coalesce(p_tautan, '') !~ '^https?://' then raise exception 'Tautan tidak sah.'; end if;

  select coalesce(array_agg(distinct b), '{}') into v_butir from unnest(coalesce(p_butir, '{}')) b;
  if exists (select 1 from unnest(v_butir) b where b not in (select id from public.sku_butir)) then
    raise exception 'Ada kode butir SKU yang tidak dikenal.';
  end if;

  p_bagian := coalesce(p_bagian, '[]'::jsonb);
  if jsonb_typeof(p_bagian) <> 'array' or jsonb_array_length(p_bagian) > 60 then raise exception 'Daftar isi tidak sah (maksimal 60 bagian).'; end if;
  for v_b in select * from jsonb_array_elements(p_bagian) loop
    if jsonb_typeof(v_b) <> 'object' or char_length(btrim(coalesce(v_b->>'judul', ''))) not between 1 and 120 then
      raise exception 'Setiap bagian daftar isi wajib berjudul (maksimal 120 karakter).';
    end if;
    if coalesce(v_b->>'halaman', '') !~ '^(\d{1,4}(-\d{1,4})?)?$' then
      raise exception 'Halaman pada daftar isi harus berupa angka, mis. 3 atau 3-5.';
    end if;
  end loop;

  begin
    if p_id is null then
      insert into public.materi (urutan, judul, deskripsi, tautan, file_id, resource_key, butir, bagian, dibuat_oleh)
      values ((select coalesce(max(urutan), 0) + 1 from public.materi), v_judul, btrim(coalesce(p_deskripsi, '')), btrim(p_tautan),
              p_file_id, coalesce(p_resource_key, ''), v_butir, p_bagian, auth.uid())
      returning id into v_id;
    else
      update public.materi
        set judul = v_judul, deskripsi = btrim(coalesce(p_deskripsi, '')), tautan = btrim(p_tautan), file_id = p_file_id,
            resource_key = coalesce(p_resource_key, ''), butir = v_butir, bagian = p_bagian
        where id = p_id returning id into v_id;
      if v_id is null then raise exception 'Materi tidak ditemukan. Mungkin sudah dihapus.'; end if;
    end if;
  exception when unique_violation then
    raise exception 'File ini sudah dipakai pada materi lain. Hubungkan butir tambahan pada materi tersebut.';
  end;
  return v_id;
end $$;

create function public.sg_materi_hapus(p_id uuid) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.kelola_materi() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengelola materi.'; end if;
  delete from public.materi where id = p_id;
end $$;

create function public.sg_materi_geser(p_id uuid, p_arah int) returns void
language plpgsql security definer set search_path = public as
$$
declare v_u int; v_tetangga uuid; v_ut int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.kelola_materi() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengelola materi.'; end if;
  select urutan into v_u from public.materi where id = p_id;
  if v_u is null then return; end if;
  if p_arah < 0 then
    select id, urutan into v_tetangga, v_ut from public.materi where urutan < v_u order by urutan desc limit 1;
  else
    select id, urutan into v_tetangga, v_ut from public.materi where urutan > v_u order by urutan asc limit 1;
  end if;
  if v_tetangga is null then return; end if;
  update public.materi set urutan = case when id = p_id then v_ut else v_u end where id in (p_id, v_tetangga);
end $$;

-- ===== Fungsi untuk Edge Function saja (service_role) =====

-- Membuat baris profil untuk akun yang baru dibuat di Supabase Auth. Menyamakan penulisan kelas dan sangga.
create function public.sg_profil_buat_internal(
  p_id uuid, p_username text, p_role text, p_nama text, p_nis text, p_kelas text, p_sangga text, p_agama text, p_jabatan text
) returns void language plpgsql security definer set search_path = public as
$$
declare v_kelas text := sigarda.rapikan(p_kelas); v_sangga text := sigarda.rapikan(p_sangga);
begin
  if p_role = 'peserta' then
    v_kelas := coalesce((select kelas from public.profiles where role = 'peserta' and lower(kelas) = lower(v_kelas) limit 1), v_kelas);
    v_sangga := coalesce((select sangga from public.profiles where role = 'peserta' and lower(sangga) = lower(v_sangga) limit 1), v_sangga);
  end if;
  insert into public.profiles (id, username, role, nama, nis, kelas, sangga, agama, jabatan)
  values (p_id, p_username, p_role, sigarda.rapikan(p_nama),
          nullif(p_nis, ''), nullif(v_kelas, ''), nullif(v_sangga, ''), nullif(p_agama, ''), nullif(p_jabatan, ''));
end $$;

-- Pembatasan percobaan masuk: 5 kali salah berturut-turut mengunci nama pengguna itu selama 5 menit.
create function public.sg_kunci_cek_internal(p_username text) returns int
language plpgsql security definer set search_path = public as
$$
declare v_sampai timestamptz;
begin
  select terkunci_sampai into v_sampai from public.login_gagal where username = p_username;
  if v_sampai is not null and v_sampai > now() then return ceil(extract(epoch from (v_sampai - now())) / 60)::int; end if;
  return 0;
end $$;

create function public.sg_kunci_gagal_internal(p_username text) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare v_j int; v_sampai timestamptz; v_dp timestamptz; v_n int;
begin
  select jumlah, terkunci_sampai, diperbarui into v_j, v_sampai, v_dp from public.login_gagal where username = p_username for update;
  if not found then v_j := 0; end if;
  -- hitungan dianggap baru bila kunci sebelumnya sudah habis atau percobaan terakhir sudah lama
  if (v_sampai is not null and v_sampai <= now()) or (v_dp is not null and v_dp < now() - interval '15 minutes') then v_j := 0; end if;
  v_n := v_j + 1;
  if v_n >= 5 then
    insert into public.login_gagal (username, jumlah, terkunci_sampai, diperbarui) values (p_username, 0, now() + interval '5 minutes', now())
      on conflict (username) do update set jumlah = 0, terkunci_sampai = now() + interval '5 minutes', diperbarui = now();
    return jsonb_build_object('sisa', 0, 'terkunci', true, 'menit', 5);
  end if;
  insert into public.login_gagal (username, jumlah, terkunci_sampai, diperbarui) values (p_username, v_n, null, now())
    on conflict (username) do update set jumlah = v_n, terkunci_sampai = null, diperbarui = now();
  return jsonb_build_object('sisa', 5 - v_n, 'terkunci', false, 'menit', 0);
end $$;

create function public.sg_kunci_lepas_internal(p_username text) returns void
language plpgsql security definer set search_path = public as
$$ begin delete from public.login_gagal where username = p_username; end $$;

-- ---------------------------------------------------------------------------
-- 5. Hak akses: baca saja untuk pengguna; fungsi aksi hanya untuk pengguna masuk
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.sku_butir, public.sku_unit, public.pf_item, public.sku_progress,
  public.sku_riwayat, public.absensi_sesi, public.absensi_hadir, public.portofolio, public.portofolio_jurnal,
  public.materi to authenticated;

revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.sg_sku_ajukan(text, date, uuid, text), public.sg_sku_batal(text), public.sg_calon_garuda_daftar(),
  public.sg_pf_ubah(text, text, text, text), public.sg_pf_catat_penguji(uuid, text, text),
  public.sg_absen_buat_sesi(date), public.sg_absen_set(date, uuid, text),
  public.sg_absen_set_banyak(date, uuid[], text, boolean), public.sg_absen_hapus_sesi(date),
  public.sg_anggota_ubah(uuid, text, text, text, text, boolean),
  public.sg_materi_simpan(uuid, text, text, text, text, text, text[], jsonb),
  public.sg_materi_hapus(uuid), public.sg_materi_geser(uuid, int)
  to authenticated;
grant execute on function
  public.sg_sku_catat_internal(uuid, uuid, text, text, date, text, text),
  public.sg_profil_buat_internal(uuid, text, text, text, text, text, text, text, text),
  public.sg_kunci_cek_internal(text), public.sg_kunci_gagal_internal(text), public.sg_kunci_lepas_internal(text)
  to service_role;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Katalog butir SKU dan dokumen portofolio (dibuat otomatis dari data aplikasi)
-- ---------------------------------------------------------------------------
-- (dibuat otomatis oleh scripts/buat-skema.mjs; jangan diubah manual)
insert into public.sku_butir (id, tingkat, no, teks) values
  ('BAN-01', 'Bantara', 1, 'Sesuai agama yang dianut (ketakwaan)'),
  ('BAN-02', 'Bantara', 2, 'Berani menyampaikan kritik dan saran dengan sopan dan santun kepada sesama teman.'),
  ('BAN-03', 'Bantara', 3, 'Dapat mengikuti jalannya diskusi dengan baik.'),
  ('BAN-04', 'Bantara', 4, 'Dapat saling menghormati dan toleransi dalam bakti antar umat beragama.'),
  ('BAN-05', 'Bantara', 5, 'Mengikuti pertemuan Ambalan sekurang-kurangnya 2 kali setiap bulan.'),
  ('BAN-06', 'Bantara', 6, 'Setia membayar iuran kepada gugus depan, dengan uang yang diperoleh dari usaha sendiri.'),
  ('BAN-07', 'Bantara', 7, 'Dapat berbahasa Indonesia dengan baik dan benar dalam pergaulan sehari-hari.'),
  ('BAN-08', 'Bantara', 8, 'Telah membantu mengelola kegiatan di Ambalan.'),
  ('BAN-09', 'Bantara', 9, 'Telah ikut aktif kerja bakti di masyarakat minimal 2 kali.'),
  ('BAN-10', 'Bantara', 10, 'Dapat menampilkan kesenian daerah di depan umum minimal satu kali.'),
  ('BAN-11', 'Bantara', 11, 'Mengenal, mengerti dan memahami isi AD & ART Gerakan Pramuka.'),
  ('BAN-12', 'Bantara', 12, 'Dapat menjelaskan sejarah Kepramukaan Indonesia dan dunia.'),
  ('BAN-13', 'Bantara', 13, 'Dapat menggunakan jam, kompas, tanda jejak dan tanda-tanda alam lainnya dalam pengembaraan.'),
  ('BAN-14', 'Bantara', 14, 'Dapat menjelaskan bentuk pengamalan Pancasila dalam kehidupan sehari-hari.'),
  ('BAN-15', 'Bantara', 15, 'Dapat menjelaskan tentang organisasi ASEAN dan PBB.'),
  ('BAN-16', 'Bantara', 16, 'Dapat menjelaskan tentang kewirausahaan.'),
  ('BAN-17', 'Bantara', 17, 'Dapat mendaur ulang barang bekas menjadi barang yang bermanfaat.'),
  ('BAN-18', 'Bantara', 18, 'Dapat menerapkan pengetahuannya tentang tali temali dan pionering dalam kehidupan sehari-hari.'),
  ('BAN-19', 'Bantara', 19, 'Selalu berolahraga, mampu melakukan olahraga renang gaya bebas dan menguasai 1 (satu) cabang olahraga tim.'),
  ('BAN-20', 'Bantara', 20, 'Dapat menjelaskan perkembangan fisik laki-laki dan perempuan.'),
  ('BAN-21', 'Bantara', 21, 'Dapat memimpin baris-berbaris dan menjelaskan peraturannya kepada anggota sangganya.'),
  ('BAN-22', 'Bantara', 22, 'Dapat menyebutkan beberapa penyakit infeksi, degeneratif dan penyakit yang disebabkan perilaku tidak sehat.'),
  ('BAN-23', 'Bantara', 23, 'Ikut serta dalam perkemahan selama 3 hari berturut-turut.'),
  ('LAK-01', 'Laksana', 1, 'Sesuai agama yang dianut (ketakwaan)'),
  ('LAK-02', 'Laksana', 2, 'Dapat menerima kritik orang lain, serta berani mengeluarkan pendapatnya dengan tertib, sopan dan santun kepada orang-orang di sekitarnya.'),
  ('LAK-03', 'Laksana', 3, 'Dapat mengikuti atau memimpin diskusi Ambalan dan mampu mengambil keputusan.'),
  ('LAK-04', 'Laksana', 4, 'Dapat menjadi penengah (memberi solusi), jika terjadi ketidaksepahaman dalam kelompoknya.'),
  ('LAK-05', 'Laksana', 5, 'Mengikuti pertemuan Ambalan sekurang-kurangnya 3 kali setiap bulan.'),
  ('LAK-06', 'Laksana', 6, 'Setia membayar iuran kepada gugus depannya, dengan uang yang diperoleh dari usaha sendiri, serta membantu Ambalan dalam mengelola administrasi keuangan.'),
  ('LAK-07', 'Laksana', 7, 'Dapat memimpin rapat dan membuat risalah dengan baik.'),
  ('LAK-08', 'Laksana', 8, 'Pernah memimpin kegiatan di tingkat Ambalan.'),
  ('LAK-09', 'Laksana', 9, 'Pernah memimpin kerja bakti di masyarakat minimal 2 kali.'),
  ('LAK-10', 'Laksana', 10, 'Dapat memimpin kelompok dalam menampilkan salah satu jenis kesenian daerah.'),
  ('LAK-11', 'Laksana', 11, 'Dapat menjelaskan isi AD & ART Gerakan Pramuka kepada Ambalan.'),
  ('LAK-12', 'Laksana', 12, 'Dapat menjelaskan di muka umum tentang sejarah kepramukaan Indonesia dan dunia.'),
  ('LAK-13', 'Laksana', 13, 'Dapat melakukan pengembaraan selama 3 hari dan atau mengatur kehidupan perkemahan selama minimal 3 hari.'),
  ('LAK-14', 'Laksana', 14, 'Dapat menjelaskan sejarah, arti, tatacara penggunaan dan kiasan Sang Merah Putih.'),
  ('LAK-15', 'Laksana', 15, 'Dapat menjelaskan peran Indonesia dalam organisasi ASEAN dan PBB.'),
  ('LAK-16', 'Laksana', 16, 'Telah memiliki keterampilan kewirausahaan yang dapat menghasilkan uang.'),
  ('LAK-17', 'Laksana', 17, 'Dapat membuat salah satu jenis peralatan teknologi tepat guna.'),
  ('LAK-18', 'Laksana', 18, 'Secara berkelompok dapat membuat struktur dari keterampilan tali temali dan pionering, yang dapat digunakan masyarakat.'),
  ('LAK-19', 'Laksana', 19, 'Selalu berolahraga. Dapat melakukan olahraga renang selain gaya bebas dan menguasai 1 (satu) cabang olahraga lainnya.'),
  ('LAK-20', 'Laksana', 20, 'Dapat memahami dan menjelaskan tentang kesehatan reproduksi.'),
  ('LAK-21', 'Laksana', 21, 'Dapat mempersiapkan dan melaksanakan upacara umum minimal 3 kali.'),
  ('LAK-22', 'Laksana', 22, 'Dapat menyebutkan penyebab dan cara pencegahan penyakit infeksi, degeneratif dan penyakit yang disebabkan perilaku tidak sehat.');

insert into public.sku_unit (id, butir_id, tingkat, butir_no, agama, sub) values
  ('BAN-01-BUD-1', 'BAN-01', 'Bantara', 1, 'Buddha', 1),
  ('BAN-01-BUD-2', 'BAN-01', 'Bantara', 1, 'Buddha', 2),
  ('BAN-01-BUD-3', 'BAN-01', 'Bantara', 1, 'Buddha', 3),
  ('BAN-01-BUD-4', 'BAN-01', 'Bantara', 1, 'Buddha', 4),
  ('BAN-01-BUD-5', 'BAN-01', 'Bantara', 1, 'Buddha', 5),
  ('BAN-01-HIN-1', 'BAN-01', 'Bantara', 1, 'Hindu', 1),
  ('BAN-01-HIN-2', 'BAN-01', 'Bantara', 1, 'Hindu', 2),
  ('BAN-01-HIN-3', 'BAN-01', 'Bantara', 1, 'Hindu', 3),
  ('BAN-01-HIN-4', 'BAN-01', 'Bantara', 1, 'Hindu', 4),
  ('BAN-01-HIN-5', 'BAN-01', 'Bantara', 1, 'Hindu', 5),
  ('BAN-01-HIN-6', 'BAN-01', 'Bantara', 1, 'Hindu', 6),
  ('BAN-01-HIN-7', 'BAN-01', 'Bantara', 1, 'Hindu', 7),
  ('BAN-01-ISL-1', 'BAN-01', 'Bantara', 1, 'Islam', 1),
  ('BAN-01-ISL-2', 'BAN-01', 'Bantara', 1, 'Islam', 2),
  ('BAN-01-ISL-3', 'BAN-01', 'Bantara', 1, 'Islam', 3),
  ('BAN-01-ISL-4', 'BAN-01', 'Bantara', 1, 'Islam', 4),
  ('BAN-01-ISL-5', 'BAN-01', 'Bantara', 1, 'Islam', 5),
  ('BAN-01-ISL-6', 'BAN-01', 'Bantara', 1, 'Islam', 6),
  ('BAN-01-KAT-1', 'BAN-01', 'Bantara', 1, 'Katolik', 1),
  ('BAN-01-KAT-2', 'BAN-01', 'Bantara', 1, 'Katolik', 2),
  ('BAN-01-KHO-1', 'BAN-01', 'Bantara', 1, 'Khonghucu', 1),
  ('BAN-01-PRO-1', 'BAN-01', 'Bantara', 1, 'Protestan', 1),
  ('BAN-02', 'BAN-02', 'Bantara', 2, null, null),
  ('BAN-03', 'BAN-03', 'Bantara', 3, null, null),
  ('BAN-04', 'BAN-04', 'Bantara', 4, null, null),
  ('BAN-05', 'BAN-05', 'Bantara', 5, null, null),
  ('BAN-06', 'BAN-06', 'Bantara', 6, null, null),
  ('BAN-07', 'BAN-07', 'Bantara', 7, null, null),
  ('BAN-08', 'BAN-08', 'Bantara', 8, null, null),
  ('BAN-09', 'BAN-09', 'Bantara', 9, null, null),
  ('BAN-10', 'BAN-10', 'Bantara', 10, null, null),
  ('BAN-11', 'BAN-11', 'Bantara', 11, null, null),
  ('BAN-12', 'BAN-12', 'Bantara', 12, null, null),
  ('BAN-13', 'BAN-13', 'Bantara', 13, null, null),
  ('BAN-14', 'BAN-14', 'Bantara', 14, null, null),
  ('BAN-15', 'BAN-15', 'Bantara', 15, null, null),
  ('BAN-16', 'BAN-16', 'Bantara', 16, null, null),
  ('BAN-17', 'BAN-17', 'Bantara', 17, null, null),
  ('BAN-18', 'BAN-18', 'Bantara', 18, null, null),
  ('BAN-19', 'BAN-19', 'Bantara', 19, null, null),
  ('BAN-20', 'BAN-20', 'Bantara', 20, null, null),
  ('BAN-21', 'BAN-21', 'Bantara', 21, null, null),
  ('BAN-22', 'BAN-22', 'Bantara', 22, null, null),
  ('BAN-23', 'BAN-23', 'Bantara', 23, null, null),
  ('LAK-01-BUD-1', 'LAK-01', 'Laksana', 1, 'Buddha', 1),
  ('LAK-01-BUD-2', 'LAK-01', 'Laksana', 1, 'Buddha', 2),
  ('LAK-01-BUD-3', 'LAK-01', 'Laksana', 1, 'Buddha', 3),
  ('LAK-01-BUD-4', 'LAK-01', 'Laksana', 1, 'Buddha', 4),
  ('LAK-01-BUD-5', 'LAK-01', 'Laksana', 1, 'Buddha', 5),
  ('LAK-01-HIN-1', 'LAK-01', 'Laksana', 1, 'Hindu', 1),
  ('LAK-01-HIN-2', 'LAK-01', 'Laksana', 1, 'Hindu', 2),
  ('LAK-01-HIN-3', 'LAK-01', 'Laksana', 1, 'Hindu', 3),
  ('LAK-01-HIN-4', 'LAK-01', 'Laksana', 1, 'Hindu', 4),
  ('LAK-01-HIN-5', 'LAK-01', 'Laksana', 1, 'Hindu', 5),
  ('LAK-01-HIN-6', 'LAK-01', 'Laksana', 1, 'Hindu', 6),
  ('LAK-01-HIN-7', 'LAK-01', 'Laksana', 1, 'Hindu', 7),
  ('LAK-01-ISL-1', 'LAK-01', 'Laksana', 1, 'Islam', 1),
  ('LAK-01-ISL-2', 'LAK-01', 'Laksana', 1, 'Islam', 2),
  ('LAK-01-ISL-3', 'LAK-01', 'Laksana', 1, 'Islam', 3),
  ('LAK-01-ISL-4', 'LAK-01', 'Laksana', 1, 'Islam', 4),
  ('LAK-01-ISL-5', 'LAK-01', 'Laksana', 1, 'Islam', 5),
  ('LAK-01-ISL-6', 'LAK-01', 'Laksana', 1, 'Islam', 6),
  ('LAK-01-KAT-1', 'LAK-01', 'Laksana', 1, 'Katolik', 1),
  ('LAK-01-KAT-2', 'LAK-01', 'Laksana', 1, 'Katolik', 2),
  ('LAK-01-KAT-3', 'LAK-01', 'Laksana', 1, 'Katolik', 3),
  ('LAK-01-KHO-1', 'LAK-01', 'Laksana', 1, 'Khonghucu', 1),
  ('LAK-01-PRO-1', 'LAK-01', 'Laksana', 1, 'Protestan', 1),
  ('LAK-01-PRO-2', 'LAK-01', 'Laksana', 1, 'Protestan', 2),
  ('LAK-01-PRO-3', 'LAK-01', 'Laksana', 1, 'Protestan', 3),
  ('LAK-02', 'LAK-02', 'Laksana', 2, null, null),
  ('LAK-03', 'LAK-03', 'Laksana', 3, null, null),
  ('LAK-04', 'LAK-04', 'Laksana', 4, null, null),
  ('LAK-05', 'LAK-05', 'Laksana', 5, null, null),
  ('LAK-06', 'LAK-06', 'Laksana', 6, null, null),
  ('LAK-07', 'LAK-07', 'Laksana', 7, null, null),
  ('LAK-08', 'LAK-08', 'Laksana', 8, null, null),
  ('LAK-09', 'LAK-09', 'Laksana', 9, null, null),
  ('LAK-10', 'LAK-10', 'Laksana', 10, null, null),
  ('LAK-11', 'LAK-11', 'Laksana', 11, null, null),
  ('LAK-12', 'LAK-12', 'Laksana', 12, null, null),
  ('LAK-13', 'LAK-13', 'Laksana', 13, null, null),
  ('LAK-14', 'LAK-14', 'Laksana', 14, null, null),
  ('LAK-15', 'LAK-15', 'Laksana', 15, null, null),
  ('LAK-16', 'LAK-16', 'Laksana', 16, null, null),
  ('LAK-17', 'LAK-17', 'Laksana', 17, null, null),
  ('LAK-18', 'LAK-18', 'Laksana', 18, null, null),
  ('LAK-19', 'LAK-19', 'Laksana', 19, null, null),
  ('LAK-20', 'LAK-20', 'Laksana', 20, null, null),
  ('LAK-21', 'LAK-21', 'Laksana', 21, null, null),
  ('LAK-22', 'LAK-22', 'Laksana', 22, null, null);

insert into public.pf_item (id) values
  ('PF-01'),
  ('PF-02'),
  ('PF-03'),
  ('PF-04'),
  ('PF-05'),
  ('PF-06'),
  ('PF-07'),
  ('PF-08'),
  ('PF-09'),
  ('PF-10'),
  ('PF-11'),
  ('PF-12'),
  ('PF-13'),
  ('PF-14'),
  ('PF-15'),
  ('PF-16'),
  ('PF-17'),
  ('PF-18'),
  ('PF-19'),
  ('PF-20'),
  ('PF-21'),
  ('PF-22'),
  ('PF-23'),
  ('PF-24'),
  ('PF-25'),
  ('PF-26');

notify pgrst, 'reload schema';
