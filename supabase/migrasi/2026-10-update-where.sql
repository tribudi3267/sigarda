-- ============================================================================
-- MIGRASI: perbaikan "UPDATE requires a WHERE clause" saat menerbitkan berita. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-bersih-riwayat-cron.sql; lihat README). Isi:
--   * Penyebab: Supabase memakai pengaman yang menolak UPDATE tanpa WHERE. Pemicu terbit ulang (sigarda.terbit_ulang_tandai) dan fungsi pendampingnya
--     mengubah tabel konfigurasi satu-baris tanpa WHERE, sehingga menerbitkan/mengubah berita gagal dan berita tidak tampil di beranda.
--   * Semua UPDATE pada terbit_ulang_konfigurasi dan keepalive_konfigurasi diberi "where true" (fungsi ditulis ulang, tanda tangan sama).
-- TIDAK mengubah tabel maupun data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regprocedure('sigarda.terbit_ulang_tandai()') is null or to_regprocedure('sigarda.keepalive_ping()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-bersih-riwayat-cron.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Terbit ulang situs saat berita terbit: fungsi =====
-- Pemilik proyek menjalankan SEKALI di SQL Editor: select sigarda.terbit_ulang_atur('pemilik/repositori', '<kunci akses GitHub>');
-- Menyimpan repositori dan kunci lalu menjadwalkan satu pekerjaan pg_cron (tiap 5 menit): ia hanya mengirim permintaan bila ada berita terbit yang berubah atau yang
-- jadwalnya baru tiba, jadi tanpa perubahan tidak ada deploy sama sekali.
create or replace function sigarda.terbit_ulang_atur(p_repo text, p_token text, p_alur text default 'deploy.yml', p_cabang text default 'main') returns text
language plpgsql security definer set search_path = public as
$$
declare v_repo text := btrim(coalesce(p_repo, '')); v_token text := btrim(coalesce(p_token, '')); v_alur text := btrim(coalesce(p_alur, '')); v_cabang text := btrim(coalesce(p_cabang, '')); v_catatan text := '';
begin
  if auth.uid() is not null then raise exception 'Pengaturan terbit ulang hanya dari SQL Editor Supabase.'; end if;
  if v_repo !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' then raise exception 'Repositori harus berbentuk pemilik/nama, mis. tribudi3267/sigarda.'; end if;
  if char_length(v_token) not between 20 and 400 then raise exception 'Kunci akses GitHub tampak tidak sah (fine-grained token dengan izin Actions: Read and write pada repositori ini).'; end if;
  if v_alur !~ '^[A-Za-z0-9_.-]+\.ya?ml$' then raise exception 'Nama berkas alur harus berakhiran .yml atau .yaml, mis. deploy.yml.'; end if;
  if v_cabang !~ '^[A-Za-z0-9_./-]{1,100}$' then raise exception 'Nama cabang tidak sah.'; end if;
  insert into public.terbit_ulang_konfigurasi (id, repo, alur, cabang, token) values (true, v_repo, v_alur, v_cabang, v_token)
  on conflict (id) do update set repo = excluded.repo, alur = excluded.alur, cabang = excluded.cabang, token = excluded.token, diubah = now(),
    perlu = false, perlu_sejak = null, kirim_id = null, status_terakhir = null, pesan_terakhir = null, gagal_beruntun = 0;
  if to_regnamespace('cron') is null then
    v_catatan := v_catatan || ' pg_cron belum aktif: aktifkan di Dashboard > Integrations lalu jalankan perintah ini lagi (jadwal pemeriksaan belum dibuat).';
  else
    perform cron.schedule('sigarda-terbit-ulang', '*/5 * * * *', 'select sigarda.terbit_ulang_periksa()');
  end if;
  if to_regnamespace('net') is null then
    v_catatan := v_catatan || ' pg_net belum aktif: aktifkan di Dashboard > Integrations lalu jalankan perintah ini lagi (permintaan belum dapat dikirim).';
  end if;
  return 'Terbit ulang tersimpan.' || case when v_catatan = '' then ' Untuk mencoba sekarang jalankan: select sigarda.terbit_ulang_kirim(); lalu beberapa detik kemudian: select sigarda.terbit_ulang_keadaan();' else v_catatan end;
end $$;

-- Meminta GitHub menjalankan alur deploy (POST .../actions/workflows/<alur>/dispatches, jawaban sukses = HTTP 204), asinkron lewat pg_net. Mengembalikan id permintaan,
-- atau null tanpa konfigurasi atau tanpa pg_net. Galat tidak dilempar: dicatat, dan perubahan tetap ditandai "perlu" agar dicoba lagi.
create or replace function sigarda.terbit_ulang_kirim_sekarang() returns bigint language plpgsql security definer set search_path = public as
$$
declare v public.terbit_ulang_konfigurasi; v_id bigint;
begin
  select * into v from public.terbit_ulang_konfigurasi;
  if not found or to_regnamespace('net') is null then return null; end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4)'
      into v_id
      using 'https://api.github.com/repos/' || v.repo || '/actions/workflows/' || v.alur || '/dispatches', jsonb_build_object('ref', v.cabang),
            jsonb_build_object('Accept', 'application/vnd.github+json', 'Authorization', 'Bearer ' || v.token, 'X-GitHub-Api-Version', '2022-11-28',
              'User-Agent', 'sigarda-terbit-ulang', 'Content-Type', 'application/json'), 10000;
  exception when others then
    update public.terbit_ulang_konfigurasi set kirim_terakhir = now(), kirim_id = null, status_terakhir = 0, pesan_terakhir = 'Gagal mengantre permintaan ke GitHub.',
      perlu = true, perlu_sejak = coalesce(perlu_sejak, now()), gagal_beruntun = gagal_beruntun + 1 where true;
    return null;
  end;
  update public.terbit_ulang_konfigurasi set kirim_terakhir = now(), kirim_id = v_id, status_terakhir = null, pesan_terakhir = 'Menunggu jawaban GitHub', perlu = false, perlu_sejak = null where true;
  return v_id;
