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

-- ===== Pinsa dan Bina Damping (fase B): aksi =====
-- Menunjuk Bina Damping satu rombel (menggantikan daftar lama; kosong = mengosongkan). Dewan Ambalan, Pembina, dan Admin Gudep.
-- Bina Damping = Penegak aktif berjabatan Dewan Ambalan yang minimal Calon Laksana (Bantara selesai), maksimal 2 per rombel, satu rombel per orang per tahun
-- ajaran. PRIORITAS: Penegak Dewan yang sudah Laksana lebih dulu; yang masih Calon Laksana hanya bila tidak ada lagi Penegak Dewan yang sudah Laksana
-- dan belum bertugas. Mengembalikan jumlah perubahan (yang dicabut + yang ditambah).
create function public.sg_bina_damping_atur(p_tahun_ajaran text, p_rombel text, p_penegak_ids uuid[]) returns int
language plpgsql security definer set search_path = public as
$$
declare v_ids uuid[]; v_id uuid; v_p public.profiles; v_n int := 0; v_k int; v_bebas int;
begin
  perform sigarda.wajib_aktif();
  if not (sigarda.dewan() or sigarda.pembina_atau_admin()) then
    raise exception 'Hanya Dewan Ambalan, Pembina, dan Admin Gudep yang dapat menunjuk Bina Damping.';
  end if;
  if not sigarda.tahun_ajaran_sah(p_tahun_ajaran) then raise exception 'Tahun ajaran tidak sah. Contoh: 2026/2027.'; end if;
  if not sigarda.rombel_sah(p_rombel) then raise exception 'Rombel tidak sah. Contoh: X-01, XI-05, XII-10.'; end if;
  v_ids := coalesce((select array_agg(distinct x) from unnest(p_penegak_ids) x), '{}');
  if cardinality(v_ids) > 2 then raise exception 'Bina Damping maksimal 2 orang per rombel.'; end if;
  foreach v_id in array v_ids loop
    select * into v_p from public.profiles where id = v_id and role = 'peserta';
    if not found or v_p.status <> 'aktif' then raise exception 'Penegak tidak ditemukan atau tidak aktif.'; end if;
    if v_p.jabatan_dewan is null then
      raise exception '% bukan pengurus Dewan Ambalan. Bina Damping dipilih dari Penegak berjabatan Dewan Ambalan.', v_p.nama;
    end if;
    if not sigarda.tingkat_selesai(v_id, 'Bantara') then
      raise exception '% belum menyelesaikan SKU Bantara. Bina Damping minimal Penegak Calon Laksana.', v_p.nama;
    end if;
    if exists (select 1 from public.bina_damping where tahun_ajaran = p_tahun_ajaran and penegak_id = v_id and rombel <> p_rombel) then
      raise exception '% sudah menjadi Bina Damping rombel lain pada tahun ajaran ini.', v_p.nama;
    end if;
    if not sigarda.tingkat_selesai(v_id, 'Laksana') then
      select count(*) into v_bebas from public.profiles q
      where q.role = 'peserta' and q.status = 'aktif' and q.jabatan_dewan is not null and q.id <> all (v_ids)
        and sigarda.tingkat_selesai(q.id, 'Bantara') and sigarda.tingkat_selesai(q.id, 'Laksana')
        and not exists (select 1 from public.bina_damping b where b.tahun_ajaran = p_tahun_ajaran and b.penegak_id = q.id and b.rombel <> p_rombel);
      if v_bebas > 0 then
        raise exception '% masih Calon Laksana. Dahulukan Penegak berjabatan Dewan yang sudah Laksana (masih ada % yang belum bertugas).', v_p.nama, v_bebas;
      end if;
    end if;
  end loop;

  delete from public.bina_damping where tahun_ajaran = p_tahun_ajaran and rombel = p_rombel and not (penegak_id = any (v_ids));
  get diagnostics v_k = row_count;
  v_n := v_k;
  foreach v_id in array v_ids loop
    insert into public.bina_damping (tahun_ajaran, rombel, penegak_id, ditetapkan_oleh) values (p_tahun_ajaran, p_rombel, v_id, auth.uid()) on conflict do nothing;
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end loop;
  return v_n;
end $$;

