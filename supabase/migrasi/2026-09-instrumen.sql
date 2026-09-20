-- ============================================================================
-- MIGRASI: Instrumen penilaian SKU (tabel, hitung skor di server, penilaian dengan instrumen). AMAN untuk database berisi data.
--
-- Jalankan SETELAH 2026-09-sidang-dk.sql dan 2026-09-raport.sql. Isi:
--   * Tabel instrumen, instrumen_kriteria, instrumen_penguji, instrumen_panduan, dan sku_penilaian dengan RLS. Penegak hanya melihat
--     instrumen yang DITETAPKAN dan daftar kriterianya; instruksi dan panduan penguji hanya terbaca pengurus.
--   * Fungsi hitung di server (skor, saran lulus, predikat) dan sg_sku_catat_rubrik_internal (dipakai Edge Function).
--   * Fungsi sg_instrumen_simpan, sg_instrumen_status, sg_instrumen_pengaturan_simpan (Pembina dan Admin).
--   * sg_sku_catat_internal diperbarui: butir dengan instrumen ditetapkan hanya boleh dinilai lewat instrumen.
-- TIDAK menghapus atau mengubah data yang sudah ada. Instrumen baru berstatus draf (tidak dipakai) sampai Pembina menetapkannya,
-- sehingga alur penilaian yang berjalan tidak berubah. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: migrasi Sidang dan Raport harus sudah dijalankan.
do $$
begin
  if to_regclass('public.pengaturan') is null or to_regclass('public.raport') is null or to_regprocedure('sigarda.pembina_atau_admin()') is null then
    raise exception 'Jalankan lebih dulu migrasi 2026-09-sidang-dk.sql, 2026-09-sidang-format-nomor.sql, dan 2026-09-raport.sql, baru migrasi ini.';
  end if;
end $$;

-- Instrumen penilaian per unit SKU (butir; butir agama per sub-butir), disusun Pembina dan Admin.
-- Hanya instrumen berstatus 'ditetapkan' yang dipakai menilai dan terlihat Penegak (daftar kriteria saja). Instruksi dan panduan
-- penguji ada di tabel terpisah yang hanya terbaca pengurus. Butir tanpa instrumen ditetapkan tetap memakai alur penilaian lama.
create table if not exists public.instrumen (
  sku_id text primary key references public.sku_unit(id) on delete cascade,
  cara_uji text not null default '' check (char_length(cara_uji) <= 300),
  status text not null default 'draf' check (status in ('draf','ditetapkan')),
  diubah_oleh uuid references public.profiles(id) on delete set null,
  diubah_pada timestamptz not null default now()
);
create table if not exists public.instrumen_kriteria (
  id bigint generated always as identity primary key,
  sku_id text not null references public.instrumen(sku_id) on delete cascade,
  urutan smallint not null check (urutan between 1 and 20),
  jenis text not null check (jenis in ('Lisan','Praktik','Bukti kegiatan','Pengamatan')),
  teks text not null check (char_length(btrim(teks)) between 1 and 400),
  bobot smallint not null default 1 check (bobot between 1 and 5),
  wajib boolean not null default false,
  unique (sku_id, urutan) deferrable initially deferred
);
create index if not exists instrumen_kriteria_sku_id_idx on public.instrumen_kriteria (sku_id);
create table if not exists public.instrumen_penguji (
  sku_id text primary key references public.instrumen(sku_id) on delete cascade,
  instruksi text not null default '' check (char_length(instruksi) <= 1500)
);
create table if not exists public.instrumen_panduan (
  kriteria_id bigint primary key references public.instrumen_kriteria(id) on delete cascade,
  panduan text not null default '' check (char_length(panduan) <= 1500)
);
-- Catatan tiap penilaian dengan instrumen (hanya bertambah). Rincian menyimpan salinan kriteria saat itu, jadi tetap terbaca
-- walaupun instrumen diubah kemudian.
create table if not exists public.sku_penilaian (
  id bigint generated always as identity primary key,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  sku_id text not null references public.sku_unit(id),
  waktu timestamptz not null default now(),
  penguji_id uuid references public.profiles(id) on delete set null,
  tanggal_uji date not null,
  rincian jsonb not null,
  skor smallint not null check (skor between 0 and 100),
  wajib_ok boolean not null,
  saran text not null check (saran in ('lulus','ulang')),
  hasil text not null check (hasil in ('lulus','ulang')),
  diganti boolean not null default false,
  catatan text not null default ''
);
create index if not exists sku_penilaian_peserta_id_sku_id_idx on public.sku_penilaian (peserta_id, sku_id);

