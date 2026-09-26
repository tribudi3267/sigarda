-- ============================================================================
-- MIGRASI: Tahap 2 (G2c) -- Penguji 1 pengajuan TKK = Pembina yang ditugaskan; Pembina dapat mengganti penguji saat meninjau. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-tkk-pengajuan.sql; lihat README). Isi:
--   * Tabel public.tkk_pengajuan: kolom baru penguji1_id (Pembina Penguji 1) dan penguji_awal (nama penguji sebelum diganti; kosong bila tidak diganti).
--   * Fungsi baru sigarda.tkk_pembina_penilai dan sg_tkk_penguji_pilihan: Pembina aktif yang ditugaskan untuk Penegak (penugasan khusus Penegak, lalu penugasan rombel kelasnya,
--     lalu semua Pembina aktif bila tidak ada).
--   * TANDA TANGAN BERUBAH (fungsi lama dibuang, aplikasi baru memakai yang baru): sg_tkk_ajukan (Penguji 1 kini id Pembina yang dipilih dari daftar; Penguji 2 diisi Penegak) dan
--     sg_tkk_tinjau (peninjau boleh mengganti nama penguji saat menyetujui, alasan wajib di catatan). Pengajuan lama tetap terbaca.
--   * Notifikasi pengajuan baru hanya ke Pembina Penguji 1 (semua Pembina bila tidak tercatat).
-- TIDAK menghapus data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.tkk_pengajuan') is null or to_regprocedure('sigarda.tkk_periksa(uuid, text, text, date, text, text, text, text, text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-tkk-pengajuan.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

alter table public.tkk_pengajuan add column if not exists penguji1_id uuid references public.profiles(id) on delete set null;
alter table public.tkk_pengajuan add column if not exists penguji_awal text not null default '' check (char_length(penguji_awal) <= 200);
create index if not exists tkk_pengajuan_penguji1_idx on public.tkk_pengajuan (penguji1_id);

-- Tanda tangan lama dibuang (nama sama, parameter berbeda); yang baru dibuat di bawah
drop function if exists public.sg_tkk_ajukan(text, text, date, text, text, text, text, text);
drop function if exists public.sg_tkk_tinjau(bigint, text, text);

-- Pembina yang boleh menjadi Penguji 1 pengajuan TKK seorang Penegak (G2c): Pembina aktif yang ditugaskan untuk Penegak itu pada tahun ajaran berjalan, dengan urutan yang sama seperti
-- penugasan penguji SKU: penugasan khusus Penegak (bila ada Pembina di dalamnya) mengalahkan penugasan rombel kelasnya; bila keduanya tidak memuat Pembina, semua Pembina aktif.
create or replace function sigarda.tkk_pembina_penilai(p_peserta uuid) returns setof uuid language plpgsql stable security definer set search_path = public as
$$
declare v_ta text := sigarda.tahun_ajaran_kini(); v_kelas text; v_ada boolean;
begin
  select kelas into v_kelas from public.profiles where id = p_peserta;
  select exists (select 1 from public.penugasan_peserta pp join public.profiles u on u.id = pp.penguji_id
                 where pp.tahun_ajaran = v_ta and pp.peserta_id = p_peserta and u.role = 'penguji' and u.jabatan = 'Pembina' and u.status = 'aktif') into v_ada;
  if v_ada then
    return query select u.id from public.penugasan_peserta pp join public.profiles u on u.id = pp.penguji_id
                 where pp.tahun_ajaran = v_ta and pp.peserta_id = p_peserta and u.role = 'penguji' and u.jabatan = 'Pembina' and u.status = 'aktif';
    return;
  end if;
  select exists (select 1 from public.penugasan_rombel pr join public.profiles u on u.id = pr.penguji_id
                 where pr.tahun_ajaran = v_ta and pr.rombel = v_kelas and u.role = 'penguji' and u.jabatan = 'Pembina' and u.status = 'aktif') into v_ada;
  if v_ada then
    return query select u.id from public.penugasan_rombel pr join public.profiles u on u.id = pr.penguji_id
                 where pr.tahun_ajaran = v_ta and pr.rombel = v_kelas and u.role = 'penguji' and u.jabatan = 'Pembina' and u.status = 'aktif';
    return;
  end if;
  return query select u.id from public.profiles u where u.role = 'penguji' and u.jabatan = 'Pembina' and u.status = 'aktif';
end $$;

-- Pilihan Penguji 1 bagi Penegak yang sedang masuk: [{ id, nama }] menurut nama (pengajuan hanya diterima bila Penguji 1 ada di daftar ini).
create or replace function public.sg_tkk_penguji_pilihan() returns jsonb language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'peserta') then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'nama', u.nama) order by u.nama)
                   from public.profiles u where u.id in (select sigarda.tkk_pembina_penilai(auth.uid()))), '[]'::jsonb);
