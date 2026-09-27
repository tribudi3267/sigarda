-- ===== Beranda publik (Fase 1 landing page): aksi =====
-- Halaman muka publik (landing page) menampilkan isi yang diatur pengurus di menu Kelola Beranda, disimpan pada pengaturan 'beranda.kontak' (satu objek JSON,
-- dibaca semua pengguna yang sudah masuk lewat kebijakan baca_pengaturan; diubah hanya lewat sg_beranda_kontak_simpan). Belum ada baris = beranda hanya
-- menampilkan isi bawaan.
--   teks       : whatsapp, email, telepon, jadwal (jadwal latihan), instagram, youtube, facebook, tiktok, peta (tautan Google Maps)
--   paragraf   : sambutanPembina, sambutanKepsek, cerita (boleh berbaris banyak; baris kosong = pemisah paragraf)
-- Tautan wajib https dengan nama host bertitik (mencegah javascript: dan sejenisnya). Aturan isian sama dengan periksaKontak di src/lib/berandaLogic.js
-- (dijaga oleh pengujian, dibandingkan langsung dengan fungsi ini).
-- Satu baris: semua spasi, tab, dan baris baru berturut-turut menjadi satu spasi, lalu tepi dibuang (btrim saja hanya membuang spasi, bukan tab; itu sebabnya bukan sigarda.rapikan).
create function sigarda.rapikan_baris(p_teks text) returns text language sql immutable as
$$ select btrim(regexp_replace(coalesce(p_teks, ''), '\s+', ' ', 'g')) $$;
-- Berparagraf: baris baru dipertahankan; tab dan spasi ganda menjadi satu spasi; spasi di tepi baris dibuang; baris kosong berturut-turut menjadi satu; tepi teks dibuang.
create function sigarda.rapikan_paragraf(p_teks text) returns text language sql immutable as
$$
  select btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p_teks, ''), E'\\r\\n?', E'\n', 'g'), E'[ \\t]+', ' ', 'g'), E' *\\n *', E'\n', 'g'), E'\\n{3,}', E'\n\n', 'g'), E' \n')
$$;

