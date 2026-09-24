-- ---------------------------------------------------------------------------
-- 4. Fungsi aksi (RPC). Semua memeriksa peran di server.
-- ---------------------------------------------------------------------------

-- ===== SKU: peserta mengajukan pengujian =====
create function public.sg_sku_ajukan(p_sku_id text, p_jadwal date, p_penguji_id uuid, p_catatan text default '')
returns void language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid(); v_p public.profiles; v_u public.sku_unit; v_status text;
begin
  perform sigarda.wajib_aktif();
  select * into v_p from public.profiles where id = v_uid;
  if not found or v_p.role <> 'peserta' then raise exception 'Hanya peserta yang dapat mengajukan pengujian.'; end if;
  select * into v_u from public.sku_unit where id = p_sku_id and (agama is null or agama = v_p.agama);
  if not found then raise exception 'Poin SKU tidak ditemukan.'; end if;

  select status into v_status from public.sku_progress where peserta_id = v_uid and sku_id = p_sku_id;
  if v_status = 'lulus' then raise exception 'Poin ini sudah lulus.'; end if;
  if v_status in ('diajukan','proses') then raise exception 'Poin ini sedang menunggu atau dalam pengujian.'; end if;
  if v_u.tingkat = 'Laksana' and not sigarda.tingkat_selesai(v_uid, 'Bantara') then
    raise exception 'Selesaikan seluruh butir Bantara lebih dulu.';
  end if;
  if p_jadwal is null then raise exception 'Tanggal pengujian wajib diisi.'; end if;
  if char_length(coalesce(p_catatan, '')) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;
  -- Sakelar pra-uji hidup: pengajuan lebih dulu melewati pra-uji Pinsa/Bina Damping (p_penguji_id diabaikan; uji resmi selalu ke antrian Pembina rombel).
  if sigarda.pra_uji_aktif() then
    perform sigarda.pra_uji_mulai(v_uid, p_sku_id, p_jadwal, p_catatan);
    return;
  end if;
  -- Ketat saat memilih penguji: hanya penguji yang sah (penugasan rombel, butir Laksana dan butir agama hanya Pembina, agama seagama).
  -- p_penguji_id kosong = antrian bersama rombel: penguji yang sah mana pun mengambilnya lewat "Mulai uji".
  if p_penguji_id is not null and not sigarda.bisa_menguji(p_penguji_id) then
    raise exception 'Pilih penguji terlebih dulu.';
  end if;
  if p_penguji_id is null then
    if not exists (select 1 from sigarda.penguji_sah(v_uid, p_sku_id)) then
      raise exception 'Belum ada penguji yang dapat menguji butir ini untuk rombel Anda. Hubungi Admin Gudep.';
    end if;
  elsif not sigarda.penguji_boleh(v_uid, p_penguji_id, p_sku_id) then
    if v_u.agama is not null then
      raise exception 'Butir agama hanya dapat diuji oleh Pembina yang seagama. Pilih penguji dari daftar.';
    elsif v_u.tingkat = 'Laksana' and not exists (select 1 from public.profiles where id = p_penguji_id and jabatan = 'Pembina') and not sigarda.ditugaskan(v_uid, p_penguji_id) then
      raise exception 'Butir Laksana hanya dapat diuji oleh Pembina atau penguji yang ditugaskan untuk Anda. Pilih penguji dari daftar.';
    else
      raise exception 'Penguji ini tidak bertugas pada rombel Anda. Pilih penguji dari daftar.';
    end if;
  end if;

  insert into public.sku_progress (peserta_id, sku_id, status, jadwal, penguji_id, catatan_peserta, diubah)
  values (v_uid, p_sku_id, 'diajukan', p_jadwal, p_penguji_id, btrim(coalesce(p_catatan, '')), now())
  on conflict (peserta_id, sku_id) do update
    set status = 'diajukan', jadwal = excluded.jadwal, penguji_id = excluded.penguji_id,
        catatan_peserta = excluded.catatan_peserta, diubah = now();
  insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
  values (v_uid, p_sku_id, 'Mengajukan pengujian untuk ' || to_char(p_jadwal, 'YYYY-MM-DD') || case when p_penguji_id is null then ' (antrian rombel)' else '' end, v_uid);
