-- ===== Berkas Calon Garuda (tahap L7): fungsi =====
-- Isi lengkap berkas satu Calon Garuda (kartu SKU Bantara+Laksana MENTAH, portofolio, jurnal, daftar penguji terkait) sebagai
-- satu JSON, dipetakan ulang di klien (src/lib/mapDb.js) memakai susunProgress/susunPortofolio yang SAMA dengan halaman biasa
-- (jadi tampilannya seragam dengan Kartu SKU dan Portofolio yang sudah ada). Dipakai bersama oleh sg_garuda_berkas_baca
-- (Pembina/Admin, sudah login) dan sg_garuda_token_baca (tautan berbagi, tanpa login) -- satu sumber, dua jalur akses.
create function sigarda.garuda_berkas_json(p_peserta_id uuid) returns jsonb language sql stable security definer set search_path = public as
$$
  select jsonb_build_object(
    'peserta', (select jsonb_build_object('id', id, 'nama', nama, 'nis', nis, 'kelas', kelas, 'sangga', sangga, 'agama', agama,
                  'nta', nta, 'jenis_kelamin', jenis_kelamin, 'calon_garuda', calon_garuda)
                from public.profiles where id = p_peserta_id),
    'sku_progress', (select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) from public.sku_progress g
                      join public.sku_unit u on u.id = g.sku_id where g.peserta_id = p_peserta_id and u.tingkat in ('Bantara','Laksana')),
    'sku_riwayat', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.sku_riwayat r
                     join public.sku_unit u on u.id = r.sku_id where r.peserta_id = p_peserta_id and u.tingkat in ('Bantara','Laksana')),
    'portofolio', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from public.portofolio p where p.peserta_id = p_peserta_id),
    'portofolio_jurnal', (select coalesce(jsonb_agg(to_jsonb(j)), '[]'::jsonb) from public.portofolio_jurnal j where j.peserta_id = p_peserta_id),
    'users', (select coalesce(jsonb_agg(jsonb_build_object('id', pr.id, 'nama', pr.nama, 'jabatan', pr.jabatan)), '[]'::jsonb)
              from public.profiles pr where pr.id in (
                select penguji_id from public.sku_progress g2 join public.sku_unit u2 on u2.id = g2.sku_id
                  where g2.peserta_id = p_peserta_id and u2.tingkat in ('Bantara','Laksana') and penguji_id is not null
                union
                select catatan_penguji_oleh from public.portofolio where peserta_id = p_peserta_id and catatan_penguji_oleh is not null
                union
                select oleh from public.portofolio_jurnal where peserta_id = p_peserta_id and oleh is not null
              ))
  )
$$;

-- Pembina dan Admin membuka berkas lengkap seorang Calon Garuda (untuk ditinjau atau dicetak sendiri).
create function public.sg_garuda_berkas_baca(p_peserta_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat membuka berkas Calon Garuda.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and calon_garuda is not null) then
    raise exception 'Peserta ini belum mendaftar sebagai Calon Garuda.';
  end if;
  if not sigarda.layak_garuda(p_peserta_id) then raise exception 'Peserta ini belum menyelesaikan seluruh SKU Bantara dan Laksana.'; end if;
  return sigarda.garuda_berkas_json(p_peserta_id)
    || jsonb_build_object('token', (select token from public.garuda_berkas_token where peserta_id = p_peserta_id and dicabut_pada is null));
end $$;

-- Membuat (atau mengganti) tautan berbagi baca-saja untuk satu Calon Garuda. Hanya Pembina dan Admin (sama dengan hak
-- membuka berkas di atas, TIDAK sama dengan hak menilai portofolio sehari-hari yang juga mengikutkan Dewan Ambalan --
-- mengirim data ke pihak luar organisasi sengaja lebih ketat). Token lama (bila ada) otomatis dicabut oleh token baru:
-- regenerasi berarti mengganti tautan, bukan menambah tautan lain yang masih aktif.
create function public.sg_garuda_token_buat(p_peserta_id uuid) returns text
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_nama text; v_token text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat membuat tautan berbagi.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and calon_garuda is not null) then
    raise exception 'Peserta ini belum mendaftar sebagai Calon Garuda.';
  end if;
  if not sigarda.layak_garuda(p_peserta_id) then raise exception 'Tautan berbagi hanya untuk Penegak yang seluruh SKU Bantara dan Laksana-nya sudah lulus.'; end if;
  update public.garuda_berkas_token set dicabut_pada = now(), dicabut_oleh = v_uid where peserta_id = p_peserta_id and dicabut_pada is null;
  select nama into v_nama from public.profiles where id = v_uid;
  v_token := sigarda.token_acak();
  insert into public.garuda_berkas_token (peserta_id, token, dibuat_oleh, dibuat_oleh_nama) values (p_peserta_id, v_token, v_uid, coalesce(v_nama, ''));
  return v_token;
