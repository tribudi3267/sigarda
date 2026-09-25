-- ===== Pra-uji berjenjang (fase C): bantu =====
-- Aturan penilai pra-uji (aturan pengaman: hanya menyaring butir yang sudah ia lulus sendiri; butir agama bersifat per agama sehingga otomatis seagama):
--   * tahap 'pinsa'        : Pinsa (aktif) sangga dan rombel yang sama dengan Penegak; hanya butir Bantara; Pinsa yang mengajukan sendiri melewati tahap ini.
--   * tahap 'bina_damping' : Bina Damping rombel Penegak pada tahun ajaran berjalan; butir Laksana hanya oleh Bina Damping yang sudah Laksana;
--                            Bina Damping yang mengajukan sendiri disaring Bina Damping lain di rombelnya.
-- Tidak ada penilai yang memenuhi syarat pada suatu tahap = tahap itu dilewati; bila semua tahap terlewati, pengajuan langsung ke Pembina.
create function sigarda.pra_uji_penilai_ok(p_peserta uuid, p_sku text, p_tahap text, p_penilai uuid) returns boolean
language plpgsql stable security definer set search_path = public as
$$
declare v_p public.profiles; v_n public.profiles; v_tingkat text;
begin
  if p_penilai is null or p_penilai = p_peserta then return false; end if;
  select * into v_p from public.profiles where id = p_peserta and role = 'peserta';
  if not found then return false; end if;
  select * into v_n from public.profiles where id = p_penilai and role = 'peserta' and status = 'aktif';
  if not found then return false; end if;
  select tingkat into v_tingkat from public.sku_unit where id = p_sku;
  if not found then return false; end if;
  if not exists (select 1 from public.sku_progress where peserta_id = p_penilai and sku_id = p_sku and status = 'lulus') then return false; end if;
  if p_tahap = 'pinsa' then
    return v_tingkat = 'Bantara' and v_n.pinsa and not v_p.pinsa and v_p.kelas is not null and v_n.kelas = v_p.kelas
       and lower(v_n.sangga) = lower(v_p.sangga);
  elsif p_tahap = 'bina_damping' then
    return exists (select 1 from public.bina_damping b where b.penegak_id = p_penilai and b.rombel = v_p.kelas and b.tahun_ajaran = sigarda.tahun_ajaran_kini())
       and (v_tingkat = 'Bantara' or sigarda.tingkat_penegak(p_penilai) = 'laksana');
  end if;
  return false;
end $$;

-- Semua penilai yang memenuhi syarat pada satu tahap untuk satu Penegak dan satu butir.
create function sigarda.pra_uji_penilai_daftar(p_peserta uuid, p_sku text, p_tahap text) returns setof uuid
language sql stable security definer set search_path = public as
$$
  select u.id from public.profiles u
  where u.role = 'peserta' and u.status = 'aktif'
    and case p_tahap when 'pinsa' then u.pinsa when 'bina_damping' then exists (select 1 from public.bina_damping b where b.penegak_id = u.id) else false end
    and sigarda.pra_uji_penilai_ok(p_peserta, p_sku, p_tahap, u.id)
$$;

-- Tahap sesudah p_setelah (null = mulai dari awal) yang punya penilai: 'pinsa', 'bina_damping', atau 'pembina' (uji resmi).
create function sigarda.pra_uji_tahap_berikut(p_peserta uuid, p_sku text, p_setelah text) returns text
language plpgsql stable security definer set search_path = public as
$$
declare v_urut text[]; v_tahap text;
begin
  v_urut := case when (select tingkat from public.sku_unit where id = p_sku) = 'Bantara' then array['pinsa', 'bina_damping'] else array['bina_damping'] end;
  foreach v_tahap in array v_urut loop
    if p_setelah is not null and array_position(v_urut, v_tahap) <= coalesce(array_position(v_urut, p_setelah), 0) then continue; end if;
    if exists (select 1 from sigarda.pra_uji_penilai_daftar(p_peserta, p_sku, v_tahap)) then return v_tahap; end if;
  end loop;
  return 'pembina';
