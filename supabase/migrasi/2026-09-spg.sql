-- ============================================================================
-- MIGRASI: Tahap 2 (G3) -- penetapan Syarat Pramuka Garuda (SPG, 13 butir). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-tkk-penguji.sql; lihat README). Isi:
--   * Tabel public.spg_penetapan (satu baris per Penegak per butir 1-13: nilai 100/0, tanggal pengujian, catatan, tanda penimpaan hasil hitung aplikasi yang wajib beralasan).
--     RLS baca: pemilik dan pengurus; tulis hanya lewat fungsi. Pemicu tolak_peserta_tak_aktif (nonaktif/alumni tidak dapat diubah).
--   * Fungsi baru (Pembina dan Admin Gudep): sg_spg_catat (Penegak aktif yang telah menyelesaikan seluruh SKU Bantara dan Laksana), sg_spg_hapus.
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
  if to_regclass('public.tkk_pengajuan') is null or to_regclass('public.pelantikan') is null or to_regprocedure('sigarda.layak_garuda(uuid)') is null
     or (select count(*) from pg_attribute where attrelid = 'public.tkk_pengajuan'::regclass and attname = 'penguji1_id' and not attisdropped) = 0 then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-tkk-penguji.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== SPG (Tahap 2, G3): tabel =====
-- Penetapan Syarat Pramuka Garuda (SPG, 13 butir SK Kwarnas 038/2017) oleh Pembina: satu baris per Penegak per butir. Butir yang dapat dihitung dari data aplikasi (SKU Laksana
-- dan 3 bulan sesudah dilantik, TKK, Saka, Penabung) dihitung di klien; baris ini mencatat PENETAPAN Pembina: butir berbasis dokumen (lengkap = 100, belum = 0) dan penimpaan
-- hasil hitung otomatis (timpa = true, alasan di catatan). Tanggal = tanggal pengujian pada lembar SPG. Isi rubrik pengujian TIDAK disimpan di sini.
create table if not exists public.spg_penetapan (
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  butir smallint not null check (butir between 1 and 13),
  nilai smallint not null check (nilai in (0, 100)),
  tanggal date not null check (tanggal >= date '2000-01-01'),
  catatan text not null default '' check (char_length(catatan) <= 200),
  timpa boolean not null default false,
  dicatat_oleh uuid references public.profiles(id) on delete set null,
  dicatat_pada timestamptz not null default now(),
  primary key (peserta_id, butir),
  constraint spg_timpa_beralasan check (not timpa or char_length(btrim(catatan)) >= 5)
);
-- ===== akhir tabel spg =====

alter table public.spg_penetapan enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (baca saja lewat kebijakan; tulis hanya lewat fungsi).
revoke all on public.spg_penetapan from anon, authenticated;
grant select on public.spg_penetapan to authenticated;
-- ===== SPG (Tahap 2, G3): kebijakan =====
-- Penetapan SPG: Penegak melihat miliknya sendiri, pengurus semua.
drop policy if exists baca_spg_penetapan on public.spg_penetapan;
create policy baca_spg_penetapan on public.spg_penetapan for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
-- ===== akhir kebijakan spg =====

-- ===== SPG (Tahap 2, G3): pemicu =====
drop trigger if exists tak_aktif_spg_penetapan on public.spg_penetapan;
create trigger tak_aktif_spg_penetapan before insert or update on public.spg_penetapan for each row execute function sigarda.tolak_peserta_tak_aktif();
-- ===== akhir pemicu spg =====

-- ===== SPG (Tahap 2, G3): aksi =====
-- Hanya Pembina dan Admin Gudep yang menetapkan (Pembina menguji SPG; Dewan hanya membaca). Penegak harus aktif dan sudah menyelesaikan seluruh SKU Bantara dan Laksana
-- (sigarda.layak_garuda). Menetapkan ulang butir yang sama = koreksi. Penetapan yang berbeda dari hasil hitung aplikasi (p_timpa) wajib beralasan di catatan; server tidak
-- menghitung ulang hasil aplikasi (dihitung di klien), jadi p_timpa dipercaya sebatas tanda dan alasan.

create or replace function public.sg_spg_catat(
  p_peserta_id uuid, p_butir integer, p_nilai integer, p_tanggal date, p_catatan text default '', p_timpa boolean default false
) returns void language plpgsql security definer set search_path = public as
$$
declare v_p public.profiles; v_cat text := sigarda.rapikan(p_catatan);
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menetapkan Syarat Pramuka Garuda.'; end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Pilih Penegak.'; end if;
  if v_p.status <> 'aktif' then raise exception '% tidak aktif; Syarat Pramuka Garuda hanya untuk Penegak aktif.', v_p.nama; end if;
  if not sigarda.layak_garuda(p_peserta_id) then raise exception '% belum menyelesaikan seluruh SKU Bantara dan Laksana.', v_p.nama; end if;
  if p_butir is null or p_butir not between 1 and 13 then raise exception 'Butir SPG harus 1 sampai 13.'; end if;
  if p_nilai is null or p_nilai not in (0, 100) then raise exception 'Nilai harus 100 (lengkap dan memenuhi) atau 0 (belum).'; end if;
  if p_tanggal is null then raise exception 'Tanggal pengujian wajib diisi.'; end if;
  if p_tanggal < date '2000-01-01' or p_tanggal > sigarda.hari_ini() then raise exception 'Tanggal pengujian tidak boleh sebelum tahun 2000 atau di masa depan.'; end if;
  if char_length(v_cat) > 200 or v_cat ~ '[[:cntrl:]<>]' then raise exception 'Catatan maksimal 200 karakter, tanpa tanda < atau >.'; end if;
  if coalesce(p_timpa, false) and char_length(v_cat) < 5 then raise exception 'Penetapan berbeda dari hasil aplikasi: tulis alasannya di catatan (sedikitnya 5 karakter).'; end if;
  insert into public.spg_penetapan (peserta_id, butir, nilai, tanggal, catatan, timpa, dicatat_oleh, dicatat_pada)
  values (p_peserta_id, p_butir, p_nilai, p_tanggal, v_cat, coalesce(p_timpa, false), auth.uid(), now())
  on conflict (peserta_id, butir) do update
    set nilai = excluded.nilai, tanggal = excluded.tanggal, catatan = excluded.catatan, timpa = excluded.timpa, dicatat_oleh = excluded.dicatat_oleh, dicatat_pada = excluded.dicatat_pada;
end $$;

-- Menghapus penetapan satu butir (kembali ke hasil hitung aplikasi atau "menunggu ditetapkan").
create or replace function public.sg_spg_hapus(p_peserta_id uuid, p_butir integer) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus penetapan SPG.'; end if;
  delete from public.spg_penetapan where peserta_id = p_peserta_id and butir = p_butir;
  if not found then raise exception 'Penetapan SPG tidak ditemukan.'; end if;
end $$;
-- ===== akhir aksi spg =====

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
      'spg_penetapan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.spg_penetapan t)
    )
  ) into v_hasil;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada)
    values ('cadangan.terakhir', jsonb_build_object('pada', now(), 'oleh', (select nama from public.profiles where id = auth.uid())), auth.uid(), now())
    on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
  return v_hasil;
end $$;

revoke all on function
  public.sg_spg_catat(uuid, integer, integer, date, text, boolean), public.sg_spg_hapus(uuid, integer)
  from public, anon, authenticated;
grant execute on function
  public.sg_spg_catat(uuid, integer, integer, date, text, boolean), public.sg_spg_hapus(uuid, integer)
  to authenticated;

commit;
notify pgrst, 'reload schema';
