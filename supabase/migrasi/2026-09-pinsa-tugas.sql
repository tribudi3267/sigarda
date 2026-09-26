-- ============================================================================
-- MIGRASI: Pinsa tertugas lintas rombel (persiapan uji coba pra-uji 2 Oktober 2026). AMAN untuk database berisi data.
--
-- Jalankan SETELAH 2026-09-pemeriksaan-jumlah.sql (lihat README). Isi:
--   * Tabel public.pinsa_tugas: Penegak Calon Laksana yang DITUGASKAN menjadi Pinsa sebuah sangga di rombel lain (mis. kakak kelas untuk sangga rombel Calon Bantara).
--     Satu orang satu sangga per tahun ajaran; paling banyak 2 penugasan per sangga. RLS tanpa kebijakan dan tanpa hak baca langsung: hanya lewat fungsi.
--     Baris hilang sendiri bila Penegaknya nonaktif/alumni (pemicu profiles_pinsa_tugas_bersih).
--   * Fungsi baru: sg_pinsa_calon, sg_pinsa_tugaskan, sg_pinsa_cabut (Bina Damping rombel itu, Pembina, Admin), dan sigarda.pinsa_tugas_bersihkan.
--   * Fungsi lama ditulis ulang (tanda tangan sama): sigarda.pra_uji_penilai_ok dan pra_uji_penilai_daftar (Pinsa tertugas ikut menjadi penilai tahap Pinsa),
--     sigarda.sangga_peringatan, sg_sangga_rombel (memuat pinsa_tugas), sg_pendampingan_saya (Pinsa tertugas memunculkan menu Pra-uji), sg_pemeriksaan_data (sanggaTanpaPinsa),
--     dan sg_cadangan_admin (memuat pinsa_tugas).
-- TIDAK menghapus data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.bina_damping') is null or to_regprocedure('public.sg_sangga_rombel(text)') is null
     or (select prosrc from pg_proc where oid = to_regprocedure('public.sg_pemeriksaan_data()')) not like '%jumlahSebenarnya%' then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-pemeriksaan-jumlah.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Pinsa tertugas lintas rombel (persiapan uji coba 2 Okt 2026): tabel =====
-- Pinsa sebuah sangga dapat berasal dari anggota sangga itu sendiri (profiles.pinsa) ATAU dari Penegak Calon Laksana (Bantara selesai) yang DITUGASKAN menjadi anggota
-- sangga di rombel lain, mis. kakak kelas untuk sangga rombel Calon Bantara (keputusan pemilik gudep 26 Sep 2026). Satu orang satu sangga per tahun ajaran; paling banyak 2
-- penugasan per sangga (dijaga sg_pinsa_tugaskan). Tanpa kebijakan baca: dibaca lewat fungsi sg_sangga_rombel dan sg_pinsa_calon. Baris hilang sendiri bila Penegaknya
-- nonaktif/alumni (pemicu profiles_pinsa_tugas_bersih).
create table if not exists public.pinsa_tugas (
  tahun_ajaran text not null check (tahun_ajaran ~ '^[0-9]{4}/[0-9]{4}$'),
  rombel text not null check (rombel ~ '^(X|XI|XII)-(0[1-9]|10)$'),
  sangga text not null check (char_length(sangga) between 1 and 40 and sangga = btrim(sangga)),
  penegak_id uuid not null references public.profiles(id) on delete cascade,
  ditetapkan_oleh uuid references public.profiles(id) on delete set null,
  ditetapkan_pada timestamptz not null default now(),
  primary key (tahun_ajaran, penegak_id)
);
create index if not exists pinsa_tugas_sangga_idx on public.pinsa_tugas (tahun_ajaran, rombel, lower(sangga));
create index if not exists pinsa_tugas_ditetapkan_oleh_idx on public.pinsa_tugas (ditetapkan_oleh);
-- ===== akhir tabel pinsa tertugas =====

alter table public.pinsa_tugas enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (hanya lewat fungsi).
revoke all on public.pinsa_tugas from anon, authenticated;

