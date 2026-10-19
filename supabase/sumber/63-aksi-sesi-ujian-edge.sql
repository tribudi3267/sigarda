-- ===== Sesi ujian (Dewan Ambalan, Pembina, Admin) =====
-- Menyimpan satu sesi beserta butir dan pesertanya (id kosong = sesi baru). Butir dan peserta diganti seluruhnya sesuai daftar.
create function public.sg_sesi_simpan(
  p_id int, p_nama text, p_tanggal date, p_tempat text, p_catatan text, p_status text, p_butir text[], p_peserta uuid[]
) returns int language plpgsql security definer set search_path = public as
$$
declare
  v_nama text := sigarda.rapikan(p_nama); v_tempat text := sigarda.rapikan(p_tempat); v_cat text := btrim(coalesce(p_catatan, ''));
  v_butir text[]; v_peserta uuid[]; v_id int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau Admin Gudep yang dapat mengelola sesi ujian.'; end if;
  if v_nama = '' or char_length(v_nama) > 120 then raise exception 'Nama sesi wajib diisi (maksimal 120 karakter).'; end if;
  if p_tanggal is null or p_tanggal < date '2000-01-01' or p_tanggal > date '2100-12-31' then raise exception 'Tanggal sesi tidak valid.'; end if;
  if char_length(v_tempat) > 120 then raise exception 'Tempat maksimal 120 karakter.'; end if;
  if char_length(v_cat) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;
  if p_status is null or p_status not in ('terjadwal', 'berlangsung', 'selesai') then raise exception 'Status sesi tidak dikenal.'; end if;
  select coalesce(array_agg(distinct x), '{}') into v_butir from unnest(coalesce(p_butir, '{}')) x;
  select coalesce(array_agg(distinct x), '{}') into v_peserta from unnest(coalesce(p_peserta, '{}')) x;
  if cardinality(v_butir) = 0 then raise exception 'Pilih minimal satu butir.'; end if;
  if cardinality(v_butir) > 60 then raise exception 'Butir maksimal 60 per sesi.'; end if;
  if cardinality(v_peserta) = 0 then raise exception 'Pilih minimal satu peserta.'; end if;
  if cardinality(v_peserta) > 300 then raise exception 'Peserta maksimal 300 per sesi.'; end if;
  if (select count(*) from public.sku_butir where id = any (v_butir)) <> cardinality(v_butir) then raise exception 'Ada butir yang tidak dikenal.'; end if;
  if (select count(*) from public.profiles where id = any (v_peserta) and role = 'peserta') <> cardinality(v_peserta) then raise exception 'Ada peserta yang tidak dikenal.'; end if;

  if p_id is null then
    insert into public.sesi_ujian (nama, tanggal, tempat, catatan, status, dibuat_oleh) values (v_nama, p_tanggal, v_tempat, v_cat, p_status, auth.uid())
    returning id into v_id;
  else
    update public.sesi_ujian set nama = v_nama, tanggal = p_tanggal, tempat = v_tempat, catatan = v_cat, status = p_status where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Sesi tidak ditemukan.'; end if;
    delete from public.sesi_ujian_butir where sesi_id = v_id;
    delete from public.sesi_ujian_peserta where sesi_id = v_id;
  end if;
  insert into public.sesi_ujian_butir (sesi_id, butir_id) select v_id, x from unnest(v_butir) x;
  insert into public.sesi_ujian_peserta (sesi_id, peserta_id) select v_id, x from unnest(v_peserta) x;
  return v_id;
end $$;

create function public.sg_sesi_status(p_id int, p_status text) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau Admin Gudep yang dapat mengelola sesi ujian.'; end if;
  if p_status is null or p_status not in ('terjadwal', 'berlangsung', 'selesai') then raise exception 'Status sesi tidak dikenal.'; end if;
  update public.sesi_ujian set status = p_status where id = p_id;
  if not found then raise exception 'Sesi tidak ditemukan.'; end if;
end $$;

-- Menghapus sesi tidak menghapus hasil penilaian yang sudah tercatat (hanya jadwal dan daftarnya).
create function public.sg_sesi_hapus(p_id int) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus sesi ujian.'; end if;
  delete from public.sesi_ujian where id = p_id;
end $$;

-- ===== Fungsi untuk Edge Function saja (service_role) =====

-- Membuat baris profil untuk akun yang baru dibuat di Supabase Auth. Kelas Penegak wajib rombel baku (X-01..XII-10); sangga disamakan penulisannya.
create function public.sg_profil_buat_internal(
  p_id uuid, p_username text, p_role text, p_nama text, p_nis text, p_kelas text, p_sangga text, p_agama text, p_jabatan text
) returns void language plpgsql security definer set search_path = public as
$$
declare v_kelas text := sigarda.rapikan(p_kelas); v_sangga text := sigarda.rapikan(p_sangga);
begin
  if p_role = 'peserta' then
    v_kelas := sigarda.rombel_baku(v_kelas);
    if not sigarda.rombel_sah(v_kelas) then raise exception 'Kelas harus berupa rombel: X-01 sampai X-10, XI-01 sampai XI-10, atau XII-01 sampai XII-10.'; end if;
    v_sangga := coalesce((select sangga from public.profiles where role = 'peserta' and lower(sangga) = lower(v_sangga) limit 1), v_sangga);
  end if;
  insert into public.profiles (id, username, role, nama, nis, kelas, sangga, agama, jabatan)
  values (p_id, p_username, p_role, sigarda.rapikan(p_nama),
          nullif(p_nis, ''), nullif(v_kelas, ''), nullif(v_sangga, ''), nullif(p_agama, ''), nullif(p_jabatan, ''));
