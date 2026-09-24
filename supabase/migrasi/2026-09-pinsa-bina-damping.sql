-- ============================================================================
-- MIGRASI: Pinsa dan Bina Damping (fase B: model data dan hak; pra-uji menyusul di fase C). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-keepalive.sql). Isi:
--   * profiles.pinsa (boolean, bawaan false): Pimpinan Sangga. Satu Pinsa per sangga per rombel (indeks unik profil_pinsa_unik); hilang sendiri bila Penegak
--     pindah rombel/sangga atau tidak aktif (pemicu profiles_pinsa_bersih, berlaku untuk jalur apa pun termasuk naik kelas).
--   * Tabel public.bina_damping: 2 orang per rombel per tahun ajaran, Penegak berjabatan Dewan Ambalan yang minimal Calon Laksana (utamakan yang sudah Laksana).
--     Satu orang satu rombel per tahun ajaran. RLS tanpa kebijakan dan tanpa hak baca langsung: hanya lewat fungsi. Baris hilang sendiri bila Penegaknya nonaktif/alumni atau
--     tidak lagi berjabatan Dewan (pemicu profiles_bina_damping_bersih).
--   * sg_bina_damping_atur (Dewan, Pembina, Admin; prioritas Dewan yang sudah Laksana), sg_bina_damping_daftar (pengurus), sg_sangga_rombel (pengurus, Bina Damping, anggota
--     rombel), sg_sangga_atur (Bina Damping rombel itu, Pembina, Admin: membagi sangga dan menentukan Pinsa), sg_pendampingan_saya (peran diri sendiri untuk menu).
--   * sigarda.tingkat_penegak, bina_damping_rombel, sangga_bisa_atur, sangga_peringatan: fungsi bantu baru.
--   * sg_cadangan_admin() ditulis ulang agar memuat tabel bina_damping (tanda tangan sama).
-- Edge Function TIDAK berubah dan tidak perlu di-deploy ulang. TIDAK menghapus data yang ada. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: skema dan migrasi sebelumnya (sampai penugasan, dewan-penegak, usulan-kegiatan, cadangan) sudah ada.
do $$
begin
  if to_regprocedure('public.sg_cadangan_admin()') is null or to_regprocedure('public.sg_kegiatan_ping(bigint)') is null
     or to_regprocedure('sigarda.jabatan_dewan_lepas(uuid, text)') is null or to_regclass('public.kegiatan_usulan') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-keepalive.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

alter table public.profiles add column if not exists pinsa boolean not null default false;
alter table public.profiles drop constraint if exists profil_pinsa;
alter table public.profiles add constraint profil_pinsa check (not pinsa or role = 'peserta');
create unique index if not exists profil_pinsa_unik on public.profiles (kelas, lower(sangga)) where pinsa;

-- ===== Pinsa dan Bina Damping (fase B): tabel =====
-- Bina Damping: 2 orang per rombel per tahun ajaran, Penegak berjabatan Dewan Ambalan yang minimal Calon Laksana (utamakan yang sudah Laksana), ditunjuk lewat
-- sg_bina_damping_atur. Satu orang hanya satu rombel per tahun ajaran (persediaan pendamping terbatas). Tanpa kebijakan baca: dibaca lewat fungsi sg_* saja.
-- Baris hilang sendiri (pemicu profiles_bina_damping_bersih) bila Penegaknya nonaktif/alumni atau tidak lagi berjabatan Dewan.
create table if not exists public.bina_damping (
  tahun_ajaran text not null check (tahun_ajaran ~ '^[0-9]{4}/[0-9]{4}$'),
  rombel text not null check (rombel ~ '^(X|XI|XII)-(0[1-9]|10)$'),
  penegak_id uuid not null references public.profiles(id) on delete cascade,
  ditetapkan_oleh uuid references public.profiles(id) on delete set null,
  ditetapkan_pada timestamptz not null default now(),
  primary key (tahun_ajaran, rombel, penegak_id)
);
create unique index if not exists bina_damping_satu_rombel_idx on public.bina_damping (tahun_ajaran, penegak_id);
create index if not exists bina_damping_penegak_idx on public.bina_damping (penegak_id);
-- ===== akhir tabel pinsa bina damping =====

alter table public.bina_damping enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (hanya lewat fungsi).
revoke all on public.bina_damping from anon, authenticated;

