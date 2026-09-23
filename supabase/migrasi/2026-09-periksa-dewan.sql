-- ============================================================================
-- MIGRASI: Dewan Ambalan ikut memeriksa data. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi berkas-garuda (dan yang sebelumnya). Isi:
--   * sg_pemeriksaan_data() dan sg_push_ringkasan(): semula hanya Pembina dan Admin Gudep; kini seluruh PENGURUS
--     (Pembina, Dewan Ambalan, Admin) boleh memanggilnya, agar Dewan Ambalan ikut membantu memeriksa data dan mengingatkan
--     anggota lewat WhatsApp. Hanya isi fungsi yang berubah (tanda tangan sama); tidak ada tabel atau kolom baru.
--   * Pembatasan siapa yang boleh dihubungi (Dewan: Penegak dan sesama Dewan; Pembina dan Admin: Penegak, Dewan, dan Pembina)
--     ada di klien (src/lib/eskalasiLogic.js: bolehDihubungi); data yang dibaca Dewan tidak lebih banyak dari yang sudah
--     dapat dibacanya lewat daftar anggota.
-- Edge Function TIDAK berubah dan tidak perlu di-deploy ulang. TIDAK menghapus data yang ada. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: pemeriksaan data (migrasi pemeriksaan-data) dan ringkasan perangkat (migrasi notifikasi), serta berkas-garuda (terakhir sebelum ini).
do $$
begin
  if to_regprocedure('public.sg_pemeriksaan_data()') is null or to_regprocedure('public.sg_push_ringkasan()') is null
     or to_regprocedure('public.sg_garuda_token_baca(text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-berkas-garuda.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Ringkasan perangkat notifikasi: fungsi (dipakai migrasi periksa-dewan) =====
-- Pengurus (Pembina, Dewan Ambalan, Admin): berapa anggota yang punya perangkat notifikasi, dan siapa yang belum.
-- Dewan Ambalan ikut membantu memeriksa (migrasi periksa-dewan); tombol WhatsApp per orang dibatasi di klien menurut peran (eskalasiLogic.bolehDihubungi).
create or replace function public.sg_push_ringkasan() returns jsonb language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya pengurus (Pembina, Dewan Ambalan, dan Admin Gudep) yang dapat melihat ringkasan perangkat.'; end if;
  return (
    with a as (
      select p.id, p.nama, p.role, p.jabatan, p.kelas, exists (select 1 from public.push_langganan l where l.penerima_id = p.id) as ada
      from public.profiles p where p.role in ('peserta', 'penguji') and p.status = 'aktif'
    )
    select jsonb_build_object(
      'total', (select count(*) from a),
      'aktif', (select count(*) from a where ada),
      'tanpa', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'nama', t.nama, 'peran', case when t.role = 'peserta' then 'Penegak' else t.jabatan end, 'kelas', t.kelas)
                                          order by t.role desc, t.nama)
                         from (select * from a where not ada order by role desc, nama limit 1000) t), '[]'::jsonb),
      'terkonfigurasi', exists (select 1 from public.push_konfigurasi)
    )
  );
end $$;
-- ===== akhir ringkasan perangkat notifikasi =====

-- ===== Pemeriksaan data (tahap L3): fungsi =====
-- Pengurus (Pembina, Dewan Ambalan, Admin; Dewan ikut membantu memeriksa sejak migrasi periksa-dewan): ringkasan masalah kualitas data yang umum ditemui (kelas belum format rombel baku, NTA kosong, jenis kelamin kosong,
-- rombel tanpa penugasan penguji, Pembina tanpa agama, akun yang belum pernah masuk). Sebagian besar hanya dapat diperbaiki Admin Gudep
-- (lihat sg_anggota_jk_atur, sg_rombel_perbarui, sg_anggota_nta_atur, sg_anggota_agama_atur); Pembina tetap dapat melihatnya agar tahu apa
-- yang perlu diminta ke Admin. "Perangkat tanpa notifikasi" TIDAK diulang di sini: sudah ada di sg_push_ringkasan. Tiap daftar dibatasi 300 baris.
create or replace function public.sg_pemeriksaan_data() returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare v_ta text := sigarda.tahun_ajaran_kini();
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya pengurus (Pembina, Dewan Ambalan, dan Admin Gudep) yang dapat melihat pemeriksaan data.'; end if;
  return jsonb_build_object(
    'kelasLama', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'nis', x.nis, 'kelas', x.kelas) order by x.nis)
      from (select id, nama, nis, kelas from public.profiles where role = 'peserta' and status = 'aktif' and not sigarda.rombel_sah(kelas) limit 300) x
    ), '[]'::jsonb),
    'tanpaNta', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'nis', x.nis, 'kelas', x.kelas) order by x.nis)
      from (select id, nama, nis, kelas from public.profiles where role = 'peserta' and status = 'aktif' and (nta is null or btrim(nta) = '') limit 300) x
    ), '[]'::jsonb),
    'tanpaJk', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'nis', x.nis, 'kelas', x.kelas, 'peran', x.peran) order by x.peran, x.nama)
      from (select id, nama, nis, kelas, case when role = 'peserta' then 'Penegak' when role = 'admin' then 'Admin Gudep' else coalesce(jabatan, 'Dewan Ambalan') end as peran
            from public.profiles where status = 'aktif' and jenis_kelamin is null limit 300) x
    ), '[]'::jsonb),
    'rombelTanpaPenguji', coalesce((
      select jsonb_agg(jsonb_build_object('rombel', x.rombel, 'jumlah', x.jumlah) order by x.rombel)
      from (
        select rb.rombel, (select count(*) from public.profiles p2 where p2.role = 'peserta' and p2.status = 'aktif' and p2.kelas = rb.rombel) as jumlah
        from (select k || '-' || lpad(n::text, 2, '0') as rombel from (values ('X'), ('XI'), ('XII')) t(k), generate_series(1, 10) n) rb
        where exists (select 1 from public.profiles p2 where p2.role = 'peserta' and p2.status = 'aktif' and p2.kelas = rb.rombel)
          and not exists (select 1 from public.penugasan_rombel r where r.tahun_ajaran = v_ta and r.rombel = rb.rombel)
      ) x
    ), '[]'::jsonb),
    'pembinaTanpaAgama', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama) order by x.nama)
      from (select id, nama from public.profiles where role = 'penguji' and jabatan = 'Pembina' and status = 'aktif' and agama is null limit 300) x
    ), '[]'::jsonb),
    'belumPernahMasuk', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'peran', x.peran, 'dibuat', x.dibuat) order by x.dibuat)
      from (
        select p.id, p.nama, case when p.role = 'peserta' then 'Penegak' when p.role = 'admin' then 'Admin Gudep' else coalesce(p.jabatan, 'Dewan Ambalan') end as peran, p.dibuat
        from public.profiles p join auth.users u on u.id = p.id
        where p.status = 'aktif' and u.last_sign_in_at is null
        limit 300
      ) x
    ), '[]'::jsonb)
  );
end $$;
-- ===== akhir fungsi pemeriksaan data =====

revoke all on function public.sg_push_ringkasan(), public.sg_pemeriksaan_data() from public, anon, authenticated;
grant execute on function public.sg_push_ringkasan(), public.sg_pemeriksaan_data() to authenticated;

commit;
notify pgrst, 'reload schema';
