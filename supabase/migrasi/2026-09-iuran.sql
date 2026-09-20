-- ============================================================================
-- MIGRASI: Iuran bumbung kepramukaan (pencatatan, rekap, tutup kas, asisten bendahara, dan kaitannya dengan penilaian SKU). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi instrumen (dan yang sebelumnya; disarankan setelah 2026-09-indeks-kode-verifikasi.sql). Isi:
--   * Tabel iuran, iuran_log (riwayat perubahan, hanya bertambah), iuran_kas (tutup kas per Jumat), dan asisten_iuran.
--   * Fungsi sg_iuran_set, sg_iuran_set_banyak, sg_iuran_lembar, sg_iuran_agregat, sg_iuran_kas_simpan, sg_asisten_iuran_atur.
--     Iuran hanya dapat dicatat oleh Dewan Ambalan dan asisten bendahara (Penegak Calon Laksana yang ditunjuk); Pembina dan Admin melihat.
--   * sg_absen_hapus_sesi diperbarui: sesi yang sudah memiliki catatan iuran atau tutup kas tidak dapat dihapus sebelum dikosongkan.
--   * Kaitan dengan SKU: kolom instrumen_kriteria.sumber ('manual' atau 'iuran'; hanya butir iuran Bantara 6 dan Laksana 6), fungsi
--     sg_iuran_ringkas, sg_iuran_susulan, sg_iuran_pengaturan, sg_iuran_pengaturan_simpan, serta sg_instrumen_simpan dan
--     sg_sku_catat_rubrik_internal diperbarui (nilai kriteria iuran yang berbeda dari saran hitungan iuran wajib disertai catatan alasan).
--   Hanya sg_sku_catat_rubrik_internal yang dipanggil Edge Function, dan tanda tangannya tidak berubah: Edge Function TIDAK perlu di-deploy ulang.
-- TIDAK mengubah atau menghapus data yang sudah ada. Aman dijalankan berulang kali. Edge Function tidak berubah.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: skema dasar (absensi, profil, fungsi bantu) sudah ada.
do $$
begin
  if to_regclass('public.absensi_sesi') is null or to_regclass('public.profiles') is null
     or to_regprocedure('sigarda.pengurus()') is null or to_regprocedure('sigarda.tingkat_selesai(uuid, text)') is null
     or to_regclass('public.instrumen_kriteria') is null or to_regprocedure('sigarda.instrumen_hitung(text, jsonb)') is null
     or to_regprocedure('public.sg_sku_catat_internal(uuid, uuid, text, text, date, text, text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-instrumen.sql dan 2026-09-verifikasi-sesi.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

alter table public.instrumen_kriteria add column if not exists sumber text not null default 'manual' check (sumber in ('manual','iuran'));

-- ===== Iuran bumbung kepramukaan: tabel =====
-- Dicatat Dewan Ambalan atau asisten bendahara (Penegak Calon Laksana yang ditunjuk) pada sesi latihan Jumat. Satu baris per Penegak per Jumat
-- yang berisi iuran (jumlah > 0); tidak ada baris berarti tidak iuran. Terpisah dari status absensi (yang izin atau sakit boleh menitip).
-- jenis: 'rutin' = dibayar pada Jumat itu; 'susulan' = ditebus belakangan untuk Jumat itu (mis. sekaligus saat ujian SKU).
create table if not exists public.iuran (
  tanggal date not null references public.absensi_sesi(tanggal) on delete cascade,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  jumlah int not null check (jumlah between 1 and 1000000),
  jenis text not null default 'rutin' check (jenis in ('rutin','susulan')),
  oleh uuid references public.profiles(id) on delete set null,
  waktu timestamptz not null default now(),
  primary key (tanggal, peserta_id)
);
create index if not exists iuran_peserta_id_idx on public.iuran (peserta_id);
-- Riwayat setiap perubahan iuran (hanya bertambah). Terbaca pengurus; tidak dapat diubah atau dihapus lewat API.
create table if not exists public.iuran_log (
  id bigint generated always as identity primary key,
  tanggal date not null,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  jumlah_lama int,
  jumlah_baru int,
  jenis text not null,
  oleh uuid references public.profiles(id) on delete set null,
  waktu timestamptz not null default now()
);
create index if not exists iuran_log_tanggal_idx on public.iuran_log (tanggal);
-- Tutup kas per pertemuan: total uang fisik yang dihitung, untuk dicocokkan dengan jumlah catatan iuran.
create table if not exists public.iuran_kas (
  tanggal date primary key references public.absensi_sesi(tanggal) on delete cascade,
  total_fisik int not null check (total_fisik between 0 and 100000000),
  catatan text not null default '' check (char_length(catatan) <= 300),
  oleh uuid references public.profiles(id) on delete set null,
  waktu timestamptz not null default now()
);
-- Asisten bendahara: Penegak yang ditunjuk untuk membantu mencatat iuran (tidak dapat mencatat iurannya sendiri).
create table if not exists public.asisten_iuran (
  peserta_id uuid primary key references public.profiles(id) on delete cascade,
  ditunjuk_oleh uuid references public.profiles(id) on delete set null,
  ditunjuk_pada timestamptz not null default now()
);
-- ===== akhir tabel iuran =====

-- ---- Iuran bumbung: siapa yang boleh mencatat ----
-- Dewan Ambalan (yang sudah mengganti PIN awal)
create or replace function sigarda.dewan() returns boolean language plpgsql stable security definer set search_path = public as
$$ begin return coalesce((select role = 'penguji' and jabatan = 'Dewan Ambalan' and not wajib_ganti_pin from public.profiles where id = auth.uid()), false); end $$;

-- Penegak yang sedang ditunjuk sebagai asisten bendahara
create or replace function sigarda.asisten_iuran() returns boolean language plpgsql stable security definer set search_path = public as
$$
begin
  return coalesce((select p.role = 'peserta' and not p.wajib_ganti_pin and exists (select 1 from public.asisten_iuran a where a.peserta_id = p.id)
                   from public.profiles p where p.id = auth.uid()), false);
end $$;

create or replace function sigarda.pencatat_iuran() returns boolean language plpgsql stable security definer set search_path = public as
$$ begin return sigarda.dewan() or sigarda.asisten_iuran(); end $$;
-- ---- akhir bantu iuran ----

-- ---- Iuran bumbung: perhitungan untuk penilaian SKU (harus sama dengan src/lib/iuranLogic.js; dijaga oleh pengujian) ----
-- Pengaturan tersimpan pada kunci 'iuran.pengaturan': {"standar":1000,"ambang":75,"lima":90,"tiga":65,"dua":50}
--   standar = iuran standar per pertemuan (dasar rekomendasi susulan); ambang = persen pertemuan beriuran yang dianggap rutin (nilai 4);
--   lima, tiga, dua = batas persen untuk nilai 5, 3, 2 (di bawah "dua" = nilai 1).
create or replace function sigarda.iuran_angka(p_kunci text, p_bawaan int) returns int language sql stable security definer set search_path = public as
$$ select coalesce((select (nilai ->> p_kunci)::int from public.pengaturan where kunci = 'iuran.pengaturan' and jsonb_typeof(nilai) = 'object'), p_bawaan) $$;

-- Ringkasan iuran seorang Penegak pada SEMESTER yang memuat p_tanggal (Jul-Des = ganjil, Jan-Jun = genap), dihitung sampai p_tanggal:
-- pertemuan terlaksana, pertemuan beriuran (rutin + susulan), persen (dibulatkan setengah ke atas), target menurut ambang, kekurangan, dan saran nilai 1-5.
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
  v_hingga := least(o_akhir, p_tanggal);
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
-- ---- akhir hitung iuran ----

create or replace function public.sg_absen_hapus_sesi(p_tanggal date) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Tidak diizinkan.'; end if;
  -- Catatan uang tidak boleh hilang diam-diam bersama sesi: iuran dan tutup kas harus dikosongkan lebih dulu oleh Dewan Ambalan
  if exists (select 1 from public.iuran where tanggal = p_tanggal) or exists (select 1 from public.iuran_kas where tanggal = p_tanggal) then
    raise exception 'Sesi ini memiliki catatan iuran atau tutup kas. Dewan Ambalan perlu mengosongkannya lebih dulu sebelum sesi dihapus.';
  end if;
  delete from public.absensi_sesi where tanggal = p_tanggal;   -- catatan kehadiran ikut terhapus (cascade)
end $$;

create or replace function public.sg_instrumen_simpan(p_sku_id text, p_cara_uji text, p_instruksi text, p_kriteria jsonb, p_status text)
returns void language plpgsql security definer set search_path = public as
$$
declare
  v_cara text := btrim(coalesce(p_cara_uji, '')); v_ins text := btrim(coalesce(p_instruksi, ''));
  v_e jsonb; v_n int; v_i int := 0; v_id bigint; v_pertahankan bigint[] := '{}'; v_iuran int := 0;
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
    if coalesce(v_e ->> 'sumber', 'manual') not in ('manual', 'iuran') then raise exception 'Kriteria %: sumber nilai tidak dikenal.', v_i; end if;
    if coalesce(v_e ->> 'sumber', 'manual') = 'iuran' then
      if p_sku_id not in ('BAN-06', 'LAK-06') then raise exception 'Kriteria %: sumber nilai iuran hanya untuk butir iuran (Bantara 6 dan Laksana 6).', v_i; end if;
      v_iuran := v_iuran + 1;
    end if;
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
  if v_iuran > 1 then raise exception 'Hanya satu kriteria yang boleh bersumber iuran.'; end if;

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
        set urutan = v_i, jenis = v_e ->> 'jenis', teks = btrim(v_e ->> 'teks'), bobot = (v_e ->> 'bobot')::int, wajib = coalesce((v_e ->> 'wajib')::boolean, false),
            sumber = coalesce(v_e ->> 'sumber', 'manual')
        where id = v_id;
    else
      insert into public.instrumen_kriteria (sku_id, urutan, jenis, teks, bobot, wajib, sumber)
      values (p_sku_id, v_i, v_e ->> 'jenis', btrim(v_e ->> 'teks'), (v_e ->> 'bobot')::int, coalesce((v_e ->> 'wajib')::boolean, false), coalesce(v_e ->> 'sumber', 'manual'))
      returning id into v_id;
    end if;
    insert into public.instrumen_panduan (kriteria_id, panduan) values (v_id, btrim(coalesce(v_e ->> 'panduan', '')))
    on conflict (kriteria_id) do update set panduan = excluded.panduan;
  end loop;
end $$;

create or replace function public.sg_sku_catat_rubrik_internal(
  p_oleh uuid, p_peserta_id uuid, p_sku_id text, p_tanggal_uji date, p_rincian jsonb, p_hasil text, p_catatan text default ''
) returns jsonb language plpgsql security definer set search_path = public as
$$
declare
  v_p public.profiles; v_cat text := btrim(coalesce(p_catatan, '')); v_h record; v_diganti boolean; v_rinci jsonb; v_saran_iuran int; v_beda_iuran boolean := false;
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
  -- Kriteria bersumber iuran: nilai yang berbeda dari saran hitungan iuran (semester dari tanggal uji) wajib disertai catatan alasan
  select o_saran into v_saran_iuran from sigarda.iuran_hitung(p_peserta_id, p_tanggal_uji);
  if v_saran_iuran is not null then
    select exists (
      select 1 from jsonb_array_elements(p_rincian) e join public.instrumen_kriteria k on k.id = (e ->> 'kriteria_id')::bigint and k.sku_id = p_sku_id
      where k.sumber = 'iuran' and (e ->> 'nilai')::int <> v_saran_iuran
    ) into v_beda_iuran;
    if v_beda_iuran and v_cat = '' then
      raise exception 'Nilai kriteria iuran berbeda dari saran hitungan iuran (saran: %). Isi catatan alasannya.', v_saran_iuran;
    end if;
  end if;

  perform set_config('sigarda.via_rubrik', 'ya', true);
  perform public.sg_sku_catat_internal(p_oleh, p_peserta_id, p_sku_id, p_hasil, p_tanggal_uji, case when p_hasil = 'lulus' then v_h.o_nilai end, v_cat);
  perform set_config('sigarda.via_rubrik', '', true);

  select jsonb_agg(jsonb_build_object('kriteria_id', k.id, 'urutan', k.urutan, 'jenis', k.jenis, 'teks', k.teks, 'bobot', k.bobot, 'wajib', k.wajib, 'nilai', r.nilai,
    'sumber', k.sumber, 'saran', case when k.sumber = 'iuran' then v_saran_iuran end) order by k.urutan)
    into v_rinci
  from (select (e ->> 'kriteria_id')::bigint as kriteria_id, (e ->> 'nilai')::int as nilai from jsonb_array_elements(p_rincian) e) r
  join public.instrumen_kriteria k on k.id = r.kriteria_id;

  insert into public.sku_penilaian (peserta_id, sku_id, penguji_id, tanggal_uji, rincian, skor, wajib_ok, saran, hasil, diganti, catatan)
  values (p_peserta_id, p_sku_id, p_oleh, p_tanggal_uji, v_rinci, v_h.o_skor, v_h.o_wajib_ok, v_h.o_saran, p_hasil, v_diganti, v_cat);
  insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
  values (p_peserta_id, p_sku_id,
    'Skor instrumen ' || v_h.o_skor || ' dari 100 (saran: ' || case v_h.o_saran when 'lulus' then 'lulus' else 'perlu diulang' end
    || case when v_h.o_wajib_ok then '' else '; ada syarat wajib belum terpenuhi' end || ')'
    || case when v_diganti then '. Hasil dipilih penguji berbeda dari saran. Alasan: ' || v_cat else '' end
    || case when v_beda_iuran and not v_diganti then '. Nilai kriteria iuran berbeda dari saran iuran (' || v_saran_iuran || '). Alasan: ' || v_cat else '' end, p_oleh);

  return jsonb_build_object('skor', v_h.o_skor, 'saran', v_h.o_saran, 'nilai', v_h.o_nilai, 'wajib_ok', v_h.o_wajib_ok, 'diganti', v_diganti);
end $$;

-- ===== Iuran bumbung kepramukaan: fungsi aksi =====
-- Mencatat iuran satu Penegak pada satu Jumat. p_jumlah kosong atau 0 = tidak iuran (baris dihapus). Hanya Dewan Ambalan atau asisten bendahara;
-- asisten tidak dapat mencatat iurannya sendiri. Jenis baris baru selalu 'rutin'; baris yang sudah 'susulan' tetap 'susulan' saat jumlahnya diubah.
create or replace function public.sg_iuran_set(p_tanggal date, p_peserta_id uuid, p_jumlah int) returns void
language plpgsql security definer set search_path = public as
$$
declare v_baru int := nullif(p_jumlah, 0); v_lama int; v_jenis text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pencatat_iuran() then raise exception 'Hanya Dewan Ambalan atau asisten bendahara yang dapat mencatat iuran.'; end if;
  if v_baru is not null and (v_baru < 1 or v_baru > 1000000) then raise exception 'Jumlah iuran harus antara Rp 1 dan Rp 1.000.000.'; end if;
  if not exists (select 1 from public.absensi_sesi where tanggal = p_tanggal) then raise exception 'Sesi absensi belum dibuat.'; end if;
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

-- Mengisi iuran yang sama untuk banyak Penegak sekaligus (mis. semua yang hadir). p_hanya_kosong = true: yang sudah berisi iuran tidak diubah.
create or replace function public.sg_iuran_set_banyak(p_tanggal date, p_peserta_ids uuid[], p_jumlah int, p_hanya_kosong boolean default true) returns int
language plpgsql security definer set search_path = public as
$$
declare v_id uuid; v_lama int; v_jenis text; v_n int := 0;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pencatat_iuran() then raise exception 'Hanya Dewan Ambalan atau asisten bendahara yang dapat mencatat iuran.'; end if;
  if p_jumlah is null or p_jumlah < 1 or p_jumlah > 1000000 then raise exception 'Jumlah iuran harus antara Rp 1 dan Rp 1.000.000.'; end if;
  if not exists (select 1 from public.absensi_sesi where tanggal = p_tanggal) then raise exception 'Sesi absensi belum dibuat.'; end if;
  if cardinality(coalesce(p_peserta_ids, '{}')) > 500 then raise exception 'Maksimal 500 peserta per permintaan.'; end if;
  for v_id in select id from public.profiles where role = 'peserta' and id = any (coalesce(p_peserta_ids, '{}')) and id <> auth.uid() loop
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

-- Lembar catat iuran satu Jumat untuk Dewan Ambalan dan asisten bendahara: daftar Penegak (tanpa dirinya sendiri) beserta kehadiran dan iurannya.
-- Asisten (seorang Penegak) tidak boleh membaca profil Penegak lain lewat tabel, jadi daftar ini disediakan fungsi.
create or replace function public.sg_iuran_lembar(p_tanggal date) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pencatat_iuran() then raise exception 'Hanya Dewan Ambalan atau asisten bendahara yang dapat membuka lembar iuran.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'nama', p.nama, 'kelas', p.kelas, 'sangga', p.sangga, 'status', h.status, 'jumlah', i.jumlah, 'jenis', i.jenis)
                     order by p.nama)
    from public.profiles p
    left join public.iuran i on i.peserta_id = p.id and i.tanggal = p_tanggal
    left join public.absensi_hadir h on h.peserta_id = p.id and h.tanggal = p_tanggal
    where p.role = 'peserta' and p.id <> auth.uid()
  ), '[]'::jsonb);