end $$;

create function public.sg_sku_batal(p_sku_id text) returns void
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_status text;
begin
  perform sigarda.wajib_aktif();
  if not exists (select 1 from public.profiles where id = v_uid and role = 'peserta') then
    raise exception 'Hanya peserta yang dapat membatalkan pengajuan.';
  end if;
  -- Pengajuan yang masih menunggu pra-uji (Pinsa/Bina Damping) juga dapat dibatalkan.
  if exists (select 1 from public.sku_pra_uji where peserta_id = v_uid and sku_id = p_sku_id and status = 'menunggu') then
    update public.sku_pra_uji set status = 'dibatalkan', diputuskan_pada = now() where peserta_id = v_uid and sku_id = p_sku_id and status = 'menunggu';
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (v_uid, p_sku_id, 'Pengajuan pra-uji dibatalkan peserta', v_uid);
    return;
  end if;
  select status into v_status from public.sku_progress where peserta_id = v_uid and sku_id = p_sku_id;
  if v_status is distinct from 'diajukan' then
    raise exception 'Hanya pengajuan yang belum mulai diuji yang bisa dibatalkan.';
  end if;
  update public.sku_progress
    set status = 'belum', jadwal = null, penguji_id = null, catatan_peserta = '', diubah = now()
    where peserta_id = v_uid and sku_id = p_sku_id;
  insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (v_uid, p_sku_id, 'Pengajuan dibatalkan peserta', v_uid);
end $$;

-- ===== Penegakan penugasan penguji: fungsi aksi =====
-- Daftar penguji yang sah untuk satu butir, beserta beban antrian masing-masing (pengajuan menunggu dan sedang diuji).
-- Penegak memakai untuk dirinya sendiri; Pembina dan Admin Gudep dapat menyebut p_peserta_id (dipakai saat mengalihkan pengajuan).
-- Hasil: { sumber: 'rombel' | 'semua', rombel, agama_butir, penguji: [{ id, nama, jabatan, agama, beban }] } (beban terendah lebih dulu).
create function public.sg_penguji_pilihan(p_sku_id text, p_peserta_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_peserta uuid; v_p public.profiles; v_u public.sku_unit;
begin
  perform sigarda.wajib_aktif();
  if exists (select 1 from public.profiles where id = v_uid and role = 'peserta') then v_peserta := v_uid;
  elsif sigarda.pembina_atau_admin() then v_peserta := p_peserta_id;
  else raise exception 'Daftar penguji hanya untuk Penegak, Pembina, dan Admin Gudep.';
  end if;
  select * into v_p from public.profiles where id = v_peserta and role = 'peserta';
  if not found then raise exception 'Peserta tidak ditemukan.'; end if;
  select * into v_u from public.sku_unit where id = p_sku_id and (agama is null or agama = v_p.agama);
  if not found then raise exception 'Poin SKU tidak ditemukan.'; end if;
  return jsonb_build_object(
    'sumber', case when exists (select 1 from sigarda.penguji_sah(v_peserta, p_sku_id) s where s.o_rombel) then 'rombel' else 'semua' end,
    'rombel', v_p.kelas,
    'agama_butir', v_u.agama is not null,
    'penguji', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'jabatan', x.jabatan, 'jabatan_dewan', x.jabatan_dewan, 'agama', x.agama, 'beban', x.beban) order by x.beban, x.nama)
      from (
        select u.id, u.nama, case when u.role = 'peserta' then 'Dewan Ambalan' else u.jabatan end as jabatan, u.jabatan_dewan, u.agama,
          (select count(*) from public.sku_progress sp where sp.penguji_id = u.id and sp.status in ('diajukan', 'proses'))::int as beban
        from public.profiles u where u.id in (select s.o_penguji from sigarda.penguji_sah(v_peserta, p_sku_id) s)
      ) x
    ), '[]'::jsonb));
