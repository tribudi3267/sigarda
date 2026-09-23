-- ===== Pencalonan Penegak Garuda =====
create function public.sg_calon_garuda_daftar() returns void
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_p public.profiles;
begin
  perform sigarda.wajib_aktif();
  select * into v_p from public.profiles where id = v_uid;
  if not found or v_p.role <> 'peserta' then raise exception 'Hanya peserta yang dapat mencalonkan diri.'; end if;
  if not sigarda.layak_garuda(v_uid) then raise exception 'Seluruh butir SKU Bantara dan Laksana harus lulus lebih dulu.'; end if;
  if v_p.calon_garuda is null then
    update public.profiles set calon_garuda = sigarda.hari_ini() where id = v_uid;
  end if;
end $$;

-- ===== Jurnal portofolio Garuda =====
create function public.sg_pf_ubah(p_item_id text, p_status text default null, p_catatan text default null, p_tautan text default null)
returns void language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid(); v_p public.profiles;
  v_status text := 'belum'; v_catatan text := ''; v_tautan text := '';
  n_status text; n_catatan text; n_tautan text; v_ubah text[] := '{}';
  v_label jsonb := '{"belum":"Belum siap","proses":"Sedang disiapkan","siap":"Siap (Ada)"}';
begin
  perform sigarda.wajib_aktif();
  select * into v_p from public.profiles where id = v_uid;
  if not found or v_p.role <> 'peserta' or v_p.calon_garuda is null or not sigarda.layak_garuda(v_uid) then
    raise exception 'Jurnal portofolio khusus Penegak Calon Garuda.';
  end if;
  if not exists (select 1 from public.pf_item where id = p_item_id) then raise exception 'Dokumen portofolio tidak dikenal.'; end if;
  if p_status is not null and p_status not in ('belum','proses','siap') then raise exception 'Status tidak dikenal.'; end if;
  if char_length(coalesce(p_catatan, '')) > 2000 then raise exception 'Catatan maksimal 2000 karakter.'; end if;
  if char_length(coalesce(p_tautan, '')) > 500 then raise exception 'Tautan maksimal 500 karakter.'; end if;
  if btrim(coalesce(p_tautan, '')) <> '' and btrim(p_tautan) !~* '^https?://' then
    raise exception 'Tautan harus diawali http:// atau https://';
  end if;

  select status, catatan, tautan into v_status, v_catatan, v_tautan
    from public.portofolio where peserta_id = v_uid and item_id = p_item_id;
  if not found then   -- SELECT INTO mengisi NULL bila tidak ada baris; kembalikan ke nilai awal
    v_status := 'belum'; v_catatan := ''; v_tautan := '';
  end if;
  n_status := coalesce(p_status, v_status);
  n_catatan := case when p_catatan is null then v_catatan else btrim(p_catatan) end;
  n_tautan := case when p_tautan is null then v_tautan else btrim(p_tautan) end;

  if n_status <> v_status then v_ubah := v_ubah || ('Status: ' || (v_label->>v_status) || ' menjadi ' || (v_label->>n_status)); end if;
  if n_catatan <> btrim(v_catatan) then v_ubah := v_ubah || 'Catatan diperbarui'::text; end if;
  if n_tautan <> btrim(v_tautan) then v_ubah := v_ubah || 'Tautan berkas diperbarui'::text; end if;
  if cardinality(v_ubah) = 0 then return; end if;

  insert into public.portofolio (peserta_id, item_id, status, catatan, tautan, diperbarui)
  values (v_uid, p_item_id, n_status, n_catatan, n_tautan, now())
  on conflict (peserta_id, item_id) do update
    set status = n_status, catatan = n_catatan, tautan = n_tautan, diperbarui = now();
  insert into public.portofolio_jurnal (peserta_id, item_id, teks, oleh)
  values (v_uid, p_item_id, array_to_string(v_ubah, '. '), v_uid);
end $$;

