-- ============================================================================
-- MIGRASI: Pemeriksaan Data menampilkan JUMLAH SEBENARNYA (simulasi beban 26 September 2026). AMAN untuk database berisi data.
--
-- Jalankan SETELAH 2026-09-perlindungan-anggota.sql (lihat README). Masalah: sg_pemeriksaan_data() memotong tiap daftar di 300 baris, sehingga pada hari peluncuran
-- (sekitar 700 Penegak belum mengisi data diri atau belum punya NTA) layar hanya menunjukkan 300 tanpa tanda bahwa masih ada lagi. Perbaikan: hasil memuat kunci baru
-- jumlahSebenarnya ({ kelasLama, tanpaNta, tanpaJk, dataDiriBelum, belumPernahMasuk }); dihitung hanya bila daftarnya penuh (300), jadi biasanya tanpa biaya tambahan.
-- Hanya menulis ulang sg_pemeriksaan_data() (tanda tangan sama). TIDAK mengubah tabel maupun data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regprocedure('public.sg_pemeriksaan_data()') is null
     or (select prosrc from pg_proc where oid = to_regprocedure('public.sg_pemeriksaan_data()')) not like '%sfhBelum%' then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-perlindungan-anggota.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

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

revoke all on function public.sg_pemeriksaan_data() from public, anon, authenticated;
grant execute on function public.sg_pemeriksaan_data() to authenticated;

commit;
notify pgrst, 'reload schema';
