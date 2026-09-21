-- ============================================================================
-- MIGRASI: Status anggota (aktif, nonaktif, alumni) dan naik kelas massal (fase 6a). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi jenis kelamin (dan yang sebelumnya). Isi:
--   * profiles.status ('aktif' | 'nonaktif' | 'alumni'; semua akun yang ada tetap 'aktif'), status_pada, dan lulus_ta (tahun ajaran kelulusan alumni).
--     Penegak nonaktif (tidak melanjutkan Pramuka, masih siswa) dan alumni (sudah lulus) hanya dapat DILIHAT dan dicetak: pemicu di server menolak
--     setiap penulisan yang menyangkut mereka (pengajuan, hasil uji, absensi, iuran, portofolio, raport, sesi ujian, Calon Garuda).
--   * Tabel naik_kelas_batch dan naik_kelas_log (riwayat, hanya bertambah; dibaca pengurus, ditulis hanya lewat fungsi).
--   * sg_naik_kelas (Admin; pratinjau lalu terapkan; semua atau tidak sama sekali), sg_naik_kelas_batalkan (Admin; kenaikan terakhir),
--     sg_anggota_status_atur (Admin dan Pembina: aktifkan kembali atau nonaktifkan satu Penegak; alumni hanya Admin).
--   * sg_absen_set_banyak, sg_iuran_set_banyak, sg_iuran_lembar, dan sg_push_ringkasan kini hanya memuat Penegak aktif; asisten bendahara harus aktif
--     (sigarda.asisten_iuran), dan penunjukan asisten dicabut saat Penegak menjadi nonaktif atau alumni.
--   Tanda tangan fungsi yang dipanggil Edge Function tidak berubah: Edge Function TIDAK perlu di-deploy ulang.
-- TIDAK menghapus data yang ada. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: skema dasar dan migrasi sebelumnya (sampai jenis kelamin) sudah ada.
do $$
begin
  if to_regclass('public.profiles') is null or to_regprocedure('sigarda.wajib_admin(text)') is null
     or to_regprocedure('public.sg_anggota_jk_atur(jsonb)') is null or to_regprocedure('public.sg_push_ringkasan()') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-jenis-kelamin.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

alter table public.profiles add column if not exists status text not null default 'aktif' check (status in ('aktif','nonaktif','alumni'));
alter table public.profiles add column if not exists status_pada date;
alter table public.profiles add column if not exists lulus_ta text check (lulus_ta is null or lulus_ta ~ '^[0-9]{4}/[0-9]{4}$');

-- ===== Naik kelas dan status anggota: tabel =====
-- Kolom status, status_pada, dan lulus_ta ada di profiles. Satu kenaikan kelas massal = satu baris naik_kelas_batch + satu baris naik_kelas_log per Penegak
-- (hanya bertambah; menyimpan keadaan sebelum dan sesudah agar dapat dibatalkan). Perubahan status satu orang tercatat di naik_kelas_log tanpa batch.
create table if not exists public.naik_kelas_batch (
  id bigint generated always as identity primary key,
  waktu timestamptz not null default now(),
  tahun_ajaran text not null check (tahun_ajaran ~ '^[0-9]{4}/[0-9]{4}$'),           -- tahun ajaran yang baru dimulai
  ringkasan jsonb not null default '{}'::jsonb,
  oleh uuid references public.profiles(id) on delete set null,
  oleh_nama text not null default '',
  dibatalkan_pada timestamptz,
  dibatalkan_oleh uuid references public.profiles(id) on delete set null
);
create table if not exists public.naik_kelas_log (
  id bigint generated always as identity primary key,
  batch_id bigint references public.naik_kelas_batch(id) on delete cascade,
  waktu timestamptz not null default now(),
  peserta_id uuid references public.profiles(id) on delete set null,
  peserta_nama text not null,
  nis text not null default '',
  aksi text not null check (aksi in ('lanjut','tidak_lanjut','lulus','aktifkan','nonaktifkan')),
  dari_kelas text, ke_kelas text,
  dari_status text not null check (dari_status in ('aktif','nonaktif','alumni')),
  ke_status text not null check (ke_status in ('aktif','nonaktif','alumni')),
  dari_status_pada date,
  dari_lulus_ta text,
  catatan text not null default '' check (char_length(catatan) <= 200),
  oleh uuid references public.profiles(id) on delete set null,
  oleh_nama text not null default ''
);
create index if not exists naik_kelas_log_batch_idx on public.naik_kelas_log (batch_id);
create index if not exists naik_kelas_log_peserta_idx on public.naik_kelas_log (peserta_id, id);
-- ===== akhir tabel naik kelas =====

