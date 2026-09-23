-- ===== Materi SKU (Pembina dan Admin Gudep) =====
create function public.sg_materi_simpan(
  p_id uuid, p_judul text, p_deskripsi text, p_tautan text, p_file_id text, p_resource_key text,
  p_butir text[], p_bagian jsonb
) returns uuid language plpgsql security definer set search_path = public as
$$
declare v_id uuid; v_judul text := sigarda.rapikan(p_judul); v_b jsonb; v_butir text[];
begin
  perform sigarda.wajib_aktif();
  if not sigarda.kelola_materi() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengelola materi.'; end if;
  if v_judul = '' then raise exception 'Judul materi wajib diisi.'; end if;
  if char_length(v_judul) > 120 then raise exception 'Judul materi maksimal 120 karakter.'; end if;
  if char_length(coalesce(p_deskripsi, '')) > 400 then raise exception 'Deskripsi maksimal 400 karakter.'; end if;
  if coalesce(p_file_id, '') !~ '^[A-Za-z0-9_-]{15,120}$' then raise exception 'ID file Google Drive tidak sah.'; end if;
  if coalesce(p_tautan, '') !~ '^https?://' then raise exception 'Tautan tidak sah.'; end if;

  select coalesce(array_agg(distinct b), '{}') into v_butir from unnest(coalesce(p_butir, '{}')) b;
  if exists (select 1 from unnest(v_butir) b where b not in (select id from public.sku_butir)) then
    raise exception 'Ada kode butir SKU yang tidak dikenal.';
  end if;

  p_bagian := coalesce(p_bagian, '[]'::jsonb);
  if jsonb_typeof(p_bagian) <> 'array' or jsonb_array_length(p_bagian) > 60 then raise exception 'Daftar isi tidak sah (maksimal 60 bagian).'; end if;
  for v_b in select * from jsonb_array_elements(p_bagian) loop
    if jsonb_typeof(v_b) <> 'object' or char_length(btrim(coalesce(v_b->>'judul', ''))) not between 1 and 120 then
      raise exception 'Setiap bagian daftar isi wajib berjudul (maksimal 120 karakter).';
    end if;
    if coalesce(v_b->>'halaman', '') !~ '^(\d{1,4}(-\d{1,4})?)?$' then
      raise exception 'Halaman pada daftar isi harus berupa angka, mis. 3 atau 3-5.';
    end if;
  end loop;

  begin
    if p_id is null then
      insert into public.materi (urutan, judul, deskripsi, tautan, file_id, resource_key, butir, bagian, dibuat_oleh)
      values ((select coalesce(max(urutan), 0) + 1 from public.materi), v_judul, btrim(coalesce(p_deskripsi, '')), btrim(p_tautan),
              p_file_id, coalesce(p_resource_key, ''), v_butir, p_bagian, auth.uid())
      returning id into v_id;
    else
      update public.materi
        set judul = v_judul, deskripsi = btrim(coalesce(p_deskripsi, '')), tautan = btrim(p_tautan), file_id = p_file_id,
            resource_key = coalesce(p_resource_key, ''), butir = v_butir, bagian = p_bagian
        where id = p_id returning id into v_id;
      if v_id is null then raise exception 'Materi tidak ditemukan. Mungkin sudah dihapus.'; end if;
    end if;
  exception when unique_violation then
    raise exception 'File ini sudah dipakai pada materi lain. Hubungkan butir tambahan pada materi tersebut.';
  end;
  return v_id;
end $$;

create function public.sg_materi_hapus(p_id uuid) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.kelola_materi() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengelola materi.'; end if;
  delete from public.materi where id = p_id;
end $$;

create function public.sg_materi_geser(p_id uuid, p_arah int) returns void
language plpgsql security definer set search_path = public as
$$
declare v_u int; v_tetangga uuid; v_ut int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.kelola_materi() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengelola materi.'; end if;
  select urutan into v_u from public.materi where id = p_id;
  if v_u is null then return; end if;
  if p_arah < 0 then
    select id, urutan into v_tetangga, v_ut from public.materi where urutan < v_u order by urutan desc limit 1;
  else
    select id, urutan into v_tetangga, v_ut from public.materi where urutan > v_u order by urutan asc limit 1;
  end if;
  if v_tetangga is null then return; end if;
  update public.materi set urutan = case when id = p_id then v_ut else v_u end where id in (p_id, v_tetangga);
end $$;