end $$;

-- Mencatat jawaban GitHub atas permintaan terakhir dari net._http_response. Sukses (204) menutup permintaan; selain itu perubahan ditandai "perlu" lagi dan pesannya menuntun.
create or replace function sigarda.terbit_ulang_catat() returns void language plpgsql security definer set search_path = public as
$$
declare v public.terbit_ulang_konfigurasi; v_n int; v_status int; v_galat text;
begin
  select * into v from public.terbit_ulang_konfigurasi;
  if not found or v.kirim_id is null or to_regnamespace('net') is null then return; end if;
  begin
    execute 'select count(*)::int, max(status_code), max(error_msg) from net._http_response where id = $1' into v_n, v_status, v_galat using v.kirim_id;
  exception when others then
    return;
  end;
  if v_n = 0 then return; end if;
  if v_status = 204 then
    update public.terbit_ulang_konfigurasi set status_terakhir = 204, kirim_id = null, gagal_beruntun = 0,
      pesan_terakhir = 'Deploy diminta ke GitHub (HTTP 204); halaman berita siap sekitar 2 sampai 3 menit lagi.' where true;
  else
    update public.terbit_ulang_konfigurasi set status_terakhir = coalesce(v_status, 0), kirim_id = null, perlu = true, perlu_sejak = coalesce(perlu_sejak, now()), gagal_beruntun = gagal_beruntun + 1,
      pesan_terakhir = coalesce(v_galat, 'HTTP ' || v_status || (case
        when v_status = 401 then ': kunci akses GitHub salah atau sudah kedaluwarsa (buat kunci baru lalu jalankan sigarda.terbit_ulang_atur lagi)'
        when v_status = 403 then ': kunci tidak punya izin Actions (Read and write) pada repositori ini'
        when v_status = 404 then ': repositori, berkas alur, atau akses kunci tidak cocok'
        when v_status = 422 then ': cabang atau berkas alur tidak ditemukan, atau alur belum mengizinkan dijalankan manual (workflow_dispatch)'
        else '' end)) where true;
  end if;
