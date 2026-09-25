-- ============================================================================
-- MIGRASI: Tahap 2 (G2b) -- Penegak mengajukan TKK sendiri, Pembina meninjau. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-tkk.sql; lihat README). Isi:
--   * Tabel public.tkk_pengajuan (Penegak mengajukan capaian TKK; status menunggu/disetujui/ditolak/dibatalkan; satu yang menunggu per Penegak, TKK, dan tingkat).
--     RLS baca: pemilik dan pengurus; tulis hanya lewat fungsi. Pemicu tolak_peserta_tak_aktif.
--   * Fungsi baru: sg_tkk_ajukan dan sg_tkk_ajukan_batal (Penegak), sg_tkk_tinjau (Pembina dan Admin: disetujui = menjadi capaian resmi, ditolak = catatan wajib),
--     dan pemeriksa bersama sigarda.tkk_periksa yang kini juga dipakai sg_tkk_catat (ditulis ulang; perilaku dan pesan galat sama).
--   * Jenis notifikasi baru 'tkk': Pembina diberi tahu pengajuan baru, Penegak diberi tahu pengajuannya ditinjau.
--   * sg_cadangan_admin() ditulis ulang (tanda tangan sama) agar memuat tkk_pengajuan.
-- TIDAK menghapus data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.tkk_capaian') is null or to_regprocedure('public.sg_tkk_catat(uuid, text, text, date, text, text, text, text, text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-tkk.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

alter table public.notifikasi drop constraint if exists notifikasi_jenis_check;
alter table public.notifikasi add constraint notifikasi_jenis_check
  check (jenis in ('ajukan','alih','mulai','hasil','pengingat','lama','sesi','surat','tes','eskalasi','agenda','musyawarah','kegiatan','pra_uji','tkk'));

-- ===== TKK pengajuan (Tahap 2, G2b): tabel =====
-- Penegak mengajukan capaian TKK sendiri (data sama dengan tkk_capaian); Pembina atau Admin meninjau: disetujui = menjadi capaian resmi, ditolak = catatan wajib.
-- Satu pengajuan yang menunggu per (Penegak, TKK, tingkat). Baris lama disimpan sebagai riwayat. Tulis hanya lewat fungsi sg_tkk_ajukan/_batal/sg_tkk_tinjau.
create table if not exists public.tkk_pengajuan (
  id bigint generated always as identity primary key,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  tkk_id text not null references public.tkk_katalog(id),
  tingkat text not null check (tingkat in ('purwa','madya','utama')),
  tanggal date not null check (tanggal >= date '2000-01-01'),
  penguji1 text not null check (char_length(btrim(penguji1)) between 1 and 80),
  penguji2 text not null check (char_length(btrim(penguji2)) between 1 and 80),
  melatih text not null check (char_length(btrim(melatih)) between 1 and 200),
  bukti_url text not null default '' check (bukti_url = '' or (bukti_url ~* '^https?://' and char_length(bukti_url) <= 500)),
  catatan text not null default '' check (char_length(catatan) <= 200),
  status text not null default 'menunggu' check (status in ('menunggu','disetujui','ditolak','dibatalkan')),
  diajukan_pada timestamptz not null default now(),
  ditinjau_oleh uuid references public.profiles(id) on delete set null,
  ditinjau_nama text,                                                                   -- nama peninjau saat meninjau (Penegak tidak dapat membaca profil Pembina)
  ditinjau_pada timestamptz,
  catatan_tinjauan text not null default '' check (char_length(catatan_tinjauan) <= 200),
  capaian_id bigint references public.tkk_capaian(id) on delete set null,               -- capaian resmi hasil persetujuan
  constraint tkk_pengajuan_tolak_wajib_catatan check (status <> 'ditolak' or btrim(catatan_tinjauan) <> '')
);
create unique index if not exists tkk_pengajuan_menunggu_unik on public.tkk_pengajuan (peserta_id, tkk_id, tingkat) where status = 'menunggu';
create index if not exists tkk_pengajuan_tkk_idx on public.tkk_pengajuan (tkk_id);
create index if not exists tkk_pengajuan_capaian_idx on public.tkk_pengajuan (capaian_id);
-- ===== akhir tabel tkk pengajuan =====

alter table public.tkk_pengajuan enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (baca saja lewat kebijakan; tulis hanya lewat fungsi).
revoke all on public.tkk_pengajuan from anon, authenticated;
grant select on public.tkk_pengajuan to authenticated;
-- ===== TKK pengajuan (Tahap 2, G2b): kebijakan =====
-- Pengajuan TKK: Penegak melihat pengajuannya sendiri, pengurus semua.
drop policy if exists baca_tkk_pengajuan on public.tkk_pengajuan;
create policy baca_tkk_pengajuan on public.tkk_pengajuan for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
-- ===== akhir kebijakan tkk pengajuan =====

-- ===== TKK pengajuan (Tahap 2, G2b): pemicu tak aktif =====
drop trigger if exists tak_aktif_tkk_pengajuan on public.tkk_pengajuan;
create trigger tak_aktif_tkk_pengajuan before insert or update on public.tkk_pengajuan for each row execute function sigarda.tolak_peserta_tak_aktif();
-- ===== akhir pemicu tak aktif tkk pengajuan =====

-- ===== TKK pengajuan (Tahap 2, G2b): aksi =====
-- Pemeriksa isian capaian TKK yang DIPAKAI BERSAMA sg_tkk_catat (Pembina/Admin), sg_tkk_ajukan (Penegak), dan persetujuan sg_tkk_tinjau, sehingga aturannya persis sama:
-- Penegak aktif, SKU Bantara selesai, TKK golongan Penegak dan seagama bila khusus agama, tingkat berurutan (Madya butuh Purwa, Utama butuh Madya, tanggal tidak
-- mendahului tingkat di bawahnya atau melewati tingkat di atasnya), tanggal bukan masa depan, dua penguji berbeda, bukti melatih, tautan, catatan. Melempar galat.
create or replace function sigarda.tkk_periksa(
  p_peserta_id uuid, p_tkk_id text, p_tingkat text, p_tanggal date, p_penguji1 text, p_penguji2 text, p_melatih text, p_bukti_url text, p_catatan text
) returns void language plpgsql stable security definer set search_path = public as
$$
declare
  v_p public.profiles; v_t public.tkk_katalog; v_p1 text := sigarda.rapikan(p_penguji1); v_p2 text := sigarda.rapikan(p_penguji2); v_lat text := sigarda.rapikan(p_melatih);
  v_url text := btrim(coalesce(p_bukti_url, '')); v_cat text := sigarda.rapikan(p_catatan); v_bawah date; v_atas date;
begin
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Pilih Penegak.'; end if;
  if v_p.status <> 'aktif' then raise exception '% tidak aktif; TKK hanya dicatat untuk Penegak aktif.', v_p.nama; end if;
  if not sigarda.tingkat_selesai(p_peserta_id, 'Bantara') then raise exception '% belum menyelesaikan SKU Bantara; TKK dapat dikenakan sesudah Penegak Bantara.', v_p.nama; end if;
  select * into v_t from public.tkk_katalog where id = p_tkk_id;
  if not found then raise exception 'TKK tidak dikenal.'; end if;
  if v_t.golongan <> 'penegak' then raise exception 'TKK % khusus golongan Siaga, tidak untuk Penegak.', v_t.nama; end if;
  if v_t.agama is not null and v_t.agama is distinct from v_p.agama then raise exception 'TKK % khusus penganut agama %.', v_t.nama, v_t.agama; end if;
  if p_tingkat is null or p_tingkat not in ('purwa','madya','utama') then raise exception 'Tingkat TKK harus Purwa, Madya, atau Utama.'; end if;
  if p_tanggal is null then raise exception 'Tanggal lulus wajib diisi.'; end if;
  if p_tanggal < date '2000-01-01' or p_tanggal > sigarda.hari_ini() then raise exception 'Tanggal lulus tidak boleh sebelum tahun 2000 atau di masa depan.'; end if;
  if char_length(v_p1) not between 1 and 80 or char_length(v_p2) not between 1 and 80 or v_p1 ~ '[[:cntrl:]<>]' or v_p2 ~ '[[:cntrl:]<>]' then
    raise exception 'Isi nama kedua penguji (tim 2 orang; maksimal 80 karakter, tanpa tanda < atau >).';
  end if;
  if lower(v_p1) = lower(v_p2) then raise exception 'Kedua penguji harus dua orang yang berbeda.'; end if;
  if char_length(v_lat) not between 1 and 200 or v_lat ~ '[[:cntrl:]<>]' then raise exception 'Isi bukti melatih: siapa yang telah dilatih sampai TKK tingkat di bawahnya (maksimal 200 karakter, tanpa tanda < atau >).'; end if;
  if v_url <> '' and (v_url !~* '^https?://' or char_length(v_url) > 500 or v_url ~ '[[:cntrl:][:space:]<>]') then raise exception 'Tautan bukti harus berawalan http:// atau https:// (maksimal 500 karakter, tanpa spasi).'; end if;
  if char_length(v_cat) > 200 or v_cat ~ '[[:cntrl:]<>]' then raise exception 'Catatan maksimal 200 karakter, tanpa tanda < atau >.'; end if;
  if p_tingkat <> 'purwa' then
    select tanggal into v_bawah from public.tkk_capaian where peserta_id = p_peserta_id and tkk_id = p_tkk_id and tingkat = case p_tingkat when 'madya' then 'purwa' else 'madya' end;
    if v_bawah is null then raise exception '% Utama butuh Madya, dan Madya butuh Purwa, dari jenis TKK yang sama. Catat tingkat di bawahnya lebih dulu.', v_t.nama; end if;
    if p_tanggal < v_bawah then raise exception 'Tanggal % tidak boleh sebelum tanggal tingkat di bawahnya (%).', initcap(p_tingkat), to_char(v_bawah, 'YYYY-MM-DD'); end if;
  end if;
  if p_tingkat <> 'utama' then
    select tanggal into v_atas from public.tkk_capaian where peserta_id = p_peserta_id and tkk_id = p_tkk_id and tingkat = case p_tingkat when 'purwa' then 'madya' else 'utama' end;
    if v_atas is not null and p_tanggal > v_atas then raise exception 'Tanggal % tidak boleh sesudah tanggal tingkat di atasnya (%).', initcap(p_tingkat), to_char(v_atas, 'YYYY-MM-DD'); end if;
  end if;
end $$;

-- Penegak mengajukan capaian TKK-nya sendiri (Pembina mencatat langsung lewat sg_tkk_catat). Maksimal 20 pengajuan menunggu; tingkat yang sudah tercatat resmi tidak diajukan lagi.
create or replace function public.sg_tkk_ajukan(
  p_tkk_id text, p_tingkat text, p_tanggal date, p_penguji1 text, p_penguji2 text, p_melatih text, p_bukti_url text default '', p_catatan text default ''
) returns bigint language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_id bigint;
begin
  perform sigarda.wajib_aktif();
  if not exists (select 1 from public.profiles where id = v_uid and role = 'peserta') then raise exception 'Hanya Penegak yang dapat mengajukan TKK. Pembina mencatat langsung di menu TKK.'; end if;
  if (select count(*) from public.tkk_pengajuan where peserta_id = v_uid and status = 'menunggu') >= 20 then raise exception 'Terlalu banyak pengajuan yang menunggu (maksimal 20). Tunggu Pembina meninjau.'; end if;
  perform sigarda.tkk_periksa(v_uid, p_tkk_id, p_tingkat, p_tanggal, p_penguji1, p_penguji2, p_melatih, p_bukti_url, p_catatan);
  if exists (select 1 from public.tkk_capaian where peserta_id = v_uid and tkk_id = p_tkk_id and tingkat = p_tingkat) then
    raise exception 'TKK ini pada tingkat itu sudah tercatat resmi. Koreksi dilakukan Pembina.';
  end if;
  begin
    insert into public.tkk_pengajuan (peserta_id, tkk_id, tingkat, tanggal, penguji1, penguji2, melatih, bukti_url, catatan)
    values (v_uid, p_tkk_id, p_tingkat, p_tanggal, sigarda.rapikan(p_penguji1), sigarda.rapikan(p_penguji2), sigarda.rapikan(p_melatih), btrim(coalesce(p_bukti_url, '')), sigarda.rapikan(p_catatan))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Pengajuan yang sama masih menunggu ditinjau Pembina.';
  end;
  return v_id;
end $$;

-- Penegak membatalkan pengajuannya yang masih menunggu.
create or replace function public.sg_tkk_ajukan_batal(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  update public.tkk_pengajuan set status = 'dibatalkan' where id = p_id and peserta_id = auth.uid() and status = 'menunggu';
  if not found then raise exception 'Pengajuan tidak ditemukan atau sudah ditinjau.'; end if;
end $$;

-- Pembina atau Admin meninjau satu pengajuan. p_keputusan 'disetujui' (menjadi capaian resmi lewat pemeriksa yang sama; keadaan dicek ulang saat ini) atau 'ditolak' (catatan wajib).
create or replace function public.sg_tkk_tinjau(p_id bigint, p_keputusan text, p_catatan text default '') returns void language plpgsql security definer set search_path = public as
$$
declare v public.tkk_pengajuan; v_cat text := sigarda.rapikan(p_catatan); v_nama text; v_cid bigint;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat meninjau pengajuan TKK.'; end if;
  if p_keputusan is null or p_keputusan not in ('disetujui','ditolak') then raise exception 'Keputusan harus disetujui atau ditolak.'; end if;
  if char_length(v_cat) > 200 or v_cat ~ '[[:cntrl:]<>]' then raise exception 'Catatan maksimal 200 karakter, tanpa tanda < atau >.'; end if;
  if p_keputusan = 'ditolak' and v_cat = '' then raise exception 'Isi catatan agar Penegak tahu alasan penolakan.'; end if;
  select * into v from public.tkk_pengajuan where id = p_id for update;
  if not found or v.status <> 'menunggu' then raise exception 'Pengajuan ini sudah tidak menunggu.'; end if;
  select nama into v_nama from public.profiles where id = auth.uid();
  if p_keputusan = 'disetujui' then
    perform sigarda.tkk_periksa(v.peserta_id, v.tkk_id, v.tingkat, v.tanggal, v.penguji1, v.penguji2, v.melatih, v.bukti_url, v.catatan);
    insert into public.tkk_capaian (peserta_id, tkk_id, tingkat, tanggal, penguji1, penguji2, melatih, bukti_url, catatan, dicatat_oleh, dicatat_pada)
    values (v.peserta_id, v.tkk_id, v.tingkat, v.tanggal, v.penguji1, v.penguji2, v.melatih, v.bukti_url, v.catatan, auth.uid(), now())
    on conflict (peserta_id, tkk_id, tingkat) do update
      set tanggal = excluded.tanggal, penguji1 = excluded.penguji1, penguji2 = excluded.penguji2, melatih = excluded.melatih, bukti_url = excluded.bukti_url,
          catatan = excluded.catatan, dicatat_oleh = excluded.dicatat_oleh, dicatat_pada = excluded.dicatat_pada
    returning id into v_cid;
  end if;
  update public.tkk_pengajuan set status = p_keputusan, ditinjau_oleh = auth.uid(), ditinjau_nama = v_nama, ditinjau_pada = now(), catatan_tinjauan = v_cat, capaian_id = v_cid where id = p_id;
end $$;

-- Notifikasi: Pembina diberi tahu pengajuan baru; Penegak diberi tahu pengajuannya ditinjau (isi singkat, hasil dilihat di aplikasi).
create or replace function sigarda.notif_tkk_pengajuan() returns trigger language plpgsql security definer set search_path = public as
$$
declare v_x uuid; v_nama text; v_tkk text;
begin
  select nama into v_tkk from public.tkk_katalog where id = NEW.tkk_id;
  if TG_OP = 'INSERT' then
    select nama into v_nama from public.profiles where id = NEW.peserta_id;
    for v_x in select id from public.profiles where role = 'penguji' and jabatan = 'Pembina' and status = 'aktif' loop
      perform sigarda.notif_buat(v_x, 'tkk', 'Pengajuan TKK baru', v_nama || ' mengajukan TKK ' || v_tkk || ' ' || initcap(NEW.tingkat), '{"tab":"tkk"}', 'tkk-baru:' || NEW.id);
    end loop;
  elsif OLD.status = 'menunggu' and NEW.status in ('disetujui','ditolak') then
    perform sigarda.notif_buat(NEW.peserta_id, 'tkk', 'Pengajuan TKK ditinjau', 'Pengajuan TKK ' || v_tkk || ' ' || initcap(NEW.tingkat) || ' sudah ditinjau Pembina. Buka aplikasi untuk melihat hasilnya.', '{"tab":"tkk"}', 'tkk-tinjau:' || NEW.id);
  end if;
  return null;
end $$;
drop trigger if exists notif_tkk_pengajuan_baru on public.tkk_pengajuan;
create trigger notif_tkk_pengajuan_baru after insert on public.tkk_pengajuan for each row execute function sigarda.notif_tkk_pengajuan();
drop trigger if exists notif_tkk_pengajuan_tinjau on public.tkk_pengajuan;
create trigger notif_tkk_pengajuan_tinjau after update of status on public.tkk_pengajuan for each row execute function sigarda.notif_tkk_pengajuan();
-- ===== akhir aksi tkk pengajuan =====

create or replace function public.sg_tkk_catat(
  p_peserta_id uuid, p_tkk_id text, p_tingkat text, p_tanggal date, p_penguji1 text, p_penguji2 text, p_melatih text, p_bukti_url text default '', p_catatan text default ''
) returns bigint language plpgsql security definer set search_path = public as
$$
declare v_id bigint;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mencatat TKK.'; end if;
  perform sigarda.tkk_periksa(p_peserta_id, p_tkk_id, p_tingkat, p_tanggal, p_penguji1, p_penguji2, p_melatih, p_bukti_url, p_catatan);
  insert into public.tkk_capaian (peserta_id, tkk_id, tingkat, tanggal, penguji1, penguji2, melatih, bukti_url, catatan, dicatat_oleh, dicatat_pada)
  values (p_peserta_id, p_tkk_id, p_tingkat, p_tanggal, sigarda.rapikan(p_penguji1), sigarda.rapikan(p_penguji2), sigarda.rapikan(p_melatih), btrim(coalesce(p_bukti_url, '')), sigarda.rapikan(p_catatan), auth.uid(), now())
  on conflict (peserta_id, tkk_id, tingkat) do update
    set tanggal = excluded.tanggal, penguji1 = excluded.penguji1, penguji2 = excluded.penguji2, melatih = excluded.melatih, bukti_url = excluded.bukti_url,
        catatan = excluded.catatan, dicatat_oleh = excluded.dicatat_oleh, dicatat_pada = excluded.dicatat_pada
  returning id into v_id;
  return v_id;
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
      'sesi_ujian_peserta', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sesi_ujian_peserta t),
      'agenda', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.agenda t),
      'kegiatan_usulan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.kegiatan_usulan t),
      'bina_damping', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.bina_damping t),
      'sku_pra_uji', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sku_pra_uji t),
      'pelantikan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.pelantikan t),
      'saka_anggota', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.saka_anggota t),
      'tkk_capaian', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tkk_capaian t),
      'tkk_krida', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tkk_krida t),
      'tkk_pengajuan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tkk_pengajuan t)
    )
  ) into v_hasil;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada)
    values ('cadangan.terakhir', jsonb_build_object('pada', now(), 'oleh', (select nama from public.profiles where id = auth.uid())), auth.uid(), now())
    on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
  return v_hasil;
end $$;

revoke all on function
  public.sg_tkk_ajukan(text, text, date, text, text, text, text, text), public.sg_tkk_ajukan_batal(bigint), public.sg_tkk_tinjau(bigint, text, text)
  from public, anon, authenticated;
grant execute on function
  public.sg_tkk_ajukan(text, text, date, text, text, text, text, text), public.sg_tkk_ajukan_batal(bigint), public.sg_tkk_tinjau(bigint, text, text)
  to authenticated;
-- Fungsi sigarda.* baru: hak dijalankan ulang di sini (grant "all functions in schema" tidak retroaktif untuk fungsi baru).
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
