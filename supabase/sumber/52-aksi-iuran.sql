-- ===== Iuran bumbung kepramukaan: fungsi aksi =====
-- Mencatat iuran satu Penegak pada satu Jumat. p_jumlah kosong atau 0 = tidak iuran (baris dihapus). Hanya Dewan Ambalan atau asisten bendahara;
-- asisten tidak dapat mencatat iurannya sendiri. Jenis baris baru selalu 'rutin'; baris yang sudah 'susulan' tetap 'susulan' saat jumlahnya diubah.
create function public.sg_iuran_set(p_tanggal date, p_peserta_id uuid, p_jumlah int) returns void
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
create function public.sg_iuran_set_banyak(p_tanggal date, p_peserta_ids uuid[], p_jumlah int, p_hanya_kosong boolean default true) returns int
language plpgsql security definer set search_path = public as
$$
declare v_id uuid; v_lama int; v_jenis text; v_n int := 0;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pencatat_iuran() then raise exception 'Hanya Dewan Ambalan atau asisten bendahara yang dapat mencatat iuran.'; end if;
  if p_jumlah is null or p_jumlah < 1 or p_jumlah > 1000000 then raise exception 'Jumlah iuran harus antara Rp 1 dan Rp 1.000.000.'; end if;
  if not exists (select 1 from public.absensi_sesi where tanggal = p_tanggal) then raise exception 'Sesi absensi belum dibuat.'; end if;
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

-- Lembar catat iuran satu Jumat untuk Dewan Ambalan dan asisten bendahara: daftar Penegak (tanpa dirinya sendiri) beserta kehadiran dan iurannya.
-- Asisten (seorang Penegak) tidak boleh membaca profil Penegak lain lewat tabel, jadi daftar ini disediakan fungsi.
create function public.sg_iuran_lembar(p_tanggal date) returns jsonb
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
    where p.role = 'peserta' and p.status = 'aktif' and p.id <> auth.uid()
  ), '[]'::jsonb);
end $$;

-- Rekap iuran untuk SEMUA peran (tanpa rincian per orang): total per Jumat untuk gudep, per sangga, dan per kelas, pada rentang tanggal.
-- 'susulan' = bagian total yang berasal dari iuran susulan; 'orang' = jumlah Penegak yang beriuran.
create function public.sg_iuran_agregat(p_mulai date, p_akhir date) returns jsonb
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
create function public.sg_iuran_kas_simpan(p_tanggal date, p_total int, p_catatan text default '') returns void
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
create function public.sg_asisten_iuran_atur(p_peserta_id uuid, p_aktif boolean) returns void
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
create function public.sg_iuran_pengaturan() returns jsonb
language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  return jsonb_build_object('standar', sigarda.iuran_angka('standar', 1000), 'ambang', sigarda.iuran_angka('ambang', 75),
    'lima', sigarda.iuran_angka('lima', 90), 'tiga', sigarda.iuran_angka('tiga', 65), 'dua', sigarda.iuran_angka('dua', 50));
end $$;

-- Mengubah pengaturan iuran (Pembina dan Admin): iuran standar Rp 500-50.000 (kelipatan Rp 500), ambang rutin, dan batas nilai 5/3/2.
create function public.sg_iuran_pengaturan_simpan(p_nilai jsonb) returns void
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
create function public.sg_iuran_ringkas(p_peserta_id uuid, p_tanggal date) returns jsonb
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
create function public.sg_iuran_susulan(p_peserta_id uuid, p_tanggal date, p_jumlah int, p_pertemuan int) returns int
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