-- ===== Naik kelas dan status anggota: fungsi =====
-- Penegak berstatus nonaktif atau alumni hanya dapat DILIHAT (dan dicetak). Semua penulisan yang menyangkut Penegak itu ditolak pemicu di bawah,
-- sehingga tidak bergantung pada tiap fungsi aksi. Pembaruan yang dipicu tindakan kunci asing (mis. penguji_id menjadi kosong saat akun
-- penguji dihapus) bukan penulisan pengguna dan dilewati (pg_trigger_depth() > 1). Fungsi naik kelas membatalkan pengajuan SEBELUM mengubah status.
create or replace function sigarda.tolak_peserta_tak_aktif() returns trigger language plpgsql security definer set search_path = public as
$$
declare v_status text; v_nama text;
begin
  if TG_OP = 'UPDATE' and pg_trigger_depth() > 1 then return new; end if;
  select status, nama into v_status, v_nama from public.profiles where id = new.peserta_id;
  if v_status is not null and v_status <> 'aktif' then
    if new.peserta_id = auth.uid() then
      raise exception 'Akun Anda berstatus % dan hanya dapat dilihat. Hubungi Pembina atau Admin Gudep bila ingin aktif kembali.', v_status;
    end if;
    raise exception '% berstatus % dan tidak dapat diubah. Aktifkan kembali lebih dulu di menu Anggota.', v_nama, v_status;
  end if;
  return new;
end $$;
drop trigger if exists tak_aktif_sku_progress on public.sku_progress;
create trigger tak_aktif_sku_progress before insert or update on public.sku_progress for each row execute function sigarda.tolak_peserta_tak_aktif();
drop trigger if exists tak_aktif_sku_riwayat on public.sku_riwayat;
create trigger tak_aktif_sku_riwayat before insert or update on public.sku_riwayat for each row execute function sigarda.tolak_peserta_tak_aktif();
drop trigger if exists tak_aktif_absensi_hadir on public.absensi_hadir;
create trigger tak_aktif_absensi_hadir before insert or update on public.absensi_hadir for each row execute function sigarda.tolak_peserta_tak_aktif();
drop trigger if exists tak_aktif_iuran on public.iuran;
create trigger tak_aktif_iuran before insert or update on public.iuran for each row execute function sigarda.tolak_peserta_tak_aktif();
drop trigger if exists tak_aktif_iuran_log on public.iuran_log;
create trigger tak_aktif_iuran_log before insert or update on public.iuran_log for each row execute function sigarda.tolak_peserta_tak_aktif();
drop trigger if exists tak_aktif_asisten_iuran on public.asisten_iuran;
create trigger tak_aktif_asisten_iuran before insert or update on public.asisten_iuran for each row execute function sigarda.tolak_peserta_tak_aktif();
drop trigger if exists tak_aktif_portofolio on public.portofolio;
create trigger tak_aktif_portofolio before insert or update on public.portofolio for each row execute function sigarda.tolak_peserta_tak_aktif();
drop trigger if exists tak_aktif_portofolio_jurnal on public.portofolio_jurnal;
create trigger tak_aktif_portofolio_jurnal before insert or update on public.portofolio_jurnal for each row execute function sigarda.tolak_peserta_tak_aktif();
drop trigger if exists tak_aktif_sku_penilaian on public.sku_penilaian;
create trigger tak_aktif_sku_penilaian before insert or update on public.sku_penilaian for each row execute function sigarda.tolak_peserta_tak_aktif();
drop trigger if exists tak_aktif_raport on public.raport;
create trigger tak_aktif_raport before insert or update on public.raport for each row execute function sigarda.tolak_peserta_tak_aktif();
drop trigger if exists tak_aktif_sesi_peserta on public.sesi_ujian_peserta;
create trigger tak_aktif_sesi_peserta before insert or update on public.sesi_ujian_peserta for each row execute function sigarda.tolak_peserta_tak_aktif();

