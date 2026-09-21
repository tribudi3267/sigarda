-- ============================================================================
-- MIGRASI: Penugasan penguji per rombel (fase 1a), format rombel baku, agama Pembina, dan guru agama. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi iuran (dan yang sebelumnya). Isi:
--   * Tabel penugasan_rombel (Pembina dan Dewan Ambalan yang bertugas menguji tiap rombel, per tahun ajaran), penugasan_log (riwayat, hanya
--     bertambah), dan guru_agama (rujukan surat pengantar bila tidak ada Pembina yang seagama). Dibaca pengurus; diatur hanya oleh Admin Gudep.
--   * Fungsi sg_penugasan_atur, sg_penugasan_salin (dari tahun ajaran lain), sg_rombel_perbarui (rombel banyak Penegak sekaligus),
--     sg_guru_agama_simpan, sg_guru_agama_hapus, dan sg_anggota_agama_atur (agama Pembina, dipakai import Excel Pembina).
--   * Format rombel baku: kelas Penegak wajib X-01..X-10, XI-01..XI-10, XII-01..XII-10. sg_profil_buat_internal (akun baru dan import) dan
--     sg_anggota_ubah (ubah kelas) menolak selain itu. Data lama ("X", "XI", ...) TIDAK diubah dan tetap dapat dipakai; rapikan lewat
--     "Perbarui rombel" di halaman Anggota.
--   * sg_anggota_ubah juga menyimpan agama Pembina (Dewan dan Admin tidak berAgama).
--   Yang dipanggil Edge Function hanya sg_profil_buat_internal, dan tanda tangannya tidak berubah: Edge Function TIDAK perlu di-deploy ulang.
--   Fase ini hanya menyiapkan data dan pengaturan; belum ada aturan yang berubah bagi Penegak dan penguji (penegakan di fase 1b).
-- TIDAK menghapus data yang sudah ada. Aman dijalankan berulang kali. Edge Function tidak berubah.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: skema dasar dan migrasi sebelumnya (sampai iuran) sudah ada.
do $$
begin
  if to_regclass('public.profiles') is null or to_regprocedure('sigarda.rapikan(text)') is null
     or to_regprocedure('public.sg_anggota_ubah(uuid, text, text, text, text, boolean)') is null
     or to_regprocedure('public.sg_profil_buat_internal(uuid, text, text, text, text, text, text, text, text)') is null
     or to_regprocedure('public.sg_iuran_set(date, uuid, int)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-iuran.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Penugasan penguji per rombel: tabel =====
-- Admin Gudep menetapkan Pembina dan Dewan Ambalan yang bertugas menguji tiap rombel, per tahun ajaran (dikelola lewat sg_penugasan_*).
-- Fase 1a hanya menyimpan dan menampilkan penugasan; penegakannya (siapa yang boleh dipilih Penegak) menyusul di fase 1b.
-- Rombel tanpa penugasan tetap memakai aturan lama (semua penguji) sampai Admin mengatur atau menyalin dari tahun lalu.
create table if not exists public.penugasan_rombel (
  tahun_ajaran text not null check (tahun_ajaran ~ '^[0-9]{4}/[0-9]{4}$'),
  rombel text not null check (rombel ~ '^(X|XI|XII)-(0[1-9]|10)$'),
  penguji_id uuid not null references public.profiles(id) on delete cascade,
  ditetapkan_oleh uuid references public.profiles(id) on delete set null,
  ditetapkan_pada timestamptz not null default now(),
  primary key (tahun_ajaran, rombel, penguji_id)
);
create index if not exists penugasan_rombel_penguji_idx on public.penugasan_rombel (penguji_id);
-- Riwayat setiap perubahan penugasan (hanya bertambah). Nama disalin agar riwayat tetap terbaca setelah akun dihapus.
create table if not exists public.penugasan_log (
  id bigint generated always as identity primary key,
  waktu timestamptz not null default now(),
  tahun_ajaran text not null,
  rombel text not null,
  penguji_id uuid references public.profiles(id) on delete set null,
  penguji_nama text not null,
  tindakan text not null check (tindakan in ('tambah','hapus')),
  catatan text not null default '' check (char_length(catatan) <= 200),
  oleh uuid references public.profiles(id) on delete set null,
  oleh_nama text not null default ''
);
create index if not exists penugasan_log_ta_idx on public.penugasan_log (tahun_ajaran, id);
-- Guru agama di sekolah (per agama), rujukan surat pengantar bila tidak ada Pembina yang seagama dengan Penegak (dikelola Admin).
create table if not exists public.guru_agama (
  id bigint generated always as identity primary key,
  agama text not null check (agama in ('Islam','Katolik','Protestan','Hindu','Buddha','Khonghucu')),
  nama text not null check (char_length(btrim(nama)) between 1 and 120),
  keterangan text not null default '' check (char_length(keterangan) <= 200),
  diubah_oleh uuid references public.profiles(id) on delete set null,
  diubah_pada timestamptz not null default now()
);
create unique index if not exists guru_agama_unik on public.guru_agama (agama, lower(nama));
-- ===== akhir tabel penugasan =====

-- ---- Penugasan rombel: fungsi bantu (harus sama dengan src/lib/rombelLogic.js; dijaga oleh pengujian) ----
-- Rombel baku: X-01 sampai X-10, XI-01 sampai XI-10, XII-01 sampai XII-10. rombel_baku membuang spasi dan membesarkan huruf.
create or replace function sigarda.rombel_baku(p_teks text) returns text language sql immutable as
$$ select upper(regexp_replace(coalesce(p_teks, ''), '\s+', '', 'g')) $$;

create or replace function sigarda.rombel_sah(p_rombel text) returns boolean language sql immutable as
$$ select coalesce(p_rombel ~ '^(X|XI|XII)-(0[1-9]|10)$', false) $$;

-- Tahun ajaran berbentuk 2026/2027 (tahun kedua = tahun pertama + 1).
create or replace function sigarda.tahun_ajaran_sah(p_ta text) returns boolean language sql immutable as
$$
  select case when p_ta ~ '^[0-9]{4}/[0-9]{4}$'
    then split_part(p_ta, '/', 2)::int = split_part(p_ta, '/', 1)::int + 1 and split_part(p_ta, '/', 1)::int between 2000 and 2100
    else false end
$$;

-- Tahun ajaran yang sedang berjalan (Juli sampai Desember = tahun ini/tahun depan; Januari sampai Juni = tahun lalu/tahun ini).
create or replace function sigarda.tahun_ajaran_kini() returns text language sql stable as
$$
  select case when extract(month from sigarda.hari_ini()) >= 7
    then extract(year from sigarda.hari_ini())::int || '/' || (extract(year from sigarda.hari_ini())::int + 1)
    else (extract(year from sigarda.hari_ini())::int - 1) || '/' || extract(year from sigarda.hari_ini())::int end
$$;

-- Memastikan pemanggil adalah Admin Gudep yang sudah mengganti PIN awal; selain itu galat dengan pesan p_pesan.
create or replace function sigarda.wajib_admin(p_pesan text) returns void language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if coalesce((select role from public.profiles where id = auth.uid()), '') <> 'admin' then raise exception '%', p_pesan; end if;
end $$;
-- ---- akhir bantu penugasan ----

-- ===== Penugasan penguji per rombel: fungsi aksi (khusus Admin Gudep) =====
-- Menambah (p_ada = true) atau mencabut (false) penugasan satu penguji (Pembina atau Dewan Ambalan) pada beberapa rombel sekaligus.
-- Setiap perubahan nyata dicatat di penugasan_log; yang sudah sesuai dilewati. Mengembalikan jumlah perubahan nyata.
create or replace function public.sg_penugasan_atur(p_tahun_ajaran text, p_penguji_id uuid, p_rombel text[], p_ada boolean) returns int
language plpgsql security definer set search_path = public as
$$
declare v_b text; v_r text; v_n int := 0; v_k int; v_nama text; v_oleh text;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengatur penugasan penguji.');
  if not sigarda.tahun_ajaran_sah(p_tahun_ajaran) then raise exception 'Tahun ajaran tidak sah. Contoh: 2026/2027.'; end if;
  if p_ada is null then raise exception 'Pilihan tambah atau cabut wajib diisi.'; end if;
  select nama into v_nama from public.profiles where id = p_penguji_id and role = 'penguji';
  if not found then raise exception 'Penguji tidak ditemukan. Penugasan hanya untuk Pembina dan Dewan Ambalan.'; end if;
  if coalesce(array_length(p_rombel, 1), 0) = 0 then return 0; end if;
  if array_length(p_rombel, 1) > 30 then raise exception 'Maksimal 30 rombel per permintaan.'; end if;
  select nama into v_oleh from public.profiles where id = auth.uid();

  foreach v_b in array p_rombel loop
    v_r := sigarda.rombel_baku(v_b);
    if not sigarda.rombel_sah(v_r) then
      raise exception 'Rombel "%" tidak sah. Gunakan X-01 sampai X-10, XI-01 sampai XI-10, atau XII-01 sampai XII-10.', v_b;
    end if;
    if p_ada then
      insert into public.penugasan_rombel (tahun_ajaran, rombel, penguji_id, ditetapkan_oleh)
      values (p_tahun_ajaran, v_r, p_penguji_id, auth.uid()) on conflict do nothing;
    else
      delete from public.penugasan_rombel where tahun_ajaran = p_tahun_ajaran and rombel = v_r and penguji_id = p_penguji_id;
    end if;
    get diagnostics v_k = row_count;
    if v_k > 0 then
      insert into public.penugasan_log (tahun_ajaran, rombel, penguji_id, penguji_nama, tindakan, oleh, oleh_nama)
      values (p_tahun_ajaran, v_r, p_penguji_id, v_nama, case when p_ada then 'tambah' else 'hapus' end, auth.uid(), coalesce(v_oleh, ''));
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

-- Menyalin penugasan tahun ajaran p_dari ke p_ke (yang sudah ada dilewati; tidak ada yang dicabut). Mengembalikan jumlah penugasan baru.
create or replace function public.sg_penugasan_salin(p_dari text, p_ke text) returns int
language plpgsql security definer set search_path = public as
$$
declare v_n int; v_oleh text;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengatur penugasan penguji.');
  if not sigarda.tahun_ajaran_sah(p_dari) or not sigarda.tahun_ajaran_sah(p_ke) then raise exception 'Tahun ajaran tidak sah. Contoh: 2026/2027.'; end if;
  if p_dari = p_ke then raise exception 'Tahun ajaran asal dan tujuan tidak boleh sama.'; end if;
  if not exists (select 1 from public.penugasan_rombel where tahun_ajaran = p_dari) then
    raise exception 'Tahun ajaran % belum memiliki penugasan untuk disalin.', p_dari;
  end if;
  select nama into v_oleh from public.profiles where id = auth.uid();

  with baru as (
    insert into public.penugasan_rombel (tahun_ajaran, rombel, penguji_id, ditetapkan_oleh)
    select p_ke, rombel, penguji_id, auth.uid() from public.penugasan_rombel where tahun_ajaran = p_dari
    on conflict do nothing returning rombel, penguji_id
  )
  insert into public.penugasan_log (tahun_ajaran, rombel, penguji_id, penguji_nama, tindakan, catatan, oleh, oleh_nama)
  select p_ke, b.rombel, b.penguji_id, pr.nama, 'tambah', 'Disalin dari ' || p_dari, auth.uid(), coalesce(v_oleh, '')
  from baru b join public.profiles pr on pr.id = b.penguji_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Memperbarui rombel banyak Penegak sekaligus (mis. dari "X" menjadi "X-03"). p_data = [{"username": "10231", "rombel": "X-03"}, ...] (username = NIS).
-- Semua atau tidak sama sekali: satu baris yang keliru membatalkan seluruh permintaan, dengan pesan yang menyebut nomor barisnya.
create or replace function public.sg_rombel_perbarui(p_data jsonb) returns int
language plpgsql security definer set search_path = public as
$$
declare v_e jsonb; v_user text; v_r text; v_n int := 0; v_k int;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat memperbarui rombel Penegak.');
  if p_data is null or jsonb_typeof(p_data) <> 'array' then raise exception 'Data rombel tidak valid.'; end if;
  if jsonb_array_length(p_data) > 500 then raise exception 'Maksimal 500 baris per permintaan.'; end if;
  for v_e in select * from jsonb_array_elements(p_data) loop
    v_n := v_n + 1;
    v_user := lower(btrim(coalesce(v_e ->> 'username', '')));
    v_r := sigarda.rombel_baku(v_e ->> 'rombel');
    if v_user = '' then raise exception 'Baris %: NIS wajib diisi.', v_n; end if;
    if not sigarda.rombel_sah(v_r) then
      raise exception 'Baris %: rombel "%" tidak sah. Gunakan X-01 sampai X-10, XI-01 sampai XI-10, atau XII-01 sampai XII-10.', v_n, coalesce(v_e ->> 'rombel', '');
    end if;
    update public.profiles set kelas = v_r where username = v_user and role = 'peserta';
    get diagnostics v_k = row_count;
    if v_k = 0 then raise exception 'Baris %: Penegak dengan NIS "%" tidak ditemukan.', v_n, v_user; end if;
  end loop;
  return v_n;
end $$;

-- Guru agama (rujukan surat pengantar). p_id kosong = tambah; berisi = ubah. Mengembalikan id.
create or replace function public.sg_guru_agama_simpan(p_id bigint, p_agama text, p_nama text, p_keterangan text default '') returns bigint
language plpgsql security definer set search_path = public as
$$
declare v_nama text := sigarda.rapikan(p_nama); v_ket text := sigarda.rapikan(p_keterangan); v_id bigint;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengelola guru agama.');
  if coalesce(p_agama, '') not in ('Islam','Katolik','Protestan','Hindu','Buddha','Khonghucu') then raise exception 'Agama tidak dikenal.'; end if;
  if v_nama = '' then raise exception 'Nama guru agama wajib diisi.'; end if;
  if char_length(v_nama) > 120 then raise exception 'Nama maksimal 120 karakter.'; end if;
  if char_length(v_ket) > 200 then raise exception 'Keterangan maksimal 200 karakter.'; end if;
  begin
    if p_id is null then
      insert into public.guru_agama (agama, nama, keterangan, diubah_oleh) values (p_agama, v_nama, v_ket, auth.uid()) returning id into v_id;
    else
      update public.guru_agama set agama = p_agama, nama = v_nama, keterangan = v_ket, diubah_oleh = auth.uid(), diubah_pada = now()
        where id = p_id returning id into v_id;
      if v_id is null then raise exception 'Guru agama tidak ditemukan.'; end if;
    end if;
  exception when unique_violation then
    raise exception 'Guru agama % untuk agama % sudah terdaftar.', v_nama, p_agama;
  end;
  return v_id;
end $$;

create or replace function public.sg_guru_agama_hapus(p_id bigint) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengelola guru agama.');
  delete from public.guru_agama where id = p_id;
end $$;
-- ===== akhir fungsi penugasan =====

create or replace function public.sg_anggota_agama_atur(p_data jsonb) returns int
language plpgsql security definer set search_path = public as
$$
declare v_e jsonb; v_user text; v_agama text; v_n int := 0; v_k int;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengubah agama Pembina.');
  if p_data is null or jsonb_typeof(p_data) <> 'array' then raise exception 'Data agama tidak valid.'; end if;
  if jsonb_array_length(p_data) > 500 then raise exception 'Maksimal 500 baris agama per permintaan.'; end if;
  for v_e in select * from jsonb_array_elements(p_data) loop
    v_user := lower(btrim(coalesce(v_e ->> 'username', '')));
    v_agama := sigarda.rapikan(coalesce(v_e ->> 'agama', ''));
    if v_user = '' then raise exception 'Nama pengguna Pembina wajib diisi.'; end if;
    if v_agama <> '' and v_agama not in ('Islam','Katolik','Protestan','Hindu','Buddha','Khonghucu') then raise exception 'Agama "%" tidak dikenal.', v_agama; end if;
    update public.profiles set agama = nullif(v_agama, '') where username = v_user and role = 'penguji' and jabatan = 'Pembina';
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end loop;
  return v_n;
end $$;

create or replace function public.sg_anggota_ubah(
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
    -- Agama Pembina (butir agama hanya boleh diuji Pembina yang seagama): null = tidak diubah, '' = dikosongkan. Dewan dan Admin tidak berAgama.
    if v_t.role = 'penguji' and v_t.jabatan = 'Pembina' and p_agama is not null then
      if p_agama <> '' and p_agama not in ('Islam','Katolik','Protestan','Hindu','Buddha','Khonghucu') then raise exception 'Agama tidak dikenal.'; end if;
      update public.profiles set agama = nullif(p_agama, '') where id = p_id;
    end if;
    return;
  end if;

  v_kelas := sigarda.rapikan(p_kelas);
  v_sangga := sigarda.rapikan(p_sangga);
  if v_kelas = '' or v_sangga = '' then raise exception 'Kelas dan sangga peserta wajib diisi.'; end if;
  if p_agama is null or p_agama = '' then raise exception 'Agama wajib diisi. Butir 1 SKU menyesuaikan agama peserta.'; end if;
  if p_agama not in ('Islam','Katolik','Protestan','Hindu','Buddha','Khonghucu') then raise exception 'Agama tidak dikenal.'; end if;
  -- Kelas berupa rombel baku (X-01..XII-10). Nilai lama yang tidak diubah (mis. "X") dibiarkan agar data lain tetap dapat diubah;
  -- rapikan massal lewat sg_rombel_perbarui.
  if lower(v_kelas) = lower(coalesce(v_t.kelas, '')) then
    v_kelas := v_t.kelas;
  else
    v_kelas := sigarda.rombel_baku(v_kelas);
    if not sigarda.rombel_sah(v_kelas) then raise exception 'Kelas harus berupa rombel: X-01 sampai X-10, XI-01 sampai XI-10, atau XII-01 sampai XII-10.'; end if;
  end if;
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

create or replace function public.sg_profil_buat_internal(
  p_id uuid, p_username text, p_role text, p_nama text, p_nis text, p_kelas text, p_sangga text, p_agama text, p_jabatan text
) returns void language plpgsql security definer set search_path = public as
$$
declare v_kelas text := sigarda.rapikan(p_kelas); v_sangga text := sigarda.rapikan(p_sangga);
begin
  if p_role = 'peserta' then
    v_kelas := sigarda.rombel_baku(v_kelas);
    if not sigarda.rombel_sah(v_kelas) then raise exception 'Kelas harus berupa rombel: X-01 sampai X-10, XI-01 sampai XI-10, atau XII-01 sampai XII-10.'; end if;
    v_sangga := coalesce((select sangga from public.profiles where role = 'peserta' and lower(sangga) = lower(v_sangga) limit 1), v_sangga);
  end if;
  insert into public.profiles (id, username, role, nama, nis, kelas, sangga, agama, jabatan)
  values (p_id, p_username, p_role, sigarda.rapikan(p_nama),
          nullif(p_nis, ''), nullif(v_kelas, ''), nullif(v_sangga, ''), nullif(p_agama, ''), nullif(p_jabatan, ''));
end $$;

alter table public.penugasan_rombel enable row level security;
alter table public.penugasan_log enable row level security;
alter table public.guru_agama enable row level security;

-- Penugasan penguji dan guru agama: dibaca pengurus (Pembina dan Dewan hanya melihat); diatur Admin lewat fungsi.
drop policy if exists baca_penugasan on public.penugasan_rombel;
create policy baca_penugasan on public.penugasan_rombel for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));
drop policy if exists baca_penugasan_log on public.penugasan_log;
create policy baca_penugasan_log on public.penugasan_log for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));
drop policy if exists baca_guru_agama on public.guru_agama;
create policy baca_guru_agama on public.guru_agama for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));

revoke all on public.penugasan_rombel, public.penugasan_log, public.guru_agama from anon, authenticated;
grant select on public.penugasan_rombel, public.penugasan_log, public.guru_agama to authenticated;

revoke all on function
  public.sg_penugasan_atur(text, uuid, text[], boolean), public.sg_penugasan_salin(text, text), public.sg_rombel_perbarui(jsonb),
  public.sg_guru_agama_simpan(bigint, text, text, text), public.sg_guru_agama_hapus(bigint), public.sg_anggota_agama_atur(jsonb)
  from public, anon, authenticated;
grant execute on function
  public.sg_penugasan_atur(text, uuid, text[], boolean), public.sg_penugasan_salin(text, text), public.sg_rombel_perbarui(jsonb),
  public.sg_guru_agama_simpan(bigint, text, text, text), public.sg_guru_agama_hapus(bigint), public.sg_anggota_agama_atur(jsonb)
  to authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
