-- ============================================================================
-- MIGRASI: Beranda publik menampilkan ISI LENGKAP berita ("Baca selengkapnya" di landing page). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi 2026-09-beranda-konten.sql (bila belum, berhenti dengan pesan yang menuntun). Isi:
--   * sg_beranda_publik() ditulis ulang (tanda tangan sama): setiap berita TERBIT kini juga menyertakan `isi` (teks lengkap, sudah dirapikan
--     per paragraf saat disimpan sg_berita_simpan), selain kategori, judul, ringkasan, sampul, dan tanggal terbit yang sudah ada.
-- TIDAK menghapus data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/585-aksi-beranda.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regprocedure('public.sg_berita_simpan(bigint,text,text,text,text,text,text,timestamptz)') is null then
    raise exception 'Jalankan lebih dulu migrasi 2026-09-beranda-konten.sql (lihat README), baru migrasi ini.';
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

commit;
