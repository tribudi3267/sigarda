-- ============================================================================
-- MIGRASI: Fase E -- integrasi pra-uji dengan eskalasi, Pemeriksaan Data, dan pengingat. AMAN untuk database berisi data.
--
-- Jalankan SETELAH 2026-09-pra-uji.sql (Fase C; lihat README). Isi (tanda tangan fungsi TIDAK berubah, Edge Function tidak berubah):
--   * sigarda.eskalasi_mulai_sku: tangga eskalasi "SKU tidak bergerak" tidak dihitung selama ada pra-uji yang menunggu penilai (penghambatnya penilai, bukan
--     Penegak); yang macet muncul di Periksa Data dan diingatkan pengingat pra-uji.
--   * sigarda.pra_uji_pengingat: pengingat "Pra-uji tanpa penilai" ke Pembina bertautan ke menu Pra-uji (tempat melewati tahap), bukan menu Antrian.
--   * sg_pemeriksaan_data: kunci baru praUjiAktif, rombelTanpaBinaDamping (rombel berPenegak dengan kurang dari 2 Bina Damping tahun ajaran berjalan), sanggaTanpaPinsa,
--     dan praUjiMacet (pra-uji menunggu lebih dari 3 hari atau tanpa penilai yang memenuhi syarat). Klien menampilkan tiga daftar itu hanya bila pra-uji hidup.
-- TIDAK menghapus data dan tidak mengubah sakelar. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.sku_pra_uji') is null or to_regprocedure('sigarda.pra_uji_aktif()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-pra-uji.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

create or replace function sigarda.eskalasi_mulai_sku(p_peserta uuid) returns date language plpgsql stable security definer set search_path = public as
$$
declare v_terakhir date;
begin
  if exists (select 1 from public.sku_pra_uji where peserta_id = p_peserta and status = 'menunggu') then return null; end if;
  select greatest(
    coalesce((select max(diubah)::date from public.sku_progress where peserta_id = p_peserta), (select dibuat from public.profiles where id = p_peserta)),
    coalesce((select max(waktu)::date from public.sku_riwayat where peserta_id = p_peserta), (select dibuat from public.profiles where id = p_peserta))
  ) into v_terakhir;
  if sigarda.hari_ini() - v_terakhir >= 7 then return v_terakhir + 7; end if;
  return null;
end $$;

create or replace function sigarda.pra_uji_pengingat() returns void language plpgsql security definer set search_path = public as
$$
declare r record; v_x uuid; v_ada boolean;
begin
  for r in select u.id, u.peserta_id, u.sku_id, u.tahap, p.nama from public.sku_pra_uji u join public.profiles p on p.id = u.peserta_id
           where u.status = 'menunggu' and u.dibuat < now() - interval '3 days' loop
    v_ada := false;
    for v_x in select * from sigarda.pra_uji_penilai_daftar(r.peserta_id, r.sku_id, r.tahap) loop
      v_ada := true;
      perform sigarda.notif_buat(v_x, 'pra_uji', 'Pra-uji menunggu lebih dari 3 hari', r.nama || ', ' || sigarda.notif_label_butir(r.sku_id), '{"tab":"pra-uji"}', 'pra-lama:' || r.id);
    end loop;
    if not v_ada then
      for v_x in select id from public.profiles where role = 'penguji' and jabatan = 'Pembina' and status = 'aktif' loop
        perform sigarda.notif_buat(v_x, 'pra_uji', 'Pra-uji tanpa penilai',
          r.nama || ', ' || sigarda.notif_label_butir(r.sku_id) || ': belum ada ' || sigarda.pra_uji_nama_tahap(r.tahap) || ' yang dapat menilai. Lewati tahap ini bila perlu.',
          '{"tab":"pra-uji"}', 'pra-macet:' || r.id);
      end loop;
    end if;
  end loop;
end $$;

create or replace function public.sg_pemeriksaan_data() returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare v_ta text := sigarda.tahun_ajaran_kini();
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya pengurus (Pembina, Dewan Ambalan, dan Admin Gudep) yang dapat melihat pemeriksaan data.'; end if;
  return jsonb_build_object(
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
        select p.kelas, min(p.sangga) as sangga, count(*) as jumlah from public.profiles p
        where p.role = 'peserta' and p.status = 'aktif' and sigarda.rombel_sah(p.kelas) and btrim(coalesce(p.sangga, '')) <> ''
        group by p.kelas, lower(btrim(p.sangga)) having not bool_or(p.pinsa) limit 300
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
end $$;

commit;
notify pgrst, 'reload schema';
