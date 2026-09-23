-- ===== Penugasan penguji per rombel: fungsi aksi (Pembina dan Admin Gudep) =====
-- Menambah (p_ada = true) atau mencabut (false) penugasan satu penguji (Pembina atau Dewan Ambalan) pada beberapa rombel sekaligus.
-- Setiap perubahan nyata dicatat di penugasan_log; yang sudah sesuai dilewati. Mengembalikan jumlah perubahan nyata.
create function public.sg_penugasan_atur(p_tahun_ajaran text, p_penguji_id uuid, p_rombel text[], p_ada boolean) returns int
language plpgsql security definer set search_path = public as
$$
declare v_b text; v_r text; v_n int := 0; v_k int; v_nama text; v_oleh text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengatur penugasan penguji.'; end if;
  if not sigarda.tahun_ajaran_sah(p_tahun_ajaran) then raise exception 'Tahun ajaran tidak sah. Contoh: 2026/2027.'; end if;
  if p_ada is null then raise exception 'Pilihan tambah atau cabut wajib diisi.'; end if;
  select nama into v_nama from public.profiles where id = p_penguji_id;
  if not found or not (sigarda.bisa_menguji(p_penguji_id) or (not p_ada and exists (select 1 from public.penugasan_rombel where penguji_id = p_penguji_id))) then
    raise exception 'Penguji tidak ditemukan. Penugasan hanya untuk Pembina dan Penegak berjabatan Dewan Ambalan yang aktif.';
  end if;
  if coalesce(array_length(p_rombel, 1), 0) = 0 then return 0; end if;
  if array_length(p_rombel, 1) > 30 then raise exception 'Maksimal 30 rombel per permintaan.'; end if;
  select nama into v_oleh from public.profiles where id = auth.uid();

  foreach v_b in array p_rombel loop
    v_r := sigarda.rombel_baku(v_b);
    if not sigarda.rombel_sah(v_r) then
      raise exception 'Rombel "%" tidak sah. Gunakan X-01 sampai X-10, XI-01 sampai XI-10, atau XII-01 sampai XII-10.', v_b;
    end if;
    if p_ada then
      insert into public.penugasan_rombel (tahun_ajaran, rombel, penguji_id, ditetapkan_oleh)
      values (p_tahun_ajaran, v_r, p_penguji_id, auth.uid()) on conflict do nothing;
    else
      delete from public.penugasan_rombel where tahun_ajaran = p_tahun_ajaran and rombel = v_r and penguji_id = p_penguji_id;
    end if;
    get diagnostics v_k = row_count;
    if v_k > 0 then
      insert into public.penugasan_log (tahun_ajaran, rombel, penguji_id, penguji_nama, tindakan, oleh, oleh_nama)
      values (p_tahun_ajaran, v_r, p_penguji_id, v_nama, case when p_ada then 'tambah' else 'hapus' end, auth.uid(), coalesce(v_oleh, ''));
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