end $$;

create function sigarda.pra_uji_nama_tahap(p_tahap text) returns text language sql immutable as
$$ select case p_tahap when 'pinsa' then 'Pinsa' when 'bina_damping' then 'Bina Damping' else 'Pembina' end $$;

-- Meneruskan pengajuan ke tahap berikutnya sesudah p_setelah (null = pengajuan baru): baris pra-uji tahap itu, atau bila tidak ada lagi, pengajuan uji resmi
-- (sku_progress 'diajukan', antrian rombel Pembina). Mengembalikan tahap tujuan. Riwayat SKU mencatat perjalanannya.
create function sigarda.pra_uji_teruskan(p_peserta uuid, p_sku text, p_setelah text, p_jadwal date, p_catatan_peserta text, p_oleh uuid) returns text
language plpgsql security definer set search_path = public as
$$
declare v_tahap text := sigarda.pra_uji_tahap_berikut(p_peserta, p_sku, p_setelah);
begin
  if v_tahap = 'pembina' then
    if not exists (select 1 from sigarda.penguji_sah(p_peserta, p_sku)) then
      raise exception 'Belum ada Pembina yang dapat menguji butir ini untuk rombel Penegak tersebut. Hubungi Admin Gudep.';
    end if;
    insert into public.sku_progress (peserta_id, sku_id, status, jadwal, penguji_id, catatan_peserta, diubah)
    values (p_peserta, p_sku, 'diajukan', p_jadwal, null, p_catatan_peserta, now())
    on conflict (peserta_id, sku_id) do update
      set status = 'diajukan', jadwal = excluded.jadwal, penguji_id = null, catatan_peserta = excluded.catatan_peserta, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (p_peserta, p_sku, case when p_setelah is null then 'Mengajukan pengujian untuk ' || to_char(p_jadwal, 'YYYY-MM-DD') || ' (antrian rombel, tanpa pra-uji)'
                                   else 'Diteruskan ke pengujian resmi Pembina untuk ' || to_char(p_jadwal, 'YYYY-MM-DD') end, p_oleh);
  else
    insert into public.sku_pra_uji (peserta_id, sku_id, tahap, jadwal, catatan_peserta) values (p_peserta, p_sku, v_tahap, p_jadwal, p_catatan_peserta);
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (p_peserta, p_sku, case when p_setelah is null then 'Mengajukan pengujian untuk ' || to_char(p_jadwal, 'YYYY-MM-DD') || '; menunggu pra-uji ' || sigarda.pra_uji_nama_tahap(v_tahap)
                                   else 'Diteruskan ke pra-uji ' || sigarda.pra_uji_nama_tahap(v_tahap) end, p_oleh);
  end if;
  return v_tahap;
end $$;

-- Penegak mengajukan butir lewat jalur pra-uji (dipanggil sg_sku_ajukan sesudah pemeriksaan umum). Satu pengajuan menunggu per butir.
create function sigarda.pra_uji_mulai(p_peserta uuid, p_sku text, p_jadwal date, p_catatan text) returns void
language plpgsql security definer set search_path = public as
$$
begin
  if exists (select 1 from public.sku_pra_uji where peserta_id = p_peserta and sku_id = p_sku and status = 'menunggu') then
    raise exception 'Poin ini sedang menunggu pra-uji.';
  end if;
  if not exists (select 1 from sigarda.penguji_sah(p_peserta, p_sku)) then
    raise exception 'Belum ada penguji yang dapat menguji butir ini untuk rombel Anda. Hubungi Admin Gudep.';
  end if;
  perform sigarda.pra_uji_teruskan(p_peserta, p_sku, null, p_jadwal, btrim(coalesce(p_catatan, '')), p_peserta);
end $$;

