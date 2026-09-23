-- ---- Iuran bumbung: siapa yang boleh mencatat ----
-- Dewan Ambalan (yang sudah mengganti PIN awal)
create function sigarda.dewan() returns boolean language plpgsql stable security definer set search_path = public as
$$
begin
  -- Dewan Ambalan: Penegak aktif berjabatan Dewan (akun biasa) atau akun Dewan lama yang belum diarsipkan.
  return coalesce((select ((role = 'penguji' and jabatan = 'Dewan Ambalan') or (role = 'peserta' and jabatan_dewan is not null)) and status = 'aktif' and not wajib_ganti_pin
                   from public.profiles where id = auth.uid()), false);
end $$;

-- Penegak yang sedang ditunjuk sebagai asisten bendahara
create function sigarda.asisten_iuran() returns boolean language plpgsql stable security definer set search_path = public as
$$
begin
  return coalesce((select p.role = 'peserta' and p.status = 'aktif' and not p.wajib_ganti_pin and exists (select 1 from public.asisten_iuran a where a.peserta_id = p.id)
                   from public.profiles p where p.id = auth.uid()), false);
end $$;

create function sigarda.pencatat_iuran() returns boolean language plpgsql stable security definer set search_path = public as
$$ begin return sigarda.dewan() or sigarda.asisten_iuran(); end $$;
-- ---- akhir bantu iuran ----

-- ---- Iuran bumbung: perhitungan untuk penilaian SKU (harus sama dengan src/lib/iuranLogic.js; dijaga oleh pengujian) ----
-- Pengaturan tersimpan pada kunci 'iuran.pengaturan': {"standar":1000,"ambang":75,"lima":90,"tiga":65,"dua":50}
--   standar = iuran standar per pertemuan (dasar rekomendasi susulan); ambang = persen pertemuan beriuran yang dianggap rutin (nilai 4);
--   lima, tiga, dua = batas persen untuk nilai 5, 3, 2 (di bawah "dua" = nilai 1).
create function sigarda.iuran_angka(p_kunci text, p_bawaan int) returns int language sql stable security definer set search_path = public as
$$ select coalesce((select (nilai ->> p_kunci)::int from public.pengaturan where kunci = 'iuran.pengaturan' and jsonb_typeof(nilai) = 'object'), p_bawaan) $$;

-- Ringkasan iuran seorang Penegak pada SEMESTER yang memuat p_tanggal (Jul-Des = ganjil, Jan-Jun = genap), dihitung sampai p_tanggal:
-- pertemuan terlaksana, pertemuan beriuran (rutin + susulan), persen (dibulatkan setengah ke atas), target menurut ambang, kekurangan, dan saran nilai 1-5.
create function sigarda.iuran_hitung(p_peserta uuid, p_tanggal date)
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

-- Nilai pengaturan bertipe teks; bila belum pernah diatur dipakai nilai bawaan.
create function sigarda.pengaturan_teks(p_kunci text, p_bawaan text) returns text
language sql stable security definer set search_path = public as
$$ select coalesce((select nilai #>> '{}' from public.pengaturan where kunci = p_kunci), p_bawaan) $$;

-- Nomor urut diberi nol di depan sampai selebar p_lebar; angka yang lebih panjang tidak dipotong (lpad memotong!).
create function sigarda.pad_nomor(p_no int, p_lebar int) returns text language sql immutable as
$$ select case when char_length(p_no::text) >= p_lebar then p_no::text else lpad(p_no::text, p_lebar, '0') end $$;

-- Nomor berita acara dari format. Kode: {no} {no2} {no3} {no4} {no5} {no6} (nomor urut dengan nol di depan sampai 2-6 angka),
-- {tahun} {bulan} {romawi} {tingkat}. Harus sama dengan formatNomor() di src/lib/sidangLogic.js (dijaga oleh pengujian).
create function sigarda.format_nomor(p_format text, p_no int, p_tanggal date, p_tingkat text) returns text
language sql immutable as
$$
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(p_format,
    '{no6}', sigarda.pad_nomor(p_no, 6)),
    '{no5}', sigarda.pad_nomor(p_no, 5)),
    '{no4}', sigarda.pad_nomor(p_no, 4)),
    '{no3}', sigarda.pad_nomor(p_no, 3)),
    '{no2}', sigarda.pad_nomor(p_no, 2)),
    '{no}', p_no::text),
    '{tahun}', extract(year from p_tanggal)::int::text),
    '{bulan}', lpad(extract(month from p_tanggal)::int::text, 2, '0')),
    '{romawi}', (array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])[extract(month from p_tanggal)::int]),
    '{tingkat}', p_tingkat)
$$;

