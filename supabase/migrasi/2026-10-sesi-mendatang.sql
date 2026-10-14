-- ============================================================================
-- MIGRASI: sesi absensi boleh disiapkan lebih awal (sampai 60 hari ke depan). AMAN untuk database berisi data.
--
-- Jalankan SETELAH 2026-10-penulis-berita.sql (lihat README). Isi:
--   * sg_absen_buat_sesi: tanggal yang belum tiba kini BOLEH sampai 60 hari ke depan (tetap hanya hari Jumat). Sebelumnya ditolak.
--   * Sesi yang tanggalnya belum tiba BUKAN pertemuan: sigarda.iuran_hitung (pertemuan semester), sg_iuran_ringkas (Jumat kosong),
--     sigarda.eskalasi_mulai_absensi dan sigarda.eskalasi_mulai_iuran (tangga Tindak Lanjut) mengabaikannya, sehingga hasilnya sama
--     seperti sebelum fitur ini; tanpa pengaman itu sesi mendatang tanpa iuran dihitung "tidak iuran", memutus beruntun Alpa, dan menurunkan persen.
--   * Kehadiran (sg_absen_set, sg_absen_set_banyak), iuran (sg_iuran_set, sg_iuran_set_banyak), dan tutup kas (sg_iuran_kas_simpan) baru dapat
--     dicatat pada hari latihan atau sesudahnya; sesi mendatang masih bisa dihapus.
--   * Fungsi ditulis ulang (tanda tangan sama, jadi Edge Function tidak perlu di-deploy ulang). TIDAK mengubah tabel/data. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regprocedure('public.sg_absen_buat_sesi(date)') is null or to_regprocedure('sigarda.iuran_hitung(uuid, date)') is null
     or to_regprocedure('sigarda.eskalasi_mulai_iuran(uuid)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-10-penulis-berita.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

create or replace function sigarda.iuran_hitung(p_peserta uuid, p_tanggal date)
returns table (o_mulai date, o_akhir date, o_pertemuan int, o_kali int, o_susulan int, o_persen int, o_target int, o_kurang int, o_saran int)
language plpgsql stable security definer set search_path = public as
$$
declare
  v_y int := extract(year from p_tanggal)::int; v_hingga date;
  v_amb int := sigarda.iuran_angka('ambang', 75); v_lima int := sigarda.iuran_angka('lima', 90);
  v_tiga int := sigarda.iuran_angka('tiga', 65); v_dua int := sigarda.iuran_angka('dua', 50);
begin
  if extract(month from p_tanggal) >= 7 then o_mulai := make_date(v_y, 7, 1); o_akhir := make_date(v_y, 12, 31);
  else o_mulai := make_date(v_y, 1, 1); o_akhir := make_date(v_y, 6, 30); end if;
  v_hingga := least(o_akhir, p_tanggal, sigarda.hari_ini());   -- sesi yang tanggalnya belum tiba (disiapkan lebih awal) bukan pertemuan
  select count(*)::int into o_pertemuan from public.absensi_sesi where tanggal between o_mulai and v_hingga;
  select count(*)::int, count(*) filter (where jenis = 'susulan')::int into o_kali, o_susulan
    from public.iuran where peserta_id = p_peserta and tanggal between o_mulai and v_hingga;
  if o_pertemuan = 0 then
    o_persen := null; o_target := 0; o_kurang := 0; o_saran := null;
  else
    o_persen := floor(o_kali * 100.0 / o_pertemuan + 0.5)::int;
    o_target := ceil(v_amb * o_pertemuan / 100.0)::int;
    o_kurang := greatest(0, o_target - o_kali);
    o_saran := case when o_persen >= v_lima then 5 when o_persen >= v_amb then 4 when o_persen >= v_tiga then 3 when o_persen >= v_dua then 2 else 1 end;
  end if;
  return next;
end $$;

create or replace function sigarda.eskalasi_mulai_absensi(p_peserta uuid) returns date language plpgsql stable security definer set search_path = public as
$$
declare r record; v_beruntun date[] := '{}';
begin
  for r in select s.tanggal, ah.status from public.absensi_sesi s left join public.absensi_hadir ah on ah.tanggal = s.tanggal and ah.peserta_id = p_peserta
           where s.tanggal <= sigarda.hari_ini()   -- sesi yang belum tiba tidak memutus beruntun
           order by s.tanggal desc limit 15
  loop
    if r.status = 'A' then v_beruntun := v_beruntun || r.tanggal; else exit; end if;
  end loop;
  if array_length(v_beruntun, 1) >= 2 then return v_beruntun[array_length(v_beruntun, 1) - 1]; end if;
  return null;
end $$;

create or replace function sigarda.eskalasi_mulai_iuran(p_peserta uuid) returns date language plpgsql stable security definer set search_path = public as
$$
declare r record; v_beruntun date[] := '{}';
begin
  for r in select s.tanggal, exists (select 1 from public.iuran i where i.tanggal = s.tanggal and i.peserta_id = p_peserta) as bayar
           from public.absensi_sesi s where s.tanggal <= sigarda.hari_ini() order by s.tanggal desc limit 15   -- sesi yang belum tiba bukan "tidak iuran"
  loop
    if not r.bayar then v_beruntun := v_beruntun || r.tanggal; else exit; end if;
  end loop;
  if array_length(v_beruntun, 1) >= 2 then return v_beruntun[array_length(v_beruntun, 1) - 1]; end if;
  return null;
end $$;

create or replace function public.sg_absen_buat_sesi(p_tanggal date) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau admin yang dapat mencatat absensi.'; end if;
  if p_tanggal is null or p_tanggal < date '2000-01-01' or p_tanggal > date '2100-12-31' then raise exception 'Tanggal tidak valid.'; end if;
  if extract(dow from p_tanggal) <> 5 then raise exception 'Latihan rutin hanya dicatat pada hari Jumat.'; end if;
  -- Sesi boleh disiapkan lebih awal sampai 60 hari ke depan (cermin BATAS_SESI_MENDATANG_HARI di src/lib/absensiLogic.js). Sesi yang tanggalnya belum tiba
  -- TIDAK dihitung sebagai pertemuan (iuran_hitung, eskalasi) dan belum bisa diisi kehadiran atau iuran; ia baru "hidup" pada hari latihan.
  if p_tanggal > sigarda.hari_ini() + 60 then raise exception 'Sesi hanya dapat disiapkan sampai 60 hari ke depan.'; end if;
  insert into public.absensi_sesi (tanggal, dibuat_oleh) values (p_tanggal, auth.uid()) on conflict (tanggal) do nothing;
end $$;

create or replace function public.sg_absen_set(p_tanggal date, p_peserta_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Tidak diizinkan.'; end if;
  if p_status is not null and p_status not in ('H','I','S','A') then raise exception 'Status absensi tidak dikenal.'; end if;
  if not exists (select 1 from public.absensi_sesi where tanggal = p_tanggal) then raise exception 'Sesi absensi belum dibuat.'; end if;
  if p_tanggal > sigarda.hari_ini() then raise exception 'Kehadiran baru dapat dicatat pada hari latihan atau sesudahnya.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  if p_status is null then
    delete from public.absensi_hadir where tanggal = p_tanggal and peserta_id = p_peserta_id;
  else
    insert into public.absensi_hadir (tanggal, peserta_id, status, oleh) values (p_tanggal, p_peserta_id, p_status, auth.uid())
    on conflict (tanggal, peserta_id) do update set status = excluded.status, oleh = excluded.oleh, waktu = now();
  end if;
end $$;

create or replace function public.sg_absen_set_banyak(p_tanggal date, p_peserta_ids uuid[], p_status text, p_hanya_kosong boolean default true)
returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Tidak diizinkan.'; end if;
  if p_status is null or p_status not in ('H','I','S','A') then raise exception 'Status absensi tidak dikenal.'; end if;
  if not exists (select 1 from public.absensi_sesi where tanggal = p_tanggal) then raise exception 'Sesi absensi belum dibuat.'; end if;
  if p_tanggal > sigarda.hari_ini() then raise exception 'Kehadiran baru dapat dicatat pada hari latihan atau sesudahnya.'; end if;
  insert into public.absensi_hadir (tanggal, peserta_id, status, oleh)
  select p_tanggal, u.id, p_status, auth.uid()
  from public.profiles u where u.role = 'peserta' and u.status = 'aktif' and u.id = any (p_peserta_ids)
  on conflict (tanggal, peserta_id) do update
    set status = excluded.status, oleh = excluded.oleh, waktu = now()
    where not p_hanya_kosong;
end $$;

create or replace function public.sg_iuran_set(p_tanggal date, p_peserta_id uuid, p_jumlah int) returns void
language plpgsql security definer set search_path = public as
$$
declare v_baru int := nullif(p_jumlah, 0); v_lama int; v_jenis text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pencatat_iuran() then raise exception 'Hanya Dewan Ambalan atau asisten bendahara yang dapat mencatat iuran.'; end if;
  if v_baru is not null and (v_baru < 1 or v_baru > 1000000) then raise exception 'Jumlah iuran harus antara Rp 1 dan Rp 1.000.000.'; end if;
  if not exists (select 1 from public.absensi_sesi where tanggal = p_tanggal) then raise exception 'Sesi absensi belum dibuat.'; end if;
  if p_tanggal > sigarda.hari_ini() then raise exception 'Iuran baru dapat dicatat pada hari latihan atau sesudahnya.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  if p_peserta_id = auth.uid() then raise exception 'Iuran Anda sendiri dicatat oleh Dewan Ambalan.'; end if;
  select jumlah, jenis into v_lama, v_jenis from public.iuran where tanggal = p_tanggal and peserta_id = p_peserta_id;
  if v_lama is not distinct from v_baru then return; end if;
  if v_baru is null then
    delete from public.iuran where tanggal = p_tanggal and peserta_id = p_peserta_id;
  else
    insert into public.iuran (tanggal, peserta_id, jumlah, jenis, oleh) values (p_tanggal, p_peserta_id, v_baru, 'rutin', auth.uid())
    on conflict (tanggal, peserta_id) do update set jumlah = excluded.jumlah, oleh = excluded.oleh, waktu = now();
  end if;
  insert into public.iuran_log (tanggal, peserta_id, jumlah_lama, jumlah_baru, jenis, oleh)
  values (p_tanggal, p_peserta_id, v_lama, v_baru, coalesce(v_jenis, 'rutin'), auth.uid());
end $$;

create or replace function public.sg_iuran_set_banyak(p_tanggal date, p_peserta_ids uuid[], p_jumlah int, p_hanya_kosong boolean default true) returns int
language plpgsql security definer set search_path = public as
$$
declare v_id uuid; v_lama int; v_jenis text; v_n int := 0;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pencatat_iuran() then raise exception 'Hanya Dewan Ambalan atau asisten bendahara yang dapat mencatat iuran.'; end if;
  if p_jumlah is null or p_jumlah < 1 or p_jumlah > 1000000 then raise exception 'Jumlah iuran harus antara Rp 1 dan Rp 1.000.000.'; end if;
  if not exists (select 1 from public.absensi_sesi where tanggal = p_tanggal) then raise exception 'Sesi absensi belum dibuat.'; end if;
  if p_tanggal > sigarda.hari_ini() then raise exception 'Iuran baru dapat dicatat pada hari latihan atau sesudahnya.'; end if;
  if cardinality(coalesce(p_peserta_ids, '{}')) > 500 then raise exception 'Maksimal 500 peserta per permintaan.'; end if;
  for v_id in select id from public.profiles where role = 'peserta' and status = 'aktif' and id = any (coalesce(p_peserta_ids, '{}')) and id <> auth.uid() loop
    select jumlah, jenis into v_lama, v_jenis from public.iuran where tanggal = p_tanggal and peserta_id = v_id;
    if v_lama is not null and p_hanya_kosong then continue; end if;
    if v_lama is not distinct from p_jumlah then continue; end if;
    insert into public.iuran (tanggal, peserta_id, jumlah, jenis, oleh) values (p_tanggal, v_id, p_jumlah, 'rutin', auth.uid())
    on conflict (tanggal, peserta_id) do update set jumlah = excluded.jumlah, oleh = excluded.oleh, waktu = now();
    insert into public.iuran_log (tanggal, peserta_id, jumlah_lama, jumlah_baru, jenis, oleh)
    values (p_tanggal, v_id, v_lama, p_jumlah, coalesce(v_jenis, 'rutin'), auth.uid());
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.sg_iuran_kas_simpan(p_tanggal date, p_total int, p_catatan text default '') returns void
language plpgsql security definer set search_path = public as
$$
declare v_cat text := btrim(coalesce(p_catatan, ''));
begin
  perform sigarda.wajib_aktif();
  if not sigarda.dewan() then raise exception 'Hanya Dewan Ambalan yang dapat menutup kas.'; end if;
  if not exists (select 1 from public.absensi_sesi where tanggal = p_tanggal) then raise exception 'Sesi absensi belum dibuat.'; end if;
  if p_total is not null and p_tanggal > sigarda.hari_ini() then raise exception 'Kas baru dapat ditutup pada hari latihan atau sesudahnya.'; end if;
  if p_total is null then
    delete from public.iuran_kas where tanggal = p_tanggal;
    return;
  end if;
  if p_total < 0 or p_total > 100000000 then raise exception 'Total kas tidak valid.'; end if;
  if char_length(v_cat) > 300 then raise exception 'Catatan maksimal 300 karakter.'; end if;
  insert into public.iuran_kas (tanggal, total_fisik, catatan, oleh) values (p_tanggal, p_total, v_cat, auth.uid())
  on conflict (tanggal) do update set total_fisik = excluded.total_fisik, catatan = excluded.catatan, oleh = excluded.oleh, waktu = now();
end $$;

create or replace function public.sg_iuran_ringkas(p_peserta_id uuid, p_tanggal date) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare h record; v_kosong jsonb; v_membantu int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya pengurus yang dapat melihat ringkasan iuran Penegak.'; end if;
  if p_tanggal is null then raise exception 'Tanggal uji wajib diisi.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  select * into h from sigarda.iuran_hitung(p_peserta_id, p_tanggal);
  select coalesce(jsonb_agg(s.tanggal order by s.tanggal), '[]'::jsonb) into v_kosong
    from public.absensi_sesi s
    where s.tanggal between h.o_mulai and least(h.o_akhir, p_tanggal, sigarda.hari_ini())   -- sesi yang belum tiba bukan pertemuan
      and not exists (select 1 from public.iuran i where i.tanggal = s.tanggal and i.peserta_id = p_peserta_id);
  select count(distinct l.tanggal)::int into v_membantu from public.iuran_log l where l.oleh = p_peserta_id;
  return jsonb_build_object('mulai', h.o_mulai, 'akhir', h.o_akhir, 'pertemuan', h.o_pertemuan, 'kali', h.o_kali, 'susulan', h.o_susulan,
    'rutin', h.o_kali - h.o_susulan, 'persen', h.o_persen, 'target', h.o_target, 'kurang', h.o_kurang, 'saran', h.o_saran,
    'membantu', v_membantu, 'kosong', v_kosong,
    'pengaturan', jsonb_build_object('standar', sigarda.iuran_angka('standar', 1000), 'ambang', sigarda.iuran_angka('ambang', 75),
      'lima', sigarda.iuran_angka('lima', 90), 'tiga', sigarda.iuran_angka('tiga', 65), 'dua', sigarda.iuran_angka('dua', 50)));
end $$;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;
revoke all on function
  public.sg_absen_buat_sesi(date), public.sg_absen_set(date, uuid, text), public.sg_absen_set_banyak(date, uuid[], text, boolean),
  public.sg_iuran_set(date, uuid, int), public.sg_iuran_set_banyak(date, uuid[], int, boolean), public.sg_iuran_kas_simpan(date, int, text),
  public.sg_iuran_ringkas(uuid, date)
  from public, anon, authenticated;
grant execute on function
  public.sg_absen_buat_sesi(date), public.sg_absen_set(date, uuid, text), public.sg_absen_set_banyak(date, uuid[], text, boolean),
  public.sg_iuran_set(date, uuid, int), public.sg_iuran_set_banyak(date, uuid[], int, boolean), public.sg_iuran_kas_simpan(date, int, text),
  public.sg_iuran_ringkas(uuid, date)
  to authenticated;

commit;
notify pgrst, 'reload schema';
