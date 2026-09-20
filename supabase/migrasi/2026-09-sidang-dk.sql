-- ============================================================================
-- MIGRASI: Sidang Dewan Kehormatan Ambalan + Pengaturan. AMAN untuk database yang sudah berisi data.
--
-- Hanya MENAMBAH: 3 tabel baru (pengaturan, sidang_dk, sidang_urut), 1 kolom baru (profiles.nta), beberapa fungsi baru
-- dan aturan akses baru. TIDAK menghapus atau mengubah data yang ada. Jangan menjalankan supabase/skema.sql untuk ini:
-- berkas itu MENGHAPUS semua tabel lalu membuatnya ulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run. Aman dijalankan berulang kali.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- 1. Kolom baru pada profil: Nomor Tanda Anggota Pramuka (opsional, diisi saat sidang)
alter table public.profiles add column if not exists nta text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profil_nta' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profil_nta check (nta is null or nta ~ '^[0-9A-Za-z./ -]{1,40}$');
  end if;
end $$;

-- 2. Tabel baru
create table if not exists public.pengaturan (
  kunci text primary key check (kunci ~ '^[a-z_]+\.[a-z_0-9]+$'),
  nilai jsonb not null,
  diubah_oleh uuid references public.profiles(id) on delete set null,
  diubah_pada timestamptz not null default now()
);

create table if not exists public.sidang_urut (
  tahun int primary key,
  terakhir int not null
);

create table if not exists public.sidang_dk (
  id int generated always as identity primary key,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  tingkat text not null check (tingkat in ('Bantara','Laksana')),
  tanggal date not null,
  keputusan text not null check (keputusan in ('layak','tunda')),
  magang text not null check (magang in ('memenuhi','tidak')),
  tugas_adat text not null check (tugas_adat in ('lulus','tidak')),
  tugas_adat_ket text not null default '' check (char_length(tugas_adat_ket) <= 60),
  catatan text not null default '' check (char_length(catatan) <= 500),
  nomor_ba text not null check (char_length(nomor_ba) between 1 and 80),
  nomor_urut int,
  capaian_lulus int not null,
  capaian_total int not null,
  butir_belum text[] not null default '{}',
  nta text not null default '' check (nta = '' or nta ~ '^[0-9A-Za-z./ -]{1,40}$'),
  ketua_nama text not null default '',
  ketua_sebutan text not null default '',
  dibuat_oleh uuid references public.profiles(id) on delete set null,
  dibuat_pada timestamptz not null default now()
);
create unique index if not exists sidang_dk_nomor on public.sidang_dk (nomor_ba);
create unique index if not exists sidang_dk_layak on public.sidang_dk (peserta_id, tingkat) where keputusan = 'layak';
create index if not exists sidang_dk_peserta_id_idx on public.sidang_dk (peserta_id);
create index if not exists sidang_dk_tanggal_idx on public.sidang_dk (tanggal);

-- 3. Fungsi bantu
create or replace function sigarda.pembina_atau_admin() returns boolean language plpgsql stable security definer set search_path = public as
$$ begin
  return coalesce((select (role = 'admin' or (role = 'penguji' and jabatan = 'Pembina')) and not wajib_ganti_pin from public.profiles where id = auth.uid()), false);
end $$;

