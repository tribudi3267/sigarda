-- ============================================================================
-- MIGRASI: Data gudep (identitas gugus depan, ambalan, dan pejabat) yang diatur Admin Gudep. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi dokumen (fase 2a). Isi:
--   * sg_gudep_simpan: Admin Gudep menyimpan data gudep (nama gudep, ambalan, sekolah, nomor gudep, kode surat, alamat, kota, telepon, email, kwartir,
--     serta Pembina Gudep / Ka Gudep, Kamabigus / Kepala Sekolah, Pradana, Pradani beserta NTA) sebagai satu objek pada pengaturan 'gudep.data'.
--     Semua isian diperiksa di server. Belum ada data = aplikasi memakai nilai bawaan dari kode.
--   * sg_gudep_publik: identitas yang boleh dilihat TANPA login (halaman masuk dan verifikasi): hanya nama gudep, ambalan, sekolah, dan kota.
--     Nama pejabat, NTA, alamat, dan kontak tidak dikeluarkan.
--   * sigarda.ketua_sidang dan sg_sidang_simpan: ketua sidang pada berita acara kini Pradana pada data gudep (nama dan jabatan, disalin saat sidang dicatat).
--     Bila data gudep belum disimpan atau nama/jabatan Pradana kosong, pengaturan lama sidang.nama_ketua dan sidang.sebutan_ketua tetap dipakai.
--   Pembacaan data lengkap setelah masuk memakai kebijakan baca pengaturan yang sudah ada. Tidak ada tabel baru dan tidak ada data yang diubah.
--   Edge Function TIDAK perlu di-deploy ulang.
-- Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: skema dasar dan migrasi dokumen (fase 2a) sudah ada.
do $$
begin
  if to_regclass('public.pengaturan') is null or to_regclass('public.dokumen_terbit') is null
     or to_regprocedure('sigarda.wajib_admin(text)') is null or to_regprocedure('sigarda.rapikan(text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-dokumen.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Data gudep: fungsi =====
-- Identitas Gugus Depan dan pejabatnya disimpan sebagai satu objek JSON pada pengaturan 'gudep.data' (dibaca semua pengguna yang sudah masuk
-- lewat kebijakan baca_pengaturan; diubah hanya Admin Gudep lewat sg_gudep_simpan). Belum ada baris = aplikasi memakai nilai bawaan (src/config.js).
--   teks   : nama, singkat (nama ambalan), sekolah, alamat, kota, nomorGudep, kwarran, kwarcab, kodeSurat, telepon, email
--   orang  : pembina (Pembina Gudep / Ka Gudep, surat intern sekolah), kamabigus (Kepala Sekolah / Kamabigus, surat keluar sekolah),
--            pradana, pradani; masing-masing { jabatan, nama, nta, nip }
-- Aturan isian sama dengan periksaGudep di src/lib/gudepLogic.js (dijaga oleh pengujian).
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
    v_baru := v_baru || jsonb_build_object(v_k, v_h);
  end loop;

  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada) values ('gudep.data', v_baru, auth.uid(), now())
  on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;

-- Identitas gudep yang boleh dilihat tanpa login (halaman masuk dan halaman verifikasi): hanya nama gudep, ambalan, sekolah, dan kota.
-- Nama pejabat, NTA, alamat, dan kontak TIDAK dikeluarkan. Belum ada data = objek kosong (aplikasi memakai nilai bawaan).
create or replace function public.sg_gudep_publik() returns jsonb
language sql stable security definer set search_path = public as
$$
  select coalesce(
    (select jsonb_strip_nulls(jsonb_build_object('nama', p.nilai -> 'nama', 'singkat', p.nilai -> 'singkat', 'sekolah', p.nilai -> 'sekolah', 'kota', p.nilai -> 'kota'))
     from public.pengaturan p where p.kunci = 'gudep.data'), '{}'::jsonb)
$$;
-- Ketua sidang untuk berita acara: Pradana pada data gudep (nama dan jabatan). Bila Admin belum menyimpan data gudep, atau nama/jabatan Pradana kosong,
-- dipakai pengaturan lama sidang.nama_ketua dan sidang.sebutan_ketua (bawaan: kosong dan "Ketua Dewan Penegak / Pemangku Adat").
-- Cermin ketuaSidang di src/lib/gudepLogic.js (dijaga oleh pengujian).
create or replace function sigarda.ketua_sidang(out o_nama text, out o_sebutan text) language plpgsql stable security definer set search_path = public as
$$
declare v_g jsonb;
begin
  select nilai into v_g from public.pengaturan where kunci = 'gudep.data';
  o_nama := sigarda.rapikan(v_g -> 'pradana' ->> 'nama');
  o_sebutan := sigarda.rapikan(v_g -> 'pradana' ->> 'jabatan');
  if o_nama = '' then o_nama := sigarda.pengaturan_teks('sidang.nama_ketua', ''); end if;
  if o_sebutan = '' then o_sebutan := sigarda.pengaturan_teks('sidang.sebutan_ketua', 'Ketua Dewan Penegak / Pemangku Adat'); end if;
end $$;
-- ===== akhir fungsi gudep =====

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

revoke all on function public.sg_gudep_simpan(jsonb) from public, anon, authenticated;
grant execute on function public.sg_gudep_simpan(jsonb) to authenticated;
revoke all on function public.sg_gudep_publik() from public;
grant execute on function public.sg_gudep_publik() to anon, authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
