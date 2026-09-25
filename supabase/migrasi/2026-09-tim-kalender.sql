-- ============================================================================
-- MIGRASI: Tahap 2 (G4b dan G4c) -- tim penilai Calon Garuda dan kalender tahap Garuda dari Kwarcab. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-tanggal-lahir-impor.sql; lihat README). Isi:
--   * Tabel public.tim_penilai (satu tim per tahun ajaran per putra/putri: nomor dan tanggal SK berpasangan, tautan SK), public.tim_penilai_anggota (1-15 anggota per tim:
--     nama, unsur, ketua atau anggota; paling banyak satu ketua) dan public.garuda_tahap (satu baris per tahun ajaran per tahap: tanggal mulai dan akhir).
--     RLS baca: pengurus; tulis hanya lewat fungsi.
--   * Fungsi baru (Pembina dan Admin Gudep): sg_tim_penilai_simpan, sg_tim_penilai_hapus, sg_garuda_tahap_simpan, sg_garuda_tahap_hapus.
--   * sg_cadangan_admin() ditulis ulang (tanda tangan sama) agar memuat tabel baru.
-- TIDAK menghapus data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.tanggal_lahir') is null or to_regprocedure('public.sg_tanggal_lahir_impor(jsonb)') is null or to_regprocedure('sigarda.rapikan(text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-tanggal-lahir-impor.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Tim penilai dan kalender Garuda (Tahap 2, G4b dan G4c): tabel =====
-- Tim penilai Calon Garuda (pedoman Kwarcab Purbalingga 2026): dibentuk dengan SK Kwarcab, TERPISAH untuk putra dan putri (calon putra dinilai tim putra, calon putri tim putri),
-- anggotanya Ketua Gudep (bukan Ka Mabigus sebagai ketua tim), Pembina Gudep, Andalan Ranting urusan Penegak, tokoh masyarakat, dan orang tua (ayah untuk putra, ibu untuk putri).
-- Satu tim per (tahun ajaran, untuk); Calon Garuda dinilai tim yang sesuai jenis kelaminnya. Komposisi yang tidak lengkap hanya diperingatkan di klien. Nomor dan tanggal SK berpasangan.
create table if not exists public.tim_penilai (
  id bigint generated always as identity primary key,
  tahun_ajaran text not null check (tahun_ajaran ~ '^[0-9]{4}/[0-9]{4}$'),
  untuk text not null check (untuk in ('putra', 'putri')),
  nomor_sk text not null default '' check (char_length(nomor_sk) <= 80),
  tanggal_sk date check (tanggal_sk is null or tanggal_sk >= date '2000-01-01'),
  sk_url text not null default '' check (sk_url = '' or (sk_url ~* '^https?://' and char_length(sk_url) <= 500)),
  catatan text not null default '' check (char_length(catatan) <= 300),
  dicatat_oleh uuid references public.profiles(id) on delete set null,
  dicatat_pada timestamptz not null default now(),
  constraint tim_penilai_unik unique (tahun_ajaran, untuk),
  constraint tim_penilai_sk_pasangan check ((nomor_sk = '') = (tanggal_sk is null))
);
create table if not exists public.tim_penilai_anggota (
  id bigint generated always as identity primary key,
  tim_id bigint not null references public.tim_penilai(id) on delete cascade,
  urut smallint not null check (urut between 1 and 15),
  nama text not null check (char_length(btrim(nama)) between 1 and 80),
  unsur text not null check (unsur in ('ketua_gudep', 'pembina', 'andalan_ranting', 'tokoh_masyarakat', 'orang_tua', 'lainnya')),
  jabatan text not null default 'anggota' check (jabatan in ('ketua', 'anggota')),
  keterangan text not null default '' check (char_length(keterangan) <= 120),
  constraint tim_penilai_anggota_urut unique (tim_id, urut)
);
create unique index if not exists tim_penilai_satu_ketua on public.tim_penilai_anggota (tim_id) where jabatan = 'ketua';

-- Kalender tahap Garuda dari Kwarcab (permohonan SK tim, serah portofolio ke Kwarran, verifikasi, pelantikan, dan seterusnya): satu baris per (tahun ajaran, tahap) berisi tanggal
-- mulai dan (opsional) akhir. Daftar tahap = TAHAP_GARUDA di src/lib/kalenderGarudaLogic.js (dijaga uji/tim-kalender-klien.mjs).
create table if not exists public.garuda_tahap (
  id bigint generated always as identity primary key,
  tahun_ajaran text not null check (tahun_ajaran ~ '^[0-9]{4}/[0-9]{4}$'),
  tahap text not null check (tahap in ('uji_spg', 'ajukan_tim', 'ambil_sk', 'penilaian_gudep', 'serah_kwarran', 'nilai_kwarran', 'kirim_kwarcab', 'verifikasi_visitasi', 'iuran', 'pelantikan')),
  mulai date not null check (mulai >= date '2000-01-01'),
  akhir date,
  catatan text not null default '' check (char_length(catatan) <= 200),
  dicatat_oleh uuid references public.profiles(id) on delete set null,
  dicatat_pada timestamptz not null default now(),
  constraint garuda_tahap_unik unique (tahun_ajaran, tahap),
  constraint garuda_tahap_rentang check (akhir is null or akhir >= mulai)
);
-- ===== akhir tabel tim kalender =====

alter table public.tim_penilai enable row level security;
alter table public.tim_penilai_anggota enable row level security;
alter table public.garuda_tahap enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (baca saja lewat kebijakan; tulis hanya lewat fungsi).
revoke all on public.tim_penilai, public.tim_penilai_anggota, public.garuda_tahap from anon, authenticated;
grant select on public.tim_penilai, public.tim_penilai_anggota, public.garuda_tahap to authenticated;
-- ===== Tim penilai dan kalender Garuda (Tahap 2, G4b dan G4c): kebijakan =====
-- Tim penilai dan kalender tahap Garuda dibaca pengurus (Pembina, Dewan, Admin); ditulis hanya lewat fungsi.
drop policy if exists baca_tim_penilai on public.tim_penilai;
create policy baca_tim_penilai on public.tim_penilai for select to authenticated using ((select sigarda.aktif()) and (select sigarda.pengurus()));
drop policy if exists baca_tim_penilai_anggota on public.tim_penilai_anggota;
create policy baca_tim_penilai_anggota on public.tim_penilai_anggota for select to authenticated using ((select sigarda.aktif()) and (select sigarda.pengurus()));
drop policy if exists baca_garuda_tahap on public.garuda_tahap;
create policy baca_garuda_tahap on public.garuda_tahap for select to authenticated using ((select sigarda.aktif()) and (select sigarda.pengurus()));
-- ===== akhir kebijakan tim kalender =====

-- ===== Tim penilai dan kalender Garuda (Tahap 2, G4b dan G4c): aksi =====
-- Hanya Pembina dan Admin Gudep yang mengubah (Ketua Gudep mengajukan tim penilai lewat Kwarran; di aplikasi Pembina atau Admin yang mencatat hasilnya). Dewan hanya membaca.
-- Komposisi tim tidak diblokir (peringatan di klien); yang ditegakkan hanya bentuk isian.

-- Menyimpan satu tim penilai beserta seluruh anggotanya (atomik; anggota lama diganti). p_id kosong = tim baru. Satu tim per (tahun ajaran, untuk).
-- p_anggota = [{ nama, unsur, jabatan ('ketua' | 'anggota'), keterangan }] 1-15 orang (urutan larik = urutan tampil); paling banyak satu ketua.
create or replace function public.sg_tim_penilai_simpan(
  p_id bigint, p_tahun_ajaran text, p_untuk text, p_nomor_sk text, p_tanggal_sk date, p_sk_url text, p_catatan text, p_anggota jsonb
) returns bigint language plpgsql security definer set search_path = public as
$$
declare
  v_nomor text := sigarda.rapikan(p_nomor_sk); v_url text := btrim(coalesce(p_sk_url, '')); v_cat text := sigarda.rapikan(p_catatan);
  v_id bigint; v_e jsonb; v_i int := 0; v_nama text; v_unsur text; v_jab text; v_ket text; v_ketua int := 0;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mencatat tim penilai.'; end if;
  if p_tahun_ajaran is null or p_tahun_ajaran !~ '^[0-9]{4}/[0-9]{4}$' then raise exception 'Tahun ajaran tidak sah.'; end if;
  if p_untuk is null or p_untuk not in ('putra', 'putri') then raise exception 'Tim penilai harus untuk putra atau putri.'; end if;
  if char_length(v_nomor) > 80 or v_nomor ~ '[[:cntrl:]<>]' then raise exception 'Nomor SK maksimal 80 karakter, tanpa tanda < atau >.'; end if;
  if (v_nomor = '') <> (p_tanggal_sk is null) then raise exception 'Nomor SK dan tanggal SK diisi berpasangan (keduanya atau tidak sama sekali).'; end if;
  if p_tanggal_sk is not null and (p_tanggal_sk < date '2000-01-01' or p_tanggal_sk > sigarda.hari_ini()) then raise exception 'Tanggal SK tidak boleh sebelum tahun 2000 atau di masa depan.'; end if;
  if v_url <> '' and (v_url !~* '^https?://' or char_length(v_url) > 500 or v_url ~ '[[:cntrl:][:space:]<>]') then raise exception 'Tautan SK harus berawalan http:// atau https:// (maksimal 500 karakter, tanpa spasi).'; end if;
  if char_length(v_cat) > 300 or v_cat ~ '[[:cntrl:]<>]' then raise exception 'Catatan maksimal 300 karakter, tanpa tanda < atau >.'; end if;
  if p_anggota is null or jsonb_typeof(p_anggota) <> 'array' or jsonb_array_length(p_anggota) not between 1 and 15 then raise exception 'Isi 1 sampai 15 anggota tim penilai.'; end if;
  for v_e in select * from jsonb_array_elements(p_anggota) loop
    v_i := v_i + 1;
    if jsonb_typeof(v_e) <> 'object' then raise exception 'Anggota tim nomor % tidak sah.', v_i; end if;
    v_nama := sigarda.rapikan(v_e ->> 'nama'); v_unsur := coalesce(v_e ->> 'unsur', ''); v_jab := coalesce(v_e ->> 'jabatan', 'anggota'); v_ket := sigarda.rapikan(v_e ->> 'keterangan');
    if char_length(v_nama) not between 1 and 80 or v_nama ~ '[[:cntrl:]<>]' then raise exception 'Nama anggota tim nomor % wajib diisi (maksimal 80 karakter, tanpa tanda < atau >).', v_i; end if;
    if v_unsur not in ('ketua_gudep', 'pembina', 'andalan_ranting', 'tokoh_masyarakat', 'orang_tua', 'lainnya') then raise exception 'Unsur anggota tim nomor % tidak dikenal.', v_i; end if;
    if v_jab not in ('ketua', 'anggota') then raise exception 'Jabatan anggota tim nomor % harus ketua atau anggota.', v_i; end if;
    if char_length(v_ket) > 120 or v_ket ~ '[[:cntrl:]<>]' then raise exception 'Keterangan anggota tim nomor % maksimal 120 karakter, tanpa tanda < atau >.', v_i; end if;
    if v_jab = 'ketua' then v_ketua := v_ketua + 1; end if;
  end loop;
  if v_ketua > 1 then raise exception 'Tim penilai hanya boleh punya satu ketua.'; end if;
  if p_id is null then
    if exists (select 1 from public.tim_penilai where tahun_ajaran = p_tahun_ajaran and untuk = p_untuk) then raise exception 'Tim penilai % untuk tahun ajaran % sudah ada; ubah yang sudah ada.', p_untuk, p_tahun_ajaran; end if;
    insert into public.tim_penilai (tahun_ajaran, untuk, nomor_sk, tanggal_sk, sk_url, catatan, dicatat_oleh, dicatat_pada)
    values (p_tahun_ajaran, p_untuk, v_nomor, p_tanggal_sk, v_url, v_cat, auth.uid(), now()) returning id into v_id;
  else
    if not exists (select 1 from public.tim_penilai where id = p_id) then raise exception 'Tim penilai tidak ditemukan.'; end if;
    if exists (select 1 from public.tim_penilai where tahun_ajaran = p_tahun_ajaran and untuk = p_untuk and id <> p_id) then raise exception 'Tim penilai % untuk tahun ajaran % sudah ada.', p_untuk, p_tahun_ajaran; end if;
    update public.tim_penilai set tahun_ajaran = p_tahun_ajaran, untuk = p_untuk, nomor_sk = v_nomor, tanggal_sk = p_tanggal_sk, sk_url = v_url, catatan = v_cat, dicatat_oleh = auth.uid(), dicatat_pada = now()
      where id = p_id returning id into v_id;
    delete from public.tim_penilai_anggota where tim_id = v_id;
  end if;
  v_i := 0;
  for v_e in select * from jsonb_array_elements(p_anggota) loop
    v_i := v_i + 1;
    insert into public.tim_penilai_anggota (tim_id, urut, nama, unsur, jabatan, keterangan)
    values (v_id, v_i, sigarda.rapikan(v_e ->> 'nama'), v_e ->> 'unsur', coalesce(v_e ->> 'jabatan', 'anggota'), sigarda.rapikan(v_e ->> 'keterangan'));
  end loop;
  return v_id;
end $$;

create or replace function public.sg_tim_penilai_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus tim penilai.'; end if;
  delete from public.tim_penilai where id = p_id;
  if not found then raise exception 'Tim penilai tidak ditemukan.'; end if;
end $$;

-- Mengisi (atau mengoreksi) satu tahap kalender Garuda dari Kwarcab. Mengembalikan id.
create or replace function public.sg_garuda_tahap_simpan(p_tahun_ajaran text, p_tahap text, p_mulai date, p_akhir date, p_catatan text default '') returns bigint
language plpgsql security definer set search_path = public as
$$
declare v_cat text := sigarda.rapikan(p_catatan); v_id bigint;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengisi kalender Garuda.'; end if;
  if p_tahun_ajaran is null or p_tahun_ajaran !~ '^[0-9]{4}/[0-9]{4}$' then raise exception 'Tahun ajaran tidak sah.'; end if;
  if p_tahap is null or p_tahap not in ('uji_spg', 'ajukan_tim', 'ambil_sk', 'penilaian_gudep', 'serah_kwarran', 'nilai_kwarran', 'kirim_kwarcab', 'verifikasi_visitasi', 'iuran', 'pelantikan') then raise exception 'Tahap tidak dikenal.'; end if;
  if p_mulai is null then raise exception 'Tanggal mulai wajib diisi.'; end if;
  if p_mulai < date '2000-01-01' or p_mulai > date '2100-12-31' then raise exception 'Tanggal mulai tidak sah.'; end if;
  if p_akhir is not null and (p_akhir < p_mulai or p_akhir > date '2100-12-31') then raise exception 'Tanggal akhir tidak boleh sebelum tanggal mulai.'; end if;
  if char_length(v_cat) > 200 or v_cat ~ '[[:cntrl:]<>]' then raise exception 'Catatan maksimal 200 karakter, tanpa tanda < atau >.'; end if;
  insert into public.garuda_tahap (tahun_ajaran, tahap, mulai, akhir, catatan, dicatat_oleh, dicatat_pada)
  values (p_tahun_ajaran, p_tahap, p_mulai, p_akhir, v_cat, auth.uid(), now())
  on conflict (tahun_ajaran, tahap) do update set mulai = excluded.mulai, akhir = excluded.akhir, catatan = excluded.catatan, dicatat_oleh = excluded.dicatat_oleh, dicatat_pada = excluded.dicatat_pada
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.sg_garuda_tahap_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus tahap kalender Garuda.'; end if;
  delete from public.garuda_tahap where id = p_id;
  if not found then raise exception 'Tahap kalender tidak ditemukan.'; end if;
end $$;
-- ===== akhir aksi tim kalender =====

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
      'garuda_tahap', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.garuda_tahap t)
    )
  ) into v_hasil;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada)
    values ('cadangan.terakhir', jsonb_build_object('pada', now(), 'oleh', (select nama from public.profiles where id = auth.uid())), auth.uid(), now())
    on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
  return v_hasil;
end $$;

revoke all on function
  public.sg_tim_penilai_simpan(bigint, text, text, text, date, text, text, jsonb), public.sg_tim_penilai_hapus(bigint),
  public.sg_garuda_tahap_simpan(text, text, date, date, text), public.sg_garuda_tahap_hapus(bigint)
  from public, anon, authenticated;
grant execute on function
  public.sg_tim_penilai_simpan(bigint, text, text, text, date, text, text, jsonb), public.sg_tim_penilai_hapus(bigint),
  public.sg_garuda_tahap_simpan(text, text, date, date, text), public.sg_garuda_tahap_hapus(bigint)
  to authenticated;

commit;
notify pgrst, 'reload schema';
