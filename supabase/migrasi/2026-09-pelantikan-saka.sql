-- ============================================================================
-- MIGRASI: Tahap 2 (G1) -- pencatatan pelantikan Bantara/Laksana dan keanggotaan Saka. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-integrasi-pra-uji.sql; lihat README). Isi:
--   * Tabel public.pelantikan (satu baris per Penegak per tingkat: tanggal, tempat, kegiatan Agenda opsional) dan public.saka_anggota (satu baris per Penegak per Saka:
--     tanggal masuk, status aktif/selesai, tautan surat keterangan). RLS baca: pemilik dan pengurus; tulis hanya lewat fungsi. Pemicu tolak_peserta_tak_aktif (nonaktif/alumni
--     tidak dapat diubah).
--   * Fungsi baru (Pembina dan Admin Gudep): sg_pelantikan_catat (banyak Penegak sekaligus, semua atau tidak sama sekali; Penegak harus aktif dan sudah menyelesaikan seluruh
--     butir SKU tingkat itu; tanggal bukan masa depan), sg_pelantikan_hapus, sg_saka_simpan, sg_saka_hapus.
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
  if to_regclass('public.agenda') is null or to_regclass('public.sku_pra_uji') is null or to_regprocedure('sigarda.tolak_peserta_tak_aktif()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-integrasi-pra-uji.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Pelantikan dan Saka (Tahap 2, G1): tabel =====
-- Pelantikan Penegak Bantara dan Laksana (penyematan TKU) dan keanggotaan Saka (Satuan Karya). Data inti untuk syarat Garuda dan formulir daftar isian Kwarcab
-- (tempat dan tanggal pelantikan, surat keterangan aktif Saka). Dicatat Pembina atau Admin Gudep; dibaca pemilik dan pengurus (RLS baca); tulis hanya lewat fungsi sg_*.
create table if not exists public.pelantikan (
  id bigint generated always as identity primary key,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  tingkat text not null check (tingkat in ('bantara','laksana')),
  tanggal date not null check (tanggal >= date '2000-01-01'),
  tempat text not null check (char_length(btrim(tempat)) between 1 and 120),
  agenda_id bigint references public.agenda(id) on delete set null,          -- kegiatan pelantikan di Agenda (opsional)
  catatan text not null default '' check (char_length(catatan) <= 200),
  dicatat_oleh uuid references public.profiles(id) on delete set null,
  dicatat_pada timestamptz not null default now(),
  constraint pelantikan_satu_per_tingkat unique (peserta_id, tingkat)
);
create index if not exists pelantikan_tanggal_idx on public.pelantikan (tanggal);
create index if not exists pelantikan_agenda_idx on public.pelantikan (agenda_id);

create table if not exists public.saka_anggota (
  id bigint generated always as identity primary key,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  saka text not null check (char_length(btrim(saka)) between 1 and 60),                -- nama Saka, isian bebas (saran di layar)
  tanggal_masuk date not null check (tanggal_masuk >= date '2000-01-01'),
  status text not null default 'aktif' check (status in ('aktif','selesai')),
  tanggal_selesai date,
  surat_url text not null default '' check (surat_url = '' or (surat_url ~* '^https?://' and char_length(surat_url) <= 500)),   -- tautan surat keterangan aktif Saka
  catatan text not null default '' check (char_length(catatan) <= 200),
  dicatat_oleh uuid references public.profiles(id) on delete set null,
  dicatat_pada timestamptz not null default now(),
  constraint saka_selesai_konsisten check ((status = 'aktif' and tanggal_selesai is null) or (status = 'selesai' and tanggal_selesai is not null and tanggal_selesai >= tanggal_masuk))
);
create unique index if not exists saka_peserta_unik on public.saka_anggota (peserta_id, lower(btrim(saka)));
-- ===== akhir tabel pelantikan dan saka =====

alter table public.pelantikan enable row level security;
alter table public.saka_anggota enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (baca saja lewat kebijakan; tulis hanya lewat fungsi).
revoke all on public.pelantikan, public.saka_anggota from anon, authenticated;
grant select on public.pelantikan, public.saka_anggota to authenticated;
-- ===== Pelantikan dan Saka (Tahap 2, G1): kebijakan =====
-- Pelantikan dan keanggotaan Saka: Penegak melihat miliknya sendiri, pengurus (Pembina, Dewan, Admin) semua.
drop policy if exists baca_pelantikan on public.pelantikan;
create policy baca_pelantikan on public.pelantikan for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
drop policy if exists baca_saka_anggota on public.saka_anggota;
create policy baca_saka_anggota on public.saka_anggota for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
-- ===== akhir kebijakan pelantikan dan saka =====

-- ===== Pelantikan dan Saka (Tahap 2, G1): pemicu =====
drop trigger if exists tak_aktif_pelantikan on public.pelantikan;
create trigger tak_aktif_pelantikan before insert or update on public.pelantikan for each row execute function sigarda.tolak_peserta_tak_aktif();
drop trigger if exists tak_aktif_saka_anggota on public.saka_anggota;
create trigger tak_aktif_saka_anggota before insert or update on public.saka_anggota for each row execute function sigarda.tolak_peserta_tak_aktif();
-- ===== akhir pemicu pelantikan dan saka =====

-- ===== Pelantikan dan Saka (Tahap 2, G1): aksi =====
-- Hanya Pembina dan Admin Gudep yang mencatat (Pembina yang langsung membina menentukan kelayakan; Dewan hanya melihat). Pelantikan dicatat SESUDAH terjadi: tanggal tidak boleh
-- di masa depan (rencana kegiatan ada di Agenda). Penegak harus aktif dan sudah menyelesaikan SEMUA butir SKU tingkat itu (sigarda.tingkat_selesai; cermin klien
-- skuLogic.tingkatSelesai). Mencatat ulang Penegak yang sudah tercatat pada tingkat itu MENGGANTI catatannya (koreksi tanggal/tempat).

-- Mencatat pelantikan untuk banyak Penegak sekaligus (satu upacara): semua atau tidak sama sekali. Mengembalikan jumlah Penegak yang dicatat.
create or replace function public.sg_pelantikan_catat(
  p_tingkat text, p_tanggal date, p_tempat text, p_peserta_ids uuid[], p_agenda_id bigint default null, p_catatan text default ''
) returns integer language plpgsql security definer set search_path = public as
$$
declare
  v_tempat text := sigarda.rapikan(p_tempat); v_cat text := sigarda.rapikan(p_catatan); v_ids uuid[]; v_id uuid; v_p public.profiles; v_tk text; v_bantara date; v_n int := 0;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mencatat pelantikan.'; end if;
  if p_tingkat is null or p_tingkat not in ('bantara','laksana') then raise exception 'Tingkat pelantikan harus Bantara atau Laksana.'; end if;
  if p_tanggal is null then raise exception 'Tanggal pelantikan wajib diisi.'; end if;
  if p_tanggal < date '2000-01-01' or p_tanggal > sigarda.hari_ini() then raise exception 'Tanggal pelantikan tidak boleh sebelum tahun 2000 atau di masa depan. Catat pelantikan sesudah terlaksana.'; end if;
  if char_length(v_tempat) not between 1 and 120 or v_tempat ~ '[[:cntrl:]<>]' then raise exception 'Tempat pelantikan wajib diisi (maksimal 120 karakter, tanpa tanda < atau >).'; end if;
  if char_length(v_cat) > 200 or v_cat ~ '[[:cntrl:]<>]' then raise exception 'Catatan maksimal 200 karakter, tanpa tanda < atau >.'; end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_peserta_ids, '{}')) x;
  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'Pilih sedikitnya satu Penegak.'; end if;
  if array_length(v_ids, 1) > 200 then raise exception 'Maksimal 200 Penegak sekali catat.'; end if;
  if p_agenda_id is not null and not exists (select 1 from public.agenda where id = p_agenda_id and jenis = 'pelantikan_' || p_tingkat) then
    raise exception 'Kegiatan Agenda yang dipilih bukan pelantikan %.', initcap(p_tingkat);
  end if;
  v_tk := case p_tingkat when 'bantara' then 'Bantara' else 'Laksana' end;
  foreach v_id in array v_ids loop
    select * into v_p from public.profiles where id = v_id and role = 'peserta';
    if not found then raise exception 'Ada anggota yang bukan Penegak.'; end if;
    if v_p.status <> 'aktif' then raise exception '% tidak aktif; pelantikan hanya untuk Penegak aktif.', v_p.nama; end if;
    if not sigarda.tingkat_selesai(v_id, v_tk) then raise exception '% belum menyelesaikan seluruh butir SKU %.', v_p.nama, v_tk; end if;
    if p_tingkat = 'laksana' then
      select tanggal into v_bantara from public.pelantikan where peserta_id = v_id and tingkat = 'bantara';
      if v_bantara is not null and p_tanggal <= v_bantara then raise exception 'Pelantikan Laksana % harus sesudah pelantikan Bantaranya (%).', v_p.nama, to_char(v_bantara, 'YYYY-MM-DD'); end if;
    end if;
    insert into public.pelantikan (peserta_id, tingkat, tanggal, tempat, agenda_id, catatan, dicatat_oleh, dicatat_pada)
    values (v_id, p_tingkat, p_tanggal, v_tempat, p_agenda_id, v_cat, auth.uid(), now())
    on conflict (peserta_id, tingkat) do update
      set tanggal = excluded.tanggal, tempat = excluded.tempat, agenda_id = excluded.agenda_id, catatan = excluded.catatan, dicatat_oleh = excluded.dicatat_oleh, dicatat_pada = excluded.dicatat_pada;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Menghapus satu catatan pelantikan (salah Penegak atau salah tingkat).
