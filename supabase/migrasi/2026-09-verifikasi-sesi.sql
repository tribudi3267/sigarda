-- ============================================================================
-- MIGRASI: Verifikasi keaslian dokumen lewat QR, dan Sesi ujian. AMAN untuk database berisi data.
--
-- Jalankan SETELAH 2026-09-sidang-dk.sql, 2026-09-sidang-format-nomor.sql, 2026-09-raport.sql, dan 2026-09-instrumen.sql. Isi:
--   * Kolom sku_progress.verifikasi_token (token acak 128 bit untuk QR) dan tabel sertifikat_tingkat (token Surat Tanda Lulus).
--     Butir yang SUDAH lulus otomatis diberi token (pengisian ulang di akhir berkas ini).
--   * Fungsi sg_verifikasi_token dan sg_verifikasi_kode yang dapat dipanggil TANPA LOGIN (hanya membaca). Token QR menampilkan nama
--     lengkap, butir, tanggal, dan penguji; kode pendek VRF- hanya menjawab sah atau tidak (tanpa nama).
--   * Tabel sesi_ujian, sesi_ujian_butir, sesi_ujian_peserta beserta fungsi sg_sesi_simpan, sg_sesi_status, sg_sesi_hapus.
--   * sg_sku_catat_internal diperbarui: token dibuat saat butir dinyatakan lulus dan dihapus bila tidak lagi lulus.
-- TIDAK menghapus atau mengubah data yang sudah ada selain mengisi token. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: migrasi Sidang, Raport, dan Instrumen harus sudah dijalankan.
do $$
begin
  if to_regclass('public.pengaturan') is null or to_regclass('public.raport') is null or to_regclass('public.instrumen') is null
     or to_regprocedure('sigarda.pembina_atau_admin()') is null then
    raise exception 'Jalankan lebih dulu migrasi 2026-09-sidang-dk.sql, 2026-09-sidang-format-nomor.sql, 2026-09-raport.sql, dan 2026-09-instrumen.sql, baru migrasi ini.';
  end if;
end $$;

alter table public.sku_progress add column if not exists verifikasi_token text check (verifikasi_token ~ '^[0-9a-f]{32}$');
create unique index if not exists sku_progress_verifikasi_token_idx on public.sku_progress (verifikasi_token) where verifikasi_token is not null;

-- Token QR untuk Surat Tanda Lulus per tingkat (satu token per Penegak per tingkat). Sah selama seluruh butir tingkat itu masih lulus.
create table if not exists public.sertifikat_tingkat (
  token text primary key check (token ~ '^[0-9a-f]{32}$'),
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  tingkat text not null check (tingkat in ('Bantara','Laksana')),
  diterbitkan_oleh uuid references public.profiles(id) on delete set null,
  diterbitkan_pada timestamptz not null default now(),
  unique (peserta_id, tingkat)
);

-- Sesi ujian: jadwal ujian bersama (tanggal, tempat), butir yang diuji, dan daftar peserta. Hasil penilaian tetap dicatat pada
-- sku_progress seperti biasa; papan sesi menurunkan status dari progres pada atau sesudah tanggal sesi.
create table if not exists public.sesi_ujian (
  id int generated always as identity primary key,
  nama text not null check (char_length(btrim(nama)) between 1 and 120),
  tanggal date not null check (tanggal between date '2000-01-01' and date '2100-12-31'),
  tempat text not null default '' check (char_length(tempat) <= 120),
  catatan text not null default '' check (char_length(catatan) <= 500),
  status text not null default 'terjadwal' check (status in ('terjadwal','berlangsung','selesai')),
  dibuat_oleh uuid references public.profiles(id) on delete set null,
  dibuat_pada timestamptz not null default now()
);
create index if not exists sesi_ujian_tanggal_idx on public.sesi_ujian (tanggal);
create table if not exists public.sesi_ujian_butir (
  sesi_id int not null references public.sesi_ujian(id) on delete cascade,
  butir_id text not null references public.sku_butir(id),
  primary key (sesi_id, butir_id)
);
create table if not exists public.sesi_ujian_peserta (
  sesi_id int not null references public.sesi_ujian(id) on delete cascade,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  primary key (sesi_id, peserta_id)
);
create index if not exists sesi_ujian_peserta_peserta_id_idx on public.sesi_ujian_peserta (peserta_id);

