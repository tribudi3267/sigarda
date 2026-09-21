-- ============================================================================
-- MIGRASI: Dewan Ambalan sebagai ATRIBUT akun Penegak, penugasan khusus per Penegak, dan aturan penguji berdasar penugasan (fase 6b).
-- AMAN untuk database berisi data.
--
-- Jalankan SETELAH migrasi naik kelas (dan yang sebelumnya). Isi:
--   * profiles.jabatan_dewan kini isian bebas (2 sampai 60 karakter) dan boleh dipegang akun PENEGAK aktif (Dewan bukan lagi akun terpisah). Penegak berjabatan Dewan
--     tetap Penegak (NIS, rombel, progres SKU sendiri), sekaligus menjadi pengurus dan penguji: aplikasi memberi tombol tampilan Penegak/Dewan.
--     Pradana dan Pradani tetap masing-masing satu pemegang (ketua sidang dan penanda tangan Surat Tanda Lulus). Akun Dewan LAMA (akun penguji) tetap berfungsi
--     sampai Admin mengarsipkannya (sg_dewan_lama_arsipkan; arsip = status nonaktif, riwayat tetap).
--   * sigarda.pengurus, sigarda.dewan, sigarda.bisa_menguji: Penegak aktif berjabatan Dewan ikut sebagai pengurus dan penguji; penguji yang diarsipkan tidak lagi.
--   * Aturan penguji berdasar PENUGASAN (menggantikan aturan "Dewan hanya butir Bantara" dan "Laksana khusus Pembina"): butir agama tetap hanya Pembina yang seagama
--     (atau guru agama lewat surat pengantar); butir Laksana boleh diuji Pembina atau penguji yang DITUGASKAN untuk Penegak itu (sigarda.ditugaskan); tanpa penugasan Dewan
--     hanya menguji butir Bantara. Tidak ada yang menguji atau menilai dirinya sendiri.
--   * penugasan_peserta + sg_penugasan_peserta_atur: penugasan KHUSUS satu Penegak (menggantikan penugasan rombelnya). sg_penugasan_atur dan sg_penugasan_salin kini juga
--     boleh dipakai Pembina (sebelumnya hanya Admin). penugasan_log memuat peserta_id dan peserta_nama untuk penugasan khusus.
--   * kepengurusan_log (riwayat), sg_anggota_jabatan_dewan_atur (Pembina dan Admin; untuk Penegak), sg_kepengurusan_terapkan (berkas Kepengurusan: pratinjau lalu terapkan,
--     mengganti seluruh kepengurusan), jabatan otomatis dicabut saat Penegak menjadi nonaktif atau alumni (sg_anggota_status_atur, sg_naik_kelas), dan penugasan penguji ikut dihapus.
--   * baca_profil: Penegak berjabatan Dewan terbaca semua pengguna (namanya tampil sebagai penguji).
--   Edge Function sigarda PERLU di-deploy ulang (catat hasil dan reset PIN mengenali Penegak berjabatan Dewan): salin supabase/functions/sigarda/index.ts.
-- TIDAK menghapus data yang ada. Aman dijalankan berulang kali.
--
-- Cara: Supabase > SQL Editor > New query > tempel seluruh isi berkas ini > Run.
-- Isi sama dengan bagian yang sama di supabase/sumber/inti.sql (dijaga oleh pengujian kesetaraan).
-- ============================================================================
set check_function_bodies = off;
begin;

-- Prasyarat: skema dasar dan migrasi sebelumnya (sampai naik kelas) sudah ada.
do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.penugasan_rombel') is null or to_regclass('public.naik_kelas_log') is null
     or to_regprocedure('public.sg_naik_kelas(text, jsonb, boolean)') is null or to_regprocedure('public.sg_anggota_jabatan_dewan_atur(jsonb)') is null
     or to_regprocedure('sigarda.penguji_peran_ok(uuid, uuid, text)') is null then
    raise exception 'Jalankan lebih dulu skema dan migrasi sebelumnya sampai 2026-09-naik-kelas.sql (lihat README), baru migrasi ini.';
  end if;
end $$;

-- Jabatan Dewan: isian bebas, boleh pada akun Penegak (akun Dewan lama tetap boleh sampai diarsipkan).
alter table public.profiles drop constraint if exists profiles_jabatan_dewan_check;
alter table public.profiles add constraint profiles_jabatan_dewan_check
  check (jabatan_dewan is null or (char_length(jabatan_dewan) between 2 and 60 and jabatan_dewan !~ '[[:cntrl:]<>]'));
alter table public.profiles drop constraint if exists profil_jabatan_dewan;
alter table public.profiles add constraint profil_jabatan_dewan
  check (jabatan_dewan is null or role = 'peserta' or (role = 'penguji' and jabatan = 'Dewan Ambalan'));

alter table public.penugasan_log add column if not exists peserta_id uuid references public.profiles(id) on delete set null;
alter table public.penugasan_log add column if not exists peserta_nama text;

