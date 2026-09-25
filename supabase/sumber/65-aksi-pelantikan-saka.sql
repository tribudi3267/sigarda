-- ===== Pelantikan dan Saka (Tahap 2, G1): aksi =====
-- Hanya Pembina dan Admin Gudep yang mencatat (Pembina yang langsung membina menentukan kelayakan; Dewan hanya melihat). Pelantikan dicatat SESUDAH terjadi: tanggal tidak boleh
-- di masa depan (rencana kegiatan ada di Agenda). Penegak harus aktif dan sudah menyelesaikan SEMUA butir SKU tingkat itu (sigarda.tingkat_selesai; cermin klien
-- skuLogic.tingkatSelesai). Mencatat ulang Penegak yang sudah tercatat pada tingkat itu MENGGANTI catatannya (koreksi tanggal/tempat).

-- Mencatat pelantikan untuk banyak Penegak sekaligus (satu upacara): semua atau tidak sama sekali. Mengembalikan jumlah Penegak yang dicatat.
create function public.sg_pelantikan_catat(
  p_tingkat text, p_tanggal date, p_tempat text, p_peserta_ids uuid[], p_agenda_id bigint default null, p_catatan text default ''
) returns integer language plpgsql security definer set search_path = public as
$$
declare
  v_tempat text := sigarda.rapikan(p_tempat); v_cat text := sigarda.rapikan(p_catatan); v_ids uuid[]; v_id uuid; v_p public.profiles; v_tk text; v_bantara date; v_n int := 0;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mencatat pelantikan.'; end if;
  if p_tingkat is null or p_tingkat not in ('bantara','laksana') then raise exception 'Tingkat pelantikan harus Bantara atau Laksana.'; end if;
  if p_tanggal is null then raise exception 'Tanggal pelantikan wajib diisi.'; end if;
  if p_tanggal < date '2000-01-01' or p_tanggal > sigarda.hari_ini() then raise exception 'Tanggal pelantikan tidak boleh sebelum tahun 2000 atau di masa depan. Catat pelantikan sesudah terlaksana.'; end if;
  if char_length(v_tempat) not between 1 and 120 or v_tempat ~ '[[:cntrl:]<>]' then raise exception 'Tempat pelantikan wajib diisi (maksimal 120 karakter, tanpa tanda < atau >).'; end if;
  if char_length(v_cat) > 200 or v_cat ~ '[[:cntrl:]<>]' then raise exception 'Catatan maksimal 200 karakter, tanpa tanda < atau >.'; end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_peserta_ids, '{}')) x;
  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception 'Pilih sedikitnya satu Penegak.'; end if;
  if array_length(v_ids, 1) > 200 then raise exception 'Maksimal 200 Penegak sekali catat.'; end if;
  if p_agenda_id is not null and not exists (select 1 from public.agenda where id = p_agenda_id and jenis = 'pelantikan_' || p_tingkat) then
    raise exception 'Kegiatan Agenda yang dipilih bukan pelantikan %.', initcap(p_tingkat);
  end if;
  v_tk := case p_tingkat when 'bantara' then 'Bantara' else 'Laksana' end;
  foreach v_id in array v_ids loop
    select * into v_p from public.profiles where id = v_id and role = 'peserta';
    if not found then raise exception 'Ada anggota yang bukan Penegak.'; end if;
    if v_p.status <> 'aktif' then raise exception '% tidak aktif; pelantikan hanya untuk Penegak aktif.', v_p.nama; end if;
    if not sigarda.tingkat_selesai(v_id, v_tk) then raise exception '% belum menyelesaikan seluruh butir SKU %.', v_p.nama, v_tk; end if;
    if p_tingkat = 'laksana' then
      select tanggal into v_bantara from public.pelantikan where peserta_id = v_id and tingkat = 'bantara';
      if v_bantara is not null and p_tanggal <= v_bantara then raise exception 'Pelantikan Laksana % harus sesudah pelantikan Bantaranya (%).', v_p.nama, to_char(v_bantara, 'YYYY-MM-DD'); end if;
    end if;
    insert into public.pelantikan (peserta_id, tingkat, tanggal, tempat, agenda_id, catatan, dicatat_oleh, dicatat_pada)
    values (v_id, p_tingkat, p_tanggal, v_tempat, p_agenda_id, v_cat, auth.uid(), now())
    on conflict (peserta_id, tingkat) do update
      set tanggal = excluded.tanggal, tempat = excluded.tempat, agenda_id = excluded.agenda_id, catatan = excluded.catatan, dicatat_oleh = excluded.dicatat_oleh, dicatat_pada = excluded.dicatat_pada;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Menghapus satu catatan pelantikan (salah Penegak atau salah tingkat).
