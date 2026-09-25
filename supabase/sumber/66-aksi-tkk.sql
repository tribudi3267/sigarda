-- ===== TKK (Tahap 2, G2): aksi =====
-- Hanya Pembina dan Admin Gudep yang mencatat (Pembina yang langsung membina yang memberi TKK; Dewan hanya membaca). TKK dicatat SESUDAH lulus uji (tanggal bukan
-- masa depan). Penegak harus aktif dan sudah menyelesaikan SKU Bantara (SK Kwarnas 134/1976: TKK dapat dikenakan sesudah Penegak Bantara). TKK harus dari golongan
-- Penegak dan, bila khusus satu agama (Sholat, Khotib, Qori, Muadzin), sesuai agama Penegak. Tingkat berurutan: Madya butuh Purwa jenis yang sama, Utama butuh Madya, dan
-- tanggalnya tidak boleh mendahului tingkat di bawahnya. Tim penguji 2 orang (nama; tanpa akun) dan bukti melatih wajib. Mencatat ulang tingkat yang sama = koreksi.

-- Mencatat (atau mengoreksi) satu capaian TKK. Mengembalikan id catatan.
create function public.sg_tkk_catat(
  p_peserta_id uuid, p_tkk_id text, p_tingkat text, p_tanggal date, p_penguji1 text, p_penguji2 text, p_melatih text, p_bukti_url text default '', p_catatan text default ''
) returns bigint language plpgsql security definer set search_path = public as
$$
declare
  v_p public.profiles; v_t public.tkk_katalog; v_p1 text := sigarda.rapikan(p_penguji1); v_p2 text := sigarda.rapikan(p_penguji2); v_lat text := sigarda.rapikan(p_melatih);
  v_url text := btrim(coalesce(p_bukti_url, '')); v_cat text := sigarda.rapikan(p_catatan); v_bawah date; v_atas date; v_id bigint;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mencatat TKK.'; end if;
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
  -- urutan tingkat
  if p_tingkat <> 'purwa' then
    select tanggal into v_bawah from public.tkk_capaian where peserta_id = p_peserta_id and tkk_id = p_tkk_id and tingkat = case p_tingkat when 'madya' then 'purwa' else 'madya' end;
    if v_bawah is null then raise exception '% Utama butuh Madya, dan Madya butuh Purwa, dari jenis TKK yang sama. Catat tingkat di bawahnya lebih dulu.', v_t.nama; end if;
    if p_tanggal < v_bawah then raise exception 'Tanggal % tidak boleh sebelum tanggal tingkat di bawahnya (%).', initcap(p_tingkat), to_char(v_bawah, 'YYYY-MM-DD'); end if;
  end if;
  if p_tingkat <> 'utama' then
    select tanggal into v_atas from public.tkk_capaian where peserta_id = p_peserta_id and tkk_id = p_tkk_id and tingkat = case p_tingkat when 'purwa' then 'madya' else 'utama' end;
    if v_atas is not null and p_tanggal > v_atas then raise exception 'Tanggal % tidak boleh sesudah tanggal tingkat di atasnya (%).', initcap(p_tingkat), to_char(v_atas, 'YYYY-MM-DD'); end if;
  end if;
  insert into public.tkk_capaian (peserta_id, tkk_id, tingkat, tanggal, penguji1, penguji2, melatih, bukti_url, catatan, dicatat_oleh, dicatat_pada)
  values (p_peserta_id, p_tkk_id, p_tingkat, p_tanggal, v_p1, v_p2, v_lat, v_url, v_cat, auth.uid(), now())
  on conflict (peserta_id, tkk_id, tingkat) do update
    set tanggal = excluded.tanggal, penguji1 = excluded.penguji1, penguji2 = excluded.penguji2, melatih = excluded.melatih, bukti_url = excluded.bukti_url,
        catatan = excluded.catatan, dicatat_oleh = excluded.dicatat_oleh, dicatat_pada = excluded.dicatat_pada
  returning id into v_id;
  return v_id;
end $$;

-- Menghapus satu catatan capaian (salah Penegak atau salah jenis). Tingkat di bawah yang masih ditopang tingkat di atasnya tidak dapat dihapus lebih dulu.
create function public.sg_tkk_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
declare v public.tkk_capaian;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus catatan TKK.'; end if;
  select * into v from public.tkk_capaian where id = p_id;
  if not found then raise exception 'Catatan TKK tidak ditemukan.'; end if;
  if v.tingkat <> 'utama' and exists (
    select 1 from public.tkk_capaian where peserta_id = v.peserta_id and tkk_id = v.tkk_id and tingkat = case v.tingkat when 'purwa' then 'madya' else 'utama' end
  ) then raise exception 'Hapus tingkat yang lebih tinggi dari TKK ini lebih dulu.'; end if;
  delete from public.tkk_capaian where id = p_id;
end $$;

