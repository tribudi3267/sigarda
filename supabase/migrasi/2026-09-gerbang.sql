-- ============================================================================
-- MIGRASI: Tahap 2 (G4) -- gerbang calon Garuda (tanggal lahir dan aturan gerbang). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-spg.sql; lihat README). Isi:
--   * Tabel public.tanggal_lahir (satu baris per Penegak; tabel terpisah dari profiles agar tidak terbaca Penegak lain). RLS baca: pemilik dan pengurus; tulis hanya lewat fungsi.
--     Pemicu tolak_peserta_tak_aktif (nonaktif/alumni tidak dapat diubah).
--   * Aturan gerbang bawaan pada pengaturan 'garuda.gerbang' (kelas minimal XI, lahir 2007-11-01 s.d. 2009-05-01, kuota 5%; tidak menimpa bila sudah ada).
--   * Fungsi baru (Pembina dan Admin Gudep): sg_tanggal_lahir_atur, sg_gerbang_simpan.
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
  if to_regclass('public.spg_penetapan') is null or to_regclass('public.pengaturan') is null or to_regprocedure('sigarda.tolak_peserta_tak_aktif()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-spg.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Gerbang calon Garuda (Tahap 2, G4): tabel =====
-- Tanggal lahir Penegak untuk memeriksa syarat usia Calon Garuda (pedoman Kwarcab Purbalingga 2026: usia 16-20 tahun). Sengaja TABEL TERPISAH, bukan kolom profiles: RLS profil
-- memperlihatkan Penegak berjabatan Dewan kepada semua Penegak, sedangkan tanggal lahir hanya boleh dibaca pemilik dan pengurus. Dicatat Pembina atau Admin (sg_tanggal_lahir_atur).
create table if not exists public.tanggal_lahir (
  peserta_id uuid primary key references public.profiles(id) on delete cascade,
  tanggal date not null check (tanggal >= date '1990-01-01'),
  dicatat_oleh uuid references public.profiles(id) on delete set null,
  dicatat_pada timestamptz not null default now()
);

-- Aturan gerbang calon (pengaturan 'garuda.gerbang'; diperbarui tiap tahun oleh Pembina atau Admin): kelas minimal, rentang tanggal lahir yang sah, dan kuota calon
-- sebagai persen dari Penegak aktif. Bawaan sama dengan GERBANG_BAWAAN di src/lib/gerbangLogic.js (dijaga uji/gerbang-klien.mjs).
insert into public.pengaturan (kunci, nilai) values ('garuda.gerbang',
  '{"kelasMin": "XI", "lahirDari": "2007-11-01", "lahirSampai": "2009-05-01", "kuotaPersen": 5}'::jsonb)
on conflict (kunci) do nothing;
-- ===== akhir tabel gerbang =====

alter table public.tanggal_lahir enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (baca saja lewat kebijakan; tulis hanya lewat fungsi).
revoke all on public.tanggal_lahir from anon, authenticated;
grant select on public.tanggal_lahir to authenticated;
-- ===== Gerbang calon Garuda (Tahap 2, G4): kebijakan =====
-- Tanggal lahir: Penegak melihat miliknya sendiri, pengurus semua (tabel terpisah dari profiles agar tidak terbaca Penegak lain).
drop policy if exists baca_tanggal_lahir on public.tanggal_lahir;
create policy baca_tanggal_lahir on public.tanggal_lahir for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
-- ===== akhir kebijakan gerbang =====

-- ===== Gerbang calon Garuda (Tahap 2, G4): pemicu =====
drop trigger if exists tak_aktif_tanggal_lahir on public.tanggal_lahir;
create trigger tak_aktif_tanggal_lahir before insert or update on public.tanggal_lahir for each row execute function sigarda.tolak_peserta_tak_aktif();
-- ===== akhir pemicu gerbang =====

-- ===== Gerbang calon Garuda (Tahap 2, G4): aksi =====
-- Gerbang calon hanya PERINGATAN (keputusan pemilik 25 Sep 2026): kelas, usia, dan kuota dihitung dan ditampilkan di klien; server tidak memblokir pendaftaran Calon Garuda.
-- Server hanya menyimpan tanggal lahir dan aturan gerbang. Keduanya oleh Pembina atau Admin Gudep.

-- Mengisi (atau mengoreksi) tanggal lahir satu Penegak aktif; tanggal kosong = menghapus catatan.
create or replace function public.sg_tanggal_lahir_atur(p_peserta_id uuid, p_tanggal date) returns void language plpgsql security definer set search_path = public as
$$
declare v_p public.profiles;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengisi tanggal lahir.'; end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Pilih Penegak.'; end if;
  if v_p.status <> 'aktif' then raise exception '% tidak aktif; tanggal lahir hanya diisi untuk Penegak aktif.', v_p.nama; end if;
  if p_tanggal is null then
    delete from public.tanggal_lahir where peserta_id = p_peserta_id;
    return;
  end if;
  if p_tanggal < date '1990-01-01' or p_tanggal > sigarda.hari_ini() then raise exception 'Tanggal lahir tidak boleh sebelum tahun 1990 atau di masa depan.'; end if;
  insert into public.tanggal_lahir (peserta_id, tanggal, dicatat_oleh, dicatat_pada) values (p_peserta_id, p_tanggal, auth.uid(), now())
  on conflict (peserta_id) do update set tanggal = excluded.tanggal, dicatat_oleh = excluded.dicatat_oleh, dicatat_pada = excluded.dicatat_pada;
end $$;

-- Aturan gerbang calon (pengaturan 'garuda.gerbang'): { kelasMin: 'X'|'XI'|'XII', lahirDari, lahirSampai ('YYYY-MM-DD', dari <= sampai), kuotaPersen: bilangan bulat 0-100 }.
create or replace function public.sg_gerbang_simpan(p_nilai jsonb) returns void language plpgsql security definer set search_path = public as
$$
declare v_dari date; v_sampai date; v_kuota int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah aturan gerbang calon.'; end if;
  if p_nilai is null or jsonb_typeof(p_nilai) <> 'object' or p_nilai - 'kelasMin' - 'lahirDari' - 'lahirSampai' - 'kuotaPersen' <> '{}'::jsonb then raise exception 'Bentuk aturan gerbang tidak sah.'; end if;
  -- coalesce: kunci yang hilang menghasilkan NULL, dan perbandingan dengan NULL tidak akan memicu galat
  if coalesce(jsonb_typeof(p_nilai -> 'kelasMin'), '') <> 'string' or coalesce(jsonb_typeof(p_nilai -> 'lahirDari'), '') <> 'string'
     or coalesce(jsonb_typeof(p_nilai -> 'lahirSampai'), '') <> 'string' or coalesce(jsonb_typeof(p_nilai -> 'kuotaPersen'), '') <> 'number' then raise exception 'Bentuk aturan gerbang tidak sah.'; end if;
  if (p_nilai ->> 'kelasMin') not in ('X', 'XI', 'XII') then raise exception 'Kelas minimal harus X, XI, atau XII.'; end if;
  if (p_nilai ->> 'lahirDari') !~ '^\d{4}-\d{2}-\d{2}$' or (p_nilai ->> 'lahirSampai') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Tanggal lahir harus berbentuk TTTT-BB-HH.'; end if;
  begin
    v_dari := (p_nilai ->> 'lahirDari')::date; v_sampai := (p_nilai ->> 'lahirSampai')::date;
  exception when others then raise exception 'Tanggal lahir tidak sah.';
  end;
  if v_dari < date '1990-01-01' or v_sampai > date '2030-12-31' then raise exception 'Rentang tanggal lahir harus antara tahun 1990 dan 2030.'; end if;
  if v_dari > v_sampai then raise exception 'Tanggal lahir awal tidak boleh sesudah tanggal akhir.'; end if;
  if (p_nilai ->> 'kuotaPersen') !~ '^[0-9]+$' then raise exception 'Kuota harus bilangan bulat 0 sampai 100 persen.'; end if;
  v_kuota := (p_nilai ->> 'kuotaPersen')::int;
  if v_kuota > 100 then raise exception 'Kuota harus bilangan bulat 0 sampai 100 persen.'; end if;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada)
  values ('garuda.gerbang', jsonb_build_object('kelasMin', p_nilai ->> 'kelasMin', 'lahirDari', to_char(v_dari, 'YYYY-MM-DD'), 'lahirSampai', to_char(v_sampai, 'YYYY-MM-DD'), 'kuotaPersen', v_kuota), auth.uid(), now())
  on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;
-- ===== akhir aksi gerbang =====

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
      'sesi_ujian_peserta', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sesi_ujian_peserta t),
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
      'tanggal_lahir', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tanggal_lahir t)
    )
  ) into v_hasil;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada)
    values ('cadangan.terakhir', jsonb_build_object('pada', now(), 'oleh', (select nama from public.profiles where id = auth.uid())), auth.uid(), now())
    on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
  return v_hasil;
end $$;

revoke all on function
  public.sg_tanggal_lahir_atur(uuid, date), public.sg_gerbang_simpan(jsonb)
  from public, anon, authenticated;
grant execute on function
  public.sg_tanggal_lahir_atur(uuid, date), public.sg_gerbang_simpan(jsonb)
  to authenticated;

commit;
notify pgrst, 'reload schema';
