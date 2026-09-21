-- ============================================================================
-- MIGRASI: Notifikasi di aplikasi dan Web Push (PWA). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi jabatan-dewan (atau migrasi terakhir yang sudah Anda jalankan). Isi:
--   * Tabel notifikasi (Kotak Notifikasi, dibaca pemiliknya saja), push_langganan (perangkat Web Push; tanpa kebijakan baca), dan
--     push_konfigurasi (alamat fungsi notif-push, rahasia bersama, kunci publik VAPID; tanpa kebijakan baca).
--   * Pemicu yang membuat notifikasi: pengajuan uji (penguji tujuan atau seluruh penguji sah antrian rombel), pengalihan, pengujian dimulai dan hasil
--     tersedia (untuk Penegak; isi tanpa lulus/ulang), Penegak dimasukkan ke sesi ujian, surat pengantar agama terbit. Tidak mengubah fungsi yang ada.
--   * sigarda.notif_pengingat (H-1 pengujian dan sesi ujian, pengajuan menunggu lebih dari 3 hari, bersihkan notifikasi > 90 hari) yang dijadwalkan
--     pg_cron pukul 07.00 WIB; sigarda.push_antre (pemicu pengirim Web Push lewat pg_net); sigarda.push_atur (diisi pemilik lewat SQL Editor).
--   * Fungsi aksi: sg_notifikasi_tandai, sg_push_kunci, sg_push_simpan, sg_push_hapus, sg_push_ringkasan, serta sg_push_ambil_internal dan
--     sg_push_hasil_internal (khusus Edge Function notif-push).
--   Edge Function 'sigarda' TIDAK berubah dan tidak perlu di-deploy ulang. Web Push butuh Edge Function BARU 'notif-push' (lihat README).
--   Tanpa Edge Function dan konfigurasi push, Kotak Notifikasi di aplikasi tetap berjalan.
-- TIDAK menghapus data yang ada. Aman dijalankan berulang kali (mis. setelah mengaktifkan pg_net atau pg_cron).
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: skema dasar dan migrasi sebelumnya (penegakan, dokumen) sudah ada.
do $$
begin
  if to_regprocedure('sigarda.penguji_sah(uuid, text)') is null or to_regclass('public.dokumen_terbit') is null
     or to_regclass('public.sesi_ujian_peserta') is null or to_regprocedure('sigarda.pembina_atau_admin()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-dokumen.sql, lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Notifikasi: tabel =====
-- Kotak Notifikasi di aplikasi (semua peran) dan bahan Web Push. Baris dibuat HANYA oleh pemicu dan fungsi server (sigarda.notif_buat);
-- pemilik hanya membaca dan menandai dibaca (sg_notifikasi_tandai). Isi singkat dan tanpa hasil lulus/ulang. `kunci` mencegah notifikasi ganda
-- untuk peristiwa yang sama (pengingat, jadwal sesi). push_status diisi Edge Function notif-push.
create table if not exists public.notifikasi (
  id bigint generated always as identity primary key,
  penerima_id uuid not null references public.profiles(id) on delete cascade,
  jenis text not null check (jenis in ('ajukan','alih','mulai','hasil','pengingat','lama','sesi','surat')),
  judul text not null check (char_length(judul) between 1 and 120),
  isi text not null default '' check (char_length(isi) <= 300),
  tautan jsonb not null default '{}'::jsonb,                        -- { tab: 'antrian' | 'sku' | 'beranda' | 'cetak' }
  kunci text check (kunci is null or char_length(kunci) <= 160),
  dibuat timestamptz not null default now(),
  dibaca_pada timestamptz,
  push_status text check (push_status in ('dikirim','gagal'))
);
create index if not exists notifikasi_penerima_idx on public.notifikasi (penerima_id, id desc);
create unique index if not exists notifikasi_kunci_unik on public.notifikasi (penerima_id, kunci) where kunci is not null;
-- Perangkat yang berlangganan Web Push. endpoint unik: perangkat yang sama dialihkan ke akun yang MASUK terakhir; menekan Keluar menghapusnya.
-- Tanpa kebijakan baca: hanya fungsi server (kunci langganan tidak boleh bocor ke klien lain).
create table if not exists public.push_langganan (
  id bigint generated always as identity primary key,
  penerima_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 20 and 1000),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  agen text not null default '' check (char_length(agen) <= 200),
  dibuat timestamptz not null default now(),
  diperbarui timestamptz not null default now()
);
create index if not exists push_langganan_penerima_idx on public.push_langganan (penerima_id);
-- Satu baris: alamat fungsi notif-push, rahasia bersama, dan kunci publik VAPID. Diisi pemilik proyek lewat sigarda.push_atur di SQL Editor; tanpa kebijakan.
create table if not exists public.push_konfigurasi (
  id boolean primary key default true check (id),
  url text not null check (url ~ '^https://'),
  rahasia text not null check (char_length(rahasia) >= 16),
  kunci_publik text not null check (kunci_publik ~ '^[A-Za-z0-9_-]{60,120}$'),
  diubah timestamptz not null default now()
);
-- ===== akhir tabel notifikasi =====