end $$;

-- Pembina atau Admin Gudep mengalihkan pengajuan (menunggu atau sedang diuji) ke penguji lain, dengan alasan yang tercatat di riwayat.
-- p_penguji_id kosong = kembali ke antrian bersama rombel (hanya untuk yang belum mulai diuji).
create function public.sg_sku_alihkan(p_peserta_id uuid, p_sku_id text, p_penguji_id uuid, p_alasan text) returns void
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_pr public.sku_progress; v_alasan text := btrim(coalesce(p_alasan, '')); v_dari text; v_ke text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina atau Admin Gudep yang dapat mengalihkan pengajuan.'; end if;
  select * into v_pr from public.sku_progress where peserta_id = p_peserta_id and sku_id = p_sku_id;
  if not found or v_pr.status not in ('diajukan', 'proses') then
    raise exception 'Hanya pengajuan yang menunggu atau sedang diuji yang dapat dialihkan.';
  end if;
  if v_alasan = '' then raise exception 'Isi alasan pengalihan.'; end if;
  if char_length(v_alasan) > 200 then raise exception 'Alasan maksimal 200 karakter.'; end if;
  if p_penguji_id is null and v_pr.status = 'proses' then
    raise exception 'Pengujian yang sedang berjalan harus dialihkan ke penguji tertentu.';
  end if;
  if p_penguji_id is not null and not sigarda.penguji_boleh(p_peserta_id, p_penguji_id, p_sku_id) then
    raise exception 'Penguji tujuan tidak dapat menguji butir ini untuk rombel Penegak tersebut.';
  end if;
  if p_penguji_id is null and not exists (select 1 from sigarda.penguji_sah(p_peserta_id, p_sku_id)) then
    raise exception 'Belum ada penguji yang dapat menguji butir ini untuk rombel Penegak tersebut.';
  end if;
  if p_penguji_id is not distinct from v_pr.penguji_id then raise exception 'Penguji tujuan sama dengan penguji saat ini.'; end if;
  select coalesce(nama, 'antrian rombel') into v_dari from public.profiles where id = v_pr.penguji_id;
  select coalesce(nama, 'antrian rombel') into v_ke from public.profiles where id = p_penguji_id;
  update public.sku_progress set penguji_id = p_penguji_id, diubah = now() where peserta_id = p_peserta_id and sku_id = p_sku_id;
  insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
  values (p_peserta_id, p_sku_id, 'Dialihkan dari ' || coalesce(v_dari, 'antrian rombel') || ' ke ' || coalesce(v_ke, 'antrian rombel') || '. Alasan: ' || v_alasan, v_uid);
end $$;
-- ===== akhir fungsi penegakan =====