-- ---- Pinsa dan Bina Damping (fase B): fungsi bantu ----
-- Tingkat SKU seorang Penegak untuk penunjukan pendamping: 'calon-bantara' (butir Bantara belum semua lulus), 'calon-laksana' (Bantara selesai),
-- 'laksana' (Bantara dan Laksana selesai).
create or replace function sigarda.tingkat_penegak(p_id uuid) returns text language sql stable security definer set search_path = public as
$$
  select case when not sigarda.tingkat_selesai(p_id, 'Bantara') then 'calon-bantara'
              when not sigarda.tingkat_selesai(p_id, 'Laksana') then 'calon-laksana'
              else 'laksana' end
$$;

-- Pemanggil adalah Bina Damping (aktif) untuk rombel ini pada tahun ajaran berjalan.
create or replace function sigarda.bina_damping_rombel(p_rombel text) returns boolean language plpgsql stable security definer set search_path = public as
$$
begin
  return coalesce((select p.role = 'peserta' and p.status = 'aktif' and not p.wajib_ganti_pin
                     and exists (select 1 from public.bina_damping b where b.penegak_id = p.id and b.rombel = p_rombel and b.tahun_ajaran = sigarda.tahun_ajaran_kini())
                   from public.profiles p where p.id = auth.uid()), false);
end $$;

-- Boleh membagi sangga dan menentukan Pinsa di rombel ini: Pembina, Admin, atau Bina Damping rombel itu.
create or replace function sigarda.sangga_bisa_atur(p_rombel text) returns boolean language sql stable security definer set search_path = public as
$$ select sigarda.pembina_atau_admin() or sigarda.bina_damping_rombel(p_rombel) $$;

-- Peringatan (tidak memblokir) tentang susunan sangga sebuah rombel: [{ "sangga": nama atau null, "teks": ... }]. Batas: 2 Bina Damping, 4-5 sangga
-- per rombel, 4-8 Penegak per sangga, dan tiap sangga punya Pinsa. Rombel tanpa anggota aktif tidak diperingatkan soal sangga.
create or replace function sigarda.sangga_peringatan(p_rombel text) returns jsonb language plpgsql stable security definer set search_path = public as
$$
declare v_p jsonb := '[]'::jsonb; v_r record; v_sangga int := 0; v_bd int;
begin
  select count(*) into v_bd from public.bina_damping where tahun_ajaran = sigarda.tahun_ajaran_kini() and rombel = p_rombel;
  if v_bd < 2 then
    v_p := v_p || jsonb_build_array(jsonb_build_object('sangga', null, 'teks', format('Bina Damping rombel ini baru %s dari 2 orang.', v_bd)));
  end if;
  for v_r in
    select min(sangga) as nama, count(*)::int as n, bool_or(pinsa) as ada_pinsa from public.profiles
    where role = 'peserta' and status = 'aktif' and kelas = p_rombel group by lower(sangga) order by lower(sangga)
  loop
    v_sangga := v_sangga + 1;
    if v_r.n < 4 or v_r.n > 8 then
      v_p := v_p || jsonb_build_array(jsonb_build_object('sangga', v_r.nama, 'teks', format('Sangga %s beranggotakan %s Penegak (seharusnya 4 sampai 8).', v_r.nama, v_r.n)));
    end if;
    if not v_r.ada_pinsa then
      v_p := v_p || jsonb_build_array(jsonb_build_object('sangga', v_r.nama, 'teks', format('Sangga %s belum punya Pinsa.', v_r.nama)));
    end if;
  end loop;
  if v_sangga > 0 and (v_sangga < 4 or v_sangga > 5) then
    v_p := v_p || jsonb_build_array(jsonb_build_object('sangga', null, 'teks', format('Rombel ini punya %s sangga (seharusnya 4 sampai 5).', v_sangga)));
  end if;
  return v_p;
end $$;

-- Pinsa hilang sendiri bila Penegak pindah rombel atau sangga, atau tidak lagi aktif (jalur apa pun yang mengubahnya, termasuk naik kelas).
create or replace function sigarda.pinsa_bersihkan() returns trigger language plpgsql set search_path = public as
$$
begin
  if new.pinsa and (new.role <> 'peserta' or new.status <> 'aktif' or new.kelas is distinct from old.kelas
                    or lower(coalesce(new.sangga, '')) is distinct from lower(coalesce(old.sangga, ''))) then
    new.pinsa := false;
  end if;
  return new;
end $$;
drop trigger if exists profiles_pinsa_bersih on public.profiles;
create trigger profiles_pinsa_bersih before update on public.profiles for each row execute function sigarda.pinsa_bersihkan();