-- ---- Notifikasi: fungsi bantu dan pemicu ----
-- Notifikasi dibuat oleh pemicu pada tabel (bukan di tiap fungsi aksi) agar semua jalur penulisan tercakup, termasuk Edge Function catat-hasil.
-- Isi singkat dan tanpa hasil lulus/ulang (layar kunci HP bisa dilihat orang lain). Penerima tidak pernah sama dengan pelaku yang bersangkutan.
create or replace function sigarda.notif_buat(p_penerima uuid, p_jenis text, p_judul text, p_isi text, p_tautan jsonb, p_kunci text default null) returns void
language plpgsql security definer set search_path = public as
$$
begin
  if p_penerima is null then return; end if;
  insert into public.notifikasi (penerima_id, jenis, judul, isi, tautan, kunci)
  values (p_penerima, p_jenis, left(p_judul, 120), left(coalesce(p_isi, ''), 300), coalesce(p_tautan, '{}'::jsonb), p_kunci)
  on conflict (penerima_id, kunci) where kunci is not null do nothing;
end $$;

-- "Bantara butir 5" untuk satu unit SKU.
create or replace function sigarda.notif_label_butir(p_sku text) returns text language sql stable security definer set search_path = public as
$$ select coalesce((select u.tingkat || ' butir ' || u.butir_no from public.sku_unit u where u.id = p_sku), p_sku) $$;

-- Penguji yang perlu tahu tentang satu pengajuan: penguji tujuan, atau (antrian rombel) semua penguji yang sah untuk Penegak dan butir itu.
create or replace function sigarda.notif_penerima_uji(p_peserta uuid, p_sku text, p_penguji uuid) returns setof uuid
language plpgsql stable security definer set search_path = public as
$$
begin
  if p_penguji is not null then return next p_penguji; return; end if;
  return query select s.o_penguji from sigarda.penguji_sah(p_peserta, p_sku) s;
end $$;

create or replace function sigarda.notif_sku_progress() returns trigger language plpgsql security definer set search_path = public as
$$
declare
  v_lama text; v_lama_penguji uuid; v_nama text; v_label text := sigarda.notif_label_butir(NEW.sku_id); v_x uuid;
begin
  if TG_OP = 'UPDATE' then v_lama := OLD.status; v_lama_penguji := OLD.penguji_id; end if;
  select nama into v_nama from public.profiles where id = NEW.peserta_id;
  if NEW.status = 'diajukan' and v_lama is distinct from 'diajukan' then
    for v_x in select * from sigarda.notif_penerima_uji(NEW.peserta_id, NEW.sku_id, NEW.penguji_id) loop
      perform sigarda.notif_buat(v_x, 'ajukan', 'Pengajuan uji baru',
        v_nama || ' mengajukan ' || v_label || ' untuk ' || to_char(NEW.jadwal, 'DD-MM-YYYY') || case when NEW.penguji_id is null then ' (antrian rombel)' else '' end,
        '{"tab":"antrian"}');
    end loop;
  elsif NEW.status in ('diajukan', 'proses') and NEW.status = v_lama and v_lama_penguji is distinct from NEW.penguji_id then   -- status sama, penguji berganti (mengambil dari antrian bersama = "mulai")
    for v_x in select * from sigarda.notif_penerima_uji(NEW.peserta_id, NEW.sku_id, NEW.penguji_id) loop
      perform sigarda.notif_buat(v_x, 'alih', case when NEW.penguji_id is null then 'Pengajuan masuk antrian rombel' else 'Pengujian dialihkan kepada Anda' end,
        v_nama || ', ' || v_label, '{"tab":"antrian"}');
    end loop;
  elsif NEW.status = 'proses' and v_lama is distinct from 'proses' then
    perform sigarda.notif_buat(NEW.peserta_id, 'mulai', 'Pengujian dimulai', 'Penguji mulai menguji ' || v_label || '.', '{"tab":"sku"}');
  elsif NEW.status in ('lulus', 'ulang') and v_lama is distinct from NEW.status then
    perform sigarda.notif_buat(NEW.peserta_id, 'hasil', 'Hasil penilaian tersedia', 'Hasil ' || v_label || ' sudah dicatat. Buka aplikasi untuk melihatnya.', '{"tab":"sku"}');
  end if;
  return null;