-- ---- Pinsa tertugas lintas rombel: fungsi bantu ----
-- Penugasan Pinsa berakhir bila Penegaknya nonaktif/alumni (jalur apa pun yang mengubah status atau peran).
create or replace function sigarda.pinsa_tugas_bersihkan() returns trigger language plpgsql security definer set search_path = public as
$$
begin
  delete from public.pinsa_tugas where penegak_id = new.id;
  return null;
end $$;
drop trigger if exists profiles_pinsa_tugas_bersih on public.profiles;
create trigger profiles_pinsa_tugas_bersih after update of status, role on public.profiles for each row
  when (new.status <> 'aktif' or new.role <> 'peserta') execute function sigarda.pinsa_tugas_bersihkan();
-- ---- akhir bantu pinsa tertugas ----

create or replace function sigarda.sangga_peringatan(p_rombel text) returns jsonb language plpgsql stable security definer set search_path = public as
$$
declare v_p jsonb := '[]'::jsonb; v_r record; v_sangga int := 0; v_bd int; v_tanpa int;
begin
  select count(*) into v_bd from public.bina_damping where tahun_ajaran = sigarda.tahun_ajaran_kini() and rombel = p_rombel;
  if v_bd < 2 then
    v_p := v_p || jsonb_build_array(jsonb_build_object('sangga', null, 'teks', format('Bina Damping rombel ini baru %s dari 2 orang.', v_bd)));
  end if;
  for v_r in
    -- Pinsa sebuah sangga: anggota sangga itu berstatus Pinsa, atau Penegak yang ditugaskan (pinsa_tugas) ke sangga ini.
    select g.nama, g.n, (g.ada_pinsa or exists (select 1 from public.pinsa_tugas t where t.tahun_ajaran = sigarda.tahun_ajaran_kini() and t.rombel = p_rombel and lower(t.sangga) = g.kunci)) as ada_pinsa
    from (select lower(sangga) as kunci, min(sangga) as nama, count(*)::int as n, bool_or(pinsa) as ada_pinsa from public.profiles
          where role = 'peserta' and status = 'aktif' and kelas = p_rombel and btrim(coalesce(sangga, '')) <> '' group by lower(sangga)) g
    order by g.kunci
  loop
    v_sangga := v_sangga + 1;
    if v_r.n < 4 or v_r.n > 8 then
      v_p := v_p || jsonb_build_array(jsonb_build_object('sangga', v_r.nama, 'teks', format('Sangga %s beranggotakan %s Penegak (seharusnya 4 sampai 8).', v_r.nama, v_r.n)));
    end if;
    if not v_r.ada_pinsa then
      v_p := v_p || jsonb_build_array(jsonb_build_object('sangga', v_r.nama, 'teks', format('Sangga %s belum punya Pinsa.', v_r.nama)));
    end if;
  end loop;
  -- Penegak baru dibuat tanpa sangga (Tahap 3, H1): Pembina atau Bina Damping membaginya.
  select count(*)::int into v_tanpa from public.profiles where role = 'peserta' and status = 'aktif' and kelas = p_rombel and btrim(coalesce(sangga, '')) = '';
  if v_tanpa > 0 then
    v_p := v_p || jsonb_build_array(jsonb_build_object('sangga', null, 'teks', format('%s Penegak rombel ini belum punya sangga.', v_tanpa)));
  end if;
  if v_sangga > 0 and (v_sangga < 4 or v_sangga > 5) then
    v_p := v_p || jsonb_build_array(jsonb_build_object('sangga', null, 'teks', format('Rombel ini punya %s sangga (seharusnya 4 sampai 5).', v_sangga)));
  end if;
  return v_p;
end $$;

