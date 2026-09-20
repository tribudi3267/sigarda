-- ============================================================================
-- MIGRASI: Nilai Raport Ekstrakurikuler (tabel raport, fungsi hitung skor, dan pengaturan raport). AMAN untuk database berisi data.
--
-- Jalankan SETELAH 2026-09-sidang-dk.sql (butuh tabel pengaturan). Isi:
--   * Tabel raport (nilai per Penegak per semester) dengan RLS: hanya Pembina dan Admin Gudep yang dapat membaca.
--   * Fungsi hitung di server: kehadiran dan capaian SKU dihitung ulang dari absensi dan progres, skor 0-100, predikat A-D.
--   * Fungsi sg_raport_simpan, sg_raport_hapus, sg_raport_pengaturan_simpan (pita nilai, bobot, target butir per semester).
-- TIDAK menghapus atau mengubah data yang sudah ada. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: migrasi Sidang (tabel pengaturan dan fungsi pembina_atau_admin) harus sudah dijalankan.
do $$
begin
  if to_regclass('public.pengaturan') is null or to_regprocedure('sigarda.pembina_atau_admin()') is null then
    raise exception 'Jalankan lebih dulu migrasi 2026-09-sidang-dk.sql (lalu 2026-09-sidang-format-nomor.sql), baru migrasi ini.';
  end if;
end $$;

-- Nilai raport ekstrakurikuler Pramuka per Penegak per semester (dikelola Pembina dan Admin).
-- Skor dan predikat hitung SELALU dihitung server dari kehadiran, capaian SKU, dan sikap memakai pengaturan 'raport.pengaturan'.
-- Predikat akhir boleh diubah Pembina (dengan catatan); deskripsi dibuat otomatis sebagai saran lalu disunting dan ditandai final.
create table if not exists public.raport (
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  tahun_ajaran text not null check (tahun_ajaran ~ '^\d{4}/\d{4}$'),
  semester text not null check (semester in ('ganjil','genap')),
  tingkat text not null check (tingkat in ('Bantara','Laksana')),      -- tingkat SKU yang dinilai pada semester itu
  sikap smallint check (sikap between 1 and 5),                        -- penilaian Pembina, skala 1-5
  karakter text[] not null default '{}' check (cardinality(karakter) <= 6),
  skk smallint check (skk between 0 and 99),                           -- jumlah SKK (keterangan, bukan syarat)
  kehadiran_persen smallint check (kehadiran_persen between 0 and 100),   -- kosong = belum ada absensi tercatat semester itu
  hadir smallint check (hadir between 0 and 100),
  pertemuan smallint check (pertemuan between 0 and 100),              -- pertemuan yang tercatat untuk peserta ini (H+I+S+A)
  capaian_lulus smallint not null check (capaian_lulus between 0 and 60),
  capaian_target smallint not null check (capaian_target between 1 and 60),
  skor smallint not null check (skor between 0 and 100),
  predikat_hitung text not null check (predikat_hitung in ('A','B','C','D')),
  predikat_akhir text check (predikat_akhir in ('A','B','C','D')),     -- kosong = mengikuti hasil hitung
  catatan_predikat text not null default '' check (char_length(catatan_predikat) <= 300),
  deskripsi text not null default '' check (char_length(deskripsi) <= 1200),
  status text not null default 'draf' check (status in ('draf','final')),
  diubah_oleh uuid references public.profiles(id) on delete set null,
  diubah_pada timestamptz not null default now(),
  primary key (peserta_id, tahun_ajaran, semester),
  constraint raport_final check (status <> 'final' or (sikap is not null and char_length(btrim(deskripsi)) > 0))
);
create index if not exists raport_tahun_ajaran_semester_idx on public.raport (tahun_ajaran, semester);