-- ---- Instrumen penilaian: pengaturan dan perhitungan (harus sama dengan src/lib/instrumenLogic.js; dijaga oleh pengujian) ----
-- Pengaturan tersimpan pada kunci 'instrumen.pengaturan':
--   {"ambang":75,"pita":{"sangatBaik":90,"baik":75,"cukup":60},"gerbangWajib":true,"nilaiWajibMin":3}
create or replace function sigarda.instrumen_angka(p_jalur text[], p_bawaan int) returns int language sql stable security definer set search_path = public as
$$
  select coalesce((select (nilai #>> p_jalur)::int from public.pengaturan where kunci = 'instrumen.pengaturan' and jsonb_typeof(nilai) = 'object'), p_bawaan)
$$;

create or replace function sigarda.instrumen_gerbang() returns boolean language sql stable security definer set search_path = public as
$$
  select coalesce((select (nilai ->> 'gerbangWajib')::boolean from public.pengaturan where kunci = 'instrumen.pengaturan' and jsonb_typeof(nilai) = 'object'), true)
$$;

create or replace function sigarda.instrumen_aktif(p_sku text) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.instrumen i where i.sku_id = p_sku and i.status = 'ditetapkan') $$;

-- Skor 0-100 = 20 x jumlah(nilai x bobot) / jumlah(bobot), dibulatkan setengah ke atas. Saran LULUS bila skor mencapai ambang dan
-- (bila gerbang wajib aktif) setiap kriteria wajib bernilai minimal nilaiWajibMin. Nilai (predikat) dari pita.
-- Rincian: array {kriteria_id, nilai 1-5} yang harus mencakup SELURUH kriteria instrumen tepat satu kali.
create or replace function sigarda.instrumen_hitung(p_sku text, p_rincian jsonb)
returns table (o_skor int, o_wajib_ok boolean, o_saran text, o_nilai text)
language plpgsql stable security definer set search_path = public as
$$
declare
  v_jumlah int; v_cocok int; v_beda int; v_s int; v_w int; v_ok boolean; v_skor int;
  v_min int := sigarda.instrumen_angka(array['nilaiWajibMin'], 3);
  v_ambang int := sigarda.instrumen_angka(array['ambang'], 75);
begin
  if p_rincian is null or jsonb_typeof(p_rincian) <> 'array' then raise exception 'Nilai kriteria tidak sah.'; end if;
  select count(*) into v_jumlah from public.instrumen_kriteria where sku_id = p_sku;
  if v_jumlah = 0 then raise exception 'Instrumen belum memiliki kriteria.'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_rincian) e
    where jsonb_typeof(e) <> 'object' or coalesce(e ->> 'kriteria_id', '') !~ '^[0-9]{1,18}$' or coalesce(e ->> 'nilai', '') !~ '^[1-5]$'
  ) then raise exception 'Nilai tiap kriteria harus bilangan bulat 1 sampai 5.'; end if;

  select count(*), count(distinct k.id), coalesce(sum(k.bobot * r.nilai), 0), coalesce(sum(k.bobot), 0), coalesce(bool_and(not k.wajib or r.nilai >= v_min), true)
    into v_cocok, v_beda, v_s, v_w, v_ok
  from (select (e ->> 'kriteria_id')::bigint as kriteria_id, (e ->> 'nilai')::int as nilai from jsonb_array_elements(p_rincian) e) r
  join public.instrumen_kriteria k on k.id = r.kriteria_id and k.sku_id = p_sku;
  if jsonb_array_length(p_rincian) <> v_jumlah or v_cocok <> v_jumlah or v_beda <> v_jumlah then
    raise exception 'Nilai kriteria tidak lengkap atau tidak sesuai instrumen (instrumen mungkin baru diubah). Buka ulang lembar penilaian.';
  end if;

  v_skor := round(20.0 * v_s / v_w)::int;
  o_skor := v_skor;
  o_wajib_ok := v_ok;
  o_saran := case when v_skor >= v_ambang and (v_ok or not sigarda.instrumen_gerbang()) then 'lulus' else 'ulang' end;
  o_nilai := case
    when v_skor >= sigarda.instrumen_angka(array['pita', 'sangatBaik'], 90) then 'Sangat baik'
    when v_skor >= sigarda.instrumen_angka(array['pita', 'baik'], 75) then 'Baik'
    else 'Cukup' end;
  return next;