create or replace function sigarda.pra_uji_penilai_ok(p_peserta uuid, p_sku text, p_tahap text, p_penilai uuid) returns boolean
language plpgsql stable security definer set search_path = public as
$$
declare v_p public.profiles; v_n public.profiles; v_tingkat text;
begin
  if p_penilai is null or p_penilai = p_peserta then return false; end if;
  select * into v_p from public.profiles where id = p_peserta and role = 'peserta';
  if not found then return false; end if;
  select * into v_n from public.profiles where id = p_penilai and role = 'peserta' and status = 'aktif';
  if not found then return false; end if;
  select tingkat into v_tingkat from public.sku_unit where id = p_sku;
  if not found then return false; end if;
  if not exists (select 1 from public.sku_progress where peserta_id = p_penilai and sku_id = p_sku and status = 'lulus') then return false; end if;
  if p_tahap = 'pinsa' then
    return v_tingkat = 'Bantara' and not v_p.pinsa and v_p.kelas is not null and btrim(coalesce(v_p.sangga, '')) <> ''
       and ((v_n.pinsa and v_n.kelas = v_p.kelas and lower(v_n.sangga) = lower(v_p.sangga))
            or exists (select 1 from public.pinsa_tugas t where t.penegak_id = p_penilai and t.tahun_ajaran = sigarda.tahun_ajaran_kini()
                       and t.rombel = v_p.kelas and lower(t.sangga) = lower(v_p.sangga)));
  elsif p_tahap = 'bina_damping' then
    return exists (select 1 from public.bina_damping b where b.penegak_id = p_penilai and b.rombel = v_p.kelas and b.tahun_ajaran = sigarda.tahun_ajaran_kini())
       and (v_tingkat = 'Bantara' or sigarda.tingkat_penegak(p_penilai) = 'laksana');
  end if;
  return false;
end $$;

create or replace function sigarda.pra_uji_penilai_daftar(p_peserta uuid, p_sku text, p_tahap text) returns setof uuid
language sql stable security definer set search_path = public as
$$
  select u.id from public.profiles u
  where u.role = 'peserta' and u.status = 'aktif'
    and case p_tahap when 'pinsa' then (u.pinsa or exists (select 1 from public.pinsa_tugas t where t.penegak_id = u.id and t.tahun_ajaran = sigarda.tahun_ajaran_kini()))
                     when 'bina_damping' then exists (select 1 from public.bina_damping b where b.penegak_id = u.id) else false end
    and sigarda.pra_uji_penilai_ok(p_peserta, p_sku, p_tahap, u.id)
$$;

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
    'pinsa_tugas', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nama', p.nama, 'sangga', t.sangga, 'kelas', p.kelas, 'tingkat', case when v_lihat then sigarda.tingkat_penegak(p.id) end)
                       order by lower(t.sangga), p.nama)
      from public.pinsa_tugas t join public.profiles p on p.id = t.penegak_id
      where t.tahun_ajaran = sigarda.tahun_ajaran_kini() and t.rombel = p_rombel), '[]'::jsonb),
    'peringatan', sigarda.sangga_peringatan(p_rombel)
  );
end $$;

create or replace function public.sg_pendampingan_saya() returns jsonb
language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  return jsonb_build_object(
    'bina_damping', coalesce((select jsonb_agg(b.rombel order by b.rombel) from public.bina_damping b
                              where b.penegak_id = auth.uid() and b.tahun_ajaran = sigarda.tahun_ajaran_kini()), '[]'::jsonb),
    'pinsa', coalesce((select pinsa from public.profiles where id = auth.uid()), false)
             or exists (select 1 from public.pinsa_tugas t where t.penegak_id = auth.uid() and t.tahun_ajaran = sigarda.tahun_ajaran_kini()),
    'pinsa_tugas', coalesce((select jsonb_agg(jsonb_build_object('rombel', t.rombel, 'sangga', t.sangga) order by t.rombel, lower(t.sangga)) from public.pinsa_tugas t
                             where t.penegak_id = auth.uid() and t.tahun_ajaran = sigarda.tahun_ajaran_kini()), '[]'::jsonb));
end $$;

