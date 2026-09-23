-- ===== Dokumen terbit: fungsi aksi =====
-- Menerbitkan surat pengantar ke guru agama untuk butir agama Penegak yang tidak punya Pembina seagama (Pembina atau Admin Gudep).
-- Surat dicetak untuk tanda tangan dan stempel basah; QR memuat token (sg_verifikasi_token). Selama surat berlaku, Pembina mana pun boleh
-- mencatat hasil butir-butir itu (yang dinilai guru agama); riwayat menyebut nama guru dan nomor surat. Hanya butir agama milik Penegak itu.
-- Nomor: dari format pengaturan 'surat.format_nomor' (bawaan {no3}/SP/{tahun}) dan penghitung per tahun, atau diisi manual (p_nomor_manual).
-- Mengembalikan { id, token, nomor }.
create function public.sg_dokumen_surat_agama_terbit(
  p_peserta_id uuid, p_butir text[], p_guru_id bigint, p_guru_nama text, p_tanggal date,
  p_penerbit text, p_penanda_nama text, p_penanda_jabatan text, p_nomor_manual text default null, p_catatan text default ''
) returns jsonb language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid(); v_p public.profiles; v_pembuat public.profiles; v_butir text[]; v_guru_id bigint; v_guru text; v_guru_ket text := '';
  v_manual text := sigarda.rapikan(p_nomor_manual); v_cat text := btrim(coalesce(p_catatan, '')); v_penerbit text := sigarda.rapikan(p_penerbit);
  v_nama text := sigarda.rapikan(p_penanda_nama); v_jab text := sigarda.rapikan(p_penanda_jabatan);
  v_tahun int; v_urut int; v_nomor text; v_token text := sigarda.token_acak(); v_id bigint; v_b text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina atau Admin Gudep yang dapat menerbitkan surat pengantar.'; end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found or v_p.agama is null then raise exception 'Peserta tidak ditemukan.'; end if;
  select * into v_pembuat from public.profiles where id = v_uid;
  if exists (select 1 from public.profiles where role = 'penguji' and jabatan = 'Pembina' and agama = v_p.agama) then
    raise exception 'Ada Pembina yang seagama (%) dengan Penegak ini; butir agama diuji oleh Pembina tersebut, jadi surat pengantar tidak diperlukan.', v_p.agama;
  end if;

  select coalesce(array_agg(distinct b order by b), '{}') into v_butir from unnest(coalesce(p_butir, '{}')) b;
  if cardinality(v_butir) = 0 then raise exception 'Pilih sedikitnya satu butir agama.'; end if;
  if cardinality(v_butir) > 30 then raise exception 'Maksimal 30 butir per surat.'; end if;
  foreach v_b in array v_butir loop
    if not exists (select 1 from public.sku_unit where id = v_b and agama = v_p.agama) then
      raise exception 'Butir % bukan butir agama % milik Penegak ini.', v_b, v_p.agama;
    end if;
    if exists (select 1 from public.sku_progress where peserta_id = p_peserta_id and sku_id = v_b and status = 'lulus') then
      raise exception 'Butir % sudah lulus; tidak perlu surat pengantar.', v_b;
    end if;
    if sigarda.surat_agama_aktif(p_peserta_id, v_b) then
      raise exception 'Butir % sudah tercantum pada surat pengantar yang masih berlaku. Cabut surat itu lebih dulu bila perlu membuat ulang.', v_b;
    end if;
  end loop;

  if p_guru_id is not null then
    select id, nama, keterangan into v_guru_id, v_guru, v_guru_ket from public.guru_agama where id = p_guru_id and agama = v_p.agama;
    if not found then raise exception 'Guru agama yang dipilih tidak terdaftar untuk agama %.', v_p.agama; end if;
  else
    v_guru := sigarda.rapikan(p_guru_nama);
    if v_guru = '' then raise exception 'Pilih guru agama atau tulis namanya.'; end if;
    if char_length(v_guru) > 120 then raise exception 'Nama guru agama maksimal 120 karakter.'; end if;
  end if;
  if p_tanggal is null or p_tanggal < date '2000-01-01' or p_tanggal > sigarda.hari_ini() + 30 then raise exception 'Tanggal surat tidak valid.'; end if;
  if v_penerbit = '' or char_length(v_penerbit) > 120 then raise exception 'Nama penerbit wajib diisi (maksimal 120 karakter).'; end if;
  if v_nama = '' or char_length(v_nama) > 120 then raise exception 'Nama penanda tangan wajib diisi (maksimal 120 karakter).'; end if;
  if v_jab = '' or char_length(v_jab) > 80 then raise exception 'Jabatan penanda tangan wajib diisi (maksimal 80 karakter).'; end if;
  if char_length(v_cat) > 300 then raise exception 'Catatan maksimal 300 karakter.'; end if;

  v_tahun := extract(year from p_tanggal)::int;
  if v_manual <> '' then
    if char_length(v_manual) > 80 then raise exception 'Nomor surat maksimal 80 karakter.'; end if;
    v_nomor := v_manual;
  else
    insert into public.dokumen_urut as u (jenis, tahun, terakhir) values ('surat_pengantar_agama', v_tahun, 1)
    on conflict (jenis, tahun) do update set terakhir = u.terakhir + 1
    returning u.terakhir into v_urut;
    v_nomor := sigarda.format_nomor(sigarda.pengaturan_teks('surat.format_nomor', '{no3}/SP/{tahun}'), v_urut, p_tanggal, '');
  end if;
  if exists (select 1 from public.dokumen_terbit where nomor = v_nomor) then raise exception 'Nomor surat % sudah dipakai.', v_nomor; end if;

  insert into public.dokumen_terbit (
    token, kode, jenis, nomor, nomor_urut, tanggal, peserta_id, peserta_nama, penerbit, dibuat_oleh, dibuat_oleh_nama, dibuat_oleh_jabatan,
    penanda_tangan_nama, penanda_tangan_jabatan, payload
  ) values (
    v_token, sigarda.kode_verifikasi(array[v_token, 'surat_pengantar_agama', v_nomor]), 'surat_pengantar_agama', v_nomor, v_urut, p_tanggal,
    p_peserta_id, v_p.nama, v_penerbit, v_uid, v_pembuat.nama, coalesce(v_pembuat.jabatan, ''), v_nama, v_jab,
    jsonb_build_object('agama', v_p.agama, 'nis', coalesce(v_p.nis, ''), 'kelas', coalesce(v_p.kelas, ''), 'sangga', coalesce(v_p.sangga, ''),
      'guru', jsonb_build_object('id', v_guru_id, 'nama', v_guru, 'keterangan', v_guru_ket), 'butir', to_jsonb(v_butir), 'catatan', v_cat)
  ) returning id into v_id;

  foreach v_b in array v_butir loop
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (p_peserta_id, v_b, 'Surat pengantar nomor ' || v_nomor || ' diterbitkan untuk guru agama ' || v_guru, v_uid);
  end loop;
  return jsonb_build_object('id', v_id, 'token', v_token, 'nomor', v_nomor);