end $$;

-- Mencabut tautan berbagi yang sedang aktif (tidak ada efek bila sudah tidak ada yang aktif). Tanpa kedaluwarsa otomatis,
-- jadi ini satu-satunya cara menghentikan akses baca lewat tautan yang pernah dibagikan.
create function public.sg_garuda_token_cabut(p_peserta_id uuid) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mencabut tautan berbagi.'; end if;
  update public.garuda_berkas_token set dicabut_pada = now(), dicabut_oleh = auth.uid() where peserta_id = p_peserta_id and dicabut_pada is null;
end $$;

-- DAPAT DIPANGGIL TANPA LOGIN (peran anon): tautan berbagi baca-saja untuk penilai kwarran/kwarcab. Token 128 bit acak, tidak
-- dapat ditebak. BEDA dari sg_verifikasi_token/kode (yang hanya menjawab ringkasan): fungsi ini mengembalikan ISI LENGKAP
-- berkas. Token yang tidak dikenal atau sudah dicabut menjawab { ditemukan: false } (bukan galat keras, sama pola dengan
-- sg_verifikasi_token) supaya halaman publik dapat menampilkan pesan yang ramah tanpa membedakan sebab.
create function public.sg_garuda_token_baca(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare v_t text := lower(btrim(coalesce(p_token, ''))); v_row public.garuda_berkas_token;
begin
  if v_t !~ '^[0-9a-f]{32}$' then return jsonb_build_object('ditemukan', false); end if;
  select * into v_row from public.garuda_berkas_token where token = v_t;
  if not found or v_row.dicabut_pada is not null then return jsonb_build_object('ditemukan', false); end if;
  return jsonb_build_object('ditemukan', true) || sigarda.garuda_berkas_json(v_row.peserta_id);
end $$;
-- ===== akhir fungsi berkas garuda =====

-- ===== Data gudep: fungsi =====
-- Identitas Gugus Depan dan pejabatnya disimpan sebagai satu objek JSON pada pengaturan 'gudep.data' (dibaca semua pengguna yang sudah masuk
-- lewat kebijakan baca_pengaturan; diubah hanya Admin Gudep lewat sg_gudep_simpan). Belum ada baris = aplikasi memakai nilai bawaan (src/config.js).
--   teks   : nama, singkat (nama ambalan), sekolah, alamat, kota, nomorGudep, kwarran, kwarcab, kodeSurat, telepon, email
--   orang  : pembina (Pembina Gudep / Ka Gudep, surat intern sekolah), kamabigus (Kepala Sekolah / Kamabigus, surat keluar sekolah);
--            masing-masing { jabatan, nama, nta, nip }. Pradana dan Pradani TIDAK disimpan di sini: diambil dari anggota Dewan Ambalan
--            (jabatan_dewan). Kunci pradana dan pradani tetap diterima (klien lama) tetapi diabaikan.
-- Aturan isian sama dengan periksaGudep di src/lib/gudepLogic.js (dijaga oleh pengujian).
create function public.sg_gudep_simpan(p_nilai jsonb) returns void
language plpgsql security definer set search_path = public as
$$
declare
  v_teks text[] := array['nama', 'singkat', 'sekolah', 'alamat', 'kota', 'nomorGudep', 'kwarran', 'kwarcab', 'kodeSurat', 'telepon', 'email'];
  v_orang text[] := array['pembina', 'kamabigus', 'pradana', 'pradani'];
  v_batas jsonb := '{"nama":120,"singkat":120,"sekolah":120,"alamat":200,"kota":60,"nomorGudep":40,"kwarran":80,"kwarcab":80,"kodeSurat":30,"telepon":40,"email":100}';
  v_baru jsonb := '{}'::jsonb; v_o jsonb; v_h jsonb; v_k text; v_f text; v_v text;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengubah data gudep.');
  if p_nilai is null or jsonb_typeof(p_nilai) <> 'object' then raise exception 'Data gudep tidak sah.'; end if;
  for v_k in select jsonb_object_keys(p_nilai) loop
    if not (v_k = any (v_teks) or v_k = any (v_orang)) then raise exception 'Isian "%" tidak dikenal.', v_k; end if;
  end loop;

  foreach v_k in array v_teks loop
    if p_nilai -> v_k is not null and jsonb_typeof(p_nilai -> v_k) not in ('string', 'null') then raise exception 'Isian "%" harus berupa teks.', v_k; end if;
    v_v := sigarda.rapikan(p_nilai ->> v_k);
    if char_length(v_v) > (v_batas ->> v_k)::int then raise exception 'Isian "%" maksimal % karakter.', v_k, v_batas ->> v_k; end if;
    if v_k in ('nama', 'singkat', 'sekolah', 'kota') and v_v = '' then raise exception 'Isian "%" wajib diisi.', v_k; end if;
    if v_k = 'kodeSurat' and v_v !~ '^[A-Za-z0-9._/-]*$' then raise exception 'Kode surat hanya boleh berisi huruf, angka, dan tanda . _ / -.'; end if;
    if v_k = 'telepon' and v_v !~ '^[0-9 +()./-]*$' then raise exception 'Telepon hanya boleh berisi angka, spasi, dan tanda + ( ) . / -.'; end if;
    if v_k = 'email' and v_v <> '' and v_v !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then raise exception 'Alamat email tidak sah.'; end if;
    v_baru := v_baru || jsonb_build_object(v_k, v_v);
  end loop;

  foreach v_k in array v_orang loop
    v_o := coalesce(p_nilai -> v_k, '{}'::jsonb);
    if jsonb_typeof(v_o) <> 'object' then raise exception 'Isian "%" tidak sah.', v_k; end if;
    v_h := '{}'::jsonb;
    for v_f in select jsonb_object_keys(v_o) loop
      if v_f not in ('jabatan', 'nama', 'nta', 'nip') then raise exception 'Isian "%.%" tidak dikenal.', v_k, v_f; end if;
    end loop;
    foreach v_f in array array['jabatan', 'nama', 'nta', 'nip'] loop
      if v_o -> v_f is not null and jsonb_typeof(v_o -> v_f) not in ('string', 'null') then raise exception 'Isian "%.%" harus berupa teks.', v_k, v_f; end if;
      v_v := sigarda.rapikan(v_o ->> v_f);
      if v_f = 'jabatan' and char_length(v_v) > 80 then raise exception 'Jabatan % maksimal 80 karakter.', v_k; end if;
      if v_f = 'nama' and char_length(v_v) > 120 then raise exception 'Nama % maksimal 120 karakter.', v_k; end if;
      if v_f in ('nta', 'nip') and v_v !~ '^[0-9A-Za-z./ -]{0,40}$' then raise exception '% % hanya boleh berisi huruf, angka, spasi, dan tanda / . - (maksimal 40 karakter).', upper(v_f), v_k; end if;
      v_h := v_h || jsonb_build_object(v_f, v_v);
    end loop;
    if v_k = 'pembina' and (v_h ->> 'nama' = '' or v_h ->> 'jabatan' = '') then raise exception 'Nama dan jabatan Pembina Gudep wajib diisi.'; end if;
    if v_k in ('pembina', 'kamabigus') then v_baru := v_baru || jsonb_build_object(v_k, v_h); end if;
  end loop;

  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada) values ('gudep.data', v_baru, auth.uid(), now())
  on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;

