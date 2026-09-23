-- ===== Data anggota (Admin Gudep). Pembuatan dan penghapusan akun lewat Edge Function. =====
create function public.sg_anggota_ubah(
  p_id uuid, p_nama text, p_kelas text default null, p_sangga text default null,
  p_agama text default null, p_calon_garuda boolean default null
) returns void language plpgsql security definer set search_path = public as
$$
declare v_t public.profiles; v_nama text := sigarda.rapikan(p_nama); v_kelas text; v_sangga text;
begin
  perform sigarda.wajib_aktif();
  if coalesce((select role from public.profiles where id = auth.uid()), '') <> 'admin' then
    raise exception 'Hanya Admin Gudep yang dapat mengubah data anggota.';
  end if;
  select * into v_t from public.profiles where id = p_id;
  if not found then raise exception 'Anggota tidak ditemukan.'; end if;
  if v_nama = '' then raise exception 'Nama wajib diisi.'; end if;
  if char_length(v_nama) > 120 then raise exception 'Nama maksimal 120 karakter.'; end if;

  if v_t.role <> 'peserta' then
    update public.profiles set nama = v_nama where id = p_id;
    -- Agama Pembina (butir agama hanya boleh diuji Pembina yang seagama): null = tidak diubah, '' = dikosongkan. Dewan dan Admin tidak berAgama.
    if v_t.role = 'penguji' and v_t.jabatan = 'Pembina' and p_agama is not null then
      if p_agama <> '' and p_agama not in ('Islam','Katolik','Protestan','Hindu','Buddha','Khonghucu') then raise exception 'Agama tidak dikenal.'; end if;
      update public.profiles set agama = nullif(p_agama, '') where id = p_id;
    end if;
    return;
  end if;

  v_kelas := sigarda.rapikan(p_kelas);
  v_sangga := sigarda.rapikan(p_sangga);
  if v_kelas = '' or v_sangga = '' then raise exception 'Kelas dan sangga peserta wajib diisi.'; end if;
  if p_agama is null or p_agama = '' then raise exception 'Agama wajib diisi. Butir 1 SKU menyesuaikan agama peserta.'; end if;
  if p_agama not in ('Islam','Katolik','Protestan','Hindu','Buddha','Khonghucu') then raise exception 'Agama tidak dikenal.'; end if;
  -- Kelas berupa rombel baku (X-01..XII-10). Nilai lama yang tidak diubah (mis. "X") dibiarkan agar data lain tetap dapat diubah;
  -- rapikan massal lewat sg_rombel_perbarui.
  if lower(v_kelas) = lower(coalesce(v_t.kelas, '')) then
    v_kelas := v_t.kelas;
  else
    v_kelas := sigarda.rombel_baku(v_kelas);
    if not sigarda.rombel_sah(v_kelas) then raise exception 'Kelas harus berupa rombel: X-01 sampai X-10, XI-01 sampai XI-10, atau XII-01 sampai XII-10.'; end if;
  end if;
  v_sangga := coalesce((select sangga from public.profiles where role = 'peserta' and lower(sangga) = lower(v_sangga) limit 1), v_sangga);

  update public.profiles set nama = v_nama, kelas = v_kelas, sangga = v_sangga, agama = p_agama where id = p_id;

  if p_calon_garuda is true then
    if v_t.calon_garuda is null then
      if sigarda.layak_garuda(p_id) then
        update public.profiles set calon_garuda = sigarda.hari_ini() where id = p_id;
      else
        raise exception 'Status Calon Garuda hanya untuk peserta yang seluruh SKU Bantara dan Laksana-nya lulus.';
      end if;
    end if;
  elsif p_calon_garuda is false then
    update public.profiles set calon_garuda = null where id = p_id;
  end if;
end $$;