-- Penunjukan Bina Damping satu tahun ajaran (bawaan: tahun ajaran berjalan) beserta calon yang dapat dipilih. Pengurus (Dewan, Pembina, Admin).
-- { tahun_ajaran, bisa_atur (boleh menunjuk: Dewan, Pembina, Admin), penugasan: [{ rombel, penegak_id, nama, kelas, jabatan_dewan, tingkat }],
--   calon: [{ id, nama, kelas, jabatan_dewan, tingkat, rombel }] } dengan calon = Penegak berjabatan Dewan yang minimal Calon Laksana (Laksana lebih dulu);
-- rombel = tempat ia sudah bertugas pada tahun ajaran itu (null = belum).
create function public.sg_bina_damping_daftar(p_tahun_ajaran text default null) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare v_ta text := coalesce(p_tahun_ajaran, sigarda.tahun_ajaran_kini());
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya pengurus yang dapat melihat penunjukan Bina Damping.'; end if;
  if not sigarda.tahun_ajaran_sah(v_ta) then raise exception 'Tahun ajaran tidak sah. Contoh: 2026/2027.'; end if;
  return jsonb_build_object(
    'tahun_ajaran', v_ta,
    'bisa_atur', sigarda.dewan() or sigarda.pembina_atau_admin(),
    'penugasan', coalesce((
      select jsonb_agg(jsonb_build_object('rombel', b.rombel, 'penegak_id', p.id, 'nama', p.nama, 'kelas', p.kelas, 'jabatan_dewan', p.jabatan_dewan,
                                          'tingkat', sigarda.tingkat_penegak(p.id)) order by b.rombel, p.nama)
      from public.bina_damping b join public.profiles p on p.id = b.penegak_id where b.tahun_ajaran = v_ta), '[]'::jsonb),
    'calon', coalesce((
      select jsonb_agg(x.j order by x.urut, x.nama) from (
        select p.nama, case when sigarda.tingkat_selesai(p.id, 'Laksana') then 0 else 1 end as urut,
               jsonb_build_object('id', p.id, 'nama', p.nama, 'kelas', p.kelas, 'jabatan_dewan', p.jabatan_dewan, 'tingkat', sigarda.tingkat_penegak(p.id),
                                  'rombel', (select b.rombel from public.bina_damping b where b.penegak_id = p.id and b.tahun_ajaran = v_ta)) as j
        from public.profiles p
        where p.role = 'peserta' and p.status = 'aktif' and p.jabatan_dewan is not null and sigarda.tingkat_selesai(p.id, 'Bantara')
      ) x), '[]'::jsonb)
  );
end $$;

-- Susunan sangga sebuah rombel beserta Bina Damping dan peringatannya. Boleh dibaca: pengurus, Bina Damping rombel itu, dan Penegak aktif rombel itu.
-- { rombel, tahun_ajaran, bisa_atur, bina_damping: [{ id, nama, tingkat }], anggota: [{ id, nama, sangga, pinsa, tingkat, layak_pinsa }], peringatan: [{ sangga, teks }] }
-- `tingkat` (kemajuan SKU sesama Penegak) dan `layak_pinsa` (Bantara selesai) hanya diperlihatkan kepada yang boleh mengatur dan pengurus; Penegak biasa menerima null/false.
create function public.sg_sangga_rombel(p_rombel text) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare v_atur boolean; v_lihat boolean;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.rombel_sah(p_rombel) then raise exception 'Rombel tidak sah. Contoh: X-01, XI-05, XII-10.'; end if;
  v_atur := sigarda.sangga_bisa_atur(p_rombel);
  v_lihat := v_atur or sigarda.pengurus();
  if not (v_lihat or exists (select 1 from public.profiles where id = auth.uid() and role = 'peserta' and status = 'aktif' and kelas = p_rombel)) then
    raise exception 'Susunan sangga hanya dapat dilihat pengurus, Bina Damping, dan anggota rombel ini.';
  end if;
  return jsonb_build_object(
    'rombel', p_rombel,
    'tahun_ajaran', sigarda.tahun_ajaran_kini(),
    'bisa_atur', v_atur,
    'bina_damping', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nama', p.nama, 'tingkat', case when v_lihat then sigarda.tingkat_penegak(p.id) end) order by p.nama)
      from public.bina_damping b join public.profiles p on p.id = b.penegak_id
      where b.rombel = p_rombel and b.tahun_ajaran = sigarda.tahun_ajaran_kini()), '[]'::jsonb),
    'anggota', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'sangga', x.sangga, 'pinsa', x.pinsa, 'tingkat', x.tingkat,
                                          'layak_pinsa', x.tingkat is not null and x.tingkat <> 'calon-bantara') order by lower(x.sangga), x.pinsa desc, x.nama)
      from (select p.id, p.nama, p.sangga, p.pinsa, case when v_lihat then sigarda.tingkat_penegak(p.id) end as tingkat
            from public.profiles p where p.role = 'peserta' and p.status = 'aktif' and p.kelas = p_rombel) x), '[]'::jsonb),
    'peringatan', sigarda.sangga_peringatan(p_rombel)
  );
end $$;