-- ===== SKU: penguji mencatat hasil. HANYA dipanggil Edge Function setelah PIN penguji diverifikasi. =====
create function public.sg_sku_catat_internal(
  p_oleh uuid, p_peserta_id uuid, p_sku_id text, p_hasil text,
  p_tanggal_uji date default null, p_nilai text default null, p_catatan text default ''
) returns void language plpgsql security definer set search_path = public as
$$
declare v_p public.profiles; v_kode text; v_cat text := btrim(coalesce(p_catatan, '')); v_lama public.sku_progress; v_ganti text := ''; v_luar text;
begin
  if not sigarda.bisa_menguji(p_oleh) then
    raise exception '%', case when sigarda.pra_uji_aktif() then 'Hanya Pembina yang dapat mencatat hasil uji resmi.' else 'Hanya Pembina atau Dewan Ambalan yang dapat mencatat hasil.' end;
  end if;
  if p_oleh = p_peserta_id then raise exception 'Anda tidak dapat menilai diri sendiri.'; end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Peserta tidak ditemukan.'; end if;
  if not exists (select 1 from public.sku_unit where id = p_sku_id and (agama is null or agama = v_p.agama)) then
    raise exception 'Poin SKU tidak ditemukan.';
  end if;
  -- Butir agama (sub-butir Butir 1) hanya dinilai Pembina yang seagama, dan butir Laksana hanya oleh Pembina atau penguji yang ditugaskan untuk Penegak
  -- itu, untuk semua hasil (mulai uji, lulus, perlu diulang, dikembalikan). Aturan ini sama dengan pemilihan penguji (sigarda.penguji_peran_ok).
  if not sigarda.penguji_peran_ok(p_peserta_id, p_oleh, p_sku_id) then
    if exists (select 1 from public.sku_unit where id = p_sku_id and agama is not null) then
      raise exception 'Butir agama hanya dapat dinilai oleh Pembina yang seagama dengan Penegak.';
    end if;
    raise exception 'Butir Laksana hanya dapat dinilai oleh Pembina atau penguji yang ditugaskan untuk Penegak ini.';
  end if;
  -- Lunak saat mencatat: penguji lain boleh menggantikan penguji tujuan, tetapi tercatat di riwayat.
  select * into v_lama from public.sku_progress where peserta_id = p_peserta_id and sku_id = p_sku_id;
  if found and v_lama.status in ('diajukan', 'proses') and v_lama.penguji_id is not null and v_lama.penguji_id <> p_oleh and p_hasil in ('proses', 'lulus', 'ulang') then
    v_ganti := ' (menggantikan ' || coalesce((select nama from public.profiles where id = v_lama.penguji_id), 'penguji lain') || ')';
  end if;
  -- Butir agama yang dinilai guru agama luar (Pembina tidak seagama, sah karena ada surat pengantar): riwayat menyebut guru dan nomor surat.
  if p_hasil in ('proses', 'lulus', 'ulang') and exists (select 1 from public.sku_unit where id = p_sku_id and agama is not null)
     and exists (select 1 from public.profiles b where b.role = 'penguji' and b.jabatan = 'Pembina' and b.agama is not null)
     and (select agama from public.profiles where id = p_oleh) is distinct from v_p.agama then
    select ' (dinilai guru agama ' || coalesce(d.payload -> 'guru' ->> 'nama', '-') || ', surat nomor ' || d.nomor || ')' into v_luar
    from public.dokumen_terbit d
    where d.jenis = 'surat_pengantar_agama' and d.peserta_id = p_peserta_id and d.dicabut_pada is null and d.payload -> 'butir' @> jsonb_build_array(p_sku_id)
    order by d.id desc limit 1;
    v_ganti := v_ganti || coalesce(v_luar, '');
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

  -- Pembina memulai atau menuntaskan butir yang masih menunggu pra-uji: pra-uji itu tidak diperlukan lagi.
  if p_hasil in ('proses', 'lulus', 'ulang') then
    update public.sku_pra_uji set status = 'dibatalkan', catatan = 'Dilanjutkan langsung oleh penguji resmi', diputuskan_pada = now()
      where peserta_id = p_peserta_id and sku_id = p_sku_id and status = 'menunggu';
  end if;

  if p_hasil = 'proses' then
    insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji)
    values (p_peserta_id, p_sku_id, 'proses', p_oleh, p_tanggal_uji)
    on conflict (peserta_id, sku_id) do update
      set status = 'proses', penguji_id = p_oleh, tanggal_uji = p_tanggal_uji, verifikasi = null, diverifikasi_pada = null, verifikasi_token = null, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (p_peserta_id, p_sku_id, 'Pengujian dimulai' || v_ganti, p_oleh);

  elsif p_hasil = 'lulus' then
    if p_nilai is null then raise exception 'Pilih predikat penilaian.'; end if;
    if p_nilai not in ('Sangat baik','Baik','Cukup') then raise exception 'Predikat tidak dikenal.'; end if;
    v_kode := sigarda.kode_verifikasi(array[p_peserta_id::text, p_sku_id, p_oleh::text, p_tanggal_uji::text]);
    insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji, nilai, catatan, verifikasi, diverifikasi_pada, verifikasi_token)
    values (p_peserta_id, p_sku_id, 'lulus', p_oleh, p_tanggal_uji, p_nilai, v_cat, v_kode, now(), sigarda.token_acak())
    on conflict (peserta_id, sku_id) do update
      set status = 'lulus', penguji_id = p_oleh, tanggal_uji = p_tanggal_uji, nilai = p_nilai, catatan = v_cat,
          verifikasi = v_kode, diverifikasi_pada = now(), verifikasi_token = sigarda.token_acak(), diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (p_peserta_id, p_sku_id, 'Dinyatakan lulus (' || p_nilai || '), kode ' || v_kode || v_ganti, p_oleh);

  elsif p_hasil = 'ulang' then
    if v_cat = '' then raise exception 'Isi catatan agar peserta tahu bagian yang perlu diperbaiki.'; end if;
    insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji, nilai, catatan)
    values (p_peserta_id, p_sku_id, 'ulang', p_oleh, p_tanggal_uji, null, v_cat)
    on conflict (peserta_id, sku_id) do update
      set status = 'ulang', penguji_id = p_oleh, tanggal_uji = p_tanggal_uji, nilai = null, catatan = v_cat,
          verifikasi = null, diverifikasi_pada = null, verifikasi_token = null, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (p_peserta_id, p_sku_id, 'Perlu diulang' || v_ganti, p_oleh);

  else -- reset
    if v_cat = '' then raise exception 'Isi alasan pembatalan status.'; end if;
    insert into public.sku_progress (peserta_id, sku_id, status)
    values (p_peserta_id, p_sku_id, 'belum')
    on conflict (peserta_id, sku_id) do update
      set status = 'belum', penguji_id = null, tanggal_uji = null, jadwal = null, nilai = null, catatan = '',
          catatan_peserta = '', verifikasi = null, diverifikasi_pada = null, verifikasi_token = null, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (p_peserta_id, p_sku_id, 'Status dikembalikan ke belum diuji. Alasan: ' || v_cat, p_oleh);
  end if;