-- Status Calon Garuda hanya untuk Penegak yang aktif (diberikan sendiri lewat sg_calon_garuda_daftar atau oleh Admin lewat sg_anggota_ubah).
create or replace function sigarda.tolak_calon_garuda_tak_aktif() returns trigger language plpgsql as
$$
begin
  if new.calon_garuda is not null and new.calon_garuda is distinct from old.calon_garuda and new.status <> 'aktif' then
    raise exception 'Status Calon Garuda hanya dapat diberikan kepada Penegak yang aktif.';
  end if;
  return new;
end $$;
drop trigger if exists tak_aktif_calon_garuda on public.profiles;
create trigger tak_aktif_calon_garuda before update of calon_garuda on public.profiles for each row execute function sigarda.tolak_calon_garuda_tak_aktif();

-- Tingkat kelas dari rombel baku: X = 1, XI = 2, XII = 3 (kosong bila bukan rombel baku). Dicerminkan src/lib/naikKelasLogic.js.
create or replace function sigarda.tingkat_rombel(p_rombel text) returns int language sql immutable as
$$ select case when sigarda.rombel_sah(p_rombel) then array_position(array['X', 'XI', 'XII'], split_part(p_rombel, '-', 1)) end $$;

-- Membatalkan pengajuan dan pengujian yang masih berjalan milik satu Penegak (mengeluarkannya dari sesi ujian yang belum selesai dan mencabut
-- penunjukannya sebagai asisten bendahara), sebelum ia dinonaktifkan atau menjadi alumni. Mengembalikan jumlah pengajuan yang dibatalkan.
-- Dipanggil SEBELUM status diubah.
create or replace function sigarda.batalkan_pengajuan_berjalan(p_peserta uuid, p_alasan text) returns int
language plpgsql security definer set search_path = public as
$$
declare v_n int := 0; v_sku text;
begin
  for v_sku in select sku_id from public.sku_progress where peserta_id = p_peserta and status in ('diajukan', 'proses') loop
    update public.sku_progress
      set status = 'belum', penguji_id = null, tanggal_uji = null, jadwal = null, nilai = null, catatan = '', catatan_peserta = '',
          verifikasi = null, diverifikasi_pada = null, verifikasi_token = null, diubah = now()
      where peserta_id = p_peserta and sku_id = v_sku;
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (p_peserta, v_sku, p_alasan, auth.uid());
    v_n := v_n + 1;
  end loop;
  delete from public.sesi_ujian_peserta sp using public.sesi_ujian s
    where s.id = sp.sesi_id and sp.peserta_id = p_peserta and s.status <> 'selesai';
  delete from public.asisten_iuran where peserta_id = p_peserta;
  return v_n;
end $$;

