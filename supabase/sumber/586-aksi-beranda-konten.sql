-- ===== Kelola Beranda (Fase 2 landing page): aksi =====
-- Berita, Prestasi, dan Galeri berbagi alur tinjauan yang sama (lihat catatan di 28-tabel-beranda-konten.sql). Fungsi bantu ini hanya
-- menentukan siapa boleh MENGUBAH atau MENGHAPUS satu baris: Pembina dan Admin Gudep kapan saja; penulisnya sendiri selama belum terbit
-- (draf, menunggu, atau ditolak -- termasuk membatalkan pengajuan sendiri).
create function sigarda.beranda_konten_boleh_ubah(p_dibuat_oleh uuid, p_status text) returns boolean
language sql stable security definer set search_path = public as
$$ select sigarda.pembina_atau_admin() or (p_dibuat_oleh = auth.uid() and p_status in ('draf', 'menunggu', 'ditolak')) $$;

-- Nama pengguna saat ini, dirapikan (disalin ke kolom *_nama karena Penegak tak selalu dapat membaca profil pengurus lain di tampilan Dewan lama).
create function sigarda.nama_saya() returns text language sql stable security definer set search_path = public as
$$ select sigarda.rapikan((select nama from public.profiles where id = auth.uid())) $$;

-- ===== Berita =====
-- p_id null = tulis baru. p_status: 'draf' (hanya penulis melihat lewat menu Kelola Beranda), 'menunggu' (diajukan ke Pembina), atau
-- 'terbit' (HANYA Pembina/Admin Gudep; p_terbit_pada boleh masa depan untuk menjadwalkan). Mengubah baris yang sudah 'terbit' juga hanya
-- Pembina/Admin Gudep. Mengembalikan id baris.
create function public.sg_berita_simpan(p_id bigint, p_kategori text, p_judul text, p_ringkasan text, p_isi text, p_sampul_url text, p_status text, p_terbit_pada timestamptz) returns bigint
language plpgsql security definer set search_path = public as
$$
declare
  v_judul text := sigarda.rapikan(p_judul); v_ringkasan text := sigarda.rapikan(p_ringkasan); v_isi text := sigarda.rapikan_paragraf(p_isi);
  v_sampul text := sigarda.rapikan(p_sampul_url); v_status text := coalesce(p_status, 'draf'); v_lama public.beranda_berita; v_id bigint;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya pengurus (Pembina, Admin Gudep, dan Dewan Ambalan) yang dapat menulis berita.'; end if;
  if p_kategori not in ('kegiatan', 'pengumuman', 'lainnya') then raise exception 'Kategori berita tidak dikenal.'; end if;
  if char_length(v_judul) < 1 or char_length(v_judul) > 150 then raise exception 'Judul berita wajib diisi, maksimal 150 karakter.'; end if;
  if char_length(v_ringkasan) > 200 then raise exception 'Ringkasan berita maksimal 200 karakter.'; end if;
  if char_length(v_isi) < 1 or char_length(v_isi) > 4000 then raise exception 'Isi berita wajib diisi, maksimal 4000 karakter.'; end if;
  if v_sampul <> '' and v_sampul !~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}([/?#][^ ]*)?$' then raise exception 'Gambar sampul harus diawali https:// dan berupa alamat yang sah.'; end if;
  if v_status not in ('draf', 'menunggu', 'terbit') then raise exception 'Status berita tidak sah.'; end if;
  if v_status = 'terbit' and not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menerbitkan berita.'; end if;

  if p_id is not null then
    select * into v_lama from public.beranda_berita where id = p_id;
    if v_lama.id is null then raise exception 'Berita tidak ditemukan.'; end if;
    if not sigarda.beranda_konten_boleh_ubah(v_lama.dibuat_oleh, v_lama.status) then
      raise exception 'Anda hanya dapat mengubah berita sendiri yang belum terbit; berita yang sudah terbit hanya diubah Pembina atau Admin Gudep.';
    end if;
    update public.beranda_berita set kategori = p_kategori, judul = v_judul, ringkasan = v_ringkasan, isi = v_isi, sampul_url = v_sampul,
        status = v_status, terbit_pada = case when v_status = 'terbit' then coalesce(p_terbit_pada, now()) else null end,
        catatan_tinjauan = case when v_status = 'ditolak' then catatan_tinjauan else '' end, diubah_pada = now()
      where id = p_id returning id into v_id;
  else
    insert into public.beranda_berita (kategori, judul, ringkasan, isi, sampul_url, status, terbit_pada, dibuat_oleh, dibuat_oleh_nama)
      values (p_kategori, v_judul, v_ringkasan, v_isi, v_sampul, v_status, case when v_status = 'terbit' then coalesce(p_terbit_pada, now()) else null end, auth.uid(), sigarda.nama_saya())
      returning id into v_id;
  end if;
  return v_id;
end $$;

create function public.sg_berita_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
declare v_lama public.beranda_berita;
begin
  perform sigarda.wajib_aktif();
  select * into v_lama from public.beranda_berita where id = p_id;
  if v_lama.id is null then raise exception 'Berita tidak ditemukan.'; end if;
  if not sigarda.beranda_konten_boleh_ubah(v_lama.dibuat_oleh, v_lama.status) then
    raise exception 'Anda hanya dapat menghapus berita sendiri yang belum terbit; berita yang sudah terbit hanya dihapus Pembina atau Admin Gudep.';
  end if;
  delete from public.beranda_berita where id = p_id;
end $$;

-- Meninjau pengajuan ('menunggu' saja); p_keputusan 'terbit' menerbitkan seketika, 'ditolak' wajib catatan (minimal 5 karakter).
create function public.sg_berita_tinjau(p_id bigint, p_keputusan text, p_catatan text) returns void language plpgsql security definer set search_path = public as
$$
declare v_catatan text := sigarda.rapikan(p_catatan); v_ada boolean;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat meninjau berita.'; end if;
  if p_keputusan not in ('terbit', 'ditolak') then raise exception 'Keputusan harus terbit atau ditolak.'; end if;
  if p_keputusan = 'ditolak' and char_length(v_catatan) < 5 then raise exception 'Alasan penolakan wajib diisi, minimal 5 karakter.'; end if;
  select true into v_ada from public.beranda_berita where id = p_id and status = 'menunggu';
  if v_ada is null then raise exception 'Pengajuan berita tidak ditemukan atau sudah ditinjau.'; end if;
  update public.beranda_berita set status = p_keputusan, terbit_pada = case when p_keputusan = 'terbit' then now() else null end,
      catatan_tinjauan = case when p_keputusan = 'ditolak' then v_catatan else '' end,
      ditinjau_oleh = auth.uid(), ditinjau_oleh_nama = sigarda.nama_saya(), ditinjau_pada = now(), diubah_pada = now()
    where id = p_id;
end $$;
-- ===== akhir berita =====

-- ===== Prestasi =====
create function public.sg_prestasi_simpan(p_id bigint, p_judul text, p_tingkat text, p_peringkat text, p_tahun int, p_diraih_oleh text, p_foto_url text, p_status text) returns bigint
language plpgsql security definer set search_path = public as
$$
declare
  v_judul text := sigarda.rapikan(p_judul); v_peringkat text := sigarda.rapikan(p_peringkat); v_diraih text := sigarda.rapikan(p_diraih_oleh);
  v_foto text := sigarda.rapikan(p_foto_url); v_status text := coalesce(p_status, 'draf'); v_lama public.beranda_prestasi; v_id bigint;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya pengurus (Pembina, Admin Gudep, dan Dewan Ambalan) yang dapat menambah prestasi.'; end if;
  if p_tingkat not in ('gudep', 'ranting', 'cabang', 'provinsi', 'nasional') then raise exception 'Tingkat prestasi tidak dikenal.'; end if;
  if char_length(v_judul) < 1 or char_length(v_judul) > 150 then raise exception 'Nama lomba atau penghargaan wajib diisi, maksimal 150 karakter.'; end if;
  if char_length(v_peringkat) < 1 or char_length(v_peringkat) > 60 then raise exception 'Peringkat wajib diisi, maksimal 60 karakter.'; end if;
  if p_tahun is null or p_tahun < 2000 or p_tahun > extract(year from sigarda.hari_ini())::int then raise exception 'Tahun tidak sah.'; end if;
  if char_length(v_diraih) < 1 or char_length(v_diraih) > 150 then raise exception 'Nama regu, tim, atau gudep yang meraih wajib diisi, maksimal 150 karakter.'; end if;
  if v_foto <> '' and v_foto !~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}([/?#][^ ]*)?$' then raise exception 'Foto harus diawali https:// dan berupa alamat yang sah.'; end if;
  if v_status not in ('draf', 'menunggu', 'terbit') then raise exception 'Status prestasi tidak sah.'; end if;
  if v_status = 'terbit' and not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menerbitkan prestasi.'; end if;

  if p_id is not null then
    select * into v_lama from public.beranda_prestasi where id = p_id;
    if v_lama.id is null then raise exception 'Prestasi tidak ditemukan.'; end if;
    if not sigarda.beranda_konten_boleh_ubah(v_lama.dibuat_oleh, v_lama.status) then
      raise exception 'Anda hanya dapat mengubah prestasi sendiri yang belum terbit; yang sudah terbit hanya diubah Pembina atau Admin Gudep.';
    end if;
    update public.beranda_prestasi set judul = v_judul, tingkat = p_tingkat, peringkat = v_peringkat, tahun = p_tahun, diraih_oleh = v_diraih,
        foto_url = v_foto, status = v_status, catatan_tinjauan = case when v_status = 'ditolak' then catatan_tinjauan else '' end, diubah_pada = now()
      where id = p_id returning id into v_id;
  else
    insert into public.beranda_prestasi (judul, tingkat, peringkat, tahun, diraih_oleh, foto_url, status, dibuat_oleh, dibuat_oleh_nama)
      values (v_judul, p_tingkat, v_peringkat, p_tahun, v_diraih, v_foto, v_status, auth.uid(), sigarda.nama_saya())
      returning id into v_id;
  end if;
  return v_id;
end $$;

create function public.sg_prestasi_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
declare v_lama public.beranda_prestasi;
begin
  perform sigarda.wajib_aktif();
  select * into v_lama from public.beranda_prestasi where id = p_id;
  if v_lama.id is null then raise exception 'Prestasi tidak ditemukan.'; end if;
  if not sigarda.beranda_konten_boleh_ubah(v_lama.dibuat_oleh, v_lama.status) then
    raise exception 'Anda hanya dapat menghapus prestasi sendiri yang belum terbit; yang sudah terbit hanya dihapus Pembina atau Admin Gudep.';
  end if;
  delete from public.beranda_prestasi where id = p_id;
end $$;

create function public.sg_prestasi_tinjau(p_id bigint, p_keputusan text, p_catatan text) returns void language plpgsql security definer set search_path = public as
$$
declare v_catatan text := sigarda.rapikan(p_catatan); v_ada boolean;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat meninjau prestasi.'; end if;
  if p_keputusan not in ('terbit', 'ditolak') then raise exception 'Keputusan harus terbit atau ditolak.'; end if;
  if p_keputusan = 'ditolak' and char_length(v_catatan) < 5 then raise exception 'Alasan penolakan wajib diisi, minimal 5 karakter.'; end if;
  select true into v_ada from public.beranda_prestasi where id = p_id and status = 'menunggu';
  if v_ada is null then raise exception 'Pengajuan prestasi tidak ditemukan atau sudah ditinjau.'; end if;
  update public.beranda_prestasi set status = p_keputusan, catatan_tinjauan = case when p_keputusan = 'ditolak' then v_catatan else '' end,
      ditinjau_oleh = auth.uid(), ditinjau_oleh_nama = sigarda.nama_saya(), ditinjau_pada = now(), diubah_pada = now()
    where id = p_id;
end $$;
-- ===== akhir prestasi =====

-- ===== Galeri =====
create function public.sg_galeri_simpan(p_id bigint, p_judul text, p_tautan text, p_sampul_url text, p_kelompok text, p_status text) returns bigint
language plpgsql security definer set search_path = public as
$$
declare
  v_judul text := sigarda.rapikan(p_judul); v_tautan text := sigarda.rapikan(p_tautan); v_sampul text := sigarda.rapikan(p_sampul_url);
  v_status text := coalesce(p_status, 'draf'); v_lama public.beranda_galeri; v_id bigint;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya pengurus (Pembina, Admin Gudep, dan Dewan Ambalan) yang dapat menambah album galeri.'; end if;
  if char_length(v_judul) < 1 or char_length(v_judul) > 100 then raise exception 'Nama album wajib diisi, maksimal 100 karakter.'; end if;
  if v_tautan !~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}([/?#][^ ]*)?$' then raise exception 'Tautan album harus diawali https:// dan berupa alamat yang sah.'; end if;
  if v_sampul <> '' and v_sampul !~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}([/?#][^ ]*)?$' then raise exception 'Sampul album harus diawali https:// dan berupa alamat yang sah.'; end if;
  if p_kelompok not in ('latihan', 'perkemahan', 'pelantikan', 'lainnya') then raise exception 'Kelompok album tidak dikenal.'; end if;
  if v_status not in ('draf', 'menunggu', 'terbit') then raise exception 'Status album tidak sah.'; end if;
  if v_status = 'terbit' and not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menampilkan album di beranda.'; end if;

  if p_id is not null then
    select * into v_lama from public.beranda_galeri where id = p_id;
    if v_lama.id is null then raise exception 'Album tidak ditemukan.'; end if;
    if not sigarda.beranda_konten_boleh_ubah(v_lama.dibuat_oleh, v_lama.status) then
      raise exception 'Anda hanya dapat mengubah album sendiri yang belum tampil; yang sudah tampil hanya diubah Pembina atau Admin Gudep.';
    end if;
    update public.beranda_galeri set judul = v_judul, tautan = v_tautan, sampul_url = v_sampul, kelompok = p_kelompok, status = v_status,
        catatan_tinjauan = case when v_status = 'ditolak' then catatan_tinjauan else '' end, diubah_pada = now()
      where id = p_id returning id into v_id;
  else
    insert into public.beranda_galeri (judul, tautan, sampul_url, kelompok, status, dibuat_oleh, dibuat_oleh_nama)
      values (v_judul, v_tautan, v_sampul, p_kelompok, v_status, auth.uid(), sigarda.nama_saya())
      returning id into v_id;
  end if;
  return v_id;
end $$;

create function public.sg_galeri_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
declare v_lama public.beranda_galeri;
begin
  perform sigarda.wajib_aktif();
  select * into v_lama from public.beranda_galeri where id = p_id;
  if v_lama.id is null then raise exception 'Album tidak ditemukan.'; end if;
  if not sigarda.beranda_konten_boleh_ubah(v_lama.dibuat_oleh, v_lama.status) then
    raise exception 'Anda hanya dapat menghapus album sendiri yang belum tampil; yang sudah tampil hanya dihapus Pembina atau Admin Gudep.';
  end if;
  delete from public.beranda_galeri where id = p_id;
end $$;

create function public.sg_galeri_tinjau(p_id bigint, p_keputusan text, p_catatan text) returns void language plpgsql security definer set search_path = public as
$$
declare v_catatan text := sigarda.rapikan(p_catatan); v_ada boolean;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat meninjau album galeri.'; end if;
  if p_keputusan not in ('terbit', 'ditolak') then raise exception 'Keputusan harus terbit atau ditolak.'; end if;
  if p_keputusan = 'ditolak' and char_length(v_catatan) < 5 then raise exception 'Alasan penolakan wajib diisi, minimal 5 karakter.'; end if;
  select true into v_ada from public.beranda_galeri where id = p_id and status = 'menunggu';
  if v_ada is null then raise exception 'Pengajuan album tidak ditemukan atau sudah ditinjau.'; end if;
  update public.beranda_galeri set status = p_keputusan, catatan_tinjauan = case when p_keputusan = 'ditolak' then v_catatan else '' end,
      ditinjau_oleh = auth.uid(), ditinjau_oleh_nama = sigarda.nama_saya(), ditinjau_pada = now(), diubah_pada = now()
    where id = p_id;
end $$;
-- ===== akhir galeri =====

-- ===== Media sosial =====
-- Tanpa alur tinjauan: semua pengurus dapat menempel dan langsung tampil. Mengubah/menghapus milik sendiri; Pembina dan Admin Gudep boleh milik siapa pun.
create function public.sg_sosial_simpan(p_id bigint, p_platform text, p_tautan text, p_keterangan text, p_gambar_url text, p_tampil boolean) returns bigint
language plpgsql security definer set search_path = public as
$$
declare
  v_tautan text := sigarda.rapikan(p_tautan); v_ket text := sigarda.rapikan(p_keterangan); v_gbr text := sigarda.rapikan(p_gambar_url);
  v_lama public.beranda_sosial; v_id bigint;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya pengurus (Pembina, Admin Gudep, dan Dewan Ambalan) yang dapat menempel kiriman media sosial.'; end if;
  if p_platform not in ('instagram', 'youtube', 'facebook', 'tiktok') then raise exception 'Platform tidak dikenal.'; end if;
  if v_tautan !~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}([/?#][^ ]*)?$' then raise exception 'Tautan kiriman harus diawali https:// dan berupa alamat yang sah.'; end if;
  if char_length(v_ket) > 200 then raise exception 'Keterangan maksimal 200 karakter.'; end if;
  if v_gbr <> '' and v_gbr !~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}([/?#][^ ]*)?$' then raise exception 'Gambar pratinjau harus diawali https:// dan berupa alamat yang sah.'; end if;
  if p_id is not null then
    select * into v_lama from public.beranda_sosial where id = p_id;
    if v_lama.id is null then raise exception 'Kiriman tidak ditemukan.'; end if;
    if not sigarda.pembina_atau_admin() and v_lama.dibuat_oleh is distinct from auth.uid() then raise exception 'Anda hanya dapat mengubah kiriman milik Anda sendiri.'; end if;
    update public.beranda_sosial set platform = p_platform, tautan = v_tautan, keterangan = v_ket, gambar_url = v_gbr, tampil = coalesce(p_tampil, true), diubah_pada = now()
      where id = p_id returning id into v_id;
  else
    insert into public.beranda_sosial (platform, tautan, keterangan, gambar_url, tampil, dibuat_oleh, dibuat_oleh_nama)
      values (p_platform, v_tautan, v_ket, v_gbr, coalesce(p_tampil, true), auth.uid(), sigarda.nama_saya())
      returning id into v_id;
  end if;
  return v_id;
end $$;

create function public.sg_sosial_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
declare v_lama public.beranda_sosial;
begin
  perform sigarda.wajib_aktif();
  select * into v_lama from public.beranda_sosial where id = p_id;
  if v_lama.id is null then raise exception 'Kiriman tidak ditemukan.'; end if;
  if not sigarda.pembina_atau_admin() and v_lama.dibuat_oleh is distinct from auth.uid() then raise exception 'Anda hanya dapat menghapus kiriman milik Anda sendiri.'; end if;
  delete from public.beranda_sosial where id = p_id;
end $$;
-- ===== akhir media sosial =====

-- ===== Pertanyaan umum (FAQ) =====
-- HANYA Pembina dan Admin Gudep (beda dari Berita/Prestasi/Galeri/Media sosial: Dewan Ambalan tidak dapat menulis atau mengusulkan).
create function public.sg_faq_simpan(p_id bigint, p_pertanyaan text, p_jawaban text) returns bigint
language plpgsql security definer set search_path = public as
$$
declare v_p text := sigarda.rapikan(p_pertanyaan); v_j text := sigarda.rapikan(p_jawaban); v_id bigint; v_urutan int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah pertanyaan umum.'; end if;
  if char_length(v_p) < 1 or char_length(v_p) > 200 then raise exception 'Pertanyaan wajib diisi, maksimal 200 karakter.'; end if;
  if char_length(v_j) < 1 or char_length(v_j) > 1000 then raise exception 'Jawaban wajib diisi, maksimal 1000 karakter.'; end if;
  if p_id is not null then
    update public.beranda_faq set pertanyaan = v_p, jawaban = v_j, diubah_oleh = auth.uid(), diubah_pada = now() where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Pertanyaan tidak ditemukan.'; end if;
  else
    select coalesce(max(urutan), 0) + 1 into v_urutan from public.beranda_faq;
    insert into public.beranda_faq (pertanyaan, jawaban, urutan, diubah_oleh) values (v_p, v_j, v_urutan, auth.uid()) returning id into v_id;
  end if;
  return v_id;
end $$;

create function public.sg_faq_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus pertanyaan umum.'; end if;
  delete from public.beranda_faq where id = p_id;
end $$;

-- Menukar urutan dengan tetangga (p_arah < 0 = naik, > 0 = turun); di ujung daftar tidak melakukan apa pun. Pola sama dengan sg_materi_geser.
create function public.sg_faq_geser(p_id bigint, p_arah int) returns void language plpgsql security definer set search_path = public as
$$
declare v_u int; v_tetangga bigint; v_ut int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah urutan pertanyaan umum.'; end if;
  select urutan into v_u from public.beranda_faq where id = p_id;
  if v_u is null then return; end if;
  if p_arah < 0 then
    select id, urutan into v_tetangga, v_ut from public.beranda_faq where urutan < v_u order by urutan desc limit 1;
  else
    select id, urutan into v_tetangga, v_ut from public.beranda_faq where urutan > v_u order by urutan asc limit 1;
  end if;
  if v_tetangga is null then return; end if;
  update public.beranda_faq set urutan = case when id = p_id then v_ut else v_u end where id in (p_id, v_tetangga);
end $$;
-- ===== akhir faq =====
-- ===== akhir aksi beranda konten =====

-- ===== Kelola Beranda: notifikasi pengajuan (Fase 3) =====
-- Berita, Prestasi, dan Galeri berbagi satu fungsi (tabel dibedakan lewat TG_TABLE_NAME, kolomnya sama): pengajuan baru atau diajukan ulang
-- (status menjadi 'menunggu') memberi tahu semua Pembina dan Admin Gudep aktif (kecuali pelakunya sendiri, bila kebetulan pengurus); pengajuan
-- yang ditinjau (dari 'menunggu' menjadi 'terbit' atau 'ditolak') memberi tahu penulisnya. Isi tanpa hasil (hanya "diterbitkan"/"ditolak";
-- alasan penolakan dilihat di aplikasi), sama seperti kaidah notifikasi lain.
create function sigarda.notif_beranda_konten() returns trigger language plpgsql security definer set search_path = public as
$$
declare v_x uuid; v_label text; v_kunci text;
begin
  v_label := case TG_TABLE_NAME when 'beranda_berita' then 'Berita' when 'beranda_prestasi' then 'Prestasi' else 'Galeri' end;
  v_kunci := TG_TABLE_NAME || ':' || NEW.id || ':' || NEW.status || ':' || to_char(coalesce(NEW.diubah_pada, now()), 'YYYYMMDDHH24MISS');
  if NEW.status = 'menunggu' and (TG_OP = 'INSERT' or OLD.status is distinct from 'menunggu') then
    for v_x in select id from public.profiles where status = 'aktif' and (role = 'admin' or (role = 'penguji' and jabatan = 'Pembina')) and id is distinct from NEW.dibuat_oleh loop
      perform sigarda.notif_buat(v_x, 'beranda', 'Pengajuan ' || v_label || ' baru',
        coalesce(nullif(NEW.dibuat_oleh_nama, ''), 'Seseorang') || ' mengajukan ' || lower(v_label) || ' "' || NEW.judul || '" di Kelola Beranda.',
        jsonb_build_object('tab', 'kelolaberanda'), v_kunci);
    end loop;
  elsif TG_OP = 'UPDATE' and OLD.status = 'menunggu' and NEW.status in ('terbit', 'ditolak') and NEW.dibuat_oleh is distinct from auth.uid() then
    perform sigarda.notif_buat(NEW.dibuat_oleh, 'beranda', 'Pengajuan ' || v_label || ' ditinjau',
      v_label || ' "' || NEW.judul || '" Anda sudah ' || (case when NEW.status = 'terbit' then 'diterbitkan' else 'ditolak (catatan ada di Kelola Beranda)' end) || '.',
      jsonb_build_object('tab', 'kelolaberanda'), v_kunci);
  end if;
  return null;
end $$;
create trigger notif_berita_status after insert or update of status on public.beranda_berita for each row execute function sigarda.notif_beranda_konten();
create trigger notif_prestasi_status after insert or update of status on public.beranda_prestasi for each row execute function sigarda.notif_beranda_konten();
create trigger notif_galeri_status after insert or update of status on public.beranda_galeri for each row execute function sigarda.notif_beranda_konten();
-- ===== akhir notifikasi beranda konten =====