end $$;

-- Rekap iuran untuk SEMUA peran (tanpa rincian per orang): total per Jumat untuk gudep, per sangga, dan per kelas, pada rentang tanggal.
-- 'susulan' = bagian total yang berasal dari iuran susulan; 'orang' = jumlah Penegak yang beriuran.
create or replace function public.sg_iuran_agregat(p_mulai date, p_akhir date) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if p_mulai is null or p_akhir is null or p_mulai > p_akhir or p_akhir - p_mulai > 800 then
    raise exception 'Rentang tanggal tidak valid (maksimal sekitar 2 tahun).';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('tanggal', x.tanggal, 'tipe', x.tipe, 'kunci', x.kunci, 'jumlah', x.jumlah, 'susulan', x.susulan, 'orang', x.orang)
                     order by x.tanggal, x.tipe, x.kunci)
    from (
      select i.tanggal, 'gudep'::text as tipe, ''::text as kunci, sum(i.jumlah)::int as jumlah,
             coalesce(sum(i.jumlah) filter (where i.jenis = 'susulan'), 0)::int as susulan, count(*)::int as orang
        from public.iuran i where i.tanggal between p_mulai and p_akhir group by i.tanggal
      union all
      select i.tanggal, 'sangga', coalesce(p.sangga, ''), sum(i.jumlah)::int,
             coalesce(sum(i.jumlah) filter (where i.jenis = 'susulan'), 0)::int, count(*)::int
        from public.iuran i join public.profiles p on p.id = i.peserta_id where i.tanggal between p_mulai and p_akhir group by i.tanggal, p.sangga
      union all
      select i.tanggal, 'kelas', coalesce(p.kelas, ''), sum(i.jumlah)::int,
             coalesce(sum(i.jumlah) filter (where i.jenis = 'susulan'), 0)::int, count(*)::int
        from public.iuran i join public.profiles p on p.id = i.peserta_id where i.tanggal between p_mulai and p_akhir group by i.tanggal, p.kelas
    ) x
  ), '[]'::jsonb);