-- Kenaikan kelas massal (Admin Gudep). p_tahun_ajaran = tahun ajaran yang BARU dimulai (mis. 2027/2028). p_data = [{"username": "10231", "rombel": "XI-04",
-- "aksi": "lanjut"}, ...] (username = NIS). aksi: 'lanjut' (aktif di rombel baru), 'tidak_lanjut' (nonaktif; rombel baru boleh kosong = rombel terakhir tetap),
-- 'lulus' (alumni; lulus pada tahun ajaran sebelum p_tahun_ajaran). Baris tanpa aksi dilewati oleh klien.
-- p_terapkan = false: PRATINJAU (tidak mengubah apa pun). true: menerapkan SEMUA atau tidak sama sekali (satu baris keliru membatalkan semuanya) dan membuat
-- batch yang dapat dibatalkan (sg_naik_kelas_batalkan). Hasil: { galat, ringkasan, baris: [{ no, id, username, nama, aksi, dari_kelas, dari_status, ke_kelas,
-- ke_status, hasil: 'ubah' | 'sama' | 'galat', pesan: [...] }], batch }. Penegak yang menjadi nonaktif atau alumni kehilangan pengajuan uji yang masih berjalan.
create or replace function public.sg_naik_kelas(p_tahun_ajaran text, p_data jsonb, p_terapkan boolean default false) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  v_e jsonb; v_no int := 0; v_user text; v_aksi text; v_rombel text; v_t public.profiles; v_ke_kelas text; v_ke_status text;
  v_hasil text; v_pesan text[]; v_baris jsonb := '[]'::jsonb; v_pakai text[] := '{}'; v_galat int := 0;
  v_lanjut int := 0; v_tidak int := 0; v_lulus int := 0; v_sama int := 0; v_berjalan int; v_berjalan_total int := 0; v_batal int := 0;
  v_ringkas jsonb; v_batch bigint; v_oleh text; v_lulus_ta text; v_tk_lama int; v_tk_baru int; v_id uuid; v_teks text;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat menaikkan kelas.');
  if not sigarda.tahun_ajaran_sah(p_tahun_ajaran) then raise exception 'Tahun ajaran tidak sah. Contoh: 2027/2028.'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'array' then raise exception 'Data naik kelas tidak valid.'; end if;
  if jsonb_array_length(p_data) > 1500 then raise exception 'Maksimal 1500 baris per permintaan.'; end if;
  v_lulus_ta := (split_part(p_tahun_ajaran, '/', 1)::int - 1) || '/' || split_part(p_tahun_ajaran, '/', 1);

  for v_e in select * from jsonb_array_elements(p_data) loop
    v_no := v_no + 1;
    v_user := lower(btrim(coalesce(v_e ->> 'username', '')));
    v_aksi := lower(btrim(coalesce(v_e ->> 'aksi', '')));
    v_rombel := nullif(sigarda.rombel_baku(v_e ->> 'rombel'), '');
    v_pesan := '{}'; v_hasil := 'ubah'; v_ke_kelas := null; v_ke_status := null; v_berjalan := 0;
    select * into v_t from public.profiles where username = v_user and role = 'peserta';
    if not found then
      v_hasil := 'galat'; v_pesan := array['Penegak dengan NIS "' || v_user || '" tidak ditemukan.'];
    elsif v_user = any (v_pakai) then
      v_hasil := 'galat'; v_pesan := array['NIS ' || v_user || ' muncul lebih dari sekali dalam berkas.'];
    elsif v_aksi not in ('lanjut', 'tidak_lanjut', 'lulus') then
      v_hasil := 'galat'; v_pesan := array['Aksi "' || v_aksi || '" tidak dikenal. Gunakan Lanjut, Tidak lanjut, atau Lulus.'];
    elsif v_t.status = 'alumni' then
      v_hasil := 'galat'; v_pesan := array['Sudah alumni. Aktifkan kembali lebih dulu di menu Anggota bila perlu.'];
    elsif v_aksi = 'lanjut' and not sigarda.rombel_sah(v_rombel) then
      v_hasil := 'galat'; v_pesan := array['Rombel baru wajib diisi dengan benar (X-01 sampai X-10, XI-01 sampai XI-10, XII-01 sampai XII-10).'];
    elsif v_aksi = 'tidak_lanjut' and v_rombel is not null and not sigarda.rombel_sah(v_rombel) then
      v_hasil := 'galat'; v_pesan := array['Rombel baru "' || v_rombel || '" tidak sah.'];
    end if;
    if v_user <> '' then v_pakai := v_pakai || v_user; end if;

    if v_hasil = 'ubah' then
      if v_aksi = 'lanjut' then v_ke_kelas := v_rombel; v_ke_status := 'aktif';
      elsif v_aksi = 'tidak_lanjut' then v_ke_kelas := coalesce(v_rombel, v_t.kelas); v_ke_status := 'nonaktif';
      else v_ke_kelas := v_t.kelas; v_ke_status := 'alumni'; end if;
      if v_ke_kelas is not distinct from v_t.kelas and v_ke_status = v_t.status then
        v_hasil := 'sama'; v_sama := v_sama + 1;
      else
        v_tk_lama := sigarda.tingkat_rombel(v_t.kelas); v_tk_baru := sigarda.tingkat_rombel(v_ke_kelas);
        if v_aksi <> 'lulus' and v_ke_kelas is distinct from v_t.kelas and v_tk_lama is not null and v_tk_baru is not null then
          if v_tk_baru = v_tk_lama then v_pesan := v_pesan || ('Tingkat tidak naik (' || v_t.kelas || ' ke ' || v_ke_kelas || ').');
          elsif v_tk_baru < v_tk_lama then v_pesan := v_pesan || ('Tingkat turun (' || v_t.kelas || ' ke ' || v_ke_kelas || ').');
          elsif v_tk_baru > v_tk_lama + 1 then v_pesan := v_pesan || ('Tingkat melompat (' || v_t.kelas || ' ke ' || v_ke_kelas || ').'); end if;
        end if;
        if v_aksi = 'lulus' and coalesce(v_tk_lama, 0) <> 3 then v_pesan := v_pesan || ('Bukan kelas XII (kelas ' || coalesce(v_t.kelas, '-') || ').'); end if;
        if v_ke_status <> 'aktif' then
          select count(*)::int into v_berjalan from public.sku_progress where peserta_id = v_t.id and status in ('diajukan', 'proses');
          if v_berjalan > 0 then v_pesan := v_pesan || (v_berjalan || ' pengajuan uji yang masih berjalan akan dibatalkan.'); end if;
          if v_t.calon_garuda is not null then v_pesan := array_append(v_pesan, 'Calon Garuda: pastikan portofolio dan penilaian Garuda sudah selesai; sesudah ini hanya dapat dilihat.'); end if;
        end if;
        v_berjalan_total := v_berjalan_total + v_berjalan;
        if v_aksi = 'lanjut' then v_lanjut := v_lanjut + 1; elsif v_aksi = 'tidak_lanjut' then v_tidak := v_tidak + 1; else v_lulus := v_lulus + 1; end if;
      end if;
    else
      v_galat := v_galat + 1;
    end if;

    v_baris := v_baris || jsonb_build_array(jsonb_build_object(
      'no', v_no, 'id', v_t.id, 'username', v_user, 'nama', coalesce(v_t.nama, ''), 'aksi', v_aksi, 'dari_kelas', v_t.kelas, 'dari_status', v_t.status,
      'ke_kelas', v_ke_kelas, 'ke_status', v_ke_status, 'hasil', v_hasil, 'pesan', to_jsonb(v_pesan)));
  end loop;

  v_ringkas := jsonb_build_object('lanjut', v_lanjut, 'tidak_lanjut', v_tidak, 'lulus', v_lulus, 'sama', v_sama, 'galat', v_galat, 'pengajuan_batal', v_berjalan_total);

  if p_terapkan then
    if v_galat > 0 then raise exception 'Ada % baris bermasalah, jadi tidak ada yang diubah. Periksa pratinjau, perbaiki berkas, lalu coba lagi.', v_galat; end if;
    if v_lanjut + v_tidak + v_lulus = 0 then raise exception 'Tidak ada perubahan yang perlu diterapkan.'; end if;
    select nama into v_oleh from public.profiles where id = auth.uid();
    insert into public.naik_kelas_batch (tahun_ajaran, ringkasan, oleh, oleh_nama)
    values (p_tahun_ajaran, v_ringkas, auth.uid(), coalesce(v_oleh, '')) returning id into v_batch;
    for v_e in select * from jsonb_array_elements(v_baris) loop
      if v_e ->> 'hasil' <> 'ubah' then continue; end if;
      v_id := (v_e ->> 'id')::uuid;
      v_ke_status := v_e ->> 'ke_status';
      if v_ke_status <> 'aktif' then
        v_teks := case when v_ke_status = 'alumni' then 'Pengajuan dibatalkan: Penegak menjadi alumni' else 'Pengajuan dibatalkan: Penegak tidak melanjutkan Pramuka' end;
        v_batal := v_batal + sigarda.batalkan_pengajuan_berjalan(v_id, v_teks);
      end if;
      select * into v_t from public.profiles where id = v_id;
      insert into public.naik_kelas_log (batch_id, peserta_id, peserta_nama, nis, aksi, dari_kelas, ke_kelas, dari_status, ke_status, dari_status_pada, dari_lulus_ta, catatan, oleh, oleh_nama)
      values (v_batch, v_id, v_t.nama, coalesce(v_t.nis, v_t.username), v_e ->> 'aksi', v_t.kelas, v_e ->> 'ke_kelas', v_t.status, v_ke_status, v_t.status_pada, v_t.lulus_ta,
              left('Tahun ajaran ' || p_tahun_ajaran, 200), auth.uid(), coalesce(v_oleh, ''));
      update public.profiles
        set kelas = v_e ->> 'ke_kelas', status = v_ke_status, status_pada = sigarda.hari_ini(),
            lulus_ta = case when v_ke_status = 'alumni' then v_lulus_ta else null end
        where id = v_id;
    end loop;
  end if;

  return jsonb_build_object('galat', v_galat, 'ringkasan', v_ringkas, 'baris', v_baris, 'batch', v_batch);