-- Bina Damping berakhir bila Penegaknya nonaktif/alumni atau tidak lagi berjabatan Dewan (dicabut, atau kepengurusan diganti).
create or replace function sigarda.bina_damping_bersihkan() returns trigger language plpgsql security definer set search_path = public as
$$
begin
  delete from public.bina_damping where penegak_id = new.id;
  return null;
end $$;
drop trigger if exists profiles_bina_damping_bersih on public.profiles;
create trigger profiles_bina_damping_bersih after update of status, jabatan_dewan, role on public.profiles for each row
  when (new.status <> 'aktif' or new.jabatan_dewan is null or new.role <> 'peserta') execute function sigarda.bina_damping_bersihkan();
-- ---- akhir bantu pinsa bina damping ----

-- ===== Pinsa dan Bina Damping (fase B): aksi =====
-- Menunjuk Bina Damping satu rombel (menggantikan daftar lama; kosong = mengosongkan). Dewan Ambalan, Pembina, dan Admin Gudep.
-- Bina Damping = Penegak aktif berjabatan Dewan Ambalan yang minimal Calon Laksana (Bantara selesai), maksimal 2 per rombel, satu rombel per orang per tahun
-- ajaran. PRIORITAS: Penegak Dewan yang sudah Laksana lebih dulu; yang masih Calon Laksana hanya bila tidak ada lagi Penegak Dewan yang sudah Laksana
-- dan belum bertugas. Mengembalikan jumlah perubahan (yang dicabut + yang ditambah).
create or replace function public.sg_bina_damping_atur(p_tahun_ajaran text, p_rombel text, p_penegak_ids uuid[]) returns int
language plpgsql security definer set search_path = public as
$$
declare v_ids uuid[]; v_id uuid; v_p public.profiles; v_n int := 0; v_k int; v_bebas int;
begin
  perform sigarda.wajib_aktif();
  if not (sigarda.dewan() or sigarda.pembina_atau_admin()) then
    raise exception 'Hanya Dewan Ambalan, Pembina, dan Admin Gudep yang dapat menunjuk Bina Damping.';
  end if;
  if not sigarda.tahun_ajaran_sah(p_tahun_ajaran) then raise exception 'Tahun ajaran tidak sah. Contoh: 2026/2027.'; end if;
  if not sigarda.rombel_sah(p_rombel) then raise exception 'Rombel tidak sah. Contoh: X-01, XI-05, XII-10.'; end if;
  v_ids := coalesce((select array_agg(distinct x) from unnest(p_penegak_ids) x), '{}');
  if cardinality(v_ids) > 2 then raise exception 'Bina Damping maksimal 2 orang per rombel.'; end if;
  foreach v_id in array v_ids loop
    select * into v_p from public.profiles where id = v_id and role = 'peserta';
    if not found or v_p.status <> 'aktif' then raise exception 'Penegak tidak ditemukan atau tidak aktif.'; end if;
    if v_p.jabatan_dewan is null then
      raise exception '% bukan pengurus Dewan Ambalan. Bina Damping dipilih dari Penegak berjabatan Dewan Ambalan.', v_p.nama;
    end if;
    if not sigarda.tingkat_selesai(v_id, 'Bantara') then
      raise exception '% belum menyelesaikan SKU Bantara. Bina Damping minimal Penegak Calon Laksana.', v_p.nama;
    end if;
    if exists (select 1 from public.bina_damping where tahun_ajaran = p_tahun_ajaran and penegak_id = v_id and rombel <> p_rombel) then
      raise exception '% sudah menjadi Bina Damping rombel lain pada tahun ajaran ini.', v_p.nama;
    end if;
    if not sigarda.tingkat_selesai(v_id, 'Laksana') then
      select count(*) into v_bebas from public.profiles q
      where q.role = 'peserta' and q.status = 'aktif' and q.jabatan_dewan is not null and q.id <> all (v_ids)
        and sigarda.tingkat_selesai(q.id, 'Bantara') and sigarda.tingkat_selesai(q.id, 'Laksana')
        and not exists (select 1 from public.bina_damping b where b.tahun_ajaran = p_tahun_ajaran and b.penegak_id = q.id and b.rombel <> p_rombel);
      if v_bebas > 0 then
        raise exception '% masih Calon Laksana. Dahulukan Penegak berjabatan Dewan yang sudah Laksana (masih ada % yang belum bertugas).', v_p.nama, v_bebas;
      end if;
    end if;
  end loop;

  delete from public.bina_damping where tahun_ajaran = p_tahun_ajaran and rombel = p_rombel and not (penegak_id = any (v_ids));
  get diagnostics v_k = row_count;
  v_n := v_k;
  foreach v_id in array v_ids loop
    insert into public.bina_damping (tahun_ajaran, rombel, penegak_id, ditetapkan_oleh) values (p_tahun_ajaran, p_rombel, v_id, auth.uid()) on conflict do nothing;
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end loop;
  return v_n;