-- ===== Pinsa tertugas lintas rombel: aksi =====
-- Penegak yang dapat ditugaskan menjadi Pinsa sebuah sangga di rombel p_rombel: aktif, sudah menyelesaikan SKU Bantara, belum bertugas sebagai Pinsa tahun ajaran ini
-- (dan bukan Pinsa sangga sendiri). Dibaca hanya oleh yang boleh mengatur sangga rombel itu (Bina Damping rombel itu, Pembina, Admin); dipanggil saat panel penugasan dibuka.
-- { tahun_ajaran, calon: [{ id, nama, kelas, tingkat }] } urut kelas lalu nama.
create or replace function public.sg_pinsa_calon(p_rombel text) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.rombel_sah(p_rombel) then raise exception 'Rombel tidak sah. Contoh: X-01, XI-05, XII-10.'; end if;
  if not sigarda.sangga_bisa_atur(p_rombel) then
    raise exception 'Hanya Bina Damping rombel ini, Pembina, dan Admin Gudep yang dapat menugaskan Pinsa.';
  end if;
  return jsonb_build_object(
    'tahun_ajaran', sigarda.tahun_ajaran_kini(),
    'calon', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'kelas', x.kelas, 'tingkat', x.tingkat) order by x.kelas, x.nama)
      from (
        select p.id, p.nama, p.kelas, sigarda.tingkat_penegak(p.id) as tingkat
        from public.profiles p
        where p.role = 'peserta' and p.status = 'aktif' and not p.pinsa
          and not exists (select 1 from public.pinsa_tugas t where t.penegak_id = p.id and t.tahun_ajaran = sigarda.tahun_ajaran_kini())
          and exists (select 1 from public.sku_progress s join public.sku_unit u on u.id = s.sku_id where s.peserta_id = p.id and s.status = 'lulus' and u.tingkat = 'Bantara')
          and sigarda.tingkat_selesai(p.id, 'Bantara')
        limit 400
      ) x), '[]'::jsonb));
end $$;

-- Menugaskan satu Penegak Calon Laksana menjadi Pinsa sebuah sangga (p_sangga) di rombel p_rombel (Bina Damping rombel itu, Pembina, Admin). Sangga harus sudah ada di rombel itu.
-- Satu orang satu sangga per tahun ajaran; paling banyak 2 Pinsa tertugas per sangga. Mengembalikan { peringatan } (sama dengan sg_sangga_atur).
create or replace function public.sg_pinsa_tugaskan(p_rombel text, p_sangga text, p_penegak_id uuid) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare v_ta text := sigarda.tahun_ajaran_kini(); v_s text := sigarda.rapikan(p_sangga); v_nama_sangga text; v_p public.profiles; v_t public.pinsa_tugas;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.rombel_sah(p_rombel) then raise exception 'Rombel tidak sah. Contoh: X-01, XI-05, XII-10.'; end if;
  if not sigarda.sangga_bisa_atur(p_rombel) then
    raise exception 'Hanya Bina Damping rombel ini, Pembina, dan Admin Gudep yang dapat menugaskan Pinsa.';
  end if;
  select min(sangga) into v_nama_sangga from public.profiles
    where role = 'peserta' and status = 'aktif' and kelas = p_rombel and lower(btrim(coalesce(sangga, ''))) = lower(v_s) and v_s <> '';
  if v_nama_sangga is null then
    raise exception 'Sangga % belum ada di rombel %. Bagi sangga lebih dulu, baru tugaskan Pinsa.', coalesce(nullif(v_s, ''), '(kosong)'), p_rombel;
  end if;
  select * into v_p from public.profiles where id = p_penegak_id and role = 'peserta' and status = 'aktif';
  if not found then raise exception 'Penegak tidak ditemukan atau tidak aktif.'; end if;
  if not sigarda.tingkat_selesai(p_penegak_id, 'Bantara') then
    raise exception '% belum menyelesaikan SKU Bantara. Pinsa dipilih dari Penegak Calon Laksana.', v_p.nama;
  end if;
  if v_p.pinsa then raise exception '% sudah menjadi Pinsa di sangga sendiri. Cabut dulu Pinsa-nya di rombelnya.', v_p.nama; end if;
  select * into v_t from public.pinsa_tugas where tahun_ajaran = v_ta and penegak_id = p_penegak_id;
  if found then
    raise exception '% sudah bertugas sebagai Pinsa sangga % rombel %. Cabut dulu penugasannya.', v_p.nama, v_t.sangga, v_t.rombel;
  end if;
  if v_p.kelas = p_rombel and lower(btrim(coalesce(v_p.sangga, ''))) = lower(v_nama_sangga) then
    raise exception '% anggota sangga ini sendiri. Jadikan Pinsa lewat kotak centang Pinsa pada susunan sangga.', v_p.nama;
  end if;
  if (select count(*) from public.pinsa_tugas where tahun_ajaran = v_ta and rombel = p_rombel and lower(sangga) = lower(v_nama_sangga)) >= 2 then
    raise exception 'Sangga % sudah punya 2 Pinsa tertugas. Cabut salah satunya lebih dulu.', v_nama_sangga;
  end if;
  insert into public.pinsa_tugas (tahun_ajaran, rombel, sangga, penegak_id, ditetapkan_oleh) values (v_ta, p_rombel, v_nama_sangga, p_penegak_id, auth.uid());
  return jsonb_build_object('peringatan', sigarda.sangga_peringatan(p_rombel));