end $$;

-- Membatalkan satu kenaikan kelas massal (Admin Gudep): mengembalikan kelas, status, dan tahun kelulusan semua Penegak di batch itu. Hanya kenaikan TERAKHIR
-- yang belum dibatalkan, dan hanya bila tak seorang pun dari mereka diubah lagi sesudahnya. Pengajuan uji yang sudah dibatalkan saat kenaikan TIDAK dikembalikan.
create or replace function public.sg_naik_kelas_batalkan(p_batch bigint) returns int
language plpgsql security definer set search_path = public as
$$
declare v_b public.naik_kelas_batch; v_l record; v_n int := 0; v_beda int;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat membatalkan kenaikan kelas.');
  select * into v_b from public.naik_kelas_batch where id = p_batch;
  if not found then raise exception 'Kenaikan kelas tidak ditemukan.'; end if;
  if v_b.dibatalkan_pada is not null then raise exception 'Kenaikan kelas ini sudah dibatalkan.'; end if;
  if exists (select 1 from public.naik_kelas_batch where id > p_batch and dibatalkan_pada is null) then
    raise exception 'Hanya kenaikan kelas yang paling akhir yang dapat dibatalkan. Batalkan yang lebih baru lebih dulu.';
  end if;
  select count(*)::int into v_beda from public.naik_kelas_log l join public.profiles p on p.id = l.peserta_id
    where l.batch_id = p_batch and (p.kelas is distinct from l.ke_kelas or p.status <> l.ke_status);
  if v_beda > 0 then
    raise exception '% Penegak sudah diubah lagi sesudah kenaikan ini, jadi kenaikan ini tidak dapat dibatalkan seluruhnya. Ubah mereka satu per satu di menu Anggota.', v_beda;
  end if;
  for v_l in select * from public.naik_kelas_log where batch_id = p_batch and peserta_id is not null loop
    update public.profiles set kelas = v_l.dari_kelas, status = v_l.dari_status, status_pada = v_l.dari_status_pada, lulus_ta = v_l.dari_lulus_ta where id = v_l.peserta_id;
    v_n := v_n + 1;
  end loop;
  update public.naik_kelas_batch set dibatalkan_pada = now(), dibatalkan_oleh = auth.uid() where id = p_batch;
  return v_n;