-- Agama Pembina, oleh Admin Gudep. p_data = [{"username": "budi.santoso", "agama": "Islam"}, ...]; agama kosong menghapus. Hanya untuk Pembina
-- (Dewan Ambalan dan Admin tidak berAgama). Dipakai import Excel Pembina (agama diisi sesudah akun dibuat). Mengembalikan jumlah Pembina yang diperbarui.
create function public.sg_anggota_agama_atur(p_data jsonb) returns int
language plpgsql security definer set search_path = public as
$$
declare v_e jsonb; v_user text; v_agama text; v_n int := 0; v_k int;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengubah agama Pembina.');
  if p_data is null or jsonb_typeof(p_data) <> 'array' then raise exception 'Data agama tidak valid.'; end if;
  if jsonb_array_length(p_data) > 500 then raise exception 'Maksimal 500 baris agama per permintaan.'; end if;
  for v_e in select * from jsonb_array_elements(p_data) loop
    v_user := lower(btrim(coalesce(v_e ->> 'username', '')));
    v_agama := sigarda.rapikan(coalesce(v_e ->> 'agama', ''));
    if v_user = '' then raise exception 'Nama pengguna Pembina wajib diisi.'; end if;
    if v_agama <> '' and v_agama not in ('Islam','Katolik','Protestan','Hindu','Buddha','Khonghucu') then raise exception 'Agama "%" tidak dikenal.', v_agama; end if;
    update public.profiles set agama = nullif(v_agama, '') where username = v_user and role = 'penguji' and jabatan = 'Pembina';
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end loop;
  return v_n;
end $$;

-- NTA (Nomor Tanda Anggota) anggota, oleh Admin Gudep. p_data = [{"username": "10231", "nta": "11.03.10.701.00123"}, ...]; nta kosong menghapus NTA.
-- Dipakai formulir ubah anggota dan import Excel (NTA diisi sesudah akun dibuat). Mengembalikan jumlah anggota yang ditemukan dan diperbarui.
create function public.sg_anggota_nta_atur(p_data jsonb) returns int
language plpgsql security definer set search_path = public as
$$
declare v_e jsonb; v_user text; v_nta text; v_n int := 0; v_k int;
begin
  perform sigarda.wajib_aktif();
  if coalesce((select role from public.profiles where id = auth.uid()), '') <> 'admin' then
    raise exception 'Hanya Admin Gudep yang dapat mengubah NTA anggota.';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'array' then raise exception 'Data NTA tidak valid.'; end if;
  if jsonb_array_length(p_data) > 500 then raise exception 'Maksimal 500 baris NTA per permintaan.'; end if;
  for v_e in select * from jsonb_array_elements(p_data) loop
    v_user := lower(btrim(coalesce(v_e ->> 'username', '')));
    v_nta := sigarda.rapikan(coalesce(v_e ->> 'nta', ''));
    if v_user = '' then raise exception 'Nama pengguna anggota wajib diisi.'; end if;
    if v_nta <> '' and v_nta !~ '^[0-9A-Za-z./ -]{1,40}$' then
      raise exception 'NTA "%" tidak valid: maksimal 40 karakter (huruf, angka, titik, garis miring, strip, spasi).', v_nta;
    end if;
    update public.profiles set nta = nullif(v_nta, '') where username = v_user;
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end loop;
  return v_n;
end $$;

-- ===== Jenis kelamin: fungsi =====
-- Jenis kelamin anggota (semua peran), oleh Admin Gudep. p_data = [{"username": "10231", "jk": "L"}, ...]; jk 'L' (laki-laki) atau 'P' (perempuan); jk kosong
-- menghapus. Dipakai formulir tambah dan ubah anggota, import Excel (diisi sesudah akun dibuat; Edge Function tidak membawanya), dan "Lengkapi jenis kelamin"
-- untuk anggota lama. Semua atau tidak sama sekali. Mengembalikan jumlah anggota yang ditemukan dan diperbarui.
create function public.sg_anggota_jk_atur(p_data jsonb) returns int
language plpgsql security definer set search_path = public as
$$
declare v_e jsonb; v_user text; v_jk text; v_n int := 0; v_k int;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengubah jenis kelamin anggota.');
  if p_data is null or jsonb_typeof(p_data) <> 'array' then raise exception 'Data jenis kelamin tidak valid.'; end if;
  if jsonb_array_length(p_data) > 500 then raise exception 'Maksimal 500 baris jenis kelamin per permintaan.'; end if;
  for v_e in select * from jsonb_array_elements(p_data) loop
    v_user := lower(btrim(coalesce(v_e ->> 'username', '')));
    v_jk := upper(btrim(coalesce(v_e ->> 'jk', '')));
    if v_user = '' then raise exception 'Nama pengguna anggota wajib diisi.'; end if;
    if v_jk not in ('', 'L', 'P') then raise exception 'Jenis kelamin "%" tidak dikenal (pilih L atau P).', v_e ->> 'jk'; end if;
    update public.profiles set jenis_kelamin = nullif(v_jk, '') where username = v_user;
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end loop;
  return v_n;