create or replace function public.sg_pelantikan_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus catatan pelantikan.'; end if;
  delete from public.pelantikan where id = p_id;
  if not found then raise exception 'Catatan pelantikan tidak ditemukan.'; end if;
end $$;

-- Keanggotaan Saka: tambah (p_id null) atau ubah. Satu Penegak boleh di beberapa Saka, tetapi satu catatan per nama Saka. Status 'aktif' (tanpa tanggal selesai) atau 'selesai'.
create or replace function public.sg_saka_simpan(
  p_id bigint, p_peserta_id uuid, p_saka text, p_tanggal_masuk date, p_status text, p_tanggal_selesai date, p_surat_url text default '', p_catatan text default ''
) returns bigint language plpgsql security definer set search_path = public as
$$
declare
  v_saka text := sigarda.rapikan(p_saka); v_url text := btrim(coalesce(p_surat_url, '')); v_cat text := sigarda.rapikan(p_catatan); v_p public.profiles; v_hasil bigint;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mencatat keanggotaan Saka.'; end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Pilih Penegak.'; end if;
  if v_p.status <> 'aktif' then raise exception '% tidak aktif; keanggotaan Saka hanya dicatat untuk Penegak aktif.', v_p.nama; end if;
  if char_length(v_saka) not between 1 and 60 or v_saka ~ '[[:cntrl:]<>]' then raise exception 'Nama Saka wajib diisi (maksimal 60 karakter, tanpa tanda < atau >).'; end if;
  if p_tanggal_masuk is null then raise exception 'Tanggal masuk Saka wajib diisi.'; end if;
  if p_tanggal_masuk < date '2000-01-01' or p_tanggal_masuk > sigarda.hari_ini() then raise exception 'Tanggal masuk Saka tidak boleh sebelum tahun 2000 atau di masa depan.'; end if;
  if p_status is null or p_status not in ('aktif','selesai') then raise exception 'Status Saka harus aktif atau selesai.'; end if;
  if p_status = 'aktif' and p_tanggal_selesai is not null then raise exception 'Anggota Saka yang masih aktif tidak punya tanggal selesai.'; end if;
  if p_status = 'selesai' and (p_tanggal_selesai is null or p_tanggal_selesai < p_tanggal_masuk or p_tanggal_selesai > sigarda.hari_ini()) then
    raise exception 'Isi tanggal selesai (tidak sebelum tanggal masuk dan tidak di masa depan).';
  end if;
  if v_url <> '' and (v_url !~* '^https?://' or char_length(v_url) > 500 or v_url ~ '[[:cntrl:][:space:]<>]') then raise exception 'Tautan surat keterangan harus berawalan http:// atau https:// (maksimal 500 karakter, tanpa spasi).'; end if;
  if char_length(v_cat) > 200 or v_cat ~ '[[:cntrl:]<>]' then raise exception 'Catatan maksimal 200 karakter, tanpa tanda < atau >.'; end if;
  begin
    if p_id is null then
      insert into public.saka_anggota (peserta_id, saka, tanggal_masuk, status, tanggal_selesai, surat_url, catatan, dicatat_oleh)
      values (p_peserta_id, v_saka, p_tanggal_masuk, p_status, p_tanggal_selesai, v_url, v_cat, auth.uid()) returning id into v_hasil;
    else
      update public.saka_anggota set peserta_id = p_peserta_id, saka = v_saka, tanggal_masuk = p_tanggal_masuk, status = p_status, tanggal_selesai = p_tanggal_selesai,
        surat_url = v_url, catatan = v_cat, dicatat_oleh = auth.uid(), dicatat_pada = now()
      where id = p_id returning id into v_hasil;
      if v_hasil is null then raise exception 'Catatan Saka tidak ditemukan.'; end if;
    end if;
  exception when unique_violation then
    raise exception '% sudah tercatat di Saka %. Ubah catatan yang ada.', v_p.nama, v_saka;
  end;
  return v_hasil;
end $$;

create or replace function public.sg_saka_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus catatan Saka.'; end if;
  delete from public.saka_anggota where id = p_id;
  if not found then raise exception 'Catatan Saka tidak ditemukan.'; end if;
end $$;
-- ===== akhir aksi pelantikan dan saka =====

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
      'saka_anggota', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.saka_anggota t)
    )
  ) into v_hasil;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada)
    values ('cadangan.terakhir', jsonb_build_object('pada', now(), 'oleh', (select nama from public.profiles where id = auth.uid())), auth.uid(), now())
    on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
  return v_hasil;
end $$;

revoke all on function
  public.sg_pelantikan_catat(text, date, text, uuid[], bigint, text), public.sg_pelantikan_hapus(bigint),
  public.sg_saka_simpan(bigint, uuid, text, date, text, date, text, text), public.sg_saka_hapus(bigint)
  from public, anon, authenticated;
grant execute on function
  public.sg_pelantikan_catat(text, date, text, uuid[], bigint, text), public.sg_pelantikan_hapus(bigint),
  public.sg_saka_simpan(bigint, uuid, text, date, text, date, text, text), public.sg_saka_hapus(bigint)
  to authenticated;

commit;
notify pgrst, 'reload schema';