end $$;

-- Tutup kas satu Jumat (Dewan Ambalan): total uang fisik yang dihitung. p_total kosong menghapus catatan tutup kas.
create or replace function public.sg_iuran_kas_simpan(p_tanggal date, p_total int, p_catatan text default '') returns void
language plpgsql security definer set search_path = public as
$$
declare v_cat text := btrim(coalesce(p_catatan, ''));
begin
  perform sigarda.wajib_aktif();
  if not sigarda.dewan() then raise exception 'Hanya Dewan Ambalan yang dapat menutup kas.'; end if;
  if not exists (select 1 from public.absensi_sesi where tanggal = p_tanggal) then raise exception 'Sesi absensi belum dibuat.'; end if;
  if p_total is null then
    delete from public.iuran_kas where tanggal = p_tanggal;
    return;
  end if;
  if p_total < 0 or p_total > 100000000 then raise exception 'Total kas tidak valid.'; end if;
  if char_length(v_cat) > 300 then raise exception 'Catatan maksimal 300 karakter.'; end if;
  insert into public.iuran_kas (tanggal, total_fisik, catatan, oleh) values (p_tanggal, p_total, v_cat, auth.uid())
  on conflict (tanggal) do update set total_fisik = excluded.total_fisik, catatan = excluded.catatan, oleh = excluded.oleh, waktu = now();