-- ---- Raport ekstrakurikuler: pengaturan dan perhitungan (harus sama dengan src/lib/raportLogic.js; dijaga oleh pengujian) ----
-- Pengaturan tersimpan sebagai satu objek JSON pada kunci 'raport.pengaturan':
--   {"pita":{"sangatBaik":90,"baik":75,"cukup":60},"bobot":{"kehadiran":40,"capaian":40,"sikap":20},"target":{"Bantara":12,"Laksana":11}}
create or replace function sigarda.raport_angka(p_jalur text[], p_bawaan int) returns int language sql stable security definer set search_path = public as
$$
  select coalesce((select (nilai #>> p_jalur)::int from public.pengaturan where kunci = 'raport.pengaturan' and jsonb_typeof(nilai) = 'object'), p_bawaan)
$$;

-- Skor 0-100 = rata-rata tertimbang komponen yang tersedia (kehadiran dan sikap boleh kosong; bobotnya dialihkan ke komponen lain).
-- Capaian = butir lulus semester ini terhadap target, maksimal 100. Sikap 1-5 dikali 20. Pembulatan setengah ke atas.
create or replace function sigarda.raport_skor(p_kehadiran int, p_capaian_lulus int, p_capaian_target int, p_sikap int) returns int
language plpgsql stable security definer set search_path = public as
$$
declare
  wh int := sigarda.raport_angka('{bobot,kehadiran}', 40); wc int := sigarda.raport_angka('{bobot,capaian}', 40); ws int := sigarda.raport_angka('{bobot,sikap}', 20);
  sc int := least(100, round(p_capaian_lulus * 100.0 / p_capaian_target)::int);
  jumlah_w int; jumlah_ws int;
begin
  jumlah_w := wc + case when p_kehadiran is not null then wh else 0 end + case when p_sikap is not null then ws else 0 end;
  if jumlah_w = 0 then return null; end if;
  jumlah_ws := wc * sc + coalesce(wh * p_kehadiran, 0) + coalesce(ws * p_sikap * 20, 0);
  return round(jumlah_ws::numeric / jumlah_w)::int;
end $$;

create or replace function sigarda.raport_predikat(p_skor int) returns text language sql stable security definer set search_path = public as
$$
  select case
    when p_skor is null then null
    when p_skor >= sigarda.raport_angka('{pita,sangatBaik}', 90) then 'A'
    when p_skor >= sigarda.raport_angka('{pita,baik}', 75) then 'B'
    when p_skor >= sigarda.raport_angka('{pita,cukup}', 60) then 'C'
    else 'D' end
$$;

-- Bahan hitung semester: kehadiran (H dan jumlah tercatat H+I+S+A pada Jumat semester itu) dan capaian SKU (butir tingkat itu
-- yang lulus dengan tanggal uji dalam semester itu; butir agama lulus bila seluruh sub-butirnya lulus, tanggalnya yang terakhir).
-- Semester Ganjil: 1 Juli - 31 Desember tahun pertama; Genap: 1 Januari - 30 Juni tahun kedua.
create or replace function sigarda.raport_hitung(p_peserta uuid, p_ta text, p_semester text, p_tingkat text)
returns table (o_hadir int, o_dicatat int, o_lulus int, o_target int)
language plpgsql stable security definer set search_path = public as
$$
declare v_y int := split_part(p_ta, '/', 1)::int; v_mulai date; v_akhir date; v_agama text;
begin
  if p_semester = 'ganjil' then v_mulai := make_date(v_y, 7, 1); v_akhir := make_date(v_y, 12, 31);
  else v_mulai := make_date(v_y + 1, 1, 1); v_akhir := make_date(v_y + 1, 6, 30); end if;
  select agama into v_agama from public.profiles where id = p_peserta;
  select (count(*) filter (where h.status = 'H'))::int, count(*)::int into o_hadir, o_dicatat
  from public.absensi_hadir h where h.peserta_id = p_peserta and h.tanggal between v_mulai and v_akhir;
  select count(*)::int into o_lulus from (
    select u.butir_id
    from public.sku_unit u
    left join public.sku_progress g on g.sku_id = u.id and g.peserta_id = p_peserta
    where u.tingkat = p_tingkat and (u.agama is null or u.agama = v_agama)
    group by u.butir_id
    having bool_and(coalesce(g.status, 'belum') = 'lulus') and max(g.tanggal_uji) between v_mulai and v_akhir
  ) b;
  o_target := sigarda.raport_angka(array['target', p_tingkat], case p_tingkat when 'Bantara' then 12 else 11 end);
  return next;
end $$;

-- ===== Nilai raport ekstrakurikuler =====
-- Pengaturan raport (pita nilai, bobot, target butir per semester) disimpan sebagai satu objek pada kunci 'raport.pengaturan'.
create or replace function public.sg_raport_pengaturan_simpan(p_nilai jsonb) returns void
language plpgsql security definer set search_path = public as
$$
declare
  v_jalur text[]; v_n int; v_sb int; v_b int; v_c int; v_wh int; v_wc int; v_ws int; v_tb int; v_tl int; v_baru jsonb;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah pengaturan raport.'; end if;
  if p_nilai is null or jsonb_typeof(p_nilai) <> 'object' then raise exception 'Pengaturan raport tidak sah.'; end if;
  foreach v_jalur slice 1 in array array[
    array['pita','sangatBaik'], array['pita','baik'], array['pita','cukup'],
    array['bobot','kehadiran'], array['bobot','capaian'], array['bobot','sikap'],
    array['target','Bantara'], array['target','Laksana']
  ] loop
    if coalesce(p_nilai #>> v_jalur, '') !~ '^[0-9]{1,3}$' then
      raise exception 'Pengaturan raport: nilai % harus berupa bilangan bulat.', array_to_string(v_jalur, '.');
    end if;
  end loop;
  v_sb := (p_nilai #>> '{pita,sangatBaik}')::int; v_b := (p_nilai #>> '{pita,baik}')::int; v_c := (p_nilai #>> '{pita,cukup}')::int;
  v_wh := (p_nilai #>> '{bobot,kehadiran}')::int; v_wc := (p_nilai #>> '{bobot,capaian}')::int; v_ws := (p_nilai #>> '{bobot,sikap}')::int;
  v_tb := (p_nilai #>> '{target,Bantara}')::int; v_tl := (p_nilai #>> '{target,Laksana}')::int;
  if not (v_sb <= 100 and v_sb > v_b and v_b > v_c and v_c >= 1) then
    raise exception 'Batas nilai harus berurutan: Sangat Baik (maks. 100) lebih besar dari Baik, Baik lebih besar dari Cukup, Cukup minimal 1.';
  end if;
  if v_wh + v_wc + v_ws <> 100 then raise exception 'Jumlah bobot harus 100 (sekarang %).', v_wh + v_wc + v_ws; end if;
  if v_wc < 1 then raise exception 'Bobot capaian SKU minimal 1.'; end if;
  if v_tb < 1 or v_tb > 60 or v_tl < 1 or v_tl > 60 then raise exception 'Target butir per semester harus antara 1 dan 60.'; end if;
  v_baru := jsonb_build_object(
    'pita', jsonb_build_object('sangatBaik', v_sb, 'baik', v_b, 'cukup', v_c),
    'bobot', jsonb_build_object('kehadiran', v_wh, 'capaian', v_wc, 'sikap', v_ws),
    'target', jsonb_build_object('Bantara', v_tb, 'Laksana', v_tl));
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada) values ('raport.pengaturan', v_baru, auth.uid(), now())
  on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;

-- Menyimpan nilai raport satu peserta pada satu semester. Kehadiran dan capaian SKU dihitung ulang di server dari data absensi dan
-- progres SKU; skor dan predikat hitung dari pengaturan yang berlaku. Pembina hanya mengisi sikap, karakter, SKK, deskripsi, dan
-- (bila perlu) predikat akhir yang berbeda dari hasil hitung, wajib disertai catatan. Status 'final' = keputusan Pembina.
create or replace function public.sg_raport_simpan(
  p_peserta_id uuid, p_tahun_ajaran text, p_semester text, p_tingkat text,
  p_sikap int, p_karakter text[], p_skk int,
  p_predikat_akhir text, p_catatan text, p_deskripsi text, p_final boolean
) returns void language plpgsql security definer set search_path = public as
$$
declare
  v_kar text[]; v_cat text := sigarda.rapikan(p_catatan); v_des text := btrim(coalesce(p_deskripsi, ''));
  v_h record; v_persen int; v_skor int; v_hitung text; v_akhir text := p_predikat_akhir;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengisi nilai raport.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  if p_tahun_ajaran is null or p_tahun_ajaran !~ '^[0-9]{4}/[0-9]{4}$'
     or split_part(p_tahun_ajaran, '/', 2)::int <> split_part(p_tahun_ajaran, '/', 1)::int + 1
     or split_part(p_tahun_ajaran, '/', 1)::int not between 2000 and 2100 then
    raise exception 'Tahun ajaran tidak valid (contoh: 2026/2027).';
  end if;
  if p_semester is null or p_semester not in ('ganjil', 'genap') then raise exception 'Semester harus ganjil atau genap.'; end if;
  if p_tingkat is null or p_tingkat not in ('Bantara', 'Laksana') then raise exception 'Tingkat SKU tidak dikenal.'; end if;
  if p_sikap is not null and p_sikap not between 1 and 5 then raise exception 'Nilai sikap harus antara 1 dan 5.'; end if;
  if p_skk is not null and p_skk not between 0 and 99 then raise exception 'Jumlah SKK harus antara 0 dan 99.'; end if;
  if v_akhir is not null and v_akhir not in ('A', 'B', 'C', 'D') then raise exception 'Predikat akhir tidak dikenal.'; end if;
  if char_length(v_cat) > 300 then raise exception 'Catatan predikat maksimal 300 karakter.'; end if;
  if char_length(v_des) > 1200 then raise exception 'Deskripsi capaian maksimal 1200 karakter.'; end if;

  -- karakter: dirapikan, tanpa kembar (huruf besar/kecil dianggap sama), urutan dipertahankan
  select coalesce(array_agg(d.t order by d.n), '{}') into v_kar from (
    select distinct on (lower(s.t)) s.t, s.n from (
      select sigarda.rapikan(x) as t, n from unnest(coalesce(p_karakter, '{}')) with ordinality as a(x, n)
    ) s where s.t <> '' order by lower(s.t), s.n
  ) d;
  if cardinality(v_kar) > 6 then raise exception 'Karakter yang dipilih maksimal 6.'; end if;
  if exists (select 1 from unnest(v_kar) k where char_length(k) > 30) then raise exception 'Setiap karakter maksimal 30 huruf.'; end if;

  select * into v_h from sigarda.raport_hitung(p_peserta_id, p_tahun_ajaran, p_semester, p_tingkat);
  v_persen := case when v_h.o_dicatat > 0 then round(v_h.o_hadir * 100.0 / v_h.o_dicatat)::int end;
  v_skor := sigarda.raport_skor(v_persen, v_h.o_lulus, v_h.o_target, p_sikap);
  if v_skor is null then raise exception 'Belum ada komponen yang dapat dinilai.'; end if;
  v_hitung := sigarda.raport_predikat(v_skor);

  if v_akhir is not null and v_akhir = v_hitung then v_akhir := null; end if;
  if v_akhir is null then v_cat := '';
  elsif v_cat = '' then raise exception 'Predikat akhir berbeda dari hasil hitung (%); isi catatan alasan perubahannya.', v_hitung;
  end if;
  if coalesce(p_final, false) then
    if p_sikap is null then raise exception 'Isi penilaian sikap sebelum menandai final.'; end if;
    if v_des = '' then raise exception 'Isi deskripsi capaian sebelum menandai final.'; end if;
  end if;

  insert into public.raport (
    peserta_id, tahun_ajaran, semester, tingkat, sikap, karakter, skk, kehadiran_persen, hadir, pertemuan,
    capaian_lulus, capaian_target, skor, predikat_hitung, predikat_akhir, catatan_predikat, deskripsi, status, diubah_oleh, diubah_pada
  ) values (
    p_peserta_id, p_tahun_ajaran, p_semester, p_tingkat, p_sikap, v_kar, p_skk, v_persen, v_h.o_hadir, v_h.o_dicatat,
    v_h.o_lulus, v_h.o_target, v_skor, v_hitung, v_akhir, v_cat, v_des, case when coalesce(p_final, false) then 'final' else 'draf' end, auth.uid(), now()
  ) on conflict (peserta_id, tahun_ajaran, semester) do update set
    tingkat = excluded.tingkat, sikap = excluded.sikap, karakter = excluded.karakter, skk = excluded.skk,
    kehadiran_persen = excluded.kehadiran_persen, hadir = excluded.hadir, pertemuan = excluded.pertemuan,
    capaian_lulus = excluded.capaian_lulus, capaian_target = excluded.capaian_target, skor = excluded.skor,
    predikat_hitung = excluded.predikat_hitung, predikat_akhir = excluded.predikat_akhir, catatan_predikat = excluded.catatan_predikat,
    deskripsi = excluded.deskripsi, status = excluded.status, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;

create or replace function public.sg_raport_hapus(p_peserta_id uuid, p_tahun_ajaran text, p_semester text) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus nilai raport.'; end if;
  delete from public.raport where peserta_id = p_peserta_id and tahun_ajaran = p_tahun_ajaran and semester = p_semester;
end $$;

alter table public.raport enable row level security;
drop policy if exists baca_raport on public.raport;
create policy baca_raport on public.raport for select to authenticated using ((select sigarda.pembina_atau_admin()));

revoke all on public.raport from anon, authenticated;
grant select on public.raport to authenticated;

revoke all on function
  public.sg_raport_pengaturan_simpan(jsonb),
  public.sg_raport_simpan(uuid, text, text, text, int, text[], int, text, text, text, boolean),
  public.sg_raport_hapus(uuid, text, text)
  from public, anon, authenticated;
grant execute on function
  public.sg_raport_pengaturan_simpan(jsonb),
  public.sg_raport_simpan(uuid, text, text, text, int, text[], int, text, text, text, boolean),
  public.sg_raport_hapus(uuid, text, text)
  to authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