-- Token acak 32 karakter heksadesimal (128 bit acak penuh): tiga UUID acak, hanya bagian yang bukan penanda versi/varian.
create or replace function sigarda.token_acak() returns text language sql volatile as
$$
  select left(replace(gen_random_uuid()::text, '-', ''), 12) || left(replace(gen_random_uuid()::text, '-', ''), 12) || left(replace(gen_random_uuid()::text, '-', ''), 8)
$$;

create or replace function public.sg_sku_catat_internal(
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
  -- Butir dengan instrumen ditetapkan hanya boleh dinilai lewat sg_sku_catat_rubrik_internal (yang menyalakan penanda ini)
  if p_hasil in ('lulus','ulang') and sigarda.instrumen_aktif(p_sku_id)
     and coalesce(current_setting('sigarda.via_rubrik', true), '') <> 'ya' then
    raise exception 'Butir ini dinilai dengan instrumen penilaian. Catat hasilnya lewat lembar penilaian.';
  end if;
  if p_hasil <> 'reset' and p_tanggal_uji is null then raise exception 'Tanggal uji wajib diisi.'; end if;
  if p_hasil <> 'reset' and p_sku_id like 'LAK-%' and not sigarda.tingkat_selesai(p_peserta_id, 'Bantara') then
    raise exception 'Peserta belum menyelesaikan seluruh butir Bantara.';
  end if;
  if char_length(v_cat) > 1000 then raise exception 'Catatan maksimal 1000 karakter.'; end if;

  if p_hasil = 'proses' then
    insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji)
    values (p_peserta_id, p_sku_id, 'proses', p_oleh, p_tanggal_uji)
    on conflict (peserta_id, sku_id) do update
      set status = 'proses', penguji_id = p_oleh, tanggal_uji = p_tanggal_uji, verifikasi = null, diverifikasi_pada = null, verifikasi_token = null, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (p_peserta_id, p_sku_id, 'Pengujian dimulai', p_oleh);

  elsif p_hasil = 'lulus' then
    if p_nilai is null then raise exception 'Pilih predikat penilaian.'; end if;
    if p_nilai not in ('Sangat baik','Baik','Cukup') then raise exception 'Predikat tidak dikenal.'; end if;
    v_kode := sigarda.kode_verifikasi(array[p_peserta_id::text, p_sku_id, p_oleh::text, p_tanggal_uji::text]);
    insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji, nilai, catatan, verifikasi, diverifikasi_pada, verifikasi_token)
    values (p_peserta_id, p_sku_id, 'lulus', p_oleh, p_tanggal_uji, p_nilai, v_cat, v_kode, now(), sigarda.token_acak())
    on conflict (peserta_id, sku_id) do update
      set status = 'lulus', penguji_id = p_oleh, tanggal_uji = p_tanggal_uji, nilai = p_nilai, catatan = v_cat,
          verifikasi = v_kode, diverifikasi_pada = now(), verifikasi_token = sigarda.token_acak(), diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (p_peserta_id, p_sku_id, 'Dinyatakan lulus (' || p_nilai || '), kode ' || v_kode, p_oleh);

  elsif p_hasil = 'ulang' then
    if v_cat = '' then raise exception 'Isi catatan agar peserta tahu bagian yang perlu diperbaiki.'; end if;
    insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji, nilai, catatan)
    values (p_peserta_id, p_sku_id, 'ulang', p_oleh, p_tanggal_uji, null, v_cat)
    on conflict (peserta_id, sku_id) do update
      set status = 'ulang', penguji_id = p_oleh, tanggal_uji = p_tanggal_uji, nilai = null, catatan = v_cat,
          verifikasi = null, diverifikasi_pada = null, verifikasi_token = null, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (p_peserta_id, p_sku_id, 'Perlu diulang', p_oleh);

  else -- reset
    if v_cat = '' then raise exception 'Isi alasan pembatalan status.'; end if;
    insert into public.sku_progress (peserta_id, sku_id, status)
    values (p_peserta_id, p_sku_id, 'belum')
    on conflict (peserta_id, sku_id) do update
      set status = 'belum', penguji_id = null, tanggal_uji = null, jadwal = null, nilai = null, catatan = '',
          catatan_peserta = '', verifikasi = null, diverifikasi_pada = null, verifikasi_token = null, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (p_peserta_id, p_sku_id, 'Status dikembalikan ke belum diuji. Alasan: ' || v_cat, p_oleh);
  end if;