end $$;

-- Menunjuk atau mencabut asisten bendahara. Oleh Dewan Ambalan atau Pembina. Dipilih dari Penegak Calon Laksana (SKU Bantara selesai,
-- SKU Laksana belum), maksimal 5 orang sekaligus. Pencabutan tidak mensyaratkan apa pun.
create or replace function public.sg_asisten_iuran_atur(p_peserta_id uuid, p_aktif boolean) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not (sigarda.dewan() or coalesce((select role = 'penguji' and jabatan = 'Pembina' from public.profiles where id = auth.uid()), false)) then
    raise exception 'Hanya Dewan Ambalan atau Pembina yang dapat menunjuk asisten bendahara.';
  end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  if p_aktif is true then
    if not sigarda.tingkat_selesai(p_peserta_id, 'Bantara') or sigarda.tingkat_selesai(p_peserta_id, 'Laksana') then
      raise exception 'Asisten bendahara dipilih dari Penegak Calon Laksana (SKU Bantara selesai, SKU Laksana belum).';
    end if;
    if not exists (select 1 from public.asisten_iuran where peserta_id = p_peserta_id) and (select count(*) from public.asisten_iuran) >= 5 then
      raise exception 'Asisten bendahara maksimal 5 orang. Cabut penunjukan yang lain lebih dulu.';
    end if;
    insert into public.asisten_iuran (peserta_id, ditunjuk_oleh) values (p_peserta_id, auth.uid()) on conflict (peserta_id) do nothing;
  else
    delete from public.asisten_iuran where peserta_id = p_peserta_id;
  end if;