create or replace function sigarda.pengaturan_teks(p_kunci text, p_bawaan text) returns text
language sql stable security definer set search_path = public as
$$ select coalesce((select nilai #>> '{}' from public.pengaturan where kunci = p_kunci), p_bawaan) $$;

create or replace function sigarda.format_nomor(p_format text, p_no int, p_tanggal date, p_tingkat text) returns text
language sql immutable as
$$
  select replace(replace(replace(replace(replace(replace(p_format,
    '{no3}', case when p_no >= 1000 then p_no::text else lpad(p_no::text, 3, '0') end),
    '{no}', p_no::text),
    '{tahun}', extract(year from p_tanggal)::int::text),
    '{bulan}', lpad(extract(month from p_tanggal)::int::text, 2, '0')),
    '{romawi}', (array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])[extract(month from p_tanggal)::int]),
    '{tingkat}', p_tingkat)
$$;

-- 4. Aturan akses baca (RLS): pengaturan dibaca semua pengguna aktif; catatan sidang hanya pengurus
alter table public.pengaturan enable row level security;
alter table public.sidang_dk enable row level security;
alter table public.sidang_urut enable row level security;

drop policy if exists baca_pengaturan on public.pengaturan;
create policy baca_pengaturan on public.pengaturan for select to authenticated using ((select sigarda.aktif()));
drop policy if exists baca_sidang on public.sidang_dk;
create policy baca_sidang on public.sidang_dk for select to authenticated using ((select sigarda.pengurus()));

-- 5. Fungsi aksi
create or replace function public.sg_pengaturan_simpan(p_kunci text, p_nilai jsonb) returns void
language plpgsql security definer set search_path = public as
$$
declare v text; v_tok text;
begin
  perform sigarda.wajib_aktif();
  if p_kunci is null or p_kunci not in ('sidang.format_nomor', 'sidang.nama_ketua', 'sidang.sebutan_ketua') then
    raise exception 'Pengaturan tidak dikenal.';
  end if;
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau Admin Gudep yang dapat mengubah pengaturan sidang.'; end if;
  if p_nilai is null or jsonb_typeof(p_nilai) <> 'string' then raise exception 'Nilai pengaturan tidak sah.'; end if;
  v := sigarda.rapikan(p_nilai #>> '{}');

  if p_kunci = 'sidang.format_nomor' then
    if v = '' then raise exception 'Format nomor wajib diisi.'; end if;
    if char_length(v) > 80 then raise exception 'Format nomor maksimal 80 karakter.'; end if;
    if v !~ '^[A-Za-z0-9 /._(){}-]+$' then
      raise exception 'Format nomor hanya boleh berisi huruf, angka, spasi, dan tanda / . - _ ( ) serta kode dalam kurung kurawal.';
    end if;
    for v_tok in select (regexp_matches(v, '\{[^}]*\}', 'g'))[1] loop
      if v_tok not in ('{no}', '{no3}', '{tahun}', '{bulan}', '{romawi}', '{tingkat}') then
        raise exception 'Kode % tidak dikenal. Kode yang tersedia: {no} {no3} {tahun} {bulan} {romawi} {tingkat}.', v_tok;
      end if;
    end loop;
    if regexp_replace(v, '\{(no|no3|tahun|bulan|romawi|tingkat)\}', '', 'g') ~ '[{}]' then
      raise exception 'Tanda kurung kurawal pada format nomor tidak lengkap.';
    end if;
    if position('{no}' in v) = 0 and position('{no3}' in v) = 0 then raise exception 'Format nomor harus memuat {no} atau {no3} (nomor urut).'; end if;
    if position('{tahun}' in v) = 0 then raise exception 'Format nomor harus memuat {tahun} agar nomor tidak sama antar tahun.'; end if;
  elsif p_kunci = 'sidang.nama_ketua' then
    if char_length(v) > 120 then raise exception 'Nama ketua maksimal 120 karakter.'; end if;
  else
    if v = '' then raise exception 'Sebutan jabatan wajib diisi.'; end if;
    if char_length(v) > 80 then raise exception 'Sebutan jabatan maksimal 80 karakter.'; end if;
  end if;

  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada) values (p_kunci, to_jsonb(v), auth.uid(), now())
  on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;

create or replace function public.sg_sidang_simpan(
  p_peserta_id uuid, p_tingkat text, p_tanggal date, p_keputusan text,
  p_magang text, p_tugas_adat text, p_tugas_adat_ket text, p_catatan text,
  p_nomor_manual text default null, p_nta text default null
) returns int language plpgsql security definer set search_path = public as
$$
declare
  v_p public.profiles; v_lulus int; v_total int; v_belum text[]; v_selesai boolean;
  v_ket text := sigarda.rapikan(p_tugas_adat_ket); v_cat text := btrim(coalesce(p_catatan, ''));
  v_manual text := sigarda.rapikan(p_nomor_manual); v_nta text := sigarda.rapikan(p_nta);
  v_tahun int; v_urut int; v_nomor text; v_id int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau Admin Gudep yang dapat mencatat keputusan sidang.'; end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Peserta tidak ditemukan.'; end if;
  if p_tingkat is null or p_tingkat not in ('Bantara', 'Laksana') then raise exception 'Tingkat SKU tidak dikenal.'; end if;
  if p_tanggal is null or p_tanggal < date '2000-01-01' or p_tanggal > sigarda.hari_ini() then
    raise exception 'Tanggal sidang tidak valid (tidak boleh melewati hari ini).';
  end if;
  if p_keputusan is null or p_keputusan not in ('layak', 'tunda') then raise exception 'Pilih keputusan sidang.'; end if;
  if p_magang is null or p_magang not in ('memenuhi', 'tidak') then raise exception 'Pilih hasil pemeriksaan masa magang atau masa tamu ambalan.'; end if;
  if p_tugas_adat is null or p_tugas_adat not in ('lulus', 'tidak') then raise exception 'Pilih hasil tugas tambahan adat ambalan.'; end if;
  if char_length(v_ket) > 60 then raise exception 'Jenis tugas adat maksimal 60 karakter.'; end if;
  if char_length(v_cat) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;
  if v_nta <> '' and v_nta !~ '^[0-9A-Za-z./ -]{1,40}$' then raise exception 'NTA hanya boleh berisi huruf, angka, spasi, dan tanda / . - (maksimal 40 karakter).'; end if;

  select coalesce(array_agg(u.id order by u.id) filter (where coalesce(g.status, 'belum') <> 'lulus'), '{}')
    into v_belum
  from public.sku_unit u
  left join public.sku_progress g on g.sku_id = u.id and g.peserta_id = p_peserta_id
  where u.tingkat = p_tingkat and (u.agama is null or u.agama = v_p.agama);
  -- Capaian dihitung per BUTIR (butir agama lulus bila seluruh sub-butirnya lulus), sama dengan hitungProgres di aplikasi
  select count(*) filter (where b.lulus), count(*) into v_lulus, v_total from (
    select bool_and(coalesce(g.status, 'belum') = 'lulus') as lulus
    from public.sku_unit u
    left join public.sku_progress g on g.sku_id = u.id and g.peserta_id = p_peserta_id
    where u.tingkat = p_tingkat and (u.agama is null or u.agama = v_p.agama)
    group by u.butir_id
  ) b;
  v_selesai := v_total > 0 and v_lulus = v_total;

  if p_keputusan = 'layak' then
    if not v_selesai then
      raise exception 'Belum dapat dinyatakan Layak dan Lulus: capaian SKU % baru % dari % butir.', p_tingkat, v_lulus, v_total;
    end if;
    if exists (select 1 from public.sidang_dk where peserta_id = p_peserta_id and tingkat = p_tingkat and keputusan = 'layak') then
      raise exception 'Peserta ini sudah dinyatakan Layak dan Lulus untuk SKU % pada sidang sebelumnya.', p_tingkat;
    end if;
  elsif cardinality(v_belum) = 0 and v_cat = '' then
    raise exception 'Seluruh butir sudah lulus; isi catatan alasan penundaan.';
  end if;

  v_tahun := extract(year from p_tanggal)::int;
  if v_manual <> '' then
    if char_length(v_manual) > 80 then raise exception 'Nomor berita acara maksimal 80 karakter.'; end if;
    v_nomor := v_manual;
    v_urut := null;
  else
    insert into public.sidang_urut as s (tahun, terakhir) values (v_tahun, 1)
    on conflict (tahun) do update set terakhir = s.terakhir + 1
    returning s.terakhir into v_urut;
    v_nomor := sigarda.format_nomor(sigarda.pengaturan_teks('sidang.format_nomor', '{no3}/DK/{tahun}'), v_urut, p_tanggal, p_tingkat);
  end if;
  if exists (select 1 from public.sidang_dk where nomor_ba = v_nomor) then
    raise exception 'Nomor berita acara % sudah dipakai.', v_nomor;
  end if;

  insert into public.sidang_dk (
    peserta_id, tingkat, tanggal, keputusan, magang, tugas_adat, tugas_adat_ket, catatan, nomor_ba, nomor_urut,
    capaian_lulus, capaian_total, butir_belum, nta, ketua_nama, ketua_sebutan, dibuat_oleh
  ) values (
    p_peserta_id, p_tingkat, p_tanggal, p_keputusan, p_magang, p_tugas_adat, v_ket, v_cat, v_nomor, v_urut,
    v_lulus, v_total, v_belum, coalesce(nullif(v_nta, ''), coalesce(v_p.nta, '')),
    sigarda.pengaturan_teks('sidang.nama_ketua', ''),
    sigarda.pengaturan_teks('sidang.sebutan_ketua', 'Ketua Dewan Penegak / Pemangku Adat'),
    auth.uid()
  ) returning id into v_id;

  if v_nta <> '' and v_nta is distinct from v_p.nta then update public.profiles set nta = v_nta where id = p_peserta_id; end if;
  return v_id;
end $$;

create or replace function public.sg_sidang_hapus(p_id int) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus catatan sidang.'; end if;
  delete from public.sidang_dk where id = p_id;
end $$;

-- 6. Hak akses: baca saja untuk tabel; fungsi aksi hanya untuk pengguna masuk; fungsi pada schema sigarda tidak untuk anon
revoke all on public.pengaturan, public.sidang_dk, public.sidang_urut from anon, authenticated;
grant select on public.pengaturan, public.sidang_dk to authenticated;

revoke all on function
  public.sg_pengaturan_simpan(text, jsonb),
  public.sg_sidang_simpan(uuid, text, date, text, text, text, text, text, text, text),
  public.sg_sidang_hapus(int)
  from public, anon, authenticated;
grant execute on function
  public.sg_pengaturan_simpan(text, jsonb),
  public.sg_sidang_simpan(uuid, text, date, text, text, text, text, text, text, text),
  public.sg_sidang_hapus(int)
  to authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
