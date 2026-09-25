-- ===== Tim penilai dan kalender Garuda (Tahap 2, G4b dan G4c): aksi =====
-- Hanya Pembina dan Admin Gudep yang mengubah (Ketua Gudep mengajukan tim penilai lewat Kwarran; di aplikasi Pembina atau Admin yang mencatat hasilnya). Dewan hanya membaca.
-- Komposisi tim tidak diblokir (peringatan di klien); yang ditegakkan hanya bentuk isian.

-- Menyimpan satu tim penilai beserta seluruh anggotanya (atomik; anggota lama diganti). p_id kosong = tim baru. Satu tim per (tahun ajaran, untuk).
-- p_anggota = [{ nama, unsur, jabatan ('ketua' | 'anggota'), keterangan }] 1-15 orang (urutan larik = urutan tampil); paling banyak satu ketua.
create function public.sg_tim_penilai_simpan(
  p_id bigint, p_tahun_ajaran text, p_untuk text, p_nomor_sk text, p_tanggal_sk date, p_sk_url text, p_catatan text, p_anggota jsonb
) returns bigint language plpgsql security definer set search_path = public as
$$
declare
  v_nomor text := sigarda.rapikan(p_nomor_sk); v_url text := btrim(coalesce(p_sk_url, '')); v_cat text := sigarda.rapikan(p_catatan);
  v_id bigint; v_e jsonb; v_i int := 0; v_nama text; v_unsur text; v_jab text; v_ket text; v_ketua int := 0;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mencatat tim penilai.'; end if;
  if p_tahun_ajaran is null or p_tahun_ajaran !~ '^[0-9]{4}/[0-9]{4}$' then raise exception 'Tahun ajaran tidak sah.'; end if;
  if p_untuk is null or p_untuk not in ('putra', 'putri') then raise exception 'Tim penilai harus untuk putra atau putri.'; end if;
  if char_length(v_nomor) > 80 or v_nomor ~ '[[:cntrl:]<>]' then raise exception 'Nomor SK maksimal 80 karakter, tanpa tanda < atau >.'; end if;
  if (v_nomor = '') <> (p_tanggal_sk is null) then raise exception 'Nomor SK dan tanggal SK diisi berpasangan (keduanya atau tidak sama sekali).'; end if;
  if p_tanggal_sk is not null and (p_tanggal_sk < date '2000-01-01' or p_tanggal_sk > sigarda.hari_ini()) then raise exception 'Tanggal SK tidak boleh sebelum tahun 2000 atau di masa depan.'; end if;
  if v_url <> '' and (v_url !~* '^https?://' or char_length(v_url) > 500 or v_url ~ '[[:cntrl:][:space:]<>]') then raise exception 'Tautan SK harus berawalan http:// atau https:// (maksimal 500 karakter, tanpa spasi).'; end if;
  if char_length(v_cat) > 300 or v_cat ~ '[[:cntrl:]<>]' then raise exception 'Catatan maksimal 300 karakter, tanpa tanda < atau >.'; end if;
  if p_anggota is null or jsonb_typeof(p_anggota) <> 'array' or jsonb_array_length(p_anggota) not between 1 and 15 then raise exception 'Isi 1 sampai 15 anggota tim penilai.'; end if;
  for v_e in select * from jsonb_array_elements(p_anggota) loop
    v_i := v_i + 1;
    if jsonb_typeof(v_e) <> 'object' then raise exception 'Anggota tim nomor % tidak sah.', v_i; end if;
    v_nama := sigarda.rapikan(v_e ->> 'nama'); v_unsur := coalesce(v_e ->> 'unsur', ''); v_jab := coalesce(v_e ->> 'jabatan', 'anggota'); v_ket := sigarda.rapikan(v_e ->> 'keterangan');
    if char_length(v_nama) not between 1 and 80 or v_nama ~ '[[:cntrl:]<>]' then raise exception 'Nama anggota tim nomor % wajib diisi (maksimal 80 karakter, tanpa tanda < atau >).', v_i; end if;
    if v_unsur not in ('ketua_gudep', 'pembina', 'andalan_ranting', 'tokoh_masyarakat', 'orang_tua', 'lainnya') then raise exception 'Unsur anggota tim nomor % tidak dikenal.', v_i; end if;
    if v_jab not in ('ketua', 'anggota') then raise exception 'Jabatan anggota tim nomor % harus ketua atau anggota.', v_i; end if;
    if char_length(v_ket) > 120 or v_ket ~ '[[:cntrl:]<>]' then raise exception 'Keterangan anggota tim nomor % maksimal 120 karakter, tanpa tanda < atau >.', v_i; end if;
    if v_jab = 'ketua' then v_ketua := v_ketua + 1; end if;
  end loop;
  if v_ketua > 1 then raise exception 'Tim penilai hanya boleh punya satu ketua.'; end if;
  if p_id is null then
    if exists (select 1 from public.tim_penilai where tahun_ajaran = p_tahun_ajaran and untuk = p_untuk) then raise exception 'Tim penilai % untuk tahun ajaran % sudah ada; ubah yang sudah ada.', p_untuk, p_tahun_ajaran; end if;
    insert into public.tim_penilai (tahun_ajaran, untuk, nomor_sk, tanggal_sk, sk_url, catatan, dicatat_oleh, dicatat_pada)
    values (p_tahun_ajaran, p_untuk, v_nomor, p_tanggal_sk, v_url, v_cat, auth.uid(), now()) returning id into v_id;
  else
    if not exists (select 1 from public.tim_penilai where id = p_id) then raise exception 'Tim penilai tidak ditemukan.'; end if;
    if exists (select 1 from public.tim_penilai where tahun_ajaran = p_tahun_ajaran and untuk = p_untuk and id <> p_id) then raise exception 'Tim penilai % untuk tahun ajaran % sudah ada.', p_untuk, p_tahun_ajaran; end if;
    update public.tim_penilai set tahun_ajaran = p_tahun_ajaran, untuk = p_untuk, nomor_sk = v_nomor, tanggal_sk = p_tanggal_sk, sk_url = v_url, catatan = v_cat, dicatat_oleh = auth.uid(), dicatat_pada = now()
      where id = p_id returning id into v_id;
    delete from public.tim_penilai_anggota where tim_id = v_id;
  end if;
  v_i := 0;
  for v_e in select * from jsonb_array_elements(p_anggota) loop
    v_i := v_i + 1;
    insert into public.tim_penilai_anggota (tim_id, urut, nama, unsur, jabatan, keterangan)
    values (v_id, v_i, sigarda.rapikan(v_e ->> 'nama'), v_e ->> 'unsur', coalesce(v_e ->> 'jabatan', 'anggota'), sigarda.rapikan(v_e ->> 'keterangan'));
  end loop;
  return v_id;