end $$;
-- ---- Iuran bumbung dan penilaian SKU (butir Bantara 6 dan Laksana 6) ----
-- Pengaturan iuran untuk semua pengguna aktif (nilai bawaan bila belum pernah diatur).
create or replace function public.sg_iuran_pengaturan() returns jsonb
language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  return jsonb_build_object('standar', sigarda.iuran_angka('standar', 1000), 'ambang', sigarda.iuran_angka('ambang', 75),
    'lima', sigarda.iuran_angka('lima', 90), 'tiga', sigarda.iuran_angka('tiga', 65), 'dua', sigarda.iuran_angka('dua', 50));
end $$;

-- Mengubah pengaturan iuran (Pembina dan Admin): iuran standar Rp 500-50.000 (kelipatan Rp 500), ambang rutin, dan batas nilai 5/3/2.
create or replace function public.sg_iuran_pengaturan_simpan(p_nilai jsonb) returns void
language plpgsql security definer set search_path = public as
$$
declare v_k text; v_st int; v_amb int; v_lima int; v_tiga int; v_dua int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah pengaturan iuran.'; end if;
  if p_nilai is null or jsonb_typeof(p_nilai) <> 'object' then raise exception 'Pengaturan iuran tidak sah.'; end if;
  foreach v_k in array array['standar', 'ambang', 'lima', 'tiga', 'dua'] loop
    if coalesce(p_nilai ->> v_k, '') !~ '^[0-9]{1,6}$' then raise exception 'Pengaturan iuran: % harus bilangan bulat.', v_k; end if;
  end loop;
  v_st := (p_nilai ->> 'standar')::int; v_amb := (p_nilai ->> 'ambang')::int; v_lima := (p_nilai ->> 'lima')::int;
  v_tiga := (p_nilai ->> 'tiga')::int; v_dua := (p_nilai ->> 'dua')::int;
  if v_st < 500 or v_st > 50000 or v_st % 500 <> 0 then raise exception 'Iuran standar harus kelipatan Rp 500 antara Rp 500 dan Rp 50.000.'; end if;
  if not (v_lima <= 100 and v_lima > v_amb and v_amb > v_tiga and v_tiga > v_dua and v_dua >= 1) then
    raise exception 'Batas persen harus berurutan: nilai 5 (maks. 100) lebih besar dari ambang rutin, ambang lebih besar dari nilai 3, nilai 3 lebih besar dari nilai 2, nilai 2 minimal 1.';
  end if;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada)
  values ('iuran.pengaturan', jsonb_build_object('standar', v_st, 'ambang', v_amb, 'lima', v_lima, 'tiga', v_tiga, 'dua', v_dua), auth.uid(), now())
  on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;

