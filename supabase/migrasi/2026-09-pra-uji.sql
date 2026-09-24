-- ============================================================================
-- MIGRASI: Fase C -- mesin pra-uji SKU berjenjang (Pinsa, Bina Damping, lalu uji resmi Pembina). AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi sebelumnya (sampai 2026-09-pengukuhan-dewan.sql dan 2026-09-token-butir-lama.sql; lihat README). Isi:
--   * Tabel public.sku_pra_uji (satu baris per tahap per pengajuan; riwayat tersimpan) dengan RLS baca (pemilik, penilai, pengurus) dan tulis hanya lewat fungsi.
--   * SAKELAR pengaturan 'pra_uji.aktif' (sigarda.pra_uji_aktif), BAWAAN MATI: dengan mati, seluruh perilaku lama tetap (Dewan Ambalan masih dapat menguji).
--     Pembina atau Admin menghidupkannya kapan siap: select public.sg_pra_uji_sakelar(true) lewat aplikasi (Fase D) atau SQL sebagai pengguna aplikasi.
--   * Sakelar HIDUP: uji resmi hanya Pembina (sigarda.bisa_menguji; AD/ART Munas 2023 Pasal 33 ayat (6) dan 35 ayat (3)); pengajuan Penegak lewat sg_sku_ajukan
--     diteruskan ke pra-uji: butir Bantara Penegak > Pinsa > Bina Damping > Pembina, butir Laksana Penegak > Bina Damping yang sudah Laksana > Pembina. Lulus pra-uji
--     meneruskan pengajuan otomatis; belum lulus mengembalikan ke Penegak dengan catatan; pra-uji hanya rekomendasi (tanpa PIN). Aturan pengaman: penilai hanya
--     menyaring butir yang sudah ia lulus sendiri. Tahap tanpa penilai dilewati; tanpa penilai sama sekali langsung ke Pembina.
--   * Fungsi baru: sg_pra_uji_antrian, sg_pra_uji_catat, sg_pra_uji_lewati (Pembina/Admin), sg_pra_uji_sakelar; bantu sigarda.pra_uji_*; pemicu notif_pra_uji.
--   * Notifikasi jenis baru 'pra_uji' (kata kunci "diteruskan ke pra-uji selanjutnya" dan "diteruskan ke pengujian resmi ke Pembina"); pengingat harian ditulis ulang
--     (sigarda.notif_pengingat) agar mengingatkan pra-uji yang menunggu lebih dari 3 hari.
--   * Ditulis ulang (tanda tangan sama): sg_sku_ajukan, sg_sku_batal, sg_sku_catat_internal, sg_sku_catat_rubrik_internal, sigarda.batalkan_pengajuan_berjalan,
--     sigarda.bisa_menguji, sigarda.notif_pengingat, sg_cadangan_admin (memuat sku_pra_uji).
-- Edge Function TIDAK berubah dan tidak perlu di-deploy ulang (dengan sakelar hidup, Dewan yang mencoba mencatat hasil ditolak oleh SQL setelah PIN diperiksa).
-- TIDAK menghapus data. Aman diulang.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/*.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

do $$
begin
  if to_regclass('public.bina_damping') is null or to_regprocedure('sigarda.tingkat_penegak(uuid)') is null or to_regclass('public.kegiatan_usulan') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya (sampai 2026-09-pinsa-bina-damping.sql dan 2026-09-pengukuhan-dewan.sql; lihat README), baru migrasi ini.';
  end if;
end $$;

alter table public.notifikasi drop constraint if exists notifikasi_jenis_check;
alter table public.notifikasi add constraint notifikasi_jenis_check
  check (jenis in ('ajukan','alih','mulai','hasil','pengingat','lama','sesi','surat','tes','eskalasi','agenda','musyawarah','kegiatan','pra_uji'));

-- ===== Pra-uji berjenjang (fase C): tabel =====
-- Pra-uji SKU sebelum uji resmi Pembina. Jalur butir Bantara: Penegak > Pinsa > Bina Damping > Pembina; butir Laksana: Penegak > Bina Damping (yang sudah
-- Laksana) > Pembina. Satu baris = satu tahap untuk satu pengajuan; lulus meneruskan pengajuan (baris tahap berikut, atau pengajuan uji resmi di sku_progress),
-- belum = kembali ke Penegak dengan catatan. Baris lama disimpan sebagai riwayat. Pra-uji hanya REKOMENDASI: tidak pernah mengubah status lulus butir.
-- Tanpa hak baca langsung selain kebijakan baca (pemilik, pengurus, penilai); tulis hanya lewat fungsi sg_*.
create table if not exists public.sku_pra_uji (
  id bigint generated always as identity primary key,
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  sku_id text not null references public.sku_unit(id),
  tahap text not null check (tahap in ('pinsa','bina_damping')),
  status text not null default 'menunggu' check (status in ('menunggu','lulus','belum','dibatalkan','dilewati')),
  jadwal date not null,                                          -- tanggal uji resmi yang diinginkan Penegak (dibawa sampai tahap Pembina)
  catatan_peserta text not null default '' check (char_length(catatan_peserta) <= 500),
  penilai_id uuid references public.profiles(id) on delete set null,   -- yang memutuskan (Pinsa/Bina Damping), atau Pembina/Admin yang melewati tahap
  penilai_nama text,                                             -- nama saat memutuskan (Penegak tidak dapat membaca profil Pinsa/Bina Damping)
  catatan text not null default '' check (char_length(catatan) <= 1000),
  dibuat timestamptz not null default now(),
  diputuskan_pada timestamptz,
  constraint sku_pra_uji_belum_catatan check (status <> 'belum' or btrim(catatan) <> '')
);
-- Satu tahap menunggu per Penegak per butir
create unique index if not exists sku_pra_uji_menunggu_unik on public.sku_pra_uji (peserta_id, sku_id) where status = 'menunggu';
create index if not exists sku_pra_uji_peserta_idx on public.sku_pra_uji (peserta_id, sku_id);
create index if not exists sku_pra_uji_penilai_idx on public.sku_pra_uji (penilai_id);
create index if not exists sku_pra_uji_sku_idx on public.sku_pra_uji (sku_id);
-- ===== akhir tabel pra-uji =====

alter table public.sku_pra_uji enable row level security;
-- Tabel baru menerima hak penuh bawaan Supabase: dicabut agar sama dengan database baru (baca saja lewat kebijakan; tulis hanya lewat fungsi).
revoke all on public.sku_pra_uji from anon, authenticated;
grant select on public.sku_pra_uji to authenticated;
-- ===== Pra-uji berjenjang (fase C): kebijakan =====
-- Pra-uji: Penegak melihat pengajuannya sendiri, penilai (Pinsa/Bina Damping) yang sudah memutuskan, pengurus semua. Antrian penilai lewat sg_pra_uji_antrian.
drop policy if exists baca_pra_uji on public.sku_pra_uji;
create policy baca_pra_uji on public.sku_pra_uji for select to authenticated
  using ((select sigarda.aktif()) and (peserta_id = (select auth.uid()) or penilai_id = (select auth.uid()) or (select sigarda.pengurus())));
-- ===== akhir kebijakan pra-uji =====

-- ===== Pra-uji berjenjang (fase C): sakelar =====
-- Sakelar pra-uji (pengaturan 'pra_uji.aktif' = {"aktif": true|false}), bawaan MATI agar peralihan dapat dipilih Pembina lewat sg_pra_uji_sakelar.
-- Bila hidup: uji resmi hanya Pembina (sigarda.bisa_menguji) dan pengajuan Penegak lebih dulu melewati pra-uji Pinsa/Bina Damping.
create or replace function sigarda.pra_uji_aktif() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select (nilai ->> 'aktif')::boolean from public.pengaturan where kunci = 'pra_uji.aktif'), false) $$;
-- ===== akhir sakelar pra-uji =====

-- ===== Pra-uji berjenjang (fase C): bisa_menguji =====
-- Boleh menguji: Pembina, Dewan Ambalan lama (belum diarsipkan), atau Penegak aktif berjabatan Dewan Ambalan. Admin Gudep tidak menguji.
-- Sakelar pra-uji HIDUP: uji resmi HANYA Pembina (AD/ART Munas 2023 Pasal 33 ayat (6) dan 35 ayat (3)); Dewan Ambalan tidak menguji.
create or replace function sigarda.bisa_menguji(p_id uuid) returns boolean language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.profiles
    where id = p_id and status = 'aktif'
      and case when sigarda.pra_uji_aktif() then role = 'penguji' and jabatan = 'Pembina'
               else role = 'penguji' or (role = 'peserta' and jabatan_dewan is not null) end
  )
$$;
-- ===== akhir bisa_menguji pra-uji =====

-- ===== Pra-uji berjenjang (fase C): bantu =====
-- Aturan penilai pra-uji (aturan pengaman: hanya menyaring butir yang sudah ia lulus sendiri; butir agama bersifat per agama sehingga otomatis seagama):
--   * tahap 'pinsa'        : Pinsa (aktif) sangga dan rombel yang sama dengan Penegak; hanya butir Bantara; Pinsa yang mengajukan sendiri melewati tahap ini.
--   * tahap 'bina_damping' : Bina Damping rombel Penegak pada tahun ajaran berjalan; butir Laksana hanya oleh Bina Damping yang sudah Laksana;
--                            Bina Damping yang mengajukan sendiri disaring Bina Damping lain di rombelnya.
-- Tidak ada penilai yang memenuhi syarat pada suatu tahap = tahap itu dilewati; bila semua tahap terlewati, pengajuan langsung ke Pembina.
create or replace function sigarda.pra_uji_penilai_ok(p_peserta uuid, p_sku text, p_tahap text, p_penilai uuid) returns boolean
language plpgsql stable security definer set search_path = public as
$$
declare v_p public.profiles; v_n public.profiles; v_tingkat text;
begin
  if p_penilai is null or p_penilai = p_peserta then return false; end if;
  select * into v_p from public.profiles where id = p_peserta and role = 'peserta';
  if not found then return false; end if;
  select * into v_n from public.profiles where id = p_penilai and role = 'peserta' and status = 'aktif';
  if not found then return false; end if;
  select tingkat into v_tingkat from public.sku_unit where id = p_sku;
  if not found then return false; end if;
  if not exists (select 1 from public.sku_progress where peserta_id = p_penilai and sku_id = p_sku and status = 'lulus') then return false; end if;
  if p_tahap = 'pinsa' then
    return v_tingkat = 'Bantara' and v_n.pinsa and not v_p.pinsa and v_p.kelas is not null and v_n.kelas = v_p.kelas
       and lower(v_n.sangga) = lower(v_p.sangga);
  elsif p_tahap = 'bina_damping' then
    return exists (select 1 from public.bina_damping b where b.penegak_id = p_penilai and b.rombel = v_p.kelas and b.tahun_ajaran = sigarda.tahun_ajaran_kini())
       and (v_tingkat = 'Bantara' or sigarda.tingkat_penegak(p_penilai) = 'laksana');
  end if;
  return false;
end $$;

-- Semua penilai yang memenuhi syarat pada satu tahap untuk satu Penegak dan satu butir.
create or replace function sigarda.pra_uji_penilai_daftar(p_peserta uuid, p_sku text, p_tahap text) returns setof uuid
language sql stable security definer set search_path = public as
$$
  select u.id from public.profiles u
  where u.role = 'peserta' and u.status = 'aktif'
    and case p_tahap when 'pinsa' then u.pinsa when 'bina_damping' then exists (select 1 from public.bina_damping b where b.penegak_id = u.id) else false end
    and sigarda.pra_uji_penilai_ok(p_peserta, p_sku, p_tahap, u.id)
$$;

-- Tahap sesudah p_setelah (null = mulai dari awal) yang punya penilai: 'pinsa', 'bina_damping', atau 'pembina' (uji resmi).
create or replace function sigarda.pra_uji_tahap_berikut(p_peserta uuid, p_sku text, p_setelah text) returns text
language plpgsql stable security definer set search_path = public as
$$
declare v_urut text[]; v_tahap text;
begin
  v_urut := case when (select tingkat from public.sku_unit where id = p_sku) = 'Bantara' then array['pinsa', 'bina_damping'] else array['bina_damping'] end;
  foreach v_tahap in array v_urut loop
    if p_setelah is not null and array_position(v_urut, v_tahap) <= coalesce(array_position(v_urut, p_setelah), 0) then continue; end if;
    if exists (select 1 from sigarda.pra_uji_penilai_daftar(p_peserta, p_sku, v_tahap)) then return v_tahap; end if;
  end loop;
  return 'pembina';
end $$;

create or replace function sigarda.pra_uji_nama_tahap(p_tahap text) returns text language sql immutable as
$$ select case p_tahap when 'pinsa' then 'Pinsa' when 'bina_damping' then 'Bina Damping' else 'Pembina' end $$;

-- Meneruskan pengajuan ke tahap berikutnya sesudah p_setelah (null = pengajuan baru): baris pra-uji tahap itu, atau bila tidak ada lagi, pengajuan uji resmi
-- (sku_progress 'diajukan', antrian rombel Pembina). Mengembalikan tahap tujuan. Riwayat SKU mencatat perjalanannya.
create or replace function sigarda.pra_uji_teruskan(p_peserta uuid, p_sku text, p_setelah text, p_jadwal date, p_catatan_peserta text, p_oleh uuid) returns text
language plpgsql security definer set search_path = public as
$$
declare v_tahap text := sigarda.pra_uji_tahap_berikut(p_peserta, p_sku, p_setelah);
begin
  if v_tahap = 'pembina' then
    if not exists (select 1 from sigarda.penguji_sah(p_peserta, p_sku)) then
      raise exception 'Belum ada Pembina yang dapat menguji butir ini untuk rombel Penegak tersebut. Hubungi Admin Gudep.';
    end if;
    insert into public.sku_progress (peserta_id, sku_id, status, jadwal, penguji_id, catatan_peserta, diubah)
    values (p_peserta, p_sku, 'diajukan', p_jadwal, null, p_catatan_peserta, now())
    on conflict (peserta_id, sku_id) do update
      set status = 'diajukan', jadwal = excluded.jadwal, penguji_id = null, catatan_peserta = excluded.catatan_peserta, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (p_peserta, p_sku, case when p_setelah is null then 'Mengajukan pengujian untuk ' || to_char(p_jadwal, 'YYYY-MM-DD') || ' (antrian rombel, tanpa pra-uji)'
                                   else 'Diteruskan ke pengujian resmi Pembina untuk ' || to_char(p_jadwal, 'YYYY-MM-DD') end, p_oleh);
  else
    insert into public.sku_pra_uji (peserta_id, sku_id, tahap, jadwal, catatan_peserta) values (p_peserta, p_sku, v_tahap, p_jadwal, p_catatan_peserta);
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (p_peserta, p_sku, case when p_setelah is null then 'Mengajukan pengujian untuk ' || to_char(p_jadwal, 'YYYY-MM-DD') || '; menunggu pra-uji ' || sigarda.pra_uji_nama_tahap(v_tahap)
                                   else 'Diteruskan ke pra-uji ' || sigarda.pra_uji_nama_tahap(v_tahap) end, p_oleh);
  end if;
  return v_tahap;
end $$;

-- Penegak mengajukan butir lewat jalur pra-uji (dipanggil sg_sku_ajukan sesudah pemeriksaan umum). Satu pengajuan menunggu per butir.
create or replace function sigarda.pra_uji_mulai(p_peserta uuid, p_sku text, p_jadwal date, p_catatan text) returns void
language plpgsql security definer set search_path = public as
$$
begin
  if exists (select 1 from public.sku_pra_uji where peserta_id = p_peserta and sku_id = p_sku and status = 'menunggu') then
    raise exception 'Poin ini sedang menunggu pra-uji.';
  end if;
  if not exists (select 1 from sigarda.penguji_sah(p_peserta, p_sku)) then
    raise exception 'Belum ada penguji yang dapat menguji butir ini untuk rombel Anda. Hubungi Admin Gudep.';
  end if;
  perform sigarda.pra_uji_teruskan(p_peserta, p_sku, null, p_jadwal, btrim(coalesce(p_catatan, '')), p_peserta);
end $$;

-- Notifikasi ke Penegak sesudah pra-uji lulus (atau tahap dilewati Pembina): kata kunci "diteruskan ke pra-uji selanjutnya" atau
-- "diteruskan ke pengujian resmi ke Pembina" (keputusan pemilik; berbeda dari hasil uji resmi yang isinya tanpa hasil).
create or replace function sigarda.pra_uji_beritahu_lulus(p_peserta uuid, p_sku text, p_tujuan text, p_dilewati boolean default false) returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform sigarda.notif_buat(p_peserta, 'pra_uji', case when p_dilewati then 'Tahap pra-uji dilewati' else 'Pra-uji lulus' end,
    sigarda.notif_label_butir(p_sku) || case when p_dilewati then ' melewati satu tahap pra-uji dan ' else ' lulus pra-uji dan ' end || case when p_tujuan = 'pembina' then 'diteruskan ke pengujian resmi ke Pembina.' else 'diteruskan ke pra-uji selanjutnya.' end,
    '{"tab":"sku"}');
end $$;

-- Pengajuan pra-uji baru: beri tahu semua penilai yang memenuhi syarat pada tahap itu.
create or replace function sigarda.notif_pra_uji() returns trigger language plpgsql security definer set search_path = public as
$$
declare v_x uuid; v_nama text; v_label text := sigarda.notif_label_butir(NEW.sku_id);
begin
  if NEW.status <> 'menunggu' then return null; end if;
  select nama into v_nama from public.profiles where id = NEW.peserta_id;
  for v_x in select * from sigarda.pra_uji_penilai_daftar(NEW.peserta_id, NEW.sku_id, NEW.tahap) loop
    perform sigarda.notif_buat(v_x, 'pra_uji', 'Pengajuan pra-uji baru', v_nama || ' mengajukan ' || v_label || ' untuk pra-uji ' || sigarda.pra_uji_nama_tahap(NEW.tahap), '{"tab":"pra-uji"}');
  end loop;
  return null;
end $$;
drop trigger if exists notif_pra_uji on public.sku_pra_uji;
create trigger notif_pra_uji after insert on public.sku_pra_uji for each row execute function sigarda.notif_pra_uji();

-- Pengingat harian (dipanggil sigarda.notif_pengingat): pra-uji menunggu lebih dari 3 hari diingatkan kepada penilainya (sekali per pengajuan). Tanpa penilai
-- (macet) hanya diingatkan kepada Pembina; pengajuan TIDAK pernah lolos otomatis.
create or replace function sigarda.pra_uji_pengingat() returns void language plpgsql security definer set search_path = public as
$$
declare r record; v_x uuid; v_ada boolean;
begin
  for r in select u.id, u.peserta_id, u.sku_id, u.tahap, p.nama from public.sku_pra_uji u join public.profiles p on p.id = u.peserta_id
           where u.status = 'menunggu' and u.dibuat < now() - interval '3 days' loop
    v_ada := false;
    for v_x in select * from sigarda.pra_uji_penilai_daftar(r.peserta_id, r.sku_id, r.tahap) loop
      v_ada := true;
      perform sigarda.notif_buat(v_x, 'pra_uji', 'Pra-uji menunggu lebih dari 3 hari', r.nama || ', ' || sigarda.notif_label_butir(r.sku_id), '{"tab":"pra-uji"}', 'pra-lama:' || r.id);
    end loop;
    if not v_ada then
      for v_x in select id from public.profiles where role = 'penguji' and jabatan = 'Pembina' and status = 'aktif' loop
        perform sigarda.notif_buat(v_x, 'pra_uji', 'Pra-uji tanpa penilai',
          r.nama || ', ' || sigarda.notif_label_butir(r.sku_id) || ': belum ada ' || sigarda.pra_uji_nama_tahap(r.tahap) || ' yang dapat menilai. Lewati tahap ini bila perlu.',
          '{"tab":"antrian"}', 'pra-macet:' || r.id);
      end loop;
    end if;
  end loop;
end $$;
-- ===== akhir bantu pra-uji =====

-- ===== Pra-uji berjenjang (fase C): pengingat ===== (penanda keenam, fungsi SAMA; dipakai migrasi pra-uji)
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
  perform sigarda.pra_uji_pengingat();
  delete from public.notifikasi where dibuat < now() - interval '90 days';
end $$;
-- ===== akhir pengingat cadangan =====
-- ===== akhir pengingat eskalasi =====
-- ===== akhir pengingat agenda =====
-- ===== akhir pengingat usulan musyawarah =====
-- ===== akhir pengingat usulan kegiatan lain =====
-- ===== akhir pengingat pra-uji =====

-- ===== SKU: peserta mengajukan pengujian =====
create or replace function public.sg_sku_ajukan(p_sku_id text, p_jadwal date, p_penguji_id uuid, p_catatan text default '')
returns void language plpgsql security definer set search_path = public as
$$
declare
  v_uid uuid := auth.uid(); v_p public.profiles; v_u public.sku_unit; v_status text;
begin
  perform sigarda.wajib_aktif();
  select * into v_p from public.profiles where id = v_uid;
  if not found or v_p.role <> 'peserta' then raise exception 'Hanya peserta yang dapat mengajukan pengujian.'; end if;
  select * into v_u from public.sku_unit where id = p_sku_id and (agama is null or agama = v_p.agama);
  if not found then raise exception 'Poin SKU tidak ditemukan.'; end if;

  select status into v_status from public.sku_progress where peserta_id = v_uid and sku_id = p_sku_id;
  if v_status = 'lulus' then raise exception 'Poin ini sudah lulus.'; end if;
  if v_status in ('diajukan','proses') then raise exception 'Poin ini sedang menunggu atau dalam pengujian.'; end if;
  if v_u.tingkat = 'Laksana' and not sigarda.tingkat_selesai(v_uid, 'Bantara') then
    raise exception 'Selesaikan seluruh butir Bantara lebih dulu.';
  end if;
  if p_jadwal is null then raise exception 'Tanggal pengujian wajib diisi.'; end if;
  if char_length(coalesce(p_catatan, '')) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;
  -- Sakelar pra-uji hidup: pengajuan lebih dulu melewati pra-uji Pinsa/Bina Damping (p_penguji_id diabaikan; uji resmi selalu ke antrian Pembina rombel).
  if sigarda.pra_uji_aktif() then
    perform sigarda.pra_uji_mulai(v_uid, p_sku_id, p_jadwal, p_catatan);
    return;
  end if;
  -- Ketat saat memilih penguji: hanya penguji yang sah (penugasan rombel, butir Laksana dan butir agama hanya Pembina, agama seagama).
  -- p_penguji_id kosong = antrian bersama rombel: penguji yang sah mana pun mengambilnya lewat "Mulai uji".
  if p_penguji_id is not null and not sigarda.bisa_menguji(p_penguji_id) then
    raise exception 'Pilih penguji terlebih dulu.';
  end if;
  if p_penguji_id is null then
    if not exists (select 1 from sigarda.penguji_sah(v_uid, p_sku_id)) then
      raise exception 'Belum ada penguji yang dapat menguji butir ini untuk rombel Anda. Hubungi Admin Gudep.';
    end if;
  elsif not sigarda.penguji_boleh(v_uid, p_penguji_id, p_sku_id) then
    if v_u.agama is not null then
      raise exception 'Butir agama hanya dapat diuji oleh Pembina yang seagama. Pilih penguji dari daftar.';
    elsif v_u.tingkat = 'Laksana' and not exists (select 1 from public.profiles where id = p_penguji_id and jabatan = 'Pembina') and not sigarda.ditugaskan(v_uid, p_penguji_id) then
      raise exception 'Butir Laksana hanya dapat diuji oleh Pembina atau penguji yang ditugaskan untuk Anda. Pilih penguji dari daftar.';
    else
      raise exception 'Penguji ini tidak bertugas pada rombel Anda. Pilih penguji dari daftar.';
    end if;
  end if;

  insert into public.sku_progress (peserta_id, sku_id, status, jadwal, penguji_id, catatan_peserta, diubah)
  values (v_uid, p_sku_id, 'diajukan', p_jadwal, p_penguji_id, btrim(coalesce(p_catatan, '')), now())
  on conflict (peserta_id, sku_id) do update
    set status = 'diajukan', jadwal = excluded.jadwal, penguji_id = excluded.penguji_id,
        catatan_peserta = excluded.catatan_peserta, diubah = now();
  insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
  values (v_uid, p_sku_id, 'Mengajukan pengujian untuk ' || to_char(p_jadwal, 'YYYY-MM-DD') || case when p_penguji_id is null then ' (antrian rombel)' else '' end, v_uid);
end $$;

create or replace function public.sg_sku_batal(p_sku_id text) returns void
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_status text;
begin
  perform sigarda.wajib_aktif();
  if not exists (select 1 from public.profiles where id = v_uid and role = 'peserta') then
    raise exception 'Hanya peserta yang dapat membatalkan pengajuan.';
  end if;
  -- Pengajuan yang masih menunggu pra-uji (Pinsa/Bina Damping) juga dapat dibatalkan.
  if exists (select 1 from public.sku_pra_uji where peserta_id = v_uid and sku_id = p_sku_id and status = 'menunggu') then
    update public.sku_pra_uji set status = 'dibatalkan', diputuskan_pada = now() where peserta_id = v_uid and sku_id = p_sku_id and status = 'menunggu';
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (v_uid, p_sku_id, 'Pengajuan pra-uji dibatalkan peserta', v_uid);
    return;
  end if;
  select status into v_status from public.sku_progress where peserta_id = v_uid and sku_id = p_sku_id;
  if v_status is distinct from 'diajukan' then
    raise exception 'Hanya pengajuan yang belum mulai diuji yang bisa dibatalkan.';
  end if;
  update public.sku_progress
    set status = 'belum', jadwal = null, penguji_id = null, catatan_peserta = '', diubah = now()
    where peserta_id = v_uid and sku_id = p_sku_id;
  insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (v_uid, p_sku_id, 'Pengajuan dibatalkan peserta', v_uid);
end $$;

-- ===== SKU: penguji mencatat hasil. HANYA dipanggil Edge Function setelah PIN penguji diverifikasi. =====
create or replace function public.sg_sku_catat_internal(
  p_oleh uuid, p_peserta_id uuid, p_sku_id text, p_hasil text,
  p_tanggal_uji date default null, p_nilai text default null, p_catatan text default ''
) returns void language plpgsql security definer set search_path = public as
$$
declare v_p public.profiles; v_kode text; v_cat text := btrim(coalesce(p_catatan, '')); v_lama public.sku_progress; v_ganti text := ''; v_luar text;
begin
  if not sigarda.bisa_menguji(p_oleh) then
    raise exception '%', case when sigarda.pra_uji_aktif() then 'Hanya Pembina yang dapat mencatat hasil uji resmi.' else 'Hanya Pembina atau Dewan Ambalan yang dapat mencatat hasil.' end;
  end if;
  if p_oleh = p_peserta_id then raise exception 'Anda tidak dapat menilai diri sendiri.'; end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Peserta tidak ditemukan.'; end if;
  if not exists (select 1 from public.sku_unit where id = p_sku_id and (agama is null or agama = v_p.agama)) then
    raise exception 'Poin SKU tidak ditemukan.';
  end if;
  -- Butir agama (sub-butir Butir 1) hanya dinilai Pembina yang seagama, dan butir Laksana hanya oleh Pembina atau penguji yang ditugaskan untuk Penegak
  -- itu, untuk semua hasil (mulai uji, lulus, perlu diulang, dikembalikan). Aturan ini sama dengan pemilihan penguji (sigarda.penguji_peran_ok).
  if not sigarda.penguji_peran_ok(p_peserta_id, p_oleh, p_sku_id) then
    if exists (select 1 from public.sku_unit where id = p_sku_id and agama is not null) then
      raise exception 'Butir agama hanya dapat dinilai oleh Pembina yang seagama dengan Penegak.';
    end if;
    raise exception 'Butir Laksana hanya dapat dinilai oleh Pembina atau penguji yang ditugaskan untuk Penegak ini.';
  end if;
  -- Lunak saat mencatat: penguji lain boleh menggantikan penguji tujuan, tetapi tercatat di riwayat.
  select * into v_lama from public.sku_progress where peserta_id = p_peserta_id and sku_id = p_sku_id;
  if found and v_lama.status in ('diajukan', 'proses') and v_lama.penguji_id is not null and v_lama.penguji_id <> p_oleh and p_hasil in ('proses', 'lulus', 'ulang') then
    v_ganti := ' (menggantikan ' || coalesce((select nama from public.profiles where id = v_lama.penguji_id), 'penguji lain') || ')';
  end if;
  -- Butir agama yang dinilai guru agama luar (Pembina tidak seagama, sah karena ada surat pengantar): riwayat menyebut guru dan nomor surat.
  if p_hasil in ('proses', 'lulus', 'ulang') and exists (select 1 from public.sku_unit where id = p_sku_id and agama is not null)
     and exists (select 1 from public.profiles b where b.role = 'penguji' and b.jabatan = 'Pembina' and b.agama is not null)
     and (select agama from public.profiles where id = p_oleh) is distinct from v_p.agama then
    select ' (dinilai guru agama ' || coalesce(d.payload -> 'guru' ->> 'nama', '-') || ', surat nomor ' || d.nomor || ')' into v_luar
    from public.dokumen_terbit d
    where d.jenis = 'surat_pengantar_agama' and d.peserta_id = p_peserta_id and d.dicabut_pada is null and d.payload -> 'butir' @> jsonb_build_array(p_sku_id)
    order by d.id desc limit 1;
    v_ganti := v_ganti || coalesce(v_luar, '');
  end if;
  if p_hasil not in ('proses','lulus','ulang','reset') then raise exception 'Hasil pengujian tidak dikenal.'; end if;
  -- Butir dengan instrumen ditetapkan hanya boleh dinilai lewat sg_sku_catat_rubrik_internal (yang menyalakan penanda ini)
  if p_hasil in ('lulus','ulang') and sigarda.instrumen_aktif(p_sku_id)
     and coalesce(current_setting('sigarda.via_rubrik', true), '') <> 'ya' then
    raise exception 'Butir ini dinilai dengan instrumen penilaian. Catat hasilnya lewat lembar penilaian.';
  end if;
  if p_hasil <> 'reset' and p_tanggal_uji is null then raise exception 'Tanggal uji wajib diisi.'; end if;
  if p_hasil <> 'reset' and p_sku_id like 'LAK-%' and not sigarda.tingkat_selesai(p_peserta_id, 'Bantara') then
    raise exception 'Peserta belum menyelesaikan seluruh butir Bantara.';
  end if;
  if char_length(v_cat) > 1000 then raise exception 'Catatan maksimal 1000 karakter.'; end if;

  -- Pembina memulai atau menuntaskan butir yang masih menunggu pra-uji: pra-uji itu tidak diperlukan lagi.
  if p_hasil in ('proses', 'lulus', 'ulang') then
    update public.sku_pra_uji set status = 'dibatalkan', catatan = 'Dilanjutkan langsung oleh penguji resmi', diputuskan_pada = now()
      where peserta_id = p_peserta_id and sku_id = p_sku_id and status = 'menunggu';
  end if;

  if p_hasil = 'proses' then
    insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji)
    values (p_peserta_id, p_sku_id, 'proses', p_oleh, p_tanggal_uji)
    on conflict (peserta_id, sku_id) do update
      set status = 'proses', penguji_id = p_oleh, tanggal_uji = p_tanggal_uji, verifikasi = null, diverifikasi_pada = null, verifikasi_token = null, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (p_peserta_id, p_sku_id, 'Pengujian dimulai' || v_ganti, p_oleh);

  elsif p_hasil = 'lulus' then
    if p_nilai is null then raise exception 'Pilih predikat penilaian.'; end if;
    if p_nilai not in ('Sangat baik','Baik','Cukup') then raise exception 'Predikat tidak dikenal.'; end if;
    v_kode := sigarda.kode_verifikasi(array[p_peserta_id::text, p_sku_id, p_oleh::text, p_tanggal_uji::text]);
    insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji, nilai, catatan, verifikasi, diverifikasi_pada, verifikasi_token)
    values (p_peserta_id, p_sku_id, 'lulus', p_oleh, p_tanggal_uji, p_nilai, v_cat, v_kode, now(), sigarda.token_acak())
    on conflict (peserta_id, sku_id) do update
      set status = 'lulus', penguji_id = p_oleh, tanggal_uji = p_tanggal_uji, nilai = p_nilai, catatan = v_cat,
          verifikasi = v_kode, diverifikasi_pada = now(), verifikasi_token = sigarda.token_acak(), diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (p_peserta_id, p_sku_id, 'Dinyatakan lulus (' || p_nilai || '), kode ' || v_kode || v_ganti, p_oleh);

  elsif p_hasil = 'ulang' then
    if v_cat = '' then raise exception 'Isi catatan agar peserta tahu bagian yang perlu diperbaiki.'; end if;
    insert into public.sku_progress (peserta_id, sku_id, status, penguji_id, tanggal_uji, nilai, catatan)
    values (p_peserta_id, p_sku_id, 'ulang', p_oleh, p_tanggal_uji, null, v_cat)
    on conflict (peserta_id, sku_id) do update
      set status = 'ulang', penguji_id = p_oleh, tanggal_uji = p_tanggal_uji, nilai = null, catatan = v_cat,
          verifikasi = null, diverifikasi_pada = null, verifikasi_token = null, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (p_peserta_id, p_sku_id, 'Perlu diulang' || v_ganti, p_oleh);

  else -- reset
    if v_cat = '' then raise exception 'Isi alasan pembatalan status.'; end if;
    insert into public.sku_progress (peserta_id, sku_id, status)
    values (p_peserta_id, p_sku_id, 'belum')
    on conflict (peserta_id, sku_id) do update
      set status = 'belum', penguji_id = null, tanggal_uji = null, jadwal = null, nilai = null, catatan = '',
          catatan_peserta = '', verifikasi = null, diverifikasi_pada = null, verifikasi_token = null, diubah = now();
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (p_peserta_id, p_sku_id, 'Status dikembalikan ke belum diuji. Alasan: ' || v_cat, p_oleh);
  end if;
end $$;

-- ===== SKU: penilaian dengan instrumen. HANYA dipanggil Edge Function setelah PIN penguji diverifikasi. =====
-- Skor dan saran dihitung ulang di server dari nilai tiap kriteria. Penguji boleh memilih hasil yang berbeda dari saran,
-- dengan catatan alasan wajib (tercatat). Hasil diterapkan lewat sg_sku_catat_internal (status, kode verifikasi, riwayat).
create or replace function public.sg_sku_catat_rubrik_internal(
  p_oleh uuid, p_peserta_id uuid, p_sku_id text, p_tanggal_uji date, p_rincian jsonb, p_hasil text, p_catatan text default ''
) returns jsonb language plpgsql security definer set search_path = public as
$$
declare
  v_p public.profiles; v_cat text := btrim(coalesce(p_catatan, '')); v_h record; v_diganti boolean; v_rinci jsonb; v_saran_iuran int; v_beda_iuran boolean := false;
begin
  if not sigarda.bisa_menguji(p_oleh) then
    raise exception '%', case when sigarda.pra_uji_aktif() then 'Hanya Pembina yang dapat mencatat hasil uji resmi.' else 'Hanya Pembina atau Dewan Ambalan yang dapat mencatat hasil.' end;
  end if;
  if p_oleh = p_peserta_id then raise exception 'Anda tidak dapat menilai diri sendiri.'; end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Peserta tidak ditemukan.'; end if;
  if not exists (select 1 from public.sku_unit where id = p_sku_id and (agama is null or agama = v_p.agama)) then
    raise exception 'Poin SKU tidak ditemukan.';
  end if;
  if p_hasil is null or p_hasil not in ('lulus', 'ulang') then raise exception 'Hasil penilaian dengan instrumen harus lulus atau perlu diulang.'; end if;
  if p_tanggal_uji is null then raise exception 'Tanggal uji wajib diisi.'; end if;
  if not sigarda.instrumen_aktif(p_sku_id) then raise exception 'Butir ini belum memakai instrumen penilaian.'; end if;
  if char_length(v_cat) > 1000 then raise exception 'Catatan maksimal 1000 karakter.'; end if;

  select * into v_h from sigarda.instrumen_hitung(p_sku_id, p_rincian);
  v_diganti := p_hasil <> v_h.o_saran;
  if v_diganti and v_cat = '' then
    raise exception 'Hasil yang dipilih berbeda dari saran (skor %, saran: %). Isi catatan alasannya.', v_h.o_skor, case v_h.o_saran when 'lulus' then 'lulus' else 'perlu diulang' end;
  end if;
  -- Kriteria bersumber iuran: nilai yang berbeda dari saran hitungan iuran (semester dari tanggal uji) wajib disertai catatan alasan
  select o_saran into v_saran_iuran from sigarda.iuran_hitung(p_peserta_id, p_tanggal_uji);
  if v_saran_iuran is not null then
    select exists (
      select 1 from jsonb_array_elements(p_rincian) e join public.instrumen_kriteria k on k.id = (e ->> 'kriteria_id')::bigint and k.sku_id = p_sku_id
      where k.sumber = 'iuran' and (e ->> 'nilai')::int <> v_saran_iuran
    ) into v_beda_iuran;
    if v_beda_iuran and v_cat = '' then
      raise exception 'Nilai kriteria iuran berbeda dari saran hitungan iuran (saran: %). Isi catatan alasannya.', v_saran_iuran;
    end if;
  end if;

  perform set_config('sigarda.via_rubrik', 'ya', true);
  perform public.sg_sku_catat_internal(p_oleh, p_peserta_id, p_sku_id, p_hasil, p_tanggal_uji, case when p_hasil = 'lulus' then v_h.o_nilai end, v_cat);
  perform set_config('sigarda.via_rubrik', '', true);

  select jsonb_agg(jsonb_build_object('kriteria_id', k.id, 'urutan', k.urutan, 'jenis', k.jenis, 'teks', k.teks, 'bobot', k.bobot, 'wajib', k.wajib, 'nilai', r.nilai,
    'sumber', k.sumber, 'saran', case when k.sumber = 'iuran' then v_saran_iuran end) order by k.urutan)
    into v_rinci
  from (select (e ->> 'kriteria_id')::bigint as kriteria_id, (e ->> 'nilai')::int as nilai from jsonb_array_elements(p_rincian) e) r
  join public.instrumen_kriteria k on k.id = r.kriteria_id;

  insert into public.sku_penilaian (peserta_id, sku_id, penguji_id, tanggal_uji, rincian, skor, wajib_ok, saran, hasil, diganti, catatan)
  values (p_peserta_id, p_sku_id, p_oleh, p_tanggal_uji, v_rinci, v_h.o_skor, v_h.o_wajib_ok, v_h.o_saran, p_hasil, v_diganti, v_cat);
  insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
  values (p_peserta_id, p_sku_id,
    'Skor instrumen ' || v_h.o_skor || ' dari 100 (saran: ' || case v_h.o_saran when 'lulus' then 'lulus' else 'perlu diulang' end
    || case when v_h.o_wajib_ok then '' else '; ada syarat wajib belum terpenuhi' end || ')'
    || case when v_diganti then '. Hasil dipilih penguji berbeda dari saran. Alasan: ' || v_cat else '' end
    || case when v_beda_iuran and not v_diganti then '. Nilai kriteria iuran berbeda dari saran iuran (' || v_saran_iuran || '). Alasan: ' || v_cat else '' end, p_oleh);

  return jsonb_build_object('skor', v_h.o_skor, 'saran', v_h.o_saran, 'nilai', v_h.o_nilai, 'wajib_ok', v_h.o_wajib_ok, 'diganti', v_diganti);
end $$;

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
  for v_sku in select sku_id from public.sku_pra_uji where peserta_id = p_peserta and status = 'menunggu' loop
    update public.sku_pra_uji set status = 'dibatalkan', diputuskan_pada = now() where peserta_id = p_peserta and sku_id = v_sku and status = 'menunggu';
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (p_peserta, v_sku, p_alasan, auth.uid());
    v_n := v_n + 1;
  end loop;
  delete from public.sesi_ujian_peserta sp using public.sesi_ujian s
    where s.id = sp.sesi_id and sp.peserta_id = p_peserta and s.status <> 'selesai';
  delete from public.asisten_iuran where peserta_id = p_peserta;
  return v_n;
end $$;

drop trigger if exists tak_aktif_sku_pra_uji on public.sku_pra_uji;
create trigger tak_aktif_sku_pra_uji before insert or update on public.sku_pra_uji for each row execute function sigarda.tolak_peserta_tak_aktif();

-- ===== Pra-uji berjenjang (fase C): aksi =====
-- Pengajuan Penegak lewat sg_sku_ajukan (bila sakelar hidup, diteruskan ke pra-uji); pembatalan lewat sg_sku_batal. Di sini: keputusan penilai pra-uji,
-- antrian penilai, melewati tahap yang macet, dan sakelar. Pra-uji TIDAK memakai PIN (hanya rekomendasi; uji resmi Pembina tetap lewat Edge Function + PIN).

-- Antrian pra-uji milik penilai yang sedang masuk (Pinsa atau Bina Damping) beserta yang sudah ia putuskan. Nama Penegak dikirim lewat fungsi ini karena
-- Penegak biasa tidak dapat membaca profil Penegak lain. { aktif, menunggu: [...], selesai: [... 50 terbaru] }
create or replace function public.sg_pra_uji_antrian() returns jsonb language plpgsql stable security definer set search_path = public as
$$
declare v_uid uuid := auth.uid();
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pra_uji_aktif() then return jsonb_build_object('aktif', false, 'menunggu', '[]'::jsonb, 'selesai', '[]'::jsonb); end if;
  return jsonb_build_object(
    'aktif', true,
    'menunggu', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'peserta_id', r.peserta_id, 'peserta_nama', p.nama, 'kelas', p.kelas, 'sangga', p.sangga, 'sku_id', r.sku_id,
        'tahap', r.tahap, 'jadwal', r.jadwal, 'catatan_peserta', r.catatan_peserta, 'dibuat', r.dibuat) order by r.dibuat)
      from public.sku_pra_uji r join public.profiles p on p.id = r.peserta_id
      where r.status = 'menunggu' and sigarda.pra_uji_penilai_ok(r.peserta_id, r.sku_id, r.tahap, v_uid)
    ), '[]'::jsonb),
    'selesai', coalesce((
      select jsonb_agg(x.j order by x.waktu desc) from (
        select r.diputuskan_pada as waktu, jsonb_build_object('id', r.id, 'peserta_id', r.peserta_id, 'peserta_nama', p.nama, 'kelas', p.kelas, 'sangga', p.sangga,
          'sku_id', r.sku_id, 'tahap', r.tahap, 'status', r.status, 'catatan', r.catatan, 'diputuskan_pada', r.diputuskan_pada) as j
        from public.sku_pra_uji r join public.profiles p on p.id = r.peserta_id
        where r.penilai_id = v_uid and r.status in ('lulus', 'belum') order by r.diputuskan_pada desc limit 50
      ) x
    ), '[]'::jsonb));
end $$;

-- Penilai (Pinsa atau Bina Damping yang memenuhi syarat) memutuskan satu pra-uji. p_hasil: 'lulus' (diteruskan otomatis ke tahap berikut, atau ke uji resmi
-- Pembina bila tahap terakhir) atau 'belum' (kembali ke Penegak; catatan perbaikan wajib). Hasil: { hasil, tujuan } (tujuan: 'pinsa' | 'bina_damping' | 'pembina' | null).
create or replace function public.sg_pra_uji_catat(p_id bigint, p_hasil text, p_catatan text default '') returns jsonb
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_r public.sku_pra_uji; v_cat text := btrim(coalesce(p_catatan, '')); v_nama text; v_tujuan text; v_status text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pra_uji_aktif() then raise exception 'Pra-uji belum diaktifkan.'; end if;
  if p_hasil is null or p_hasil not in ('lulus', 'belum') then raise exception 'Hasil pra-uji harus lulus atau belum lulus.'; end if;
  if char_length(v_cat) > 1000 then raise exception 'Catatan maksimal 1000 karakter.'; end if;
  select * into v_r from public.sku_pra_uji where id = p_id for update;
  if not found or v_r.status <> 'menunggu' then raise exception 'Pengajuan pra-uji ini sudah tidak menunggu.'; end if;
  if not sigarda.pra_uji_penilai_ok(v_r.peserta_id, v_r.sku_id, v_r.tahap, v_uid) then
    raise exception 'Anda tidak dapat menilai pra-uji ini. Penilai adalah Pinsa sangga atau Bina Damping rombel Penegak yang sudah lulus butir yang sama.';
  end if;
  select status into v_status from public.sku_progress where peserta_id = v_r.peserta_id and sku_id = v_r.sku_id;
  if v_status in ('lulus', 'diajukan', 'proses') then raise exception 'Butir ini sudah lulus atau sedang dalam pengujian resmi.'; end if;
  if p_hasil = 'belum' and v_cat = '' then raise exception 'Isi catatan agar Penegak tahu bagian yang perlu diperbaiki.'; end if;
  select nama into v_nama from public.profiles where id = v_uid;

  update public.sku_pra_uji set status = p_hasil, penilai_id = v_uid, penilai_nama = v_nama, catatan = v_cat, diputuskan_pada = now() where id = p_id;
  if p_hasil = 'lulus' then
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (v_r.peserta_id, v_r.sku_id, 'Lulus pra-uji ' || sigarda.pra_uji_nama_tahap(v_r.tahap) || ' (' || v_nama || ')', v_uid);
    v_tujuan := sigarda.pra_uji_teruskan(v_r.peserta_id, v_r.sku_id, v_r.tahap, v_r.jadwal, v_r.catatan_peserta, v_uid);
    perform sigarda.pra_uji_beritahu_lulus(v_r.peserta_id, v_r.sku_id, v_tujuan);
  else
    insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
    values (v_r.peserta_id, v_r.sku_id, 'Belum lulus pra-uji ' || sigarda.pra_uji_nama_tahap(v_r.tahap) || ' (' || v_nama || ')', v_uid);
    perform sigarda.notif_buat(v_r.peserta_id, 'pra_uji', 'Pra-uji belum lulus',
      sigarda.notif_label_butir(v_r.sku_id) || ' belum lulus pra-uji. Buka aplikasi untuk melihat catatan perbaikan.', '{"tab":"sku"}');
  end if;
  return jsonb_build_object('hasil', p_hasil, 'tujuan', v_tujuan);
end $$;

-- Pembina atau Admin Gudep melewati tahap pra-uji yang macet (mis. Pinsa berhalangan): pengajuan diteruskan ke tahap berikutnya atau uji resmi, dengan alasan.
create or replace function public.sg_pra_uji_lewati(p_id bigint, p_alasan text) returns text language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_r public.sku_pra_uji; v_alasan text := btrim(coalesce(p_alasan, '')); v_nama text; v_tujuan text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina atau Admin Gudep yang dapat melewati tahap pra-uji.'; end if;
  if v_alasan = '' then raise exception 'Isi alasan melewati tahap pra-uji.'; end if;
  if char_length(v_alasan) > 200 then raise exception 'Alasan maksimal 200 karakter.'; end if;
  select * into v_r from public.sku_pra_uji where id = p_id for update;
  if not found or v_r.status <> 'menunggu' then raise exception 'Pengajuan pra-uji ini sudah tidak menunggu.'; end if;
  select nama into v_nama from public.profiles where id = v_uid;
  update public.sku_pra_uji set status = 'dilewati', penilai_id = v_uid, penilai_nama = v_nama, catatan = v_alasan, diputuskan_pada = now() where id = p_id;
  insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
  values (v_r.peserta_id, v_r.sku_id, 'Tahap pra-uji ' || sigarda.pra_uji_nama_tahap(v_r.tahap) || ' dilewati oleh ' || v_nama || '. Alasan: ' || v_alasan, v_uid);
  v_tujuan := sigarda.pra_uji_teruskan(v_r.peserta_id, v_r.sku_id, v_r.tahap, v_r.jadwal, v_r.catatan_peserta, v_uid);
  perform sigarda.pra_uji_beritahu_lulus(v_r.peserta_id, v_r.sku_id, v_tujuan, true);
  return v_tujuan;
end $$;

-- Sakelar pra-uji (Pembina dan Admin Gudep). Hidup: uji resmi hanya Pembina; pengajuan yang menunggu dan ditujukan kepada penguji non-Pembina kembali ke
-- antrian rombel. Mati: pra-uji yang masih menunggu diteruskan langsung ke uji resmi (antrian rombel). Hasil: { aktif, dialihkan }.
create or replace function public.sg_pra_uji_sakelar(p_aktif boolean) returns jsonb language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_lama boolean := sigarda.pra_uji_aktif(); v_r record; v_n int := 0; v_nama text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina atau Admin Gudep yang dapat mengubah pengaturan pra-uji.'; end if;
  if p_aktif is null then raise exception 'Pilih hidup atau mati.'; end if;
  if p_aktif = v_lama then return jsonb_build_object('aktif', v_lama, 'dialihkan', 0); end if;
  select nama into v_nama from public.profiles where id = v_uid;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada) values ('pra_uji.aktif', jsonb_build_object('aktif', p_aktif), v_uid, now())
  on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
  if p_aktif then
    for v_r in select peserta_id, sku_id from public.sku_progress where status = 'diajukan' and penguji_id is not null and not sigarda.bisa_menguji(penguji_id) loop
      update public.sku_progress set penguji_id = null, diubah = now() where peserta_id = v_r.peserta_id and sku_id = v_r.sku_id;
      insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
      values (v_r.peserta_id, v_r.sku_id, 'Dikembalikan ke antrian rombel karena pra-uji diaktifkan (uji resmi hanya Pembina)', v_uid);
      v_n := v_n + 1;
    end loop;
  else
    for v_r in select * from public.sku_pra_uji where status = 'menunggu' order by id loop
      if exists (select 1 from sigarda.penguji_sah(v_r.peserta_id, v_r.sku_id)) then
        update public.sku_pra_uji set status = 'dilewati', penilai_id = v_uid, penilai_nama = v_nama, catatan = 'Pra-uji dimatikan', diputuskan_pada = now() where id = v_r.id;
        perform sigarda.pra_uji_teruskan(v_r.peserta_id, v_r.sku_id, 'bina_damping', v_r.jadwal, v_r.catatan_peserta, v_uid);
      else
        update public.sku_pra_uji set status = 'dibatalkan', catatan = 'Pra-uji dimatikan', diputuskan_pada = now() where id = v_r.id;
        insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh) values (v_r.peserta_id, v_r.sku_id, 'Pengajuan pra-uji dibatalkan karena pra-uji dimatikan', v_uid);
      end if;
      v_n := v_n + 1;
    end loop;
  end if;
  return jsonb_build_object('aktif', p_aktif, 'dialihkan', v_n);
end $$;
-- ===== akhir aksi pra-uji =====

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
      'pengukuhan_dewan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.pengukuhan_dewan t),
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
      'kegiatan_usulan', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.kegiatan_usulan t),
      'bina_damping', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.bina_damping t),
      'sku_pra_uji', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.sku_pra_uji t)
    )
  ) into v_hasil;
  insert into public.pengaturan (kunci, nilai, diubah_oleh, diubah_pada)
    values ('cadangan.terakhir', jsonb_build_object('pada', now(), 'oleh', (select nama from public.profiles where id = auth.uid())), auth.uid(), now())
    on conflict (kunci) do update set nilai = excluded.nilai, diubah_oleh = excluded.diubah_oleh, diubah_pada = excluded.diubah_pada;
  return v_hasil;
end $$;

revoke all on function
  public.sg_pra_uji_antrian(), public.sg_pra_uji_catat(bigint, text, text), public.sg_pra_uji_lewati(bigint, text), public.sg_pra_uji_sakelar(boolean)
  from public, anon, authenticated;
grant execute on function
  public.sg_pra_uji_antrian(), public.sg_pra_uji_catat(bigint, text, text), public.sg_pra_uji_lewati(bigint, text), public.sg_pra_uji_sakelar(boolean)
  to authenticated;
-- Fungsi sigarda.* baru: hak dijalankan ulang di sini (grant "all functions in schema" tidak retroaktif untuk fungsi baru).
revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
