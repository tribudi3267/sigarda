-- ============================================================================
-- MIGRASI: Jabatan Dewan Ambalan (Pradana dan Pradani diambil dari anggota) dan QR verifikasi Berita Acara Sidang. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi data gudep. Isi:
--   * profiles.jabatan_dewan: jabatan anggota Dewan Ambalan (Pradana, Pradani, Wakil Pradana, Wakil Pradani, Sekretaris, Bendahara; boleh kosong).
--     Pradana dan Pradani masing-masing hanya satu pemegang. sg_anggota_jabatan_dewan_atur: Admin Gudep mengatur jabatan (semua atau tidak sama sekali).
--   * sigarda.ketua_sidang dan sg_sidang_simpan (diterbitkan ulang di sini agar migrasi ini berdiri sendiri, juga bila migrasi data-gudep yang dijalankan
--     adalah versi awal tanpa sigarda.ketua_sidang): ketua sidang pada berita acara = anggota Dewan Ambalan berjabatan Pradana (sebutan "Pradana Dewan Ambalan").
--     Belum ada Pradana: pengaturan lama sidang.nama_ketua dan sidang.sebutan_ketua dipakai sebagai cadangan.
--   * sg_gudep_simpan: Pradana dan Pradani tidak lagi disimpan pada Data Gudep (kunci lama tetap diterima tetapi diabaikan).
--     Nama Pradana/Pradani yang sudah tersimpan di Data Gudep tidak dipakai lagi: tetapkan jabatan pada anggota Dewan Ambalan yang bersangkutan.
--   * sidang_dk.token dan sidang_dk.kode, sg_sidang_token: berita acara memuat QR verifikasi (token dibuat saat pertama dicetak, cetak ulang sama).
--     sg_verifikasi_token dan sg_verifikasi_kode ikut menjawab berita acara sidang. Catatan sidang yang dihapus tidak lagi dijawab.
--   Tanda tangan fungsi yang dipanggil Edge Function tidak berubah: Edge Function TIDAK perlu di-deploy ulang.
-- TIDAK menghapus data yang ada. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: skema dasar dan migrasi data gudep sudah ada. Pesan galat menyebut apa yang belum ada.
do $$
declare v_kurang text[] := '{}';
begin
  if to_regclass('public.pengaturan') is null then v_kurang := array_append(v_kurang, 'tabel pengaturan'); end if;
  if to_regclass('public.dokumen_terbit') is null then v_kurang := array_append(v_kurang, 'tabel dokumen_terbit (migrasi dokumen)'); end if;
  if to_regclass('public.sidang_dk') is null then v_kurang := array_append(v_kurang, 'tabel sidang_dk'); end if;
  if to_regprocedure('public.sg_gudep_simpan(jsonb)') is null then v_kurang := array_append(v_kurang, 'fungsi sg_gudep_simpan (migrasi data-gudep)'); end if;
  if to_regprocedure('sigarda.wajib_admin(text)') is null then v_kurang := array_append(v_kurang, 'fungsi sigarda.wajib_admin (migrasi penugasan)'); end if;
  if to_regprocedure('sigarda.token_acak()') is null then v_kurang := array_append(v_kurang, 'fungsi sigarda.token_acak (migrasi verifikasi-sesi)'); end if;
  if cardinality(v_kurang) > 0 then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-data-gudep.sql (lihat README), baru migrasi ini. Yang belum ada: %', array_to_string(v_kurang, '; ');
  end if;
end $$;

alter table public.profiles add column if not exists jabatan_dewan text
  check (jabatan_dewan in ('Pradana','Pradani','Wakil Pradana','Wakil Pradani','Sekretaris','Bendahara'));
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profil_jabatan_dewan') then
    alter table public.profiles add constraint profil_jabatan_dewan
      check (jabatan_dewan is null or (role = 'penguji' and jabatan = 'Dewan Ambalan'));
  end if;