end $$;
-- ===== akhir fungsi jenis kelamin =====

-- ===== Jabatan Dewan Ambalan: fungsi =====
-- Jabatan Dewan Ambalan pada akun PENEGAK (isian bebas, mis. Pradana, Pradani, Wakil Pradana, Sekretaris, Bendahara, Ketua Bidang Kegiatan), oleh Pembina atau Admin Gudep.
-- p_data = [{"username": "10231", "jabatan": "Pradana"}, ...] (username = NIS Penegak); jabatan kosong mencabut jabatan (penugasan penguji ikut dihapus). Jabatan hanya untuk
-- Penegak yang AKTIF. Pradana dan Pradani masing-masing hanya satu pemegang: pemegang lama harus dikosongkan lebih dulu (boleh pada permintaan yang sama,
-- mis. [{"username": "lama", "jabatan": ""}, {"username": "baru", "jabatan": "Pradana"}]). Semua atau tidak sama sekali. Pradana menjadi ketua sidang; Pradana dan Pradani
-- menandatangani Surat Tanda Lulus. Dewan Ambalan berupa atribut akun Penegak (bukan akun terpisah): pemegang jabatan dapat memakai tampilan Dewan.
-- Tercatat di kepengurusan_log. Mengembalikan jumlah anggota yang berubah.
create function public.sg_anggota_jabatan_dewan_atur(p_data jsonb) returns int
language plpgsql security definer set search_path = public as
$$
declare v_e jsonb; v_user text; v_jab text; v_n int := 0; v_lain text; v_t public.profiles; v_oleh text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah jabatan Dewan Ambalan.'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'array' then raise exception 'Data jabatan tidak valid.'; end if;
  if jsonb_array_length(p_data) > 100 then raise exception 'Maksimal 100 baris jabatan per permintaan.'; end if;
  select nama into v_oleh from public.profiles where id = auth.uid();
  for v_e in select * from jsonb_array_elements(p_data) loop
    v_user := lower(btrim(coalesce(v_e ->> 'username', '')));
    v_jab := sigarda.jabatan_baku(coalesce(v_e ->> 'jabatan', ''));
    if v_user = '' then raise exception 'NIS Penegak wajib diisi.'; end if;
    if v_jab <> '' and (char_length(v_jab) not between 2 and 60 or v_jab ~ '[[:cntrl:]<>]') then
      raise exception 'Jabatan Dewan Ambalan harus 2 sampai 60 karakter tanpa tanda < atau >.';
    end if;
    select * into v_t from public.profiles where username = v_user;
    if not found then raise exception 'Anggota "%" tidak ditemukan.', v_user; end if;
    if v_jab = '' then
      if v_t.jabatan_dewan is not null then
        perform sigarda.jabatan_dewan_lepas(v_t.id, 'Jabatan dicabut oleh ' || coalesce(v_oleh, 'pengelola'));
        v_n := v_n + 1;
      end if;
      continue;
    end if;
    if v_t.role <> 'peserta' then raise exception '% bukan Penegak. Jabatan Dewan Ambalan hanya untuk Penegak.', v_t.nama; end if;
    if v_t.status <> 'aktif' then raise exception '% berstatus % dan tidak dapat menjabat. Aktifkan kembali lebih dulu.', v_t.nama, v_t.status; end if;
    if v_jab in ('Pradana', 'Pradani') then
      select nama into v_lain from public.profiles where jabatan_dewan = v_jab and id <> v_t.id limit 1;
      if found then raise exception '% sudah dijabat oleh %. Kosongkan jabatan itu lebih dulu.', v_jab, v_lain; end if;
    end if;
    if v_t.jabatan_dewan is not distinct from v_jab then continue; end if;
    update public.profiles set jabatan_dewan = v_jab where id = v_t.id;
    insert into public.kepengurusan_log (peserta_id, peserta_nama, nis, tindakan, jabatan_lama, jabatan_baru, alasan, oleh, oleh_nama)
    values (v_t.id, v_t.nama, coalesce(v_t.nis, v_t.username), case when v_t.jabatan_dewan is null then 'beri' else 'ganti' end, v_t.jabatan_dewan, v_jab, '', auth.uid(), coalesce(v_oleh, ''));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Kepengurusan Dewan Ambalan lewat berkas (Pembina atau Admin Gudep). p_data = [{"username": "10231", "jabatan": "Pradana"}, ...] (username = NIS; jabatan bebas).
