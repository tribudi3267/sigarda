-- ============================================================================
-- MIGRASI: Usulan kegiatan (tahap L6b) -- Musyawarah Ambalan DAN 10 kegiatan lain. AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi agenda (dan yang sebelumnya). Isi:
--   * public.agenda.jenis (tahap L6) diperluas dengan 8 nilai baru: pengembaraan, perkemahan, gelora_saka_expo,
--     gladi_tangguh_1, gladi_tangguh_2, penempuhan_sku_laksana, ptgd, pembekalan_dewan (selain 7 nilai lama).
--   * Tabel public.kegiatan_usulan: alur resmi di aplikasi untuk mengusulkan 11 jenis kegiatan tahunan (Musyawarah
--     Ambalan, Pembayatan dan Pelantikan Bantara, Pelantikan Laksana, Pengembaraan, Perkemahan, Gelora Saka Expo,
--     Gladi Tangguh 1 dan 2, Penempuhan SKU Laksana, PTGD, Pembekalan Dewan Ambalan Angkatan Berikutnya). Hanya
--     Pradana atau Pradani dapat mengajukan (jenis + tanggal usulan + tautan dokumen proposal Drive + catatan
--     opsional); hanya Pembina dapat meninjau (setuju dengan catatan opsional, atau tolak dengan catatan WAJIB).
--     Maksimal satu usulan "menunggu" per (tahun ajaran, jenis). Dibaca hanya pengurus (RLS); ditulis hanya lewat
--     fungsi di bawah.
--   * sigarda.pembina_saja(), sigarda.pradana_atau_pradani(): fungsi bantu peran baru.
--   * sg_agenda_simpan (tahap L6) DITULIS ULANG: kini memanggil sigarda.pembina_saja() untuk memeriksa "lewati batas"
--     (perilaku SAMA, hanya dirapikan supaya dapat dipakai ulang oleh sg_kegiatan_tinjau di bawah).
--   * sigarda.kegiatan_judul_bawaan(jenis), sigarda.kegiatan_bulan_tanggal(tahun_ajaran, bulan): fungsi bantu baru.
--   * sg_kegiatan_usul(...), sg_kegiatan_tinjau(...), sg_kegiatan_ping(id): fungsi aksi (menggantikan rancangan awal
--     yang hanya untuk Musyawarah Ambalan). Persetujuan OTOMATIS membuat entri di public.agenda (memanggil
--     sg_agenda_simpan sendiri) dengan lewati_batas benar (true hanya untuk jenis 'musyawarah' bila tanggal usulan
--     memang di atas/pada batas 1 Juli; jenis lain tidak mengenal batas ini).
--   * sigarda.musyawarah_pengingat(): pengingat H-60 (lalu tiap 14 hari) ke semua pengurus dan Dewan Ambalan bila
--     tahun ajaran berjalan belum punya entri Agenda Musyawarah Ambalan.
--   * sigarda.kegiatan_pengingat(): pengingat H-30/H-60 (lalu tiap 14 hari) ke semua pengurus dan Dewan Ambalan
--     untuk 10 jenis kegiatan lain, per bulan sasaran masing-masing, sampai ada yang disetujui. Kedua fungsi
--     pengingat di atas dipanggil dari sigarda.notif_pengingat().
--   * notifikasi.jenis menerima nilai 'musyawarah' dan 'kegiatan'.
--   * sg_cadangan_admin() (tahap L4) DITULIS ULANG: menambahkan public.agenda dan public.kegiatan_usulan ke daftar
--     tabel yang diekspor (keduanya tertinggal saat tahap L6/L6b berjalan; diperbaiki sekalian di sini).
-- sigarda.notif_pengingat() ditulis ulang penuh (create or replace); bagian pengingat lain tidak berubah.
-- Edge Function TIDAK berubah dan tidak perlu di-deploy ulang. TIDAK menghapus data yang ada. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: agenda (migrasi terakhir sebelum ini) sudah ada.
do $$
begin
  if to_regprocedure('public.sg_agenda_hapus(bigint)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-agenda.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

alter table public.agenda drop constraint if exists agenda_jenis_check;
alter table public.agenda add constraint agenda_jenis_check check (jenis in (
  'musyawarah','naik_kelas','sidang','pelantikan_bantara','pelantikan_laksana','pelantikan_garuda','lainnya',
  'pengembaraan','perkemahan','gelora_saka_expo','gladi_tangguh_1','gladi_tangguh_2','penempuhan_sku_laksana','ptgd','pembekalan_dewan'
));

-- ===== Usulan kegiatan (tahap L6b): tabel =====
-- Alur resmi di dalam aplikasi untuk kegiatan tahunan yang perlu diusulkan Dewan Ambalan dan disetujui Pembina (Musyawarah Ambalan dan
-- 10 kegiatan lain, lihat JENIS_USULAN di src/lib/kegiatanLogic.js): hanya Pradana atau Pradani (Penegak aktif berjabatan itu, atau akun
-- Dewan lama yang masih menjabat) dapat mengajukan, disertai jenis, tanggal usulan, dan tautan dokumen proposal (Google Drive,
-- dicetak/ditandatangani basah di luar aplikasi seperti dokumen lain). Hanya Pembina yang dapat meninjau: setuju (catatan opsional) atau
-- tolak (catatan WAJIB). Maksimal satu usulan berstatus 'menunggu' per (tahun ajaran, jenis) -- ditegakkan indeks unik parsial, harus
-- ditinjau dulu sebelum diajukan lagi untuk jenis yang sama. Persetujuan otomatis membuat entri di public.agenda (lihat sg_kegiatan_tinjau).
create table if not exists public.kegiatan_usulan (
  id bigint generated always as identity primary key,
  tahun_ajaran text not null check (tahun_ajaran ~ '^[0-9]{4}/[0-9]{4}$'),
  jenis text not null check (jenis in (
    'musyawarah','pelantikan_bantara','pelantikan_laksana','pengembaraan','perkemahan','gelora_saka_expo',
    'gladi_tangguh_1','gladi_tangguh_2','penempuhan_sku_laksana','ptgd','pembekalan_dewan'
  )),
  tanggal_usul date not null,
  dokumen_url text not null check (dokumen_url ~ '^https?://' and char_length(dokumen_url) <= 500),
  catatan text not null default '' check (char_length(catatan) <= 500),
  status text not null default 'menunggu' check (status in ('menunggu','disetujui','ditolak')),
  diajukan_oleh uuid references public.profiles(id) on delete set null,
  diajukan_oleh_nama text not null default '',
  diajukan_pada timestamptz not null default now(),
  ditinjau_oleh uuid references public.profiles(id) on delete set null,
  ditinjau_oleh_nama text not null default '',
  ditinjau_pada timestamptz,
  catatan_tinjauan text not null default '' check (char_length(catatan_tinjauan) <= 500),
  diping_pada timestamptz,
  agenda_id bigint references public.agenda(id) on delete set null,
  constraint kegiatan_usulan_tolak_wajib_catatan check (status <> 'ditolak' or char_length(btrim(catatan_tinjauan)) > 0)
);
create index if not exists kegiatan_usulan_tahun_ajaran_idx on public.kegiatan_usulan (tahun_ajaran);
create unique index if not exists kegiatan_usulan_menunggu_unik on public.kegiatan_usulan (tahun_ajaran, jenis) where status = 'menunggu';
-- ===== akhir tabel usulan kegiatan =====

alter table public.notifikasi drop constraint if exists notifikasi_jenis_check;
alter table public.notifikasi add constraint notifikasi_jenis_check
  check (jenis in ('ajukan','alih','mulai','hasil','pengingat','lama','sesi','surat','tes','eskalasi','agenda','musyawarah','kegiatan'));

alter table public.kegiatan_usulan enable row level security;
drop policy if exists baca_kegiatan_usulan on public.kegiatan_usulan;
create policy baca_kegiatan_usulan on public.kegiatan_usulan for select to authenticated using ((select sigarda.pengurus()));

-- ===== Usulan kegiatan (tahap L6b): peran ===== (dua fungsi bantu peran, dipakai migrasi L6b)
-- HANYA Pembina (bukan Admin); dipakai untuk keputusan yang sengaja tidak diberikan ke Admin (mis. meninjau usulan kegiatan).
create or replace function sigarda.pembina_saja() returns boolean language plpgsql stable security definer set search_path = public as
$$ begin
  return coalesce((select role = 'penguji' and jabatan = 'Pembina' and status = 'aktif' and not wajib_ganti_pin from public.profiles where id = auth.uid()), false);
end $$;

-- Pradana atau Pradani: Penegak aktif berjabatan itu (akun biasa), ATAU akun Dewan lama (jabatan Dewan Ambalan) yang belum diarsipkan dan
-- masih berjabatan itu (cermin sigarda.dewan(), sama-sama menerima kedua bentuk akun). Satu-satunya yang boleh mengajukan usulan kegiatan
-- (Musyawarah Ambalan dan 10 kegiatan lain, tahap L6b).
create or replace function sigarda.pradana_atau_pradani() returns boolean language plpgsql stable security definer set search_path = public as
$$ begin
  return coalesce((select ((role = 'peserta') or (role = 'penguji' and jabatan = 'Dewan Ambalan')) and status = 'aktif'
                   and jabatan_dewan in ('Pradana', 'Pradani') and not wajib_ganti_pin
                   from public.profiles where id = auth.uid()), false);
end $$;
-- ===== akhir peran usulan kegiatan =====

-- ===== Usulan Musyawarah Ambalan (tahap L6b): pengingat ===== (penanda keempat, fungsi SAMA; dipakai migrasi L6b)
-- ===== Usulan kegiatan lain (tahap L6b): pengingat ===== (penanda kelima, fungsi SAMA; dipakai migrasi L6b)
-- Pengingat harian (dijalankan pg_cron pukul 07.00 WIB): pengujian dan sesi ujian besok, pengajuan yang menunggu lebih dari 3 hari,
-- cadangan data yang sudah sebulan tidak diunduh (tahap L4), tangga eskalasi tidak bergerak (tahap L5), agenda tahunan H-30/H-7/H-1
-- (tahap L6), usulan Musyawarah Ambalan belum terjadwal H-60 lalu tiap 14 hari (tahap L6b), usulan 10 kegiatan lain belum terjadwal
-- H-30/H-60 lalu tiap 14 hari (tahap L6b, juga di luar jam senyap karena selalu berjalan 07.00 WIB), dan pembersihan notifikasi
-- berumur lebih dari 90 hari. Kunci membuat tiap pengingat terkirim sekali walau dijalankan berulang.
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
  delete from public.notifikasi where dibuat < now() - interval '90 days';
end $$;
-- ===== akhir pengingat cadangan =====
-- ===== akhir pengingat eskalasi =====
-- ===== akhir pengingat agenda =====
-- ===== akhir pengingat usulan musyawarah =====
-- ===== akhir pengingat usulan kegiatan lain =====

-- ===== Agenda tahunan (tahap L6): fungsi =====
-- Batas keras: Musyawarah Ambalan (pergantian kepengurusan) harus SEBELUM 1 Juli tahun kedua tahun ajaran (sebelum tahun ajaran
-- baru dan Naik Kelas dimulai). Dapat dilewati HANYA oleh Pembina (bukan Admin) lewat p_lewati_batas, atas usulan Dewan Ambalan
-- di luar aplikasi; cermin batasMusyawarah di src/lib/agendaLogic.js.
create or replace function sigarda.agenda_batas_musyawarah(p_tahun_ajaran text) returns date language sql immutable as
$$ select (split_part(p_tahun_ajaran, '/', 2) || '-07-01')::date $$;

-- Menyimpan (tambah bila p_id null, ubah bila terisi) satu kegiatan agenda. Pembina dan Admin. peserta_terkait dibatasi ke
-- Penegak aktif (maks 500 baris, cukup untuk pelantikan satu angkatan penuh).
create or replace function public.sg_agenda_simpan(
  p_id bigint, p_tahun_ajaran text, p_jenis text, p_judul text, p_tanggal date, p_keterangan text default '',
  p_peserta_terkait uuid[] default '{}', p_lewati_batas boolean default false
) returns bigint language plpgsql security definer set search_path = public as
$$
declare
  v_judul text := sigarda.rapikan(p_judul); v_ket text := btrim(coalesce(p_keterangan, ''));
  v_ids uuid[]; v_id uuid; v_lewati boolean := false; v_hasil_id bigint;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengatur agenda.'; end if;
  if not sigarda.tahun_ajaran_sah(p_tahun_ajaran) then raise exception 'Tahun ajaran tidak sah. Contoh: 2026/2027.'; end if;
  if p_jenis not in (
    'musyawarah','naik_kelas','sidang','pelantikan_bantara','pelantikan_laksana','pelantikan_garuda','lainnya',
    'pengembaraan','perkemahan','gelora_saka_expo','gladi_tangguh_1','gladi_tangguh_2','penempuhan_sku_laksana','ptgd','pembekalan_dewan'
  ) then
    raise exception 'Jenis kegiatan tidak dikenal.';
  end if;
  if v_judul = '' then raise exception 'Judul wajib diisi.'; end if;
  if char_length(v_judul) > 120 then raise exception 'Judul maksimal 120 karakter.'; end if;
  if p_tanggal is null then raise exception 'Tanggal wajib diisi.'; end if;
  if char_length(v_ket) > 500 then raise exception 'Keterangan maksimal 500 karakter.'; end if;

  -- lewati_batas hanya berlaku bila pemanggil benar Pembina (bukan Admin, bukan Dewan/Penegak).
  if p_lewati_batas is true and sigarda.pembina_saja() then
    v_lewati := true;
  end if;
  if p_jenis = 'musyawarah' and not v_lewati and p_tanggal >= sigarda.agenda_batas_musyawarah(p_tahun_ajaran) then
    raise exception 'Musyawarah Ambalan harus dijadwalkan sebelum 1 Juli % (sebelum tahun ajaran baru dan Naik Kelas). Hanya Pembina yang dapat melewati batas ini, atas usulan Dewan Ambalan.', split_part(p_tahun_ajaran, '/', 2);
  end if;

  v_ids := coalesce((select array_agg(distinct x) from unnest(p_peserta_terkait) x), '{}');
  if cardinality(v_ids) > 500 then raise exception 'Maksimal 500 Penegak terkait.'; end if;
  foreach v_id in array v_ids loop
    if not exists (select 1 from public.profiles where id = v_id and role = 'peserta' and status = 'aktif') then
      raise exception 'Salah satu Penegak terkait tidak ditemukan atau tidak aktif.';
    end if;
  end loop;

  if p_id is null then
    insert into public.agenda (tahun_ajaran, jenis, judul, tanggal, keterangan, peserta_terkait, lewati_batas, dibuat_oleh)
      values (p_tahun_ajaran, p_jenis, v_judul, p_tanggal, v_ket, v_ids, v_lewati, auth.uid())
      returning id into v_hasil_id;
  else
    update public.agenda set tahun_ajaran = p_tahun_ajaran, jenis = p_jenis, judul = v_judul, tanggal = p_tanggal,
      keterangan = v_ket, peserta_terkait = v_ids, lewati_batas = v_lewati, diubah_pada = now()
      where id = p_id;
    if not found then raise exception 'Kegiatan agenda tidak ditemukan.'; end if;
    v_hasil_id := p_id;
  end if;
  return v_hasil_id;
end $$;

create or replace function public.sg_agenda_hapus(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat menghapus agenda.'; end if;
  delete from public.agenda where id = p_id;
end $$;

-- Pengingat H-30, H-7, H-1: semua pengurus aktif, DITAMBAH Penegak pada peserta_terkait (bila ada dan masih aktif). Isi notifikasi
-- memakai judul dan keterangan agenda apa adanya (berlaku untuk jenis baku maupun 'lainnya', tanpa teks berbeda per jenis).
create or replace function sigarda.agenda_proses() returns void language plpgsql security definer set search_path = public as
$$
declare v_hari date := sigarda.hari_ini(); r record; v_x uuid; v_judul text; v_isi text;
begin
  for r in select id, judul, tanggal, keterangan, peserta_terkait from public.agenda where tanggal - v_hari in (30, 7, 1) loop
    v_judul := 'H-' || (r.tanggal - v_hari)::text || ': ' || r.judul;
    v_isi := case when r.keterangan <> '' then r.keterangan else 'Dijadwalkan ' || to_char(r.tanggal, 'DD-MM-YYYY') || '.' end;
    for v_x in select id from public.profiles where status = 'aktif' and (role in ('penguji','admin') or (role = 'peserta' and jabatan_dewan is not null)) loop
      perform sigarda.notif_buat(v_x, 'agenda', v_judul, v_isi, '{"tab":"agenda"}', 'agenda:' || r.id || ':' || v_hari);
    end loop;
    foreach v_x in array coalesce(r.peserta_terkait, '{}') loop
      if exists (select 1 from public.profiles where id = v_x and status = 'aktif') then
        perform sigarda.notif_buat(v_x, 'agenda', v_judul, v_isi, '{"tab":"agenda"}', 'agenda:' || r.id || ':' || v_hari);
      end if;
    end loop;
  end loop;
end $$;
-- ===== akhir fungsi agenda =====

-- ===== Usulan kegiatan (tahap L6b): fungsi =====
-- Judul bawaan (dipakai isi notifikasi dan entri Agenda saat disetujui) untuk tiap jenis usulan kegiatan.
create or replace function sigarda.kegiatan_judul_bawaan(p_jenis text) returns text language sql immutable as
$$
  select case p_jenis
    when 'musyawarah' then 'Musyawarah Ambalan'
    when 'pelantikan_bantara' then 'Pembayatan dan Pelantikan Bantara'
    when 'pelantikan_laksana' then 'Pelantikan Laksana'
    when 'pengembaraan' then 'Pengembaraan'
    when 'perkemahan' then 'Perkemahan'
    when 'gelora_saka_expo' then 'Gelora Saka Expo'
    when 'gladi_tangguh_1' then 'Gladi Tangguh 1'
    when 'gladi_tangguh_2' then 'Gladi Tangguh 2'
    when 'penempuhan_sku_laksana' then 'Penempuhan SKU Laksana'
    when 'ptgd' then 'PTGD (Penerimaan Tamu Gugus Depan)'
    when 'pembekalan_dewan' then 'Pembekalan Dewan Ambalan Angkatan Berikutnya'
    else initcap(replace(p_jenis, '_', ' '))
  end
$$;
-- Tanggal 1 pada bulan p_bulan di dalam tahun ajaran p_tahun_ajaran (Juli-Desember = tahun pertama, Januari-Juni = tahun kedua).
create or replace function sigarda.kegiatan_bulan_tanggal(p_tahun_ajaran text, p_bulan int) returns date language sql immutable as
$$
  select case when p_bulan >= 7
    then (split_part(p_tahun_ajaran, '/', 1) || '-' || lpad(p_bulan::text, 2, '0') || '-01')::date
    else (split_part(p_tahun_ajaran, '/', 2) || '-' || lpad(p_bulan::text, 2, '0') || '-01')::date
  end
$$;

-- Hanya Pradana atau Pradani dapat mengajukan; hanya Pembina dapat meninjau (bukan Admin). Persetujuan otomatis membuat entri di
-- public.agenda lewat sg_agenda_simpan sendiri (lewati_batas hanya true untuk jenis 'musyawarah' bila tanggalnya memang di atas batas
-- 1 Juli -- persetujuan Pembina INILAH bentuk "usulan Dewan Ambalan" yang boleh melewatinya; jenis lain tidak mengenal batas ini).
create or replace function public.sg_kegiatan_usul(p_jenis text, p_tahun_ajaran text, p_tanggal_usul date, p_dokumen_url text, p_catatan text default '')
returns bigint language plpgsql security definer set search_path = public as
$$
declare v_url text := btrim(coalesce(p_dokumen_url, '')); v_cat text := btrim(coalesce(p_catatan, '')); v_nama text; v_id bigint; v_x uuid; v_judul text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pradana_atau_pradani() then raise exception 'Hanya Pradana atau Pradani yang dapat mengajukan usulan kegiatan.'; end if;
  if p_jenis not in (
    'musyawarah', 'pelantikan_bantara', 'pelantikan_laksana', 'pengembaraan', 'perkemahan', 'gelora_saka_expo',
    'gladi_tangguh_1', 'gladi_tangguh_2', 'penempuhan_sku_laksana', 'ptgd', 'pembekalan_dewan'
  ) then raise exception 'Jenis kegiatan tidak dikenal.'; end if;
  if not sigarda.tahun_ajaran_sah(p_tahun_ajaran) then raise exception 'Tahun ajaran tidak sah. Contoh: 2026/2027.'; end if;
  if p_tanggal_usul is null then raise exception 'Tanggal usulan wajib diisi.'; end if;
  if v_url !~ '^https?://' or char_length(v_url) > 500 then raise exception 'Tautan dokumen proposal harus berupa alamat web (diawali http:// atau https://), maksimal 500 karakter.'; end if;
  if char_length(v_cat) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;
  v_judul := sigarda.kegiatan_judul_bawaan(p_jenis);
  if exists (select 1 from public.kegiatan_usulan where tahun_ajaran = p_tahun_ajaran and jenis = p_jenis and status = 'menunggu') then
    raise exception 'Sudah ada usulan % yang menunggu ditinjau untuk tahun ajaran ini. Tunggu Pembina meninjaunya (atau ingatkan lewat tombol pada usulan itu) sebelum mengajukan lagi.', v_judul;
  end if;
  select nama into v_nama from public.profiles where id = auth.uid();

  insert into public.kegiatan_usulan (tahun_ajaran, jenis, tanggal_usul, dokumen_url, catatan, diajukan_oleh, diajukan_oleh_nama)
    values (p_tahun_ajaran, p_jenis, p_tanggal_usul, v_url, v_cat, auth.uid(), coalesce(v_nama, ''))
    returning id into v_id;

  for v_x in select id from public.profiles where role = 'penguji' and jabatan = 'Pembina' and status = 'aktif' loop
    perform sigarda.notif_buat(v_x, 'kegiatan', 'Usulan ' || v_judul,
      coalesce(v_nama, 'Pradana/Pradani') || ' mengusulkan ' || v_judul || ' ' || to_char(p_tanggal_usul, 'DD-MM-YYYY') || '. Perlu ditinjau.',
      '{"tab":"agenda"}', 'kegiatan:' || v_id || ':diajukan');
  end loop;
  return v_id;
end $$;

-- Setuju (catatan opsional) atau tolak (catatan WAJIB). p_keputusan: 'disetujui' atau 'ditolak'.
create or replace function public.sg_kegiatan_tinjau(p_id bigint, p_keputusan text, p_catatan text default '') returns void
language plpgsql security definer set search_path = public as
$$
declare v_row public.kegiatan_usulan; v_cat text := btrim(coalesce(p_catatan, '')); v_nama text; v_agenda_id bigint; v_judul text; v_lewati boolean;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_saja() then raise exception 'Hanya Pembina yang dapat meninjau usulan kegiatan.'; end if;
  if p_keputusan not in ('disetujui', 'ditolak') then raise exception 'Keputusan harus disetujui atau ditolak.'; end if;
  select * into v_row from public.kegiatan_usulan where id = p_id;
  if not found then raise exception 'Usulan tidak ditemukan.'; end if;
  if v_row.status <> 'menunggu' then raise exception 'Usulan ini sudah ditinjau sebelumnya.'; end if;
  if p_keputusan = 'ditolak' and v_cat = '' then raise exception 'Catatan alasan penolakan wajib diisi.'; end if;
  if char_length(v_cat) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;
  v_judul := sigarda.kegiatan_judul_bawaan(v_row.jenis);
  select nama into v_nama from public.profiles where id = auth.uid();

  if p_keputusan = 'disetujui' then
    -- lewati_batas hanya diset true bila jenisnya 'musyawarah' DAN tanggal usulan memang di atas/pada batas 1 Juli -- jenis lain tidak
    -- mengenal batas ini, dan kolom itu tetap berarti "tanggal ini melewati batas" (bukan sekadar "melalui persetujuan ini").
    v_lewati := v_row.jenis = 'musyawarah' and v_row.tanggal_usul >= sigarda.agenda_batas_musyawarah(v_row.tahun_ajaran);
    v_agenda_id := public.sg_agenda_simpan(null, v_row.tahun_ajaran, v_row.jenis, v_judul, v_row.tanggal_usul, v_row.catatan, '{}', v_lewati);
  end if;

  update public.kegiatan_usulan set status = p_keputusan, ditinjau_oleh = auth.uid(), ditinjau_oleh_nama = coalesce(v_nama, ''),
    ditinjau_pada = now(), catatan_tinjauan = v_cat, agenda_id = v_agenda_id
    where id = p_id;

  perform sigarda.notif_buat(v_row.diajukan_oleh, 'kegiatan',
    case when p_keputusan = 'disetujui' then 'Usulan ' || v_judul || ' disetujui' else 'Usulan ' || v_judul || ' ditolak' end,
    case when p_keputusan = 'disetujui' then 'Tanggal ' || to_char(v_row.tanggal_usul, 'DD-MM-YYYY') || ' oleh ' || coalesce(v_nama, 'Pembina') || '.'
         else 'Oleh ' || coalesce(v_nama, 'Pembina') || ': ' || v_cat end,
    '{"tab":"agenda"}', 'kegiatan:' || p_id || ':' || p_keputusan);
end $$;

-- Pradana/Pradani mengingatkan lagi semua Pembina tentang usulan yang masih menunggu (dibatasi sekali per 24 jam agar tidak dipakai spam).
create or replace function public.sg_kegiatan_ping(p_id bigint) returns void language plpgsql security definer set search_path = public as
$$
declare v_row public.kegiatan_usulan; v_x uuid; v_judul text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pradana_atau_pradani() then raise exception 'Hanya Pradana atau Pradani yang dapat mengingatkan Pembina.'; end if;
  select * into v_row from public.kegiatan_usulan where id = p_id;
  if not found or v_row.status <> 'menunggu' then raise exception 'Usulan ini tidak lagi menunggu tinjauan.'; end if;
  if v_row.diping_pada is not null and v_row.diping_pada > now() - interval '24 hours' then
    raise exception 'Sudah mengingatkan dalam 24 jam terakhir. Coba lagi nanti.';
  end if;
  v_judul := sigarda.kegiatan_judul_bawaan(v_row.jenis);
  update public.kegiatan_usulan set diping_pada = now() where id = p_id;
  for v_x in select id from public.profiles where role = 'penguji' and jabatan = 'Pembina' and status = 'aktif' loop
    perform sigarda.notif_buat(v_x, 'kegiatan', 'Pengingat: usulan ' || v_judul || ' menunggu',
      'Usulan tanggal ' || to_char(v_row.tanggal_usul, 'DD-MM-YYYY') || ' masih menunggu ditinjau.', '{"tab":"agenda"}',
      'kegiatan:' || p_id || ':ping:' || to_char(now(), 'YYYY-MM-DD'));
  end loop;
end $$;

-- Pengingat H-60 (lalu tiap 14 hari) ke semua pengurus dan Dewan Ambalan bila tahun ajaran berjalan BELUM punya entri Agenda Musyawarah
-- Ambalan (artinya belum ada usulan yang disetujui), berlanjut sampai ada yang disetujui (tanpa batas atas, walau sudah lewat 1 Juli).
create or replace function sigarda.musyawarah_pengingat() returns void language plpgsql security definer set search_path = public as
$$
declare v_ta text := sigarda.tahun_ajaran_kini(); v_hari date := sigarda.hari_ini(); v_batas date; v_x uuid; v_kunci text; v_isi text;
begin
  v_batas := sigarda.agenda_batas_musyawarah(v_ta);
  if v_hari < v_batas - 60 then return; end if;
  if exists (select 1 from public.agenda where tahun_ajaran = v_ta and jenis = 'musyawarah') then return; end if;
  v_kunci := 'musyawarah-pengingat:' || v_ta || ':' || ((v_hari - date '2000-01-01') / 14)::text;
  v_isi := case when exists (select 1 from public.kegiatan_usulan where tahun_ajaran = v_ta and jenis = 'musyawarah' and status = 'menunggu')
    then 'Ada usulan yang menunggu ditinjau Pembina. Batas 1 Juli ' || split_part(v_ta, '/', 2) || '.'
    else 'Belum ada usulan. Pradana atau Pradani dapat mengajukan lewat menu Agenda. Batas 1 Juli ' || split_part(v_ta, '/', 2) || '.' end;
  for v_x in select id from public.profiles where status = 'aktif' and (role in ('penguji','admin') or (role = 'peserta' and jabatan_dewan is not null)) loop
    perform sigarda.notif_buat(v_x, 'musyawarah', 'Musyawarah Ambalan belum terjadwal', v_isi, '{"tab":"agenda"}', v_kunci);
  end loop;
end $$;

-- Pengingat H-30/H-60 (lalu tiap 14 hari) ke semua pengurus dan Dewan Ambalan untuk 10 jenis kegiatan lain (di luar Musyawarah Ambalan,
-- yang punya pengingat sendiri di sigarda.musyawarah_pengingat di atas) bila tahun ajaran berjalan belum punya entri Agenda jenis itu,
-- berlanjut sampai ada yang disetujui. Tiap jenis punya 1-2 bulan sasaran per tahun; bila 2, H-N dihitung dari yang PALING AWAL (yang
-- kedua tidak menambah pengingat baru karena pengingat sudah berjalan tiap 14 hari sejak yang pertama sampai ada usulan disetujui).
create or replace function sigarda.kegiatan_pengingat() returns void language plpgsql security definer set search_path = public as
$$
declare v_ta text := sigarda.tahun_ajaran_kini(); v_hari date := sigarda.hari_ini(); v_x uuid; v_kunci text; v_isi text; v_judul text;
  v_cfg record; v_mulai date;
begin
  for v_cfg in select * from (values
    ('pelantikan_bantara', 30, 12, 2::int),
    ('pelantikan_laksana', 30, 4, 6),
    ('pengembaraan', 30, 12, 2),
    ('perkemahan', 30, 12, 2),
    ('gelora_saka_expo', 30, 9, null),
    ('gladi_tangguh_1', 30, 12, 2),
    ('gladi_tangguh_2', 30, 4, 6),
    ('penempuhan_sku_laksana', 30, 12, 2),
    ('ptgd', 60, 7, null),
    ('pembekalan_dewan', 30, 8, null)
  ) as t(jenis, h_n, bulan1, bulan2) loop
    if exists (select 1 from public.agenda where tahun_ajaran = v_ta and jenis = v_cfg.jenis) then continue; end if;
    v_mulai := sigarda.kegiatan_bulan_tanggal(v_ta, v_cfg.bulan1) - v_cfg.h_n;
    if v_cfg.bulan2 is not null then
      v_mulai := least(v_mulai, sigarda.kegiatan_bulan_tanggal(v_ta, v_cfg.bulan2) - v_cfg.h_n);
    end if;
    if v_hari < v_mulai then continue; end if;
    v_judul := sigarda.kegiatan_judul_bawaan(v_cfg.jenis);
    v_kunci := 'kegiatan-pengingat:' || v_cfg.jenis || ':' || v_ta || ':' || ((v_hari - date '2000-01-01') / 14)::text;
    v_isi := case when exists (select 1 from public.kegiatan_usulan where tahun_ajaran = v_ta and jenis = v_cfg.jenis and status = 'menunggu')
      then 'Ada usulan yang menunggu ditinjau Pembina.'
      else 'Belum ada usulan. Pradana atau Pradani dapat mengajukan lewat menu Agenda.' end;
    for v_x in select id from public.profiles where status = 'aktif' and (role in ('penguji','admin') or (role = 'peserta' and jabatan_dewan is not null)) loop
      perform sigarda.notif_buat(v_x, 'kegiatan', v_judul || ' belum terjadwal', v_isi, '{"tab":"agenda"}', v_kunci);
    end loop;
  end loop;
end $$;
-- ===== akhir fungsi usulan kegiatan =====

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
      'sesi_ujian_peserta', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sesi_ujian_peserta t),
      'agenda', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.agenda t),
      'kegiatan_usulan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.kegiatan_usulan t)
    )
  ) into v_hasil;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada)
    values ('cadangan.terakhir', jsonb_build_object('pada', now(), 'oleh', (select nama from public.profiles where id = auth.uid())), auth.uid(), now())
    on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
  return v_hasil;
end $$;

grant select on public.kegiatan_usulan to authenticated;
revoke all on function public.sg_kegiatan_usul(text, text, date, text, text), public.sg_kegiatan_tinjau(bigint, text, text), public.sg_kegiatan_ping(bigint) from public, anon, authenticated;
grant execute on function public.sg_kegiatan_usul(text, text, date, text, text), public.sg_kegiatan_tinjau(bigint, text, text), public.sg_kegiatan_ping(bigint) to authenticated;
-- Fungsi sigarda.* baru (pembina_saja, pradana_atau_pradani, kegiatan_judul_bawaan, kegiatan_bulan_tanggal, musyawarah_pengingat,
-- kegiatan_pengingat): hak dijalankan ulang di sini (grant "all functions in schema" tidak retroaktif untuk fungsi baru migrasi ini).
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
