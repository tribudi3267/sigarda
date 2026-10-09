-- ============================================================================
-- MIGRASI: Pinsa tidak lagi disyaratkan Calon Laksana. AMAN untuk database berisi data.
--
-- Jalankan SETELAH 2026-10-muat-awal.sql (lihat README). Isi:
--   * Syarat "SKU Bantara selesai" untuk menjadi Pinsa DICABUT (aturan itu buatan aplikasi, bukan ketentuan Kwarnas): Penegak aktif mana pun, kelas X, XI, atau XII,
--     boleh menjadi Pinsa sangga sendiri (kotak centang Pinsa) atau Pinsa tertugas di rombel lain.
--   * Daftar calon Pinsa tertugas (sg_pinsa_calon) memuat semua Penegak aktif (urut kelas lalu nama, sampai 800), bukan hanya yang Bantaranya selesai.
--   * Fungsi ditulis ulang (tanda tangan sama): sg_sangga_rombel, sg_sangga_atur, sg_pinsa_calon, sg_pinsa_tugaskan.
-- Aturan Bina Damping (minimal Calon Laksana) TIDAK berubah. TIDAK mengubah tabel/data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regprocedure('public.sg_pinsa_calon(text)') is null or to_regprocedure('public.sg_sangga_rombel(text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-10-muat-awal.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

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
                                          'layak_pinsa', x.tingkat is not null) order by lower(x.sangga), x.pinsa desc, x.nama)
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
      if v_s is distinct from v_t.sangga then
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
        if btrim(coalesce(v_t.sangga, '')) = '' then raise exception '% belum punya sangga. Bagi sangga lebih dulu, baru pilih Pinsa.', v_t.nama; end if;
        select nama into v_lain from public.profiles where role = 'peserta' and status = 'aktif' and kelas = v_t.kelas and lower(sangga) = lower(v_t.sangga) and pinsa and id <> v_id limit 1;
        if v_lain is not null then raise exception 'Sangga % sudah punya Pinsa (%). Cabut dulu Pinsa yang lama.', v_t.sangga, v_lain; end if;
      end if;
      update public.profiles set pinsa = v_pinsa where id = v_id;
      v_n := v_n + 1;
    end loop;
  end loop;
  return jsonb_build_object('diubah', v_n, 'peringatan', sigarda.sangga_peringatan(p_rombel));
end $$;

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
        order by p.kelas, p.nama
        limit 800
      ) x), '[]'::jsonb));
end $$;

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

revoke all on function
  public.sg_sangga_rombel(text), public.sg_sangga_atur(text, jsonb), public.sg_pinsa_calon(text), public.sg_pinsa_tugaskan(text, text, uuid)
  from public, anon, authenticated;
grant execute on function
  public.sg_sangga_rombel(text), public.sg_sangga_atur(text, jsonb), public.sg_pinsa_calon(text), public.sg_pinsa_tugaskan(text, text, uuid)
  to authenticated;

commit;
notify pgrst, 'reload schema';