end $$;

-- Penegak mengajukan capaian TKK-nya sendiri (Pembina mencatat langsung lewat sg_tkk_catat). Penguji 1 = Pembina yang ditugaskan untuk kelasnya (dipilih dari sg_tkk_penguji_pilihan;
-- namanya disalin server), Penguji 2 diisi Penegak. Maksimal 20 pengajuan menunggu; tingkat yang sudah tercatat resmi tidak diajukan lagi.
create or replace function public.sg_tkk_ajukan(
  p_tkk_id text, p_tingkat text, p_tanggal date, p_penguji1_id uuid, p_penguji2 text, p_melatih text, p_bukti_url text default '', p_catatan text default ''
) returns bigint language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_id bigint; v_nama1 text;
begin
  perform sigarda.wajib_aktif();
  if not exists (select 1 from public.profiles where id = v_uid and role = 'peserta') then raise exception 'Hanya Penegak yang dapat mengajukan TKK. Pembina mencatat langsung di menu TKK.'; end if;
  if (select count(*) from public.tkk_pengajuan where peserta_id = v_uid and status = 'menunggu') >= 20 then raise exception 'Terlalu banyak pengajuan yang menunggu (maksimal 20). Tunggu Pembina meninjau.'; end if;
  if p_penguji1_id is null or p_penguji1_id not in (select sigarda.tkk_pembina_penilai(v_uid)) then raise exception 'Penguji 1 harus Pembina yang ditugaskan untuk kelasmu. Pilih dari daftar.'; end if;
  select nama into v_nama1 from public.profiles where id = p_penguji1_id;
  perform sigarda.tkk_periksa(v_uid, p_tkk_id, p_tingkat, p_tanggal, v_nama1, p_penguji2, p_melatih, p_bukti_url, p_catatan);
  if exists (select 1 from public.tkk_capaian where peserta_id = v_uid and tkk_id = p_tkk_id and tingkat = p_tingkat) then
    raise exception 'TKK ini pada tingkat itu sudah tercatat resmi. Koreksi dilakukan Pembina.';
  end if;
  begin
    insert into public.tkk_pengajuan (peserta_id, tkk_id, tingkat, tanggal, penguji1, penguji1_id, penguji2, melatih, bukti_url, catatan)
    values (v_uid, p_tkk_id, p_tingkat, p_tanggal, sigarda.rapikan(v_nama1), p_penguji1_id, sigarda.rapikan(p_penguji2), sigarda.rapikan(p_melatih), btrim(coalesce(p_bukti_url, '')), sigarda.rapikan(p_catatan))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Pengajuan yang sama masih menunggu ditinjau Pembina.';
  end;
  return v_id;
end $$;

