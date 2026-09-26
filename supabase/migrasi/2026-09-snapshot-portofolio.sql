-- ============================================================================
-- MIGRASI: Tahap 3 (H3) -- salinan beku Portofolio format Kwarcab. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-isian-penegak.sql; lihat README). Isi:
--   * Tabel public.portofolio_snapshot (salinan beku dokumen satu Penegak saat dicetak atau dikirim ke Kwarcab: seluruh data pembentuk dokumen disimpan apa adanya).
--     RLS baca: Pembina dan Admin; tulis hanya lewat fungsi.
--   * Fungsi baru (Pembina dan Admin Gudep): sg_portofolio_snapshot_simpan (paling banyak 600 kB dan 20 salinan per Penegak) dan sg_portofolio_snapshot_hapus.
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
  if to_regclass('public.penegak_isian') is null or to_regclass('public.dokumen_templat') is null or to_regprocedure('public.sg_isian_saya_simpan(jsonb)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-isian-penegak.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Salinan beku portofolio (Tahap 3, H3): tabel =====
-- Salinan beku Portofolio format Kwarcab satu Penegak pada saat dicetak atau dikirim ke Kwarcab: seluruh data yang membentuk dokumen (identitas, TKK, SPG, isian data diri,
-- rubrik surat guru, data gudep) disimpan apa adanya, sehingga dokumen yang sama dapat dibuka lagi meski data aplikasi kemudian berubah. Dibuat dan dihapus Pembina atau Admin;
-- dibaca Pembina dan Admin (memuat data pribadi Penegak).
create table if not exists public.portofolio_snapshot (
  id bigint generated always as identity primary key,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  tahun_ajaran text not null check (tahun_ajaran ~ '^\d{4}/\d{4}$'),
  catatan text not null default '' check (char_length(catatan) <= 200 and catatan !~ '[[:cntrl:]<>]'),
  isi jsonb not null check (jsonb_typeof(isi) = 'object'),
  dibuat_oleh uuid references public.profiles(id) on delete set null,
  dibuat_oleh_nama text not null default '',
  dibuat_pada timestamptz not null default now()
);
create index if not exists portofolio_snapshot_peserta_idx on public.portofolio_snapshot (peserta_id, dibuat_pada desc);
-- ===== akhir tabel salinan beku portofolio =====

alter table public.portofolio_snapshot enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (baca saja lewat kebijakan; tulis hanya lewat fungsi).
revoke all on public.portofolio_snapshot from anon, authenticated;
grant select on public.portofolio_snapshot to authenticated;
drop policy if exists baca_portofolio_snapshot on public.portofolio_snapshot;
create policy baca_portofolio_snapshot on public.portofolio_snapshot for select to authenticated using ((select sigarda.pembina_atau_admin()));

-- ===== Salinan beku portofolio (Tahap 3, H3): aksi =====
-- Menyimpan salinan beku Portofolio format Kwarcab satu Penegak (Pembina dan Admin). p_isi = objek yang memuat `peserta` (id harus sama dengan p_peserta_id) dan `hari`; paling
-- banyak 600 kB dan 20 salinan per Penegak. Mengembalikan id salinan.
create or replace function public.sg_portofolio_snapshot_simpan(p_peserta_id uuid, p_catatan text, p_isi jsonb) returns bigint language plpgsql security definer set search_path = public as
$$
declare v_p public.profiles; v_cat text := sigarda.rapikan(p_catatan); v_id bigint; v_oleh text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat membuat salinan beku portofolio.'; end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Pilih Penegak.'; end if;
  if char_length(v_cat) > 200 or v_cat ~ '[[:cntrl:]<>]' then raise exception 'Catatan maksimal 200 karakter dan tanpa karakter khusus.'; end if;
  if p_isi is null or jsonb_typeof(p_isi) <> 'object' then raise exception 'Isi salinan tidak sah.'; end if;
  if coalesce(jsonb_typeof(p_isi -> 'peserta'), '') <> 'object' or coalesce(p_isi #>> '{peserta,id}', '') <> p_peserta_id::text or coalesce(jsonb_typeof(p_isi -> 'hari'), '') <> 'string' then
    raise exception 'Isi salinan tidak sesuai dengan Penegak yang dipilih.';
  end if;
  if octet_length(p_isi::text) > 600000 then raise exception 'Isi salinan terlalu besar (maksimal 600 kB).'; end if;
  if (select count(*) from public.portofolio_snapshot where peserta_id = p_peserta_id) >= 20 then
    raise exception 'Sudah ada 20 salinan beku untuk Penegak ini. Hapus yang tidak diperlukan lebih dulu.';
  end if;
  select nama into v_oleh from public.profiles where id = auth.uid();
  insert into public.portofolio_snapshot (peserta_id, tahun_ajaran, catatan, isi, dibuat_oleh, dibuat_oleh_nama)
  values (p_peserta_id, sigarda.tahun_ajaran_kini(), v_cat, p_isi, auth.uid(), coalesce(v_oleh, '')) returning id into v_id;
  return v_id;
end $$;

create or replace function public.sg_portofolio_snapshot_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus salinan beku portofolio.'; end if;
  delete from public.portofolio_snapshot where id = p_id;
end $$;
-- ===== akhir aksi salinan beku portofolio =====

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
      'portofolio_snapshot', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.portofolio_snapshot t)
    )
  ) into v_hasil;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada)
    values ('cadangan.terakhir', jsonb_build_object('pada', now(), 'oleh', (select nama from public.profiles where id = auth.uid())), auth.uid(), now())
    on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
  return v_hasil;
end $$;

revoke all on function
  public.sg_portofolio_snapshot_simpan(uuid, text, jsonb), public.sg_portofolio_snapshot_hapus(bigint)
  from public, anon, authenticated;
grant execute on function
  public.sg_portofolio_snapshot_simpan(uuid, text, jsonb), public.sg_portofolio_snapshot_hapus(bigint)
  to authenticated;

commit;
notify pgrst, 'reload schema';