-- ===== Dewan Ambalan sebagai atribut Penegak: tabel =====
-- Penugasan KHUSUS satu Penegak (pengecualian): bila sebuah Penegak punya baris di sini pada tahun ajaran berjalan, hanya penguji itu yang sah untuk
-- Penegak tersebut (menggantikan penugasan rombelnya). Contoh: pindah rombel di tengah tahun, Pembina cuti panjang, konflik kepentingan, Penegak berjabatan Dewan.
-- Diatur Pembina dan Admin Gudep lewat sg_penugasan_peserta_atur; riwayat di penugasan_log.
create table if not exists public.penugasan_peserta (
  tahun_ajaran text not null check (tahun_ajaran ~ '^[0-9]{4}/[0-9]{4}$'),
  peserta_id uuid not null references public.profiles(id) on delete cascade,
  penguji_id uuid not null references public.profiles(id) on delete cascade,
  ditetapkan_oleh uuid references public.profiles(id) on delete set null,
  ditetapkan_pada timestamptz not null default now(),
  primary key (tahun_ajaran, peserta_id, penguji_id)
);
create index if not exists penugasan_peserta_penguji_idx on public.penugasan_peserta (penguji_id);
-- Riwayat kepengurusan Dewan Ambalan (hanya bertambah): siapa memegang jabatan apa, kapan diberikan, kapan dicabut dan mengapa. Nama disalin agar tetap terbaca.
create table if not exists public.kepengurusan_log (
  id bigint generated always as identity primary key,
  waktu timestamptz not null default now(),
  peserta_id uuid references public.profiles(id) on delete set null,
  peserta_nama text not null,
  nis text,
  tindakan text not null check (tindakan in ('beri','ganti','cabut')),
  jabatan_lama text,
  jabatan_baru text,
  alasan text not null default '' check (char_length(alasan) <= 200),
  oleh uuid references public.profiles(id) on delete set null,
  oleh_nama text not null default ''
);
create index if not exists kepengurusan_log_waktu_idx on public.kepengurusan_log (id);
-- ===== akhir tabel dewan penegak =====

-- ---- Dewan Ambalan sebagai atribut Penegak: fungsi bantu (dicerminkan src/lib/rombelLogic.js dan dewanLogic.js; dijaga oleh pengujian) ----
-- Boleh menguji: Pembina, Dewan Ambalan lama (belum diarsipkan), atau Penegak aktif berjabatan Dewan Ambalan. Admin Gudep tidak menguji.
create or replace function sigarda.bisa_menguji(p_id uuid) returns boolean language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.profiles
    where id = p_id and status = 'aktif' and (role = 'penguji' or (role = 'peserta' and jabatan_dewan is not null))
  )
$$;

-- Penguji ini DITUGASKAN untuk Penegak ini pada tahun ajaran berjalan? Penugasan khusus Penegak (bila ada) menggantikan penugasan rombelnya.
create or replace function sigarda.ditugaskan(p_peserta uuid, p_penguji uuid) returns boolean language plpgsql stable security definer set search_path = public as
$$
declare v_kelas text;
begin
  if exists (select 1 from public.penugasan_peserta where tahun_ajaran = sigarda.tahun_ajaran_kini() and peserta_id = p_peserta) then
    return exists (select 1 from public.penugasan_peserta where tahun_ajaran = sigarda.tahun_ajaran_kini() and peserta_id = p_peserta and penguji_id = p_penguji);
  end if;
  select kelas into v_kelas from public.profiles where id = p_peserta;
  return sigarda.rombel_sah(v_kelas) and exists (
    select 1 from public.penugasan_rombel where tahun_ajaran = sigarda.tahun_ajaran_kini() and rombel = v_kelas and penguji_id = p_penguji);
end $$;

-- Jabatan Dewan tanpa selisih huruf: "pradana" -> "Pradana", "PRADANI" -> "Pradani"; selain itu spasi dirapikan dan ditulis apa adanya.
create or replace function sigarda.jabatan_baku(p_teks text) returns text language sql immutable as
$$
  select case lower(sigarda.rapikan(p_teks)) when 'pradana' then 'Pradana' when 'pradani' then 'Pradani' else sigarda.rapikan(p_teks) end
$$;

-- Mencabut jabatan Dewan dari satu anggota (Penegak, atau akun Dewan lama) dan merapikan akibatnya: penugasan sebagai penguji dihapus (tercatat) dan
-- pengajuan uji yang menunggu dan ditujukan kepadanya kembali ke antrian rombel. Pengujian yang sedang berjalan ("proses") dibiarkan
-- (Pembina dapat mengalihkannya). Tercatat di kepengurusan_log. Tanpa jabatan = tidak melakukan apa pun. Dipanggil juga saat anggota menjadi nonaktif atau alumni.
create or replace function sigarda.jabatan_dewan_lepas(p_id uuid, p_alasan text) returns void language plpgsql security definer set search_path = public as
$$
declare v_t public.profiles; v_oleh text; v_r record;
begin
  select * into v_t from public.profiles where id = p_id;
  if not found or v_t.jabatan_dewan is null then return; end if;
  select nama into v_oleh from public.profiles where id = auth.uid();
  insert into public.kepengurusan_log (peserta_id, peserta_nama, nis, tindakan, jabatan_lama, jabatan_baru, alasan, oleh, oleh_nama)
  values (p_id, v_t.nama, coalesce(v_t.nis, v_t.username), 'cabut', v_t.jabatan_dewan, null, left(coalesce(p_alasan, ''), 200), auth.uid(), coalesce(v_oleh, ''));
  update public.profiles set jabatan_dewan = null where id = p_id;
  for v_r in select tahun_ajaran, rombel from public.penugasan_rombel where penguji_id = p_id loop
    insert into public.penugasan_log (tahun_ajaran, rombel, penguji_id, penguji_nama, tindakan, catatan, oleh, oleh_nama)
    values (v_r.tahun_ajaran, v_r.rombel, p_id, v_t.nama, 'hapus', 'Jabatan Dewan berakhir', auth.uid(), coalesce(v_oleh, ''));
  end loop;
  delete from public.penugasan_rombel where penguji_id = p_id;
  for v_r in select x.tahun_ajaran, x.peserta_id, pr.nama as peserta_nama, pr.kelas from public.penugasan_peserta x join public.profiles pr on pr.id = x.peserta_id where x.penguji_id = p_id loop
    insert into public.penugasan_log (tahun_ajaran, rombel, penguji_id, penguji_nama, tindakan, catatan, oleh, oleh_nama, peserta_id, peserta_nama)
    values (v_r.tahun_ajaran, coalesce(v_r.kelas, ''), p_id, v_t.nama, 'hapus', 'Jabatan Dewan berakhir', auth.uid(), coalesce(v_oleh, ''), v_r.peserta_id, v_r.peserta_nama);
  end loop;
  delete from public.penugasan_peserta where penguji_id = p_id;
  update public.sku_progress set penguji_id = null, diubah = now() where penguji_id = p_id and status = 'diajukan';