end $$;

create function public.sg_tim_penilai_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus tim penilai.'; end if;
  delete from public.tim_penilai where id = p_id;
  if not found then raise exception 'Tim penilai tidak ditemukan.'; end if;
end $$;

-- Mengisi (atau mengoreksi) satu tahap kalender Garuda dari Kwarcab. Mengembalikan id.
create function public.sg_garuda_tahap_simpan(p_tahun_ajaran text, p_tahap text, p_mulai date, p_akhir date, p_catatan text default '') returns bigint
language plpgsql security definer set search_path = public as
$$
declare v_cat text := sigarda.rapikan(p_catatan); v_id bigint;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengisi kalender Garuda.'; end if;
  if p_tahun_ajaran is null or p_tahun_ajaran !~ '^[0-9]{4}/[0-9]{4}$' then raise exception 'Tahun ajaran tidak sah.'; end if;
  if p_tahap is null or p_tahap not in ('uji_spg', 'ajukan_tim', 'ambil_sk', 'penilaian_gudep', 'serah_kwarran', 'nilai_kwarran', 'kirim_kwarcab', 'verifikasi_visitasi', 'iuran', 'pelantikan') then raise exception 'Tahap tidak dikenal.'; end if;
  if p_mulai is null then raise exception 'Tanggal mulai wajib diisi.'; end if;
  if p_mulai < date '2000-01-01' or p_mulai > date '2100-12-31' then raise exception 'Tanggal mulai tidak sah.'; end if;
  if p_akhir is not null and (p_akhir < p_mulai or p_akhir > date '2100-12-31') then raise exception 'Tanggal akhir tidak boleh sebelum tanggal mulai.'; end if;
  if char_length(v_cat) > 200 or v_cat ~ '[[:cntrl:]<>]' then raise exception 'Catatan maksimal 200 karakter, tanpa tanda < atau >.'; end if;
  insert into public.garuda_tahap (tahun_ajaran, tahap, mulai, akhir, catatan, dicatat_oleh, dicatat_pada)
  values (p_tahun_ajaran, p_tahap, p_mulai, p_akhir, v_cat, auth.uid(), now())
  on conflict (tahun_ajaran, tahap) do update set mulai = excluded.mulai, akhir = excluded.akhir, catatan = excluded.catatan, dicatat_oleh = excluded.dicatat_oleh, dicatat_pada = excluded.dicatat_pada
  returning id into v_id;
  return v_id;
end $$;

create function public.sg_garuda_tahap_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus tahap kalender Garuda.'; end if;
  delete from public.garuda_tahap where id = p_id;
  if not found then raise exception 'Tahap kalender tidak ditemukan.'; end if;
end $$;
-- ===== akhir aksi tim kalender =====