-- p_ganti = true: SELURUH kepengurusan diganti (pemegang jabatan yang tidak ada di berkas dicabut; termasuk jabatan pada akun Dewan lama). false: hanya yang ada di berkas
-- diberi atau diubah (Pradana atau Pradani yang berpindah tangan tetap mencabut pemegang lamanya). p_terapkan = false: PRATINJAU (tidak mengubah apa pun); true: menerapkan
-- SEMUA atau tidak sama sekali. Hasil { galat, ringkasan { beri, ganti, cabut, sama, galat }, baris: [{ no, id, username, nama, kelas, dari_jabatan, jabatan, hasil:
-- 'beri' | 'ganti' | 'sama' | 'cabut' | 'galat', pesan: [...] }] }. Peringatan (bukan galat): belum menyelesaikan seluruh butir Bantara.
create function public.sg_kepengurusan_terapkan(p_data jsonb, p_ganti boolean default true, p_terapkan boolean default false) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  v_e jsonb; v_no int := 0; v_user text; v_jab text; v_t public.profiles; v_hasil text; v_pesan text[]; v_baris jsonb := '[]'::jsonb; v_pakai text[] := '{}'; v_tunggal text[] := '{}';
  v_galat int := 0; v_beri int := 0; v_ganti int := 0; v_cabut int := 0; v_sama int := 0; v_oleh text; v_r record; v_x jsonb; v_ids uuid[] := '{}';
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengatur kepengurusan Dewan Ambalan.'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'array' then raise exception 'Data kepengurusan tidak valid.'; end if;
  if jsonb_array_length(p_data) > 200 then raise exception 'Maksimal 200 baris per permintaan.'; end if;

  for v_e in select * from jsonb_array_elements(p_data) loop
    v_no := v_no + 1;
    v_user := lower(btrim(coalesce(v_e ->> 'username', '')));
    v_jab := sigarda.jabatan_baku(coalesce(v_e ->> 'jabatan', ''));
    v_pesan := '{}'; v_hasil := 'ubah';
    select * into v_t from public.profiles where username = v_user and role = 'peserta';
    if not found then
      v_hasil := 'galat'; v_pesan := array['Penegak dengan NIS "' || v_user || '" tidak ditemukan.'];
    elsif v_user = any (v_pakai) then
      v_hasil := 'galat'; v_pesan := array['NIS ' || v_user || ' muncul lebih dari sekali dalam berkas.'];
    elsif v_t.status <> 'aktif' then
      v_hasil := 'galat'; v_pesan := array['Penegak berstatus ' || v_t.status || ' dan tidak dapat menjabat. Aktifkan kembali lebih dulu di menu Anggota.'];
    elsif v_jab = '' then
      v_hasil := 'galat'; v_pesan := array['Jabatan Dewan Ambalan kosong.'];
    elsif char_length(v_jab) not between 2 and 60 or v_jab ~ '[[:cntrl:]<>]' then
      v_hasil := 'galat'; v_pesan := array['Jabatan harus 2 sampai 60 karakter tanpa tanda < atau >.'];
    elsif v_jab in ('Pradana', 'Pradani') and v_jab = any (v_tunggal) then
      v_hasil := 'galat'; v_pesan := array[v_jab || ' hanya boleh satu orang, tetapi muncul lebih dari sekali dalam berkas.'];
    end if;
    if v_user <> '' then v_pakai := v_pakai || v_user; end if;
    if v_hasil = 'ubah' then
      if v_jab in ('Pradana', 'Pradani') then v_tunggal := v_tunggal || v_jab; end if;
      if v_t.jabatan_dewan is not distinct from v_jab then v_hasil := 'sama'; v_sama := v_sama + 1;
      elsif v_t.jabatan_dewan is null then v_hasil := 'beri'; v_beri := v_beri + 1;
      else v_hasil := 'ganti'; v_ganti := v_ganti + 1; v_pesan := v_pesan || ('Jabatan berubah dari ' || v_t.jabatan_dewan || '.'); end if;
      if not sigarda.tingkat_selesai(v_t.id, 'Bantara') then v_pesan := array_append(v_pesan, 'Belum menyelesaikan seluruh butir Bantara (peringatan; jabatan tetap dapat diberikan).'); end if;
    else
      v_galat := v_galat + 1;
    end if;
    v_baris := v_baris || jsonb_build_array(jsonb_build_object(
      'no', v_no, 'id', v_t.id, 'username', v_user, 'nama', coalesce(v_t.nama, ''), 'kelas', v_t.kelas, 'dari_jabatan', v_t.jabatan_dewan, 'jabatan', nullif(v_jab, ''),
      'hasil', v_hasil, 'pesan', to_jsonb(v_pesan)));
  end loop;

  -- Pemegang jabatan yang dicabut: semua yang tidak ada di berkas (p_ganti), atau pemegang Pradana/Pradani yang jabatannya berpindah ke orang lain di berkas.
  for v_r in
    select p.id, p.username, p.nama, p.kelas, p.role, p.jabatan_dewan from public.profiles p
    where p.jabatan_dewan is not null and p.username <> all (v_pakai)
      and (p_ganti or (p.jabatan_dewan in ('Pradana', 'Pradani') and p.jabatan_dewan = any (v_tunggal)))
    order by p.nama
  loop
    v_cabut := v_cabut + 1;
    v_ids := v_ids || v_r.id;
    v_baris := v_baris || jsonb_build_array(jsonb_build_object(
      'no', null, 'id', v_r.id, 'username', v_r.username, 'nama', v_r.nama, 'kelas', v_r.kelas, 'dari_jabatan', v_r.jabatan_dewan, 'jabatan', null, 'hasil', 'cabut',
      'pesan', to_jsonb(case when v_r.role = 'penguji' then array['Akun Dewan lama.'] else '{}'::text[] end)));
  end loop;

  v_x := jsonb_build_object('beri', v_beri, 'ganti', v_ganti, 'cabut', v_cabut, 'sama', v_sama, 'galat', v_galat);
  if p_terapkan then
    if v_galat > 0 then raise exception 'Ada % baris bermasalah, jadi tidak ada yang diubah. Periksa pratinjau, perbaiki berkas, lalu coba lagi.', v_galat; end if;
    if v_beri + v_ganti + v_cabut = 0 then raise exception 'Tidak ada perubahan yang perlu diterapkan.'; end if;
    select nama into v_oleh from public.profiles where id = auth.uid();
    -- mencabut lebih dulu agar Pradana dan Pradani berpindah tangan tanpa bentrok
    for v_r in select id from public.profiles where id = any (v_ids) loop
      perform sigarda.jabatan_dewan_lepas(v_r.id, case when p_ganti then 'Kepengurusan diganti' else 'Jabatan berpindah' end);
    end loop;
    -- yang berganti jabatan dikosongkan sebentar agar pertukaran Pradana dan Pradani tidak bentrok dengan indeks unik
    update public.profiles set jabatan_dewan = null
      where id in (select (x ->> 'id')::uuid from jsonb_array_elements(v_baris) x where x ->> 'hasil' = 'ganti');
    for v_e in select * from jsonb_array_elements(v_baris) loop
      if v_e ->> 'hasil' not in ('beri', 'ganti') then continue; end if;
      select * into v_t from public.profiles where id = (v_e ->> 'id')::uuid;
      update public.profiles set jabatan_dewan = v_e ->> 'jabatan' where id = v_t.id;
      insert into public.kepengurusan_log (peserta_id, peserta_nama, nis, tindakan, jabatan_lama, jabatan_baru, alasan, oleh, oleh_nama)
      values (v_t.id, v_t.nama, coalesce(v_t.nis, v_t.username), v_e ->> 'hasil', v_e ->> 'dari_jabatan', v_e ->> 'jabatan', left('Musyawarah Ambalan (berkas)', 200), auth.uid(), coalesce(v_oleh, ''));
    end loop;
  end if;
  return jsonb_build_object('galat', v_galat, 'ringkasan', v_x, 'baris', v_baris);