end $$;
-- ---- akhir bantu dewan penegak ----

create or replace function sigarda.pengurus() returns boolean language plpgsql stable security definer set search_path = public as
$$
begin
  -- Pengurus: penguji dan Admin yang aktif, serta Penegak aktif yang berjabatan Dewan Ambalan (Dewan = atribut akun Penegak).
  return coalesce((select ((role in ('penguji','admin') or (role = 'peserta' and jabatan_dewan is not null)) and status = 'aktif') and not wajib_ganti_pin
                   from public.profiles where id = auth.uid()), false);
end $$;

create or replace function sigarda.dewan() returns boolean language plpgsql stable security definer set search_path = public as
$$
begin
  -- Dewan Ambalan: Penegak aktif berjabatan Dewan (akun biasa) atau akun Dewan lama yang belum diarsipkan.
  return coalesce((select ((role = 'penguji' and jabatan = 'Dewan Ambalan') or (role = 'peserta' and jabatan_dewan is not null)) and status = 'aktif' and not wajib_ganti_pin
                   from public.profiles where id = auth.uid()), false);
end $$;

create or replace function sigarda.penguji_peran_ok(p_peserta uuid, p_penguji uuid, p_sku text) returns boolean
language plpgsql stable security definer set search_path = public as
$$
declare v_u public.profiles; v_tingkat text; v_agama_butir text; v_agama_peserta text; v_pembina boolean;
begin
  if p_penguji is null or p_penguji = p_peserta or not sigarda.bisa_menguji(p_penguji) then return false; end if;
  select * into v_u from public.profiles where id = p_penguji;
  select tingkat, agama into v_tingkat, v_agama_butir from public.sku_unit where id = p_sku;
  if not found then return false; end if;
  v_pembina := v_u.role = 'penguji' and v_u.jabatan = 'Pembina';
  if not v_pembina and v_agama_butir is not null then return false; end if;
  if not v_pembina and v_tingkat = 'Laksana' and not sigarda.ditugaskan(p_peserta, p_penguji) then return false; end if;
  if v_agama_butir is not null
     and exists (select 1 from public.profiles b where b.role = 'penguji' and b.jabatan = 'Pembina' and b.agama is not null) then
    select agama into v_agama_peserta from public.profiles where id = p_peserta;
    if (v_u.agama is null or v_u.agama is distinct from v_agama_peserta) and not sigarda.surat_agama_aktif(p_peserta, p_sku) then return false; end if;
  end if;
  return true;
end $$;

create or replace function sigarda.penguji_sah(p_peserta uuid, p_sku text) returns table (o_penguji uuid, o_rombel boolean)
language plpgsql stable security definer set search_path = public as
$$
declare v_kelas text;
begin
  select kelas into v_kelas from public.profiles where id = p_peserta and role = 'peserta';
  if not found then return; end if;
  if exists (
    select 1 from public.penugasan_peserta x
    where x.tahun_ajaran = sigarda.tahun_ajaran_kini() and x.peserta_id = p_peserta and sigarda.penguji_peran_ok(p_peserta, x.penguji_id, p_sku)
  ) then
    return query select x.penguji_id, true from public.penugasan_peserta x
      where x.tahun_ajaran = sigarda.tahun_ajaran_kini() and x.peserta_id = p_peserta and sigarda.penguji_peran_ok(p_peserta, x.penguji_id, p_sku);
    return;
  end if;
  if sigarda.rombel_sah(v_kelas) and exists (
    select 1 from public.penugasan_rombel r
    where r.tahun_ajaran = sigarda.tahun_ajaran_kini() and r.rombel = v_kelas and sigarda.penguji_peran_ok(p_peserta, r.penguji_id, p_sku)
  ) then
    return query select r.penguji_id, true from public.penugasan_rombel r
      where r.tahun_ajaran = sigarda.tahun_ajaran_kini() and r.rombel = v_kelas and sigarda.penguji_peran_ok(p_peserta, r.penguji_id, p_sku);
  else
    return query select u.id, false from public.profiles u where sigarda.bisa_menguji(u.id) and sigarda.penguji_peran_ok(p_peserta, u.id, p_sku);
  end if;
end $$;

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
  if char_length(coalesce(p_catatan, '')) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;

  insert into public.sku_progress (peserta_id, sku_id, status, jadwal, penguji_id, catatan_peserta, diubah)
  values (v_uid, p_sku_id, 'diajukan', p_jadwal, p_penguji_id, btrim(coalesce(p_catatan, '')), now())
  on conflict (peserta_id, sku_id) do update
    set status = 'diajukan', jadwal = excluded.jadwal, penguji_id = excluded.penguji_id,
        catatan_peserta = excluded.catatan_peserta, diubah = now();
  insert into public.sku_riwayat (peserta_id, sku_id, teks, oleh)
  values (v_uid, p_sku_id, 'Mengajukan pengujian untuk ' || to_char(p_jadwal, 'YYYY-MM-DD') || case when p_penguji_id is null then ' (antrian rombel)' else '' end, v_uid);
end $$;