end $$;

-- Mengubah status SATU Penegak (Pembina atau Admin Gudep; menjadikan alumni hanya Admin). p_status 'aktif' (aktifkan kembali; p_rombel wajib), 'nonaktif', atau 'alumni'.
-- Tercatat di naik_kelas_log. Penegak yang menjadi nonaktif atau alumni kehilangan pengajuan uji yang masih berjalan.
create or replace function public.sg_anggota_status_atur(p_id uuid, p_status text, p_rombel text default null, p_catatan text default '') returns void
language plpgsql security definer set search_path = public as
$$
declare v_t public.profiles; v_rombel text := sigarda.rombel_baku(p_rombel); v_cat text := sigarda.rapikan(p_catatan); v_oleh text; v_aksi text; v_kelas text; v_teks text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah status anggota.'; end if;
  if coalesce(p_status, '') not in ('aktif', 'nonaktif', 'alumni') then raise exception 'Status tidak dikenal.'; end if;
  if p_status = 'alumni' and sigarda.peran() <> 'admin' then raise exception 'Hanya Admin Gudep yang dapat menetapkan alumni.'; end if;
  if char_length(v_cat) > 200 then raise exception 'Catatan maksimal 200 karakter.'; end if;
  select * into v_t from public.profiles where id = p_id and role = 'peserta';
  if not found then raise exception 'Penegak tidak ditemukan.'; end if;
  if v_t.status = p_status then raise exception 'Penegak ini sudah berstatus %.', p_status; end if;
  if p_status = 'nonaktif' and v_t.status = 'alumni' then raise exception 'Alumni tidak dapat dinonaktifkan. Aktifkan kembali lebih dulu bila perlu.'; end if;
  v_kelas := v_t.kelas;
  if p_status = 'aktif' then
    if not sigarda.rombel_sah(v_rombel) then raise exception 'Rombel wajib diisi dengan benar (X-01 sampai X-10, XI-01 sampai XI-10, XII-01 sampai XII-10).'; end if;
    v_kelas := v_rombel; v_aksi := 'aktifkan';
  else
    if p_status = 'alumni' then v_aksi := 'lulus'; else v_aksi := 'nonaktifkan'; end if;
    v_teks := case when p_status = 'alumni' then 'Pengajuan dibatalkan: Penegak menjadi alumni' else 'Pengajuan dibatalkan: Penegak tidak melanjutkan Pramuka' end;
    perform sigarda.batalkan_pengajuan_berjalan(p_id, v_teks);
  end if;
  select nama into v_oleh from public.profiles where id = auth.uid();
  insert into public.naik_kelas_log (batch_id, peserta_id, peserta_nama, nis, aksi, dari_kelas, ke_kelas, dari_status, ke_status, dari_status_pada, dari_lulus_ta, catatan, oleh, oleh_nama)
  values (null, p_id, v_t.nama, coalesce(v_t.nis, v_t.username), v_aksi, v_t.kelas, v_kelas, v_t.status, p_status, v_t.status_pada, v_t.lulus_ta, v_cat, auth.uid(), coalesce(v_oleh, ''));
  update public.profiles
    set kelas = v_kelas, status = p_status, status_pada = sigarda.hari_ini(),
        lulus_ta = case when p_status = 'alumni' then sigarda.tahun_ajaran_kini() else null end
    where id = p_id;