end $$;

create or replace function public.sg_sku_catat_internal(
  p_oleh uuid, p_peserta_id uuid, p_sku_id text, p_hasil text,
  p_tanggal_uji date default null, p_nilai text default null, p_catatan text default ''
) returns void language plpgsql security definer set search_path = public as
$$
declare v_p public.profiles; v_kode text; v_cat text := btrim(coalesce(p_catatan, ''));
begin
  if not exists (select 1 from public.profiles where id = p_oleh and role = 'penguji') then
    raise exception 'Hanya Pembina atau Dewan Ambalan yang dapat mencatat hasil.';
  end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Peserta tidak ditemukan.'; end if;
  if not exists (select 1 from public.sku_unit where id = p_sku_id and (agama is null or agama = v_p.agama)) then
    raise exception 'Poin SKU tidak ditemukan.';
  end if;
  if p_hasil not in ('proses','lulus','ulang','reset') then raise exception 'Hasil pengujian tidak dikenal.'; end if;
  -- Butir dengan instrumen ditetapkan hanya boleh dinilai lewat sg_sku_catat_rubrik_internal (yang menyalakan penanda ini)
  if p_hasil in ('lulus','ulang') and sigarda.instrumen_aktif(p_sku_id)
     and coalesce(current_setting('sigarda.via_rubrik', true), '') <> 'ya' then
    raise exception 'Butir ini dinilai dengan instrumen penilaian. Catat hasilnya lewat lembar penilaian.';
  end if;
  if p_hasil <> 'reset' and p_tanggal_uji is null then raise exception 'Tanggal uji wajib diisi.'; end if;
  if p_hasil <> 'reset' and p_sku_id like 'LAK-%' and not sigarda.tingkat_selesai(p_peserta_id, 'Bantara') then
    raise exception 'Peserta belum menyelesaikan seluruh butir Bantara.';
  end if;
  if char_length(v_cat) > 1000 then raise exception 'Catatan maksimal 1000 karakter.'; end if;

  if p_hasil = 'proses' then
    insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji)
    values (p_peserta_id, p_sku_id, 'proses', p_oleh, p_tanggal_uji)
    on conflict (peserta_id, sku_id) do update
      set status = 'proses', penguji_id = p_oleh, tanggal_uji = p_tanggal_uji, verifikasi = null, diverifikasi_pada = null, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (p_peserta_id, p_sku_id, 'Pengujian dimulai', p_oleh);

  elsif p_hasil = 'lulus' then
    if p_nilai is null then raise exception 'Pilih predikat penilaian.'; end if;
    if p_nilai not in ('Sangat baik','Baik','Cukup') then raise exception 'Predikat tidak dikenal.'; end if;
    v_kode := sigarda.kode_verifikasi(array[p_peserta_id::text, p_sku_id, p_oleh::text, p_tanggal_uji::text]);
    insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji, nilai, catatan, verifikasi, diverifikasi_pada)
    values (p_peserta_id, p_sku_id, 'lulus', p_oleh, p_tanggal_uji, p_nilai, v_cat, v_kode, now())
    on conflict (peserta_id, sku_id) do update
      set status = 'lulus', penguji_id = p_oleh, tanggal_uji = p_tanggal_uji, nilai = p_nilai, catatan = v_cat,
          verifikasi = v_kode, diverifikasi_pada = now(), diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (p_peserta_id, p_sku_id, 'Dinyatakan lulus (' || p_nilai || '), kode ' || v_kode, p_oleh);

  elsif p_hasil = 'ulang' then
    if v_cat = '' then raise exception 'Isi catatan agar peserta tahu bagian yang perlu diperbaiki.'; end if;
    insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji, nilai, catatan)
    values (p_peserta_id, p_sku_id, 'ulang', p_oleh, p_tanggal_uji, null, v_cat)
    on conflict (peserta_id, sku_id) do update
      set status = 'ulang', penguji_id = p_oleh, tanggal_uji = p_tanggal_uji, nilai = null, catatan = v_cat,
          verifikasi = null, diverifikasi_pada = null, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (p_peserta_id, p_sku_id, 'Perlu diulang', p_oleh);

  else -- reset
    if v_cat = '' then raise exception 'Isi alasan pembatalan status.'; end if;
    insert into public.sku_progress (peserta_id, sku_id, status)
    values (p_peserta_id, p_sku_id, 'belum')
    on conflict (peserta_id, sku_id) do update
      set status = 'belum', penguji_id = null, tanggal_uji = null, jadwal = null, nilai = null, catatan = '',
          catatan_peserta = '', verifikasi = null, diverifikasi_pada = null, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (p_peserta_id, p_sku_id, 'Status dikembalikan ke belum diuji. Alasan: ' || v_cat, p_oleh);
  end if;