create or replace function public.sg_penguji_pilihan(p_sku_id text, p_peserta_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_peserta uuid; v_p public.profiles; v_u public.sku_unit;
begin
  perform sigarda.wajib_aktif();
  if exists (select 1 from public.profiles where id = v_uid and role = 'peserta') then v_peserta := v_uid;
  elsif sigarda.pembina_atau_admin() then v_peserta := p_peserta_id;
  else raise exception 'Daftar penguji hanya untuk Penegak, Pembina, dan Admin Gudep.';
  end if;
  select * into v_p from public.profiles where id = v_peserta and role = 'peserta';
  if not found then raise exception 'Peserta tidak ditemukan.'; end if;
  select * into v_u from public.sku_unit where id = p_sku_id and (agama is null or agama = v_p.agama);
  if not found then raise exception 'Poin SKU tidak ditemukan.'; end if;
  return jsonb_build_object(
    'sumber', case when exists (select 1 from sigarda.penguji_sah(v_peserta, p_sku_id) s where s.o_rombel) then 'rombel' else 'semua' end,
    'rombel', v_p.kelas,
    'agama_butir', v_u.agama is not null,
    'penguji', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'jabatan', x.jabatan, 'jabatan_dewan', x.jabatan_dewan, 'agama', x.agama, 'beban', x.beban) order by x.beban, x.nama)
      from (
        select u.id, u.nama, case when u.role = 'peserta' then 'Dewan Ambalan' else u.jabatan end as jabatan, u.jabatan_dewan, u.agama,
          (select count(*) from public.sku_progress sp where sp.penguji_id = u.id and sp.status in ('diajukan', 'proses'))::int as beban
        from public.profiles u where u.id in (select s.o_penguji from sigarda.penguji_sah(v_peserta, p_sku_id) s)
      ) x
    ), '[]'::jsonb));
end $$;

create or replace function public.sg_sku_catat_internal(
  p_oleh uuid, p_peserta_id uuid, p_sku_id text, p_hasil text,
  p_tanggal_uji date default null, p_nilai text default null, p_catatan text default ''
) returns void language plpgsql security definer set search_path = public as
$$
declare v_p public.profiles; v_kode text; v_cat text := btrim(coalesce(p_catatan, '')); v_lama public.sku_progress; v_ganti text := ''; v_luar text;
begin
  if not sigarda.bisa_menguji(p_oleh) then
    raise exception 'Hanya Pembina atau Dewan Ambalan yang dapat mencatat hasil.';
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

create or replace function public.sg_sku_catat_rubrik_internal(
  p_oleh uuid, p_peserta_id uuid, p_sku_id text, p_tanggal_uji date, p_rincian jsonb, p_hasil text, p_catatan text default ''
) returns jsonb language plpgsql security definer set search_path = public as
$$
declare
  v_p public.profiles; v_cat text := btrim(coalesce(p_catatan, '')); v_h record; v_diganti boolean; v_rinci jsonb; v_saran_iuran int; v_beda_iuran boolean := false;
begin
  if not sigarda.bisa_menguji(p_oleh) then
    raise exception 'Hanya Pembina atau Dewan Ambalan yang dapat mencatat hasil.';
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

create or replace function public.sg_pf_catat_penguji(p_peserta_id uuid, p_item_id text, p_catatan text) returns void
language plpgsql security definer set search_path = public as
$$
declare v_uid uuid := auth.uid(); v_lama text := ''; v_baru text := btrim(coalesce(p_catatan, ''));
begin
  perform sigarda.wajib_aktif();
  if not sigarda.bisa_menguji(v_uid) then
    raise exception 'Hanya Pembina atau Dewan Ambalan yang dapat memberi catatan.';
  end if;
  if p_peserta_id = v_uid then raise exception 'Anda tidak dapat memberi catatan penguji pada portofolio sendiri.'; end if;
  if not exists (select 1 from public.profiles where id = p_peserta_id and role = 'peserta') then raise exception 'Peserta tidak ditemukan.'; end if;
  if not exists (select 1 from public.pf_item where id = p_item_id) then raise exception 'Dokumen portofolio tidak dikenal.'; end if;
  if char_length(v_baru) > 2000 then raise exception 'Catatan maksimal 2000 karakter.'; end if;

  select catatan_penguji into v_lama from public.portofolio where peserta_id = p_peserta_id and item_id = p_item_id;
  if v_baru = btrim(coalesce(v_lama, '')) then return; end if;

  insert into public.portofolio (peserta_id, item_id, catatan_penguji, catatan_penguji_oleh, diperbarui)
  values (p_peserta_id, p_item_id, v_baru, v_uid, now())
  on conflict (peserta_id, item_id) do update set catatan_penguji = v_baru, catatan_penguji_oleh = v_uid;
  insert into public.portofolio_jurnal (peserta_id, item_id, teks, oleh)
  values (p_peserta_id, p_item_id, case when v_baru = '' then 'Catatan penguji dihapus' else 'Catatan penguji ditambahkan' end, v_uid);
end $$;