-- Membagi sangga dan menentukan Pinsa di satu rombel (Bina Damping rombel itu, Pembina, dan Admin). p_data = [{ id, sangga?, pinsa? }] untuk Penegak aktif
-- rombel itu; kunci yang tidak ada = tidak diubah. Semua atau tidak sama sekali. Pinsa minimal Calon Laksana, satu per sangga; pindah sangga otomatis melepas
-- Pinsa-nya. Mengembalikan { diubah, peringatan } (peringatan tidak memblokir).
create function public.sg_sangga_atur(p_rombel text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare v_e jsonb; v_id uuid; v_t public.profiles; v_s text; v_pinsa boolean; v_lain text; v_n int := 0; v_tahap int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.rombel_sah(p_rombel) then raise exception 'Rombel tidak sah. Contoh: X-01, XI-05, XII-10.'; end if;
  if not sigarda.sangga_bisa_atur(p_rombel) then
    raise exception 'Hanya Bina Damping rombel ini, Pembina, dan Admin Gudep yang dapat mengatur sangga.';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'array' then raise exception 'Data sangga tidak sah.'; end if;
  if jsonb_array_length(p_data) > 60 then raise exception 'Maksimal 60 Penegak per penyimpanan.'; end if;

  -- Tahap 1: nama sangga.
  for v_e in select * from jsonb_array_elements(p_data) loop
    v_id := (v_e ->> 'id')::uuid;
    select * into v_t from public.profiles where id = v_id and role = 'peserta' and kelas = p_rombel and status = 'aktif';
    if not found then raise exception 'Penegak tidak ditemukan di rombel % atau tidak aktif.', p_rombel; end if;
    if v_e ? 'sangga' then
      v_s := sigarda.rapikan(v_e ->> 'sangga');
      if v_s = '' or char_length(v_s) > 40 then raise exception 'Nama sangga wajib diisi (maksimal 40 karakter).'; end if;
      v_s := coalesce((select sangga from public.profiles where role = 'peserta' and lower(sangga) = lower(v_s) limit 1), v_s);
      if v_s is distinct from v_t.sangga then
        update public.profiles set sangga = v_s where id = v_id;
        v_n := v_n + 1;
      end if;
    end if;
  end loop;

  -- Tahap 2: Pinsa. Yang dicabut lebih dulu (agar tukar Pinsa dalam satu simpanan berhasil), lalu yang ditetapkan.
  for v_tahap in 1..2 loop
    for v_e in select * from jsonb_array_elements(p_data) loop
      if not (v_e ? 'pinsa') then continue; end if;
      v_pinsa := (v_e ->> 'pinsa')::boolean;
      if (v_tahap = 1) <> (not v_pinsa) then continue; end if;
      v_id := (v_e ->> 'id')::uuid;
      select * into v_t from public.profiles where id = v_id;
      if v_pinsa is not distinct from v_t.pinsa then continue; end if;
      if v_pinsa then
        if btrim(coalesce(v_t.sangga, '')) = '' then raise exception '% belum punya sangga. Bagi sangga lebih dulu, baru pilih Pinsa.', v_t.nama; end if;
        if not sigarda.tingkat_selesai(v_id, 'Bantara') then
          raise exception '% belum menyelesaikan SKU Bantara. Pinsa dipilih dari Penegak Calon Laksana.', v_t.nama;
        end if;
        select nama into v_lain from public.profiles where role = 'peserta' and status = 'aktif' and kelas = v_t.kelas and lower(sangga) = lower(v_t.sangga) and pinsa and id <> v_id limit 1;
        if v_lain is not null then raise exception 'Sangga % sudah punya Pinsa (%). Cabut dulu Pinsa yang lama.', v_t.sangga, v_lain; end if;
      end if;
      update public.profiles set pinsa = v_pinsa where id = v_id;
      v_n := v_n + 1;
    end loop;
  end loop;
  return jsonb_build_object('diubah', v_n, 'peringatan', sigarda.sangga_peringatan(p_rombel));
end $$;

-- Peran pendampingan diri sendiri (dipakai menu): rombel yang saya dampingi sebagai Bina Damping pada tahun ajaran berjalan, dan apakah saya Pinsa.
create function public.sg_pendampingan_saya() returns jsonb
language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  return jsonb_build_object(
    'bina_damping', coalesce((select jsonb_agg(b.rombel order by b.rombel) from public.bina_damping b
                              where b.penegak_id = auth.uid() and b.tahun_ajaran = sigarda.tahun_ajaran_kini()), '[]'::jsonb),
    'pinsa', coalesce((select pinsa from public.profiles where id = auth.uid()), false));
end $$;
-- ===== akhir aksi pinsa bina damping =====