-- Identitas gudep yang boleh dilihat tanpa login (halaman masuk dan halaman verifikasi): hanya nama gudep, ambalan, sekolah, dan kota.
-- Nama pejabat, NTA, alamat, dan kontak TIDAK dikeluarkan. Belum ada data = objek kosong (aplikasi memakai nilai bawaan).
create function public.sg_gudep_publik() returns jsonb
language sql stable security definer set search_path = public as
$$
  select coalesce(
    (select jsonb_strip_nulls(jsonb_build_object('nama', p.nilai -> 'nama', 'singkat', p.nilai -> 'singkat', 'sekolah', p.nilai -> 'sekolah', 'kota', p.nilai -> 'kota'))
     from public.pengaturan p where p.kunci = 'gudep.data'), '{}'::jsonb)
$$;
-- Ketua sidang untuk berita acara: anggota Dewan Ambalan berjabatan Pradana (nama; sebutan "Pradana Dewan Ambalan"). Bila belum ada Pradana,
-- dipakai pengaturan lama sidang.nama_ketua dan sidang.sebutan_ketua (bawaan: kosong dan "Ketua Dewan Penegak / Pemangku Adat").
-- Cermin ketuaSidang di src/lib/dewanLogic.js (dijaga oleh pengujian).
create function sigarda.ketua_sidang(out o_nama text, out o_sebutan text) language plpgsql stable security definer set search_path = public as
$$
begin
  select sigarda.rapikan(nama), 'Pradana Dewan Ambalan' into o_nama, o_sebutan
  from public.profiles where jabatan_dewan = 'Pradana' and status = 'aktif' and (role = 'peserta' or (role = 'penguji' and jabatan = 'Dewan Ambalan')) limit 1;
  if not found then
    o_nama := sigarda.pengaturan_teks('sidang.nama_ketua', '');
    o_sebutan := sigarda.pengaturan_teks('sidang.sebutan_ketua', 'Ketua Dewan Penegak / Pemangku Adat');
  end if;
end $$;
-- ===== akhir fungsi gudep =====