end $$;
create unique index if not exists profil_pradana_pradani_unik on public.profiles (jabatan_dewan) where jabatan_dewan in ('Pradana','Pradani');

alter table public.sidang_dk add column if not exists token text unique check (token ~ '^[0-9a-f]{32}$');
alter table public.sidang_dk add column if not exists kode text check (kode ~ '^VRF-[0-9A-F]{7}$');
create index if not exists sidang_dk_kode_idx on public.sidang_dk (kode);

-- ===== Jabatan Dewan Ambalan: fungsi =====
-- Jabatan Dewan Ambalan (Pradana, Pradani, Wakil Pradana, Wakil Pradani, Sekretaris, Bendahara), oleh Admin Gudep. p_data = [{"username": "andi", "jabatan": "Pradana"}, ...];
-- jabatan kosong menghapus jabatan. Hanya untuk anggota Dewan Ambalan. Pradana dan Pradani hanya satu pemegang: pemegang lama harus dikosongkan lebih dulu
-- (boleh pada permintaan yang sama, mis. [{"username": "lama", "jabatan": ""}, {"username": "baru", "jabatan": "Pradana"}]). Semua atau tidak sama sekali.
-- Pradana menjadi ketua sidang; Pradana dan Pradani menandatangani Surat Tanda Lulus. Mengembalikan jumlah anggota yang diperbarui.
create or replace function public.sg_anggota_jabatan_dewan_atur(p_data jsonb) returns int
language plpgsql security definer set search_path = public as
$$
declare v_e jsonb; v_user text; v_jab text; v_n int := 0; v_k int; v_lain text;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengubah jabatan Dewan Ambalan.');
  if p_data is null or jsonb_typeof(p_data) <> 'array' then raise exception 'Data jabatan tidak valid.'; end if;
  if jsonb_array_length(p_data) > 100 then raise exception 'Maksimal 100 baris jabatan per permintaan.'; end if;
  for v_e in select * from jsonb_array_elements(p_data) loop
    v_user := lower(btrim(coalesce(v_e ->> 'username', '')));
    v_jab := sigarda.rapikan(coalesce(v_e ->> 'jabatan', ''));
    if v_user = '' then raise exception 'Nama pengguna anggota Dewan Ambalan wajib diisi.'; end if;
    if v_jab <> '' and v_jab not in ('Pradana','Pradani','Wakil Pradana','Wakil Pradani','Sekretaris','Bendahara') then
      raise exception 'Jabatan Dewan Ambalan "%" tidak dikenal.', v_jab;
    end if;
    if not exists (select 1 from public.profiles where username = v_user and role = 'penguji' and jabatan = 'Dewan Ambalan') then
      raise exception 'Anggota "%" bukan Dewan Ambalan.', v_user;
    end if;
    if v_jab in ('Pradana', 'Pradani') then
      select nama into v_lain from public.profiles where jabatan_dewan = v_jab and username <> v_user limit 1;
      if found then raise exception '% sudah dijabat oleh %. Kosongkan jabatan itu lebih dulu.', v_jab, v_lain; end if;
    end if;
    update public.profiles set jabatan_dewan = nullif(v_jab, '') where username = v_user and role = 'penguji' and jabatan = 'Dewan Ambalan';
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end loop;
  return v_n;
end $$;

-- Berita acara sidang memuat QR verifikasi. Token dan kode dibuat saat berita acara pertama kali dicetak (idempoten: cetak ulang memakai yang sama).
-- Dewan Ambalan, Pembina, dan Admin Gudep. Mengembalikan { token, kode }. Token dijawab sg_verifikasi_token; kode dijawab sg_verifikasi_kode.
create or replace function public.sg_sidang_token(p_id int) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare v_s public.sidang_dk; v_token text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau Admin Gudep yang dapat mencetak berita acara.'; end if;
  select * into v_s from public.sidang_dk where id = p_id;
  if not found then raise exception 'Catatan sidang tidak ditemukan.'; end if;
  if v_s.token is null then
    v_token := sigarda.token_acak();
    update public.sidang_dk set token = v_token, kode = sigarda.kode_verifikasi(array[v_token, 'berita_acara_sidang', v_s.nomor_ba])
    where id = p_id and token is null;
    select * into v_s from public.sidang_dk where id = p_id;
  end if;
  return jsonb_build_object('token', v_s.token, 'kode', v_s.kode);
