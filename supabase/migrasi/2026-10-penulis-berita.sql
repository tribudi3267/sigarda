-- ============================================================================
-- MIGRASI: nama penulis pada berita yang terbit di beranda. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-10-pinsa-bebas.sql; lihat README). Isi:
--   * sg_beranda_publik(), sg_berita_publik(), dan sg_berita_lagi(p_lewati int) ditulis ulang (tanda tangan sama): tiap berita kini membawa kolom
--     'penulis' = NAMA TAMPILAN penulis (kolom beranda_berita.dibuat_oleh_nama, disalin dari profiles.nama saat berita ditulis; BUKAN nama pengguna/NIS
--     akun). Berlaku untuk SEMUA berita yang sudah terbit (kolomnya sudah terisi sejak berita ditulis) dan yang terbit kemudian.
--   * Hanya nama penulis yang bertambah; id akun, peninjau, catatan tinjauan, dan status tetap tidak keluar.
-- TIDAK mengubah tabel maupun data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regprocedure('public.sg_berita_lagi(integer)') is null or to_regprocedure('public.sg_berita_publik()') is null
     or to_regprocedure('public.sg_beranda_publik()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-10-pinsa-bebas.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

create or replace function public.sg_beranda_publik() returns jsonb
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
      select jsonb_agg(jsonb_build_object('kategori', b.kategori, 'judul', b.judul, 'ringkasan', b.ringkasan, 'isi', b.isi, 'sampulUrl', b.sampul_url, 'terbitPada', b.terbit_pada, 'penulis', b.dibuat_oleh_nama) order by b.terbit_pada desc, b.id desc)
      from (select id, kategori, judul, ringkasan, isi, sampul_url, terbit_pada, dibuat_oleh_nama from public.beranda_berita where status = 'terbit' and terbit_pada <= now() order by terbit_pada desc, id desc limit 6) b
    ), '[]'::jsonb),
    'prestasi', coalesce((
      select jsonb_agg(jsonb_build_object('judul', p.judul, 'tingkat', p.tingkat, 'peringkat', p.peringkat, 'tahun', p.tahun, 'diraihOleh', p.diraih_oleh, 'fotoUrl', p.foto_url) order by p.tahun desc, p.id desc)
      from (select id, judul, tingkat, peringkat, tahun, diraih_oleh, foto_url from public.beranda_prestasi where status = 'terbit' order by tahun desc, id desc limit 6) p
    ), '[]'::jsonb),
    'galeri', coalesce((
      select jsonb_agg(jsonb_build_object('judul', g.judul, 'tautan', g.tautan, 'sampulUrl', g.sampul_url, 'kelompok', g.kelompok) order by g.dibuat_pada desc, g.id desc)
      from (select id, judul, tautan, sampul_url, kelompok, dibuat_pada from public.beranda_galeri where status = 'terbit' order by dibuat_pada desc, id desc limit 6) g
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

-- ===== Kelola Beranda: arsip berita publik (Fase 4): aksi =====
-- Semua berita TERBIT yang sudah waktunya (terbit_pada <= sekarang), terbaru dulu, paling banyak 200, TANPA login (hanya membaca). Dipakai build situs untuk
-- membuat satu halaman statis per berita (alamat tetap berdasarkan id, terbaca mesin pencari) dan sitemap; sg_beranda_publik hanya memuat 6 terbaru tanpa id.
-- Kolom: id, kategori, judul, ringkasan, isi, sampulUrl, penulis (nama tampilan), terbitPada, diubahPada SAJA (tanpa peninjau, catatan tinjauan, atau status).
create or replace function public.sg_berita_publik() returns jsonb
language sql stable security definer set search_path = public as
$$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'kategori', b.kategori, 'judul', b.judul, 'ringkasan', b.ringkasan, 'isi', b.isi, 'sampulUrl', b.sampul_url,
    'penulis', b.dibuat_oleh_nama, 'terbitPada', b.terbit_pada, 'diubahPada', b.diubah_pada) order by b.terbit_pada desc, b.id desc), '[]'::jsonb)
  from (select id, kategori, judul, ringkasan, isi, sampul_url, terbit_pada, diubah_pada, dibuat_oleh_nama from public.beranda_berita
        where status = 'terbit' and terbit_pada <= now() order by terbit_pada desc, id desc limit 200) b
$$;
-- ===== akhir arsip berita publik =====

-- ===== Kelola Beranda: berita lebih lama (tombol "Muat berita lebih lama"): aksi =====
-- Halaman muka menampilkan 6 berita terbaru (sg_beranda_publik). Fungsi ini memberi 6 berita TERBIT berikutnya sesudah p_lewati berita terbaru (yang sudah
-- tampil), TANPA login (hanya membaca), bentuk kolom sama dengan berita pada sg_beranda_publik (dengan nama penulis; tanpa id, peninjau, atau catatan tinjauan).
-- 'adaLagi' = masih ada berita yang lebih lama lagi (dibaca 7 baris, yang ke-7 tidak dikirim). p_lewati dibatasi 0..1000 supaya tak dapat dipakai memindai tanpa batas.
create or replace function public.sg_berita_lagi(p_lewati int) returns jsonb
language sql stable security definer set search_path = public as
$$
  select jsonb_build_object(
    'berita', coalesce(jsonb_agg(jsonb_build_object('kategori', x.kategori, 'judul', x.judul, 'ringkasan', x.ringkasan, 'isi', x.isi, 'sampulUrl', x.sampul_url,
      'terbitPada', x.terbit_pada, 'penulis', x.dibuat_oleh_nama) order by x.urut) filter (where x.urut <= 6), '[]'::jsonb),
    'adaLagi', coalesce(bool_or(x.urut > 6), false))
  from (
    select b.kategori, b.judul, b.ringkasan, b.isi, b.sampul_url, b.terbit_pada, b.dibuat_oleh_nama, row_number() over (order by b.terbit_pada desc, b.id desc) as urut
    from (select id, kategori, judul, ringkasan, isi, sampul_url, terbit_pada, dibuat_oleh_nama from public.beranda_berita
          where status = 'terbit' and terbit_pada <= now() order by terbit_pada desc, id desc
          offset least(greatest(coalesce(p_lewati, 0), 0), 1000) limit 7) b
  ) x
$$;
-- ===== akhir berita lebih lama =====

commit;
notify pgrst, 'reload schema';