end $$;
drop trigger if exists notif_sku_progress on public.sku_progress;
create trigger notif_sku_progress after insert or update of status, penguji_id on public.sku_progress
  for each row execute function sigarda.notif_sku_progress();

-- Penegak yang dimasukkan ke sesi ujian bersama. Kunci memuat tanggal: menyimpan ulang sesi tidak menggandakan, mengganti tanggal memberi tahu lagi.
create or replace function sigarda.notif_sesi_peserta() returns trigger language plpgsql security definer set search_path = public as
$$
declare v_s public.sesi_ujian;
begin
  select * into v_s from public.sesi_ujian where id = NEW.sesi_id;
  if not found or v_s.status = 'selesai' then return null; end if;
  perform sigarda.notif_buat(NEW.peserta_id, 'sesi', 'Jadwal ujian bersama',
    v_s.nama || ', ' || to_char(v_s.tanggal, 'DD-MM-YYYY') || case when v_s.tempat <> '' then ' di ' || v_s.tempat else '' end,
    '{"tab":"beranda"}', 'sesi:' || v_s.id || ':' || v_s.tanggal);
  return null;
end $$;
drop trigger if exists notif_sesi_peserta on public.sesi_ujian_peserta;
create trigger notif_sesi_peserta after insert on public.sesi_ujian_peserta
  for each row execute function sigarda.notif_sesi_peserta();

create or replace function sigarda.notif_dokumen() returns trigger language plpgsql security definer set search_path = public as
$$
begin
  if NEW.jenis = 'surat_pengantar_agama' and NEW.peserta_id is not null then
    perform sigarda.notif_buat(NEW.peserta_id, 'surat', 'Surat pengantar guru agama terbit', 'Surat nomor ' || NEW.nomor || ' sudah diterbitkan. Cetak dan minta tanda tangan Pembina.', '{"tab":"cetak"}');
  end if;
  return null;
end $$;
drop trigger if exists notif_dokumen on public.dokumen_terbit;
create trigger notif_dokumen after insert on public.dokumen_terbit
  for each row execute function sigarda.notif_dokumen();

-- Pengingat harian (dijalankan pg_cron pukul 07.00 WIB): pengujian dan sesi ujian besok, pengajuan yang menunggu lebih dari 3 hari, dan
-- pembersihan notifikasi berumur lebih dari 90 hari. Kunci membuat tiap pengingat terkirim sekali walau dijalankan berulang.
create or replace function sigarda.notif_pengingat() returns void language plpgsql security definer set search_path = public as
$$
declare v_besok date := sigarda.hari_ini() + 1; r record; v_x uuid; v_label text;
begin
  for r in select sp.peserta_id, sp.sku_id, sp.penguji_id, sp.jadwal, p.nama from public.sku_progress sp join public.profiles p on p.id = sp.peserta_id
           where sp.status in ('diajukan', 'proses') and sp.jadwal = v_besok loop
    v_label := sigarda.notif_label_butir(r.sku_id);
    perform sigarda.notif_buat(r.peserta_id, 'pengingat', 'Pengujian besok', v_label || ' dijadwalkan besok.', '{"tab":"sku"}', 'h1:' || r.peserta_id || ':' || r.sku_id || ':' || r.jadwal);
    for v_x in select * from sigarda.notif_penerima_uji(r.peserta_id, r.sku_id, r.penguji_id) loop
      perform sigarda.notif_buat(v_x, 'pengingat', 'Pengujian besok', r.nama || ', ' || v_label, '{"tab":"antrian"}', 'h1:' || r.peserta_id || ':' || r.sku_id || ':' || r.jadwal);
    end loop;
  end loop;
  for r in select sp.peserta_id, sp.sku_id, sp.penguji_id, p.nama, sp.diubah from public.sku_progress sp join public.profiles p on p.id = sp.peserta_id
           where sp.status = 'diajukan' and sp.diubah < now() - interval '3 days' loop
    v_label := sigarda.notif_label_butir(r.sku_id);
    for v_x in select * from sigarda.notif_penerima_uji(r.peserta_id, r.sku_id, r.penguji_id) loop
      perform sigarda.notif_buat(v_x, 'lama', 'Pengajuan menunggu lebih dari 3 hari', r.nama || ', ' || v_label, '{"tab":"antrian"}',
        'lama:' || r.peserta_id || ':' || r.sku_id || ':' || extract(epoch from r.diubah)::bigint);
    end loop;
  end loop;
  for r in select s.id, s.nama, s.tanggal, sp.peserta_id from public.sesi_ujian s join public.sesi_ujian_peserta sp on sp.sesi_id = s.id
           where s.status = 'terjadwal' and s.tanggal = v_besok loop
    perform sigarda.notif_buat(r.peserta_id, 'pengingat', 'Ujian bersama besok', r.nama, '{"tab":"beranda"}', 'sesi-h1:' || r.id || ':' || r.tanggal);
  end loop;
  delete from public.notifikasi where dibuat < now() - interval '90 days';
