-- ============================================================================
-- MIGRASI: Keep-alive Supabase dari dalam database. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi indeks-fk (dan yang sebelumnya). Isi:
--   * Tabel public.keepalive_konfigurasi (satu baris; RLS aktif TANPA kebijakan, hanya diisi lewat SQL Editor).
--   * sigarda.keepalive_atur(url, kunci): dijalankan pemilik SEKALI di SQL Editor; menyimpan alamat proyek dan kunci anon/publishable,
--     menjadwalkan dua pekerjaan pg_cron (ping tiap hari 01.30 UTC = 08.30 WIB, pencatatan hasil 01.35 UTC), lalu mengirim ping pertama.
--   * sigarda.keepalive_ping(): meminta pg_net mengirim SATU permintaan HTTP ke API proyek sendiri (fungsi publik sg_gudep_publik), sehingga
--     tercatat sebagai lalu lintas API. sigarda.keepalive_catat() mencatat jawabannya; sigarda.keepalive_periksa() menampilkan keadaan;
--     sigarda.keepalive_matikan() menghapus jadwal dan konfigurasi.
-- Mencegah proyek Free tier dijeda karena 7 hari tanpa aktivitas, tanpa bergantung pada GitHub (yang menonaktifkan jadwal repositori publik
-- setelah 60 hari tanpa aktivitas). Hanya berjalan selama proyek aktif: proyek yang sudah terjeda perlu dipulihkan dulu di Dashboard.
-- Butuh ekstensi pg_cron dan pg_net (Dashboard > Integrations); bila belum aktif, keepalive_atur menyimpan pengaturan dan menyebut yang kurang.
-- Kode aplikasi dan Edge Function TIDAK berubah. TIDAK menghapus data yang ada. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run. Lalu SATU perintah lagi (lihat README, bagian Keep-alive Supabase):
--   select sigarda.keepalive_atur('https://<ref>.supabase.co', '<kunci anon atau publishable>');
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: migrasi sebelumnya sudah ada (fungsi publik yang dipanggil ping, dan skema sigarda).
do $$
begin
  if to_regprocedure('public.sg_gudep_publik()') is null or to_regclass('public.push_konfigurasi') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-indeks-fk.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Keep-alive Supabase (dari dalam database): tabel =====
-- Proyek Free tier dijeda setelah 7 hari tanpa aktivitas. pg_cron memanggil sigarda.keepalive_ping() tiap hari; fungsi itu meminta pg_net mengirim SATU
-- permintaan HTTP ke API proyek sendiri (fungsi publik sg_gudep_publik), sehingga tercatat sebagai lalu lintas API sungguhan. Satu baris; diisi pemilik
-- proyek SEKALI lewat sigarda.keepalive_atur di SQL Editor (kunci anon/publishable memang publik; JANGAN isi service_role). Tanpa kebijakan RLS.
create table if not exists public.keepalive_konfigurasi (
  id boolean primary key default true check (id),
  url text not null check (url ~ '^https://[a-z0-9.-]+\.[a-z]{2,}$'),
  kunci text not null check (char_length(kunci) between 20 and 500),
  diubah timestamptz not null default now(),
  ping_terakhir timestamptz,
  ping_id bigint,
  status_terakhir int,
  pesan_terakhir text
);
-- ===== akhir tabel keepalive =====
-- ===== Keep-alive Supabase (dari dalam database): fungsi =====
-- Pemilik proyek menjalankan SEKALI di SQL Editor: select sigarda.keepalive_atur('https://<ref>.supabase.co', '<kunci anon atau publishable>');
-- Menyimpan alamat dan kunci, menjadwalkan dua pekerjaan pg_cron (ping 01.30 UTC = 08.30 WIB, pencatatan hasil 01.35 UTC), lalu langsung mengirim ping pertama.
create or replace function sigarda.keepalive_atur(p_url text, p_kunci text) returns text language plpgsql security definer set search_path = public as
$$
declare v_url text := regexp_replace(btrim(coalesce(p_url, '')), '/+$', ''); v_kunci text := btrim(coalesce(p_kunci, '')); v_catatan text := '';
begin
  if auth.uid() is not null then raise exception 'Pengaturan keep-alive hanya dari SQL Editor Supabase.'; end if;
  if v_url !~ '^https://[a-z0-9.-]+\.[a-z]{2,}$' then raise exception 'Alamat proyek harus berbentuk https://<ref>.supabase.co (tanpa garis miring dan tanpa /rest/v1).'; end if;
  if char_length(v_kunci) not between 20 and 500 then raise exception 'Kunci anon/publishable tampak tidak sah (Project Settings > API Keys). Jangan isi kunci service_role.'; end if;
  insert into public.keepalive_konfigurasi (id, url, kunci) values (true, v_url, v_kunci)
  on conflict (id) do update set url = excluded.url, kunci = excluded.kunci, diubah = now(), ping_id = null, status_terakhir = null, pesan_terakhir = null;
  if to_regnamespace('cron') is null then
    v_catatan := v_catatan || ' pg_cron belum aktif: aktifkan di Dashboard > Integrations lalu jalankan perintah ini lagi (jadwal harian belum dibuat).';
  else
    perform cron.schedule('sigarda-keepalive', '30 1 * * *', 'select sigarda.keepalive_ping()');
    perform cron.schedule('sigarda-keepalive-catat', '35 1 * * *', 'select sigarda.keepalive_catat()');
  end if;
  if to_regnamespace('net') is null then
    v_catatan := v_catatan || ' pg_net belum aktif: aktifkan di Dashboard > Integrations lalu jalankan perintah ini lagi (permintaan belum dapat dikirim).';
  else
    perform sigarda.keepalive_ping();
  end if;
  return 'Keep-alive tersimpan.' || case when v_catatan = '' then ' Ping pertama dikirim; beberapa detik lagi jalankan: select sigarda.keepalive_periksa();' else v_catatan end;