-- Notifikasi ke Penegak sesudah pra-uji lulus (atau tahap dilewati Pembina): kata kunci "diteruskan ke pra-uji selanjutnya" atau
-- "diteruskan ke pengujian resmi ke Pembina" (keputusan pemilik; berbeda dari hasil uji resmi yang isinya tanpa hasil).
create function sigarda.pra_uji_beritahu_lulus(p_peserta uuid, p_sku text, p_tujuan text, p_dilewati boolean default false) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.notif_buat(p_peserta, 'pra_uji', case when p_dilewati then 'Tahap pra-uji dilewati' else 'Pra-uji lulus' end,
    sigarda.notif_label_butir(p_sku) || case when p_dilewati then ' melewati satu tahap pra-uji dan ' else ' lulus pra-uji dan ' end || case when p_tujuan = 'pembina' then 'diteruskan ke pengujian resmi ke Pembina.' else 'diteruskan ke pra-uji selanjutnya.' end,
    '{"tab":"sku"}');
end $$;

-- Pengajuan pra-uji baru: beri tahu semua penilai yang memenuhi syarat pada tahap itu.
create function sigarda.notif_pra_uji() returns trigger language plpgsql security definer set search_path = public as
$$
declare v_x uuid; v_nama text; v_label text := sigarda.notif_label_butir(NEW.sku_id);
begin
  if NEW.status <> 'menunggu' then return null; end if;
  select nama into v_nama from public.profiles where id = NEW.peserta_id;
  for v_x in select * from sigarda.pra_uji_penilai_daftar(NEW.peserta_id, NEW.sku_id, NEW.tahap) loop
    perform sigarda.notif_buat(v_x, 'pra_uji', 'Pengajuan pra-uji baru', v_nama || ' mengajukan ' || v_label || ' untuk pra-uji ' || sigarda.pra_uji_nama_tahap(NEW.tahap), '{"tab":"pra-uji"}');
  end loop;
  return null;
end $$;
create trigger notif_pra_uji after insert on public.sku_pra_uji for each row execute function sigarda.notif_pra_uji();

-- Pengingat harian (dipanggil sigarda.notif_pengingat): pra-uji menunggu lebih dari 3 hari diingatkan kepada penilainya (sekali per pengajuan). Tanpa penilai
-- (macet) hanya diingatkan kepada Pembina; pengajuan TIDAK pernah lolos otomatis.
create function sigarda.pra_uji_pengingat() returns void language plpgsql security definer set search_path = public as
$$
declare r record; v_x uuid; v_ada boolean;
begin
  for r in select u.id, u.peserta_id, u.sku_id, u.tahap, p.nama from public.sku_pra_uji u join public.profiles p on p.id = u.peserta_id
           where u.status = 'menunggu' and u.dibuat < now() - interval '3 days' loop
    v_ada := false;
    for v_x in select * from sigarda.pra_uji_penilai_daftar(r.peserta_id, r.sku_id, r.tahap) loop
      v_ada := true;
      perform sigarda.notif_buat(v_x, 'pra_uji', 'Pra-uji menunggu lebih dari 3 hari', r.nama || ', ' || sigarda.notif_label_butir(r.sku_id), '{"tab":"pra-uji"}', 'pra-lama:' || r.id);
    end loop;
    if not v_ada then
      for v_x in select id from public.profiles where role = 'penguji' and jabatan = 'Pembina' and status = 'aktif' loop
        perform sigarda.notif_buat(v_x, 'pra_uji', 'Pra-uji tanpa penilai',
          r.nama || ', ' || sigarda.notif_label_butir(r.sku_id) || ': belum ada ' || sigarda.pra_uji_nama_tahap(r.tahap) || ' yang dapat menilai. Lewati tahap ini bila perlu.',
          '{"tab":"pra-uji"}', 'pra-macet:' || r.id);
      end loop;
    end if;
  end loop;
end $$;
-- ===== akhir bantu pra-uji =====