-- Ringkasan iuran seorang Penegak untuk lembar penilaian butir iuran (pengurus): kepatuhan semester dari tanggal uji, kekurangan, saran nilai,
-- Jumat yang masih kosong (untuk iuran susulan, terlama dulu), dan berapa Jumat ia membantu mencatat sebagai asisten bendahara.
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
    where s.tanggal between h.o_mulai and least(h.o_akhir, p_tanggal)
      and not exists (select 1 from public.iuran i where i.tanggal = s.tanggal and i.peserta_id = p_peserta_id);
  select count(distinct l.tanggal)::int into v_membantu from public.iuran_log l where l.oleh = p_peserta_id;
  return jsonb_build_object('mulai', h.o_mulai, 'akhir', h.o_akhir, 'pertemuan', h.o_pertemuan, 'kali', h.o_kali, 'susulan', h.o_susulan,
    'rutin', h.o_kali - h.o_susulan, 'persen', h.o_persen, 'target', h.o_target, 'kurang', h.o_kurang, 'saran', h.o_saran,
    'membantu', v_membantu, 'kosong', v_kosong,
    'pengaturan', jsonb_build_object('standar', sigarda.iuran_angka('standar', 1000), 'ambang', sigarda.iuran_angka('ambang', 75),
      'lima', sigarda.iuran_angka('lima', 90), 'tiga', sigarda.iuran_angka('tiga', 65), 'dua', sigarda.iuran_angka('dua', 50)));