end $$;

-- Dipanggil pg_cron tiap 5 menit: mencatat jawaban terakhir, lalu meminta terbit ulang HANYA bila ada berita terbit yang berubah (penanda "perlu" dari pemicu) atau
-- yang jadwal terbitnya tiba sejak permintaan terakhir. Berhenti mencoba sesudah 3 kegagalan beruntun; jeda minimal 4 menit antar permintaan.
create or replace function sigarda.terbit_ulang_periksa() returns bigint language plpgsql security definer set search_path = public as
$$
declare v public.terbit_ulang_konfigurasi; v_jadwal boolean;
begin
  perform sigarda.terbit_ulang_catat();
  select * into v from public.terbit_ulang_konfigurasi;
  if not found or v.gagal_beruntun >= 3 then return null; end if;
  if v.kirim_terakhir is not null and v.kirim_terakhir > now() - interval '4 minutes' then return null; end if;
  v_jadwal := exists (select 1 from public.beranda_berita where status = 'terbit' and terbit_pada <= now() and terbit_pada > coalesce(v.kirim_terakhir, '-infinity'::timestamptz));
  if not (v.perlu or v_jadwal) then return null; end if;
  return sigarda.terbit_ulang_kirim_sekarang();
end $$;

-- Keadaan terbit ulang TANPA kunci dan repositori (untuk layar Kelola Beranda dan untuk pemilik di SQL Editor): { diatur, perlu, kirimTerakhir, status, pesan, gagalBeruntun, menyerah }.
create or replace function sigarda.terbit_ulang_keadaan() returns jsonb language plpgsql security definer set search_path = public as
$$
declare v public.terbit_ulang_konfigurasi;
begin
  select * into v from public.terbit_ulang_konfigurasi;
  if not found then return jsonb_build_object('diatur', false); end if;
  return jsonb_build_object('diatur', true, 'perlu', v.perlu, 'kirimTerakhir', v.kirim_terakhir, 'status', v.status_terakhir, 'pesan', v.pesan_terakhir,
    'gagalBeruntun', v.gagal_beruntun, 'menyerah', v.gagal_beruntun >= 3);
end $$;

-- Untuk pemilik di SQL Editor: mengirim permintaan terbit ulang sekarang (untuk mencoba pengaturan) dan menghapus hitungan gagal.
create or replace function sigarda.terbit_ulang_kirim() returns text language plpgsql security definer set search_path = public as
$$
begin
  if auth.uid() is not null then raise exception 'Perintah ini hanya dari SQL Editor Supabase.'; end if;
  if not exists (select 1 from public.terbit_ulang_konfigurasi) then raise exception 'Belum diatur: jalankan sigarda.terbit_ulang_atur lebih dulu.'; end if;
  if to_regnamespace('net') is null then raise exception 'pg_net belum aktif (Dashboard > Integrations).'; end if;
  update public.terbit_ulang_konfigurasi set gagal_beruntun = 0 where true;
  perform sigarda.terbit_ulang_kirim_sekarang();
  return 'Permintaan terbit ulang dikirim. Beberapa detik lagi jalankan: select sigarda.terbit_ulang_periksa(); select sigarda.terbit_ulang_keadaan();';
end $$;

-- Mematikan terbit ulang otomatis: menghapus pekerjaan pg_cron dan konfigurasi (termasuk kunci akses).
create or replace function sigarda.terbit_ulang_matikan() returns void language plpgsql security definer set search_path = public as
$$
begin
  if auth.uid() is not null then raise exception 'Perintah ini hanya dari SQL Editor Supabase.'; end if;
  if to_regnamespace('cron') is not null then
    begin
      perform cron.unschedule('sigarda-terbit-ulang');
    exception when others then null; end;
  end if;
  delete from public.terbit_ulang_konfigurasi;