end $$;
-- ===== akhir fungsi jabatan dewan =====

create or replace function sigarda.ketua_sidang(out o_nama text, out o_sebutan text) language plpgsql stable security definer set search_path = public as
$$
begin
  select sigarda.rapikan(nama), 'Pradana Dewan Ambalan' into o_nama, o_sebutan
  from public.profiles where role = 'penguji' and jabatan = 'Dewan Ambalan' and jabatan_dewan = 'Pradana' limit 1;
  if not found then
    o_nama := sigarda.pengaturan_teks('sidang.nama_ketua', '');
    o_sebutan := sigarda.pengaturan_teks('sidang.sebutan_ketua', 'Ketua Dewan Penegak / Pemangku Adat');
  end if;
end $$;

create or replace function public.sg_sidang_simpan(
  p_peserta_id uuid, p_tingkat text, p_tanggal date, p_keputusan text,
  p_magang text, p_tugas_adat text, p_tugas_adat_ket text, p_catatan text,
  p_nomor_manual text default null, p_nta text default null
) returns int language plpgsql security definer set search_path = public as
$$
declare
  v_p public.profiles; v_lulus int; v_total int; v_belum text[]; v_selesai boolean;
  v_ket text := sigarda.rapikan(p_tugas_adat_ket); v_cat text := btrim(coalesce(p_catatan, ''));
  v_manual text := sigarda.rapikan(p_nomor_manual); v_nta text := sigarda.rapikan(p_nta);
  v_tahun int; v_urut int; v_nomor text; v_id int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau Admin Gudep yang dapat mencatat keputusan sidang.'; end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Peserta tidak ditemukan.'; end if;
  if p_tingkat is null or p_tingkat not in ('Bantara', 'Laksana') then raise exception 'Tingkat SKU tidak dikenal.'; end if;
  if p_tanggal is null or p_tanggal < date '2000-01-01' or p_tanggal > sigarda.hari_ini() then
    raise exception 'Tanggal sidang tidak valid (tidak boleh melewati hari ini).';
  end if;
  if p_keputusan is null or p_keputusan not in ('layak', 'tunda') then raise exception 'Pilih keputusan sidang.'; end if;
  if p_magang is null or p_magang not in ('memenuhi', 'tidak') then raise exception 'Pilih hasil pemeriksaan masa magang atau masa tamu ambalan.'; end if;
  if p_tugas_adat is null or p_tugas_adat not in ('lulus', 'tidak') then raise exception 'Pilih hasil tugas tambahan adat ambalan.'; end if;
  if char_length(v_ket) > 60 then raise exception 'Jenis tugas adat maksimal 60 karakter.'; end if;
  if char_length(v_cat) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;
  if v_nta <> '' and v_nta !~ '^[0-9A-Za-z./ -]{1,40}$' then raise exception 'NTA hanya boleh berisi huruf, angka, spasi, dan tanda / . - (maksimal 40 karakter).'; end if;

  select coalesce(array_agg(u.id order by u.id) filter (where coalesce(g.status, 'belum') <> 'lulus'), '{}')
    into v_belum
  from public.sku_unit u
  left join public.sku_progress g on g.sku_id = u.id and g.peserta_id = p_peserta_id
  where u.tingkat = p_tingkat and (u.agama is null or u.agama = v_p.agama);
  -- Capaian dihitung per BUTIR (butir agama lulus bila seluruh sub-butirnya lulus), sama dengan hitungProgres di aplikasi
  select count(*) filter (where b.lulus), count(*) into v_lulus, v_total from (
    select bool_and(coalesce(g.status, 'belum') = 'lulus') as lulus
    from public.sku_unit u
    left join public.sku_progress g on g.sku_id = u.id and g.peserta_id = p_peserta_id
    where u.tingkat = p_tingkat and (u.agama is null or u.agama = v_p.agama)
    group by u.butir_id
  ) b;
  v_selesai := v_total > 0 and v_lulus = v_total;

  if p_keputusan = 'layak' then
    if not v_selesai then
      raise exception 'Belum dapat dinyatakan Layak dan Lulus: capaian SKU % baru % dari % butir.', p_tingkat, v_lulus, v_total;
    end if;
    if exists (select 1 from public.sidang_dk where peserta_id = p_peserta_id and tingkat = p_tingkat and keputusan = 'layak') then
      raise exception 'Peserta ini sudah dinyatakan Layak dan Lulus untuk SKU % pada sidang sebelumnya.', p_tingkat;
    end if;
  elsif cardinality(v_belum) = 0 and v_cat = '' then
    raise exception 'Seluruh butir sudah lulus; isi catatan alasan penundaan.';
  end if;

  v_tahun := extract(year from p_tanggal)::int;
  if v_manual <> '' then
    if char_length(v_manual) > 80 then raise exception 'Nomor berita acara maksimal 80 karakter.'; end if;
    v_nomor := v_manual;
    v_urut := null;
  else
    insert into public.sidang_urut as s (tahun, terakhir) values (v_tahun, 1)
    on conflict (tahun) do update set terakhir = s.terakhir + 1
    returning s.terakhir into v_urut;
    v_nomor := sigarda.format_nomor(sigarda.pengaturan_teks('sidang.format_nomor', '{no3}/DK/{tahun}'), v_urut, p_tanggal, p_tingkat);
  end if;
  if exists (select 1 from public.sidang_dk where nomor_ba = v_nomor) then
    raise exception 'Nomor berita acara % sudah dipakai.', v_nomor;
  end if;

  insert into public.sidang_dk (
    peserta_id, tingkat, tanggal, keputusan, magang, tugas_adat, tugas_adat_ket, catatan, nomor_ba, nomor_urut,
    capaian_lulus, capaian_total, butir_belum, nta, ketua_nama, ketua_sebutan, dibuat_oleh
  ) values (
    p_peserta_id, p_tingkat, p_tanggal, p_keputusan, p_magang, p_tugas_adat, v_ket, v_cat, v_nomor, v_urut,
    v_lulus, v_total, v_belum, coalesce(nullif(v_nta, ''), coalesce(v_p.nta, '')),
    (select o_nama from sigarda.ketua_sidang()),
    (select o_sebutan from sigarda.ketua_sidang()),
    auth.uid()
  ) returning id into v_id;

  -- NTA yang diisi saat sidang disimpan ke profil agar terisi otomatis pada sidang berikutnya
  if v_nta <> '' and v_nta is distinct from v_p.nta then update public.profiles set nta = v_nta where id = p_peserta_id; end if;
  return v_id;
