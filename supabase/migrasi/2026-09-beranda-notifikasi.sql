-- ============================================================================
-- MIGRASI: Fase 3 landing page -- notifikasi pengajuan Berita, Prestasi, dan Galeri di Kelola Beranda. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi 2026-09-beranda-konten.sql (bila belum, berhenti dengan pesan yang menuntun). Isi:
--   * Jenis notifikasi baru 'beranda' (kendala notifikasi_jenis_check diperbarui).
--   * Fungsi baru sigarda.notif_beranda_konten() dan pemicu pada beranda_berita, beranda_prestasi, beranda_galeri (INSERT dan UPDATE OF status):
--     pengajuan baru atau diajukan ulang (status menjadi 'menunggu') memberi tahu semua Pembina dan Admin Gudep aktif; pengajuan yang ditinjau
--     (menjadi 'terbit' atau 'ditolak') memberi tahu penulisnya. Isi singkat, tanpa alasan penolakan (dilihat di aplikasi).
-- TIDAK menghapus data dan TIDAK mengubah tabel/fungsi lain. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.beranda_berita') is null or to_regprocedure('public.sg_berita_tinjau(bigint, text, text)') is null then
    raise exception 'Jalankan lebih dulu migrasi 2026-09-beranda-konten.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

alter table public.notifikasi drop constraint if exists notifikasi_jenis_check;
alter table public.notifikasi add constraint notifikasi_jenis_check
  check (jenis in ('ajukan','alih','mulai','hasil','pengingat','lama','sesi','surat','tes','eskalasi','agenda','musyawarah','kegiatan','pra_uji','tkk','beranda'));

-- ===== Kelola Beranda: notifikasi pengajuan (Fase 3) =====
-- Berita, Prestasi, dan Galeri berbagi satu fungsi (tabel dibedakan lewat TG_TABLE_NAME, kolomnya sama): pengajuan baru atau diajukan ulang
-- (status menjadi 'menunggu') memberi tahu semua Pembina dan Admin Gudep aktif (kecuali pelakunya sendiri, bila kebetulan pengurus); pengajuan
-- yang ditinjau (dari 'menunggu' menjadi 'terbit' atau 'ditolak') memberi tahu penulisnya. Isi tanpa hasil (hanya "diterbitkan"/"ditolak";
-- alasan penolakan dilihat di aplikasi), sama seperti kaidah notifikasi lain.
create or replace function sigarda.notif_beranda_konten() returns trigger language plpgsql security definer set search_path = public as
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
drop trigger if exists notif_berita_status on public.beranda_berita;
create trigger notif_berita_status after insert or update of status on public.beranda_berita for each row execute function sigarda.notif_beranda_konten();
drop trigger if exists notif_prestasi_status on public.beranda_prestasi;
create trigger notif_prestasi_status after insert or update of status on public.beranda_prestasi for each row execute function sigarda.notif_beranda_konten();
drop trigger if exists notif_galeri_status on public.beranda_galeri;
create trigger notif_galeri_status after insert or update of status on public.beranda_galeri for each row execute function sigarda.notif_beranda_konten();
-- ===== akhir notifikasi beranda konten =====

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