end $$;

-- Satu ping: permintaan HTTP ke API proyek sendiri lewat pg_net (asinkron). Tanpa konfigurasi atau tanpa pg_net tidak melakukan apa pun. Galat tidak dilempar.
create or replace function sigarda.keepalive_ping() returns bigint language plpgsql security definer set search_path = public as
$$
declare v_k public.keepalive_konfigurasi; v_id bigint;
begin
  select * into v_k from public.keepalive_konfigurasi;
  if not found or to_regnamespace('net') is null then return null; end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4)'
      into v_id
      using v_k.url || '/rest/v1/rpc/sg_gudep_publik', '{}'::jsonb,
            jsonb_build_object('Content-Type', 'application/json', 'apikey', v_k.kunci, 'Authorization', 'Bearer ' || v_k.kunci), 10000;
  exception when others then
    update public.keepalive_konfigurasi set ping_terakhir = now(), ping_id = null, status_terakhir = 0, pesan_terakhir = 'Gagal mengantre permintaan: ' || sqlerrm;
    return null;
  end;
  update public.keepalive_konfigurasi set ping_terakhir = now(), ping_id = v_id, status_terakhir = null, pesan_terakhir = 'Menunggu jawaban';
  return v_id;
end $$;

-- Mencatat jawaban ping terakhir dari net._http_response (pg_net hanya menyimpannya beberapa jam, maka dicatat 5 menit sesudah ping).
create or replace function sigarda.keepalive_catat() returns void language plpgsql security definer set search_path = public as
$$
declare v_k public.keepalive_konfigurasi; v_n int; v_status int; v_galat text;
begin
  select * into v_k from public.keepalive_konfigurasi;
  if not found or v_k.ping_id is null or to_regnamespace('net') is null then return; end if;
  begin
    execute 'select count(*)::int, max(status_code), max(error_msg) from net._http_response where id = $1' into v_n, v_status, v_galat using v_k.ping_id;
  exception when others then
    return;
  end;
  if v_n = 0 then
    update public.keepalive_konfigurasi set pesan_terakhir = 'Jawaban belum atau tidak lagi tercatat di pg_net.';
  elsif v_status between 200 and 299 then
    update public.keepalive_konfigurasi set status_terakhir = v_status, pesan_terakhir = 'Database menjawab (HTTP ' || v_status || ').';
  else
    update public.keepalive_konfigurasi set status_terakhir = coalesce(v_status, 0),
      pesan_terakhir = coalesce(v_galat, 'HTTP ' || v_status || (case when v_status in (401, 403) then ': kunci anon salah atau dicabut' when v_status = 404 then ': alamat proyek salah atau fungsi sg_gudep_publik tidak ada' else '' end));
  end if;
end $$;

-- Untuk pemilik di SQL Editor: mencatat jawaban terbaru lalu menampilkan keadaan (terkonfigurasi, ping terakhir, hasilnya, dan jadwal pg_cron aktif).
create or replace function sigarda.keepalive_periksa() returns jsonb language plpgsql security definer set search_path = public as
$$
declare v_k public.keepalive_konfigurasi; v_jadwal int := 0; v_ada boolean;
begin
  perform sigarda.keepalive_catat();
  select * into v_k from public.keepalive_konfigurasi;
  v_ada := found;
  if to_regnamespace('cron') is not null then
    begin
      execute 'select count(*)::int from cron.job where jobname in ($1, $2) and active' into v_jadwal using 'sigarda-keepalive', 'sigarda-keepalive-catat';
    exception when others then v_jadwal := 0; end;
  end if;
  return jsonb_build_object(
    'terkonfigurasi', v_ada, 'alamat', v_k.url, 'ping_terakhir', v_k.ping_terakhir, 'status', v_k.status_terakhir, 'pesan', v_k.pesan_terakhir,
    'pekerjaan_cron_aktif', v_jadwal, 'sehat', coalesce(v_k.status_terakhir between 200 and 299, false) and v_jadwal = 2
  );
end $$;

-- Mematikan keep-alive: menghapus dua pekerjaan pg_cron dan konfigurasinya (mis. saat pindah ke paket berbayar).
create or replace function sigarda.keepalive_matikan() returns void language plpgsql security definer set search_path = public as
$$
begin
  if auth.uid() is not null then raise exception 'Pengaturan keep-alive hanya dari SQL Editor Supabase.'; end if;
  if to_regnamespace('cron') is not null then
    begin
      perform cron.unschedule('sigarda-keepalive');
    exception when others then null; end;
    begin
      perform cron.unschedule('sigarda-keepalive-catat');
    exception when others then null; end;
  end if;
  delete from public.keepalive_konfigurasi;
end $$;
-- ===== akhir fungsi keepalive =====

revoke all on public.keepalive_konfigurasi from anon, authenticated;
alter table public.keepalive_konfigurasi enable row level security;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
