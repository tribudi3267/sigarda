-- ============================================================================
-- MIGRASI: Tahap 2 (G4d) -- pengingat otomatis untuk kalender tahap Garuda dari Kwarcab. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-tim-kalender.sql; lihat README). Isi:
--   * Fungsi baru sigarda.garuda_tahap_label dan sigarda.garuda_kalender_pengingat: notifikasi H-7, H-3, H-1, dan hari-H mulai tiap tahap kalender Garuda yang sudah diisi,
--     serta "berakhir besok" untuk tahap berentang yang sedang berjalan; ke semua pengurus aktif; sekali per tahap per hari.
--   * sigarda.notif_pengingat (pengingat harian 07.00 WIB) ditulis ulang (tanda tangan sama) agar memanggil pengingat kalender.
-- TIDAK mengubah tabel maupun data. Edge Function TIDAK berubah. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.garuda_tahap') is null or to_regprocedure('sigarda.pra_uji_pengingat()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-tim-kalender.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Pengingat kalender Garuda (Tahap 2, G4d): fungsi =====
-- Nama tahap kalender Garuda untuk isi notifikasi; sama dengan TAHAP_GARUDA di src/lib/kalenderGarudaLogic.js (dijaga uji/tim-kalender-klien.mjs).
create or replace function sigarda.garuda_tahap_label(p_tahap text) returns text language sql immutable as
$$
  select case p_tahap
    when 'uji_spg' then 'Pengujian SPG oleh Pembina'
    when 'ajukan_tim' then 'Pengajuan SK tim penilai'
    when 'ambil_sk' then 'Pengambilan SK tim penilai'
    when 'penilaian_gudep' then 'Penilaian tim penilai gugus depan'
    when 'serah_kwarran' then 'Penyerahan portofolio ke Kwarran'
    when 'nilai_kwarran' then 'Penilaian portofolio oleh Kwarran'
    when 'kirim_kwarcab' then 'Pengiriman berkas ke Kwarcab'
    when 'verifikasi_visitasi' then 'Verifikasi dan visitasi Kwarcab'
    when 'iuran' then 'Iuran gotong royong'
    when 'pelantikan' then 'Pelantikan Pramuka Garuda'
    else p_tahap
  end
$$;

-- Pengingat pukul 07.00 WIB (dari notif_pengingat) untuk tahap kalender Garuda yang sudah diisi: H-7, H-3, H-1, dan hari-H mulainya, serta "berakhir besok" untuk tahap
-- berentang yang sedang berjalan. Penerima: semua pengurus aktif (Pembina, Admin, akun Dewan lama, Penegak berjabatan Dewan), jenis 'agenda'. Sekali per tahap per hari (kunci).
create or replace function sigarda.garuda_kalender_pengingat() returns void language plpgsql security definer set search_path = public as
$$
declare v_hari date := sigarda.hari_ini(); r record; v_x uuid; v_n int; v_judul text; v_isi text; v_rentang text;
begin
  for r in select id, tahap, mulai, akhir, catatan from public.garuda_tahap where mulai - v_hari in (7, 3, 1, 0) loop
    v_n := r.mulai - v_hari;
    v_rentang := case when r.akhir is not null and r.akhir <> r.mulai then to_char(r.mulai, 'DD-MM-YYYY') || ' s.d. ' || to_char(r.akhir, 'DD-MM-YYYY') else to_char(r.mulai, 'DD-MM-YYYY') end;
    v_judul := case when v_n = 0 then 'Hari ini: ' else 'H-' || v_n::text || ': ' end || sigarda.garuda_tahap_label(r.tahap);
    v_isi := 'Tahap seleksi Garuda dari Kwarcab, ' || v_rentang || '.' || case when r.catatan <> '' then ' ' || r.catatan else '' end;
    for v_x in select id from public.profiles where status = 'aktif' and (role in ('penguji', 'admin') or (role = 'peserta' and jabatan_dewan is not null)) loop
      perform sigarda.notif_buat(v_x, 'agenda', v_judul, v_isi, '{"tab":"kelayakan"}', 'garuda:' || r.id || ':' || v_hari);
    end loop;
  end loop;
  for r in select id, tahap, mulai, akhir from public.garuda_tahap where akhir is not null and akhir > mulai and mulai <= v_hari and akhir - v_hari = 1 loop
    v_judul := 'Berakhir besok: ' || sigarda.garuda_tahap_label(r.tahap);
    v_isi := 'Tahap seleksi Garuda dari Kwarcab berakhir ' || to_char(r.akhir, 'DD-MM-YYYY') || '.';
    for v_x in select id from public.profiles where status = 'aktif' and (role in ('penguji', 'admin') or (role = 'peserta' and jabatan_dewan is not null)) loop
      perform sigarda.notif_buat(v_x, 'agenda', v_judul, v_isi, '{"tab":"kelayakan"}', 'garuda-akhir:' || r.id || ':' || v_hari);
    end loop;
  end loop;
end $$;
-- ===== akhir fungsi pengingat kalender garuda =====

-- ===== Kalender Garuda (Tahap 2, G4d): pengingat ===== (penanda ketujuh, fungsi SAMA; dipakai migrasi pengingat kalender)
-- Pengingat harian (dijalankan pg_cron pukul 07.00 WIB): pengujian dan sesi ujian besok, pengajuan yang menunggu lebih dari 3 hari,
-- cadangan data yang sudah sebulan tidak diunduh (tahap L4), tangga eskalasi tidak bergerak (tahap L5), agenda tahunan H-30/H-7/H-1
-- (tahap L6), usulan Musyawarah Ambalan belum terjadwal H-60 lalu tiap 14 hari (tahap L6b), usulan 10 kegiatan lain belum terjadwal
-- H-30/H-60 lalu tiap 14 hari (tahap L6b, juga di luar jam senyap karena selalu berjalan 07.00 WIB), dan pembersihan notifikasi
-- berumur lebih dari 90 hari, dan tahap kalender seleksi Garuda H-7/H-3/H-1/hari-H serta berakhir besok (Tahap 2, G4d). Kunci membuat tiap pengingat terkirim sekali walau dijalankan berulang.
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
  delete from public.notifikasi where dibuat < now() - interval '90 days';
end $$;
-- ===== akhir pengingat cadangan =====
-- ===== akhir pengingat eskalasi =====
-- ===== akhir pengingat agenda =====
-- ===== akhir pengingat usulan musyawarah =====
-- ===== akhir pengingat usulan kegiatan lain =====
-- ===== akhir pengingat pra-uji =====
-- ===== akhir pengingat kalender garuda =====

-- Fungsi sigarda.* baru: hak dijalankan ulang di sini (grant "all functions in schema" tidak retroaktif untuk fungsi baru).
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
