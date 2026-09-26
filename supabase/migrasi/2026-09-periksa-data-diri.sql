-- ============================================================================
-- MIGRASI: Tahap 3 (H1, lanjutan) -- Pemeriksaan Data memuat kategori "Penegak belum melengkapi data diri". AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-snapshot-portofolio.sql; lihat README). Isi:
--   * sg_pemeriksaan_data() ditulis ulang (tanda tangan sama): kunci baru dataDiriBelum = Penegak aktif yang belum mengisi isian pokok data diri (WhatsApp, jenis kelamin,
--     agama, tanggal lahir, tempat lahir, alamat, nama ayah/ibu/wali). Hanya nama dan KODE isian yang kurang yang dikembalikan, tidak pernah nilainya.
-- Tidak mengubah tabel maupun data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.portofolio_snapshot') is null or to_regclass('public.penegak_isian') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-snapshot-portofolio.sql; lihat README), baru migrasi ini.';
  end if;
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

revoke all on function public.sg_pemeriksaan_data() from public, anon, authenticated;
grant execute on function public.sg_pemeriksaan_data() to authenticated;

commit;
notify pgrst, 'reload schema';