-- TKK Krida: tambah (p_id null) atau ubah. Satu catatan per nama Krida per Penegak.
create function public.sg_tkk_krida_simpan(
  p_id bigint, p_peserta_id uuid, p_nama text, p_saka text, p_tanggal date, p_bukti_url text default '', p_catatan text default ''
) returns bigint language plpgsql security definer set search_path = public as
$$
declare v_nama text := sigarda.rapikan(p_nama); v_saka text := sigarda.rapikan(p_saka); v_url text := btrim(coalesce(p_bukti_url, '')); v_cat text := sigarda.rapikan(p_catatan); v_p public.profiles; v_id bigint;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mencatat TKK Krida.'; end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Pilih Penegak.'; end if;
  if v_p.status <> 'aktif' then raise exception '% tidak aktif; TKK Krida hanya dicatat untuk Penegak aktif.', v_p.nama; end if;
  if char_length(v_nama) not between 1 and 80 or v_nama ~ '[[:cntrl:]<>]' then raise exception 'Nama TKK Krida wajib diisi (maksimal 80 karakter, tanpa tanda < atau >).'; end if;
  if char_length(v_saka) > 60 or v_saka ~ '[[:cntrl:]<>]' then raise exception 'Nama Saka maksimal 60 karakter, tanpa tanda < atau >.'; end if;
  if p_tanggal is null then raise exception 'Tanggal lulus wajib diisi.'; end if;
  if p_tanggal < date '2000-01-01' or p_tanggal > sigarda.hari_ini() then raise exception 'Tanggal lulus tidak boleh sebelum tahun 2000 atau di masa depan.'; end if;
  if v_url <> '' and (v_url !~* '^https?://' or char_length(v_url) > 500 or v_url ~ '[[:cntrl:][:space:]<>]') then raise exception 'Tautan bukti harus berawalan http:// atau https:// (maksimal 500 karakter, tanpa spasi).'; end if;
  if char_length(v_cat) > 200 or v_cat ~ '[[:cntrl:]<>]' then raise exception 'Catatan maksimal 200 karakter, tanpa tanda < atau >.'; end if;
  begin
    if p_id is null then
      insert into public.tkk_krida (peserta_id, nama, saka, tanggal, bukti_url, catatan, dicatat_oleh) values (p_peserta_id, v_nama, v_saka, p_tanggal, v_url, v_cat, auth.uid()) returning id into v_id;
    else
      update public.tkk_krida set peserta_id = p_peserta_id, nama = v_nama, saka = v_saka, tanggal = p_tanggal, bukti_url = v_url, catatan = v_cat, dicatat_oleh = auth.uid(), dicatat_pada = now()
      where id = p_id returning id into v_id;
      if v_id is null then raise exception 'Catatan TKK Krida tidak ditemukan.'; end if;
    end if;
  exception when unique_violation then
    raise exception '% sudah tercatat memiliki TKK Krida %. Ubah catatan yang ada.', v_p.nama, v_nama;
  end;
  return v_id;
end $$;

create function public.sg_tkk_krida_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus catatan TKK Krida.'; end if;
  delete from public.tkk_krida where id = p_id;
  if not found then raise exception 'Catatan TKK Krida tidak ditemukan.'; end if;
end $$;

-- Ambang kesiapan Garuda (pengaturan 'tkk.ambang'): { total, madya, utamaWajib: [id TKK Penegak, unik] }. total 1-200; madya 0-100; total harus memuat semua yang wajib Utama dan Madya-nya.
create function public.sg_tkk_ambang_simpan(p_nilai jsonb) returns void language plpgsql security definer set search_path = public as
$$
declare v_total int; v_madya int; v_wajib text[]; v_n int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah ambang TKK.'; end if;
  if p_nilai is null or jsonb_typeof(p_nilai) <> 'object' or p_nilai - 'total' - 'madya' - 'utamaWajib' <> '{}'::jsonb then raise exception 'Bentuk ambang TKK tidak sah.'; end if;
  -- coalesce: kunci yang hilang menghasilkan NULL, dan perbandingan dengan NULL tidak akan memicu galat
  if coalesce(jsonb_typeof(p_nilai -> 'total'), '') <> 'number' or coalesce(jsonb_typeof(p_nilai -> 'madya'), '') <> 'number' or coalesce(jsonb_typeof(p_nilai -> 'utamaWajib'), '') <> 'array' then raise exception 'Bentuk ambang TKK tidak sah.'; end if;
  if (p_nilai ->> 'total') !~ '^[0-9]+$' or (p_nilai ->> 'madya') !~ '^[0-9]+$' then raise exception 'Jumlah TKK harus bilangan bulat tidak negatif.'; end if;
  v_total := (p_nilai ->> 'total')::int; v_madya := (p_nilai ->> 'madya')::int;
  if v_total not between 1 and 200 then raise exception 'Total TKK harus 1 sampai 200.'; end if;
  if v_madya not between 0 and 100 then raise exception 'Jumlah TKK Madya harus 0 sampai 100.'; end if;
  if exists (select 1 from jsonb_array_elements(p_nilai -> 'utamaWajib') e where jsonb_typeof(e) <> 'string') then raise exception 'Daftar TKK wajib Utama tidak sah.'; end if;
  select coalesce(array_agg(e #>> '{}'), '{}') into v_wajib from jsonb_array_elements(p_nilai -> 'utamaWajib') e;
  if (select count(distinct x) from unnest(v_wajib) x) <> coalesce(array_length(v_wajib, 1), 0) then raise exception 'Daftar TKK wajib Utama tidak boleh berulang.'; end if;
  select count(*) into v_n from public.tkk_katalog where id = any(v_wajib) and golongan = 'penegak';
  if v_n <> coalesce(array_length(v_wajib, 1), 0) then raise exception 'Ada TKK wajib Utama yang tidak dikenal atau khusus Siaga.'; end if;
  if v_total < coalesce(array_length(v_wajib, 1), 0) + v_madya then raise exception 'Total TKK harus memuat semua TKK wajib Utama ditambah TKK Madya.'; end if;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada)
  values ('tkk.ambang', jsonb_build_object('total', v_total, 'madya', v_madya, 'utamaWajib', to_jsonb(v_wajib)), auth.uid(), now())
  on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;
-- ===== akhir aksi tkk =====
