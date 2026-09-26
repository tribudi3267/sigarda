-- ===== Isian Penegak dan templat dokumen (Tahap 3, H1): aksi =====
-- Isian data diri milik SENDIRI oleh Penegak aktif (admin gudep hanya membuat akun dengan nama, NIS, dan rombel). p_data = objek datar { kunci: teks }: kunci profil (jk, agama,
-- lahir, nta) hanya boleh diisi bila belum ada (koreksi sesudahnya lewat Pembina atau Admin) dan kunci isian lain (lihat sigarda.isian_periksa) boleh diubah kapan saja; nilai
-- kosong menghapus isian (kunci profil kosong = tidak diubah). Semua atau tidak sama sekali. Mengembalikan jumlah isian yang berubah.
create function public.sg_isian_saya_simpan(p_data jsonb) returns integer language plpgsql security definer set search_path = public as
$$
declare v_p public.profiles; v_k text; v_e jsonb; v_v text; v_err text; v_n int := 0; v_k2 int; v_tgl date;
begin
  perform sigarda.wajib_aktif();
  select * into v_p from public.profiles where id = auth.uid();
  if not found or v_p.role <> 'peserta' then raise exception 'Isian data diri hanya untuk Penegak.'; end if;
  if v_p.status <> 'aktif' then raise exception 'Akun Anda berstatus % dan hanya dapat dilihat.', v_p.status; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Data isian tidak sah.'; end if;
  if (select count(*) from jsonb_object_keys(p_data)) > 120 then raise exception 'Terlalu banyak isian dalam satu permintaan.'; end if;

  -- Tahap 1: periksa semuanya lebih dulu
  for v_k, v_e in select key, value from jsonb_each(p_data) loop
    if jsonb_typeof(v_e) <> 'string' then raise exception 'Isian % harus berupa teks.', left(v_k, 40); end if;
    v_v := sigarda.rapikan(v_e #>> '{}');
    if v_k in ('jk', 'agama', 'lahir', 'nta') then v_err := sigarda.isian_periksa_profil(v_k, v_v);
    else v_err := sigarda.isian_periksa(v_k, v_v);
    end if;
    if v_err is not null then raise exception '%', v_err; end if;
  end loop;

  -- Tahap 2: tulis
  for v_k, v_e in select key, value from jsonb_each(p_data) loop
    v_v := sigarda.rapikan(v_e #>> '{}');
    if v_k = 'jk' then
      if v_v <> '' and v_p.jenis_kelamin is distinct from v_v then
        if v_p.jenis_kelamin is not null then raise exception 'Jenis kelamin sudah tercatat. Untuk mengoreksi, hubungi Pembina atau Admin Gudep.'; end if;
        update public.profiles set jenis_kelamin = v_v where id = v_p.id; v_n := v_n + 1;
      end if;
    elsif v_k = 'agama' then
      if v_v <> '' and v_p.agama is distinct from v_v then
        if v_p.agama is not null then raise exception 'Agama sudah tercatat. Untuk mengoreksi, hubungi Admin Gudep.'; end if;
        update public.profiles set agama = v_v where id = v_p.id; v_n := v_n + 1;
      end if;
    elsif v_k = 'nta' then
      if v_v <> '' and v_p.nta is distinct from v_v then
        if v_p.nta is not null then raise exception 'NTA sudah tercatat. Untuk mengoreksi, hubungi Admin Gudep.'; end if;
        update public.profiles set nta = v_v where id = v_p.id; v_n := v_n + 1;
      end if;
    elsif v_k = 'lahir' then
      if v_v <> '' then
        v_tgl := v_v::date;
        if exists (select 1 from public.tanggal_lahir where peserta_id = v_p.id and tanggal <> v_tgl) then
          raise exception 'Tanggal lahir sudah tercatat. Untuk mengoreksi, hubungi Pembina atau Admin Gudep.';
        end if;
        insert into public.tanggal_lahir (peserta_id, tanggal, dicatat_oleh, dicatat_pada) values (v_p.id, v_tgl, v_p.id, now()) on conflict (peserta_id) do nothing;
        get diagnostics v_k2 = row_count; v_n := v_n + v_k2;
      end if;
    elsif v_v = '' then
      delete from public.penegak_isian where peserta_id = v_p.id and kunci = v_k;
      get diagnostics v_k2 = row_count; v_n := v_n + v_k2;
    else
      insert into public.penegak_isian (peserta_id, kunci, nilai, diubah_pada) values (v_p.id, v_k, v_v, now())
      on conflict (peserta_id, kunci) do update set nilai = excluded.nilai, diubah_pada = excluded.diubah_pada where public.penegak_isian.nilai is distinct from excluded.nilai;
      get diagnostics v_k2 = row_count; v_n := v_n + v_k2;
    end if;
  end loop;
  return v_n;
end $$;

-- Templat isi dokumen per tahun ajaran (rubrik surat keterangan guru): Pembina atau Admin. isi = { uji?: teks (<= 200), baris: [teks 1-300 karakter, paling banyak 40; berawalan "# " =
-- judul kelompok], pita?: [tiga teks <= 20] }. Menyimpan ulang tahun ajaran dan jenis yang sama mengganti isinya. Mengembalikan id.
create function public.sg_dokumen_templat_simpan(p_tahun_ajaran text, p_jenis text, p_isi jsonb) returns bigint language plpgsql security definer set search_path = public as
$$
declare v_ta text := sigarda.rapikan(p_tahun_ajaran); v_e jsonb; v_t text; v_uji text; v_baris jsonb := '[]'::jsonb; v_pita jsonb; v_id bigint;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah templat dokumen.'; end if;
  if v_ta !~ '^\d{4}/\d{4}$' then raise exception 'Tahun ajaran harus berbentuk 2026/2027.'; end if;
  if split_part(v_ta, '/', 2)::int <> split_part(v_ta, '/', 1)::int + 1 then raise exception 'Tahun ajaran harus berbentuk 2026/2027.'; end if;
  if coalesce(p_jenis, '') not in ('surat_uud', 'surat_uu_pramuka', 'surat_tik', 'surat_internet', 'surat_bahasa', 'surat_seni', 'surat_iptek', 'surat_olahraga') then raise exception 'Jenis templat tidak dikenal.'; end if;
  if p_isi is null or jsonb_typeof(p_isi) <> 'object' or p_isi - 'uji' - 'baris' - 'pita' <> '{}'::jsonb then raise exception 'Bentuk isi templat tidak sah.'; end if;

  if p_isi ? 'uji' then
    if jsonb_typeof(p_isi -> 'uji') <> 'string' then raise exception 'Topik uji harus berupa teks.'; end if;
    v_uji := sigarda.rapikan(p_isi ->> 'uji');
    if char_length(v_uji) > 200 or v_uji ~ '[[:cntrl:]<>]' then raise exception 'Topik uji maksimal 200 karakter dan tanpa karakter khusus.'; end if;
  end if;
  if coalesce(jsonb_typeof(p_isi -> 'baris'), '') <> 'array' then raise exception 'Baris rubrik harus berupa daftar.'; end if;
  if jsonb_array_length(p_isi -> 'baris') > 40 then raise exception 'Baris rubrik maksimal 40.'; end if;
  for v_e in select * from jsonb_array_elements(p_isi -> 'baris') loop
    if jsonb_typeof(v_e) <> 'string' then raise exception 'Setiap baris rubrik harus berupa teks.'; end if;
    v_t := sigarda.rapikan(v_e #>> '{}');
    if v_t = '' or char_length(v_t) > 300 or v_t ~ '[[:cntrl:]<>]' then raise exception 'Setiap baris rubrik 1 sampai 300 karakter dan tanpa karakter khusus.'; end if;
    v_baris := v_baris || to_jsonb(v_t);
  end loop;
  if p_isi ? 'pita' and jsonb_typeof(p_isi -> 'pita') <> 'null' then
    if jsonb_typeof(p_isi -> 'pita') <> 'array' or jsonb_array_length(p_isi -> 'pita') <> 3 then raise exception 'Pita nilai harus tiga teks.'; end if;
    v_pita := '[]'::jsonb;
    for v_e in select * from jsonb_array_elements(p_isi -> 'pita') loop
      if jsonb_typeof(v_e) <> 'string' then raise exception 'Pita nilai harus berupa teks.'; end if;
      v_t := sigarda.rapikan(v_e #>> '{}');
      if char_length(v_t) > 20 or v_t ~ '[[:cntrl:]<>]' then raise exception 'Setiap pita nilai maksimal 20 karakter dan tanpa karakter khusus.'; end if;
      v_pita := v_pita || to_jsonb(v_t);
    end loop;
  end if;

  insert into public.dokumen_templat (tahun_ajaran, jenis, isi, diubah_oleh, diubah_pada)
  values (v_ta, p_jenis, jsonb_strip_nulls(jsonb_build_object('uji', nullif(v_uji, ''), 'baris', v_baris, 'pita', v_pita)), auth.uid(), now())
  on conflict (tahun_ajaran, jenis) do update set isi = excluded.isi, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada
  returning id into v_id;
  return v_id;
end $$;

create function public.sg_dokumen_templat_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus templat dokumen.'; end if;
  delete from public.dokumen_templat where id = p_id;
end $$;
-- ===== akhir aksi isian penegak =====

-- ===== Salinan beku portofolio (Tahap 3, H3): aksi =====
-- Menyimpan salinan beku Portofolio format Kwarcab satu Penegak (Pembina dan Admin). p_isi = objek yang memuat `peserta` (id harus sama dengan p_peserta_id) dan `hari`; paling
-- banyak 600 kB dan 20 salinan per Penegak. Mengembalikan id salinan.
create function public.sg_portofolio_snapshot_simpan(p_peserta_id uuid, p_catatan text, p_isi jsonb) returns bigint language plpgsql security definer set search_path = public as
$$
declare v_p public.profiles; v_cat text := sigarda.rapikan(p_catatan); v_id bigint; v_oleh text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat membuat salinan beku portofolio.'; end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Pilih Penegak.'; end if;
  if char_length(v_cat) > 200 or v_cat ~ '[[:cntrl:]<>]' then raise exception 'Catatan maksimal 200 karakter dan tanpa karakter khusus.'; end if;
  if p_isi is null or jsonb_typeof(p_isi) <> 'object' then raise exception 'Isi salinan tidak sah.'; end if;
  if coalesce(jsonb_typeof(p_isi -> 'peserta'), '') <> 'object' or coalesce(p_isi #>> '{peserta,id}', '') <> p_peserta_id::text or coalesce(jsonb_typeof(p_isi -> 'hari'), '') <> 'string' then
    raise exception 'Isi salinan tidak sesuai dengan Penegak yang dipilih.';
  end if;
  if octet_length(p_isi::text) > 600000 then raise exception 'Isi salinan terlalu besar (maksimal 600 kB).'; end if;
  if (select count(*) from public.portofolio_snapshot where peserta_id = p_peserta_id) >= 20 then
    raise exception 'Sudah ada 20 salinan beku untuk Penegak ini. Hapus yang tidak diperlukan lebih dulu.';
  end if;
  select nama into v_oleh from public.profiles where id = auth.uid();
  insert into public.portofolio_snapshot (peserta_id, tahun_ajaran, catatan, isi, dibuat_oleh, dibuat_oleh_nama)
  values (p_peserta_id, sigarda.tahun_ajaran_kini(), v_cat, p_isi, auth.uid(), coalesce(v_oleh, '')) returning id into v_id;
  return v_id;
end $$;

create function public.sg_portofolio_snapshot_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus salinan beku portofolio.'; end if;
  delete from public.portofolio_snapshot where id = p_id;
end $$;
-- ===== akhir aksi salinan beku portofolio =====

-- ===== Perlindungan anggota / Safe From Harm (Tahap 4): aksi =====
-- Mencatat (atau mengoreksi) satu catatan Safe From Harm bagi anggota dewasa gugus depan: Pembina aktif (pelatihan, pakta_integritas, rekam_jejak) atau Admin Gudep aktif (pelatihan saja).
-- Pembina dan Admin yang mencatat. tanggal tidak boleh di masa depan; bukti_url (opsional) tautan http(s); catatan <= 200 karakter. Mencatat ulang = koreksi.
create function public.sg_sfh_catat(p_anggota_id uuid, p_jenis text, p_tanggal date, p_bukti_url text default '', p_catatan text default '') returns void language plpgsql security definer set search_path = public as
$$
declare v_p public.profiles; v_url text := btrim(coalesce(p_bukti_url, '')); v_cat text := sigarda.rapikan(p_catatan);
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mencatat Safe From Harm.'; end if;
  if coalesce(p_jenis, '') not in ('pelatihan', 'pakta_integritas', 'rekam_jejak') then raise exception 'Jenis catatan harus pelatihan, pakta_integritas, atau rekam_jejak.'; end if;
  select * into v_p from public.profiles where id = p_anggota_id;
  if not found then raise exception 'Pilih anggota.'; end if;
  if v_p.status <> 'aktif' or not ((v_p.role = 'penguji' and v_p.jabatan = 'Pembina') or v_p.role = 'admin') then
    raise exception 'Catatan Safe From Harm hanya untuk anggota dewasa aktif (Pembina dan Admin Gudep).';
  end if;
  if v_p.role = 'admin' and p_jenis <> 'pelatihan' then raise exception 'Admin Gudep hanya dicatat untuk pelatihan; pakta integritas dan rekam jejak untuk Pembina.'; end if;
  if p_tanggal is null or p_tanggal < date '2015-01-01' or p_tanggal > sigarda.hari_ini() then raise exception 'Tanggal tidak boleh sebelum tahun 2015 atau di masa depan.'; end if;
  if char_length(v_url) > 500 then raise exception 'Tautan bukti maksimal 500 karakter.'; end if;
  if v_url <> '' and v_url !~* '^https?://[^[:space:]<>]+$' then raise exception 'Tautan bukti harus berawalan http:// atau https:// tanpa spasi.'; end if;
  if char_length(v_cat) > 200 or v_cat ~ '[[:cntrl:]<>]' then raise exception 'Catatan maksimal 200 karakter dan tanpa karakter khusus.'; end if;
  insert into public.sfh_catatan (anggota_id, jenis, tanggal, bukti_url, catatan, dicatat_oleh, dicatat_pada)
  values (p_anggota_id, p_jenis, p_tanggal, v_url, v_cat, auth.uid(), now())
  on conflict (anggota_id, jenis) do update set tanggal = excluded.tanggal, bukti_url = excluded.bukti_url, catatan = excluded.catatan, dicatat_oleh = excluded.dicatat_oleh, dicatat_pada = excluded.dicatat_pada;
end $$;

create function public.sg_sfh_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus catatan Safe From Harm.'; end if;
  delete from public.sfh_catatan where id = p_id;
end $$;

-- Penerima laporan gugus depan (Pasal 10 ayat 3: setiap gugus depan wajib memiliki prosedur penerimaan laporan). Pengaturan 'perlindungan.gudep' = { penerima, kontak, prosedurUrl, catatan }
-- (dibaca semua pengguna agar Penegak tahu kepada siapa melapor; diubah Pembina dan Admin). Laporan sendiri TIDAK disimpan di aplikasi.
create function public.sg_sfh_gudep_simpan(p_nilai jsonb) returns void language plpgsql security definer set search_path = public as
$$
declare v_k text; v_v text; v_maks int; v_h jsonb := '{}'::jsonb;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah penerima laporan Safe From Harm.'; end if;
  if p_nilai is null or jsonb_typeof(p_nilai) <> 'object' or p_nilai - 'penerima' - 'kontak' - 'prosedurUrl' - 'catatan' <> '{}'::jsonb then raise exception 'Bentuk isian tidak sah.'; end if;
  foreach v_k in array array['penerima', 'kontak', 'prosedurUrl', 'catatan'] loop
    if coalesce(jsonb_typeof(p_nilai -> v_k), '') <> 'string' then raise exception 'Isian % harus berupa teks.', v_k; end if;
    if v_k = 'prosedurUrl' then
      v_v := btrim(p_nilai ->> v_k);
      if char_length(v_v) > 500 or (v_v <> '' and v_v !~* '^https?://[^[:space:]<>]+$') then raise exception 'Tautan prosedur harus berawalan http:// atau https:// tanpa spasi (maksimal 500 karakter).'; end if;
    else
      v_v := sigarda.rapikan(p_nilai ->> v_k);
      v_maks := case v_k when 'penerima' then 120 when 'kontak' then 80 else 300 end; -- (case di dalam kondisi if terpotong pada then pertama)
      if char_length(v_v) > v_maks or v_v ~ '[[:cntrl:]<>]' then
        raise exception 'Isian % terlalu panjang atau memuat karakter khusus.', v_k;
      end if;
    end if;
    v_h := v_h || jsonb_build_object(v_k, v_v);
  end loop;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada) values ('perlindungan.gudep', v_h, auth.uid(), now())
  on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;
-- ===== akhir aksi perlindungan anggota =====
