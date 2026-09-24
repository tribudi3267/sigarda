-- ---- Notifikasi: fungsi bantu dan pemicu ----
-- Notifikasi dibuat oleh pemicu pada tabel (bukan di tiap fungsi aksi) agar semua jalur penulisan tercakup, termasuk Edge Function catat-hasil.
-- Isi singkat dan tanpa hasil lulus/ulang (layar kunci HP bisa dilihat orang lain). Penerima tidak pernah sama dengan pelaku yang bersangkutan.
create function sigarda.notif_buat(p_penerima uuid, p_jenis text, p_judul text, p_isi text, p_tautan jsonb, p_kunci text default null) returns void
language plpgsql security definer set search_path = public as
$$
begin
  if p_penerima is null then return; end if;
  insert into public.notifikasi (penerima_id, jenis, judul, isi, tautan, kunci)
  values (p_penerima, p_jenis, left(p_judul, 120), left(coalesce(p_isi, ''), 300), coalesce(p_tautan, '{}'::jsonb), p_kunci)
  on conflict (penerima_id, kunci) where kunci is not null do nothing;
end $$;

-- "Bantara butir 5" untuk satu unit SKU.
create function sigarda.notif_label_butir(p_sku text) returns text language sql stable security definer set search_path = public as
$$ select coalesce((select u.tingkat || ' butir ' || u.butir_no from public.sku_unit u where u.id = p_sku), p_sku) $$;

-- Penguji yang perlu tahu tentang satu pengajuan: penguji tujuan, atau (antrian rombel) semua penguji yang sah untuk Penegak dan butir itu.
create function sigarda.notif_penerima_uji(p_peserta uuid, p_sku text, p_penguji uuid) returns setof uuid
language plpgsql stable security definer set search_path = public as
$$
begin
  if p_penguji is not null then return next p_penguji; return; end if;
  return query select s.o_penguji from sigarda.penguji_sah(p_peserta, p_sku) s;
end $$;

create function sigarda.notif_sku_progress() returns trigger language plpgsql security definer set search_path = public as
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
create trigger notif_sku_progress after insert or update of status, penguji_id on public.sku_progress
  for each row execute function sigarda.notif_sku_progress();

-- Penegak yang dimasukkan ke sesi ujian bersama. Kunci memuat tanggal: menyimpan ulang sesi tidak menggandakan, mengganti tanggal memberi tahu lagi.
create function sigarda.notif_sesi_peserta() returns trigger language plpgsql security definer set search_path = public as
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
create trigger notif_sesi_peserta after insert on public.sesi_ujian_peserta
  for each row execute function sigarda.notif_sesi_peserta();

create function sigarda.notif_dokumen() returns trigger language plpgsql security definer set search_path = public as
$$
begin
  if NEW.jenis = 'surat_pengantar_agama' and NEW.peserta_id is not null then
    perform sigarda.notif_buat(NEW.peserta_id, 'surat', 'Surat pengantar guru agama terbit', 'Surat nomor ' || NEW.nomor || ' sudah diterbitkan. Cetak dan minta tanda tangan Pembina.', '{"tab":"cetak"}');
  end if;
  return null;
end $$;
create trigger notif_dokumen after insert on public.dokumen_terbit
  for each row execute function sigarda.notif_dokumen();