end $$;

create or replace function public.sg_gudep_simpan(p_nilai jsonb) returns void
language plpgsql security definer set search_path = public as
$$
declare
  v_teks text[] := array['nama', 'singkat', 'sekolah', 'alamat', 'kota', 'nomorGudep', 'kwarran', 'kwarcab', 'kodeSurat', 'telepon', 'email'];
  v_orang text[] := array['pembina', 'kamabigus', 'pradana', 'pradani'];
  v_batas jsonb := '{"nama":120,"singkat":120,"sekolah":120,"alamat":200,"kota":60,"nomorGudep":40,"kwarran":80,"kwarcab":80,"kodeSurat":30,"telepon":40,"email":100}';
  v_baru jsonb := '{}'::jsonb; v_o jsonb; v_h jsonb; v_k text; v_f text; v_v text;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengubah data gudep.');
  if p_nilai is null or jsonb_typeof(p_nilai) <> 'object' then raise exception 'Data gudep tidak sah.'; end if;
  for v_k in select jsonb_object_keys(p_nilai) loop
    if not (v_k = any (v_teks) or v_k = any (v_orang)) then raise exception 'Isian "%" tidak dikenal.', v_k; end if;
  end loop;

  foreach v_k in array v_teks loop
    if p_nilai -> v_k is not null and jsonb_typeof(p_nilai -> v_k) not in ('string', 'null') then raise exception 'Isian "%" harus berupa teks.', v_k; end if;
    v_v := sigarda.rapikan(p_nilai ->> v_k);
    if char_length(v_v) > (v_batas ->> v_k)::int then raise exception 'Isian "%" maksimal % karakter.', v_k, v_batas ->> v_k; end if;
    if v_k in ('nama', 'singkat', 'sekolah', 'kota') and v_v = '' then raise exception 'Isian "%" wajib diisi.', v_k; end if;
    if v_k = 'kodeSurat' and v_v !~ '^[A-Za-z0-9._/-]*$' then raise exception 'Kode surat hanya boleh berisi huruf, angka, dan tanda . _ / -.'; end if;
    if v_k = 'telepon' and v_v !~ '^[0-9 +()./-]*$' then raise exception 'Telepon hanya boleh berisi angka, spasi, dan tanda + ( ) . / -.'; end if;
    if v_k = 'email' and v_v <> '' and v_v !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then raise exception 'Alamat email tidak sah.'; end if;
    v_baru := v_baru || jsonb_build_object(v_k, v_v);
  end loop;

  foreach v_k in array v_orang loop
    v_o := coalesce(p_nilai -> v_k, '{}'::jsonb);
    if jsonb_typeof(v_o) <> 'object' then raise exception 'Isian "%" tidak sah.', v_k; end if;
    v_h := '{}'::jsonb;
    for v_f in select jsonb_object_keys(v_o) loop
      if v_f not in ('jabatan', 'nama', 'nta', 'nip') then raise exception 'Isian "%.%" tidak dikenal.', v_k, v_f; end if;
    end loop;
    foreach v_f in array array['jabatan', 'nama', 'nta', 'nip'] loop
      if v_o -> v_f is not null and jsonb_typeof(v_o -> v_f) not in ('string', 'null') then raise exception 'Isian "%.%" harus berupa teks.', v_k, v_f; end if;
      v_v := sigarda.rapikan(v_o ->> v_f);
      if v_f = 'jabatan' and char_length(v_v) > 80 then raise exception 'Jabatan % maksimal 80 karakter.', v_k; end if;
      if v_f = 'nama' and char_length(v_v) > 120 then raise exception 'Nama % maksimal 120 karakter.', v_k; end if;
      if v_f in ('nta', 'nip') and v_v !~ '^[0-9A-Za-z./ -]{0,40}$' then raise exception '% % hanya boleh berisi huruf, angka, spasi, dan tanda / . - (maksimal 40 karakter).', upper(v_f), v_k; end if;
      v_h := v_h || jsonb_build_object(v_f, v_v);
    end loop;
    if v_k = 'pembina' and (v_h ->> 'nama' = '' or v_h ->> 'jabatan' = '') then raise exception 'Nama dan jabatan Pembina Gudep wajib diisi.'; end if;
    if v_k in ('pembina', 'kamabigus') then v_baru := v_baru || jsonb_build_object(v_k, v_h); end if;
  end loop;

  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada) values ('gudep.data', v_baru, auth.uid(), now())
  on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;

