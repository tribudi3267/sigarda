-- ============================================================================
-- MIGRASI: Tahap 4 -- Perlindungan anggota (Safe From Harm, Jukran Kwarnas 004/2021). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-periksa-data-diri.sql; lihat README). Isi:
--   * Tabel public.sfh_catatan: catatan kewajiban anggota dewasa gugus depan (Pembina: pelatihan, pakta integritas, pemeriksaan rekam jejak; Admin Gudep: pelatihan). Hanya MENCATAT
--     tanggal dan tautan bukti. RLS baca: pemilik, Pembina, dan Admin; tulis hanya lewat fungsi. Laporan kejadian TIDAK disimpan di aplikasi.
--   * Fungsi baru (Pembina dan Admin): sg_sfh_catat, sg_sfh_hapus, dan sg_sfh_gudep_simpan (penerima laporan gugus depan pada pengaturan 'perlindungan.gudep', dibaca semua pengguna).
--   * sg_pemeriksaan_data() ditulis ulang (tanda tangan sama): kunci baru sfhBelum. sg_cadangan_admin() ditulis ulang agar memuat tabel baru.
-- TIDAK menghapus data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.portofolio_snapshot') is null or to_regprocedure('public.sg_pemeriksaan_data()') is null
     or (select prosrc from pg_proc where oid = to_regprocedure('public.sg_pemeriksaan_data()')) not like '%dataDiriBelum%' then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-periksa-data-diri.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Perlindungan anggota / Safe From Harm (Tahap 4): tabel =====
-- Catatan kewajiban Safe From Harm bagi ANGGOTA DEWASA gugus depan menurut Jukran Kwarnas 004/2021: Pembina (Pasal 9 ayat 3 huruf b: lulus Pelatihan Perlindungan; Pasal 7 ayat 4 huruf f:
-- menandatangani pakta integritas; Pasal 7 ayat 4 huruf e: pemeriksaan riwayat hidup dan rekam jejak) dan Admin Gudep (pelatihan). Aplikasi hanya MENCATAT (tanggal dan tautan bukti);
-- laporan kejadian TIDAK disimpan di aplikasi (Pasal 8 ayat 4 huruf g: rahasia, ditangani Komite Perlindungan dan Dewan Kehormatan di luar aplikasi). Satu baris per orang per jenis.
-- Dicatat Pembina atau Admin; dibaca pemilik, Pembina, dan Admin.
create table if not exists public.sfh_catatan (
  id bigint generated always as identity primary key,
  anggota_id uuid not null references public.profiles(id) on delete cascade,
  jenis text not null check (jenis in ('pelatihan', 'pakta_integritas', 'rekam_jejak')),
  tanggal date not null check (tanggal >= date '2015-01-01'),
  bukti_url text not null default '' check (char_length(bukti_url) <= 500 and (bukti_url = '' or bukti_url ~* '^https?://[^[:space:]<>]+$')),
  catatan text not null default '' check (char_length(catatan) <= 200 and catatan !~ '[[:cntrl:]<>]'),
  dicatat_oleh uuid references public.profiles(id) on delete set null,
  dicatat_pada timestamptz not null default now(),
  unique (anggota_id, jenis)
);
-- ===== akhir tabel perlindungan anggota =====

alter table public.sfh_catatan enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (baca saja lewat kebijakan; tulis hanya lewat fungsi).
revoke all on public.sfh_catatan from anon, authenticated;
grant select on public.sfh_catatan to authenticated;
drop policy if exists baca_sfh_catatan on public.sfh_catatan;
create policy baca_sfh_catatan on public.sfh_catatan for select to authenticated
  using ((select sigarda.aktif()) and (anggota_id = (select auth.uid()) or (select sigarda.pembina_atau_admin())));

