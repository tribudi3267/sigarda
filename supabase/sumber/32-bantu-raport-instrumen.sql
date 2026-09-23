-- ---- Raport ekstrakurikuler: pengaturan dan perhitungan (harus sama dengan src/lib/raportLogic.js; dijaga oleh pengujian) ----
-- Pengaturan tersimpan sebagai satu objek JSON pada kunci 'raport.pengaturan':
--   {"pita":{"sangatBaik":90,"baik":75,"cukup":60},"bobot":{"kehadiran":40,"capaian":40,"sikap":20},"target":{"Bantara":12,"Laksana":11}}
create function sigarda.raport_angka(p_jalur text[], p_bawaan int) returns int language sql stable security definer set search_path = public as
$$
  select coalesce((select (nilai #>> p_jalur)::int from public.pengaturan where kunci = 'raport.pengaturan' and jsonb_typeof(nilai) = 'object'), p_bawaan)
$$;

-- Skor 0-100 = rata-rata tertimbang komponen yang tersedia (kehadiran dan sikap boleh kosong; bobotnya dialihkan ke komponen lain).
-- Capaian = butir lulus semester ini terhadap target, maksimal 100. Sikap 1-5 dikali 20. Pembulatan setengah ke atas.
create function sigarda.raport_skor(p_kehadiran int, p_capaian_lulus int, p_capaian_target int, p_sikap int) returns int
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

create function sigarda.raport_predikat(p_skor int) returns text language sql stable security definer set search_path = public as
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
create function sigarda.raport_hitung(p_peserta uuid, p_ta text, p_semester text, p_tingkat text)
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

-- ---- Instrumen penilaian: pengaturan dan perhitungan (harus sama dengan src/lib/instrumenLogic.js; dijaga oleh pengujian) ----
-- Pengaturan tersimpan pada kunci 'instrumen.pengaturan':
--   {"ambang":75,"pita":{"sangatBaik":90,"baik":75,"cukup":60},"gerbangWajib":true,"nilaiWajibMin":3}
create function sigarda.instrumen_angka(p_jalur text[], p_bawaan int) returns int language sql stable security definer set search_path = public as
$$
  select coalesce((select (nilai #>> p_jalur)::int from public.pengaturan where kunci = 'instrumen.pengaturan' and jsonb_typeof(nilai) = 'object'), p_bawaan)
$$;

create function sigarda.instrumen_gerbang() returns boolean language sql stable security definer set search_path = public as
$$
  select coalesce((select (nilai ->> 'gerbangWajib')::boolean from public.pengaturan where kunci = 'instrumen.pengaturan' and jsonb_typeof(nilai) = 'object'), true)
$$;

create function sigarda.instrumen_aktif(p_sku text) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.instrumen i where i.sku_id = p_sku and i.status = 'ditetapkan') $$;

-- Skor 0-100 = 20 x jumlah(nilai x bobot) / jumlah(bobot), dibulatkan setengah ke atas. Saran LULUS bila skor mencapai ambang dan
-- (bila gerbang wajib aktif) setiap kriteria wajib bernilai minimal nilaiWajibMin. Nilai (predikat) dari pita.
-- Rincian: array {kriteria_id, nilai 1-5} yang harus mencakup SELURUH kriteria instrumen tepat satu kali.
create function sigarda.instrumen_hitung(p_sku text, p_rincian jsonb)
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

-- Seluruh unit SKU tingkat ini yang berlaku bagi peserta (sesuai agamanya) sudah lulus.
create function sigarda.tingkat_selesai(p_peserta uuid, p_tingkat text) returns boolean
language plpgsql stable security definer set search_path = public as
$$
begin
  return exists (select 1 from public.sku_unit where tingkat = p_tingkat)
    and not exists (
      select 1
      from public.sku_unit u
      join public.profiles p on p.id = p_peserta
      where u.tingkat = p_tingkat and (u.agama is null or u.agama = p.agama)
        and not exists (
          select 1 from public.sku_progress g
          where g.peserta_id = p_peserta and g.sku_id = u.id and g.status = 'lulus'
        )
    );
end $$;

create function sigarda.layak_garuda(p_peserta uuid) returns boolean
language plpgsql stable security definer set search_path = public as
$$ begin return sigarda.tingkat_selesai(p_peserta, 'Bantara') and sigarda.tingkat_selesai(p_peserta, 'Laksana'); end $$;

-- Token acak 32 karakter heksadesimal (128 bit acak penuh): tiga UUID acak, hanya bagian yang bukan penanda versi/varian.
create function sigarda.token_acak() returns text language sql volatile as
$$
  select left(replace(gen_random_uuid()::text, '-', ''), 12) || left(replace(gen_random_uuid()::text, '-', ''), 12) || left(replace(gen_random_uuid()::text, '-', ''), 8)
$$;

create function sigarda.kode_verifikasi(p_bagian text[]) returns text language sql immutable as
$$ select 'VRF-' || upper(lpad(substr(md5(array_to_string(p_bagian, '|')), 1, 7), 7, '0')) $$;

create function sigarda.rapikan(p_teks text) returns text language sql immutable as
$$ select regexp_replace(btrim(coalesce(p_teks, '')), '\s+', ' ', 'g') $$;