create or replace function public.sg_penugasan_atur(p_tahun_ajaran text, p_penguji_id uuid, p_rombel text[], p_ada boolean) returns int
language plpgsql security definer set search_path = public as
$$
declare v_b text; v_r text; v_n int := 0; v_k int; v_nama text; v_oleh text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengatur penugasan penguji.'; end if;
  if not sigarda.tahun_ajaran_sah(p_tahun_ajaran) then raise exception 'Tahun ajaran tidak sah. Contoh: 2026/2027.'; end if;
  if p_ada is null then raise exception 'Pilihan tambah atau cabut wajib diisi.'; end if;
  select nama into v_nama from public.profiles where id = p_penguji_id;
  if not found or not (sigarda.bisa_menguji(p_penguji_id) or (not p_ada and exists (select 1 from public.penugasan_rombel where penguji_id = p_penguji_id))) then
    raise exception 'Penguji tidak ditemukan. Penugasan hanya untuk Pembina dan Penegak berjabatan Dewan Ambalan yang aktif.';
  end if;
  if coalesce(array_length(p_rombel, 1), 0) = 0 then return 0; end if;
  if array_length(p_rombel, 1) > 30 then raise exception 'Maksimal 30 rombel per permintaan.'; end if;
  select nama into v_oleh from public.profiles where id = auth.uid();

  foreach v_b in array p_rombel loop
    v_r := sigarda.rombel_baku(v_b);
    if not sigarda.rombel_sah(v_r) then
      raise exception 'Rombel "%" tidak sah. Gunakan X-01 sampai X-10, XI-01 sampai XI-10, atau XII-01 sampai XII-10.', v_b;
    end if;
    if p_ada then
      insert into public.penugasan_rombel (tahun_ajaran, rombel, penguji_id, ditetapkan_oleh)
      values (p_tahun_ajaran, v_r, p_penguji_id, auth.uid()) on conflict do nothing;
    else
      delete from public.penugasan_rombel where tahun_ajaran = p_tahun_ajaran and rombel = v_r and penguji_id = p_penguji_id;
    end if;
    get diagnostics v_k = row_count;
    if v_k > 0 then
      insert into public.penugasan_log (tahun_ajaran, rombel, penguji_id, penguji_nama, tindakan, oleh, oleh_nama)
      values (p_tahun_ajaran, v_r, p_penguji_id, v_nama, case when p_ada then 'tambah' else 'hapus' end, auth.uid(), coalesce(v_oleh, ''));
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

create or replace function public.sg_penugasan_peserta_atur(p_tahun_ajaran text, p_peserta_id uuid, p_penguji_ids uuid[], p_alasan text default '') returns int
language plpgsql security definer set search_path = public as
$$
declare v_p public.profiles; v_ids uuid[]; v_id uuid; v_n int := 0; v_nama text; v_oleh text; v_alasan text := sigarda.rapikan(p_alasan); v_k int;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengatur penugasan penguji.'; end if;
  if not sigarda.tahun_ajaran_sah(p_tahun_ajaran) then raise exception 'Tahun ajaran tidak sah. Contoh: 2026/2027.'; end if;
  select * into v_p from public.profiles where id = p_peserta_id and role = 'peserta';
  if not found then raise exception 'Penegak tidak ditemukan.'; end if;
  if v_p.status <> 'aktif' then raise exception '% berstatus % dan tidak dapat diatur penugasannya.', v_p.nama, v_p.status; end if;
  v_ids := coalesce((select array_agg(distinct x) from unnest(p_penguji_ids) x), '{}');
  if cardinality(v_ids) > 10 then raise exception 'Maksimal 10 penguji untuk satu Penegak.'; end if;
  if char_length(v_alasan) > 200 then raise exception 'Alasan maksimal 200 karakter.'; end if;
  foreach v_id in array v_ids loop
    if v_id = p_peserta_id then raise exception 'Penegak tidak dapat menjadi pengujinya sendiri.'; end if;
    if not sigarda.bisa_menguji(v_id) then raise exception 'Penguji tidak ditemukan atau tidak aktif. Penugasan hanya untuk Pembina dan Penegak berjabatan Dewan Ambalan.'; end if;
  end loop;
  select nama into v_oleh from public.profiles where id = auth.uid();

  -- yang dicabut
  for v_id in select penguji_id from public.penugasan_peserta where tahun_ajaran = p_tahun_ajaran and peserta_id = p_peserta_id and not (penguji_id = any (v_ids)) loop
    select nama into v_nama from public.profiles where id = v_id;
    delete from public.penugasan_peserta where tahun_ajaran = p_tahun_ajaran and peserta_id = p_peserta_id and penguji_id = v_id;
    insert into public.penugasan_log (tahun_ajaran, rombel, penguji_id, penguji_nama, tindakan, catatan, oleh, oleh_nama, peserta_id, peserta_nama)
    values (p_tahun_ajaran, coalesce(v_p.kelas, ''), v_id, coalesce(v_nama, ''), 'hapus', v_alasan, auth.uid(), coalesce(v_oleh, ''), p_peserta_id, v_p.nama);
    v_n := v_n + 1;
  end loop;
  -- yang ditambah
  foreach v_id in array v_ids loop
    insert into public.penugasan_peserta (tahun_ajaran, peserta_id, penguji_id, ditetapkan_oleh) values (p_tahun_ajaran, p_peserta_id, v_id, auth.uid()) on conflict do nothing;
    get diagnostics v_k = row_count;
    if v_k > 0 then
      select nama into v_nama from public.profiles where id = v_id;
      insert into public.penugasan_log (tahun_ajaran, rombel, penguji_id, penguji_nama, tindakan, catatan, oleh, oleh_nama, peserta_id, peserta_nama)
      values (p_tahun_ajaran, coalesce(v_p.kelas, ''), v_id, coalesce(v_nama, ''), 'tambah', v_alasan, auth.uid(), coalesce(v_oleh, ''), p_peserta_id, v_p.nama);
      v_n := v_n + 1;
    end if;
  end loop;
  if v_n > 0 and v_alasan = '' then raise exception 'Isi alasan penugasan khusus (mis. konflik kepentingan, pindah rombel, penguji cuti).'; end if;
  return v_n;
end $$;