end $$;

-- Penunjukan Bina Damping satu tahun ajaran (bawaan: tahun ajaran berjalan) beserta calon yang dapat dipilih. Pengurus (Dewan, Pembina, Admin).
-- { tahun_ajaran, bisa_atur (boleh menunjuk: Dewan, Pembina, Admin), penugasan: [{ rombel, penegak_id, nama, kelas, jabatan_dewan, tingkat }],
--   calon: [{ id, nama, kelas, jabatan_dewan, tingkat, rombel }] } dengan calon = Penegak berjabatan Dewan yang minimal Calon Laksana (Laksana lebih dulu);
-- rombel = tempat ia sudah bertugas pada tahun ajaran itu (null = belum).
create or replace function public.sg_bina_damping_daftar(p_tahun_ajaran text default null) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare v_ta text := coalesce(p_tahun_ajaran, sigarda.tahun_ajaran_kini());
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya pengurus yang dapat melihat penunjukan Bina Damping.'; end if;
  if not sigarda.tahun_ajaran_sah(v_ta) then raise exception 'Tahun ajaran tidak sah. Contoh: 2026/2027.'; end if;
  return jsonb_build_object(
    'tahun_ajaran', v_ta,
    'bisa_atur', sigarda.dewan() or sigarda.pembina_atau_admin(),
    'penugasan', coalesce((
      select jsonb_agg(jsonb_build_object('rombel', b.rombel, 'penegak_id', p.id, 'nama', p.nama, 'kelas', p.kelas, 'jabatan_dewan', p.jabatan_dewan,
                                          'tingkat', sigarda.tingkat_penegak(p.id)) order by b.rombel, p.nama)
      from public.bina_damping b join public.profiles p on p.id = b.penegak_id where b.tahun_ajaran = v_ta), '[]'::jsonb),
    'calon', coalesce((
      select jsonb_agg(x.j order by x.urut, x.nama) from (
        select p.nama, case when sigarda.tingkat_selesai(p.id, 'Laksana') then 0 else 1 end as urut,
               jsonb_build_object('id', p.id, 'nama', p.nama, 'kelas', p.kelas, 'jabatan_dewan', p.jabatan_dewan, 'tingkat', sigarda.tingkat_penegak(p.id),
                                  'rombel', (select b.rombel from public.bina_damping b where b.penegak_id = p.id and b.tahun_ajaran = v_ta)) as j
        from public.profiles p
        where p.role = 'peserta' and p.status = 'aktif' and p.jabatan_dewan is not null and sigarda.tingkat_selesai(p.id, 'Bantara')
      ) x), '[]'::jsonb)
  );
end $$;

-- Susunan sangga sebuah rombel beserta Bina Damping dan peringatannya. Boleh dibaca: pengurus, Bina Damping rombel itu, dan Penegak aktif rombel itu.
-- { rombel, tahun_ajaran, bisa_atur, bina_damping: [{ id, nama, tingkat }], anggota: [{ id, nama, sangga, pinsa, tingkat, layak_pinsa }], peringatan: [{ sangga, teks }] }
-- `tingkat` (kemajuan SKU sesama Penegak) dan `layak_pinsa` (Bantara selesai) hanya diperlihatkan kepada yang boleh mengatur dan pengurus; Penegak biasa menerima null/false.
create or replace function public.sg_sangga_rombel(p_rombel text) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare v_atur boolean; v_lihat boolean;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.rombel_sah(p_rombel) then raise exception 'Rombel tidak sah. Contoh: X-01, XI-05, XII-10.'; end if;
  v_atur := sigarda.sangga_bisa_atur(p_rombel);
  v_lihat := v_atur or sigarda.pengurus();
  if not (v_lihat or exists (select 1 from public.profiles where id = auth.uid() and role = 'peserta' and status = 'aktif' and kelas = p_rombel)) then
    raise exception 'Susunan sangga hanya dapat dilihat pengurus, Bina Damping, dan anggota rombel ini.';
  end if;
  return jsonb_build_object(
    'rombel', p_rombel,
    'tahun_ajaran', sigarda.tahun_ajaran_kini(),
    'bisa_atur', v_atur,
    'bina_damping', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nama', p.nama, 'tingkat', case when v_lihat then sigarda.tingkat_penegak(p.id) end) order by p.nama)
      from public.bina_damping b join public.profiles p on p.id = b.penegak_id
      where b.rombel = p_rombel and b.tahun_ajaran = sigarda.tahun_ajaran_kini()), '[]'::jsonb),
    'anggota', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'sangga', x.sangga, 'pinsa', x.pinsa, 'tingkat', x.tingkat,
                                          'layak_pinsa', x.tingkat is not null and x.tingkat <> 'calon-bantara') order by lower(x.sangga), x.pinsa desc, x.nama)
      from (select p.id, p.nama, p.sangga, p.pinsa, case when v_lihat then sigarda.tingkat_penegak(p.id) end as tingkat
            from public.profiles p where p.role = 'peserta' and p.status = 'aktif' and p.kelas = p_rombel) x), '[]'::jsonb),
    'peringatan', sigarda.sangga_peringatan(p_rombel)
  );