end $$;

-- ===== SKU: penilaian dengan instrumen. HANYA dipanggil Edge Function setelah PIN penguji diverifikasi. =====
-- Skor dan saran dihitung ulang di server dari nilai tiap kriteria. Penguji boleh memilih hasil yang berbeda dari saran,
-- dengan catatan alasan wajib (tercatat). Hasil diterapkan lewat sg_sku_catat_internal (status, kode verifikasi, riwayat).
create or replace function public.sg_sku_catat_rubrik_internal(
  p_oleh uuid, p_peserta_id uuid, p_sku_id text, p_tanggal_uji date, p_rincian jsonb, p_hasil text, p_catatan text default ''
) returns jsonb language plpgsql security definer set search_path = public as
$$
declare
  v_p public.profiles; v_cat text := btrim(coalesce(p_catatan, '')); v_h record; v_diganti boolean; v_rinci jsonb;
begin
  if not exists (select 1 from public.profiles where id = p_oleh and role = 'penguji') then
    raise exception 'Hanya Pembina atau Dewan Ambalan yang dapat mencatat hasil.';
  end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Peserta tidak ditemukan.'; end if;
  if not exists (select 1 from public.sku_unit where id = p_sku_id and (agama is null or agama = v_p.agama)) then
    raise exception 'Poin SKU tidak ditemukan.';
  end if;
  if p_hasil is null or p_hasil not in ('lulus', 'ulang') then raise exception 'Hasil penilaian dengan instrumen harus lulus atau perlu diulang.'; end if;
  if p_tanggal_uji is null then raise exception 'Tanggal uji wajib diisi.'; end if;
  if not sigarda.instrumen_aktif(p_sku_id) then raise exception 'Butir ini belum memakai instrumen penilaian.'; end if;
  if char_length(v_cat) > 1000 then raise exception 'Catatan maksimal 1000 karakter.'; end if;

  select * into v_h from sigarda.instrumen_hitung(p_sku_id, p_rincian);
  v_diganti := p_hasil <> v_h.o_saran;
  if v_diganti and v_cat = '' then
    raise exception 'Hasil yang dipilih berbeda dari saran (skor %, saran: %). Isi catatan alasannya.', v_h.o_skor, case v_h.o_saran when 'lulus' then 'lulus' else 'perlu diulang' end;
  end if;

  perform set_config('sigarda.via_rubrik', 'ya', true);
  perform public.sg_sku_catat_internal(p_oleh, p_peserta_id, p_sku_id, p_hasil, p_tanggal_uji, case when p_hasil = 'lulus' then v_h.o_nilai end, v_cat);
  perform set_config('sigarda.via_rubrik', '', true);

  select jsonb_agg(jsonb_build_object('kriteria_id', k.id, 'urutan', k.urutan, 'jenis', k.jenis, 'teks', k.teks, 'bobot', k.bobot, 'wajib', k.wajib, 'nilai', r.nilai) order by k.urutan)
    into v_rinci
  from (select (e ->> 'kriteria_id')::bigint as kriteria_id, (e ->> 'nilai')::int as nilai from jsonb_array_elements(p_rincian) e) r
  join public.instrumen_kriteria k on k.id = r.kriteria_id;

  insert into public.sku_penilaian (peserta_id, sku_id, penguji_id, tanggal_uji, rincian, skor, wajib_ok, saran, hasil, diganti, catatan)
  values (p_peserta_id, p_sku_id, p_oleh, p_tanggal_uji, v_rinci, v_h.o_skor, v_h.o_wajib_ok, v_h.o_saran, p_hasil, v_diganti, v_cat);
  insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
  values (p_peserta_id, p_sku_id,
    'Skor instrumen ' || v_h.o_skor || ' dari 100 (saran: ' || case v_h.o_saran when 'lulus' then 'lulus' else 'perlu diulang' end
    || case when v_h.o_wajib_ok then '' else '; ada syarat wajib belum terpenuhi' end || ')'
    || case when v_diganti then '. Hasil dipilih penguji berbeda dari saran. Alasan: ' || v_cat else '' end, p_oleh);

  return jsonb_build_object('skor', v_h.o_skor, 'saran', v_h.o_saran, 'nilai', v_h.o_nilai, 'wajib_ok', v_h.o_wajib_ok, 'diganti', v_diganti);
