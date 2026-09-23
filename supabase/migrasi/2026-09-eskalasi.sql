-- ============================================================================
-- MIGRASI: Eskalasi tidak bergerak (tahap L5). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi cadangan (dan yang sebelumnya). Isi:
--   * profiles.whatsapp (kolom baru, boleh kosong): nomor WhatsApp diisi SENDIRI oleh pemilik akun lewat
--     sg_profil_whatsapp_atur(text); hanya format yang diperiksa (sama seperti Telepon pada Data Gudep).
--   * notifikasi.jenis menerima nilai 'eskalasi'.
--   * sigarda.eskalasi_mulai_sku/absensi/iuran, eskalasi_tingkat, eskalasi_judul/isi/tab, eskalasi_proses(): tangga
--     pengingat (ramah/tegas/mendesak) untuk Penegak yang tidak ada aktivitas SKU >=7 hari, atau 2x berturut-turut
--     Alpa/belum iuran. Dipanggil dari sigarda.notif_pengingat() (pengingat harian 07.00 WIB, otomatis di luar jam
--     senyap 22.00-04.00 WIB tanpa logika tambahan). Tingkat mendesak (hari ke-8+) juga memberi tahu semua pengurus.
--   * sg_eskalasi_daftar(): daftar Penegak tingkat mendesak untuk menu baru "Tindak Lanjut" (Pembina, Dewan Ambalan,
--     Admin), dengan tombol WhatsApp manual (wa.me, TANPA verifikasi nomor benar-benar aktif -- itu perlu layanan
--     WhatsApp Business API berbayar, di luar cakupan).
-- sigarda.notif_pengingat() ditulis ulang penuh (create or replace); bagian pengingat lain (pengujian/sesi besok,
-- pengajuan lama, cadangan) tidak berubah.
-- Edge Function TIDAK berubah dan tidak perlu di-deploy ulang. TIDAK menghapus data yang ada. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: cadangan (migrasi terakhir sebelum ini) sudah ada.
do $$
begin
  if to_regprocedure('public.sg_cadangan_admin()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-cadangan.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

alter table public.profiles add column if not exists whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9 +()./-]{8,20}$');

alter table public.notifikasi drop constraint if exists notifikasi_jenis_check;
alter table public.notifikasi add constraint notifikasi_jenis_check
  check (jenis in ('ajukan','alih','mulai','hasil','pengingat','lama','sesi','surat','tes','eskalasi'));

-- ===== Eskalasi (tahap L5): pengingat ===== (penanda kedua yang membungkus fungsi SAMA; dipakai migrasi L5. Tiap tahap baru yang
-- mengubah notif_pengingat cukup menambah penanda serupa di sini, JANGAN mengubah/menghapus penanda tahap sebelumnya -- skrip
-- migrasi lama yang sudah terbit tetap harus bisa dibangun ulang dari inti.sql bila diperlukan)
-- Pengingat harian (dijalankan pg_cron pukul 07.00 WIB): pengujian dan sesi ujian besok, pengajuan yang menunggu lebih dari 3 hari,
-- cadangan data yang sudah sebulan tidak diunduh (tahap L4), tangga eskalasi tidak bergerak (tahap L5, juga di luar jam senyap karena
-- selalu berjalan 07.00 WIB), dan pembersihan notifikasi berumur lebih dari 90 hari. Kunci membuat tiap pengingat terkirim sekali
-- walau dijalankan berulang.
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
  delete from public.notifikasi where dibuat < now() - interval '90 days';
end $$;
-- ===== akhir pengingat cadangan =====
-- ===== akhir pengingat eskalasi =====

-- ===== Eskalasi (tahap L5): fungsi =====
-- Nomor WhatsApp diisi SENDIRI oleh pemilik akun (semua peran), dipakai tombol "Buka WhatsApp" di daftar Tindak Lanjut. Hanya FORMAT yang
-- diperiksa (sama seperti "Telepon" pada Data Gudep); TIDAK ada pemeriksaan nomor benar-benar terdaftar/aktif di WhatsApp (itu perlu layanan
-- WhatsApp Business API berbayar, di luar cakupan). Kosongkan dengan mengirim teks kosong.
create or replace function public.sg_profil_whatsapp_atur(p_whatsapp text) returns void language plpgsql security definer set search_path = public as
$$
declare v_v text := sigarda.rapikan(p_whatsapp);
begin
  perform sigarda.wajib_aktif();
  if v_v <> '' and v_v !~ '^[0-9 +()./-]{8,20}$' then
    raise exception 'Nomor WhatsApp hanya boleh berisi angka, spasi, dan tanda + ( ) . / - (8-20 karakter).';
  end if;
  update public.profiles set whatsapp = nullif(v_v, '') where id = auth.uid();
end $$;