-- Penugasan KHUSUS satu Penegak (pengecualian dari penugasan rombelnya), oleh Pembina atau Admin Gudep. p_penguji_ids = daftar LENGKAP penguji Penegak itu pada
-- tahun ajaran p_tahun_ajaran (kosong = hapus pengecualian, kembali ke penugasan rombel). Tiap penguji harus dapat menguji (Pembina atau Penegak berjabatan Dewan
-- yang aktif) dan bukan Penegak itu sendiri. p_alasan (maks 200) wajib bila ada yang berubah. Perubahan tercatat di penugasan_log. Mengembalikan jumlah perubahan.
create function public.sg_penugasan_peserta_atur(p_tahun_ajaran text, p_peserta_id uuid, p_penguji_ids uuid[], p_alasan text default '') returns int
language plpgsql security definer set search_path = public as
$$
declare v_p public.profiles; v_ids uuid[]; v_id uuid; v_n int := 0; v_nama text; v_oleh text; v_alasan text := sigarda.rapikan(p_alasan); v_k int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengatur penugasan penguji.'; end if;
  if not sigarda.tahun_ajaran_sah(p_tahun_ajaran) then raise exception 'Tahun ajaran tidak sah. Contoh: 2026/2027.'; end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Penegak tidak ditemukan.'; end if;
  if v_p.status <> 'aktif' then raise exception '% berstatus % dan tidak dapat diatur penugasannya.', v_p.nama, v_p.status; end if;
  v_ids := coalesce((select array_agg(distinct x) from unnest(p_penguji_ids) x), '{}');
  if cardinality(v_ids) > 10 then raise exception 'Maksimal 10 penguji untuk satu Penegak.'; end if;
  if char_length(v_alasan) > 200 then raise exception 'Alasan maksimal 200 karakter.'; end if;
  foreach v_id in array v_ids loop
    if v_id = p_peserta_id then raise exception 'Penegak tidak dapat menjadi pengujinya sendiri.'; end if;
    if not sigarda.bisa_menguji(v_id) then raise exception 'Penguji tidak ditemukan atau tidak aktif. Penugasan hanya untuk Pembina dan Penegak berjabatan Dewan Ambalan.'; end if;
  end loop;
  select nama into v_oleh from public.profiles where id = auth.uid();

  -- yang dicabut
  for v_id in select penguji_id from public.penugasan_peserta where tahun_ajaran = p_tahun_ajaran and peserta_id = p_peserta_id and not (penguji_id = any (v_ids)) loop
    select nama into v_nama from public.profiles where id = v_id;
    delete from public.penugasan_peserta where tahun_ajaran = p_tahun_ajaran and peserta_id = p_peserta_id and penguji_id = v_id;
    insert into public.penugasan_log (tahun_ajaran, rombel, penguji_id, penguji_nama, tindakan, catatan, oleh, oleh_nama, peserta_id, peserta_nama)
    values (p_tahun_ajaran, coalesce(v_p.kelas, ''), v_id, coalesce(v_nama, ''), 'hapus', v_alasan, auth.uid(), coalesce(v_oleh, ''), p_peserta_id, v_p.nama);
    v_n := v_n + 1;
  end loop;
  -- yang ditambah
  foreach v_id in array v_ids loop
    insert into public.penugasan_peserta (tahun_ajaran, peserta_id, penguji_id, ditetapkan_oleh) values (p_tahun_ajaran, p_peserta_id, v_id, auth.uid()) on conflict do nothing;
    get diagnostics v_k = row_count;
    if v_k > 0 then
      select nama into v_nama from public.profiles where id = v_id;
      insert into public.penugasan_log (tahun_ajaran, rombel, penguji_id, penguji_nama, tindakan, catatan, oleh, oleh_nama, peserta_id, peserta_nama)
      values (p_tahun_ajaran, coalesce(v_p.kelas, ''), v_id, coalesce(v_nama, ''), 'tambah', v_alasan, auth.uid(), coalesce(v_oleh, ''), p_peserta_id, v_p.nama);
      v_n := v_n + 1;
    end if;
  end loop;
  if v_n > 0 and v_alasan = '' then raise exception 'Isi alasan penugasan khusus (mis. konflik kepentingan, pindah rombel, penguji cuti).'; end if;
  return v_n;
end $$;

-- Menyalin penugasan tahun ajaran p_dari ke p_ke (yang sudah ada dilewati; tidak ada yang dicabut). Mengembalikan jumlah penugasan baru.
create function public.sg_penugasan_salin(p_dari text, p_ke text) returns int
language plpgsql security definer set search_path = public as
$$
declare v_n int; v_oleh text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengatur penugasan penguji.'; end if;
  if not sigarda.tahun_ajaran_sah(p_dari) or not sigarda.tahun_ajaran_sah(p_ke) then raise exception 'Tahun ajaran tidak sah. Contoh: 2026/2027.'; end if;
  if p_dari = p_ke then raise exception 'Tahun ajaran asal dan tujuan tidak boleh sama.'; end if;
  if not exists (select 1 from public.penugasan_rombel where tahun_ajaran = p_dari) then
    raise exception 'Tahun ajaran % belum memiliki penugasan untuk disalin.', p_dari;
  end if;
  select nama into v_oleh from public.profiles where id = auth.uid();

  with baru as (
    insert into public.penugasan_rombel (tahun_ajaran, rombel, penguji_id, ditetapkan_oleh)
    select p_ke, rombel, penguji_id, auth.uid() from public.penugasan_rombel where tahun_ajaran = p_dari and sigarda.bisa_menguji(penguji_id)
    on conflict do nothing returning rombel, penguji_id
  )
  insert into public.penugasan_log (tahun_ajaran, rombel, penguji_id, penguji_nama, tindakan, catatan, oleh, oleh_nama)
  select p_ke, b.rombel, b.penguji_id, pr.nama, 'tambah', 'Disalin dari ' || p_dari, auth.uid(), coalesce(v_oleh, '')
  from baru b join public.profiles pr on pr.id = b.penguji_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Memperbarui rombel banyak Penegak sekaligus (mis. dari "X" menjadi "X-03"). p_data = [{"username": "10231", "rombel": "X-03"}, ...] (username = NIS).