end $$;

-- ===== Instrumen penilaian (Pembina dan Admin) =====
-- Menyimpan satu instrumen: cara uji, instruksi penguji, dan daftar kriteria (urutan = urutan dalam array). Kriteria yang menyertakan
-- id diperbarui di tempat (id dipertahankan), yang tanpa id ditambahkan, dan yang tidak ada dalam daftar dihapus.
-- p_kriteria: [{"id":123,"jenis":"Lisan","teks":"...","bobot":1,"wajib":false,"panduan":"..."}]
create or replace function public.sg_instrumen_simpan(p_sku_id text, p_cara_uji text, p_instruksi text, p_kriteria jsonb, p_status text)
returns void language plpgsql security definer set search_path = public as
$$
declare
  v_cara text := btrim(coalesce(p_cara_uji, '')); v_ins text := btrim(coalesce(p_instruksi, ''));
  v_e jsonb; v_n int; v_i int := 0; v_id bigint; v_pertahankan bigint[] := '{}';
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah instrumen.'; end if;
  if p_sku_id is null or not exists (select 1 from public.sku_unit where id = p_sku_id) then raise exception 'Butir SKU tidak ditemukan.'; end if;
  if p_status is null or p_status not in ('draf', 'ditetapkan') then raise exception 'Status instrumen harus draf atau ditetapkan.'; end if;
  if char_length(v_cara) > 300 then raise exception 'Cara uji maksimal 300 karakter.'; end if;
  if char_length(v_ins) > 1500 then raise exception 'Instruksi penguji maksimal 1500 karakter.'; end if;
  if p_kriteria is null or jsonb_typeof(p_kriteria) <> 'array' then raise exception 'Daftar kriteria tidak sah.'; end if;
  v_n := jsonb_array_length(p_kriteria);
  if v_n > 15 then raise exception 'Kriteria maksimal 15 per butir.'; end if;
  if p_status = 'ditetapkan' and v_n = 0 then raise exception 'Instrumen yang ditetapkan harus memiliki minimal satu kriteria.'; end if;

  for v_e in select value from jsonb_array_elements(p_kriteria) loop
    v_i := v_i + 1;
    if jsonb_typeof(v_e) <> 'object' then raise exception 'Kriteria % tidak sah.', v_i; end if;
    if coalesce(v_e ->> 'jenis', '') not in ('Lisan', 'Praktik', 'Bukti kegiatan', 'Pengamatan') then raise exception 'Kriteria %: pilih jenis penilaian.', v_i; end if;
    if char_length(btrim(coalesce(v_e ->> 'teks', ''))) not between 1 and 400 then raise exception 'Kriteria %: teks wajib diisi (maksimal 400 karakter).', v_i; end if;
    if coalesce(v_e ->> 'bobot', '') !~ '^[1-5]$' then raise exception 'Kriteria %: bobot harus 1 sampai 5.', v_i; end if;
    if v_e ? 'wajib' and jsonb_typeof(v_e -> 'wajib') <> 'boolean' then raise exception 'Kriteria %: penanda wajib tidak sah.', v_i; end if;
    if char_length(coalesce(v_e ->> 'panduan', '')) > 1500 then raise exception 'Kriteria %: panduan maksimal 1500 karakter.', v_i; end if;
    if v_e ? 'id' and jsonb_typeof(v_e -> 'id') <> 'null' then
      if coalesce(v_e ->> 'id', '') !~ '^[0-9]{1,18}$' then raise exception 'Kriteria %: id tidak sah.', v_i; end if;
      if not exists (select 1 from public.instrumen_kriteria where id = (v_e ->> 'id')::bigint and sku_id = p_sku_id) then
        raise exception 'Kriteria % tidak ditemukan pada butir ini (mungkin sudah diubah orang lain). Muat ulang.', v_i;
      end if;
      v_pertahankan := v_pertahankan || (v_e ->> 'id')::bigint;
    end if;
  end loop;
  if cardinality(v_pertahankan) <> (select count(distinct x) from unnest(v_pertahankan) x) then raise exception 'Ada kriteria yang ganda.'; end if;

  insert into public.instrumen (sku_id, cara_uji, status, diubah_oleh, diubah_pada) values (p_sku_id, v_cara, p_status, auth.uid(), now())
  on conflict (sku_id) do update set cara_uji = excluded.cara_uji, status = excluded.status, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
  insert into public.instrumen_penguji (sku_id, instruksi) values (p_sku_id, v_ins)
  on conflict (sku_id) do update set instruksi = excluded.instruksi;
  delete from public.instrumen_kriteria where sku_id = p_sku_id and not (id = any (v_pertahankan));

  v_i := 0;
  for v_e in select value from jsonb_array_elements(p_kriteria) loop
    v_i := v_i + 1;
    if v_e ? 'id' and jsonb_typeof(v_e -> 'id') <> 'null' then
      v_id := (v_e ->> 'id')::bigint;
      update public.instrumen_kriteria
        set urutan = v_i, jenis = v_e ->> 'jenis', teks = btrim(v_e ->> 'teks'), bobot = (v_e ->> 'bobot')::int, wajib = coalesce((v_e ->> 'wajib')::boolean, false)
        where id = v_id;
    else
      insert into public.instrumen_kriteria (sku_id, urutan, jenis, teks, bobot, wajib)
      values (p_sku_id, v_i, v_e ->> 'jenis', btrim(v_e ->> 'teks'), (v_e ->> 'bobot')::int, coalesce((v_e ->> 'wajib')::boolean, false))
      returning id into v_id;
    end if;
    insert into public.instrumen_panduan (kriteria_id, panduan) values (v_id, btrim(coalesce(v_e ->> 'panduan', '')))
    on conflict (kriteria_id) do update set panduan = excluded.panduan;
  end loop;