-- Tangga eskalasi untuk Penegak yang "tidak bergerak", dijalankan dari sigarda.notif_pengingat() (pengingat harian 07.00 WIB, jadi otomatis
-- di luar jam senyap 22.00-04.00 WIB tanpa logika tambahan). Tiga kejadian independen, masing-masing dihitung ULANG setiap hari dari data
-- sumbernya (BUKAN status tersimpan) sehingga otomatis "reset" begitu ada tindak lanjut -- tanpa perlu tabel status terpisah:
--   sku      : tidak ada sku_progress/riwayat baru (peserta ATAU penguji) selama >= 7 hari.
--   absensi  : 2 kali latihan Jumat TERAKHIR berturut-turut berstatus Alpa ('A'; izin/sakit tidak dihitung).
--   iuran    : 2 kali latihan Jumat TERAKHIR berturut-turut tanpa baris iuran (terpisah dari status absensi, sesuai catatan tabel iuran).
-- "mulai" = tanggal kejadian PERTAMA kali memenuhi syarat (tetap sejak itu selama belum ada tindak lanjut, tidak ikut mundur bila kejadian
-- berlanjut lebih lama). Tingkat: 1 ramah (hari ke 0-3 sejak mulai), 2 tegas (4-7), 3 mendesak (8+, JUGA memberi tahu semua pengurus dan
-- masuk sg_eskalasi_daftar). Isi notifikasi singkat, TANPA hasil lulus/ulang (aturan privasi lama).
create or replace function sigarda.eskalasi_mulai_sku(p_peserta uuid) returns date language plpgsql stable security definer set search_path = public as
$$
declare v_terakhir date;
begin
  select greatest(
    coalesce((select max(diubah)::date from public.sku_progress where peserta_id = p_peserta), (select dibuat from public.profiles where id = p_peserta)),
    coalesce((select max(waktu)::date from public.sku_riwayat where peserta_id = p_peserta), (select dibuat from public.profiles where id = p_peserta))
  ) into v_terakhir;
  if sigarda.hari_ini() - v_terakhir >= 7 then return v_terakhir + 7; end if;
  return null;
end $$;

-- Beruntun Alpa dari sesi TERBARU mundur (dibatasi 15 sesi terakhir); "mulai" = tanggal ke-2 (dari yang tertua) dalam beruntun itu, hanya
-- bila beruntunnya sekurangnya 2. Sesi tanpa catatan (belum diabsen) MENGHENTIKAN beruntun (bukan Alpa, tapi juga bukan hadir).
create or replace function sigarda.eskalasi_mulai_absensi(p_peserta uuid) returns date language plpgsql stable security definer set search_path = public as
$$
declare r record; v_beruntun date[] := '{}';
begin
  for r in select s.tanggal, ah.status from public.absensi_sesi s left join public.absensi_hadir ah on ah.tanggal = s.tanggal and ah.peserta_id = p_peserta
           order by s.tanggal desc limit 15
  loop
    if r.status = 'A' then v_beruntun := v_beruntun || r.tanggal; else exit; end if;
  end loop;
  if array_length(v_beruntun, 1) >= 2 then return v_beruntun[array_length(v_beruntun, 1) - 1]; end if;
  return null;
end $$;

-- Sama seperti eskalasi_mulai_absensi, tapi kejadian = tidak ada baris iuran pada sesi itu (terlepas dari status hadir/izin/sakit/alpa).
create or replace function sigarda.eskalasi_mulai_iuran(p_peserta uuid) returns date language plpgsql stable security definer set search_path = public as
$$
declare r record; v_beruntun date[] := '{}';
begin
  for r in select s.tanggal, exists (select 1 from public.iuran i where i.tanggal = s.tanggal and i.peserta_id = p_peserta) as bayar
           from public.absensi_sesi s order by s.tanggal desc limit 15
  loop
    if not r.bayar then v_beruntun := v_beruntun || r.tanggal; else exit; end if;
  end loop;
  if array_length(v_beruntun, 1) >= 2 then return v_beruntun[array_length(v_beruntun, 1) - 1]; end if;
  return null;
end $$;

-- Tingkat (1 ramah, 2 tegas, 3 mendesak) dari jumlah hari sejak "mulai". Tanpa akses tabel: murni fungsi hari berjalan.
create or replace function sigarda.eskalasi_tingkat(p_hari int) returns int language sql immutable as
$$ select case when p_hari < 4 then 1 when p_hari < 8 then 2 else 3 end $$;

create or replace function sigarda.eskalasi_judul(p_jenis text, p_tingkat int) returns text language sql immutable as
$$
  select case p_jenis || p_tingkat
    when 'sku1' then 'Yuk lanjutkan SKU-mu' when 'sku2' then 'SKU belum bergerak' when 'sku3' then 'SKU sudah lama tidak bergerak'
    when 'absensi1' then 'Tidak hadir latihan' when 'absensi2' then 'Absensi perlu diperhatikan' when 'absensi3' then 'Absensi perlu tindak lanjut'
    when 'iuran1' then 'Iuran belum tercatat' when 'iuran2' then 'Iuran perlu diperhatikan' when 'iuran3' then 'Iuran perlu tindak lanjut'
  end