create or replace function public.sg_verifikasi_token(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare
  v_t text := lower(btrim(coalesce(p_token, ''))); v_g public.sku_progress; v_s public.sertifikat_tingkat; v_unit public.sku_unit;
  v_nama text; v_agama text; v_pen text; v_jab text; v_pen_id uuid; v_tgl date; v_total int; v_d public.dokumen_terbit;
  v_b public.sidang_dk; v_nis text; v_kelas text; v_pembina text;
begin
  if v_t !~ '^[0-9a-f]{32}$' then return jsonb_build_object('ditemukan', false); end if;

  select * into v_g from public.sku_progress where verifikasi_token = v_t and status = 'lulus';
  if found then
    select nama into v_nama from public.profiles where id = v_g.peserta_id;
    select * into v_unit from public.sku_unit where id = v_g.sku_id;
    select nama, jabatan into v_pen, v_jab from public.profiles where id = v_g.penguji_id;
    return jsonb_build_object('ditemukan', true, 'jenis', 'butir', 'nama', v_nama, 'sku_id', v_g.sku_id, 'tingkat', v_unit.tingkat,
      'butir_no', v_unit.butir_no, 'sub', v_unit.sub, 'tanggal', v_g.tanggal_uji, 'penguji', v_pen, 'jabatan_penguji', v_jab, 'kode', v_g.verifikasi);
  end if;

  select * into v_s from public.sertifikat_tingkat where token = v_t;
  if found and sigarda.tingkat_selesai(v_s.peserta_id, v_s.tingkat) then
    select nama, agama into v_nama, v_agama from public.profiles where id = v_s.peserta_id;
    select count(distinct u.butir_id) into v_total from public.sku_unit u where u.tingkat = v_s.tingkat and (u.agama is null or u.agama = v_agama);
    select g.tanggal_uji, g.penguji_id into v_tgl, v_pen_id
    from public.sku_progress g join public.sku_unit u on u.id = g.sku_id
    where g.peserta_id = v_s.peserta_id and u.tingkat = v_s.tingkat and g.status = 'lulus'
    order by g.tanggal_uji desc nulls last, g.diubah desc limit 1;
    select nama, jabatan into v_pen, v_jab from public.profiles where id = v_pen_id;
    return jsonb_build_object('ditemukan', true, 'jenis', 'tingkat', 'nama', v_nama, 'tingkat', v_s.tingkat, 'jumlah_butir', v_total,
      'tanggal', v_tgl, 'penguji', v_pen, 'jabatan_penguji', v_jab, 'diterbitkan', v_s.diterbitkan_pada);
  end if;

  -- Dokumen terbit (surat pengantar agama, dst.): dokumen yang dicabut tetap dijawab, tetapi ditandai dicabut dan tanpa data Penegak.
  select * into v_d from public.dokumen_terbit where token = v_t;
  if found then
    if v_d.dicabut_pada is not null then
      return jsonb_build_object('ditemukan', true, 'jenis', 'dokumen', 'jenis_dokumen', v_d.jenis, 'nomor', v_d.nomor, 'dicabut', true, 'dicabut_pada', v_d.dicabut_pada);
    end if;
    return jsonb_build_object('ditemukan', true, 'jenis', 'dokumen', 'jenis_dokumen', v_d.jenis, 'dicabut', false, 'nomor', v_d.nomor, 'tanggal', v_d.tanggal,
      'penerbit', v_d.penerbit, 'dibuat_oleh', v_d.dibuat_oleh_nama, 'jabatan_pembuat', v_d.dibuat_oleh_jabatan,
      'penanda_tangan', v_d.penanda_tangan_nama, 'jabatan_penanda_tangan', v_d.penanda_tangan_jabatan,
      'nama', v_d.peserta_nama, 'nis', v_d.payload ->> 'nis', 'kelas', v_d.payload ->> 'kelas', 'agama', v_d.payload ->> 'agama',
      'guru', v_d.payload -> 'guru' ->> 'nama', 'butir', coalesce(v_d.payload -> 'butir', '[]'::jsonb), 'kode', v_d.kode, 'diterbitkan', v_d.dibuat_pada);
  end if;

  -- Berita acara sidang (token dibuat saat dicetak). Catatan sidang yang dihapus tidak lagi dijawab.
  select * into v_b from public.sidang_dk where token = v_t;
  if found then
    select nama, nis, kelas into v_nama, v_nis, v_kelas from public.profiles where id = v_b.peserta_id;
    select nama, jabatan into v_pen, v_jab from public.profiles where id = v_b.dibuat_oleh;
    select nilai #>> '{pembina,nama}' into v_pembina from public.pengaturan where kunci = 'gudep.data';
    return jsonb_build_object('ditemukan', true, 'jenis', 'dokumen', 'jenis_dokumen', 'berita_acara_sidang', 'dicabut', false, 'nomor', v_b.nomor_ba, 'tanggal', v_b.tanggal,
      'dibuat_oleh', v_pen, 'jabatan_pembuat', v_jab, 'penanda_tangan', nullif(v_b.ketua_nama, ''), 'jabatan_penanda_tangan', v_b.ketua_sebutan, 'pembina', nullif(v_pembina, ''),
      'nama', v_nama, 'nis', v_nis, 'kelas', v_kelas, 'tingkat', v_b.tingkat, 'keputusan', v_b.keputusan, 'kode', v_b.kode, 'diterbitkan', v_b.dibuat_pada);
  end if;
  return jsonb_build_object('ditemukan', false);
end $$;

create or replace function public.sg_verifikasi_kode(p_kode text) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare v_k text := upper(btrim(coalesce(p_kode, ''))); v_tingkat text; v_no int; v_tgl date; v_d public.dokumen_terbit; v_b public.sidang_dk;
begin
  if v_k !~ '^VRF-[0-9A-F]{7}$' then return jsonb_build_object('ditemukan', false); end if;
  select u.tingkat, u.butir_no, g.tanggal_uji into v_tingkat, v_no, v_tgl
  from public.sku_progress g join public.sku_unit u on u.id = g.sku_id
  where g.verifikasi = v_k and g.status = 'lulus' order by g.tanggal_uji nulls last limit 1;
  if not found then
    -- Kode dokumen terbit: hanya jenis, nomor, tanggal, dan status (tanpa nama)
    select * into v_d from public.dokumen_terbit where kode = v_k order by dibuat_pada limit 1;
    if not found then
      select * into v_b from public.sidang_dk where kode = v_k order by dibuat_pada limit 1;
      if not found then return jsonb_build_object('ditemukan', false); end if;
      return jsonb_build_object('ditemukan', true, 'jenis', 'dokumen', 'jenis_dokumen', 'berita_acara_sidang', 'nomor', v_b.nomor_ba, 'tanggal', v_b.tanggal, 'dicabut', false);
    end if;
    return jsonb_build_object('ditemukan', true, 'jenis', 'dokumen', 'jenis_dokumen', v_d.jenis, 'nomor', v_d.nomor, 'tanggal', v_d.tanggal, 'dicabut', v_d.dicabut_pada is not null);
  end if;
  return jsonb_build_object('ditemukan', true, 'tingkat', v_tingkat, 'butir_no', v_no, 'tanggal', v_tgl);
end $$;

revoke all on function public.sg_anggota_jabatan_dewan_atur(jsonb), public.sg_sidang_token(int) from public, anon, authenticated;
grant execute on function public.sg_anggota_jabatan_dewan_atur(jsonb), public.sg_sidang_token(int) to authenticated;
revoke all on function public.sg_gudep_simpan(jsonb) from public, anon, authenticated;
grant execute on function public.sg_gudep_simpan(jsonb) to authenticated;
revoke all on function public.sg_verifikasi_token(text), public.sg_verifikasi_kode(text) from public;
grant execute on function public.sg_verifikasi_token(text), public.sg_verifikasi_kode(text) to anon, authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