end $$;
-- ===== akhir fungsi naik kelas =====

create or replace function sigarda.asisten_iuran() returns boolean language plpgsql stable security definer set search_path = public as
$$
begin
  return coalesce((select p.role = 'peserta' and p.status = 'aktif' and not p.wajib_ganti_pin and exists (select 1 from public.asisten_iuran a where a.peserta_id = p.id)
                   from public.profiles p where p.id = auth.uid()), false);
end $$;

create or replace function public.sg_absen_set_banyak(p_tanggal date, p_peserta_ids uuid[], p_status text, p_hanya_kosong boolean default true)
returns void language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pengurus() then raise exception 'Tidak diizinkan.'; end if;
  if p_status is null or p_status not in ('H','I','S','A') then raise exception 'Status absensi tidak dikenal.'; end if;
  if not exists (select 1 from public.absensi_sesi where tanggal = p_tanggal) then raise exception 'Sesi absensi belum dibuat.'; end if;
  insert into public.absensi_hadir (tanggal, peserta_id, status, oleh)
  select p_tanggal, u.id, p_status, auth.uid()
  from public.profiles u where u.role = 'peserta' and u.status = 'aktif' and u.id = any (p_peserta_ids)
  on conflict (tanggal, peserta_id) do update
    set status = excluded.status, oleh = excluded.oleh, waktu = now()
    where not p_hanya_kosong;
end $$;

