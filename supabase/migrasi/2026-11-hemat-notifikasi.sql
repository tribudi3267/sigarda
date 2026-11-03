-- ============================================================================
-- MIGRASI: hemat ruang basis data untuk notifikasi. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-10-pin-tanpa-sesi.sql; lihat README). Latar: tabel notifikasi menjadi tabel
-- terbesar (lebih dari separuh jatah 500 MB paket Free) karena pengingat Tindak Lanjut mengirim satu notifikasi per Penegak per jenis
-- KE SETIAP pengurus SETIAP hari, dan notifikasi baru dihapus sesudah 90 hari. Isi:
--   * sigarda.eskalasi_proses ditulis ulang: Penegak diberi tahu sekali per tingkat, lalu paling banyak seminggu sekali pada tingkat
--     mendesak; pengurus menerima SATU ringkasan ("Perlu tindak lanjut: N Penegak") hanya bila ada yang baru mendesak atau sudah seminggu.
--   * sigarda.notifikasi_bersihkan (baru) dipanggil pengingat harian: menghapus yang sudah dibaca > 30 hari, semua > 60 hari,
--     pengingat eskalasi > 14 hari, dan di luar 200 terbaru per penerima (aplikasi hanya menampilkan 60 terbaru).
--   * sigarda.notif_pengingat ditulis ulang (tanda tangan sama) untuk memanggilnya.
--   * Pembersihan SEKALI sekarang, termasuk notifikasi Tindak Lanjut bentuk lama ke pengurus (sudah tergantikan ringkasan).
-- Data aplikasi lain TIDAK berubah. Edge Function TIDAK berubah. Aman diulang.
--
-- SESUDAH migrasi ini, ruang yang dibebaskan baru kembali ke jatah setelah tabel dipadatkan. Jalankan SATU KALI di SQL Editor,
-- sebagai query TERSENDIRI (tidak bisa di dalam migrasi karena VACUUM tidak boleh berada dalam transaksi):
--   vacuum full public.notifikasi;
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regprocedure('public.sg_pin_periksa_internal(uuid,text)') is null or to_regprocedure('sigarda.eskalasi_proses()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-10-pin-tanpa-sesi.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Hemat ruang notifikasi: pembersihan =====
-- Notifikasi adalah tabel terbesar (paket Free Supabase: basis data 500 MB). Dijalankan dari pengingat harian. Aplikasi hanya menampilkan
-- 60 notifikasi terbaru, jadi yang dihapus: sudah dibaca dan lebih dari 30 hari, semua yang lebih dari 60 hari, pengingat eskalasi lebih dari
-- 14 hari (keadaan terbarunya selalu ada di menu Tindak Lanjut), dan apa pun di luar 200 terbaru per penerima. Kunci pengingat yang masih
-- berlaku memuat tanggal atau periode, jadi menghapus baris lama tidak membuat pengingat yang sama terkirim ulang.
create or replace function sigarda.notifikasi_bersihkan() returns void language plpgsql security definer set search_path = public as
$$
begin
  delete from public.notifikasi
  where dibuat < now() - interval '60 days'
     or (dibaca_pada is not null and dibuat < now() - interval '30 days')
     or (jenis = 'eskalasi' and dibuat < now() - interval '14 days');
  delete from public.notifikasi n using (
    select id from (select id, row_number() over (partition by penerima_id order by id desc) urut from public.notifikasi) x where x.urut > 200
  ) d where n.id = d.id;
end $$;
-- ===== akhir pembersihan notifikasi =====

-- ===== Hemat ruang notifikasi: pengingat ===== (penanda kesembilan, fungsi SAMA; dipakai migrasi 2026-11-hemat-notifikasi)
-- Pengingat harian (dijalankan pg_cron pukul 07.00 WIB): pengujian dan sesi ujian besok, pengajuan yang menunggu lebih dari 3 hari,
-- cadangan data yang sudah sebulan tidak diunduh (tahap L4), tangga eskalasi tidak bergerak (tahap L5), agenda tahunan H-30/H-7/H-1
-- (tahap L6), usulan Musyawarah Ambalan belum terjadwal H-60 lalu tiap 14 hari (tahap L6b), usulan 10 kegiatan lain belum terjadwal
-- H-30/H-60 lalu tiap 14 hari (tahap L6b, juga di luar jam senyap karena selalu berjalan 07.00 WIB), dan pembersihan notifikasi
-- lama (sigarda.notifikasi_bersihkan), dan tahap kalender seleksi Garuda H-7/H-3/H-1/hari-H serta berakhir besok (Tahap 2, G4d). Kunci membuat tiap pengingat terkirim sekali walau dijalankan berulang.
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
  perform sigarda.garuda_kalender_pengingat();
  -- Riwayat pg_cron (cron.job_run_details) hanya 30 hari terakhir: pekerjaan sigarda-terbit-ulang berjalan tiap 5 menit dan tabel itu
  -- tidak dibersihkan siapa pun. Dijaga: tanpa pg_cron atau tanpa izin, pengingat harian tetap berjalan.
  if to_regclass('cron.job_run_details') is not null then
    begin
      execute 'delete from cron.job_run_details where end_time < now() - interval ''30 days''';
    exception when others then null;
    end;
  end if;
  perform sigarda.notifikasi_bersihkan();
end $$;
-- ===== akhir pengingat cadangan =====
-- ===== akhir pengingat eskalasi =====
-- ===== akhir pengingat agenda =====
-- ===== akhir pengingat usulan musyawarah =====
-- ===== akhir pengingat usulan kegiatan lain =====
-- ===== akhir pengingat pra-uji =====
-- ===== akhir pengingat kalender garuda =====
-- ===== akhir pembersihan riwayat penjadwal =====
-- ===== akhir pengingat hemat notifikasi =====

-- Hemat ruang (paket Free 500 MB; dulu notifikasi menjadi tabel terbesar): Penegak diberi tahu SEKALI per tingkat per kejadian (kunci memuat
-- tanggal "mulai" dan tingkat), lalu pada tingkat mendesak paling banyak seminggu sekali; pengurus menerima SATU ringkasan per hari, hanya bila
-- ada Penegak yang baru mencapai tingkat mendesak atau sudah seminggu tanpa ringkasan (bukan satu notifikasi per Penegak per jenis per pengurus
-- tiap hari). Daftar lengkap dan terbaru selalu di menu Tindak Lanjut (sg_eskalasi_daftar).
create or replace function sigarda.eskalasi_proses() returns void language plpgsql security definer set search_path = public as
$$
declare
  v_hari date := sigarda.hari_ini(); r record; v_mulai date; v_elapsed int; v_tingkat int; v_x uuid; v_dasar text; v_kunci text;
  v_nama text[] := '{}'; v_baru int := 0; v_isi text;
begin
  for r in select id, nama from public.profiles where role = 'peserta' and status = 'aktif' order by nama loop
    declare v_jenis text; v_fn text[] := array['sku','absensi','iuran']; v_mendesak boolean := false;
    begin
      foreach v_jenis in array v_fn loop
        v_mulai := case v_jenis
          when 'sku' then sigarda.eskalasi_mulai_sku(r.id)
          when 'absensi' then sigarda.eskalasi_mulai_absensi(r.id)
          else sigarda.eskalasi_mulai_iuran(r.id)
        end;
        continue when v_mulai is null;
        v_elapsed := v_hari - v_mulai;
        v_tingkat := sigarda.eskalasi_tingkat(v_elapsed);
        v_dasar := 'eskalasi:' || v_jenis || ':' || r.id || ':' || v_mulai || ':';
        v_kunci := v_dasar || v_tingkat;
        if v_tingkat = 3 then
          v_mendesak := true;
          if not exists (select 1 from public.notifikasi where penerima_id = r.id and kunci like v_dasar || '3%') then
            v_baru := v_baru + 1;
          elsif exists (select 1 from public.notifikasi where penerima_id = r.id and kunci like v_dasar || '3%' and dibuat > now() - interval '6 days') then
            v_kunci := null;   -- sudah diingatkan minggu ini
          end if;
          v_kunci := v_kunci || ':' || v_hari;
        end if;
        if v_kunci is not null then
          perform sigarda.notif_buat(r.id, 'eskalasi', sigarda.eskalasi_judul(v_jenis, v_tingkat), sigarda.eskalasi_isi(v_jenis, v_tingkat, v_mulai),
            jsonb_build_object('tab', sigarda.eskalasi_tab(v_jenis)), v_kunci);
        end if;
      end loop;
      if v_mendesak then v_nama := v_nama || r.nama; end if;
    end;
  end loop;
  if coalesce(array_length(v_nama, 1), 0) = 0 then return; end if;
  v_isi := array_to_string(v_nama[1:3], ', ')
    || case when array_length(v_nama, 1) > 3 then ', dan ' || (array_length(v_nama, 1) - 3) || ' lainnya' else '' end
    || '. Lihat menu Tindak Lanjut.';
  for v_x in select id from public.profiles where status = 'aktif' and (role in ('penguji','admin') or (role = 'peserta' and jabatan_dewan is not null)) loop
    continue when v_baru = 0 and exists (
      select 1 from public.notifikasi where penerima_id = v_x and kunci like 'eskalasi-p:%' and dibuat > now() - interval '6 days');
    perform sigarda.notif_buat(v_x, 'eskalasi', 'Perlu tindak lanjut: ' || array_length(v_nama, 1) || ' Penegak', v_isi,
      '{"tab":"tindaklanjut"}', 'eskalasi-p:' || v_hari);
  end loop;
end $$;

-- Pembersihan sekali sekarang (tanpa menunggu pengingat harian berikutnya). Notifikasi Tindak Lanjut bentuk lama ke pengurus
-- (satu per Penegak per jenis per hari) tergantikan ringkasan; daftarnya tetap lengkap di menu Tindak Lanjut.
delete from public.notifikasi where kunci like 'eskalasi-p:%' and kunci !~ '^eskalasi-p:[0-9]{4}-[0-9]{2}-[0-9]{2}$';
select sigarda.notifikasi_bersihkan();

-- Fungsi sigarda.* diperbarui: hak dijalankan ulang di sini.
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