-- ===== Pengaturan dan Sidang Dewan Kehormatan =====
-- Kunci pengaturan yang dikenal (nilai bertipe teks). Bawaan dipakai bila belum diatur:
--   sidang.format_nomor   {no3}/DK/{tahun}
--   sidang.nama_ketua     (kosong: dicetak garis untuk tanda tangan)   } hanya cadangan: ketua sidang kini Pradana pada data gudep
--   sidang.sebutan_ketua  Ketua Dewan Penegak / Pemangku Adat        } (sigarda.ketua_sidang); dipakai bila data gudep belum diisi
--   surat.format_nomor    {no3}/SP/{tahun}  (nomor surat pengantar agama; tanpa kode {tingkat}; hanya Pembina atau Admin yang mengubah)
create function public.sg_pengaturan_simpan(p_kunci text, p_nilai jsonb) returns void
language plpgsql security definer set search_path = public as
$$
declare v text; v_tok text;
begin
  perform sigarda.wajib_aktif();
  if p_kunci is null or p_kunci not in ('sidang.format_nomor', 'sidang.nama_ketua', 'sidang.sebutan_ketua', 'surat.format_nomor') then
    raise exception 'Pengaturan tidak dikenal.';
  end if;
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau Admin Gudep yang dapat mengubah pengaturan sidang.'; end if;
  if p_kunci = 'surat.format_nomor' and not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina atau Admin Gudep yang dapat mengubah format nomor surat.'; end if;
  if p_nilai is null or jsonb_typeof(p_nilai) <> 'string' then raise exception 'Nilai pengaturan tidak sah.'; end if;
  v := sigarda.rapikan(p_nilai #>> '{}');

  if p_kunci in ('sidang.format_nomor', 'surat.format_nomor') then
    if v = '' then raise exception 'Format nomor wajib diisi.'; end if;
    if char_length(v) > 80 then raise exception 'Format nomor maksimal 80 karakter.'; end if;
    if v !~ '^[A-Za-z0-9 /._(){}-]+$' then
      raise exception 'Format nomor hanya boleh berisi huruf, angka, spasi, dan tanda / . - _ ( ) serta kode dalam kurung kurawal.';
    end if;
    for v_tok in select (regexp_matches(v, '\{[^}]*\}', 'g'))[1] loop
      if v_tok not in ('{no}', '{no2}', '{no3}', '{no4}', '{no5}', '{no6}', '{tahun}', '{bulan}', '{romawi}') and not (v_tok = '{tingkat}' and p_kunci = 'sidang.format_nomor') then
        raise exception 'Kode % tidak dikenal. Kode yang tersedia: {no} {no2} {no3} {no4} {no5} {no6} {tahun} {bulan} {romawi} {tingkat}.', v_tok;
      end if;
    end loop;
    if regexp_replace(v, '\{(no|no[2-6]|tahun|bulan|romawi|tingkat)\}', '', 'g') ~ '[{}]' then
      raise exception 'Tanda kurung kurawal pada format nomor tidak lengkap.';
    end if;
    if v !~ '\{no[2-6]?\}' then raise exception 'Format nomor harus memuat kode nomor urut, mis. {no4} (0002) atau {no} (2).'; end if;
    if position('{tahun}' in v) = 0 then raise exception 'Format nomor harus memuat {tahun} agar nomor tidak sama antar tahun.'; end if;
  elsif p_kunci = 'sidang.nama_ketua' then
    if char_length(v) > 120 then raise exception 'Nama ketua maksimal 120 karakter.'; end if;
  else
    if v = '' then raise exception 'Sebutan jabatan wajib diisi.'; end if;
    if char_length(v) > 80 then raise exception 'Sebutan jabatan maksimal 80 karakter.'; end if;
  end if;

  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada) values (p_kunci, to_jsonb(v), auth.uid(), now())
  on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;

-- Mencatat keputusan sidang. "Layak" hanya bila seluruh butir tingkat itu lulus (aturan sama dengan tingkat_selesai).
-- Nomor berita acara dibuat otomatis dari format pengaturan (atau diisi manual). Nama ketua dan sebutannya dicatat saat ini.
create function public.sg_sidang_simpan(
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

-- Mengatur nomor urut berikutnya untuk satu tahun (mis. melanjutkan nomor yang sudah berjalan di kertas). Nomor yang diminta
-- harus lebih besar dari nomor urut tertinggi yang sudah tercatat pada tahun itu, agar tidak ada nomor ganda.
create function public.sg_sidang_urut_atur(p_tahun int, p_berikutnya int) returns void
language plpgsql security definer set search_path = public as
$$
declare v_maks int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau Admin Gudep yang dapat mengatur nomor urut.'; end if;
  if p_tahun is null or p_tahun < 2000 or p_tahun > 2100 then raise exception 'Tahun tidak valid.'; end if;
  if p_berikutnya is null or p_berikutnya < 1 or p_berikutnya > 999999 then raise exception 'Nomor urut berikutnya harus antara 1 dan 999999.'; end if;
  select coalesce(max(nomor_urut), 0) into v_maks from public.sidang_dk where nomor_urut is not null and extract(year from tanggal)::int = p_tahun;
  if p_berikutnya <= v_maks then
    raise exception 'Nomor % sudah terpakai pada catatan sidang tahun % (nomor urut tertinggi: %). Isi angka yang lebih besar.', p_berikutnya, p_tahun, v_maks;
  end if;
  insert into public.sidang_urut (tahun, terakhir) values (p_tahun, p_berikutnya - 1)
  on conflict (tahun) do update set terakhir = excluded.terakhir;
end $$;

-- Hanya Pembina dan Admin Gudep yang dapat menghapus catatan sidang (mis. salah isi). Nomor urut tidak dipakai ulang;
-- gunakan isian nomor manual bila ingin memakai nomor yang sama.
create function public.sg_sidang_hapus(p_id int) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus catatan sidang.'; end if;
  delete from public.sidang_dk where id = p_id;
end $$;

-- ===== Nilai raport ekstrakurikuler =====
-- Pengaturan raport (pita nilai, bobot, target butir per semester) disimpan sebagai satu objek pada kunci 'raport.pengaturan'.
create function public.sg_raport_pengaturan_simpan(p_nilai jsonb) returns void
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
create function public.sg_raport_simpan(
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

create function public.sg_raport_hapus(p_peserta_id uuid, p_tahun_ajaran text, p_semester text) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus nilai raport.'; end if;
  delete from public.raport where peserta_id = p_peserta_id and tahun_ajaran = p_tahun_ajaran and semester = p_semester;
end $$;