end $$;

-- ===== Verifikasi keaslian dokumen (QR). DAPAT DIPANGGIL TANPA LOGIN (peran anon): hanya membaca, hanya mengembalikan data seperlunya. =====
-- Token QR (32 heksadesimal, 128 bit acak) tidak dapat ditebak. Nama lengkap hanya keluar untuk pemegang token yang sah.
-- Kode pendek VRF-XXXXXXX (28 bit, tercetak di dokumen) dapat ditebak, jadi jawabannya hanya sah/tidak beserta tingkat, butir, dan tanggal: TANPA nama.
create or replace function public.sg_verifikasi_token(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare
  v_t text := lower(btrim(coalesce(p_token, ''))); v_g public.sku_progress; v_s public.sertifikat_tingkat; v_unit public.sku_unit;
  v_nama text; v_agama text; v_pen text; v_jab text; v_pen_id uuid; v_tgl date; v_total int;
begin
  if v_t !~ '^[0-9a-f]{32}$' then return jsonb_build_object('ditemukan', false); end if;

  select * into v_g from public.sku_progress where verifikasi_token = v_t and status = 'lulus';
  if found then
    select nama into v_nama from public.profiles where id = v_g.peserta_id;
    select * into v_unit from public.sku_unit where id = v_g.sku_id;
    select nama, jabatan into v_pen, v_jab from public.profiles where id = v_g.penguji_id;
    return jsonb_build_object('ditemukan', true, 'jenis', 'butir', 'nama', v_nama, 'sku_id', v_g.sku_id, 'tingkat', v_unit.tingkat,
      'butir_no', v_unit.butir_no, 'sub', v_unit.sub, 'tanggal', v_g.tanggal_uji, 'penguji', v_pen, 'jabatan_penguji', v_jab, 'kode', v_g.verifikasi);
  end if;

  select * into v_s from public.sertifikat_tingkat where token = v_t;
  if found and sigarda.tingkat_selesai(v_s.peserta_id, v_s.tingkat) then
    select nama, agama into v_nama, v_agama from public.profiles where id = v_s.peserta_id;
    select count(distinct u.butir_id) into v_total from public.sku_unit u where u.tingkat = v_s.tingkat and (u.agama is null or u.agama = v_agama);
    select g.tanggal_uji, g.penguji_id into v_tgl, v_pen_id
    from public.sku_progress g join public.sku_unit u on u.id = g.sku_id
    where g.peserta_id = v_s.peserta_id and u.tingkat = v_s.tingkat and g.status = 'lulus'
    order by g.tanggal_uji desc nulls last, g.diubah desc limit 1;
    select nama, jabatan into v_pen, v_jab from public.profiles where id = v_pen_id;
    return jsonb_build_object('ditemukan', true, 'jenis', 'tingkat', 'nama', v_nama, 'tingkat', v_s.tingkat, 'jumlah_butir', v_total,
      'tanggal', v_tgl, 'penguji', v_pen, 'jabatan_penguji', v_jab, 'diterbitkan', v_s.diterbitkan_pada);
  end if;
  return jsonb_build_object('ditemukan', false);
end $$;

create or replace function public.sg_verifikasi_kode(p_kode text) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare v_k text := upper(btrim(coalesce(p_kode, ''))); v_tingkat text; v_no int; v_tgl date;
begin
  if v_k !~ '^VRF-[0-9A-F]{7}$' then return jsonb_build_object('ditemukan', false); end if;
  select u.tingkat, u.butir_no, g.tanggal_uji into v_tingkat, v_no, v_tgl
  from public.sku_progress g join public.sku_unit u on u.id = g.sku_id
  where g.verifikasi = v_k and g.status = 'lulus' order by g.tanggal_uji nulls last limit 1;
  if not found then return jsonb_build_object('ditemukan', false); end if;
  return jsonb_build_object('ditemukan', true, 'tingkat', v_tingkat, 'butir_no', v_no, 'tanggal', v_tgl);
end $$;

-- Token untuk Surat Tanda Lulus satu tingkat. Untuk Penegak itu sendiri atau pengurus; hanya bila seluruh butir tingkat itu lulus. Idempoten.
create or replace function public.sg_sertifikat_tingkat(p_peserta_id uuid, p_tingkat text) returns text
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_token text;
begin
  perform sigarda.wajib_aktif();
  if p_tingkat is null or p_tingkat not in ('Bantara', 'Laksana') then raise exception 'Tingkat SKU tidak dikenal.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  if p_peserta_id is distinct from v_uid and not sigarda.pengurus() then raise exception 'Anda tidak berwenang menerbitkan surat untuk peserta ini.'; end if;
  if not sigarda.tingkat_selesai(p_peserta_id, p_tingkat) then raise exception 'Surat Tanda Lulus hanya untuk tingkat yang seluruh butirnya sudah lulus.'; end if;
  insert into public.sertifikat_tingkat (token, peserta_id, tingkat, diterbitkan_oleh) values (sigarda.token_acak(), p_peserta_id, p_tingkat, v_uid)
  on conflict (peserta_id, tingkat) do nothing;
  select token into v_token from public.sertifikat_tingkat where peserta_id = p_peserta_id and tingkat = p_tingkat;
  return v_token;
end $$;

-- ===== Sesi ujian (Dewan Ambalan, Pembina, Admin) =====
-- Menyimpan satu sesi beserta butir dan pesertanya (id kosong = sesi baru). Butir dan peserta diganti seluruhnya sesuai daftar.
create or replace function public.sg_sesi_simpan(
  p_id int, p_nama text, p_tanggal date, p_tempat text, p_catatan text, p_status text, p_butir text[], p_peserta uuid[]
) returns int language plpgsql security definer set search_path = public as
$$
declare
  v_nama text := sigarda.rapikan(p_nama); v_tempat text := sigarda.rapikan(p_tempat); v_cat text := btrim(coalesce(p_catatan, ''));
  v_butir text[]; v_peserta uuid[]; v_id int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau Admin Gudep yang dapat mengelola sesi ujian.'; end if;
  if v_nama = '' or char_length(v_nama) > 120 then raise exception 'Nama sesi wajib diisi (maksimal 120 karakter).'; end if;
  if p_tanggal is null or p_tanggal < date '2000-01-01' or p_tanggal > date '2100-12-31' then raise exception 'Tanggal sesi tidak valid.'; end if;
  if char_length(v_tempat) > 120 then raise exception 'Tempat maksimal 120 karakter.'; end if;
  if char_length(v_cat) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;
  if p_status is null or p_status not in ('terjadwal', 'berlangsung', 'selesai') then raise exception 'Status sesi tidak dikenal.'; end if;
  select coalesce(array_agg(distinct x), '{}') into v_butir from unnest(coalesce(p_butir, '{}')) x;
  select coalesce(array_agg(distinct x), '{}') into v_peserta from unnest(coalesce(p_peserta, '{}')) x;
  if cardinality(v_butir) = 0 then raise exception 'Pilih minimal satu butir.'; end if;
  if cardinality(v_butir) > 60 then raise exception 'Butir maksimal 60 per sesi.'; end if;
  if cardinality(v_peserta) = 0 then raise exception 'Pilih minimal satu peserta.'; end if;
  if cardinality(v_peserta) > 300 then raise exception 'Peserta maksimal 300 per sesi.'; end if;
  if (select count(*) from public.sku_butir where id = any (v_butir)) <> cardinality(v_butir) then raise exception 'Ada butir yang tidak dikenal.'; end if;
  if (select count(*) from public.profiles where id = any (v_peserta) and role = 'peserta') <> cardinality(v_peserta) then raise exception 'Ada peserta yang tidak dikenal.'; end if;

  if p_id is null then
    insert into public.sesi_ujian (nama, tanggal, tempat, catatan, status, dibuat_oleh) values (v_nama, p_tanggal, v_tempat, v_cat, p_status, auth.uid())
    returning id into v_id;
  else
    update public.sesi_ujian set nama = v_nama, tanggal = p_tanggal, tempat = v_tempat, catatan = v_cat, status = p_status where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Sesi tidak ditemukan.'; end if;
    delete from public.sesi_ujian_butir where sesi_id = v_id;
    delete from public.sesi_ujian_peserta where sesi_id = v_id;
  end if;
  insert into public.sesi_ujian_butir (sesi_id, butir_id) select v_id, x from unnest(v_butir) x;
  insert into public.sesi_ujian_peserta (sesi_id, peserta_id) select v_id, x from unnest(v_peserta) x;
  return v_id;
end $$;

create or replace function public.sg_sesi_status(p_id int, p_status text) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau Admin Gudep yang dapat mengelola sesi ujian.'; end if;
  if p_status is null or p_status not in ('terjadwal', 'berlangsung', 'selesai') then raise exception 'Status sesi tidak dikenal.'; end if;
  update public.sesi_ujian set status = p_status where id = p_id;
  if not found then raise exception 'Sesi tidak ditemukan.'; end if;
end $$;

-- Menghapus sesi tidak menghapus hasil penilaian yang sudah tercatat (hanya jadwal dan daftarnya).
create or replace function public.sg_sesi_hapus(p_id int) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus sesi ujian.'; end if;
  delete from public.sesi_ujian where id = p_id;
end $$;

-- Butir yang sudah lulus sebelum migrasi ini diberi token QR (yang sudah punya token tidak diubah)
update public.sku_progress set verifikasi_token = sigarda.token_acak() where status = 'lulus' and verifikasi_token is null;

alter table public.sertifikat_tingkat enable row level security;
alter table public.sesi_ujian enable row level security;
alter table public.sesi_ujian_butir enable row level security;
alter table public.sesi_ujian_peserta enable row level security;

drop policy if exists baca_sesi_ujian on public.sesi_ujian;
create policy baca_sesi_ujian on public.sesi_ujian for select to authenticated
  using ((select sigarda.aktif()) and ((select sigarda.pengurus()) or id in (select sesi_id from public.sesi_ujian_peserta where peserta_id = (select auth.uid()))));
drop policy if exists baca_sesi_ujian_butir on public.sesi_ujian_butir;
create policy baca_sesi_ujian_butir on public.sesi_ujian_butir for select to authenticated
  using ((select sigarda.aktif()) and ((select sigarda.pengurus()) or sesi_id in (select sesi_id from public.sesi_ujian_peserta where peserta_id = (select auth.uid()))));
drop policy if exists baca_sesi_ujian_peserta on public.sesi_ujian_peserta;
create policy baca_sesi_ujian_peserta on public.sesi_ujian_peserta for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));

revoke all on public.sertifikat_tingkat, public.sesi_ujian, public.sesi_ujian_butir, public.sesi_ujian_peserta from anon, authenticated;
grant select on public.sesi_ujian, public.sesi_ujian_butir, public.sesi_ujian_peserta to authenticated;

revoke all on function
  public.sg_verifikasi_token(text), public.sg_verifikasi_kode(text), public.sg_sertifikat_tingkat(uuid, text),
  public.sg_sesi_simpan(int, text, date, text, text, text, text[], uuid[]), public.sg_sesi_status(int, text), public.sg_sesi_hapus(int)
  from public, anon, authenticated;
grant execute on function
  public.sg_sertifikat_tingkat(uuid, text),
  public.sg_sesi_simpan(int, text, date, text, text, text, text[], uuid[]),
  public.sg_sesi_status(int, text),
  public.sg_sesi_hapus(int)
  to authenticated;
-- Verifikasi keaslian dokumen: satu-satunya fungsi yang boleh dipanggil tanpa login (hanya membaca)
grant execute on function public.sg_verifikasi_token(text), public.sg_verifikasi_kode(text) to anon, authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