end $$;

-- Iuran susulan (Dewan Ambalan): menebus Jumat yang kosong pada semester dari tanggal uji, TERLAMA DULU, masing-masing p_jumlah, paling banyak
-- p_pertemuan Jumat. Baris ditandai 'susulan' dan dihitung setara dengan iuran rutin. Mengembalikan jumlah Jumat yang terisi.
create or replace function public.sg_iuran_susulan(p_peserta_id uuid, p_tanggal date, p_jumlah int, p_pertemuan int) returns int
language plpgsql security definer set search_path = public as
$$
declare h record; v_t date; v_n int := 0;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.dewan() then raise exception 'Hanya Dewan Ambalan yang dapat mencatat iuran susulan.'; end if;
  if p_tanggal is null then raise exception 'Tanggal uji wajib diisi.'; end if;
  if p_jumlah is null or p_jumlah < 1 or p_jumlah > 1000000 then raise exception 'Jumlah iuran harus antara Rp 1 dan Rp 1.000.000.'; end if;
  if p_pertemuan is null or p_pertemuan < 1 or p_pertemuan > 60 then raise exception 'Jumlah pertemuan susulan harus antara 1 dan 60.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  select * into h from sigarda.iuran_hitung(p_peserta_id, p_tanggal);
  for v_t in
    select s.tanggal from public.absensi_sesi s
    where s.tanggal between h.o_mulai and least(h.o_akhir, p_tanggal, sigarda.hari_ini())
      and not exists (select 1 from public.iuran i where i.tanggal = s.tanggal and i.peserta_id = p_peserta_id)
    order by s.tanggal limit p_pertemuan
  loop
    insert into public.iuran (tanggal, peserta_id, jumlah, jenis, oleh) values (v_t, p_peserta_id, p_jumlah, 'susulan', auth.uid());
    insert into public.iuran_log (tanggal, peserta_id, jumlah_lama, jumlah_baru, jenis, oleh) values (v_t, p_peserta_id, null, p_jumlah, 'susulan', auth.uid());
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Tidak ada pertemuan tanpa iuran yang dapat ditebus pada semester ini.'; end if;
  return v_n;
