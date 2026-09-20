-- ============================================================================
-- MIGRASI: NTA anggota (Nomor Tanda Anggota) untuk import Excel dan formulir ubah anggota. AMAN untuk database berisi data.
--
-- Jalankan SETELAH 2026-09-verifikasi-sesi.sql. Isi: satu fungsi baru, sg_anggota_nta_atur(jsonb), khusus Admin Gudep.
-- TIDAK mengubah tabel, kolom, atau data yang ada. Aman dijalankan berulang kali. Edge Function tidak berubah.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: migrasi verifikasi-sesi (dan yang sebelumnya) sudah dijalankan.
do $$
begin
  if to_regprocedure('public.sg_sesi_simpan(integer, text, date, text, text, text, text[], uuid[])') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'nta') then
    raise exception 'Jalankan lebih dulu migrasi 2026-09-sidang-dk.sql, 2026-09-sidang-format-nomor.sql, 2026-09-raport.sql, 2026-09-instrumen.sql, dan 2026-09-verifikasi-sesi.sql, baru migrasi ini.';
  end if;
end $$;

-- NTA (Nomor Tanda Anggota) anggota, oleh Admin Gudep. p_data = [{"username": "10231", "nta": "11.03.10.701.00123"}, ...]; nta kosong menghapus NTA.
-- Dipakai formulir ubah anggota dan import Excel (NTA diisi sesudah akun dibuat). Mengembalikan jumlah anggota yang ditemukan dan diperbarui.
create or replace function public.sg_anggota_nta_atur(p_data jsonb) returns int
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

revoke all on function public.sg_anggota_nta_atur(jsonb) from public, anon, authenticated;
grant execute on function public.sg_anggota_nta_atur(jsonb) to authenticated;

commit;
notify pgrst, 'reload schema';