end $$;

-- Mengantre Web Push: satu permintaan HTTP per pernyataan INSERT (pg_net) ke Edge Function notif-push, hanya untuk penerima yang punya perangkat.
-- Tanpa konfigurasi (sigarda.push_atur) atau tanpa pg_net tidak ada yang dikirim; Kotak Notifikasi di aplikasi tetap berjalan. Galat push tidak
-- boleh membatalkan transaksi yang menyebabkannya.
create or replace function sigarda.push_antre() returns trigger language plpgsql security definer set search_path = public as
$$
declare v_k public.push_konfigurasi; v_ids bigint[];
begin
  select * into v_k from public.push_konfigurasi;
  if not found or to_regnamespace('net') is null then return null; end if;
  select array_agg(b.id) into v_ids from baru b where exists (select 1 from public.push_langganan l where l.penerima_id = b.penerima_id);
  if v_ids is null then return null; end if;
  begin
    execute 'select net.http_post(url := $1, headers := $2, body := $3)'
      using v_k.url, jsonb_build_object('Content-Type', 'application/json', 'x-sigarda-rahasia', v_k.rahasia), jsonb_build_object('ids', to_jsonb(v_ids));
  exception when others then
    raise warning 'Antrean push gagal: %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists notifikasi_push on public.notifikasi;
create trigger notifikasi_push after insert on public.notifikasi
  referencing new table as baru for each statement execute function sigarda.push_antre();

-- Diisi pemilik proyek SEKALI lewat SQL Editor (tanpa login aplikasi): select sigarda.push_atur('https://<ref>.supabase.co/functions/v1/notif-push', '<rahasia>', '<kunci publik VAPID>');
create or replace function sigarda.push_atur(p_url text, p_rahasia text, p_kunci_publik text) returns void language plpgsql security definer set search_path = public as
$$
begin
  if auth.uid() is not null then raise exception 'Pengaturan push hanya dari SQL Editor Supabase.'; end if;
  insert into public.push_konfigurasi (id, url, rahasia, kunci_publik) values (true, btrim(p_url), btrim(p_rahasia), btrim(p_kunci_publik))
  on conflict (id) do update set url = excluded.url, rahasia = excluded.rahasia, kunci_publik = excluded.kunci_publik, diubah = now();
end $$;

-- Ekstensi dan jadwal harian. Bila pg_net atau pg_cron belum dapat diaktifkan (mis. bukan Supabase), langkah ini dilewati dengan catatan;
-- Kotak Notifikasi tetap bekerja, hanya Web Push dan pengingat harian yang menunggu (aktifkan di Dashboard > Integrations, lalu jalankan ulang migrasi).
do $$
begin
  begin create extension if not exists pg_net with schema extensions; exception when others then null; end;
  begin create extension if not exists pg_cron; exception when others then null; end;
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron belum aktif: pengingat harian belum dijadwalkan. Aktifkan pg_cron lalu jalankan ulang migrasi notifikasi.';
  else
    begin
      perform cron.schedule('sigarda-pengingat', '0 0 * * *', 'select sigarda.notif_pengingat()');
    exception when others then
      raise notice 'Penjadwalan pengingat harian gagal: %', sqlerrm;
    end;
  end if;
  if to_regnamespace('net') is null then raise notice 'pg_net belum aktif: Web Push belum dapat dikirim. Aktifkan pg_net lalu jalankan ulang migrasi notifikasi.'; end if;
end $$;
-- ---- akhir bantu notifikasi ----

-- ===== Notifikasi: fungsi aksi =====
-- Menandai notifikasi milik sendiri sebagai dibaca (p_ids kosong = semua yang belum dibaca). Mengembalikan jumlah yang berubah.
create or replace function public.sg_notifikasi_tandai(p_ids bigint[] default null) returns int language plpgsql security definer set search_path = public as
$$
declare v_n int;
begin
  perform sigarda.wajib_aktif();
  update public.notifikasi set dibaca_pada = now()
    where penerima_id = auth.uid() and dibaca_pada is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Kunci publik VAPID untuk berlangganan Web Push; kosong bila push belum diatur di server.