end $$;

-- Mencabut penugasan Pinsa (p_penegak_id) pada rombel p_rombel (Bina Damping rombel itu, Pembina, Admin). Mencabut yang tidak ada tidak galat.
create or replace function public.sg_pinsa_cabut(p_rombel text, p_penegak_id uuid) returns jsonb
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.rombel_sah(p_rombel) then raise exception 'Rombel tidak sah. Contoh: X-01, XI-05, XII-10.'; end if;
  if not sigarda.sangga_bisa_atur(p_rombel) then
    raise exception 'Hanya Bina Damping rombel ini, Pembina, dan Admin Gudep yang dapat mencabut penugasan Pinsa.';
  end if;
  delete from public.pinsa_tugas where tahun_ajaran = sigarda.tahun_ajaran_kini() and rombel = p_rombel and penegak_id = p_penegak_id;
  return jsonb_build_object('peringatan', sigarda.sangga_peringatan(p_rombel));
end $$;
-- ===== akhir aksi pinsa tertugas =====

create or replace function public.sg_pemeriksaan_data() returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare v_ta text := sigarda.tahun_ajaran_kini(); v_hasil jsonb;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya pengurus (Pembina, Dewan Ambalan, dan Admin Gudep) yang dapat melihat pemeriksaan data.'; end if;
  v_hasil := jsonb_build_object(
    'praUjiAktif', sigarda.pra_uji_aktif(),
    'kelasLama', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'nis', x.nis, 'kelas', x.kelas) order by x.nis)
      from (select id, nama, nis, kelas from public.profiles where role = 'peserta' and status = 'aktif' and not sigarda.rombel_sah(kelas) limit 300) x
    ), '[]'::jsonb),
    'tanpaNta', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'nis', x.nis, 'kelas', x.kelas) order by x.nis)
      from (select id, nama, nis, kelas from public.profiles where role = 'peserta' and status = 'aktif' and (nta is null or btrim(nta) = '') limit 300) x
    ), '[]'::jsonb),
    'tanpaJk', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'nis', x.nis, 'kelas', x.kelas, 'peran', x.peran) order by x.peran, x.nama)
      from (select id, nama, nis, kelas, case when role = 'peserta' then 'Penegak' when role = 'admin' then 'Admin Gudep' else coalesce(jabatan, 'Dewan Ambalan') end as peran
            from public.profiles where status = 'aktif' and jenis_kelamin is null limit 300) x
    ), '[]'::jsonb),
    'rombelTanpaPenguji', coalesce((
      select jsonb_agg(jsonb_build_object('rombel', x.rombel, 'jumlah', x.jumlah) order by x.rombel)
      from (
        select rb.rombel, (select count(*) from public.profiles p2 where p2.role = 'peserta' and p2.status = 'aktif' and p2.kelas = rb.rombel) as jumlah
        from (select k || '-' || lpad(n::text, 2, '0') as rombel from (values ('X'), ('XI'), ('XII')) t(k), generate_series(1, 10) n) rb
        where exists (select 1 from public.profiles p2 where p2.role = 'peserta' and p2.status = 'aktif' and p2.kelas = rb.rombel)
          and not exists (select 1 from public.penugasan_rombel r where r.tahun_ajaran = v_ta and r.rombel = rb.rombel)
      ) x
    ), '[]'::jsonb),
    'rombelTanpaBinaDamping', coalesce((
      select jsonb_agg(jsonb_build_object('rombel', x.rombel, 'jumlah', x.jumlah, 'binaDamping', x.bd) order by x.rombel)
      from (
        select rb.rombel, (select count(*) from public.profiles p2 where p2.role = 'peserta' and p2.status = 'aktif' and p2.kelas = rb.rombel) as jumlah,
               (select count(*) from public.bina_damping b where b.tahun_ajaran = v_ta and b.rombel = rb.rombel) as bd
        from (select k || '-' || lpad(n::text, 2, '0') as rombel from (values ('X'), ('XI'), ('XII')) t(k), generate_series(1, 10) n) rb
        where exists (select 1 from public.profiles p2 where p2.role = 'peserta' and p2.status = 'aktif' and p2.kelas = rb.rombel)
          and (select count(*) from public.bina_damping b where b.tahun_ajaran = v_ta and b.rombel = rb.rombel) < 2
      ) x
    ), '[]'::jsonb),
    'sanggaTanpaPinsa', coalesce((
      select jsonb_agg(jsonb_build_object('rombel', x.kelas, 'sangga', x.sangga, 'jumlah', x.jumlah) order by x.kelas, x.sangga)
      from (
        -- Pinsa sebuah sangga: anggota berstatus Pinsa, atau Penegak yang ditugaskan (pinsa_tugas) ke sangga itu.
        select g.kelas, g.sangga, g.jumlah from (
          select p.kelas, lower(btrim(p.sangga)) as kunci, min(p.sangga) as sangga, count(*) as jumlah, bool_or(p.pinsa) as ada
          from public.profiles p
          where p.role = 'peserta' and p.status = 'aktif' and sigarda.rombel_sah(p.kelas) and btrim(coalesce(p.sangga, '')) <> ''
          group by p.kelas, lower(btrim(p.sangga))
        ) g
        where not g.ada and not exists (select 1 from public.pinsa_tugas t where t.tahun_ajaran = v_ta and t.rombel = g.kelas and lower(t.sangga) = g.kunci)
        limit 300
      ) x
    ), '[]'::jsonb),
    'praUjiMacet', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'kelas', x.kelas, 'butir', x.butir, 'tahap', x.tahap, 'hari', x.hari, 'tanpaPenilai', x.tanpa_penilai) order by x.hari desc)
      from (
        select r.id, p.nama, p.kelas, sigarda.notif_label_butir(r.sku_id) as butir, r.tahap, floor(extract(epoch from now() - r.dibuat) / 86400)::int as hari,
               not exists (select 1 from sigarda.pra_uji_penilai_daftar(r.peserta_id, r.sku_id, r.tahap)) as tanpa_penilai
        from public.sku_pra_uji r join public.profiles p on p.id = r.peserta_id
        where r.status = 'menunggu'
          and (r.dibuat < now() - interval '3 days' or not exists (select 1 from sigarda.pra_uji_penilai_daftar(r.peserta_id, r.sku_id, r.tahap)))
        limit 300
      ) x
    ), '[]'::jsonb),
    'pembinaTanpaAgama', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama) order by x.nama)
      from (select id, nama from public.profiles where role = 'penguji' and jabatan = 'Pembina' and status = 'aktif' and agama is null limit 300) x
    ), '[]'::jsonb),
    -- Data diri Penegak yang belum lengkap (Tahap 3, H1): isian POKOK saja (WhatsApp, jenis kelamin, agama, tanggal lahir, tempat lahir, alamat, nama ayah/ibu/wali; cermin
    -- isianLogic.POKOK). Hanya nama dan KODE isian yang kurang, tidak pernah nilainya (bukan data pribadi). Diisi Penegak sendiri, jadi tanpa tombol perbaiki.
    'dataDiriBelum', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'nis', x.nis, 'kelas', x.kelas, 'kurang', to_jsonb(x.kurang)) order by x.kelas, x.nama)
      from (
        select y.* from (
          select p.id, p.nama, p.nis, p.kelas,
            array_remove(array[
              case when p.whatsapp is null or btrim(p.whatsapp) = '' then 'whatsapp' end,
              case when p.jenis_kelamin is null then 'jk' end,
              case when p.agama is null then 'agama' end,
              case when not exists (select 1 from public.tanggal_lahir t where t.peserta_id = p.id) then 'lahir' end,
              case when not exists (select 1 from public.penegak_isian i where i.peserta_id = p.id and i.kunci = 'tempat_lahir') then 'tempat_lahir' end,
              case when not exists (select 1 from public.penegak_isian i where i.peserta_id = p.id and i.kunci = 'alamat') then 'alamat' end,
              case when not exists (select 1 from public.penegak_isian i where i.peserta_id = p.id and i.kunci in ('ayah_nama', 'ibu_nama', 'wali_nama')) then 'ortu' end
            ], null) as kurang
          from public.profiles p where p.role = 'peserta' and p.status = 'aktif'
        ) y where cardinality(y.kurang) > 0 order by y.kelas, y.nama limit 300
      ) x
    ), '[]'::jsonb),
    -- Safe From Harm (Tahap 4): anggota dewasa aktif yang catatannya belum lengkap. Pembina: pelatihan, pakta_integritas, rekam_jejak; Admin Gudep: pelatihan (kode yang kurang).
    'sfhBelum', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'peran', x.peran, 'kurang', to_jsonb(x.kurang)) order by x.peran, x.nama)
      from (
        select y.* from (
          select p.id, p.nama, case when p.role = 'admin' then 'Admin Gudep' else 'Pembina' end as peran,
            array_remove(array[
              case when not exists (select 1 from public.sfh_catatan s where s.anggota_id = p.id and s.jenis = 'pelatihan') then 'pelatihan' end,
              case when p.role = 'penguji' and not exists (select 1 from public.sfh_catatan s where s.anggota_id = p.id and s.jenis = 'pakta_integritas') then 'pakta_integritas' end,
              case when p.role = 'penguji' and not exists (select 1 from public.sfh_catatan s where s.anggota_id = p.id and s.jenis = 'rekam_jejak') then 'rekam_jejak' end
            ], null) as kurang
          from public.profiles p
          where p.status = 'aktif' and (p.role = 'admin' or (p.role = 'penguji' and p.jabatan = 'Pembina'))
        ) y where cardinality(y.kurang) > 0 order by y.peran, y.nama limit 300
      ) x
    ), '[]'::jsonb),
    'belumPernahMasuk', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'peran', x.peran, 'dibuat', x.dibuat) order by x.dibuat)
      from (
        select p.id, p.nama, case when p.role = 'peserta' then 'Penegak' when p.role = 'admin' then 'Admin Gudep' else coalesce(p.jabatan, 'Dewan Ambalan') end as peran, p.dibuat
        from public.profiles p join auth.users u on u.id = p.id
        where p.status = 'aktif' and u.last_sign_in_at is null
        limit 300
      ) x
    ), '[]'::jsonb)
  );
  -- Jumlah SEBENARNYA untuk daftar yang bisa lebih dari 300 baris (700 Penegak: hari peluncuran data diri dan NTA belum terisi): dihitung hanya bila daftarnya penuh, jadi
  -- biasanya tanpa biaya tambahan. Klien menampilkan "300 dari N" (pemeriksaanLogic.jumlahKategori).
  return v_hasil || jsonb_build_object('jumlahSebenarnya', jsonb_build_object(
    'kelasLama', case when jsonb_array_length(v_hasil -> 'kelasLama') < 300 then jsonb_array_length(v_hasil -> 'kelasLama')
      else (select count(*) from public.profiles where role = 'peserta' and status = 'aktif' and not sigarda.rombel_sah(kelas)) end,
    'tanpaNta', case when jsonb_array_length(v_hasil -> 'tanpaNta') < 300 then jsonb_array_length(v_hasil -> 'tanpaNta')
      else (select count(*) from public.profiles where role = 'peserta' and status = 'aktif' and (nta is null or btrim(nta) = '')) end,
    'tanpaJk', case when jsonb_array_length(v_hasil -> 'tanpaJk') < 300 then jsonb_array_length(v_hasil -> 'tanpaJk')
      else (select count(*) from public.profiles where status = 'aktif' and jenis_kelamin is null) end,
    'dataDiriBelum', case when jsonb_array_length(v_hasil -> 'dataDiriBelum') < 300 then jsonb_array_length(v_hasil -> 'dataDiriBelum')
      else (select count(*) from public.profiles p where p.role = 'peserta' and p.status = 'aktif' and (
        p.whatsapp is null or btrim(p.whatsapp) = '' or p.jenis_kelamin is null or p.agama is null
        or not exists (select 1 from public.tanggal_lahir t where t.peserta_id = p.id)
        or not exists (select 1 from public.penegak_isian i where i.peserta_id = p.id and i.kunci = 'tempat_lahir')
        or not exists (select 1 from public.penegak_isian i where i.peserta_id = p.id and i.kunci = 'alamat')
        or not exists (select 1 from public.penegak_isian i where i.peserta_id = p.id and i.kunci in ('ayah_nama', 'ibu_nama', 'wali_nama')))) end,
    'belumPernahMasuk', case when jsonb_array_length(v_hasil -> 'belumPernahMasuk') < 300 then jsonb_array_length(v_hasil -> 'belumPernahMasuk')
      else (select count(*) from public.profiles p join auth.users u on u.id = p.id where p.status = 'aktif' and u.last_sign_in_at is null) end
  ));
