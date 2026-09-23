-- ===== Instrumen penilaian (Pembina dan Admin) =====
-- Menyimpan satu instrumen: cara uji, instruksi penguji, dan daftar kriteria (urutan = urutan dalam array). Kriteria yang menyertakan
-- id diperbarui di tempat (id dipertahankan), yang tanpa id ditambahkan, dan yang tidak ada dalam daftar dihapus.
-- p_kriteria: [{"id":123,"jenis":"Lisan","teks":"...","bobot":1,"wajib":false,"panduan":"..."}]
create function public.sg_instrumen_simpan(p_sku_id text, p_cara_uji text, p_instruksi text, p_kriteria jsonb, p_status text)
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

-- Menetapkan (dipakai menilai) atau mengembalikan ke draf beberapa instrumen sekaligus.
create function public.sg_instrumen_status(p_sku_ids text[], p_status text) returns void
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
create function public.sg_instrumen_pengaturan_simpan(p_nilai jsonb) returns void
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

-- ===== Verifikasi keaslian dokumen (QR). DAPAT DIPANGGIL TANPA LOGIN (peran anon): hanya membaca, hanya mengembalikan data seperlunya. =====
-- Token QR (32 heksadesimal, 128 bit acak) tidak dapat ditebak. Nama lengkap hanya keluar untuk pemegang token yang sah.
-- Kode pendek VRF-XXXXXXX (28 bit, tercetak di dokumen) dapat ditebak, jadi jawabannya hanya sah/tidak beserta tingkat, butir, dan tanggal: TANPA nama.
create function public.sg_verifikasi_token(p_token text) returns jsonb
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

create function public.sg_verifikasi_kode(p_kode text) returns jsonb
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

-- Token untuk Surat Tanda Lulus satu tingkat. Untuk Penegak itu sendiri atau pengurus; hanya bila seluruh butir tingkat itu lulus. Idempoten.
create function public.sg_sertifikat_tingkat(p_peserta_id uuid, p_tingkat text) returns text
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_token text;
begin
  perform sigarda.wajib_aktif();
  if p_tingkat is null or p_tingkat not in ('Bantara', 'Laksana') then raise exception 'Tingkat SKU tidak dikenal.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  if p_peserta_id is distinct from v_uid and not sigarda.pengurus() then raise exception 'Anda tidak berwenang menerbitkan surat untuk peserta ini.'; end if;
  if not sigarda.tingkat_selesai(p_peserta_id, p_tingkat) then raise exception 'Surat Tanda Lulus hanya untuk tingkat yang seluruh butirnya sudah lulus.'; end if;
  insert into public.sertifikat_tingkat (token, peserta_id, tingkat, diterbitkan_oleh) values (sigarda.token_acak(), p_peserta_id, p_tingkat, v_uid)
  on conflict (peserta_id, tingkat) do nothing;
  select token into v_token from public.sertifikat_tingkat where peserta_id = p_peserta_id and tingkat = p_tingkat;
  return v_token;
end $$;