end $$;

-- Menetapkan (dipakai menilai) atau mengembalikan ke draf beberapa instrumen sekaligus.
create or replace function public.sg_instrumen_status(p_sku_ids text[], p_status text) returns void
language plpgsql security definer set search_path = public as
$$
declare v_ids text[]; v_kosong text; v_n int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah status instrumen.'; end if;
  if p_status is null or p_status not in ('draf', 'ditetapkan') then raise exception 'Status instrumen harus draf atau ditetapkan.'; end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_sku_ids, '{}')) x;
  if cardinality(v_ids) = 0 then raise exception 'Pilih minimal satu butir.'; end if;
  if cardinality(v_ids) > 200 then raise exception 'Maksimal 200 butir sekaligus.'; end if;
  if (select count(*) from public.instrumen where sku_id = any (v_ids)) <> cardinality(v_ids) then
    raise exception 'Sebagian butir belum memiliki instrumen.';
  end if;
  if p_status = 'ditetapkan' then
    select string_agg(x, ', ') into v_kosong from unnest(v_ids) x where not exists (select 1 from public.instrumen_kriteria k where k.sku_id = x);
    if v_kosong is not null then raise exception 'Belum memiliki kriteria: %.', v_kosong; end if;
  end if;
  update public.instrumen set status = p_status, diubah_oleh = auth.uid(), diubah_pada = now() where sku_id = any (v_ids);
  get diagnostics v_n = row_count;
end $$;