-- ===== Perlindungan anggota / Safe From Harm (Tahap 4): aksi =====
-- Mencatat (atau mengoreksi) satu catatan Safe From Harm bagi anggota dewasa gugus depan: Pembina aktif (pelatihan, pakta_integritas, rekam_jejak) atau Admin Gudep aktif (pelatihan saja).
-- Pembina dan Admin yang mencatat. tanggal tidak boleh di masa depan; bukti_url (opsional) tautan http(s); catatan <= 200 karakter. Mencatat ulang = koreksi.
create or replace function public.sg_sfh_catat(p_anggota_id uuid, p_jenis text, p_tanggal date, p_bukti_url text default '', p_catatan text default '') returns void language plpgsql security definer set search_path = public as
$$
declare v_p public.profiles; v_url text := btrim(coalesce(p_bukti_url, '')); v_cat text := sigarda.rapikan(p_catatan);
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mencatat Safe From Harm.'; end if;
  if coalesce(p_jenis, '') not in ('pelatihan', 'pakta_integritas', 'rekam_jejak') then raise exception 'Jenis catatan harus pelatihan, pakta_integritas, atau rekam_jejak.'; end if;
  select * into v_p from public.profiles where id = p_anggota_id;
  if not found then raise exception 'Pilih anggota.'; end if;
  if v_p.status <> 'aktif' or not ((v_p.role = 'penguji' and v_p.jabatan = 'Pembina') or v_p.role = 'admin') then
    raise exception 'Catatan Safe From Harm hanya untuk anggota dewasa aktif (Pembina dan Admin Gudep).';
  end if;
  if v_p.role = 'admin' and p_jenis <> 'pelatihan' then raise exception 'Admin Gudep hanya dicatat untuk pelatihan; pakta integritas dan rekam jejak untuk Pembina.'; end if;
  if p_tanggal is null or p_tanggal < date '2015-01-01' or p_tanggal > sigarda.hari_ini() then raise exception 'Tanggal tidak boleh sebelum tahun 2015 atau di masa depan.'; end if;
  if char_length(v_url) > 500 then raise exception 'Tautan bukti maksimal 500 karakter.'; end if;
  if v_url <> '' and v_url !~* '^https?://[^[:space:]<>]+$' then raise exception 'Tautan bukti harus berawalan http:// atau https:// tanpa spasi.'; end if;
  if char_length(v_cat) > 200 or v_cat ~ '[[:cntrl:]<>]' then raise exception 'Catatan maksimal 200 karakter dan tanpa karakter khusus.'; end if;
  insert into public.sfh_catatan (anggota_id, jenis, tanggal, bukti_url, catatan, dicatat_oleh, dicatat_pada)
  values (p_anggota_id, p_jenis, p_tanggal, v_url, v_cat, auth.uid(), now())
  on conflict (anggota_id, jenis) do update set tanggal = excluded.tanggal, bukti_url = excluded.bukti_url, catatan = excluded.catatan, dicatat_oleh = excluded.dicatat_oleh, dicatat_pada = excluded.dicatat_pada;
end $$;

create or replace function public.sg_sfh_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus catatan Safe From Harm.'; end if;
  delete from public.sfh_catatan where id = p_id;
end $$;

-- Penerima laporan gugus depan (Pasal 10 ayat 3: setiap gugus depan wajib memiliki prosedur penerimaan laporan). Pengaturan 'perlindungan.gudep' = { penerima, kontak, prosedurUrl, catatan }
-- (dibaca semua pengguna agar Penegak tahu kepada siapa melapor; diubah Pembina dan Admin). Laporan sendiri TIDAK disimpan di aplikasi.
create or replace function public.sg_sfh_gudep_simpan(p_nilai jsonb) returns void language plpgsql security definer set search_path = public as
$$
declare v_k text; v_v text; v_maks int; v_h jsonb := '{}'::jsonb;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah penerima laporan Safe From Harm.'; end if;
  if p_nilai is null or jsonb_typeof(p_nilai) <> 'object' or p_nilai - 'penerima' - 'kontak' - 'prosedurUrl' - 'catatan' <> '{}'::jsonb then raise exception 'Bentuk isian tidak sah.'; end if;
  foreach v_k in array array['penerima', 'kontak', 'prosedurUrl', 'catatan'] loop
    if coalesce(jsonb_typeof(p_nilai -> v_k), '') <> 'string' then raise exception 'Isian % harus berupa teks.', v_k; end if;
    if v_k = 'prosedurUrl' then
      v_v := btrim(p_nilai ->> v_k);
      if char_length(v_v) > 500 or (v_v <> '' and v_v !~* '^https?://[^[:space:]<>]+$') then raise exception 'Tautan prosedur harus berawalan http:// atau https:// tanpa spasi (maksimal 500 karakter).'; end if;
    else
      v_v := sigarda.rapikan(p_nilai ->> v_k);
      v_maks := case v_k when 'penerima' then 120 when 'kontak' then 80 else 300 end; -- (case di dalam kondisi if terpotong pada then pertama)
      if char_length(v_v) > v_maks or v_v ~ '[[:cntrl:]<>]' then
        raise exception 'Isian % terlalu panjang atau memuat karakter khusus.', v_k;
      end if;
    end if;
    v_h := v_h || jsonb_build_object(v_k, v_v);
  end loop;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada) values ('perlindungan.gudep', v_h, auth.uid(), now())
  on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;
-- ===== akhir aksi perlindungan anggota =====

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
  public.sg_sfh_catat(uuid, text, date, text, text), public.sg_sfh_hapus(bigint), public.sg_sfh_gudep_simpan(jsonb), public.sg_pemeriksaan_data()
  from public, anon, authenticated;
grant execute on function
  public.sg_sfh_catat(uuid, text, date, text, text), public.sg_sfh_hapus(bigint), public.sg_sfh_gudep_simpan(jsonb), public.sg_pemeriksaan_data()
  to authenticated;

commit;
notify pgrst, 'reload schema';