$$;
create or replace function sigarda.eskalasi_isi(p_jenis text, p_tingkat int, p_mulai date) returns text language sql stable as
$$
  select case p_jenis || p_tingkat
    when 'sku1' then 'Belum ada pengajuan atau hasil baru sejak ' || to_char(p_mulai - 7, 'DD-MM-YYYY') || '.'
    when 'sku2' then 'Sudah beberapa hari tidak ada aktivitas SKU. Sempatkan mengajukan butir berikutnya.'
    when 'sku3' then 'Sudah lama tidak ada aktivitas SKU. Hubungi Pembina atau Dewan bila ada kendala.'
    when 'absensi1' then 'Tidak hadir latihan Jumat lalu tanpa keterangan.'
    when 'absensi2' then 'Sudah 2 kali berturut-turut tidak hadir latihan tanpa keterangan.'
    when 'absensi3' then 'Sudah lama tidak hadir latihan tanpa keterangan. Hubungi Pembina atau Dewan bila ada kendala.'
    when 'iuran1' then 'Iuran latihan Jumat lalu belum tercatat.'
    when 'iuran2' then 'Sudah 2 kali berturut-turut iuran belum tercatat.'
    when 'iuran3' then 'Sudah lama iuran belum tercatat. Hubungi Dewan atau asisten bendahara bila ada kendala.'
  end
$$;
-- Tab tujuan notifikasi milik Penegak sendiri per jenis kejadian (menu yang relevan di navigasinya).
create or replace function sigarda.eskalasi_tab(p_jenis text) returns text language sql immutable as
$$ select case p_jenis when 'sku' then 'sku' when 'absensi' then 'absensi' when 'iuran' then 'iuran' end $$;

create or replace function sigarda.eskalasi_proses() returns void language plpgsql security definer set search_path = public as
$$
declare v_hari date := sigarda.hari_ini(); r record; v_mulai date; v_elapsed int; v_tingkat int; v_x uuid;
begin
  for r in select id, nama from public.profiles where role = 'peserta' and status = 'aktif' loop
    declare v_jenis text; v_fn text[] := array['sku','absensi','iuran'];
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
        perform sigarda.notif_buat(r.id, 'eskalasi', sigarda.eskalasi_judul(v_jenis, v_tingkat), sigarda.eskalasi_isi(v_jenis, v_tingkat, v_mulai),
          jsonb_build_object('tab', sigarda.eskalasi_tab(v_jenis)), 'eskalasi:' || v_jenis || ':' || r.id || ':' || v_hari);
        if v_tingkat = 3 then
          for v_x in select id from public.profiles where status = 'aktif' and (role in ('penguji','admin') or (role = 'peserta' and jabatan_dewan is not null)) loop
            perform sigarda.notif_buat(v_x, 'eskalasi', 'Perlu tindak lanjut: ' || r.nama, sigarda.eskalasi_isi(v_jenis, v_tingkat, v_mulai),
              '{"tab":"tindaklanjut"}', 'eskalasi-p:' || v_jenis || ':' || r.id || ':' || v_hari);
          end loop;
        end if;
      end loop;
    end;
  end loop;
end $$;

-- Daftar Penegak yang perlu tindak lanjut (tingkat mendesak, hari ke 8+) untuk Pembina, Dewan Ambalan, dan Admin. Termasuk nomor WhatsApp
-- (bisa kosong bila pemiliknya belum mengisi) untuk tombol "Buka WhatsApp" di halaman.
create or replace function public.sg_eskalasi_daftar() returns jsonb language plpgsql stable security definer set search_path = public as
$$
declare v_hari date := sigarda.hari_ini(); v_hasil jsonb := '[]'::jsonb; r record; v_mulai date; v_elapsed int; v_jenis text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Hanya Pembina, Dewan Ambalan, dan Admin Gudep yang dapat melihat daftar ini.'; end if;
  for r in select id, nama, kelas, sangga, whatsapp from public.profiles where role = 'peserta' and status = 'aktif' loop
    foreach v_jenis in array array['sku','absensi','iuran'] loop
      v_mulai := case v_jenis
        when 'sku' then sigarda.eskalasi_mulai_sku(r.id)
        when 'absensi' then sigarda.eskalasi_mulai_absensi(r.id)
        else sigarda.eskalasi_mulai_iuran(r.id)
      end;
      continue when v_mulai is null;
      v_elapsed := v_hari - v_mulai;
      continue when sigarda.eskalasi_tingkat(v_elapsed) < 3;
      v_hasil := v_hasil || jsonb_build_object(
        'pesertaId', r.id, 'nama', r.nama, 'kelas', r.kelas, 'sangga', r.sangga, 'whatsapp', r.whatsapp,
        'jenis', v_jenis, 'mulai', v_mulai, 'hari', v_elapsed
      );
    end loop;
  end loop;
  return v_hasil;
end $$;
-- ===== akhir fungsi eskalasi =====

revoke all on function public.sg_profil_whatsapp_atur(text), public.sg_eskalasi_daftar() from public, anon, authenticated;
grant execute on function public.sg_profil_whatsapp_atur(text), public.sg_eskalasi_daftar() to authenticated;
-- Fungsi sigarda.eskalasi_* baru: hak dijalankan ulang di sini (bukan hanya sekali di migrasi notifikasi) karena grant
-- "all functions in schema" hanya berlaku pada fungsi yang SUDAH ADA saat dijalankan, tidak retroaktif untuk fungsi baru.
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