-- Pembina atau Admin meninjau satu pengajuan. p_keputusan 'disetujui' (menjadi capaian resmi lewat pemeriksa yang sama; keadaan dicek ulang saat ini) atau 'ditolak' (catatan wajib).
-- Saat menyetujui, peninjau boleh MENGGANTI nama penguji (p_penguji1/p_penguji2; kosong = tetap), mis. bila Pembina 1 dan 2 berhalangan hadir: alasan wajib di catatan, dan nama
-- sebelumnya tersimpan di penguji_awal. Penggantian diabaikan saat menolak.
create or replace function public.sg_tkk_tinjau(p_id bigint, p_keputusan text, p_catatan text default '', p_penguji1 text default null, p_penguji2 text default null) returns void language plpgsql security definer set search_path = public as
$$
declare
  v public.tkk_pengajuan; v_cat text := sigarda.rapikan(p_catatan); v_nama text; v_cid bigint;
  v_p1 text; v_p2 text; v_awal text := ''; v_ganti boolean;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat meninjau pengajuan TKK.'; end if;
  if p_keputusan is null or p_keputusan not in ('disetujui','ditolak') then raise exception 'Keputusan harus disetujui atau ditolak.'; end if;
  if char_length(v_cat) > 200 or v_cat ~ '[[:cntrl:]<>]' then raise exception 'Catatan maksimal 200 karakter, tanpa tanda < atau >.'; end if;
  if p_keputusan = 'ditolak' and v_cat = '' then raise exception 'Isi catatan agar Penegak tahu alasan penolakan.'; end if;
  select * into v from public.tkk_pengajuan where id = p_id for update;
  if not found or v.status <> 'menunggu' then raise exception 'Pengajuan ini sudah tidak menunggu.'; end if;
  select nama into v_nama from public.profiles where id = auth.uid();
  v_p1 := v.penguji1; v_p2 := v.penguji2;
  if p_keputusan = 'disetujui' then
    if sigarda.rapikan(p_penguji1) <> '' then v_p1 := sigarda.rapikan(p_penguji1); end if;
    if sigarda.rapikan(p_penguji2) <> '' then v_p2 := sigarda.rapikan(p_penguji2); end if;
    v_ganti := v_p1 <> v.penguji1 or v_p2 <> v.penguji2;
    if v_ganti then
      if v_cat = '' then raise exception 'Nama penguji diganti: isi alasannya di catatan (mis. Pembina 1 dan 2 berhalangan hadir).'; end if;
      v_awal := left(v.penguji1 || ' dan ' || v.penguji2, 200);
    end if;
    perform sigarda.tkk_periksa(v.peserta_id, v.tkk_id, v.tingkat, v.tanggal, v_p1, v_p2, v.melatih, v.bukti_url, v.catatan);
    insert into public.tkk_capaian (peserta_id, tkk_id, tingkat, tanggal, penguji1, penguji2, melatih, bukti_url, catatan, dicatat_oleh, dicatat_pada)
    values (v.peserta_id, v.tkk_id, v.tingkat, v.tanggal, v_p1, v_p2, v.melatih, v.bukti_url, v.catatan, auth.uid(), now())
    on conflict (peserta_id, tkk_id, tingkat) do update
      set tanggal = excluded.tanggal, penguji1 = excluded.penguji1, penguji2 = excluded.penguji2, melatih = excluded.melatih, bukti_url = excluded.bukti_url,
          catatan = excluded.catatan, dicatat_oleh = excluded.dicatat_oleh, dicatat_pada = excluded.dicatat_pada
    returning id into v_cid;
  end if;
  update public.tkk_pengajuan set status = p_keputusan, penguji1 = v_p1, penguji2 = v_p2, penguji_awal = v_awal, ditinjau_oleh = auth.uid(), ditinjau_nama = v_nama, ditinjau_pada = now(),
    catatan_tinjauan = v_cat, capaian_id = v_cid where id = p_id;
end $$;

create or replace function sigarda.notif_tkk_pengajuan() returns trigger language plpgsql security definer set search_path = public as
$$
declare v_x uuid; v_nama text; v_tkk text;
begin
  select nama into v_tkk from public.tkk_katalog where id = NEW.tkk_id;
  if TG_OP = 'INSERT' then
    select nama into v_nama from public.profiles where id = NEW.peserta_id;
    for v_x in select id from public.profiles where role = 'penguji' and jabatan = 'Pembina' and status = 'aktif' and (NEW.penguji1_id is null or id = NEW.penguji1_id) loop
      perform sigarda.notif_buat(v_x, 'tkk', 'Pengajuan TKK baru', v_nama || ' mengajukan TKK ' || v_tkk || ' ' || initcap(NEW.tingkat), '{"tab":"tkk"}', 'tkk-baru:' || NEW.id);
    end loop;
  elsif OLD.status = 'menunggu' and NEW.status in ('disetujui','ditolak') then
    perform sigarda.notif_buat(NEW.peserta_id, 'tkk', 'Pengajuan TKK ditinjau', 'Pengajuan TKK ' || v_tkk || ' ' || initcap(NEW.tingkat) || ' sudah ditinjau Pembina. Buka aplikasi untuk melihat hasilnya.', '{"tab":"tkk"}', 'tkk-tinjau:' || NEW.id);
  end if;
  return null;
end $$;

revoke all on function
  public.sg_tkk_ajukan(text, text, date, uuid, text, text, text, text), public.sg_tkk_tinjau(bigint, text, text, text, text), public.sg_tkk_penguji_pilihan()
  from public, anon, authenticated;
grant execute on function
  public.sg_tkk_ajukan(text, text, date, uuid, text, text, text, text), public.sg_tkk_tinjau(bigint, text, text, text, text), public.sg_tkk_penguji_pilihan()
  to authenticated;
-- Fungsi sigarda.* baru: hak dijalankan ulang di sini (grant "all functions in schema" tidak retroaktif untuk fungsi baru).
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