-- Pengaturan penilaian instrumen: ambang lulus, batas predikat, dan aturan kriteria wajib.
create or replace function public.sg_instrumen_pengaturan_simpan(p_nilai jsonb) returns void
language plpgsql security definer set search_path = public as
$$
declare v_kunci text; v_a int; v_sb int; v_b int; v_c int; v_m int; v_baru jsonb;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah pengaturan instrumen.'; end if;
  if p_nilai is null or jsonb_typeof(p_nilai) <> 'object' then raise exception 'Pengaturan instrumen tidak sah.'; end if;
  foreach v_kunci in array array['ambang', 'pita.sangatBaik', 'pita.baik', 'pita.cukup', 'nilaiWajibMin'] loop
    if coalesce(p_nilai #>> string_to_array(v_kunci, '.'), '') !~ '^[0-9]{1,3}$' then
      raise exception 'Pengaturan instrumen: nilai % harus berupa bilangan bulat.', v_kunci;
    end if;
  end loop;
  if jsonb_typeof(p_nilai -> 'gerbangWajib') is distinct from 'boolean' then raise exception 'Pengaturan instrumen: gerbangWajib harus benar atau salah.'; end if;
  v_a := (p_nilai ->> 'ambang')::int; v_sb := (p_nilai #>> '{pita,sangatBaik}')::int; v_b := (p_nilai #>> '{pita,baik}')::int;
  v_c := (p_nilai #>> '{pita,cukup}')::int; v_m := (p_nilai ->> 'nilaiWajibMin')::int;
  if not (v_sb <= 100 and v_sb > v_b and v_b > v_c and v_c >= 1) then
    raise exception 'Batas nilai harus berurutan: Sangat Baik (maks. 100) lebih besar dari Baik, Baik lebih besar dari Cukup, Cukup minimal 1.';
  end if;
  if v_a < 1 or v_a > 100 then raise exception 'Ambang lulus harus antara 1 dan 100.'; end if;
  if v_m < 2 or v_m > 5 then raise exception 'Nilai minimal kriteria wajib harus antara 2 dan 5.'; end if;
  v_baru := jsonb_build_object('ambang', v_a, 'pita', jsonb_build_object('sangatBaik', v_sb, 'baik', v_b, 'cukup', v_c),
                               'gerbangWajib', (p_nilai ->> 'gerbangWajib')::boolean, 'nilaiWajibMin', v_m);
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada) values ('instrumen.pengaturan', v_baru, auth.uid(), now())
  on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;

alter table public.instrumen enable row level security;
alter table public.instrumen_kriteria enable row level security;
alter table public.instrumen_penguji enable row level security;
alter table public.instrumen_panduan enable row level security;
alter table public.sku_penilaian enable row level security;

drop policy if exists baca_instrumen on public.instrumen;
create policy baca_instrumen on public.instrumen for select to authenticated
  using ((select sigarda.aktif()) and (status = 'ditetapkan' or (select sigarda.pengurus())));
drop policy if exists baca_instrumen_kriteria on public.instrumen_kriteria;
create policy baca_instrumen_kriteria on public.instrumen_kriteria for select to authenticated
  using ((select sigarda.aktif()) and ((select sigarda.pengurus()) or sku_id in (select i.sku_id from public.instrumen i where i.status = 'ditetapkan')));
drop policy if exists baca_instrumen_penguji on public.instrumen_penguji;
create policy baca_instrumen_penguji on public.instrumen_penguji for select to authenticated using ((select sigarda.pengurus()));
drop policy if exists baca_instrumen_panduan on public.instrumen_panduan;
create policy baca_instrumen_panduan on public.instrumen_panduan for select to authenticated using ((select sigarda.pengurus()));
drop policy if exists baca_penilaian on public.sku_penilaian;
create policy baca_penilaian on public.sku_penilaian for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));

revoke all on public.instrumen, public.instrumen_kriteria, public.instrumen_penguji, public.instrumen_panduan, public.sku_penilaian from anon, authenticated;
grant select on public.instrumen, public.instrumen_kriteria, public.instrumen_penguji, public.instrumen_panduan, public.sku_penilaian to authenticated;

revoke all on function
  public.sg_instrumen_simpan(text, text, text, jsonb, text),
  public.sg_instrumen_status(text[], text),
  public.sg_instrumen_pengaturan_simpan(jsonb),
  public.sg_sku_catat_rubrik_internal(uuid, uuid, text, date, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function
  public.sg_instrumen_simpan(text, text, text, jsonb, text),
  public.sg_instrumen_status(text[], text),
  public.sg_instrumen_pengaturan_simpan(jsonb)
  to authenticated;
grant execute on function public.sg_sku_catat_rubrik_internal(uuid, uuid, text, date, jsonb, text, text) to service_role;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
