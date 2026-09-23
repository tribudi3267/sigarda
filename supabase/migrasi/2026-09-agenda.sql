-- ============================================================================
-- MIGRASI: Agenda tahunan (tahap L6). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi eskalasi (dan yang sebelumnya). Isi:
--   * Tabel public.agenda (kegiatan tahunan Ambalan: musyawarah, naik_kelas, sidang, tiga pelantikan, atau 'lainnya'
--     dengan judul bebas). Dibaca semua yang sudah masuk (RLS); ditulis hanya lewat fungsi di bawah.
--   * sg_agenda_simpan(...): tambah/ubah satu kegiatan (Pembina dan Admin). Musyawarah Ambalan wajib sebelum 1 Juli
--     tahun kedua tahun ajaran, KECUALI Pembina (bukan Admin) mencentang "lewati batas".
--   * sg_agenda_hapus(id): menghapus satu kegiatan (Pembina dan Admin).
--   * sigarda.agenda_proses(): pengingat H-30/H-7/H-1 ke semua pengurus DAN Penegak pada peserta_terkait (bila ada).
--     Dipanggil dari sigarda.notif_pengingat() (pengingat harian 07.00 WIB, otomatis di luar jam senyap).
--   * notifikasi.jenis menerima nilai 'agenda'.
-- sigarda.notif_pengingat() ditulis ulang penuh (create or replace); bagian pengingat lain tidak berubah.
-- Edge Function TIDAK berubah dan tidak perlu di-deploy ulang. TIDAK menghapus data yang ada. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: eskalasi (migrasi terakhir sebelum ini) sudah ada.
do $$
begin
  if to_regprocedure('public.sg_profil_whatsapp_atur(text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-eskalasi.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

-- ===== Agenda tahunan (tahap L6): tabel =====
-- Kegiatan tahunan Ambalan: 6 jenis baku (musyawarah, naik_kelas, sidang, tiga pelantikan) atau 'lainnya' (judul bebas).
-- peserta_terkait (opsional): Penegak yang ikut diberi tahu pengingat H-30/H-7/H-1 selain semua pengurus (mis. calon sidang/pelantikan).
-- lewati_batas: HANYA berlaku untuk jenis 'musyawarah' dan HANYA dapat diset true oleh Pembina (bukan Admin), atas usulan Dewan Ambalan di
-- luar aplikasi -- melewati batas "harus sebelum 1 Juli tahun kedua" (pergantian kepengurusan sebelum tahun ajaran baru).
create table if not exists public.agenda (
  id bigint generated always as identity primary key,
  tahun_ajaran text not null check (tahun_ajaran ~ '^[0-9]{4}/[0-9]{4}$'),
  jenis text not null check (jenis in ('musyawarah','naik_kelas','sidang','pelantikan_bantara','pelantikan_laksana','pelantikan_garuda','lainnya')),
  judul text not null check (char_length(btrim(judul)) between 1 and 120),
  tanggal date not null,
  keterangan text not null default '' check (char_length(keterangan) <= 500),
  peserta_terkait uuid[] not null default '{}',
  lewati_batas boolean not null default false,
  dibuat_oleh uuid references public.profiles(id) on delete set null,
  dibuat_pada timestamptz not null default now(),
  diubah_pada timestamptz not null default now()
);
create index if not exists agenda_tahun_ajaran_idx on public.agenda (tahun_ajaran);
create index if not exists agenda_tanggal_idx on public.agenda (tanggal);
-- ===== akhir tabel agenda =====

alter table public.notifikasi drop constraint if exists notifikasi_jenis_check;
alter table public.notifikasi add constraint notifikasi_jenis_check
  check (jenis in ('ajukan','alih','mulai','hasil','pengingat','lama','sesi','surat','tes','eskalasi','agenda'));

alter table public.agenda enable row level security;
drop policy if exists baca_agenda on public.agenda;
create policy baca_agenda on public.agenda for select to authenticated using ((select sigarda.aktif()));

-- ===== Agenda tahunan (tahap L6): pengingat ===== (penanda ketiga yang membungkus fungsi SAMA; dipakai migrasi L6)
-- Pengingat harian (dijalankan pg_cron pukul 07.00 WIB): pengujian dan sesi ujian besok, pengajuan yang menunggu lebih dari 3 hari,
-- cadangan data yang sudah sebulan tidak diunduh (tahap L4), tangga eskalasi tidak bergerak (tahap L5), agenda tahunan H-30/H-7/H-1
-- (tahap L6, juga di luar jam senyap karena selalu berjalan 07.00 WIB), dan pembersihan notifikasi berumur lebih dari 90 hari.
-- Kunci membuat tiap pengingat terkirim sekali walau dijalankan berulang.
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
  delete from public.notifikasi where dibuat < now() - interval '90 days';
end $$;
-- ===== akhir pengingat cadangan =====
-- ===== akhir pengingat eskalasi =====
-- ===== akhir pengingat agenda =====

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
  if p_jenis not in ('musyawarah','naik_kelas','sidang','pelantikan_bantara','pelantikan_laksana','pelantikan_garuda','lainnya') then
    raise exception 'Jenis kegiatan tidak dikenal.';
  end if;
  if v_judul = '' then raise exception 'Judul wajib diisi.'; end if;
  if char_length(v_judul) > 120 then raise exception 'Judul maksimal 120 karakter.'; end if;
  if p_tanggal is null then raise exception 'Tanggal wajib diisi.'; end if;
  if char_length(v_ket) > 500 then raise exception 'Keterangan maksimal 500 karakter.'; end if;

  -- lewati_batas hanya berlaku bila pemanggil benar Pembina (bukan Admin, bukan Dewan/Penegak).
  if p_lewati_batas is true and coalesce((select role = 'penguji' and jabatan = 'Pembina' from public.profiles where id = auth.uid()), false) then
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

grant select on public.agenda to authenticated;
revoke all on function public.sg_agenda_simpan(bigint, text, text, text, date, text, uuid[], boolean), public.sg_agenda_hapus(bigint) from public, anon, authenticated;
grant execute on function public.sg_agenda_simpan(bigint, text, text, text, date, text, uuid[], boolean), public.sg_agenda_hapus(bigint) to authenticated;
-- Fungsi sigarda.agenda_* baru: hak dijalankan ulang di sini (grant "all functions in schema" tidak retroaktif untuk fungsi baru).
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