create or replace function public.sg_push_kunci() returns text language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  return (select kunci_publik from public.push_konfigurasi);
end $$;

-- Mendaftarkan perangkat ini untuk akun yang sedang masuk. Perangkat yang sama (endpoint) dialihkan ke akun ini bila sebelumnya milik akun lain.
create or replace function public.sg_push_simpan(p_endpoint text, p_p256dh text, p_auth text, p_agen text default '') returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if auth.uid() is null then raise exception 'Masuk lebih dulu.'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then raise exception 'Alamat langganan tidak valid.'; end if;
  insert into public.push_langganan (penerima_id, endpoint, p256dh, auth, agen)
  values (auth.uid(), p_endpoint, coalesce(p_p256dh, ''), coalesce(p_auth, ''), left(coalesce(p_agen, ''), 200))
  on conflict (endpoint) do update
    set penerima_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, agen = excluded.agen, diperbarui = now();
end $$;

-- Berhenti berlangganan di perangkat ini (dipanggil saat Keluar atau dimatikan). Hanya perangkat milik akun sendiri.
create or replace function public.sg_push_hapus(p_endpoint text) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  delete from public.push_langganan where endpoint = p_endpoint and penerima_id = auth.uid();
end $$;

-- Pembina dan Admin: berapa anggota yang punya perangkat notifikasi, dan siapa yang belum.
create or replace function public.sg_push_ringkasan() returns jsonb language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat melihat ringkasan perangkat.'; end if;
  return (
    with a as (
      select p.id, p.nama, p.role, p.jabatan, p.kelas, exists (select 1 from public.push_langganan l where l.penerima_id = p.id) as ada
      from public.profiles p where p.role in ('peserta', 'penguji')
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

-- Untuk Edge Function notif-push (service_role): bahan kirim untuk beberapa notifikasi yang belum berstatus, dan pencatatan hasilnya.
create or replace function public.sg_push_ambil_internal(p_ids bigint[]) returns jsonb language sql stable security definer set search_path = public as
$$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id, 'judul', n.judul, 'isi', n.isi, 'tautan', n.tautan,
    'langganan', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'endpoint', l.endpoint, 'p256dh', l.p256dh, 'auth', l.auth)), '[]'::jsonb)
                  from public.push_langganan l where l.penerima_id = n.penerima_id)
  )), '[]'::jsonb)
  from public.notifikasi n where n.id = any (p_ids) and n.push_status is null
$$;
-- p_hasil = { status: [{ id, status: 'dikirim' | 'gagal' }], hapus: [id langganan yang sudah tidak berlaku] }
create or replace function public.sg_push_hasil_internal(p_hasil jsonb) returns void language plpgsql security definer set search_path = public as
$$
begin
  update public.notifikasi n set push_status = x.status
    from jsonb_to_recordset(coalesce(p_hasil -> 'status', '[]'::jsonb)) as x(id bigint, status text)
    where n.id = x.id and x.status in ('dikirim', 'gagal');
  delete from public.push_langganan where id in (select v::bigint from jsonb_array_elements_text(coalesce(p_hasil -> 'hapus', '[]'::jsonb)) v);
end $$;
-- ===== akhir fungsi notifikasi =====

alter table public.notifikasi enable row level security;
alter table public.push_langganan enable row level security;
alter table public.push_konfigurasi enable row level security;

-- Notifikasi: hanya milik sendiri.
drop policy if exists baca_notifikasi on public.notifikasi;
create policy baca_notifikasi on public.notifikasi for select to authenticated
  using ((select sigarda.aktif()) and penerima_id = (select auth.uid()));

revoke all on public.notifikasi, public.push_langganan, public.push_konfigurasi from anon, authenticated;
grant select on public.notifikasi to authenticated;

revoke all on function public.sg_notifikasi_tandai(bigint[]), public.sg_push_kunci(), public.sg_push_simpan(text, text, text, text),
  public.sg_push_hapus(text), public.sg_push_ringkasan(), public.sg_push_ambil_internal(bigint[]), public.sg_push_hasil_internal(jsonb)
  from public, anon, authenticated;
grant execute on function public.sg_notifikasi_tandai(bigint[]), public.sg_push_kunci(), public.sg_push_simpan(text, text, text, text),
  public.sg_push_hapus(text), public.sg_push_ringkasan() to authenticated;
grant execute on function public.sg_push_ambil_internal(bigint[]), public.sg_push_hasil_internal(jsonb) to service_role;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