end $$;

-- ===== SKU: penilaian dengan instrumen. HANYA dipanggil Edge Function setelah PIN penguji diverifikasi. =====
-- Skor dan saran dihitung ulang di server dari nilai tiap kriteria. Penguji boleh memilih hasil yang berbeda dari saran,
-- dengan catatan alasan wajib (tercatat). Hasil diterapkan lewat sg_sku_catat_internal (status, kode verifikasi, riwayat).
create function public.sg_sku_catat_rubrik_internal(
  p_oleh uuid, p_peserta_id uuid, p_sku_id text, p_tanggal_uji date, p_rincian jsonb, p_hasil text, p_catatan text default ''
) returns jsonb language plpgsql security definer set search_path = public as
$$
declare
  v_p public.profiles; v_cat text := btrim(coalesce(p_catatan, '')); v_h record; v_diganti boolean; v_rinci jsonb; v_saran_iuran int; v_beda_iuran boolean := false;
begin
  if not sigarda.bisa_menguji(p_oleh) then
    raise exception '%', case when sigarda.pra_uji_aktif() then 'Hanya Pembina yang dapat mencatat hasil uji resmi.' else 'Hanya Pembina atau Dewan Ambalan yang dapat mencatat hasil.' end;
  end if;
  if p_oleh = p_peserta_id then raise exception 'Anda tidak dapat menilai diri sendiri.'; end if;
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