-- Semua atau tidak sama sekali: satu baris yang keliru membatalkan seluruh permintaan, dengan pesan yang menyebut nomor barisnya.
create function public.sg_rombel_perbarui(p_data jsonb) returns int
language plpgsql security definer set search_path = public as
$$
declare v_e jsonb; v_user text; v_r text; v_n int := 0; v_k int;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat memperbarui rombel Penegak.');
  if p_data is null or jsonb_typeof(p_data) <> 'array' then raise exception 'Data rombel tidak valid.'; end if;
  if jsonb_array_length(p_data) > 500 then raise exception 'Maksimal 500 baris per permintaan.'; end if;
  for v_e in select * from jsonb_array_elements(p_data) loop
    v_n := v_n + 1;
    v_user := lower(btrim(coalesce(v_e ->> 'username', '')));
    v_r := sigarda.rombel_baku(v_e ->> 'rombel');
    if v_user = '' then raise exception 'Baris %: NIS wajib diisi.', v_n; end if;
    if not sigarda.rombel_sah(v_r) then
      raise exception 'Baris %: rombel "%" tidak sah. Gunakan X-01 sampai X-10, XI-01 sampai XI-10, atau XII-01 sampai XII-10.', v_n, coalesce(v_e ->> 'rombel', '');
    end if;
    update public.profiles set kelas = v_r where username = v_user and role = 'peserta';
    get diagnostics v_k = row_count;
    if v_k = 0 then raise exception 'Baris %: Penegak dengan NIS "%" tidak ditemukan.', v_n, v_user; end if;
  end loop;
  return v_n;
end $$;

-- Guru agama (rujukan surat pengantar). p_id kosong = tambah; berisi = ubah. Mengembalikan id.
create function public.sg_guru_agama_simpan(p_id bigint, p_agama text, p_nama text, p_keterangan text default '') returns bigint
language plpgsql security definer set search_path = public as
$$
declare v_nama text := sigarda.rapikan(p_nama); v_ket text := sigarda.rapikan(p_keterangan); v_id bigint;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengelola guru agama.');
  if coalesce(p_agama, '') not in ('Islam','Katolik','Protestan','Hindu','Buddha','Khonghucu') then raise exception 'Agama tidak dikenal.'; end if;
  if v_nama = '' then raise exception 'Nama guru agama wajib diisi.'; end if;
  if char_length(v_nama) > 120 then raise exception 'Nama maksimal 120 karakter.'; end if;
  if char_length(v_ket) > 200 then raise exception 'Keterangan maksimal 200 karakter.'; end if;
  begin
    if p_id is null then
      insert into public.guru_agama (agama, nama, keterangan, diubah_oleh) values (p_agama, v_nama, v_ket, auth.uid()) returning id into v_id;
    else
      update public.guru_agama set agama = p_agama, nama = v_nama, keterangan = v_ket, diubah_oleh = auth.uid(), diubah_pada = now()
        where id = p_id returning id into v_id;
      if v_id is null then raise exception 'Guru agama tidak ditemukan.'; end if;
    end if;
  exception when unique_violation then
    raise exception 'Guru agama % untuk agama % sudah terdaftar.', v_nama, p_agama;
  end;
  return v_id;
end $$;

create function public.sg_guru_agama_hapus(p_id bigint) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengelola guru agama.');
  delete from public.guru_agama where id = p_id;
end $$;
-- ===== akhir fungsi penugasan =====