end $$;

-- Pemicu: setiap perubahan yang menyentuh berita TERBIT (diterbitkan, diubah, dibatalkan/ditolak dari terbit, atau dihapus) menandai bahwa halaman berita perlu terbit ulang
-- (pekerjaan pg_cron yang mengirim permintaannya, sehingga banyak perubahan dalam 5 menit menjadi satu deploy). Tanpa konfigurasi tidak melakukan apa pun.
create or replace function sigarda.terbit_ulang_tandai() returns trigger language plpgsql security definer set search_path = public as
$$
begin
  if (TG_OP = 'INSERT' and NEW.status = 'terbit') or (TG_OP = 'DELETE' and OLD.status = 'terbit') or (TG_OP = 'UPDATE' and (OLD.status = 'terbit' or NEW.status = 'terbit')) then
    update public.terbit_ulang_konfigurasi set perlu = true, perlu_sejak = coalesce(perlu_sejak, now()), gagal_beruntun = 0 where true;
  end if;
  return null;
end $$;

-- Untuk Pembina dan Admin Gudep (layar Kelola Beranda > Berita): keadaan terbit ulang terbaru (jawaban GitHub dicatat dulu).
create or replace function public.sg_terbit_ulang_status() returns jsonb language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat melihat keadaan terbit ulang halaman berita.'; end if;
  perform sigarda.terbit_ulang_catat();
  return sigarda.terbit_ulang_keadaan();
end $$;

-- Tombol "Terbitkan ulang halaman berita sekarang" (Pembina dan Admin Gudep): meminta deploy segera, paling cepat tiap 2 menit; menghapus hitungan gagal (mencoba lagi).
create or replace function public.sg_terbit_ulang_minta() returns jsonb language plpgsql security definer set search_path = public as
$$
declare v_terakhir timestamptz;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat meminta terbit ulang halaman berita.'; end if;
  if not exists (select 1 from public.terbit_ulang_konfigurasi) then raise exception 'Terbit ulang otomatis belum diatur oleh pemilik proyek (lihat README, bagian Halaman berita untuk mesin pencari).'; end if;
  perform sigarda.terbit_ulang_catat();
  select kirim_terakhir into v_terakhir from public.terbit_ulang_konfigurasi;
  if v_terakhir is not null and v_terakhir > now() - interval '2 minutes' then raise exception 'Permintaan baru saja dikirim. Tunggu beberapa menit sebelum meminta lagi.'; end if;
  update public.terbit_ulang_konfigurasi set gagal_beruntun = 0 where true;
  perform sigarda.terbit_ulang_kirim_sekarang();
  return sigarda.terbit_ulang_keadaan();
end $$;

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
    update public.keepalive_konfigurasi set ping_terakhir = now(), ping_id = null, status_terakhir = 0, pesan_terakhir = 'Gagal mengantre permintaan: ' || sqlerrm where true;
    return null;
  end;
  update public.keepalive_konfigurasi set ping_terakhir = now(), ping_id = v_id, status_terakhir = null, pesan_terakhir = 'Menunggu jawaban' where true;
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
    update public.keepalive_konfigurasi set pesan_terakhir = 'Jawaban belum atau tidak lagi tercatat di pg_net.' where true;
  elsif v_status between 200 and 299 then
    update public.keepalive_konfigurasi set status_terakhir = v_status, pesan_terakhir = 'Database menjawab (HTTP ' || v_status || ').' where true;
  else
    update public.keepalive_konfigurasi set status_terakhir = coalesce(v_status, 0),
      pesan_terakhir = coalesce(v_galat, 'HTTP ' || v_status || (case when v_status in (401, 403) then ': kunci anon salah atau dicabut' when v_status = 404 then ': alamat proyek salah atau fungsi sg_gudep_publik tidak ada' else '' end)) where true;
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

-- Fungsi sigarda.* diperbarui: hak dijalankan ulang di sini.
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