create or replace function public.sg_penugasan_salin(p_dari text, p_ke text) returns int
language plpgsql security definer set search_path = public as
$$
declare v_n int; v_oleh text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengatur penugasan penguji.'; end if;
  if not sigarda.tahun_ajaran_sah(p_dari) or not sigarda.tahun_ajaran_sah(p_ke) then raise exception 'Tahun ajaran tidak sah. Contoh: 2026/2027.'; end if;
  if p_dari = p_ke then raise exception 'Tahun ajaran asal dan tujuan tidak boleh sama.'; end if;
  if not exists (select 1 from public.penugasan_rombel where tahun_ajaran = p_dari) then
    raise exception 'Tahun ajaran % belum memiliki penugasan untuk disalin.', p_dari;
  end if;
  select nama into v_oleh from public.profiles where id = auth.uid();

  with baru as (
    insert into public.penugasan_rombel (tahun_ajaran, rombel, penguji_id, ditetapkan_oleh)
    select p_ke, rombel, penguji_id, auth.uid() from public.penugasan_rombel where tahun_ajaran = p_dari and sigarda.bisa_menguji(penguji_id)
    on conflict do nothing returning rombel, penguji_id
  )
  insert into public.penugasan_log (tahun_ajaran, rombel, penguji_id, penguji_nama, tindakan, catatan, oleh, oleh_nama)
  select p_ke, b.rombel, b.penguji_id, pr.nama, 'tambah', 'Disalin dari ' || p_dari, auth.uid(), coalesce(v_oleh, '')
  from baru b join public.profiles pr on pr.id = b.penguji_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

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
          if v_t.jabatan_dewan is not null then v_pesan := array_append(v_pesan, 'Jabatan Dewan Ambalan (' || v_t.jabatan_dewan || ') akan dicabut.'); end if;
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
        perform sigarda.jabatan_dewan_lepas(v_id, case when v_ke_status = 'alumni' then 'Penegak menjadi alumni' else 'Penegak tidak melanjutkan Pramuka' end);
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
    perform sigarda.jabatan_dewan_lepas(p_id, case when p_status = 'alumni' then 'Penegak menjadi alumni' else 'Penegak tidak melanjutkan Pramuka' end);
  end if;
  select nama into v_oleh from public.profiles where id = auth.uid();
  insert into public.naik_kelas_log (batch_id, peserta_id, peserta_nama, nis, aksi, dari_kelas, ke_kelas, dari_status, ke_status, dari_status_pada, dari_lulus_ta, catatan, oleh, oleh_nama)
  values (null, p_id, v_t.nama, coalesce(v_t.nis, v_t.username), v_aksi, v_t.kelas, v_kelas, v_t.status, p_status, v_t.status_pada, v_t.lulus_ta, v_cat, auth.uid(), coalesce(v_oleh, ''));
  update public.profiles
    set kelas = v_kelas, status = p_status, status_pada = sigarda.hari_ini(),
        lulus_ta = case when p_status = 'alumni' then sigarda.tahun_ajaran_kini() else null end
    where id = p_id;
end $$;

create or replace function public.sg_anggota_jabatan_dewan_atur(p_data jsonb) returns int
language plpgsql security definer set search_path = public as
$$
declare v_e jsonb; v_user text; v_jab text; v_n int := 0; v_lain text; v_t public.profiles; v_oleh text;
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengubah jabatan Dewan Ambalan.'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'array' then raise exception 'Data jabatan tidak valid.'; end if;
  if jsonb_array_length(p_data) > 100 then raise exception 'Maksimal 100 baris jabatan per permintaan.'; end if;
  select nama into v_oleh from public.profiles where id = auth.uid();
  for v_e in select * from jsonb_array_elements(p_data) loop
    v_user := lower(btrim(coalesce(v_e ->> 'username', '')));
    v_jab := sigarda.jabatan_baku(coalesce(v_e ->> 'jabatan', ''));
    if v_user = '' then raise exception 'NIS Penegak wajib diisi.'; end if;
    if v_jab <> '' and (char_length(v_jab) not between 2 and 60 or v_jab ~ '[[:cntrl:]<>]') then
      raise exception 'Jabatan Dewan Ambalan harus 2 sampai 60 karakter tanpa tanda < atau >.';
    end if;
    select * into v_t from public.profiles where username = v_user;
    if not found then raise exception 'Anggota "%" tidak ditemukan.', v_user; end if;
    if v_jab = '' then
      if v_t.jabatan_dewan is not null then
        perform sigarda.jabatan_dewan_lepas(v_t.id, 'Jabatan dicabut oleh ' || coalesce(v_oleh, 'pengelola'));
        v_n := v_n + 1;
      end if;
      continue;
    end if;
    if v_t.role <> 'peserta' then raise exception '% bukan Penegak. Jabatan Dewan Ambalan hanya untuk Penegak.', v_t.nama; end if;
    if v_t.status <> 'aktif' then raise exception '% berstatus % dan tidak dapat menjabat. Aktifkan kembali lebih dulu.', v_t.nama, v_t.status; end if;
    if v_jab in ('Pradana', 'Pradani') then
      select nama into v_lain from public.profiles where jabatan_dewan = v_jab and id <> v_t.id limit 1;
      if found then raise exception '% sudah dijabat oleh %. Kosongkan jabatan itu lebih dulu.', v_jab, v_lain; end if;
    end if;
    if v_t.jabatan_dewan is not distinct from v_jab then continue; end if;
    update public.profiles set jabatan_dewan = v_jab where id = v_t.id;
    insert into public.kepengurusan_log (peserta_id, peserta_nama, nis, tindakan, jabatan_lama, jabatan_baru, alasan, oleh, oleh_nama)
    values (v_t.id, v_t.nama, coalesce(v_t.nis, v_t.username), case when v_t.jabatan_dewan is null then 'beri' else 'ganti' end, v_t.jabatan_dewan, v_jab, '', auth.uid(), coalesce(v_oleh, ''));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.sg_kepengurusan_terapkan(p_data jsonb, p_ganti boolean default true, p_terapkan boolean default false) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  v_e jsonb; v_no int := 0; v_user text; v_jab text; v_t public.profiles; v_hasil text; v_pesan text[]; v_baris jsonb := '[]'::jsonb; v_pakai text[] := '{}'; v_tunggal text[] := '{}';
  v_galat int := 0; v_beri int := 0; v_ganti int := 0; v_cabut int := 0; v_sama int := 0; v_oleh text; v_r record; v_x jsonb; v_ids uuid[] := '{}';