create function public.sg_pelantikan_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus catatan pelantikan.'; end if;
  delete from public.pelantikan where id = p_id;
  if not found then raise exception 'Catatan pelantikan tidak ditemukan.'; end if;
end $$;

-- Keanggotaan Saka: tambah (p_id null) atau ubah. Satu Penegak boleh di beberapa Saka, tetapi satu catatan per nama Saka. Status 'aktif' (tanpa tanggal selesai) atau 'selesai'.
create function public.sg_saka_simpan(
  p_id bigint, p_peserta_id uuid, p_saka text, p_tanggal_masuk date, p_status text, p_tanggal_selesai date, p_surat_url text default '', p_catatan text default ''
) returns bigint language plpgsql security definer set search_path = public as
$$
declare
  v_saka text := sigarda.rapikan(p_saka); v_url text := btrim(coalesce(p_surat_url, '')); v_cat text := sigarda.rapikan(p_catatan); v_p public.profiles; v_hasil bigint;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mencatat keanggotaan Saka.'; end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Pilih Penegak.'; end if;
  if v_p.status <> 'aktif' then raise exception '% tidak aktif; keanggotaan Saka hanya dicatat untuk Penegak aktif.', v_p.nama; end if;
  if char_length(v_saka) not between 1 and 60 or v_saka ~ '[[:cntrl:]<>]' then raise exception 'Nama Saka wajib diisi (maksimal 60 karakter, tanpa tanda < atau >).'; end if;
  if p_tanggal_masuk is null then raise exception 'Tanggal masuk Saka wajib diisi.'; end if;
  if p_tanggal_masuk < date '2000-01-01' or p_tanggal_masuk > sigarda.hari_ini() then raise exception 'Tanggal masuk Saka tidak boleh sebelum tahun 2000 atau di masa depan.'; end if;
  if p_status is null or p_status not in ('aktif','selesai') then raise exception 'Status Saka harus aktif atau selesai.'; end if;
  if p_status = 'aktif' and p_tanggal_selesai is not null then raise exception 'Anggota Saka yang masih aktif tidak punya tanggal selesai.'; end if;
  if p_status = 'selesai' and (p_tanggal_selesai is null or p_tanggal_selesai < p_tanggal_masuk or p_tanggal_selesai > sigarda.hari_ini()) then
    raise exception 'Isi tanggal selesai (tidak sebelum tanggal masuk dan tidak di masa depan).';
  end if;
  if v_url <> '' and (v_url !~* '^https?://' or char_length(v_url) > 500 or v_url ~ '[[:cntrl:][:space:]<>]') then raise exception 'Tautan surat keterangan harus berawalan http:// atau https:// (maksimal 500 karakter, tanpa spasi).'; end if;
  if char_length(v_cat) > 200 or v_cat ~ '[[:cntrl:]<>]' then raise exception 'Catatan maksimal 200 karakter, tanpa tanda < atau >.'; end if;
  begin
    if p_id is null then
      insert into public.saka_anggota (peserta_id, saka, tanggal_masuk, status, tanggal_selesai, surat_url, catatan, dicatat_oleh)
      values (p_peserta_id, v_saka, p_tanggal_masuk, p_status, p_tanggal_selesai, v_url, v_cat, auth.uid()) returning id into v_hasil;
    else
      update public.saka_anggota set peserta_id = p_peserta_id, saka = v_saka, tanggal_masuk = p_tanggal_masuk, status = p_status, tanggal_selesai = p_tanggal_selesai,
        surat_url = v_url, catatan = v_cat, dicatat_oleh = auth.uid(), dicatat_pada = now()
      where id = p_id returning id into v_hasil;
      if v_hasil is null then raise exception 'Catatan Saka tidak ditemukan.'; end if;
    end if;
  exception when unique_violation then
    raise exception '% sudah tercatat di Saka %. Ubah catatan yang ada.', v_p.nama, v_saka;
  end;
  return v_hasil;
end $$;

create function public.sg_saka_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus catatan Saka.'; end if;
  delete from public.saka_anggota where id = p_id;
  if not found then raise exception 'Catatan Saka tidak ditemukan.'; end if;
end $$;
-- ===== akhir aksi pelantikan dan saka =====
