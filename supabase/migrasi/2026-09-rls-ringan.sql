-- ============================================================================
-- MIGRASI: percepat aturan baca (RLS). AMAN untuk database yang sudah berisi data.
--
-- Hanya mengganti 11 kebijakan baca (drop lalu buat ulang). TIDAK menyentuh tabel, data, akun, atau fungsi.
-- Jangan menjalankan supabase/skema.sql untuk ini: berkas itu MENGHAPUS semua tabel lalu membuatnya ulang.
--
-- Isi kebijakan sama persis dengan sebelumnya; bedanya fungsi peran dibungkus (select ...) sehingga dihitung
-- sekali per kueri, bukan sekali per baris. Dampaknya terasa saat Dewan Ambalan, Pembina, atau Admin membaca
-- puluhan ribu baris (progres SKU, kehadiran).
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Aman dijalankan berulang kali.
-- ============================================================================
begin;

drop policy if exists baca_profil on public.profiles;
create policy baca_profil on public.profiles for select to authenticated
  using (id = (select auth.uid()) or role in ('penguji','admin') or (select sigarda.pengurus()));

drop policy if exists baca_katalog_butir on public.sku_butir;
create policy baca_katalog_butir on public.sku_butir for select to authenticated using ((select sigarda.aktif()));
drop policy if exists baca_katalog_unit on public.sku_unit;
create policy baca_katalog_unit on public.sku_unit for select to authenticated using ((select sigarda.aktif()));
drop policy if exists baca_katalog_pf on public.pf_item;
create policy baca_katalog_pf on public.pf_item for select to authenticated using ((select sigarda.aktif()));
drop policy if exists baca_materi on public.materi;
create policy baca_materi on public.materi for select to authenticated using ((select sigarda.aktif()));
drop policy if exists baca_sesi on public.absensi_sesi;
create policy baca_sesi on public.absensi_sesi for select to authenticated using ((select sigarda.aktif()));

drop policy if exists baca_progres on public.sku_progress;
create policy baca_progres on public.sku_progress for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
drop policy if exists baca_riwayat on public.sku_riwayat;
create policy baca_riwayat on public.sku_riwayat for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
drop policy if exists baca_absensi on public.absensi_hadir;
create policy baca_absensi on public.absensi_hadir for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
drop policy if exists baca_portofolio on public.portofolio;
create policy baca_portofolio on public.portofolio for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));
drop policy if exists baca_jurnal on public.portofolio_jurnal;
create policy baca_jurnal on public.portofolio_jurnal for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or (select sigarda.pengurus())));

commit;