-- ===== Cadangan (tahap L4): pengingat ===== (penanda ketat di sekitar notif_pengingat saja, tanpa trigger di sekitarnya yang
-- tidak aman diulang, supaya migrasi dapat memperbarui fungsi ini sendirian)
-- ===== Eskalasi (tahap L5): pengingat ===== (penanda kedua yang membungkus fungsi SAMA; dipakai migrasi L5. Tiap tahap baru yang
-- mengubah notif_pengingat cukup menambah penanda serupa di sini, JANGAN mengubah/menghapus penanda tahap sebelumnya -- skrip
-- migrasi lama yang sudah terbit tetap harus bisa dibangun ulang dari inti.sql bila diperlukan)
-- ===== Agenda tahunan (tahap L6): pengingat ===== (penanda ketiga yang membungkus fungsi SAMA; dipakai migrasi L6)
-- ===== Usulan Musyawarah Ambalan (tahap L6b): pengingat ===== (penanda keempat, fungsi SAMA; dipakai migrasi L6b)
-- ===== Usulan kegiatan lain (tahap L6b): pengingat ===== (penanda kelima, fungsi SAMA; dipakai migrasi L6b)
-- ===== Pra-uji berjenjang (fase C): pengingat ===== (penanda keenam, fungsi SAMA; dipakai migrasi pra-uji)
-- Pengingat harian (dijalankan pg_cron pukul 07.00 WIB): pengujian dan sesi ujian besok, pengajuan yang menunggu lebih dari 3 hari,
-- cadangan data yang sudah sebulan tidak diunduh (tahap L4), tangga eskalasi tidak bergerak (tahap L5), agenda tahunan H-30/H-7/H-1
-- (tahap L6), usulan Musyawarah Ambalan belum terjadwal H-60 lalu tiap 14 hari (tahap L6b), usulan 10 kegiatan lain belum terjadwal
-- H-30/H-60 lalu tiap 14 hari (tahap L6b, juga di luar jam senyap karena selalu berjalan 07.00 WIB), dan pembersihan notifikasi
-- berumur lebih dari 90 hari. Kunci membuat tiap pengingat terkirim sekali walau dijalankan berulang.
create function sigarda.notif_pengingat() returns void language plpgsql security definer set search_path = public as
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
  if not exists (
    select 1 from public.pengaturan where kunci = 'cadangan.terakhir' and (nilai ->> 'pada')::timestamptz > now() - interval '30 days'
  ) then
    for v_x in select id from public.profiles where role = 'admin' and status = 'aktif' loop
      perform sigarda.notif_buat(v_x, 'pengingat', 'Waktunya cadangan data',
        'Sudah lebih dari sebulan sejak cadangan terakhir (atau belum pernah). Unduh dari menu Data Gudep.', '{"tab":"gudep"}',
        'cadangan:' || to_char(now(), 'YYYY-MM'));
    end loop;
  end if;
  perform sigarda.eskalasi_proses();
  perform sigarda.agenda_proses();
  perform sigarda.musyawarah_pengingat();
  perform sigarda.kegiatan_pengingat();
  perform sigarda.pra_uji_pengingat();
  delete from public.notifikasi where dibuat < now() - interval '90 days';
end $$;
-- ===== akhir pengingat cadangan =====
-- ===== akhir pengingat eskalasi =====
-- ===== akhir pengingat agenda =====
-- ===== akhir pengingat usulan musyawarah =====
-- ===== akhir pengingat usulan kegiatan lain =====
-- ===== akhir pengingat pra-uji =====

-- Mengantre Web Push: satu permintaan HTTP per pernyataan INSERT (pg_net) ke Edge Function notif-push, hanya untuk penerima yang punya perangkat.
-- Tanpa konfigurasi (sigarda.push_atur) atau tanpa pg_net tidak ada yang dikirim; Kotak Notifikasi di aplikasi tetap berjalan. Galat push tidak
-- boleh membatalkan transaksi yang menyebabkannya.
create function sigarda.push_antre() returns trigger language plpgsql security definer set search_path = public as
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
create trigger notifikasi_push after insert on public.notifikasi
  referencing new table as baru for each statement execute function sigarda.push_antre();

-- Diisi pemilik proyek SEKALI lewat SQL Editor (tanpa login aplikasi): select sigarda.push_atur('https://<ref>.supabase.co/functions/v1/notif-push', '<rahasia>', '<kunci publik VAPID>');
create function sigarda.push_atur(p_url text, p_rahasia text, p_kunci_publik text) returns void language plpgsql security definer set search_path = public as
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