begin
  perform sigarda.wajib_aktif();
  if not sigarda.pembina_atau_admin() then raise exception 'Hanya Pembina dan Admin Gudep yang dapat mengatur kepengurusan Dewan Ambalan.'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'array' then raise exception 'Data kepengurusan tidak valid.'; end if;
  if jsonb_array_length(p_data) > 200 then raise exception 'Maksimal 200 baris per permintaan.'; end if;

  for v_e in select * from jsonb_array_elements(p_data) loop
    v_no := v_no + 1;
    v_user := lower(btrim(coalesce(v_e ->> 'username', '')));
    v_jab := sigarda.jabatan_baku(coalesce(v_e ->> 'jabatan', ''));
    v_pesan := '{}'; v_hasil := 'ubah';
    select * into v_t from public.profiles where username = v_user and role = 'peserta';
    if not found then
      v_hasil := 'galat'; v_pesan := array['Penegak dengan NIS "' || v_user || '" tidak ditemukan.'];
    elsif v_user = any (v_pakai) then
      v_hasil := 'galat'; v_pesan := array['NIS ' || v_user || ' muncul lebih dari sekali dalam berkas.'];
    elsif v_t.status <> 'aktif' then
      v_hasil := 'galat'; v_pesan := array['Penegak berstatus ' || v_t.status || ' dan tidak dapat menjabat. Aktifkan kembali lebih dulu di menu Anggota.'];
    elsif v_jab = '' then
      v_hasil := 'galat'; v_pesan := array['Jabatan Dewan Ambalan kosong.'];
    elsif char_length(v_jab) not between 2 and 60 or v_jab ~ '[[:cntrl:]<>]' then
      v_hasil := 'galat'; v_pesan := array['Jabatan harus 2 sampai 60 karakter tanpa tanda < atau >.'];
    elsif v_jab in ('Pradana', 'Pradani') and v_jab = any (v_tunggal) then
      v_hasil := 'galat'; v_pesan := array[v_jab || ' hanya boleh satu orang, tetapi muncul lebih dari sekali dalam berkas.'];
    end if;
    if v_user <> '' then v_pakai := v_pakai || v_user; end if;
    if v_hasil = 'ubah' then
      if v_jab in ('Pradana', 'Pradani') then v_tunggal := v_tunggal || v_jab; end if;
      if v_t.jabatan_dewan is not distinct from v_jab then v_hasil := 'sama'; v_sama := v_sama + 1;
      elsif v_t.jabatan_dewan is null then v_hasil := 'beri'; v_beri := v_beri + 1;
      else v_hasil := 'ganti'; v_ganti := v_ganti + 1; v_pesan := v_pesan || ('Jabatan berubah dari ' || v_t.jabatan_dewan || '.'); end if;
      if not sigarda.tingkat_selesai(v_t.id, 'Bantara') then v_pesan := array_append(v_pesan, 'Belum menyelesaikan seluruh butir Bantara (peringatan; jabatan tetap dapat diberikan).'); end if;
    else
      v_galat := v_galat + 1;
    end if;
    v_baris := v_baris || jsonb_build_array(jsonb_build_object(
      'no', v_no, 'id', v_t.id, 'username', v_user, 'nama', coalesce(v_t.nama, ''), 'kelas', v_t.kelas, 'dari_jabatan', v_t.jabatan_dewan, 'jabatan', nullif(v_jab, ''),
      'hasil', v_hasil, 'pesan', to_jsonb(v_pesan)));
  end loop;

  -- Pemegang jabatan yang dicabut: semua yang tidak ada di berkas (p_ganti), atau pemegang Pradana/Pradani yang jabatannya berpindah ke orang lain di berkas.
  for v_r in
    select p.id, p.username, p.nama, p.kelas, p.role, p.jabatan_dewan from public.profiles p
    where p.jabatan_dewan is not null and p.username <> all (v_pakai)
      and (p_ganti or (p.jabatan_dewan in ('Pradana', 'Pradani') and p.jabatan_dewan = any (v_tunggal)))
    order by p.nama
  loop
    v_cabut := v_cabut + 1;
    v_ids := v_ids || v_r.id;
    v_baris := v_baris || jsonb_build_array(jsonb_build_object(
      'no', null, 'id', v_r.id, 'username', v_r.username, 'nama', v_r.nama, 'kelas', v_r.kelas, 'dari_jabatan', v_r.jabatan_dewan, 'jabatan', null, 'hasil', 'cabut',
      'pesan', to_jsonb(case when v_r.role = 'penguji' then array['Akun Dewan lama.'] else '{}'::text[] end)));
  end loop;

  v_x := jsonb_build_object('beri', v_beri, 'ganti', v_ganti, 'cabut', v_cabut, 'sama', v_sama, 'galat', v_galat);
  if p_terapkan then
    if v_galat > 0 then raise exception 'Ada % baris bermasalah, jadi tidak ada yang diubah. Periksa pratinjau, perbaiki berkas, lalu coba lagi.', v_galat; end if;
    if v_beri + v_ganti + v_cabut = 0 then raise exception 'Tidak ada perubahan yang perlu diterapkan.'; end if;
    select nama into v_oleh from public.profiles where id = auth.uid();
    -- mencabut lebih dulu agar Pradana dan Pradani berpindah tangan tanpa bentrok
    for v_r in select id from public.profiles where id = any (v_ids) loop
      perform sigarda.jabatan_dewan_lepas(v_r.id, case when p_ganti then 'Kepengurusan diganti' else 'Jabatan berpindah' end);
    end loop;
    -- yang berganti jabatan dikosongkan sebentar agar pertukaran Pradana dan Pradani tidak bentrok dengan indeks unik
    update public.profiles set jabatan_dewan = null
      where id in (select (x ->> 'id')::uuid from jsonb_array_elements(v_baris) x where x ->> 'hasil' = 'ganti');
    for v_e in select * from jsonb_array_elements(v_baris) loop
      if v_e ->> 'hasil' not in ('beri', 'ganti') then continue; end if;
      select * into v_t from public.profiles where id = (v_e ->> 'id')::uuid;
      update public.profiles set jabatan_dewan = v_e ->> 'jabatan' where id = v_t.id;
      insert into public.kepengurusan_log (peserta_id, peserta_nama, nis, tindakan, jabatan_lama, jabatan_baru, alasan, oleh, oleh_nama)
      values (v_t.id, v_t.nama, coalesce(v_t.nis, v_t.username), v_e ->> 'hasil', v_e ->> 'dari_jabatan', v_e ->> 'jabatan', left('Musyawarah Ambalan (berkas)', 200), auth.uid(), coalesce(v_oleh, ''));
    end loop;
  end if;
  return jsonb_build_object('galat', v_galat, 'ringkasan', v_x, 'baris', v_baris);