end $$;

-- Mengarsipkan akun Dewan Ambalan LAMA (akun penguji berjabatan Dewan Ambalan; kini Dewan adalah atribut akun Penegak), oleh Admin Gudep. Arsip = status nonaktif:
-- akun tidak lagi menjadi penguji atau pengurus, riwayat penilaian dan iuran atas nama akun itu tetap. p_aktifkan = true membatalkan arsip. Mengembalikan jumlah akun
-- yang berubah. Jabatan Dewan yang masih dipegang akun itu dicabut lebih dulu dan pengajuan uji yang menunggunya kembali ke antrian rombel.
create function public.sg_dewan_lama_arsipkan(p_ids uuid[], p_aktifkan boolean default false) returns int
language plpgsql security definer set search_path = public as
$$
declare v_id uuid; v_n int := 0; v_t public.profiles;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengarsipkan akun Dewan Ambalan lama.');
  if coalesce(cardinality(p_ids), 0) = 0 then return 0; end if;
  if cardinality(p_ids) > 200 then raise exception 'Maksimal 200 akun per permintaan.'; end if;
  foreach v_id in array p_ids loop
    select * into v_t from public.profiles where id = v_id and role = 'penguji' and jabatan = 'Dewan Ambalan';
    if not found then raise exception 'Akun Dewan Ambalan lama tidak ditemukan.'; end if;
    if p_aktifkan then
      if v_t.status = 'aktif' then continue; end if;
      update public.profiles set status = 'aktif', status_pada = sigarda.hari_ini() where id = v_id;
    else
      if v_t.status <> 'aktif' then continue; end if;
      perform sigarda.jabatan_dewan_lepas(v_id, 'Akun Dewan lama diarsipkan');
      update public.sku_progress set penguji_id = null, diubah = now() where penguji_id = v_id and status = 'diajukan';
      delete from public.penugasan_rombel where penguji_id = v_id;
      delete from public.penugasan_peserta where penguji_id = v_id;
      update public.profiles set status = 'nonaktif', status_pada = sigarda.hari_ini() where id = v_id;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Berita acara sidang memuat QR verifikasi. Token dan kode dibuat saat berita acara pertama kali dicetak (idempoten: cetak ulang memakai yang sama).
-- Dewan Ambalan, Pembina, dan Admin Gudep. Mengembalikan { token, kode }. Token dijawab sg_verifikasi_token; kode dijawab sg_verifikasi_kode.
create function public.sg_sidang_token(p_id int) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare v_s public.sidang_dk; v_token text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya Dewan Ambalan, Pembina, atau Admin Gudep yang dapat mencetak berita acara.'; end if;
  select * into v_s from public.sidang_dk where id = p_id;
  if not found then raise exception 'Catatan sidang tidak ditemukan.'; end if;
  if v_s.token is null then
    v_token := sigarda.token_acak();
    update public.sidang_dk set token = v_token, kode = sigarda.kode_verifikasi(array[v_token, 'berita_acara_sidang', v_s.nomor_ba])
    where id = p_id and token is null;
    select * into v_s from public.sidang_dk where id = p_id;
  end if;
  return jsonb_build_object('token', v_s.token, 'kode', v_s.kode);
end $$;
-- ===== akhir fungsi jabatan dewan =====

