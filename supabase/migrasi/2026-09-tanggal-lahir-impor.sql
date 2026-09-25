-- ============================================================================
-- MIGRASI: Tahap 2 (G4b) -- impor tanggal lahir Penegak dari template Excel. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-gerbang.sql; lihat README). Isi:
--   * Fungsi baru (Pembina dan Admin Gudep): sg_tanggal_lahir_impor (banyak Penegak sekaligus dari kolom "Tanggal Lahir" template import; semua atau tidak sama sekali).
-- TIDAK mengubah tabel maupun data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.tanggal_lahir') is null or to_regprocedure('public.sg_tanggal_lahir_atur(uuid, date)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-gerbang.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Tanggal lahir impor (Tahap 2, G4b): aksi =====
-- Mengisi tanggal lahir banyak Penegak sekaligus sesudah impor akun dari Excel (kolom "Tanggal Lahir" pada template). `p_data` = [{ username, tanggal 'YYYY-MM-DD' }]. Semua atau
-- tidak sama sekali: satu baris keliru membatalkan seluruhnya. Hanya Penegak aktif yang diperbarui (nama pengguna yang tidak dikenal dilewati, seperti sg_anggota_jk_atur).
-- Mengembalikan jumlah Penegak yang diperbarui.
create or replace function public.sg_tanggal_lahir_impor(p_data jsonb) returns integer language plpgsql security definer set search_path = public as
$$
declare v_e jsonb; v_user text; v_tgl date; v_n int := 0; v_k int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengisi tanggal lahir.'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'array' then raise exception 'Data tanggal lahir tidak valid.'; end if;
  if jsonb_array_length(p_data) > 500 then raise exception 'Maksimal 500 baris tanggal lahir per permintaan.'; end if;
  for v_e in select * from jsonb_array_elements(p_data) loop
    v_user := lower(btrim(coalesce(v_e ->> 'username', '')));
    if v_user = '' then raise exception 'Nama pengguna anggota wajib diisi.'; end if;
    if coalesce(v_e ->> 'tanggal', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Tanggal lahir % harus berbentuk TTTT-BB-HH.', v_user; end if;
    begin
      v_tgl := (v_e ->> 'tanggal')::date;
    exception when others then raise exception 'Tanggal lahir % tidak sah.', v_user;
    end;
    if v_tgl < date '1990-01-01' or v_tgl > sigarda.hari_ini() then raise exception 'Tanggal lahir % tidak boleh sebelum tahun 1990 atau di masa depan.', v_user; end if;
    insert into public.tanggal_lahir (peserta_id, tanggal, dicatat_oleh, dicatat_pada)
      select id, v_tgl, auth.uid(), now() from public.profiles where username = v_user and role = 'peserta' and status = 'aktif'
    on conflict (peserta_id) do update set tanggal = excluded.tanggal, dicatat_oleh = excluded.dicatat_oleh, dicatat_pada = excluded.dicatat_pada;
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end loop;
  return v_n;
end $$;
-- ===== akhir aksi tanggal lahir impor =====

revoke all on function public.sg_tanggal_lahir_impor(jsonb) from public, anon, authenticated;
grant execute on function public.sg_tanggal_lahir_impor(jsonb) to authenticated;

commit;
notify pgrst, 'reload schema';
