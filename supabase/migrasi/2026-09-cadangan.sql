-- ============================================================================
-- MIGRASI: Cadangan data (tahap L4). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi pemeriksaan-data (dan yang sebelumnya). Isi:
--   * sg_cadangan_admin(): Admin Gudep mengunduh satu berkas JSON berisi tabel data aplikasi (TANPA akun login/hash PIN;
--     tabel rahasia/sementara seperti push_konfigurasi dan notifikasi juga tidak disertakan), dipanggil dari tombol
--     "Unduh cadangan" di menu Data Gudep. Mencatat waktunya di pengaturan 'cadangan.terakhir'.
--   * sg_cadangan_status(): status cadangan terakhir (kapan, siapa) tanpa mengambil seluruh data.
--   * sigarda.notif_pengingat() diperbarui: mengirim pengingat ke Admin bila cadangan sudah sebulan tidak diunduh
--     (atau belum pernah). Fungsi ini ditulis ulang penuh (create or replace), bagian lainnya (pengingat pengujian
--     besok, pengajuan lama, sesi ujian besok) tidak berubah.
-- Hanya menambah fungsi (tanpa tabel/kolom baru). Edge Function TIDAK berubah dan tidak perlu di-deploy ulang.
-- TIDAK menghapus data yang ada. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: pemeriksaan data (migrasi terakhir sebelum ini) sudah ada.
do $$
begin
  if to_regprocedure('public.sg_pemeriksaan_data()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-pemeriksaan-data.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Cadangan (tahap L4): pengingat ===== (penanda ketat di sekitar notif_pengingat saja, tanpa trigger di sekitarnya yang
-- tidak aman diulang, supaya migrasi cadangan dapat memperbarui fungsi ini sendirian)
-- Pengingat harian (dijalankan pg_cron pukul 07.00 WIB): pengujian dan sesi ujian besok, pengajuan yang menunggu lebih dari 3 hari,
-- cadangan data yang sudah sebulan tidak diunduh (tahap L4), dan pembersihan notifikasi berumur lebih dari 90 hari. Kunci membuat
-- tiap pengingat terkirim sekali walau dijalankan berulang.
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
  delete from public.notifikasi where dibuat < now() - interval '90 days';
end $$;
-- ===== akhir pengingat cadangan =====

-- ===== Cadangan (tahap L4): fungsi =====
-- Ekspor manual dari menu Data Gudep (Admin Gudep): satu berkas JSON berisi isi tabel data aplikasi, untuk disimpan sendiri sebagai
-- cadangan ringan tanpa layanan berbayar. TIDAK menyentuh auth.users/auth.identities atau hash PIN sama sekali: bila database perlu
-- dipulihkan, akun dibuat ulang lewat undang anggota (PIN baru), baru berkas ini dipulihkan manual bila perlu. Tabel yang berisi
-- rahasia atau bersifat sementara (login_gagal, push_konfigurasi, push_langganan, notifikasi) TIDAK disertakan. Untuk cadangan penuh
-- level basis data (termasuk akun login), tetap pakai Cadangkan-SIGARDA.bat. Memanggil fungsi ini mencatat waktunya (pengaturan
-- 'cadangan.terakhir') supaya pengingat bulanan (sigarda.notif_pengingat) berhenti selama cadangan masih baru.
create or replace function public.sg_cadangan_admin() returns jsonb language plpgsql security definer set search_path = public as
$$
declare v_hasil jsonb;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengunduh cadangan.');
  select jsonb_build_object(
    'dibuat_pada', now(),
    'tabel', jsonb_build_object(
      'profiles', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.profiles t),
      'sku_butir', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sku_butir t),
      'sku_unit', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sku_unit t),
      'pf_item', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.pf_item t),
      'sku_progress', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sku_progress t),
      'sku_riwayat', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sku_riwayat t),
      'absensi_sesi', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.absensi_sesi t),
      'absensi_hadir', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.absensi_hadir t),
      'iuran', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.iuran t),
      'iuran_log', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.iuran_log t),
      'iuran_kas', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.iuran_kas t),
      'asisten_iuran', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.asisten_iuran t),
      'penugasan_rombel', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.penugasan_rombel t),
      'penugasan_log', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.penugasan_log t),
      'penugasan_peserta', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.penugasan_peserta t),
      'kepengurusan_log', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.kepengurusan_log t),
      'guru_agama', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.guru_agama t),
      'dokumen_terbit', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.dokumen_terbit t),
      'dokumen_urut', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.dokumen_urut t),
      'naik_kelas_batch', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.naik_kelas_batch t),
      'naik_kelas_log', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.naik_kelas_log t),
      'portofolio', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.portofolio t),
      'portofolio_jurnal', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.portofolio_jurnal t),
      'materi', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.materi t),
      'pengaturan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.pengaturan t),
      'sidang_urut', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sidang_urut t),
      'sidang_dk', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sidang_dk t),
      'raport', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.raport t),
      'instrumen', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.instrumen t),
      'instrumen_kriteria', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.instrumen_kriteria t),
      'instrumen_penguji', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.instrumen_penguji t),
      'instrumen_panduan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.instrumen_panduan t),
      'sku_penilaian', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sku_penilaian t),
      'sertifikat_tingkat', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sertifikat_tingkat t),
      'sesi_ujian', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sesi_ujian t),
      'sesi_ujian_butir', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sesi_ujian_butir t),
      'sesi_ujian_peserta', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sesi_ujian_peserta t)
    )
  ) into v_hasil;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada)
    values ('cadangan.terakhir', jsonb_build_object('pada', now(), 'oleh', (select nama from public.profiles where id = auth.uid())), auth.uid(), now())
    on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
  return v_hasil;
end $$;

-- Kapan dan siapa yang terakhir mengunduh cadangan, untuk ditampilkan di menu Data Gudep tanpa mengambil seluruh data;
-- { pada, oleh } atau objek kosong bila belum pernah diunduh.
create or replace function public.sg_cadangan_status() returns jsonb language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat melihat status cadangan.');
  return coalesce((select nilai from public.pengaturan where kunci = 'cadangan.terakhir'), '{}'::jsonb);
end $$;
-- ===== akhir fungsi cadangan =====

revoke all on function public.sg_cadangan_admin(), public.sg_cadangan_status() from public, anon, authenticated;
grant execute on function public.sg_cadangan_admin(), public.sg_cadangan_status() to authenticated;

commit;
notify pgrst, 'reload schema';