end $$;

-- Pembatasan percobaan masuk: 5 kali salah berturut-turut mengunci nama pengguna itu selama 5 menit.
create function public.sg_kunci_cek_internal(p_username text) returns int
language plpgsql security definer set search_path = public as
$$
declare v_sampai timestamptz;
begin
  select terkunci_sampai into v_sampai from public.login_gagal where username = p_username;
  if v_sampai is not null and v_sampai > now() then return ceil(extract(epoch from (v_sampai - now())) / 60)::int; end if;
  return 0;
end $$;

create function public.sg_kunci_gagal_internal(p_username text) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare v_j int; v_sampai timestamptz; v_dp timestamptz; v_n int;
begin
  select jumlah, terkunci_sampai, diperbarui into v_j, v_sampai, v_dp from public.login_gagal where username = p_username for update;
  if not found then v_j := 0; end if;
  -- hitungan dianggap baru bila kunci sebelumnya sudah habis atau percobaan terakhir sudah lama
  if (v_sampai is not null and v_sampai <= now()) or (v_dp is not null and v_dp < now() - interval '15 minutes') then v_j := 0; end if;
  v_n := v_j + 1;
  if v_n >= 5 then
    insert into public.login_gagal (username, jumlah, terkunci_sampai, diperbarui) values (p_username, 0, now() + interval '5 minutes', now())
      on conflict (username) do update set jumlah = 0, terkunci_sampai = now() + interval '5 minutes', diperbarui = now();
    return jsonb_build_object('sisa', 0, 'terkunci', true, 'menit', 5);
  end if;
  insert into public.login_gagal (username, jumlah, terkunci_sampai, diperbarui) values (p_username, v_n, null, now())
    on conflict (username) do update set jumlah = v_n, terkunci_sampai = null, diperbarui = now();
  return jsonb_build_object('sisa', 5 - v_n, 'terkunci', false, 'menit', 0);
end $$;

create function public.sg_kunci_lepas_internal(p_username text) returns void
language plpgsql security definer set search_path = public as
$$ begin delete from public.login_gagal where username = p_username; end $$;

-- ===== Verifikasi PIN tanpa sesi Auth: aksi =====
-- Memeriksa PIN akun yang SUDAH masuk (ganti PIN, PIN penguji saat mencatat hasil) langsung terhadap hash bcrypt Supabase Auth
-- (auth.users.encrypted_password, lewat pgcrypto) tanpa membuat sesi dan refresh token baru, sehingga juga tidak terkena batas laju Auth
-- per IP. Kekuatan hash tidak berubah: crypt() memakai garam dan biaya yang tersimpan di hash itu sendiri. Pembatasan percobaan sama
-- dengan masuk (sg_kunci_*: 5 kali salah = terkunci 5 menit). Hanya untuk service_role (Edge Function), dengan id dari sesi pemanggil.
-- Jawaban: {ok:true} | {ok:false, kunciAktif:true, menit} | {ok:false, sisa, terkunci, menit} | {ok:false, dukung:false} (hash bukan
-- bcrypt atau pgcrypto tidak ada di skema extensions: Edge Function kembali ke cara lama, masuk dengan kata sandi).
create function public.sg_pin_periksa_internal(p_id uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare v_user text; v_hash text; v_menit int; v_cocok boolean;
begin
  select username into v_user from public.profiles where id = p_id;
  if v_user is null then return jsonb_build_object('ok', false, 'dukung', false); end if;
  v_menit := public.sg_kunci_cek_internal(v_user);
  if v_menit > 0 then return jsonb_build_object('ok', false, 'kunciAktif', true, 'menit', v_menit); end if;
  select encrypted_password into v_hash from auth.users where id = p_id;
  if v_hash is null or v_hash !~ '^\$2[abxy]\$[0-9]{2}\$.{53}$' then return jsonb_build_object('ok', false, 'dukung', false); end if;
  if coalesce(p_pin, '') ~ '^[0-9]{6}$' then
    begin
      v_cocok := extensions.crypt(p_pin, v_hash) = v_hash;
    exception when undefined_function or invalid_schema_name then
      return jsonb_build_object('ok', false, 'dukung', false);
    end;
  else
    v_cocok := false;
  end if;
  if v_cocok then
    perform public.sg_kunci_lepas_internal(v_user);
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false) || public.sg_kunci_gagal_internal(v_user);
end $$;
-- ===== akhir verifikasi PIN tanpa sesi =====