end $$;

create or replace function public.sg_dewan_lama_arsipkan(p_ids uuid[], p_aktifkan boolean default false) returns int
language plpgsql security definer set search_path = public as
$$
declare v_id uuid; v_n int := 0; v_t public.profiles;
begin
  perform sigarda.wajib_admin('Hanya Admin Gudep yang dapat mengarsipkan akun Dewan Ambalan lama.');
  if coalesce(cardinality(p_ids), 0) = 0 then return 0; end if;
  if cardinality(p_ids) > 200 then raise exception 'Maksimal 200 akun per permintaan.'; end if;
  foreach v_id in array p_ids loop
    select * into v_t from public.profiles where id = v_id and role = 'penguji' and jabatan = 'Dewan Ambalan';
    if not found then raise exception 'Akun Dewan Ambalan lama tidak ditemukan.'; end if;
    if p_aktifkan then
      if v_t.status = 'aktif' then continue; end if;
      update public.profiles set status = 'aktif', status_pada = sigarda.hari_ini() where id = v_id;
    else
      if v_t.status <> 'aktif' then continue; end if;
      perform sigarda.jabatan_dewan_lepas(v_id, 'Akun Dewan lama diarsipkan');
      update public.sku_progress set penguji_id = null, diubah = now() where penguji_id = v_id and status = 'diajukan';
      delete from public.penugasan_rombel where penguji_id = v_id;
      delete from public.penugasan_peserta where penguji_id = v_id;
      update public.profiles set status = 'nonaktif', status_pada = sigarda.hari_ini() where id = v_id;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function sigarda.ketua_sidang(out o_nama text, out o_sebutan text) language plpgsql stable security definer set search_path = public as
$$
begin
  select sigarda.rapikan(nama), 'Pradana Dewan Ambalan' into o_nama, o_sebutan
  from public.profiles where jabatan_dewan = 'Pradana' and status = 'aktif' and (role = 'peserta' or (role = 'penguji' and jabatan = 'Dewan Ambalan')) limit 1;
  if not found then
    o_nama := sigarda.pengaturan_teks('sidang.nama_ketua', '');
    o_sebutan := sigarda.pengaturan_teks('sidang.sebutan_ketua', 'Ketua Dewan Penegak / Pemangku Adat');
  end if;
end $$;

alter table public.penugasan_peserta enable row level security;
alter table public.kepengurusan_log enable row level security;

drop policy if exists baca_profil on public.profiles;
create policy baca_profil on public.profiles for select to authenticated
  using (id = (select auth.uid()) or role in ('penguji','admin') or (jabatan_dewan is not null and status = 'aktif') or (select sigarda.pengurus()));
drop policy if exists baca_penugasan_peserta on public.penugasan_peserta;
create policy baca_penugasan_peserta on public.penugasan_peserta for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));
drop policy if exists baca_kepengurusan_log on public.kepengurusan_log;
create policy baca_kepengurusan_log on public.kepengurusan_log for select to authenticated
  using ((select sigarda.aktif()) and (select sigarda.pengurus()));

revoke all on public.penugasan_peserta, public.kepengurusan_log from anon, authenticated;
grant select on public.penugasan_peserta, public.kepengurusan_log to authenticated;

revoke all on function
  public.sg_penugasan_peserta_atur(text, uuid, uuid[], text), public.sg_kepengurusan_terapkan(jsonb, boolean, boolean), public.sg_dewan_lama_arsipkan(uuid[], boolean)
  from public, anon, authenticated;
grant execute on function
  public.sg_penugasan_peserta_atur(text, uuid, uuid[], text), public.sg_kepengurusan_terapkan(jsonb, boolean, boolean), public.sg_dewan_lama_arsipkan(uuid[], boolean)
  to authenticated;

revoke all on all functions in schema sigarda from public, anon;
grant execute on all functions in schema sigarda to authenticated, service_role;

commit;
notify pgrst, 'reload schema';