end $$;

-- Mencabut surat (mis. salah isi atau Pembina seagama sudah ada). Setelah dicabut, hasil butir tidak lagi dapat dicatat lewat surat itu,
-- dan QR-nya menjawab "dicabut". Alasan wajib dan tercatat di riwayat butir.
create function public.sg_dokumen_cabut(p_id bigint, p_alasan text) returns void
language plpgsql security definer set search_path = public as
$$
declare v_d public.dokumen_terbit; v_alasan text := sigarda.rapikan(p_alasan); v_b text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina atau Admin Gudep yang dapat mencabut surat.'; end if;
  select * into v_d from public.dokumen_terbit where id = p_id;
  if not found then raise exception 'Dokumen tidak ditemukan.'; end if;
  if v_d.dicabut_pada is not null then raise exception 'Dokumen ini sudah dicabut.'; end if;
  if v_alasan = '' then raise exception 'Isi alasan pencabutan.'; end if;
  if char_length(v_alasan) > 200 then raise exception 'Alasan maksimal 200 karakter.'; end if;
  update public.dokumen_terbit set dicabut_pada = now(), dicabut_oleh = auth.uid(), dicabut_alasan = v_alasan where id = p_id;
  if v_d.peserta_id is not null then
    for v_b in select jsonb_array_elements_text(v_d.payload -> 'butir') loop
      insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
      values (v_d.peserta_id, v_b, 'Surat pengantar nomor ' || v_d.nomor || ' dicabut. Alasan: ' || v_alasan, auth.uid());
    end loop;
  end if;
end $$;
-- ===== akhir fungsi dokumen =====