create function public.sg_beranda_kontak_simpan(p_nilai jsonb) returns void
language plpgsql security definer set search_path = public as
$$
declare
  v_teks text[] := array['whatsapp', 'email', 'telepon', 'jadwal', 'instagram', 'youtube', 'facebook', 'tiktok', 'peta'];
  v_para text[] := array['sambutanPembina', 'sambutanKepsek', 'cerita'];
  v_tautan text[] := array['instagram', 'youtube', 'facebook', 'tiktok', 'peta'];
  v_batas jsonb := '{"whatsapp":20,"email":100,"telepon":40,"jadwal":120,"instagram":300,"youtube":300,"facebook":300,"tiktok":300,"peta":300,"sambutanPembina":1500,"sambutanKepsek":1500,"cerita":2000}';
  v_baru jsonb := '{}'::jsonb; v_k text; v_v text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya pengurus (Pembina, Admin Gudep, dan Dewan Ambalan) yang dapat mengubah isi beranda.'; end if;
  if p_nilai is null or jsonb_typeof(p_nilai) <> 'object' then raise exception 'Isian beranda tidak sah.'; end if;
  for v_k in select jsonb_object_keys(p_nilai) loop
    if not (v_k = any (v_teks) or v_k = any (v_para)) then raise exception 'Isian "%" tidak dikenal.', v_k; end if;
  end loop;

  foreach v_k in array v_teks || v_para loop
    if p_nilai -> v_k is not null and jsonb_typeof(p_nilai -> v_k) not in ('string', 'null') then raise exception 'Isian "%" harus berupa teks.', v_k; end if;
    v_v := case when v_k = any (v_para) then sigarda.rapikan_paragraf(p_nilai ->> v_k) else sigarda.rapikan_baris(p_nilai ->> v_k) end;
    if char_length(v_v) > (v_batas ->> v_k)::int then raise exception 'Isian "%" maksimal % karakter.', v_k, v_batas ->> v_k; end if;
    if v_k = 'whatsapp' and v_v <> '' and v_v !~ '^[0-9 +()./-]{8,20}$' then raise exception 'Nomor WhatsApp hanya boleh berisi angka, spasi, dan tanda + ( ) . / - (8-20 karakter).'; end if;
    if v_k = 'telepon' and v_v !~ '^[0-9 +()./-]*$' then raise exception 'Telepon hanya boleh berisi angka, spasi, dan tanda + ( ) . / -.'; end if;
    if v_k = 'email' and v_v <> '' and v_v !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then raise exception 'Alamat email tidak sah.'; end if;
    if v_k = any (v_tautan) and v_v <> '' and v_v !~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}([/?#][^ ]*)?$' then raise exception 'Tautan "%" harus diawali https:// dan berupa alamat yang sah.', v_k; end if;
    v_baru := v_baru || jsonb_build_object(v_k, v_v);
  end loop;

  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada) values ('beranda.kontak', v_baru, auth.uid(), now())
  on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
end $$;

-- Isi beranda yang boleh dilihat TANPA login (hanya membaca), satu panggilan:
--   gudep     : nama, singkat (ambalan), sekolah, kota, alamat, nomorGudep, kwarran, kwarcab (identitas organisasi, bukan data pribadi)
--   pembina, kamabigus : { jabatan, nama } SAJA (NTA dan NIP tidak keluar)
--   kontak    : isian beranda.kontak; email dan telepon yang kosong dilengkapi dari Data Gudep
--   agenda    : paling banyak 6 kegiatan mendatang (hari ini WIB dan sesudahnya) berisi jenis, judul, tanggal SAJA; keterangan dan
--               peserta_terkait tidak pernah keluar
--   berita    : paling banyak 6 berita TERBIT dan sudah waktunya (terbit_pada <= sekarang), terbaru dulu; kategori, judul, ringkasan, isi, sampul, tanggal SAJA
--   prestasi  : semua prestasi TERBIT, tahun terbaru dulu; judul, tingkat, peringkat, tahun, diraih_oleh, foto SAJA
--   galeri    : semua album TERBIT; judul, tautan, sampul, kelompok SAJA
--   sosial    : paling banyak 6 kiriman media sosial yang tampil, terbaru dulu; platform, tautan, keterangan, gambar SAJA
--   faq       : semua pertanyaan umum, urut sesuai pengaturan Pembina/Admin (kosong = klien memakai daftar bawaan)
-- Data anggota, hasil SKU, catatan tinjauan, dan siapa yang menulis/meninjau TIDAK PERNAH keluar dari sini (fungsi ini publik).
create function public.sg_beranda_publik() returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare
  v_g jsonb := coalesce((select nilai from public.pengaturan where kunci = 'gudep.data'), '{}'::jsonb);
  v_k jsonb := coalesce((select nilai from public.pengaturan where kunci = 'beranda.kontak'), '{}'::jsonb);
begin
  return jsonb_build_object(
    'gudep', jsonb_strip_nulls(jsonb_build_object('nama', v_g -> 'nama', 'singkat', v_g -> 'singkat', 'sekolah', v_g -> 'sekolah', 'kota', v_g -> 'kota',
      'alamat', v_g -> 'alamat', 'nomorGudep', v_g -> 'nomorGudep', 'kwarran', v_g -> 'kwarran', 'kwarcab', v_g -> 'kwarcab')),
    'pembina', jsonb_strip_nulls(jsonb_build_object('jabatan', v_g #> '{pembina,jabatan}', 'nama', v_g #> '{pembina,nama}')),
    'kamabigus', jsonb_strip_nulls(jsonb_build_object('jabatan', v_g #> '{kamabigus,jabatan}', 'nama', v_g #> '{kamabigus,nama}')),
    'kontak', v_k
      || jsonb_build_object('email', coalesce(nullif(v_k ->> 'email', ''), v_g ->> 'email', ''), 'telepon', coalesce(nullif(v_k ->> 'telepon', ''), v_g ->> 'telepon', '')),
    'agenda', coalesce((
      select jsonb_agg(jsonb_build_object('jenis', a.jenis, 'judul', a.judul, 'tanggal', a.tanggal) order by a.tanggal, a.id)
      from (select id, jenis, judul, tanggal from public.agenda where tanggal >= sigarda.hari_ini() order by tanggal, id limit 6) a
    ), '[]'::jsonb),
    'berita', coalesce((
      select jsonb_agg(jsonb_build_object('kategori', b.kategori, 'judul', b.judul, 'ringkasan', b.ringkasan, 'isi', b.isi, 'sampulUrl', b.sampul_url, 'terbitPada', b.terbit_pada) order by b.terbit_pada desc, b.id desc)
      from (select id, kategori, judul, ringkasan, isi, sampul_url, terbit_pada from public.beranda_berita where status = 'terbit' and terbit_pada <= now() order by terbit_pada desc, id desc limit 6) b
    ), '[]'::jsonb),
    'prestasi', coalesce((
      select jsonb_agg(jsonb_build_object('judul', p.judul, 'tingkat', p.tingkat, 'peringkat', p.peringkat, 'tahun', p.tahun, 'diraihOleh', p.diraih_oleh, 'fotoUrl', p.foto_url) order by p.tahun desc, p.id desc)
      from (select id, judul, tingkat, peringkat, tahun, diraih_oleh, foto_url from public.beranda_prestasi where status = 'terbit') p
    ), '[]'::jsonb),
    'galeri', coalesce((
      select jsonb_agg(jsonb_build_object('judul', g.judul, 'tautan', g.tautan, 'sampulUrl', g.sampul_url, 'kelompok', g.kelompok) order by g.dibuat_pada desc, g.id desc)
      from (select id, judul, tautan, sampul_url, kelompok, dibuat_pada from public.beranda_galeri where status = 'terbit') g
    ), '[]'::jsonb),
    'sosial', coalesce((
      select jsonb_agg(jsonb_build_object('platform', s.platform, 'tautan', s.tautan, 'keterangan', s.keterangan, 'gambarUrl', s.gambar_url) order by s.dibuat_pada desc, s.id desc)
      from (select id, platform, tautan, keterangan, gambar_url, dibuat_pada from public.beranda_sosial where tampil order by dibuat_pada desc, id desc limit 6) s
    ), '[]'::jsonb),
    'faq', coalesce((
      select jsonb_agg(jsonb_build_object('pertanyaan', f.pertanyaan, 'jawaban', f.jawaban) order by f.urutan, f.id)
      from public.beranda_faq f
    ), '[]'::jsonb)
  );
end $$;
-- ===== akhir aksi beranda =====
