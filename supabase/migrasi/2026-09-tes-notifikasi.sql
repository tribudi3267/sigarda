-- ============================================================================
-- MIGRASI: Notifikasi uji (tahap L0). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi dewan-penegak (dan yang sebelumnya). Isi:
--   * notifikasi.jenis menerima nilai 'tes'.
--   * sg_notifikasi_tes: tombol "Kirim notifikasi uji" di halaman Notifikasi membuat satu notifikasi jenis 'tes' untuk pemanggil sendiri, sehingga jalur
--     pemicu -> pg_net -> Edge Function notif-push -> HP dapat diuji tanpa menunggu kejadian nyata. Dibatasi 5 kali per 10 menit.
--   Edge Function TIDAK berubah dan tidak perlu di-deploy ulang.
-- TIDAK menghapus data yang ada. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: tabel notifikasi (migrasi notifikasi) dan penghitung Dewan-Penegak (migrasi terakhir sebelum ini) sudah ada.
do $$
begin
  if to_regclass('public.notifikasi') is null or to_regclass('public.push_langganan') is null or to_regclass('public.push_konfigurasi') is null
     or to_regprocedure('public.sg_kepengurusan_terapkan(jsonb, boolean, boolean)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-dewan-penegak.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

alter table public.notifikasi drop constraint if exists notifikasi_jenis_check;
alter table public.notifikasi add constraint notifikasi_jenis_check
  check (jenis in ('ajukan','alih','mulai','hasil','pengingat','lama','sesi','surat','tes'));

-- ===== Notifikasi uji: fungsi =====
-- Tombol "Kirim notifikasi uji" di halaman Notifikasi (semua peran): membuat satu notifikasi jenis 'tes' untuk pemanggil sendiri. Pemicu yang sama dengan
-- notifikasi sungguhan (notifikasi_push -> pg_net -> Edge Function notif-push) mengirimnya ke perangkat yang berlangganan, sehingga seluruh jalur dapat diuji
-- tanpa menunggu kejadian nyata. Dibatasi 5 kali per 10 menit. Hasil { id, perangkat (jumlah perangkat berlangganan), terkonfigurasi (push_atur sudah dijalankan),
-- pg_net (ekstensi terpasang) } agar klien dapat menjelaskan bila tidak ada yang terkirim; push_status pada baris notifikasi terisi kemudian oleh Edge Function.
create or replace function public.sg_notifikasi_tes() returns jsonb
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_id bigint;
begin
  perform sigarda.wajib_aktif();
  if (select count(*) from public.notifikasi where penerima_id = v_uid and jenis = 'tes' and dibuat > now() - interval '10 minutes') >= 5 then
    raise exception 'Terlalu sering. Tunggu beberapa menit sebelum mengirim notifikasi uji lagi.';
  end if;
  insert into public.notifikasi (penerima_id, jenis, judul, isi, tautan)
  values (v_uid, 'tes', 'Notifikasi uji', 'Bila Anda membaca ini, notifikasi SIGARDA berfungsi di perangkat ini.', '{"tab":"notifikasi"}'::jsonb)
  returning id into v_id;
  return jsonb_build_object('id', v_id,
    'perangkat', (select count(*) from public.push_langganan where penerima_id = v_uid),
    'terkonfigurasi', exists (select 1 from public.push_konfigurasi),
    'pg_net', to_regnamespace('net') is not null);
end $$;
-- ===== akhir fungsi notifikasi uji =====

revoke all on function public.sg_notifikasi_tes() from public, anon, authenticated;
grant execute on function public.sg_notifikasi_tes() to authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
