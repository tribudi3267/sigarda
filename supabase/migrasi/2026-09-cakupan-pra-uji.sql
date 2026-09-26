-- ============================================================================
-- MIGRASI: Tahap 2 (G4e) -- cakupan pra-uji (hasil simulasi pra-uji). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-pengingat-kalender.sql; lihat README). Isi:
--   * Fungsi baru sg_pra_uji_cakupan (Pembina dan Admin Gudep): banyaknya pengajuan baru yang melewati pra-uji dibanding yang langsung ke antrian Pembina karena tidak ada
--     penilai, per rombel, beserta jumlah Bina Damping rombel itu. Hanya membaca.
-- TIDAK mengubah tabel maupun data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.sku_pra_uji') is null or to_regprocedure('sigarda.garuda_kalender_pengingat()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-pengingat-kalender.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Cakupan pra-uji (Tahap 2, G4e): aksi =====
-- Seberapa banyak pengajuan baru yang benar-benar melewati pra-uji (punya penilai Pinsa atau Bina Damping) dibanding yang langsung ke antrian rombel Pembina karena tidak ada penilai
-- (hasil simulasi 2 Okt 2026: cakupan sangat bergantung pada banyaknya Bina Damping yang memenuhi syarat). Dihitung dari riwayat pengajuan (teks yang ditulis
-- sigarda.pra_uji_teruskan saat pengajuan awal), per rombel Penegak, untuk p_hari hari terakhir, beserta jumlah Bina Damping rombel itu pada tahun ajaran berjalan. Pembina dan Admin.
create or replace function public.sg_pra_uji_cakupan(p_hari integer default 30) returns jsonb language plpgsql stable security definer set search_path = public as
$$
declare v_dari timestamptz; v_ta text := sigarda.tahun_ajaran_kini();
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat melihat cakupan pra-uji.'; end if;
  if p_hari is null or p_hari not between 1 and 365 then raise exception 'Jumlah hari harus 1 sampai 365.'; end if;
  v_dari := now() - make_interval(days => p_hari);
  return jsonb_build_object('aktif', sigarda.pra_uji_aktif(), 'hari', p_hari, 'perRombel', coalesce((
    select jsonb_agg(jsonb_build_object('rombel', x.kelas, 'lewat', x.lewat, 'langsung', x.langsung, 'binaDamping', coalesce(bd.n, 0)) order by x.langsung desc, x.kelas)
    from (
      select p.kelas, count(*) filter (where h.teks like '%; menunggu pra-uji %')::int as lewat, count(*) filter (where h.teks like '%(antrian rombel, tanpa pra-uji)')::int as langsung
      from public.sku_riwayat h join public.profiles p on p.id = h.peserta_id
      where h.waktu >= v_dari and h.teks like 'Mengajukan pengujian untuk %' and (h.teks like '%; menunggu pra-uji %' or h.teks like '%(antrian rombel, tanpa pra-uji)')
      group by p.kelas
    ) x left join (select rombel, count(*)::int as n from public.bina_damping where tahun_ajaran = v_ta group by rombel) bd on bd.rombel = x.kelas
  ), '[]'::jsonb));
end $$;
-- ===== akhir aksi cakupan pra-uji =====

revoke all on function public.sg_pra_uji_cakupan(integer) from public, anon, authenticated;
grant execute on function public.sg_pra_uji_cakupan(integer) to authenticated;

commit;
notify pgrst, 'reload schema';