end $$;

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
      'pengukuhan_dewan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.pengukuhan_dewan t),
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
      'sesi_ujian_peserta', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sesi_ujian_peserta t)
    -- PostgreSQL membatasi 100 argumen per fungsi (50 pasang): daftar tabel dibagi dua objek yang digabung dengan ||
    ) || jsonb_build_object(
      'agenda', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.agenda t),
      'kegiatan_usulan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.kegiatan_usulan t),
      'bina_damping', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.bina_damping t),
      'pinsa_tugas', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.pinsa_tugas t),
      'sku_pra_uji', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sku_pra_uji t),
      'pelantikan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.pelantikan t),
      'saka_anggota', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.saka_anggota t),
      'tkk_capaian', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tkk_capaian t),
      'tkk_krida', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tkk_krida t),
      'tkk_pengajuan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tkk_pengajuan t),
      'spg_penetapan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.spg_penetapan t),
      'tanggal_lahir', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tanggal_lahir t),
      'tim_penilai', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tim_penilai t),
      'tim_penilai_anggota', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tim_penilai_anggota t),
      'garuda_tahap', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.garuda_tahap t),
      'penegak_isian', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.penegak_isian t),
      'dokumen_templat', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.dokumen_templat t),
      'portofolio_snapshot', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.portofolio_snapshot t),
      'sfh_catatan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sfh_catatan t)
    )
  ) into v_hasil;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada)
    values ('cadangan.terakhir', jsonb_build_object('pada', now(), 'oleh', (select nama from public.profiles where id = auth.uid())), auth.uid(), now())
    on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
  return v_hasil;
end $$;

revoke all on function
  public.sg_pinsa_calon(text), public.sg_pinsa_tugaskan(text, text, uuid), public.sg_pinsa_cabut(text, uuid), public.sg_sangga_rombel(text), public.sg_pendampingan_saya(),
  public.sg_pemeriksaan_data(), public.sg_cadangan_admin()
  from public, anon, authenticated;
grant execute on function
  public.sg_pinsa_calon(text), public.sg_pinsa_tugaskan(text, text, uuid), public.sg_pinsa_cabut(text, uuid), public.sg_sangga_rombel(text), public.sg_pendampingan_saya(),
  public.sg_pemeriksaan_data(), public.sg_cadangan_admin()
  to authenticated;
-- Fungsi sigarda.* baru: hak dijalankan ulang di sini (grant "all functions in schema" tidak retroaktif untuk fungsi baru).
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