end $$;

-- Membagi sangga dan menentukan Pinsa di satu rombel (Bina Damping rombel itu, Pembina, dan Admin). p_data = [{ id, sangga?, pinsa? }] untuk Penegak aktif
-- rombel itu; kunci yang tidak ada = tidak diubah. Semua atau tidak sama sekali. Pinsa minimal Calon Laksana, satu per sangga; pindah sangga otomatis melepas
-- Pinsa-nya. Mengembalikan { diubah, peringatan } (peringatan tidak memblokir).
create or replace function public.sg_sangga_atur(p_rombel text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare v_e jsonb; v_id uuid; v_t public.profiles; v_s text; v_pinsa boolean; v_lain text; v_n int := 0; v_tahap int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.rombel_sah(p_rombel) then raise exception 'Rombel tidak sah. Contoh: X-01, XI-05, XII-10.'; end if;
  if not sigarda.sangga_bisa_atur(p_rombel) then
    raise exception 'Hanya Bina Damping rombel ini, Pembina, dan Admin Gudep yang dapat mengatur sangga.';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'array' then raise exception 'Data sangga tidak sah.'; end if;
  if jsonb_array_length(p_data) > 60 then raise exception 'Maksimal 60 Penegak per penyimpanan.'; end if;

  -- Tahap 1: nama sangga.
  for v_e in select * from jsonb_array_elements(p_data) loop
    v_id := (v_e ->> 'id')::uuid;
    select * into v_t from public.profiles where id = v_id and role = 'peserta' and kelas = p_rombel and status = 'aktif';
    if not found then raise exception 'Penegak tidak ditemukan di rombel % atau tidak aktif.', p_rombel; end if;
    if v_e ? 'sangga' then
      v_s := sigarda.rapikan(v_e ->> 'sangga');
      if v_s = '' or char_length(v_s) > 40 then raise exception 'Nama sangga wajib diisi (maksimal 40 karakter).'; end if;
      v_s := coalesce((select sangga from public.profiles where role = 'peserta' and lower(sangga) = lower(v_s) limit 1), v_s);
      if v_s <> v_t.sangga then
        update public.profiles set sangga = v_s where id = v_id;
        v_n := v_n + 1;
      end if;
    end if;
  end loop;

  -- Tahap 2: Pinsa. Yang dicabut lebih dulu (agar tukar Pinsa dalam satu simpanan berhasil), lalu yang ditetapkan.
  for v_tahap in 1..2 loop
    for v_e in select * from jsonb_array_elements(p_data) loop
      if not (v_e ? 'pinsa') then continue; end if;
      v_pinsa := (v_e ->> 'pinsa')::boolean;
      if (v_tahap = 1) <> (not v_pinsa) then continue; end if;
      v_id := (v_e ->> 'id')::uuid;
      select * into v_t from public.profiles where id = v_id;
      if v_pinsa is not distinct from v_t.pinsa then continue; end if;
      if v_pinsa then
        if not sigarda.tingkat_selesai(v_id, 'Bantara') then
          raise exception '% belum menyelesaikan SKU Bantara. Pinsa dipilih dari Penegak Calon Laksana.', v_t.nama;
        end if;
        select nama into v_lain from public.profiles where role = 'peserta' and status = 'aktif' and kelas = v_t.kelas and lower(sangga) = lower(v_t.sangga) and pinsa and id <> v_id limit 1;
        if v_lain is not null then raise exception 'Sangga % sudah punya Pinsa (%). Cabut dulu Pinsa yang lama.', v_t.sangga, v_lain; end if;
      end if;
      update public.profiles set pinsa = v_pinsa where id = v_id;
      v_n := v_n + 1;
    end loop;
  end loop;
  return jsonb_build_object('diubah', v_n, 'peringatan', sigarda.sangga_peringatan(p_rombel));
end $$;

-- Peran pendampingan diri sendiri (dipakai menu): rombel yang saya dampingi sebagai Bina Damping pada tahun ajaran berjalan, dan apakah saya Pinsa.
create or replace function public.sg_pendampingan_saya() returns jsonb
language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  return jsonb_build_object(
    'bina_damping', coalesce((select jsonb_agg(b.rombel order by b.rombel) from public.bina_damping b
                              where b.penegak_id = auth.uid() and b.tahun_ajaran = sigarda.tahun_ajaran_kini()), '[]'::jsonb),
    'pinsa', coalesce((select pinsa from public.profiles where id = auth.uid()), false));
end $$;
-- ===== akhir aksi pinsa bina damping =====

create or replace function public.sg_cadangan_admin() returns jsonb language plpgsql security definer set search_path = public as
$$
declare v_hasil jsonb;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengunduh cadangan.');
  select jsonb_build_object(
    'dibuat_pada', now(),
    'tabel', jsonb_build_object(
      'profiles', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.profiles t),
      'sku_butir', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sku_butir t),
      'sku_unit', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sku_unit t),
      'pf_item', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.pf_item t),
      'sku_progress', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sku_progress t),
      'sku_riwayat', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sku_riwayat t),
      'absensi_sesi', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.absensi_sesi t),
      'absensi_hadir', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.absensi_hadir t),
      'iuran', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.iuran t),
      'iuran_log', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.iuran_log t),
      'iuran_kas', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.iuran_kas t),
      'asisten_iuran', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.asisten_iuran t),
      'penugasan_rombel', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.penugasan_rombel t),
      'penugasan_log', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.penugasan_log t),
      'penugasan_peserta', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.penugasan_peserta t),
      'kepengurusan_log', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.kepengurusan_log t),
      'guru_agama', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.guru_agama t),
      'dokumen_terbit', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.dokumen_terbit t),
      'dokumen_urut', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.dokumen_urut t),
      'naik_kelas_batch', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.naik_kelas_batch t),
      'naik_kelas_log', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.naik_kelas_log t),
      'portofolio', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.portofolio t),
      'portofolio_jurnal', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.portofolio_jurnal t),
      'materi', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.materi t),
      'pengaturan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.pengaturan t),
      'sidang_urut', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sidang_urut t),
      'sidang_dk', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sidang_dk t),
      'raport', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.raport t),
      'instrumen', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.instrumen t),
      'instrumen_kriteria', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.instrumen_kriteria t),
      'instrumen_penguji', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.instrumen_penguji t),
      'instrumen_panduan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.instrumen_panduan t),
      'sku_penilaian', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sku_penilaian t),
      'sertifikat_tingkat', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sertifikat_tingkat t),
      'sesi_ujian', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sesi_ujian t),
      'sesi_ujian_butir', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sesi_ujian_butir t),
      'sesi_ujian_peserta', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sesi_ujian_peserta t),
      'agenda', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.agenda t),
      'kegiatan_usulan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.kegiatan_usulan t),
      'bina_damping', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.bina_damping t)
    )
  ) into v_hasil;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada)
    values ('cadangan.terakhir', jsonb_build_object('pada', now(), 'oleh', (select nama from public.profiles where id = auth.uid())), auth.uid(), now())
    on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
  return v_hasil;
end $$;

revoke all on function
  public.sg_bina_damping_atur(text, text, uuid[]), public.sg_bina_damping_daftar(text), public.sg_sangga_rombel(text), public.sg_sangga_atur(text, jsonb), public.sg_pendampingan_saya()
  from public, anon, authenticated;
grant execute on function
  public.sg_bina_damping_atur(text, text, uuid[]), public.sg_bina_damping_daftar(text), public.sg_sangga_rombel(text), public.sg_sangga_atur(text, jsonb), public.sg_pendampingan_saya()
  to authenticated;
-- Fungsi sigarda.* baru: hak dijalankan ulang di sini (grant "all functions in schema" tidak retroaktif untuk fungsi baru).
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
