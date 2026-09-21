-- ============================================================================
-- MIGRASI: Jenis kelamin anggota. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi notifikasi (atau migrasi terakhir yang sudah Anda jalankan). Isi:
--   * profiles.jenis_kelamin: 'L' (laki-laki) atau 'P' (perempuan) untuk semua peran (Penegak, Dewan Ambalan, Pembina, Admin). Boleh kosong: anggota yang
--     sudah ada tetap kosong sampai dilengkapi Admin (formulir Ubah anggota, atau tombol "Lengkapi jenis kelamin" di menu Anggota).
--   * sg_anggota_jk_atur: Admin Gudep mengatur jenis kelamin banyak anggota sekaligus (semua atau tidak sama sekali). Dipakai formulir Tambah/Ubah anggota
--     dan import Excel (diisi sesudah akun dibuat).
--   Tanda tangan fungsi yang dipanggil Edge Function tidak berubah: Edge Function TIDAK perlu di-deploy ulang.
-- TIDAK menghapus data yang ada. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: skema dasar dengan tabel profiles dan fungsi sigarda.wajib_admin (migrasi penugasan).
do $$
begin
  if to_regclass('public.profiles') is null or to_regprocedure('sigarda.wajib_admin(text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-notifikasi.sql, lihat README), baru migrasi ini.';
  end if;
end $$;

alter table public.profiles add column if not exists jenis_kelamin text check (jenis_kelamin in ('L','P'));

-- ===== Jenis kelamin: fungsi =====
-- Jenis kelamin anggota (semua peran), oleh Admin Gudep. p_data = [{"username": "10231", "jk": "L"}, ...]; jk 'L' (laki-laki) atau 'P' (perempuan); jk kosong
-- menghapus. Dipakai formulir tambah dan ubah anggota, import Excel (diisi sesudah akun dibuat; Edge Function tidak membawanya), dan "Lengkapi jenis kelamin"
-- untuk anggota lama. Semua atau tidak sama sekali. Mengembalikan jumlah anggota yang ditemukan dan diperbarui.
create or replace function public.sg_anggota_jk_atur(p_data jsonb) returns int
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

revoke all on function public.sg_anggota_jk_atur(jsonb) from public, anon, authenticated;
grant execute on function public.sg_anggota_jk_atur(jsonb) to authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