create function public.sg_pf_catat_penguji(p_peserta_id uuid, p_item_id text, p_catatan text) returns void
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_lama text := ''; v_baru text := btrim(coalesce(p_catatan, ''));
begin
  perform sigarda.wajib_aktif();
  if not sigarda.bisa_menguji(v_uid) then
    raise exception 'Hanya Pembina atau Dewan Ambalan yang dapat memberi catatan.';
  end if;
  if p_peserta_id = v_uid then raise exception 'Anda tidak dapat memberi catatan penguji pada portofolio sendiri.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  if not exists (select 1 from public.pf_item where id = p_item_id) then raise exception 'Dokumen portofolio tidak dikenal.'; end if;
  if char_length(v_baru) > 2000 then raise exception 'Catatan maksimal 2000 karakter.'; end if;

  select catatan_penguji into v_lama from public.portofolio where peserta_id = p_peserta_id and item_id = p_item_id;
  if v_baru = btrim(coalesce(v_lama, '')) then return; end if;

  insert into public.portofolio (peserta_id, item_id, catatan_penguji, catatan_penguji_oleh, diperbarui)
  values (p_peserta_id, p_item_id, v_baru, v_uid, now())
  on conflict (peserta_id, item_id) do update set catatan_penguji = v_baru, catatan_penguji_oleh = v_uid;
  insert into public.portofolio_jurnal (peserta_id, item_id, teks, oleh)
  values (p_peserta_id, p_item_id, case when v_baru = '' then 'Catatan penguji dihapus' else 'Catatan penguji ditambahkan' end, v_uid);
end $$;

-- ===== Absensi latihan Jumat (dicatat pengurus) =====
create function public.sg_absen_buat_sesi(p_tanggal date) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau admin yang dapat mencatat absensi.'; end if;
  if p_tanggal is null or p_tanggal < date '2000-01-01' or p_tanggal > date '2100-12-31' then raise exception 'Tanggal tidak valid.'; end if;
  if extract(dow from p_tanggal) <> 5 then raise exception 'Latihan rutin hanya dicatat pada hari Jumat.'; end if;
  if p_tanggal > sigarda.hari_ini() then raise exception 'Sesi belum bisa dibuat untuk tanggal yang belum tiba.'; end if;
  insert into public.absensi_sesi (tanggal, dibuat_oleh) values (p_tanggal, auth.uid()) on conflict (tanggal) do nothing;
end $$;

create function public.sg_absen_set(p_tanggal date, p_peserta_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Tidak diizinkan.'; end if;
  if p_status is not null and p_status not in ('H','I','S','A') then raise exception 'Status absensi tidak dikenal.'; end if;
  if not exists (select 1 from public.absensi_sesi where tanggal = p_tanggal) then raise exception 'Sesi absensi belum dibuat.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  if p_status is null then
    delete from public.absensi_hadir where tanggal = p_tanggal and peserta_id = p_peserta_id;
  else
    insert into public.absensi_hadir (tanggal, peserta_id, status, oleh) values (p_tanggal, p_peserta_id, p_status, auth.uid())
    on conflict (tanggal, peserta_id) do update set status = excluded.status, oleh = excluded.oleh, waktu = now();
  end if;
end $$;

create function public.sg_absen_set_banyak(p_tanggal date, p_peserta_ids uuid[], p_status text, p_hanya_kosong boolean default true)
returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Tidak diizinkan.'; end if;
  if p_status is null or p_status not in ('H','I','S','A') then raise exception 'Status absensi tidak dikenal.'; end if;
  if not exists (select 1 from public.absensi_sesi where tanggal = p_tanggal) then raise exception 'Sesi absensi belum dibuat.'; end if;
  insert into public.absensi_hadir (tanggal, peserta_id, status, oleh)
  select p_tanggal, u.id, p_status, auth.uid()
  from public.profiles u where u.role = 'peserta' and u.status = 'aktif' and u.id = any (p_peserta_ids)
  on conflict (tanggal, peserta_id) do update
    set status = excluded.status, oleh = excluded.oleh, waktu = now()
    where not p_hanya_kosong;
end $$;

create function public.sg_absen_hapus_sesi(p_tanggal date) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Tidak diizinkan.'; end if;
  -- Catatan uang tidak boleh hilang diam-diam bersama sesi: iuran dan tutup kas harus dikosongkan lebih dulu oleh Dewan Ambalan
  if exists (select 1 from public.iuran where tanggal = p_tanggal) or exists (select 1 from public.iuran_kas where tanggal = p_tanggal) then
    raise exception 'Sesi ini memiliki catatan iuran atau tutup kas. Dewan Ambalan perlu mengosongkannya lebih dulu sebelum sesi dihapus.';
  end if;
  delete from public.absensi_sesi where tanggal = p_tanggal;   -- catatan kehadiran ikut terhapus (cascade)
end $$;