end $$;
-- ===== akhir fungsi iuran =====

alter table public.iuran enable row level security;
alter table public.iuran_log enable row level security;
alter table public.iuran_kas enable row level security;
alter table public.asisten_iuran enable row level security;

-- Iuran: Penegak hanya melihat miliknya; pengurus (Dewan, Pembina, Admin) melihat semua. Asisten bendahara memakai sg_iuran_lembar
-- (tanpa membaca tabel). Rekap agregat untuk semua peran lewat sg_iuran_agregat.
drop policy if exists baca_iuran on public.iuran;
create policy baca_iuran on public.iuran for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
drop policy if exists baca_iuran_log on public.iuran_log;
create policy baca_iuran_log on public.iuran_log for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));
drop policy if exists baca_iuran_kas on public.iuran_kas;
create policy baca_iuran_kas on public.iuran_kas for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));
drop policy if exists baca_asisten_iuran on public.asisten_iuran;
create policy baca_asisten_iuran on public.asisten_iuran for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));

revoke all on public.iuran, public.iuran_log, public.iuran_kas, public.asisten_iuran from anon, authenticated;
grant select on public.iuran, public.iuran_log, public.iuran_kas, public.asisten_iuran to authenticated;

revoke all on function
  public.sg_iuran_set(date, uuid, int), public.sg_iuran_set_banyak(date, uuid[], int, boolean), public.sg_iuran_lembar(date),
  public.sg_iuran_agregat(date, date), public.sg_iuran_kas_simpan(date, int, text), public.sg_asisten_iuran_atur(uuid, boolean),
  public.sg_iuran_pengaturan(), public.sg_iuran_pengaturan_simpan(jsonb), public.sg_iuran_ringkas(uuid, date), public.sg_iuran_susulan(uuid, date, int, int)
  from public, anon, authenticated;
grant execute on function
  public.sg_iuran_set(date, uuid, int), public.sg_iuran_set_banyak(date, uuid[], int, boolean), public.sg_iuran_lembar(date),
  public.sg_iuran_agregat(date, date), public.sg_iuran_kas_simpan(date, int, text), public.sg_asisten_iuran_atur(uuid, boolean),
  public.sg_iuran_pengaturan(), public.sg_iuran_pengaturan_simpan(jsonb), public.sg_iuran_ringkas(uuid, date), public.sg_iuran_susulan(uuid, date, int, int)
  to authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