create or replace function public.sg_iuran_set_banyak(p_tanggal date, p_peserta_ids uuid[], p_jumlah int, p_hanya_kosong boolean default true) returns int
language plpgsql security definer set search_path = public as
$$
declare v_id uuid; v_lama int; v_jenis text; v_n int := 0;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pencatat_iuran() then raise exception 'Hanya Dewan Ambalan atau asisten bendahara yang dapat mencatat iuran.'; end if;
  if p_jumlah is null or p_jumlah < 1 or p_jumlah > 1000000 then raise exception 'Jumlah iuran harus antara Rp 1 dan Rp 1.000.000.'; end if;
  if not exists (select 1 from public.absensi_sesi where tanggal = p_tanggal) then raise exception 'Sesi absensi belum dibuat.'; end if;
  if cardinality(coalesce(p_peserta_ids, '{}')) > 500 then raise exception 'Maksimal 500 peserta per permintaan.'; end if;
  for v_id in select id from public.profiles where role = 'peserta' and status = 'aktif' and id = any (coalesce(p_peserta_ids, '{}')) and id <> auth.uid() loop
    select jumlah, jenis into v_lama, v_jenis from public.iuran where tanggal = p_tanggal and peserta_id = v_id;
    if v_lama is not null and p_hanya_kosong then continue; end if;
    if v_lama is not distinct from p_jumlah then continue; end if;
    insert into public.iuran (tanggal, peserta_id, jumlah, jenis, oleh) values (p_tanggal, v_id, p_jumlah, 'rutin', auth.uid())
    on conflict (tanggal, peserta_id) do update set jumlah = excluded.jumlah, oleh = excluded.oleh, waktu = now();
    insert into public.iuran_log (tanggal, peserta_id, jumlah_lama, jumlah_baru, jenis, oleh)
    values (p_tanggal, v_id, v_lama, p_jumlah, coalesce(v_jenis, 'rutin'), auth.uid());
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.sg_iuran_lembar(p_tanggal date) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pencatat_iuran() then raise exception 'Hanya Dewan Ambalan atau asisten bendahara yang dapat membuka lembar iuran.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'nama', p.nama, 'kelas', p.kelas, 'sangga', p.sangga, 'status', h.status, 'jumlah', i.jumlah, 'jenis', i.jenis)
                     order by p.nama)
    from public.profiles p
    left join public.iuran i on i.peserta_id = p.id and i.tanggal = p_tanggal
    left join public.absensi_hadir h on h.peserta_id = p.id and h.tanggal = p_tanggal
    where p.role = 'peserta' and p.status = 'aktif' and p.id <> auth.uid()
  ), '[]'::jsonb);
end $$;

create or replace function public.sg_push_ringkasan() returns jsonb language plpgsql stable security definer set search_path = public as
$$
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat melihat ringkasan perangkat.'; end if;
  return (
    with a as (
      select p.id, p.nama, p.role, p.jabatan, p.kelas, exists (select 1 from public.push_langganan l where l.penerima_id = p.id) as ada
      from public.profiles p where p.role in ('peserta', 'penguji') and p.status = 'aktif'
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

alter table public.naik_kelas_batch enable row level security;
alter table public.naik_kelas_log enable row level security;

-- ===== Kebijakan naik kelas =====
drop policy if exists baca_naik_kelas_batch on public.naik_kelas_batch;
create policy baca_naik_kelas_batch on public.naik_kelas_batch for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));
drop policy if exists baca_naik_kelas_log on public.naik_kelas_log;
create policy baca_naik_kelas_log on public.naik_kelas_log for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));
-- ===== akhir kebijakan naik kelas =====

revoke all on public.naik_kelas_batch, public.naik_kelas_log from anon, authenticated;
grant select on public.naik_kelas_batch, public.naik_kelas_log to authenticated;

revoke all on function
  public.sg_naik_kelas(text, jsonb, boolean), public.sg_naik_kelas_batalkan(bigint), public.sg_anggota_status_atur(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function
  public.sg_naik_kelas(text, jsonb, boolean), public.sg_naik_kelas_batalkan(bigint), public.sg_anggota_status_atur(uuid, text, text, text)
  to authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
